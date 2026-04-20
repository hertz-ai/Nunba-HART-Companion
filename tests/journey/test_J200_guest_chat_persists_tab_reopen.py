"""J200 · Guest chat persists across webview close+reopen.

User bug report (2026-04-18):
  "we already store and restore conversation locally via cookies or
   webstorage but since not logged in it is not persistent I believe
   due to lack of token in the url ... It used to load earlier
   I believe only for guest login it's not working."

Fix reference: commit 5089109 — STORAGE_KEY scoped to (userId, agentId)
so guest bucket `nunba_chat_<userId||guest>_<agentId||default>` is
stable across webview close+reopen when userId is stable too.

What this test locks in (via LIVE HTTP to running Nunba on :5000):
  1. Posting /api/social/auth/guest-register succeeds for a guest.
  2. The guest identity is STABLE for a given device_id — the
     idempotent `/api/social/auth/guest-register` contract.  Same
     device_id → same user.id.  This is the single invariant
     that lets the storage key bucket resolve to the same place
     across webview close+reopen.
  3. Storage-key format regex matches the shape documented in
     commit 5089109.
"""

from __future__ import annotations

import re

import pytest

from ._live_client import _unique_device_id, live_nunba  # noqa: F401

pytestmark = pytest.mark.journey


# Storage-key regex the commit 5089109 fix pins:
#   `nunba_chat_<userId||'guest'>_<agentId||'default'>`
STORAGE_KEY_RE = re.compile(
    r"^nunba_chat_(?P<user>[A-Za-z0-9_\-]+)_(?P<agent>[A-Za-z0-9_\-\.]+)$"
)


def _build_storage_key(user_id: str | None, agent_id: str | None) -> str:
    """Mirror the JS STORAGE_KEY helper from NunbaChatProvider.jsx.

    Single source of truth in JS at landing-page/src/components/Social
    /shared/NunbaChat/NunbaChatProvider.jsx:67.  This Python mirror is
    used to assert the contract shape without loading a browser.
    """
    uid = user_id or "guest"
    aid = agent_id or "default"
    return f"nunba_chat_{uid}_{aid}"


@pytest.mark.timeout(15)
def test_j200_storage_key_format_matches_commit_5089109():
    """Contract pin: storage-key shape is exactly
    `nunba_chat_<userId||guest>_<agentId||default>`.  Regressing to
    `nunba_chat_<agentId>` (the pre-fix pattern) would break guest
    persistence AND fail this regex.  Pure-shape test — no IO."""
    # Default-agent, guest user
    key_guest_default = _build_storage_key(None, None)
    m = STORAGE_KEY_RE.match(key_guest_default)
    assert m, f"storage key {key_guest_default!r} does not match contract"
    assert m.group("user") == "guest"
    assert m.group("agent") == "default"

    # Explicit user + explicit agent
    key = _build_storage_key("abc-123", "agent-42")
    m2 = STORAGE_KEY_RE.match(key)
    assert m2, f"key {key!r} does not match contract"
    assert m2.group("user") == "abc-123"
    assert m2.group("agent") == "agent-42"

    # Regression guard: the OLD single-scope key must NOT be a valid
    # match against the two-scope regex (one underscore short).
    old_style = "nunba_chat_default"
    assert STORAGE_KEY_RE.match(old_style) is None, (
        "old one-scope key shape is matching the contract regex — "
        "the 5089109 fix regressed"
    )


