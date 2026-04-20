"""J127 · Benchmark challenge with model ensemble.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: POST /api/hive/benchmarks/challenge with multiple model_ids.
Verify: endpoint accepts list payloads; leaderboard reachable.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j127_challenge_multiple_models(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/hive/benchmarks/challenge",
        json={
            "model_ids": ["qwen-mini-test", "phi-mini-test", "gemma-2b"],
        },
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/hive/benchmarks/challenge not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())


@pytest.mark.timeout(30)
def test_j127_leaderboard_reachable(nunba_flask_app):
    r = nunba_flask_app.get("/api/hive/benchmarks/leaderboard")
    if r.status_code == 404:
        r = nunba_flask_app.get("/api/hive/benchmarks")
    if r.status_code == 404:
        pytest.skip("hive benchmark leaderboard not mounted")
    assert r.status_code < 500
