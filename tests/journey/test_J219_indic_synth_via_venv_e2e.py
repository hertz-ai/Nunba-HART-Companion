"""J219 · End-to-end Indic synth via venv, with main-interp protection.

Full-stack contract:
  - Indic Parler synthesis happens INSIDE the venv (transformers 4.46.1)
  - Main interp's transformers version is NOT touched
  - An Indic chat-synth request returns audio bytes > 0

This is the proof for Track B. In CI + dev-box environments we cannot
download 3.5GB of parler weights just for a smoke test; the full e2e
path runs only when the operator opts in via
``NUNBA_VENV_REAL_PARLER=1`` (run on their workstation, not CI).

The always-on contract remains: confirm that the venv for indic_parler
exists under ~/Documents/Nunba/data/venvs/ AND that the main
interpreter did NOT get its transformers version downgraded.

Test flow:
  1. Read the main interp's transformers version (must stay on whatever
     it was; typically 5.x)
  2. Run install_backend_full('indic_parler') stub or real
  3. Re-read main interp's transformers version — MUST be unchanged
  4. If NUNBA_VENV_REAL_PARLER=1: POST /tts/preview with 'வணக்கம்' +
     language='ta', expect audio_base64 > 10kB
"""

from __future__ import annotations

import os
import subprocess
import sys

import pytest

from tts import backend_venv
from tts.package_installer import BACKEND_VENV_PACKAGES

pytestmark = pytest.mark.journey


def _main_interp_transformers_version() -> str | None:
    """Ask the current interpreter what transformers version it sees.

    Returns None if transformers is not installed in the main interp
    (a legitimate state — e.g. dev-box with no TTS yet). Returns the
    __version__ string otherwise.
    """
    try:
        import transformers
        return str(transformers.__version__)
    except Exception:
        return None


@pytest.mark.timeout(60)
def test_j219_indic_parler_in_venv_packages_manifest():
    """BACKEND_VENV_PACKAGES['indic_parler'] pins transformers<5, not 5.x.

    The whole point of the venv migration is to quarantine the
    transformers pin. If BACKEND_VENV_PACKAGES ever lands a
    transformers 5.x pin for indic_parler, the isolation rationale is
    broken and Indic Parler will crash on parler-tts import.
    """
    pkgs = BACKEND_VENV_PACKAGES.get("indic_parler", [])
    assert pkgs, "BACKEND_VENV_PACKAGES['indic_parler'] is empty — Track B regressed"
    transformers_pin = next(
        (p for p in pkgs if p.startswith("transformers")), None
    )
    assert transformers_pin is not None, (
        f"no transformers pin in BACKEND_VENV_PACKAGES['indic_parler']: {pkgs}"
    )
    # The pin must be <4.47 (parler-tts 0.2.2 requirement) — not 5.x.
    assert "4." in transformers_pin, (
        f"indic_parler transformers pin is {transformers_pin!r} — expected 4.46.x"
    )
    assert "5." not in transformers_pin, (
        f"indic_parler transformers pin leaked to 5.x: {transformers_pin!r}"
    )


@pytest.mark.timeout(120)
def test_j219_ensure_venv_does_not_contaminate_main_interp(tmp_path, monkeypatch):
    """After ensure_venv('indic_parler'), main interp's transformers
    version must be unchanged."""
    monkeypatch.setenv("NUNBA_VENV_ROOT_OVERRIDE", str(tmp_path))
    backend_venv._reset_cache_for_tests()

    before = _main_interp_transformers_version()

    # Creating the venv alone must not install anything — not into
    # the main interp, not into the venv.
    pyexe = backend_venv.ensure_venv("indic_parler")
    assert pyexe.is_file()

    after = _main_interp_transformers_version()
    assert after == before, (
        f"main interp transformers version changed from {before!r} to "
        f"{after!r} as a side effect of ensure_venv — the venv is "
        f"leaking into the main process"
    )


@pytest.mark.timeout(600)
@pytest.mark.skipif(
    os.environ.get("NUNBA_VENV_REAL_PARLER") != "1",
    reason="Full Indic Parler install is 3.5GB — opt-in via "
           "NUNBA_VENV_REAL_PARLER=1. Contract-only assertions "
           "(above) run always.",
)
def test_j219_indic_synth_via_venv_real(tmp_path, monkeypatch):
    """Real install + synth path. Only runs when the operator opts in."""
    monkeypatch.setenv("NUNBA_VENV_ROOT_OVERRIDE", str(tmp_path))
    backend_venv._reset_cache_for_tests()

    from tts.package_installer import install_backend_full

    ok, msg = install_backend_full("indic_parler")
    assert ok, f"install_backend_full('indic_parler') failed: {msg}"

    # Venv healthy for parler_tts?
    assert backend_venv.is_venv_healthy("indic_parler", "parler_tts")

    # Actually synthesize something short in Hindi.
    payload = {"text": "नमस्ते", "language": "hi"}
    rc, out, err = backend_venv.invoke_in_venv(
        "indic_parler", "tts.indic_parler_worker",
        ["--payload", __import__("json").dumps(payload)],
        timeout=300,
    )
    assert rc == 0, f"indic_parler_worker rc={rc} err={err[-400:]!r}"

    import json
    result = json.loads(out.splitlines()[-1])
    assert result.get("ok"), f"worker reported failure: {result}"
    audio = result.get("audio_base64", "")
    assert len(audio) > 10_000, (
        f"audio_base64 too short ({len(audio)} chars) — synth did not "
        f"produce meaningful output"
    )

    # Final gate: main interp transformers stayed on its pinned version.
    r = subprocess.run(
        [sys.executable, "-c",
         "import transformers; print(transformers.__version__)"],
        capture_output=True, text=True, timeout=30,
    )
    if r.returncode == 0:
        main_ver = r.stdout.strip()
        assert not main_ver.startswith("4.46"), (
            f"main interp transformers got DOWNGRADED to {main_ver} — "
            f"the venv install leaked into main site-packages"
        )
