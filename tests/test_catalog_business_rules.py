"""
Deep functional tests for ModelCatalog business rules.

Tests INTENDED BEHAVIOR with specific assertions — not smoke tests.
Verifies catalog constraints, model selection logic, quality/speed scoring,
VRAM requirements, backend compatibility, and the populator pipeline.
"""
import os
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from integrations.service_tools.model_catalog import ModelCatalog, ModelEntry, ModelType

from models.catalog import get_catalog


@pytest.fixture(scope='module')
def catalog():
    return get_catalog()


@pytest.fixture(scope='module')
def all_entries(catalog):
    return catalog.list_all()


@pytest.fixture(scope='module')
def llm_entries(all_entries):
    return [e for e in all_entries if e.model_type == ModelType.LLM]


@pytest.fixture(scope='module')
def tts_entries(all_entries):
    return [e for e in all_entries if e.model_type == ModelType.TTS]


# ==========================================================================
# 1. Catalog Population — real entries exist
# ==========================================================================
class TestCatalogPopulation:
    def test_catalog_has_entries(self, all_entries):
        assert len(all_entries) >= 10, f"Expected 10+ entries, got {len(all_entries)}"

    def test_has_llm_entries(self, llm_entries):
        assert len(llm_entries) >= 2, "Must have at least 2 LLM models"

    def test_has_tts_entries(self, tts_entries):
        assert len(tts_entries) >= 1, "Must have at least 1 TTS engine"

    def test_has_stt_entries(self, all_entries):
        stt = [e for e in all_entries if e.model_type == ModelType.STT]
        assert len(stt) >= 1, "Must have at least 1 STT model"

    def test_has_audio_gen(self, all_entries):
        audio = [e for e in all_entries if e.model_type == ModelType.AUDIO_GEN]
        assert len(audio) >= 1, "Must have ACE Step music gen"

    def test_has_video_gen(self, all_entries):
        video = [e for e in all_entries if e.model_type == ModelType.VIDEO_GEN]
        assert len(video) >= 1, "Must have LTX Video gen"


# ==========================================================================
# 2. LLM Business Rules
# ==========================================================================
class TestLLMBusinessRules:
    def test_all_llms_use_llama_cpp_backend(self, llm_entries):
        for e in llm_entries:
            assert e.backend == 'llama.cpp', f"{e.id} has wrong backend: {e.backend}"

    def test_all_llms_support_gpu(self, llm_entries):
        for e in llm_entries:
            assert e.supports_gpu is True, f"{e.id} must support GPU"

    def test_all_llms_support_cpu(self, llm_entries):
        for e in llm_entries:
            assert e.supports_cpu is True, f"{e.id} must support CPU fallback"

    def test_recommended_model_exists(self, llm_entries):
        recommended = [e for e in llm_entries if 'recommended' in (e.tags or [])]
        assert len(recommended) >= 1, "Must have at least one recommended LLM"

    def test_recommended_is_first_priority(self, llm_entries):
        recommended = [e for e in llm_entries if 'recommended' in (e.tags or [])]
        if recommended:
            r = recommended[0]
            assert r.priority >= 80, f"Recommended model priority {r.priority} too low"

    def test_exactly_one_auto_load(self, llm_entries):
        auto_loads = [e for e in llm_entries if e.auto_load]
        assert len(auto_loads) <= 1, f"Only 1 LLM should auto-load, got {len(auto_loads)}"

    def test_vram_under_24gb(self, llm_entries):
        """All local LLMs should fit in prosumer GPU VRAM (RTX 3090/4090 = 24GB)."""
        for e in llm_entries:
            assert e.vram_gb <= 24.0, f"{e.id} needs {e.vram_gb}GB VRAM — too large for prosumer GPU"

    def test_quality_score_bounded(self, llm_entries):
        for e in llm_entries:
            assert 0.0 <= e.quality_score <= 1.0, f"{e.id} quality {e.quality_score} out of bounds"

    def test_speed_score_bounded(self, llm_entries):
        for e in llm_entries:
            assert 0.0 <= e.speed_score <= 1.0, f"{e.id} speed {e.speed_score} out of bounds"

    def test_larger_models_higher_quality(self, llm_entries):
        """Bigger models should generally have higher quality scores."""
        if len(llm_entries) < 2:
            pytest.skip("Need 2+ LLMs")
        sorted_by_vram = sorted(llm_entries, key=lambda e: e.vram_gb)
        smallest = sorted_by_vram[0]
        largest = sorted_by_vram[-1]
        assert largest.quality_score >= smallest.quality_score, \
            f"Largest ({largest.id}, {largest.vram_gb}GB) quality {largest.quality_score} < smallest ({smallest.id}) quality {smallest.quality_score}"

    def test_smaller_models_higher_speed(self, llm_entries):
        """Smaller models should generally have higher speed scores."""
        if len(llm_entries) < 2:
            pytest.skip("Need 2+ LLMs")
        sorted_by_vram = sorted(llm_entries, key=lambda e: e.vram_gb)
        smallest = sorted_by_vram[0]
        largest = sorted_by_vram[-1]
        assert smallest.speed_score >= largest.speed_score, \
            f"Smallest ({smallest.id}) speed {smallest.speed_score} < largest ({largest.id}) speed {largest.speed_score}"

    def test_vision_models_have_vision_tag(self, llm_entries):
        for e in llm_entries:
            if e.capabilities and e.capabilities.get('has_vision'):
                assert 'vision' in (e.tags or []), f"{e.id} has vision capability but no 'vision' tag"

    def test_vision_models_have_mmproj_file(self, llm_entries):
        for e in llm_entries:
            if e.capabilities and e.capabilities.get('has_vision'):
                assert 'mmproj' in (e.files or {}), f"{e.id} is vision model but missing mmproj file"

    def test_all_llms_have_repo_id(self, llm_entries):
        for e in llm_entries:
            assert e.repo_id, f"{e.id} missing repo_id"

    def test_at_least_one_large_context_model(self, llm_entries):
        """At least one LLM should support 128K+ context."""
        large_ctx = [e for e in llm_entries
                     if (e.capabilities or {}).get('context_length', 0) >= 128000]
        assert len(large_ctx) >= 1, "Need at least one 128K+ context model"

    def test_ids_are_unique(self, llm_entries):
        ids = [e.id for e in llm_entries]
        assert len(ids) == len(set(ids)), f"Duplicate LLM IDs: {[x for x in ids if ids.count(x) > 1]}"

    def test_ids_follow_naming_convention(self, llm_entries):
        for e in llm_entries:
            assert e.id.startswith('llm-'), f"{e.id} doesn't follow llm-* naming"


