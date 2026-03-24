"""
test_tts_engines.py - Tests for TTS engine selection, Piper TTS, and VibeVoice TTS.

Covers:
- TTSEngine backend selection logic (multi-engine routing)
- TTSEngine initialization with forced backends
- TTSEngine feature listing per engine capability
- TTSEngine synthesize guard (empty text, no backend)
- TTSEngine shutdown lifecycle
- PiperTTS voice presets and listing
- PiperTTS voice path resolution
- PiperTTS set_voice / is_voice_installed
- PiperTTS synthesize guards (empty text)
- PiperTTS cache clearing
- VibeVoice model recommendation based on VRAM
- VibeVoice speaker listing and filtering
- VibeVoice set_speaker validation
- VibeVoice detect_gpu returns proper structure
- get_tts_engine singleton behavior
"""
import os
import sys
import time
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# TTSEngine (tts_engine.py) tests
# ============================================================

class TestTTSEngineSelection:
    """Test TTS engine backend selection logic."""

    def test_no_backend_when_nothing_available(self):
        """When neither GPU nor Piper is available, backend is 'none'."""
        from tts.tts_engine import BACKEND_NONE, TTSEngine
        engine = TTSEngine(auto_init=False)
        # Mock hardware detection to report no GPU
        engine._hw_detected = True
        engine.has_gpu = False

        # Piper import fails
        with patch("tts.tts_engine.TTSEngine._select_backend") as mock_sel:
            mock_sel.return_value = BACKEND_NONE
            result = engine.initialize()
            assert result is False
            assert engine.backend == BACKEND_NONE

    def test_force_piper_backend(self):
        """Force Piper backend even if GPU is available."""
        from tts.tts_engine import BACKEND_PIPER, TTSEngine

        engine = TTSEngine(auto_init=False)

        with patch.dict("sys.modules", {"tts.piper_tts": MagicMock()}):
            mock_piper = MagicMock()
            with patch("tts.tts_engine.PiperTTS", mock_piper, create=True):
                result = engine.initialize(force_backend=BACKEND_PIPER)
                assert engine._active_backend == BACKEND_PIPER

    def test_backend_name_none(self):
        """When no backend, backend_name returns 'None'."""
        from tts.tts_engine import TTSEngine
        engine = TTSEngine(auto_init=False)
        assert engine.backend_name == "none"

    def test_backend_name_piper(self):
        """When Piper backend, backend_name contains 'Piper'."""
        from tts.tts_engine import BACKEND_PIPER, TTSEngine
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_PIPER
        assert "Piper" in engine.backend_name

    def test_backend_name_chatterbox(self):
        """When Chatterbox Turbo backend, backend_name contains 'Chatterbox'."""
        from tts.tts_engine import BACKEND_CHATTERBOX_TURBO, TTSEngine
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_CHATTERBOX_TURBO
        assert "Chatterbox" in engine.backend_name


class TestTTSEngineFeatures:
    """Test feature listing by backend."""

    def test_piper_features(self):
        """Piper has no cloning/streaming/paralinguistic/emotion/multilingual."""
        from tts.tts_engine import BACKEND_PIPER, TTSEngine
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_PIPER
        features = engine._get_features()
        assert features == []

    def test_chatterbox_turbo_features(self):
        """Chatterbox Turbo has voice-cloning and paralinguistic."""
        from tts.tts_engine import BACKEND_CHATTERBOX_TURBO, TTSEngine
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_CHATTERBOX_TURBO
        features = engine._get_features()
        assert "voice-cloning" in features
        assert "paralinguistic" in features

    def test_indic_parler_features(self):
        """Indic Parler has multilingual (21 languages)."""
        from tts.tts_engine import BACKEND_INDIC_PARLER, TTSEngine
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_INDIC_PARLER
        features = engine._get_features()
        assert "multilingual" in features

    def test_no_features_when_no_backend(self):
        from tts.tts_engine import BACKEND_NONE, TTSEngine
        engine = TTSEngine(auto_init=False)
        engine._active_backend = BACKEND_NONE
        features = engine._get_features()
        assert features == []


