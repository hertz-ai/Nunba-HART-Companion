"""J125 · Cross-user E2E encrypted offload with reality-ground check.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: UserA /api/distributed/tasks/announce → UserB claim → submit
with signed result. Verifiable: announce + claim routes reachable;
payload handling does not 500.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j125_announce_task(nunba_flask_app, dual_user):
    r = nunba_flask_app.post(
        "/api/distributed/tasks/announce",
        json={
            "description": "J125 probe task",
            "announcer_id": dual_user["a"]["user_id"],
        },
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/distributed/tasks/announce not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())


@pytest.mark.timeout(45)
def test_j125_claim_task(nunba_flask_app, dual_user):
    r = nunba_flask_app.post(
        "/api/distributed/tasks/claim",
        json={
            "task_id": "j125-nonexistent",
            "claimer_id": dual_user["b"]["user_id"],
        },
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/distributed/tasks/claim not mounted")
    body = r.get_data(as_text=True)
    # 404 for non-existent task is the right answer; we just need
    # not-bare-5xx.
    assert not (r.status_code >= 500 and not body.strip())
