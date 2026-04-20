"""Tests for tts/tts_engine.py — Unified TTS Engine.

Covers: backend constants, capability mappings, catalog-to-backend mapping,
PreSynthCache, SentencePipeline, TTSEngine routing/selection/fallback,
lazy backend wrappers, global singleton, convenience functions, and
edge cases throughout.
"""
import gc
import hashlib
import os
import tempfile
import threading
from collections import OrderedDict
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, PropertyMock, call, patch

import pytest

# ---------------------------------------------------------------------------
# Import the module under test
# ---------------------------------------------------------------------------
from tts.tts_engine import (
    _BACKEND_TO_CATALOG,
    _CATALOG_TO_BACKEND,
    _DEFAULT_PREFERENCE,
    _DEFAULT_SPEED_PROFILE,
    _FALLBACK_ENGINE_CAPABILITIES,
    _FALLBACK_LANG_ENGINE_PREFERENCE,
    _INDIC_LANGS,
    _SPEED_PROFILES,
    BACKEND_CHATTERBOX_ML,
    BACKEND_CHATTERBOX_TURBO,
    BACKEND_COSYVOICE3,
    BACKEND_F5,
    BACKEND_INDIC_PARLER,
    BACKEND_NONE,
    BACKEND_PIPER,
    ENGINE_CAPABILITIES,
    LANG_ENGINE_PREFERENCE,
    PreSynthCache,
    SentencePipeline,
    TTSEngine,
    _entry_to_legacy_caps,
    _get_current_speed_profile,
    _get_default_speed,
    _get_engine_capabilities,
    _get_lang_preference,
    _invalidate_speed_cache,
    _set_speed_profile,
    get_tts_engine,
    get_tts_status,
    synthesize_text,
)

# ===========================================================================
# 1. BACKEND CONSTANTS
# ===========================================================================

class TestBackendConstants:
    def test_backend_f5_value(self):
        assert BACKEND_F5 == "f5"

    def test_backend_chatterbox_turbo_value(self):
        assert BACKEND_CHATTERBOX_TURBO == "chatterbox_turbo"

    def test_backend_chatterbox_ml_value(self):
        assert BACKEND_CHATTERBOX_ML == "chatterbox_multilingual"

    def test_backend_indic_parler_value(self):
        assert BACKEND_INDIC_PARLER == "indic_parler"

    def test_backend_cosyvoice3_value(self):
        assert BACKEND_COSYVOICE3 == "cosyvoice3"

    def test_backend_piper_value(self):
        assert BACKEND_PIPER == "piper"

    def test_backend_none_value(self):
        assert BACKEND_NONE == "none"


# ===========================================================================
# 2. FALLBACK ENGINE CAPABILITIES
# ===========================================================================

class TestFallbackEngineCapabilities:
    def test_all_backends_present(self):
        from tts.tts_engine import BACKEND_KOKORO
        expected = {BACKEND_F5, BACKEND_CHATTERBOX_TURBO, BACKEND_CHATTERBOX_ML,
                    BACKEND_INDIC_PARLER, BACKEND_COSYVOICE3, BACKEND_KOKORO,
                    BACKEND_PIPER}
        assert set(_FALLBACK_ENGINE_CAPABILITIES.keys()) == expected

    def test_f5_vram(self):
        assert _FALLBACK_ENGINE_CAPABILITIES[BACKEND_F5]['vram_gb'] == 2.5

    def test_chatterbox_turbo_vram(self):
        assert _FALLBACK_ENGINE_CAPABILITIES[BACKEND_CHATTERBOX_TURBO]['vram_gb'] == 5.6

    def test_piper_zero_vram(self):
        assert _FALLBACK_ENGINE_CAPABILITIES[BACKEND_PIPER]['vram_gb'] == 0

    def test_piper_cpu_quality(self):
        assert _FALLBACK_ENGINE_CAPABILITIES[BACKEND_PIPER]['quality'] == 'medium'

    def test_f5_has_voice_cloning(self):
        assert _FALLBACK_ENGINE_CAPABILITIES[BACKEND_F5]['voice_cloning'] is True

    def test_piper_no_voice_cloning(self):
        assert _FALLBACK_ENGINE_CAPABILITIES[BACKEND_PIPER]['voice_cloning'] is False

    def test_chatterbox_turbo_has_paralinguistic(self):
        tags = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_CHATTERBOX_TURBO]['paralinguistic']
        assert '[laugh]' in tags
        assert '[chuckle]' in tags

    def test_indic_parler_languages_count(self):
        langs = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_INDIC_PARLER]['languages']
        assert len(langs) >= 22  # 21 indic + en

    def test_cosyvoice3_streaming_true(self):
        assert _FALLBACK_ENGINE_CAPABILITIES[BACKEND_COSYVOICE3]['streaming'] is True

    def test_cosyvoice3_emotion_tags(self):
        tags = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_COSYVOICE3]['emotion_tags']
        assert 'happy' in tags
        assert 'sad' in tags

    def test_backward_compat_alias(self):
        assert ENGINE_CAPABILITIES is _FALLBACK_ENGINE_CAPABILITIES


# ===========================================================================
# 3. INDIC LANGUAGES
# ===========================================================================

class TestIndicLangs:
    def test_indic_langs_count(self):
        assert len(_INDIC_LANGS) == 21

    def test_hindi_in_indic(self):
        assert 'hi' in _INDIC_LANGS

    def test_tamil_in_indic(self):
        assert 'ta' in _INDIC_LANGS

    def test_english_not_in_indic(self):
        assert 'en' not in _INDIC_LANGS


# ===========================================================================
# 4. LANGUAGE ENGINE PREFERENCE (fallback)
# ===========================================================================

class TestLangEnginePreference:
    def test_english_first_choice_is_chatterbox_turbo(self):
        assert _FALLBACK_LANG_ENGINE_PREFERENCE['en'][0] == BACKEND_CHATTERBOX_TURBO

    def test_english_last_choice_is_piper(self):
        assert _FALLBACK_LANG_ENGINE_PREFERENCE['en'][-1] == BACKEND_PIPER

    def test_spanish_first_choice_is_cosyvoice3(self):
        assert _FALLBACK_LANG_ENGINE_PREFERENCE['es'][0] == BACKEND_COSYVOICE3

    def test_indic_languages_prefer_indic_parler(self):
        for lang in _INDIC_LANGS:
            prefs = _FALLBACK_LANG_ENGINE_PREFERENCE.get(lang, [])
            assert BACKEND_INDIC_PARLER in prefs, f"{lang} missing indic_parler"

    def test_default_preference_has_cosyvoice3(self):
        assert BACKEND_COSYVOICE3 in _DEFAULT_PREFERENCE

    def test_backward_compat_alias(self):
        assert LANG_ENGINE_PREFERENCE is _FALLBACK_LANG_ENGINE_PREFERENCE


# ===========================================================================
# 5. CATALOG ↔ BACKEND MAPPING
# ===========================================================================

class TestCatalogMapping:
    def test_catalog_to_backend_f5_hyphen(self):
        assert _CATALOG_TO_BACKEND['f5-tts'] == BACKEND_F5

    def test_catalog_to_backend_f5_underscore(self):
        assert _CATALOG_TO_BACKEND['f5_tts'] == BACKEND_F5

    def test_catalog_to_backend_piper(self):
        assert _CATALOG_TO_BACKEND['piper'] == BACKEND_PIPER

    def test_catalog_to_backend_espeak_maps_to_piper(self):
        assert _CATALOG_TO_BACKEND['espeak'] == BACKEND_PIPER

    def test_backend_to_catalog_roundtrip(self):
        for be, cat_id in _BACKEND_TO_CATALOG.items():
            assert _CATALOG_TO_BACKEND[cat_id] == be

    def test_backend_to_catalog_contains_all_backends(self):
        # _BACKEND_TO_CATALOG carries the 7 primary backends PLUS two
        # string-only keys ('luxtts', 'pocket_tts') that are retained
        # for frozen-HARTOS compatibility — they have no top-level
        # BACKEND_* constant because they never ship as their own
        # backend, they fall through to the CPU in-process path.
        from tts.tts_engine import BACKEND_KOKORO
        primary = {BACKEND_F5, BACKEND_CHATTERBOX_TURBO, BACKEND_CHATTERBOX_ML,
                   BACKEND_INDIC_PARLER, BACKEND_COSYVOICE3, BACKEND_KOKORO,
                   BACKEND_PIPER}
        compat = {'luxtts', 'pocket_tts'}
        assert set(_BACKEND_TO_CATALOG.keys()) == primary | compat


