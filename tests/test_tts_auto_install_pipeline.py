"""Tests for the TTS auto-install pipeline — covers the 3 bugs that
caused Indic Parler to never auto-install on a Tamil-speaking user's
fresh device (probe_indic_parler.err evidence, 2026-04-16):

  Bug 1: _try_auto_install_backend used find_spec() as its
         "already installed" gate, while _can_run_backend used the
         subprocess probe.  Disagreement → install never triggered
         even when probe correctly reported "can't run".

  Bug 2: check_backend_runnable in _torch_probe.py called
         os.add_dll_directory(torch/lib) UNCONDITIONALLY, while
         check_cuda_available 50 lines above guarded with isdir.
         When torch/lib was missing the probe subprocess crashed
         (FileNotFoundError) instead of returning a clean False.

  Bug 3: install_backend_packages triggered CUDA torch install only
         when 'torchaudio' was in to_install.  But torchaudio's .py
         files often exist in python-embed/ so find_spec() reports
         True → torchaudio NOT in to_install → CUDA torch upgrade
         path skipped → parler_tts install "succeeds" but is unusable
         because CUDA torch is missing.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, patch

import pytest

# ─────────────────────────────────────────────────────────────────────
# Bug 2: check_backend_runnable must guard against missing torch/lib
# ─────────────────────────────────────────────────────────────────────

def test_check_backend_runnable_returns_false_when_torch_lib_missing(tmp_path, monkeypatch):
    """The subprocess probe must NOT crash when ~/.nunba/site-packages/
    torch/lib doesn't exist.  Should return False cleanly so callers
    can route to install instead of seeing a FileNotFoundError."""
    from tts import _torch_probe

    # Point _torch_probe at an empty tmp_path that has NO torch/lib
    fake_usp = tmp_path / 'site-packages'
    fake_usp.mkdir()
    fake_tlib = fake_usp / 'torch' / 'lib'  # intentionally not created

    monkeypatch.setattr(_torch_probe, '_usp', str(fake_usp))
    monkeypatch.setattr(_torch_probe, '_tlib', str(fake_tlib))
    monkeypatch.setattr(_torch_probe, '_embed_py', sys.executable)
    monkeypatch.setattr(_torch_probe, '_backend_cache', {})

    # Should return False (not raise)
    result = _torch_probe.check_backend_runnable('indic_parler', 'parler_tts')
    assert result is False, (
        "Probe must return False when torch/lib missing, not crash. "
        "Compare with check_cuda_available which has the os.path.isdir guard."
    )


def test_check_cuda_available_already_guards_torch_lib(tmp_path, monkeypatch):
    """Reference invariant — check_cuda_available has always had the
    isdir guard.  This test pins the existing behavior so future
    refactors don't drop it."""
    from tts import _torch_probe

    fake_usp = tmp_path / 'site-packages'
    fake_usp.mkdir()
    fake_tlib = fake_usp / 'torch' / 'lib'

    monkeypatch.setattr(_torch_probe, '_usp', str(fake_usp))
    monkeypatch.setattr(_torch_probe, '_tlib', str(fake_tlib))
    monkeypatch.setattr(_torch_probe, '_embed_py', sys.executable)
    monkeypatch.setattr(_torch_probe, '_cuda_cached', None)

    assert _torch_probe.check_cuda_available() is False


# ─────────────────────────────────────────────────────────────────────
# Bug 1: _try_auto_install_backend must agree with _can_run_backend
# ─────────────────────────────────────────────────────────────────────

def test_try_auto_install_uses_subprocess_probe_not_find_spec(monkeypatch):
    """Regression: previously _try_auto_install_backend used
    importlib.util.find_spec() to short-circuit "already installed".
    But find_spec only checks if the .py exists — it doesn't catch
    "wheel is there but CUDA torch is missing so it can't import".

    Both _can_run_backend AND _try_auto_install_backend must consult
    the SAME probe (check_backend_runnable) so they agree on
    runnable-ness.  Otherwise install never triggers for a half-
    installed backend.
    """
    from tts.tts_engine import TTSEngine

    engine = TTSEngine.__new__(TTSEngine)
    engine.has_gpu = True
    engine._ensure_hw_detected = lambda: None
    engine._vram_allows = lambda b: True

    # Reset class state for test isolation
    TTSEngine._auto_install_pending = set()
    TTSEngine._auto_install_failed = set()
    TTSEngine._import_check_cache = {}

    bg_install_called = {'flag': False}

    def _fake_thread(target=None, daemon=None, name=None):
        # Don't actually start the install thread — just observe
        bg_install_called['flag'] = True
        m = MagicMock()
        m.start = MagicMock()
        return m

    # Probe says "not runnable" (CUDA torch missing scenario)
    with patch('tts._torch_probe.check_backend_runnable', return_value=False) as mock_probe, \
         patch('threading.Thread', side_effect=_fake_thread):
        engine._try_auto_install_backend('indic_parler')

    assert bg_install_called['flag'], (
        "Auto-install thread MUST start when probe says backend isn't runnable. "
        "Previously short-circuited by find_spec returning True for parler_tts "
        "while CUDA torch was missing — install never ran."
    )


