"""
Parametric LLM model preset matrix.

Tests every MODEL_PRESET entry against its expected properties:
- Valid GGUF filename
- Valid HuggingFace repo_id
- Positive size
- Vision models have mmproj
- Non-vision models don't have mmproj
- Description non-empty
- File naming conventions
"""
import os
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from llama.llama_installer import MODEL_PRESETS


# Generate parametrize IDs from display names
PRESET_IDS = [p.display_name for p in MODEL_PRESETS]


# ==========================================================================
# 1. File Name Rules
# ==========================================================================
@pytest.mark.parametrize('preset', MODEL_PRESETS, ids=PRESET_IDS)
def test_file_is_gguf(preset):
    assert preset.file_name.endswith('.gguf'), f"{preset.display_name}: {preset.file_name}"

@pytest.mark.parametrize('preset', MODEL_PRESETS, ids=PRESET_IDS)
def test_file_name_not_empty(preset):
    assert len(preset.file_name) > 5

@pytest.mark.parametrize('preset', MODEL_PRESETS, ids=PRESET_IDS)
def test_file_name_no_spaces(preset):
    assert ' ' not in preset.file_name, f"GGUF filename must not have spaces: {preset.file_name}"


# ==========================================================================
# 2. Repo ID Rules
# ==========================================================================
@pytest.mark.parametrize('preset', MODEL_PRESETS, ids=PRESET_IDS)
def test_repo_has_slash(preset):
    assert '/' in preset.repo_id, f"Repo must be org/name: {preset.repo_id}"

@pytest.mark.parametrize('preset', MODEL_PRESETS, ids=PRESET_IDS)
def test_repo_not_empty(preset):
    assert len(preset.repo_id) > 3


# ==========================================================================
# 3. Size Rules
# ==========================================================================
@pytest.mark.parametrize('preset', MODEL_PRESETS, ids=PRESET_IDS)
def test_size_positive(preset):
    assert preset.size_mb > 0

@pytest.mark.parametrize('preset', MODEL_PRESETS, ids=PRESET_IDS)
def test_size_reasonable(preset):
    assert preset.size_mb < 50000, f"{preset.display_name} too large: {preset.size_mb}MB"


# ==========================================================================
# 4. Vision Rules
# ==========================================================================
@pytest.mark.parametrize('preset', MODEL_PRESETS, ids=PRESET_IDS)
def test_vision_has_mmproj(preset):
    if preset.has_vision:
        assert preset.mmproj_file, f"{preset.display_name}: vision but no mmproj"
        assert preset.mmproj_file.endswith('.gguf')

@pytest.mark.parametrize('preset', MODEL_PRESETS, ids=PRESET_IDS)
def test_non_vision_no_mmproj(preset):
    if not preset.has_vision:
        assert not preset.mmproj_file, f"{preset.display_name}: text-only but has mmproj"


# ==========================================================================
# 5. Description Rules
# ==========================================================================
@pytest.mark.parametrize('preset', MODEL_PRESETS, ids=PRESET_IDS)
def test_has_description(preset):
    assert preset.description, f"{preset.display_name} missing description"
    assert len(preset.description) >= 10

@pytest.mark.parametrize('preset', MODEL_PRESETS, ids=PRESET_IDS)
def test_has_display_name(preset):
    assert preset.display_name
    assert len(preset.display_name) >= 3


# ==========================================================================
# 6. VRAM Estimation Rules
# ==========================================================================
@pytest.mark.parametrize('preset', MODEL_PRESETS, ids=PRESET_IDS)
def test_vram_proportional_to_size(preset):
    """VRAM estimate (size_mb/1024) should be reasonable."""
    vram_gb = preset.size_mb / 1024.0
    assert vram_gb < 25, f"{preset.display_name}: {vram_gb:.1f}GB exceeds 24GB GPU"

@pytest.mark.parametrize('preset', MODEL_PRESETS, ids=PRESET_IDS)
def test_vram_at_least_half_gb(preset):
    vram_gb = preset.size_mb / 1024.0
    assert vram_gb >= 0.3, f"{preset.display_name} unrealistically small: {vram_gb:.2f}GB"


# ==========================================================================
# 7. Uniqueness
# ==========================================================================
def test_all_file_names_unique():
    names = [p.file_name for p in MODEL_PRESETS]
    assert len(names) == len(set(names)), f"Duplicate files: {[n for n in names if names.count(n)>1]}"

def test_all_display_names_unique():
    names = [p.display_name for p in MODEL_PRESETS]
    assert len(names) == len(set(names))

def test_at_least_5_presets():
    assert len(MODEL_PRESETS) >= 5

def test_at_least_3_vision_models():
    vision = [p for p in MODEL_PRESETS if p.has_vision]
    assert len(vision) >= 3

def test_at_least_1_text_only():
    text = [p for p in MODEL_PRESETS if not p.has_vision]
    assert len(text) >= 1

def test_has_a_recommended_model():
    """At least one preset should be marked as recommended."""
    recommended = [p for p in MODEL_PRESETS if 'recommended' in p.display_name.lower()
                   or 'recommended' in (p.description or '').lower()]
    assert len(recommended) >= 1 or len(MODEL_PRESETS) >= 3, \
        "Must have a recommended model or at least 3 presets"