class TestKokoroEnglishLadder:
    """Kokoro 82M is the second-last rung on the English TTS ladder —
    tried before Piper so CPU-only users get neural quality when the
    big GPU engines can't run. These tests lock the placement and
    registry wiring so Kokoro stays reachable."""

    def test_kokoro_in_english_preference_before_piper(self):
        from tts.tts_engine import (
            _FALLBACK_LANG_ENGINE_PREFERENCE,
            BACKEND_KOKORO,
            BACKEND_PIPER,
        )
        prefs = _FALLBACK_LANG_ENGINE_PREFERENCE['en']
        assert BACKEND_KOKORO in prefs
        assert BACKEND_PIPER in prefs
        # Kokoro must come BEFORE Piper on CPU — that's the whole point.
        assert prefs.index(BACKEND_KOKORO) < prefs.index(BACKEND_PIPER)

    def test_kokoro_registry_key_wired(self):
        from tts.tts_engine import _BACKEND_TO_REGISTRY_KEY, BACKEND_KOKORO
        assert _BACKEND_TO_REGISTRY_KEY[BACKEND_KOKORO] == 'kokoro'

    def test_kokoro_catalog_id_wired(self):
        from tts.tts_engine import _BACKEND_TO_CATALOG, BACKEND_KOKORO
        # _registry_key_to_catalog_id('kokoro') == 'kokoro' (no underscores)
        assert _BACKEND_TO_CATALOG[BACKEND_KOKORO] == 'kokoro'

    def test_kokoro_fallback_caps_english_only(self):
        from tts.tts_engine import BACKEND_KOKORO
        caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_KOKORO]
        assert caps['languages'] == {'en'}
        assert caps['voice_cloning'] is False
        assert caps['quality'] == 'high'

    def test_kokoro_in_hartos_engine_registry(self):
        """The HARTOS-side ENGINE_REGISTRY must carry the kokoro spec
        with a valid subprocess tool path. Without this, Nunba's
        _SubprocessTTSBackend raises on engine_id='kokoro'."""
        try:
            from integrations.channels.media.tts_router import ENGINE_REGISTRY
        except Exception:
            pytest.skip("HARTOS tts_router not importable in this env")
        spec = ENGINE_REGISTRY.get('kokoro')
        assert spec is not None
        assert spec.tool_module == 'integrations.service_tools.kokoro_tool'
        assert spec.tool_function == 'kokoro_synthesize'
        assert spec.tool_worker_attr == '_tool'
        assert 'en' in spec.languages


# ===========================================================================
# 6. _entry_to_legacy_caps
# ===========================================================================

class TestEntryToLegacyCaps:
    def _make_entry(self, **overrides):
        defaults = {
            'name': 'TestTTS',
            'vram_gb': 2.0,
            'languages': ['en', 'fr'],
            'capabilities': {
                'paralinguistic': ['[laugh]'],
                'emotion_tags': ['happy'],
                'voice_cloning': True,
                'streaming': False,
                'sample_rate': 24000,
            },
            'quality_score': 0.95,
        }
        defaults.update(overrides)
        return SimpleNamespace(**defaults)

    def test_name_propagated(self):
        e = self._make_entry(name='MyTTS')
        result = _entry_to_legacy_caps(e)
        assert result['name'] == 'MyTTS'

    def test_languages_become_set(self):
        e = self._make_entry(languages=['en', 'fr'])
        result = _entry_to_legacy_caps(e)
        assert result['languages'] == {'en', 'fr'}

    def test_quality_highest_for_high_score(self):
        e = self._make_entry(quality_score=0.95)
        assert _entry_to_legacy_caps(e)['quality'] == 'highest'

    def test_quality_high_for_mid_score(self):
        e = self._make_entry(quality_score=0.85)
        assert _entry_to_legacy_caps(e)['quality'] == 'high'

    def test_quality_medium_for_lower_score(self):
        e = self._make_entry(quality_score=0.65)
        assert _entry_to_legacy_caps(e)['quality'] == 'medium'

    def test_quality_low_for_lowest_score(self):
        e = self._make_entry(quality_score=0.3)
        assert _entry_to_legacy_caps(e)['quality'] == 'low'

    def test_missing_vram_defaults_to_zero(self):
        e = self._make_entry()
        del e.vram_gb
        result = _entry_to_legacy_caps(e)
        assert result['vram_gb'] == 0

    def test_missing_languages_defaults_to_empty_set(self):
        e = self._make_entry(languages=None)
        result = _entry_to_legacy_caps(e)
        assert result['languages'] == set()

    def test_missing_capabilities_defaults(self):
        e = self._make_entry(capabilities=None)
        result = _entry_to_legacy_caps(e)
        assert result['paralinguistic'] == []
        assert result['voice_cloning'] is False

    def test_voice_cloning_propagated(self):
        e = self._make_entry()
        result = _entry_to_legacy_caps(e)
        assert result['voice_cloning'] is True

    def test_sample_rate_propagated(self):
        e = self._make_entry()
        result = _entry_to_legacy_caps(e)
        assert result['sample_rate'] == 24000


# ===========================================================================
# 7. _get_engine_capabilities (catalog vs fallback)
# ===========================================================================

class TestGetEngineCapabilities:
    def test_fallback_when_no_catalog(self):
        """When catalog import fails, returns fallback."""
        with patch.dict('sys.modules', {'models.catalog': None}):
            result = _get_engine_capabilities()
        # Should return the fallback dict
        assert BACKEND_PIPER in result

    def test_single_backend_fallback(self):
        result = _get_engine_capabilities(BACKEND_PIPER)
        assert result['name'] == 'Piper TTS (CPU)'

    def test_unknown_backend_returns_empty(self):
        result = _get_engine_capabilities('nonexistent_backend')
        assert result == {}

    def test_all_backends_returns_dict(self):
        result = _get_engine_capabilities()
        assert isinstance(result, dict)
        assert len(result) >= 6


# ===========================================================================
# 8. _get_lang_preference (catalog vs fallback)
# ===========================================================================

class TestGetLangPreference:
    def test_english_fallback(self):
        result = _get_lang_preference('en')
        assert result[0] == BACKEND_CHATTERBOX_TURBO

    def test_unknown_language_matches_wildcard_engine(self):
        # Piper and espeak carry languages=('*',) in the catalog spec so
        # the primary catalog-driven path matches them for any language,
        # including ones not listed in LANG_ENGINE_PREFERENCE. That's why
        # this test isn't the `_DEFAULT_PREFERENCE` hardcoded fallback
        # anymore — the catalog succeeds first via the wildcard match.
        result = _get_lang_preference('xx_unknown')
        assert 'piper' in result or result == _DEFAULT_PREFERENCE

    def test_hindi_returns_indic_parler(self):
        result = _get_lang_preference('hi')
        assert BACKEND_INDIC_PARLER in result


# ===========================================================================
# 9. PreSynthCache
# ===========================================================================

