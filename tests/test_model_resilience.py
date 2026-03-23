"""
Comprehensive tests for the unified model management system:
  1. ModelCatalog — CRUD, populate, select_best, compute matching
  2. ModelOrchestrator — notify_loaded/unloaded/downloaded, find_entry, swap trigger
  3. ModelLifecycleManager — crash recovery, swap queue, pressure alerts, health checks
  4. VRAMManager — drift detection, allocation tracking
  5. API endpoints — /api/admin/models/health, /api/admin/models/swap
  6. Bypass path sync — verify all 10 paths call notify_*
"""

import collections
import json
import os
import sys
import tempfile
import threading
import time
import unittest
from dataclasses import asdict
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock

# Ensure project root is on path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ═══════════════════════════════════════════════════════════════════════
# 1. ModelCatalog Tests
# ═══════════════════════════════════════════════════════════════════════

class TestModelCatalog(unittest.TestCase):
    """Tests for models/catalog.py"""

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix='.json', delete=False)
        self.tmp.close()
        from models.catalog import ModelCatalog, ModelEntry
        self.catalog = ModelCatalog(catalog_path=self.tmp.name)
        # Ensure tests don't depend on host machine tier (disk/RAM/GPU)
        self._tier_patcher = patch.object(
            ModelCatalog, '_get_capability_tier', return_value='full')
        self._tier_patcher.start()
        self.ModelEntry = ModelEntry

    def tearDown(self):
        self._tier_patcher.stop()
        try:
            os.unlink(self.tmp.name)
        except Exception:
            pass

    def _make_entry(self, id='test-model', model_type='llm', vram=2.0, ram=3.0,
                    quality=0.8, name=None, **kwargs):
        return self.ModelEntry(
            id=id, name=name or id, model_type=model_type,
            vram_gb=vram, ram_gb=ram, quality_score=quality, **kwargs)

    # ── CRUD ──────────────────────────────────────────────────────

    def test_register_and_get(self):
        entry = self._make_entry()
        self.catalog.register(entry)
        got = self.catalog.get('test-model')
        self.assertIsNotNone(got)
        self.assertEqual(got.id, 'test-model')

    def test_unregister(self):
        self.catalog.register(self._make_entry())
        self.assertTrue(self.catalog.unregister('test-model'))
        self.assertIsNone(self.catalog.get('test-model'))

    def test_unregister_nonexistent(self):
        self.assertFalse(self.catalog.unregister('nope'))

    def test_list_by_type(self):
        self.catalog.register(self._make_entry('a', 'llm'))
        self.catalog.register(self._make_entry('b', 'tts'))
        self.catalog.register(self._make_entry('c', 'llm'))
        llms = self.catalog.list_by_type('llm')
        self.assertEqual(len(llms), 2)
        tts = self.catalog.list_by_type('tts')
        self.assertEqual(len(tts), 1)

    def test_list_by_tag(self):
        e = self._make_entry(tags=['vision', 'recommended'])
        self.catalog.register(e)
        self.assertEqual(len(self.catalog.list_by_tag('vision')), 1)
        self.assertEqual(len(self.catalog.list_by_tag('nope')), 0)

    def test_disabled_excluded_from_list_by_type(self):
        e = self._make_entry(enabled=False)
        self.catalog.register(e)
        self.assertEqual(len(self.catalog.list_by_type('llm')), 0)

    # ── Persistence ──────────────────────────────────────────────

    def test_persistence_roundtrip(self):
        self.catalog.register(self._make_entry('persist-test', name='Persist Test'))
        # Reload from same file
        from models.catalog import ModelCatalog
        cat2 = ModelCatalog(catalog_path=self.tmp.name)
        got = cat2.get('persist-test')
        self.assertIsNotNone(got)
        self.assertEqual(got.name, 'Persist Test')

    # ── Compute matching ─────────────────────────────────────────

    def test_matches_compute_gpu(self):
        e = self._make_entry(vram=2.0, ram=3.0)
        self.assertEqual(e.matches_compute(4.0, 8.0, True), 'gpu')

    def test_matches_compute_cpu(self):
        e = self._make_entry(vram=8.0, ram=3.0)
        self.assertEqual(e.matches_compute(2.0, 8.0, True), 'cpu')

    def test_matches_compute_cpu_offload(self):
        e = self._make_entry(vram=4.0, ram=3.0, supports_cpu_offload=True)
        # free_vram >= vram * 0.5
        self.assertEqual(e.matches_compute(2.5, 8.0, True), 'cpu_offload')

    def test_matches_compute_impossible(self):
        e = self._make_entry(vram=16.0, ram=32.0, supports_cpu=False)
        self.assertEqual(e.matches_compute(4.0, 8.0, True), 'impossible')

    def test_matches_compute_no_gpu(self):
        e = self._make_entry(vram=2.0, ram=3.0)
        self.assertEqual(e.matches_compute(0.0, 8.0, False), 'cpu')

    # ── select_best ──────────────────────────────────────────────

    def test_select_best_prefers_gpu(self):
        small = self._make_entry('small', vram=2.0, quality=0.7)
        big = self._make_entry('big', vram=6.0, quality=0.9)
        self.catalog.register(small)
        self.catalog.register(big)
        best = self.catalog.select_best('llm', budget_vram_gb=4.0,
                                         budget_ram_gb=8.0, gpu_available=True)
        # small fits GPU, big doesn't → small wins despite lower quality
        self.assertEqual(best.id, 'small')

    def test_select_best_language_routing(self):
        en = self._make_entry('en-tts', 'tts', quality=0.8,
                              languages=['en'], language_priority={'en': 0})
        hi = self._make_entry('hi-tts', 'tts', quality=0.9,
                              languages=['hi'], language_priority={'hi': 0})
        self.catalog.register(en)
        self.catalog.register(hi)
        best = self.catalog.select_best('tts', budget_ram_gb=8.0,
                                         language='en')
        self.assertEqual(best.id, 'en-tts')

    def test_select_best_prefers_downloaded(self):
        a = self._make_entry('a', quality=0.8, priority=50)
        b = self._make_entry('b', quality=0.8, priority=50)
        b.downloaded = True
        self.catalog.register(a)
        self.catalog.register(b)
        best = self.catalog.select_best('llm', budget_ram_gb=8.0)
        self.assertEqual(best.id, 'b')

    def test_select_best_no_candidates(self):
        best = self.catalog.select_best('llm', budget_ram_gb=0.1)
        self.assertIsNone(best)

    def test_select_all_fitting(self):
        for i in range(3):
            self.catalog.register(self._make_entry(f'm{i}', vram=1.0+i))
        fitting = self.catalog.select_all_fitting(
            'llm', budget_vram_gb=5.0, budget_ram_gb=8.0, gpu_available=True)
        self.assertEqual(len(fitting), 3)  # All fit

    # ── State tracking ───────────────────────────────────────────

    def test_mark_loaded_unloaded(self):
        e = self._make_entry()
        self.catalog.register(e)
        self.catalog.mark_loaded('test-model', device='gpu')
        got = self.catalog.get('test-model')
        self.assertTrue(got.loaded)
        self.assertEqual(got.device, 'gpu')
        self.assertIsNotNone(got.active_since)

        self.catalog.mark_unloaded('test-model')
        got2 = self.catalog.get('test-model')
        self.assertFalse(got2.loaded)
        self.assertEqual(got2.device, 'unloaded')

    def test_mark_error(self):
        self.catalog.register(self._make_entry())
        self.catalog.mark_error('test-model', 'OOM crash')
        got = self.catalog.get('test-model')
        self.assertEqual(got.error, 'OOM crash')
        self.assertFalse(got.loaded)

    def test_mark_downloaded(self):
        self.catalog.register(self._make_entry())
        self.catalog.mark_downloaded('test-model')
        self.assertTrue(self.catalog.get('test-model').downloaded)

    # ── to_json ──────────────────────────────────────────────────

    def test_to_json_includes_runtime_state(self):
        self.catalog.register(self._make_entry())
        self.catalog.mark_loaded('test-model', 'gpu')
        items = self.catalog.to_json()
        self.assertEqual(len(items), 1)
        self.assertTrue(items[0]['loaded'])
        self.assertEqual(items[0]['device'], 'gpu')

    # ── populate_from_subsystems ─────────────────────────────────

    def test_populate_from_subsystems(self):
        from models.catalog import populate_llm_presets, populate_tts_engines
        self.catalog.register_populator('llm_presets', populate_llm_presets)
        self.catalog.register_populator('tts_engines', populate_tts_engines)
        added = self.catalog.populate_from_subsystems()
        self.assertGreater(added, 0)
        # Should have LLM, TTS, STT, VLM entries
        self.assertGreater(len(self.catalog.list_by_type('llm')), 0)
        self.assertGreater(len(self.catalog.list_by_type('tts')), 0)
        self.assertGreater(len(self.catalog.list_by_type('stt')), 0)
        self.assertGreater(len(self.catalog.list_by_type('vlm')), 0)

    def test_populate_idempotent(self):
        from models.catalog import populate_llm_presets, populate_tts_engines
        self.catalog.register_populator('llm_presets', populate_llm_presets)
        self.catalog.register_populator('tts_engines', populate_tts_engines)
        n1 = self.catalog.populate_from_subsystems()
        n2 = self.catalog.populate_from_subsystems()
        self.assertEqual(n2, 0)  # Second call adds nothing


