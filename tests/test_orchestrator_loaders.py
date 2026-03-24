"""
Tests for models/orchestrator.py — Nunba-specific loader implementations,
_entry_to_preset helper, and get_orchestrator singleton.

Complements test_model_resilience.py (which tests catalog CRUD, compute matching,
lifecycle manager, VRAM manager, and API endpoints).

Focus areas:
  - _entry_to_preset() edge cases
  - LlamaLoader load/download/is_downloaded/unload
  - TTSLoader load/download/is_downloaded
  - STTLoader load/download/is_downloaded
  - VLMLoader load
  - get_orchestrator() singleton & thread safety
  - populate_llm_presets integration
"""

import os
import sys
import threading
import unittest
from unittest.mock import MagicMock, patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from models.catalog import ModelEntry


def _make_entry(id='test-llm', model_type='llm', name='Test LLM', **kwargs):
    defaults = dict(
        files={'model': 'test-model.gguf', 'repo': 'org/repo'},
        repo_id='org/repo',
        disk_gb=4.0,
        capabilities={},
    )
    defaults.update(kwargs)
    return ModelEntry(id=id, name=name, model_type=model_type, **defaults)


# ═══════════════════════════════════════════════════════════════════════
# 1. _entry_to_preset() edge cases
# ═══════════════════════════════════════════════════════════════════════

class TestEntryToPreset(unittest.TestCase):

    def test_basic_conversion(self):
        from models.orchestrator import _entry_to_preset
        entry = _make_entry(disk_gb=4.0)
        preset = _entry_to_preset(entry)
        self.assertIsNotNone(preset)
        self.assertEqual(preset.display_name, 'Test LLM')
        self.assertEqual(preset.repo_id, 'org/repo')
        self.assertEqual(preset.file_name, 'test-model.gguf')
        self.assertEqual(preset.size_mb, 4096)
        self.assertFalse(preset.has_vision)
        self.assertIsNone(preset.mmproj_file)

    def test_missing_model_file_returns_none(self):
        from models.orchestrator import _entry_to_preset
        entry = _make_entry(files={})
        self.assertIsNone(_entry_to_preset(entry))

    def test_model_file_empty_string_returns_none(self):
        from models.orchestrator import _entry_to_preset
        entry = _make_entry(files={'model': ''})
        self.assertIsNone(_entry_to_preset(entry))

    def test_zero_disk_gb(self):
        from models.orchestrator import _entry_to_preset
        entry = _make_entry(disk_gb=0.0)
        preset = _entry_to_preset(entry)
        self.assertIsNotNone(preset)
        self.assertEqual(preset.size_mb, 0)

    def test_none_disk_gb(self):
        from models.orchestrator import _entry_to_preset
        entry = _make_entry(disk_gb=0)
        # disk_gb=0 is falsy; formula: int(round((entry.disk_gb or 0) * 1024))
        preset = _entry_to_preset(entry)
        self.assertEqual(preset.size_mb, 0)

    def test_repo_id_fallback_to_files_repo(self):
        from models.orchestrator import _entry_to_preset
        entry = _make_entry(repo_id='', files={'model': 'f.gguf', 'repo': 'fallback/repo'})
        preset = _entry_to_preset(entry)
        self.assertEqual(preset.repo_id, 'fallback/repo')

    def test_repo_id_both_empty(self):
        from models.orchestrator import _entry_to_preset
        entry = _make_entry(repo_id='', files={'model': 'f.gguf'})
        preset = _entry_to_preset(entry)
        self.assertEqual(preset.repo_id, '')

    def test_vision_model_sets_mmproj(self):
        from models.orchestrator import _entry_to_preset
        entry = _make_entry(
            capabilities={'has_vision': True},
            files={'model': 'v.gguf', 'mmproj': 'mmproj-v.gguf',
                   'mmproj_source': 'mmproj-F16.gguf'},
        )
        preset = _entry_to_preset(entry)
        self.assertTrue(preset.has_vision)
        self.assertEqual(preset.mmproj_file, 'mmproj-v.gguf')
        self.assertEqual(preset.mmproj_source_file, 'mmproj-F16.gguf')

    def test_vision_false_ignores_mmproj(self):
        from models.orchestrator import _entry_to_preset
        entry = _make_entry(
            capabilities={'has_vision': False},
            files={'model': 'v.gguf', 'mmproj': 'mmproj-v.gguf'},
        )
        preset = _entry_to_preset(entry)
        self.assertFalse(preset.has_vision)
        self.assertIsNone(preset.mmproj_file)

    def test_min_build_passed_through(self):
        from models.orchestrator import _entry_to_preset
        entry = _make_entry(min_build=4200)
        preset = _entry_to_preset(entry)
        self.assertEqual(preset.min_build, 4200)

    def test_fractional_disk_gb_rounding(self):
        from models.orchestrator import _entry_to_preset
        entry = _make_entry(disk_gb=1.5)
        preset = _entry_to_preset(entry)
        self.assertEqual(preset.size_mb, 1536)  # 1.5 * 1024


