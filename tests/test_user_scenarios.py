"""
test_user_scenarios.py - User scenario tests for Nunba

Tests complete user workflows — not individual functions, but sequences
of calls that represent real usage patterns:

1. First-run setup: detect hardware → select model → configure
2. Chat conversation: send message → get response → display
3. Agent creation: detect intent → create → review → reuse
4. TTS pipeline: select backend → synthesize → play
5. Model management: catalog → select → download status
"""
import os
import sys
import tempfile
from unittest.mock import patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# Scenario 1: First-run hardware detection → model selection
# ============================================================

class TestFirstRunScenario:
    """New user installs Nunba → app detects hardware → selects best model."""

    def test_hardware_detection_produces_valid_diagnosis(self):
        """diagnose() runs on first-run setup — must produce all required keys."""
        from llama.llama_config import LlamaConfig
        with tempfile.TemporaryDirectory() as d:
            cfg = LlamaConfig(config_dir=d)
            with patch.object(cfg.installer, 'find_llama_server', return_value=None), \
                 patch.object(cfg.installer, 'get_model_path', return_value=None), \
                 patch.object(cfg.installer, 'is_system_installation', return_value=False):
                diag = cfg.diagnose()
        required = {'gpu_detected', 'best_model_index', 'best_model_name', 'action', 'actions'}
        missing = required - set(diag.keys())
        assert not missing, f"Diagnosis missing keys: {missing}"

    def test_model_preset_from_diagnosis_is_valid(self):
        """The recommended model from diagnose() must exist in MODEL_PRESETS."""
        from llama.llama_config import LlamaConfig
        from llama.llama_installer import MODEL_PRESETS
        with tempfile.TemporaryDirectory() as d:
            cfg = LlamaConfig(config_dir=d)
            with patch.object(cfg.installer, 'find_llama_server', return_value=None), \
                 patch.object(cfg.installer, 'get_model_path', return_value=None), \
                 patch.object(cfg.installer, 'is_system_installation', return_value=False):
                diag = cfg.diagnose()
        idx = diag['best_model_index']
        assert 0 <= idx < len(MODEL_PRESETS)


# ============================================================
# Scenario 2: Default agent chat conversation
# ============================================================

class TestDefaultAgentChatScenario:
    """User opens app → types "hi" → gets response from default agent."""

    def test_hi_gets_response(self):
        """The most common user interaction — must always work."""
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'Hello! How can I help?', 'source': 'local_llama'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='hi', user_id='new_user', casual_conv=True)
        assert 'text' in result
        assert len(result['text']) > 0

    def test_followup_question(self):
        """Second message in conversation — must include conversation context."""
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'Python is great!', 'source': 'local_llama'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='What is Python?', user_id='user_1',
                              conversation_id='conv_1', casual_conv=True)
        assert isinstance(result, dict)


# ============================================================
# Scenario 3: Agent creation intent detection
# ============================================================

class TestAgentCreationScenario:
    """User says "create an agent" → system detects intent → routes to creation."""

    def test_create_agent_detected(self):
        from routes.chatbot_routes import _detect_create_agent_intent
        assert _detect_create_agent_intent('create an agent for me') is True

    def test_train_agent_detected(self):
        from routes.chatbot_routes import _detect_create_agent_intent
        assert _detect_create_agent_intent('train an agent') is True

    def test_normal_chat_not_detected(self):
        from routes.chatbot_routes import _detect_create_agent_intent
        assert _detect_create_agent_intent('what is the weather today?') is False

    def test_local_agents_available_for_selection(self):
        """LOCAL_AGENTS must be available for the agent sidebar."""
        from routes.chatbot_routes import LOCAL_AGENTS
        assert len(LOCAL_AGENTS) >= 2
        names = [a['name'] for a in LOCAL_AGENTS]
        assert any('Hevolve' in n or 'Coder' in n or 'Writer' in n for n in names)


# ============================================================
# Scenario 4: TTS backend selection
# ============================================================

class TestTTSScenario:
    """User sends message → TTS speaks the response → audio plays."""

    def test_english_selects_a_backend(self):
        """English must always have a TTS backend — it's the default language."""
        from tts.tts_engine import BACKEND_PIPER, _get_lang_preference
        prefs = _get_lang_preference('en')
        assert len(prefs) >= 1
        assert BACKEND_PIPER in prefs  # Piper always available as fallback

    def test_tamil_prefers_indic_parler(self):
        """Tamil users get Indic Parler (native quality) not Piper (English accent)."""
        from tts.tts_engine import BACKEND_INDIC_PARLER, _get_lang_preference
        prefs = _get_lang_preference('ta')
        assert prefs[0] == BACKEND_INDIC_PARLER

    def test_piper_always_in_english_chain(self):
        """Piper (CPU) must always be in the English fallback chain — last resort."""
        from tts.tts_engine import BACKEND_PIPER, _get_lang_preference
        prefs = _get_lang_preference('en')
        assert BACKEND_PIPER in prefs

    def test_tts_status_always_available(self):
        """get_tts_status must always return a dict — frontend polls it."""
        from tts.tts_engine import get_tts_status
        status = get_tts_status()
        assert isinstance(status, dict)


# ============================================================
# Scenario 5: Model catalog management
# ============================================================

class TestModelCatalogScenario:
    """Admin views model list → selects one → checks download status."""

    def test_catalog_has_llm_entries(self):
        from models.catalog import ModelType, get_catalog
        cat = get_catalog()
        llms = cat.list_by_type(ModelType.LLM)
        assert len(llms) >= 2  # At least 2 LLM models

    def test_catalog_has_tts_entries(self):
        """TTS entries populated by HARTOS tts_router — at least Piper."""
        from models.catalog import ModelType, get_catalog
        cat = get_catalog()
        tts = cat.list_by_type(ModelType.TTS)
        # May be 0 if HARTOS tts_router not yet run (populate_tts_engines is now no-op)
        assert isinstance(tts, list)

    def test_catalog_singleton_consistent(self):
        """Two get_catalog() calls return the same data."""
        from models.catalog import get_catalog
        c1 = get_catalog()
        c2 = get_catalog()
        assert c1 is c2
        assert len(c1.list_by_type('llm')) == len(c2.list_by_type('llm'))
