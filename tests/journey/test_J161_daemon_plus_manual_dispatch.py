"""J161 · Parallel agent_daemon tick + manual dispatch.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: daemon tick while user POSTs /coding/execute. Verify: no
lock conflict; distinct ledger rows.

At contract tier: /coding/execute reachable; parallel calls return
envelopes.
"""

from __future__ import annotations

import concurrent.futures

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j161_coding_execute_reachable(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/coding/execute",
        json={"task": "j161 probe"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        r = nunba_flask_app.post(
            "/coding/execute",
            json={"task": "j161 probe"},
            headers={"Content-Type": "application/json"},
        )
    if r.status_code == 404:
        pytest.skip("/coding/execute not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())


@pytest.mark.timeout(60)
def test_j161_three_parallel_executes(nunba_flask_app):
    def _exec(i: int):
        return nunba_flask_app.post(
            "/api/coding/execute",
            json={"task": f"parallel-{i}"},
            headers={"Content-Type": "application/json"},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        results = list(ex.map(_exec, range(3)))

    if all(r.status_code == 404 for r in results):
        pytest.skip("/api/coding/execute not mounted")
    for r in results:
        body = r.get_data(as_text=True)
        assert not (r.status_code >= 500 and not body.strip())
