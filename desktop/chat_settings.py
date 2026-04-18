"""Admin-controllable chat-restore policy for Nunba.

User requirement (J201 follow-up, 2026-04-18):
  "restore shd be across restarts controlled by sessings/adminm"

This module owns the SINGLE source of truth for two settings that
gate the NunbaChatProvider's auto-restore behavior on every boot:

  * ``restore_policy``  — when to restore prior conversation
  * ``restore_scope``   — which agent's history to restore

CLAUDE.md Gates honoured here:
  * Gate 2 (DRY): one schema, one read path, one write path. Frontend
    fetches via /api/admin/config/chat which returns ``to_dict()``;
    backend reads via ``get_chat_settings()``. NEVER scatter raw
    dict-lookups for these keys outside this module.
  * Gate 3 (SRP): ``ChatSettings`` is a pure dataclass. Persistence
    (``save``) is a separate method that writes atomically. Reading
    is module-level cached.
  * Gate 4 (no parallel paths): if a feature needs a new chat-restore
    knob, EXTEND ``ChatSettings`` here — do not invent a sibling
    settings file.
  * Gate 7 (multi-OS): file lives under ``get_data_dir()`` which is
    Documents/Nunba on Windows, Library/Application Support on macOS,
    .config/nunba on Linux. NEVER under Program Files.

Why ``desktop/`` not ``core/`` (CLAUDE.md Rule 2):
  Nunba MUST NOT have its own top-level ``core/`` — namespace collision
  with HARTOS's ``core/`` under cx_Freeze hides whichever package's
  __init__.py loads second. Chat-restore policy is a Nunba-install-
  specific concern (different installs can have different policies),
  so it lives next to ``guest_identity.py``, ``config.py``, and the
  other Nunba-local desktop helpers.

Public API
----------
    POLICY_VALUES = ("always", "prompt", "never", "session")
    SCOPE_VALUES  = ("all_agents", "active_only", "manual")

    get_chat_settings() -> ChatSettings        # cached read
    update_chat_settings(payload: dict) -> ChatSettings  # validated write
    reset_cache_for_tests() -> None
"""

from __future__ import annotations

import json
import logging
import os
import sys
import tempfile
from dataclasses import dataclass, asdict, field
from typing import Any

logger = logging.getLogger(__name__)

# Enum-style allowlists. Keep these tuples (immutable) so callers
# can't mutate them at runtime.
POLICY_VALUES: tuple[str, ...] = ("always", "prompt", "never", "session")
SCOPE_VALUES: tuple[str, ...] = ("all_agents", "active_only", "manual")

DEFAULT_POLICY = "always"
DEFAULT_SCOPE = "all_agents"

_FILENAME = "chat_settings.json"

# Module-level cache so repeat calls within a process are O(1).
_cached: "ChatSettings | None" = None


@dataclass
class ChatSettings:
    """Pure-data record. NO I/O methods on the dataclass itself."""
    restore_policy: str = DEFAULT_POLICY
    restore_scope: str = DEFAULT_SCOPE
    cloud_sync_enabled: bool = False  # opt-in; Track 3 wires the endpoints

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _data_dir() -> str:
    """Resolve the Nunba user-writable data dir.

    Mirrors ``desktop/guest_identity._data_dir`` — same fallback
    chain (HARTOS core.platform_paths → desktop.config legacy →
    OS-default home). Centralising the chain in two places is a
    necessary evil because guest_identity is import-cycle-safe but
    chat_settings is younger and we don't want to risk a bootstrap
    cycle by importing guest_identity here.
    """
    try:
        from core.platform_paths import get_data_dir
        return get_data_dir()
    except Exception:  # noqa: BLE001 — HARTOS not installed yet
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


def _file_path() -> str:
    return os.path.join(_data_dir(), _FILENAME)


def _atomic_write(path: str, payload: dict) -> None:
    """tmpfile + os.replace — partial-write safe.

    Same idiom as ``desktop.guest_identity._atomic_write`` so a
    power-off mid-write never leaves a corrupt JSON behind.
    """
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".chat_settings.", suffix=".tmp", dir=d)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, sort_keys=True)
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


