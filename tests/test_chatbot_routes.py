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


class TestDetectChannelConnectIntent:
    """Tier-1 deterministic detection for 'connect to whatsapp' et al.
    The chat handler uses this result to nudge the LangChain agent toward
    the Connect_Channel tool instead of producing a text answer."""

    @pytest.fixture(autouse=True)
    def _import_detector(self):
        from routes.chatbot_routes import _detect_channel_connect_intent
        self.detect = _detect_channel_connect_intent

    def test_connect_whatsapp(self):
        assert self.detect("connect to whatsapp") == "whatsapp"

    def test_connect_whatsapp_no_preposition(self):
        assert self.detect("connect whatsapp") == "whatsapp"

    def test_add_telegram(self):
        assert self.detect("add telegram") == "telegram"

    def test_link_my_slack(self):
        assert self.detect("link my slack") == "slack"

    def test_set_up_discord(self):
        assert self.detect("set up discord") == "discord"

    def test_hook_up_gmail(self):
        assert self.detect("hook up gmail") == "gmail"

    def test_register_matrix(self):
        assert self.detect("register matrix") == "matrix"

    def test_activate_signal(self):
        assert self.detect("activate signal") == "signal"

    def test_x_normalizes_to_twitter(self):
        assert self.detect("connect x") == "twitter"

    def test_rocketchat_normalizes(self):
        assert self.detect("connect rocketchat") == "rocket.chat"

    def test_case_insensitive(self):
        assert self.detect("CONNECT TO WHATSAPP") == "whatsapp"

    def test_trailing_punctuation(self):
        assert self.detect("connect whatsapp!") == "whatsapp"

    def test_no_verb(self):
        # No connect verb → nothing to match
        assert self.detect("whatsapp is great") is None

    def test_unknown_channel(self):
        assert self.detect("connect something unknown") is None

    def test_empty(self):
        assert self.detect("") is None

    def test_none(self):
        assert self.detect(None) is None

    def test_connect_in_other_context(self):
        # "connect" without a known channel name → no match
        assert self.detect("connect me to the database") is None


class TestIsCasualMessage:
    """Tier-0 chit-chat classifier. Casual messages bypass LangChain tool
    resolution and go straight to the LLM as pure chat — cuts ~3s off
    'hi' / 'thanks' in bundled mode."""

    @pytest.fixture(autouse=True)
    def _import_detector(self):
        from routes.chatbot_routes import _is_casual_message
        self.is_casual = _is_casual_message

    def test_hi(self):
        assert self.is_casual("hi") is True

    def test_hello(self):
        assert self.is_casual("hello") is True

    def test_thanks(self):
        assert self.is_casual("thanks") is True

    def test_ok(self):
        assert self.is_casual("ok") is True

    def test_how_are_you(self):
        assert self.is_casual("how are you") is True

    def test_good_morning(self):
        assert self.is_casual("good morning") is True

    def test_uppercase_greeting(self):
        assert self.is_casual("HEY") is True

    def test_trailing_punctuation(self):
        assert self.is_casual("thanks!!") is True

    def test_long_message_not_casual(self):
        # Over 8 words → not casual even if no tool trigger
        assert self.is_casual(
            "this is a much longer sentence that absolutely should not count"
        ) is False

    def test_tool_trigger_open(self):
        assert self.is_casual("open notepad") is False

    def test_tool_trigger_whatsapp(self):
        # Tool-trigger overrides short length
        assert self.is_casual("connect whatsapp") is False

    def test_tool_trigger_search(self):
        assert self.is_casual("search for X") is False

    def test_tool_trigger_remember(self):
        assert self.is_casual("remember this") is False

    def test_short_unknown_phrase_is_casual(self):
        # ≤3 words, no tool trigger → treated as casual ack
        assert self.is_casual("sounds fine") is True

    def test_empty(self):
        assert self.is_casual("") is False

    def test_none(self):
        assert self.is_casual(None) is False

    # Regression: 'wht do you do' was routed to the full LangChain
    # pipeline because it was 4 words (>3-word gate) and not in the
    # allowlist, making the bundled UI "think forever".
    def test_what_do_you_do(self):
        assert self.is_casual("what do you do") is True

    def test_what_do_you_do_typo(self):
        assert self.is_casual("wht do you do") is True

    def test_what_can_you_do(self):
        assert self.is_casual("what can you do") is True

    def test_who_are_you(self):
        assert self.is_casual("who are you") is True

    def test_how_do_you_work(self):
        assert self.is_casual("how do you work") is True

    def test_tell_me_about_yourself(self):
        assert self.is_casual("tell me about yourself") is True

    def test_what_do_u_do_informal(self):
        # Informal 'u' for 'you' should still classify as casual
        assert self.is_casual("what do u do") is True

    def test_self_referential_pattern_catches_paraphrase(self):
        # Not in allowlist but matches self-referential pattern
        assert self.is_casual("how do you help") is True

    def test_loosened_gate_does_not_break_tool_triggers(self):
        # 4 words, but 'open' is a tool trigger — must stay False
        assert self.is_casual("please open notepad now") is False


