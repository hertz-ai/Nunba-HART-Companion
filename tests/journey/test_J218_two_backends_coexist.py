"""J218 · Two backend venvs coexist with conflicting package pins.

This is the CORE PROOF of the venv-isolation design. If Indic Parler's
transformers 4.46.1 and Chatterbox ML's transformers 5.1.0 pins collide
in the main interpreter, one breaks. With per-backend venvs, both
pins coexist cleanly.

We can't afford to pull 2×GB of transformers wheels inside CI, so this
test uses two different ``six`` pins (1.16.0 vs 1.15.0) in two
different venvs to prove the mechanics. The failure mode is identical:
if venv isolation is broken, both installs land in the same site-
packages tree and the second install "wins", contaminating the first.
"""

from __future__ import annotations

import subprocess

import pytest

from tts import backend_venv

pytestmark = pytest.mark.journey


@pytest.mark.timeout(600)
def test_j218_two_venvs_pin_different_versions(tmp_path, monkeypatch):
    monkeypatch.setenv("NUNBA_VENV_ROOT_OVERRIDE", str(tmp_path))
    backend_venv._reset_cache_for_tests()

    backend_a = "j218_backend_a"
    backend_b = "j218_backend_b"

    # Backend A pins six 1.16.0
    ok_a, msg_a = backend_venv.install_into_venv(backend_a, ["six==1.16.0"])
    if not ok_a:
        if "could not find" in msg_a.lower() or "network" in msg_a.lower():
            pytest.skip(f"pip offline: {msg_a[:200]}")
        pytest.fail(f"backend A install failed: {msg_a}")

    # Backend B pins six 1.15.0 — a DIFFERENT version that would
    # conflict if both shared a site-packages tree.
    ok_b, msg_b = backend_venv.install_into_venv(backend_b, ["six==1.15.0"])
    if not ok_b:
        if "could not find" in msg_b.lower() or "network" in msg_b.lower():
            pytest.skip(f"pip offline: {msg_b[:200]}")
        pytest.fail(f"backend B install failed: {msg_b}")

    # Confirm A still reports 1.16.0 — B's install did NOT contaminate.
    pyexe_a = backend_venv.ensure_venv(backend_a)
    r_a = subprocess.run(
        [str(pyexe_a), "-c", "import six; print(six.__version__)"],
        capture_output=True, text=True, timeout=30,
    )
    assert r_a.returncode == 0, f"backend A six probe failed: {r_a.stderr[:200]}"
    assert r_a.stdout.strip() == "1.16.0", (
        f"backend A six version leaked: got {r_a.stdout.strip()!r}, expected 1.16.0. "
        f"Two venvs are NOT isolated."
    )

    # Confirm B reports 1.15.0.
    pyexe_b = backend_venv.ensure_venv(backend_b)
    r_b = subprocess.run(
        [str(pyexe_b), "-c", "import six; print(six.__version__)"],
        capture_output=True, text=True, timeout=30,
    )
    assert r_b.returncode == 0, f"backend B six probe failed: {r_b.stderr[:200]}"
    assert r_b.stdout.strip() == "1.15.0", (
        f"backend B six version wrong: got {r_b.stdout.strip()!r}, expected 1.15.0."
    )

    # Both is_venv_healthy queries should return True.
    assert backend_venv.is_venv_healthy(backend_a, "six")
    assert backend_venv.is_venv_healthy(backend_b, "six")

    # Cleanup
    backend_venv.wipe_venv(backend_a)
    backend_venv.wipe_venv(backend_b)


@pytest.mark.timeout(60)
def test_j218_wipe_one_venv_leaves_other_untouched(tmp_path, monkeypatch):
    monkeypatch.setenv("NUNBA_VENV_ROOT_OVERRIDE", str(tmp_path))
    backend_venv._reset_cache_for_tests()

    backend_venv.ensure_venv("j218_keep")
    backend_venv.ensure_venv("j218_wipe")

    path_keep = backend_venv.venv_path("j218_keep")
    path_wipe = backend_venv.venv_path("j218_wipe")
    assert path_keep.is_dir()
    assert path_wipe.is_dir()

    backend_venv.wipe_venv("j218_wipe")

    assert not path_wipe.is_dir(), "wipe_venv did not remove the directory"
    assert path_keep.is_dir(), "wipe_venv leaked into a sibling backend"

    # Cleanup
    backend_venv.wipe_venv("j218_keep")