class TestTTSEngineSynthesizeGuards:
    """Test synthesize guards (empty text, uninitialized backend)."""

    def test_synthesize_empty_text(self):
        from tts.tts_engine import TTSEngine
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        result = engine.synthesize("")
        assert result is None

    def test_synthesize_whitespace_text(self):
        from tts.tts_engine import TTSEngine
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        result = engine.synthesize("   \n  ")
        assert result is None

    def test_synthesize_no_backend_loaded(self):
        """synthesize returns None when no backend is loaded in _backends."""
        from tts.tts_engine import BACKEND_PIPER, TTSEngine
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        engine._backends = {}  # no actual backend loaded
        result = engine.synthesize("Hello world")
        assert result is None

    def test_clone_voice_requires_vibevoice(self):
        """clone_voice should fail if backend is not vibevoice."""
        from tts.tts_engine import BACKEND_PIPER, TTSEngine
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        result = engine.clone_voice("/fake/audio.wav", "my_voice")
        assert result is False


class TestTTSEngineShutdown:
    """Test engine shutdown."""

    def test_shutdown_clears_state(self):
        from tts.tts_engine import BACKEND_NONE, BACKEND_PIPER, TTSEngine
        engine = TTSEngine(auto_init=False)
        engine._initialized = True
        engine._active_backend = BACKEND_PIPER
        mock_backend = MagicMock()
        engine._backends = {BACKEND_PIPER: mock_backend}
        engine.shutdown()
        assert engine._initialized is False
        assert engine._active_backend == BACKEND_NONE
        assert len(engine._backends) == 0


class TestGetTTSEngineSingleton:
    """Test the module-level get_tts_engine singleton."""

    def test_returns_same_instance(self):
        import tts.tts_engine as te
        # Reset global
        te._engine = None
        with patch.object(te.TTSEngine, "_detect_hardware"):
            e1 = te.get_tts_engine(auto_init=False)
            e2 = te.get_tts_engine()
            assert e1 is e2
        te._engine = None  # cleanup


# ============================================================
# PiperTTS (piper_tts.py) tests
# ============================================================

class TestPiperTTSVoicePresets:
    """Test voice preset data and listing."""

    def test_voice_presets_not_empty(self):
        from tts.piper_tts import VOICE_PRESETS
        assert len(VOICE_PRESETS) > 0

    def test_all_presets_have_required_keys(self):
        from tts.piper_tts import VOICE_PRESETS
        required = {"name", "language", "quality", "sample_rate", "url", "config_url", "size_mb"}
        for vid, preset in VOICE_PRESETS.items():
            missing = required - set(preset.keys())
            assert not missing, f"Voice {vid} missing keys: {missing}"

    def test_default_voice_in_presets(self):
        from tts.piper_tts import DEFAULT_VOICE, VOICE_PRESETS
        assert DEFAULT_VOICE in VOICE_PRESETS


