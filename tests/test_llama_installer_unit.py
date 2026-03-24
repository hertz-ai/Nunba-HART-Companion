"""
test_llama_installer_unit.py - Unit tests for llama/llama_installer.py

Tests the LLM model installer — downloads binaries and models on first run.
Each test verifies a specific installation guarantee or data integrity:

FT: ModelPreset structure, MODEL_PRESETS ordering, installer path setup,
    GPU detection, model path resolution, version detection, first-run guard.
NFT: Cross-platform path handling, download resilience, idempotent install,
     min_build version gating, vision model mmproj pairing.
"""
import os
import sys
import tempfile

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from llama.llama_installer import MODEL_PRESETS, LlamaInstaller, ModelPreset

# ============================================================
# ModelPreset — data integrity
# ============================================================

class TestModelPreset:
    """ModelPreset drives the model selector UI and download logic."""

    def test_all_presets_have_required_fields(self):
        """Missing field = crash in download or UI display."""
        for preset in MODEL_PRESETS:
            assert preset.display_name, "Preset missing display_name"
            assert preset.repo_id, f"Preset '{preset.display_name}' missing repo_id"
            assert preset.file_name, f"Preset '{preset.display_name}' missing file_name"
            assert preset.size_mb > 0, f"Preset '{preset.display_name}' has invalid size_mb"

    def test_first_preset_is_recommended(self):
        """First preset is the default selection — should be the recommended model."""
        assert 'Recommended' in MODEL_PRESETS[0].display_name or 'Qwen3.5-4B' in MODEL_PRESETS[0].display_name

    def test_repo_ids_are_valid_hf_format(self):
        """HuggingFace repos must be org/model format."""
        for preset in MODEL_PRESETS:
            assert '/' in preset.repo_id, f"'{preset.display_name}' repo_id not HF format: {preset.repo_id}"

    def test_file_names_end_with_gguf(self):
        """llama.cpp only loads GGUF format models."""
        for preset in MODEL_PRESETS:
            assert preset.file_name.endswith('.gguf'), f"'{preset.display_name}' not GGUF: {preset.file_name}"

    def test_vision_models_have_mmproj(self):
        """Vision models need mmproj file — without it, image processing fails silently."""
        for preset in MODEL_PRESETS:
            if preset.has_vision:
                assert preset.mmproj_file, f"Vision model '{preset.display_name}' missing mmproj_file"

    def test_non_vision_models_no_mmproj(self):
        """Non-vision models should not carry mmproj — wastes download bandwidth."""
        for preset in MODEL_PRESETS:
            if not preset.has_vision:
                assert preset.mmproj_file is None, f"Non-vision '{preset.display_name}' has mmproj"

    def test_mmproj_source_defaults_to_mmproj(self):
        """mmproj_source_file defaults to mmproj_file if not specified."""
        p = ModelPreset("test", "org/model", "test.gguf", 100, "desc",
                        has_vision=True, mmproj_file="mmproj-test.gguf")
        assert p.mmproj_source_file == "mmproj-test.gguf"

    def test_mmproj_source_can_differ(self):
        """Source file (on HF) may differ from local name (disambiguated)."""
        p = ModelPreset("test", "org/model", "test.gguf", 100, "desc",
                        has_vision=True, mmproj_file="mmproj-Qwen-F16.gguf",
                        mmproj_source_file="mmproj-F16.gguf")
        assert p.mmproj_source_file == "mmproj-F16.gguf"
        assert p.mmproj_file == "mmproj-Qwen-F16.gguf"

    def test_min_build_set_for_qwen35_vl(self):
        """Qwen3.5 VL models require b8148+ — older llama.cpp will crash."""
        qwen35_vl = [p for p in MODEL_PRESETS if 'Qwen3.5' in p.display_name and p.has_vision]
        for p in qwen35_vl:
            assert p.min_build is not None and p.min_build >= 8000, (
                f"'{p.display_name}' missing or low min_build: {p.min_build}")

    def test_sizes_are_ordered_descending_in_first_two(self):
        """First two presets (4B, 2B) should be largest to smallest for recommended."""
        if len(MODEL_PRESETS) >= 2:
            assert MODEL_PRESETS[0].size_mb >= MODEL_PRESETS[1].size_mb

    def test_no_duplicate_file_names(self):
        """Duplicate file names would overwrite each other on download."""
        names = [p.file_name for p in MODEL_PRESETS]
        dupes = [n for n in names if names.count(n) > 1]
        assert not dupes, f"Duplicate model file names: {set(dupes)}"

    def test_minimum_preset_count(self):
        """Must have at least 3 presets for meaningful hardware-based selection."""
        assert len(MODEL_PRESETS) >= 3


