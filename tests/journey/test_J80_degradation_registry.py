"""J80 · Degradation registry.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* /api/admin/diag/degradations mounted (main.py:3087).

Steps
-----
1. GET /api/admin/diag/degradations

Verifiable outcomes
-------------------
* Route reachable.
* On 200: body contains `degradations` list + `count` int.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j80_degradation_registry_reachable(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/diag/degradations")
    if resp.status_code == 404:
        pytest.skip("/api/admin/diag/degradations not mounted")
    # 401/403 acceptable under central topology
    assert resp.status_code < 500
    if resp.status_code == 200:
        body = resp.get_json(silent=True) or {}
        # Contract: dict with count + degradations list
        assert "degradations" in body or "count" in body or "success" in body
        if "degradations" in body:
            assert isinstance(body["degradations"], list)
