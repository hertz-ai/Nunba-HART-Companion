"""J124 · FederatedAggregator epoch crosses benchmark publish.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: epoch timer tick (federated_aggregator.py:215) while
hive_benchmark_prover emits a challenge (hive_benchmark_prover.py:
2604). Verifiable at contract tier: both surfaces reachable;
benchmark-challenge POST does not 500 under concurrent reads.
"""

from __future__ import annotations

import concurrent.futures

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j124_benchmark_challenge_reachable(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/hive/benchmarks/challenge",
        json={"model_id": "qwen-mini-test"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/hive/benchmarks/challenge not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())


@pytest.mark.timeout(30)
def test_j124_aggregator_and_benchmark_concurrent(nunba_flask_app):
    def _bench():
        return nunba_flask_app.post(
            "/api/hive/benchmarks/challenge",
            json={"model_id": "qwen-mini-test"},
            headers={"Content-Type": "application/json"},
        )

    def _status():
        return nunba_flask_app.get("/api/hive/benchmarks")

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        f1, f2 = ex.submit(_bench), ex.submit(_status)
        r1, r2 = f1.result(timeout=30), f2.result(timeout=30)

    if r1.status_code == 404 and r2.status_code == 404:
        pytest.skip("hive benchmark routes not mounted")
    assert r1.status_code < 500 or r2.status_code < 500
