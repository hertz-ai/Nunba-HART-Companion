"""J109 · Visual context + chat combo.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: webcam WS (port 5459) → 3-frame deque populated → /chat asks
visual question; parse_visual_context reads Redis frame and POSTs
to MiniCPM.

CI notes: the real 5459 WS and MiniCPM sidecar are not available on
the test runner. What we CAN verify: /chat route accepts a prompt
that triggers visual-context tool selection without 5xx; the
parse_visual_context tool endpoint (if MCP-registered) returns an
envelope.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j109_chat_with_visual_question(nunba_flask_app):
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "what do you see in the camera?",
            "preferred_lang": "en",
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j109_parse_visual_context_tool_envelope(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "parse_visual_context" not in names:
        pytest.skip("parse_visual_context tool not registered")
    r = mcp_client.call("parse_visual_context")
    assert isinstance(r, dict)
    assert any(k in r for k in ("success", "result", "error")), r
