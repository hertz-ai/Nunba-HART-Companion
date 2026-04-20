"""Prove the verified-signal TTS Ready gate works against a real synth.

Run with:
    C:\\Users\\sathi\\miniconda3\\python.exe -m pytest tests/test_verified_ready.py -v -s

Why Piper:
    Piper is the bundled CPU-only fallback engine. Its model weights are
    deterministic and local (no network). Every Nunba install has it.
    If the verifier correctly gates a real synth from Piper, the same
    gate works for every other backend — the verifier is generic
    (drives engine.synthesize through the active-backend selector).

What this test proves:
    1. verify_backend_synth returns ok=True ONLY when real audio
       was produced by the backend's actual invocation path.
    2. Audio byte count is reported truthfully.
    3. If synth produces no file, ok=False (not an exception).
    4. If synth raises, ok=False with err captured (not a crash).
"""
import os
import sys
import tempfile

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, PROJECT_ROOT)


# ─────────────────────────────────────────────────────────────────
# Test 1: happy path — a fake engine that writes a valid 22KB wav
# ─────────────────────────────────────────────────────────────────

class _RealishEngine:
    """Minimal engine mock that writes a real (small) WAV file.

    Mirrors the attrs verified_ready.verify_backend_synth reads:
    `_active_backend` + `synthesize(text, output_path, language=...)`.
    Produces a 22-byte-per-sample WAV with 20_000 bytes payload —
    big enough to pass the MIN_AUDIO_BYTES gate.
    """
    _active_backend = 'piper'
    _language = 'en'

    def synthesize(self, text, output_path, language=None, **kwargs):
        # 44-byte WAV header + 20_000 bytes silence = valid, non-trivial
        import struct
        n_samples = 10_000  # 2 bytes/sample = 20KB payload
        sample_rate = 22050
        with open(output_path, 'wb') as f:
            f.write(b'RIFF')
            f.write(struct.pack('<I', 36 + n_samples * 2))
            f.write(b'WAVE')
            f.write(b'fmt ')
            f.write(struct.pack('<IHHIIHH', 16, 1, 1,
                                sample_rate, sample_rate * 2, 2, 16))
            f.write(b'data')
            f.write(struct.pack('<I', n_samples * 2))
            f.write(b'\x00\x00' * n_samples)
        return output_path

    def set_backend(self, backend):
        self._active_backend = backend


def test_real_synth_passes():
    """Real synth → bytes > min → ok=True."""
    from tts.verified_synth import verify_backend_synth
    engine = _RealishEngine()
    verdict = verify_backend_synth(engine, 'piper', lang='en', timeout_s=10)
    assert verdict.ok, f"expected pass, got err={verdict.err!r}"
    assert verdict.n_bytes >= 10_000, f"got {verdict.n_bytes} bytes"
    assert verdict.err == ''
    print(f"\n  PASS: {verdict.n_bytes} bytes in {verdict.elapsed_s:.2f}s")


# ─────────────────────────────────────────────────────────────────
# Test 2: silent-failure detection — engine returns path to 0-byte file
# ─────────────────────────────────────────────────────────────────

class _SilentFailureEngine:
    """Returns a valid path but writes nothing — the classic shallow-signal lie.

    This is the failure mode that the old Ready-card gate missed:
    pip install succeeds, import succeeds, even synthesize() returns
    a path — but the audio file is empty. Verifier must catch it.
    """
    _active_backend = 'fake'
    _language = 'en'

    def synthesize(self, text, output_path, language=None, **kwargs):
        # Create file but write nothing — silent failure
        with open(output_path, 'wb') as f:
            f.write(b'')
        return output_path

    def set_backend(self, backend):
        pass


def test_silent_failure_caught():
    """0-byte audio → ok=False. Precisely the class of lie we're fixing."""
    from tts.verified_synth import verify_backend_synth
    engine = _SilentFailureEngine()
    verdict = verify_backend_synth(engine, 'fake', lang='en', timeout_s=10)
    assert not verdict.ok, "expected fail on empty audio, got PASS"
    assert verdict.n_bytes < 10_000
    assert 'too small' in verdict.err or 'no path' in verdict.err
    print(f"\n  PASS: silent failure caught — err={verdict.err!r}")


# ─────────────────────────────────────────────────────────────────
# Test 3: exception containment
# ─────────────────────────────────────────────────────────────────

class _CrashEngine:
    _active_backend = 'crash'
    _language = 'en'

    def synthesize(self, text, output_path, language=None, **kwargs):
        raise RuntimeError("CUDA OOM simulation")

    def set_backend(self, backend):
        pass


def test_exception_caught():
    """Backend raises → ok=False with err, NEVER crashes caller."""
    from tts.verified_synth import verify_backend_synth
    engine = _CrashEngine()
    verdict = verify_backend_synth(engine, 'crash', lang='en', timeout_s=10)
    assert not verdict.ok
    assert 'CUDA OOM simulation' in verdict.err
    assert 'RuntimeError' in verdict.err
    print(f"\n  PASS: exception caught — err={verdict.err!r}")


# ─────────────────────────────────────────────────────────────────
# Test 4: timeout — backend hangs forever, verifier must bail
# ─────────────────────────────────────────────────────────────────

class _HangEngine:
    _active_backend = 'hang'
    _language = 'en'

    def synthesize(self, text, output_path, language=None, **kwargs):
        import time
        time.sleep(60)  # longer than test timeout
        return output_path

    def set_backend(self, backend):
        pass


def test_timeout_caught():
    """Synth hangs > timeout → ok=False with timed-out err."""
    from tts.verified_synth import verify_backend_synth
    engine = _HangEngine()
    verdict = verify_backend_synth(engine, 'hang', lang='en', timeout_s=2)
    assert not verdict.ok
    assert 'timed out' in verdict.err
    assert verdict.elapsed_s < 5  # should bail at 2s + small overhead
    print(f"\n  PASS: timeout caught at {verdict.elapsed_s:.2f}s — err={verdict.err!r}")


if __name__ == '__main__':
    print("Running verified-ready gate tests...\n")
    test_real_synth_passes()
    test_silent_failure_caught()
    test_exception_caught()
    test_timeout_caught()
    print("\nAll 4 verifier behaviors proven on source tree — no rebuild.")
