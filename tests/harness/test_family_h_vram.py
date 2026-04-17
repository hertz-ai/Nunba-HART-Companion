"""Family H — VRAM / model orchestration defects.
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.unit


def test_h1_allocate_refuses_oversize():
    """FAILS if vram_manager.allocate() writes the dict entry without
    calling can_fit() first. This exact bug killed the LLM when TTS
    auto-loaded (10GB claim on 8GB GPU silently succeeded).
    """
    try:
        from integrations.service_tools.vram_manager import VRAMManager, VRAM_BUDGETS
    except Exception as e:
        pytest.skip(f"vram_manager not importable here: {e}")

    # Build a manager that reports 8GB free and try to allocate a tool
    # whose budget exceeds that. allocate MUST return False.
    mgr = VRAMManager()

    class _FakeGPU:
        def __init__(self):
            self.total_gb = 8.0
            self.free_gb = 8.0

        def refresh(self):
            pass

    mgr._gpu = _FakeGPU()
    # Pick an oversize budget deterministically. Force a budget that's
    # bigger than our fake GPU.
    VRAM_BUDGETS["_test_oversize"] = (10.0, 10.0)
    try:
        ok = mgr.allocate("_test_oversize")
        assert ok is False, (
            "VRAMManager.allocate() returned True for a 10GB claim on "
            "an 8GB GPU — this is the costume-#3 shallow-signal bug "
            "(dict-write without capacity check)"
        )
    finally:
        VRAM_BUDGETS.pop("_test_oversize", None)


def test_h2_lifecycle_honors_allocate_return(project_root, source_text):
    """FAILS if any caller of allocate() proceeds with a model load
    when allocate returned False.  There must be a skip/abort branch.
    """
    hartos_root = project_root.parent / "HARTOS"
    if not hartos_root.exists():
        pytest.skip("HARTOS not available")
    mo = hartos_root / "integrations" / "service_tools" / "model_orchestrator.py"
    if not mo.exists():
        pytest.skip("model_orchestrator.py absent")
    src = source_text(mo)
    # Look for an allocate() call whose False return prevents load.
    # Pattern: `if not vram_manager.allocate(...)` or `if not alloc:`
    idx = src.find(".allocate(")
    assert idx > 0, "no allocate() call found in model_orchestrator"
    # Look in the 500 chars around the call for an early-return branch.
    window = src[max(0, idx - 500):idx + 500]
    has_guard = (
        ("if not " in window and ("return" in window or "continue" in window))
        or ("== False" in window and "return" in window)
        or ("Skipping" in window and "VRAM" in window)
    )
    assert has_guard, (
        "model_orchestrator doesn't branch on allocate() return; "
        "load proceeds even when VRAM is exhausted"
    )


def test_h3_parallel_allocate_sees_same_free(project_root, source_text):
    """FAILS if allocate() isn't lock-protected. Two callers can both
    see 5GB free, both think their 4GB fits, both allocate, now 8GB
    claimed on a 5GB device.
    """
    vm = project_root.parent / "HARTOS" / "integrations" / "service_tools" / "vram_manager.py"
    if not vm.exists():
        pytest.skip("vram_manager.py absent")
    src = source_text(vm)
    has_lock = (
        "threading.Lock" in src
        or "_alloc_lock" in src
        or "RLock" in src
        or "@synchronized" in src
    )
    assert has_lock, (
        "vram_manager.allocate() is not lock-protected; concurrent "
        "loads can both pass can_fit() and overcommit the GPU"
    )
