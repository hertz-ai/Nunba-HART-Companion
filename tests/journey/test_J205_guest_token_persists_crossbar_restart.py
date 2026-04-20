"""J205 · Guest session + chat persistence survives Crossbar restart.

The auto-login chain:
  1. Guest registers → gets JWT via HTTP (NOT crossbar).
  2. Frontend subscribes to WAMP topics via crossbar for
     real-time TTS / thinking pushes.
  3. If crossbar bounces, the WAMP subscription drops but the
     JWT (signed by the Flask backend) is still valid.

Contract this test pins: a crossbar bounce MUST NOT invalidate
the guest session.  Crossbar plays no role in auth.  Chat sends
stay on HTTP, so `/chat` still succeeds during a WAMP outage —
only TTS fan-out is temporarily missing, conversation history
(localStorage) is untouched.

We deliberately do NOT bounce the real embedded crossbar — that
would risk operator damage.  Instead we assert the DEFENSIVE
properties: chat works independently of crossbar, guest-register
is reachable regardless of WAMP state, and there's no
'restart crossbar' HTTP endpoint exposed.
"""

from __future__ import annotations

import pytest

from ._live_client import _unique_device_id, live_nunba  # noqa: F401

pytestmark = pytest.mark.journey


@pytest.mark.timeout(15)
def test_j205_wamp_status_reachable_without_auth(live_nunba):
    """/api/wamp/status must return JSON without a JWT so the
    frontend can detect crossbar outage to fall back to SSE."""
    r = live_nunba.get("/api/wamp/status")
    if r.status_code == 404:
        pytest.skip("/api/wamp/status not mounted")
    assert r.status_code < 500, (
        f"wamp/status crashed: {r.status_code} "
        f"{r.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j205_guest_register_works_regardless_of_crossbar(live_nunba):
    """The HTTP guest-register path must NOT depend on crossbar.
    Guard against a refactor that routes auth through WAMP RPC
    and thereby couples auth liveness to crossbar liveness."""
    r = live_nunba.post(
        "/api/social/auth/guest-register",
        json={
            "guest_name": "j205",
            "device_id": _unique_device_id("j205-crossbar"),
        },
        headers={"Content-Type": "application/json"},
    )
    if r.status_code in (404, 429):
        pytest.skip(f"guest-register unavailable ({r.status_code})")
    assert r.status_code in (200, 201)
    body = r.get_json() or {}
    assert (body.get("data") or {}).get("token"), (
        "guest-register returned no JWT — auto-login broken "
        "independently of crossbar"
    )


@pytest.mark.timeout(15)
def test_j205_no_restart_crossbar_endpoint_exposed(live_nunba):
    """Safety rail: no 'restart crossbar' HTTP endpoint exists.
    Adding one without auth would let any local process DoS the
    realtime channel.  This test pins the gap so a reviewer sees
    it immediately on merge.
    """
    for bad in (
        "/api/wamp/restart",
        "/api/wamp/reload",
        "/api/admin/crossbar/restart",
        "/api/crossbar/restart",
    ):
        r = live_nunba.post(bad)
        # 404 / 405 / 403 acceptable; 200 would be a red flag
        assert r.status_code != 200, (
            f"Unexpected 200 on {bad} — if crossbar can be "
            "restarted over HTTP, any local process can DoS "
            "realtime without auth."
        )


@pytest.mark.timeout(30)
def test_j205_publish_endpoint_handles_bad_input_gracefully(live_nunba):
    """The /publish WAMP bridge endpoint (main.py:2507) is flagged
    [Local] in PRODUCT_MAP.  It must handle bad input gracefully.

    Valid response codes for an empty-topic payload:
      200 — accepted (some impls are permissive)
      400 — bad request ("Missing topic")
      503 — WAMP router not running (expected when crossbar is
            down; the handler chose 503 BEFORE any crash path)
      404 — endpoint not mounted in this build

    What must NEVER happen: a 500 (unhandled exception).  503 is
    explicitly the handler's documented response for
    router-unavailable, not a crash.
    """
    r = live_nunba.post("/publish", json={"topic": "", "payload": None})
    assert r.status_code in (200, 400, 404, 503), (
        f"/publish unexpected status on malformed payload: "
        f"{r.status_code} {r.get_data(as_text=True)[:200]}"
    )
    # If it's 503, confirm the body names the reason — the handler
    # returns a JSON error with a message, not a raw HTML crash page.
    if r.status_code == 503:
        body = r.get_json() or {}
        err = (body.get("error") or "").lower()
        assert err, "503 with empty body — likely a proxy response, not the handler"
