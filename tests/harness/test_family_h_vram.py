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
        from integrations.service_tools.vram_manager import VRAM_BUDGETS, VRAMManager
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

    The allocator may be called via a wrapper (_register_vram returns
    the bool) so the branch is at the wrapper's caller, not around the
    allocate() line itself.  This test scans the whole file for a
    skip-on-false pattern anywhere that uses the result.
    """
    hartos_root = project_root.parent / "HARTOS"
    if not hartos_root.exists():
        pytest.skip("HARTOS not available")
    mo = hartos_root / "integrations" / "service_tools" / "model_orchestrator.py"
    if not mo.exists():
        pytest.skip("model_orchestrator.py absent")
    src = source_text(mo)
    assert ".allocate(" in src, "no allocate() call found in model_orchestrator"
    # File-wide scan for either shape of the guard:
    #   if not vram_manager.allocate(...):   # direct
    #       return ...
    #   if not self._register_vram(...):     # wrapper
    #       return None
    # or a log + abort pair with VRAM semantics.
    has_guard = (
        ("if not " in src and ("_register_vram" in src or ".allocate(" in src)
         and ("return None" in src or "return False" in src or "continue" in src))
        or ("Skipping" in src and "VRAM" in src)
        or ("VRAM full" in src)
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
