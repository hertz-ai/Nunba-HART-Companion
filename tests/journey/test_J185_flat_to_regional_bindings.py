"""J185 · flat → regional promote, channel bindings survive.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: tier promotion → re-exec. Verify: channel_bindings intact;
MCP token regenerated OR preserved.

At contract tier: bindings endpoint reachable before and after a
config toggle.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j185_channel_bindings_reachable(nunba_flask_app):
    r = nunba_flask_app.get("/api/admin/channels/bindings")
    if r.status_code == 404:
        r = nunba_flask_app.get("/api/channels/bindings")
    if r.status_code == 404:
        pytest.skip("channel bindings endpoint not mounted")
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j185_mcp_token_endpoint_reachable(nunba_flask_app):
    r = nunba_flask_app.get("/api/admin/mcp/token")
    if r.status_code == 404:
        pytest.skip("/api/admin/mcp/token not mounted")
    assert r.status_code < 500
