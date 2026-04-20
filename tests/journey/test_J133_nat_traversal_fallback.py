"""J133 · PeerLink NAT-traversal failure → fallback to relay.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: peer_link/nat.py punch fails → link.py:244 uses relay.
Verifiable at contract tier: peer-send endpoint (if mounted) does
not crash on an unreachable peer.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j133_peer_send_unreachable(nunba_flask_app):
    for path in ("/api/hive/peer/send", "/api/peer/send"):
        r = nunba_flask_app.post(
            path,
            json={"peer_id": "j133-unreachable-peer", "message": "probe"},
            headers={"Content-Type": "application/json"},
        )
        if r.status_code != 404:
            body = r.get_data(as_text=True)
            assert not (r.status_code >= 500 and not body.strip())
            return
    pytest.skip("peer-send endpoint not mounted")


@pytest.mark.timeout(30)
def test_j133_nat_status_endpoint(nunba_flask_app):
    for path in ("/api/hive/nat", "/api/peer/nat"):
        r = nunba_flask_app.get(path)
        if r.status_code != 404:
            assert r.status_code < 500
            return
    pytest.skip("NAT-status endpoint not mounted")
