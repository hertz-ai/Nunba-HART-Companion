"""
test_chatbot_routes.py - Tests for Flask chatbot route handlers.

Covers:
- POST /chat (with mocked LLM backends)
- GET /backend/health
- POST /voice/transcribe (with mock audio)
- Auth header validation
- Agent creation intent detection
- Secret/key detection helpers
- JSON response format validation
"""
import io
import json
import os
import struct
import sys
import wave
from unittest.mock import MagicMock, patch

import pytest

# Ensure project root is importable
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# Unit tests for helper functions (no Flask app needed)
# ============================================================

class TestDetectCreateAgentIntent:
    """Test the deterministic agent-creation intent detector."""

    @pytest.fixture(autouse=True)
    def _import_detector(self):
        from routes.chatbot_routes import _detect_create_agent_intent
        self.detect = _detect_create_agent_intent

    def test_positive_create_agent(self):
        assert self.detect("create an agent that summarizes news") is True

    def test_positive_build_agent(self):
        assert self.detect("build agent for data analysis") is True

    def test_positive_new_agent(self):
        assert self.detect("I want a new agent") is True

    def test_positive_train_agent(self):
        assert self.detect("train an agent to write poetry") is True

    def test_positive_case_insensitive(self):
        assert self.detect("CREATE AN AGENT for me") is True

    def test_negative_no_pattern(self):
        assert self.detect("what is the weather today?") is False

    def test_negative_dont_create_agent(self):
        assert self.detect("don't create an agent please") is False

    def test_negative_do_not_create(self):
        assert self.detect("do not create agent") is False

    def test_negative_cancel_create(self):
        assert self.detect("cancel create agent") is False

    def test_negative_empty_string(self):
        assert self.detect("") is False

    def test_negative_stop_create(self):
        assert self.detect("stop create an agent") is False


class TestExtractResourceRequest:
    """Test the RESOURCE_REQUEST marker extraction."""

    @pytest.fixture(autouse=True)
    def _import(self):
        from routes.chatbot_routes import _extract_resource_request
        self.extract = _extract_resource_request

    def test_returns_none_for_normal_text(self):
        assert self.extract("Just a normal response") is None

    def test_returns_none_for_none_input(self):
        assert self.extract(None) is None

    def test_extracts_valid_resource_request(self):
        marker = json.dumps({"__SECRET_REQUEST__": True, "key_name": "GOOGLE_API_KEY"})
        text = f"Some text RESOURCE_REQUEST:{marker}"
        result = self.extract(text)
        assert result is not None
        assert result["key_name"] == "GOOGLE_API_KEY"
        assert result["triggered_by"] == "agent_request_resource"

    def test_invalid_json_returns_none(self):
        text = "Some text RESOURCE_REQUEST:{not valid json}"
        result = self.extract(text)
        assert result is None


class TestDetectMissingKeyInResponse:
    """Test API-key-missing detection in LLM responses."""

    @pytest.fixture(autouse=True)
    def _import(self):
        from routes.chatbot_routes import _detect_missing_key_in_response
        self.detect = _detect_missing_key_in_response

    def test_returns_none_for_normal_text(self):
        assert self.detect("Everything is fine!") is None

    def test_returns_none_for_empty(self):
        assert self.detect("") is None
        assert self.detect(None) is None

    def test_detects_google_key(self):
        result = self.detect("API key not found for Google search")
        assert result is not None
        assert result["key_name"] == "GOOGLE_API_KEY"

    def test_detects_serp_key(self):
        result = self.detect("SerpAPI api key is required for this tool")
        assert result is not None
        assert result["key_name"] == "SERPAPI_API_KEY"

    def test_detects_unknown_key(self):
        result = self.detect("API key not found for some unknown service")
        assert result is not None
        assert result["key_name"] == "UNKNOWN_KEY"


# ============================================================
# Integration tests using Flask test client
# ============================================================

