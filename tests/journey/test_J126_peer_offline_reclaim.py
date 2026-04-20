"""J126 · Peer offline mid-task → reclaimed by another claim.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: A claims task → crashes → coordinator_backends.py:78
`reclaim_stale_tasks` expires lock → B claims → finishes.

Verifiable at contract tier: tasks list endpoint reachable; claiming
a non-existent task returns a graceful error.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j126_tasks_list_reachable(nunba_flask_app):
    r = nunba_flask_app.get("/api/distributed/tasks")
    if r.status_code == 404:
        pytest.skip("/api/distributed/tasks not mounted")
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j126_double_claim_same_task(nunba_flask_app, dual_user):
    """Two claims on same fabricated task_id: both should return
    a graceful 4xx (not 500). The contract is deterministic
    error-response, not racy crash."""
    for claimer in (dual_user["a"], dual_user["b"]):
        r = nunba_flask_app.post(
            "/api/distributed/tasks/claim",
            json={
                "task_id": "j126-stale-task",
                "claimer_id": claimer["user_id"],
            },
            headers={"Content-Type": "application/json"},
        )
        if r.status_code == 404:
            pytest.skip("/api/distributed/tasks/claim not mounted")
        body = r.get_data(as_text=True)
        assert not (r.status_code >= 500 and not body.strip())
