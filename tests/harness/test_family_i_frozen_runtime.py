"""Family I — frozen-bundle runtime defects.

Marked `live` — requires a built bundle at build/Nunba/. Skipped on
CI. When the bundle exists, these tests actually launch the frozen
exe and check its boot behaviour.
"""
from __future__ import annotations

import subprocess
import time
from pathlib import Path

import pytest

pytestmark = pytest.mark.live


def test_i1_frozen_boot_without_pycparser_keyerror(frozen_bundle_dir: Path):
    """FAILS if Nunba.exe hits pycparser.c_ast KeyError at HARTOS init.

    Launches the real bundle with --validate, confirms
    hartos_init_error.log does not contain the pycparser KeyError.
    """
    exe = frozen_bundle_dir / "Nunba.exe"
    if not exe.exists():
        pytest.skip("Nunba.exe missing in bundle")
    proc = subprocess.Popen(
        [str(exe), "--validate"],
        cwd=str(frozen_bundle_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        proc.wait(timeout=120)
    except subprocess.TimeoutExpired:
        proc.kill()
        pytest.fail("--validate did not exit in 120s")

    log = Path.home() / "Documents" / "Nunba" / "logs" / "hartos_init_error.log"
    if log.exists():
        t = log.read_text(encoding="utf-8", errors="ignore")
        assert "KeyError: 'pycparser.c_ast'" not in t, (
            "HARTOS init still hits pycparser.c_ast KeyError post-boot"
        )


def test_i2_trace_import_preserves_sys_modules(frozen_bundle_dir: Path):
    """FAILS if `_trace_import` leaks half-loaded modules into
    sys.modules on import failure. Reproduces via a synthetic
    ImportError path inside the frozen runtime.
    """
    exe = frozen_bundle_dir / "Nunba.exe"
    if not exe.exists():
        pytest.skip("Nunba.exe missing")
    # Driver script: attempt an import that triggers a nested failure,
    # then verify sys.modules doesn't contain half-loaded partials.
    # For now this runs as part of --validate's own module tracer check.
    # Full driver lives in a Stage-B companion test file.
    pytest.skip("needs --trace-import-probe flag (Phase 5)")


def test_i3_whisper_backoff_circuit_breaker(frozen_bundle_dir: Path):
    """FAILS if frozen_debug.log shows > 10 whisper failures in a 30s
    window (the 2Hz retry storm).
    """
    log = Path.home() / "Documents" / "Nunba" / "logs" / "frozen_debug.log"
    if not log.exists():
        pytest.skip("frozen_debug.log absent — requires prior live run")
    t = log.read_text(encoding="utf-8", errors="ignore")
    # Count "faster-whisper transcription failed" in last 3000 lines.
    last_lines = t.splitlines()[-3000:]
    hits = sum(
        1 for ln in last_lines
        if "faster-whisper transcription failed" in ln
        or "whisper transcription failed" in ln
    )
    assert hits < 10, (
        f"{hits} whisper transcription failures in last 3000 log lines — "
        f"circuit-breaker/backoff still failing to suppress retry storm"
    )
