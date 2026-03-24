"""
User Acceptance Tests (UAT) for the Agentic Pipeline.

Simulates a user going through the full agent lifecycle:
  1. Agent Creation (gather_info phase)
  2. Agent Review (recipe phase)
  3. Agent Reuse (chat_agent phase)
  4. Autonomous agent creation
  5. Turn-limit force-completion
  6. File-based routing recovery after restart

These tests call the hart_intelligence (hart_intelligence.py) Flask /chat endpoint
directly via test_client, bypassing Nunba's adapter layer, to validate the core
pipeline logic without requiring LLM services to be running.

When LLM backends are unavailable, tests mock gather_info / recipe /
chat_agent to simulate realistic multi-turn conversations.
"""

import json
import os
import shutil
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import MagicMock, patch

PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJ_ROOT)

# We need the HARTOS project importable
HARTOS_ROOT = os.path.join(os.path.dirname(PROJ_ROOT), 'HARTOS')
if os.path.isdir(HARTOS_ROOT):
    sys.path.insert(0, HARTOS_ROOT)

# Pre-inject a stub gather_agentdetails module if autogen is not installed.
# gather_agentdetails.py does `import autogen` at line 2 which fails without
# the autogen package. We inject a stub so tests can mock gather_info.
if 'gather_agentdetails' not in sys.modules:
    try:
        import gather_agentdetails  # noqa: F401
    except (ImportError, ModuleNotFoundError):
        _stub = types.ModuleType('gather_agentdetails')
        _stub.gather_info = MagicMock(return_value='{}')
        sys.modules['gather_agentdetails'] = _stub


def _can_import_hart_intelligence():
    """Check if hart_intelligence (or hart_intelligence) is importable."""
    try:
        import importlib
        spec = importlib.util.find_spec('hart_intelligence')
        if spec is not None:
            return spec
        # Fallback to hart_intelligence (the implementation module)
        spec = importlib.util.find_spec('hart_intelligence')
        return spec is not None
    except Exception:
        return False


# =======================================================================
# Mock targets:
#   gather_info is imported LOCALLY inside chat() as:
#     from gather_agentdetails import gather_info
#   We mock at 'gather_agentdetails.gather_info' (stub module injected above)
#
#   recipe / chat_agent: module-level from create_recipe / reuse_recipe,
#   set to None when autogen is missing. We inject MagicMock in setUp.
# =======================================================================

MOCK_GATHER = 'gather_agentdetails.gather_info'
MOCK_POOLED_GET = 'hart_intelligence.pooled_get'
MOCK_POOLED_POST = 'hart_intelligence.pooled_post'
MOCK_SOCIAL_AGENT = 'hart_intelligence._create_social_agent_from_prompt'


def _ensure_recipe_mocks(lgapi):
    """Ensure recipe/chat_agent are set on the module (may be None from failed import).

    When autogen is not installed, create_recipe and reuse_recipe fail to import,
    leaving these as None. We inject MagicMocks so the /chat pipeline doesn't crash
    with 'NoneType is not callable'.
    """
    if lgapi.recipe is None:
        lgapi.recipe = MagicMock(return_value='Reviewing')
    if lgapi.chat_agent is None:
        lgapi.chat_agent = MagicMock(return_value='Reuse response')
    # Also stub create_recipe/reuse_recipe modules if not importable
    if 'create_recipe' not in sys.modules or sys.modules['create_recipe'] is None:
        _cr = types.ModuleType('create_recipe')
        _cr.recipe = lgapi.recipe
        sys.modules['create_recipe'] = _cr
    if 'reuse_recipe' not in sys.modules or sys.modules['reuse_recipe'] is None:
        _rr = types.ModuleType('reuse_recipe')
        _rr.chat_agent = lgapi.chat_agent
        sys.modules['reuse_recipe'] = _rr


def _get_lgapi():
    """Import and configure hart_intelligence (cached after first call)."""
    try:
        import hart_intelligence
        lgapi = hart_intelligence
    except ImportError:
        import hart_intelligence
        lgapi = hart_intelligence
        # Register under hart_intelligence so mock paths work
        sys.modules['hart_intelligence'] = lgapi
    lgapi.app.config['TESTING'] = True
    _ensure_recipe_mocks(lgapi)
    return lgapi


def _reset_state(lgapi, temp_dir):
    """Reset in-memory state and clean temp files."""
    lgapi.review_agents.clear()
    lgapi.conversation_agent.clear()
    lgapi.first_promts.clear()
    lgapi._gather_turn_counts.clear()
    lgapi._agent_timestamps.clear()
    # Reset rate limiter to avoid 30/min limit across tests
    try:
        from integrations.social.rate_limiter import _limiter
        _limiter._buckets.clear()
    except Exception:
        pass
    for f in os.listdir(temp_dir):
        fp = os.path.join(temp_dir, f)
        if os.path.isfile(fp):
            os.unlink(fp)


