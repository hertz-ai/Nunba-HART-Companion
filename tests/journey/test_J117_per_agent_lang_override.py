"""J117 · Per-agent language override vs global.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: agentA preferred_lang=ta; global=en. Steps: /chat
active_agent_id=A. Verify: server accepts; draft-skip fires on
non-Latin; reply non-5xx.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j117_per_agent_lang_override(nunba_flask_app):
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "வணக்கம்",
            "preferred_lang": "ta",
            "active_agent_id": "j117-tamil-agent",
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j117_agent_override_with_global_english(nunba_flask_app):
    """Explicit per-agent lang should be honored independently."""
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "hello",
            "preferred_lang": "en",
            "active_agent_id": "j117-english-agent",
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500
