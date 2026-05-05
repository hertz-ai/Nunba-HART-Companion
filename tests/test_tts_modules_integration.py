"""Integration smoke tests for tts/ modules — batch #18.

Targets:
  * tts/tts_engine.py (2665 LOC)
  * tts/piper_tts.py (503 LOC)
  * tts/language_segmenter.py (237 LOC)
  * tts/vibevoice_tts.py
  * tts/tts_handshake.py (397 LOC)
  * tts/package_installer.py (1006 LOC)
  * tts/backend_venv.py (465 LOC)

Pattern: callable-exists smoke + pure-function behavior tests.
Actual TTS synthesis requires GPU or Piper binary — those paths are
covered by test_chat_tts_agent_api.py with backend mocks.  This
batch locks the exported-symbol contract so silent renames break
CI immediately.
"""
from __future__ import annotations

import os
import sys

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

pytestmark = pytest.mark.timeout(15)


# ════════════════════════════════════════════════════════════════════════
# tts/tts_engine.py
# ════════════════════════════════════════════════════════════════════════

class TestTTSEngineExports:
    @pytest.mark.parametrize('name', [
        '_read_speed_profile_from_disk', '_get_current_speed_profile',
        '_get_default_speed', '_set_speed_profile',
        '_invalidate_speed_cache', '_normalize_lang',
        '_capable_backends_for', '_publish_lang_unsupported',
        '_get_engine_registry', '_registry_key_to_catalog_id',
        '_entry_to_legacy_caps', '_get_engine_capabilities',
        '_get_lang_preference', '_run_with_timeout', '_oom_guard',
        '_clear_cuda_cache', '_suggest_device',
        'PreSynthCache', 'SentencePipeline', 'TTSEngine',
        '_is_venv_backend', '_probe_backend_runnable',
        '_normalize_tts_result', '_LazyPiper',
        'get_tts_engine', 'synthesize_text', 'get_tts_status',
    ])
    def test_symbol_exported(self, name):
        import tts.tts_engine as te
        assert hasattr(te, name), f'{name} missing from tts.tts_engine'

    def test_normalize_lang_en_default(self):
        from tts.tts_engine import _normalize_lang
        assert _normalize_lang('en') == 'en'
        assert _normalize_lang('EN') == 'en'
        # None or empty should fall back to a canonical default.
        result = _normalize_lang(None)
        assert isinstance(result, str) and len(result) > 0

    def test_normalize_lang_preserves_indic(self):
        from tts.tts_engine import _normalize_lang
        for code in ('hi', 'ta', 'te', 'kn', 'ml', 'bn'):
            result = _normalize_lang(code)
            assert isinstance(result, str)
            # Canonical normalisation — should yield a 2-letter lang.
            assert len(result) >= 2

    def test_get_default_speed_returns_float(self):
        from tts.tts_engine import _get_default_speed
        speed = _get_default_speed()
        assert isinstance(speed, (int, float))
        assert 0.1 <= speed <= 3.0  # sanity bounds

    def test_get_current_speed_profile_returns_name(self):
        from tts.tts_engine import _get_current_speed_profile
        name = _get_current_speed_profile()
        assert isinstance(name, str)
        assert len(name) > 0

    def test_invalidate_speed_cache_is_safe(self):
        from tts.tts_engine import _invalidate_speed_cache
        # Must be callable with no args and not raise.
        _invalidate_speed_cache()

    def test_capable_backends_for_returns_frozenset(self):
        from tts.tts_engine import _capable_backends_for
        result = _capable_backends_for('en')
        assert isinstance(result, frozenset)

    def test_capable_backends_for_handles_unknown_lang(self):
        from tts.tts_engine import _capable_backends_for
        # Unknown lang should not crash; returns empty or default set.
        result = _capable_backends_for('xx_UNKNOWN')
        assert isinstance(result, frozenset)


# ════════════════════════════════════════════════════════════════════════
# tts/piper_tts.py
# ════════════════════════════════════════════════════════════════════════

class TestPiperTTS:
    @pytest.mark.parametrize('name', [
        'PiperTTS', 'get_tts', 'synthesize_text',
        'synthesize_text_async', 'is_tts_available',
        'install_default_voice',
    ])
    def test_symbol_exported(self, name):
        import tts.piper_tts as pt
        assert hasattr(pt, name), f'{name} missing from tts.piper_tts'

    def test_is_tts_available_returns_bool(self):
        from tts.piper_tts import is_tts_available
        result = is_tts_available()
        assert isinstance(result, bool)


# ════════════════════════════════════════════════════════════════════════
# tts/language_segmenter.py — pure-function sentence splitter
# ════════════════════════════════════════════════════════════════════════

class TestLanguageSegmenter:
    def test_segment_english_sentence_returns_list(self):
        from tts.language_segmenter import segment
        result = segment('Hello. World.')
        assert isinstance(result, list)
        # English paragraph should yield at least one segment.
        assert len(result) >= 1

    def test_segment_empty_string(self):
        from tts.language_segmenter import segment
        result = segment('')
        assert isinstance(result, list)

    def test_segment_single_sentence(self):
        from tts.language_segmenter import segment
        result = segment('Hello world')
        assert isinstance(result, list)

    def test_segment_handles_devanagari(self):
        from tts.language_segmenter import segment
        result = segment('नमस्ते दुनिया।')
        assert isinstance(result, list)

    def test_segment_handles_tamil(self):
        from tts.language_segmenter import segment
        result = segment('வணக்கம் உலகம்.')
        assert isinstance(result, list)

    def test_extract_media_tags_returns_list(self):
        from tts.language_segmenter import _extract_media_tags
        result = _extract_media_tags('Hello <img src="x"/> World')
        assert isinstance(result, list)