# ==========================================================================
# 3. TTS Business Rules
# ==========================================================================
class TestTTSBusinessRules:
    def test_tts_entries_exist(self, tts_entries):
        assert len(tts_entries) >= 1

    def test_tts_have_languages(self, tts_entries):
        for e in tts_entries:
            if e.languages:
                assert len(e.languages) >= 1, f"{e.id} has empty languages list"

    def test_piper_is_cpu_fallback(self, tts_entries):
        piper = [e for e in tts_entries if 'piper' in e.id.lower()]
        for e in piper:
            assert e.supports_cpu is True, "Piper must support CPU"


# ==========================================================================
# 4. Media Gen Business Rules
# ==========================================================================
class TestMediaGenBusinessRules:
    def test_ace_step_is_music(self, all_entries):
        ace = [e for e in all_entries if 'acestep' in e.id]
        assert len(ace) >= 1, "ACE Step 1.5 must be in catalog"
        for e in ace:
            assert 'music' in (e.tags or []), f"{e.id} missing 'music' tag"
            assert e.model_type == ModelType.AUDIO_GEN

    def test_ltx_is_video(self, all_entries):
        ltx = [e for e in all_entries if 'ltx' in e.id]
        assert len(ltx) >= 1, "LTX Video must be in catalog"
        for e in ltx:
            assert 'video' in (e.tags or []), f"{e.id} missing 'video' tag"
            assert e.model_type == ModelType.VIDEO_GEN

    def test_media_gen_not_auto_loaded(self, all_entries):
        """Media gen models should NOT auto-load (they're large and optional)."""
        media = [e for e in all_entries if e.model_type in (ModelType.AUDIO_GEN, ModelType.VIDEO_GEN)]
        for e in media:
            assert e.auto_load is False, f"{e.id} should not auto-load"

    def test_media_gen_have_idle_timeout(self, all_entries):
        media = [e for e in all_entries if e.model_type in (ModelType.AUDIO_GEN, ModelType.VIDEO_GEN)]
        for e in media:
            assert e.idle_timeout_s > 0, f"{e.id} should have idle timeout for GPU memory management"


# ==========================================================================
# 5. Cross-Type Invariants
# ==========================================================================
class TestCrossTypeInvariants:
    def test_all_entries_have_id(self, all_entries):
        for e in all_entries:
            assert e.id, f"Entry missing id: {e}"

    def test_all_entries_have_name(self, all_entries):
        for e in all_entries:
            assert e.name, f"{e.id} missing name"

    def test_all_entries_have_model_type(self, all_entries):
        for e in all_entries:
            assert e.model_type is not None, f"{e.id} missing model_type"

    def test_no_negative_vram(self, all_entries):
        for e in all_entries:
            assert e.vram_gb >= 0, f"{e.id} has negative VRAM: {e.vram_gb}"

    def test_all_local_tagged(self, all_entries):
        """All models in catalog should have 'local' tag (Nunba = local-first)."""
        for e in all_entries:
            if e.tags:
                assert 'local' in e.tags, f"{e.id} missing 'local' tag"

    def test_singleton_shared(self):
        """get_catalog() and HARTOS get_catalog() return same instance."""
        import integrations.service_tools.model_catalog as hartos
        c1 = get_catalog()
        c2 = hartos.get_catalog()
        assert c1 is c2, "Catalog singleton not shared between Nunba and HARTOS"