def _chat(client, prompt, user_id='test_user_1', prompt_id=None,
          create_agent=False, autonomous=False):
    """Helper: POST /chat and return parsed JSON."""
    payload = {
        'prompt': prompt,
        'user_id': user_id,
        'prompt_id': prompt_id,
        'create_agent': create_agent,
        'autonomous': autonomous,
        'casual_conv': False,
    }
    resp = client.post('/chat', json=payload)
    return resp.get_json() or {}


# ===================================================================
# Base test class: manages per-test PROMPTS_DIR isolation
# ===================================================================

# Module-level shared client (only one test_client for the entire test run)
_shared_lgapi = None
_shared_client = None


def _get_shared():
    """Get or create the shared lgapi + client (singleton)."""
    global _shared_lgapi, _shared_client
    if _shared_lgapi is None:
        _shared_lgapi = _get_lgapi()
        _shared_client = _shared_lgapi.app.test_client()
    return _shared_lgapi, _shared_client


@unittest.skipUnless(_can_import_hart_intelligence(),
                     "hart_intelligence not installed (pip install -e HARTOS)")
class _AgentPipelineTestBase(unittest.TestCase):
    """Base class: creates a temp PROMPTS_DIR for each test."""

    @classmethod
    def setUpClass(cls):
        cls.lgapi, cls.client = _get_shared()

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix='nunba_uat_')
        self._orig_prompts = self.lgapi.PROMPTS_DIR
        self.lgapi.PROMPTS_DIR = self.temp_dir
        # hart_intelligence_entry has its own module-level PROMPTS_DIR that all
        # file I/O inside chat() reads directly.  The re-export module is a
        # separate object, so assigning lgapi.PROMPTS_DIR never reaches the
        # actual code.  Patch the entry module's global too.
        import hart_intelligence_entry as _hie
        self._hie = _hie
        self._orig_hie_prompts = _hie.PROMPTS_DIR
        _hie.PROMPTS_DIR = self.temp_dir
        _ensure_recipe_mocks(self.lgapi)
        _reset_state(self.lgapi, self.temp_dir)
        # Patch recipe/chat_agent in hart_intelligence_entry (where chat() is defined).
        # star-import copies values, so patching hart_intelligence doesn't reach
        # chat()'s globals which point to hart_intelligence_entry.__dict__.
        self._recipe_patcher = patch.object(
            _hie, 'recipe', MagicMock(return_value='Reviewing'))
        self._chat_agent_patcher = patch.object(
            _hie, 'chat_agent', MagicMock(return_value='Reuse response'))
        self._recipe_patcher.start()
        self._chat_agent_patcher.start()

    def tearDown(self):
        self._recipe_patcher.stop()
        self._chat_agent_patcher.stop()
        import hart_intelligence_entry as _hie
        _hie.PROMPTS_DIR = self._orig_hie_prompts
        self.lgapi.PROMPTS_DIR = self._orig_prompts
        shutil.rmtree(self.temp_dir, ignore_errors=True)


# ===================================================================
# Phase 1: Agent Creation Tests
# ===================================================================

