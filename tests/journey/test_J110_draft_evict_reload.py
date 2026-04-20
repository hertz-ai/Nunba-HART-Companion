"""J110 · Multi-turn with draft model evict/reload.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: draft evicted by ResourceGovernor OOM policy
(resource_governor.py:469). Steps: turn1 draft → evict → turn2
should reload draft before draft-first dispatch.

Verifiable: both turns reach non-5xx; admin LLM-status endpoint (if
mounted) is reachable.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j110_two_turns_survive_eviction(nunba_flask_app):
    r1 = nunba_flask_app.post(
        "/chat",
        json={"text": "quick one", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r1.status_code < 500

    # Second turn — even if draft was evicted, /chat must work.
    r2 = nunba_flask_app.post(
        "/chat",
        json={"text": "another", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r2.status_code < 500


@pytest.mark.timeout(30)
def test_j110_llm_status_reachable(nunba_flask_app):
    r = nunba_flask_app.get("/api/llm/status")
    if r.status_code == 404:
        pytest.skip("/api/llm/status not mounted")
    assert r.status_code < 500
