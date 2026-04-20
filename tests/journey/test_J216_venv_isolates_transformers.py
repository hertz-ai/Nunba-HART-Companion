"""J216 · Venvs isolate Python package versions from the main interpreter.

Per Track A contract (tts/backend_venv.py):

  install_into_venv(backend, packages) -> (ok, msg)
  invoke_in_venv(backend, module, args, timeout=120) -> (rc, out, err)

The journey this guards: "main Nunba interp has transformers 5.1.0;
Indic Parler needs transformers 4.46.1". If the venv machinery leaks,
both installs collide and one breaks. This test uses a lightweight
pure-Python package (``six``) to prove the mechanics — we don't need
to download torch just to confirm the venv isolates the `six` version.

Gated behind the smoke network: if pip can't reach PyPI (e.g. CI
without internet), the test skips gracefully with a clear reason
instead of failing.
"""

from __future__ import annotations

import pytest

from tts import backend_venv

pytestmark = pytest.mark.journey


@pytest.mark.timeout(300)
def test_j216_venv_install_isolates_package(tmp_path, monkeypatch):
    monkeypatch.setenv("NUNBA_VENV_ROOT_OVERRIDE", str(tmp_path))
    backend_venv._reset_cache_for_tests()

    backend = "j216_probe"
    # ``six`` is tiny (one file), pure-Python, zero transitive deps —
    # perfect for proving the install+import plumbing without paying
    # the multi-GB torch download tax.
    #
    # We pin an exact version that is NOT typically installed in a
    # CI matrix so we can prove isolation by checking the venv's
    # ``six.__version__`` inside the venv.
    ok, msg = backend_venv.install_into_venv(backend, ["six==1.16.0"])
    if not ok:
        if "could not find" in msg.lower() or "network" in msg.lower() or "connection" in msg.lower():
            pytest.skip(f"pip could not reach PyPI: {msg[:200]}")
        pytest.fail(f"install_into_venv failed: {msg}")

    # Venv python should report six.__version__ == 1.16.0.
    rc, out, err = backend_venv.invoke_in_venv(
        backend, "six", [], timeout=30, _probe_mode=True,
    )
    assert rc == 0, f"venv could not import six: rc={rc} err={err[:200]}"

    # Ask the venv directly for the version string.
    pyexe = backend_venv.ensure_venv(backend)
    import subprocess

    r = subprocess.run(
        [str(pyexe), "-c", "import six; print(six.__version__)"],
        capture_output=True, text=True, timeout=30,
    )
    assert r.returncode == 0, f"stdin version probe failed: {r.stderr[:200]}"
    assert r.stdout.strip() == "1.16.0", (
        f"expected six 1.16.0 inside venv, got {r.stdout.strip()!r}"
    )

    # Cleanup
    backend_venv.wipe_venv(backend)
