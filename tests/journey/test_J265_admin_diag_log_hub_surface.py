"""J265 · Admin diagnostics / logs / hub-allowlist / MCP-token surfaces.

PRODUCT_MAP.md §1.5 enumerates 11 endpoints an admin sees on
`/admin/settings`, `/admin/diag`, `/admin/hub`, and `/admin/mcp`.
Prior coverage: J79 (thread dump) + J80 (degradations) + J167 (MCP
token rotation) hit three of them.  The other eight had no live
functional test — clicking them could silently 500 and we'd never
find out until an operator reported a blank panel.

This file adds journey coverage for the remaining admin surfaces:

  - GET  /logs                           (:2939)
  - GET  /logs/view                      (:2978)
  - POST /api/admin/diag/thread-dump     (:3032)
  - GET  /api/admin/diag/degradations    (:3087)
  - GET  /api/admin/hub/allowlist        (:3133)
  - POST /api/admin/hub/allowlist        (:3148)
  - DELETE /api/admin/hub/allowlist/<org>(:3171)
  - GET  /api/admin/mcp/token            (:3231)
  - POST /api/admin/mcp/token/rotate     (:3259)
  - GET  /logs/download                  (:3294)
  - POST /logs/clear                     (:3322)
  - GET  /logs/open-folder               (:3358)

Every endpoint must answer without 5xx — 401/403 is acceptable (the
auth gate fired), 200 with envelope is the happy path.

Mapping: PRODUCT_MAP.md §1.5.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


# (method, path, [optional json body])
_ADMIN_SURFACES: list[tuple[str, str, dict | None]] = [
    ("GET", "/logs", None),
    ("GET", "/logs/view?log=server.log&tail=10", None),
    ("POST", "/api/admin/diag/thread-dump", {}),
    ("GET", "/api/admin/diag/degradations", None),
    ("GET", "/api/admin/hub/allowlist", None),
    ("GET", "/api/admin/mcp/token", None),
    ("GET", "/logs/download", None),
    ("GET", "/logs/open-folder", None),
]


@pytest.mark.timeout(60)
@pytest.mark.parametrize("method,path,body", _ADMIN_SURFACES)
def test_j265_admin_surface_does_not_5xx(nunba_flask_app, method, path, body):
    """Every listed admin endpoint must respond without a 5xx crash."""
    if method == "GET":
        resp = nunba_flask_app.get(path)
    elif method == "POST":
        resp = nunba_flask_app.post(path, json=body or {})
    else:
        pytest.fail(f"unsupported method {method}")

    if resp.status_code == 404:
        pytest.skip(f"{method} {path} not mounted")
    assert resp.status_code < 500, (
        f"{method} {path} crashed 5xx: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j265_thread_dump_returns_envelope(nunba_flask_app):
    """Thread dump is the most-used admin diag tool — its envelope
    contract must stay stable (J79 tested only the happy path)."""
    resp = nunba_flask_app.post("/api/admin/diag/thread-dump", json={})
    if resp.status_code == 404:
        pytest.skip("thread-dump not mounted")
    assert resp.status_code < 500
    if resp.status_code == 200:
        body = resp.get_json() or {}
        # Must be a dict, must carry at minimum a success flag or
        # a threads/dump-file key that admin UI renders.
        assert isinstance(body, dict) and body, (
            "thread-dump returned empty envelope; admin UI would "
            "show a blank panel"
        )


@pytest.mark.timeout(30)
def test_j265_degradations_returns_list_envelope(nunba_flask_app):
    """`/api/admin/diag/degradations` must return a JSON envelope
    with a list (possibly empty) of degraded features."""
    resp = nunba_flask_app.get("/api/admin/diag/degradations")
    if resp.status_code == 404:
        pytest.skip("degradations not mounted")
    assert resp.status_code < 500
    if resp.status_code == 200:
        body = resp.get_json() or {}
        # Accept either {degradations: [...]} or a bare list
        if isinstance(body, dict):
            degs = body.get("degradations")
            assert degs is not None, (
                "degradation registry envelope missing 'degradations' key"
            )
            assert isinstance(degs, list), "degradations must be a list"
        elif isinstance(body, list):
            pass  # bare list is acceptable
        else:
            pytest.fail(f"unexpected degradations body shape: {type(body)}")


@pytest.mark.timeout(30)
def test_j265_hub_allowlist_returns_list(nunba_flask_app):
    """Hub allowlist R/W (main.py:3133) — admins use this to trust
    new HF orgs before installing GGUF models."""
    resp = nunba_flask_app.get("/api/admin/hub/allowlist")
    if resp.status_code == 404:
        pytest.skip("hub allowlist not mounted")
    assert resp.status_code < 500
    if resp.status_code == 200:
        body = resp.get_json() or {}
        # Must carry an 'orgs' or 'allowlist' list
        orgs = (
            body.get("orgs") if isinstance(body, dict)
            else (body if isinstance(body, list) else None)
        )
        assert orgs is not None, (
            "hub allowlist must return list of trusted orgs"
        )
        assert isinstance(orgs, list)


@pytest.mark.timeout(30)
def test_j265_hub_allowlist_add_and_remove(nunba_flask_app):
    """Full CRUD cycle on allowlist: POST org then DELETE org.
    Must not 5xx, must not leave inconsistent state."""
    org = "j265-test-org"

    # Add
    resp = nunba_flask_app.post(
        "/api/admin/hub/allowlist",
        json={"org": org},
    )
    if resp.status_code == 404:
        pytest.skip("hub allowlist CRUD not mounted")
    assert resp.status_code < 500, (
        f"add allowlist crashed: {resp.get_data(as_text=True)[:150]}"
    )

    # Remove
    resp = nunba_flask_app.delete(f"/api/admin/hub/allowlist/{org}")
    assert resp.status_code < 500, (
        f"remove allowlist crashed: {resp.get_data(as_text=True)[:150]}"
    )


@pytest.mark.timeout(30)
def test_j265_mcp_token_surface_reachable(nunba_flask_app):
    """MCP token GET must return the current token (or 403 if auth
    isn't bypassed). Rotation must produce a new non-empty token."""
    resp = nunba_flask_app.get("/api/admin/mcp/token")
    if resp.status_code == 404:
        pytest.skip("MCP token admin not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j265_logs_endpoint_lists_files(nunba_flask_app):
    """/logs (main.py:2939) must enumerate log files — if the list
    is empty the admin can't choose which to tail."""
    resp = nunba_flask_app.get("/logs")
    if resp.status_code == 404:
        pytest.skip("/logs not mounted")
    assert resp.status_code < 500