class TestPreSynthCache:
    def test_init_creates_cache_dir(self, tmp_path):
        cache_dir = tmp_path / 'test_cache'
        cache = PreSynthCache(cache_dir=str(cache_dir), max_entries=5)
        assert cache_dir.exists()

    def test_hash_deterministic(self, tmp_path):
        cache = PreSynthCache(cache_dir=str(tmp_path))
        h1 = cache._hash("hello", "default")
        h2 = cache._hash("hello", "default")
        assert h1 == h2

    def test_hash_differs_for_different_text(self, tmp_path):
        cache = PreSynthCache(cache_dir=str(tmp_path))
        h1 = cache._hash("hello", "default")
        h2 = cache._hash("goodbye", "default")
        assert h1 != h2

    def test_hash_differs_for_different_voice(self, tmp_path):
        cache = PreSynthCache(cache_dir=str(tmp_path))
        h1 = cache._hash("hello", "voice1")
        h2 = cache._hash("hello", "voice2")
        assert h1 != h2

    def test_get_returns_none_when_empty(self, tmp_path):
        cache = PreSynthCache(cache_dir=str(tmp_path))
        assert cache.get("hello") is None

    def test_put_then_get_returns_path(self, tmp_path):
        cache = PreSynthCache(cache_dir=str(tmp_path))
        audio_file = tmp_path / "audio.wav"
        audio_file.write_bytes(b"fake audio")
        cache.put("hello", str(audio_file))
        result = cache.get("hello")
        assert result == str(audio_file)

    def test_get_from_disk_when_not_in_memory(self, tmp_path):
        cache = PreSynthCache(cache_dir=str(tmp_path))
        h = cache._hash("disk text", "default")
        disk_path = tmp_path / f"{h}.wav"
        disk_path.write_bytes(b"disk audio")
        result = cache.get("disk text")
        assert result == str(disk_path)

    def test_eviction_when_max_exceeded(self, tmp_path):
        cache = PreSynthCache(cache_dir=str(tmp_path), max_entries=2)
        f1 = tmp_path / "a1.wav"
        f2 = tmp_path / "a2.wav"
        f3 = tmp_path / "a3.wav"
        for f in [f1, f2, f3]:
            f.write_bytes(b"x")
        cache.put("text1", str(f1))
        cache.put("text2", str(f2))
        cache.put("text3", str(f3))
        # Oldest entry (text1) should be evicted
        assert len(cache._cache) == 2

    def test_eviction_deletes_file(self, tmp_path):
        cache = PreSynthCache(cache_dir=str(tmp_path), max_entries=1)
        f1 = tmp_path / "old.wav"
        f2 = tmp_path / "new.wav"
        f1.write_bytes(b"old")
        f2.write_bytes(b"new")
        cache.put("old", str(f1))
        cache.put("new", str(f2))
        assert not f1.exists()

    def test_get_nonexistent_file_returns_none(self, tmp_path):
        cache = PreSynthCache(cache_dir=str(tmp_path))
        cache._cache[cache._hash("gone", "default")] = "/nonexistent/path.wav"
        result = cache.get("gone")
        assert result is None

    def test_presynth_background_skips_if_cached(self, tmp_path):
        cache = PreSynthCache(cache_dir=str(tmp_path))
        f = tmp_path / "existing.wav"
        f.write_bytes(b"x")
        cache.put("hello", str(f))
        synth_fn = MagicMock()
        cache.presynth_background("hello", "default", synth_fn)
        synth_fn.assert_not_called()

    def test_presynth_background_calls_synth_fn(self, tmp_path):
        cache = PreSynthCache(cache_dir=str(tmp_path))
        result_path = str(tmp_path / "result.wav")
        Path(result_path).write_bytes(b"audio")
        synth_fn = MagicMock(return_value=result_path)

        cache.presynth_background("new text", "default", synth_fn)
        # Wait for background thread
        import time
        time.sleep(0.5)
        synth_fn.assert_called_once()

    def test_warm_fillers_calls_synth_for_each(self, tmp_path):
        cache = PreSynthCache(cache_dir=str(tmp_path))
        synth_fn = MagicMock(return_value=None)
        cache.warm_fillers(synth_fn)
        import time
        time.sleep(1)
        assert synth_fn.call_count == len(PreSynthCache.FILLERS)

    def test_fillers_list_not_empty(self):
        assert len(PreSynthCache.FILLERS) > 0


# ===========================================================================
# 10. SentencePipeline
# ===========================================================================

class TestSentencePipeline:
    def test_feed_accumulates_tokens(self):
        synth = MagicMock(return_value="/tmp/out.wav")
        pipeline = SentencePipeline(synth)
        pipeline.feed("Hello ")
        pipeline.feed("world")
        assert pipeline._buffer == "Hello world"
        pipeline.shutdown()

    def test_feed_triggers_on_period(self):
        synth = MagicMock(return_value="/tmp/out.wav")
        pipeline = SentencePipeline(synth)
        pipeline.feed("Hello world.")
        pipeline.wait()
        synth.assert_called_once()
        pipeline.shutdown()

    def test_feed_triggers_on_exclamation(self):
        synth = MagicMock(return_value="/tmp/out.wav")
        pipeline = SentencePipeline(synth)
        pipeline.feed("Wow!")
        pipeline.wait()
        synth.assert_called_once()
        pipeline.shutdown()

    def test_feed_triggers_on_question_mark(self):
        synth = MagicMock(return_value="/tmp/out.wav")
        pipeline = SentencePipeline(synth)
        pipeline.feed("How are you?")
        pipeline.wait()
        synth.assert_called_once()
        pipeline.shutdown()

    def test_feed_does_not_split_on_abbreviation(self):
        synth = MagicMock(return_value="/tmp/out.wav")
        pipeline = SentencePipeline(synth)
        pipeline.feed("Dr.")
        synth.assert_not_called()
        pipeline.shutdown()

    def test_flush_sends_remaining_buffer(self):
        synth = MagicMock(return_value="/tmp/out.wav")
        pipeline = SentencePipeline(synth)
        pipeline.feed("Remaining text")
        pipeline.flush()
        pipeline.wait()
        synth.assert_called_once()
        pipeline.shutdown()

    def test_flush_ignores_short_buffer(self):
        synth = MagicMock(return_value="/tmp/out.wav")
        pipeline = SentencePipeline(synth)
        pipeline.feed("ab")  # len <= 2
        pipeline.flush()
        pipeline.wait()
        synth.assert_not_called()
        pipeline.shutdown()

    def test_flush_clears_buffer(self):
        synth = MagicMock(return_value="/tmp/out.wav")
        pipeline = SentencePipeline(synth)
        pipeline.feed("Some text")
        pipeline.flush()
        assert pipeline._buffer == ""
        pipeline.shutdown()

    def test_on_audio_ready_called(self):
        ready_cb = MagicMock()
        synth = MagicMock(return_value="/tmp/out.wav")
        pipeline = SentencePipeline(synth, on_audio_ready=ready_cb)
        pipeline.feed("Hello world.")
        pipeline.wait()
        ready_cb.assert_called_once()
        pipeline.shutdown()

    def test_sentence_num_increments(self):
        synth = MagicMock(return_value="/tmp/out.wav")
        pipeline = SentencePipeline(synth)
        pipeline.feed("First.")
        pipeline.feed("Second!")
        pipeline.wait()
        assert pipeline._sentence_num == 2
        pipeline.shutdown()

    def test_empty_buffer_no_submit(self):
        synth = MagicMock(return_value="/tmp/out.wav")
        pipeline = SentencePipeline(synth)
        pipeline.feed("   ")
        synth.assert_not_called()
        pipeline.shutdown()

    def test_boundaries_constant(self):
        assert SentencePipeline.BOUNDARIES == {'.', '!', '?', '\n'}

    def test_abbrevs_has_common_abbreviations(self):
        assert 'dr.' in SentencePipeline.ABBREVS
        assert 'mr.' in SentencePipeline.ABBREVS
        assert 'e.g.' in SentencePipeline.ABBREVS


