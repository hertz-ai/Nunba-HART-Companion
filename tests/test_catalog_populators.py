"""
Tests for models/catalog.py — Nunba-specific populator functions,
singleton behaviour, ModelEntry field validation, and backward-compat aliases.

FT  = Functional Tests
NFT = Non-Functional Tests (thread safety, idempotency, performance)
"""

import os
import sys
import tempfile
import threading
import time
import unittest
from dataclasses import fields as dc_fields
from unittest.mock import MagicMock, patch

# Ensure project root is on path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import integrations.service_tools.model_catalog as _hartos_mod

from models.catalog import (
    ModelCatalog,
    ModelEntry,
    ModelType,
    get_catalog,
    populate_llm_presets,
    populate_media_gen,
    populate_tts_engines,
)

# ── Helpers ───────────────────────────────────────────────────────────

def _fresh_catalog():
    """Return a brand-new ModelCatalog backed by a disposable temp file."""
    tmp = tempfile.NamedTemporaryFile(suffix='.json', delete=False)
    tmp.close()
    return ModelCatalog(catalog_path=tmp.name), tmp.name


def _make_preset(display_name='Test Model', repo_id='org/repo',
                 file_name='model.gguf', size_mb=2000, description='test',
                 has_vision=False, mmproj_file=None, mmproj_source_file=None,
                 min_build=None):
    """Create a duck-typed ModelPreset without importing llama_installer."""
    p = MagicMock()
    p.display_name = display_name
    p.repo_id = repo_id
    p.file_name = file_name
    p.size_mb = size_mb
    p.description = description
    p.has_vision = has_vision
    p.mmproj_file = mmproj_file
    p.mmproj_source_file = mmproj_source_file
    p.min_build = min_build
    return p


# ═══════════════════════════════════════════════════════════════════════
# 1. populate_llm_presets — FT
# ═══════════════════════════════════════════════════════════════════════