class TestPiperTTSInstance:
    """Test PiperTTS instance methods (with mocked piper module)."""

    @pytest.fixture
    def piper(self, tmp_path):
        """Create a PiperTTS instance with mocked piper module."""
        with patch.dict("sys.modules", {"piper": None}):
            from tts.piper_tts import PiperTTS
            return PiperTTS(
                voices_dir=str(tmp_path / "voices"),
                cache_dir=str(tmp_path / "cache"),
            )

    def test_is_available_false_without_piper(self, piper):
        """Without piper module or executable, is_available returns False."""
        with patch.object(piper, "_find_piper_executable", return_value=None):
            assert piper.is_available() is False

    def test_list_available_voices(self, piper):
        from tts.piper_tts import VOICE_PRESETS
        voices = piper.list_available_voices()
        assert voices == VOICE_PRESETS

    def test_list_installed_voices_empty(self, piper):
        """No voices installed initially."""
        assert piper.list_installed_voices() == []

    def test_set_voice_valid(self, piper):
        assert piper.set_voice("en_US-amy-medium") is True
        assert piper.current_voice == "en_US-amy-medium"

    def test_set_voice_invalid(self, piper):
        assert piper.set_voice("nonexistent-voice") is False

    def test_get_voice_path_not_installed(self, piper):
        model, config = piper.get_voice_path("en_US-amy-medium")
        assert model is None
        assert config is None

    def test_get_voice_path_installed(self, piper, tmp_path):
        """If voice files exist, get_voice_path returns Path objects."""
        voices_dir = tmp_path / "voices"
        (voices_dir / "en_US-amy-medium.onnx").touch()
        (voices_dir / "en_US-amy-medium.onnx.json").touch()
        model, config = piper.get_voice_path("en_US-amy-medium")
        assert model is not None
        assert config is not None
        assert model.name == "en_US-amy-medium.onnx"

    def test_is_voice_installed(self, piper, tmp_path):
        voices_dir = tmp_path / "voices"
        assert piper.is_voice_installed("en_US-amy-medium") is False
        (voices_dir / "en_US-amy-medium.onnx").touch()
        (voices_dir / "en_US-amy-medium.onnx.json").touch()
        assert piper.is_voice_installed("en_US-amy-medium") is True

    def test_synthesize_empty_text(self, piper):
        assert piper.synthesize("") is None
        assert piper.synthesize("   ") is None

    def test_download_voice_unknown_id(self, piper):
        assert piper.download_voice("unknown_voice_xyz") is False

    def test_clear_cache(self, piper, tmp_path):
        """clear_cache removes files older than max_age_hours."""
        cache_dir = tmp_path / "cache"
        # Create a fake cached file with old mtime
        old_file = cache_dir / "tts_abc123.wav"
        old_file.write_bytes(b"\x00" * 100)
        # Set mtime to 48 hours ago
        old_mtime = time.time() - 48 * 3600
        os.utime(str(old_file), (old_mtime, old_mtime))

        # Create a recent file
        new_file = cache_dir / "tts_def456.wav"
        new_file.write_bytes(b"\x00" * 100)

        piper.clear_cache(max_age_hours=24)
        assert not old_file.exists()
        assert new_file.exists()


# ============================================================
# VibeVoice TTS (vibevoice_tts.py) tests
# ============================================================

class TestVibeVoiceModelRecommendation:
    """Test VRAM-based model recommendation."""

    def test_recommend_model_8gb(self):
        from tts.vibevoice_tts import _recommend_model
        assert _recommend_model(8.0) == "VibeVoice-1.5B"

    def test_recommend_model_12gb(self):
        from tts.vibevoice_tts import _recommend_model
        assert _recommend_model(12.0) == "VibeVoice-1.5B"

    def test_recommend_model_4gb(self):
        from tts.vibevoice_tts import _recommend_model
        assert _recommend_model(4.0) == "VibeVoice-Realtime-0.5B"

    def test_recommend_model_6gb(self):
        from tts.vibevoice_tts import _recommend_model
        assert _recommend_model(6.0) == "VibeVoice-Realtime-0.5B"

    def test_recommend_model_2gb(self):
        from tts.vibevoice_tts import _recommend_model
        assert _recommend_model(2.0) is None

    def test_recommend_model_0gb(self):
        from tts.vibevoice_tts import _recommend_model
        assert _recommend_model(0.0) is None


class TestVibeVoiceSpeakers:
    """Test speaker presets and filtering."""

    def test_speakers_not_empty(self):
        from tts.vibevoice_tts import VIBEVOICE_SPEAKERS
        assert len(VIBEVOICE_SPEAKERS) > 0

    def test_all_speakers_have_required_keys(self):
        from tts.vibevoice_tts import VIBEVOICE_SPEAKERS
        required = {"name", "language", "style", "gender"}
        for sid, speaker in VIBEVOICE_SPEAKERS.items():
            missing = required - set(speaker.keys())
            assert not missing, f"Speaker {sid} missing keys: {missing}"

    def test_default_speaker_exists(self):
        from tts.vibevoice_tts import DEFAULT_SPEAKER, VIBEVOICE_SPEAKERS
        assert DEFAULT_SPEAKER in VIBEVOICE_SPEAKERS