# ===========================================================================
# 11. TTSEngine — construction and properties
# ===========================================================================

class TestTTSEngineInit:
    def test_default_language_is_english(self):
        engine = TTSEngine(auto_init=False)
        assert engine.language == 'en'

    def test_default_backend_is_none(self):
        engine = TTSEngine(auto_init=False)
        assert engine.backend == BACKEND_NONE

    def test_prefer_gpu_default_true(self):
        engine = TTSEngine(auto_init=False)
        assert engine.prefer_gpu is True

    def test_not_initialized_by_default(self):
        engine = TTSEngine(auto_init=False)
        assert engine._initialized is False

    def test_has_gpu_default_false(self):
        engine = TTSEngine(auto_init=False)
        assert engine.has_gpu is False

    def test_vram_default_zero(self):
        engine = TTSEngine(auto_init=False)
        assert engine.vram_gb == 0.0


# ===========================================================================
# 12. TTSEngine — hardware detection
# ===========================================================================

class TestTTSEngineHardware:
    def test_detect_hardware_via_vram_manager(self):
        mock_vram = MagicMock()
        mock_vram.detect_gpu.return_value = {
            'cuda_available': True,
            'total_gb': 8.0,
            'free_gb': 6.0,
            'name': 'RTX 4060',
        }
        mock_module = MagicMock()
        mock_module.vram_manager = mock_vram
        engine = TTSEngine(auto_init=False)
        with patch.dict('sys.modules', {
            'integrations': MagicMock(),
            'integrations.service_tools': MagicMock(),
            'integrations.service_tools.vram_manager': mock_module,
        }):
            engine._detect_hardware()
        assert engine.has_gpu is True
        assert engine.vram_gb == 8.0
        assert engine.gpu_info['gpu_name'] == 'RTX 4060'

    def test_detect_hardware_no_hartos_no_torch(self):
        engine = TTSEngine(auto_init=False)
        with patch.dict('sys.modules', {'integrations.service_tools.vram_manager': None}):
            with patch('builtins.__import__', side_effect=ImportError):
                engine._detect_hardware()
        assert engine.has_gpu is False

    def test_ensure_hw_detected_runs_once(self):
        engine = TTSEngine(auto_init=False)
        engine._hw_detected = False
        with patch.object(engine, '_detect_hardware') as mock_detect:
            engine._ensure_hw_detected()
            engine._ensure_hw_detected()
            mock_detect.assert_called_once()


# ===========================================================================
# 13. TTSEngine — backend selection
# ===========================================================================

class TestTTSEngineSelection:
    def test_select_backend_for_language_piper_fallback(self):
        engine = TTSEngine(auto_init=False)
        # Make all backends un-runnable
        with patch.object(engine, '_can_run_backend', return_value=False):
            result = engine._select_backend_for_language('en')
        assert result == BACKEND_PIPER

    def test_select_backend_for_language_first_runnable(self):
        engine = TTSEngine(auto_init=False)

        def can_run(backend):
            return backend == BACKEND_F5

        with patch.object(engine, '_can_run_backend', side_effect=can_run):
            with patch.object(engine, '_ensure_hw_detected'):
                result = engine._select_backend_for_language('en')
        assert result == BACKEND_F5

    def test_select_backend_delegates_to_language(self):
        engine = TTSEngine(auto_init=False)
        engine._language = 'hi'
        with patch.object(engine, '_select_backend_for_language', return_value=BACKEND_INDIC_PARLER) as mock:
            result = engine._select_backend()
        mock.assert_called_once_with('hi')
        assert result == BACKEND_INDIC_PARLER


# ===========================================================================
# 14. TTSEngine — set_language
# ===========================================================================

class TestTTSEngineSetLanguage:
    def test_set_same_language_noop(self):
        engine = TTSEngine(auto_init=False)
        engine._language = 'en'
        with patch.object(engine, '_select_backend_for_language') as mock:
            engine.set_language('en')
        mock.assert_not_called()

    def test_set_new_language_updates_language(self):
        engine = TTSEngine(auto_init=False)
        engine._language = 'en'
        engine._active_backend = BACKEND_PIPER
        engine._backends[BACKEND_PIPER] = MagicMock()
        with patch.object(engine, '_select_backend_for_language', return_value=BACKEND_PIPER):
            engine.set_language('hi')
        assert engine._language == 'hi'

    def test_set_language_instant_switch_when_loaded(self):
        engine = TTSEngine(auto_init=False)
        engine._language = 'en'
        engine._active_backend = BACKEND_PIPER
        mock_backend = MagicMock()
        engine._backends[BACKEND_INDIC_PARLER] = mock_backend
        with patch.object(engine, '_select_backend_for_language', return_value=BACKEND_INDIC_PARLER):
            engine.set_language('hi')
        assert engine._active_backend == BACKEND_INDIC_PARLER


# ===========================================================================
# 15. TTSEngine — initialize
# ===========================================================================

class TestTTSEngineInitialize:
    def test_initialize_returns_false_for_backend_none(self):
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_NONE
        with patch.object(engine, '_select_backend', return_value=BACKEND_NONE):
            result = engine.initialize()
        assert result is False

    def test_initialize_creates_backend(self):
        engine = TTSEngine(auto_init=False)
        mock_inst = MagicMock()
        with patch.object(engine, '_select_backend', return_value=BACKEND_PIPER):
            with patch.object(engine, '_create_backend', return_value=mock_inst):
                result = engine.initialize()
        assert result is True
        assert engine._initialized is True

    def test_initialize_fast_path_when_already_init(self):
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        result = engine.initialize()
        assert result is True

    def test_initialize_nonblocking_returns_immediately(self):
        engine = TTSEngine(auto_init=False)
        engine._init_lock.acquire()  # simulate another thread holding the lock
        result = engine.initialize(blocking=False)
        engine._init_lock.release()
        assert result is False  # not initialized yet


# ===========================================================================
# 16. TTSEngine — _create_backend
# ===========================================================================

class TestCreateBackend:
    def test_create_piper(self):
        engine = TTSEngine(auto_init=False)
        with patch('tts.tts_engine._LazyPiper') as MockPiper:
            result = engine._create_backend(BACKEND_PIPER)
        MockPiper.assert_called_once()

    def test_create_f5_uses_subprocess_adapter(self):
        """GPU backends (F5, Chatterbox, CosyVoice, Indic Parler) are all
        routed through the single _SubprocessTTSBackend adapter, which
        forwards to the HARTOS subprocess tool. No per-engine _Lazy*
        classes exist anymore."""
        engine = TTSEngine(auto_init=False)
        with patch('tts.tts_engine._SubprocessTTSBackend') as MockAdapter:
            result = engine._create_backend(BACKEND_F5)
        MockAdapter.assert_called_once_with('f5_tts')

    def test_create_chatterbox_turbo_uses_subprocess_adapter(self):
        engine = TTSEngine(auto_init=False)
        with patch('tts.tts_engine._SubprocessTTSBackend') as MockAdapter:
            engine._create_backend(BACKEND_CHATTERBOX_TURBO)
        MockAdapter.assert_called_once_with('chatterbox_turbo')

    def test_create_chatterbox_ml_uses_subprocess_adapter(self):
        engine = TTSEngine(auto_init=False)
        with patch('tts.tts_engine._SubprocessTTSBackend') as MockAdapter:
            engine._create_backend(BACKEND_CHATTERBOX_ML)
        MockAdapter.assert_called_once_with('chatterbox_ml')

    def test_create_unknown_returns_none(self):
        engine = TTSEngine(auto_init=False)
        result = engine._create_backend("totally_unknown")
        assert result is None