class TestPopulateLlmPresets(unittest.TestCase):
    """FT: populate_llm_presets registers entries correctly."""

    def setUp(self):
        self.catalog, self._tmp = _fresh_catalog()

    def tearDown(self):
        try:
            os.unlink(self._tmp)
        except Exception:
            pass

    # ── Basic registration ────────────────────────────────────────

    def test_registers_all_presets(self):
        """Each preset in MODEL_PRESETS becomes one catalog entry."""
        presets = [
            _make_preset('Alpha', size_mb=1000),
            _make_preset('Beta', size_mb=2000),
            _make_preset('Gamma', size_mb=3000),
        ]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            added = populate_llm_presets(self.catalog)
        self.assertEqual(added, 3)
        self.assertEqual(len(self.catalog.list_by_type(ModelType.LLM)), 3)

    def test_entry_id_slug_format(self):
        """ID is llm-<slugified display_name>."""
        presets = [_make_preset('Qwen3.5-4B VL (Recommended)')]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
        entry = self.catalog.get('llm-qwen3.5-4b-vl-recommended')
        self.assertIsNotNone(entry)

    def test_first_preset_gets_recommended_tag(self):
        """The first preset (index 0) receives the 'recommended' tag."""
        presets = [_make_preset('First'), _make_preset('Second')]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
        first = self.catalog.get('llm-first')
        second = self.catalog.get('llm-second')
        self.assertIn('recommended', first.tags)
        self.assertNotIn('recommended', second.tags)

    def test_first_preset_auto_load(self):
        """Only the first preset has auto_load=True."""
        presets = [_make_preset('A'), _make_preset('B')]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
        self.assertTrue(self.catalog.get('llm-a').auto_load)
        self.assertFalse(self.catalog.get('llm-b').auto_load)

    # ── Vision models ─────────────────────────────────────────────

    def test_vision_model_gets_vision_tag(self):
        presets = [_make_preset('Vis', has_vision=True,
                                mmproj_file='mmproj-Vis-F16.gguf',
                                mmproj_source_file='mmproj-F16.gguf')]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
        entry = self.catalog.get('llm-vis')
        self.assertIn('vision', entry.tags)
        self.assertTrue(entry.capabilities.get('has_vision'))

    def test_vision_model_mmproj_files(self):
        """Vision entries store both mmproj and mmproj_source in files dict."""
        presets = [_make_preset('Vis', has_vision=True,
                                mmproj_file='mmproj-Vis-F16.gguf',
                                mmproj_source_file='mmproj-F16.gguf')]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
        files = self.catalog.get('llm-vis').files
        self.assertEqual(files['mmproj'], 'mmproj-Vis-F16.gguf')
        self.assertEqual(files['mmproj_source'], 'mmproj-F16.gguf')

    def test_non_vision_model_no_mmproj(self):
        """Non-vision entries must NOT have mmproj keys."""
        presets = [_make_preset('Plain', has_vision=False)]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
        files = self.catalog.get('llm-plain').files
        self.assertNotIn('mmproj', files)

    def test_mmproj_source_fallback(self):
        """If mmproj_source_file is None, mmproj_source falls back to mmproj_file."""
        presets = [_make_preset('Fall', has_vision=True,
                                mmproj_file='mmproj-F16.gguf',
                                mmproj_source_file=None)]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
        files = self.catalog.get('llm-fall').files
        self.assertEqual(files['mmproj_source'], 'mmproj-F16.gguf')

    # ── Qwen3.5 special caps ─────────────────────────────────────

    def test_qwen35_context_length(self):
        """Qwen3.5 models get 256K context_length capability."""
        presets = [_make_preset('Qwen3.5-4B VL')]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
        caps = self.catalog.get('llm-qwen3.5-4b-vl').capabilities
        self.assertEqual(caps['context_length'], 256000)
        self.assertEqual(caps['chat_template'], 'jinja')

    def test_non_qwen35_no_extra_caps(self):
        """Non-Qwen3.5 models don't get context_length or chat_template."""
        presets = [_make_preset('Llama3')]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
        caps = self.catalog.get('llm-llama3').capabilities
        self.assertNotIn('context_length', caps)

    # ── Score calculation ─────────────────────────────────────────

    def test_quality_score_capped_at_095(self):
        """quality_score = min(0.5 + size/20000, 0.95)."""
        presets = [_make_preset('Huge', size_mb=50000)]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
        self.assertAlmostEqual(self.catalog.get('llm-huge').quality_score, 0.95)

    def test_speed_score_floored_at_03(self):
        """speed_score = max(0.3, 1.0 - size/25000)."""
        presets = [_make_preset('Big', size_mb=50000)]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
        self.assertAlmostEqual(self.catalog.get('llm-big').speed_score, 0.3)

    def test_priority_decreases_with_index(self):
        """priority = 90 - i * 5."""
        presets = [_make_preset('P0'), _make_preset('P1'), _make_preset('P2')]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
        self.assertEqual(self.catalog.get('llm-p0').priority, 90)
        self.assertEqual(self.catalog.get('llm-p1').priority, 85)
        self.assertEqual(self.catalog.get('llm-p2').priority, 80)

    # ── Dedup ─────────────────────────────────────────────────────

    def test_dedup_skips_existing(self):
        """Running twice yields no new registrations."""
        presets = [_make_preset('Dedup')]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            first = populate_llm_presets(self.catalog)
            second = populate_llm_presets(self.catalog)
        self.assertEqual(first, 1)
        self.assertEqual(second, 0)

    # ── Import failure ────────────────────────────────────────────

    def test_import_error_returns_zero(self):
        """If llama_installer is unavailable, returns 0 gracefully."""
        with patch.dict('sys.modules', {'llama.llama_installer': None}):
            # Importing from None module raises ImportError
            added = populate_llm_presets(self.catalog)
        self.assertEqual(added, 0)

    # ── Backend and source ────────────────────────────────────────

    def test_backend_is_llama_cpp(self):
        presets = [_make_preset('X')]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
        self.assertEqual(self.catalog.get('llm-x').backend, 'llama.cpp')

    def test_source_is_huggingface(self):
        presets = [_make_preset('Y')]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
        self.assertEqual(self.catalog.get('llm-y').source, 'huggingface')

    def test_vram_and_disk_calculated_from_size_mb(self):
        presets = [_make_preset('Calc', size_mb=4096)]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
        entry = self.catalog.get('llm-calc')
        self.assertAlmostEqual(entry.vram_gb, round(4096 / 1024.0, 1))
        self.assertAlmostEqual(entry.disk_gb, round(4096 / 1024.0, 1))
        self.assertAlmostEqual(entry.ram_gb, round(4096 / 1024.0 * 1.2, 1))


# ═══════════════════════════════════════════════════════════════════════
# 2. populate_tts_engines — FT
# ═══════════════════════════════════════════════════════════════════════

