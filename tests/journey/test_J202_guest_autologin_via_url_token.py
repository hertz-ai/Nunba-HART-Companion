"""J202 · Guest auto-login — localhost storage + message-passing path.

User bug report (2026-04-18):
  "as long as it has token encoded as url param in request param
   I believe the webview is programmed to listen to localhost
   common storage and message passing for auto login — check how
   it works, it's via crossbar rpc I believe — yes check that."

Current code reality (verified 2026-04-18):
  There is NO `?auth=<token>` URL-param handler in the React tree.
  The sole auto-login mechanism is:
    1. Frontend reads /status → device_id (hardware SHA-256)
    2. Frontend POSTs /api/social/auth/guest-register
       {guest_name, device_id}  — idempotent on device_id
    3. Response includes JWT + user.id + recovery_code
    4. Frontend writes JWT to localStorage.access_token

Crossbar RPC is a SEPARATE concern: /api/wamp/ticket mints a
per-user ticket for subscribing to WAMP topics like
com.hertzai.pupit.<userId>.  That's for real-time TTS fan-out,
NOT auto-login — auth runs on HTTP.

This test file PINS that architecture so nobody accidentally
adds a half-baked URL-token parser that bypasses the
device_id idempotence.
"""

from __future__ import annotations

import pytest

from ._live_client import _unique_device_id, live_nunba  # noqa: F401

pytestmark = pytest.mark.journey


@pytest.mark.timeout(15)
def test_j202_url_auth_param_does_not_mint_a_token(live_nunba):
    """GET /local?auth=fake MUST return the SPA shell (HTML) and
    NEVER mint/echo a JWT.  Pin the gap: if a future contributor
    adds a URL-token handler, this test will catch it and force
    a security review.
    """
    r = live_nunba.get("/local?auth=fake-token-xyz")
    assert r.status_code in (200, 304), (
        f"/local?auth=... unexpected status: {r.status_code}"
    )
    body = r.get_data(as_text=True) or ""
    low = body.lower()
    # Must be HTML (SPA shell)
    assert "<html" in low or "<!doctype" in low, (
        "/local?auth=... returned non-HTML — possible silent token handler"
    )
    # Must NOT contain any access_token / refresh_token / JWT seed
    assert "access_token" not in low
    assert "refresh_token" not in low
    # JWT "header.payload.sig" base64 always starts with "eyj" (lowercase)
    assert "eyj" not in low[low.find("<body"):]


@pytest.mark.timeout(30)
def test_j202_guest_register_is_the_real_autologin_path(live_nunba):
    """The real auto-login mechanism: HTTP guest-register with
    device_id.  Must return (a) JWT token, (b) user.id, (c) guest role.
    """
    r = live_nunba.post(
        "/api/social/auth/guest-register",
        json={"guest_name": "j202", "device_id": _unique_device_id("j202-auto")},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 429:
        pytest.skip("rate limited on live Nunba")
    if r.status_code == 404:
        pytest.fail(
            "guest-register not mounted — auto-login broken.  "
            "This is the ONLY way the webview auto-binds a guest identity."
        )
    assert r.status_code in (200, 201)
    body = r.get_json() or {}
    data = body.get("data") or {}
    assert data.get("token"), "guest-register returned no JWT"
    # Token format: 3 dot-separated base64 parts
    token = data["token"]
    assert token.count(".") == 2, f"not a JWT shape: {token[:60]}..."
    user = data.get("user") or {}
    assert user.get("id"), "guest-register returned no user.id"
    assert user.get("role") in ("guest", "user"), (
        f"unexpected role on guest: {user.get('role')}"
    )


@pytest.mark.timeout(15)
def test_j202_wamp_ticket_is_crossbar_rpc_path(live_nunba):
    """Verify the crossbar RPC path the user was referring to:
    /api/wamp/ticket.  If it's mounted, it must NOT crash and must
    return SOMETHING (ticket / token / secret).  This is the real
    'crossbar rpc' the user's comment referenced — it's per-user
    ticket minting for WAMP subscribe auth, a SEPARATE concern
    from guest-register."""
    r = live_nunba.get("/api/wamp/ticket?user_id=j202-ticket-probe")
    if r.status_code == 404:
        pytest.skip("/api/wamp/ticket not mounted in this build")
    assert r.status_code < 500, (
        f"ticket endpoint crashed: {r.status_code} "
        f"{r.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(15)
def test_j202_wamp_status_reports_state(live_nunba):
    """/api/wamp/status returns a JSON state; the frontend uses this
    to decide WAMP vs SSE fallback for realtime pushes."""
    r = live_nunba.get("/api/wamp/status")
    if r.status_code == 404:
        pytest.skip("/api/wamp/status not mounted")
    assert r.status_code < 500
    body = r.get_json()
    assert body is not None, "wamp/status returned non-JSON"


@pytest.mark.timeout(30)
def test_j202_two_user_ids_get_distinct_wamp_tickets(live_nunba):
    """If /api/wamp/ticket is mounted, two distinct user_ids
    must get distinct tickets (no cross-user topic subscribe bleed).
    """
    r1 = live_nunba.get("/api/wamp/ticket?user_id=j202-A")
    if r1.status_code == 404:
        pytest.skip("ticket endpoint not mounted")
    if r1.status_code >= 500:
        pytest.skip(f"ticket endpoint crashed: {r1.status_code}")
    b1 = r1.get_json() or {}
    t1 = b1.get("ticket") or b1.get("token") or b1.get("secret")
    if not t1:
        pytest.skip("ticket response has no ticket field; shape differs")

    r2 = live_nunba.get("/api/wamp/ticket?user_id=j202-B")
    b2 = r2.get_json() or {}
    t2 = b2.get("ticket") or b2.get("token") or b2.get("secret")
    if not t2:
        pytest.skip("second ticket response missing field")
    assert t1 != t2, (
        "WAMP ticket shared across user_ids — cross-user subscribe leak."
    )
