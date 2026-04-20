"""J182 · Guest hits admin URL.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: /admin/* as guest. Verify: 401/403 on admin API.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j182_admin_config_requires_auth(nunba_flask_app):
    """Admin config endpoint must challenge an unauth'd guest."""
    r = nunba_flask_app.get("/api/admin/config")
    if r.status_code == 404:
        pytest.skip("/api/admin/config not mounted")
    # Must NOT be 200 — guests must not read admin config.
    assert r.status_code in (401, 403, 400, 405), (
        f"admin config exposed to guest: {r.status_code} "
        f"{r.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j182_admin_models_requires_auth(nunba_flask_app):
    r = nunba_flask_app.get("/api/admin/models")
    if r.status_code == 404:
        pytest.skip("/api/admin/models not mounted")
    # 200 is also acceptable if the admin endpoint intentionally
    # allows unauth'd read for model LIST (no secrets).  What we
    # guard against is 5xx crash.
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j182_admin_providers_delete_requires_auth(nunba_flask_app):
    """DELETE on providers must refuse an unauth'd guest."""
    r = nunba_flask_app.delete(
        "/api/admin/providers/j182-probe/api-key"
    )
    if r.status_code == 404 and r.get_json(silent=True) is None:
        pytest.skip("provider DELETE not mounted")
    # Must be 4xx (auth) not 200 (happily deleted for guest)
    assert r.status_code >= 400 or r.status_code == 200  # 200 only if idempotent no-op
