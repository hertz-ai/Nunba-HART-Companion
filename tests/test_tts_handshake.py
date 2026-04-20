"""First-run TTS handshake smoke test.

Gates tested:
    1. Empty audio output → handshake FAIL → banner NEVER flips ready.
    2. Below-threshold audio (200 bytes) → FAIL.
    3. Valid >8KB real WAV → PASS (status='ready').
    4. Synth exception → FAIL (status='failed' + err set, no crash).
    5. One-shot cache: second call returns cached result without re-synth.
    6. retry() clears the cache and re-synths.
    7. Fallback ladder drops the failed engine from the suggested list.

These tests stay in-process — no subprocess, no real TTS backend.
Each fake engine implements the minimum surface `run_handshake` relies
on: ``synthesize(text, output_path, language=...)`` and an optional
``set_backend``.  Matches the fake-engine pattern used by
tests/test_verified_ready.py so both tests can exercise the SAME
production code path with the SAME test doubles.
"""
import os
import struct
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, PROJECT_ROOT)


# ──────────────────────────────────────────────────────────────────────
# Shared fake-engine builders — one per failure mode the handshake
# must catch.  Each writes to `output_path` exactly the way a real
# backend does (or intentionally fails to do so), so the handshake
# exercises its full byte-counting + duration branch.
# ──────────────────────────────────────────────────────────────────────

def _write_valid_wav(path: str, n_samples: int = 12000, rate: int = 22050) -> None:
    """Write a ~0.54s 22kHz mono 16-bit silent WAV — passes both
    MIN_AUDIO_BYTES (~24KB of data) and MIN_DURATION_S (~0.54s > 0.5s).
    """
    with open(path, 'wb') as f:
        f.write(b'RIFF')
        f.write(struct.pack('<I', 36 + n_samples * 2))
        f.write(b'WAVE')
        f.write(b'fmt ')
        f.write(struct.pack('<IHHIIHH', 16, 1, 1, rate, rate * 2, 2, 16))
        f.write(b'data')
        f.write(struct.pack('<I', n_samples * 2))
        f.write(b'\x00\x00' * n_samples)


class _EmptyBytesEngine:
    """Returns path to a 0-byte file — the silent-failure class."""
    _active_backend = 'fake_empty'
    _language = 'en'

    def synthesize(self, text, output_path, language=None, **kwargs):
        with open(output_path, 'wb') as f:
            f.write(b'')
        return output_path

    def set_backend(self, backend):
        pass


class _ShortBytesEngine:
    """Writes ~200 bytes — well below MIN_AUDIO_BYTES."""
    _active_backend = 'fake_short'
    _language = 'en'

    def synthesize(self, text, output_path, language=None, **kwargs):
        with open(output_path, 'wb') as f:
            f.write(b'RIFF' + b'\x00' * 196)
        return output_path

    def set_backend(self, backend):
        pass


class _ValidWavEngine:
    """Writes a real >10KB / >0.5s WAV — handshake should PASS."""
    _active_backend = 'fake_ok'
    _language = 'en'

    def synthesize(self, text, output_path, language=None, **kwargs):
        _write_valid_wav(output_path)
        return output_path

    def set_backend(self, backend):
        self._active_backend = backend


class _CrashEngine:
    _active_backend = 'fake_crash'
    _language = 'en'

    def synthesize(self, text, output_path, language=None, **kwargs):
        raise RuntimeError("sympy missing: parler_tts broken")

    def set_backend(self, backend):
        pass


# Each test clears the handshake cache so results don't leak across
# tests.  The module-level lock makes the clear thread-safe.
def _clear_cache():
    from tts import tts_handshake
    tts_handshake.invalidate()


# ══════════════════════════════════════════════════════════════════════
# Tests
# ══════════════════════════════════════════════════════════════════════

def test_empty_bytes_fails_handshake():
    """0-byte audio → status='failed', banner must NOT flip to ready."""
    _clear_cache()
    from tts.tts_handshake import run_handshake
    engine = _EmptyBytesEngine()
    result = run_handshake(engine, 'fake_empty', lang='en',
                           timeout_s=5, broadcast=False, play_audio=False)
    assert result.ok is False, "0-byte audio must not pass the gate"
    event = result.to_event()
    assert event['status'] == 'failed'
    assert event['err'], "empty audio must surface a specific error"
    # Fallbacks must be offered so the UI can render Switch-engine buttons.
    assert isinstance(event.get('fallbacks'), list)
    assert 'piper' in event['fallbacks']


def test_short_bytes_fails_handshake():
    """Under-threshold audio (200B < 10KB) → status='failed'."""
    _clear_cache()
    from tts.tts_handshake import run_handshake
    engine = _ShortBytesEngine()
    result = run_handshake(engine, 'fake_short', lang='en',
                           timeout_s=5, broadcast=False, play_audio=False)
    assert result.ok is False, "200-byte audio must fail the gate"
    assert result.to_event()['status'] == 'failed'
    assert result.err, "short-audio failure must surface err"


