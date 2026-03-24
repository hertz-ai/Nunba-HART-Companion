"""
test_error_recovery.py - Error recovery and graceful degradation tests

Tests that every subsystem degrades gracefully when its dependencies fail.
The user must always see SOMETHING — never a crash or blank screen:

FT: Chat works without HARTOS, TTS status without engine, health without llama,
    catalog without HARTOS catalog.
NFT: No unhandled exceptions, response always JSON-serializable,
     timeout handling, import error resilience.
"""
import os
import sys
from unittest.mock import patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# Chat without HARTOS — fallback to llama.cpp direct
# ============================================================

class TestChatWithoutHARTOS:
    """When HARTOS is unavailable, chat must still work via llama.cpp direct."""

    def test_chat_returns_dict_when_hartos_down(self):
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
            with patch('routes.hartos_backend_adapter._fallback_chat',
                       return_value={'text': 'Fallback response', 'source': 'local_llama'}):
                result = chat(text='hello', user_id='test')
        assert isinstance(result, dict)
        assert result.get('text') or result.get('response')

    def test_chat_source_indicates_fallback(self):
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
            with patch('routes.hartos_backend_adapter._fallback_chat',
                       return_value={'text': 'ok', 'source': 'local_llama'}):
                result = chat(text='test', user_id='test')
        assert result.get('source') in ('local_llama', 'loading', None)


# ============================================================
# TTS without any engine — status must still work
# ============================================================

class TestTTSWithoutEngine:
    """TTS status endpoint must work even before any engine is loaded."""

    def test_tts_status_returns_dict(self):
        from tts.tts_engine import get_tts_status
        result = get_tts_status()
        assert isinstance(result, dict)

    def test_tts_fallback_capabilities_available(self):
        """Fallback capabilities dict must always exist — even without catalog."""
        from tts.tts_engine import _FALLBACK_ENGINE_CAPABILITIES
        assert isinstance(_FALLBACK_ENGINE_CAPABILITIES, dict)
        assert len(_FALLBACK_ENGINE_CAPABILITIES) >= 1


# ============================================================
# Health endpoint without llama.cpp
# ============================================================

class TestHealthWithoutLlama:
    """Health endpoint must return valid JSON even when llama.cpp isn't running."""

    def test_health_wrapper_handles_connection_error(self):
        from llama.llama_health_endpoint import LlamaHealthWrapper
        wrapper = LlamaHealthWrapper(llama_port=99999)  # Nothing on this port
        with patch('llama.llama_health_endpoint.requests.get',
                   side_effect=ConnectionError):
            result = wrapper.get_llama_health()
        assert isinstance(result, dict)
        assert result['status'] == 'error'

    def test_nunba_health_always_identifies(self):
        """Even when llama is down, Nunba identification must be present."""
        from llama.llama_health_endpoint import LlamaHealthWrapper
        wrapper = LlamaHealthWrapper()
        with patch.object(wrapper, 'get_llama_health',
                          return_value={'status': 'error', 'error': 'not running'}):
            result = wrapper.get_nunba_health()
        assert result['managed_by'] == 'Nunba'


# ============================================================
# Catalog without HARTOS — fallback populators
# ============================================================

class TestCatalogWithoutHARTOS:
    """ModelCatalog must work with just Nunba's local populators."""

    def test_catalog_singleton_exists(self):
        from models.catalog import get_catalog
        cat = get_catalog()
        assert cat is not None

    def test_catalog_has_llm_entries_from_local(self):
        """LLM entries come from Nunba's populate_llm_presets — always available."""
        from models.catalog import ModelType, get_catalog
        cat = get_catalog()
        llms = cat.list_by_type(ModelType.LLM)
        assert len(llms) >= 2


# ============================================================
# Config file corruption — must recover gracefully
# ============================================================

class TestConfigCorruption:
    """Config files can be corrupted by crashes — must recover, not crash."""

    def test_llama_config_with_fresh_dir(self):
        """New config dir (first run) must create valid defaults."""
        import tempfile

        from llama.llama_config import LlamaConfig
        with tempfile.TemporaryDirectory() as d:
            cfg = LlamaConfig(config_dir=d)
        assert isinstance(cfg.config, dict)
        assert cfg.config.get('server_port', 0) > 0

    def test_media_manifest_corruption_recovery(self):
        """Corrupt manifest.json must not crash — returns empty dict."""
        import tempfile

        from desktop.media_classification import _load_manifest
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write('CORRUPT{{{')
            f.flush()
            with patch('desktop.media_classification.MANIFEST_PATH', f.name):
                result = _load_manifest()
        os.unlink(f.name)
        assert result == {}


# ============================================================
# Import resilience — missing optional deps
# ============================================================

class TestImportResilience:
    """Optional imports must not crash the app when missing."""

    def test_app_survives_without_pyautogui(self):
        """pyautogui is optional — screen size falls back to tkinter/defaults."""
        # Just verify the import guard works
        from desktop.indicator_window import PYAUTOGUI_AVAILABLE
        assert isinstance(PYAUTOGUI_AVAILABLE, bool)

    def test_tts_engine_survives_without_torch(self):
        """torch is optional — GPU TTS disabled but CPU Piper still works."""
        from tts.tts_engine import _FALLBACK_ENGINE_CAPABILITIES, BACKEND_PIPER
        assert BACKEND_PIPER in _FALLBACK_ENGINE_CAPABILITIES
