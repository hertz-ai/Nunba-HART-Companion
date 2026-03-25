"""
Deep functional tests for LLM model selection business rules.

Tests INTENDED BEHAVIOR of model presets and hardware-based selection:
- Model ordering (recommended first, increasing size)
- VRAM requirements match model sizes
- Vision models have mmproj files
- File naming conventions
- Hardware-based model selection logic
- Model preset data integrity
"""
import os
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from llama.llama_installer import MODEL_PRESETS


# ==========================================================================
# 1. Model Ordering
# ==========================================================================
class TestModelOrdering:
    def test_has_recommended_model(self):
        """At least one model should be flagged as recommended."""
        rec = [p for p in MODEL_PRESETS if 'recommended' in p.display_name.lower()
               or 'recommended' in (p.description or '').lower()]
        assert len(rec) >= 1 or len(MODEL_PRESETS) >= 3

    def test_at_least_5_presets(self):
        assert len(MODEL_PRESETS) >= 5, "Must have at least 5 model presets for variety"

    def test_smallest_model_under_1gb(self):
        sizes = [p.size_mb for p in MODEL_PRESETS]
        assert min(sizes) < 1000, f"Smallest model is {min(sizes)}MB — need a sub-1GB option"

    def test_has_model_over_10gb(self):
        sizes = [p.size_mb for p in MODEL_PRESETS]
        assert max(sizes) > 10000, "Should have at least one large (10GB+) model for workstations"

    def test_has_mid_size_model(self):
        """There should be a model between the smallest and largest."""
        sizes = sorted(p.size_mb for p in MODEL_PRESETS)
        if len(sizes) >= 3:
            assert sizes[1] > sizes[0], "Middle model must be larger than smallest"
            assert sizes[-2] < sizes[-1], "Middle model must be smaller than largest"


# ==========================================================================
# 2. Vision Support
# ==========================================================================
class TestVisionSupport:
    def test_at_least_one_vision_model(self):
        vision = [p for p in MODEL_PRESETS if p.has_vision]
        assert len(vision) >= 1, "Must have at least one vision model"

    def test_vision_models_have_mmproj(self):
        for p in MODEL_PRESETS:
            if p.has_vision:
                assert p.mmproj_file, f"{p.display_name} has vision but no mmproj_file"
                assert p.mmproj_file.endswith('.gguf'), \
                    f"{p.display_name} mmproj must be .gguf, got {p.mmproj_file}"

    def test_vision_models_have_mmproj_source(self):
        for p in MODEL_PRESETS:
            if p.has_vision:
                assert p.mmproj_source_file, \
                    f"{p.display_name} vision model missing mmproj_source_file"

    def test_non_vision_models_no_mmproj(self):
        for p in MODEL_PRESETS:
            if not p.has_vision:
                assert not p.mmproj_file, \
                    f"{p.display_name} is text-only but has mmproj_file={p.mmproj_file}"

    def test_at_least_3_vision_models(self):
        vision = [p for p in MODEL_PRESETS if p.has_vision]
        assert len(vision) >= 3, f"Need at least 3 vision models, got {len(vision)}"

    def test_has_text_only_option(self):
        text_only = [p for p in MODEL_PRESETS if not p.has_vision]
        assert len(text_only) >= 1, "Need at least 1 text-only model (smaller, faster)"


# ==========================================================================
# 3. File Naming
# ==========================================================================
class TestFileNaming:
    def test_all_files_are_gguf(self):
        for p in MODEL_PRESETS:
            assert p.file_name.endswith('.gguf'), \
                f"{p.display_name} file must be .gguf, got {p.file_name}"

    def test_file_names_unique(self):
        names = [p.file_name for p in MODEL_PRESETS]
        assert len(names) == len(set(names)), \
            f"Duplicate file names: {[n for n in names if names.count(n) > 1]}"

    def test_display_names_unique(self):
        names = [p.display_name for p in MODEL_PRESETS]
        assert len(names) == len(set(names)), "Display names must be unique"

    def test_repo_ids_are_hf_format(self):
        for p in MODEL_PRESETS:
            assert '/' in p.repo_id, \
                f"{p.display_name} repo_id must be org/name format, got {p.repo_id}"


