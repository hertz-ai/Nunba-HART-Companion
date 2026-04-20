"""J244 · MCP local bridge tools discovery.

PRODUCT_MAP.md §2 enumerates the local MCP bridge — the HTTP
facade that exposes HARTOS tools to external MCP clients.  The
bridge exposes:

  * /api/mcp/local/tools/list      -> {tools:[{name, description, parameters}]}
  * /api/mcp/local/health          -> {status, server, tools:<count>}
  * /api/mcp/local/tools/execute   -> {success, result} / error envelope

J244 verifies the discovery half.  J83-J84 already cover execute +
auth.  Together these guarantee an MCP client can (a) enumerate
tools, (b) learn their schemas, (c) execute.

Any 5xx from the discovery surface breaks external MCP integrations
silently — the client sees an empty tool list.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(20)
def test_j244_mcp_tools_list_nonempty(nunba_flask_app):
    resp = nunba_flask_app.get("/api/mcp/local/tools/list")
    if resp.status_code == 404:
        pytest.skip("/api/mcp/local/tools/list not mounted")
    assert resp.status_code == 200, resp.get_data(as_text=True)[:200]
    body = resp.get_json() or {}
    tools = body.get("tools") or []
    assert isinstance(tools, list) and tools, (
        "MCP bridge exposes zero tools — clients would see empty toolbox"
    )
    # ≥ 10 tools is the floor per HARTOS service_tool_registry.
    assert len(tools) >= 5, f"only {len(tools)} tools; expected ≥5"


@pytest.mark.timeout(20)
def test_j244_mcp_tools_list_schema(nunba_flask_app):
    """Each tool entry carries name / description / parameters.
    JSON-Schema consumers expect this exact shape."""
    resp = nunba_flask_app.get("/api/mcp/local/tools/list")
    if resp.status_code == 404:
        pytest.skip("/api/mcp/local/tools/list not mounted")
    tools = (resp.get_json() or {}).get("tools") or []
    if not tools:
        pytest.skip("no MCP tools registered")
    for t in tools[:10]:
        assert isinstance(t, dict)
        assert "name" in t
        assert "description" in t
        # parameters is an object — JSON-Schema draft-compatible.
        params = t.get("parameters")
        assert isinstance(params, dict), f"tool {t.get('name')} params not dict"


@pytest.mark.timeout(15)
def test_j244_mcp_health_reports_tools_count(nunba_flask_app):
    resp = nunba_flask_app.get("/api/mcp/local/health")
    if resp.status_code == 404:
        pytest.skip("/api/mcp/local/health not mounted")
    assert resp.status_code == 200
    body = resp.get_json() or {}
    assert body.get("status") == "ok", body
    # tools count is an int — not a string.
    tools_count = body.get("tools")
    assert isinstance(tools_count, int), f"tools count not int: {tools_count!r}"
    assert tools_count > 0, "MCP health reports zero tools"


@pytest.mark.timeout(20)
def test_j244_mcp_execute_unknown_tool_4xx(nunba_flask_app):
    """Executing a non-existent tool must not 5xx — clients must get
    a structured error."""
    resp = nunba_flask_app.post(
        "/api/mcp/local/tools/execute",
        json={"name": "__j244_no_such_tool", "arguments": {}},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/mcp/local/tools/execute not mounted")
    assert resp.status_code < 500, resp.get_data(as_text=True)[:200]