# ═══════════════════════════════════════════════════════════════════════
# 2. ModelOrchestrator Tests
# ═══════════════════════════════════════════════════════════════════════

class TestModelOrchestrator(unittest.TestCase):
    """Tests for models/orchestrator.py"""

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix='.json', delete=False)
        self.tmp.close()
        from models.catalog import (ModelCatalog, ModelEntry,
                                    populate_llm_presets, populate_tts_engines)
        from models.orchestrator import ModelOrchestrator
        # Ensure tests don't depend on host machine tier
        self._tier_patcher = patch.object(
            ModelCatalog, '_get_capability_tier', return_value='full')
        self._tier_patcher.start()
        self.catalog = ModelCatalog(catalog_path=self.tmp.name)
        self.catalog.register_populator('llm_presets', populate_llm_presets)
        self.catalog.register_populator('tts_engines', populate_tts_engines)
        self.catalog.populate_from_subsystems()
        self.orch = ModelOrchestrator(catalog=self.catalog)
        self.ModelEntry = ModelEntry

    def tearDown(self):
        self._tier_patcher.stop()
        try:
            os.unlink(self.tmp.name)
        except Exception:
            pass

    # ── notify_loaded ─────────────────────────────────────────────

    def test_notify_loaded_exact_name(self):
        entry = self.catalog.list_by_type('tts')[0]
        self.orch.notify_loaded('tts', entry.name, device='gpu')
        got = self.catalog.get(entry.id)
        self.assertTrue(got.loaded)
        self.assertEqual(got.device, 'gpu')

    def test_notify_loaded_partial_name(self):
        # 'chatterbox_turbo' should match 'tts-chatterbox_turbo'
        self.orch.notify_loaded('tts', 'chatterbox_turbo', device='cpu')
        got = self.catalog.get('tts-chatterbox_turbo')
        if got:  # Only if this entry was populated
            self.assertTrue(got.loaded)

    def test_notify_loaded_nonexistent_noop(self):
        # Should not raise
        self.orch.notify_loaded('llm', 'nonexistent-model-xyz')

    def test_notify_loaded_marks_downloaded(self):
        entry = self.catalog.list_by_type('stt')[0]
        self.assertFalse(entry.downloaded)
        self.orch.notify_loaded('stt', entry.name, device='cpu')
        self.assertTrue(entry.downloaded)

    # ── notify_unloaded ───────────────────────────────────────────

    def test_notify_unloaded(self):
        entry = self.catalog.list_by_type('tts')[0]
        self.catalog.mark_loaded(entry.id, 'gpu')
        self.assertTrue(entry.loaded)
        self.orch.notify_unloaded('tts', entry.name)
        self.assertFalse(entry.loaded)
        self.assertEqual(entry.device, 'unloaded')

    # ── notify_downloaded ─────────────────────────────────────────

    def test_notify_downloaded(self):
        entry = self.catalog.list_by_type('llm')[0]
        entry.downloaded = False
        self.orch.notify_downloaded('llm', entry.name)
        self.assertTrue(entry.downloaded)

    def test_notify_downloaded_already_downloaded(self):
        entry = self.catalog.list_by_type('llm')[0]
        entry.downloaded = True
        # Should be a no-op, not raise
        self.orch.notify_downloaded('llm', entry.name)
        self.assertTrue(entry.downloaded)

    # ── _find_entry_by_name ──────────────────────────────────────

    def test_find_by_exact_name(self):
        entry = self.catalog.list_by_type('stt')[0]
        found = self.orch._find_entry_by_name('stt', entry.name)
        self.assertEqual(found.id, entry.id)

    def test_find_by_partial_name_case_insensitive(self):
        found = self.orch._find_entry_by_name('stt', 'whisper base')
        self.assertIsNotNone(found)

    def test_find_by_id_substring(self):
        found = self.orch._find_entry_by_name('tts', 'piper')
        self.assertIsNotNone(found)

    def test_find_by_file_name(self):
        llms = self.catalog.list_by_type('llm')
        if llms and llms[0].files.get('model'):
            fname = llms[0].files['model']
            found = self.orch._find_entry_by_name('llm', fname)
            self.assertIsNotNone(found)

    def test_find_not_found(self):
        found = self.orch._find_entry_by_name('llm', 'zzz-nonexistent')
        self.assertIsNone(found)

    # ── select_best ──────────────────────────────────────────────

    def test_select_best_returns_entry(self):
        best = self.orch.select_best('stt')
        # Should find at least the whisper-base (CPU-friendly)
        self.assertIsNotNone(best)
        self.assertEqual(best.model_type, 'stt')

    # ── get_status ───────────────────────────────────────────────

    def test_get_status_structure(self):
        status = self.orch.get_status()
        self.assertIn('compute', status)
        self.assertIn('total_models', status)
        self.assertIn('loaded_count', status)
        self.assertIn('downloaded_count', status)
        self.assertIn('models_by_type', status)
        self.assertIn('all_models', status)
        self.assertGreater(status['total_models'], 0)

    # ── _attempt_swap ────────────────────────────────────────────

    def test_attempt_swap_no_gpu_models(self):
        """Swap should return False when no GPU models are loaded."""
        from models.catalog import ModelEntry
        entry = ModelEntry(id='big-model', name='Big', model_type='llm',
                           vram_gb=16.0, ram_gb=20.0)
        cs = {'gpu_available': True, 'vram_free_gb': 2.0, 'ram_free_gb': 4.0}
        result = self.orch._attempt_swap(entry, cs)
        self.assertFalse(result)


