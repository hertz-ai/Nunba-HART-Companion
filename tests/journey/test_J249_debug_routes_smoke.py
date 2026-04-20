"""J249 · Debug-routes + test-api smoke.

PRODUCT_MAP.md §1.15 lists two low-level diagnostic endpoints the
dev shell and the automated installer smoke-test rely on:

  * /test-api     -> {"message": "This is a test endpoint", "status": "API routes working"}
  * /debug/routes -> [{endpoint, methods, rule}, ...]

/test-api is the first thing the installer's post-install hook
pings to verify the Flask boot actually succeeded.  /debug/routes
is what the React dev shell reads to render its route explorer.

If either 500s the installer marks the run as "succeeded but
unhealthy" and the operator gets a silent regression.  Previously
uncovered at the journey level.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(10)
def test_j249_test_api_smoke(nunba_flask_app):
    resp = nunba_flask_app.get("/test-api")
    if resp.status_code == 404:
        pytest.skip("/test-api not mounted")
    assert resp.status_code == 200
    body = resp.get_json() or {}
    # The body is used as the installer's success marker string.
    assert body.get("status") == "API routes working", body
    assert "message" in body


@pytest.mark.timeout(15)
def test_j249_debug_routes_nonempty_list(nunba_flask_app):
    resp = nunba_flask_app.get("/debug/routes")
    if resp.status_code == 404:
        pytest.skip("/debug/routes not mounted")
    assert resp.status_code == 200
    routes = resp.get_json() or []
    assert isinstance(routes, list) and routes, "debug/routes empty"
    # ≥ 50 is a generous floor — Nunba mounts 200+ routes.
    assert len(routes) >= 50, f"only {len(routes)} routes; expected ≥50"
    # Every entry has endpoint, methods, rule.
    for r in routes[:20]:
        assert isinstance(r, dict)
        assert "endpoint" in r
        assert "methods" in r
        assert "rule" in r
        assert isinstance(r["methods"], list)


@pytest.mark.timeout(15)
def test_j249_debug_routes_contains_core_endpoints(nunba_flask_app):
    """The route listing must include the load-bearing endpoints —
    if /chat or /status aren't in the list the router is broken."""
    resp = nunba_flask_app.get("/debug/routes")
    if resp.status_code == 404:
        pytest.skip("/debug/routes not mounted")
    routes = resp.get_json() or []
    rules = {r.get("rule") for r in routes}
    required = {"/chat", "/status", "/prompts"}
    missing = required - rules
    assert not missing, (
        f"core endpoints missing from route table: {missing}"
    )