class TestAgentPipelineCreation(_AgentPipelineTestBase):
    """Test Phase 1: Agent creation via gather_info."""

    # ------------------------------------------------------------------
    # Test 1: First chat with create_agent=True triggers Creation Mode
    # ------------------------------------------------------------------
    @patch(MOCK_POOLED_GET, side_effect=Exception("DB unavailable"))
    @patch(MOCK_GATHER)
    def test_creation_mode_first_turn(self, mock_gather, _):
        """First create_agent request should enter Creation Mode."""
        mock_gather.return_value = json.dumps({
            'status': 'pending',
            'question': 'What should this agent do? Please describe its purpose.'
        })

        result = _chat(self.client,
                       'Create a fitness tracking agent',
                       prompt_id='99001', create_agent=True)

        self.assertEqual(result.get('Agent_status'), 'Creation Mode')
        self.assertIn('purpose', result.get('response', '').lower())
        self.assertEqual(result.get('prompt_id'), '99001')
        mock_gather.assert_called_once()

    # ------------------------------------------------------------------
    # Test 2: Subsequent turns continue Creation Mode
    # ------------------------------------------------------------------
    @patch(MOCK_POOLED_GET, side_effect=Exception("DB unavailable"))
    @patch(MOCK_GATHER)
    def test_creation_mode_multi_turn(self, mock_gather, _):
        """Multiple gather_info turns should stay in Creation Mode."""
        mock_gather.return_value = json.dumps({
            'status': 'pending',
            'question': 'What is the agent name?'
        })
        r1 = _chat(self.client, 'Create a fitness agent',
                    prompt_id='99002', create_agent=True)
        self.assertEqual(r1.get('Agent_status'), 'Creation Mode')

        mock_gather.return_value = json.dumps({
            'status': 'pending',
            'question': 'What actions should the agent perform?'
        })
        r2 = _chat(self.client, 'Call it FitBot',
                    prompt_id='99002', create_agent=True)
        self.assertEqual(r2.get('Agent_status'), 'Creation Mode')

    # ------------------------------------------------------------------
    # Test 3: Completed gather_info → Review Mode + JSON saved
    # ------------------------------------------------------------------
    @patch(MOCK_POOLED_POST, return_value=MagicMock(status_code=200))
    @patch(MOCK_POOLED_GET, side_effect=Exception("DB unavailable"))
    @patch(MOCK_GATHER)
    def test_creation_to_review_transition(self, mock_gather, _, __):
        """Completed gather_info should save JSON and enter Review Mode."""
        completed_config = {
            'status': 'completed',
            'name': 'FitBot',
            'agent_name': 'fit.bot',
            'goal': 'Track fitness activities',
            'broadcast_agent': 'no',
            'personas': [{'name': 'Trainer', 'description': 'A fitness trainer'}],
            'flows': [{
                'flow_name': 'main',
                'persona': 'Trainer',
                'actions': [{'action': 'Track workout', 'action_id': 'track_1',
                              'status': 'pending'}],
                'sub_goal': 'Help user track workouts'
            }],
        }
        mock_gather.return_value = json.dumps(completed_config)

        result = _chat(self.client, 'Create a fitness agent',
                       prompt_id='99003', create_agent=True)

        self.assertEqual(result.get('Agent_status'), 'Review Mode')

        json_path = os.path.join(self.temp_dir, '99003.json')
        self.assertTrue(os.path.isfile(json_path),
                        f"Agent config not saved at {json_path}")

        with open(json_path) as f:
            saved = json.load(f)
        self.assertEqual(saved['name'], 'FitBot')
        self.assertEqual(saved['prompt_id'], '99003')
        self.assertEqual(saved['creator_user_id'], 'test_user_1')

    # ------------------------------------------------------------------
    # Test 4: Turn counter tracks gather_info turns
    # ------------------------------------------------------------------
    @patch(MOCK_POOLED_GET, side_effect=Exception("DB unavailable"))
    @patch(MOCK_GATHER)
    def test_turn_counter_increments(self, mock_gather, _):
        """Turn counter should increment with each gather_info call."""
        mock_gather.return_value = json.dumps({
            'status': 'pending',
            'question': 'Next question?'
        })

        for i in range(3):
            _chat(self.client, f'Answer {i}',
                  prompt_id='99004', create_agent=True)

        turn_key = 'test_user_1_99004'
        self.assertEqual(self.lgapi._gather_turn_counts.get(turn_key), 3)


# ===================================================================
# Phase 1b: Force-Completion Tests
# ===================================================================

class TestAgentPipelineForceComplete(_AgentPipelineTestBase):
    """Test force-completion after MAX_GATHER_TURNS."""

    # ------------------------------------------------------------------
    # Test 5: Force-completion after MAX_GATHER_TURNS
    # ------------------------------------------------------------------
    @patch(MOCK_POOLED_POST, return_value=MagicMock(status_code=200))
    @patch(MOCK_POOLED_GET, side_effect=Exception("DB unavailable"))
    @patch(MOCK_GATHER)
    def test_force_complete_at_max_turns(self, mock_gather, _, __):
        """After MAX_GATHER_TURNS, should force-complete the agent."""
        max_turns = self.lgapi.MAX_GATHER_TURNS

        # Return pending for all turns
        mock_gather.return_value = json.dumps({
            'status': 'pending',
            'question': 'More info needed'
        })

        for i in range(max_turns - 1):
            r = _chat(self.client, f'Answer {i}',
                      prompt_id='99005', create_agent=True)
            self.assertEqual(r.get('Agent_status'), 'Creation Mode',
                             f"Turn {i+1} should be Creation Mode")

        # At MAX turn, LLM is asked to force-complete
        mock_gather.return_value = json.dumps({
            'status': 'completed',
            'name': 'ForceCompleted Agent',
            'agent_name': 'auto.forced',
            'goal': 'Forced completion agent',
            'broadcast_agent': 'no',
            'personas': [{'name': 'Default', 'description': 'Default'}],
            'flows': [{'flow_name': 'main', 'persona': 'Default',
                        'actions': [{'action': 'Respond', 'action_id': 'r1',
                                      'status': 'pending'}],
                        'sub_goal': 'Help user'}],
        })

        r = _chat(self.client, 'Force me',
                  prompt_id='99005', create_agent=True)
        self.assertEqual(r.get('Agent_status'), 'Review Mode')
        self.assertTrue(os.path.isfile(
            os.path.join(self.temp_dir, '99005.json')))

    # ------------------------------------------------------------------
    # Test 6: Salvage after repeated parse failures near max turns
    # ------------------------------------------------------------------
    @patch(MOCK_POOLED_POST, return_value=MagicMock(status_code=200))
    @patch(MOCK_POOLED_GET, side_effect=Exception("DB unavailable"))
    @patch(MOCK_GATHER)
    def test_salvage_on_parse_failure(self, mock_gather, _, __):
        """Near-max turns with parse failures should salvage partial config."""
        max_turns = self.lgapi.MAX_GATHER_TURNS

        mock_gather.return_value = json.dumps({
            'status': 'pending',
            'question': 'Tell me more'
        })
        for i in range(max_turns - 3):
            _chat(self.client, f'Answer {i}',
                  prompt_id='99006', create_agent=True)

        # Return unparseable garbage for the remaining turns
        mock_gather.return_value = "This is NOT valid JSON at all <broken>"

        for i in range(3):
            r = _chat(self.client, f'Garbled {i}',
                      prompt_id='99006', create_agent=True)

        self.assertEqual(r.get('Agent_status'), 'Review Mode',
                         "Salvage should transition to Review Mode")

        json_path = os.path.join(self.temp_dir, '99006.json')
        self.assertTrue(os.path.isfile(json_path))
        with open(json_path) as f:
            salvaged = json.load(f)
        self.assertEqual(salvaged['status'], 'completed')
        # Verify actions are proper dicts (HIGH bug fix)
        for flow in salvaged['flows']:
            for action in flow['actions']:
                self.assertIsInstance(action, dict,
                                     f"Salvaged action must be dict: {action}")


