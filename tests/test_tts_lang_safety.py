"""
TTS wrong-language safety gate — regression tests for the silent
CosyVoice-mumbling-for-Tamil bug surfaced by data-scientist cohort
analysis on 2026-04-15.

Contract under test:
  * A non-English synth request whose capable-backend allowlist is
    entirely unavailable must return ``None`` (NOT Piper English
    phonemes).  Chat pipeline treats None as "text-only display".
  * English synth requests must still fall through to Kokoro/Piper
    as usual.
  * Hindi / Tamil synth requests with Indic Parler available must
    route to Indic Parler.

We exercise ``TTSEngine._synthesize_with_fallback`` directly with a
stub instance — full engine init loads torch/CUDA which is neither
available nor desirable on CI.
"""
from __future__ import annotations

import os
import sys
import types
from unittest.mock import patch

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from tts.tts_engine import (  # noqa: E402
    _LANG_CAPABLE_BACKENDS,
    BACKEND_CHATTERBOX_ML,
    BACKEND_CHATTERBOX_TURBO,
    BACKEND_COSYVOICE3,
    BACKEND_F5,
    BACKEND_INDIC_PARLER,
    BACKEND_KOKORO,
    BACKEND_NONE,
    BACKEND_PIPER,
    TTSEngine,
    _capable_backends_for,
    _normalize_lang,
)


# ---------------------------------------------------------------------------
# 0. Pure-data assertions on the allowlist itself (cheap sanity)
# ---------------------------------------------------------------------------
def test_tamil_allowlist_prefers_indic_parler():
    """Tamil routing MUST include Indic Parler (authoritative 21-Indic
    TTS) as the primary backend.  Chatterbox ML is allowed as a local
    fallback (see tts_engine.py lines 291-304 comment) so a broken
    Indic Parler import doesn't demote the user to text-only.
    CosyVoice3 must STILL be excluded — it doesn't speak any Indic
    language.
    """
    allowed = _LANG_CAPABLE_BACKENDS['ta']
    from tts.tts_engine import BACKEND_COSYVOICE3
    assert BACKEND_INDIC_PARLER in allowed, \
        "indic_parler missing from Tamil allowlist"
    assert BACKEND_COSYVOICE3 not in allowed, \
        "cosyvoice3 must not be in any Indic-lang allowlist"
    # Chatterbox ML is allowed but not required.


def test_english_allowlist_includes_piper():
    """English must keep Piper as an always-capable fallback."""
    assert BACKEND_PIPER in _LANG_CAPABLE_BACKENDS['en']
    assert BACKEND_KOKORO in _LANG_CAPABLE_BACKENDS['en']


def test_cosyvoice_not_capable_for_any_indic_lang():
    """Guard against regression: CosyVoice3 must NEVER appear in an
    Indic lang allowlist — it doesn't speak any Indic language."""
    from tts.tts_engine import _INDIC_LANGS
    for lang in _INDIC_LANGS:
        assert BACKEND_COSYVOICE3 not in _LANG_CAPABLE_BACKENDS[lang], (
            f"CosyVoice3 leaked into Indic allowlist for {lang}"
        )


def test_piper_not_capable_for_any_indic_lang():
    """Piper is English-only.  Must never appear in Indic allowlist."""
    from tts.tts_engine import _INDIC_LANGS
    for lang in _INDIC_LANGS:
        assert BACKEND_PIPER not in _LANG_CAPABLE_BACKENDS[lang]


def test_normalize_lang():
    assert _normalize_lang('en-US') == 'en'
    assert _normalize_lang('ta_IN') == 'ta'
    assert _normalize_lang(None) == 'en'


# ---------------------------------------------------------------------------
# 1. _synthesize_with_fallback behavior — build a minimal fake engine
# ---------------------------------------------------------------------------
def _make_stub_engine(active_backend=BACKEND_COSYVOICE3):
    """Construct a TTSEngine instance without running __init__ (which
    imports torch / loads GPU backends).  We only need the attributes
    `_synthesize_with_fallback` touches.

    Adds the demotion-tracker attributes that landed alongside the
    ``_is_demoted`` / consecutive-failure logic — without them the
    stub engine raises AttributeError before the routing decision
    we're trying to test.  We do NOT modify the demotion logic
    itself; we just initialise the attributes the real ``__init__``
    would have set, so the stub matches a fresh engine instance.
    """
    engine = TTSEngine.__new__(TTSEngine)
    engine._active_backend = active_backend
    engine._backends = {}
    engine._language = 'en'
    # Demotion tracker — empty set + zeroed counters mean "no backend
    # is currently demoted".  The routing path under test reads but
    # never writes these in the failure scenarios we exercise.
    engine._demoted_backends = set()
    engine._consecutive_failures = {}
    engine._failure_threshold = 3
    return engine