class TestPopulateTtsEngines(unittest.TestCase):
    """FT: populate_tts_engines is an intentional no-op."""

    def test_returns_zero(self):
        catalog, tmp = _fresh_catalog()
        try:
            result = populate_tts_engines(catalog)
            self.assertEqual(result, 0)
        finally:
            os.unlink(tmp)

    def test_does_not_register_anything(self):
        catalog, tmp = _fresh_catalog()
        try:
            populate_tts_engines(catalog)
            self.assertEqual(len(catalog.list_all()), 0)
        finally:
            os.unlink(tmp)


# ═══════════════════════════════════════════════════════════════════════
# 3. populate_media_gen — FT
# ═══════════════════════════════════════════════════════════════════════

class TestPopulateMediaGen(unittest.TestCase):
    """FT: populate_media_gen registers ACE Step and LTX Video."""

    def setUp(self):
        self.catalog, self._tmp = _fresh_catalog()

    def tearDown(self):
        try:
            os.unlink(self._tmp)
        except Exception:
            pass

    def test_registers_two_entries(self):
        added = populate_media_gen(self.catalog)
        self.assertEqual(added, 2)

    def test_acestep_entry_exists(self):
        populate_media_gen(self.catalog)
        entry = self.catalog.get('audio_gen-acestep')
        self.assertIsNotNone(entry)
        self.assertEqual(entry.model_type, ModelType.AUDIO_GEN)

    def test_ltx_entry_exists(self):
        populate_media_gen(self.catalog)
        entry = self.catalog.get('video_gen-ltx2')
        self.assertIsNotNone(entry)
        self.assertEqual(entry.model_type, ModelType.VIDEO_GEN)

    def test_acestep_tags(self):
        populate_media_gen(self.catalog)
        tags = self.catalog.get('audio_gen-acestep').tags
        self.assertIn('local', tags)
        self.assertIn('music', tags)
        self.assertIn('generative', tags)

    def test_ltx_tags(self):
        populate_media_gen(self.catalog)
        tags = self.catalog.get('video_gen-ltx2').tags
        self.assertIn('local', tags)
        self.assertIn('video', tags)
        self.assertIn('generative', tags)

    def test_acestep_supports_cpu(self):
        populate_media_gen(self.catalog)
        entry = self.catalog.get('audio_gen-acestep')
        self.assertTrue(entry.supports_cpu)
        self.assertTrue(entry.supports_gpu)

    def test_ltx_gpu_only(self):
        populate_media_gen(self.catalog)
        entry = self.catalog.get('video_gen-ltx2')
        self.assertFalse(entry.supports_cpu)
        self.assertTrue(entry.supports_gpu)

    def test_dedup_media_gen(self):
        first = populate_media_gen(self.catalog)
        second = populate_media_gen(self.catalog)
        self.assertEqual(first, 2)
        self.assertEqual(second, 0)

    def test_auto_load_false(self):
        """Media gen models should not auto-load."""
        populate_media_gen(self.catalog)
        self.assertFalse(self.catalog.get('audio_gen-acestep').auto_load)
        self.assertFalse(self.catalog.get('video_gen-ltx2').auto_load)

    def test_cpu_offload_method(self):
        populate_media_gen(self.catalog)
        self.assertEqual(
            self.catalog.get('audio_gen-acestep').cpu_offload_method,
            'torch_to_cpu')
        self.assertEqual(
            self.catalog.get('video_gen-ltx2').cpu_offload_method,
            'torch_to_cpu')

    def test_idle_timeout(self):
        populate_media_gen(self.catalog)
        self.assertEqual(self.catalog.get('audio_gen-acestep').idle_timeout_s, 300)
        self.assertEqual(self.catalog.get('video_gen-ltx2').idle_timeout_s, 300)


# ═══════════════════════════════════════════════════════════════════════
# 4. get_catalog() singleton — FT + NFT
# ═══════════════════════════════════════════════════════════════════════