# ═══════════════════════════════════════════════════════════════════════
# 2. LlamaLoader
# ═══════════════════════════════════════════════════════════════════════

class TestLlamaLoader(unittest.TestCase):

    def setUp(self):
        from models.orchestrator import LlamaLoader
        self.loader = LlamaLoader()

    # ── _resolve_preset_and_index ─────────────────────────────────

    @patch('models.orchestrator.LlamaLoader._resolve_preset_and_index')
    def test_load_success_gpu(self, mock_resolve):
        mock_preset = MagicMock()
        mock_resolve.return_value = (mock_preset, 2)
        mock_config = MagicMock()
        mock_config.config = {}
        mock_config.start_server.return_value = True
        with patch('llama.llama_config.LlamaConfig', return_value=mock_config):
            result = self.loader.load(_make_entry(), run_mode='gpu')
        self.assertTrue(result)
        self.assertEqual(mock_config.config['use_gpu'], True)
        self.assertEqual(mock_config.config['llm_mode'], 'local')
        self.assertEqual(mock_config.config['selected_model_index'], 2)
        mock_config._save_config.assert_called_once()
        mock_config.start_server.assert_called_once_with(model_preset=mock_preset)

    @patch('models.orchestrator.LlamaLoader._resolve_preset_and_index')
    def test_load_success_cpu(self, mock_resolve):
        mock_preset = MagicMock()
        mock_resolve.return_value = (mock_preset, 0)
        mock_config = MagicMock()
        mock_config.config = {}
        mock_config.start_server.return_value = True
        with patch('llama.llama_config.LlamaConfig', return_value=mock_config):
            result = self.loader.load(_make_entry(), run_mode='cpu')
        self.assertTrue(result)
        self.assertEqual(mock_config.config['use_gpu'], False)

    @patch('models.orchestrator.LlamaLoader._resolve_preset_and_index')
    def test_load_no_preset_returns_false(self, mock_resolve):
        mock_resolve.return_value = (None, None)
        with patch('llama.llama_config.LlamaConfig', return_value=MagicMock()):
            result = self.loader.load(_make_entry(), run_mode='gpu')
        self.assertFalse(result)

    @patch('models.orchestrator.LlamaLoader._resolve_preset_and_index')
    def test_load_no_index_skips_index_assignment(self, mock_resolve):
        mock_preset = MagicMock()
        mock_resolve.return_value = (mock_preset, None)
        mock_config = MagicMock()
        mock_config.config = {}
        mock_config.start_server.return_value = True
        with patch('llama.llama_config.LlamaConfig', return_value=mock_config):
            self.loader.load(_make_entry(), run_mode='gpu')
        self.assertNotIn('selected_model_index', mock_config.config)

    @patch('models.orchestrator.LlamaLoader._resolve_preset_and_index')
    def test_load_exception_returns_false(self, mock_resolve):
        mock_resolve.side_effect = RuntimeError("boom")
        result = self.loader.load(_make_entry(), run_mode='gpu')
        self.assertFalse(result)

    # ── download ──────────────────────────────────────────────────

    @patch('models.orchestrator.LlamaLoader._resolve_preset_and_index')
    def test_download_success(self, mock_resolve):
        mock_preset = MagicMock()
        mock_resolve.return_value = (mock_preset, 0)
        mock_installer = MagicMock()
        mock_installer.download_model.return_value = True
        with patch('llama.llama_installer.LlamaInstaller', return_value=mock_installer):
            result = self.loader.download(_make_entry())
        self.assertTrue(result)
        mock_installer.download_model.assert_called_once_with(mock_preset)

    @patch('models.orchestrator.LlamaLoader._resolve_preset_and_index')
    def test_download_no_preset_returns_false(self, mock_resolve):
        mock_resolve.return_value = (None, None)
        with patch('llama.llama_installer.LlamaInstaller', return_value=MagicMock()):
            result = self.loader.download(_make_entry())
        self.assertFalse(result)

    @patch('models.orchestrator.LlamaLoader._resolve_preset_and_index')
    def test_download_exception_returns_false(self, mock_resolve):
        mock_resolve.side_effect = Exception("download fail")
        result = self.loader.download(_make_entry())
        self.assertFalse(result)

    # ── is_downloaded ─────────────────────────────────────────────

    @patch('models.orchestrator.LlamaLoader._resolve_preset_and_index')
    def test_is_downloaded_true(self, mock_resolve):
        mock_preset = MagicMock()
        mock_resolve.return_value = (mock_preset, 0)
        mock_installer = MagicMock()
        mock_installer.is_model_downloaded.return_value = True
        with patch('llama.llama_installer.LlamaInstaller', return_value=mock_installer):
            self.assertTrue(self.loader.is_downloaded(_make_entry()))

    @patch('models.orchestrator.LlamaLoader._resolve_preset_and_index')
    def test_is_downloaded_no_preset_returns_false(self, mock_resolve):
        mock_resolve.return_value = (None, None)
        with patch('llama.llama_installer.LlamaInstaller', return_value=MagicMock()):
            self.assertFalse(self.loader.is_downloaded(_make_entry()))

    @patch('models.orchestrator.LlamaLoader._resolve_preset_and_index')
    def test_is_downloaded_exception_returns_false(self, mock_resolve):
        mock_resolve.side_effect = Exception("fail")
        self.assertFalse(self.loader.is_downloaded(_make_entry()))

    # ── unload ────────────────────────────────────────────────────

    def test_unload_calls_stop_server(self):
        mock_config = MagicMock()
        with patch('llama.llama_config.LlamaConfig', return_value=mock_config):
            self.loader.unload(_make_entry())
        mock_config.stop_server.assert_called_once()

    def test_unload_exception_does_not_raise(self):
        with patch('llama.llama_config.LlamaConfig', side_effect=RuntimeError("boom")):
            # Should not raise — just logs a warning
            self.loader.unload(_make_entry())


