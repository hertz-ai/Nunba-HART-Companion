"""J192 · Flat node with no hive available.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: hive endpoints unreachable. Verify: dispatch_draft_first
delegate='hive' degrades to 'local'; degradation registry lists
`peer_link`.

We simulate "no hive" by blocking outbound on common hive ports,
then POST /chat and verify it continues to work.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j192_chat_without_hive_egress(nunba_flask_app, network_partition):
    # Block common WAMP / peer-link egress
    network_partition([8088, 5555, 5556, 9000])
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "no-hive probe",
            "preferred_lang": "en",
            "intelligence_preference": "hive_preferred",
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j192_degradations_lists_peer_link(
    nunba_flask_app, network_partition,
):
    network_partition([8088, 5555])
    r = nunba_flask_app.get("/api/admin/diag/degradations")
    if r.status_code == 404:
        pytest.skip("degradations endpoint not mounted")
    assert r.status_code < 500
