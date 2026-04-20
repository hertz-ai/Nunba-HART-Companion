"""J111 · Mid-session agent prompt edit.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: edit agent's agent_prompt via /custom_gpt PUT
(chatbot_routes.py) → next turn should pick up new prompt.

Verifiable: PUT returns a non-5xx envelope; subsequent /chat with
same active_agent_id is accepted.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j111_custom_gpt_reachable(nunba_flask_app):
    r = nunba_flask_app.get("/custom_gpt")
    if r.status_code == 404:
        pytest.skip("/custom_gpt not mounted")
    # 401/403 for unauth'd is acceptable; the contract is "not 500".
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j111_custom_gpt_put_agent(nunba_flask_app):
    r = nunba_flask_app.put(
        "/custom_gpt",
        json={
            "agent_id": "j111-probe",
            "agent_prompt": "You are a terse assistant.",
        },
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/custom_gpt PUT not mounted")
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j111_chat_after_prompt_edit(nunba_flask_app):
    nunba_flask_app.put(
        "/custom_gpt",
        json={
            "agent_id": "j111-probe",
            "agent_prompt": "You are a terse assistant.",
        },
        headers={"Content-Type": "application/json"},
    )
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "hi",
            "preferred_lang": "en",
            "active_agent_id": "j111-probe",
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500
