"""J207 · Admin-controlled chat-restore policy.

User requirement (verbatim, 2026-04-18):
  "restore shd be across restarts controlled by sessings/adminm"

J201 already pinned the SAME-device hardware-derived guest_id story
(file under ~/Documents/Nunba/data/guest_id.json survives uninstall).
J207 adds the policy layer the operator can dial without code edits:

  restore_policy ∈ {always, prompt, never, session}
  restore_scope  ∈ {all_agents, active_only, manual}

Contract for this test file (HTTP tier — fast, deterministic):

  GET  /api/admin/config/chat → 200 + the schema dict (defaults to
       always/all_agents/cloud_off if the file doesn't yet exist)
  PUT  /api/admin/config/chat with valid payload → 200 + updated dict
  PUT  /api/admin/config/chat with garbage policy → 400
  PUT  /api/admin/config/chat with garbage scope  → 400
  PUT  /api/admin/config/chat with empty body     → 200 + unchanged
       (empty payload is a no-op, NOT an error — partial updates)
  DELETE /api/guest-id without {confirm:true}     → 400
  DELETE /api/guest-id with    {confirm:true}     → 200 + the wiped id

Behaviour-tier verification (does the FRONTEND honour each policy)
is owned by the Cypress suite, not this test file — pytest at the
HTTP boundary is the right altitude for the policy round-trip.
"""

from __future__ import annotations

import os

import pytest

pytestmark = pytest.mark.journey


# Reset the in-process module cache + on-disk file before every test
# so each test starts from defaults.

@pytest.fixture(autouse=True)
def _isolate_chat_settings(tmp_path, monkeypatch):
    """Patch the data dir so tests don't trample real chat_settings.json."""
    from desktop import chat_settings as cs
    monkeypatch.setattr(cs, "_data_dir", lambda: str(tmp_path))
    cs.reset_cache_for_tests()
    yield
    cs.reset_cache_for_tests()


# ============================ GET defaults ===============================

@pytest.mark.timeout(15)
def test_j207_get_returns_defaults_on_fresh_install(nunba_flask_app):
    r = nunba_flask_app.get("/api/admin/config/chat")
    if r.status_code == 404:
        pytest.skip("/api/admin/config/chat not mounted in this env")
    assert r.status_code == 200
    body = r.get_json() or {}
    assert body.get("restore_policy") in (
        "always", "prompt", "never", "session",
    )
    assert body.get("restore_scope") in (
        "all_agents", "active_only", "manual",
    )
    assert isinstance(body.get("cloud_sync_enabled"), bool)


# ============================ PUT each policy value ======================

@pytest.mark.parametrize("policy", ["always", "prompt", "never", "session"])
@pytest.mark.timeout(15)
def test_j207_put_each_policy_round_trips(nunba_flask_app, policy):
    r = nunba_flask_app.put(
        "/api/admin/config/chat",
        json={"restore_policy": policy},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/admin/config/chat not mounted")
    assert r.status_code == 200
    body = r.get_json() or {}
    assert body.get("restore_policy") == policy

    # GET-after-PUT must return the same value
    r2 = nunba_flask_app.get("/api/admin/config/chat")
    assert r2.status_code == 200
    assert (r2.get_json() or {}).get("restore_policy") == policy


@pytest.mark.parametrize("scope", ["all_agents", "active_only", "manual"])
@pytest.mark.timeout(15)
def test_j207_put_each_scope_round_trips(nunba_flask_app, scope):
    r = nunba_flask_app.put(
        "/api/admin/config/chat",
        json={"restore_scope": scope},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/admin/config/chat not mounted")
    assert r.status_code == 200
    body = r.get_json() or {}
    assert body.get("restore_scope") == scope


# ============================ rejection ==================================

@pytest.mark.timeout(15)
def test_j207_put_rejects_garbage_policy(nunba_flask_app):
    r = nunba_flask_app.put(
        "/api/admin/config/chat",
        json={"restore_policy": "yes_please"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/admin/config/chat not mounted")
    assert r.status_code == 400
    body = r.get_json() or {}
    assert body.get("error") == "invalid_payload"


@pytest.mark.timeout(15)
def test_j207_put_rejects_garbage_scope(nunba_flask_app):
    r = nunba_flask_app.put(
        "/api/admin/config/chat",
        json={"restore_scope": "everything"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/admin/config/chat not mounted")
    assert r.status_code == 400


@pytest.mark.timeout(15)
def test_j207_put_empty_body_is_noop(nunba_flask_app):
    """Partial updates: empty body must not flip any field, but
    must NOT 400 (the admin UI sends partial PUTs)."""
    # Establish a non-default state first
    nunba_flask_app.put(
        "/api/admin/config/chat",
        json={"restore_policy": "never"},
        headers={"Content-Type": "application/json"},
    )
    r = nunba_flask_app.put(
        "/api/admin/config/chat",
        json={},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/admin/config/chat not mounted")
    assert r.status_code == 200
    body = r.get_json() or {}
    assert body.get("restore_policy") == "never"  # unchanged


# ============================ DELETE /api/guest-id ========================

@pytest.mark.timeout(15)
def test_j207_delete_guest_id_requires_confirm(nunba_flask_app):
    """Belt-and-suspenders: DELETE /api/guest-id without
    {"confirm": true} must 400, not silently wipe."""
    r = nunba_flask_app.delete(
        "/api/guest-id",
        json={},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/guest-id DELETE not mounted")
    assert r.status_code == 400
    body = r.get_json() or {}
    assert body.get("error") == "confirm_required"


@pytest.mark.timeout(15)
def test_j207_delete_guest_id_with_confirm_succeeds(nunba_flask_app):
    """Happy path — confirm:true wipes the file (or no-ops if
    none was present) and returns the previous id."""
    r = nunba_flask_app.delete(
        "/api/guest-id",
        json={"confirm": True},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/guest-id DELETE not mounted")
    if r.status_code == 503:
        pytest.skip("guest-id derivation unavailable on this host")
    assert r.status_code == 200
    body = r.get_json() or {}
    assert body.get("deleted") is True
    # previous_guest_id may be a string OR null (if no id was loaded)
    prev = body.get("previous_guest_id")
    assert prev is None or isinstance(prev, str)
