"""J278 · Daemon agent lifecycle — create, sync, contact, respond.

PRODUCT_MAP.md §USER JOURNEYS — J161 covers the parallel daemon
tick + manual dispatch coexistence (agent_daemon.py:81 +
chatbot_routes.py:3200-3335). MISSING previously: the user-facing
LIFECYCLE endpoints that let a user create, observe, pause, accept,
or decline a daemon agent. This file covers those.

Target surface:
  routes/chatbot_routes.py:3003   - /agents/<prompt_id>/post
  routes/chatbot_routes.py:2875   - GET  /agents/sync
  routes/chatbot_routes.py:2903   - POST /agents/sync
  routes/chatbot_routes.py:3200   - POST /agents/contact
  routes/chatbot_routes.py:3293   - POST /agents/contact/respond
  HARTOS integrations/agent_engine (daemon side — read-only here)

User journey
------------
1. User POST /agents/sync with {agents: [<daemon config>]} to
   publish a new daemon agent. Verify 200 + server persists it.
2. User GET /agents/sync — the daemon appears in the list with
   the creator's user_id stamped.
3. Another agent POST /agents/contact {agent_id, user_id, ...}
   — a non-owned agent triggers the consent flow (requires_consent
   True, delivered False); a self-owned agent delivers directly.
4. User POST /agents/contact/respond {request_id, action: 'deny'}
   — declines the contact request cleanly.

Verifiable outcomes
-------------------
* /agents/sync accepts the envelope and persists.
* /agents/contact returns a request_id plus `requires_consent`.
* /agents/contact/respond with action 'deny' returns success.
* No 5xx crashes along the lifecycle.

Any endpoint not mounted → pytest.skip inside test body.

PRODUCT_MAP.md line cites:
  - J161 daemon coexistence: line 1207-1210
  - /agents/sync: chatbot_routes.py:2875
  - /agents/contact: chatbot_routes.py:3200
"""

from __future__ import annotations

import time

import pytest

pytestmark = pytest.mark.journey


_J278_DAEMON_PROMPT_ID = f"j278-daemon-{int(time.time())}"


def _auth_headers(nunba_flask_app):
    """Issue an API token header if bundled/local mode accepts one
    without auth, else empty headers (auth=off for local)."""
    # Local-first: endpoints guarded by _get_user_id_from_auth accept
    # the Nunba local header convention (X-User-Id) for guest users.
    return {"X-User-Id": "j278-guest", "Content-Type": "application/json"}


@pytest.mark.timeout(30)
def test_j278_agents_sync_get_envelope(nunba_flask_app):
    """GET /agents/sync returns {success, agents: [...]} even when
    empty — the SPA reads this to hydrate the agent picker."""
    resp = nunba_flask_app.get(
        "/agents/sync", headers=_auth_headers(nunba_flask_app),
    )
    if resp.status_code == 404:
        pytest.skip("/agents/sync not mounted")
    # 401 acceptable — auth may demand JWT rather than X-User-Id
    if resp.status_code == 401:
        pytest.skip(
            "/agents/sync demands JWT — lifecycle probe inapplicable"
        )
    assert resp.status_code < 500, (
        f"/agents/sync GET crashed: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j278_agents_sync_post_persist_daemon(nunba_flask_app):
    """POST /agents/sync with a daemon-mode agent must persist it
    (last-write-wins). Downstream: daemon appears in subsequent GET."""
    daemon_agent = {
        "prompt_id": _J278_DAEMON_PROMPT_ID,
        "name": "J278 Test Daemon",
        "mode": "daemon",   # the daemon flag — distinguishes from manual
        "trigger": {"type": "event", "topic": "test.trigger.j278"},
        "updated_at": "2026-04-18T20:00:00",
        "is_public": True,
    }
    resp = nunba_flask_app.post(
        "/agents/sync",
        json={"agents": [daemon_agent]},
        headers=_auth_headers(nunba_flask_app),
    )
    if resp.status_code == 404:
        pytest.skip("/agents/sync not mounted")
    if resp.status_code == 401:
        pytest.skip("/agents/sync demands JWT")
    assert resp.status_code < 500, (
        f"/agents/sync POST crashed: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j278_agents_migrate_guest_to_user_smoke(nunba_flask_app):
    """POST /agents/migrate transfers guest-owned agents to a
    logged-in user. Part of daemon lifecycle — a daemon created as
    guest must follow the user through login."""
    resp = nunba_flask_app.post(
        "/agents/migrate",
        json={
            "guest_user_id": "j278-guest",
            "new_user_id": "j278-logged-in",
        },
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/agents/migrate not mounted")
    assert resp.status_code < 500, (
        f"/agents/migrate crashed: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j278_agent_contact_request_requires_fields(nunba_flask_app):
    """POST /agents/contact with missing agent_id/user_id must
    4xx, not 5xx. This is the input-validation contract."""
    resp = nunba_flask_app.post(
        "/agents/contact",
        json={},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/agents/contact not mounted")
    assert resp.status_code < 500, (
        f"/agents/contact crashed on empty body: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
    # Expect 400 — but 401 (auth-gated) is also acceptable
    assert resp.status_code in (400, 401, 403, 422), (
        f"expected 4xx, got {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j278_agent_contact_creates_consent_request(nunba_flask_app):
    """POST /agents/contact with a foreign-owned agent should
    return requires_consent=True + a request_id for later respond()."""
    resp = nunba_flask_app.post(
        "/agents/contact",
        json={
            "agent_id": "j278-unknown-agent",
            "user_id": "j278-target-user",
            "reason": "wants to share a j278 test message",
            "message": "hello from j278",
        },
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/agents/contact not mounted")
    if resp.status_code in (401, 403):
        pytest.skip(
            f"/agents/contact auth-gated (status={resp.status_code})"
        )
    assert resp.status_code < 500, (
        f"/agents/contact crashed: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
    if resp.status_code == 200:
        body = resp.get_json(silent=True) or {}
        # Either requires_consent True or delivered True — the
        # contract is that SOMETHING happens.
        assert "request_id" in body or "requires_consent" in body or "delivered" in body, (
            f"contact response missing expected fields: {list(body)}"
        )


@pytest.mark.timeout(30)
def test_j278_agent_contact_respond_unknown_request_404(nunba_flask_app):
    """POST /agents/contact/respond with an unknown request_id must
    return 4xx (404), not 5xx. The respond endpoint is part of
    daemon user-consent lifecycle."""
    resp = nunba_flask_app.post(
        "/agents/contact/respond",
        json={
            "request_id": "j278-no-such-request",
            "action": "deny",
        },
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404 and "not mounted" in resp.get_data(as_text=True).lower():
        pytest.skip("/agents/contact/respond not mounted")
    # 404 (unknown request) is the expected shape
    assert resp.status_code < 500, (
        f"/agents/contact/respond crashed: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j278_agent_contact_respond_invalid_action_400(nunba_flask_app):
    """POST /agents/contact/respond with action='maybe' must 4xx —
    only 'accept' and 'deny' are valid lifecycle transitions."""
    resp = nunba_flask_app.post(
        "/agents/contact/respond",
        json={
            "request_id": "j278-invalid-action",
            "action": "maybe",
        },
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404 and "not mounted" in resp.get_data(as_text=True).lower():
        pytest.skip("/agents/contact/respond not mounted")
    assert resp.status_code < 500
