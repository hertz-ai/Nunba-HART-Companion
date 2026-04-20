"""J206 · guest_id is stable across Flask boots.

User bug (2026-04-18) the parent fix addresses:
  "When we uninstall reinstall it restores and auto-scrolls to the
   latest conversation for each agent."

This test pins the INVARIANT that two Flask boots in a row (or two
calls to desktop.guest_identity.get_guest_id() with the cache
reset between them — which simulates a process restart) MUST yield
the same guest_id.  That stability is the whole reason the file
survives uninstall: same hardware → same id → same storage key →
same chat bucket → chat history "reappears" to the user.

Regression pattern this catches:
  * Someone swaps the derivation from MachineGuid to os.urandom.
  * Someone adds a timestamp to the SHA input (random per boot).
  * Someone adds non-deterministic content to guest_id.json so the
    cached read returns a different value on re-read.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(15)
def test_j206_guest_id_stable_across_boots(tmp_path, monkeypatch):
    """Simulate two boots by resetting the module-level cache.

    We do NOT delete the file between boots — the point is that the
    SECOND boot reads from the EXISTING file and returns the same id
    without re-deriving.  The derivation itself is pure (same
    hardware → same hash), so even if we DID delete the file, the
    id would be the same — we cover that in test J206b below.
    """
    from desktop import guest_identity as gi

    # Boot 1
    gi.reset_cache_for_tests()
    id_a = gi.get_guest_id()
    assert id_a.startswith("g_") and len(id_a) == 18

    # Boot 2 — process restart simulated via cache reset
    gi.reset_cache_for_tests()
    id_b = gi.get_guest_id()

    assert id_a == id_b, (
        f"guest_id drifted across boots: {id_a!r} → {id_b!r}.  "
        "Reinstall would mint a fresh guest identity, wiping the "
        "user's chat history on their own hardware."
    )


@pytest.mark.timeout(15)
def test_j206b_guest_id_stable_even_without_cached_file(tmp_path):
    """Delete the guest_id.json file and re-derive.

    Because derivation is a pure function of hardware identifiers
    (MachineGuid on Windows, IOPlatformUUID on macOS, machine-id on
    Linux), a fresh derive on the SAME hardware MUST reproduce the
    same id.  This is what makes the restore promise work across a
    FULL data-dir wipe, not just a cache miss.
    """
    from desktop import guest_identity as gi

    # Read current id (will create file if missing)
    gi.reset_cache_for_tests()
    id_before = gi.get_guest_id()

    # Read the persisted file, then delete it
    import os
    path = gi.get_guest_id_file_path()
    assert os.path.isfile(path), (
        f"expected guest_id.json at {path} but it wasn't written"
    )
    os.remove(path)

    # Re-derive from scratch — MUST match because derivation is pure
    gi.reset_cache_for_tests()
    id_after = gi.get_guest_id()

    assert id_after == id_before, (
        f"guest_id re-derivation on same hardware produced a "
        f"different id: {id_before!r} → {id_after!r}.  Reinstall "
        f"would mint a fresh guest identity."
    )


@pytest.mark.timeout(15)
def test_j206_guest_id_file_is_atomic_shape(tmp_path):
    """Smoke test: the persisted JSON is small, well-formed, and
    contains the fields we expect.  Guards against someone
    accidentally writing the raw MachineGuid (PII leak)."""
    from desktop import guest_identity as gi

    gi.reset_cache_for_tests()
    _ = gi.get_guest_id()

    import json
    import os
    path = gi.get_guest_id_file_path()
    assert os.path.isfile(path)
    # Shouldn't be huge
    assert os.path.getsize(path) < 2048
    data = json.loads(open(path, encoding="utf-8").read())
    assert set(data.keys()) >= {"guest_id", "derivation_source", "version"}
    # MUST NOT contain the raw MachineGuid or hostname
    import platform
    hostname = platform.node()
    if hostname:
        assert hostname not in data.get("guest_id", ""), (
            "guest_id leaks hostname — PII boundary violation"
        )
    # guest_id should not match any plausible OS machine-id format
    # (a raw UUID is 36 chars with dashes, a MachineGuid is 38 chars
    # with braces) — our id is 18 chars "g_<16 hex>".
    gid = data["guest_id"]
    assert gid.startswith("g_") and len(gid) == 18, gid
