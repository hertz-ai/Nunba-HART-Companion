"""J215 · ensure_venv is idempotent and fast on second call.

Per Track A contract (tts/backend_venv.py):

  ensure_venv(backend, python_version='3.11') -> Path
    Idempotent. Creates venv if missing. Returns python exe path.

The journey this guards: "admin triggers a second install of a
backend". The install re-runs ensure_venv; if it re-created the venv
every time, the second install would take ~10s (venv bootstrap +
ensurepip) on every admin reconfigure, silently eating wall clock
for no benefit. This test guarantees the second call returns in under
a second AND returns the SAME python exe path.
"""

from __future__ import annotations

import time

import pytest

from tts import backend_venv

pytestmark = pytest.mark.journey


@pytest.mark.timeout(300)
def test_j215_ensure_venv_idempotent_and_fast(tmp_path, monkeypatch):
    # Drop the venv root into tmp_path so we don't touch the real
    # ~/Documents/Nunba/data/venvs/ tree.
    monkeypatch.setenv("NUNBA_VENV_ROOT_OVERRIDE", str(tmp_path))
    backend_venv._reset_cache_for_tests()

    # First call creates the venv. This is slow (~2-5s) in CI.
    t0 = time.monotonic()
    pyexe_a = backend_venv.ensure_venv("j215_probe")
    first_call_s = time.monotonic() - t0
    assert pyexe_a.is_file(), f"first ensure_venv did not produce a python exe: {pyexe_a}"

    # Second call must short-circuit to the stat-check. Path must match.
    t1 = time.monotonic()
    pyexe_b = backend_venv.ensure_venv("j215_probe")
    second_call_s = time.monotonic() - t1

    assert pyexe_a == pyexe_b, (
        f"ensure_venv returned different paths on repeated calls: "
        f"{pyexe_a} vs {pyexe_b}"
    )
    assert second_call_s < 1.0, (
        f"second ensure_venv call took {second_call_s:.3f}s — expected <1s. "
        f"Non-idempotent: venv is being re-created on every call, "
        f"which would slow every admin reinstall."
    )
    assert second_call_s < first_call_s, (
        f"second call ({second_call_s:.3f}s) was slower than first "
        f"({first_call_s:.3f}s) — ensure_venv is performing extra work "
        f"on the 'cached' path."
    )

    # Cleanup: wipe the venv so pytest tmp_path can nuke the directory
    backend_venv.wipe_venv("j215_probe")


@pytest.mark.timeout(60)
def test_j215_rejects_path_traversal_backend_names(tmp_path, monkeypatch):
    """Defense-in-depth: the backend name can't escape venv_root/."""
    monkeypatch.setenv("NUNBA_VENV_ROOT_OVERRIDE", str(tmp_path))
    backend_venv._reset_cache_for_tests()

    bad_names = [
        "../../../etc/passwd",
        "..",
        "/absolute/path",
        "\\windows\\path",
        ".dotprefix",
        "",
    ]
    for bad in bad_names:
        with pytest.raises((ValueError, TypeError)):
            backend_venv.ensure_venv(bad)

    # Sanity: good names still work.
    good = backend_venv.venv_path("indic_parler")
    assert good.name == "indic_parler"
    assert str(good).startswith(str(tmp_path))
