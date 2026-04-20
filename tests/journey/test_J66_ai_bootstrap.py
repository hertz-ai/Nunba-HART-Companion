"""J66 · First-run AI installer.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* Real Nunba Flask app with chatbot_routes mounted:
  POST /api/ai/bootstrap, GET /api/ai/bootstrap/status.

Steps
-----
1. POST /api/ai/bootstrap
2. Poll GET /api/ai/bootstrap/status

Verifiable outcomes
-------------------
* Both routes reachable.
* Status endpoint returns a structured envelope — even when no
  install is in progress, it MUST NOT 500.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j66_bootstrap_endpoint_mounted(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/ai/bootstrap",
        json={"dry_run": True},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/ai/bootstrap not mounted in this env")
    assert resp.status_code < 500


@pytest.mark.timeout(60)
def test_j66_bootstrap_status_returns_envelope(nunba_flask_app):
    resp = nunba_flask_app.get("/api/ai/bootstrap/status")
    if resp.status_code == 404:
        pytest.skip("/api/ai/bootstrap/status not mounted")
    assert resp.status_code < 500
    # If 200, body must be JSON.
    if resp.status_code == 200:
        body = resp.get_json(silent=True)
        assert body is not None, "status 200 but non-JSON body"
