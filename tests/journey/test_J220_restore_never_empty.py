"""J220 · restore_policy=never → chat boots empty.

User requirement (2026-04-18, verbatim):
  "restore shd be across restarts controlled by sessings/adminm"

J207 pins the HTTP round-trip for the admin API. J220 pins the
INVARIANT that once the operator flips ``restore_policy`` to
``never``, no restore path can reintroduce history — the invariant
holds at the module boundary because the frontend's only restore
input IS the settings dict returned by /api/admin/config/chat.

Because the frontend restore loop is driven by the JS in
``NunbaChatProvider.jsx`` (tested in a later Cypress spec, not
pytest), the HTTP-tier invariant we CAN pin here is:

  1. After PUT {restore_policy: "never"}, subsequent GETs return
     restore_policy == "never" across a process restart (file
     survives, cache invalidation works).
  2. The settings file on disk contains "never" — a peer process
     reading the same file (e.g. a post-restart frozen build)
     MUST see the same value.
  3. Flipping back to "always" is reversible and doesn't brick.

Regression pattern this catches:
  * Someone adds a write-only cache that skips disk read.
  * Someone flips the policy via a side-channel (env var override).
  * Someone writes garbage that _coerce silently re-defaults to
    "always", so "never" never actually takes effect.
"""

from __future__ import annotations

import json
import os

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
def test_j220_never_survives_process_restart(tmp_path):
    """Two boots — PUT never, restart, GET → never."""
    from desktop import chat_settings as cs

    # Boot 1 — flip to never
    cs.update_chat_settings({"restore_policy": "never"})
    assert cs.get_chat_settings().restore_policy == "never"

    # Boot 2 — simulated by cache reset (file on disk is source of truth)
    cs.reset_cache_for_tests()
    assert cs.get_chat_settings().restore_policy == "never"


@pytest.mark.timeout(15)
def test_j220_never_written_to_disk_verbatim(tmp_path):
    """The policy value on disk must match exactly — no 'neverish'
    coercion, no silent fallback. A sibling reader (frozen build,
    peer process) must see the exact same enum."""
    from desktop import chat_settings as cs

    cs.update_chat_settings({"restore_policy": "never"})
    path = os.path.join(str(tmp_path), "chat_settings.json")
    assert os.path.isfile(path), f"expected {path} to exist after PUT"
    data = json.loads(open(path, encoding="utf-8").read())
    assert data["restore_policy"] == "never", data


@pytest.mark.timeout(15)
def test_j220_reversible(tmp_path):
    """The operator must be able to flip never→always without
    bricking state. Common drift bug: someone writes 'never' as a
    sticky-flag that can't be unset."""
    from desktop import chat_settings as cs

    cs.update_chat_settings({"restore_policy": "never"})
    assert cs.get_chat_settings().restore_policy == "never"

    cs.update_chat_settings({"restore_policy": "always"})
    assert cs.get_chat_settings().restore_policy == "always"

    # On-disk proof
    path = os.path.join(str(tmp_path), "chat_settings.json")
    data = json.loads(open(path, encoding="utf-8").read())
    assert data["restore_policy"] == "always", data


@pytest.mark.timeout(15)
def test_j220_never_via_http(nunba_flask_app):
    """End-to-end HTTP flow: PUT never → GET never.

    Proves the Flask wire matches the module-level invariant above.
    Skips if the app under test predates the route (older CI pin).
    """
    r = nunba_flask_app.put(
        "/api/admin/config/chat",
        json={"restore_policy": "never"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/admin/config/chat not mounted in this env")
    assert r.status_code == 200
    body = r.get_json() or {}
    assert body.get("restore_policy") == "never"

    r2 = nunba_flask_app.get("/api/admin/config/chat")
    assert r2.status_code == 200
    assert (r2.get_json() or {}).get("restore_policy") == "never"