# ===========================================================================
# 16b. _SubprocessTTSBackend adapter — behavior regression tests.
#
# These verify the adapter's contract with HARTOS tool modules WITHOUT
# needing any real GPU libs (f5_tts, chatterbox, cosyvoice, parler_tts).
# Every test mocks _resolve so the tool module import never happens.
# ===========================================================================

class TestSubprocessTTSBackend:

    def _make_adapter(self, engine_id, mock_synthesize_fn, mock_worker=None):
        """Construct an adapter with its tool module already "resolved"."""
        from tts.tts_engine import _SubprocessTTSBackend
        adapter = _SubprocessTTSBackend(engine_id)
        adapter._worker = mock_worker or MagicMock()
        adapter._synthesize_fn = mock_synthesize_fn
        return adapter

    def test_unknown_engine_id_raises(self):
        from tts.tts_engine import _SubprocessTTSBackend
        with pytest.raises(ValueError, match='Unknown TTS engine_id'):
            _SubprocessTTSBackend('totally_not_a_real_engine')

    def test_cpu_only_engine_raises(self):
        """An engine registered with tool_module + tool_function but NO
        tool_worker_attr is CPU-only and cannot be driven through the
        subprocess adapter — _SubprocessTTSBackend must refuse it.

        We patch ENGINE_REGISTRY with a synthetic spec so the test is
        deterministic regardless of what HARTOS currently ships (luxtts
        was removed from the live registry after this test was authored,
        so we no longer rely on it being present).
        """
        from tts.tts_engine import _SubprocessTTSBackend
        fake_spec = SimpleNamespace(
            tool_module='fake.cpu_engine_tool',
            tool_function='fake_synthesize',
            tool_worker_attr=None,
        )
        with patch(
            'integrations.channels.media.tts_router.ENGINE_REGISTRY',
            {'fake_cpu_engine': fake_spec},
        ):
            with pytest.raises(ValueError, match='not subprocess-capable'):
                _SubprocessTTSBackend('fake_cpu_engine')

    def test_synthesize_forwards_text_language_voice_output(self):
        mock_fn = MagicMock(return_value='{"path": "/out.wav", "duration": 1.0}')
        adapter = self._make_adapter('f5_tts', mock_fn)
        adapter.synthesize(text='hi', output_path='/out.wav', language='en')
        mock_fn.assert_called_once()
        kwargs = mock_fn.call_args.kwargs
        assert kwargs['text'] == 'hi'
        assert kwargs['language'] == 'en'
        assert kwargs['output_path'] == '/out.wav'

    def test_synthesize_forwards_speed_kwarg_when_present(self):
        """F5's speed= kwarg must survive the adapter boundary so
        synthesize_text(..., speed=0.8) still affects F5 infer()."""
        mock_fn = MagicMock(return_value='{"path": "/out.wav", "duration": 1.0}')
        adapter = self._make_adapter('f5_tts', mock_fn)
        adapter.synthesize(text='hi', output_path='/out.wav', speed=0.8)
        assert mock_fn.call_args.kwargs.get('speed') == 0.8

    def test_synthesize_retries_without_speed_on_typeerror(self):
        """Engines whose public function doesn't accept `speed` (e.g.
        chatterbox) shouldn't crash when a caller passes it — the
        adapter retries without it."""
        call_count = {'n': 0}

        def fake_fn(**kw):
            call_count['n'] += 1
            if 'speed' in kw:
                raise TypeError("unexpected keyword 'speed'")
            return '{"path": "/out.wav", "duration": 1.0}'

        adapter = self._make_adapter('chatterbox_turbo', fake_fn)
        adapter.synthesize(text='hi', output_path='/out.wav', speed=0.8)
        assert call_count['n'] == 2  # first with speed, retry without

    def test_error_response_raises_runtime_error(self):
        mock_fn = MagicMock(return_value='{"error": "out of memory"}')
        adapter = self._make_adapter('f5_tts', mock_fn)
        with pytest.raises(RuntimeError, match='out of memory'):
            adapter.synthesize(text='hi', output_path='/out.wav')

    def test_transient_flag_propagates_on_exception(self):
        """Worker crashes set transient=True in the response — the
        adapter must re-raise as RuntimeError with .transient=True so
        TTSEngine can short-circuit to Piper instead of trying every
        other GPU engine."""
        mock_fn = MagicMock(
            return_value='{"error": "f5_tts crashed: died", "transient": true}'
        )
        adapter = self._make_adapter('f5_tts', mock_fn)
        try:
            adapter.synthesize(text='hi', output_path='/out.wav')
            raise AssertionError('expected RuntimeError')
        except RuntimeError as e:
            assert getattr(e, 'transient', False) is True

    def test_malformed_json_raises_runtime_error(self):
        mock_fn = MagicMock(return_value='not a json string at all')
        adapter = self._make_adapter('f5_tts', mock_fn)
        with pytest.raises(RuntimeError, match='malformed worker response'):
            adapter.synthesize(text='hi', output_path='/out.wav')

    def test_unload_stops_only_this_variant(self):
        """Calling unload_model() on a chatterbox_turbo adapter must
        stop ONLY the turbo worker, not the ml worker. Regression
        test for the cross-variant unload bug where the adapter used
        to call module-level unload_chatterbox() which stopped both."""
        mock_worker = MagicMock()
        adapter = self._make_adapter(
            'chatterbox_turbo',
            MagicMock(return_value='{}'),
            mock_worker=mock_worker,
        )
        adapter.unload_model()
        mock_worker.stop.assert_called_once()

    def test_unload_is_idempotent(self):
        mock_worker = MagicMock()
        adapter = self._make_adapter(
            'f5_tts',
            MagicMock(return_value='{}'),
            mock_worker=mock_worker,
        )
        adapter.unload_model()
        adapter.unload_model()
        # Two calls, two stop()s — no exception
        assert mock_worker.stop.call_count == 2

    def test_device_returns_cuda_when_worker_alive(self):
        mock_worker = MagicMock()
        mock_worker.is_alive.return_value = True
        adapter = self._make_adapter(
            'f5_tts', MagicMock(return_value='{}'), mock_worker=mock_worker,
        )
        assert adapter._device == 'cuda'

    def test_device_returns_none_when_worker_not_alive(self):
        mock_worker = MagicMock()
        mock_worker.is_alive.return_value = False
        adapter = self._make_adapter(
            'f5_tts', MagicMock(return_value='{}'), mock_worker=mock_worker,
        )
        assert adapter._device is None

    def test_all_gpu_engines_in_registry_have_worker_attr(self):
        """Every GPU-only engine in ENGINE_REGISTRY must have
        tool_worker_attr set so the subprocess adapter can find the
        ToolWorker instance. Missing this field = silent CPU fallback."""
        from integrations.channels.media.tts_router import (
            ENGINE_REGISTRY,
            TTSDevice,
        )
        gpu_engines = [
            eid for eid, spec in ENGINE_REGISTRY.items()
            if spec.device in (TTSDevice.GPU_ONLY, TTSDevice.GPU_PREFERRED)
        ]
        assert gpu_engines, "no GPU engines registered"
        for eid in gpu_engines:
            spec = ENGINE_REGISTRY[eid]
            assert spec.tool_module, f"{eid} missing tool_module"
            assert spec.tool_function, f"{eid} missing tool_function"
            assert spec.tool_worker_attr, (
                f"{eid} missing tool_worker_attr — subprocess adapter "
                f"can't find its ToolWorker"
            )


# ===========================================================================
# 17. TTSEngine — synthesize
# ===========================================================================