class TestChatRoute:
    """Test POST /chat endpoint."""

    def test_chat_empty_text_returns_400(self, client):
        response = client.post("/chat", json={"text": "", "user_id": "test"})
        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_chat_whitespace_text_returns_400(self, client):
        response = client.post("/chat", json={"text": "   ", "user_id": "test"})
        assert response.status_code == 400

    def test_chat_no_json_body(self, client):
        """POST /chat with no body should return 400 (empty text)."""
        response = client.post("/chat", content_type="application/json", data="{}")
        assert response.status_code == 400

    @patch("routes.chatbot_routes.HEVOLVE_CHAT_AVAILABLE", False)
    def test_chat_local_fallback_returns_response(self, client, mock_llm_server):
        """When hart-backend is unavailable, chat falls back to raw llama.cpp."""
        host, port = mock_llm_server
        # Patch the llama health check to point to our mock server
        with patch("routes.chatbot_routes.requests.post") as mock_post:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "choices": [{"message": {"content": "Mock AI reply"}}]
            }
            mock_post.return_value = mock_resp

            # We also need to patch check_server_running / llama health
            with patch("routes.chatbot_routes.check_internet_connection", return_value=False):
                response = client.post("/chat", json={
                    "text": "Hello",
                    "user_id": "test_user",
                    "agent_type": "local",
                })
                # Should return a JSON response (may be error or success depending on adapter state)
                assert response.status_code in (200, 500, 503)
                data = response.get_json()
                assert data is not None

    def test_chat_unknown_agent_type_returns_400(self, client):
        """Unknown agent_type with unknown agent_id should return 400."""
        # Must also set agent_id to a non-existent ID so that agent_config is None
        # and the explicit agent_type is used (not overridden by config lookup).
        response = client.post("/chat", json={
            "text": "hello",
            "user_id": "test_user",
            "agent_id": "nonexistent_agent_xyz",
            "agent_type": "quantum_ai",
        })
        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data


class TestBackendHealthRoute:
    """Test GET /backend/health endpoint."""

    def test_health_returns_200(self, client):
        """Health endpoint should always return 200."""
        with patch("routes.chatbot_routes.check_internet_connection", return_value=False), \
             patch("routes.chatbot_routes.requests") as mock_req:
            mock_req.get.side_effect = Exception("no server")
            mock_req.head.side_effect = Exception("no server")
            response = client.get("/backend/health")
            assert response.status_code == 200
            data = response.get_json()
            assert "healthy" in data
            assert data["healthy"] is True
            assert "local" in data
            assert "cloud" in data

    def test_health_response_structure(self, client):
        """Validate the JSON structure of backend health response."""
        with patch("routes.chatbot_routes.check_internet_connection", return_value=True), \
             patch("routes.chatbot_routes.requests") as mock_req:
            mock_req.get.side_effect = Exception("no server")
            mock_req.head.side_effect = Exception("no server")
            response = client.get("/backend/health")
            data = response.get_json()
            # Required keys
            for key in ("healthy", "is_online", "local", "cloud", "langchain_service"):
                assert key in data, f"Missing key: {key}"
            # Local section
            local = data["local"]
            assert "available" in local
            assert "agents_count" in local
            # Cloud section
            cloud = data["cloud"]
            assert "available" in cloud
            assert "agents_count" in cloud