# ═══════════════════════════════════════════════════════════════════════
# 3. TTSLoader
# ═══════════════════════════════════════════════════════════════════════

class TestTTSLoader(unittest.TestCase):

    def setUp(self):
        from models.orchestrator import TTSLoader
        self.loader = TTSLoader()

    def _tts_entry(self, id='tts-piper', **kwargs):
        defaults = dict(name='Piper TTS', model_type='tts',
                        files={'package': 'piper_tts'}, repo_id='piper-tts')
        defaults.update(kwargs)
        return _make_entry(id=id, **defaults)

    # ── download ──────────────────────────────────────────────────

    def test_download_success(self):
        with patch('tts.package_installer.install_backend_full', return_value=(True, 'ok')) as m:
            result = self.loader.download(self._tts_entry())
        self.assertTrue(result)
        m.assert_called_once_with('piper')

    def test_download_strips_tts_prefix(self):
        with patch('tts.package_installer.install_backend_full', return_value=(True, '')) as m:
            self.loader.download(self._tts_entry(id='tts-kokoro'))
        m.assert_called_once_with('kokoro')

    def test_download_install_failure(self):
        with patch('tts.package_installer.install_backend_full', return_value=(False, 'err')):
            self.assertFalse(self.loader.download(self._tts_entry()))

    def test_download_import_error(self):
        with patch.dict('sys.modules', {'tts.package_installer': None}):
            self.assertFalse(self.loader.download(self._tts_entry()))

    def test_download_unexpected_exception(self):
        with patch('tts.package_installer.install_backend_full', side_effect=RuntimeError("boom")):
            self.assertFalse(self.loader.download(self._tts_entry()))

    # ── load ──────────────────────────────────────────────────────

    def test_load_can_run_returns_true(self):
        mock_engine = MagicMock()
        mock_engine._can_run_backend.return_value = True
        with patch('tts.tts_engine.TTSEngine', return_value=mock_engine):
            self.assertTrue(self.loader.load(self._tts_entry(), 'gpu'))
        mock_engine._can_run_backend.assert_called_once_with('piper')

    def test_load_cannot_run_triggers_install(self):
        mock_engine = MagicMock()
        mock_engine._can_run_backend.return_value = False
        with patch('tts.tts_engine.TTSEngine', return_value=mock_engine):
            result = self.loader.load(self._tts_entry(), 'cpu')
        self.assertFalse(result)
        mock_engine._try_auto_install_backend.assert_called_once_with('piper')

    def test_load_exception_returns_false(self):
        with patch('tts.tts_engine.TTSEngine', side_effect=Exception("fail")):
            self.assertFalse(self.loader.load(self._tts_entry(), 'gpu'))

    # ── is_downloaded ─────────────────────────────────────────────

    def test_is_downloaded_package_found(self):
        entry = self._tts_entry(files={'package': 'json'})  # json always exists
        self.assertTrue(self.loader.is_downloaded(entry))

    def test_is_downloaded_package_not_found(self):
        entry = self._tts_entry(files={'package': 'nonexistent_pkg_xyz'})
        self.assertFalse(self.loader.is_downloaded(entry))

    def test_is_downloaded_falls_back_to_repo_id(self):
        entry = self._tts_entry(files={}, repo_id='json')
        self.assertTrue(self.loader.is_downloaded(entry))

    def test_is_downloaded_no_package_no_repo(self):
        entry = self._tts_entry(files={}, repo_id='')
        self.assertFalse(self.loader.is_downloaded(entry))

    # ── unload ────────────────────────────────────────────────────

    def test_unload_is_noop(self):
        # Should not raise
        self.loader.unload(self._tts_entry())