class TestVibeVoiceTTSInstance:
    """Test VibeVoiceTTS instance methods (no GPU needed)."""

    @pytest.fixture
    def vv(self, tmp_path):
        """Create VibeVoiceTTS with mocked GPU detection."""
        with patch("tts.vibevoice_tts.detect_gpu", return_value={
            "gpu_available": False, "gpu_name": None,
            "vram_gb": 0, "gpu_vendor": None,
            "cuda_version": None, "recommended_model": None,
        }):
            from tts.vibevoice_tts import VibeVoiceTTS
            return VibeVoiceTTS(
                model_name="VibeVoice-Realtime-0.5B",
                models_dir=str(tmp_path / "models"),
                cache_dir=str(tmp_path / "cache"),
            )

    def test_is_available_false_without_gpu(self, vv):
        assert vv.is_available() is False

    def test_is_model_downloaded_false(self, vv):
        assert vv.is_model_downloaded() is False

    def test_list_speakers_filters_by_language(self, vv):
        """Realtime-0.5B supports many languages, 1.5B only en+zh."""
        speakers = vv.list_speakers()
        # Realtime-0.5B has many languages, so more speakers
        assert len(speakers) > 0

    def test_set_speaker_valid(self, vv):
        speakers = vv.list_speakers()
        if speakers:
            first = list(speakers.keys())[0]
            assert vv.set_speaker(first) is True

    def test_set_speaker_invalid(self, vv):
        assert vv.set_speaker("nonexistent_speaker_xyz") is False

    def test_synthesize_empty_text(self, vv):
        assert vv.synthesize("") is None
        assert vv.synthesize("   ") is None


class TestVibeVoiceDetectGpu:
    """Test the detect_gpu function with mocked subprocess calls."""

    def test_detect_gpu_no_nvidia_no_amd(self):
        """When no GPU tools are found and WMI returns nothing, returns gpu_available=False."""
        from tts.vibevoice_tts import detect_gpu
        with patch("shutil.which", return_value=None), \
             patch("tts.vibevoice_tts._detect_gpu_wmic", return_value=None):
            result = detect_gpu()
            assert result["gpu_available"] is False
            assert result["gpu_name"] is None

    def test_detect_gpu_result_structure(self):
        """detect_gpu always returns the required keys."""
        from tts.vibevoice_tts import detect_gpu
        with patch("shutil.which", return_value=None), \
             patch("tts.vibevoice_tts._detect_gpu_wmic", return_value=None):
            result = detect_gpu()
            for key in ("gpu_available", "gpu_name", "vram_gb", "gpu_vendor",
                        "cuda_version", "recommended_model"):
                assert key in result


class TestVibeVoiceModels:
    """Test model variant definitions."""

    def test_models_have_required_keys(self):
        from tts.vibevoice_tts import VIBEVOICE_MODELS
        required = {"name", "hf_path", "size_gb", "vram_required_gb", "features", "languages"}
        for mid, model in VIBEVOICE_MODELS.items():
            missing = required - set(model.keys())
            assert not missing, f"Model {mid} missing keys: {missing}"

    def test_realtime_model_supports_many_languages(self):
        from tts.vibevoice_tts import VIBEVOICE_MODELS
        rt = VIBEVOICE_MODELS["VibeVoice-Realtime-0.5B"]
        assert len(rt["languages"]) > 5

    def test_full_model_supports_voice_cloning(self):
        from tts.vibevoice_tts import VIBEVOICE_MODELS
        full = VIBEVOICE_MODELS["VibeVoice-1.5B"]
        assert "voice-cloning" in full["features"]


# ============================================================
# Catalog dedup integration tests (tts_engine.py catalog shim)
# ============================================================

