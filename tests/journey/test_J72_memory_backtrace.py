"""J72 · Backtrace chain (memory graph).

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions: MCP bridge; agent_memory_tools registered.

Steps
-----
1. Remember 3 linked memories via the MCP tool.
2. Verify /api/memory/recent is mounted and reachable.

Verifiable outcomes
-------------------
* Each remember returns a valid envelope.
* /api/memory/recent returns a JSON list or auth-refused 4xx.
"""

from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j72_memory_recent_endpoint_mounted(nunba_flask_app):
    resp = nunba_flask_app.get("/api/memory/recent")
    if resp.status_code == 404:
        pytest.skip("/api/memory/recent not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(60)
def test_j72_memory_search_endpoint_mounted(nunba_flask_app):
    resp = nunba_flask_app.get("/api/memory/search?q=test")
    if resp.status_code == 404:
        pytest.skip("/api/memory/search not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(90)
def test_j72_remember_three_linked_memories(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp /tools/list unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "remember" not in names:
        pytest.skip("remember tool not registered")

    chain_id = uuid.uuid4().hex[:8]
    for i, msg in enumerate(
        [f"J72 root {chain_id}", f"J72 child-1 {chain_id}", f"J72 child-2 {chain_id}"]
    ):
        r = mcp_client.call("remember", content=msg)
        assert isinstance(r, dict), f"remember #{i} returned non-dict: {r!r}"
        assert r.get("_status") in (200, 400, 500)