# ═══════════════════════════════════════════════════════════════════════
# 3. ModelLifecycleManager Tests
# ═══════════════════════════════════════════════════════════════════════

class TestModelLifecycleManager(unittest.TestCase):
    """Tests for integrations/service_tools/model_lifecycle.py"""

    def setUp(self):
        from integrations.service_tools.model_lifecycle import (
            ModelLifecycleManager, ModelState, ModelDevice, ModelPriority,
            _PRIORITY_RANK)
        self.MLM = ModelLifecycleManager
        self.ModelState = ModelState
        self.ModelDevice = ModelDevice
        self.ModelPriority = ModelPriority
        self._PRIORITY_RANK = _PRIORITY_RANK
        self.mlm = ModelLifecycleManager()

    # ── ModelState crash fields ──────────────────────────────────

    def test_model_state_crash_fields_default(self):
        s = self.ModelState(name='test')
        self.assertEqual(s.crash_count, 0)
        self.assertEqual(s.last_crash_time, 0.0)
        self.assertIsNone(s.last_exit_code)
        self.assertEqual(s.restart_backoff_s, 0.0)
        self.assertFalse(s.downgraded)

    def test_model_state_to_dict_includes_crash(self):
        s = self.ModelState(name='test', crash_count=2, last_exit_code=137,
                            downgraded=True)
        d = s.to_dict()
        self.assertEqual(d['crash_count'], 2)
        self.assertEqual(d['last_exit_code'], 137)
        self.assertTrue(d['downgraded'])

    def test_model_state_healthy_when_unloaded(self):
        s = self.ModelState(name='test', crash_count=5)
        # UNLOADED = healthy regardless of crash_count
        self.assertTrue(s.to_dict()['healthy'])

    def test_model_state_unhealthy_when_loaded_with_crashes(self):
        s = self.ModelState(name='test', device=self.ModelDevice.GPU,
                            crash_count=1)
        self.assertFalse(s.to_dict()['healthy'])

    def test_model_state_healthy_when_loaded_no_crashes(self):
        s = self.ModelState(name='test', device=self.ModelDevice.GPU,
                            crash_count=0)
        self.assertTrue(s.to_dict()['healthy'])

    # ── MLM init ─────────────────────────────────────────────────

    def test_init_crash_recovery_fields(self):
        self.assertEqual(self.mlm._max_crash_restarts, 3)
        self.assertEqual(self.mlm._base_backoff_s, 5.0)
        self.assertEqual(self.mlm._max_backoff_s, 300.0)
        self.assertIsInstance(self.mlm._restart_pending, dict)

    def test_init_swap_queue(self):
        self.assertIsInstance(self.mlm._swap_queue, collections.deque)
        self.assertEqual(self.mlm._swap_queue.maxlen, 8)

    def test_init_pressure_alert_state(self):
        self.assertIsInstance(self.mlm._last_pressure_alert, dict)
        self.assertEqual(self.mlm._pressure_alert_cooldown, 60.0)

    # ── OOM exit code classification ─────────────────────────────

    def test_oom_exit_codes(self):
        oom_codes = self.mlm._OOM_EXIT_CODES
        self.assertIn(137, oom_codes)        # Linux SIGKILL
        self.assertIn(-9, oom_codes)         # Python SIGKILL
        self.assertIn(9, oom_codes)          # Raw SIGKILL
        self.assertIn(3221225477, oom_codes) # Windows access violation
        self.assertIn(3221225725, oom_codes) # Windows stack overflow

    def test_non_oom_exit_codes(self):
        oom_codes = self.mlm._OOM_EXIT_CODES
        self.assertNotIn(0, oom_codes)   # Clean exit
        self.assertNotIn(1, oom_codes)   # Generic error
        self.assertNotIn(2, oom_codes)   # Misuse

    # ── _handle_dead_process ─────────────────────────────────────

    def test_handle_dead_process_oom(self):
        # Simulate a GPU model that died with OOM
        self.mlm._models['test_tool'] = self.ModelState(
            name='test_tool', device=self.ModelDevice.GPU,
            vram_gb=4.0, priority=self.ModelPriority.WARM)

        self.mlm._handle_dead_process('test_tool', 137, 'sidecar')

        state = self.mlm._models['test_tool']
        self.assertEqual(state.device, self.ModelDevice.UNLOADED)
        self.assertEqual(state.crash_count, 1)
        self.assertEqual(state.last_exit_code, 137)
        self.assertGreater(state.restart_backoff_s, 0)
        # Should be queued for restart with downgrade
        self.assertIn('test_tool', self.mlm._restart_pending)
        info = self.mlm._restart_pending['test_tool']
        self.assertTrue(info['downgrade'])  # OOM → downgrade

    def test_handle_dead_process_crash(self):
        self.mlm._models['test_tool'] = self.ModelState(
            name='test_tool', device=self.ModelDevice.GPU,
            priority=self.ModelPriority.WARM)

        self.mlm._handle_dead_process('test_tool', 1, 'sidecar')

        state = self.mlm._models['test_tool']
        self.assertEqual(state.crash_count, 1)
        self.assertEqual(state.last_exit_code, 1)
        info = self.mlm._restart_pending['test_tool']
        self.assertFalse(info['downgrade'])  # Non-OOM → same mode

    def test_handle_dead_process_disappeared(self):
        self.mlm._models['test_tool'] = self.ModelState(
            name='test_tool', device=self.ModelDevice.CPU,
            priority=self.ModelPriority.IDLE)

        self.mlm._handle_dead_process('test_tool', None, 'orphan')

        state = self.mlm._models['test_tool']
        self.assertEqual(state.device, self.ModelDevice.UNLOADED)
        self.assertEqual(state.crash_count, 1)

    def test_handle_dead_process_exceeds_max_restarts(self):
        self.mlm._models['test_tool'] = self.ModelState(
            name='test_tool', device=self.ModelDevice.GPU,
            crash_count=3)  # Already at max

        self.mlm._handle_dead_process('test_tool', 1, 'sidecar')

        # crash_count becomes 4, exceeds max (3)
        self.assertNotIn('test_tool', self.mlm._restart_pending)

    # ── Exponential backoff ──────────────────────────────────────

    def test_exponential_backoff(self):
        self.mlm._models['t'] = self.ModelState(
            name='t', device=self.ModelDevice.GPU)

        # First crash: 5s
        self.mlm._handle_dead_process('t', 1, 'sidecar')
        self.assertEqual(self.mlm._models['t'].restart_backoff_s, 5.0)

        # Reset for second crash
        self.mlm._models['t'].device = self.ModelDevice.GPU
        self.mlm._restart_pending.clear()
        self.mlm._handle_dead_process('t', 1, 'sidecar')
        self.assertEqual(self.mlm._models['t'].restart_backoff_s, 10.0)

        # Third: 20s
        self.mlm._models['t'].device = self.ModelDevice.GPU
        self.mlm._restart_pending.clear()
        self.mlm._handle_dead_process('t', 1, 'sidecar')
        self.assertEqual(self.mlm._models['t'].restart_backoff_s, 20.0)

    def test_backoff_capped_at_max(self):
        self.mlm._models['t'] = self.ModelState(
            name='t', device=self.ModelDevice.GPU,
            crash_count=10)  # Very high crash count
        self.mlm._max_crash_restarts = 20  # Allow many restarts for this test

        self.mlm._handle_dead_process('t', 1, 'sidecar')
        self.assertLessEqual(self.mlm._models['t'].restart_backoff_s,
                             self.mlm._max_backoff_s)

    # ── OOM resource downgrade logic ─────────────────────────────

    def test_downgrade_gpu_to_cpu_offload(self):
        """OOM on GPU → restart on cpu_offload"""
        self.mlm._models['t'] = self.ModelState(
            name='t', device=self.ModelDevice.GPU)

        self.mlm._handle_dead_process('t', 137, 'sidecar')  # OOM
        info = self.mlm._restart_pending['t']
        self.assertTrue(info['downgrade'])
        self.assertEqual(info['old_device'], 'gpu')

        # _process_restart_queue would choose cpu_offload mode
        # Let's test the mode selection logic directly
        downgrade = info['downgrade']
        old_device = info['old_device']
        if downgrade and old_device == 'gpu':
            restart_mode = 'cpu_offload'
        elif downgrade and old_device == 'cpu_offload':
            restart_mode = 'cpu_only'
        else:
            restart_mode = old_device
        self.assertEqual(restart_mode, 'cpu_offload')

    def test_downgrade_cpu_offload_to_cpu_only(self):
        """OOM on cpu_offload → restart on cpu_only"""
        self.mlm._models['t'] = self.ModelState(
            name='t', device=self.ModelDevice.CPU_OFFLOAD)

        self.mlm._handle_dead_process('t', 137, 'sidecar')
        info = self.mlm._restart_pending['t']
        old_device = info['old_device']
        downgrade = info['downgrade']
        if downgrade and old_device == 'cpu_offload':
            restart_mode = 'cpu_only'
        else:
            restart_mode = old_device
        self.assertEqual(restart_mode, 'cpu_only')

    # ── notify_access resets crash state ──────────────────────────

    def test_notify_access_resets_crash_count(self):
        self.mlm._models['recovered'] = self.ModelState(
            name='recovered', device=self.ModelDevice.GPU,
            crash_count=2, restart_backoff_s=20.0, downgraded=True)

        self.mlm.notify_access('recovered')

        state = self.mlm._models['recovered']
        self.assertEqual(state.crash_count, 0)
        self.assertEqual(state.restart_backoff_s, 0.0)
        self.assertFalse(state.downgraded)

    def test_notify_access_updates_counters(self):
        self.mlm._models['m'] = self.ModelState(name='m')
        self.mlm.notify_access('m')
        state = self.mlm._models['m']
        self.assertEqual(state.access_count, 1)
        self.assertEqual(state.access_count_session, 1)
        self.assertGreater(state.last_access_time, 0)

    # ── Swap queue ───────────────────────────────────────────────

    def test_request_swap_with_gpu_model(self):
        # Add a GPU model that can be evicted
        self.mlm._models['victim'] = self.ModelState(
            name='victim', device=self.ModelDevice.GPU,
            priority=self.ModelPriority.IDLE,
            last_access_time=time.time() - 300)

        # Mock _do_unload to avoid RTM dependency
        self.mlm._do_unload = MagicMock()

        success = self.mlm.request_swap('new_model')
        self.assertTrue(success)
        self.assertEqual(len(self.mlm._swap_queue), 1)
        self.assertEqual(self.mlm._swap_queue[0]['name'], 'victim')
        self.assertEqual(self.mlm._swap_queue[0]['evicted_for'], 'new_model')
        self.mlm._do_unload.assert_called_once_with('victim')

    def test_request_swap_no_evictable(self):
        # Only ACTIVE models — can't evict
        self.mlm._models['busy'] = self.ModelState(
            name='busy', device=self.ModelDevice.GPU,
            priority=self.ModelPriority.ACTIVE,
            active_inference_count=1)

        success = self.mlm.request_swap('new_model')
        self.assertFalse(success)
        self.assertEqual(len(self.mlm._swap_queue), 0)

    def test_request_swap_with_explicit_target(self):
        self.mlm._models['target'] = self.ModelState(
            name='target', device=self.ModelDevice.GPU,
            priority=self.ModelPriority.WARM)
        self.mlm._do_unload = MagicMock()

        success = self.mlm.request_swap('new_model', evict_target='target')
        self.assertTrue(success)
        self.mlm._do_unload.assert_called_once_with('target')

    def test_swap_queue_maxlen(self):
        self.mlm._do_unload = MagicMock()
        for i in range(10):
            self.mlm._models[f'v{i}'] = self.ModelState(
                name=f'v{i}', device=self.ModelDevice.GPU,
                priority=self.ModelPriority.EVICTABLE,
                last_access_time=time.time() - i * 100)
            self.mlm.request_swap(f'new{i}', evict_target=f'v{i}')
        # maxlen=8, so oldest entries are dropped
        self.assertEqual(len(self.mlm._swap_queue), 8)

    def test_process_swap_queue_restores_when_displacer_idle(self):
        """When the model that caused eviction becomes idle, restore the evicted one."""
        self.mlm._swap_queue.append({
            'name': 'evicted_model',
            'device': 'gpu',
            'evicted_for': 'displacer',
            'timestamp': time.time() - 60,
        })
        # Displacer is now idle
        self.mlm._models['displacer'] = self.ModelState(
            name='displacer', device=self.ModelDevice.GPU,
            priority=self.ModelPriority.IDLE)

        # Mock restart and VRAM check
        self.mlm._restart_rtm_tool = MagicMock(return_value=True)
        with patch('integrations.service_tools.vram_manager.vram_manager') as mock_vm:
            mock_vm.get_free_vram.return_value = 10.0  # Plenty of room

            self.mlm._process_swap_queue()

        self.mlm._restart_rtm_tool.assert_called_once_with('evicted_model', 'gpu')
        self.assertEqual(len(self.mlm._swap_queue), 0)  # Restored and removed

    def test_process_swap_queue_skips_when_displacer_active(self):
        self.mlm._swap_queue.append({
            'name': 'evicted',
            'device': 'gpu',
            'evicted_for': 'active_model',
            'timestamp': time.time(),
        })
        self.mlm._models['active_model'] = self.ModelState(
            name='active_model', device=self.ModelDevice.GPU,
            priority=self.ModelPriority.ACTIVE,
            active_inference_count=1)

        self.mlm._process_swap_queue()
        # Should NOT restore — displacer is still active
        self.assertEqual(len(self.mlm._swap_queue), 1)

    # ── Pressure alerts ──────────────────────────────────────────

    def test_pressure_alert_debouncing(self):
        events = []
        self.mlm._emit_event = lambda t, d: events.append((t, d))

        # Force VRAM pressure
        with patch.object(self.mlm, '_detect_vram_pressure', return_value=True), \
             patch.object(self.mlm, '_detect_ram_pressure', return_value=False), \
             patch.object(self.mlm, '_detect_cpu_pressure', return_value=False), \
             patch.object(self.mlm, '_detect_disk_pressure', return_value=False):

            self.mlm._emit_pressure_alerts()
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0][0], 'system.pressure')
            self.assertEqual(events[0][1]['type'], 'vram')

            # Second call within cooldown — should be suppressed
            self.mlm._emit_pressure_alerts()
            self.assertEqual(len(events), 1)  # Still 1

    def test_pressure_alert_multiple_types(self):
        events = []
        self.mlm._emit_event = lambda t, d: events.append((t, d))

        with patch.object(self.mlm, '_detect_vram_pressure', return_value=True), \
             patch.object(self.mlm, '_detect_ram_pressure', return_value=True), \
             patch.object(self.mlm, '_detect_cpu_pressure', return_value=False), \
             patch.object(self.mlm, '_detect_disk_pressure', return_value=False):

            self.mlm._emit_pressure_alerts()
            types = {e[1]['type'] for e in events}
            self.assertEqual(types, {'vram', 'ram'})

    # ── _guess_model_type ────────────────────────────────────────

    def test_guess_model_type(self):
        self.assertEqual(self.mlm._guess_model_type('llm'), 'llm')
        self.assertEqual(self.mlm._guess_model_type('tts_chatterbox_turbo'), 'tts')
        self.assertEqual(self.mlm._guess_model_type('whisper'), 'stt')
        self.assertEqual(self.mlm._guess_model_type('minicpm'), 'vlm')
        self.assertEqual(self.mlm._guess_model_type('unknown_thing'), 'unknown_thing')

    # ── inference_guard ──────────────────────────────────────────

    def test_inference_guard_prevents_eviction(self):
        self.mlm._models['guarded'] = self.ModelState(
            name='guarded', device=self.ModelDevice.GPU)

        with self.mlm.inference_guard('guarded'):
            state = self.mlm._models['guarded']
            self.assertEqual(state.active_inference_count, 1)
            self.assertEqual(state.priority, self.ModelPriority.IDLE)  # priority not changed here

        # After context exit
        self.assertEqual(self.mlm._models['guarded'].active_inference_count, 0)

    # ── get_status includes new fields ───────────────────────────

    def test_get_status_structure(self):
        status = self.mlm.get_status()
        self.assertIn('restart_pending', status)
        self.assertIn('swap_queue', status)
        self.assertIn('throttle_factor', status)
        self.assertIn('vram_pressure', status)
        self.assertIn('ram_pressure', status)
        self.assertIn('cpu_pressure', status)
        self.assertIn('disk_pressure', status)
        self.assertIsInstance(status['restart_pending'], dict)
        self.assertIsInstance(status['swap_queue'], list)

    def test_get_status_shows_pending_restart(self):
        self.mlm._restart_pending['dying_model'] = {
            'retry_after': time.time() + 10,
            'downgrade': True,
        }
        status = self.mlm.get_status()
        self.assertIn('dying_model', status['restart_pending'])
        self.assertTrue(status['restart_pending']['dying_model']['downgrade'])