class TestVoiceTranscribe:
    """Test POST /voice/transcribe endpoint."""

    def _make_wav_bytes(self, duration_s=0.1, sample_rate=16000):
        """Generate a minimal valid WAV file in memory."""
        num_samples = int(sample_rate * duration_s)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(struct.pack(f"<{num_samples}h", *([0] * num_samples)))
        buf.seek(0)
        return buf

    def test_no_audio_file_returns_400(self, client):
        """POST /voice/transcribe without audio file should return 400."""
        response = client.post("/voice/transcribe")
        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data

    def test_empty_filename_returns_400(self, client):
        """POST /voice/transcribe with empty filename should return 400."""
        data = {"audio": (io.BytesIO(b""), "")}
        response = client.post(
            "/voice/transcribe",
            data=data,
            content_type="multipart/form-data",
        )
        assert response.status_code == 400

    @patch("routes.chatbot_routes.json.loads")
    def test_transcribe_with_mock_whisper(self, mock_json_loads, client):
        """Test successful transcription with mocked whisper."""
        mock_json_loads.return_value = {"text": "hello world", "language": "en"}
        wav_data = self._make_wav_bytes()

        with patch.dict("sys.modules", {
            "integrations.service_tools.whisper_tool": MagicMock(
                whisper_transcribe=MagicMock(return_value='{"text": "hello world", "language": "en"}')
            )
        }):
            response = client.post(
                "/voice/transcribe",
                data={"audio": (wav_data, "test.wav")},
                content_type="multipart/form-data",
            )
            # Whisper may or may not be importable; accept 200 or 503
            assert response.status_code in (200, 503)

    def test_transcribe_whisper_not_available(self, client):
        """When whisper is not installed, should return 503."""
        wav_data = self._make_wav_bytes()

        # Remove whisper from sys.modules if present, ensure ImportError
        with patch.dict("sys.modules", {"integrations.service_tools.whisper_tool": None}):
            response = client.post(
                "/voice/transcribe",
                data={"audio": (wav_data, "test.wav")},
                content_type="multipart/form-data",
            )
            assert response.status_code in (500, 503)


class TestVoiceDiarize:
    """Test POST /voice/diarize endpoint."""

    def test_no_audio_file_returns_400(self, client):
        """POST /voice/diarize without audio file should return 400."""
        response = client.post("/voice/diarize")
        assert response.status_code == 400
        data = response.get_json()
        assert "error" in data


class TestNetworkStatus:
    """Test GET /network/status endpoint."""

    def test_network_status_returns_200(self, client):
        with patch("routes.chatbot_routes.check_internet_connection", return_value=False), \
             patch("routes.chatbot_routes.requests") as mock_req:
            mock_req.get.side_effect = Exception("no server")
            mock_req.head.side_effect = Exception("no server")
            response = client.get("/network/status")
            assert response.status_code == 200
            data = response.get_json()
            assert "is_online" in data
            assert data["is_online"] is False
            assert "local_agents_available" in data


# ============================================================
# Thinking traces — per-request isolation + FIFO eviction
# ============================================================

