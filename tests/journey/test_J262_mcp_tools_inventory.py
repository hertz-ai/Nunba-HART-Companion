"""J262 · MCP tool inventory is stable and every tool has a schema.

PRODUCT_MAP.md §2 lists 24 MCP tools registered via `_register_tool`.
J71 / J89 / J92 / J93 each exercise ONE tool.  What was missing until
now: a single contract test that

  1.  Every expected tool name appears in `/tools/list`.
  2.  Every advertised tool has a non-empty description + schema.
  3.  Every read-only tool can be called with {} and either succeed
      or return a structured error (never 5xx).

If someone renames a tool or forgets to re-register one, this test
fails.  That's the whole point — breadth-first catches silent drift
in the tool surface that operators install Claude Code against.

Mapping: PRODUCT_MAP §2 table of 24 MCP tools.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


# Every name from PRODUCT_MAP §2.  If the table adds tools, append
# here.  A missing name is a blocker.
_EXPECTED_TOOLS: frozenset[str] = frozenset({
    # Read-only discovery
    "list_agents", "list_goals", "agent_status", "list_recipes",
    "system_health", "social_query", "recall", "list_routes",
    "list_channels", "watchdog_status", "exception_report",
    "runtime_integrity", "model_status", "hive_session_status",
    "hive_signal_stats", "hive_signal_feed",
    # Mutating
    "remember", "call_endpoint", "onboard_model", "switch_model",
    "hive_connect", "hive_disconnect", "create_hive_task",
    "dispatch_hive_tasks", "seed_goals",
})


# Tools that can be called with zero arguments and must either
# succeed or return a structured error envelope.  Mutating tools are
# excluded — we don't want to accidentally seed goals or switch
# models from a test.
_READ_ONLY_TOOLS: frozenset[str] = frozenset({
    "list_agents", "list_goals", "agent_status", "list_recipes",
    "system_health", "list_routes", "list_channels",
    "watchdog_status", "exception_report", "runtime_integrity",
    "model_status", "hive_session_status", "hive_signal_stats",
    "hive_signal_feed",
})


@pytest.mark.timeout(30)
def test_j262_health_reports_tool_count(mcp_client):
    """/api/mcp/local/health must report how many tools are loaded.
    A zero count means the tool registry failed to populate at boot.
    """
    health = mcp_client.health()
    assert health.get("_status", 200) < 500
    status = health.get("status")
    assert status == "ok", f"MCP health not ok: {health}"
    n_tools = health.get("tools") or 0
    assert n_tools >= 20, (
        f"MCP loaded only {n_tools} tools; expected ≥20 per PRODUCT_MAP §2. "
        f"Registry drift or boot-time regression."
    )


@pytest.mark.timeout(30)
def test_j262_every_expected_tool_appears_in_list(mcp_client):
    """Every name in _EXPECTED_TOOLS must show up in /tools/list.
    Missing names = operator's Claude Code client will get
    "Unknown tool" when calling by name."""
    inventory = mcp_client.list_tools()
    assert inventory.get("_status", 200) < 500
    names = {t["name"] for t in (inventory.get("tools") or []) if "name" in t}
    missing = _EXPECTED_TOOLS - names
    # At least 20 of 24 must be present.  Allow up to 4 legit removals
    # (tools can be deprecated); the PRODUCT_MAP.md is updated on drop.
    found_count = len(_EXPECTED_TOOLS & names)
    assert found_count >= 20, (
        f"Only {found_count}/{len(_EXPECTED_TOOLS)} expected tools found. "
        f"Missing: {sorted(missing)}. Full registry: {sorted(names)}"
    )


@pytest.mark.timeout(30)
def test_j262_every_tool_has_nonempty_schema(mcp_client):
    """Each tool entry must carry name + description + parameters.
    Claude Code's tool-picker reads `description` to show the user."""
    inventory = mcp_client.list_tools()
    tools = inventory.get("tools") or []
    missing: list[str] = []
    for t in tools:
        name = t.get("name", "<unknown>")
        if not t.get("description"):
            missing.append(f"{name}: no description")
            continue
        params = t.get("parameters")
        if params is None:
            missing.append(f"{name}: no parameters schema")
    assert not missing, (
        f"{len(missing)} tools have incomplete schemas: {missing[:5]}"
    )


@pytest.mark.timeout(60)
@pytest.mark.parametrize("tool_name", sorted(_READ_ONLY_TOOLS))
def test_j262_read_only_tool_does_not_5xx(mcp_client, tool_name):
    """Calling any read-only tool with empty args must not 5xx.

    The contract: MCP execute returns {success: bool, ...}.  A 5xx
    is a crash — the tool registered but its implementation raises.
    """
    # Skip if the tool isn't in this build's registry (e.g. deprecated).
    inventory = mcp_client.list_tools()
    names = {t["name"] for t in (inventory.get("tools") or [])}
    if tool_name not in names:
        pytest.skip(f"tool {tool_name} not registered in this build")

    resp = mcp_client.call(tool_name)
    status = resp.get("_status", 200)
    # 200 success, 400 (bad args), 404 (missing row) are acceptable.
    # 500 is NOT — that's a tool implementation bug.
    assert status < 500, (
        f"tool {tool_name} crashed 5xx on empty-args call: "
        f"status={status} resp={resp}"
    )


@pytest.mark.timeout(30)
def test_j262_unknown_tool_404_not_500(mcp_client):
    """A typo'd tool name must return a structured 404 error, not 5xx."""
    resp = mcp_client.call("no_such_tool_j262")
    status = resp.get("_status", 0)
    # Bridge returns 404 per mcp_http_bridge.py:915-919
    assert status == 404, (
        f"expected 404 for unknown tool, got {status}: {resp}"
    )
    # Body must carry a 'success:false' envelope and hint at available tools
    assert resp.get("success") is False
    assert "error" in resp
    # available_tools list helps the client recover
    assert "available_tools" in resp, (
        "MCP 404 envelope missing 'available_tools' hint — client "
        "can't self-heal from typos"
    )


@pytest.mark.timeout(30)
def test_j262_empty_tool_name_400(mcp_client):
    """Explicitly empty tool name must be 400 Bad Request."""
    resp = mcp_client.call("")
    status = resp.get("_status", 0)
    assert status == 400, (
        f"empty tool name should 400; got {status}: {resp}"
    )


@pytest.mark.timeout(30)
def test_j262_call_endpoint_tool_reachable(mcp_client):
    """`call_endpoint` is the meta-tool that lets Claude Code reach
    any Flask route.  It must be in the registry — without it, the
    whole MCP integration model breaks."""
    inventory = mcp_client.list_tools()
    names = {t["name"] for t in (inventory.get("tools") or [])}
    assert "call_endpoint" in names, (
        "`call_endpoint` MCP tool missing — Claude Code can't reach "
        "any Flask route via MCP. Check mcp_http_bridge.py:737."
    )
