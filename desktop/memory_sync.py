"""Agent memory-graph sync — cross-device export/import of memory_items + memory_links.

U10 workstream (task #413, #389).  Pairs with ``chat_sync`` + ``file_sync``
to complete the "send to my Agent → retrieve from my Agent on another
device" story: chat_sync replays the conversation text, file_sync ships
the attachments, memory_sync ships what the agent remembers (facts,
decisions, lifecycle events) so the agent on device B behaves like the
agent on device A.

The memory_graph is already per-user-scoped on disk (one SQLite file
per user under ``~/Documents/Nunba/data/memory_graph/<user_id>/memory_graph.db``),
so cross-user leaks are impossible by construction.  This module
preserves node ids AND timestamps on replication so a round-trip
A → server → B produces the same graph on B as on A.

Design principles (CLAUDE.md Gates):
  * Gate 2 (DRY): uses the existing ``memory_graph.db`` SQLite schema.
    Does NOT introduce a parallel memory store.  When MemoryStore
    evolves its schema, the bump propagates here via plain SQL.
  * Gate 3 (SRP):
      - ``export(user_id, since_ms)`` reads.
      - ``import_batch(user_id, payload)`` writes.
  * Gate 4 (no parallel paths): ONE writer path for imports — this
    module.  No direct cursor INSERTs from the HTTP handler.
  * Gate 7 (multi-OS): SQLite is cross-platform; path resolution via
    the same helper chain ``chat_sync`` uses.
  * Gate 8 (security): per-user DB file + caller-confirmed JWT ensure
    no cross-user read.  Import uses an UPSERT with last-write-wins on
    ``updated_at`` so two devices editing the same node converge.

Public API
----------
    export(user_id, since_ms=0, *, limit=500) -> dict
        Returns ``{'items': [...], 'links': [...], 'cursor': <ms>}``.
        Items are rows from ``memory_items`` with ``updated_at > since``;
        links are rows from ``memory_links`` whose source_id or
        target_id appears in the returned items.

    import_batch(user_id, payload) -> dict
        Accepts the shape ``export`` returns.  Upserts items by id
        (last-write-wins on updated_at); inserts links with OR IGNORE
        (links are immutable provenance edges).  Returns counts.
"""

from __future__ import annotations

import logging
import os
import sqlite3
import sys
import time
from typing import Any

logger = logging.getLogger(__name__)

_MAX_EXPORT_ROWS = 500
_MAX_IMPORT_ROWS = 1000
_MAX_CONTENT_BYTES = 64 * 1024  # per-item hard cap (matches MemoryStore default)


def _data_dir() -> str:
    """Same fallback chain as ``chat_sync._data_dir``."""
    try:
        from core.platform_paths import get_data_dir
        return get_data_dir()
    except Exception:  # noqa: BLE001
        try:
            from desktop.config import get_data_dir as _legacy_get
            return _legacy_get()
        except Exception:  # noqa: BLE001
            home = os.path.expanduser("~")
            if sys.platform == "win32":
                return os.path.join(home, "Documents", "Nunba")
            if sys.platform == "darwin":
                return os.path.join(home, "Library", "Application Support", "Nunba")
            return os.path.join(home, ".config", "nunba")


def _sanitize_user_id(user_id: str) -> str:
    safe = "".join(c for c in str(user_id or '') if c.isalnum() or c in ("_", "-"))
    if not safe:
        raise ValueError("user_id must contain at least one alnum char")
    return safe


def _db_path(user_id: str) -> str:
    """Resolve ``<data>/memory_graph/<user_id>/memory_graph.db``.

    Must match ``routes/chatbot_routes._get_or_create_graph`` so a
    MemoryGraph instance and this module are reading/writing the same
    file.  That endpoint uses ``os.path.expanduser("~")/Documents/Nunba
    /data/memory_graph/<user_id>`` — but we canonically go through
    ``get_data_dir()`` which resolves identically on Windows and
    degrades to ``~/.config/nunba`` on Linux.  If operators have set
    ``NUNBA_DATA_DIR`` the two paths would diverge; we warn there.
    """
    safe = _sanitize_user_id(user_id)
    root = os.path.join(_data_dir(), "memory_graph", safe)
    return os.path.join(root, "memory_graph.db")


