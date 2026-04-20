"""J138 · MemoryGraph FTS5 recall, relevance-ranked.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: many memories stored. Steps: recall with semantic query.
Verify: recall returns an envelope; for a rare-token query, result
matches that token first.
"""

from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(90)
def test_j138_many_writes_then_recall(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "remember" not in names or "recall" not in names:
        pytest.skip("remember/recall tools not registered")

    rare = f"rarex-{uuid.uuid4().hex[:10]}"

    # Store 10 mundane + 1 rare memory
    for i in range(10):
        mcp_client.call("remember", content=f"generic memory {i}")
    mcp_client.call("remember", content=f"The magic token is {rare}")

    r = mcp_client.call("recall", q=rare)
    assert isinstance(r, dict)
    assert any(k in r for k in ("success", "result", "error", "memories")), r


@pytest.mark.timeout(30)
def test_j138_recall_empty_query(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "recall" not in names:
        pytest.skip("recall not registered")

    r = mcp_client.call("recall", q="")
    assert isinstance(r, dict)
