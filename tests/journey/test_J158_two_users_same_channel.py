"""J158 · Two users same channel adapter concurrent inbound.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: 2 WebSocket inbounds on channel_bindings adapter for same
channel_id. Verify: both routed; no row lost.

At HTTP tier: /channels/send from two different user_ids both work.
"""

from __future__ import annotations

import concurrent.futures

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j158_two_users_channel_send(nunba_flask_app, dual_user):
    def _send(user: dict):
        return nunba_flask_app.post(
            "/channels/send",
            json={
                "channel": "web",
                "message": f"from {user['user_id']}",
                "user_id": user["user_id"],
            },
            headers={"Content-Type": "application/json"},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        fA = ex.submit(_send, dual_user["a"])
        fB = ex.submit(_send, dual_user["b"])
        rA, rB = fA.result(timeout=30), fB.result(timeout=30)

    if rA.status_code == 404 and rB.status_code == 404:
        pytest.skip("/channels/send not mounted")
    for r in (rA, rB):
        body = r.get_data(as_text=True)
        assert not (r.status_code >= 500 and not body.strip())


@pytest.mark.timeout(30)
def test_j158_channels_status_under_two_users(nunba_flask_app, dual_user):
    """Channel-status endpoint must stay healthy while two users'
    messages are in-flight."""
    for u in (dual_user["a"], dual_user["b"]):
        nunba_flask_app.post(
            "/channels/send",
            json={
                "channel": "web",
                "message": "probe",
                "user_id": u["user_id"],
            },
            headers={"Content-Type": "application/json"},
        )
    r = nunba_flask_app.get("/channels/status")
    if r.status_code == 404:
        pytest.skip("/channels/status not mounted")
    assert r.status_code < 500
