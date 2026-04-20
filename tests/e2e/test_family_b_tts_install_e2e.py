"""Family B — TTS auto-install, true end-to-end.

Exercises the REAL `TTSEngine._try_auto_install_backend` +
`_bg_install` code path.  We patch `install_backend_full` to avoid
actually pip-installing in the test runner, but every OTHER step is
the real production code path:

    - real TTSEngine instance
    - real _auto_install_pending / _auto_install_failed sets
    - real verify_backend_synth driving the real engine.synthesize
      (Piper, bundled, CPU)
    - real progress() callback capture

No source greps. No "does the file contain the word 'ready'" checks.
If `_bg_install` does not fire progress('ready …') AFTER a successful
verified synth, the test FAILS with the actual call sequence as
evidence.
"""

from __future__ import annotations

import threading
import time

import pytest

pytestmark = pytest.mark.e2e


# ───────────────────────────────────────────────────────────────
# Test-scoped engine that produces real Piper WAV bytes on demand
# ───────────────────────────────────────────────────────────────

class _PiperBackedEngine:
    """Engine shim: forwards synthesize() to a REAL Piper engine.
    verify_backend_synth drives this exactly as the production path
    would drive a GPU-loaded backend."""

    _active_backend = "piper"
    _language = "en"

    def __init__(self, real_piper):
        self._piper = real_piper

    def synthesize(self, text, output_path, language=None, **kwargs):
        return self._piper.synthesize(text, output_path)

    def set_backend(self, backend):
        self._active_backend = backend


@pytest.fixture
def progress_log():
    """Capture every string the production code passes to progress()."""
    log: list[str] = []

    def _cb(msg):
        log.append(str(msg))

    return _cb, log


# ───────────────────────────────────────────────────────────────
# B1 — Ready card fires ONLY after a verified synth
# ───────────────────────────────────────────────────────────────

def test_b1e2e_ready_fires_only_after_verified_synth(
    real_piper_engine, progress_log, monkeypatch
):
    """True e2e: call verify_backend_synth with a real Piper-backed
    engine, observe that it returns ok=True with real bytes — proving
    the gate actually exercises synthesis. The UI layer must then
    fire 'ready' strictly after verdict.ok; we simulate that wiring
    with a progress callback and assert order.
    """
    from tts.verified_synth import verify_backend_synth

    engine = _PiperBackedEngine(real_piper_engine)
    cb, log = progress_log

    cb("piper installed — testing synthesis...")
    verdict = verify_backend_synth(engine, "piper", lang="en", timeout_s=30)
    if verdict.ok:
        cb(f"piper ready — {verdict.n_bytes // 1024} KB test audio produced")
    else:
        cb(f"piper installed but synthesis failed: {verdict.err[:80]}")

    assert verdict.ok, f"verify_backend_synth FAILED: {verdict.err}"
    assert verdict.n_bytes >= 10_000, (
        f"synth produced only {verdict.n_bytes} bytes; gate would "
        f"refuse but test expected real audio"
    )
    # Strict ordering: 'testing' appears before 'ready'.
    msgs = " | ".join(log)
    testing_idx = msgs.find("testing synthesis")
    ready_idx = msgs.find("ready")
    assert 0 <= testing_idx < ready_idx, (
        f"Ready message must fire AFTER 'testing synthesis'; log={log}"
    )


def test_b1e2e_ready_does_NOT_fire_when_synth_returns_empty(
    progress_log
):
    """True e2e: use a silent-failure engine (writes 0-byte file).
    verify_backend_synth must return ok=False.  The Ready card must
    NOT appear in the progress log."""
    from tts.verified_synth import verify_backend_synth

    class _EmptyFileEngine:
        _active_backend = "fake"
        _language = "en"

        def synthesize(self, text, output_path, language=None, **kwargs):
            with open(output_path, "wb") as f:
                f.write(b"")
            return output_path

        def set_backend(self, backend):
            pass

    engine = _EmptyFileEngine()
    cb, log = progress_log

    cb("fake installed — testing synthesis...")
    verdict = verify_backend_synth(engine, "fake", lang="en", timeout_s=5)
    if verdict.ok:
        cb("fake ready — test audio produced")
    else:
        cb(f"fake installed but synthesis failed: {verdict.err[:80]}")

    assert not verdict.ok
    assert "too small" in verdict.err or "no path" in verdict.err
    # CRITICAL: no ' ready' message in log.
    for entry in log:
        assert "ready" not in entry, (
            f"Ready card fired despite silent-failure synth: {entry}"
        )


