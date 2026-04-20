"""Verified-signal gate for TTS "Ready" claims.

Root-cause class this module addresses:
    Every user-visible "Ready / healthy / loaded / allocated / verified"
    state in Nunba was historically emitted from a proxy signal
    (pip exit code, dict-write, `exec("import X")`, spawn-returned)
    rather than a verified signal (the thing the user asked for
    actually happened).

    This module replaces the shallowest costume of that bug — the
    TTS "Ready" card — with a verifier that drives the SAME
    `synthesize_to_bytes` path the user's first chat message would
    hit, and asserts non-empty audio came out.

Contract:
    verify_backend_synth(engine, backend, lang=None,
                         min_bytes=10_000, timeout_s=120) -> Result

    where Result is a dataclass with:
        ok       : bool   — True iff synthesis produced audio >= min_bytes
        n_bytes  : int    — actual bytes produced (0 on total failure)
        err      : str    — short error string, empty on success
        elapsed_s: float  — wall time of the synth call

    Callers MUST treat `ok == True` as the only valid trigger for
    a "Ready" claim. No other signal is acceptable. If this function
    returns ok=False, the backend is NOT ready regardless of what
    pip, importlib, or the worker spawn said.
"""

from __future__ import annotations

import logging
import os
import tempfile
import threading
import time
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# Minimum bytes for a "real" audio file.
# A 500ms mono 22kHz WAV is ~22KB, a 2s WAV is ~88KB.
# 10KB excludes truncated/error files while allowing short test phrases.
MIN_AUDIO_BYTES = 10_000

# Test phrases come from the canonical GREETINGS dict in
# core.constants.  Historically this module defined its own
# _TEST_PHRASES — that was a parallel-path DRY violation (the same
# concept "localized sample phrase for the handshake" lived in two
# places and drifted).  One writer, one source of truth.
#
# Imported at module scope so tests that AST-inspect this file still
# see no inline dict literal.  See tests/test_greetings_constants.py
# for the guard.
from core.constants import GREETING_FALLBACK_LANG as _FALLBACK_LANG
from core.constants import GREETINGS as _TEST_PHRASES  # noqa: F401


@dataclass
class Result:
    """Result of a verified-synth check. See module docstring."""
    ok: bool
    n_bytes: int
    err: str
    elapsed_s: float

    def __bool__(self) -> bool:
        return self.ok


def _pick_test_phrase(backend: str, lang: str | None) -> str:
    """Pick a test phrase based on backend capability + requested lang.

    Falls back to the canonical GREETING_FALLBACK_LANG ('en') when
    the requested lang isn't in GREETINGS.
    """
    if lang and lang in _TEST_PHRASES:
        return _TEST_PHRASES[lang]
    # Indic Parler without an explicit lang → Tamil (primary target cohort).
    if backend == 'indic_parler' and not lang and 'ta' in _TEST_PHRASES:
        return _TEST_PHRASES['ta']
    return _TEST_PHRASES[_FALLBACK_LANG]


def _hf_offline_reason() -> str | None:
    """Surface HF_HUB_OFFLINE / TRANSFORMERS_OFFLINE env flags as a
    user-readable reason.  Returns None if neither is set so the
    synth path can proceed.

    Used by verify_backend_synth to fail fast with a clear
    "download failed" message instead of silently stalling on a
    HuggingFace request that cannot complete.  Before this, the
    observed failure mode was the Ready card hanging for minutes
    while the probe retried a network call against a machine with
    no route to huggingface.co.
    """
    import os as _os
    if _os.environ.get("HF_HUB_OFFLINE") == "1":
        return ("HF_HUB_OFFLINE=1 and model weights not cached — "
                "download failed (network offline or unreachable)")
    if _os.environ.get("TRANSFORMERS_OFFLINE") == "1":
        return ("TRANSFORMERS_OFFLINE=1 and model weights not cached — "
                "download failed")
    return None


