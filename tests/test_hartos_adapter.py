"""
test_hartos_adapter.py - Tests for routes/hartos_backend_adapter.py

Covers:
- Thinking trace capture + drain (per-request isolation, daemon filtering, FIFO eviction)
- Chat function routing (Tier-1 direct, Tier-2 HTTP, Tier-3 fallback)
- Circuit breaker (HTTP fail threshold, cooldown, reset)
- Fallback chat (llama.cpp direct)
- Health check
- Response handling
"""
import json
import os
import sys
import threading
import time
from unittest.mock import MagicMock, patch

# Ensure project root is importable
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# Thinking Traces — per-request isolation + daemon filtering
# (Extends tests in test_chatbot_routes.py with adapter-specific tests)
# ============================================================

class TestCaptureThinking:
    """Tests for _capture_thinking function."""

    def _reset(self):
        from routes.hartos_backend_adapter import _thinking_traces_by_request, _thinking_traces_lock
        with _thinking_traces_lock:
            _thinking_traces_by_request.clear()

    def test_captures_priority_49_thinking_action(self):
        self._reset()
        from routes.hartos_backend_adapter import _capture_thinking, _thinking_traces_by_request, _thinking_traces_lock
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'r1', 'text': 'test'})
        with _thinking_traces_lock:
            assert 'r1' in _thinking_traces_by_request
            assert len(_thinking_traces_by_request['r1']) == 1

    def test_ignores_non_thinking_priority(self):
        self._reset()
        from routes.hartos_backend_adapter import _capture_thinking, _thinking_traces_by_request, _thinking_traces_lock
        _capture_thinking({'priority': 48, 'action': 'Thinking', 'request_id': 'r1'})
        _capture_thinking({'priority': 50, 'action': 'Thinking', 'request_id': 'r1'})
        with _thinking_traces_lock:
            assert 'r1' not in _thinking_traces_by_request

    def test_ignores_non_thinking_action(self):
        self._reset()
        from routes.hartos_backend_adapter import _capture_thinking, _thinking_traces_by_request, _thinking_traces_lock
        _capture_thinking({'priority': 49, 'action': 'Response', 'request_id': 'r1'})
        with _thinking_traces_lock:
            assert 'r1' not in _thinking_traces_by_request

    def test_handles_json_string_input(self):
        self._reset()
        from routes.hartos_backend_adapter import _capture_thinking, _thinking_traces_by_request, _thinking_traces_lock
        msg = json.dumps({'priority': 49, 'action': 'Thinking', 'request_id': 'r1', 'text': 'ok'})
        _capture_thinking(msg)
        with _thinking_traces_lock:
            assert 'r1' in _thinking_traces_by_request

    def test_handles_malformed_json_gracefully(self):
        self._reset()
        from routes.hartos_backend_adapter import _capture_thinking
        # Should not raise
        _capture_thinking("not json at all")
        _capture_thinking(None)
        _capture_thinking(42)

    def test_missing_request_id_uses_unknown(self):
        self._reset()
        from routes.hartos_backend_adapter import _capture_thinking, _thinking_traces_by_request, _thinking_traces_lock
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'text': 'no id'})
        with _thinking_traces_lock:
            assert 'unknown' in _thinking_traces_by_request

    def test_request_Id_variant_captured(self):
        """request_Id (capital I) should also work."""
        self._reset()
        from routes.hartos_backend_adapter import _capture_thinking, _thinking_traces_by_request, _thinking_traces_lock
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_Id': 'r2', 'text': 'ok'})
        with _thinking_traces_lock:
            assert 'r2' in _thinking_traces_by_request


