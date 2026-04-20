"""J144 · Cross-topology memory sync flat → regional.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: flat node has 50 memories. Steps: promote to regional →
federated_aggregator.aggregate_embeddings pushes.

Verifiable at contract tier: aggregator status endpoint reachable;
memory-count endpoint reachable.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j144_aggregator_status_reachable(nunba_flask_app):
    for path in (
        "/api/hive/aggregator/status",
        "/api/federated/status",
        "/api/admin/federated",
    ):
        r = nunba_flask_app.get(path)
        if r.status_code != 404:
            assert r.status_code < 500
            return
    pytest.skip("aggregator status endpoint not mounted")


@pytest.mark.timeout(30)
def test_j144_memory_recent_reachable(nunba_flask_app):
    r = nunba_flask_app.get("/api/memory/recent")
    if r.status_code == 404:
        pytest.skip("/api/memory/recent not mounted")
    assert r.status_code < 500