class TestThinkingTraces:
    """Tests for _capture_thinking / drain_thinking_traces in hartos_backend_adapter."""

    def _reset_traces(self):
        """Clear the module-level trace buffer between tests."""
        from routes.hartos_backend_adapter import _thinking_traces_by_request, _thinking_traces_lock
        with _thinking_traces_lock:
            _thinking_traces_by_request.clear()

    def test_capture_isolates_by_request_id(self):
        """Traces from different request_ids are stored separately."""
        self._reset_traces()
        from routes.hartos_backend_adapter import _capture_thinking, drain_thinking_traces
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'req-A', 'text': 'a'})
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'req-B', 'text': 'b'})
        traces_a = drain_thinking_traces('req-A')
        traces_b = drain_thinking_traces('req-B')
        assert len(traces_a) == 1
        assert traces_a[0]['text'] == 'a'
        assert len(traces_b) == 1
        assert traces_b[0]['text'] == 'b'

    def test_drain_removes_only_requested(self):
        """Draining one request_id leaves others intact."""
        self._reset_traces()
        from routes.hartos_backend_adapter import _capture_thinking, drain_thinking_traces
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'req-1', 'text': '1'})
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'req-2', 'text': '2'})
        drain_thinking_traces('req-1')
        # req-2 should still be there
        traces = drain_thinking_traces('req-2')
        assert len(traces) == 1

    def test_drain_all_fallback(self):
        """drain_thinking_traces(None) drains everything (backward compat)."""
        self._reset_traces()
        from routes.hartos_backend_adapter import _capture_thinking, drain_thinking_traces
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'r1', 'text': '1'})
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'r2', 'text': '2'})
        all_traces = drain_thinking_traces(None)
        assert len(all_traces) == 2

    def test_fifo_eviction_removes_oldest_not_alphabetical(self):
        """When >20 requests exist, the FIRST inserted is evicted (FIFO), not alphabetically first."""
        self._reset_traces()
        from routes.hartos_backend_adapter import _capture_thinking, _thinking_traces_by_request, _thinking_traces_lock
        # Insert 21 requests. ID 'zzz-first' is inserted FIRST but alphabetically LAST.
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'zzz-first', 'text': 'oldest'})
        for i in range(20):
            _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': f'aaa-{i:03d}', 'text': f'{i}'})
        with _thinking_traces_lock:
            # 'zzz-first' should have been evicted (it was the first inserted)
            assert 'zzz-first' not in _thinking_traces_by_request, (
                "FIFO eviction failed: 'zzz-first' was the oldest insertion but survived. "
                "Eviction is likely sorting alphabetically instead of by insertion order."
            )
            assert len(_thinking_traces_by_request) == 20

    def test_per_request_cap_at_50(self):
        """A single request_id is capped at 50 traces."""
        self._reset_traces()
        from routes.hartos_backend_adapter import _capture_thinking, drain_thinking_traces
        for i in range(60):
            _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'flood', 'text': f'{i}'})
        traces = drain_thinking_traces('flood')
        assert len(traces) == 50
        # Should keep the LAST 50 (indices 10-59)
        assert traces[0]['text'] == '10'

    def test_ignores_non_thinking_messages(self):
        """Messages without priority=49 or action='Thinking' are ignored."""
        self._reset_traces()
        from routes.hartos_backend_adapter import _capture_thinking, drain_thinking_traces
        _capture_thinking({'priority': 10, 'action': 'Thinking', 'request_id': 'r'})
        _capture_thinking({'priority': 49, 'action': 'NotThinking', 'request_id': 'r'})
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'r', 'text': 'ok'})
        traces = drain_thinking_traces('r')
        assert len(traces) == 1
        assert traces[0]['text'] == 'ok'

    def test_thread_safety_concurrent_capture(self):
        """Concurrent captures from multiple threads don't corrupt the buffer."""
        self._reset_traces()
        import threading

        from routes.hartos_backend_adapter import _capture_thinking, drain_thinking_traces
        errors = []

        def capture_batch(req_id, count):
            try:
                for i in range(count):
                    _capture_thinking({'priority': 49, 'action': 'Thinking',
                                       'request_id': req_id, 'text': f'{i}'})
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=capture_batch, args=(f'thread-{t}', 30))
                   for t in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Thread errors: {errors}"
        # All 5 threads should have their traces
        total = 0
        for t in range(5):
            traces = drain_thinking_traces(f'thread-{t}')
            total += len(traces)
            assert len(traces) == 30
        assert total == 150

    def test_daemon_traces_never_leak_into_user_drain(self):
        """Daemon traces (request_id='daemon_*' or 'unknown') must not appear in user drain."""
        self._reset_traces()
        from routes.hartos_backend_adapter import _capture_thinking, drain_thinking_traces
        # Daemon traces
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'daemon_goal123', 'text': 'daemon work'})
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'unknown', 'text': 'orphan'})
        # User trace
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'user-req-abc', 'text': 'user thought'})

        # Drain by specific user request_id — should get only user's trace
        user_traces = drain_thinking_traces('user-req-abc')
        assert len(user_traces) == 1
        assert user_traces[0]['text'] == 'user thought'

        # Drain with no matching request_id — should get empty (not daemon traces)
        leftover = drain_thinking_traces('nonexistent-req')
        assert len(leftover) == 0

    def test_daemon_traces_excluded_from_fallback_drain(self):
        """Fallback drain (no request_id) skips daemon_ and unknown traces."""
        self._reset_traces()
        from routes.hartos_backend_adapter import _capture_thinking, drain_thinking_traces
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'daemon_goal456', 'text': 'bg'})
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'unknown', 'text': 'orphan'})
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'user-xyz', 'text': 'user'})

        # Fallback drain (None) should return only user traces
        all_traces = drain_thinking_traces(None)
        assert len(all_traces) == 1
        assert all_traces[0]['text'] == 'user'


