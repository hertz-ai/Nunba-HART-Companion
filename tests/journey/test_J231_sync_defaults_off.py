"""J231 · Cloud sync defaults OFF and guards the endpoint.

User requirement (2026-04-18, verbatim):
  "across reinstallls as well with cloud syn restore settings"

This test pins the privacy-default: ``cloud_sync_enabled`` is
``false`` out of the box, and the /api/chat-sync/{push,pull,forget}
endpoints 403 when it is false — even for an authenticated user.

Why this matters:
  * Default-OFF is the privacy-first stance. A Nunba install the
    operator has never explicitly turned on must NOT silently ship
    chat history to a server-side blob.
  * The admin toggle must be the ONLY gate that opens the door;
    no env var, no magic header, no "helpful" client-side default
    should bypass it.

Invariants pinned here:
  1. ``ChatSettings()`` defaults → ``cloud_sync_enabled == False``.
  2. ``cloud_sync_enabled`` only flips ``True`` when the admin PUTs
     it explicitly — partial PUT of other fields leaves it alone.
  3. /api/chat-sync/pull with default settings returns 403 (even
     with a valid JWT).
  4. /api/chat-sync/push with default settings returns 403.
  5. /api/chat-sync/forget with default settings returns 403.

Regression pattern this catches:
  * Someone flips the default to True to "make the feature easier
    to demo" — breaks the privacy stance.
  * Someone moves the gate from the Flask handler into the JS
    frontend — any curl bypasses the gate.
  * Someone writes an env override (``NUNBA_FORCE_SYNC=1``) that
    re-enables even when admin says off.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.fixture(autouse=True)
def _isolate_settings(tmp_path, monkeypatch):
    from desktop import chat_settings as cs
    monkeypatch.setattr(cs, "_data_dir", lambda: str(tmp_path))
    cs.reset_cache_for_tests()
    yield
    cs.reset_cache_for_tests()


@pytest.mark.timeout(15)
def test_j231_default_is_off():
    """ChatSettings() defaults to cloud_sync_enabled=False."""
    from desktop.chat_settings import ChatSettings, get_chat_settings

    # Dataclass default
    s = ChatSettings()
    assert s.cloud_sync_enabled is False

    # Module-level getter (reads from disk / returns default if no file)
    g = get_chat_settings()
    assert g.cloud_sync_enabled is False


@pytest.mark.timeout(15)
def test_j231_partial_policy_put_preserves_off():
    """Writing restore_policy alone MUST NOT flip cloud_sync on."""
    from desktop import chat_settings as cs

    cs.update_chat_settings({"restore_policy": "never"})
    assert cs.get_chat_settings().cloud_sync_enabled is False


@pytest.mark.timeout(15)
def test_j231_explicit_flip_only():
    """Only a PUT that explicitly names cloud_sync_enabled=True
    flips the gate. Anything else leaves it False."""
    from desktop import chat_settings as cs

    # Off → off (no-op)
    cs.update_chat_settings({})
    assert cs.get_chat_settings().cloud_sync_enabled is False

    # Explicit flip
    cs.update_chat_settings({"cloud_sync_enabled": True})
    assert cs.get_chat_settings().cloud_sync_enabled is True

    # Explicit flip back
    cs.update_chat_settings({"cloud_sync_enabled": False})
    assert cs.get_chat_settings().cloud_sync_enabled is False


@pytest.mark.timeout(15)
def test_j231_non_bool_cloud_sync_raises():
    """The write boundary must reject non-bool values for
    cloud_sync_enabled — truthy strings / ints would hide the
    user's true intent."""
    from desktop import chat_settings as cs

    for bad in ["yes", "true", 1, 0, "1", None]:
        with pytest.raises(ValueError):
            cs.update_chat_settings({"cloud_sync_enabled": bad})

    # State unchanged after each failed attempt
    assert cs.get_chat_settings().cloud_sync_enabled is False


@pytest.mark.timeout(15)
def test_j231_pull_endpoint_forbidden_when_off(nunba_flask_app):
    """GET /api/chat-sync/pull MUST 403 when cloud_sync_enabled=false,
    regardless of JWT presence. Even if someone hand-crafts a
    Bearer token, the gate must refuse."""
    r = nunba_flask_app.get(
        "/api/chat-sync/pull",
        headers={"Authorization": "Bearer some.jwt.here"},
    )
    if r.status_code == 404:
        pytest.skip("/api/chat-sync/pull not mounted in this env")
    assert r.status_code == 403, r.get_json()
    body = r.get_json() or {}
    assert body.get("error") == "sync_disabled"


@pytest.mark.timeout(15)
def test_j231_push_endpoint_forbidden_when_off(nunba_flask_app):
    """POST /api/chat-sync/push MUST 403 when disabled."""
    r = nunba_flask_app.post(
        "/api/chat-sync/push",
        headers={
            "Authorization": "Bearer some.jwt.here",
            "Content-Type": "application/json",
        },
        json={"buckets": {}},
    )
    if r.status_code == 404:
        pytest.skip("/api/chat-sync/push not mounted in this env")
    assert r.status_code == 403, r.get_json()


@pytest.mark.timeout(15)
def test_j231_forget_endpoint_forbidden_when_off(nunba_flask_app):
    """DELETE /api/chat-sync/forget MUST 403 when disabled — even
    with confirm:true. The admin gate takes precedence over the
    belt-and-suspenders confirm gate."""
    r = nunba_flask_app.delete(
        "/api/chat-sync/forget",
        headers={
            "Authorization": "Bearer some.jwt.here",
            "Content-Type": "application/json",
        },
        json={"confirm": True},
    )
    if r.status_code == 404:
        pytest.skip("/api/chat-sync/forget not mounted in this env")
    assert r.status_code == 403, r.get_json()
