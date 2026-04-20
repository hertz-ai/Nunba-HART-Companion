"""J280 · Daemon paused-state must NOT fire on trigger.

PRODUCT_MAP.md §USER JOURNEYS — daemon lifecycle pause semantics.
When the owner toggles `status: paused` on a daemon agent, any
matching trigger event must NOT cause the daemon's goal to fire.

Target surface
--------------
  /api/admin/agents/<id>/pause   (EXPECTED — GAP observed)
  /api/admin/agents/<id>/resume  (EXPECTED — GAP observed)
  /agents/sync POST              (fallback — write status='paused' into config)

Observed gap
------------
As of this audit, there is NO /api/admin/agents/<id>/pause route
mounted in main.py or routes/chatbot_routes.py. Verified via:
  grep -R 'agents/.*/pause' routes main.py  → no match

The current pause semantics, if any, travel through the full
/agents/sync write path (updated_at + status: paused field in
the agent's config JSON). The daemon side (HARTOS agent_engine/
agent_daemon.py:81) must consult that status before firing.

This file documents the gap and probes the available fallback —
the /agents/sync write path. If /api/admin/agents/<id>/pause is
ever added, this file should be updated to exercise the direct
route.

Verifiable outcomes
-------------------
* /agents/sync accepts a paused-status agent without 5xx.
* /api/admin/agents/<id>/pause is absent (skip with reason).

PRODUCT_MAP.md line cites:
  - J161 daemon coexistence: line 1207
  - /agents/sync: chatbot_routes.py:2875
"""

from __future__ import annotations

import time

import pytest

pytestmark = pytest.mark.journey


_J280_DAEMON_ID = f"j280-paused-daemon-{int(time.time())}"


@pytest.mark.timeout(30)
def test_j280_admin_agents_pause_endpoint_is_gap(nunba_flask_app):
    """Documenting the product gap: /api/admin/agents/<id>/pause
    is NOT currently mounted. A future product change should add
    this route; this test will convert from SKIP → RUN when it
    lands."""
    resp = nunba_flask_app.post(
        f"/api/admin/agents/{_J280_DAEMON_ID}/pause",
        json={},
    )
    if resp.status_code == 404:
        pytest.skip(
            "GAP — /api/admin/agents/<id>/pause not mounted. "
            "Track as PRODUCT-ENHANCEMENT so pause semantics can "
            "be exercised end-to-end. Current fallback: write "
            "status='paused' via /agents/sync."
        )
    # If the route ever lands, it should 200 / 202 or 401 (auth).
    assert resp.status_code < 500, (
        f"pause endpoint crashed: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j280_agents_sync_accepts_paused_status_fallback(nunba_flask_app):
    """Fallback pause path — /agents/sync accepts an agent config
    with `status: paused` + updated_at bumped. Downstream the
    daemon side must consult this status before firing."""
    paused_agent = {
        "prompt_id": _J280_DAEMON_ID,
        "name": "J280 Paused Daemon",
        "mode": "daemon",
        "status": "paused",
        "paused_at": "2026-04-18T20:00:00",
        "updated_at": "2026-04-18T20:00:01",
    }
    resp = nunba_flask_app.post(
        "/agents/sync",
        json={"agents": [paused_agent]},
        headers={"Content-Type": "application/json", "X-User-Id": "j280-guest"},
    )
    if resp.status_code == 404:
        pytest.skip("/agents/sync not mounted")
    if resp.status_code == 401:
        pytest.skip(
            "/agents/sync demands JWT — paused-status fallback "
            "untestable without full auth harness."
        )
    assert resp.status_code < 500, (
        f"/agents/sync crashed writing paused daemon: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j280_trigger_publish_when_daemon_paused_transport_ok(nunba_flask_app):
    """Even when a daemon is paused, the trigger TRANSPORT must
    still accept publishes (so other active daemons on the same
    topic fire). The daemon side filters by status."""
    resp = nunba_flask_app.post(
        "/publish",
        json={
            "topic": f"com.hertzai.hevolve.trigger.{_J280_DAEMON_ID}",
            "args": [{"event": "trigger", "fire": True}],
        },
    )
    if resp.status_code == 404:
        pytest.skip("/publish not mounted")
    assert resp.status_code < 500 or resp.status_code == 503, (
        f"/publish crashed delivering trigger: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