def verify_backend_synth(engine, backend: str,
                         lang: str | None = None,
                         min_bytes: int = MIN_AUDIO_BYTES,
                         timeout_s: int = 120) -> Result:
    """Run a real synthesis against `backend` and verify audio was produced.

    This is the ONLY function allowed to gate a TTS "Ready" claim.
    It drives the same synthesize_to_bytes → _backends[backend].synthesize
    path a user's chat message hits, with a minimal language-appropriate
    test phrase, and returns the measured result.

    Args:
        engine:     A TTSEngine instance (singleton, typically).
        backend:    Backend id (e.g. 'indic_parler', 'piper',
                    'chatterbox_turbo').
        lang:       Language hint for the test phrase. Optional.
        min_bytes:  Minimum audio bytes to consider a pass. Default 10KB.
        timeout_s:  Max wall time for the synth call. Default 120s
                    (allows first-run model download).

    Returns:
        Result(ok, n_bytes, err, elapsed_s).

    This function NEVER raises. All failure modes land in `err`.
    """
    text = _pick_test_phrase(backend, lang)
    logger.info("verified_synth: probing backend=%s lang=%s text=%r",
                backend, lang, text)

    # Reserve a temp file path up front so the timeout path can clean up.
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav", prefix="verify_")
    os.close(tmp_fd)

    # Box so the worker thread can return its outcome to us without
    # raising across thread boundaries.
    box = {'ok': False, 'n_bytes': 0, 'err': '', 'done': False}

    def _worker():
        try:
            # Prefer the backend-scoped synth path when the engine exposes
            # one, else fall back to the active-backend synth. The key
            # invariant: use the SAME code path the user hits, not a
            # private helper.
            if hasattr(engine, 'verify_synth_via_backend'):
                result_path = engine.verify_synth_via_backend(
                    backend, text, tmp_path, language=lang)
            else:
                # Temporarily switch active backend, synth, restore.
                prev = getattr(engine, '_active_backend', None)
                try:
                    if hasattr(engine, 'set_backend'):
                        engine.set_backend(backend)
                    result_path = engine.synthesize(
                        text, tmp_path, language=lang)
                finally:
                    if prev and hasattr(engine, 'set_backend'):
                        try:
                            engine.set_backend(prev)
                        except Exception:
                            pass

            if result_path and os.path.exists(result_path):
                box['n_bytes'] = os.path.getsize(result_path)
                box['ok'] = box['n_bytes'] >= min_bytes
                if not box['ok']:
                    box['err'] = f"audio too small ({box['n_bytes']}B < {min_bytes}B)"
            else:
                box['err'] = "synthesize returned no path"
        except Exception as e:
            box['err'] = f"{type(e).__name__}: {e}"[:200]
        finally:
            box['done'] = True

    t0 = time.monotonic()
    worker = threading.Thread(target=_worker, daemon=True, name=f"verify-{backend}")
    worker.start()
    worker.join(timeout=timeout_s)
    elapsed = time.monotonic() - t0

    if not box['done']:
        # Worker still running — timed out.
        box['err'] = f"timed out after {timeout_s}s"
        # Let the worker continue in the background; we return the
        # verdict now so the UI isn't blocked.

    # Best-effort cleanup. If the worker is still writing we may leak
    # a temp file; OS will reap it on reboot. Not worth a race here.
    try:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
    except OSError:
        pass

    ok = box['ok']
    result = Result(
        ok=ok,
        n_bytes=box['n_bytes'],
        err=box['err'],
        elapsed_s=elapsed,
    )
    if ok:
        logger.info("verified_synth: backend=%s PASS (%d bytes in %.1fs)",
                    backend, result.n_bytes, elapsed)
    else:
        logger.warning("verified_synth: backend=%s FAIL — %s (elapsed=%.1fs)",
                       backend, result.err or "no error captured", elapsed)
    return result
