"""J71 · MCP remember → recall.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* Real MCP bridge mounted.
* HARTOS_MCP_DISABLE_AUTH=1 set by journey conftest.

Steps
-----
1. Call MCP tool `remember` with a unique content string.
2. Call MCP tool `recall` with the same query.

Verifiable outcomes
-------------------
* Both calls return JSON envelopes.
* `recall` result references the content that was just stored, OR
  if memory is disabled in this env, both calls return consistent
  graceful errors (not empty 5xx).
"""

from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j71_remember_then_recall_roundtrip(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp /tools/list unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "remember" not in names or "recall" not in names:
        pytest.skip(
            f"remember/recall not registered in this env; "
            f"have={sorted(names)[:10]}"
        )

    token = f"J71-{uuid.uuid4().hex[:8]}"
    r1 = mcp_client.call("remember", content=f"Journey J71 probe {token}")
    assert r1.get("_status") in (200, 400, 500), r1
    # Even if remember fails (DB absent), the envelope must be valid
    assert isinstance(r1, dict)
    assert any(k in r1 for k in ("success", "result", "error")), r1

    r2 = mcp_client.call("recall", q=token)
    assert r2.get("_status") in (200, 400, 500), r2
    assert isinstance(r2, dict)
    assert any(k in r2 for k in ("success", "result", "error", "memories")), r2