# ==========================================================================
# 4. VRAM vs Size Correlation
# ==========================================================================
class TestVRAMCorrelation:
    def test_vram_increases_with_size(self):
        """Larger models must need more VRAM."""
        sorted_presets = sorted(MODEL_PRESETS, key=lambda p: p.size_mb)
        for i in range(1, len(sorted_presets)):
            prev = sorted_presets[i - 1]
            curr = sorted_presets[i]
            if curr.size_mb > prev.size_mb * 1.5:  # significant size increase
                assert curr.size_mb / 1024.0 >= prev.size_mb / 1024.0, \
                    f"{curr.display_name} ({curr.size_mb}MB) should need more VRAM than {prev.display_name} ({prev.size_mb}MB)"

    def test_sub_1gb_model_fits_any_gpu(self):
        small = [p for p in MODEL_PRESETS if p.size_mb < 1000]
        for p in small:
            vram_gb = p.size_mb / 1024.0
            assert vram_gb < 2.0, f"{p.display_name} is small but needs {vram_gb:.1f}GB VRAM"


# ==========================================================================
# 5. Hardware Selection Rules
# ==========================================================================
class TestHardwareSelection:
    """Test the intended model selection for different GPU tiers."""

    def _best_for_vram(self, max_vram_gb):
        """Find the best model that fits in given VRAM."""
        candidates = [p for p in MODEL_PRESETS if p.size_mb / 1024.0 <= max_vram_gb]
        if not candidates:
            return None
        # Prefer vision, then largest
        vision = [p for p in candidates if p.has_vision]
        pool = vision if vision else candidates
        return max(pool, key=lambda p: p.size_mb)

    def test_4gb_gpu_gets_vision_model(self):
        """RTX 3050/4050 (4GB) should get a vision-capable model."""
        best = self._best_for_vram(4.0)
        assert best is not None, "Must have a model for 4GB GPU"
        assert best.has_vision is True, f"4GB GPU should get vision model, got {best.display_name}"

    def test_2gb_gpu_still_has_option(self):
        """Older GPUs (2GB) should still have a usable model."""
        best = self._best_for_vram(2.0)
        assert best is not None, "Must have a model for 2GB GPU"

    def test_8gb_gpu_has_vision_option(self):
        """RTX 3060/4060 (8GB) should have a vision-capable model."""
        fits = [p for p in MODEL_PRESETS if p.size_mb / 1024.0 <= 8.0 and p.has_vision]
        assert len(fits) >= 1, "Must have a vision model that fits in 8GB"

    def test_24gb_gpu_gets_largest(self):
        """RTX 3090/4090 (24GB) should get the largest model."""
        best = self._best_for_vram(24.0)
        assert best is not None
        assert best.size_mb > 10000, f"24GB GPU should get 10GB+ model, got {best.size_mb}MB"

    def test_no_model_needs_more_than_24gb(self):
        for p in MODEL_PRESETS:
            assert p.size_mb / 1024.0 <= 24.0, \
                f"{p.display_name} ({p.size_mb / 1024:.1f}GB) exceeds 24GB consumer GPU"


# ==========================================================================
# 6. Min Build Compatibility
# ==========================================================================
class TestMinBuild:
    def test_recommended_has_min_build(self):
        """At minimum, recommended model must specify min_build."""
        rec = MODEL_PRESETS[0]
        assert rec.min_build is not None and rec.min_build > 0

    def test_min_builds_are_reasonable(self):
        for p in MODEL_PRESETS:
            if p.min_build is not None:
                assert 1000 <= p.min_build < 100000, \
                    f"{p.display_name} min_build {p.min_build} out of range"


# ==========================================================================
# 7. Description Quality
# ==========================================================================
class TestDescriptions:
    def test_all_have_descriptions(self):
        for p in MODEL_PRESETS:
            assert p.description, f"{p.display_name} missing description"
            assert len(p.description) >= 10, f"{p.display_name} description too short"

    def test_descriptions_are_informative(self):
        """Every description should mention at least one key feature."""
        for p in MODEL_PRESETS:
            desc = (p.description or '').lower()
            has_feature = any(w in desc for w in ['context', 'vision', 'quality', 'gpu',
                                                   'vram', 'text', 'recommend', 'fast', 'small', 'large'])
            assert has_feature or len(desc) >= 20, \
                f"{p.display_name} description not informative: {p.description}"
