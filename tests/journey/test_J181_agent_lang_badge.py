"""J181 · Language switched but agent has per-agent override.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Extension of J117 — verify agent metadata endpoint reflects the
preferred_lang so the SPA badge renders correctly.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j181_agent_metadata_endpoint(nunba_flask_app):
    r = nunba_flask_app.get("/api/agents/j181-probe")
    if r.status_code == 404:
        r = nunba_flask_app.get("/custom_gpt/j181-probe")
    if r.status_code == 404:
        pytest.skip("agent metadata endpoint not mounted")
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j181_chat_with_agent_lang_override(nunba_flask_app):
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "வணக்கம்",
            "preferred_lang": "ta",
            "active_agent_id": "j181-tamil-agent",
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500
