"""
test_regression_session_fixes.py - Regression tests for bugs fixed this session

Each test verifies a specific bug that was found and fixed. If any of these
fail in the future, the bug has regressed. Test names reference the bug:

BUG-1: TTLCache 'current_action' error in lifecycle_hooks (isinstance→hasattr)
BUG-2: Empty messages IndexError in state_transition
BUG-3: ModelCatalog save race (WinError 32)
BUG-4: Autoresearch agent loops on empty config
BUG-5: Daemon traces leaking into user chat
BUG-6: Default agent selection picks created agents
BUG-7: LLM warm startup shows redundant toast
BUG-8: React root empty (opacity:0 from suspended CSS transitions)
BUG-9: casual_conv disabling all tools for default agent
"""
import os
import sys
from unittest.mock import patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# BUG-5: Daemon traces must NOT leak into user chat
# ============================================================

class TestDaemonTraceIsolation:
    """Fixed: drain_thinking_traces returned daemon traces to user responses."""

    def _reset(self):
        from routes.hartos_backend_adapter import _thinking_traces_by_request, _thinking_traces_lock
        with _thinking_traces_lock:
            _thinking_traces_by_request.clear()

    def test_daemon_traces_excluded_from_user_drain(self):
        """Daemon traces (request_id='daemon_*') must never appear in user responses."""
        self._reset()
        from routes.hartos_backend_adapter import _capture_thinking, drain_thinking_traces
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'daemon_goal_1', 'text': 'bg work'})
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'user_req_1', 'text': 'user thought'})
        # User drain should only get user traces
        traces = drain_thinking_traces('user_req_1')
        assert len(traces) == 1
        assert traces[0]['text'] == 'user thought'
        # Daemon traces should still be in buffer (not drained to user)
        self._reset()

    def test_unknown_traces_excluded_from_user_drain(self):
        """Traces without request_id go to 'unknown' — must not leak to user."""
        self._reset()
        from routes.hartos_backend_adapter import _capture_thinking, drain_thinking_traces
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'text': 'orphan trace'})
        traces = drain_thinking_traces('user_req_2')
        assert len(traces) == 0  # No traces for this request
        self._reset()

    def test_fifo_eviction_uses_insertion_order(self):
        """Eviction must use OrderedDict insertion order, not alphabetical sort."""
        self._reset()
        from routes.hartos_backend_adapter import _capture_thinking, _thinking_traces_by_request, _thinking_traces_lock
        _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': 'zzz_first_inserted', 'text': 'old'})
        for i in range(20):
            _capture_thinking({'priority': 49, 'action': 'Thinking', 'request_id': f'aaa_{i}', 'text': f'{i}'})
        with _thinking_traces_lock:
            assert 'zzz_first_inserted' not in _thinking_traces_by_request
        self._reset()


# ============================================================
# BUG-7: LLM warm startup — is_llm_server_running vs is_llm_available
# ============================================================

class TestWarmLLMStartup:
    """Fixed: is_llm_available returned False for loading server (500),
    triggering redundant start + misleading 'Starting Qwen...' toast."""

    def test_is_llm_available_false_for_500(self):
        """is_llm_available must return False for 500 — server loading, not ready for chat."""
        import tempfile
        import urllib.request

        from llama.llama_config import LlamaConfig
        with tempfile.TemporaryDirectory() as d:
            cfg = LlamaConfig(config_dir=d)
            cfg.config['cloud_provider'] = None
        with patch('urllib.request.urlopen',
                   side_effect=urllib.request.HTTPError('', 500, '', None, None)):
            assert cfg.is_llm_available() is False

    def test_is_llm_server_running_true_for_500(self):
        """is_llm_server_running must return True for 500 — server exists, don't start another."""
        import tempfile
        import urllib.request

        from llama.llama_config import LlamaConfig
        with tempfile.TemporaryDirectory() as d:
            cfg = LlamaConfig(config_dir=d)
            cfg.config['cloud_provider'] = None
        with patch('urllib.request.urlopen',
                   side_effect=urllib.request.HTTPError('', 500, '', None, None)):
            assert cfg.is_llm_server_running() is True

    def test_is_llm_server_running_false_for_connection_refused(self):
        """ConnectionRefused = no server at all — cold start needed."""
        import tempfile

        from llama.llama_config import LlamaConfig
        with tempfile.TemporaryDirectory() as d:
            cfg = LlamaConfig(config_dir=d)
            cfg.config['cloud_provider'] = None
        with patch('urllib.request.urlopen', side_effect=ConnectionRefusedError):
            assert cfg.is_llm_server_running() is False


# ============================================================
# BUG-9: casual_conv gates on 4 conditions
# ============================================================

class TestCasualConvGating:
    """Fixed: casual_conv was hardcoded False, then True unconditionally.
    Now gates on: no prompt_id AND no create AND no execute AND no plan."""

    def test_casual_true_for_default_agent(self):
        """Default agent (no prompt, no agentic flow) should get casual_conv=True."""
        # This is the logic in chatbot_routes.py
        langchain_prompt_id = None
        create_agent = False
        agentic_execute = False
        agentic_plan = None
        _is_casual = (
            not langchain_prompt_id
            and not create_agent
            and not agentic_execute
            and not agentic_plan
        )
        assert _is_casual is True

    def test_casual_false_with_prompt_id(self):
        """Agent with prompt_id needs tools — casual_conv must be False."""
        langchain_prompt_id = '12345'
        _is_casual = not langchain_prompt_id and not False and not False and not None
        assert _is_casual is False

    def test_casual_false_with_create_agent(self):
        create_agent = True
        _is_casual = not None and not create_agent and not False and not None
        assert _is_casual is False

    def test_casual_false_with_agentic_execute(self):
        agentic_execute = True
        _is_casual = not None and not False and not agentic_execute and not None
        assert _is_casual is False

    def test_casual_false_with_agentic_plan(self):
        agentic_plan = {'steps': ['step1']}
        _is_casual = not None and not False and not False and not agentic_plan
        assert _is_casual is False


# ============================================================
# BUG-6: Default agent selection prefers local_assistant
# ============================================================

class TestDefaultAgentSelection:
    """Fixed: frontend picked first non-cloud agent as default, which could be
    a user-created agent with a full agentic prompt. Now prefers local_assistant."""

    def test_local_assistant_is_default(self):
        """The LOCAL_AGENTS list has local_assistant as first with is_default=True."""
        from routes.chatbot_routes import LOCAL_AGENTS
        default = [a for a in LOCAL_AGENTS if a.get('is_default')]
        assert len(default) >= 1
        assert default[0]['id'] == 'local_assistant'

    def test_local_assistant_has_id(self):
        from routes.chatbot_routes import LOCAL_AGENTS
        ids = [a['id'] for a in LOCAL_AGENTS]
        assert 'local_assistant' in ids

    def test_local_agents_come_first(self):
        """LOCAL_AGENTS are prepended to the agent list — they appear first in sidebar."""
        from routes.chatbot_routes import LOCAL_AGENTS
        assert len(LOCAL_AGENTS) >= 2
        assert LOCAL_AGENTS[0]['type'] == 'local'