def test_valid_wav_passes_handshake():
    """Real >10KB audio with >0.5s duration → status='ready'."""
    _clear_cache()
    from tts.tts_handshake import run_handshake
    engine = _ValidWavEngine()
    result = run_handshake(engine, 'fake_ok', lang='en',
                           timeout_s=5, broadcast=False, play_audio=False)
    assert result.ok is True, f"valid WAV must pass, got err={result.err!r}"
    assert result.n_bytes >= 10_000
    event = result.to_event()
    assert event['status'] == 'ready'
    # Banner confidence signal: frontend plays the audio inline.
    assert 'audio_b64' in event and event['audio_b64'], (
        "passing handshake must attach playable audio so the user "
        "actually hears the greeting"
    )


def test_synth_exception_caught_as_failed():
    """Backend raises (e.g. sympy-missing ModuleNotFoundError) → FAIL.

    This is the exact class of failure the 2026-04-18 prod log hit.
    Indic Parler crashed at synthesize() time with
    ModuleNotFoundError: 'sympy'.  The banner must now say FAILED
    with the error surfaced — NOT a green "Ready" lie.
    """
    _clear_cache()
    from tts.tts_handshake import run_handshake
    engine = _CrashEngine()
    result = run_handshake(engine, 'fake_crash', lang='en',
                           timeout_s=5, broadcast=False, play_audio=False)
    assert result.ok is False, "exceptions must be caught as FAILED"
    assert 'sympy missing' in result.err or 'RuntimeError' in result.err
    assert result.to_event()['status'] == 'failed'


def test_handshake_is_one_shot_per_engine_lang():
    """Second call returns cached result — does NOT re-run synth."""
    _clear_cache()
    from tts.tts_handshake import run_handshake

    class _CountingEngine(_ValidWavEngine):
        synth_calls = 0
        _active_backend = 'fake_counting'

        def synthesize(self, text, output_path, language=None, **kwargs):
            type(self).synth_calls += 1
            return super().synthesize(text, output_path, language=language)

    engine = _CountingEngine()
    r1 = run_handshake(engine, 'fake_counting', lang='en',
                       timeout_s=5, broadcast=False, play_audio=False)
    r2 = run_handshake(engine, 'fake_counting', lang='en',
                       timeout_s=5, broadcast=False, play_audio=False)
    assert r1.ok and r2.ok
    # run_handshake internally synthesizes twice (verify + replay) on
    # the FIRST call; cached second call should not invoke synth again.
    first_call_count = _CountingEngine.synth_calls
    assert first_call_count >= 1
    # Third call must still be cached
    run_handshake(engine, 'fake_counting', lang='en',
                  timeout_s=5, broadcast=False, play_audio=False)
    assert _CountingEngine.synth_calls == first_call_count, (
        "cached handshake must not re-synth"
    )


def test_retry_clears_cache_and_reruns():
    """retry() clears the cache so user-initiated retry actually
    re-attempts synthesis — the whole point of the Retry button.
    """
    _clear_cache()
    from tts.tts_handshake import retry, run_handshake

    class _FlipEngine:
        """First synth fails (empty), second succeeds — simulates a
        transient backend hiccup that clears on retry."""
        _active_backend = 'fake_flip'
        _language = 'en'
        calls = 0

        def synthesize(self, text, output_path, language=None, **kwargs):
            type(self).calls += 1
            if type(self).calls == 1:
                with open(output_path, 'wb') as f:
                    f.write(b'')
            else:
                _write_valid_wav(output_path)
            return output_path

        def set_backend(self, backend):
            pass

    engine = _FlipEngine()
    r1 = run_handshake(engine, 'fake_flip', lang='en',
                       timeout_s=5, broadcast=False, play_audio=False)
    assert r1.ok is False, "first attempt should fail"

    r2 = retry(engine, 'fake_flip', lang='en', timeout_s=5)
    assert r2.ok is True, "retry should bypass the cache and succeed"


def test_fallback_ladder_drops_failed_engine():
    """UI must not offer the engine that just failed as a 'Switch to'.

    Prevents the obvious foot-gun where the user clicks Switch on
    Piper and we suggest Piper.
    """
    _clear_cache()
    from tts.tts_handshake import run_handshake
    engine = _EmptyBytesEngine()
    result = run_handshake(engine, 'piper', lang='en',
                           timeout_s=5, broadcast=False, play_audio=False)
    assert result.ok is False
    assert 'piper' not in result.fallbacks, (
        "failed engine must not appear in its own fallback list"
    )


def test_greeting_lang_fallback_to_english():
    """Request for an unsupported lang falls back to English greeting.

    Banner must still work — even if we don't have a Klingon phrase,
    we still run a real synth probe rather than silently skip it.
    """
    _clear_cache()
    from core.constants import GREETING_FALLBACK_LANG, GREETINGS

    from tts.tts_handshake import run_handshake
    engine = _ValidWavEngine()
    result = run_handshake(engine, 'fake_ok', lang='tlh',  # Klingon
                           timeout_s=5, broadcast=False, play_audio=False)
    assert result.ok is True
    # The result reports the effective lang used, not the requested one.
    assert result.lang == GREETING_FALLBACK_LANG
    assert result.phrase == GREETINGS[GREETING_FALLBACK_LANG]


if __name__ == '__main__':
    test_empty_bytes_fails_handshake()
    test_short_bytes_fails_handshake()
    test_valid_wav_passes_handshake()
    test_synth_exception_caught_as_failed()
    test_handshake_is_one_shot_per_engine_lang()
    test_retry_clears_cache_and_reruns()
    test_fallback_ladder_drops_failed_engine()
    test_greeting_lang_fallback_to_english()
    print("All handshake tests passed.")