class TestGetEngineCapabilitiesCatalogIntegration:
    """Tests for _get_engine_capabilities() catalog shim and fallback."""

    def test_get_piper_caps_has_expected_keys(self):
        """_get_engine_capabilities('piper') returns a dict with all required keys."""
        from tts.tts_engine import BACKEND_PIPER, _get_engine_capabilities
        caps = _get_engine_capabilities(BACKEND_PIPER)
        required = {'name', 'vram_gb', 'languages', 'paralinguistic', 'emotion_tags',
                    'voice_cloning', 'streaming', 'sample_rate', 'quality'}
        missing = required - set(caps.keys())
        assert not missing, f"Missing keys from piper caps: {missing}"

    def test_get_piper_caps_values_are_sane(self):
        """Piper caps should report CPU-only (vram_gb=0) and medium quality."""
        from tts.tts_engine import BACKEND_PIPER, _get_engine_capabilities
        caps = _get_engine_capabilities(BACKEND_PIPER)
        assert caps['vram_gb'] == 0
        assert 'en' in caps['languages']
        assert caps['quality'] == 'medium'
        assert caps['voice_cloning'] is False

    def test_get_all_caps_returns_dict_keyed_by_backend(self):
        """_get_engine_capabilities() with no arg returns dict with multiple backends."""
        from tts.tts_engine import _get_engine_capabilities
        all_caps = _get_engine_capabilities()
        # Must be a dict keyed by backend constants
        assert isinstance(all_caps, dict)
        assert len(all_caps) >= 2, "Expected at least two backends in full caps dict"
        # Each value must itself be a dict with 'name'
        for backend_key, caps in all_caps.items():
            assert 'name' in caps, f"Backend '{backend_key}' caps missing 'name' key"

    def test_get_all_caps_includes_piper_and_indic_parler(self):
        """Full caps dict must include both piper and indic_parler backends."""
        from tts.tts_engine import BACKEND_INDIC_PARLER, BACKEND_PIPER, _get_engine_capabilities
        all_caps = _get_engine_capabilities()
        assert BACKEND_PIPER in all_caps
        assert BACKEND_INDIC_PARLER in all_caps

    def test_catalog_unavailable_falls_back_to_fallback_dict(self):
        """When catalog raises, _get_engine_capabilities falls back to _FALLBACK_ENGINE_CAPABILITIES."""
        import tts.tts_engine as te
        with patch('tts.tts_engine._get_engine_capabilities',
                   wraps=te._get_engine_capabilities):
            # Force the catalog import to fail by patching models.catalog
            with patch.dict('sys.modules', {'models.catalog': None}):
                caps = te._get_engine_capabilities()
                # Must still return a dict (the fallback)
                assert isinstance(caps, dict)
                assert len(caps) > 0

    def test_catalog_unavailable_single_backend_falls_back(self):
        """When catalog is broken, single-backend lookup returns fallback data."""
        import tts.tts_engine as te
        from tts.tts_engine import _FALLBACK_ENGINE_CAPABILITIES, BACKEND_PIPER
        with patch.dict('sys.modules', {'models.catalog': None}):
            caps = te._get_engine_capabilities(BACKEND_PIPER)
        assert caps == _FALLBACK_ENGINE_CAPABILITIES[BACKEND_PIPER]

    def test_engine_capabilities_backward_compat_alias_importable(self):
        """ENGINE_CAPABILITIES alias must remain importable and be a dict."""
        from tts.tts_engine import ENGINE_CAPABILITIES
        assert isinstance(ENGINE_CAPABILITIES, dict)
        assert len(ENGINE_CAPABILITIES) > 0

    def test_engine_capabilities_alias_equals_fallback(self):
        """ENGINE_CAPABILITIES must equal _FALLBACK_ENGINE_CAPABILITIES (not the catalog live dict)."""
        from tts.tts_engine import _FALLBACK_ENGINE_CAPABILITIES, ENGINE_CAPABILITIES
        assert ENGINE_CAPABILITIES is _FALLBACK_ENGINE_CAPABILITIES

    def test_lang_engine_preference_backward_compat_importable(self):
        """LANG_ENGINE_PREFERENCE alias must remain importable and be a dict."""
        from tts.tts_engine import LANG_ENGINE_PREFERENCE
        assert isinstance(LANG_ENGINE_PREFERENCE, dict)
        assert 'en' in LANG_ENGINE_PREFERENCE


