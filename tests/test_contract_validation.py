"""
test_contract_validation.py - Cross-component contract tests

Verifies that the interfaces between Nunba modules match what callers expect.
These catch integration bugs where one module changes its API shape and breaks callers:

FT: LlamaConfig public API shape, TTSEngine public API shape, ModelCatalog
    singleton contract, adapter chat() return shape, chatbot_routes helper shapes.
NFT: Backward compatibility of import paths, enum value stability.
"""
import os
import sys
import tempfile
from unittest.mock import patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# LlamaConfig — public API consumed by app.py, main.py, chatbot_routes
# ============================================================

class TestLlamaConfigContract:
    """LlamaConfig is instantiated in 5+ places — API shape must be stable."""

    def test_has_config_dict(self):
        from llama.llama_config import LlamaConfig
        with tempfile.TemporaryDirectory() as d:
            cfg = LlamaConfig(config_dir=d)
        assert isinstance(cfg.config, dict)

    def test_has_installer_attribute(self):
        from llama.llama_config import LlamaConfig
        with tempfile.TemporaryDirectory() as d:
            cfg = LlamaConfig(config_dir=d)
        assert hasattr(cfg, 'installer')

    def test_start_server_is_callable(self):
        from llama.llama_config import LlamaConfig
        with tempfile.TemporaryDirectory() as d:
            cfg = LlamaConfig(config_dir=d)
        assert callable(cfg.start_server)

    def test_is_llm_available_is_callable(self):
        from llama.llama_config import LlamaConfig
        with tempfile.TemporaryDirectory() as d:
            cfg = LlamaConfig(config_dir=d)
        assert callable(cfg.is_llm_available)

    def test_is_llm_server_running_is_callable(self):
        from llama.llama_config import LlamaConfig
        with tempfile.TemporaryDirectory() as d:
            cfg = LlamaConfig(config_dir=d)
        assert callable(cfg.is_llm_server_running)

    def test_diagnose_is_callable(self):
        from llama.llama_config import LlamaConfig
        with tempfile.TemporaryDirectory() as d:
            cfg = LlamaConfig(config_dir=d)
        assert callable(cfg.diagnose)

    def test_model_presets_importable(self):
        """MODEL_PRESETS is used by chatbot_routes, orchestrator, setup wizard."""
        from llama.llama_installer import MODEL_PRESETS
        assert isinstance(MODEL_PRESETS, list)
        assert len(MODEL_PRESETS) >= 3


# ============================================================
# TTSEngine — public API consumed by chatbot_routes, kids_media_routes
# ============================================================

class TestTTSEngineContract:
    """TTSEngine is the voice pipeline — called by /voice and /api/social/tts."""

    def test_engine_capabilities_importable(self):
        """Backward compat: ENGINE_CAPABILITIES alias must still work."""
        from tts.tts_engine import ENGINE_CAPABILITIES
        assert isinstance(ENGINE_CAPABILITIES, dict)

    def test_lang_engine_preference_importable(self):
        from tts.tts_engine import LANG_ENGINE_PREFERENCE
        assert isinstance(LANG_ENGINE_PREFERENCE, dict)
        assert 'en' in LANG_ENGINE_PREFERENCE

    def test_backend_constants_importable(self):
        from tts.tts_engine import (
            BACKEND_CHATTERBOX_TURBO,
            BACKEND_F5,
            BACKEND_PIPER,
        )
        assert all(isinstance(b, str) for b in [
            BACKEND_F5, BACKEND_CHATTERBOX_TURBO, BACKEND_PIPER])

    def test_get_tts_status_importable(self):
        from tts.tts_engine import get_tts_status
        result = get_tts_status()
        assert isinstance(result, dict)

    def test_catalog_to_backend_mapping_importable(self):
        """_CATALOG_TO_BACKEND must exist — used at all catalog→backend boundaries."""
        from tts.tts_engine import _CATALOG_TO_BACKEND
        assert isinstance(_CATALOG_TO_BACKEND, dict)
        assert len(_CATALOG_TO_BACKEND) >= 5


# ============================================================
# ModelCatalog — singleton consumed by orchestrator, catalog.py
# ============================================================

class TestModelCatalogContract:
    """ModelCatalog singleton must maintain its interface."""

    def test_get_catalog_returns_same_instance(self):
        from models.catalog import get_catalog
        c1 = get_catalog()
        c2 = get_catalog()
        assert c1 is c2

    def test_catalog_has_list_by_type(self):
        from models.catalog import get_catalog
        cat = get_catalog()
        assert callable(cat.list_by_type)

    def test_catalog_has_get(self):
        from models.catalog import get_catalog
        cat = get_catalog()
        assert callable(cat.get)

    def test_catalog_has_register(self):
        from models.catalog import get_catalog
        cat = get_catalog()
        assert callable(cat.register)

    def test_model_type_enum_importable(self):
        from models.catalog import ModelType
        assert hasattr(ModelType, 'LLM')
        assert hasattr(ModelType, 'TTS')
        assert hasattr(ModelType, 'STT')

    def test_model_entry_importable(self):
        from models.catalog import ModelEntry
        assert ModelEntry is not None


# ============================================================
# Adapter — chat() return shape consumed by chatbot_routes
# ============================================================

class TestAdapterChatContract:
    """chat() return dict shape is parsed by chatbot_routes — fields must be stable."""

    def test_chat_returns_dict(self):
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'hi', 'source': 'mock'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='hi', user_id='test')
        assert isinstance(result, dict)

    def test_drain_thinking_traces_returns_list(self):
        from routes.hartos_backend_adapter import drain_thinking_traces
        result = drain_thinking_traces('nonexistent')
        assert isinstance(result, list)


# ============================================================
# Import paths — backward compatibility
# ============================================================

class TestImportPaths:
    """These import paths are used across the codebase — changing them breaks everything."""

    def test_llama_config_import(self):
        from llama.llama_config import LlamaConfig
        assert LlamaConfig is not None

    def test_llama_installer_import(self):
        from llama.llama_installer import MODEL_PRESETS, LlamaInstaller, ModelPreset
        assert all(x is not None for x in [LlamaInstaller, MODEL_PRESETS, ModelPreset])

    def test_chatbot_routes_import(self):
        """chatbot_routes must be importable — it's the main chat handler."""
        import routes.chatbot_routes as cr
        assert hasattr(cr, 'chat_route') or hasattr(cr, '_detect_create_agent_intent')

    def test_adapter_import(self):
        from routes.hartos_backend_adapter import chat, check_backend_health, get_prompts
        assert all(callable(f) for f in [chat, get_prompts, check_backend_health])

    def test_catalog_import(self):
        from models.catalog import ModelCatalog, ModelEntry, ModelType, get_catalog
        assert all(x is not None for x in [get_catalog, ModelCatalog, ModelEntry, ModelType])

    def test_orchestrator_import(self):
        from models.orchestrator import LlamaLoader, STTLoader, TTSLoader, get_orchestrator
        assert all(x is not None for x in [get_orchestrator, LlamaLoader, TTSLoader, STTLoader])
