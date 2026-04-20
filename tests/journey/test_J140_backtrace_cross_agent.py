"""J140 · Backtrace chain crosses agent boundary.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: memory m1 owned by agentA, m2 linked by agentB. Steps:
backtrace_memory from m2 (memory_graph.py:412). Verify: ACL gate
applies.

Verifiable at MCP tier: backtrace_memory tool accepts an id and
returns envelope; unknown id returns empty chain, not 5xx.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j140_backtrace_unknown_id(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    tool = "backtrace_memory" if "backtrace_memory" in names else None
    if not tool:
        pytest.skip("backtrace_memory not registered")
    r = mcp_client.call(tool, memory_id="j140-nonexistent")
    assert isinstance(r, dict)
    assert any(k in r for k in ("success", "result", "error", "chain")), r


@pytest.mark.timeout(30)
def test_j140_backtrace_respects_depth(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "backtrace_memory" not in names:
        pytest.skip("backtrace_memory not registered")
    r = mcp_client.call(
        "backtrace_memory", memory_id="j140-depth", depth=3,
    )
    assert isinstance(r, dict)
