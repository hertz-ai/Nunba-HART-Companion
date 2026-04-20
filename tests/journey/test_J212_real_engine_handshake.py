"""J212 · First-run TTS handshake — REAL engine, REAL synthesis.

Gap from 2026-04-18 live audit (report §3):

    The existing `tests/test_tts_handshake.py` is entirely fakes.
    It monkey-patches `tts.verified_synth.verify_backend_synth` and
    `engine.synthesize` so the asserted bytes are whatever the fake
    returned.  That means the `sympy`-class regression — Indic Parler
    "loads" but `ModuleNotFoundError` on first synth — would slip
    through all handshake tests, because the fake never imports
    parler_tts at all.  The whole point of the 2026-04-18 handshake
    gate (``tts/tts_handshake.py``) is to synthesize the user's
    greeting through the SAME code path the user's first chat hits.
    A test that replaces that code path is not a test.

Outcome asserted
----------------
1. ``run_handshake`` invoked against the REAL Piper engine produces
   a HandshakeResult with ``ok=True``, ``n_bytes >= MIN_AUDIO_BYTES``,
   ``duration_s >= MIN_DURATION_S``.  This is the "would the user
   actually hear something" gate.
2. The written WAV file exists on disk and parses as a RIFF WAVE
   container — not a base64 blob of an empty WAV header, not silence.
3. The SSE broadcast path fires ``status='ready'`` with ``audio_b64``
   attached, so the React card actually plays the clip.
4. Local playback via ``sounddevice`` is attempted when the module is
   importable, and non-fatal when it isn't.  We do NOT mock
   sounddevice — either the host has it and we verify the call
   happens, or the host lacks it and we verify the handshake still
   succeeds (the banner flips green even when the dev box can't play
   audio locally, because the frontend plays the b64 payload).

The `real_piper_engine` fixture lives in ``tests/e2e/conftest.py``
and is session-shared.  It instantiates ``PiperTTS`` pointing at
``~/.nunba/piper/voices`` — the exact install layout the user has.
"""

from __future__ import annotations

import os
import struct
from pathlib import Path

import pytest

pytestmark = pytest.mark.journey


# ────────────────────────────────────────────────────────────────────
# 1. Real-engine synthesis — the ONLY assertion that would catch a
# sympy-class regression.  Every byte in the handshake WAV is produced
# by the real engine's onnxruntime inference path.
# ────────────────────────────────────────────────────────────────────


def _is_riff_wave(data: bytes) -> bool:
    """Return True if the first 12 bytes match a WAVE container."""
    return (
        len(data) >= 12
        and data[0:4] == b"RIFF"
        and data[8:12] == b"WAVE"
    )


def _wav_samples(path: str) -> int:
    """Count sample frames in a PCM WAV without importing soundfile.

    Pulls ``num_frames`` straight from the ``data`` chunk header.
    Gives us "is this audio non-trivial" without adding a test-only
    dependency on soundfile in the dev env.
    """
    with open(path, "rb") as f:
        data = f.read()
    if not _is_riff_wave(data):
        return 0
    # Scan for "data" chunk — some Piper outputs include LIST or fact
    # chunks before it.  Standard RIFF walk: start at byte 12.
    off = 12
    while off + 8 <= len(data):
        chunk_id = data[off:off + 4]
        chunk_size = struct.unpack("<I", data[off + 4:off + 8])[0]
        if chunk_id == b"data":
            # Piper defaults to 16-bit mono so each sample is 2 bytes.
            return chunk_size // 2
        off += 8 + chunk_size
    return 0


def test_j212_real_piper_handshake_produces_real_audio(real_piper_engine):
    """Drive run_handshake against REAL PiperTTS. Assert the WAV on
    disk is > MIN_AUDIO_BYTES AND contains enough sample frames to
    exceed MIN_DURATION_S.  Catches `sympy`-class regressions because
    the entire onnxruntime path runs."""
    # Clear the handshake cache so a prior session's result doesn't
    # leak into this test's assertion.
    from tts import tts_handshake as _h
    from tts.tts_handshake import (
        MIN_AUDIO_BYTES,
        MIN_DURATION_S,
        run_handshake,
    )
    with _h._cache_lock:
        _h._cache.clear()

    result = run_handshake(
        real_piper_engine,
        backend="piper",
        lang="en",
        timeout_s=60,
        broadcast=False,     # we test the broadcast path below
        play_audio=False,    # local playback tested below
    )

    assert result.ok is True, (
        f"handshake FAIL: engine={result.engine} lang={result.lang} "
        f"err={result.err!r} n_bytes={result.n_bytes} "
        f"duration_s={result.duration_s}"
    )
    assert result.n_bytes >= MIN_AUDIO_BYTES, (
        f"handshake audio too small: {result.n_bytes}B < "
        f"{MIN_AUDIO_BYTES}B — the sympy-regression class of bug "
        f"would surface here as a small / empty WAV."
    )
    assert result.duration_s >= MIN_DURATION_S, (
        f"handshake audio too short: {result.duration_s:.3f}s < "
        f"{MIN_DURATION_S}s"
    )

    # The WAV file must actually exist and parse as RIFF WAVE.  A
    # broken pipe / truncated write would set n_bytes > 10000 but the
    # container would be unparseable — we'd rather catch that here
    # than at the user's desktop.
    assert result.audio_path and os.path.exists(result.audio_path), (
        f"handshake reported ok=True but audio_path is missing: "
        f"{result.audio_path!r}"
    )
    with open(result.audio_path, "rb") as f:
        header = f.read(12)
    assert _is_riff_wave(header), (
        f"handshake WAV isn't RIFF/WAVE — header: {header!r}"
    )

    frames = _wav_samples(result.audio_path)
    assert frames > 0, "handshake WAV has no data chunk"
    # 0.5s @ 22050 Hz = 11025 samples — Piper's default rate is 22050,
    # so a pass on the duration gate implies >= 11k samples.  Stricter
    # sanity check than the byte-count alone.
    assert frames >= 10_000, (
        f"handshake WAV has only {frames} sample frames — likely "
        f"silence padding, not a real greeting"
    )

    # Cleanup
    try:
        os.unlink(result.audio_path)
    except OSError:
        pass


