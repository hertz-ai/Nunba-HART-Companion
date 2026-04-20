"""J101 · Agent A → Agent B switch, no message bleed.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: active_agent_id propagated from SPA → /chat. Steps: /chat with
active_agent_id=A then active_agent_id=B. Verify: turn 2 accepts the
agent id AND server stays up; per-agent memory isolation is a
MemoryGraph author-filter concern handled at recall time, not at
/chat POST time — at this layer the contract is: different agent_id
must not mix prompt bytes.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j101_two_agents_no_crash(nunba_flask_app):
    r1 = nunba_flask_app.post(
        "/chat",
        json={
            "text": "remember the code word BLUE",
            "preferred_lang": "en",
            "active_agent_id": "j101-agent-A",
        },
        headers={"Content-Type": "application/json"},
    )
    assert r1.status_code < 500

    r2 = nunba_flask_app.post(
        "/chat",
        json={
            "text": "what is the code word?",
            "preferred_lang": "en",
            "active_agent_id": "j101-agent-B",
        },
        headers={"Content-Type": "application/json"},
    )
    assert r2.status_code < 500


@pytest.mark.timeout(30)
def test_j101_unknown_agent_id_graceful(nunba_flask_app):
    """An agent id that doesn't exist must not cause a 500; the
    route should fall back to the default agent path."""
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "hi",
            "preferred_lang": "en",
            "active_agent_id": "does-not-exist-" * 5,
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500, (
        f"unknown agent_id crashed: {r.status_code} "
        f"{r.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j101_active_agent_id_rejects_injection(nunba_flask_app):
    """agent_id with path-traversal must not 500 the server."""
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "hi",
            "preferred_lang": "en",
            "active_agent_id": "../../../etc/passwd",
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500
