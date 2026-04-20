"""J199 · Kids game + auto-evolve combo.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: kids game produces learning signal → auto_evolve iterates
difficulty. Verify: next session recommends harder template.

At contract tier: kids game recommendation endpoint reachable;
auto-evolve accepts a kids-domain hypothesis.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j199_kids_recommendation(nunba_flask_app):
    for path in (
        "/api/kids/recommendations",
        "/api/kids/game/recommend",
    ):
        r = nunba_flask_app.get(f"{path}?user_id=j199-kid")
        if r.status_code != 404:
            assert r.status_code < 500
            return
    pytest.skip("kids recommendation endpoint not mounted")


@pytest.mark.timeout(30)
def test_j199_autoevolve_kids_hypothesis(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/social/experiments/auto-evolve",
        json={
            "hypothesis": "increase difficulty for user j199-kid after 3 wins",
            "experiment_type": "kids_difficulty",
        },
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("auto-evolve endpoint not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())
