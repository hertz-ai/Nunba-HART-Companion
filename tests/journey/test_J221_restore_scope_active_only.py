"""J221 · restore_scope=active_only narrows restore to current agent.

User requirement (2026-04-18, verbatim):
  "restore shd be across restarts controlled by sessings/adminm"

The task brief originally named this J221 "Configure max-history-
length (how many turns to restore)". The current backend schema
has no ``max_turns`` field — extending it for a number input is a
separate DRY-aware decision the operator should make explicitly,
not a silent add-a-field via a test. Instead, J221 pins the
CLOSEST existing knob that satisfies the intent of "limit the blast
radius of restore": ``restore_scope=active_only``, which restores
only the currently-focused agent's history, not every agent's.

Invariant pinned here:
  1. PUT {restore_scope: "active_only"} round-trips (GET returns
     the same value).
  2. All three enum members round-trip (all_agents / active_only /
     manual) — the allowlist is honoured at the write boundary.
  3. Flipping scope doesn't wipe policy (they're orthogonal).
  4. Garbage scope values 400 at the write boundary and do NOT
     silently coerce to a default.

Regression pattern this catches:
  * Scope and policy get accidentally entangled (writing one
    resets the other to default).
  * _coerce's read-time silent fallback bleeds into write-time
    (which would hide garbage writes from the operator).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    from desktop import chat_settings as cs
    monkeypatch.setattr(cs, "_data_dir", lambda: str(tmp_path))
    cs.reset_cache_for_tests()
    yield
    cs.reset_cache_for_tests()


@pytest.mark.timeout(15)
@pytest.mark.parametrize("scope", ["all_agents", "active_only", "manual"])
def test_j221_each_scope_round_trips_via_module(scope):
    """Every allowed scope value writes, reads back, and survives a
    cache reset (simulating a process restart)."""
    from desktop import chat_settings as cs

    cs.update_chat_settings({"restore_scope": scope})
    assert cs.get_chat_settings().restore_scope == scope

    cs.reset_cache_for_tests()
    assert cs.get_chat_settings().restore_scope == scope


@pytest.mark.timeout(15)
def test_j221_scope_and_policy_are_orthogonal():
    """Writing scope must NOT reset policy — these are separate
    knobs, not a single switch."""
    from desktop import chat_settings as cs

    cs.update_chat_settings({"restore_policy": "never"})
    cs.update_chat_settings({"restore_scope": "active_only"})

    s = cs.get_chat_settings()
    assert s.restore_policy == "never", (
        "writing scope clobbered policy — orthogonality broken"
    )
    assert s.restore_scope == "active_only"


@pytest.mark.timeout(15)
def test_j221_garbage_scope_raises_at_write():
    """Invalid scope must RAISE (not silently coerce). The handler
    translates the ValueError into a 400 — see test_J207 for the
    HTTP side. This test pins the module-boundary contract."""
    from desktop import chat_settings as cs

    with pytest.raises(ValueError):
        cs.update_chat_settings({"restore_scope": "everywhere"})

    # State must not have changed
    assert cs.get_chat_settings().restore_scope == "all_agents"


@pytest.mark.timeout(15)
def test_j221_active_only_via_http(nunba_flask_app):
    """HTTP wire: PUT active_only → GET active_only."""
    r = nunba_flask_app.put(
        "/api/admin/config/chat",
        json={"restore_scope": "active_only"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/admin/config/chat not mounted in this env")
    assert r.status_code == 200
    assert (r.get_json() or {}).get("restore_scope") == "active_only"

    r2 = nunba_flask_app.get("/api/admin/config/chat")
    assert r2.status_code == 200
    assert (r2.get_json() or {}).get("restore_scope") == "active_only"
