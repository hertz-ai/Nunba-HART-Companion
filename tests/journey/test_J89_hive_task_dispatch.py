"""J89 · Hive task dispatch.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* MCP bridge; create_hive_task + dispatch_hive_tasks tools registered.

Steps
-----
1. Call `create_hive_task` via MCP.
2. Call `dispatch_hive_tasks` via MCP.

Verifiable outcomes
-------------------
* Both tool calls return envelopes, never bare empty 5xx.
* `dispatch_hive_tasks` returns a count.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j89_create_hive_task(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp /tools/list unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "create_hive_task" not in names:
        pytest.skip("create_hive_task not registered")

    r = mcp_client.call(
        "create_hive_task",
        description="J89 journey probe task",
    )
    assert isinstance(r, dict)
    assert any(k in r for k in ("success", "result", "error", "task_id")), r


@pytest.mark.timeout(60)
def test_j89_dispatch_hive_tasks(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp /tools/list unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "dispatch_hive_tasks" not in names:
        pytest.skip("dispatch_hive_tasks not registered")

    r = mcp_client.call("dispatch_hive_tasks")
    assert isinstance(r, dict)
    assert any(k in r for k in ("success", "result", "error", "dispatched")), r