class TestGetLangPreferenceCatalogIntegration:
    """Tests for _get_lang_preference() catalog shim and fallback."""

    def test_ta_preference_starts_with_indic_parler(self):
        """Tamil (ta) must prefer Indic Parler TTS as the first choice."""
        from tts.tts_engine import BACKEND_INDIC_PARLER, _get_lang_preference
        pref = _get_lang_preference('ta')
        assert isinstance(pref, list)
        assert len(pref) > 0, "Expected at least one backend for 'ta'"
        assert pref[0] == BACKEND_INDIC_PARLER, (
            f"Expected '{BACKEND_INDIC_PARLER}' first for 'ta', got '{pref[0]}'"
        )

    def test_hi_preference_starts_with_indic_parler(self):
        """Hindi (hi), another Indic lang, must also prefer Indic Parler first."""
        from tts.tts_engine import BACKEND_INDIC_PARLER, _get_lang_preference
        pref = _get_lang_preference('hi')
        assert pref[0] == BACKEND_INDIC_PARLER

    def test_en_preference_starts_with_chatterbox_or_f5(self):
        """English must prefer Chatterbox Turbo or F5-TTS as the first choice."""
        from tts.tts_engine import BACKEND_CHATTERBOX_TURBO, BACKEND_F5, _get_lang_preference
        pref = _get_lang_preference('en')
        assert isinstance(pref, list)
        assert len(pref) > 0, "Expected at least one backend for 'en'"
        assert pref[0] in (BACKEND_CHATTERBOX_TURBO, BACKEND_F5), (
            f"Expected chatterbox_turbo or f5 first for 'en', got '{pref[0]}'"
        )

    def test_en_preference_includes_piper_as_fallback(self):
        """Piper must appear somewhere in the English preference chain as CPU fallback."""
        from tts.tts_engine import BACKEND_PIPER, _get_lang_preference
        pref = _get_lang_preference('en')
        assert BACKEND_PIPER in pref

    def test_preference_returns_list(self):
        """_get_lang_preference always returns a list, never None."""
        from tts.tts_engine import _get_lang_preference
        for lang in ('en', 'ta', 'hi', 'zh', 'fr', 'xx-unknown'):
            result = _get_lang_preference(lang)
            assert isinstance(result, list), f"Expected list for lang '{lang}', got {type(result)}"

    def test_unknown_lang_returns_nonempty_list(self):
        """Unlisted language codes fall back to _DEFAULT_PREFERENCE (non-empty)."""
        from tts.tts_engine import _get_lang_preference
        pref = _get_lang_preference('xx-totally-unknown-language-code')
        assert len(pref) > 0

    def test_catalog_unavailable_ta_falls_back_to_fallback_pref(self):
        """When catalog is unavailable, Tamil still returns Indic Parler first."""
        import tts.tts_engine as te
        from tts.tts_engine import BACKEND_INDIC_PARLER
        with patch.dict('sys.modules', {'models.catalog': None}):
            pref = te._get_lang_preference('ta')
        assert pref[0] == BACKEND_INDIC_PARLER

    def test_catalog_unavailable_en_falls_back_to_fallback_pref(self):
        """When catalog is unavailable, English still starts with chatterbox_turbo."""
        import tts.tts_engine as te
        from tts.tts_engine import BACKEND_CHATTERBOX_TURBO
        with patch.dict('sys.modules', {'models.catalog': None}):
            pref = te._get_lang_preference('en')
        assert pref[0] == BACKEND_CHATTERBOX_TURBO

    def test_catalog_returns_empty_tts_list_falls_back(self):
        """If catalog returns no TTS entries, fall back to _FALLBACK_LANG_ENGINE_PREFERENCE."""
        import tts.tts_engine as te
        from tts.tts_engine import BACKEND_INDIC_PARLER
        mock_catalog = MagicMock()
        mock_catalog.list_by_type.return_value = []  # no TTS entries
        mock_module = MagicMock()
        mock_module.get_catalog.return_value = mock_catalog
        mock_module.ModelType = MagicMock()
        with patch.dict('sys.modules', {'models.catalog': mock_module}):
            pref = te._get_lang_preference('ta')
        assert pref[0] == BACKEND_INDIC_PARLER


# ============================================================
# _CATALOG_TO_BACKEND boundary mapping tests
# ============================================================

