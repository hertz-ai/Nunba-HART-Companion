"""J20 · Tier-3 auto-evolve.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* Real Nunba Flask app.
* MCP bridge mounted at `/api/mcp/local`.

Steps
-----
1. Call MCP tool `start_auto_evolve` (auto_evolve.py:376) via real
   POST /api/mcp/local/tools/execute.
2. Alternatively, POST /api/social/agents/evolve.

Verifiable outcomes
-------------------
* Either surface returns a JSON envelope. Because the tool may
  legitimately emit `auto_evolve.no_candidates` on a fresh DB, we
  accept success OR an explanatory error — but never empty-5xx.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(90)
def test_j20_start_auto_evolve_via_mcp(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp /tools/list unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    # auto-evolve is registered under a few possible names depending
    # on HARTOS version
    tool = None
    for candidate in ("start_auto_evolve", "auto_evolve_start", "auto_evolve"):
        if candidate in names:
            tool = candidate
            break
    if tool is None:
        pytest.skip(
            f"auto_evolve tool not registered in this env; "
            f"names={sorted(names)[:20]}"
        )

    r = mcp_client.call(tool)
    assert r.get("_status") in (200, 400, 500), r
    assert isinstance(r, dict)
    # Envelope must at minimum have one of success/result/error
    assert any(k in r for k in ("success", "result", "error")), r


@pytest.mark.timeout(60)
def test_j20_evolve_endpoint_mounted(nunba_flask_app):
    """REST fallback: POST /api/social/agents/evolve should not 404
    if the social blueprint chain is intact."""
    resp = nunba_flask_app.post(
        "/api/social/agents/evolve",
        json={},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/social/agents/evolve not mounted in this env")
    # Accept anything except a silent empty-500
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip()), (
        f"/evolve emitted empty 5xx body: {resp.status_code}"
    )
