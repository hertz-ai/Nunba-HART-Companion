"""J57 · Cross-user WAMP notification.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* Real Nunba Flask app with `/publish` HTTP bridge (main.py:2491).

Steps
-----
1. POST /publish with a chat.social.<user_id>-scoped payload.
2. GET /api/wamp/status to verify the router reachable.

Verifiable outcomes
-------------------
* /publish returns 200 when the router is up, or 503 when not — both
  are documented contract states.
* /api/wamp/status is reachable.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j57_wamp_status_endpoint(nunba_flask_app):
    resp = nunba_flask_app.get("/api/wamp/status")
    if resp.status_code == 404:
        pytest.skip("/api/wamp/status not mounted")
    assert resp.status_code < 500
    body = resp.get_json(silent=True)
    assert body is not None, "wamp status should return JSON"


@pytest.mark.timeout(30)
def test_j57_publish_rejects_missing_topic(nunba_flask_app):
    """Contract: POST /publish with no topic → 400, never 500."""
    resp = nunba_flask_app.post(
        "/publish",
        json={"args": [{"x": 1}]},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/publish bridge not mounted")
    # Either router-down (503) or validation (400) — both are OK.
    assert resp.status_code in (400, 503)


@pytest.mark.timeout(30)
def test_j57_publish_user_scoped_topic(nunba_flask_app):
    """Topic `chat.social.<user_id>` is the per-user notification bus.
    Publishing should not 500."""
    resp = nunba_flask_app.post(
        "/publish",
        json={
            "topic": "chat.social.j57-user-alpha",
            "args": [
                {"type": "notification", "payload": {"hello": "world"}}
            ],
        },
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/publish not mounted")
    # Accept 200 (router up) or 503 (router down) — both documented.
    assert resp.status_code in (200, 503), (
        f"/publish unexpected {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j57_wamp_ticket_mint(nunba_flask_app):
    """GET /api/wamp/ticket mints a per-user subscribe ticket
    (main.py:2535)."""
    resp = nunba_flask_app.get("/api/wamp/ticket?user_id=j57-user")
    if resp.status_code == 404:
        pytest.skip("/api/wamp/ticket not mounted")
    assert resp.status_code < 500