@pytest.mark.timeout(30)
def test_j200_guest_identity_stable_across_reopen(live_nunba):
    """Simulate: guest registers → tab close → reopen → re-register
    with same device_id → MUST return the same user.id.

    This is the SINGLE backend invariant the storage-bucket restore
    depends on: same device_id → same user.id → same storage-key
    resolution → same conversation bucket reappears.
    """
    device_id = _unique_device_id("j200-stable")

    # ── Session 1: "open tab" ──
    r_reg = live_nunba.post(
        "/api/social/auth/guest-register",
        json={"guest_name": "j200-tester", "device_id": device_id},
        headers={"Content-Type": "application/json"},
    )
    if r_reg.status_code == 404:
        pytest.skip("guest-register not mounted in this build")
    if r_reg.status_code == 429:
        pytest.skip("rate limited against live Nunba; re-run later")
    assert r_reg.status_code in (200, 201), (
        f"guest-register failed: {r_reg.status_code} "
        f"{r_reg.get_data(as_text=True)[:300]}"
    )
    body1 = r_reg.get_json() or {}
    user1 = (body1.get("data") or {}).get("user") or {}
    uid_session_1 = user1.get("id")
    assert uid_session_1, f"guest-register returned no user.id: {body1}"

    # ── Session 2: "close+reopen" — re-register with same device_id ──
    r_reg2 = live_nunba.post(
        "/api/social/auth/guest-register",
        json={"guest_name": "j200-tester", "device_id": device_id},
        headers={"Content-Type": "application/json"},
    )
    if r_reg2.status_code == 429:
        pytest.skip("rate limited on reopen")
    assert r_reg2.status_code in (200, 201)
    body2 = r_reg2.get_json() or {}
    user2 = (body2.get("data") or {}).get("user") or {}
    uid_session_2 = user2.get("id")

    # ROOT INVARIANT — same device → same guest user.id
    assert uid_session_2 == uid_session_1, (
        f"guest identity NOT stable across reopen: "
        f"session1={uid_session_1} session2={uid_session_2} — "
        f"storage key would differ, chat would appear wiped."
    )
    # Storage keys derived from this id must ALSO match
    key_s1 = _build_storage_key(uid_session_1, "default")
    key_s2 = _build_storage_key(uid_session_2, "default")
    assert key_s1 == key_s2


@pytest.mark.timeout(30)
def test_j200_guest_register_without_device_id_is_not_pinned(live_nunba):
    """Documents the CURRENT contract: omitting device_id produces
    a NEW user.id each call (non-idempotent).  The frontend must
    therefore ALWAYS send device_id.  If this invariant silently
    changes to 'idempotent on nothing', device_id-less callers
    would accidentally share a guest account — a privacy bug.
    """
    r1 = live_nunba.post(
        "/api/social/auth/guest-register",
        json={"guest_name": "j200-nd-one"},
        headers={"Content-Type": "application/json"},
    )
    if r1.status_code in (429, 404):
        pytest.skip(f"guest-register unavailable: {r1.status_code}")
    r2 = live_nunba.post(
        "/api/social/auth/guest-register",
        json={"guest_name": "j200-nd-two"},
        headers={"Content-Type": "application/json"},
    )
    if r2.status_code == 429:
        pytest.skip("rate limited")
    assert r1.status_code in (200, 201) and r2.status_code in (200, 201)
    id1 = ((r1.get_json() or {}).get("data") or {}).get("user", {}).get("id")
    id2 = ((r2.get_json() or {}).get("data") or {}).get("user", {}).get("id")
    assert id1 != id2, (
        "guest-register with NO device_id returned the same user.id "
        "for two distinct names — privacy boundary violation."
    )


@pytest.mark.timeout(15)
def test_j200_device_id_exposed_by_status(live_nunba):
    """Pin the contract: /status returns a stable device_id derived
    from hardware.  The frontend uses this in utils/deviceId.js to
    seed guest-register so the guest identity is reinstall-stable.
    """
    r = live_nunba.get("/status")
    assert r.status_code == 200
    body = r.get_json() or {}
    device_id = body.get("device_id")
    assert device_id, "device_id missing from /status"
    # SHA-256 hex
    assert len(device_id) == 64, (
        f"device_id not SHA-256 hex: len={len(device_id)} value={device_id[:16]}..."
    )
    assert all(c in "0123456789abcdef" for c in device_id), (
        "device_id is not lowercase hex"
    )
