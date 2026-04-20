"""Per-user chat-bucket storage for cross-device restore.

Track C of the 2026-04-18 user requirement:
  "across reinstallls as well with cloud syn restore settings"

This module owns the server-side persistence for Nunba's chat-bucket
dict. The bucket is what the browser writes to localStorage keyed as
``nunba_chat_<guest_id|user_id>_<agent_id>``. On an authenticated
device with ``cloud_sync_enabled=true``, the frontend pushes the
bucket to the server on change (debounced) and pulls on sign-in so a
reinstall-then-sign-in workflow restores history.

Design decisions (CLAUDE.md Gates):
  * Gate 2 (DRY): we do NOT duplicate the HARTOS
    ``integrations/social/backup_service`` passphrase-encrypted
    full-bundle path. That system backs up posts / comments / votes
    and is appropriate for "full data export". Per-device chat
    history is a lighter concern and needs a partial-merge sync, so
    it gets its own thin endpoint. If the two concerns later
    converge, we fold this into the backup bundle — do NOT grow a
    third path.
  * Gate 3 (SRP): ``push`` writes, ``pull`` reads, ``merge`` decides
    conflicts. The Flask handlers in main.py do HTTP + auth gating
    only. No I/O outside this module.
  * Gate 4 (no parallel paths): exactly ONE writer per user's chat
    blob (``push``). No direct file writes from handlers.
  * Gate 7 (multi-OS): storage lives under ``get_data_dir()``.
  * Gate 8 (security): the blob is stored per-user-id, and the
    handler enforces that the requesting user matches. This is NOT
    zero-knowledge (server can read the plaintext) — that tradeoff
    is acceptable because the server is the operator's own desktop
    Flask; this is NOT a multi-tenant cloud host. For true cloud
    (Hevolve.cloud), migrate to the HARTOS encrypted backup path.

Public API
----------
    push(user_id: str, bucket: dict) -> dict
        Merge the incoming bucket with any stored bucket for the
        same user (last-write-wins on a per-agent-bucket key;
        equal-timestamp ties go to the incoming), persist, return
        the merged state. The caller MUST have verified auth.

    pull(user_id: str) -> dict
        Return the stored bucket for this user, or an empty dict if
        the user has never pushed. The caller MUST have verified
        auth.

    forget(user_id: str) -> bool
        Delete the stored bucket (for "sign-out + forget me").
"""

from __future__ import annotations

import json
import logging
import os
import sys
import tempfile
import time
from typing import Any

logger = logging.getLogger(__name__)

_DIRNAME = "chat_sync"


def _data_dir() -> str:
    """Resolve the Nunba user-writable data dir.

    Mirrors ``desktop/chat_settings._data_dir`` — same fallback
    chain. Duplication is acceptable because the two modules are
    import-cycle-safe independent and we want neither to pull the
    other at bootstrap time.
    """
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


def _user_file_path(user_id: str) -> str:
    """Per-user JSON file. The user_id is sanitised to avoid
    path-traversal: we strip every char that isn't [a-zA-Z0-9_-]."""
    safe = "".join(c for c in str(user_id) if c.isalnum() or c in ("_", "-"))
    if not safe:
        raise ValueError("user_id must contain at least one alnum char")
    return os.path.join(_data_dir(), _DIRNAME, f"{safe}.json")


def _atomic_write(path: str, payload: dict) -> None:
    """tmpfile + os.replace — partial-write safe."""
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".chat_sync.", suffix=".tmp", dir=d)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(payload, fh)
            fh.flush()
            try:
                os.fsync(fh.fileno())
            except Exception:  # noqa: BLE001 — tmpfs / FAT
                pass
        os.replace(tmp, path)
    except Exception:
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:  # noqa: BLE001
            pass
        raise


def _load(user_id: str) -> dict[str, Any]:
    """Read per-user blob. Returns ``{"buckets": {}, "updated_at": 0}``
    if the file doesn't exist or is unreadable."""
    path = _user_file_path(user_id)
    if not os.path.isfile(path):
        return {"buckets": {}, "updated_at": 0}
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            raise ValueError("bucket file must be a JSON object")
        data.setdefault("buckets", {})
        data.setdefault("updated_at", 0)
        return data
    except Exception as e:  # noqa: BLE001
        logger.warning("chat_sync blob unreadable for %s (%s); starting fresh", user_id, e)
        return {"buckets": {}, "updated_at": 0}


def merge(stored: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    """Merge two chat-sync blobs.

    Each blob shape:
        {"buckets": {agent_key: {"messages": [...], "updated_at": ts}},
         "updated_at": ts}

    Per-agent-bucket merge rule: keep whichever side has the larger
    ``updated_at``. On ties (same timestamp), INCOMING wins because
    the client's newer typing is closer to the user's intent than a
    stale cloud copy. An agent_key present only on one side is kept.
    """
    s_buckets = (stored or {}).get("buckets") or {}
    i_buckets = (incoming or {}).get("buckets") or {}
    out_buckets: dict[str, Any] = {}

    for key in set(s_buckets) | set(i_buckets):
        s = s_buckets.get(key)
        i = i_buckets.get(key)
        if s is None:
            out_buckets[key] = i
            continue
        if i is None:
            out_buckets[key] = s
            continue
        s_ts = int((s or {}).get("updated_at") or 0)
        i_ts = int((i or {}).get("updated_at") or 0)
        out_buckets[key] = i if i_ts >= s_ts else s

    return {
        "buckets": out_buckets,
        "updated_at": int(time.time() * 1000),
    }


def push(user_id: str, bucket: dict[str, Any]) -> dict[str, Any]:
    """Merge-and-persist. Returns the merged blob (what pull would
    return right after this call).

    Auth is OUT OF SCOPE here — the Flask handler is responsible for
    confirming the caller's JWT maps to ``user_id``.
    """
    if not isinstance(bucket, dict):
        raise ValueError("bucket must be a JSON object")
    stored = _load(user_id)
    merged = merge(stored, bucket)
    _atomic_write(_user_file_path(user_id), merged)
    return merged


def pull(user_id: str) -> dict[str, Any]:
    """Return the stored blob for ``user_id``. Empty when absent."""
    return _load(user_id)


def forget(user_id: str) -> bool:
    """Delete the per-user blob. Returns ``True`` if a file was
    removed, ``False`` if nothing was there."""
    path = _user_file_path(user_id)
    if not os.path.isfile(path):
        return False
    try:
        os.remove(path)
        return True
    except Exception as e:  # noqa: BLE001
        logger.warning("chat_sync forget failed for %s: %s", user_id, e)
        return False
