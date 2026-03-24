"""
test_language_bootstrap.py - Tests for models/language_bootstrap.py

Tests the AI bootstrapper that sets up LLM/TTS/STT on first run.
Each test verifies a specific user-facing behavior or system guarantee:

FT: Bootstrap state machine (idle→detecting→planning→running→done),
    hardware detection fallback, model selection per language,
    optional model skipping on low VRAM, status API shape.
NFT: Thread safety of singleton state, concurrent start_bootstrap calls,
     graceful degradation when orchestrator unavailable, phase never stalls.
"""
import os
import sys
import threading
import time
from unittest.mock import MagicMock, patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# BootstrapStep / BootstrapState — data integrity
# ============================================================

class TestBootstrapDataclasses:
    """Validate the data structures polled by the frontend."""

    def test_step_default_status_is_pending(self):
        """New steps must start as 'pending' — frontend renders a grey dot."""
        from models.language_bootstrap import BootstrapStep
        step = BootstrapStep(model_type='llm')
        assert step.status == 'pending'

    def test_state_default_phase_is_idle(self):
        """Initial state must be 'idle' — frontend shows 'Ready to set up'."""
        from models.language_bootstrap import BootstrapState
        state = BootstrapState()
        assert state.phase == 'idle'

    def test_state_to_dict_has_all_frontend_keys(self):
        """Frontend parses these keys — missing ones break the setup wizard."""
        from models.language_bootstrap import BootstrapState
        state = BootstrapState(language='ta', phase='running', started_at=time.time())
        d = state.to_dict()
        required = {'language', 'phase', 'gpu_name', 'vram_total_gb', 'vram_free_gb',
                    'steps', 'error', 'elapsed_s'}
        missing = required - set(d.keys())
        assert not missing, f"Missing frontend keys: {missing}"

    def test_state_elapsed_s_is_numeric(self):
        """elapsed_s is displayed as '12.3s' in the UI — must be a number, not string."""
        from models.language_bootstrap import BootstrapState
        state = BootstrapState(started_at=time.time() - 5)
        d = state.to_dict()
        assert isinstance(d['elapsed_s'], (int, float))
        assert d['elapsed_s'] >= 4  # at least 4s passed

    def test_state_elapsed_zero_when_not_started(self):
        from models.language_bootstrap import BootstrapState
        state = BootstrapState()
        assert state.to_dict()['elapsed_s'] == 0

    def test_step_to_dict_includes_run_mode(self):
        """Frontend shows 'GPU' or 'CPU' badge — run_mode must be in the step dict."""
        from models.language_bootstrap import BootstrapState, BootstrapStep
        state = BootstrapState()
        state.steps['llm'] = BootstrapStep(model_type='llm', run_mode='gpu')
        d = state.to_dict()
        assert d['steps']['llm']['run_mode'] == 'gpu'


# ============================================================
# get_status — API endpoint data
# ============================================================

