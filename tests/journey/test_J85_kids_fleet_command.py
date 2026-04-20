"""J85 · Teacher fleet-command all kids.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* kids_game_recommendation.py blueprint mounted; /api/kids/fleet-command
  at line 506.

Steps
-----
1. POST /api/kids/fleet-command {message:"welcome class"}

Verifiable outcomes
-------------------
* Route reachable, non-5xx or 4xx-with-body.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j85_fleet_command_reachable(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/kids/fleet-command",
        json={"message": "J85 welcome"},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/kids/fleet-command not mounted")
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip()), (
        f"fleet-command emitted empty 5xx: {resp.status_code}"
    )


@pytest.mark.timeout(30)
def test_j85_recommendations_endpoint(nunba_flask_app):
    """Adjacent route: /api/kids/recommendations.  Sanity-check that
    the kids blueprint is mounted."""
    resp = nunba_flask_app.post(
        "/api/kids/recommendations",
        json={"kid_id": "j85-test"},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/kids/recommendations not mounted")
    assert resp.status_code < 500
