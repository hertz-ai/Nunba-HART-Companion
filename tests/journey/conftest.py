"""Journey-test conftest.

Extends tests/e2e/conftest.py by re-exporting its fixtures so journey
tests can request `nunba_flask_app`, `isolated_nunba_home`,
`llama_mock_server`, `real_piper_engine`, `nunba_subprocess_factory`,
`ephemeral_port`, `piper_voice_path`.

Adds the `mcp_client` fixture which exercises the REAL
`/api/mcp/local/tools/execute` endpoint on the real Flask app. To
avoid depending on the on-disk token file (test runners on CI don't
have `%LOCALAPPDATA%/Nunba/mcp.token` pre-seeded), we set
`HARTOS_MCP_DISABLE_AUTH=1` so the `before_request` gate yields —
this is the documented env bypass for air-gapped / container / test
deployments (mcp_http_bridge.py:236).

Registers the `journey` marker so `pytest -m journey` selects this
suite.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

import pytest

# ── make the e2e fixtures visible in this directory ─────────────────
_HERE = Path(__file__).resolve().parent
_E2E = _HERE.parent / "e2e"
if str(_E2E) not in sys.path:
    sys.path.insert(0, str(_E2E))

# Re-export every fixture from tests/e2e/conftest.py verbatim.  pytest
# collects fixtures from any conftest in the test-path ancestry; by
# importing the e2e conftest module here, pytest sees the symbols via
# this conftest's namespace too.
from conftest import (  # type: ignore  # noqa: E402,F401
    _alloc_port,
    ephemeral_port,
    isolated_nunba_home,
    llama_mock_server,
    nunba_flask_app,
    nunba_subprocess_factory,
    piper_voice_path,
    real_piper_engine,
    wait_for_port,
)


# ── journey marker ─────────────────────────────────────────────────

def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "journey: end-to-end user journey test — drives real Flask / "
        "real MCP / real WAMP",
    )


# ── HARTOS_MCP_DISABLE_AUTH env bypass — session-scoped ─────────────
# We flip the env var BEFORE `nunba_flask_app` imports `main`, so the
# `mcp_local_bp.before_request` hook (mcp_http_bridge.py:236) honors
# it on every subsequent request.


@pytest.fixture(autouse=True, scope="session")
def _enable_mcp_test_bypass():
    """Session-wide env flag so MCP auth gate stays open for journey
    tests.  Restored to prior state at session teardown."""
    prior = os.environ.get("HARTOS_MCP_DISABLE_AUTH")
    os.environ["HARTOS_MCP_DISABLE_AUTH"] = "1"
    yield
    if prior is None:
        os.environ.pop("HARTOS_MCP_DISABLE_AUTH", None)
    else:
        os.environ["HARTOS_MCP_DISABLE_AUTH"] = prior


# ── mcp_client — thin wrapper that POSTs to /api/mcp/local/tools/execute
# using the REAL Flask test-client.  No Python mocks, no bearer
# required (bypass env set above).


class _MCPClient:
    """Minimal MCP client — call(tool_name, **args) → dict.

    Uses the real Flask test_client; requests hit the real blueprint,
    the real tool registry, the real dispatcher.  On errors the raw
    JSON envelope is returned so callers can assert on
    `{success:false, error:...}` payloads too.
    """

    def __init__(self, flask_client):
        self._c = flask_client

    def call(self, tool: str, **arguments: Any) -> dict:
        resp = self._c.post(
            "/api/mcp/local/tools/execute",
            json={"tool": tool, "arguments": arguments},
            headers={"Content-Type": "application/json"},
        )
        body = resp.get_json(silent=True)
        if body is None:
            # Return raw text for debuggability when body is non-JSON
            return {
                "_status": resp.status_code,
                "_raw": resp.get_data(as_text=True)[:500],
            }
        body.setdefault("_status", resp.status_code)
        return body

    def list_tools(self) -> dict:
        resp = self._c.get("/api/mcp/local/tools/list")
        body = resp.get_json(silent=True) or {}
        body.setdefault("_status", resp.status_code)
        return body

    def health(self) -> dict:
        resp = self._c.get("/api/mcp/local/health")
        body = resp.get_json(silent=True) or {}
        body.setdefault("_status", resp.status_code)
        return body


@pytest.fixture
def mcp_client(nunba_flask_app) -> _MCPClient:
    """Real MCP client over the real Flask /api/mcp/local blueprint.

    Usage::

        def test_foo(mcp_client):
            r = mcp_client.call("system_health")
            assert r.get("success") is True
    """
    return _MCPClient(nunba_flask_app)