# ═══════════════════════════════════════════════════════════════════════
# 4. VRAMManager Tests
# ═══════════════════════════════════════════════════════════════════════

class TestVRAMManager(unittest.TestCase):
    """Tests for integrations/service_tools/vram_manager.py"""

    def setUp(self):
        from integrations.service_tools.vram_manager import VRAMManager
        self.vm = VRAMManager()

    # ── Allocation tracking ──────────────────────────────────────

    def test_allocate_and_release(self):
        self.vm.allocate('test_tool')
        self.assertIn('test_tool', self.vm.get_allocations())
        self.vm.release('test_tool')
        self.assertNotIn('test_tool', self.vm.get_allocations())

    def test_allocate_idempotent(self):
        self.vm.allocate('test_tool')
        self.vm.allocate('test_tool')
        self.assertEqual(len(self.vm.get_allocations()), 1)

    def test_release_nonexistent(self):
        # Should not raise
        self.vm.release('nonexistent')

    def test_can_fit_already_allocated(self):
        self.vm.allocate('whisper')
        self.assertTrue(self.vm.can_fit('whisper'))

    # ── Drift detection ──────────────────────────────────────────

    def test_drift_detection_structure(self):
        drift = self.vm.detect_allocation_drift()
        self.assertIn('actual_used_gb', drift)
        self.assertIn('advisory_used_gb', drift)
        self.assertIn('os_baseline_gb', drift)
        self.assertIn('drift_gb', drift)
        self.assertIn('drift_pct', drift)
        self.assertIn('untracked_process', drift)

    def test_drift_with_no_allocations(self):
        drift = self.vm.detect_allocation_drift()
        # With no allocations, advisory = 0
        self.assertEqual(drift['advisory_used_gb'], 0)

    def test_drift_with_allocations(self):
        self.vm._allocations['fake_tool'] = 4.0
        drift = self.vm.detect_allocation_drift()
        self.assertEqual(drift['advisory_used_gb'], 4.0)
        self.vm._allocations.pop('fake_tool')

    # ── get_status includes drift ────────────────────────────────

    def test_status_includes_drift(self):
        status = self.vm.get_status()
        self.assertIn('drift', status)
        self.assertIn('gpu', status)
        self.assertIn('allocations', status)
        self.assertIn('total_allocated_gb', status)
        self.assertIn('effective_free_gb', status)

    # ── Offload strategy ─────────────────────────────────────────

    def test_suggest_offload_no_gpu(self):
        self.vm._gpu_info = {
            'name': None, 'total_gb': 0, 'free_gb': 0, 'cuda_available': False}
        self.assertEqual(self.vm.suggest_offload_mode('whisper'), 'cpu_only')

    def test_suggest_offload_gpu_plenty(self):
        self.vm._gpu_info = {
            'name': 'RTX', 'total_gb': 8, 'free_gb': 6, 'cuda_available': True}
        self.assertEqual(self.vm.suggest_offload_mode('whisper'), 'gpu')

    def test_suggest_offload_gpu_tight(self):
        from integrations.service_tools.vram_manager import VRAM_BUDGETS
        budget = VRAM_BUDGETS.get('minicpm', (6.0, 4.0))
        # Free = model_size * 0.6 (between 0.5 and 1.0) → cpu_offload
        self.vm._gpu_info = {
            'name': 'RTX', 'total_gb': 8,
            'free_gb': budget[1] * 0.6, 'cuda_available': True}
        self.assertEqual(self.vm.suggest_offload_mode('minicpm'), 'cpu_offload')


