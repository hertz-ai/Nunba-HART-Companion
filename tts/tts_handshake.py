"""First-run TTS handshake smoke test.

Purpose
-------
The "Voice engine ready" banner in the chat UI used to flip to green
ON INSTALL-COMPLETE or ON PACKAGE-IMPORT-SUCCESS.  Both are proxy
signals that lied repeatedly in production.  The specific failure
captured in ``~/Documents/Nunba/logs/frozen_debug.log`` (2026-04-18
11:36:40) was: Indic Parler reported "Ready", then silently crashed
on the user's first message with
``ModuleNotFoundError: No module named 'sympy'`` (parler_tts →
transformers → torch.fx).  The banner lied; the user's chat fell
back to text-only without warning.

This module gates the "Ready" banner behind a verified synthesis of
a short, localized greeting phrase.  The flow:

    (engine reports load-success)
            │
            ▼
    run_handshake(engine, backend, lang)
            │
            ├──► synthesize GREETINGS[lang] via verify_backend_synth
            │        (same code path user's first chat hits)
            │
            ├──► validate bytes > MIN_AUDIO_BYTES AND duration ≥ 0.5s
            │
            ├──► on PASS: emit "tts_handshake" SSE with status=ready
            │        + attached audio payload so frontend plays it
            │
            └──► on FAIL: emit "tts_handshake" SSE with status=failed
                     + engine, short error, suggested fallbacks

Only the ``status='ready'`` event may flip the banner to green.
Any other outcome keeps it in an explicit failure state with
retry / switch-engine actions.

One-shot policy
---------------
The handshake is cached per ``(engine, lang)`` pair for the current
app session.  A user who rapidly toggles language must not re-synth
the greeting every single time — but a first boot, a manual retry,
or a backend switch DOES re-run it.
"""
from __future__ import annotations

import base64
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger("tts.tts_handshake")

# Minimum duration (in seconds) we accept as "audible greeting".
# ~0.5s rules out the empty-WAV / silent-failure class while not
# rejecting a short English phrase produced in a hurry.
MIN_DURATION_S: float = 0.5

# Minimum raw bytes — matches tts.verified_synth.MIN_AUDIO_BYTES so
# the two probes agree on what "non-trivial audio" means.
MIN_AUDIO_BYTES: int = 10_000

# Fallback ladder suggested to the user when the active backend fails.
# Ordered by compute weight (cheapest first), NOT by quality — the
# user is trying to hear something right now.
_FALLBACK_LADDER: tuple[str, ...] = ("piper", "kokoro", "f5")


# ──────────────────────────────────────────────────────────────────────
# In-process one-shot cache.  Keyed by (backend, lang) so toggling
# language re-runs the handshake for the new voice but does NOT re-run
# for the same pair.  Cleared explicitly by retry() / a backend swap.
# ──────────────────────────────────────────────────────────────────────
_cache_lock = threading.Lock()
_cache: dict[tuple[str, str], HandshakeResult] = {}


@dataclass
class HandshakeResult:
    """Outcome of a single handshake attempt.

    Mirrors the shape that the frontend's ``tts_handshake`` SSE
    listener consumes.  The dataclass is kept minimal — adding a
    field here requires the UI consumer to handle it too.
    """
    ok: bool
    engine: str
    lang: str
    phrase: str = ""
    n_bytes: int = 0
    duration_s: float = 0.0
    elapsed_s: float = 0.0
    err: str = ""
    audio_path: str = ""
    fallbacks: tuple[str, ...] = field(default_factory=tuple)

    def to_event(self) -> dict:
        """Serialize to the SSE payload the frontend consumes.

        Audio bytes are base64-encoded inline so the UI can play the
        clip without a second fetch.  On failure, no audio is
        attached — the UI renders the error + retry/switch actions.
        """
        payload: dict = {
            "type": "tts_handshake",
            "status": "ready" if self.ok else "failed",
            "engine": self.engine,
            "lang": self.lang,
            "phrase": self.phrase,
            "n_bytes": self.n_bytes,
            "duration_s": round(self.duration_s, 3),
            "elapsed_s": round(self.elapsed_s, 3),
            "err": self.err,
            "fallbacks": list(self.fallbacks) if not self.ok else [],
        }
        # Attach playable audio on success so the user actually HEARS
        # the greeting — the audio is part of the confidence signal,
        # not an afterthought.
        if self.ok and self.audio_path and os.path.exists(self.audio_path):
            try:
                with open(self.audio_path, "rb") as f:
                    payload["audio_b64"] = base64.b64encode(f.read()).decode("ascii")
            except OSError as e:
                # If we can't read our own temp file, the engine is
                # not ready regardless of what the verifier said.
                logger.warning("handshake: audio file unreadable: %s", e)
                payload["status"] = "failed"
                payload["err"] = f"audio unreadable: {e}"
        return payload


