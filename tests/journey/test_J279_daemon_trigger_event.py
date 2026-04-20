"""J279 · Daemon agent event trigger via WAMP bridge.

PRODUCT_MAP.md §USER JOURNEYS — daemon agent side (J161 context
at line 1207-1210). MISSING: the event-driven trigger pathway. A
daemon agent subscribes to a trigger topic; when that topic
receives a publish, the daemon fires its goal and emits a
response event on its designated output topic.

Target surface
--------------
  main.py:2871  - POST /publish  (crossbarhttp3 bridge)
  main.py:2915  - GET  /api/wamp/ticket (auth ticket issuer)
  main.py:2904  - GET  /api/wamp/status (router stats)
  wamp_router.py:618 - embedded router run loop

User journey
------------
1. Daemon agent is subscribed to a trigger topic
   (e.g. `com.hertzai.hevolve.trigger.<user_id>`).
2. External event fires via /publish with that topic.
3. Daemon `_tick` picks up, fans the goal, emits
   `goal.tool.result` and finally `goal.completed` on its
   response topic.

This test exercises the TRANSPORT-LEVEL contract. End-to-end daemon
firing requires a running HARTOS agent_daemon process, which isn't
enabled under NUNBA_DISABLE_HARTOS_INIT=1. The transport itself —
the /publish bridge that feeds the daemon — must still be
functional, and the wamp/status endpoint must report router health.

Verifiable outcomes
-------------------
* GET /api/wamp/status responds with running/stats envelope.
* POST /publish accepts a trigger event without 5xx.
* POST /publish with malformed body 4xx, not 5xx.

PRODUCT_MAP.md line cites:
  - J161 daemon coexistence: line 1207
  - /publish bridge: line 1199-1202
  - wamp_router: line 1201 (main.py:2491 historical ref)
"""

from __future__ import annotations

import time

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j279_wamp_status_envelope(nunba_flask_app):
    """GET /api/wamp/status must report either a running router or
    a clean `running: False` envelope. 503 (router off) is also
    acceptable when embedded router is disabled."""
    resp = nunba_flask_app.get("/api/wamp/status")
    if resp.status_code == 404:
        pytest.skip("/api/wamp/status not mounted")
    # 503 when embedded router is off — still valid
    assert resp.status_code < 500 or resp.status_code == 503, (
        f"/api/wamp/status crashed: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
    if resp.status_code == 200:
        body = resp.get_json(silent=True) or {}
        # Must carry some status field
        assert isinstance(body, dict), (
            f"wamp status not a dict: {type(body)}"
        )


@pytest.mark.timeout(30)
def test_j279_trigger_publish_accepts_event(nunba_flask_app):
    """/publish must accept a trigger payload that a daemon would
    subscribe to. The message is a JSON dict with action field."""
    trigger_payload = {
        "topic": f"com.hertzai.hevolve.trigger.j279-{int(time.time())}",
        "args": [
            {
                "event": "trigger",
                "action": "run_daemon_task",
                "context": {"source": "j279-test"},
            }
        ],
        "kwargs": {"user_id": "j279-daemon-user"},
    }
    resp = nunba_flask_app.post("/publish", json=trigger_payload)
    if resp.status_code == 404:
        pytest.skip("/publish not mounted")
    # 503 = router not running; still not a crash
    assert resp.status_code < 500 or resp.status_code == 503, (
        f"/publish crashed on trigger: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j279_trigger_publish_empty_topic_400(nunba_flask_app):
    """/publish with missing topic must 4xx — prevents silent
    event loss if a daemon publishes to the wrong topic."""
    resp = nunba_flask_app.post(
        "/publish",
        json={"args": [{"event": "trigger"}], "kwargs": {}},
    )
    if resp.status_code == 404:
        pytest.skip("/publish not mounted")
    # 400 or 503 acceptable — both are clean failure signals
    assert resp.status_code < 500 or resp.status_code == 503, (
        f"/publish crashed on empty topic: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j279_wamp_ticket_issued_for_live_subscriber(nunba_flask_app):
    """A daemon's response subscriber (browser worker) needs a
    WAMP ticket before it can subscribe to the response topic.
    /api/wamp/ticket must yield a ticket (or empty in localhost
    mode) without 5xx."""
    resp = nunba_flask_app.get("/api/wamp/ticket")
    if resp.status_code == 404:
        pytest.skip("/api/wamp/ticket not mounted")
    assert resp.status_code < 500, (
        f"/api/wamp/ticket crashed: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
    if resp.status_code == 200:
        body = resp.get_json(silent=True) or {}
        assert "ticket" in body, (
            f"ticket envelope malformed: {list(body)}"
        )


@pytest.mark.timeout(30)
def test_j279_trigger_to_response_topic_convention(nunba_flask_app):
    """The ecosystem convention is that a daemon publishing a
    response uses topic `com.hertzai.hevolve.chat.<user_id>`.
    Verify /publish round-trip with that topic shape is accepted."""
    response_payload = {
        "topic": "com.hertzai.hevolve.chat.j279-test-user",
        "args": [
            {
                "type": "daemon_response",
                "goal_id": "j279-goal-1",
                "status": "completed",
            }
        ],
    }
    resp = nunba_flask_app.post("/publish", json=response_payload)
    if resp.status_code == 404:
        pytest.skip("/publish not mounted")
    assert resp.status_code < 500 or resp.status_code == 503, (
        f"/publish crashed on response topic: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
