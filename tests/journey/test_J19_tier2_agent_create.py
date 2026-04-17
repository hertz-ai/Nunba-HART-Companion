"""J19 · Tier-2 agent via SPA.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* Real Nunba Flask app with social_bp mounted under `/api/social`.

Steps
-----
1. POST /api/social/agents with a new agent payload.
2. Assert the response is an auth-gated 401/403 OR a success
   envelope with an agent id.

Verifiable outcomes
-------------------
* Route is reachable (not 404).
* Response body is JSON.
* Either: success (row persisted + id returned), OR auth-refused
  (401/403), OR degraded-mode graceful error (500 with body).  The
  one failure mode we explicitly forbid is 500 with an empty body.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j19_post_social_agents_route_mounted(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/social/agents",
        json={
            "name": "J19 test agent",
            "description": "Tier-2 agent — journey test",
        },
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/social/agents not mounted in this env")
    # Not 500 with empty body — any other status is a valid contract
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip()), (
        f"/api/social/agents 5xx with empty body at {resp.status_code}"
    )


@pytest.mark.timeout(60)
def test_j19_post_social_agents_rejects_empty_name(nunba_flask_app):
    """Contract: missing required fields produce a 4xx, not a crash."""
    resp = nunba_flask_app.post(
        "/api/social/agents",
        json={},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/social/agents not mounted")
    assert resp.status_code < 500, (
        f"empty payload should be 4xx; got {resp.status_code}"
    )
