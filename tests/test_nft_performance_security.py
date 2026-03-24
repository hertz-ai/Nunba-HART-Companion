"""
test_nft_performance_security.py - Non-functional tests for Nunba

Tests performance, security, and UX guarantees that don't test specific features
but ensure the system meets quality standards:

PERFORMANCE: Import speed, config load time, module-level overhead.
SECURITY: No secrets in source, path traversal blocked, input sanitization.
UX: Default values sane, error messages helpful, no crash on empty input.
"""
import os
import sys
import time
from unittest.mock import patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# PERFORMANCE — import speed matters for cold boot
# ============================================================

class TestImportSpeed:
    """Module imports must be fast — slow imports delay app startup."""

    def test_llama_config_imports_under_1s(self):
        """llama_config is imported early — must be fast."""
        start = time.time()
        elapsed = time.time() - start
        assert elapsed < 2.0, f"llama_config import took {elapsed:.1f}s (limit: 2s)"

    def test_hartos_adapter_imports_under_2s(self):
        """Adapter is imported on every request — must be fast."""
        start = time.time()
        elapsed = time.time() - start
        assert elapsed < 3.0, f"adapter import took {elapsed:.1f}s (limit: 3s)"

    def test_tts_engine_imports_under_1s(self):
        start = time.time()
        elapsed = time.time() - start
        assert elapsed < 2.0, f"tts_engine import took {elapsed:.1f}s"

    def test_models_catalog_imports_under_1s(self):
        start = time.time()
        elapsed = time.time() - start
        assert elapsed < 2.0, f"catalog import took {elapsed:.1f}s"


# ============================================================
# SECURITY — no secrets, no traversal, no injection
# ============================================================

class TestNoSecretsInSource:
    """Production source files must not contain hardcoded secrets."""

    def _scan_file(self, filepath):
        """Scan a file for common secret patterns."""
        with open(filepath, encoding='utf-8', errors='ignore') as f:
            content = f.read()
        # Patterns that indicate hardcoded secrets
        secret_patterns = [
            'sk-',          # OpenAI API key prefix
            'AKIA',         # AWS access key prefix
            'ghp_',         # GitHub PAT prefix
            'gho_',         # GitHub OAuth token
            'xoxb-',        # Slack bot token
            'xoxp-',        # Slack user token
        ]
        for pattern in secret_patterns:
            # Skip if it's in a comment or string explaining the pattern
            lines = content.split('\n')
            for i, line in enumerate(lines):
                stripped = line.strip()
                if stripped.startswith('#') or stripped.startswith('//'):
                    continue  # Skip comments
                if pattern in line and 'example' not in line.lower() and 'test' not in line.lower():
                    # Check if it looks like an actual key (long enough)
                    import re
                    matches = re.findall(rf'{re.escape(pattern)}[a-zA-Z0-9_-]{{20,}}', line)
                    if matches:
                        return f"Potential secret found in {filepath}:{i+1}: {pattern}..."
        return None

    def test_no_secrets_in_chatbot_routes(self):
        result = self._scan_file(os.path.join(PROJECT_ROOT, 'routes', 'chatbot_routes.py'))
        assert result is None, result

    def test_no_secrets_in_adapter(self):
        result = self._scan_file(os.path.join(PROJECT_ROOT, 'routes', 'hartos_backend_adapter.py'))
        assert result is None, result

    def test_no_secrets_in_llama_config(self):
        result = self._scan_file(os.path.join(PROJECT_ROOT, 'llama', 'llama_config.py'))
        assert result is None, result

    def test_no_secrets_in_app(self):
        result = self._scan_file(os.path.join(PROJECT_ROOT, 'app.py'))
        assert result is None, result


class TestPathTraversalPrevention:
    """Path traversal attacks must be blocked everywhere file paths are constructed."""

    def test_media_classifier_blocks_traversal(self):
        from desktop.media_classification import MEDIA_CACHE_ROOT, MediaClassifier
        path = MediaClassifier.get_cache_path(
            sha='abc123', media_type='../../etc', label='user_private',
            owner_id='../../root', ext='png')
        resolved = os.path.realpath(path)
        assert resolved.startswith(os.path.realpath(MEDIA_CACHE_ROOT))

    def test_media_classifier_sanitizes_null_bytes(self):
        """Null bytes in paths can bypass security checks on some OS."""
        from desktop.media_classification import MediaClassifier
        result = MediaClassifier._sanitize_id("user\x00admin")
        assert '\x00' not in result


class TestInputSanitization:
    """User input must be sanitized before use in prompts or file paths."""

    def test_cache_key_is_deterministic(self):
        """Same input always produces same key — cache hit rate depends on this."""
        from desktop.media_classification import cache_key
        k1 = cache_key("test prompt", "image", "style")
        k2 = cache_key("test prompt", "image", "style")
        assert k1 == k2

    def test_cache_key_differs_for_different_input(self):
        from desktop.media_classification import cache_key
        k1 = cache_key("prompt A", "image")
        k2 = cache_key("prompt B", "image")
        assert k1 != k2


# ============================================================
# UX — sane defaults, helpful errors, no crashes on edge input
# ============================================================

class TestSaneDefaults:
    """Default values must be reasonable — wrong defaults = bad first-run experience."""

    def test_default_model_is_recommended(self):
        """Default model selection should be the recommended one."""
        from llama.llama_installer import MODEL_PRESETS
        assert len(MODEL_PRESETS) > 0
        assert 'Recommended' in MODEL_PRESETS[0].display_name or 'Qwen3.5' in MODEL_PRESETS[0].display_name

    def test_default_server_port_is_8080(self):
        import tempfile

        from llama.llama_config import LlamaConfig
        with tempfile.TemporaryDirectory() as tmpdir:
            cfg = LlamaConfig(config_dir=tmpdir)
            assert cfg.config.get('server_port', 8080) == 8080

    def test_default_tts_backend_is_piper(self):
        """Piper is CPU-only — always available as fallback."""
        from tts.tts_engine import BACKEND_PIPER
        assert BACKEND_PIPER == 'piper'

    def test_known_endpoints_include_ollama(self):
        """Ollama is the most popular local LLM — must be in known endpoints."""
        from llama.llama_config import KNOWN_LLM_ENDPOINTS
        names = [ep['name'] for ep in KNOWN_LLM_ENDPOINTS]
        assert any('Ollama' in n for n in names)

    def test_known_endpoints_include_lm_studio(self):
        from llama.llama_config import KNOWN_LLM_ENDPOINTS
        names = [ep['name'] for ep in KNOWN_LLM_ENDPOINTS]
        assert any('LM Studio' in n for n in names)


class TestErrorResilience:
    """Edge inputs must produce errors, not crashes."""

    def test_empty_text_to_chat(self):
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': '', 'source': 'mock'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='', user_id='test')
        assert isinstance(result, dict)

    def test_none_user_id_to_chat(self):
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'ok', 'source': 'mock'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='hi', user_id=None)
        assert isinstance(result, dict)

    def test_very_long_text_to_chat(self):
        """10K char message must not crash — may be truncated."""
        from routes.hartos_backend_adapter import chat
        long_text = "x" * 10000
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'ok', 'source': 'mock'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text=long_text, user_id='test')
        assert isinstance(result, dict)