# ═══════════════════════════════════════════════════════════════════════
# 4. STTLoader
# ═══════════════════════════════════════════════════════════════════════

class TestSTTLoader(unittest.TestCase):

    def setUp(self):
        from models.orchestrator import STTLoader
        self.loader = STTLoader()

    def _stt_entry(self, **kwargs):
        defaults = dict(id='stt-whisper', name='Faster Whisper', model_type='stt')
        defaults.update(kwargs)
        return _make_entry(**defaults)

    def test_load_always_true(self):
        """STT load is lazy — always returns True."""
        self.assertTrue(self.loader.load(self._stt_entry(), 'gpu'))

    def test_is_downloaded_checks_faster_whisper(self):
        with patch('importlib.util.find_spec', return_value=MagicMock()):
            self.assertTrue(self.loader.is_downloaded(self._stt_entry()))

    def test_is_downloaded_false_when_missing(self):
        with patch('importlib.util.find_spec', return_value=None):
            self.assertFalse(self.loader.is_downloaded(self._stt_entry()))

    def test_is_downloaded_exception_returns_false(self):
        with patch('importlib.util.find_spec', side_effect=Exception("fail")):
            self.assertFalse(self.loader.is_downloaded(self._stt_entry()))

    def test_download_already_installed_no_cuda(self):
        """If faster_whisper already installed and no nvidia GPU, returns True."""
        with patch('tts.package_installer.has_nvidia_gpu', return_value=False), \
             patch('tts.package_installer.is_cuda_torch', return_value=False), \
             patch('importlib.util.find_spec', return_value=MagicMock()):
            self.assertTrue(self.loader.download(self._stt_entry()))

    def test_download_cuda_install_fails(self):
        with patch('tts.package_installer.has_nvidia_gpu', return_value=True), \
             patch('tts.package_installer.is_cuda_torch', return_value=False), \
             patch('tts.package_installer.install_cuda_torch', return_value=(False, 'err')):
            self.assertFalse(self.loader.download(self._stt_entry()))

    def test_download_exception_returns_false(self):
        with patch('tts.package_installer.has_nvidia_gpu', side_effect=Exception("boom")):
            self.assertFalse(self.loader.download(self._stt_entry()))


# ═══════════════════════════════════════════════════════════════════════
# 5. VLMLoader
# ═══════════════════════════════════════════════════════════════════════

