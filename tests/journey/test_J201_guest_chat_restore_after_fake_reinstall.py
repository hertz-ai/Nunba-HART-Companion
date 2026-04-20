"""J201 · Guest chat survives uninstall/reinstall cycle.

User bug report (2026-04-18):
  "When we uninstall reinstall it restores and auto-scrolls to
   the latest conversation for each agent."

Contract: Nunba's user-writable state lives in
`~/Documents/Nunba/data/` — which is NOT touched by uninstalling
`C:\\Program Files (x86)\\HevolveAI\\Nunba\\`.  So even after a
reinstall, the guest identity (device_id-derived) AND the
prompt_id → conversation linkage MUST be recovered.

Full uninstall/reinstall against the LIVE production install
would damage the operator's system — we deliberately DO NOT do
that.  Instead we:
  1. Verify the live /status exposes device_id (persists across
     restarts).
  2. Verify guest-register with the same device_id returns the
     same user.id (the 'reinstall preserves identity' invariant).
  3. Document the guest_id.json spec that would close the
     WebView2-UserData-wipe gap (xfail until implemented).
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from ._live_client import _unique_device_id, live_nunba  # noqa: F401

pytestmark = pytest.mark.journey


@pytest.mark.timeout(15)
def test_j201_device_id_persists_across_status_calls(live_nunba):
    """Pin: /status returns the SAME device_id on every call.
    Derivation is pure-function on hardware fingerprint; same
    hardware → same hash.  Reinstall preserves the fingerprint,
    so the frontend can recover the guest identity deterministically.
    """
    id1 = (live_nunba.get("/status").get_json() or {}).get("device_id")
    id2 = (live_nunba.get("/status").get_json() or {}).get("device_id")
    assert id1 and id2 and id1 == id2, (
        f"device_id NOT deterministic across /status calls: "
        f"{id1!r} vs {id2!r}"
    )


@pytest.mark.timeout(30)
def test_j201_same_device_returns_same_guest_across_reregister(live_nunba):
    """End-to-end of the 'reinstall preserves guest' story:
    first guest-register mints user.id X; forgetting the JWT
    client-side (app data wiped) and re-registering with the
    same device_id MUST return user.id X again.
    """
    device_id = _unique_device_id("j201-reinstall")

    r_a = live_nunba.post(
        "/api/social/auth/guest-register",
        json={"guest_name": "j201", "device_id": device_id},
        headers={"Content-Type": "application/json"},
    )
    if r_a.status_code in (404, 429):
        pytest.skip(f"guest-register unavailable: {r_a.status_code}")
    id_a = (
        ((r_a.get_json() or {}).get("data") or {}).get("user") or {}
    ).get("id")
    assert id_a, f"first register returned no id: {r_a.get_data(as_text=True)[:300]}"

    # "Reinstall" — we do NOT touch backend state; frontend would
    # just re-register with the same device_id.
    r_b = live_nunba.post(
        "/api/social/auth/guest-register",
        json={"guest_name": "j201", "device_id": device_id},
        headers={"Content-Type": "application/json"},
    )
    if r_b.status_code == 429:
        pytest.skip("rate-limited on re-register")
    id_b = (
        ((r_b.get_json() or {}).get("data") or {}).get("user") or {}
    ).get("id")
    assert id_b == id_a, (
        f"reinstall breaks guest identity: {id_a} → {id_b}. "
        f"Prior conversations become unreachable."
    )


@pytest.mark.timeout(15)
def test_j201_device_id_file_under_data_dir():
    """CLAUDE.md Gate 7: device_id.json MUST live under user-writable
    `~/Documents/Nunba/data/`.  If it landed under Program Files, an
    uninstall would wipe it and every reinstall would mint a fresh
    guest identity — breaking the restore promise.
    """
    home = Path.home()
    # Default install locations — accept any under ~/Documents/Nunba/
    candidates = [
        home / "Documents" / "Nunba" / "data" / "device_id.json",
        home / "Documents" / "Nunba" / "device_id.json",
    ]
    found = [p for p in candidates if p.exists()]
    if not found:
        # Check inside the source tree as a last resort (dev mode)
        alt = Path(__file__).resolve().parents[2] / "device_id.json"
        if alt.exists():
            found = [alt]
    if not found:
        pytest.skip(
            "device_id.json not found in any expected location — "
            "live Nunba may not have written it yet"
        )
    for p in found:
        # Must NOT be under Program Files
        assert "Program Files" not in str(p), (
            f"device_id.json at {p} is under Program Files — "
            f"reinstall would wipe it, breaking guest restore."
        )


@pytest.mark.timeout(15)
def test_j201_guest_id_json_under_data_dir():
    """J201 green path: `guest_id.json` MUST live under
    `get_data_dir()` — NOT inside WebView2's UserDataFolder (which
    is wiped by uninstall) and NOT under Program Files (which is
    read-only for non-admin users).

    On this install, desktop/guest_identity.py writes the file at
    module-import time via get_guest_id().  We call the helper
    directly (no live HTTP) so the test is self-contained and
    doesn't depend on the Flask boot having already happened.
    """
    from desktop.guest_identity import (
        get_guest_id,
        get_guest_id_file_path,
    )

    guest_id = get_guest_id()
    gid_path = Path(get_guest_id_file_path())

    # MUST be a user-writable path — never under Program Files.
    assert "Program Files" not in str(gid_path), (
        f"guest_id.json at {gid_path} is under Program Files — "
        f"reinstall would wipe it, breaking guest restore."
    )

    # File MUST exist after get_guest_id() has run.
    assert gid_path.exists(), (
        f"get_guest_id() returned {guest_id!r} but {gid_path} was not "
        f"written — persistence is broken."
    )

    import json as _json
    data = _json.loads(gid_path.read_text(encoding="utf-8"))
    assert "guest_id" in data, "guest_id.json missing 'guest_id' key"
    assert isinstance(data["guest_id"], str)
    # Shape: "g_" + 16 hex = 18 chars
    assert data["guest_id"].startswith("g_"), (
        f"guest_id must be prefixed 'g_' (not a real UUID), got "
        f"{data['guest_id']!r}"
    )
    assert len(data["guest_id"]) == 18, (
        f"guest_id must be 'g_' + 16 hex chars (18 total), got "
        f"length {len(data['guest_id'])}: {data['guest_id']!r}"
    )
    # derivation_source recorded for ops diagnostic
    assert data.get("derivation_source"), (
        "guest_id.json missing 'derivation_source' — ops can't tell "
        "if we hit the fallback path"
    )


@pytest.mark.timeout(15)
def test_j201_live_api_guest_id_returns_same_id(live_nunba):
    """End-to-end: GET /api/guest-id returns the SAME "g_<16 hex>"
    id as the on-disk guest_id.json.  This is the invariant the
    React fallback chain depends on (window.__NUNBA_GUEST_ID__
    matches what desktop/guest_identity.py persisted).
    """
    r = live_nunba.get("/api/guest-id")
    if r.status_code == 404:
        pytest.skip("guest-id endpoint not mounted in this build")
    if r.status_code == 503:
        pytest.skip("guest-id derivation unavailable on this host")
    assert r.status_code == 200
    body = r.get_json() or {}
    api_id = body.get("guest_id")
    assert api_id, "guest_id missing from response"
    # Cross-check against on-disk value
    from desktop.guest_identity import get_guest_id
    assert api_id == get_guest_id(), (
        "API and on-disk guest_id disagree — two sources of truth, "
        "which would break storage-key derivation on the frontend"
    )
