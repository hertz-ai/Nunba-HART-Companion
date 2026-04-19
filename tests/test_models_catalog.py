"""
Functional tests for models/catalog.py — Nunba ModelCatalog shim.

Tests cover:
- Re-exported HARTOS types (ModelCatalog, ModelEntry, ModelType, etc.)
- populate_llm_presets: converts MODEL_PRESETS → catalog entries
- populate_tts_engines: intentional no-op (HARTOS canonical)
- populate_media_gen: ACE Step + LTX Video entries
- get_catalog(): singleton, shared with HARTOS, populator registration
- LLM entry fields: id, vram, files, tags, capabilities, quality/speed scores
- Idempotency: re-registering same entry doesn't duplicate
- Edge cases: ImportError for llama_installer, empty presets
"""
import logging
import os
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from integrations.service_tools.model_catalog import (
    ModelCatalog,
    ModelEntry,
    ModelType,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _make_preset(name='Test Model 4B', repo='test/repo', size_mb=4000,
                 has_vision=False, mmproj_file=None, mmproj_source_file=None,
                 min_build='b1234', file_name='model.gguf'):
    return SimpleNamespace(
        display_name=name,
        repo_id=repo,
        size_mb=size_mb,
        has_vision=has_vision,
        mmproj_file=mmproj_file,
        mmproj_source_file=mmproj_source_file,
        min_build=min_build,
        file_name=file_name,
    )


def _fresh_catalog():
    """Create a fresh ModelCatalog with no entries."""
    return ModelCatalog()


# ==========================================================================
# 1. Re-exported Types
# ==========================================================================
class TestReExportedTypes:
    """models.catalog should re-export all canonical HARTOS types."""

    def test_model_catalog_importable(self):
        from models.catalog import ModelCatalog as MC
        assert MC is ModelCatalog

    def test_model_entry_importable(self):
        from models.catalog import ModelEntry as ME
        assert ME is ModelEntry

    def test_model_type_importable(self):
        from models.catalog import ModelType as MT
        assert MT is ModelType

    def test_backends_importable(self):
        from models.catalog import BACKENDS
        assert isinstance(BACKENDS, (list, tuple, set, frozenset, dict))

    def test_model_types_importable(self):
        from models.catalog import MODEL_TYPES
        assert MODEL_TYPES is not None

    def test_sources_importable(self):
        from models.catalog import SOURCES
        assert SOURCES is not None


# ==========================================================================
# 2. populate_llm_presets
# ==========================================================================
class TestPopulateLLMPresets:
    """populate_llm_presets should convert MODEL_PRESETS to catalog entries."""

    def test_adds_entries_from_presets(self):
        from models.catalog import populate_llm_presets
        cat = _fresh_catalog()
        presets = [_make_preset('Qwen3.5 4B', 'qwen/4b', 4000)]
        with patch('models.catalog.MODEL_PRESETS', presets, create=True):
            with patch.dict('sys.modules', {'llama.llama_installer': MagicMock(MODEL_PRESETS=presets)}):
                # Re-import to pick up the mock
                import importlib

                import models.catalog as mc
                importlib.reload(mc)
                added = mc.populate_llm_presets(cat)
        assert added >= 1

    def test_entry_id_is_slugified(self):
        from models.catalog import populate_llm_presets
        cat = _fresh_catalog()
        presets = [_make_preset('My Cool Model (7B)', 'test/cool', 7000)]
        with patch.dict('sys.modules', {'llama.llama_installer': MagicMock(MODEL_PRESETS=presets)}):
            import importlib

            import models.catalog as mc
            importlib.reload(mc)
            mc.populate_llm_presets(cat)
        entry = cat.get('llm-my-cool-model-7b')
        assert entry is not None

    def test_entry_has_correct_model_type(self):
        cat = _fresh_catalog()
        presets = [_make_preset()]
        with patch.dict('sys.modules', {'llama.llama_installer': MagicMock(MODEL_PRESETS=presets)}):
            import importlib

            import models.catalog as mc
            importlib.reload(mc)
            mc.populate_llm_presets(cat)
        entries = [e for e in cat.list_all() if e.model_type == ModelType.LLM]
        assert len(entries) >= 1

    def test_first_preset_gets_recommended_tag(self):
        cat = _fresh_catalog()
        presets = [_make_preset('First', 'a/b', 2000), _make_preset('Second', 'c/d', 3000)]
        with patch.dict('sys.modules', {'llama.llama_installer': MagicMock(MODEL_PRESETS=presets)}):
            import importlib

            import models.catalog as mc
            importlib.reload(mc)
            mc.populate_llm_presets(cat)
        first = cat.get('llm-first')
        assert first is not None
        assert 'recommended' in first.tags

    def test_second_preset_no_recommended_tag(self):
        cat = _fresh_catalog()
        presets = [_make_preset('First', 'a/b', 2000), _make_preset('Second', 'c/d', 3000)]
        with patch.dict('sys.modules', {'llama.llama_installer': MagicMock(MODEL_PRESETS=presets)}):
            import importlib

            import models.catalog as mc
            importlib.reload(mc)
            mc.populate_llm_presets(cat)
        second = cat.get('llm-second')
        assert second is not None
        assert 'recommended' not in second.tags

    def test_vision_model_gets_vision_tag(self):
        cat = _fresh_catalog()
        presets = [_make_preset('Vision 4B', 'v/4b', 4000, has_vision=True,
                                mmproj_file='mmproj.gguf', mmproj_source_file='mmproj-F16.gguf')]
        with patch.dict('sys.modules', {'llama.llama_installer': MagicMock(MODEL_PRESETS=presets)}):
            import importlib

            import models.catalog as mc
            importlib.reload(mc)
            mc.populate_llm_presets(cat)
        entry = cat.get('llm-vision-4b')
        assert entry is not None
        assert 'vision' in entry.tags
        assert entry.capabilities.get('has_vision') is True

    def test_vision_model_stores_mmproj_files(self):
        cat = _fresh_catalog()
        presets = [_make_preset('VLM', 'v/vlm', 5000, has_vision=True,
                                mmproj_file='mmproj-local.gguf',
                                mmproj_source_file='mmproj-F16.gguf')]
        with patch.dict('sys.modules', {'llama.llama_installer': MagicMock(MODEL_PRESETS=presets)}):
            import importlib

            import models.catalog as mc
            importlib.reload(mc)
            mc.populate_llm_presets(cat)
        entry = cat.get('llm-vlm')
        assert entry.files.get('mmproj') == 'mmproj-local.gguf'
        assert entry.files.get('mmproj_source') == 'mmproj-F16.gguf'

    def test_vram_calculated_from_size_mb(self):
        cat = _fresh_catalog()
        presets = [_make_preset('Small', 's/s', 2048)]
        with patch.dict('sys.modules', {'llama.llama_installer': MagicMock(MODEL_PRESETS=presets)}):
            import importlib

            import models.catalog as mc
            importlib.reload(mc)
            mc.populate_llm_presets(cat)
        entry = cat.get('llm-small')
        assert entry.vram_gb == round(2048 / 1024.0, 1)

    def test_quality_score_bounded(self):
        cat = _fresh_catalog()
        presets = [_make_preset('Huge', 'h/h', 50000)]
        with patch.dict('sys.modules', {'llama.llama_installer': MagicMock(MODEL_PRESETS=presets)}):
            import importlib

            import models.catalog as mc
            importlib.reload(mc)
            mc.populate_llm_presets(cat)
        entry = cat.get('llm-huge')
        assert entry.quality_score <= 0.95

    def test_speed_score_bounded(self):
        cat = _fresh_catalog()
        presets = [_make_preset('Huge', 'h/h', 50000)]
        with patch.dict('sys.modules', {'llama.llama_installer': MagicMock(MODEL_PRESETS=presets)}):
            import importlib

            import models.catalog as mc
            importlib.reload(mc)
            mc.populate_llm_presets(cat)
        entry = cat.get('llm-huge')
        assert entry.speed_score >= 0.3

    def test_import_error_returns_zero(self):
        """If llama_installer not available, returns 0 gracefully."""
        cat = _fresh_catalog()
        from models.catalog import populate_llm_presets
        # Make llama.llama_installer import fail inside populate_llm_presets
        with patch.dict('sys.modules', {'llama.llama_installer': None}):
            result = populate_llm_presets(cat)
        assert result == 0

    def test_idempotent_no_duplicates(self):
        cat = _fresh_catalog()
        presets = [_make_preset('Dupe', 'd/d', 3000)]
        with patch.dict('sys.modules', {'llama.llama_installer': MagicMock(MODEL_PRESETS=presets)}):
            import importlib

            import models.catalog as mc
            importlib.reload(mc)
            mc.populate_llm_presets(cat)
            added2 = mc.populate_llm_presets(cat)
        assert added2 == 0  # already registered

    def test_qwen_gets_large_context(self):
        cat = _fresh_catalog()
        presets = [_make_preset('Qwen3.5 4B Instruct', 'q/4b', 4000)]
        with patch.dict('sys.modules', {'llama.llama_installer': MagicMock(MODEL_PRESETS=presets)}):
            import importlib

            import models.catalog as mc
            importlib.reload(mc)
            mc.populate_llm_presets(cat)
        entry = cat.get('llm-qwen3.5-4b-instruct')
        assert entry is not None
        assert entry.capabilities.get('context_length') == 256000


# ==========================================================================
# 3. populate_tts_engines (no-op)
# ==========================================================================
class TestPopulateTTSEngines:
    """populate_tts_engines is intentionally a no-op."""

    def test_returns_zero(self):
        from models.catalog import populate_tts_engines
        cat = _fresh_catalog()
        assert populate_tts_engines(cat) == 0

    def test_does_not_add_entries(self):
        from models.catalog import populate_tts_engines
        cat = _fresh_catalog()
        before = len(cat.list_all())
        populate_tts_engines(cat)
        assert len(cat.list_all()) == before


# ==========================================================================
# 4. populate_media_gen
# ==========================================================================
class TestPopulateMediaGen:
    """populate_media_gen registers ACE Step and LTX Video entries."""

    def test_adds_two_entries(self):
        from models.catalog import populate_media_gen
        cat = _fresh_catalog()
        # Ensure entries don't already exist
        added = populate_media_gen(cat)
        # First call adds 2 (or 0 if already in shared singleton); verify both exist
        ace = cat.get('audio_gen-acestep')
        ltx = cat.get('video_gen-ltx2')
        assert ace is not None
        assert ltx is not None

    def test_ace_step_entry(self):
        from models.catalog import populate_media_gen
        cat = _fresh_catalog()
        populate_media_gen(cat)
        ace = cat.get('audio_gen-acestep')
        assert ace is not None
        assert ace.model_type == ModelType.AUDIO_GEN
        assert ace.supports_gpu is True
        assert ace.supports_cpu is True
        assert 'music' in ace.tags

    def test_ltx_video_entry(self):
        from models.catalog import populate_media_gen
        cat = _fresh_catalog()
        populate_media_gen(cat)
        ltx = cat.get('video_gen-ltx2')
        assert ltx is not None
        assert ltx.model_type == ModelType.VIDEO_GEN
        assert ltx.supports_gpu is True
        assert ltx.supports_cpu is False
        assert 'video' in ltx.tags

    def test_idempotent(self):
        from models.catalog import populate_media_gen
        cat = _fresh_catalog()
        populate_media_gen(cat)
        added2 = populate_media_gen(cat)
        assert added2 == 0

    def test_ace_step_vram(self):
        from models.catalog import populate_media_gen
        cat = _fresh_catalog()
        populate_media_gen(cat)
        ace = cat.get('audio_gen-acestep')
        assert ace.vram_gb == 6.0

    def test_ltx_video_vram(self):
        from models.catalog import populate_media_gen
        cat = _fresh_catalog()
        populate_media_gen(cat)
        ltx = cat.get('video_gen-ltx2')
        assert ltx.vram_gb == 8.0

    def test_both_have_idle_timeout(self):
        from models.catalog import populate_media_gen
        cat = _fresh_catalog()
        populate_media_gen(cat)
        ace = cat.get('audio_gen-acestep')
        ltx = cat.get('video_gen-ltx2')
        assert ace.idle_timeout_s == 300
        assert ltx.idle_timeout_s == 300

    def test_auto_load_is_false(self):
        from models.catalog import populate_media_gen
        cat = _fresh_catalog()
        populate_media_gen(cat)
        ace = cat.get('audio_gen-acestep')
        ltx = cat.get('video_gen-ltx2')
        assert ace.auto_load is False
        assert ltx.auto_load is False


# ==========================================================================
# 5. get_catalog() singleton behavior
# ==========================================================================
class TestGetCatalog:
    """get_catalog() should return a shared singleton."""

    def test_returns_model_catalog_instance(self):
        from models.catalog import get_catalog
        cat = get_catalog()
        assert isinstance(cat, ModelCatalog)

    def test_same_instance_on_repeated_calls(self):
        from models.catalog import get_catalog
        a = get_catalog()
        b = get_catalog()
        assert a is b

    def test_shared_with_hartos_module(self):
        import integrations.service_tools.model_catalog as hartos_mod

        from models.catalog import get_catalog
        cat = get_catalog()
        assert cat is hartos_mod._catalog_instance