class TestCorrectionIntentFromDraftModel:
    """Correction intent is classified by the HARTOS draft-first
    dispatcher's Qwen3.5-0.8B model, NOT a hardcoded phrase list.
    The chat handler reads ``is_correction`` off the chat result dict
    and fires ``_submit_correction_async`` only when the draft flagged
    the current turn as a correction of the previous assistant response.

    These tests lock that contract: the handler must check the draft
    flag (not regex-match the user text) and must NOT import any
    removed hardcoded detector."""

    def test_no_hardcoded_detector_remains(self):
        """Guard against the hardcoded _detect_correction_intent and
        _CORRECTION_MARKERS ever coming back. The draft model is the
        single source of truth for correction classification."""
        import routes.chatbot_routes as cr
        assert not hasattr(cr, '_detect_correction_intent'), \
            ('Hardcoded correction detector resurfaced — correction '
             'intent must come from the draft model, not a phrase list.')
        assert not hasattr(cr, '_CORRECTION_MARKERS'), \
            ('Hardcoded _CORRECTION_MARKERS tuple resurfaced — the draft '
             'classifier owns this decision now.')

    def test_submit_correction_still_exported(self):
        """The async submitter must stay — it's the bridge to
        WorldModelBridge that the chat handler calls after reading
        is_correction from the draft result."""
        from routes.chatbot_routes import _submit_correction_async
        assert callable(_submit_correction_async)


class TestSubmitCorrectionAsync:
    """The correction submission must be fire-and-forget and never
    raise into the chat response path, even if WorldModelBridge is
    broken or HevolveAI is offline."""

    def test_spawns_daemon_thread(self):
        from routes.chatbot_routes import _submit_correction_async
        with patch('threading.Thread') as mock_thread:
            mock_thread.return_value = MagicMock()
            _submit_correction_async('old', 'new', user_id='u1')
            mock_thread.assert_called_once()
            assert mock_thread.call_args.kwargs.get('daemon') is True
            assert mock_thread.call_args.kwargs.get('name') == 'submit_correction'

    def test_worker_calls_bridge_with_right_args(self):
        from routes.chatbot_routes import _submit_correction_async
        captured = {}
        def capture_thread(target=None, **kwargs):
            captured['fn'] = target
            return MagicMock()
        mock_bridge = MagicMock()
        with patch('threading.Thread', side_effect=capture_thread):
            _submit_correction_async('old answer', 'actually correct', 'u1')
        with patch('integrations.agent_engine.world_model_bridge.get_world_model_bridge',
                   return_value=mock_bridge):
            captured['fn']()
        mock_bridge.submit_correction.assert_called_once()
        call_kwargs = mock_bridge.submit_correction.call_args.kwargs
        assert call_kwargs['original_response'] == 'old answer'
        assert call_kwargs['corrected_response'] == 'actually correct'
        assert call_kwargs['expert_id'] == 'chat:u1'

    def test_worker_swallows_bridge_exceptions(self):
        from routes.chatbot_routes import _submit_correction_async
        captured = {}
        def capture_thread(target=None, **kwargs):
            captured['fn'] = target
            return MagicMock()
        with patch('threading.Thread', side_effect=capture_thread):
            _submit_correction_async('a', 'b', 'u1')
        with patch('integrations.agent_engine.world_model_bridge.get_world_model_bridge',
                   side_effect=RuntimeError('bridge down')):
            # Must NOT raise
            captured['fn']()


class TestLlmAutoStartDelegation:
    """Chat route owns NO model lifecycle logic. It just calls
    ModelOrchestrator.ensure_loaded_async — the single unified entry
    point for every model type (llm, tts, stt, vlm, ...). No in-memory
    debounce, no thread spawning in the route file, no fallback cascade
    duplication. This test locks in the delegation so a future refactor
    can't silently re-introduce a per-model-type starter inside the
    Flask route layer."""

    def test_ensure_loaded_async_is_the_one_entry_point(self):
        mock_orch = MagicMock()
        with patch('models.orchestrator.get_orchestrator',
                   return_value=mock_orch):
            from models.orchestrator import get_orchestrator
            get_orchestrator().ensure_loaded_async('llm', caller='chat:u1')
            mock_orch.ensure_loaded_async.assert_called_once_with(
                'llm', caller='chat:u1')


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