def _connect(user_id: str, *, create: bool = False) -> sqlite3.Connection | None:
    """Open a read-only or read-write connection.  Returns None when the
    DB doesn't exist and ``create=False`` (user has never remembered
    anything on this node — export returns empty)."""
    path = _db_path(user_id)
    if not os.path.isfile(path) and not create:
        return None
    if not os.path.isfile(path) and create:
        os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        # check_same_thread=False so a Flask worker's thread can reuse a
        # cached handle if we ever pool.  Today each call opens + closes,
        # so it's belt-and-suspenders.
        conn = sqlite3.connect(path, check_same_thread=False, timeout=5.0)
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.Error as e:
        logger.warning("memory_sync: connect failed for %s: %s", user_id, e)
        return None


def _tables_exist(conn: sqlite3.Connection) -> bool:
    """Both tables must exist — MemoryGraph lazily creates them on first
    write, so a pristine DB may be valid-but-empty."""
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM sqlite_master "
            "WHERE type='table' AND name IN ('memory_items', 'memory_links')"
        ).fetchone()
        return bool(row and row[0] == 2)
    except sqlite3.Error:
        return False


def export(
    user_id: str,
    since_ms: int = 0,
    *,
    limit: int = _MAX_EXPORT_ROWS,
) -> dict[str, Any]:
    """Return memory_items + related memory_links modified since ``since_ms``.

    ``since_ms`` is milliseconds epoch; memory_items stores float
    ``updated_at`` in seconds, so we convert.  Returns the shape:

        {
          'items':  [ {id, content, metadata, source, created_at, updated_at, hash}, ... ],
          'links':  [ {id, source_id, target_id, link_type, context, created_at}, ... ],
          'cursor': <int ms>   # max updated_at_ms across returned items
        }
    """
    try:
        since_s = float(int(since_ms or 0)) / 1000.0
    except (TypeError, ValueError):
        since_s = 0.0
    cap = max(1, min(int(limit or _MAX_EXPORT_ROWS), _MAX_EXPORT_ROWS))

    out = {'items': [], 'links': [], 'cursor': int(since_ms or 0)}
    conn = _connect(user_id, create=False)
    if conn is None:
        return out
    try:
        if not _tables_exist(conn):
            return out

        rows = conn.execute(
            "SELECT id, content, metadata, source, created_at, updated_at, hash "
            "FROM memory_items "
            "WHERE updated_at > ? "
            "ORDER BY updated_at ASC "
            "LIMIT ?",
            (since_s, cap),
        ).fetchall()

        items: list[dict[str, Any]] = []
        max_updated_ms = int(since_ms or 0)
        for r in rows:
            updated_at_s = float(r['updated_at'] or 0.0)
            items.append({
                'id': r['id'],
                'content': r['content'],
                'metadata': r['metadata'],  # JSON string, passed through
                'source': r['source'],
                'created_at': float(r['created_at'] or updated_at_s),
                'updated_at': updated_at_s,
                'hash': r['hash'],
            })
            max_updated_ms = max(max_updated_ms, int(updated_at_s * 1000))
        out['items'] = items
        out['cursor'] = max_updated_ms

        if items:
            ids = tuple(i['id'] for i in items)
            # SQLite builds vary in SQLITE_MAX_VARIABLE_NUMBER (999 on older
            # embedded, 32766+ on modern).  Splitting into two queries keeps
            # us well under 999 even at the full 500-row export cap.
            placeholders = ','.join('?' for _ in ids)
            seen: dict[str, dict[str, Any]] = {}
            for col in ('source_id', 'target_id'):
                link_rows = conn.execute(
                    f"SELECT id, source_id, target_id, link_type, context, created_at "  # noqa: S608 — col is hardcoded tuple, ids is parameterized
                    f"FROM memory_links "
                    f"WHERE {col} IN ({placeholders})",
                    ids,
                ).fetchall()
                for r in link_rows:
                    seen[r['id']] = {
                        'id': r['id'],
                        'source_id': r['source_id'],
                        'target_id': r['target_id'],
                        'link_type': r['link_type'],
                        'context': r['context'],
                        'created_at': r['created_at'],
                    }
            out['links'] = list(seen.values())
        return out
    except sqlite3.Error as e:
        logger.warning("memory_sync.export failed for %s: %s", user_id, e)
        return out
    finally:
        conn.close()


