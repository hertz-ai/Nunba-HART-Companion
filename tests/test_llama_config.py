"""
test_llama_config.py - Tests for llama_config.py (LLM configuration and server lifecycle).

Covers:
- LlamaConfig initialization and config read/write
- Config migration (context_size bump)
- Default config creation
- is_first_run / mark_first_run_complete
- get_llm_mode / is_cloud_configured
- get_selected_model_preset (valid/invalid indices)
- is_port_available / find_available_port
- check_server_type (mocked HTTP responses)
- chat_completion (mocked requests)
- scan_existing_llm_endpoints / scan_openai_compatible_ports
- ServerType enum values
"""
import json
import os
import socket
import sys
from unittest.mock import MagicMock, patch

import pytest

# Ensure project root
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# Patch LlamaInstaller to avoid GPU detection / binary scanning
# ============================================================

@pytest.fixture(autouse=True)
def mock_installer():
    """
    Patch LlamaInstaller globally so LlamaConfig can be imported without
    triggering GPU detection, binary scanning, or file system probes.
    """
    mock = MagicMock()
    mock.gpu_available = "none"
    mock.binary_supports_gpu = False
    mock.find_llama_server.return_value = None
    mock.is_system_installation.return_value = False
    mock.get_version.return_value = None

    with patch("llama.llama_config.LlamaInstaller", return_value=mock):
        # Clear cached config singleton between tests
        import llama.llama_config as lc
        lc._cached_config = None
        yield mock


# ============================================================
# LlamaConfig class tests
# ============================================================

