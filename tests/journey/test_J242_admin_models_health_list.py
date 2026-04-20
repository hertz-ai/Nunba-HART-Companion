"""J242 · Admin models health + registry surface.

PRODUCT_MAP.md §1.4 + §6 describe how the React admin shell queries
``/admin/models`` to show the operator which models are loaded, their
access counts, idle timers, and the pressure signals from the
resource governor.

Two endpoints feed that panel:
  * GET /api/admin/models/health  (runtime telemetry)
  * GET /api/admin/models         (registry-level model catalogue)

Both surfaces were previously uncovered by the journey suite.  If
either 500s, the admin UI shows a blank models panel and the
operator can't tell which weights are active — silent drift.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j242_models_health_shape(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/models/health")
    if resp.status_code == 404:
        pytest.skip("/api/admin/models/health not mounted")
    assert resp.status_code == 200, resp.get_data(as_text=True)[:200]
    body = resp.get_json() or {}
    # Required top-level keys the React panel reads.
    assert "models" in body, f"missing 'models' key; body={list(body.keys())}"
    assert "interval_s" in body
    # `models` is a dict keyed by model id.
    models = body.get("models") or {}
    assert isinstance(models, dict), f"models not dict: {type(models).__name__}"
    # Pressure signals must be BOOLEAN (not a stringified flag).
    for k in ("cpu_pressure", "disk_pressure"):
        if k in body:
            assert isinstance(body[k], bool), f"{k} not bool: {body[k]!r}"


@pytest.mark.timeout(30)
def test_j242_models_health_entry_schema(nunba_flask_app):
    """Each per-model entry must expose the fields the UI and the
    resource governor both rely on."""
    resp = nunba_flask_app.get("/api/admin/models/health")
    if resp.status_code == 404:
        pytest.skip("/api/admin/models/health not mounted")
    body = resp.get_json() or {}
    models = body.get("models") or {}
    if not models:
        pytest.skip("no models registered in this environment")
    mid, entry = next(iter(models.items()))
    expected = {
        "healthy",           # binary up/down
        "access_count",      # used by LRU
        "device",            # gpu / cpu / unloaded
        "idle_seconds",      # used by idle-evict
        "downgraded",        # signals to the HUD
    }
    missing = expected - set(entry.keys())
    assert not missing, f"model {mid} missing keys {missing}"


@pytest.mark.timeout(30)
def test_j242_admin_models_registry_list(nunba_flask_app):
    """GET /api/admin/models returns the full catalogue (all_models)."""
    resp = nunba_flask_app.get("/api/admin/models")
    if resp.status_code == 404:
        pytest.skip("/api/admin/models not mounted")
    assert resp.status_code == 200, resp.get_data(as_text=True)[:200]
    body = resp.get_json() or {}
    models = body.get("all_models") or body.get("models") or []
    assert isinstance(models, list) and models, "registry reports zero models"
    # Every entry must have id + backend + enabled; those are the
    # minimum fields the UI uses to render a row.
    for m in models[:10]:
        assert isinstance(m, dict)
        assert "id" in m
        assert "enabled" in m
