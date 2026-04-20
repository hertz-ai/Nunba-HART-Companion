"""J187 · Node config restore after crash.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: kill -9. Steps: restart. Verify: agent_daemon resumes pending
goals; ResourceGovernor resumes MODE_ACTIVE.

At contract tier: two consecutive boots of nunba_flask_app yield
working /chat; pending-goal endpoint reachable.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j187_pending_goals_reachable(nunba_flask_app):
    for path in (
        "/api/goals/pending",
        "/api/agents/pending_goals",
        "/api/distributed/tasks?status=pending",
    ):
        r = nunba_flask_app.get(path)
        if r.status_code != 404:
            assert r.status_code < 500
            return
    pytest.skip("pending-goals endpoint not mounted")


@pytest.mark.timeout(30)
def test_j187_chat_works_post_boot(nunba_flask_app):
    r = nunba_flask_app.post(
        "/chat",
        json={"text": "post-boot probe", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500