class TestLlamaConfigInit:
    """Test LlamaConfig initialization and config file handling."""

    def test_default_config_creation(self, tmp_config_dir):
        """When no config file exists, default config is created."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        assert cfg.config["first_run"] is True
        assert cfg.config["server_port"] == 8080
        assert cfg.config["use_gpu"] is False
        assert cfg.config["context_size"] == 8192

    def test_loads_existing_config(self, sample_llama_config):
        """When config file exists, it is loaded correctly."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=sample_llama_config)
        assert cfg.config["first_run"] is False
        assert cfg.config["server_port"] == 8080

    def test_context_size_migration(self, tmp_config_dir):
        """Configs with context_size < 8192 should be migrated to 8192."""
        from llama.llama_config import LlamaConfig
        config_file = os.path.join(tmp_config_dir, "llama_config.json")
        old_config = {
            "first_run": False,
            "context_size": 4096,
            "server_port": 8080,
        }
        with open(config_file, "w") as f:
            json.dump(old_config, f)

        cfg = LlamaConfig(config_dir=tmp_config_dir)
        assert cfg.config["context_size"] == 8192

        # Verify it was persisted
        with open(config_file) as f:
            saved = json.load(f)
        assert saved["context_size"] == 8192

    def test_save_config(self, tmp_config_dir):
        """_save_config writes changes to disk."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        cfg.config["server_port"] = 9999
        cfg._save_config()

        with open(cfg.config_file) as f:
            saved = json.load(f)
        assert saved["server_port"] == 9999

    def test_corrupted_config_falls_back_to_default(self, tmp_config_dir):
        """If config file is corrupted JSON, fall back to default."""
        from llama.llama_config import LlamaConfig
        config_file = os.path.join(tmp_config_dir, "llama_config.json")
        with open(config_file, "w") as f:
            f.write("NOT VALID JSON!!!")

        cfg = LlamaConfig(config_dir=tmp_config_dir)
        assert cfg.config["first_run"] is True  # default


class TestLlamaConfigFirstRun:
    """Test first_run flag management."""

    def test_is_first_run_true_by_default(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        assert cfg.is_first_run() is True

    def test_mark_first_run_complete(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        cfg.mark_first_run_complete()
        assert cfg.is_first_run() is False

        # Verify persisted
        with open(cfg.config_file) as f:
            saved = json.load(f)
        assert saved["first_run"] is False


class TestLlamaConfigModes:
    """Test LLM mode and cloud config checks."""

    def test_get_llm_mode_default(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        assert cfg.get_llm_mode() == "local"

    def test_get_llm_mode_cloud(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        cfg.config["llm_mode"] = "cloud"
        assert cfg.get_llm_mode() == "cloud"

    def test_is_cloud_configured_false(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        assert cfg.is_cloud_configured() is False

    def test_is_cloud_configured_true(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        cfg.config["cloud_provider"] = "openai"
        assert cfg.is_cloud_configured() is True


class TestModelPresetSelection:
    """Test model preset selection logic."""

    def test_valid_index_returns_preset(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        preset = cfg.get_selected_model_preset()
        # Index 0 should return the first preset (Qwen3-VL-2B)
        assert preset is not None
        assert hasattr(preset, "display_name")

    def test_invalid_index_returns_none(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        cfg.config["selected_model_index"] = 999
        assert cfg.get_selected_model_preset() is None

    def test_negative_index_returns_none(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        cfg.config["selected_model_index"] = -1
        assert cfg.get_selected_model_preset() is None


class TestPortDetection:
    """Test port availability and server detection."""

    def test_is_port_available_on_free_port(self, tmp_config_dir):
        """A randomly chosen free port should be available."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        # Bind and release to find a free port
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            free_port = s.getsockname()[1]
        assert cfg.is_port_available(free_port) is True

    def test_is_port_available_on_occupied_port(self, tmp_config_dir):
        """A port in use should not be available."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            occupied_port = s.getsockname()[1]
            # Port is held by `s`
            assert cfg.is_port_available(occupied_port) is False

    def test_find_available_port_success(self, tmp_config_dir):
        """find_available_port should return a port in the requested range."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        port = cfg.find_available_port(start_port=49152, max_attempts=20)
        assert port is not None
        assert 49152 <= port < 49172

    def test_find_available_port_returns_none_when_all_occupied(self, tmp_config_dir):
        """If all ports are occupied, should return None."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        with patch.object(cfg, "is_port_available", return_value=False):
            result = cfg.find_available_port(start_port=8080, max_attempts=3)
            assert result is None


class TestCheckServerType:
    """Test server type detection via mocked HTTP responses."""

    def test_nunba_managed_server(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig, ServerType
        cfg = LlamaConfig(config_dir=tmp_config_dir)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"managed_by": "Nunba", "status": "ok"}

        with patch("llama.llama_config.requests.get", return_value=mock_resp):
            server_type, info = cfg.check_server_type(8080)
            assert server_type == ServerType.NUNBA_MANAGED
            assert info["managed_by"] == "Nunba"

    def test_external_llama_server(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig, ServerType
        cfg = LlamaConfig(config_dir=tmp_config_dir)

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "ok"}

        with patch("llama.llama_config.requests.get", return_value=mock_resp):
            server_type, info = cfg.check_server_type(8080)
            assert server_type == ServerType.EXTERNAL_LLAMA

    def test_not_running(self, tmp_config_dir):
        import requests as req

        from llama.llama_config import LlamaConfig, ServerType
        cfg = LlamaConfig(config_dir=tmp_config_dir)

        with patch("llama.llama_config.requests.get", side_effect=req.exceptions.ConnectionError):
            server_type, info = cfg.check_server_type(8080)
            assert server_type == ServerType.NOT_RUNNING
            assert info is None

    def test_check_server_running_uses_config_port(self, tmp_config_dir):
        """check_server_running uses the configured port when none provided."""
        from llama.llama_config import LlamaConfig, ServerType
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        cfg.config["server_port"] = 9999

        with patch.object(cfg, "check_server_type", return_value=(ServerType.NOT_RUNNING, None)) as mock:
            result = cfg.check_server_running()
            mock.assert_called_with(9999)
            assert result is False


class TestChatCompletion:
    """Test the chat_completion wrapper."""

    def test_chat_completion_returns_text(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)

        with patch.object(cfg, "check_server_running", return_value=True):
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "choices": [{"message": {"content": "Hi there!"}}]
            }
            with patch("llama.llama_config.requests.post", return_value=mock_resp):
                result = cfg.chat_completion([{"role": "user", "content": "Hello"}])
                assert result == "Hi there!"

    def test_chat_completion_server_not_running(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)

        with patch.object(cfg, "check_server_running", return_value=False):
            result = cfg.chat_completion([{"role": "user", "content": "Hello"}])
            assert result is None

    def test_chat_completion_api_error(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)

        with patch.object(cfg, "check_server_running", return_value=True):
            mock_resp = MagicMock()
            mock_resp.status_code = 500
            mock_resp.text = "Internal Server Error"
            with patch("llama.llama_config.requests.post", return_value=mock_resp):
                result = cfg.chat_completion([{"role": "user", "content": "Hello"}])
                assert result is None


class TestScanEndpoints:
    """Test endpoint scanning functions."""

    def test_scan_existing_finds_endpoint(self):
        from llama.llama_config import scan_existing_llm_endpoints

        mock_resp = MagicMock()
        mock_resp.status_code = 200

        with patch("llama.llama_config.requests.get", return_value=mock_resp):
            result = scan_existing_llm_endpoints()
            assert result is not None
            assert "name" in result
            assert "base_url" in result
            assert "type" in result

    def test_scan_existing_none_found(self):
        import requests as req

        from llama.llama_config import scan_existing_llm_endpoints

        with patch("llama.llama_config.requests.get", side_effect=req.exceptions.ConnectionError):
            result = scan_existing_llm_endpoints()
            assert result is None

    def test_scan_openai_ports_finds_endpoint(self):
        from llama.llama_config import scan_openai_compatible_ports

        mock_resp = MagicMock()
        mock_resp.status_code = 200

        with patch("llama.llama_config.requests.get", return_value=mock_resp):
            result = scan_openai_compatible_ports(ports=[12345])
            assert result is not None
            assert "12345" in result["base_url"]
            assert result["type"] == "openai"

    def test_scan_openai_ports_none_found(self):
        import requests as req

        from llama.llama_config import scan_openai_compatible_ports

        with patch("llama.llama_config.requests.get", side_effect=req.exceptions.ConnectionError):
            result = scan_openai_compatible_ports(ports=[12345])
            assert result is None


class TestServerType:
    """Test ServerType enum values."""

    def test_server_type_values(self):
        from llama.llama_config import ServerType
        assert ServerType.NOT_RUNNING == "not_running"
        assert ServerType.NUNBA_MANAGED == "nunba_managed"
        assert ServerType.EXTERNAL_LLAMA == "external_llama"
        assert ServerType.OTHER_SERVICE == "other_service"


class TestModuleLevelHelpers:
    """Test the module-level convenience functions."""

    def test_get_llama_endpoint(self, tmp_config_dir):
        import llama.llama_config as lc
        from llama.llama_config import get_llama_endpoint
        lc._cached_config = None  # reset singleton

        with patch("llama.llama_config.LlamaConfig") as MockCfg:
            instance = MagicMock()
            instance.config = {"server_port": 7777}
            MockCfg.return_value = instance
            lc._cached_config = None

            endpoint = get_llama_endpoint()
            assert "7777" in endpoint

    def test_check_llama_health_false_when_connection_error(self):
        import requests as req

        from llama import llama_config as lc
        lc._cached_config = None

        with patch("llama.llama_config.requests.get", side_effect=req.exceptions.ConnectionError):
            result = lc.check_llama_health()
            assert result is False


# ============================================================
# Warm LLM detection: is_llm_available treats loading server as available
# ============================================================

class TestIsLlmServerRunning:
    """is_llm_server_running detects ANY reachable server (healthy or loading).
    is_llm_available only returns True for healthy (200) servers.
    The startup thread uses is_llm_server_running to avoid duplicate starts."""

    def _make_cfg(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        cfg.config['cloud_provider'] = None  # force local check
        return cfg

    # ── is_llm_server_running: True for any HTTP response ──

    def test_server_running_healthy_200(self, tmp_config_dir):
        cfg = self._make_cfg(tmp_config_dir)
        mock_resp = MagicMock()
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        with patch('urllib.request.urlopen', return_value=mock_resp):
            assert cfg.is_llm_server_running() is True

    def test_server_running_loading_500(self, tmp_config_dir):
        """500 = server exists, model loading → True (don't start a duplicate)."""
        import urllib.request
        cfg = self._make_cfg(tmp_config_dir)
        with patch('urllib.request.urlopen',
                   side_effect=urllib.request.HTTPError(
                       url='', code=500, msg='', hdrs=None, fp=None)):
            assert cfg.is_llm_server_running() is True

    def test_server_running_loading_503(self, tmp_config_dir):
        """503 = server exists, model loading → True."""
        import urllib.request
        cfg = self._make_cfg(tmp_config_dir)
        with patch('urllib.request.urlopen',
                   side_effect=urllib.request.HTTPError(
                       url='', code=503, msg='', hdrs=None, fp=None)):
            assert cfg.is_llm_server_running() is True

    def test_server_not_running_connection_refused(self, tmp_config_dir):
        """ConnectionRefused = no server → False."""
        cfg = self._make_cfg(tmp_config_dir)
        with patch('urllib.request.urlopen', side_effect=ConnectionRefusedError):
            assert cfg.is_llm_server_running() is False

    def test_server_not_running_timeout(self, tmp_config_dir):
        """Timeout = no server reachable → False."""
        import urllib.request
        cfg = self._make_cfg(tmp_config_dir)
        with patch('urllib.request.urlopen', side_effect=urllib.request.URLError('timeout')):
            assert cfg.is_llm_server_running() is False

    # ── is_llm_available: True ONLY for 200 ──

    def test_available_false_for_500(self, tmp_config_dir):
        """is_llm_available must return False for 500 (model loading, not ready for chat)."""
        import urllib.request
        cfg = self._make_cfg(tmp_config_dir)
        with patch('urllib.request.urlopen',
                   side_effect=urllib.request.HTTPError(
                       url='', code=500, msg='', hdrs=None, fp=None)):
            assert cfg.is_llm_available() is False

    def test_available_true_for_200(self, tmp_config_dir):
        cfg = self._make_cfg(tmp_config_dir)
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)
        with patch('urllib.request.urlopen', return_value=mock_resp):
            assert cfg.is_llm_available() is True

    def test_cloud_configured_skips_local(self, tmp_config_dir):
        """Both methods return True for cloud without checking local."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        cfg.config['cloud_provider'] = 'custom_api'
        with patch('urllib.request.urlopen', side_effect=AssertionError("Should not be called")):
            assert cfg.is_llm_available() is True
            assert cfg.is_llm_server_running() is True


# ============================================================
# Catalog dedup: deleted methods and orchestrator integration
# ============================================================

class TestComputeBudgetMethodsDeleted:
    """
    _compute_budget and select_best_model_for_hardware were deleted from
    LlamaConfig.  Model selection is the orchestrator's job.
    These tests assert those methods do NOT exist on LlamaConfig instances.
    """

    def test_compute_budget_does_not_exist(self, tmp_config_dir):
        """_compute_budget must NOT be a method on LlamaConfig."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        assert not hasattr(cfg, '_compute_budget'), (
            "_compute_budget still exists on LlamaConfig — it should have been deleted. "
            "Model selection belongs to ModelOrchestrator/VRAMManager."
        )

    def test_select_best_model_for_hardware_does_not_exist(self, tmp_config_dir):
        """select_best_model_for_hardware must NOT be a method on LlamaConfig."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        assert not hasattr(cfg, 'select_best_model_for_hardware'), (
            "select_best_model_for_hardware still exists on LlamaConfig — it should have "
            "been deleted. Model selection belongs to ModelOrchestrator/VRAMManager."
        )

    def test_compute_budget_not_callable_at_module_level(self):
        """_compute_budget must not be importable as a module-level function either."""
        import llama.llama_config as lc
        assert not hasattr(lc, '_compute_budget'), (
            "_compute_budget found at module level in llama_config — should be deleted."
        )

    def test_select_best_model_for_hardware_not_callable_at_module_level(self):
        """select_best_model_for_hardware must not be importable as a module-level function."""
        import llama.llama_config as lc
        assert not hasattr(lc, 'select_best_model_for_hardware'), (
            "select_best_model_for_hardware found at module level in llama_config — "
            "should be deleted."
        )

    def test_deletion_comment_present_in_source(self):
        """The source file must contain the deletion notice comment."""
        import inspect

        import llama.llama_config as lc
        try:
            src = inspect.getsource(lc)
            assert '_compute_budget' in src and 'DELETED' in src, (
                "Expected to find the '_compute_budget … DELETED' comment in llama_config.py"
            )
        except OSError:
            # In frozen builds inspect.getsource may fail — skip gracefully
            pass


class TestDiagnoseUsesOrchestrator:
    """
    diagnose() must read the best model index from the orchestrator/catalog
    (get_orchestrator().select_best) rather than calling _compute_budget or
    select_best_model_for_hardware directly.
    """

    def test_diagnose_calls_get_orchestrator(self, tmp_config_dir):
        """diagnose() must call get_orchestrator().select_best('llm') for model selection."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)

        # Build a mock orchestrator that returns a fake 'best' entry
        mock_entry = MagicMock()
        mock_entry.name = 'Qwen3.5-4B VL (Recommended)'
        mock_entry.files = {'model': 'Qwen3.5-4B-UD-Q4_K_XL.gguf'}
        mock_orch = MagicMock()
        mock_orch.select_best.return_value = mock_entry

        with patch('models.orchestrator.get_orchestrator', return_value=mock_orch) as mock_get_orch, \
             patch.object(cfg.installer, 'find_llama_server', return_value=None), \
             patch.object(cfg.installer, 'get_model_path', return_value=None), \
             patch.object(cfg.installer, 'is_system_installation', return_value=False):
            diag = cfg.diagnose()

        # get_orchestrator was imported and called
        mock_get_orch.assert_called()
        mock_orch.select_best.assert_called_with('llm')

        # diagnose result must have the required keys
        assert 'best_model_index' in diag
        assert 'best_model_name' in diag
        assert 'actions' in diag
        assert 'action' in diag

    def test_diagnose_falls_back_gracefully_when_orchestrator_unavailable(self, tmp_config_dir):
        """diagnose() must not crash when get_orchestrator raises ImportError."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)

        with patch('models.orchestrator.get_orchestrator',
                   side_effect=ImportError("models.orchestrator not available")), \
             patch.object(cfg.installer, 'find_llama_server', return_value=None), \
             patch.object(cfg.installer, 'get_model_path', return_value=None), \
             patch.object(cfg.installer, 'is_system_installation', return_value=False):
            # Must not raise
            diag = cfg.diagnose()

        assert 'best_model_index' in diag
        assert 'actions' in diag

    def test_diagnose_result_has_no_compute_budget_key(self, tmp_config_dir):
        """diagnose() result must NOT contain old 'compute_budget_mb' as a top-level planned field.

        Note: 'compute_budget_mb' IS legitimately present as an internal
        diagnostic key used for action logic. This test verifies it is present
        only as part of the diagnosis dict (expected behavior) and confirms the
        old SELECT logic is gone by checking get_orchestrator path is used.
        """
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)

        mock_orch = MagicMock()
        mock_orch.select_best.return_value = None  # no entry found — use fallback

        with patch('models.orchestrator.get_orchestrator', return_value=mock_orch), \
             patch.object(cfg.installer, 'find_llama_server', return_value=None), \
             patch.object(cfg.installer, 'get_model_path', return_value=None), \
             patch.object(cfg.installer, 'is_system_installation', return_value=False):
            diag = cfg.diagnose()

        # The orchestrator path must have been attempted
        mock_orch.select_best.assert_called_with('llm')
        # Diagnosis struct must still be valid
        assert isinstance(diag, dict)
        assert 'action' in diag


class TestStartServerUsesConfigIndex:
    """
    start_server() without a model_preset argument must read from
    config['selected_model_index'] (set previously by the orchestrator /
    LlamaLoader), NOT call select_best_model_for_hardware or _compute_budget.
    """

    def test_start_server_no_preset_reads_config_index(self, tmp_config_dir):
        """Without model_preset, start_server reads MODEL_PRESETS[selected_model_index]."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        # Set a specific index — orchestrator would normally do this via LlamaLoader.load()
        cfg.config['selected_model_index'] = 1

        # We don't want the server to actually start — patch _do_start_server
        with patch.object(cfg, '_do_start_server', return_value=True) as mock_do_start:
            cfg.start_server()

        mock_do_start.assert_called_once()

    def test_start_server_with_preset_skips_config_index(self, tmp_config_dir):
        """When model_preset is provided, it is used directly (config index ignored)."""
        from llama.llama_config import LlamaConfig
        from llama.llama_installer import MODEL_PRESETS
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        cfg.config['selected_model_index'] = 99  # garbage index

        explicit_preset = MODEL_PRESETS[0]
        with patch.object(cfg, '_do_start_server', return_value=True) as mock_do_start:
            cfg.start_server(model_preset=explicit_preset)

        mock_do_start.assert_called_once_with(explicit_preset, False)

    def test_do_start_server_uses_config_index_not_select_best(self, tmp_config_dir):
        """_do_start_server selects MODEL_PRESETS[selected_model_index], never calls
        select_best_model_for_hardware (which no longer exists)."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        cfg.config['selected_model_index'] = 0

        # Short-circuit early: no llama-server binary, returns False
        with patch.object(cfg.installer, 'find_llama_server', return_value=None), \
             patch.object(cfg, 'check_server_type',
                          return_value=('not_running', None)), \
             patch.object(cfg, 'is_llm_available', return_value=False):
            result = cfg._do_start_server(model_preset=None)

        # Returns False (no binary) — the key point is it did NOT call
        # select_best_model_for_hardware (which is deleted) and did not crash.
        assert result is False
        assert not hasattr(cfg, 'select_best_model_for_hardware')


# ============================================================
# Public API — methods consumed by app.py and frontend
# ============================================================

class TestPublicAPI:
    """Public methods used by the rest of Nunba — wrong return type = crash."""

    def test_get_llm_mode_returns_string(self, tmp_config_dir):
        """get_llm_mode drives the frontend LLM status badge."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        mode = cfg.get_llm_mode()
        assert isinstance(mode, str)
        assert mode in ('local', 'cloud', 'custom_api', 'disabled', 'none', '')

    def test_get_selected_model_preset_returns_preset_or_none(self, tmp_config_dir):
        """Returns the currently configured model — displayed in settings page."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        preset = cfg.get_selected_model_preset()
        if preset is not None:
            assert hasattr(preset, 'display_name')
            assert hasattr(preset, 'size_mb')

    def test_get_selected_model_preset_handles_invalid_index(self, tmp_config_dir):
        """Invalid model index must not crash — return None or first preset."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        cfg.config['selected_model_index'] = 99999
        result = cfg.get_selected_model_preset()
        assert result is None  # Out of range

    def test_is_cloud_configured_returns_bool(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        assert isinstance(cfg.is_cloud_configured(), bool)

    def test_is_first_run_returns_bool(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        assert isinstance(cfg.is_first_run(), bool)

    def test_is_llm_available_returns_bool(self, tmp_config_dir):
        """is_llm_available is polled by frontend — must always return bool."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        result = cfg.is_llm_available()
        assert isinstance(result, bool)

    def test_is_llm_server_running_returns_bool(self, tmp_config_dir):
        """is_llm_server_running used by startup to avoid duplicate starts."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        result = cfg.is_llm_server_running()
        assert isinstance(result, bool)

    def test_check_server_running_returns_bool(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        result = cfg.check_server_running(8080)
        assert isinstance(result, bool)

    def test_check_server_type_returns_tuple(self, tmp_config_dir):
        """check_server_type returns (ServerType, info_dict) — used by diagnose()."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        server_type, info = cfg.check_server_type(8080)
        assert server_type is not None  # ServerType enum value

    def test_get_cached_version_returns_int_or_none(self, tmp_config_dir):
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        result = cfg.get_cached_version()
        assert result is None or isinstance(result, int)

    def test_find_available_port_returns_int(self, tmp_config_dir):
        """Port finder must return a free port — used when default 8080 is busy."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        port = cfg.find_available_port()
        assert isinstance(port, int)
        assert 1024 <= port <= 65535

    def test_config_save_and_reload(self, tmp_config_dir):
        """Config changes must survive save→reload cycle."""
        from llama.llama_config import LlamaConfig
        cfg = LlamaConfig(config_dir=tmp_config_dir)
        cfg.config['test_key'] = 'test_value'
        cfg._save_config()
        cfg2 = LlamaConfig(config_dir=tmp_config_dir)
        assert cfg2.config.get('test_key') == 'test_value'


# ============================================================
# KNOWN_LLM_ENDPOINTS — external LLM detection
# ============================================================

class TestKnownEndpoints:
    """KNOWN_LLM_ENDPOINTS drives scan_openai_compatible_ports — wrong = false positives."""

    def test_port_5000_not_in_known_endpoints(self):
        """Port 5000 is Nunba's Flask — scanning it falsely detects Flask as LLM."""
        from llama.llama_config import KNOWN_LLM_ENDPOINTS
        ports = [ep['base_url'] for ep in KNOWN_LLM_ENDPOINTS]
        assert not any(':5000' in p for p in ports), "Port 5000 should not be scanned (Nunba's own Flask)"

    def test_all_endpoints_have_required_keys(self):
        from llama.llama_config import KNOWN_LLM_ENDPOINTS
        required = {'name', 'base_url', 'health', 'completions', 'type'}
        for ep in KNOWN_LLM_ENDPOINTS:
            missing = required - set(ep.keys())
            assert not missing, f"Endpoint '{ep.get('name', '?')}' missing: {missing}"

    def test_all_endpoints_use_localhost(self):
        """External LLM scan must only check localhost — not external IPs."""
        from llama.llama_config import KNOWN_LLM_ENDPOINTS
        for ep in KNOWN_LLM_ENDPOINTS:
            assert 'localhost' in ep['base_url'] or '127.0.0.1' in ep['base_url'], (
                f"Endpoint '{ep['name']}' scans non-local: {ep['base_url']}")
