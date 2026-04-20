"""J93 · Discover local skills.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* /api/skills/discover/local mounted.

Steps
-----
1. POST /api/skills/discover/local

Verifiable outcomes
-------------------
* Reachable, non-5xx.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j93_discover_local_reachable(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/skills/discover/local",
        json={},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/skills/discover/local not mounted")
    assert resp.status_code < 500
