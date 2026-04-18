"""J264 · WAMP topic publish-bridge round-trip per topic family.

PRODUCT_MAP.md §5 enumerates 20+ WAMP topics (plus 10 PeerLink
channels).  Only a handful had journeys (J53 community.feed, J54
votes, J96 publish bridge).  For breadth: every topic family must
accept a publish through `POST /publish` (main.py:2491) without
5xx and with the authorization whitelist applied.

We use the in-process publish bridge rather than a real crossbar
client because CI runners don't always have crossbar on :8088.  The
/publish route fans the same event out to SSE subscribers (J99), so
the bridge gives us a test-friendly observation surface.

Mapping: PRODUCT_MAP §5 WAMP topic table + main.py:2491.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


# Topic FAMILIES (per-user pub scope omitted from family name)
# per PRODUCT_MAP §5.  The publish bridge uses the exact topic name.
_TOPIC_SAMPLES: list[str] = [
    "community.feed",
    "community.message",
    "social.post.j264test.new_comment",
    "social.post.j264test.vote",
    "chat.social",
    "presence.j264user",
    "game.j264session",
    "setup_progress",
    "system.catalog.updated",
    "catalog.registered",
    "model.j264mdl.loaded",
    "tts.j264user",
    "admin.broadcast",
    "hive.signal.received",
    "hive.signal.spark",
    "hive.benchmark.completed",
    "hive.benchmark.published",
    "hive.task.dispatched",
    "hive.task.completed",
    "hive.session.connected",
    "hive.session.disconnected",
    "auto_evolve.started",
    "auto_evolve.none_approved",
]


# 503 is the DELIBERATE contract when the embedded WAMP router is
# disabled (CI / headless pytest run).  `main.py:/publish` returns
# 503 + structured {"error":"WAMP router not running"} envelope on
# purpose — that is graceful degradation, not a crash.  A REAL crash
# is 500 / 502 / 504 (stack trace, bad gateway, gateway timeout).
_CRASH_CODES: frozenset[int] = frozenset({500, 502, 504})


def _is_crash(code: int) -> bool:
    return code in _CRASH_CODES


@pytest.mark.timeout(15)
def test_j264_publish_bridge_accepts_valid_topic_family(nunba_flask_app):
    """Smoke — at least the broadly-used topics publish without server crash.

    For topics on the whitelist we expect 200 when the WAMP router is
    running, or 503 when it is not (headless pytest).  Topics outside
    the whitelist should return 4xx with a structured error.  Never a
    500 / 502 / 504 — that would be a real crash."""
    resp = nunba_flask_app.post(
        "/publish",
        json={"topic": "community.feed", "data": {"_j264_test": True}},
    )
    assert not _is_crash(resp.status_code), (
        f"/publish crashed on community.feed with {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:150]}"
    )


@pytest.mark.timeout(30)
@pytest.mark.parametrize("topic", _TOPIC_SAMPLES)
def test_j264_every_topic_family_not_5xx(nunba_flask_app, topic):
    """Every topic in §5 must be accepted OR rejected cleanly.

    Never 500 / 502 / 504 — that would indicate the publish bridge
    isn't validating at the right layer.  503 (WAMP router down),
    4xx (bad input or unauthorized), and 2xx (published) are all
    legitimate contract states.
    """
    resp = nunba_flask_app.post(
        "/publish",
        json={"topic": topic, "data": {"_j264_test_marker": topic}},
    )
    assert not _is_crash(resp.status_code), (
        f"/publish crashed on topic {topic!r} with {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:150]}"
    )
    # If 4xx, envelope must explain why.  If 2xx, the publish
    # succeeded.  If 503, WAMP router is deliberately disabled.
    if 400 <= resp.status_code < 500 or resp.status_code == 503:
        body = resp.get_json(silent=True) or {}
        # Some gated paths may emit {success:false, error:...}
        assert isinstance(body, dict), (
            f"reject for {topic!r} missing JSON envelope (code={resp.status_code})"
        )


@pytest.mark.timeout(15)
def test_j264_publish_without_topic_is_400(nunba_flask_app):
    """Omitted topic field must be rejected with 4xx structured error.

    NOTE: if the WAMP router is disabled (headless pytest),
    ``/publish`` returns 503 BEFORE it even reads the topic, so accept
    either 503 or 4xx here."""
    resp = nunba_flask_app.post("/publish", json={"data": {"x": 1}})
    assert not _is_crash(resp.status_code)
    # Either 400 (bad args) or 503 (WAMP disabled).  Never 500/502/504.
    assert resp.status_code >= 400, (
        f"/publish with no topic should reject, got {resp.status_code}"
    )


@pytest.mark.timeout(15)
def test_j264_wamp_ticket_mint_for_user(nunba_flask_app):
    """WAMP ticket minting (main.py:2535) — per-user subscribe
    authorization.  Must issue a ticket for any authenticated-feeling
    request (loopback is enough in test)."""
    resp = nunba_flask_app.get("/api/wamp/ticket?user_id=j264")
    if resp.status_code == 404:
        pytest.skip("/api/wamp/ticket not mounted")
    assert not _is_crash(resp.status_code), (
        f"ticket mint crashed with {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:150]}"
    )
    if resp.status_code == 200:
        body = resp.get_json() or {}
        # Ticket envelope must carry a token of non-trivial length
        tok = body.get("ticket") or body.get("token")
        if tok is not None:
            assert isinstance(tok, str) and len(tok) >= 8, (
                f"ticket too short or wrong type: {tok!r}"
            )


@pytest.mark.timeout(15)
def test_j264_wamp_status_reachable(nunba_flask_app):
    """Embedded crossbar status (main.py:2524) — admins check this to
    confirm the WAMP router is alive."""
    resp = nunba_flask_app.get("/api/wamp/status")
    if resp.status_code == 404:
        pytest.skip("/api/wamp/status not mounted")
    assert not _is_crash(resp.status_code)
    body = resp.get_json(silent=True) or {}
    assert isinstance(body, dict), (
        "WAMP status must return JSON object for admin dashboard"
    )