def _pick_greeting(lang: str | None) -> tuple[str, str]:
    """Return ``(lang_used, phrase)`` for the handshake.

    Falls back to ``GREETING_FALLBACK_LANG`` if the requested lang
    isn't in the canonical GREETINGS dict.  Importing lazily so a
    broken core.constants doesn't crash the whole TTS stack.
    """
    from core.constants import GREETING_FALLBACK_LANG, GREETINGS
    if lang and lang in GREETINGS:
        return lang, GREETINGS[lang]
    return GREETING_FALLBACK_LANG, GREETINGS[GREETING_FALLBACK_LANG]


def _measure_duration(wav_path: str, n_bytes: int) -> float:
    """Return audio duration in seconds.

    Preferred path: ``soundfile`` gives us an accurate frames/rate
    reading.  If soundfile isn't available (degraded Piper-only
    install), fall back to a rough estimate from byte count assuming
    16-bit mono at 22kHz — enough to distinguish "empty" from
    "half-second phrase" which is the whole point of this gate.
    """
    try:
        import soundfile as sf  # type: ignore[import-not-found]
        with sf.SoundFile(wav_path) as f:
            if f.samplerate <= 0:
                return 0.0
            return len(f) / float(f.samplerate)
    except Exception:
        # Fallback: bytes → seconds, 2 bytes/sample × 22050 Hz.
        # Undershoots for 24kHz engines but errs on the safe side.
        return max(0.0, (n_bytes - 44) / (2 * 22050.0))


def _play_locally(wav_path: str) -> None:
    """Best-effort play the greeting through the default output device.

    Part of the confidence signal — the user must HEAR the greeting,
    not just see a green banner.  Failure is logged and swallowed
    (the frontend will still play via the base64 payload), so a
    missing ``sounddevice`` on the host never blocks the handshake
    from reporting PASS.
    """
    try:
        import sounddevice as sd  # type: ignore[import-not-found]
        import soundfile as sf  # type: ignore[import-not-found]
    except Exception as e:
        logger.info("handshake: local playback skipped (%s) — frontend "
                    "will play via b64 payload", e)
        return
    try:
        data, sr = sf.read(wav_path, dtype="float32")
        sd.play(data, sr, blocking=False)
    except Exception as e:
        logger.warning("handshake: local playback failed: %s", e)


def _broadcast(payload: dict) -> None:
    """Push the handshake result to the frontend via SSE.

    Uses the same ``broadcast_sse_event`` hook that setup_progress
    events ride on — we're reusing, not introducing a second
    notification lane.
    """
    try:
        import sys as _sys
        main_mod = _sys.modules.get("__main__")
        if main_mod and hasattr(main_mod, "broadcast_sse_event"):
            main_mod.broadcast_sse_event("tts_handshake", payload)
    except Exception as e:
        logger.warning("handshake: SSE broadcast failed: %s", e)


def _suggest_fallbacks(failed_backend: str) -> tuple[str, ...]:
    """Return the ordered fallback ladder, dropping the backend that
    just failed so the UI doesn't offer it as a "Switch engine"
    option.
    """
    return tuple(b for b in _FALLBACK_LADDER if b != failed_backend)