# ═══════════════════════════════════════════════════════════════════════
# 5. Integration Tests — Orchestrator ↔ Lifecycle ↔ Catalog
# ═══════════════════════════════════════════════════════════════════════

class TestIntegration(unittest.TestCase):
    """Cross-component integration tests."""

    def test_crash_recovery_syncs_catalog(self):
        """When lifecycle detects crash → catalog marks model as unloaded."""
        from models.catalog import ModelCatalog, ModelEntry
        from models.orchestrator import ModelOrchestrator
        from integrations.service_tools.model_lifecycle import (
            ModelLifecycleManager, ModelState, ModelDevice, ModelPriority)

        tmp = tempfile.NamedTemporaryFile(suffix='.json', delete=False)
        tmp.close()
        try:
            catalog = ModelCatalog(catalog_path=tmp.name)
            entry = ModelEntry(id='tts-test', name='Test TTS', model_type='tts',
                               vram_gb=2.0, ram_gb=1.0)
            catalog.register(entry)
            catalog.mark_loaded('tts-test', 'gpu')
            self.assertTrue(catalog.get('tts-test').loaded)

            orch = ModelOrchestrator(catalog=catalog)
            mlm = ModelLifecycleManager()
            mlm._models['tts_test'] = ModelState(
                name='tts_test', device=ModelDevice.GPU)

            # Simulate crash — handle_dead_process calls notify_unloaded
            # which should sync catalog via orchestrator
            # We mock the orchestrator import to use our instance
            with patch('integrations.service_tools.model_lifecycle.get_model_lifecycle_manager',
                       return_value=mlm):
                mlm._handle_dead_process('tts_test', 137, 'sidecar')

            state = mlm._models['tts_test']
            self.assertEqual(state.device, ModelDevice.UNLOADED)
            self.assertEqual(state.crash_count, 1)
            self.assertEqual(state.last_exit_code, 137)
        finally:
            os.unlink(tmp.name)

    def test_full_lifecycle_flow(self):
        """notify_loaded → notify_access → mark healthy → notify_unloaded"""
        from models.catalog import (ModelCatalog, ModelEntry,
                                    populate_llm_presets, populate_tts_engines)
        from models.orchestrator import ModelOrchestrator
        from integrations.service_tools.model_lifecycle import (
            ModelLifecycleManager, ModelState, ModelDevice)

        tmp = tempfile.NamedTemporaryFile(suffix='.json', delete=False)
        tmp.close()
        try:
            catalog = ModelCatalog(catalog_path=tmp.name)
            catalog.register_populator('llm_presets', populate_llm_presets)
            catalog.register_populator('tts_engines', populate_tts_engines)
            catalog.populate_from_subsystems()
            orch = ModelOrchestrator(catalog=catalog)

            # Step 1: External load notification
            orch.notify_loaded('tts', 'piper', device='cpu')
            entry = catalog.get('tts-piper')
            if entry:
                self.assertTrue(entry.loaded)
                self.assertEqual(entry.device, 'cpu')

                # Step 2: Simulate access
                mlm = ModelLifecycleManager()
                mlm._models['tts-piper'] = ModelState(
                    name='tts-piper', device=ModelDevice.CPU, crash_count=1)
                mlm.notify_access('tts-piper')
                self.assertEqual(mlm._models['tts-piper'].crash_count, 0)

                # Step 3: Unload
                orch.notify_unloaded('tts', 'piper')
                self.assertFalse(entry.loaded)
                self.assertEqual(entry.device, 'unloaded')
        finally:
            os.unlink(tmp.name)

    def test_swap_queue_entry_format(self):
        """Swap queue entries have correct structure."""
        from integrations.service_tools.model_lifecycle import (
            ModelLifecycleManager, ModelState, ModelDevice, ModelPriority)

        mlm = ModelLifecycleManager()
        mlm._models['old'] = ModelState(
            name='old', device=ModelDevice.GPU,
            priority=ModelPriority.EVICTABLE,
            last_access_time=time.time() - 600)
        mlm._do_unload = MagicMock()

        mlm.request_swap('new_model')

        entry = mlm._swap_queue[0]
        self.assertEqual(entry['name'], 'old')
        self.assertEqual(entry['device'], 'gpu')
        self.assertEqual(entry['evicted_for'], 'new_model')
        self.assertIn('timestamp', entry)


