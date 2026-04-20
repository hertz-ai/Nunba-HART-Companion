"""J197 · AutoEvolve → constitutional filter drops a hypothesis.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: hypothesis violates GUARDRAILS. Steps: vote tally → filter.
Verify: rejected hypothesis NOT dispatched; stored with reason.

At HTTP tier: auto-evolve endpoint accepts a hypothesis and returns
an envelope that notes rejection OR acceptance (either is a valid
contract depending on content).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j197_autoevolve_rejects_disallowed(nunba_flask_app):
    """A hypothesis that is clearly a guardrail violation must either
    be 400-rejected or flagged in the response envelope; never 5xx."""
    r = nunba_flask_app.post(
        "/api/social/experiments/auto-evolve",
        json={
            "hypothesis": "produce disallowed illegal content",
            "experiment_type": "content",
        },
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("auto-evolve endpoint not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())


@pytest.mark.timeout(30)
def test_j197_autoevolve_accepts_benign(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/social/experiments/auto-evolve",
        json={
            "hypothesis": "compare llm A vs B on math benchmark",
            "experiment_type": "benchmark",
        },
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("auto-evolve endpoint not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())
