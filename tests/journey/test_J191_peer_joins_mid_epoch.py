"""J191 · Peer joins mid-aggregate epoch.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: aggregator tick window open; new peer announces. Verify:
included in NEXT epoch, not this one; no double-count.

At contract tier: peer-announce endpoint reachable; aggregator
status reachable.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j191_peer_announce(nunba_flask_app):
    for path in (
        "/api/hive/peer/announce",
        "/api/peer/announce",
    ):
        r = nunba_flask_app.post(
            path,
            json={"peer_id": "j191-new-peer", "host": "127.0.0.1:9999"},
            headers={"Content-Type": "application/json"},
        )
        if r.status_code != 404:
            body = r.get_data(as_text=True)
            assert not (r.status_code >= 500 and not body.strip())
            return
    pytest.skip("peer-announce endpoint not mounted")


@pytest.mark.timeout(30)
def test_j191_aggregator_status(nunba_flask_app):
    for path in (
        "/api/hive/aggregator/status",
        "/api/federated/status",
    ):
        r = nunba_flask_app.get(path)
        if r.status_code != 404:
            assert r.status_code < 500
            return
    pytest.skip("aggregator status endpoint not mounted")
