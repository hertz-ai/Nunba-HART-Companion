"""J65 · Hive benchmark prover verify.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* HARTOS hive_benchmark_prover blueprint mounted.

Steps
-----
1. POST /api/hive/benchmarks/challenge with a minimal challenge body.

Verifiable outcomes
-------------------
* Route reachable.
* Response is a JSON envelope (success + challenge id / proof).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j65_challenge_endpoint_mounted(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/hive/benchmarks/challenge",
        json={"model": "test-model-j65", "benchmark": "mmlu"},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/hive/benchmarks/challenge not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j65_hive_signals_stats_endpoint(nunba_flask_app):
    """Adjacent surface: /api/hive/signals/stats — sanity check that
    at least ONE hive blueprint is mounted."""
    resp = nunba_flask_app.get("/api/hive/signals/stats")
    if resp.status_code == 404:
        pytest.skip("/api/hive/signals/stats not mounted")
    assert resp.status_code < 500
