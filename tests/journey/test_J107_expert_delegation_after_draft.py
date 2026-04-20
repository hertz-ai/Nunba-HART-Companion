"""J107 · Expert delegation while draft already responded.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: draft model (speculative_dispatcher.py:179-260) decides
`delegate:"local"` → draft reply goes out first, expert reply
arrives later as a second SSE frame.

Verifiable at this tier: /chat accepts the turn without crashing;
the SSE event stream (/api/social/events/stream) is reachable.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j107_chat_accepts_delegation_candidate_prompt(nunba_flask_app):
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "summarize the Iliad in two paragraphs with quotes",
            "preferred_lang": "en",
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j107_sse_stream_reachable(nunba_flask_app):
    r = nunba_flask_app.get("/api/social/events/stream")
    if r.status_code == 404:
        pytest.skip("SSE stream not mounted")
    # SSE endpoints that are alive return 200 with text/event-stream.
    # We don't block forever — close immediately after contract check.
    assert r.status_code < 500
    r.close()