class _FakeOKBackend:
    """Stub that 'succeeds' — returns the output path."""
    def __init__(self, name):
        self.name = name

    def synthesize(self, text, output_path=None, **kwargs):
        return output_path or f"/tmp/fake_{self.name}.wav"


def test_tamil_returns_none_when_no_capable_backend_fits(caplog):
    """GAP 1 core regression: Tamil + no Indic Parler + no
    Chatterbox ML → must return None, NOT produce CosyVoice audio."""
    engine = _make_stub_engine(active_backend=BACKEND_COSYVOICE3)

    # Pretend every backend's creation fails → candidates exist in
    # `prefs` but none can be instantiated.  The capability filter
    # must fire BEFORE Piper gets appended as last resort.
    def _raise_create(name):
        raise RuntimeError(f"fake: {name} cannot load")

    caplog.set_level('ERROR')
    with patch.object(engine, '_create_backend', side_effect=_raise_create):
        result = engine._synthesize_with_fallback(
            text="வணக்கம்",
            output_path="/tmp/out.wav",
            voice=None,
            language="ta",
        )

    assert result is None, "Must refuse to synth Tamil with no capable backend"
    # Must log ERROR with the lang
    error_msgs = [r.message for r in caplog.records if r.levelname == 'ERROR']
    assert any('ta' in m and 'no capable backend' in m for m in error_msgs), (
        f"Expected ERROR log mentioning lang=ta and 'no capable backend', "
        f"got: {error_msgs}"
    )


def test_tamil_with_indic_parler_uses_indic_parler():
    """GAP 1 happy path: ta + Indic Parler fits → uses Indic Parler."""
    engine = _make_stub_engine(active_backend=BACKEND_COSYVOICE3)
    fake = _FakeOKBackend(BACKEND_INDIC_PARLER)

    def _create(name):
        if name == BACKEND_INDIC_PARLER:
            return fake
        raise RuntimeError(f"{name} not available")

    with patch.object(engine, '_create_backend', side_effect=_create):
        result = engine._synthesize_with_fallback(
            text="வணக்கம்",
            output_path="/tmp/out.wav",
            voice=None,
            language="ta",
        )

    assert result == "/tmp/out.wav"
    assert engine._active_backend == BACKEND_INDIC_PARLER, (
        "Permanent switch should track the new working backend"
    )


def test_hindi_with_indic_parler_uses_indic_parler():
    """GAP 1 happy path for hi — same routing contract."""
    engine = _make_stub_engine(active_backend=BACKEND_COSYVOICE3)
    fake = _FakeOKBackend(BACKEND_INDIC_PARLER)

    def _create(name):
        if name == BACKEND_INDIC_PARLER:
            return fake
        raise RuntimeError(f"{name} not available")

    with patch.object(engine, '_create_backend', side_effect=_create):
        result = engine._synthesize_with_fallback(
            text="नमस्ते",
            output_path="/tmp/out.wav",
            voice=None,
            language="hi",
        )

    assert result == "/tmp/out.wav"
    assert engine._active_backend == BACKEND_INDIC_PARLER


def test_english_falls_through_to_piper_or_kokoro():
    """GAP 1 regression guard: English path must NOT be broken by the
    capability filter.  Piper/Kokoro remain valid English fallbacks."""
    engine = _make_stub_engine(active_backend=BACKEND_CHATTERBOX_TURBO)
    fake_piper = _FakeOKBackend(BACKEND_PIPER)

    def _create(name):
        if name == BACKEND_PIPER:
            return fake_piper
        if name == BACKEND_KOKORO:
            return fake_piper  # pretend kokoro works too, returns audio
        raise RuntimeError(f"{name} not available")

    result = engine._synthesize_with_fallback(
        text="hello world",
        output_path="/tmp/out.wav",
        voice=None,
        language="en",
    )
    # Above runs _create_backend on each candidate; we didn't patch so
    # it will call real _create_backend.  Do the patched version:
    engine = _make_stub_engine(active_backend=BACKEND_CHATTERBOX_TURBO)
    with patch.object(engine, '_create_backend', side_effect=_create):
        result = engine._synthesize_with_fallback(
            text="hello world",
            output_path="/tmp/out.wav",
            voice=None,
            language="en",
        )
    assert result == "/tmp/out.wav"


# ---------------------------------------------------------------------------
# 2. Capability helper sanity
# ---------------------------------------------------------------------------
def test_capable_backends_for_normalizes_locale():
    assert _capable_backends_for('ta-IN') == _capable_backends_for('ta')
    assert _capable_backends_for('en-US') == _capable_backends_for('en')


def test_capable_backends_unknown_lang_falls_back_to_en_set():
    """Conservative default: unknown lang gets English-capable set so
    Piper can still produce SOME audio (matches historical behavior
    for exotic langs while we add specific allowlists)."""
    assert _capable_backends_for('xx') == _LANG_CAPABLE_BACKENDS['en']