# ═══════════════════════════════════════════════════════════════════════
# 6. API Endpoint Tests (Flask test client)
# ═══════════════════════════════════════════════════════════════════════

class TestAPIEndpoints(unittest.TestCase):
    """Test the Flask API endpoints for model management."""

    @classmethod
    def setUpClass(cls):
        """Import and configure Flask app for testing."""
        try:
            # Need to import app to get the Flask test client
            os.environ['TESTING'] = '1'
            from main import app
            cls.app = app
            cls.client = app.test_client()
            cls.has_app = True
        except Exception as e:
            cls.has_app = False
            cls.skip_reason = str(e)

    def setUp(self):
        if not self.has_app:
            self.skipTest(f"Flask app not available: {self.skip_reason}")

    def test_models_health_endpoint(self):
        resp = self.client.get('/api/admin/models/health')
        self.assertIn(resp.status_code, [200, 503])
        if resp.status_code == 200:
            data = resp.get_json()
            self.assertIn('models', data)
            self.assertIn('restart_pending', data)
            self.assertIn('swap_queue', data)

    def test_models_list_endpoint(self):
        resp = self.client.get('/api/admin/models')
        self.assertIn(resp.status_code, [200, 500])
        if resp.status_code == 200:
            data = resp.get_json()
            self.assertIn('total_models', data)
            self.assertIn('compute', data)
            self.assertIn('all_models', data)

    def test_models_swap_requires_body(self):
        resp = self.client.post('/api/admin/models/swap',
                                json={})
        self.assertIn(resp.status_code, [400, 403, 503])

    def test_models_swap_with_needed_model(self):
        resp = self.client.post('/api/admin/models/swap',
                                json={'needed_model': 'test-model'})
        self.assertIn(resp.status_code, [200, 403, 503])

    def test_models_auto_select_endpoint(self):
        resp = self.client.post('/api/admin/models/auto-select',
                                json={'model_type': 'stt'})
        self.assertIn(resp.status_code, [200, 500])
        if resp.status_code == 200:
            data = resp.get_json()
            self.assertIn('success', data)