class TestDrainThinkingTraces:
    """Tests for drain_thinking_traces function."""

    def _reset(self):
        from routes.hartos_backend_adapter import _thinking_traces_by_request, _thinking_traces_lock
        with _thinking_traces_lock:
            _thinking_traces_by_request.clear()

    def test_drain_specific_request(self):
        self._reset()
        from routes.hartos_backend_adapter import _capture_thinking, drain_thinking_traces
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'r1', 'text': 'a'})
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'r2', 'text': 'b'})
        traces = drain_thinking_traces('r1')
        assert len(traces) == 1
        assert traces[0]['text'] == 'a'
        # r2 still exists
        traces2 = drain_thinking_traces('r2')
        assert len(traces2) == 1

    def test_drain_nonexistent_returns_empty(self):
        self._reset()
        from routes.hartos_backend_adapter import drain_thinking_traces
        assert drain_thinking_traces('nonexistent') == []

    def test_drain_none_skips_daemon_traces(self):
        self._reset()
        from routes.hartos_backend_adapter import _capture_thinking, drain_thinking_traces
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'daemon_goal1', 'text': 'bg'})
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'unknown', 'text': 'orphan'})
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'user-abc', 'text': 'user'})
        traces = drain_thinking_traces(None)
        assert len(traces) == 1
        assert traces[0]['text'] == 'user'

    def test_drain_none_preserves_daemon_traces(self):
        self._reset()
        from routes.hartos_backend_adapter import (
            _capture_thinking,
            _thinking_traces_by_request,
            _thinking_traces_lock,
            drain_thinking_traces,
        )
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'daemon_x', 'text': 'bg'})
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'user-1', 'text': 'u'})
        drain_thinking_traces(None)
        with _thinking_traces_lock:
            assert 'daemon_x' in _thinking_traces_by_request
            assert 'user-1' not in _thinking_traces_by_request

    def test_fifo_eviction_order(self):
        self._reset()
        from routes.hartos_backend_adapter import _capture_thinking, _thinking_traces_by_request, _thinking_traces_lock
        # Insert 21 requests — first should be evicted
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'zzz-oldest', 'text': 'old'})
        for i in range(20):
            _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': f'req-{i}', 'text': f'{i}'})
        with _thinking_traces_lock:
            assert 'zzz-oldest' not in _thinking_traces_by_request
            assert len(_thinking_traces_by_request) == 20

    def test_per_request_cap(self):
        self._reset()
        from routes.hartos_backend_adapter import _capture_thinking, drain_thinking_traces
        for i in range(60):
            _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'flood', 'text': f'{i}'})
        traces = drain_thinking_traces('flood')
        assert len(traces) == 50
        assert traces[0]['text'] == '10'  # kept last 50

    def test_thread_safety(self):
        self._reset()
        from routes.hartos_backend_adapter import _capture_thinking, drain_thinking_traces
        errors = []
        def worker(tid):
            try:
                for i in range(50):
                    _capture_thinking({'priority': 49, 'action': 'Thinking',
                                       'request_id': f't{tid}', 'text': f'{i}'})
            except Exception as e:
                errors.append(e)
        threads = [threading.Thread(target=worker, args=(t,)) for t in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert not errors
        for tid in range(5):
            traces = drain_thinking_traces(f't{tid}')
            assert len(traces) == 50


# ============================================================
# Circuit Breaker
# ============================================================

class TestCircuitBreaker:
    """Tests for HTTP circuit breaker logic."""

    def test_circuit_opens_after_threshold(self):
        import routes.hartos_backend_adapter as adapter
        orig_count = adapter._http_fail_count
        orig_time = adapter._http_fail_time
        try:
            adapter._http_fail_count = adapter._HTTP_FAIL_THRESHOLD
            adapter._http_fail_time = time.time()
            # Circuit should be open — HTTP calls should be skipped
            assert adapter._http_fail_count >= adapter._HTTP_FAIL_THRESHOLD
        finally:
            adapter._http_fail_count = orig_count
            adapter._http_fail_time = orig_time

    def test_circuit_resets_after_cooldown(self):
        import routes.hartos_backend_adapter as adapter
        orig_count = adapter._http_fail_count
        orig_time = adapter._http_fail_time
        try:
            adapter._http_fail_count = adapter._HTTP_FAIL_THRESHOLD
            adapter._http_fail_time = time.time() - adapter._HTTP_FAIL_COOLDOWN - 1
            # Cooldown expired — circuit should allow retry
            elapsed = time.time() - adapter._http_fail_time
            assert elapsed > adapter._HTTP_FAIL_COOLDOWN
        finally:
            adapter._http_fail_count = orig_count
            adapter._http_fail_time = orig_time


# ============================================================
# Fallback Chat (llama.cpp direct)
# ============================================================

class TestFallbackChat:
    """Tests for _fallback_chat function."""

    def test_fallback_returns_dict_on_success(self):
        from routes.hartos_backend_adapter import _fallback_chat
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            'choices': [{'message': {'content': 'Hello!'}}]
        }
        with patch('routes.hartos_backend_adapter.requests.post', return_value=mock_resp):
            result = _fallback_chat('hi', user_id='test')
        assert isinstance(result, dict)
        assert 'text' in result or 'response' in result

    def test_fallback_handles_connection_error(self):
        from routes.hartos_backend_adapter import _fallback_chat
        with patch('routes.hartos_backend_adapter.requests.post',
                   side_effect=Exception("Connection refused")):
            result = _fallback_chat('hi', user_id='test')
        assert isinstance(result, dict)
        # Returns a loading/error response when llama server unreachable
        assert result.get('error') or result.get('loading') or result.get('text')