class TestTTSEngineSynthesize:
    def test_synthesize_empty_text_returns_none(self):
        engine = TTSEngine(auto_init=False)
        assert engine.synthesize("") is None
        assert engine.synthesize("   ") is None
        assert engine.synthesize(None) is None

    def test_synthesize_uses_cache_hit(self, tmp_path):
        engine = TTSEngine(auto_init=False)
        cached_file = tmp_path / "cached.wav"
        cached_file.write_bytes(b"cached audio")
        engine._presynth = MagicMock()
        engine._presynth.get.return_value = str(cached_file)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        engine._backends[BACKEND_PIPER] = MagicMock()

        result = engine.synthesize("hello")
        assert result == str(cached_file)

    def test_synthesize_calls_backend(self, tmp_path):
        engine = TTSEngine(auto_init=False)
        engine._presynth = MagicMock()
        engine._presynth.get.return_value = None
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        mock_inst = MagicMock()
        mock_inst.synthesize.return_value = str(tmp_path / "out.wav")
        engine._backends[BACKEND_PIPER] = mock_inst

        result = engine.synthesize("hello world")
        mock_inst.synthesize.assert_called_once()

    def test_synthesize_changes_language_if_needed(self):
        engine = TTSEngine(auto_init=False)
        engine._language = 'en'
        engine._presynth = MagicMock()
        engine._presynth.get.return_value = None
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        mock_inst = MagicMock()
        mock_inst.synthesize.return_value = "/tmp/out.wav"
        engine._backends[BACKEND_PIPER] = mock_inst

        with patch.object(engine, 'set_language') as mock_set:
            engine.synthesize("hola", language='es')
        mock_set.assert_called_once_with('es')

    def test_synthesize_fallback_on_exception(self):
        engine = TTSEngine(auto_init=False)
        engine._presynth = MagicMock()
        engine._presynth.get.return_value = None
        engine._initialized = True
        engine._active_backend = BACKEND_CHATTERBOX_TURBO
        mock_inst = MagicMock()
        mock_inst.synthesize.side_effect = RuntimeError("CUDA error")
        engine._backends[BACKEND_CHATTERBOX_TURBO] = mock_inst

        with patch.object(engine, '_synthesize_with_fallback', return_value="/fallback.wav") as mock_fb:
            result = engine.synthesize("hello")
        mock_fb.assert_called_once()
        assert result == "/fallback.wav"

    def test_synthesize_cache_hit_copies_to_output_path(self, tmp_path):
        engine = TTSEngine(auto_init=False)
        cached_file = tmp_path / "cached.wav"
        cached_file.write_bytes(b"cached audio data")
        engine._presynth = MagicMock()
        engine._presynth.get.return_value = str(cached_file)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        engine._backends[BACKEND_PIPER] = MagicMock()

        output = tmp_path / "output.wav"
        result = engine.synthesize("hello", output_path=str(output))
        assert result == str(output)
        assert output.read_bytes() == b"cached audio data"


# ===========================================================================
# 18. TTSEngine — _synthesize_with_fallback
# ===========================================================================

class TestSynthesizeWithFallback:
    def test_fallback_tries_remaining_engines(self):
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_CHATTERBOX_TURBO
        mock_piper = MagicMock()
        mock_piper.synthesize.return_value = "/piper_out.wav"

        with patch.object(engine, '_create_backend', return_value=mock_piper):
            result = engine._synthesize_with_fallback(
                "hello", "/out.wav", None, 'en')
        assert result == "/piper_out.wav"

    def test_fallback_returns_none_when_all_fail(self):
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_CHATTERBOX_TURBO

        def fail_create(backend):
            m = MagicMock()
            m.synthesize.side_effect = RuntimeError("fail")
            return m

        with patch.object(engine, '_create_backend', side_effect=fail_create):
            result = engine._synthesize_with_fallback(
                "hello", "/out.wav", None, 'en')
        assert result is None

    def test_fallback_switches_active_backend(self):
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_CHATTERBOX_TURBO
        mock_piper = MagicMock()
        mock_piper.synthesize.return_value = "/piper.wav"

        with patch.object(engine, '_create_backend', return_value=mock_piper):
            engine._synthesize_with_fallback("hello", "/out.wav", None, 'en')
        # After fallback, active should be updated
        assert engine._active_backend != BACKEND_CHATTERBOX_TURBO


# ===========================================================================
# 19. TTSEngine — properties and info
# ===========================================================================

class TestTTSEngineProperties:
    def test_backend_property(self):
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_PIPER
        assert engine.backend == BACKEND_PIPER

    def test_backend_name_from_capabilities(self):
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_PIPER
        assert engine.backend_name == 'Piper TTS (CPU)'

    def test_backend_name_unknown_returns_raw(self):
        engine = TTSEngine(auto_init=False)
        engine._active_backend = 'unknown_xyz'
        assert engine.backend_name == 'unknown_xyz'

    def test_language_property(self):
        engine = TTSEngine(auto_init=False)
        engine._language = 'fr'
        assert engine.language == 'fr'

    def test_is_available_false_when_not_init(self):
        engine = TTSEngine(auto_init=False)
        engine._initialized = False
        assert engine.is_available() is False

    def test_get_info_returns_dict(self):
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        engine._backends[BACKEND_PIPER] = MagicMock()
        info = engine.get_info()
        assert info['backend'] == BACKEND_PIPER
        assert 'features' in info
        assert 'capabilities' in info

    def test_get_features_voice_cloning(self):
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_F5
        features = engine._get_features()
        assert 'voice-cloning' in features

    def test_get_features_streaming(self):
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_COSYVOICE3
        features = engine._get_features()
        assert 'streaming' in features

    def test_get_features_paralinguistic(self):
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_CHATTERBOX_TURBO
        features = engine._get_features()
        assert 'paralinguistic' in features

    def test_get_features_multilingual(self):
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_CHATTERBOX_ML
        features = engine._get_features()
        assert 'multilingual' in features

    def test_get_capabilities_sanitizes_sets(self):
        engine = TTSEngine(auto_init=False)
        result = engine.get_capabilities(BACKEND_PIPER)
        # Languages should be a sorted list, not a set
        assert isinstance(result.get('languages', []), list)

    def test_get_capabilities_all(self):
        engine = TTSEngine(auto_init=False)
        result = engine.get_capabilities()
        assert isinstance(result, dict)
        assert BACKEND_PIPER in result


# ===========================================================================
# 20. TTSEngine — voice management
# ===========================================================================

class TestTTSEngineVoices:
    def test_list_voices_empty_when_no_backend(self):
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        assert engine.list_voices() == {}

    def test_list_voices_delegates_to_list_speakers(self):
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        mock = MagicMock()
        mock.list_speakers.return_value = {'v1': {}}
        engine._backends[BACKEND_PIPER] = mock
        assert engine.list_voices() == {'v1': {}}

    def test_list_installed_voices_empty(self):
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        assert engine.list_installed_voices() == []

    def test_set_voice_delegates(self):
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        mock = MagicMock()
        mock.set_speaker.return_value = True
        engine._backends[BACKEND_PIPER] = mock
        assert engine.set_voice('v1') is True

    def test_set_voice_no_backend_returns_false(self):
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        assert engine.set_voice('v1') is False

    def test_clone_voice_unsupported_backend(self):
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        engine._backends[BACKEND_PIPER] = MagicMock()
        assert engine.clone_voice("/audio.wav", "my_voice") is False

    def test_clone_voice_supported_backend(self):
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_F5
        mock = MagicMock()
        mock.clone_voice.return_value = True
        engine._backends[BACKEND_F5] = mock
        assert engine.clone_voice("/audio.wav", "my_voice") is True


# ===========================================================================
# 21. TTSEngine — synthesize_to_bytes
# ===========================================================================