def _load_from_disk() -> ChatSettings:
    """Read the JSON file; on ANY failure return DEFAULTS.

    Defensive: a malformed file (manual edit, partial write that
    sneaked past atomic_write) MUST NOT crash the Flask boot. We
    log the error and use the defaults so the user still gets the
    'always restore' baseline behaviour they expect.
    """
    path = _file_path()
    if not os.path.isfile(path):
        return ChatSettings()
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        return _coerce(data)
    except Exception as e:  # noqa: BLE001
        logger.warning("chat_settings.json unreadable (%s) — using defaults", e)
        return ChatSettings()


def _coerce(data: dict[str, Any]) -> ChatSettings:
    """Validate + project a raw dict into a ChatSettings.

    Unknown keys are dropped. Invalid enum values fall back to the
    DEFAULT for that field (NEVER raise, NEVER write garbage to the
    settings record — the caller's malformed payload should not be
    able to brick chat).
    """
    policy = data.get("restore_policy", DEFAULT_POLICY)
    scope = data.get("restore_scope", DEFAULT_SCOPE)
    cloud = data.get("cloud_sync_enabled", False)
    if policy not in POLICY_VALUES:
        logger.warning("Invalid restore_policy=%r; falling back to %r", policy, DEFAULT_POLICY)
        policy = DEFAULT_POLICY
    if scope not in SCOPE_VALUES:
        logger.warning("Invalid restore_scope=%r; falling back to %r", scope, DEFAULT_SCOPE)
        scope = DEFAULT_SCOPE
    return ChatSettings(
        restore_policy=policy,
        restore_scope=scope,
        cloud_sync_enabled=bool(cloud),
    )


def get_chat_settings() -> ChatSettings:
    """Return the cached ChatSettings; load on first call per process."""
    global _cached
    if _cached is None:
        _cached = _load_from_disk()
    return _cached


def update_chat_settings(payload: dict[str, Any]) -> ChatSettings:
    """Validate ``payload`` against the enum allowlists, persist, return new state.

    Raises :class:`ValueError` on bad payload (caller — typically a
    Flask handler — should translate to HTTP 400). The handler is
    responsible for auth gating BEFORE calling this function.
    """
    if not isinstance(payload, dict):
        raise ValueError("payload must be a JSON object")

    # Start from current settings so partial updates work
    current = get_chat_settings().to_dict()
    merged = {**current, **payload}

    # Hard-fail on enum violations from the caller (don't silently
    # coerce on writes — _coerce's silent fallback is for READ-time
    # forward compatibility; WRITES must be exact).
    if "restore_policy" in payload and payload["restore_policy"] not in POLICY_VALUES:
        raise ValueError(
            f"restore_policy must be one of {POLICY_VALUES}; got {payload['restore_policy']!r}"
        )
    if "restore_scope" in payload and payload["restore_scope"] not in SCOPE_VALUES:
        raise ValueError(
            f"restore_scope must be one of {SCOPE_VALUES}; got {payload['restore_scope']!r}"
        )
    if "cloud_sync_enabled" in payload and not isinstance(payload["cloud_sync_enabled"], bool):
        raise ValueError("cloud_sync_enabled must be a boolean")

    new = ChatSettings(
        restore_policy=merged.get("restore_policy", DEFAULT_POLICY),
        restore_scope=merged.get("restore_scope", DEFAULT_SCOPE),
        cloud_sync_enabled=bool(merged.get("cloud_sync_enabled", False)),
    )

    try:
        _atomic_write(_file_path(), new.to_dict())
    except Exception as e:  # noqa: BLE001
        logger.error("chat_settings persistence failed: %s", e)
        raise

    # Refresh the cache so subsequent reads see the new value.
    global _cached
    _cached = new
    return new


def reset_cache_for_tests() -> None:
    """Drop the process-level cache. NEVER call in production."""
    global _cached
    _cached = None
