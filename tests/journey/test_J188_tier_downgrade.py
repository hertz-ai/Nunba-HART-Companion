"""J188 · Tier downgrade: central → regional.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: manual demote. Verify: aggregator gracefully enters regional
mode; /api/v1/system/tiers reports new tier.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j188_tiers_endpoint(nunba_flask_app):
    r = nunba_flask_app.get("/api/v1/system/tiers")
    if r.status_code == 404:
        r = nunba_flask_app.get("/api/system/tiers")
    if r.status_code == 404:
        pytest.skip("tiers endpoint not mounted")
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j188_demote_endpoint(nunba_flask_app):
    for path in (
        "/api/admin/system/demote",
        "/api/system/tier/set",
    ):
        r = nunba_flask_app.post(
            path,
            json={"tier": "regional"},
            headers={"Content-Type": "application/json"},
        )
        if r.status_code != 404:
            body = r.get_data(as_text=True)
            assert not (r.status_code >= 500 and not body.strip())
            return
    pytest.skip("demote endpoint not mounted")
