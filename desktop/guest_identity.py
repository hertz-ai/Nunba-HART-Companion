"""Hardware-derived stable guest_id for Nunba.

User-visible problem this solves
--------------------------------
WebView2 localStorage (where the React SPA stores the guest_user_id
and the per-agent chat buckets) lives under
    %LOCALAPPDATA%\\HevolveAI\\Nunba\\EBWebView\\
which CAN be wiped by:
  * Nunba's uninstaller (normal install/uninstall cycle)
  * "Reset WebView2 data" from the installer
  * Windows storage-sense aggressive cleanup
  * Manual "clear site data" in the webview
When that folder is wiped, the guest user's chat history becomes
unreachable because the storage key bucket is derived from a now-
missing guest_user_id.

The fix
-------
Nunba writes a SHORT, OPAQUE, HARDWARE-DERIVED guest_id to a file
Nunba OWNS under the user's profile (NOT inside WebView2's wiped
folder), at
    <get_data_dir()>/guest_id.json
This directory survives uninstall (user-writable, never touched by
the installer) so the guest identity is stable across reinstalls.

Derivation contract (MUST hold for J201 to pass):
  * same hardware  → same guest_id
  * opaque         → SHA-256 truncation, never leaks raw MachineGuid
  * short          → "g_" + 16 hex chars = 18 chars total (not 64-hex
                     like device_id; frontend uses short ids)
  * not a UUID     → can't accidentally collide with authenticated
                     user IDs (which are integer PKs or UUIDs)

Derivation inputs, in preference order (we take the FIRST that works):
  Windows : HKLM\\SOFTWARE\\Microsoft\\Cryptography\\MachineGuid
  macOS   : IOPlatformUUID from ioreg
  Linux   : /etc/machine-id (systemd) or /var/lib/dbus/machine-id
  Fallback: SHA-256 of (uuid.getnode() + platform.node()) — this is
            less stable than the OS machine-id (MAC address changes
            on NIC replacement), but it's a graceful fallback so
            macOS/Linux installs without a readable machine-id still
            boot.

Caching
-------
The first derivation writes {guest_id, derivation_source} to the
json file atomically (tmpfile + os.replace).  Every subsequent call
reads the cache — we DO NOT re-probe the OS once the file exists,
so power-off during first boot can't corrupt the id.

Why desktop/ not core/
----------------------
CLAUDE.md Rule 2: Nunba must NOT have its own top-level core/ —
it would namespace-collide with HARTOS's core/ under cx_Freeze.
This is a Nunba-install-specific concern (install-specific guest
identity), so it lives under desktop/ alongside config.py,
platform_utils.py, ai_installer.py — the other Nunba-local
desktop helpers.

Public API
----------
    get_guest_id() -> str            # "g_<16 hex>", cached
    get_guest_id_file_path() -> str  # absolute path to guest_id.json
    _derive_guest_id() -> (str, str) # (id, source) — no cache, for tests
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import platform
import sys
import tempfile
import uuid

logger = logging.getLogger(__name__)

_GUEST_ID_PREFIX = "g_"
_GUEST_ID_HEX_LEN = 16  # 64-bit entropy — collision risk negligible at fleet scale

# Module-level cache so repeat calls within a process are O(1).
_cached_id: str | None = None


def _read_windows_machine_guid() -> str | None:
    """Return HKLM\\SOFTWARE\\Microsoft\\Cryptography\\MachineGuid or None."""
    if sys.platform != "win32":
        return None
    try:
        import winreg  # stdlib on Windows
        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Cryptography",
        ) as key:
            guid, _ = winreg.QueryValueEx(key, "MachineGuid")
            if guid:
                return str(guid).strip()
    except Exception as e:  # noqa: BLE001 — any failure drops us to fallback
        logger.debug("Windows MachineGuid read failed: %s", e)
    return None


def _read_macos_platform_uuid() -> str | None:
    """Return IOPlatformUUID from ioreg, or None.

    Uses subprocess.run with an explicit 3s timeout (CLAUDE.md Gate 7:
    no unbounded subprocess) — if ioreg hangs (rare but seen on
    broken VMs), we fall through to the fallback path.
    """
    if sys.platform != "darwin":
        return None
    try:
        import subprocess
        result = subprocess.run(
            ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        for line in result.stdout.splitlines():
            if "IOPlatformUUID" in line:
                # Line shape: '    "IOPlatformUUID" = "<UUID>"'
                parts = line.split('"')
                if len(parts) >= 4:
                    return parts[-2].strip()
    except Exception as e:  # noqa: BLE001
        logger.debug("macOS IOPlatformUUID read failed: %s", e)
    return None


def _read_linux_machine_id() -> str | None:
    """Return /etc/machine-id or /var/lib/dbus/machine-id, or None."""
    if sys.platform == "win32" or sys.platform == "darwin":
        return None
    for path in ("/etc/machine-id", "/var/lib/dbus/machine-id"):
        try:
            if os.path.isfile(path):
                with open(path, encoding="utf-8") as fh:
                    mid = fh.read().strip()
                if mid:
                    return mid
        except Exception as e:  # noqa: BLE001
            logger.debug("Linux machine-id read at %s failed: %s", path, e)
    return None


def _fallback_fingerprint() -> str:
    """Best-effort fingerprint when OS machine-id is unavailable.

    Concatenates MAC address (uuid.getnode) with hostname
    (platform.node).  NOT as stable as a real machine-id (NIC swaps,
    VM MAC randomisation), but gives us a non-random string to hash.
    """
    return f"{uuid.getnode()}|{platform.node()}"


def _derive_guest_id() -> tuple[str, str]:
    """Return (guest_id, derivation_source) — fresh, no cache.

    Source strings recorded in the json file:
      "windows_machine_guid"  / "macos_ioplatform_uuid" /
      "linux_machine_id"      / "fallback_mac_hostname"
    """
    source_name = None
    raw: str | None = None

    for probe, name in (
        (_read_windows_machine_guid, "windows_machine_guid"),
        (_read_macos_platform_uuid, "macos_ioplatform_uuid"),
        (_read_linux_machine_id, "linux_machine_id"),
    ):
        try:
            raw = probe()
        except Exception as e:  # noqa: BLE001 — defensive
            logger.debug("probe %s raised: %s", name, e)
            raw = None
        if raw:
            source_name = name
            break

    if not raw:
        raw = _fallback_fingerprint()
        source_name = "fallback_mac_hostname"

    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    guest_id = f"{_GUEST_ID_PREFIX}{digest[:_GUEST_ID_HEX_LEN]}"
    return guest_id, source_name


def _data_dir() -> str:
    """Resolve the Nunba data dir via HARTOS core.platform_paths
    with a desktop/config fallback.  Guaranteed to return a
    user-writable directory — NEVER C:\\Program Files."""
    try:
        from core.platform_paths import get_data_dir
        return get_data_dir()
    except Exception:  # HARTOS not installed yet (dev bootstrap)
        try:
            from desktop.config import get_data_dir as _legacy_get
            return _legacy_get()
        except Exception:
            home = os.path.expanduser("~")
            if sys.platform == "win32":
                return os.path.join(home, "Documents", "Nunba")
            if sys.platform == "darwin":
                return os.path.join(home, "Library", "Application Support", "Nunba")
            return os.path.join(home, ".config", "nunba")


def get_guest_id_file_path() -> str:
    """Absolute path of guest_id.json.  Under get_data_dir()/data/ —
    same folder as device_id.json, hevolve_database.db, etc.

    CLAUDE.md Gate 7: MUST be user-writable (not under Program Files)
    and MUST survive uninstall.  `get_data_dir()` resolves to
      Windows  %USERPROFILE%\\Documents\\Nunba
      macOS    ~/Library/Application Support/Nunba
      Linux    ~/.config/nunba
    all of which are left alone by every supported uninstaller.
    """
    base = _data_dir()
    # Keep guest_id.json at the root of the data dir (same level as
    # node_config.json, device_id.json) so ops can inspect it easily.
    return os.path.join(base, "guest_id.json")


def _atomic_write(path: str, payload: dict) -> None:
    """Write json atomically via tmpfile + os.replace.

    Reason: a power-off partway through a naive write would leave a
    truncated guest_id.json → next boot would fail JSON parse → we'd
    re-derive (which is fine, same hardware → same id) — but the
    file would have been briefly corrupted, surfacing alarming
    parse errors in the logs.  Atomic rename avoids all of that.
    """
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".guest_id.", suffix=".tmp", dir=d)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, sort_keys=True)
            fh.flush()
            try:
                os.fsync(fh.fileno())
            except Exception:  # noqa: BLE001 — fsync unsupported on some FS (tmpfs)
                pass
        os.replace(tmp, path)
    except Exception:
        # Best-effort cleanup on failure
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:  # noqa: BLE001
            pass
        raise


def get_guest_id() -> str:
    """Return the stable hardware-derived guest_id ("g_<16 hex>").

    First call per boot:
      * If guest_id.json exists AND parses AND contains a valid
        guest_id, return the CACHED value — we do NOT re-probe the
        OS.  This is the stability guarantee that J206 pins down.
      * Otherwise, derive fresh and persist atomically.

    Subsequent calls are O(1) via module-level cache.
    """
    global _cached_id
    if _cached_id:
        return _cached_id

    path = get_guest_id_file_path()
    # 1) Try cache on disk
    if os.path.isfile(path):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
            cached = data.get("guest_id")
            if (
                isinstance(cached, str)
                and cached.startswith(_GUEST_ID_PREFIX)
                and len(cached) == len(_GUEST_ID_PREFIX) + _GUEST_ID_HEX_LEN
            ):
                _cached_id = cached
                return cached
            logger.warning(
                "guest_id.json present but malformed (got %r) — re-deriving",
                cached,
            )
        except Exception as e:  # noqa: BLE001 — fall through to fresh derive
            logger.warning("guest_id.json unreadable (%s) — re-deriving", e)

    # 2) Derive + persist
    guest_id, source = _derive_guest_id()
    try:
        _atomic_write(
            path,
            {
                "guest_id": guest_id,
                "derivation_source": source,
                "version": 1,
            },
        )
        logger.info("guest_id derived (%s) → %s", source, guest_id)
    except Exception as e:  # noqa: BLE001 — persistence is best-effort
        logger.warning("guest_id persistence failed: %s", e)

    _cached_id = guest_id
    return guest_id


def reset_cache_for_tests() -> None:
    """Drop the process-level cache so a test that wipes the file
    can force a re-derive + re-write.  NEVER call in production."""
    global _cached_id
    _cached_id = None