def test_try_auto_install_skips_when_probe_says_runnable(monkeypatch):
    """Inverse: when the probe says the backend CAN actually run,
    auto-install must skip — no point installing what already works."""
    from tts.tts_engine import TTSEngine

    engine = TTSEngine.__new__(TTSEngine)
    engine.has_gpu = True
    engine._ensure_hw_detected = lambda: None
    engine._vram_allows = lambda b: True

    TTSEngine._auto_install_pending = set()
    TTSEngine._auto_install_failed = set()
    TTSEngine._import_check_cache = {}

    bg_install_called = {'flag': False}

    def _fake_thread(target=None, daemon=None, name=None):
        bg_install_called['flag'] = True
        m = MagicMock()
        m.start = MagicMock()
        return m

    with patch('tts._torch_probe.check_backend_runnable', return_value=True), \
         patch('threading.Thread', side_effect=_fake_thread):
        result = engine._try_auto_install_backend('indic_parler')

    assert result is True, "Should return True when backend already runnable"
    assert not bg_install_called['flag'], "Must NOT spawn install thread when already runnable"


# ─────────────────────────────────────────────────────────────────────
# Bug 3: install_backend_packages must install CUDA torch for GPU backends
# even when torchaudio's .py file is already present
# ─────────────────────────────────────────────────────────────────────

def test_install_backend_packages_triggers_cuda_torch_when_missing(monkeypatch):
    """Regression: install_backend_packages only called install_gpu_torch()
    when 'torchaudio' was in to_install.  But torchaudio .py files often
    pre-exist in python-embed/ → find_spec returns True → torchaudio NOT
    in to_install → CUDA torch install skipped → backend unusable.

    Fix: for GPU backends, check is_cuda_torch() directly.  If GPU
    backend and no CUDA torch, install CUDA torch first regardless of
    torchaudio presence.
    """
    from tts import package_installer

    # Scenario: parler_tts + torchaudio present (find_spec True), CUDA torch missing
    def _is_pkg_installed(name):
        # All packages "already installed" — but CUDA torch is missing
        return True

    install_gpu_called = {'flag': False}

    def _fake_install_gpu_torch(progress_cb=None):
        install_gpu_called['flag'] = True
        return True, "ok"

    monkeypatch.setattr(package_installer, 'is_package_installed', _is_pkg_installed)
    monkeypatch.setattr(package_installer, 'is_cuda_torch', lambda: False)
    monkeypatch.setattr(package_installer, 'has_nvidia_gpu', lambda: True)
    monkeypatch.setattr(package_installer, 'install_gpu_torch', _fake_install_gpu_torch)
    monkeypatch.setattr(package_installer, '_run_pip',
                        lambda *a, **kw: (True, 'ok'))
    monkeypatch.setattr(package_installer, '_invalidate_import_cache', lambda: None)

    ok, _msg = package_installer.install_backend_packages('indic_parler')

    assert ok, "install should succeed in this scenario"
    assert install_gpu_called['flag'], (
        "install_gpu_torch MUST be called when GPU backend needs CUDA "
        "and is_cuda_torch() returns False — regardless of whether "
        "torchaudio .py file is already present.  Previously gated by "
        "'torchaudio in to_install' which missed this case."
    )


def test_install_backend_packages_skips_cuda_torch_when_already_cuda(monkeypatch):
    """Inverse: when CUDA torch is already there, don't reinstall."""
    from tts import package_installer

    install_gpu_called = {'flag': False}

    def _fake_install_gpu_torch(progress_cb=None):
        install_gpu_called['flag'] = True
        return True, "ok"

    monkeypatch.setattr(package_installer, 'is_package_installed', lambda n: True)
    monkeypatch.setattr(package_installer, 'is_cuda_torch', lambda: True)
    monkeypatch.setattr(package_installer, 'has_nvidia_gpu', lambda: True)
    monkeypatch.setattr(package_installer, 'install_gpu_torch', _fake_install_gpu_torch)
    monkeypatch.setattr(package_installer, '_run_pip',
                        lambda *a, **kw: (True, 'ok'))
    monkeypatch.setattr(package_installer, '_invalidate_import_cache', lambda: None)

    package_installer.install_backend_packages('indic_parler')

    assert not install_gpu_called['flag'], (
        "Must not reinstall CUDA torch when already present"
    )


def test_install_backend_packages_skips_cuda_torch_for_cpu_backends(monkeypatch):
    """Piper is CPU-only — never trigger CUDA torch install for it."""
    from tts import package_installer

    install_gpu_called = {'flag': False}

    def _fake_install_gpu_torch(progress_cb=None):
        install_gpu_called['flag'] = True
        return True, "ok"

    monkeypatch.setattr(package_installer, 'is_package_installed', lambda n: False)
    monkeypatch.setattr(package_installer, 'is_cuda_torch', lambda: False)
    monkeypatch.setattr(package_installer, 'has_nvidia_gpu', lambda: True)
    monkeypatch.setattr(package_installer, 'install_gpu_torch', _fake_install_gpu_torch)
    monkeypatch.setattr(package_installer, '_run_pip',
                        lambda *a, **kw: (True, 'ok'))
    monkeypatch.setattr(package_installer, '_invalidate_import_cache', lambda: None)

    package_installer.install_backend_packages('piper')

    assert not install_gpu_called['flag'], "CPU backends never need CUDA torch"