# ===================================================================
# Phase 2: Review Tests
# ===================================================================

class TestAgentPipelineReview(_AgentPipelineTestBase):
    """Test Phase 2: Agent review via recipe."""

    def _create_agent_json(self, prompt_id, user_id='test_user_1'):
        """Write a valid agent config JSON to simulate completed gather_info."""
        config = {
            'status': 'completed',
            'name': 'TestAgent',
            'agent_name': 'test.agent',
            'goal': 'Help with testing',
            'prompt_id': prompt_id,
            'creator_user_id': user_id,
            'broadcast_agent': 'no',
            'personas': [{'name': 'Tester', 'description': 'QA persona'}],
            'flows': [{
                'flow_name': 'main',
                'persona': 'Tester',
                'actions': [{'action': 'Run tests', 'action_id': 'run_1',
                              'status': 'pending'}],
                'sub_goal': 'Execute test suite'
            }],
        }
        path = os.path.join(self.temp_dir, f'{prompt_id}.json')
        with open(path, 'w') as f:
            json.dump(config, f)
        return config

    # ------------------------------------------------------------------
    # Test 7: JSON exists + no recipe → Review Mode
    # ------------------------------------------------------------------
    def test_routing_json_exists_no_recipe(self):
        """With agent JSON but no recipe, should enter Review Mode."""
        self._create_agent_json('99010')

        with patch.object(self._hie, 'recipe',
                          return_value='Reviewing action 1'):
            result = _chat(self.client, 'Review this agent',
                           prompt_id='99010')
        self.assertEqual(result.get('Agent_status'), 'Review Mode')

    # ------------------------------------------------------------------
    # Test 8: recipe() → 'Agent Created Successfully' → completed
    # ------------------------------------------------------------------
    def test_review_completes_agent(self):
        """recipe() returning success → completed status."""
        self._create_agent_json('99011')

        with patch.object(self._hie, 'recipe',
                          return_value='Agent Created Successfully'), \
             patch(MOCK_SOCIAL_AGENT, return_value=None):
            result = _chat(self.client, 'Looks good',
                           prompt_id='99011')
        self.assertEqual(result.get('Agent_status'), 'completed')

    # ------------------------------------------------------------------
    # Test 9: After completion, same prompt_id → Reuse (chat_agent)
    # ------------------------------------------------------------------
    def test_completed_agent_routes_to_reuse(self):
        """After completed, next chat with same prompt_id → chat_agent."""
        self._create_agent_json('99012')

        # First: complete the agent
        with patch.object(self._hie, 'recipe',
                          return_value='Agent Created Successfully'), \
             patch(MOCK_SOCIAL_AGENT, return_value=None):
            _chat(self.client, 'Create it', prompt_id='99012')

        # Clear in-memory state (simulates restart)
        self.lgapi.review_agents.clear()
        self.lgapi.conversation_agent.clear()

        # Create recipe file (required for reuse routing)
        recipe_path = os.path.join(self.temp_dir, '99012_0_recipe.json')
        with open(recipe_path, 'w') as f:
            json.dump({'recipe': 'test', 'flow_index': 0}, f)

        with patch.object(self._hie, 'chat_agent',
                          return_value='Hello from agent!') as mock_ca:
            result = _chat(self.client, 'Hello agent', prompt_id='99012')
        mock_ca.assert_called()


# ===================================================================
# Autonomous Creation Tests
# ===================================================================

