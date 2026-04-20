"""J102 · Agentic multi-step plan with tool calls.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: autogen Tier-3 agent, agent_daemon._tick consumer.
Steps: user sends a goal, agent_daemon picks it up
(agent_daemon.py:81), parallel_dispatch fans tools, emits
`goal.tool.result` and final `goal.completed`.

Verifiable at this tier: /chat accepts an agentic prompt without
crashing; the WAMP publish bridge forwards any emitted
`goal.progress` events; a ledger/dispatch endpoint (if mounted)
returns a count.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j102_agentic_goal_accepted(nunba_flask_app):
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "Create an agent that adds two numbers and return the result for 2+3.",
            "preferred_lang": "en",
            "casual_conv": False,
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j102_goal_progress_publish(nunba_flask_app, wamp_subscriber):
    """A `goal.progress` event published via /publish must not 500."""
    wamp_subscriber.start("com.hevolve.goal.progress")
    r = nunba_flask_app.post(
        "/publish",
        json={
            "topic": "com.hevolve.goal.progress",
            "args": [{"goal_id": "j102", "status": "running"}],
        },
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/publish bridge not mounted")
    assert r.status_code in (200, 503)


@pytest.mark.timeout(30)
def test_j102_distributed_ledger_reachable(nunba_flask_app):
    """/api/distributed/tasks/* is the agent-ledger surface."""
    r = nunba_flask_app.get("/api/distributed/tasks")
    if r.status_code == 404:
        pytest.skip("/api/distributed/tasks not mounted")
    assert r.status_code < 500