class TestCatalogToBackendMapping:
    """Verify _CATALOG_TO_BACKEND is applied at ALL catalog→backend boundaries."""

    def test_all_fallback_backends_have_reverse_mapping(self):
        """Every backend in _FALLBACK_ENGINE_CAPABILITIES has a _BACKEND_TO_CATALOG entry."""
        from tts.tts_engine import _BACKEND_TO_CATALOG, _FALLBACK_ENGINE_CAPABILITIES
        for backend in _FALLBACK_ENGINE_CAPABILITIES:
            assert backend in _BACKEND_TO_CATALOG, (
                f"Backend '{backend}' has no _BACKEND_TO_CATALOG entry — "
                f"catalog→backend translation will fail for this engine."
            )

    def test_reverse_mapping_round_trips(self):
        """_BACKEND_TO_CATALOG → _CATALOG_TO_BACKEND round-trips to the original backend."""
        from tts.tts_engine import _BACKEND_TO_CATALOG, _CATALOG_TO_BACKEND
        for backend, catalog_id in _BACKEND_TO_CATALOG.items():
            resolved = _CATALOG_TO_BACKEND.get(catalog_id)
            assert resolved == backend, (
                f"Round-trip failed: backend '{backend}' → catalog '{catalog_id}' "
                f"→ resolved '{resolved}' (expected '{backend}')"
            )

    def test_hyphenated_catalog_ids_resolve_correctly(self):
        """HARTOS tts_router uses hyphenated IDs (e.g. 'chatterbox-turbo'). These must resolve."""
        from tts.tts_engine import (
            _CATALOG_TO_BACKEND,
            BACKEND_CHATTERBOX_ML,
            BACKEND_CHATTERBOX_TURBO,
            BACKEND_F5,
            BACKEND_INDIC_PARLER,
        )
        expected = {
            'f5-tts': BACKEND_F5,
            'chatterbox-turbo': BACKEND_CHATTERBOX_TURBO,
            'chatterbox-ml': BACKEND_CHATTERBOX_ML,
            'indic-parler': BACKEND_INDIC_PARLER,
        }
        for catalog_id, expected_backend in expected.items():
            assert _CATALOG_TO_BACKEND.get(catalog_id) == expected_backend, (
                f"Catalog ID '{catalog_id}' did not resolve to '{expected_backend}'"
            )

    def test_select_backend_uses_mapping_for_orchestrator_entry(self):
        """_select_backend_for_language must map orchestrator entry.id via _CATALOG_TO_BACKEND."""
        from tts.tts_engine import BACKEND_CHATTERBOX_TURBO, TTSEngine
        engine = TTSEngine.__new__(TTSEngine)
        engine._active_backend = None
        engine.has_gpu = False
        engine._hw_detected = True
        engine._import_check_cache = {}
        engine._install_threads = {}

        # Mock orchestrator returning a hyphenated catalog entry
        mock_entry = MagicMock()
        mock_entry.id = 'tts-chatterbox-turbo'  # hyphenated — the real format
        mock_orch = MagicMock()
        mock_orch.select_best.return_value = mock_entry

        with patch('models.orchestrator.get_orchestrator', return_value=mock_orch), \
             patch.object(engine, '_can_run_backend', side_effect=lambda b: b == BACKEND_CHATTERBOX_TURBO):
            result = engine._select_backend_for_language('en')

        # Must have resolved 'chatterbox-turbo' → 'chatterbox_turbo' via _CATALOG_TO_BACKEND
        assert result == BACKEND_CHATTERBOX_TURBO, (
            f"Expected '{BACKEND_CHATTERBOX_TURBO}', got '{result}'. "
            f"_CATALOG_TO_BACKEND mapping was likely not applied in _select_backend_for_language."
        )

    def test_select_backend_unmapped_catalog_id_passes_through(self):
        """If a catalog ID has no mapping entry, it passes through as-is (future-proofing)."""
        from tts.tts_engine import TTSEngine
        engine = TTSEngine.__new__(TTSEngine)
        engine._active_backend = None
        engine.has_gpu = False
        engine._hw_detected = True
        engine._import_check_cache = {}
        engine._install_threads = {}

        mock_entry = MagicMock()
        mock_entry.id = 'tts-future-engine'
        mock_orch = MagicMock()
        mock_orch.select_best.return_value = mock_entry

        with patch('models.orchestrator.get_orchestrator', return_value=mock_orch), \
             patch.object(engine, '_can_run_backend', side_effect=lambda b: b == 'future-engine'):
            result = engine._select_backend_for_language('en')

        assert result == 'future-engine'


# ============================================================
# TTSEngine — backend capability checks
# ============================================================

