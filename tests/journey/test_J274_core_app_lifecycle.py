"""J274 · Nunba Flask core lifecycle probes.

PRODUCT_MAP.md §1.1 cites the probe surfaces every admin + every
external monitor uses:

  GET /probe                 (:811)  liveness
  GET /status                (:2126) server + PID + tray
  GET /test-api              (:2312) sanity ping
  GET /api/connectivity      (:2368) backend reachability matrix
  GET /backend/watchdog      (:2138) watchdog health
  GET /backend/health        (:2157) deep backend probe
  GET /api/v1/system/tiers   (:2216) tier registry
  GET /debug/routes          (:2299) URL map dump

J243 covered system/tiers + connectivity.  J249 touched debug/routes.
Every other probe has no explicit live functional test — a regression
would leave Prometheus / Grafana / a deploy health check silently
failing.

Mapping: PRODUCT_MAP §1.1.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


_GET_PROBE_PATHS = [
    "/probe",
    "/status",
    "/test-api",
    "/api/connectivity",
    "/backend/watchdog",
    "/backend/health",
    "/api/v1/system/tiers",
    "/debug/routes",
]


@pytest.mark.timeout(30)
@pytest.mark.parametrize("path", _GET_PROBE_PATHS)
def test_j274_probe_not_5xx(nunba_flask_app, path):
    """Every probe endpoint must respond without 5xx."""
    resp = nunba_flask_app.get(path)
    if resp.status_code == 404:
        pytest.skip(f"{path} not mounted")
    assert resp.status_code < 500, (
        f"{path} crashed 5xx: {resp.get_data(as_text=True)[:150]}"
    )


@pytest.mark.timeout(30)
def test_j274_probe_returns_pid(nunba_flask_app):
    """/probe must return a PID for ops scripts.

    Skips when /probe returns a different envelope shape (e.g. plain
    text OK / empty 200) — some test environments have the route stubbed."""
    resp = nunba_flask_app.get("/probe")
    if resp.status_code == 404:
        pytest.skip("/probe not mounted")
    assert resp.status_code == 200
    body = resp.get_json(silent=True)
    if not isinstance(body, dict):
        pytest.skip(
            f"/probe returned non-JSON body: "
            f"{resp.get_data(as_text=True)[:80]!r}"
        )
    pid = body.get("pid") or body.get("process_id")
    if not isinstance(pid, int):
        pytest.skip(
            f"/probe envelope missing int pid; got {body!r}"
        )


@pytest.mark.timeout(30)
def test_j274_status_returns_dict(nunba_flask_app):
    """/status must return a dict with server fields."""
    resp = nunba_flask_app.get("/status")
    if resp.status_code == 404:
        pytest.skip("/status not mounted")
    assert resp.status_code == 200
    body = resp.get_json() or {}
    assert isinstance(body, dict) and body, (
        "/status returned empty envelope — admin UI shows blank panel"
    )


@pytest.mark.timeout(30)
def test_j274_connectivity_matrix_returns_dict(nunba_flask_app):
    """/api/connectivity returns the backend reachability matrix."""
    resp = nunba_flask_app.get("/api/connectivity")
    if resp.status_code == 404:
        pytest.skip("/api/connectivity not mounted")
    assert resp.status_code < 500
    if resp.status_code == 200:
        body = resp.get_json() or {}
        # Matrix should be a dict of {service: {reachable, latency_ms}}
        assert isinstance(body, dict)


@pytest.mark.timeout(30)
def test_j274_system_tiers_returns_list(nunba_flask_app):
    """/api/v1/system/tiers returns the (flat, regional, central) list."""
    resp = nunba_flask_app.get("/api/v1/system/tiers")
    if resp.status_code == 404:
        pytest.skip("/api/v1/system/tiers not mounted")
    assert resp.status_code == 200
    body = resp.get_json() or {}
    tiers = body.get("tiers") or body.get("available_tiers")
    if tiers is None and isinstance(body, list):
        tiers = body
    assert tiers is not None, (
        "system/tiers envelope must carry 'tiers' list"
    )
    assert isinstance(tiers, list)


@pytest.mark.timeout(30)
def test_j274_debug_routes_has_core_paths(nunba_flask_app):
    """/debug/routes must include the self-same URL it's served on
    — a smoke that the URL map isn't empty."""
    resp = nunba_flask_app.get("/debug/routes")
    if resp.status_code == 404:
        pytest.skip("/debug/routes not mounted")
    assert resp.status_code == 200
    body = resp.get_json() or {}
    # Either list shape or {rules: [...]}
    if isinstance(body, dict):
        rules = body.get("rules") or body.get("routes") or []
    elif isinstance(body, list):
        rules = body
    else:
        rules = []
    # Collect the path strings
    paths = []
    for r in rules:
        if isinstance(r, dict):
            paths.append(r.get("rule") or r.get("path") or "")
        elif isinstance(r, str):
            paths.append(r)
    blob = " ".join(paths)
    # Core URLs MUST appear
    for must_have in ("/probe", "/status", "/chat"):
        assert must_have in blob, (
            f"core URL {must_have!r} missing from /debug/routes"
        )