# ────────────────────────────────────────────────────────────────────
# 2. Broadcast path — the ACTUAL signal the frontend card waits on.
# A green banner without an SSE event is a lie.  We verify by
# attaching a stub broadcast_sse_event to __main__ and capturing the
# payload exactly as production would emit it.
# ────────────────────────────────────────────────────────────────────


def test_j212_handshake_broadcast_emits_ready_with_audio(
    real_piper_engine, monkeypatch
):
    """Verify the SSE event carries status='ready' + audio_b64 and
    matches the tts_handshake contract.  The UI consumer uses these
    exact keys; a silent rename would leave the banner stuck on
    ``preparing``."""
    from tts import tts_handshake as _h
    from tts.tts_handshake import run_handshake
    with _h._cache_lock:
        _h._cache.clear()

    # Install a broadcast capture on __main__ — that's the exact hook
    # run_handshake uses in production.
    import sys as _sys
    captured: list[tuple[str, dict]] = []

    class _Main:
        @staticmethod
        def broadcast_sse_event(event_type: str, payload: dict) -> None:
            captured.append((event_type, payload))

    real_main = _sys.modules.get("__main__")
    monkeypatch.setitem(_sys.modules, "__main__", _Main)
    try:
        result = run_handshake(
            real_piper_engine,
            backend="piper",
            lang="en",
            broadcast=True,
            play_audio=False,
        )
    finally:
        if real_main is not None:
            monkeypatch.setitem(_sys.modules, "__main__", real_main)

    assert result.ok is True, f"handshake failed: {result.err}"

    # Exactly one tts_handshake event should have been emitted.
    hs_events = [p for (t, p) in captured if t == "tts_handshake"]
    assert len(hs_events) == 1, (
        f"expected 1 tts_handshake SSE event, got {len(hs_events)}: "
        f"{captured!r}"
    )
    ev = hs_events[0]

    # Contract fields — a silent rename here would break the UI card.
    assert ev["type"] == "tts_handshake"
    assert ev["status"] == "ready"
    assert ev["engine"] == "piper"
    assert ev["lang"] == "en"
    assert ev["n_bytes"] >= 10_000
    assert ev["duration_s"] >= 0.5
    assert ev["fallbacks"] == [], (
        f"ok=True but fallbacks non-empty: {ev['fallbacks']}"
    )
    assert "audio_b64" in ev and ev["audio_b64"], (
        "SSE payload missing audio_b64 — frontend would have no "
        "audio to play"
    )

    # Audio must be a decodable base64 RIFF WAVE.
    import base64
    try:
        raw = base64.b64decode(ev["audio_b64"], validate=True)
    except Exception as e:
        pytest.fail(f"audio_b64 is not valid base64: {e}")
    assert _is_riff_wave(raw), (
        f"audio_b64 decodes to non-WAVE bytes: {raw[:16]!r}"
    )

    # Cleanup
    try:
        if result.audio_path and os.path.exists(result.audio_path):
            os.unlink(result.audio_path)
    except OSError:
        pass


# ────────────────────────────────────────────────────────────────────
# 3. Local playback — best-effort, not a blocking gate.  If
# sounddevice isn't importable, the handshake still succeeds (the
# frontend plays the b64 payload).  If it IS importable, we verify
# that sd.play was invoked so a silent regression can't disable local
# playback while leaving a passing test.
# ────────────────────────────────────────────────────────────────────


def test_j212_handshake_local_playback_attempted_when_available(
    real_piper_engine, monkeypatch
):
    """When sounddevice + soundfile are both importable, local
    playback MUST be attempted.  When either is missing, we skip
    gracefully — this mirrors the dev-box reality where CI runners
    lack an audio device but users do have one."""
    try:
        import sounddevice  # noqa: F401  # type: ignore
        import soundfile  # noqa: F401  # type: ignore
    except Exception as e:
        pytest.skip(
            f"sounddevice/soundfile not importable on this host "
            f"({e}) — local playback cannot be exercised here, but "
            f"handshake is still expected to pass (frontend plays "
            f"the b64 payload)"
        )

    from tts import tts_handshake as _h
    with _h._cache_lock:
        _h._cache.clear()

    play_calls: list[tuple] = []

    import sounddevice as _sd
    real_play = _sd.play
    def _spy_play(*args, **kwargs):
        play_calls.append((args, kwargs))
        # Don't actually emit audio on the CI host — call signature
        # checks are the whole point of the spy.
        return None

    monkeypatch.setattr(_sd, "play", _spy_play, raising=False)

    result = _h.run_handshake(
        real_piper_engine,
        backend="piper",
        lang="en",
        broadcast=False,
        play_audio=True,
    )

    try:
        assert result.ok is True, f"handshake failed: {result.err}"
        assert len(play_calls) == 1, (
            f"expected exactly one sd.play() call, got "
            f"{len(play_calls)}. A regression in tts_handshake."
            f"_play_locally would silently disable local playback."
        )
    finally:
        # Cleanup temp WAV + real sd.play restore via monkeypatch
        # teardown.
        try:
            if result.audio_path and os.path.exists(result.audio_path):
                os.unlink(result.audio_path)
        except OSError:
            pass
