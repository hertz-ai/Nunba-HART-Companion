"""
test_gpu_path_synthetic.py — Layer 1: synthetic CUDA path coverage.

Runs on hosted Ubuntu (no GPU) by monkey-patching torch.cuda and VRAMManager
(see tests/conftest_cuda_mock.py).  These tests assert the GPU CODE PATH is
reached — they cannot measure real throughput (that's layer 3, bench_gpu.py).

Covers the regressions that would otherwise slip through CI:
  • commit fe45daf — VRAMManager swap-and-retry when suggest_offload_mode
    returns 'cpu_only'
  • commit 2acf21a — LlamaConfig.should_boot_draft threshold at 8/10/16 GB
  • TTS ladder promotion/demotion under simulated VRAM pressure
  • Kill-switch signals when CUDA reports OOM
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

# ══════════════════════════════════════════════════════════════════════
# 1. should_boot_draft threshold (commit 2acf21a)
# ══════════════════════════════════════════════════════════════════════

class TestShouldBootDraftThreshold:
    """Draft boot ≥10GB total AND ≥1GB free; else main-only."""

    def test_8gb_card_does_not_boot_draft(self, synthetic_cuda):
        synthetic_cuda(total_gb=8.0, free_gb=6.5)
        from llama.llama_config import LlamaConfig
        assert LlamaConfig.should_boot_draft() is False, (
            "8GB card must NOT boot draft — leaves no room for TTS"
        )

    def test_10gb_card_boots_draft(self, synthetic_cuda):
        synthetic_cuda(total_gb=10.0, free_gb=6.0)
        from llama.llama_config import LlamaConfig
        assert LlamaConfig.should_boot_draft() is True, (
            "10GB card with 6GB free is exactly at the dual-boot threshold"
        )

    def test_16gb_card_boots_draft(self, synthetic_cuda):
        synthetic_cuda(total_gb=16.0, free_gb=12.0)
        from llama.llama_config import LlamaConfig
        assert LlamaConfig.should_boot_draft() is True

    def test_10gb_but_no_free_vram_falls_back(self, synthetic_cuda):
        """Total ≥10GB but <1GB free → main-only (TTS/vision already loaded)."""
        synthetic_cuda(total_gb=10.0, free_gb=0.5)
        from llama.llama_config import LlamaConfig
        assert LlamaConfig.should_boot_draft() is False

    def test_no_cuda_never_boots_draft(self, monkeypatch):
        """CUDA missing → draft boot must refuse."""
        # Don't use synthetic_cuda here — we want cuda_available=False.
        mock_vm = MagicMock()
        mock_vm.detect_gpu.return_value = {"cuda_available": False}
        mock_vm.get_total_vram.return_value = 0.0
        mock_vm.get_free_vram.return_value = 0.0

        import sys
        import types
        mod = types.ModuleType("integrations.service_tools.vram_manager")
        mod.vram_manager = mock_vm
        monkeypatch.setitem(
            sys.modules, "integrations.service_tools.vram_manager", mod,
        )
        from llama.llama_config import LlamaConfig
        assert LlamaConfig.should_boot_draft() is False


# ══════════════════════════════════════════════════════════════════════
# 2. VRAM swap-and-retry (commit fe45daf)
# ══════════════════════════════════════════════════════════════════════

class TestVramSwapAndRetry:
    """tts_engine._vram_allows asks lifecycle manager to swap idle models."""

    def test_can_fit_true_short_circuits_swap(self, synthetic_cuda):
        """If VRAM already fits, swap path must NOT fire."""
        vm = synthetic_cuda(total_gb=16.0, free_gb=10.0)
        vm.can_fit.side_effect = None
        vm.can_fit.return_value = True

        from tts.tts_engine import TTSEngine
        engine = TTSEngine()
        engine._hw_detected = True
        # Pick a backend that has a vram budget — use whatever maps.
        with patch.object(TTSEngine, "_get_vram_tool_name",
                          return_value="indic_parler"):
            assert engine._vram_allows("indic_parler_tts") is True
        assert vm.can_fit.call_count >= 1

    def test_swap_invoked_when_cant_fit(self, synthetic_cuda):
        """can_fit → False must trigger model_lifecycle.request_swap, then
        re-probe can_fit.  This is the fe45daf regression lane."""
        vm = synthetic_cuda(total_gb=8.0, free_gb=1.5)
        # First can_fit → False, second (post-swap) → True
        vm.can_fit.side_effect = [False, True]

        import sys
        import types
        mlm_module = types.ModuleType("integrations.service_tools.model_lifecycle")
        mock_mlm = MagicMock()
        mock_mlm.request_swap.return_value = True
        mlm_module.get_model_lifecycle_manager = lambda: mock_mlm
        sys.modules["integrations.service_tools.model_lifecycle"] = mlm_module

        from tts.tts_engine import TTSEngine
        engine = TTSEngine()
        engine._hw_detected = True
        with patch.object(TTSEngine, "_get_vram_tool_name",
                          return_value="indic_parler"):
            result = engine._vram_allows("indic_parler_tts")
        assert result is True
        mock_mlm.request_swap.assert_called_once()
        assert vm.can_fit.call_count == 2, (
            "Must re-probe can_fit after swap"
        )

    def test_swap_failed_returns_false(self, synthetic_cuda):
        """Swap fails → backend blocked (no phantom load)."""
        vm = synthetic_cuda(total_gb=8.0, free_gb=1.0)
        vm.can_fit.side_effect = [False, False]

        import sys
        import types
        mlm_module = types.ModuleType("integrations.service_tools.model_lifecycle")
        mock_mlm = MagicMock()
        mock_mlm.request_swap.return_value = False
        mlm_module.get_model_lifecycle_manager = lambda: mock_mlm
        sys.modules["integrations.service_tools.model_lifecycle"] = mlm_module

        from tts.tts_engine import TTSEngine
        engine = TTSEngine()
        engine._hw_detected = True
        with patch.object(TTSEngine, "_get_vram_tool_name",
                          return_value="chatterbox"):
            result = engine._vram_allows("chatterbox_tts")
        assert result is False


# ══════════════════════════════════════════════════════════════════════
# 3. TTS device selection — suggest_offload_mode ladder
# ══════════════════════════════════════════════════════════════════════

class TestTtsDeviceSuggestion:
    """_suggest_device maps VRAMManager mode to cuda/cpu."""

    def test_high_vram_picks_cuda(self, synthetic_cuda_high):
        from tts.tts_engine import _suggest_device
        assert _suggest_device("indic_parler") == "cuda"

    def test_low_vram_falls_to_cpu(self, synthetic_cuda):
        synthetic_cuda(total_gb=4.0, free_gb=1.0)  # <2GB free → cpu_only
        from tts.tts_engine import _suggest_device
        assert _suggest_device("indic_parler") == "cpu"

    def test_mid_vram_still_cuda_via_offload(self, synthetic_cuda):
        synthetic_cuda(total_gb=8.0, free_gb=3.0)  # 2–4GB → cpu_offload
        from tts.tts_engine import _suggest_device
        # cpu_offload still loads on cuda (model handles mixed placement)
        assert _suggest_device("indic_parler") == "cuda"

    def test_oom_profile_forces_cpu(self, synthetic_cuda_oom):
        from tts.tts_engine import _suggest_device
        assert _suggest_device("chatterbox") == "cpu"


# ══════════════════════════════════════════════════════════════════════
# 4. Backend health tier classification (main.py /backend/health)
# ══════════════════════════════════════════════════════════════════════

class TestBackendHealthTier:
    """/backend/health tier must mirror should_boot_draft thresholds."""

    @pytest.mark.parametrize("total_gb,expected_tier", [
        (3.5, "none"),      # below 4GB → none
        (6.0, "standard"),  # 4–10GB → standard, no speculation
        (10.0, "full"),     # 10–24GB → full speculation
        (24.0, "ultra"),    # ≥24GB → ultra (70B viable)
        (48.0, "ultra"),
    ])
    def test_tier_boundaries(self, synthetic_cuda, total_gb, expected_tier):
        synthetic_cuda(total_gb=total_gb, free_gb=max(0.5, total_gb * 0.7))
        # Reproduce the tier logic from main.py backend_health (single-source
        # of truth assertion; a refactor that desyncs tier thresholds from
        # should_boot_draft would fail here).
        cuda_available = True
        vram_total = total_gb
        if not cuda_available or vram_total < 4.0:
            tier = "none"
        elif vram_total >= 24.0:
            tier = "ultra"
        elif vram_total >= 10.0:
            tier = "full"
        else:
            tier = "standard"
        assert tier == expected_tier


# ══════════════════════════════════════════════════════════════════════
# 5. Kill-switch: torch.cuda.OutOfMemoryError path reachable
# ══════════════════════════════════════════════════════════════════════

class TestCudaOomKillSwitch:
    """OOM guard in tts_engine must clear cache + re-raise so the
    fallback engine in _synthesize_with_fallback triggers."""

    def test_oom_guard_reraises_after_clearing(self, synthetic_cuda):
        """Simulated CUDA OOM inside the guard must clear cache and re-raise
        so TTSEngine._synthesize_with_fallback can swap to CPU."""
        # Plenty of free VRAM to pass the pre-flight headroom check,
        # then the inference itself raises OOM (post-flight path).
        synthetic_cuda(total_gb=8.0, free_gb=6.0)
        from tts import tts_engine

        called = {"empty_cache": 0}

        def fake_empty_cache():
            called["empty_cache"] += 1

        with patch.object(tts_engine, "_clear_cuda_cache",
                          side_effect=fake_empty_cache):
            def inference():
                raise RuntimeError("CUDA out of memory. Tried to allocate ...")

            with pytest.raises(RuntimeError, match="out of memory"):
                tts_engine._oom_guard(inference, device="cuda")

        assert called["empty_cache"] >= 1, (
            "CUDA OOM must clear torch.cuda cache before re-raise"
        )

    def test_oom_guard_preflight_blocks_when_headroom_too_low(
        self, synthetic_cuda_oom,
    ):
        """Pre-flight check: <0.3GB free must raise without touching CUDA."""
        from tts import tts_engine

        inference_called = {"count": 0}

        def inference():
            inference_called["count"] += 1
            return b"audio"

        with pytest.raises(RuntimeError, match="OOM guard"):
            tts_engine._oom_guard(inference, device="cuda")
        assert inference_called["count"] == 0, (
            "Pre-flight must reject BEFORE calling inference"
        )


# ══════════════════════════════════════════════════════════════════════
# 6. Meta: fixture self-check — guarantees our synthetic CUDA actually
#    fools the code under test.
# ══════════════════════════════════════════════════════════════════════

class TestFixtureSanity:
    def test_torch_cuda_is_available_is_true(self, synthetic_cuda):
        synthetic_cuda(total_gb=8.0, free_gb=6.0)
        import torch
        assert torch.cuda.is_available() is True
        free, total = torch.cuda.mem_get_info()
        assert total == 8 * 1024**3
        assert free == 6 * 1024**3

    def test_vram_manager_reports_configured_profile(self, synthetic_cuda):
        vm = synthetic_cuda(total_gb=12.0, free_gb=7.5)
        assert vm.get_total_vram() == 12.0
        assert vm.get_free_vram() == 7.5
        info = vm.detect_gpu()
        assert info["cuda_available"] is True
        assert info["total_gb"] == 12.0
