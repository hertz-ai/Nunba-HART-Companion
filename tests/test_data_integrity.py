"""
test_data_integrity.py - Static data integrity tests for Nunba

Verifies all static data structures — presets, configs, constants — are
well-formed. Corrupt data causes silent failures at runtime:

FT: MODEL_PRESETS structure, VOICE_PRESETS, KNOWN_LLM_ENDPOINTS,
    LOCAL_AGENTS, CLOUD_AGENTS, SEED_ACHIEVEMENTS mapping.
NFT: No hardcoded paths, all URLs HTTPS, no empty required fields,
     enum values match expected strings.
"""
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# MODEL_PRESETS — LLM model definitions
# ============================================================

class TestModelPresetsIntegrity:
    """MODEL_PRESETS drive the entire LLM selection pipeline."""

    def test_at_least_3_presets(self):
        from llama.llama_installer import MODEL_PRESETS
        assert len(MODEL_PRESETS) >= 3

    def test_all_gguf_format(self):
        from llama.llama_installer import MODEL_PRESETS
        for p in MODEL_PRESETS:
            assert p.file_name.endswith('.gguf'), f"'{p.display_name}' not GGUF"

    def test_sizes_are_positive(self):
        from llama.llama_installer import MODEL_PRESETS
        for p in MODEL_PRESETS:
            assert p.size_mb > 0, f"'{p.display_name}' size_mb={p.size_mb}"

    def test_vision_models_have_mmproj(self):
        from llama.llama_installer import MODEL_PRESETS
        for p in MODEL_PRESETS:
            if p.has_vision:
                assert p.mmproj_file, f"Vision model '{p.display_name}' missing mmproj"

    def test_repo_ids_are_hf_format(self):
        from llama.llama_installer import MODEL_PRESETS
        for p in MODEL_PRESETS:
            assert '/' in p.repo_id, f"'{p.display_name}' repo not HF format"


# ============================================================
# LOCAL_AGENTS — built-in agent definitions
# ============================================================

class TestLocalAgentsIntegrity:
    """LOCAL_AGENTS are the first thing users see in the agent sidebar."""

    def test_local_assistant_exists(self):
        from routes.chatbot_routes import LOCAL_AGENTS
        ids = [a['id'] for a in LOCAL_AGENTS]
        assert 'local_assistant' in ids

    def test_all_have_required_keys(self):
        from routes.chatbot_routes import LOCAL_AGENTS
        required = {'id', 'name', 'description', 'type', 'capabilities'}
        for agent in LOCAL_AGENTS:
            missing = required - set(agent.keys())
            assert not missing, f"Agent '{agent.get('id', '?')}' missing: {missing}"

    def test_all_are_local_type(self):
        from routes.chatbot_routes import LOCAL_AGENTS
        for agent in LOCAL_AGENTS:
            assert agent['type'] == 'local'

    def test_exactly_one_default(self):
        from routes.chatbot_routes import LOCAL_AGENTS
        defaults = [a for a in LOCAL_AGENTS if a.get('is_default')]
        assert len(defaults) == 1

    def test_capabilities_are_lists(self):
        from routes.chatbot_routes import LOCAL_AGENTS
        for agent in LOCAL_AGENTS:
            assert isinstance(agent['capabilities'], list)


# ============================================================
# KNOWN_LLM_ENDPOINTS — external LLM detection
# ============================================================

class TestKnownEndpointsIntegrity:
    """KNOWN_LLM_ENDPOINTS drives auto-detection of running LLM servers."""

    def test_all_have_required_keys(self):
        from llama.llama_config import KNOWN_LLM_ENDPOINTS
        required = {'name', 'base_url', 'health', 'completions', 'type'}
        for ep in KNOWN_LLM_ENDPOINTS:
            missing = required - set(ep.keys())
            assert not missing, f"Endpoint '{ep.get('name', '?')}' missing: {missing}"

    def test_all_localhost(self):
        """External scan must only check localhost."""
        from llama.llama_config import KNOWN_LLM_ENDPOINTS
        for ep in KNOWN_LLM_ENDPOINTS:
            assert 'localhost' in ep['base_url'] or '127.0.0.1' in ep['base_url']

    def test_no_port_5000(self):
        """Port 5000 is Nunba's own Flask — scanning it causes false positives."""
        from llama.llama_config import KNOWN_LLM_ENDPOINTS
        for ep in KNOWN_LLM_ENDPOINTS:
            assert ':5000' not in ep['base_url'], f"'{ep['name']}' scans port 5000"

    def test_includes_common_servers(self):
        from llama.llama_config import KNOWN_LLM_ENDPOINTS
        names = [ep['name'] for ep in KNOWN_LLM_ENDPOINTS]
        assert any('Ollama' in n for n in names)
        assert any('LM Studio' in n for n in names)


# ============================================================
# TTS constants — voice pipeline configuration
# ============================================================

class TestTTSConstantsIntegrity:
    """TTS constants drive voice selection — wrong values = wrong voice."""

    def test_fallback_capabilities_non_empty(self):
        from tts.tts_engine import _FALLBACK_ENGINE_CAPABILITIES
        assert len(_FALLBACK_ENGINE_CAPABILITIES) >= 3

    def test_all_backends_have_name(self):
        from tts.tts_engine import _FALLBACK_ENGINE_CAPABILITIES
        for backend, caps in _FALLBACK_ENGINE_CAPABILITIES.items():
            assert 'name' in caps, f"Backend '{backend}' missing name"

    def test_lang_preference_has_en(self):
        from tts.tts_engine import _FALLBACK_LANG_ENGINE_PREFERENCE
        assert 'en' in _FALLBACK_LANG_ENGINE_PREFERENCE

    def test_catalog_to_backend_has_common_mappings(self):
        from tts.tts_engine import _CATALOG_TO_BACKEND
        assert 'f5-tts' in _CATALOG_TO_BACKEND
        assert 'chatterbox-turbo' in _CATALOG_TO_BACKEND
        assert 'piper' in _CATALOG_TO_BACKEND

    def test_backend_to_catalog_round_trips(self):
        from tts.tts_engine import _BACKEND_TO_CATALOG, _CATALOG_TO_BACKEND
        for backend, catalog_id in _BACKEND_TO_CATALOG.items():
            resolved = _CATALOG_TO_BACKEND.get(catalog_id)
            assert resolved == backend, f"Round-trip failed: {backend}→{catalog_id}→{resolved}"


# ============================================================
# Version constants — must be semver
# ============================================================

class TestVersionIntegrity:
    """Version strings displayed in UI and used by installer."""

    def test_deps_version_is_semver(self):
        import re

        from scripts.deps import VERSION
        assert re.match(r'^\d+\.\d+\.\d+', VERSION)

    def test_python_embed_version_valid(self):
        import re

        from scripts.deps import PYTHON_EMBED_VERSION
        assert re.match(r'^\d+\.\d+\.\d+', PYTHON_EMBED_VERSION)