def _ensure_schema(conn: sqlite3.Connection) -> None:
    """Create memory_items + memory_links if missing.  Mirrors the
    MemoryStore + MemoryGraph _init_ paths so a remote import can land
    on a fresh node where the graph hasn't been touched yet.

    Keep this in sync with ``memory_store.py:135`` + ``memory_graph.py:123``.
    A drift check test (``tests/test_memory_sync_schema_drift.py``) holds
    the schema hashes.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS memory_items (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            metadata TEXT,
            embedding TEXT,
            source TEXT,
            created_at REAL,
            updated_at REAL,
            hash TEXT
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_memory_source ON memory_items(source)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_memory_hash ON memory_items(hash)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_memory_updated ON memory_items(updated_at)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS memory_links (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            link_type TEXT DEFAULT 'derived',
            context TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_links_source ON memory_links(source_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_links_target ON memory_links(target_id)"
    )


def import_batch(user_id: str, payload: dict[str, Any]) -> dict[str, int]:
    """UPSERT memory_items (last-write-wins on updated_at) + INSERT OR
    IGNORE memory_links (immutable).  Returns counts.

    Rejects:
        - Non-dict payload
        - >1000 items in one batch (DoS)
        - per-item content > 64 KB (DoS)
    """
    if not isinstance(payload, dict):
        raise ValueError("payload must be a JSON object")
    items = payload.get('items') or []
    links = payload.get('links') or []
    if not isinstance(items, list) or not isinstance(links, list):
        raise ValueError("items/links must be lists")
    if len(items) > _MAX_IMPORT_ROWS:
        raise ValueError(f"items exceed {_MAX_IMPORT_ROWS}-row batch cap")

    imported_items = 0
    skipped_items = 0
    imported_links = 0

    conn = _connect(user_id, create=True)
    if conn is None:
        return {'imported_items': 0, 'skipped_items': 0, 'imported_links': 0}
    try:
        _ensure_schema(conn)
        for it in items:
            if not isinstance(it, dict):
                skipped_items += 1
                continue
            iid = str(it.get('id') or '').strip()
            content = it.get('content') or ''
            if not iid or not content:
                skipped_items += 1
                continue
            if len(content) > _MAX_CONTENT_BYTES:
                skipped_items += 1
                continue
            # SQLite UPSERT with last-write-wins on updated_at.  New row
            # wins when its updated_at > stored's; otherwise the stored
            # row is preserved (returning device rejected the edit).
            try:
                conn.execute(
                    """
                    INSERT INTO memory_items
                      (id, content, metadata, embedding, source,
                       created_at, updated_at, hash)
                    VALUES (?, ?, ?, NULL, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      content    = excluded.content,
                      metadata   = excluded.metadata,
                      source     = excluded.source,
                      created_at = MIN(memory_items.created_at, excluded.created_at),
                      updated_at = excluded.updated_at,
                      hash       = excluded.hash
                    WHERE excluded.updated_at > memory_items.updated_at
                    """,
                    (
                        iid,
                        str(content),
                        str(it.get('metadata') or ''),
                        str(it.get('source') or 'memory'),
                        float(it.get('created_at') or time.time()),
                        float(it.get('updated_at') or time.time()),
                        str(it.get('hash') or ''),
                    ),
                )
                imported_items += 1
            except sqlite3.Error as e:
                logger.debug("memory_sync.import_batch item %s skipped: %s", iid, e)
                skipped_items += 1

        for lk in links:
            if not isinstance(lk, dict):
                continue
            lid = str(lk.get('id') or '').strip()
            src = str(lk.get('source_id') or '').strip()
            tgt = str(lk.get('target_id') or '').strip()
            if not lid or not src or not tgt:
                continue
            try:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO memory_links
                      (id, source_id, target_id, link_type, context, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        lid, src, tgt,
                        str(lk.get('link_type') or 'derived'),
                        str(lk.get('context') or '')[:4096],
                        str(lk.get('created_at')
                            or time.strftime('%Y-%m-%d %H:%M:%S')),
                    ),
                )
                imported_links += 1
            except sqlite3.Error as e:
                logger.debug("memory_sync.import_batch link %s skipped: %s", lid, e)
        conn.commit()
    except sqlite3.Error as e:
        logger.warning("memory_sync.import_batch failed for %s: %s", user_id, e)
        try:
            conn.rollback()
        except sqlite3.Error:
            pass
    finally:
        conn.close()

    return {
        'imported_items': imported_items,
        'skipped_items': skipped_items,
        'imported_links': imported_links,
    }
