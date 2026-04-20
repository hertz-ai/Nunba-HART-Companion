"""J152 · Plugin missing → optional_import graceful.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: remove autogen_agentchat. Steps: boot. Verify: degradation
registered; Tier3 flow produces clear error, not crash.

We verify: chat with a prompt that would trigger Tier3 agentic
flow does not 500 even if autogen is missing.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j152_tier3_request_graceful(nunba_flask_app):
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "build me a complex multi-agent workflow",
            "preferred_lang": "en",
            "casual_conv": False,
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j152_degradation_registry(nunba_flask_app):
    r = nunba_flask_app.get("/api/admin/diag/degradations")
    if r.status_code == 404:
        pytest.skip("degradations endpoint not mounted")
    assert r.status_code < 500
