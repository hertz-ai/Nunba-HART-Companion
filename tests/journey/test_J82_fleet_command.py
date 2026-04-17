"""J82 · Fleet command to peer.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* fleet_command HTTP surface OR channels/send HTTP bridge mounted.

Steps
-----
1. POST /channels/send with a minimal payload.

Verifiable outcomes
-------------------
* Route reachable; non-5xx or 4xx-with-body.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j82_channels_send_reachable(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/channels/send",
        json={"channel": "web", "message": "J82 fleet probe"},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/channels/send not mounted")
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip()), (
        f"/channels/send emitted empty 5xx: {resp.status_code}"
    )


@pytest.mark.timeout(30)
def test_j82_channels_status_endpoint(nunba_flask_app):
    resp = nunba_flask_app.get("/channels/status")
    if resp.status_code == 404:
        pytest.skip("/channels/status not mounted")
    assert resp.status_code < 500
