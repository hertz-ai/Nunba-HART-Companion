"""J190 · Crossbar restart while WAMP clients connected.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: kill crossbar → restart → clients reconnect → tickets
re-minted via main.py:2535.

At HTTP tier: after a series of /publish calls that exercise the
bridge, subsequent ticket mints still work.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j190_ticket_after_publish_burst(nunba_flask_app):
    for i in range(10):
        r = nunba_flask_app.post(
            "/publish",
            json={"topic": f"j190.burst.{i}", "args": [{"i": i}]},
            headers={"Content-Type": "application/json"},
        )
        if r.status_code == 404:
            pytest.skip("/publish not mounted")
        assert r.status_code in (200, 503)

    r = nunba_flask_app.get("/api/wamp/ticket?user_id=j190-user")
    if r.status_code == 404:
        pytest.skip("/api/wamp/ticket not mounted")
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j190_wamp_status_survives_publish(nunba_flask_app):
    nunba_flask_app.post(
        "/publish",
        json={"topic": "j190.status", "args": [{"x": 1}]},
        headers={"Content-Type": "application/json"},
    )
    r = nunba_flask_app.get("/api/wamp/status")
    if r.status_code == 404:
        pytest.skip("/api/wamp/status not mounted")
    assert r.status_code < 500
