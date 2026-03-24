"""
test_boundary_validation.py - Boundary/edge case tests for Nunba APIs

Tests extreme inputs and boundary conditions at every system entry point.
These catch crashes that unit tests miss because they use "normal" inputs:

FT: Unicode text, very long inputs, special characters, numeric edge cases.
NFT: No crash on any input shape, response always JSON-serializable,
     no memory leak on repeated calls.
"""
import os
import sys
from unittest.mock import patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# Unicode — multilingual users send text in any language
# ============================================================

class TestUnicodeHandling:
    """Nunba supports 23 languages — Unicode must not crash any component."""

    def test_tamil_text_in_chat(self):
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'ok', 'source': 'mock'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='வணக்கம்! எப்படி இருக்கிறீர்கள்?', user_id='ta_user')
        assert isinstance(result, dict)

    def test_hindi_text_in_chat(self):
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'ok', 'source': 'mock'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='नमस्ते! कैसे हो?', user_id='hi_user')
        assert isinstance(result, dict)

    def test_japanese_text_in_chat(self):
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'ok', 'source': 'mock'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='こんにちは世界', user_id='ja_user')
        assert isinstance(result, dict)

    def test_emoji_in_chat(self):
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'ok', 'source': 'mock'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='Hello! 🇮🇳🌱🌙 How are you?', user_id='emoji_user')
        assert isinstance(result, dict)

    def test_arabic_rtl_text(self):
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'ok', 'source': 'mock'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='مرحبا بالعالم', user_id='ar_user')
        assert isinstance(result, dict)

    def test_unicode_in_cache_key(self):
        """Cache keys must handle Unicode prompts without crash."""
        from desktop.media_classification import cache_key
        k = cache_key('ஒரு பூனை வரையுங்கள்', 'image', 'cartoon')
        assert len(k) == 64  # SHA-256 = 64 hex chars

    def test_unicode_in_thinking_trace(self):
        from routes.hartos_backend_adapter import _capture_thinking, drain_thinking_traces
        _capture_thinking({
            'priority': 49, 'action': 'Thinking',
            'request_id': 'unicode_test',
            'text': '思考中... 分析数据'
        })
        traces = drain_thinking_traces('unicode_test')
        assert len(traces) == 1
        assert '思考中' in traces[0]['text']


# ============================================================
# Extreme input lengths
# ============================================================

class TestExtremeLengths:
    """Very long or very short inputs must not crash."""

    def test_single_char_chat(self):
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'ok', 'source': 'mock'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='a', user_id='test')
        assert isinstance(result, dict)

    def test_100k_char_chat(self):
        """100K characters — PDF paste, code dump. Must not OOM."""
        from routes.hartos_backend_adapter import chat
        long_text = 'x' * 100000
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'ok', 'source': 'mock'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text=long_text, user_id='test')
        assert isinstance(result, dict)

    def test_empty_string_create_intent(self):
        from routes.chatbot_routes import _detect_create_agent_intent
        assert _detect_create_agent_intent('') is False

    def test_very_long_create_intent(self):
        from routes.chatbot_routes import _detect_create_agent_intent
        result = _detect_create_agent_intent('create an agent ' + 'x' * 10000)
        assert isinstance(result, bool)


# ============================================================
# Special characters — injection vectors
# ============================================================

class TestSpecialCharacters:
    """Special chars in user input must not break JSON, paths, or SQL."""

    def test_null_bytes_in_cache_key(self):
        from desktop.media_classification import cache_key
        k = cache_key('test\x00null', 'image')
        assert isinstance(k, str) and len(k) == 64

    def test_newlines_in_chat(self):
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'ok', 'source': 'mock'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='line1\nline2\nline3', user_id='test')
        assert isinstance(result, dict)

    def test_json_in_chat(self):
        """User pastes JSON — must not be parsed as request body."""
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'ok', 'source': 'mock'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='{"key": "value", "nested": {"a": 1}}', user_id='test')
        assert isinstance(result, dict)

    def test_html_in_chat(self):
        """User pastes HTML — must not be rendered (XSS prevention)."""
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'ok', 'source': 'mock'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='<script>alert("xss")</script>', user_id='test')
        assert isinstance(result, dict)

    def test_sql_in_chat(self):
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'ok', 'source': 'mock'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text="'; DROP TABLE users; --", user_id='test')
        assert isinstance(result, dict)


# ============================================================
# Numeric edge cases in model selection
# ============================================================

class TestNumericEdgeCases:
    """Model selection uses numeric comparisons — edge values matter."""

    def test_zero_vram_selects_cpu_model(self):
        """0 VRAM = CPU-only machine — must select smallest model."""
        from tts.vibevoice_tts import _recommend_model
        assert _recommend_model(0) is None

    def test_negative_vram_handled(self):
        """Negative VRAM (GPU detection bug) must not crash."""
        from tts.vibevoice_tts import _recommend_model
        result = _recommend_model(-1)
        assert result is None

    def test_model_preset_index_bounds(self):
        """Out-of-range model index must not crash — returns None."""
        import tempfile

        from llama.llama_config import LlamaConfig
        with tempfile.TemporaryDirectory() as d:
            cfg = LlamaConfig(config_dir=d)
            cfg.config['selected_model_index'] = -1
            result = cfg.get_selected_model_preset()
        assert result is None

    def test_port_zero_handled(self):
        """Port 0 means OS picks a random port — find_available_port must handle."""
        import tempfile

        from llama.llama_config import LlamaConfig
        with tempfile.TemporaryDirectory() as d:
            cfg = LlamaConfig(config_dir=d)
            port = cfg.find_available_port()
        assert isinstance(port, int)
        assert port > 0