class TestAgentPipelineAutonomous(_AgentPipelineTestBase):
    """Test autonomous agent creation path."""

    # ------------------------------------------------------------------
    # Test 10: Autonomous creation saves JSON and returns Review Mode
    # ------------------------------------------------------------------
    @patch(MOCK_POOLED_GET, side_effect=Exception("DB unavailable"))
    @patch('hart_intelligence_entry._autonomous_gather_info')
    def test_autonomous_creation(self, mock_auto_gather, _):
        """Autonomous dispatch should return Review Mode."""
        mock_auto_gather.return_value = (
            'Agent details gathered autonomously. Moving to review.')

        result = _chat(self.client,
                       'Create a math tutor agent automatically',
                       prompt_id='99020', create_agent=True,
                       autonomous=True)

        self.assertEqual(result.get('Agent_status'), 'Review Mode')
        self.assertTrue(result.get('autonomous_creation'))
        mock_auto_gather.assert_called_once()


# ===================================================================
# File-Based Routing Tests
# ===================================================================

class TestAgentPipelineFileRouting(_AgentPipelineTestBase):
    """Test file-based routing logic (recovery after restart)."""

    def _write_agent_files(self, prompt_id, with_recipe=False,
                            num_flows=1, all_recipes=True):
        """Write agent JSON (and optionally recipe files) to temp dir."""
        config = {
            'status': 'completed',
            'name': f'Agent {prompt_id}',
            'agent_name': f'test.agent{prompt_id}',
            'goal': 'Test goal',
            'prompt_id': prompt_id,
            'creator_user_id': 'test_user_1',
            'broadcast_agent': 'no',
            'personas': [{'name': 'P', 'description': 'Persona'}],
            'flows': [{'flow_name': f'flow_{i}', 'persona': 'P',
                        'actions': [{'action': f'Act {i}', 'action_id': f'a_{i}',
                                      'status': 'pending'}],
                        'sub_goal': f'Goal {i}'}
                       for i in range(num_flows)],
        }
        path = os.path.join(self.temp_dir, f'{prompt_id}.json')
        with open(path, 'w') as f:
            json.dump(config, f)

        if with_recipe:
            count = num_flows if all_recipes else (num_flows - 1)
            for i in range(count):
                rpath = os.path.join(self.temp_dir,
                                     f'{prompt_id}_{i}_recipe.json')
                with open(rpath, 'w') as f:
                    json.dump({'recipe': f'recipe_{i}', 'flow_index': i}, f)
        return config

    # ------------------------------------------------------------------
    # Test 11: JSON exists + no recipe → Review Mode
    # ------------------------------------------------------------------
    def test_json_no_recipe_routes_to_review(self):
        """JSON exists but no recipe → review mode (recipe called)."""
        self._write_agent_files('99030', with_recipe=False)

        with patch.object(self._hie, 'recipe',
                          return_value='Reviewing flow_0'):
            result = _chat(self.client, 'Review', prompt_id='99030')
        self.assertEqual(result.get('Agent_status'), 'Review Mode')

    # ------------------------------------------------------------------
    # Test 12: JSON + partial recipes → Review (create missing recipe)
    # ------------------------------------------------------------------
    def test_json_partial_recipes_routes_to_review(self):
        """JSON + some recipe files but missing last → review mode."""
        self._write_agent_files('99031', with_recipe=True,
                                num_flows=3, all_recipes=False)

        with patch.object(self._hie, 'recipe',
                          return_value='Creating recipe for flow_2'):
            result = _chat(self.client, 'Next flow', prompt_id='99031')
        self.assertEqual(result.get('Agent_status'), 'Review Mode')

    # ------------------------------------------------------------------
    # Test 13: JSON + all recipes → Reuse (chat_agent)
    # ------------------------------------------------------------------
    def test_json_all_recipes_routes_to_reuse(self):
        """JSON + all recipe files → reuse mode (chat_agent called)."""
        self._write_agent_files('99032', with_recipe=True,
                                num_flows=2, all_recipes=True)

        with patch.object(self._hie, 'chat_agent',
                          return_value='Hello from your agent!') as mock_ca:
            result = _chat(self.client, 'Hey agent', prompt_id='99032')
        mock_ca.assert_called()

    # ------------------------------------------------------------------
    # Test 14: Agent JSON schema validation
    # ------------------------------------------------------------------
    def test_agent_json_schema(self):
        """Agent JSON must have required fields for recipe() compatibility."""
        config = self._write_agent_files('99033')
        required_fields = ['name', 'goal', 'flows', 'personas',
                           'prompt_id', 'creator_user_id']
        for field in required_fields:
            self.assertIn(field, config,
                          f"Agent config missing required field: {field}")

        # Flows must have proper action format (dicts, not strings)
        for flow in config['flows']:
            self.assertIn('actions', flow)
            for action in flow['actions']:
                self.assertIsInstance(action, dict,
                                     f"Action must be dict: {action}")
                self.assertIn('action', action)
                self.assertIn('action_id', action)


# ===================================================================
# prompt_id Validation Tests
# ===================================================================