class TestSynthesizeToBytes:
    def test_returns_bytes_on_success(self, tmp_path):
        engine = TTSEngine(auto_init=False)
        audio_content = b"wav_audio_data"

        def mock_synth(text, output_path, voice=None, speed=1.0, language=None, **kw):
            Path(output_path).write_bytes(audio_content)
            return output_path

        with patch.object(engine, 'synthesize', side_effect=mock_synth):
            result = engine.synthesize_to_bytes("hello")
        assert result == audio_content

    def test_returns_none_on_failure(self):
        engine = TTSEngine(auto_init=False)
        with patch.object(engine, 'synthesize', return_value=None):
            result = engine.synthesize_to_bytes("hello")
        assert result is None


# ===========================================================================
# 22. TTSEngine — shutdown
# ===========================================================================

class TestTTSEngineShutdown:
    def test_shutdown_clears_backends(self):
        engine = TTSEngine(auto_init=False)
        mock = MagicMock()
        engine._backends['test'] = mock
        engine._initialized = True
        engine._active_backend = 'test'
        engine.shutdown()
        assert engine._backends == {}
        assert engine._initialized is False
        assert engine._active_backend == BACKEND_NONE

    def test_shutdown_calls_unload_model(self):
        engine = TTSEngine(auto_init=False)
        mock = MagicMock()
        engine._backends['test'] = mock
        engine.shutdown()
        mock.unload_model.assert_called_once()

    def test_shutdown_calls_shutdown_method(self):
        engine = TTSEngine(auto_init=False)
        mock = MagicMock(spec=[])  # no unload_model
        mock.shutdown = MagicMock()
        engine._backends['test'] = mock
        engine.shutdown()
        mock.shutdown.assert_called_once()


# ===========================================================================
# 23. TTSEngine — _can_run_backend and _is_missing_packages
# ===========================================================================

class TestCanRunBackend:
    def test_unknown_backend_returns_false(self):
        engine = TTSEngine(auto_init=False)
        assert engine._can_run_backend('nonexistent') is False

    def test_piper_always_runnable(self):
        engine = TTSEngine(auto_init=False)
        # Piper has 0 VRAM, no required imports
        assert engine._can_run_backend(BACKEND_PIPER) is True

    def test_is_missing_packages_no_required_import(self):
        engine = TTSEngine(auto_init=False)
        # Piper has no required import
        assert engine._is_missing_packages(BACKEND_PIPER) is False


# ===========================================================================
# 24. TTSEngine — _switch_backend
# ===========================================================================

class TestSwitchBackend:
    def test_switch_unloads_old_backend(self):
        engine = TTSEngine(auto_init=False)
        engine.auto_init = False
        old_inst = MagicMock()
        engine._backends[BACKEND_PIPER] = old_inst
        engine._active_backend = BACKEND_PIPER
        engine._switch_backend(BACKEND_F5)
        old_inst.unload_model.assert_called_once()
        assert BACKEND_PIPER not in engine._backends

    def test_switch_sets_active(self):
        engine = TTSEngine(auto_init=False)
        engine.auto_init = False
        engine._active_backend = BACKEND_PIPER
        engine._switch_backend(BACKEND_F5)
        assert engine._active_backend == BACKEND_F5


# ===========================================================================
# 25. Global singleton and convenience functions
# ===========================================================================

class TestGlobalSingleton:
    def test_get_tts_engine_returns_instance(self):
        import tts.tts_engine as mod
        old = mod._engine
        mod._engine = None
        try:
            engine = get_tts_engine(auto_init=False)
            assert isinstance(engine, TTSEngine)
        finally:
            mod._engine = old

    def test_get_tts_engine_returns_same_instance(self):
        import tts.tts_engine as mod
        old = mod._engine
        mod._engine = None
        try:
            e1 = get_tts_engine(auto_init=False)
            e2 = get_tts_engine(auto_init=False)
            assert e1 is e2
        finally:
            mod._engine = old

    def test_synthesize_text_delegates(self):
        import tts.tts_engine as mod
        old = mod._engine
        mock_engine = MagicMock()
        mock_engine.synthesize.return_value = "/out.wav"
        mod._engine = mock_engine
        try:
            result = synthesize_text("hello", language='en')
            mock_engine.synthesize.assert_called_once()
            assert result == "/out.wav"
        finally:
            mod._engine = old

    def test_get_tts_status_returns_dict(self):
        import tts.tts_engine as mod
        old = mod._engine
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        engine._backends[BACKEND_PIPER] = MagicMock()
        mod._engine = engine
        try:
            status = get_tts_status()
            assert 'available' in status
            assert 'backend' in status
            assert 'total_languages' in status
            assert 'supported_languages' in status
            assert isinstance(status['supported_languages'], list)
        finally:
            mod._engine = old


# ===========================================================================
# 26. Indic Parler sentence splitting
#
# The sentence-splitting logic used to live in Nunba's _LazyIndicParler,
# but after the subprocess-isolation refactor it moved to HARTOS's
# indic_parler_tool (the single source of truth for Indic Parler). These
# tests now verify the HARTOS implementation directly.
# ===========================================================================

class TestIndicParlerSplitSentences:
    def test_single_sentence_returns_as_is(self):
        from integrations.service_tools.indic_parler_tool import _split_sentences
        result = _split_sentences("Hello world")
        assert result == ["Hello world"]

    def test_two_sentences_split(self):
        from integrations.service_tools.indic_parler_tool import _split_sentences
        # The regex requires non-dot/non-space before period + whitespace after
        result = _split_sentences(
            "This is the first long sentence here. And this is the second sentence that is also long enough")
        assert len(result) == 2

    def test_ellipsis_not_split(self):
        from integrations.service_tools.indic_parler_tool import _split_sentences
        result = _split_sentences("Hey... I was waiting")
        # Ellipsis should NOT cause a split
        assert len(result) == 1

    def test_short_fragments_merged(self):
        from integrations.service_tools.indic_parler_tool import _split_sentences
        # Short trailing fragment (<15 chars) should be merged with previous
        result = _split_sentences(
            "This is a long enough first sentence. This is a long enough second sentence. OK")
        # "OK" is < 15 chars, so it gets merged; result should be 2 not 3
        assert len(result) <= 2

    def test_question_mark_splits(self):
        from integrations.service_tools.indic_parler_tool import _split_sentences
        result = _split_sentences(
            "How are you doing today? I am fine thanks for asking and hope you are well too")
        assert len(result) == 2


# ===========================================================================
# 27. TTSEngine — _try_auto_install_backend
# ===========================================================================

class TestAutoInstallBackend:
    def test_skip_gpu_backend_without_gpu(self):
        engine = TTSEngine(auto_init=False)
        engine.has_gpu = False
        engine._hw_detected = True
        result = engine._try_auto_install_backend(BACKEND_F5)
        assert result is False

    def test_skip_if_already_failed(self):
        engine = TTSEngine(auto_init=False)
        TTSEngine._auto_install_failed.add('test_be')
        try:
            result = engine._try_auto_install_backend('test_be')
            assert result is False
        finally:
            TTSEngine._auto_install_failed.discard('test_be')

    def test_skip_if_already_pending(self):
        engine = TTSEngine(auto_init=False)
        TTSEngine._auto_install_pending.add('test_be2')
        try:
            result = engine._try_auto_install_backend('test_be2')
            assert result is False
        finally:
            TTSEngine._auto_install_pending.discard('test_be2')


# ===========================================================================
# 28. TTSEngine — create_sentence_pipeline and presynth_next
# ===========================================================================

class TestEnginePipelineAndPresynth:
    def test_create_sentence_pipeline(self):
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        engine._backends[BACKEND_PIPER] = MagicMock()
        pipeline = engine.create_sentence_pipeline()
        assert isinstance(pipeline, SentencePipeline)
        pipeline.shutdown()

    def test_presynth_next_delegates(self):
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        engine._backends[BACKEND_PIPER] = MagicMock()
        engine._presynth = MagicMock()
        engine.presynth_next("predicted response")
        engine._presynth.presynth_background.assert_called_once()


