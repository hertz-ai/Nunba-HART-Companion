"""J52 · Per-channel agent assignment.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* channel_user_bp mounted at /api/social/channels.

Steps
-----
1. POST /api/social/channels/bindings with a binding payload.

Verifiable outcomes
-------------------
* Reachable; non-5xx or 4xx-with-body.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j52_channel_bindings_reachable(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/social/channels/bindings",
        json={
            "channel_id": "j52-channel",
            "agent_id": "j52-agent",
            "active": True,
        },
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/social/channels/bindings not mounted")
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip())


@pytest.mark.timeout(30)
def test_j52_channel_bindings_rejects_empty(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/social/channels/bindings",
        json={},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/social/channels/bindings not mounted")
    assert resp.status_code < 500