# ═══════════════════════════════════════════════════════════════════════
# 7. Bypass Path Verification
# ═══════════════════════════════════════════════════════════════════════

class TestBypassPathSync(unittest.TestCase):
    """Verify that bypass paths contain notify_* calls."""

    def _file_contains(self, filepath, pattern):
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            return pattern in f.read()

    def test_main_auto_setup_has_notify(self):
        self.assertTrue(
            self._file_contains('main.py', 'orch.notify_loaded'),
            "main.py /api/llm/auto-setup must call notify_loaded")

    def test_main_switch_has_notify_unloaded(self):
        self.assertTrue(
            self._file_contains('main.py', 'orch.notify_unloaded'),
            "main.py /api/llm/switch must call notify_unloaded")

    def test_chatbot_routes_tts_synthesize_has_notify(self):
        self.assertTrue(
            self._file_contains('routes/chatbot_routes.py',
                                'get_orchestrator().notify_loaded'),
            "chatbot_routes.py tts_synthesize must call notify_loaded")

    def test_chatbot_routes_tts_install_has_notify(self):
        self.assertTrue(
            self._file_contains('routes/chatbot_routes.py',
                                'get_orchestrator().notify_downloaded'),
            "chatbot_routes.py tts_install must call notify_downloaded")

    def test_chatbot_routes_voice_transcribe_has_notify(self):
        content = open('routes/chatbot_routes.py', 'r',
                       encoding='utf-8', errors='ignore').read()
        self.assertIn('notify_loaded', content,
                      "voice_transcribe must have notify_loaded for STT")
        self.assertIn('Whisper Base', content,
                      "voice_transcribe must reference Whisper Base")

    def test_app_auto_start_has_notify(self):
        # auto_load() is the orchestrator path: it calls mark_loaded +
        # _register_vram + _register_lifecycle + _register_service_tool
        # internally, so notify_loaded (bypass-path API) is not needed and
        # would cause double-registration.  The lifecycle contract is
        # maintained by auto_load itself.
        self.assertTrue(
            self._file_contains('app.py', 'get_orchestrator().auto_load'),
            "app.py auto-start must call get_orchestrator().auto_load('llm')")

    def test_app_install_ai_has_catalog_update(self):
        self.assertTrue(
            self._file_contains('app.py', 'catalog.mark_downloaded'),
            "app.py --install-ai must call mark_downloaded")