class TestGetStatus:
    """get_status() is called by /api/ai/bootstrap/status every 2 seconds."""

    def test_returns_dict(self):
        from models.language_bootstrap import get_status
        result = get_status()
        assert isinstance(result, dict)

    def test_includes_phase(self):
        from models.language_bootstrap import get_status
        result = get_status()
        assert 'phase' in result

    def test_thread_safe_concurrent_reads(self):
        """Multiple frontend tabs polling simultaneously must not crash."""
        from models.language_bootstrap import get_status
        results = []
        errors = []
        def poll():
            try:
                for _ in range(20):
                    results.append(get_status())
            except Exception as e:
                errors.append(e)
        threads = [threading.Thread(target=poll) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert not errors
        assert len(results) == 100
        assert all(isinstance(r, dict) for r in results)


# ============================================================
# Bootstrap ordering and classification
# ============================================================

class TestBootstrapConstants:
    """Validate the bootstrap pipeline configuration."""

    def test_bootstrap_order_starts_with_stt(self):
        """STT first because it's smallest — loads fastest, gives user immediate feedback."""
        from models.language_bootstrap import BOOTSTRAP_ORDER, ModelType
        assert BOOTSTRAP_ORDER[0] == ModelType.STT

    def test_llm_is_essential(self):
        """LLM is always loaded — it's the core chat functionality."""
        from models.language_bootstrap import ESSENTIAL_TYPES, ModelType
        assert ModelType.LLM in ESSENTIAL_TYPES

    def test_video_gen_is_optional(self):
        """Video generation is optional — shouldn't block basic chat on low-end machines."""
        from models.language_bootstrap import OPTIONAL_TYPES, ModelType
        assert ModelType.VIDEO_GEN in OPTIONAL_TYPES

    def test_essential_and_optional_dont_overlap(self):
        """A model type can't be both essential and optional."""
        from models.language_bootstrap import ESSENTIAL_TYPES, OPTIONAL_TYPES
        overlap = ESSENTIAL_TYPES & OPTIONAL_TYPES
        assert not overlap, f"Types in both essential and optional: {overlap}"


# ============================================================
# Hardware detection fallback
# ============================================================

class TestHardwareDetection:
    """_detect_hardware must never crash — returns CPU fallback on any failure."""

    def test_returns_dict_when_vram_manager_available(self):
        from models.language_bootstrap import _detect_hardware
        mock_gpu = {'name': 'RTX 3070', 'total_gb': 8.0, 'free_gb': 6.0, 'cuda_available': True}
        mock_vm = MagicMock()
        mock_vm.detect_gpu.return_value = mock_gpu
        mock_mod = MagicMock()
        mock_mod.vram_manager = mock_vm
        with patch.dict('sys.modules', {'integrations.service_tools.vram_manager': mock_mod}):
            result = _detect_hardware()
        assert result['name'] == 'RTX 3070'
        assert result['total_gb'] == 8.0

    def test_returns_cpu_fallback_when_vram_manager_fails(self):
        """On CPU-only machines or broken CUDA, must return a valid dict, not crash."""
        from models.language_bootstrap import _detect_hardware
        with patch.dict('sys.modules', {'integrations.service_tools.vram_manager': None}):
            result = _detect_hardware()
        assert isinstance(result, dict)
        assert result.get('cuda_available') is False


# ============================================================
# Plan creation — model selection per language
# ============================================================

class TestPlanCreation:
    """_create_plan selects the best model for each type given language + hardware."""

    def test_skips_optional_types_on_low_vram(self):
        """Users with <6GB VRAM shouldn't wait for video_gen download attempts."""
        from models.language_bootstrap import ModelType, _create_plan
        mock_orch = MagicMock()
        mock_orch.select_best.return_value = None
        mock_mod = MagicMock()
        mock_mod.get_orchestrator.return_value = mock_orch
        with patch.dict('sys.modules', {'models.orchestrator': mock_mod}):
            gpu_info = {'free_gb': 3.0, 'total_gb': 4.0}
            plan = _create_plan('en', gpu_info)
        for mt in (ModelType.AUDIO_GEN, ModelType.VIDEO_GEN):
            if mt in plan:
                assert plan[mt].status == 'skipped'

    def test_returns_empty_when_orchestrator_unavailable(self):
        """If HARTOS isn't pip-installed, plan creation returns empty — no crash."""
        from models.language_bootstrap import _create_plan
        with patch.dict('sys.modules', {'models.orchestrator': None}):
            plan = _create_plan('en', {})
        assert plan == {}

    def test_plan_includes_all_bootstrap_order_types(self):
        """Every type in BOOTSTRAP_ORDER must appear in the plan."""
        from models.language_bootstrap import BOOTSTRAP_ORDER, _create_plan
        mock_entry = MagicMock()
        mock_entry.id = 'test-model'
        mock_entry.name = 'Test'
        mock_entry.vram_gb = 2.0
        mock_orch = MagicMock()
        mock_orch.select_best.return_value = mock_entry
        mock_mod = MagicMock()
        mock_mod.get_orchestrator.return_value = mock_orch
        with patch.dict('sys.modules', {'models.orchestrator': mock_mod}):
            plan = _create_plan('en', {'free_gb': 16.0, 'total_gb': 16.0})
        for mt in BOOTSTRAP_ORDER:
            assert mt in plan, f"Missing {mt} from plan"


# ============================================================
# start_bootstrap — state machine
# ============================================================

class TestStartBootstrap:
    """start_bootstrap kicks off the pipeline and returns immediately."""

    def test_returns_dict_immediately(self):
        """Frontend needs immediate response to show the setup wizard."""
        from models.language_bootstrap import _lock, _state, start_bootstrap
        # Reset state
        with _lock:
            _state.phase = 'idle'
        with patch('models.language_bootstrap._bootstrap_worker'):
            with patch('models.language_bootstrap.threading.Thread') as mock_thread:
                mock_thread.return_value = MagicMock()
                result = start_bootstrap('en')
        assert isinstance(result, dict)
        assert result['language'] == 'en'

    def test_rejects_concurrent_start(self):
        """Double-clicking 'Setup AI' must not start two bootstrap threads."""
        from models.language_bootstrap import _lock, _state, start_bootstrap
        with _lock:
            _state.phase = 'running'
        result = start_bootstrap('en')
        # Should return current state without starting new thread
        assert result['phase'] == 'running'
        # Reset
        with _lock:
            _state.phase = 'idle'