class TestVLMLoader(unittest.TestCase):

    def setUp(self):
        from models.orchestrator import VLMLoader
        self.loader = VLMLoader()

    def _vlm_entry(self):
        return _make_entry(id='vlm-minicpm', name='MiniCPM', model_type='vlm')

    def test_load_success(self):
        with patch('integrations.vision.vision_service.VisionService', return_value=MagicMock()):
            self.assertTrue(self.loader.load(self._vlm_entry(), 'gpu'))

    def test_load_import_error_returns_false(self):
        with patch('integrations.vision.vision_service.VisionService', side_effect=ImportError("no module")):
            self.assertFalse(self.loader.load(self._vlm_entry(), 'cpu'))

    def test_load_exception_returns_false(self):
        with patch('integrations.vision.vision_service.VisionService', side_effect=RuntimeError("fail")):
            self.assertFalse(self.loader.load(self._vlm_entry(), 'gpu'))

    def test_download_default_returns_false(self):
        """VLMLoader inherits base download() which returns False."""
        self.assertFalse(self.loader.download(self._vlm_entry()))

    def test_is_downloaded_default_returns_false(self):
        """VLMLoader inherits base is_downloaded() which returns False."""
        self.assertFalse(self.loader.is_downloaded(self._vlm_entry()))

    def test_unload_is_noop(self):
        """VLMLoader inherits base unload() — no-op."""
        self.loader.unload(self._vlm_entry())


# ═══════════════════════════════════════════════════════════════════════
# 6. get_orchestrator() singleton & thread safety
# ═══════════════════════════════════════════════════════════════════════

class TestGetOrchestrator(unittest.TestCase):

    def setUp(self):
        # Reset the singleton and loader registration state before each test
        import integrations.service_tools.model_orchestrator as hartos_mod

        import models.orchestrator as nunba_mod
        self._hartos_mod = hartos_mod
        self._nunba_mod = nunba_mod
        self._orig_instance = hartos_mod._orchestrator_instance
        self._orig_registered = nunba_mod._loaders_registered
        hartos_mod._orchestrator_instance = None
        nunba_mod._loaders_registered = False

    def tearDown(self):
        self._hartos_mod._orchestrator_instance = self._orig_instance
        self._nunba_mod._loaders_registered = self._orig_registered

    def test_creates_singleton(self):
        from models.orchestrator import get_orchestrator
        orch = get_orchestrator()
        self.assertIsNotNone(orch)

    def test_returns_same_instance(self):
        from models.orchestrator import get_orchestrator
        a = get_orchestrator()
        b = get_orchestrator()
        self.assertIs(a, b)

    def test_shared_with_hartos_module(self):
        from models.orchestrator import get_orchestrator
        orch = get_orchestrator()
        self.assertIs(self._hartos_mod._orchestrator_instance, orch)

    def test_thread_safety_single_instance(self):
        """Multiple threads calling get_orchestrator() must all get the same instance."""
        from models.orchestrator import get_orchestrator
        results = []
        errors = []

        def worker():
            try:
                results.append(get_orchestrator())
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)
        self.assertEqual(len(errors), 0, f"Errors during threaded get_orchestrator: {errors}")
        self.assertTrue(len(results) >= 2)
        first = results[0]
        for r in results[1:]:
            self.assertIs(r, first)

    def test_existing_hartos_instance_gets_loaders(self):
        """If HARTOS already created an instance, get_orchestrator still registers loaders."""
        from models.catalog import get_catalog
        from models.orchestrator import ModelOrchestrator, get_orchestrator
        # Pre-set a HARTOS instance
        existing = ModelOrchestrator(catalog=get_catalog())
        self._hartos_mod._orchestrator_instance = existing
        orch = get_orchestrator()
        self.assertIs(orch, existing)
        self.assertTrue(self._nunba_mod._loaders_registered)


# ═══════════════════════════════════════════════════════════════════════
# 7. _register_loaders idempotency
# ═══════════════════════════════════════════════════════════════════════

class TestRegisterLoaders(unittest.TestCase):

    def test_idempotent(self):
        """Calling _register_loaders twice doesn't double-register."""
        import models.orchestrator as mod
        from models.catalog import get_catalog
        from models.orchestrator import ModelOrchestrator, _register_loaders

        old_flag = mod._loaders_registered
        mod._loaders_registered = False
        try:
            orch = ModelOrchestrator(catalog=get_catalog())
            _register_loaders(orch)
            # Capture loader count
            count1 = len(orch._loaders) if hasattr(orch, '_loaders') else 0
            _register_loaders(orch)
            count2 = len(orch._loaders) if hasattr(orch, '_loaders') else 0
            self.assertEqual(count1, count2)
        finally:
            mod._loaders_registered = old_flag


if __name__ == '__main__':
    unittest.main()