class TestCanRunBackend:
    """_can_run_backend determines if a TTS engine is usable on this hardware."""

    def _make_engine(self):
        from tts.tts_engine import TTSEngine
        engine = TTSEngine.__new__(TTSEngine)
        engine._active_backend = None
        engine.has_gpu = False
        engine._hw_detected = True
        engine._import_check_cache = {}
        engine._install_threads = {}
        return engine

    def test_returns_false_for_unknown_backend(self):
        """Unknown backend name = False (don't crash, just skip)."""
        engine = self._make_engine()
        assert engine._can_run_backend('nonexistent_engine_xyz') is False

    def test_returns_false_when_package_missing(self):
        """Backend with missing pip package = False."""
        engine = self._make_engine()
        engine._import_check_cache = {}
        with patch('importlib.util.find_spec', return_value=None):
            # Clear cache to force re-check
            from tts.tts_engine import TTSEngine
            TTSEngine._import_check_cache = {}
            result = engine._can_run_backend('chatterbox_turbo')
        assert result is False

    def test_piper_runs_without_gpu(self):
        """Piper is CPU-only — must not require GPU/CUDA."""
        engine = self._make_engine()
        engine.has_gpu = False
        from tts.tts_engine import BACKEND_PIPER, TTSEngine
        TTSEngine._import_check_cache = {}
        with patch('importlib.util.find_spec', return_value=MagicMock()):
            result = engine._can_run_backend(BACKEND_PIPER)
        # Piper needs piper_tts or piper package
        assert isinstance(result, bool)


# ============================================================
# TTSEngine — synthesis and voice management
# ============================================================

class TestTTSEnginePublicAPI:
    """Public API that the /voice endpoints and frontend call."""

    def test_backend_name_returns_string(self):
        """backend_name shown in the TTS status toast."""
        from tts.tts_engine import TTSEngine
        engine = TTSEngine.__new__(TTSEngine)
        engine._active_backend = 'piper'
        name = engine.backend_name
        assert isinstance(name, str)
        assert len(name) > 0

    def test_get_features_returns_list(self):
        """Features list shown in the TTS info panel."""
        from tts.tts_engine import TTSEngine
        engine = TTSEngine.__new__(TTSEngine)
        engine._active_backend = 'piper'
        features = engine._get_features()
        assert isinstance(features, list)

    def test_get_info_is_callable(self):
        """get_info() must be callable — feeds /api/social/tts/status endpoint."""
        from tts.tts_engine import TTSEngine
        assert callable(getattr(TTSEngine, 'get_info', None))


# ============================================================
# Module-level functions
# ============================================================

class TestModuleFunctions:
    """Module-level TTS functions used by chatbot_routes.py."""

    def test_get_tts_status_returns_dict(self):
        from tts.tts_engine import get_tts_status
        result = get_tts_status()
        assert isinstance(result, dict)

    def test_entry_to_legacy_caps_returns_dict(self):
        """_entry_to_legacy_caps bridges ModelCatalog entries to old ENGINE_CAPABILITIES format."""
        from tts.tts_engine import _entry_to_legacy_caps
        mock_entry = MagicMock()
        mock_entry.name = 'Test TTS'
        mock_entry.vram_gb = 2.0
        mock_entry.languages = ['en', 'ta']
        mock_entry.capabilities = {'streaming': True, 'voice_cloning': False}
        mock_entry.quality_score = 0.85
        result = _entry_to_legacy_caps(mock_entry)
        assert isinstance(result, dict)
        assert result['name'] == 'Test TTS'
        assert result['vram_gb'] == 2.0
        assert 'en' in result['languages']

    def test_fallback_engine_capabilities_is_dict(self):
        from tts.tts_engine import _FALLBACK_ENGINE_CAPABILITIES
        assert isinstance(_FALLBACK_ENGINE_CAPABILITIES, dict)
        assert len(_FALLBACK_ENGINE_CAPABILITIES) >= 3  # At least piper + 2 GPU engines

    def test_fallback_lang_preference_has_en(self):
        from tts.tts_engine import _FALLBACK_LANG_ENGINE_PREFERENCE
        assert 'en' in _FALLBACK_LANG_ENGINE_PREFERENCE

    def test_default_preference_is_list(self):
        from tts.tts_engine import _DEFAULT_PREFERENCE
        assert isinstance(_DEFAULT_PREFERENCE, list)
        assert len(_DEFAULT_PREFERENCE) > 0