class TestAgentPipelinePromptIdValidation(_AgentPipelineTestBase):
    """Test prompt_id validation and security."""

    # ------------------------------------------------------------------
    # Test 15: Path traversal in prompt_id is rejected
    # ------------------------------------------------------------------
    def test_path_traversal_rejected(self):
        """prompt_id with path traversal chars should be rejected."""
        resp = self.client.post('/chat', json={
            'prompt': 'Hello',
            'user_id': 'test_user_sec',
            'prompt_id': '../../../etc/passwd',
        })
        self.assertEqual(resp.status_code, 400)
        data = resp.get_json() or {}
        self.assertIn('error', data)

    # ------------------------------------------------------------------
    # Test 16: Valid numeric prompt_ids pass regex validation
    # ------------------------------------------------------------------
    @patch(MOCK_GATHER, return_value='{}')
    @patch(MOCK_POOLED_GET, side_effect=Exception("DB unavailable"))
    def test_valid_numeric_prompt_id(self, _, __):
        """Numeric prompt_ids should pass validation (not 400)."""
        resp = self.client.post('/chat', json={
            'prompt': 'Hello',
            'user_id': 'test_user_sec',
            'prompt_id': '12345',
            'create_agent': True,
        })
        self.assertNotEqual(resp.status_code, 400)

    # ------------------------------------------------------------------
    # Test 17: Alphanumeric prompt_ids with hyphens/underscores accepted
    # ------------------------------------------------------------------
    def test_valid_alphanum_prompt_id(self):
        """Alphanumeric prompt_ids should pass the regex filter."""
        # Non-numeric prompt_id won't trigger agent creation routing,
        # but should pass the regex validation (not 400)
        resp = self.client.post('/chat', json={
            'prompt': 'Hello',
            'user_id': 'test_user_sec',
            'prompt_id': 'abc-123_test',
        })
        self.assertNotEqual(resp.status_code, 400)


# ===================================================================
# GET /prompts Tests
# ===================================================================

class TestAgentPipelinePromptsEndpoint(_AgentPipelineTestBase):
    """Test GET /prompts endpoint."""

    def _write_agent(self, prompt_id, user_id='test_user_list'):
        """Write agent JSON to the current PROMPTS_DIR (temp dir from setUp)."""
        config = {
            'status': 'completed',
            'name': f'Agent {prompt_id}',
            'goal': f'Goal for {prompt_id}',
            'creator_user_id': user_id,
            'flows': [{'flow_name': 'main'}],
        }
        # Parent setUp redirects lgapi.PROMPTS_DIR to a temp dir
        prompts_dir = self.lgapi.PROMPTS_DIR
        os.makedirs(prompts_dir, exist_ok=True)
        path = os.path.join(prompts_dir, f'{prompt_id}.json')
        with open(path, 'w') as f:
            json.dump(config, f)

    # ------------------------------------------------------------------
    # Test 18: GET /prompts requires user_id
    # ------------------------------------------------------------------
    def test_prompts_requires_user_id(self):
        """GET /prompts without user_id should return 400."""
        resp = self.client.get('/prompts')
        self.assertEqual(resp.status_code, 400)

    # ------------------------------------------------------------------
    # Test 19: GET /prompts returns user's agents
    # ------------------------------------------------------------------
    def test_prompts_returns_agents(self):
        """GET /prompts should return agents created by the user."""
        self._write_agent('88001')
        self._write_agent('88002')

        resp = self.client.get('/prompts?user_id=test_user_list')
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIsInstance(data, list)
        ids = {str(p['prompt_id']) for p in data}
        self.assertIn('88001', ids)
        self.assertIn('88002', ids)

    # ------------------------------------------------------------------
    # Test 20: GET /prompts filters by user_id
    # ------------------------------------------------------------------
    def test_prompts_filters_by_user(self):
        """GET /prompts should only return agents for the given user_id."""
        self._write_agent('88003', user_id='user_a')
        self._write_agent('88004', user_id='user_b')

        resp = self.client.get('/prompts?user_id=user_a')
        data = resp.get_json()
        user_a_agents = [p for p in data if str(p['prompt_id']) in ('88003', '88004')]
        for agent in user_a_agents:
            if str(agent['prompt_id']) == '88004':
                self.fail("user_b's agent should not appear for user_a")


# ===================================================================
# State Cleanup Tests
# ===================================================================