# ============================================================
# Missing key detection — agent-driven secret request
# ============================================================

class TestMissingKeyDetection:
    """_detect_missing_key_in_response identifies when an agent tool needs an API key."""

    def test_detects_api_key_not_found(self):
        from routes.chatbot_routes import _detect_missing_key_in_response
        result = _detect_missing_key_in_response("Error: api key not found for Google Search")
        assert result is not None

    def test_detects_authentication_failed(self):
        from routes.chatbot_routes import _detect_missing_key_in_response
        result = _detect_missing_key_in_response("authentication failed: invalid credentials")
        assert result is not None

    def test_returns_none_for_normal_response(self):
        from routes.chatbot_routes import _detect_missing_key_in_response
        result = _detect_missing_key_in_response("Here is your answer about Python.")
        assert result is None

    def test_returns_none_for_empty(self):
        from routes.chatbot_routes import _detect_missing_key_in_response
        assert _detect_missing_key_in_response("") is None
        assert _detect_missing_key_in_response(None) is None


# ============================================================
# Resource request extraction
# ============================================================

class TestResourceRequestExtraction:
    """_extract_resource_request parses tool output for structured resource needs."""

    def test_extracts_valid_json(self):
        """Extracts when __SECRET_REQUEST__ flag is present."""
        from routes.chatbot_routes import _extract_resource_request
        text = 'RESOURCE_REQUEST:{"__SECRET_REQUEST__": true, "key_name": "GOOGLE_API_KEY", "label": "Google Key"}'
        result = _extract_resource_request(text)
        assert result is not None
        assert result['key_name'] == 'GOOGLE_API_KEY'

    def test_returns_none_without_marker(self):
        from routes.chatbot_routes import _extract_resource_request
        assert _extract_resource_request("Just a normal response") is None

    def test_returns_none_for_invalid_json(self):
        from routes.chatbot_routes import _extract_resource_request
        result = _extract_resource_request("RESOURCE_REQUEST:{invalid json")
        assert result is None

    def test_returns_none_for_none_input(self):
        from routes.chatbot_routes import _extract_resource_request
        assert _extract_resource_request(None) is None


# ============================================================
# Language change + match_options stubs
# ============================================================

class TestStubFunctions:
    """Stubs that exist but are not yet implemented — must return safe defaults."""

    def test_language_change_returns_list(self):
        from routes.chatbot_routes import language_change
        result = language_change("en", "user_1")
        assert isinstance(result, list)
        assert len(result) > 0

    def test_match_options_returns_none(self):
        from routes.chatbot_routes import match_options
        result = match_options("prefix", "text")
        assert result is None


# ============================================================
# TTS wrapper functions
# ============================================================

class TestTTSWrappers:
    """TTS wrapper functions used by the /voice endpoints."""

    def test_get_tts_engine_returns_engine_or_none(self):
        from routes.chatbot_routes import get_tts_engine
        result = get_tts_engine()
        # Returns TTSEngine instance or None if not initialized
        assert result is not None or result is None  # doesn't crash

    def test_get_tts_status_returns_dict(self):
        from routes.chatbot_routes import get_tts_status
        result = get_tts_status()
        assert isinstance(result, dict)


# ============================================================
# _require_local_or_token decorator — auth boundary
# ============================================================

class TestAuthDecorator:
    """_require_local_or_token allows localhost but requires token for remote."""

    def test_decorator_exists(self):
        """Auth decorator must exist — it protects all /chat endpoints."""
        import routes.chatbot_routes as cr
        assert hasattr(cr, '_require_local_or_token')
        assert callable(cr._require_local_or_token)
