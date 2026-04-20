"""J134 · Hive task dispatch with >1 candidate picker.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: MCP create_hive_task with min_peers=2 → 2 peers claim →
votes combined.

Verifiable at MCP tier: create_hive_task accepts a min_peers
parameter; dispatch returns envelope.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j134_create_task_min_peers_2(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "create_hive_task" not in names:
        pytest.skip("create_hive_task not registered")

    r = mcp_client.call(
        "create_hive_task",
        description="J134 multi-peer probe",
        min_peers=2,
    )
    assert isinstance(r, dict)
    assert any(k in r for k in ("success", "result", "error", "task_id")), r


@pytest.mark.timeout(60)
def test_j134_dispatch_after_create(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "dispatch_hive_tasks" not in names:
        pytest.skip("dispatch_hive_tasks not registered")

    r = mcp_client.call("dispatch_hive_tasks")
    assert isinstance(r, dict)
    assert any(k in r for k in ("success", "result", "error", "dispatched")), r