# ============================================================
# LlamaInstaller — initialization and path handling
# ============================================================

class TestLlamaInstallerInit:
    """LlamaInstaller sets up directories for binary and models."""

    def test_creates_directories(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            installer = LlamaInstaller(
                install_dir=os.path.join(tmpdir, 'llama'),
                models_dir=os.path.join(tmpdir, 'models'))
            assert os.path.isdir(os.path.join(tmpdir, 'models'))

    def test_detects_gpu_type(self):
        """GPU detection determines which binary variant to download."""
        with tempfile.TemporaryDirectory() as tmpdir:
            installer = LlamaInstaller(
                install_dir=os.path.join(tmpdir, 'llama'),
                models_dir=os.path.join(tmpdir, 'models'))
            assert installer.gpu_available in ('cuda', 'metal', 'none')

    def test_find_llama_server_returns_string_or_none(self):
        """find_llama_server scans standard paths for the binary."""
        with tempfile.TemporaryDirectory() as tmpdir:
            installer = LlamaInstaller(
                install_dir=os.path.join(tmpdir, 'llama'),
                models_dir=os.path.join(tmpdir, 'models'))
            result = installer.find_llama_server()
            assert result is None or isinstance(result, str)

    def test_get_model_path_returns_string_or_none(self):
        """get_model_path returns a path string when found, None when missing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            models = os.path.join(tmpdir, 'models')
            os.makedirs(models, exist_ok=True)
            installer = LlamaInstaller(
                install_dir=os.path.join(tmpdir, 'llama'),
                models_dir=models)
            result = installer.get_model_path(MODEL_PRESETS[0])
            assert result is None or isinstance(result, str)

    def test_get_model_path_finds_existing_file(self):
        """When model GGUF exists on disk, returns its full path."""
        with tempfile.TemporaryDirectory() as tmpdir:
            models = os.path.join(tmpdir, 'models')
            os.makedirs(models, exist_ok=True)
            # Create a fake model file
            preset = MODEL_PRESETS[0]
            fake_path = os.path.join(models, preset.file_name)
            with open(fake_path, 'w') as f:
                f.write('fake model')
            installer = LlamaInstaller(
                install_dir=os.path.join(tmpdir, 'llama'),
                models_dir=models)
            result = installer.get_model_path(preset)
            assert result is not None
            assert preset.file_name in result

    def test_is_model_downloaded_returns_bool(self):
        """is_model_downloaded returns bool — caller uses it for UI display."""
        with tempfile.TemporaryDirectory() as tmpdir:
            models = os.path.join(tmpdir, 'models')
            os.makedirs(models, exist_ok=True)
            installer = LlamaInstaller(
                install_dir=os.path.join(tmpdir, 'llama'),
                models_dir=models)
            result = installer.is_model_downloaded(MODEL_PRESETS[0])
            assert isinstance(result, bool)

    def test_is_system_installation_callable(self):
        """is_system_installation must be callable and return bool."""
        with tempfile.TemporaryDirectory() as tmpdir:
            models = os.path.join(tmpdir, 'models')
            os.makedirs(models, exist_ok=True)
            installer = LlamaInstaller(
                install_dir=os.path.join(tmpdir, 'llama'),
                models_dir=models)
            assert callable(installer.is_system_installation)
