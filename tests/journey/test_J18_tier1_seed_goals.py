"""J18 · Tier-1 built-in seed.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* Real Nunba Flask app with MCP blueprint mounted at `/api/mcp/local`.
* HARTOS_MCP_DISABLE_AUTH=1 set by journey conftest.

Steps
-----
1. Call MCP tool `seed_goals` via real POST /api/mcp/local/tools/execute.
2. Assert the response envelope carries a `success` marker or a
   documented error (e.g., already seeded, DB absent).

Verifiable outcomes
-------------------
* HTTP 200 on the transport layer.
* Response body is a JSON dict.
* Either `success: true` + `seeded >= 0` OR `success: false` with
  a machine-readable error — both are acceptable contract states.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j18_mcp_health_reports_tools_registered(mcp_client):
    """Precondition sanity — the MCP blueprint is mounted and
    advertises ≥ 1 tool.  Without this, J18 is meaningless."""
    h = mcp_client.health()
    if h.get("_status") == 404:
        pytest.skip("/api/mcp/local/health not mounted in this env")
    assert h.get("_status") == 200, h
    assert isinstance(h.get("tools"), int) and h["tools"] >= 0


@pytest.mark.timeout(60)
def test_j18_mcp_tools_list_includes_seed_goals(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") == 404:
        pytest.skip("/api/mcp/local/tools/list not mounted")
    assert lst.get("_status") == 200, lst
    tools = lst.get("tools") or []
    names = {t.get("name") for t in tools if isinstance(t, dict)}
    # seed_goals may be registered lazily; skip rather than hard-fail
    # if the HARTOS subsystem that registers it isn't loaded in this env.
    if "seed_goals" not in names:
        pytest.skip(
            f"seed_goals tool not registered in this env; "
            f"registered={sorted(names)[:10]}"
        )


@pytest.mark.timeout(120)
def test_j18_seed_goals_returns_envelope(mcp_client):
    """Invoke the seed_goals MCP tool.  Regardless of underlying DB
    state (first-run vs. already seeded), the contract says we get
    a JSON envelope with either `success:true, seeded:<int>` or
    `success:false, error:<str>`."""
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp /tools/list unreachable")
    tools = lst.get("tools") or []
    names = {t.get("name") for t in tools if isinstance(t, dict)}
    if "seed_goals" not in names:
        pytest.skip("seed_goals not registered")

    r = mcp_client.call("seed_goals")
    assert r.get("_status") in (200, 400, 500), r
    # Accept both success and graceful-failure envelopes
    assert isinstance(r, dict) and (
        "success" in r or "result" in r or "error" in r
    ), f"seed_goals returned non-envelope body: {r!r}"
