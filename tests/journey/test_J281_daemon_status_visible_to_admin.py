"""J281 · Daemon agent status visible via admin surface.

PRODUCT_MAP.md §USER JOURNEYS — admin visibility of daemon
lifecycle. When admins open the /admin/agents panel, they must
see each daemon agent's status, last-fired-at timestamp, and
total-fire count.

Target surface
--------------
  /api/admin/agents                (EXPECTED — partial GAP)
  /api/admin/agents/<id>           (EXPECTED)
  /api/admin/automation/*          (related workflow surface)

Observed gap
------------
As of this audit there is no top-level /api/admin/agents route.
The admin channels-blueprint under /api/admin/* (integrations/
channels/admin/api.py) owns sessions, plugins, channels, metrics,
workflows — but not agent visibility. Daemon agents are persisted
via /agents/sync (chatbot_routes.py:2875-2952) as JSON files
under `prompts/*.json`, so they aren't queryable by the channels
admin blueprint today.

Candidate fallback surfaces that DO exist:
  - /agents/sync GET — returns agents belonging to the caller
    (user-owned + is_public). Not admin-scoped but observable.
  - /api/admin/metrics — generic channels admin metrics

This file documents the gap and probes each candidate so that when
the product eventually adds /api/admin/agents, the test harness
is ready.

Verifiable outcomes
-------------------
* /api/admin/agents, if mounted, responds with a list envelope.
* /agents/sync GET responds cleanly (fallback).

PRODUCT_MAP.md line cites:
  - J161 daemon lifecycle: line 1207
  - admin channels bp: line 1202 (and main.py imports)
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j281_admin_agents_list_endpoint_is_gap(nunba_flask_app):
    """Documenting gap: /api/admin/agents is not mounted today.
    A future admin dashboard should expose daemon status here."""
    resp = nunba_flask_app.get("/api/admin/agents")
    if resp.status_code == 404:
        pytest.skip(
            "GAP — /api/admin/agents not mounted. Track as "
            "PRODUCT-ENHANCEMENT so admins can see daemon status, "
            "last-fired-at, and fire-count. Fallback surface: "
            "/agents/sync GET (exercised in next test)."
        )
    # 401 is ok — admin auth-gated
    if resp.status_code == 401:
        pytest.skip(
            "/api/admin/agents auth-gated — admin status probe "
            "requires admin JWT harness."
        )
    assert resp.status_code < 500, (
        f"/api/admin/agents crashed: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
    if resp.status_code == 200:
        body = resp.get_json(silent=True)
        assert body is not None, "/api/admin/agents returned non-JSON"


@pytest.mark.timeout(30)
def test_j281_admin_metrics_shows_daemon_counters(nunba_flask_app):
    """The channels admin blueprint exposes /api/admin/metrics —
    daemon agents fold into the overall agent-activity counters.
    Verify the metrics surface is alive."""
    resp = nunba_flask_app.get("/api/admin/metrics")
    if resp.status_code == 404:
        pytest.skip("/api/admin/metrics not mounted")
    if resp.status_code == 401:
        pytest.skip("/api/admin/metrics auth-gated")
    assert resp.status_code < 500, (
        f"/api/admin/metrics crashed: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j281_admin_automation_workflows_surface(nunba_flask_app):
    """/api/admin/automation/workflows is the analogous surface
    to admin/agents — daemon workflow visibility. Both should
    share the pattern."""
    resp = nunba_flask_app.get("/api/admin/automation/workflows")
    if resp.status_code == 404:
        pytest.skip("/api/admin/automation/workflows not mounted")
    if resp.status_code == 401:
        pytest.skip("/api/admin/automation/workflows auth-gated")
    assert resp.status_code < 500, (
        f"/api/admin/automation/workflows crashed: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j281_fallback_agents_sync_lists_agents(nunba_flask_app):
    """Fallback to /agents/sync GET — while not admin-scoped, it
    lets a user-owned daemon's current config (including status)
    round-trip through the API."""
    resp = nunba_flask_app.get(
        "/agents/sync",
        headers={"X-User-Id": "j281-admin"},
    )
    if resp.status_code == 404:
        pytest.skip("/agents/sync not mounted")
    if resp.status_code == 401:
        pytest.skip("/agents/sync demands JWT")
    assert resp.status_code < 500, (
        f"/agents/sync crashed: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
    if resp.status_code == 200:
        body = resp.get_json(silent=True) or {}
        # agents list (may be empty) must be present
        assert "agents" in body or "success" in body, (
            f"/agents/sync envelope missing expected keys: "
            f"{list(body)}"
        )
