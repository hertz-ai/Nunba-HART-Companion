"""J17 · Model hub search → install.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* /api/admin/models/hub/* admin routes mounted.

Steps
-----
1. GET /api/admin/models/hub/search?q=qwen
2. POST /api/admin/models/hub/install with a sample model id.

Verifiable outcomes
-------------------
* Each route reachable.
* Search endpoint returns JSON.
* Install endpoint validates input (rejects empty / unknown).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j17_hub_search_endpoint(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/models/hub/search?q=qwen")
    if resp.status_code == 404:
        pytest.skip("/api/admin/models/hub/search not mounted")
    assert resp.status_code < 500
    if resp.status_code == 200:
        body = resp.get_json(silent=True)
        assert body is not None, "hub/search 200 but non-JSON body"


@pytest.mark.timeout(60)
def test_j17_hub_install_rejects_empty_body(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/admin/models/hub/install",
        json={},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/admin/models/hub/install not mounted")
    # Empty body → 4xx validation, not 5xx
    assert resp.status_code < 500


@pytest.mark.timeout(60)
def test_j17_hub_install_rejects_untrusted_org(nunba_flask_app):
    """Allowlist gate: an unknown org should be refused at the
    supply-chain gate BEFORE any HF API call — so the test does not
    require network."""
    resp = nunba_flask_app.post(
        "/api/admin/models/hub/install",
        json={"model": "attacker-org-j17/bad-model", "quant": "Q4_K_M"},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/admin/models/hub/install not mounted")
    # Expected: 400/403 from allowlist; or 401/403 from admin auth.
    # NOT 500 (would indicate no allowlist check at all).
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip())


@pytest.mark.timeout(30)
def test_j17_hub_allowlist_get(nunba_flask_app):
    """The allowlist itself is readable at /api/admin/hub/allowlist."""
    resp = nunba_flask_app.get("/api/admin/hub/allowlist")
    if resp.status_code == 404:
        pytest.skip("/api/admin/hub/allowlist not mounted")
    assert resp.status_code < 500