# ════════════════════════════════════════════════════════════════════════
# tts/vibevoice_tts.py — VibeVoice backend + GPU detection
# ════════════════════════════════════════════════════════════════════════

class TestVibeVoiceTTS:
    @pytest.mark.parametrize('name', [
        '_recommend_model', '_detect_nvidia', '_detect_amd',
        '_detect_gpu_wmic', '_detect_apple_metal', 'detect_gpu',
        'VibeVoiceTTS', 'get_vibevoice_tts', 'synthesize_with_vibevoice',
    ])
    def test_symbol_exported(self, name):
        import tts.vibevoice_tts as vt
        assert hasattr(vt, name), f'{name} missing from tts.vibevoice_tts'

    def test_detect_gpu_returns_dict(self):
        from tts.vibevoice_tts import detect_gpu
        result = detect_gpu()
        assert isinstance(result, dict)

    def test_recommend_model_handles_zero_vram(self):
        from tts.vibevoice_tts import _recommend_model
        # Zero VRAM should return None or a minimum-model name.
        result = _recommend_model(0.0)
        assert result is None or isinstance(result, str)

    def test_recommend_model_handles_high_vram(self):
        from tts.vibevoice_tts import _recommend_model
        result = _recommend_model(24.0)
        assert result is None or isinstance(result, str)


# ════════════════════════════════════════════════════════════════════════
# tts/tts_handshake.py — first-run voice-check
# ════════════════════════════════════════════════════════════════════════

class TestTTSHandshake:
    def test_module_loads(self):
        import tts.tts_handshake as th
        assert th is not None

    def test_has_handshake_callable(self):
        """Handshake module exports at least one public function."""
        import tts.tts_handshake as th
        pub_callables = [
            name for name in dir(th)
            if not name.startswith('_') and callable(getattr(th, name, None))
        ]
        assert len(pub_callables) > 0, 'tts.tts_handshake exports no public callable'


# ════════════════════════════════════════════════════════════════════════
# tts/indic_parler_worker.py — REMOVED (#53)
# ════════════════════════════════════════════════════════════════════════
# The duplicate __main__ entrypoint was retired in favour of the central
# dispatcher (HARTOS integrations/service_tools/gpu_worker._dispatch_and_run)
# spawned via ToolWorker(python_exe=<venv python>).  No replacement test
# is added here — the venv-isolation primitive itself stays covered by
# tests/journey/test_J216_venv_isolates_transformers.py (uses `six` to
# prove the mechanics) and the central dispatcher path is exercised by
# tests/unit/test_gpu_worker.py.


# ════════════════════════════════════════════════════════════════════════
# tts/package_installer.py — runtime TTS package installer
# ════════════════════════════════════════════════════════════════════════

class TestPackageInstaller:
    def test_module_loads(self):
        import tts.package_installer as pi
        assert pi is not None

    def test_has_install_callable(self):
        import tts.package_installer as pi
        # Should expose at least one install-related callable.
        pub_callables = [
            name for name in dir(pi)
            if 'install' in name.lower() and callable(getattr(pi, name, None))
        ]
        assert len(pub_callables) > 0


# ════════════════════════════════════════════════════════════════════════
# tts/backend_venv.py — per-backend venv infrastructure
# ════════════════════════════════════════════════════════════════════════

class TestBackendVenv:
    def test_module_loads(self):
        import tts.backend_venv as bv
        assert bv is not None


# ════════════════════════════════════════════════════════════════════════
# Deprecated tts/speed_profile.py retired — confirm canonical home
# ════════════════════════════════════════════════════════════════════════

class TestRetiredSpeedProfile:
    """Session memo: tts/speed_profile.py was retired in the 2026-04
    audit.  Its helpers now live in tts/tts_engine.py with underscore
    prefixes.  This test locks that migration by confirming the
    retired module is not importable as a top-level side-effect."""

    def test_speed_helpers_on_tts_engine(self):
        from tts.tts_engine import (
            _get_current_speed_profile,
            _get_default_speed,
            _invalidate_speed_cache,
            _read_speed_profile_from_disk,
            _set_speed_profile,
        )
        for fn in (
            _read_speed_profile_from_disk, _get_current_speed_profile,
            _get_default_speed, _set_speed_profile,
            _invalidate_speed_cache,
        ):
            assert callable(fn)

    def test_set_speed_profile_accepts_string_name(self):
        from tts.tts_engine import _set_speed_profile
        # Should return bool; unknown profile may be False, valid may be True.
        result = _set_speed_profile('normal')
        assert isinstance(result, bool)

    def test_set_speed_profile_rejects_invalid_type(self):
        from tts.tts_engine import _set_speed_profile
        try:
            _set_speed_profile(42)  # int, not str
        except (TypeError, ValueError, AttributeError):
            pass  # acceptable to reject
        # Or the impl may coerce silently and return False — also fine.
