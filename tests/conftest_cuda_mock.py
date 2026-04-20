"""
conftest_cuda_mock.py — Synthetic CUDA fixtures for GPU-path test coverage
on hosted Ubuntu runners (no NVIDIA GPU).

Layer 1 of the GPU test strategy.  See docs/ci/gpu-runner-setup.md for
layers 2 (self-hosted) and 3 (bench harness).

Why this exists
───────────────
GitHub hosted runners have no GPU, so every `torch.cuda.is_available()`
call returns False and GPU code paths (VRAM swap-and-retry, speculative
decoding threshold, TTS ladder) never execute.  That means regressions
in commits fe45daf (VRAM swap), 2acf21a (draft threshold) and the TTS
engine ladder slip through CI entirely.

The fixtures below monkey-patch:
  • torch.cuda.is_available()        → True
  • torch.cuda.mem_get_info()         → (free_bytes, total_bytes)
  • torch.cuda.device_count()         → 1
  • torch.cuda.get_device_name()      → "Synthetic RTX"
  • torch.cuda.get_device_properties  → namespace with total_memory
  • VRAMManager.detect_gpu / get_total_vram / get_free_vram

The fixtures are PARAMETERIZABLE — pass the VRAM profile you need:

    @pytest.fixture
    def eight_gig(synthetic_cuda):
        return synthetic_cuda(total_gb=8.0, free_gb=6.5)

Usage in tests:

    def test_draft_blocked_on_8gb(synthetic_cuda):
        synthetic_cuda(total_gb=8.0, free_gb=6.0)
        from llama.llama_config import LlamaConfig
        assert LlamaConfig.should_boot_draft() is False

Scope
─────
Session-scoped `torch` stub so the patch survives across tests in a
module, but per-test `synthetic_cuda` callable so each test sets its
own VRAM profile.  Teardown restores originals so unrelated tests
(e.g. real CPU torch on dev machines) are unaffected.
"""
from __future__ import annotations

import sys
import types
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

# ─────────────────────────────────────────────────────────────────────
# Synthetic torch.cuda
# ─────────────────────────────────────────────────────────────────────

class _SyntheticCudaState:
    """Holds the current pretend VRAM profile.  Mutated by tests."""

    total_bytes: int = 8 * 1024**3
    free_bytes: int = 6 * 1024**3
    device_name: str = "Synthetic RTX 3060"

    @classmethod
    def set_profile(cls, total_gb: float, free_gb: float,
                    device_name: str = "Synthetic RTX 3060") -> None:
        cls.total_bytes = int(total_gb * 1024**3)
        cls.free_bytes = int(free_gb * 1024**3)
        cls.device_name = device_name


def _install_synthetic_cuda(monkeypatch) -> None:
    """Patch torch.cuda API surface to pretend a GPU is present."""
    try:
        import torch  # type: ignore
    except ImportError:
        # No torch at all — create a minimal stub module so importers don't crash.
        torch = types.ModuleType("torch")
        torch.cuda = types.ModuleType("torch.cuda")  # type: ignore[attr-defined]
        sys.modules["torch"] = torch
        sys.modules["torch.cuda"] = torch.cuda  # type: ignore[attr-defined]

    cuda = torch.cuda

    monkeypatch.setattr(cuda, "is_available", lambda: True, raising=False)
    monkeypatch.setattr(cuda, "device_count", lambda: 1, raising=False)
    monkeypatch.setattr(
        cuda, "mem_get_info",
        lambda *a, **kw: (_SyntheticCudaState.free_bytes,
                          _SyntheticCudaState.total_bytes),
        raising=False,
    )
    monkeypatch.setattr(
        cuda, "get_device_name",
        lambda *a, **kw: _SyntheticCudaState.device_name,
        raising=False,
    )
    monkeypatch.setattr(
        cuda, "get_device_properties",
        lambda *a, **kw: SimpleNamespace(
            total_memory=_SyntheticCudaState.total_bytes,
            name=_SyntheticCudaState.device_name,
            major=8, minor=6,
        ),
        raising=False,
    )
    monkeypatch.setattr(cuda, "empty_cache", lambda: None, raising=False)
    # Torch version string — avoid `+cpu` suffix tripping CUDA-required checks
    monkeypatch.setattr(torch, "__version__", "2.2.0+cu121", raising=False)


# ─────────────────────────────────────────────────────────────────────
# Synthetic VRAMManager
# ─────────────────────────────────────────────────────────────────────

