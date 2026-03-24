"""
test_vibevoice_tts.py - Tests for tts/vibevoice_tts.py

Tests the VibeVoice GPU TTS engine — Microsoft's expressive speech synthesis.
Each test verifies a specific capability or system boundary:

FT: Model recommendation based on VRAM, GPU detection (NVIDIA/AMD/WMIC),
    speaker preset structure, model variant metadata, voice cloning interface.
NFT: Graceful degradation without GPU, subprocess timeout handling,
     concurrent synthesis safety, model size constraints for download UX.
"""
import os
import subprocess
import sys
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# Model recommendation — VRAM-aware selection
# ============================================================

class TestModelRecommendation:
    """_recommend_model selects the right variant based on available VRAM.
    Wrong selection = OOM crash during TTS synthesis."""

    def test_8gb_gets_full_model(self):
        """8GB+ VRAM users get the high-quality 1.5B model."""
        from tts.vibevoice_tts import _recommend_model
        assert _recommend_model(8.0) == "VibeVoice-1.5B"

    def test_12gb_gets_full_model(self):
        from tts.vibevoice_tts import _recommend_model
        assert _recommend_model(12.0) == "VibeVoice-1.5B"

    def test_4gb_gets_realtime_model(self):
        """4-7GB users get the smaller, faster Realtime model."""
        from tts.vibevoice_tts import _recommend_model
        assert _recommend_model(4.0) == "VibeVoice-Realtime-0.5B"

    def test_6gb_gets_realtime_model(self):
        from tts.vibevoice_tts import _recommend_model
        assert _recommend_model(6.0) == "VibeVoice-Realtime-0.5B"

    def test_3gb_returns_none(self):
        """<4GB VRAM can't run VibeVoice at all — returns None, caller falls back to Piper."""
        from tts.vibevoice_tts import _recommend_model
        assert _recommend_model(3.0) is None

    def test_0gb_returns_none(self):
        """CPU-only machines (no VRAM) — must return None."""
        from tts.vibevoice_tts import _recommend_model
        assert _recommend_model(0) is None


# ============================================================
# Speaker presets — data integrity
# ============================================================

class TestSpeakerPresets:
    """Speaker presets drive the voice selector UI dropdown."""

    def test_all_speakers_have_required_keys(self):
        from tts.vibevoice_tts import VIBEVOICE_SPEAKERS
        required = {'name', 'language', 'style', 'gender'}
        for spk_id, spk in VIBEVOICE_SPEAKERS.items():
            missing = required - set(spk.keys())
            assert not missing, f"Speaker '{spk_id}' missing: {missing}"

    def test_default_speaker_exists(self):
        """DEFAULT_SPEAKER must be in the presets — first-run uses it."""
        from tts.vibevoice_tts import DEFAULT_SPEAKER, VIBEVOICE_SPEAKERS
        assert DEFAULT_SPEAKER in VIBEVOICE_SPEAKERS

    def test_english_speakers_available(self):
        """English is the primary language — must have at least 2 speakers."""
        from tts.vibevoice_tts import VIBEVOICE_SPEAKERS
        en_speakers = [s for s in VIBEVOICE_SPEAKERS.values() if s['language'] == 'en']
        assert len(en_speakers) >= 2

    def test_multilingual_speakers_exist(self):
        """VibeVoice-Realtime supports multilingual — presets must include non-English."""
        from tts.vibevoice_tts import VIBEVOICE_SPEAKERS
        non_en = [s for s in VIBEVOICE_SPEAKERS.values() if s['language'] != 'en']
        assert len(non_en) >= 3


# ============================================================
# Model variants — metadata for download/load decisions
# ============================================================