class TestGetCatalogSingleton(unittest.TestCase):
    """FT + NFT: get_catalog() returns a shared singleton."""

    def setUp(self):
        # Reset singleton state so each test starts clean
        self._original_instance = _hartos_mod._catalog_instance
        self._original_registered = __import__('models.catalog',
                                                fromlist=['_populators_registered'])
        import models.catalog as _mc
        self._mc = _mc
        self._mc._populators_registered = False
        _hartos_mod._catalog_instance = None

    def tearDown(self):
        _hartos_mod._catalog_instance = self._original_instance
        self._mc._populators_registered = False

    def test_returns_model_catalog_instance(self):
        cat = get_catalog()
        self.assertIsInstance(cat, ModelCatalog)

    def test_same_instance_on_repeated_calls(self):
        a = get_catalog()
        b = get_catalog()
        self.assertIs(a, b)

    def test_shared_with_hartos_module(self):
        cat = get_catalog()
        self.assertIs(cat, _hartos_mod._catalog_instance)

    def test_reuses_existing_hartos_instance(self):
        """If HARTOS already has an instance, get_catalog() reuses it."""
        existing = ModelCatalog()
        _hartos_mod._catalog_instance = existing
        cat = get_catalog()
        self.assertIs(cat, existing)

    # ── NFT: thread safety ────────────────────────────────────────

    def test_thread_safe_singleton(self):
        """Multiple threads calling get_catalog() all get the same instance."""
        results = []
        barrier = threading.Barrier(8)

        def worker():
            barrier.wait()
            results.append(id(get_catalog()))

        threads = [threading.Thread(target=worker) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        self.assertEqual(len(set(results)), 1,
                         "All threads must receive the same singleton")


# ═══════════════════════════════════════════════════════════════════════
# 5. ModelEntry field validation — FT
# ═══════════════════════════════════════════════════════════════════════

class TestModelEntryFields(unittest.TestCase):
    """FT: ModelEntry dataclass has expected fields with correct defaults."""

    def test_required_fields_present(self):
        """Core fields exist on the dataclass."""
        names = {f.name for f in dc_fields(ModelEntry)}
        for required in ('id', 'name', 'model_type', 'vram_gb', 'ram_gb',
                         'quality_score', 'backend', 'tags', 'enabled'):
            self.assertIn(required, names)

    def test_default_enabled_true(self):
        entry = ModelEntry(id='t', name='t', model_type='llm')
        self.assertTrue(entry.enabled)

    def test_default_tags_empty_list(self):
        entry = ModelEntry(id='t', name='t', model_type='llm')
        self.assertIsInstance(entry.tags, list)

    def test_default_auto_load_false(self):
        entry = ModelEntry(id='t', name='t', model_type='llm')
        self.assertFalse(entry.auto_load)


# ═══════════════════════════════════════════════════════════════════════
# 6. Backward-compat: ENGINE_CAPABILITIES alias — FT
# ═══════════════════════════════════════════════════════════════════════

class TestBackwardCompatImports(unittest.TestCase):
    """FT: Legacy aliases still importable from tts.tts_engine."""

    def test_engine_capabilities_importable(self):
        from tts.tts_engine import ENGINE_CAPABILITIES
        self.assertIsInstance(ENGINE_CAPABILITIES, dict)

    def test_lang_engine_preference_importable(self):
        from tts.tts_engine import LANG_ENGINE_PREFERENCE
        self.assertIsInstance(LANG_ENGINE_PREFERENCE, dict)


# ═══════════════════════════════════════════════════════════════════════
# 7. NFT: Idempotency and perf
# ═══════════════════════════════════════════════════════════════════════

class TestNFTIdempotency(unittest.TestCase):
    """NFT: Repeated populate calls are idempotent."""

    def setUp(self):
        self.catalog, self._tmp = _fresh_catalog()

    def tearDown(self):
        try:
            os.unlink(self._tmp)
        except Exception:
            pass

    def test_media_gen_triple_call_idempotent(self):
        populate_media_gen(self.catalog)
        populate_media_gen(self.catalog)
        populate_media_gen(self.catalog)
        self.assertEqual(len(self.catalog.list_all()), 2)

    def test_llm_presets_triple_call_idempotent(self):
        presets = [_make_preset('Idem')]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            populate_llm_presets(self.catalog)
            populate_llm_presets(self.catalog)
            populate_llm_presets(self.catalog)
        self.assertEqual(len(self.catalog.list_by_type(ModelType.LLM)), 1)

    def test_populate_perf_under_50ms(self):
        """NFT: Populating 20 LLM presets completes in under 50ms."""
        presets = [_make_preset(f'Model-{i}', size_mb=1000 + i * 100)
                   for i in range(20)]
        with patch('llama.llama_installer.MODEL_PRESETS', presets, create=True):
            t0 = time.perf_counter()
            populate_llm_presets(self.catalog)
            elapsed = time.perf_counter() - t0
        self.assertLess(elapsed, 0.05, f"Took {elapsed:.3f}s, expected < 50ms")


# ═══════════════════════════════════════════════════════════════════════════
# Drift-guard (task #330): populate_media_gen must NOT mutate ModelEntry
# fields via direct attribute assignment. All cross-populator amendments
# must go through catalog.override() to preserve single-writer semantics.
# ═══════════════════════════════════════════════════════════════════════════

class TestPopulateMediaGenNoDirectMutation(unittest.TestCase):
    """Drift-guard: AST scan of populate_media_gen rejects direct
    ``_existing.X = Y`` mutation of a ModelEntry attribute.

    If this test fails, a commit reintroduced the pre-#330 parallel
    write path. Route the amendment through catalog.override() instead.
    """

    def _get_function_ast(self):
        import ast
        import inspect

        from models import catalog as _mc
        src = inspect.getsource(_mc.populate_media_gen)
        return ast.parse(src).body[0]

    def test_no_direct_attribute_assignment_on_existing_entry(self):
        import ast
        fn = self._get_function_ast()

        offenders = []
        for node in ast.walk(fn):
            if not isinstance(node, ast.Assign):
                continue
            for target in node.targets:
                # Match `<name>.<attr> = <value>` where <name> looks like
                # a ModelEntry handle returned by catalog.get().
                if (isinstance(target, ast.Attribute)
                        and isinstance(target.value, ast.Name)
                        and target.value.id.lstrip('_').startswith('existing')):
                    offenders.append(
                        f"{target.value.id}.{target.attr} = ..."
                        f" at line {getattr(node, 'lineno', '?')}",
                    )

        self.assertFalse(
            offenders,
            msg=(
                "populate_media_gen must not mutate a returned ModelEntry "
                "directly — use catalog.override() to preserve catalog "
                f"lock + dirty-flag + log semantics.\nOffenders: {offenders}"
            ),
        )

    def test_calls_catalog_override(self):
        """Positive assertion: the refactored path must invoke
        catalog.override(...) at least once."""
        import ast
        fn = self._get_function_ast()

        found = False
        for node in ast.walk(fn):
            if (isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Attribute)
                    and node.func.attr == 'override'):
                found = True
                break

        self.assertTrue(
            found,
            msg=("populate_media_gen is expected to call catalog.override() "
                 "for the HARTOS-registered audio_gen-acestep amendment"),
        )