class TestAgentPipelineStateCleanup(_AgentPipelineTestBase):
    """Test TTL-based cleanup of stale agent state."""

    # ------------------------------------------------------------------
    # Test 21: Stale agents cleaned after TTL
    # ------------------------------------------------------------------
    def test_stale_cleanup(self):
        """Agents not accessed in _AGENT_TTL seconds should be cleaned."""
        self.lgapi.review_agents['stale_user'] = True
        self.lgapi.conversation_agent['stale_user'] = False
        self.lgapi._agent_timestamps['stale_user'] = (
            time.time() - self.lgapi._AGENT_TTL - 10)

        self.lgapi._cleanup_stale_agents()

        self.assertNotIn('stale_user', self.lgapi.review_agents)
        self.assertNotIn('stale_user', self.lgapi.conversation_agent)

    # ------------------------------------------------------------------
    # Test 22: Fresh agents survive cleanup
    # ------------------------------------------------------------------
    def test_fresh_survives_cleanup(self):
        """Recently accessed agents should not be cleaned up."""
        self.lgapi.review_agents['fresh_user'] = True
        self.lgapi.conversation_agent['fresh_user'] = False
        self.lgapi._agent_timestamps['fresh_user'] = time.time()

        self.lgapi._cleanup_stale_agents()

        self.assertIn('fresh_user', self.lgapi.review_agents)

    # ------------------------------------------------------------------
    # Test 23: Stale gather turn counters cleaned
    # ------------------------------------------------------------------
    def test_stale_turn_counter_cleanup(self):
        """Turn counters for stale users should be cleaned up."""
        self.lgapi._gather_turn_counts['stale_user_12345'] = 5
        self.lgapi._cleanup_stale_agents()
        self.assertNotIn('stale_user_12345',
                         self.lgapi._gather_turn_counts)


# ===================================================================
# End-to-End Lifecycle Test
# ===================================================================

class TestAgentPipelineEndToEnd(_AgentPipelineTestBase):
    """End-to-end lifecycle: Creation → Review → Completed → Reuse."""

    # ------------------------------------------------------------------
    # Test 24: Full lifecycle simulation
    # ------------------------------------------------------------------
    @patch(MOCK_SOCIAL_AGENT, return_value=None)
    @patch(MOCK_POOLED_POST, return_value=MagicMock(status_code=200))
    @patch(MOCK_POOLED_GET, side_effect=Exception("DB unavailable"))
    @patch(MOCK_GATHER)
    def test_full_lifecycle(self, mock_gather, _, __, ___):
        """Simulate the full agent lifecycle as a user would experience it."""
        prompt_id = '77001'

        # === Step 1: Initiate agent creation ===
        mock_gather.return_value = json.dumps({
            'status': 'pending',
            'question': 'What should the agent do?'
        })
        r1 = _chat(self.client, 'I want to create a cooking assistant',
                    prompt_id=prompt_id, create_agent=True)
        self.assertEqual(r1['Agent_status'], 'Creation Mode',
                         "Step 1: Should enter Creation Mode")

        # === Step 2: Answer questions ===
        mock_gather.return_value = json.dumps({
            'status': 'pending',
            'question': 'What cuisine types?'
        })
        r2 = _chat(self.client, 'Help plan meals and find recipes',
                    prompt_id=prompt_id, create_agent=True)
        self.assertEqual(r2['Agent_status'], 'Creation Mode',
                         "Step 2: Should stay in Creation Mode")

        # === Step 3: Complete gathering ===
        completed_config = {
            'status': 'completed',
            'name': 'CookBot',
            'agent_name': 'cook.bot',
            'goal': 'Help plan meals and find recipes',
            'broadcast_agent': 'no',
            'personas': [{'name': 'Chef', 'description': 'A cooking expert'}],
            'flows': [{
                'flow_name': 'main',
                'persona': 'Chef',
                'actions': [{'action': 'Find recipe', 'action_id': 'find_1',
                              'status': 'pending'}],
                'sub_goal': 'Help user cook meals'
            }],
        }
        mock_gather.return_value = json.dumps(completed_config)
        r3 = _chat(self.client, 'Italian and Indian cuisine',
                    prompt_id=prompt_id, create_agent=True)
        self.assertEqual(r3['Agent_status'], 'Review Mode',
                         "Step 3: Should transition to Review Mode")

        json_path = os.path.join(self.temp_dir, f'{prompt_id}.json')
        self.assertTrue(os.path.isfile(json_path))

        # === Step 4: Review phase ===
        with patch.object(self._hie, 'recipe',
                          return_value='Reviewing: Find recipe'):
            r4 = _chat(self.client, 'Yes, review it',
                        prompt_id=prompt_id)
        self.assertEqual(r4['Agent_status'], 'Review Mode')

        # === Step 5: Recipe completes ===
        with patch.object(self._hie, 'recipe',
                          return_value='Agent Created Successfully'):
            r5 = _chat(self.client, 'Approve all',
                        prompt_id=prompt_id)
        self.assertEqual(r5['Agent_status'], 'completed')

        # === Step 6: Reuse after restart ===
        self.lgapi.review_agents.clear()
        self.lgapi.conversation_agent.clear()

        recipe_path = os.path.join(self.temp_dir,
                                    f'{prompt_id}_0_recipe.json')
        with open(recipe_path, 'w') as f:
            json.dump({'recipe': 'test'}, f)

        with patch.object(self._hie, 'chat_agent',
                          return_value='Hello! I am CookBot.') as mock_ca:
            r6 = _chat(self.client, 'Suggest a dinner recipe',
                        prompt_id=prompt_id)
        mock_ca.assert_called()
        self.assertIn('CookBot', r6.get('response', ''))

    # ------------------------------------------------------------------
    # Test 25: List-of-dicts LLM response handling
    # ------------------------------------------------------------------
    @patch(MOCK_POOLED_POST, return_value=MagicMock(status_code=200))
    @patch(MOCK_POOLED_GET, side_effect=Exception("DB unavailable"))
    @patch(MOCK_GATHER)
    def test_lifecycle_list_response_handling(self, mock_gather, _, __):
        """LLM returns list of dicts — should extract last completed dict."""
        list_response = [
            {'status': 'pending', 'question': 'First question'},
            {'status': 'completed', 'name': 'ListBot',
             'agent_name': 'list.bot', 'goal': 'Handle lists',
             'broadcast_agent': 'no',
             'personas': [{'name': 'Bot', 'description': 'A bot'}],
             'flows': [{'flow_name': 'main', 'persona': 'Bot',
                         'actions': [{'action': 'Process',
                                       'action_id': 'p_1',
                                       'status': 'pending'}],
                         'sub_goal': 'Process data'}]},
        ]
        mock_gather.return_value = json.dumps(list_response)

        result = _chat(self.client, 'Create list handler',
                       prompt_id='77002', create_agent=True)
        self.assertEqual(result.get('Agent_status'), 'Review Mode')

        json_path = os.path.join(self.temp_dir, '77002.json')
        self.assertTrue(os.path.isfile(json_path))
        with open(json_path) as f:
            saved = json.load(f)
        self.assertEqual(saved['name'], 'ListBot')