def _install_synthetic_vram_manager(monkeypatch) -> MagicMock:
    """Replace the global `vram_manager` singleton with a controllable mock.

    Returns the mock so tests can assert call counts / args.
    """
    mock_vm = MagicMock(name="synthetic_vram_manager")

    def _detect_gpu():
        total_gb = _SyntheticCudaState.total_bytes / 1024**3
        free_gb = _SyntheticCudaState.free_bytes / 1024**3
        return {
            "cuda_available": True,
            "metal_available": False,
            "name": _SyntheticCudaState.device_name,
            "total_gb": total_gb,
            "free_gb": free_gb,
        }

    mock_vm.detect_gpu.side_effect = _detect_gpu
    mock_vm.get_total_vram.side_effect = (
        lambda: _SyntheticCudaState.total_bytes / 1024**3
    )
    mock_vm.get_free_vram.side_effect = (
        lambda: _SyntheticCudaState.free_bytes / 1024**3
    )
    mock_vm.get_allocations.return_value = {}

    # Default: can_fit → True when free ≥ 2 GB, else False
    mock_vm.can_fit.side_effect = (
        lambda tool: _SyntheticCudaState.free_bytes >= 2 * 1024**3
    )

    # suggest_offload_mode: free≥4 → 'gpu', 2–4 → 'cpu_offload', <2 → 'cpu_only'
    def _suggest(tool):
        free = _SyntheticCudaState.free_bytes / 1024**3
        if free >= 4.0:
            return "gpu"
        if free >= 2.0:
            return "cpu_offload"
        return "cpu_only"

    mock_vm.suggest_offload_mode.side_effect = _suggest

    # ── Patch every resolution path ──
    # HARTOS `integrations/service_tools/__init__.py` re-exports the singleton
    # instance at package level, so `integrations.service_tools.vram_manager`
    # resolves to the INSTANCE (shadowing the submodule).  We must patch:
    #   1. sys.modules['integrations.service_tools.vram_manager'].vram_manager
    #      — what `from ... import vram_manager` actually resolves to
    #   2. integrations.service_tools.vram_manager (the package attribute)
    #      — what `from integrations.service_tools import vram_manager` uses
    try:
        import integrations  # noqa: F401
        import integrations.service_tools  # noqa: F401
        # Force the submodule into sys.modules if it's not there (import
        # machinery sometimes skips when package attr already shadows it).
        if "integrations.service_tools.vram_manager" not in sys.modules:
            import importlib
            importlib.import_module("integrations.service_tools.vram_manager")

        submod = sys.modules["integrations.service_tools.vram_manager"]
        monkeypatch.setattr(submod, "vram_manager", mock_vm, raising=False)

        # Package-level attribute (shadows the submodule)
        pkg = sys.modules["integrations.service_tools"]
        monkeypatch.setattr(pkg, "vram_manager", mock_vm, raising=False)
    except ImportError:
        # HARTOS not installed — stub the module tree so that
        # `from integrations.service_tools.vram_manager import vram_manager`
        # succeeds for code-under-test.
        pkg = types.ModuleType("integrations")
        sub = types.ModuleType("integrations.service_tools")
        mod = types.ModuleType("integrations.service_tools.vram_manager")
        mod.vram_manager = mock_vm
        mod.VRAMManager = MagicMock(return_value=mock_vm)
        sys.modules.setdefault("integrations", pkg)
        sys.modules["integrations.service_tools"] = sub
        sys.modules["integrations.service_tools.vram_manager"] = mod
        pkg.service_tools = sub  # type: ignore[attr-defined]
        sub.vram_manager = mock_vm  # type: ignore[attr-defined]

    return mock_vm


# ─────────────────────────────────────────────────────────────────────
# Public pytest fixtures
# ─────────────────────────────────────────────────────────────────────

@pytest.fixture
def synthetic_cuda(monkeypatch):
    """Install synthetic CUDA + VRAMManager.  Returns a configurator.

    Example:
        def test_something(synthetic_cuda):
            vm_mock = synthetic_cuda(total_gb=16.0, free_gb=12.0)
            ... # VRAMManager and torch.cuda now pretend there's a 16GB card
    """
    _install_synthetic_cuda(monkeypatch)
    mock_vm = _install_synthetic_vram_manager(monkeypatch)

    def _configure(total_gb: float, free_gb: float,
                   device_name: str = "Synthetic RTX 3060") -> MagicMock:
        if free_gb > total_gb:
            raise ValueError("free_gb cannot exceed total_gb")
        _SyntheticCudaState.set_profile(total_gb, free_gb, device_name)
        return mock_vm

    # Sensible default so tests that don't configure still get a valid state.
    _configure(total_gb=8.0, free_gb=6.0)
    return _configure


@pytest.fixture
def synthetic_cuda_oom(synthetic_cuda):
    """CUDA present but 0 free VRAM — trips kill-switch / OOM guard paths."""
    return synthetic_cuda(total_gb=8.0, free_gb=0.1)


@pytest.fixture
def synthetic_cuda_low(synthetic_cuda):
    """8 GB card, 3 GB free — below dual-boot threshold."""
    return synthetic_cuda(total_gb=8.0, free_gb=3.0)


@pytest.fixture
def synthetic_cuda_mid(synthetic_cuda):
    """10 GB card, 6 GB free — right at the draft-boot boundary."""
    return synthetic_cuda(total_gb=10.0, free_gb=6.0)


@pytest.fixture
def synthetic_cuda_high(synthetic_cuda):
    """16 GB card, 12 GB free — comfortable dual + TTS."""
    return synthetic_cuda(total_gb=16.0, free_gb=12.0)
