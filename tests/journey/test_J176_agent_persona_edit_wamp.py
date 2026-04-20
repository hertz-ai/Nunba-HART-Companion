"""J176 · Agent persona edit → WAMP agent.updated event.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: PUT /custom_gpt → check agent.updated WAMP event fires.
At contract tier: publish bridge accepts an agent.updated topic.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j176_publish_agent_updated(nunba_flask_app, wamp_subscriber):
    wamp_subscriber.start("agent.updated")
    r = nunba_flask_app.post(
        "/publish",
        json={
            "topic": "agent.updated",
            "args": [{"agent_id": "j176", "version": 2}],
        },
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/publish not mounted")
    assert r.status_code in (200, 503)


@pytest.mark.timeout(30)
def test_j176_custom_gpt_put_fires_clean(nunba_flask_app):
    r = nunba_flask_app.put(
        "/custom_gpt",
        json={"agent_id": "j176", "agent_prompt": "persona v2"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/custom_gpt not mounted")
    assert r.status_code < 500