# ===================================================================
# Nunba Adapter Integration Tests
# ===================================================================

@unittest.skipUnless(_can_import_hart_intelligence(),
                     "hart_intelligence not installed")
class TestNunbaAdapterIntegration(unittest.TestCase):
    """Test the Nunba adapter layer."""

    def test_adapter_imports(self):
        """Adapter module should import successfully."""
        from routes.hartos_backend_adapter import chat, get_prompts
        self.assertTrue(callable(chat))
        self.assertTrue(callable(get_prompts))

    def test_adapter_chat_signature(self):
        """chat() should accept all expected parameters."""
        import inspect

        from routes.hartos_backend_adapter import chat
        # Unwrap the @with_fallback decorator
        fn = chat.__wrapped__ if hasattr(chat, '__wrapped__') else chat
        sig = inspect.signature(fn)
        params = set(sig.parameters.keys())

        expected = {'text', 'user_id', 'agent_id', 'conversation_id',
                    'request_id', 'create_agent', 'casual_conv',
                    'video_req', 'media_request'}
        missing = expected - params - {'kwargs'}
        self.assertEqual(missing, set(),
                         f"Adapter chat() missing params: {missing}")

    def test_adapter_payload_mapping(self):
        """Adapter should map text→prompt, agent_id→prompt_id in payload."""
        import inspect

        from routes.hartos_backend_adapter import chat
        fn = chat.__wrapped__ if hasattr(chat, '__wrapped__') else chat
        source = inspect.getsource(fn)
        self.assertIn('"prompt": text', source)
        self.assertIn('"prompt_id"', source)

    def test_adapter_has_autonomous_param(self):
        """Adapter chat() should forward autonomous flag (MEDIUM bug fix)."""
        import inspect

        from routes.hartos_backend_adapter import chat
        fn = chat.__wrapped__ if hasattr(chat, '__wrapped__') else chat
        sig = inspect.signature(fn)
        params = set(sig.parameters.keys())
        self.assertIn('autonomous', params,
                      "Adapter must forward 'autonomous' to backend")


# ===================================================================
# Chatbot Routes Intent Detection Tests
# ===================================================================

class TestNunbaChatbotRoutesIntentDetection(unittest.TestCase):
    """Test chatbot_routes.py agent creation intent detection."""

    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, PROJ_ROOT)
        from routes.chatbot_routes import _detect_create_agent_intent
        cls._detect_fn = staticmethod(_detect_create_agent_intent)

    def _detect(self, text):
        return self._detect_fn(text)

    def test_positive_intent_create_agent(self):
        """Should detect 'create an agent' phrases."""
        self.assertTrue(self._detect('create an agent for me'))
        self.assertTrue(self._detect('I want to create a new agent'))
        self.assertTrue(self._detect('build an agent that tracks fitness'))

    def test_positive_intent_new_agent(self):
        """Should detect 'new agent' phrase."""
        self.assertTrue(self._detect('I need a new agent'))

    def test_negative_no_pattern(self):
        """Should NOT detect when no pattern matches."""
        self.assertFalse(self._detect('hello how are you'))
        self.assertFalse(self._detect('tell me about agents'))
        self.assertFalse(self._detect('what is an agent'))

    def test_negative_negated(self):
        """Should NOT detect negated creation intent."""
        self.assertFalse(self._detect("don't create an agent"))
        self.assertFalse(self._detect("do not create agent"))
        self.assertFalse(self._detect("stop create agent"))


if __name__ == '__main__':
    unittest.main(verbosity=2)