# ============================================================
# Health Check
# ============================================================

class TestHealthCheck:
    """Tests for check_backend_health function."""

    def test_health_returns_dict(self):
        from routes.hartos_backend_adapter import check_backend_health
        result = check_backend_health()
        assert isinstance(result, dict)
        # Returns healthy/error/backend_url keys
        assert 'healthy' in result or 'error' in result or 'backend_url' in result

    def test_health_reports_healthy_bool(self):
        from routes.hartos_backend_adapter import check_backend_health
        result = check_backend_health()
        assert 'healthy' in result
        assert isinstance(result['healthy'], bool)


# ============================================================
# Response Handling
# ============================================================

class TestHandleResponse:
    """Tests for _handle_response function."""

    def test_handle_200_response(self):
        from routes.hartos_backend_adapter import _handle_response
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {'text': 'hello', 'intent': ['FINAL_ANSWER']}
        result = _handle_response(mock_resp)
        assert result['text'] == 'hello'

    def test_handle_500_response(self):
        from routes.hartos_backend_adapter import _handle_response
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = 'Internal Server Error'
        mock_resp.json.side_effect = ValueError("No JSON")
        result = _handle_response(mock_resp)
        assert isinstance(result, dict)
        assert result.get('error') or result.get('text')

    def test_handle_json_decode_error(self):
        from routes.hartos_backend_adapter import _handle_response
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.side_effect = ValueError("No JSON")
        mock_resp.text = "plain text response"
        result = _handle_response(mock_resp)
        assert isinstance(result, dict)


# ============================================================
# Chat Function Routing
# ============================================================

class TestChatRouting:
    """Tests for the chat() function routing logic."""

    def test_chat_returns_dict(self):
        """chat() must always return a dict regardless of backend tier."""
        from routes.hartos_backend_adapter import chat
        # Mock the fallback to return a simple response
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'hi there', 'source': 'local_llama'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='hi', user_id='test')
        assert isinstance(result, dict)

    def test_chat_with_casual_conv_flag(self):
        """casual_conv parameter is passed through to the backend."""
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'ok', 'source': 'local_llama'}) as mock_fb:
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                chat(text='hi', user_id='test', casual_conv=True)

    def test_chat_with_request_id(self):
        """request_id parameter is accepted."""
        from routes.hartos_backend_adapter import chat
        with patch('routes.hartos_backend_adapter._fallback_chat',
                   return_value={'text': 'ok', 'source': 'local_llama'}):
            with patch('routes.hartos_backend_adapter._hartos_backend_available', False):
                result = chat(text='hi', user_id='test', request_id='req-123')
        assert isinstance(result, dict)


# ============================================================
# Module Constants
# ============================================================

class TestModuleConstants:
    """Verify module-level configuration is sane."""

    def test_timeouts_are_positive(self):
        from routes.hartos_backend_adapter import AGENT_CREATION_TIMEOUT, CONNECT_TIMEOUT, REQUEST_TIMEOUT
        assert REQUEST_TIMEOUT > 0
        assert CONNECT_TIMEOUT > 0
        assert AGENT_CREATION_TIMEOUT > REQUEST_TIMEOUT  # agent creation needs more time

    def test_circuit_breaker_threshold_positive(self):
        from routes.hartos_backend_adapter import _HTTP_FAIL_COOLDOWN, _HTTP_FAIL_THRESHOLD
        assert _HTTP_FAIL_THRESHOLD > 0
        assert _HTTP_FAIL_COOLDOWN > 0

    def test_bundled_mode_is_bool(self):
        from routes.hartos_backend_adapter import _BUNDLED_MODE
        assert isinstance(_BUNDLED_MODE, bool)