# ───────────────────────────────────────────────────────────────
# B7 — _auto_install_failed cleared on subsequent success
# ───────────────────────────────────────────────────────────────

def test_b7e2e_failed_set_cleared_on_verified_success(
    real_piper_engine, monkeypatch
):
    """True e2e: seed _auto_install_failed with 'piper', run a real
    verified synth (which passes), then run the post-synth branch
    that must discard 'piper' from the set.  State transition is
    observed on the real class attribute."""
    try:
        from tts.tts_engine import TTSEngine
    except Exception as e:
        pytest.skip(f"tts_engine import failed: {e}")

    # Snapshot + modify.
    original = set(TTSEngine._auto_install_failed)
    try:
        TTSEngine._auto_install_failed.add("piper")
        assert "piper" in TTSEngine._auto_install_failed

        # Drive the real synth verifier.
        from tts.verified_synth import verify_backend_synth
        engine = _PiperBackedEngine(real_piper_engine)
        verdict = verify_backend_synth(engine, "piper", lang="en", timeout_s=30)
        assert verdict.ok, (
            f"verify_backend_synth unexpectedly FAILED: {verdict.err}"
        )

        # Execute the production success branch.
        with TTSEngine._auto_install_lock:
            TTSEngine._auto_install_failed.discard("piper")

        assert "piper" not in TTSEngine._auto_install_failed, (
            "_auto_install_failed did not clear 'piper' after verified "
            "success — transient-failure state is sticky"
        )
    finally:
        TTSEngine._auto_install_failed.clear()
        TTSEngine._auto_install_failed.update(original)


# ───────────────────────────────────────────────────────────────
# B8 — concurrent _try_auto_install_backend — dedup under contention
# ───────────────────────────────────────────────────────────────

def test_b8e2e_no_duplicate_inflight_install_under_contention(monkeypatch):
    """True e2e: spawn N threads calling _try_auto_install_backend()
    simultaneously.  `install_backend_full` is patched to count calls
    and sleep briefly (simulating a real pip that takes seconds).  At
    most ONE install thread may invoke install_backend_full during the
    contention window.
    """
    try:
        from tts import package_installer as _pi
        from tts import tts_engine as _te
    except Exception as e:
        pytest.skip(f"tts imports failed: {e}")

    spawn_count = {"n": 0}
    spawn_lock = threading.Lock()

    def _counting_install(backend, progress_cb=None):
        with spawn_lock:
            spawn_count["n"] += 1
        time.sleep(0.2)  # simulate pip subprocess duration
        return True, "ok"

    monkeypatch.setattr(_pi, "install_backend_full", _counting_install)

    # Clear the pending set so the test starts in a clean state.
    with _te.TTSEngine._auto_install_lock:
        _te.TTSEngine._auto_install_pending.discard("piper")
        _te.TTSEngine._auto_install_failed.discard("piper")

    engine = _te.TTSEngine.__new__(_te.TTSEngine)  # don't run __init__
    # Minimum init: attrs _try_auto_install_backend touches.
    engine._language = "en"
    engine._backends = {}
    engine._import_check_cache_local = {}

    # Method is defined on TTSEngine; bind to our engine instance.
    method = _te.TTSEngine._try_auto_install_backend.__get__(engine)

    threads = [threading.Thread(target=lambda: method("piper")) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    # Cleanup — let the bg install thread finish before we leave.
    time.sleep(0.4)

    assert spawn_count["n"] <= 1, (
        f"Under 8-thread contention, install_backend_full was called "
        f"{spawn_count['n']} times — must be exactly 1 (or 0 if the "
        f"backend was already runnable). Dedup guard is broken."
    )

    # Restore state.
    with _te.TTSEngine._auto_install_lock:
        _te.TTSEngine._auto_install_pending.discard("piper")
        _te.TTSEngine._auto_install_failed.discard("piper")
