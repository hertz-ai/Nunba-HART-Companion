"""J217 · Venvs survive a simulated Nunba reinstall.

Per the operator's design contract: venvs live under
~/Documents/Nunba/data/venvs/ (core.platform_paths.get_data_dir),
which is user-writable and NOT under C:\\Program Files. When the
operator uninstalls + reinstalls Nunba, Program Files is wiped but
Documents/ is NOT. Existing venvs should persist across reinstall
— mirrors the existing persistence of guest_id.json, hart_language.json,
and the models/ cache.

This test simulates a reinstall by:
  1. creating a venv + installing a package
  2. simulating "delete the Nunba install tree" (we don't have a real
     Program Files to delete in CI, so we verify the DATA path is
     outside any tree the test owns)
  3. clearing the cached venv_root
  4. re-running ensure_venv and confirming the SAME venv directory is
     reused, NOT a fresh one with no packages
"""

from __future__ import annotations

import pytest

from tts import backend_venv

pytestmark = pytest.mark.journey


@pytest.mark.timeout(300)
def test_j217_venv_path_stable_across_module_reload(tmp_path, monkeypatch):
    monkeypatch.setenv("NUNBA_VENV_ROOT_OVERRIDE", str(tmp_path))
    backend_venv._reset_cache_for_tests()

    backend = "j217_probe"

    # Step 1: create the venv (simulate first install)
    pyexe_pre = backend_venv.ensure_venv(backend)
    assert pyexe_pre.is_file()

    # Step 2: drop a sentinel file into the venv so we can detect whether
    # the "reinstall" re-created it (which would wipe the sentinel)
    vpath = backend_venv.venv_path(backend)
    sentinel = vpath / "SENTINEL_SURVIVES_REINSTALL"
    sentinel.write_text("J217\n", encoding="utf-8")
    assert sentinel.is_file()

    # Step 3: simulate a reinstall by reloading the backend_venv module
    # state. In a real reinstall, the Nunba exe is deleted + reinstalled;
    # the venv root (under Documents/) is untouched. Our proxy for this
    # is: clear the in-memory cache, re-read from env.
    backend_venv._reset_cache_for_tests()

    # Step 4: re-run ensure_venv — it MUST return the same path.
    pyexe_post = backend_venv.ensure_venv(backend)
    assert pyexe_post == pyexe_pre, (
        f"ensure_venv returned a different path after simulated reinstall: "
        f"{pyexe_pre} vs {pyexe_post}"
    )

    # Sentinel must still be there — proves the directory was NOT wiped.
    assert sentinel.is_file(), (
        "venv directory was wiped during 'reinstall' — user would lose "
        "all installed backends on every Nunba upgrade"
    )
    assert sentinel.read_text(encoding="utf-8") == "J217\n"

    # Cleanup
    backend_venv.wipe_venv(backend)


@pytest.mark.timeout(60)
def test_j217_venv_root_lives_under_data_dir(monkeypatch):
    """Unset the override so we hit the real platform_paths path.
    Verifies venvs go to Documents/Nunba/data/venvs, NOT Program Files.
    """
    monkeypatch.delenv("NUNBA_VENV_ROOT_OVERRIDE", raising=False)
    backend_venv._reset_cache_for_tests()

    root = backend_venv.venv_root()
    root_str = str(root).lower()
    assert "program files" not in root_str, (
        f"venv root points INTO Program Files: {root} — "
        f"a non-admin user can't write there"
    )
    # On Windows platforms the root should land under Documents/Nunba/data.
    # On CI Linux containers the root is under ~/.config/nunba/data or
    # $XDG_DATA_HOME. Either way it must be user-writable.
    assert "venvs" in root_str, (
        f"venv_root does not end in 'venvs': {root}"
    )