class TestPopulateMediaGenOverrideBehavior(unittest.TestCase):
    """Behavioral test for the override branch of populate_media_gen.

    Simulates the cross-populator scenario: HARTOS registers a narrower
    audio_gen-acestep first, then Nunba's populate_media_gen runs and
    must amend (not wholesale-replace) the entry.
    """

    def setUp(self):
        self.catalog, self._tmp = _fresh_catalog()

    def tearDown(self):
        try:
            os.unlink(self._tmp)
        except Exception:
            pass

    def test_override_branch_merges_nunba_fields(self):
        # Simulate HARTOS fallback populator having registered first.
        self.catalog.register(ModelEntry(
            id='audio_gen-acestep',
            name='ACE Step (HARTOS fallback)',
            model_type=ModelType.AUDIO_GEN,
            source='huggingface',
            repo_id='ACE-Step/ACE-Step-v1-3.5B',
            vram_gb=6.0,
            tags=['local', 'audio_gen'],   # HARTOS's narrower tag set
            supports_cpu=False,            # HARTOS's vram<5 heuristic
            idle_timeout_s=600,            # HARTOS's LLM default
        ), persist=False)

        added = populate_media_gen(self.catalog)
        # The HARTOS entry already existed, so ACE Step contributes 0;
        # only video_gen-ltx2 is newly added.
        self.assertEqual(added, 1)

        entry = self.catalog.get('audio_gen-acestep')
        self.assertIn('local', entry.tags)
        self.assertIn('music', entry.tags)
        self.assertIn('generative', entry.tags)
        # HARTOS's original tag must be preserved (merge, not replace).
        self.assertIn('audio_gen', entry.tags)
        self.assertTrue(entry.supports_cpu)
        self.assertEqual(entry.idle_timeout_s, 300)


if __name__ == '__main__':
    unittest.main()
