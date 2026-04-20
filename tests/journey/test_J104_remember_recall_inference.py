"""J104 · Tool call chain: remember → recall → inference uses it.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: MCP `remember` stores a fact → `recall` queries → /chat asks
a question that should surface the fact via memory_context.

Verifiable: all three calls are envelopes (no bare 5xx). If memory
layer is absent in this env, each call returns a consistent graceful
error. The /chat response accepts the question without crashing.
"""

from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j104_remember_then_recall_then_chat(mcp_client, nunba_flask_app):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp /tools/list unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "remember" not in names or "recall" not in names:
        pytest.skip("remember/recall tools not registered")

    tok = f"J104-{uuid.uuid4().hex[:8]}"
    fact = f"My dog's name is {tok}"

    r1 = mcp_client.call("remember", content=fact)
    assert isinstance(r1, dict)
    assert any(k in r1 for k in ("success", "result", "error")), r1

    r2 = mcp_client.call("recall", q=tok)
    assert isinstance(r2, dict)
    assert any(k in r2 for k in ("success", "result", "error", "memories")), r2

    r3 = nunba_flask_app.post(
        "/chat",
        json={"text": "what is my dog's name?", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r3.status_code < 500


@pytest.mark.timeout(60)
def test_j104_recall_unknown_token_returns_envelope(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "recall" not in names:
        pytest.skip("recall not registered")

    r = mcp_client.call("recall", q=f"nonexistent-fact-{uuid.uuid4().hex}")
    assert isinstance(r, dict)
    assert any(k in r for k in ("success", "result", "error", "memories")), r
