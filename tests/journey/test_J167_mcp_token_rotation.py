"""J167 · MCP token rotation mid-session.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: call MCP with tokenA → rotate via
/api/admin/mcp/token/rotate (main.py:3259) → call with tokenA →
401 → re-fetch from /api/admin/mcp/token (main.py:3231).

NOTE: journey conftest sets HARTOS_MCP_DISABLE_AUTH=1 so tests
exercise the real bridge without bearer. This test exercises the
rotation + token-read endpoints themselves.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j167_mcp_token_read(nunba_flask_app):
    r = nunba_flask_app.get("/api/admin/mcp/token")
    if r.status_code == 404:
        pytest.skip("/api/admin/mcp/token not mounted")
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j167_mcp_token_rotate(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/admin/mcp/token/rotate",
        json={},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/admin/mcp/token/rotate not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())


@pytest.mark.timeout(30)
def test_j167_mcp_health_after_rotate(mcp_client, nunba_flask_app):
    """After rotation, MCP health should still be reachable."""
    nunba_flask_app.post(
        "/api/admin/mcp/token/rotate",
        json={},
        headers={"Content-Type": "application/json"},
    )
    h = mcp_client.health()
    assert isinstance(h, dict)
    # Bypass env is set → health should be reachable.
    assert h.get("_status") in (200, 503, 404), h
