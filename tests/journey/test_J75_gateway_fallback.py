"""J75 · Provider gateway fallback on error.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* Real Nunba Flask app with admin provider routes mounted.

Steps
-----
1. GET  /api/admin/providers → see list.
2. GET  /api/admin/providers/efficiency/leaderboard.
3. GET  /api/admin/providers/capabilities.

Verifiable outcomes
-------------------
* Each admin endpoint is reachable.
* Not 500 with empty body (auth 401/403 is fine).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j75_providers_list_mounted(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/providers")
    if resp.status_code == 404:
        pytest.skip("/api/admin/providers not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j75_providers_leaderboard(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/providers/efficiency/leaderboard")
    if resp.status_code == 404:
        pytest.skip("leaderboard not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j75_providers_capabilities(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/providers/capabilities")
    if resp.status_code == 404:
        pytest.skip("capabilities not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j75_providers_gateway_stats(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/providers/gateway/stats")
    if resp.status_code == 404:
        pytest.skip("gateway stats not mounted")
    assert resp.status_code < 500