# ===========================================================================
# 29. TTSEngine — VRAM tool map
# ===========================================================================

class TestVRAMToolMap:
    """TTSEngine exposes VRAM tool names via _get_vram_tool_name() which
    derives from HARTOS ENGINE_REGISTRY — no local lookup table. These
    tests verify the derived mapping matches the canonical values the
    vram_manager expects."""

    def test_f5_tool_name(self):
        assert TTSEngine._get_vram_tool_name(BACKEND_F5) == 'tts_f5'

    def test_chatterbox_turbo_tool_name(self):
        assert TTSEngine._get_vram_tool_name(BACKEND_CHATTERBOX_TURBO) == 'tts_chatterbox_turbo'

    def test_piper_returns_none(self):
        """Piper is CPU-only — no VRAM tool name."""
        assert TTSEngine._get_vram_tool_name(BACKEND_PIPER) is None

    def test_all_gpu_backends_have_tool_name(self):
        for be in [BACKEND_F5, BACKEND_CHATTERBOX_TURBO, BACKEND_CHATTERBOX_ML,
                    BACKEND_INDIC_PARLER, BACKEND_COSYVOICE3]:
            assert TTSEngine._get_vram_tool_name(be) is not None, (
                f"backend {be!r} has no vram tool name"
            )


# ===========================================================================
# 30. TTSEngine — install_voice
# ===========================================================================

class TestInstallVoice:
    def test_install_voice_no_backend_returns_false(self):
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        assert engine.install_voice('v1') is False

    def test_install_voice_delegates_download_model(self):
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        mock = MagicMock()
        mock.download_model.return_value = True
        engine._backends[BACKEND_PIPER] = mock
        assert engine.install_voice('v1') is True


# ===========================================================================
# TTS_SPEED_PROFILE resolution (env var → ~/.nunba/tts_config.json → default)
# ===========================================================================

@pytest.fixture
def _speed_profile_state(monkeypatch, tmp_path):
    """Clean env + sandboxed HOME so tests never touch real config."""
    monkeypatch.delenv('TTS_SPEED_PROFILE', raising=False)
    monkeypatch.setenv('HOME', str(tmp_path))
    monkeypatch.setenv('USERPROFILE', str(tmp_path))
    _invalidate_speed_cache()
    yield tmp_path
    _invalidate_speed_cache()


class TestSpeedProfileCatalog:
    def test_four_named_profiles(self):
        assert set(_SPEED_PROFILES) == {'fast', 'balanced', 'natural', 'slow'}

    def test_fast_above_natural(self):
        assert _SPEED_PROFILES['fast'] > _SPEED_PROFILES['natural']

    def test_balanced_above_natural(self):
        assert _SPEED_PROFILES['balanced'] > _SPEED_PROFILES['natural']

    def test_slow_below_natural(self):
        assert _SPEED_PROFILES['slow'] < _SPEED_PROFILES['natural']

    def test_natural_is_exactly_one(self):
        assert _SPEED_PROFILES['natural'] == 1.0

    def test_default_is_balanced(self):
        assert _DEFAULT_SPEED_PROFILE == 'balanced'


class TestGetCurrentSpeedProfile:
    def test_default_when_nothing_set(self, _speed_profile_state):
        assert _get_current_speed_profile() == 'balanced'

    def test_env_var_overrides(self, _speed_profile_state, monkeypatch):
        monkeypatch.setenv('TTS_SPEED_PROFILE', 'fast')
        _invalidate_speed_cache()
        assert _get_current_speed_profile() == 'fast'

    def test_env_var_case_insensitive(self, _speed_profile_state, monkeypatch):
        monkeypatch.setenv('TTS_SPEED_PROFILE', 'FAST')
        _invalidate_speed_cache()
        assert _get_current_speed_profile() == 'fast'

    def test_env_var_whitespace_stripped(self, _speed_profile_state, monkeypatch):
        monkeypatch.setenv('TTS_SPEED_PROFILE', '  balanced  ')
        _invalidate_speed_cache()
        assert _get_current_speed_profile() == 'balanced'

    def test_invalid_env_var_falls_through(self, _speed_profile_state, monkeypatch):
        monkeypatch.setenv('TTS_SPEED_PROFILE', 'turbo_max')
        _invalidate_speed_cache()
        assert _get_current_speed_profile() == _DEFAULT_SPEED_PROFILE

    def test_empty_env_var_falls_through(self, _speed_profile_state, monkeypatch):
        monkeypatch.setenv('TTS_SPEED_PROFILE', '')
        _invalidate_speed_cache()
        assert _get_current_speed_profile() == _DEFAULT_SPEED_PROFILE

    def test_cache_prevents_repeat_env_reads(self, _speed_profile_state, monkeypatch):
        monkeypatch.setenv('TTS_SPEED_PROFILE', 'fast')
        _invalidate_speed_cache()
        first = _get_current_speed_profile()
        monkeypatch.setenv('TTS_SPEED_PROFILE', 'slow')
        assert _get_current_speed_profile() == first == 'fast'


class TestGetDefaultSpeed:
    def test_default_matches_balanced(self, _speed_profile_state):
        assert _get_default_speed() == _SPEED_PROFILES['balanced']

    def test_fast_multiplier(self, _speed_profile_state, monkeypatch):
        monkeypatch.setenv('TTS_SPEED_PROFILE', 'fast')
        _invalidate_speed_cache()
        assert _get_default_speed() == _SPEED_PROFILES['fast']

    def test_slow_multiplier(self, _speed_profile_state, monkeypatch):
        monkeypatch.setenv('TTS_SPEED_PROFILE', 'slow')
        _invalidate_speed_cache()
        assert _get_default_speed() == _SPEED_PROFILES['slow']

    def test_natural_multiplier(self, _speed_profile_state, monkeypatch):
        monkeypatch.setenv('TTS_SPEED_PROFILE', 'natural')
        _invalidate_speed_cache()
        assert _get_default_speed() == 1.0


class TestSetSpeedProfile:
    def test_valid_name_returns_true(self, _speed_profile_state):
        assert _set_speed_profile('fast') is True

    def test_invalid_name_returns_false(self, _speed_profile_state):
        assert _set_speed_profile('rocket_mode') is False

    def test_empty_name_returns_false(self, _speed_profile_state):
        assert _set_speed_profile('') is False

    def test_none_returns_false(self, _speed_profile_state):
        assert _set_speed_profile(None) is False

    def test_set_invalidates_cache(self, _speed_profile_state):
        assert _get_current_speed_profile() == 'balanced'
        _set_speed_profile('fast')
        assert _get_current_speed_profile() == 'fast'

    def test_set_persists_to_disk(self, _speed_profile_state):
        import json as _json
        _set_speed_profile('slow')
        cfg_path = _speed_profile_state / '.nunba' / 'tts_config.json'
        assert cfg_path.is_file()
        with cfg_path.open() as fp:
            data = _json.load(fp)
        assert data['speed_profile'] == 'slow'

    def test_persisted_profile_round_trips(self, _speed_profile_state):
        _set_speed_profile('fast')
        _invalidate_speed_cache()
        assert _get_current_speed_profile() == 'fast'

    def test_env_var_takes_priority_over_disk(self, _speed_profile_state, monkeypatch):
        _set_speed_profile('slow')
        _invalidate_speed_cache()
        monkeypatch.setenv('TTS_SPEED_PROFILE', 'fast')
        assert _get_current_speed_profile() == 'fast'

    def test_case_normalization_on_set(self, _speed_profile_state):
        assert _set_speed_profile('BALANCED') is True
        assert _get_current_speed_profile() == 'balanced'