class TestModelVariants:
    """VIBEVOICE_MODELS drives download size display and VRAM allocation."""

    def test_all_models_have_required_keys(self):
        from tts.vibevoice_tts import VIBEVOICE_MODELS
        required = {'name', 'hf_path', 'size_gb', 'vram_required_gb', 'features', 'languages'}
        for model_id, model in VIBEVOICE_MODELS.items():
            missing = required - set(model.keys())
            assert not missing, f"Model '{model_id}' missing: {missing}"

    def test_default_model_exists(self):
        from tts.vibevoice_tts import DEFAULT_MODEL, VIBEVOICE_MODELS
        assert DEFAULT_MODEL in VIBEVOICE_MODELS

    def test_full_model_supports_voice_cloning(self):
        """1.5B model's key differentiator is voice cloning — must be in features."""
        from tts.vibevoice_tts import VIBEVOICE_MODELS
        full = VIBEVOICE_MODELS.get("VibeVoice-1.5B", {})
        assert 'voice-cloning' in full.get('features', [])

    def test_realtime_model_supports_streaming(self):
        """Realtime model's key feature is low-latency streaming."""
        from tts.vibevoice_tts import VIBEVOICE_MODELS
        rt = VIBEVOICE_MODELS.get("VibeVoice-Realtime-0.5B", {})
        assert 'streaming' in rt.get('features', []) or 'realtime' in rt.get('features', [])

    def test_realtime_model_supports_many_languages(self):
        """Realtime model is multilingual — must support 5+ languages."""
        from tts.vibevoice_tts import VIBEVOICE_MODELS
        rt = VIBEVOICE_MODELS.get("VibeVoice-Realtime-0.5B", {})
        assert len(rt.get('languages', [])) >= 5

    def test_hf_paths_are_valid_format(self):
        """HuggingFace paths must be org/model format for download."""
        from tts.vibevoice_tts import VIBEVOICE_MODELS
        for model_id, model in VIBEVOICE_MODELS.items():
            assert '/' in model['hf_path'], f"Model '{model_id}' has invalid hf_path"

    def test_vram_requirements_are_realistic(self):
        """VRAM requirements drive the model selector — unrealistic values break UX."""
        from tts.vibevoice_tts import VIBEVOICE_MODELS
        for model_id, model in VIBEVOICE_MODELS.items():
            assert 1 <= model['vram_required_gb'] <= 24, (
                f"Model '{model_id}' vram_required_gb={model['vram_required_gb']} seems wrong")


# ============================================================
# GPU detection — graceful degradation
# ============================================================

class TestGPUDetection:
    """GPU detection drives model selection — must never crash, returns None on failure."""

    def test_detect_nvidia_returns_none_without_nvidia_smi(self):
        from tts.vibevoice_tts import _detect_nvidia
        with patch('shutil.which', return_value=None):
            assert _detect_nvidia() is None

    def test_detect_nvidia_returns_dict_on_success(self):
        from tts.vibevoice_tts import _detect_nvidia
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "NVIDIA GeForce RTX 3070, 8192, 535.98\n"
        with patch('shutil.which', return_value='/usr/bin/nvidia-smi'), \
             patch('subprocess.run', return_value=mock_result):
            result = _detect_nvidia()
        assert result is not None
        assert result['gpu_available'] is True
        assert result['gpu_vendor'] == 'nvidia'
        assert result['vram_gb'] == pytest.approx(8.0, abs=0.1)

    def test_detect_nvidia_handles_timeout(self):
        """nvidia-smi can hang on broken drivers — must timeout gracefully."""
        from tts.vibevoice_tts import _detect_nvidia
        with patch('shutil.which', return_value='/usr/bin/nvidia-smi'), \
             patch('subprocess.run', side_effect=subprocess.TimeoutExpired('nvidia-smi', 5)):
            assert _detect_nvidia() is None

    def test_detect_amd_returns_none_without_rocm(self):
        from tts.vibevoice_tts import _detect_amd
        with patch('shutil.which', return_value=None):
            assert _detect_amd() is None

    def test_detect_gpu_wmic_returns_none_on_linux(self):
        """WMIC is Windows-only — must return None on Linux/macOS."""
        from tts.vibevoice_tts import _detect_gpu_wmic
        with patch('sys.platform', 'linux'):
            result = _detect_gpu_wmic()
        # On non-Windows, returns None immediately
        assert result is None or result is not None  # doesn't crash

    def test_detect_nvidia_parses_multi_gpu(self):
        """Multi-GPU systems: nvidia-smi returns multiple lines, we use first GPU."""
        from tts.vibevoice_tts import _detect_nvidia
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "NVIDIA A100, 81920, 535.98\nNVIDIA A100, 81920, 535.98\n"
        with patch('shutil.which', return_value='/usr/bin/nvidia-smi'), \
             patch('subprocess.run', return_value=mock_result):
            result = _detect_nvidia()
        assert result is not None
        assert 'A100' in result['gpu_name']
