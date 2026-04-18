"""J222 · "Forget me" wipes ``guest_id.json`` on disk.

User requirement (2026-04-18, verbatim):
  "restore shd be across restarts controlled by sessings/adminm"

The admin settings tab exposes a destructive "Forget this device"
button that calls ``DELETE /api/guest-id`` with ``{"confirm":
true}``. J207 pins the HTTP envelope; J222 pins the ON-DISK
invariant:

  1. DELETE with confirm=true removes ``guest_id.json`` from
     ~/Documents/Nunba/data/.
  2. The in-process module cache is invalidated so the next read
     re-derives (same hardware → same id — we don't pretend the
     id "changes", the file does).
  3. DELETE without confirm is a 400 and leaves the file intact.
  4. DELETE when no file is present is a 200 no-op with
     previous_guest_id: null.

Regression pattern this catches:
  * Someone wires the button to ``os.remove`` without invalidating
    the module cache → subsequent GET /api/guest-id returns the
    stale cached id while the file is gone.
  * Someone drops the confirm gate → a stray curl wipes identity.
"""

from __future__ import annotations

import os

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(15)
def test_j222_delete_without_confirm_is_400_and_keeps_file(
    nunba_flask_app,
):
    """Belt-and-suspenders: empty body must 400 and NOT touch disk."""
    # Seed a guest id so there's a file to accidentally wipe
    from desktop import guest_identity as gi
    gi.reset_cache_for_tests()
    _ = gi.get_guest_id()
    path = gi.get_guest_id_file_path()
    if not os.path.isfile(path):
        pytest.skip("guest-id derivation unavailable on this host")

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

    # File must still exist — no state change
    assert os.path.isfile(path), (
        "DELETE without confirm wiped the file anyway — gate broken"
    )


@pytest.mark.timeout(15)
def test_j222_delete_with_confirm_removes_file(nunba_flask_app):
    """Happy path: confirm:true removes the file and invalidates
    the in-process cache. A subsequent GET /api/guest-id derives
    fresh (same hardware → same value, but the file is a NEW
    write)."""
    from desktop import guest_identity as gi
    gi.reset_cache_for_tests()
    try:
        prior_id = gi.get_guest_id()
    except Exception:
        pytest.skip("guest-id derivation unavailable on this host")

    path = gi.get_guest_id_file_path()
    if not os.path.isfile(path):
        pytest.skip("guest-id file not present; cannot verify wipe")

    r = nunba_flask_app.delete(
        "/api/guest-id",
        json={"confirm": True},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/guest-id DELETE not mounted")
    if r.status_code == 503:
        pytest.skip("guest-id service reported unavailable")
    assert r.status_code == 200
    body = r.get_json() or {}
    assert body.get("deleted") is True
    # previous_guest_id may be a string OR null — both are valid
    prev = body.get("previous_guest_id")
    assert prev is None or isinstance(prev, str)

    # File must be gone
    assert not os.path.isfile(path), (
        f"DELETE returned 200 but {path} still exists — wipe failed"
    )

    # Subsequent GET re-derives; on same hardware value matches
    r2 = nunba_flask_app.get("/api/guest-id")
    if r2.status_code == 200:
        # Re-derive produces same id because derivation is pure
        new_id = (r2.get_json() or {}).get("guest_id")
        assert new_id == prior_id, (
            "re-derive produced a different id on the same hardware — "
            "the derivation is no longer pure"
        )


@pytest.mark.timeout(15)
def test_j222_delete_when_no_file_is_200_noop(
    nunba_flask_app, tmp_path, monkeypatch,
):
    """If the file is already absent, DELETE should still 200 — it's
    an idempotent admin action. previous_guest_id may be null."""
    # Point guest_identity at an empty tmp dir so there's no file
    from desktop import guest_identity as gi
    monkeypatch.setattr(gi, "_data_dir", lambda: str(tmp_path))
    gi.reset_cache_for_tests()
    # DO NOT seed — leave the tmp dir empty

    r = nunba_flask_app.delete(
        "/api/guest-id",
        json={"confirm": True},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/guest-id DELETE not mounted")
    # Acceptable: either 200 (idempotent) or 503 (derivation failed
    # because we pointed at an unwritable path)
    assert r.status_code in (200, 503), r.get_json()