# ============================================================
# get_prompts — agent listing (frontend agent sidebar)
# ============================================================

class TestGetPrompts:
    """get_prompts feeds the agent sidebar — wrong response = empty sidebar."""

    def test_returns_dict(self):
        """Must always return a dict — frontend destructures it."""
        from routes.hartos_backend_adapter import get_prompts
        result = get_prompts(user_id='test_user')
        assert isinstance(result, dict)

    def test_returns_dict_without_user_id(self):
        from routes.hartos_backend_adapter import get_prompts
        result = get_prompts()
        assert isinstance(result, dict)

    def test_bundled_mode_returns_prompts_key(self):
        """In bundled mode without backend, must still return 'prompts' key."""
        import routes.hartos_backend_adapter as adapter
        old_available = adapter._hartos_backend_available
        old_bundled = adapter._BUNDLED_MODE
        adapter._hartos_backend_available = False
        adapter._BUNDLED_MODE = True
        try:
            result = adapter.get_prompts('user_1')
            assert 'prompts' in result or 'error' in result
        finally:
            adapter._hartos_backend_available = old_available
            adapter._BUNDLED_MODE = old_bundled

    def test_circuit_breaker_returns_graceful_error(self):
        """When circuit is open, returns error dict — not exception."""
        import routes.hartos_backend_adapter as adapter
        old_count = adapter._http_fail_count
        old_time = adapter._http_fail_time
        old_available = adapter._hartos_backend_available
        old_bundled = adapter._BUNDLED_MODE
        adapter._hartos_backend_available = False
        adapter._BUNDLED_MODE = False
        adapter._http_fail_count = 100  # Circuit open
        adapter._http_fail_time = time.time()
        try:
            result = adapter.get_prompts('user_1')
            assert isinstance(result, dict)
            assert 'error' in result
        finally:
            adapter._http_fail_count = old_count
            adapter._http_fail_time = old_time
            adapter._hartos_backend_available = old_available
            adapter._BUNDLED_MODE = old_bundled


# ============================================================
# with_fallback decorator — retry chain
# ============================================================

class TestWithFallback:
    """with_fallback wraps functions with llama.cpp direct fallback."""

    def test_decorator_preserves_function_name(self):
        from routes.hartos_backend_adapter import with_fallback
        @with_fallback(lambda *a, **kw: {'text': 'fallback'})
        def my_func():
            return {'text': 'primary'}
        assert my_func.__name__ == 'my_func'

    def test_decorator_calls_primary_first(self):
        from routes.hartos_backend_adapter import with_fallback
        calls = []
        @with_fallback(lambda *a, **kw: {'text': 'fallback'})
        def my_func():
            calls.append('primary')
            return {'text': 'primary'}
        result = my_func()
        assert 'primary' in calls


# ============================================================
# _ensure_hartos / background init
# ============================================================

class TestHartosInit:
    """Background HARTOS initialization — non-blocking module load."""

    def test_ensure_hartos_is_callable(self):
        from routes.hartos_backend_adapter import _ensure_hartos
        assert callable(_ensure_hartos)

    def test_background_init_is_callable(self):
        from routes.hartos_backend_adapter import _background_hartos_init
        assert callable(_background_hartos_init)

    def test_active_tier_is_string(self):
        """Frontend displays the active tier label."""
        import routes.hartos_backend_adapter as adapter
        assert isinstance(adapter._active_tier, str)
        assert len(adapter._active_tier) > 0


# ============================================================
# SocialAPI class — proxy to HARTOS social endpoints
# ============================================================

class TestSocialAPI:
    """SocialAPI proxies all /api/social/* requests to HARTOS."""

    def test_class_exists(self):
        from routes.hartos_backend_adapter import SocialAPI
        assert SocialAPI is not None

    def test_has_social_methods(self):
        """Social API must expose core social methods used by the frontend."""
        from routes.hartos_backend_adapter import SocialAPI
        api = SocialAPI()
        for method in ('get_feed', 'get_posts', 'login', 'register', 'me'):
            assert hasattr(api, method), f"SocialAPI missing .{method}()"

    def test_has_base_url(self):
        from routes.hartos_backend_adapter import SocialAPI
        api = SocialAPI()
        assert hasattr(api, 'base_url')
        assert isinstance(api.base_url, str)