def run_handshake(engine, backend: str,
                  lang: str | None = None,
                  timeout_s: int = 60,
                  broadcast: bool = True,
                  play_audio: bool = True) -> HandshakeResult:
    """Drive a first-run synthesis and verify audible output.

    This is the ONE function allowed to flip a "Voice engine ready"
    banner to green.  Call it after the engine's load path reports
    success; do not call it in parallel with load.

    Args:
        engine:     TTSEngine singleton.  Must expose
                    ``synthesize(text, path, language=...)``.
        backend:    Backend id (e.g. 'indic_parler', 'piper').
        lang:       ISO 639-1 code to greet in.  Falls back to
                    GREETING_FALLBACK_LANG when missing.
        timeout_s:  Wall-clock budget for synth + duration measurement.
                    First-run handshake should NOT block UI for >60s;
                    if the backend is that slow, the user needs to
                    know the voice isn't really ready.
        broadcast:  Push result via SSE (True in production, False
                    in unit tests that inspect the returned dataclass).
        play_audio: Play the clip locally so the user hears it.

    Returns:
        ``HandshakeResult`` — ``ok=True`` ONLY when synth produced
        audio that passed both the byte-count AND duration checks.

    This function never raises.  All failure modes are captured in
    ``result.err`` and the SSE payload.
    """
    lang_used, phrase = _pick_greeting(lang)
    cache_key = (backend, lang_used)

    # Fast path: one-shot per (engine, lang) per session.
    with _cache_lock:
        cached = _cache.get(cache_key)
    if cached is not None:
        logger.debug("handshake: cache hit for %s/%s (ok=%s)",
                     backend, lang_used, cached.ok)
        return cached

    # Import lazily so broken HARTOS modules don't crash boot.
    import importlib
    try:
        vs = importlib.import_module("tts.verified_synth")
    except Exception as e:
        result = HandshakeResult(
            ok=False, engine=backend, lang=lang_used, phrase=phrase,
            err=f"verified_synth unavailable: {e}",
            fallbacks=_suggest_fallbacks(backend),
        )
        if broadcast:
            _broadcast(result.to_event())
        return result

    import tempfile
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav", prefix=f"handshake_{backend}_")
    os.close(tmp_fd)

    # Delegate the actual synthesis to verify_backend_synth so there's
    # ONE code path that drives real synth for probing — do not duplicate.
    # verify_backend_synth chooses its phrase from core.constants.GREETINGS
    # (we refactored _TEST_PHRASES to import from there), so passing
    # lang=lang_used keeps the two in lock-step.
    t0 = time.monotonic()
    verdict = vs.verify_backend_synth(
        engine, backend, lang=lang_used,
        min_bytes=MIN_AUDIO_BYTES, timeout_s=timeout_s,
    )
    elapsed = time.monotonic() - t0

    # The verifier tears down its own temp file, so we synth again
    # into our own path only when verifier PASSED — we need the bytes
    # to play + attach to SSE.  On FAIL we already have enough info.
    if not verdict.ok:
        try:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
        except OSError:
            pass
        result = HandshakeResult(
            ok=False, engine=backend, lang=lang_used, phrase=phrase,
            n_bytes=verdict.n_bytes, elapsed_s=elapsed,
            err=verdict.err or "synthesis produced no audio",
            fallbacks=_suggest_fallbacks(backend),
        )
        with _cache_lock:
            _cache[cache_key] = result
        if broadcast:
            _broadcast(result.to_event())
        logger.warning("handshake: %s/%s FAIL — %s",
                       backend, lang_used, result.err)
        return result

    # Re-run synth to keep the bytes around for playback.  Same code
    # path — no parallel synth lane.
    try:
        if hasattr(engine, "set_backend"):
            try:
                prev = getattr(engine, "_active_backend", None)
                engine.set_backend(backend)
            except Exception:
                prev = None
        else:
            prev = None
        engine.synthesize(phrase, tmp_path, language=lang_used)
        if prev and hasattr(engine, "set_backend"):
            try:
                engine.set_backend(prev)
            except Exception:
                pass
    except Exception as e:
        logger.warning("handshake: post-verify synth failed: %s", e)

    n_bytes = os.path.getsize(tmp_path) if os.path.exists(tmp_path) else 0
    duration_s = _measure_duration(tmp_path, n_bytes) if n_bytes else 0.0
    ok = (n_bytes >= MIN_AUDIO_BYTES) and (duration_s >= MIN_DURATION_S)

    err = ""
    if not ok:
        # Verifier PASSED but our repeat synth or duration check didn't.
        # Report honestly — the banner must reflect reality, not the
        # most optimistic probe result.
        if n_bytes < MIN_AUDIO_BYTES:
            err = f"audio too small ({n_bytes}B < {MIN_AUDIO_BYTES}B)"
        else:
            err = (f"duration too short ({duration_s:.2f}s < "
                   f"{MIN_DURATION_S}s)")

    result = HandshakeResult(
        ok=ok, engine=backend, lang=lang_used, phrase=phrase,
        n_bytes=n_bytes, duration_s=duration_s, elapsed_s=elapsed,
        err=err, audio_path=tmp_path if ok else "",
        fallbacks=() if ok else _suggest_fallbacks(backend),
    )

    with _cache_lock:
        _cache[cache_key] = result

    if ok and play_audio:
        _play_locally(tmp_path)

    if broadcast:
        _broadcast(result.to_event())

    if ok:
        logger.info("handshake: %s/%s PASS (%d bytes, %.2fs audio, %.1fs total)",
                    backend, lang_used, n_bytes, duration_s, elapsed)
    else:
        logger.warning("handshake: %s/%s FAIL — %s",
                       backend, lang_used, err)

    return result


def retry(engine, backend: str, lang: str | None = None,
          timeout_s: int = 60) -> HandshakeResult:
    """User clicked "Retry" — clear the cached verdict and re-run.

    Public helper so the API / UI layer doesn't have to reach into
    ``_cache`` directly.
    """
    lang_used, _ = _pick_greeting(lang)
    with _cache_lock:
        _cache.pop((backend, lang_used), None)
    return run_handshake(engine, backend, lang=lang_used, timeout_s=timeout_s)


def invalidate(backend: str | None = None) -> None:
    """Clear cached verdicts.

    Called from the engine's backend-swap path so switching to a new
    backend forces a fresh handshake for that (backend, lang) pair.
    """
    with _cache_lock:
        if backend is None:
            _cache.clear()
        else:
            for key in [k for k in _cache if k[0] == backend]:
                _cache.pop(key, None)