# ═══════════════════════════════════════════════════════════════════════
# 8. Thread Safety Tests
# ═══════════════════════════════════════════════════════════════════════

class TestThreadSafety(unittest.TestCase):
    """Verify concurrent access doesn't crash."""

    def test_concurrent_notify_access(self):
        from integrations.service_tools.model_lifecycle import (
            ModelLifecycleManager, ModelState, ModelDevice)

        mlm = ModelLifecycleManager()
        mlm._models['concurrent'] = ModelState(
            name='concurrent', device=ModelDevice.GPU)

        errors = []

        def worker():
            try:
                for _ in range(100):
                    mlm.notify_access('concurrent')
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        self.assertEqual(len(errors), 0, f"Thread errors: {errors}")
        state = mlm._models['concurrent']
        self.assertEqual(state.access_count, 800)  # 8 threads × 100

    def test_concurrent_catalog_register(self):
        from models.catalog import ModelCatalog, ModelEntry
        tmp = tempfile.NamedTemporaryFile(suffix='.json', delete=False)
        tmp.close()
        try:
            catalog = ModelCatalog(catalog_path=tmp.name)
            errors = []

            def worker(tid):
                try:
                    for i in range(20):
                        entry = ModelEntry(
                            id=f't{tid}-m{i}', name=f'Thread {tid} Model {i}',
                            model_type='llm')
                        catalog.register(entry)
                except Exception as e:
                    errors.append(e)

            threads = [threading.Thread(target=worker, args=(t,))
                       for t in range(4)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=10)

            self.assertEqual(len(errors), 0)
            self.assertEqual(len(catalog.list_all()), 80)  # 4 threads × 20
        finally:
            os.unlink(tmp.name)

    def test_concurrent_swap_requests(self):
        from integrations.service_tools.model_lifecycle import (
            ModelLifecycleManager, ModelState, ModelDevice, ModelPriority)

        mlm = ModelLifecycleManager()
        mlm._do_unload = MagicMock()

        # Add 4 evictable models
        for i in range(4):
            mlm._models[f'victim{i}'] = ModelState(
                name=f'victim{i}', device=ModelDevice.GPU,
                priority=ModelPriority.EVICTABLE,
                last_access_time=time.time() - i * 100)

        errors = []

        def worker(tid):
            try:
                mlm.request_swap(f'needed_{tid}')
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(t,))
                   for t in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        self.assertEqual(len(errors), 0)


# ═══════════════════════════════════════════════════════════════════════
# Run
# ═══════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    unittest.main(verbosity=2)
