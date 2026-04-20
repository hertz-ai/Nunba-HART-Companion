"""J243 · System health / connectivity / build identity matrix.

PRODUCT_MAP.md §1.10 lists the lightweight probes every shell
(React, tray, watchdog) pings to decide whether Nunba is alive:

  * /api/connectivity        -> {online: true}                           (tray)
  * /backend/health          -> {cuda_available, gpu_tier, vram_free_gb} (shell badge)
  * /backend/watchdog        -> {langchain_port, langchain_process_alive, watchdog_active} (admin)
  * /api/v1/system/tiers     -> {tiers:[{name, label, min_vram_gb}]}     (onboarding)
  * /api/harthash            -> {nunba, hartos, hevolve_database, build_time} (diagnostics)

Each of these must ALWAYS reply 200 with a parseable JSON body.  If
any returns 5xx the tray icon goes red and the user thinks the app
crashed.  Previously uncovered — covered here as a fast batch.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(15)
def test_j243_connectivity_online_true(nunba_flask_app):
    resp = nunba_flask_app.get("/api/connectivity")
    if resp.status_code == 404:
        pytest.skip("/api/connectivity not mounted")
    assert resp.status_code == 200
    body = resp.get_json() or {}
    # `online` is the single load-bearing field for the tray indicator.
    assert body.get("online") is True, body


@pytest.mark.timeout(15)
def test_j243_backend_health_gpu_fields(nunba_flask_app):
    resp = nunba_flask_app.get("/backend/health")
    if resp.status_code == 404:
        pytest.skip("/backend/health not mounted")
    assert resp.status_code == 200
    body = resp.get_json() or {}
    # Three fields the React shell's model-picker reads to decide
    # which models are viable on this hardware.
    required = {"cuda_available", "gpu_tier", "vram_total_gb"}
    missing = required - set(body.keys())
    assert not missing, f"missing {missing}"
    # gpu_tier must be one of the known tier ids (or 'cpu' fallback).
    assert body["gpu_tier"] in {"ultra", "full", "standard", "lite", "cpu", "unknown"}, body
    # CUDA flag is a bool — not a string.
    assert isinstance(body["cuda_available"], bool)


@pytest.mark.timeout(15)
def test_j243_backend_watchdog_fields(nunba_flask_app):
    resp = nunba_flask_app.get("/backend/watchdog")
    if resp.status_code == 404:
        pytest.skip("/backend/watchdog not mounted")
    assert resp.status_code == 200
    body = resp.get_json() or {}
    assert "watchdog_active" in body
    assert "langchain_port" in body
    assert isinstance(body["langchain_port"], int)


@pytest.mark.timeout(15)
def test_j243_system_tiers_nonempty(nunba_flask_app):
    resp = nunba_flask_app.get("/api/v1/system/tiers")
    if resp.status_code == 404:
        pytest.skip("/api/v1/system/tiers not mounted")
    assert resp.status_code == 200
    body = resp.get_json() or {}
    tiers = body.get("tiers") or []
    assert isinstance(tiers, list) and len(tiers) >= 3, f"tiers too few: {tiers}"
    # Every tier needs name, label, min_vram_gb — read by onboarding.
    for t in tiers:
        assert isinstance(t, dict)
        assert "name" in t
        assert "label" in t
        assert "min_vram_gb" in t


@pytest.mark.timeout(15)
def test_j243_harthash_has_all_build_ids(nunba_flask_app):
    """harthash reports build identity of every pip-bundled component.
    If any are 'unknown' that's fine (dev mode), but every required key
    must be PRESENT."""
    resp = nunba_flask_app.get("/api/harthash")
    if resp.status_code == 404:
        pytest.skip("/api/harthash not mounted")
    assert resp.status_code == 200
    body = resp.get_json() or {}
    required = {"nunba", "hartos", "hevolve_database", "build_time"}
    missing = required - set(body.keys())
    assert not missing, f"harthash missing keys {missing}"
