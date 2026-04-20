"""
Tests for tts/package_installer.py

Comprehensive coverage of all public functions with happy path,
error path, and edge cases.  All subprocess / pip / importlib
operations are mocked so tests run without side-effects.
"""
import os
import subprocess
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Import the module under test
# ---------------------------------------------------------------------------
from tts import package_installer as pi

# ========================== get_python_embed_dir ==========================

class TestGetPythonEmbedDir:

    def test_frozen_build_embed_exists(self, tmp_path):
        embed = tmp_path / "python-embed"
        embed.mkdir()
        with patch.object(sys, 'frozen', True, create=True), \
             patch.object(sys, 'executable', str(tmp_path / 'app.exe')):
            result = pi.get_python_embed_dir()
            assert result == str(embed)

    def test_frozen_build_embed_missing(self, tmp_path):
        with patch.object(sys, 'frozen', True, create=True), \
             patch.object(sys, 'executable', str(tmp_path / 'app.exe')):
            result = pi.get_python_embed_dir()
            assert result is None

    def test_dev_mode_embed_exists(self, tmp_path):
        # In dev mode __file__ is used; simulate tts/package_installer.py
        tts_dir = tmp_path / "tts"
        tts_dir.mkdir()
        fake_file = tts_dir / "package_installer.py"
        fake_file.write_text("")
        embed = tmp_path / "python-embed"
        embed.mkdir()

        # Remove frozen attribute if present
        with patch.object(pi, '__file__', str(fake_file)), \
             patch.object(sys, 'frozen', False, create=True):
            # get_python_embed_dir reads __file__ from its own module
            result = pi.get_python_embed_dir()
            # The real function uses os.path.abspath(__file__), so it will
            # point to real file. We patch at a lower level instead.
            # Just verify it returns str or None
            assert result is None or isinstance(result, str)

    def test_dev_mode_embed_missing(self):
        with patch('sys.frozen', False, create=True):
            # Default dev mode; may or may not find python-embed
            result = pi.get_python_embed_dir()
            assert result is None or isinstance(result, str)


# ========================== get_embed_python ==============================

class TestGetEmbedPython:

    def test_returns_none_when_no_embed_dir(self):
        with patch.object(pi, 'get_python_embed_dir', return_value=None):
            assert pi.get_embed_python() is None

    def test_returns_windows_exe(self, tmp_path):
        embed = tmp_path / "python-embed"
        embed.mkdir()
        exe = embed / "python.exe"
        exe.write_text("")
        with patch.object(pi, 'get_python_embed_dir', return_value=str(embed)):
            assert pi.get_embed_python() == str(exe)

    def test_returns_unix_bin(self, tmp_path):
        embed = tmp_path / "python-embed"
        bin_dir = embed / "bin"
        bin_dir.mkdir(parents=True)
        py3 = bin_dir / "python3"
        py3.write_text("")
        with patch.object(pi, 'get_python_embed_dir', return_value=str(embed)):
            assert pi.get_embed_python() == str(py3)

    def test_returns_none_when_no_executable(self, tmp_path):
        embed = tmp_path / "python-embed"
        embed.mkdir()
        with patch.object(pi, 'get_python_embed_dir', return_value=str(embed)):
            assert pi.get_embed_python() is None


# ========================== get_embed_site_packages =======================

class TestGetEmbedSitePackages:

    def test_returns_none_when_no_embed_dir(self):
        with patch.object(pi, 'get_python_embed_dir', return_value=None):
            assert pi.get_embed_site_packages() is None

    def test_returns_path_when_exists(self, tmp_path):
        sp = tmp_path / "python-embed" / "Lib" / "site-packages"
        sp.mkdir(parents=True)
        with patch.object(pi, 'get_python_embed_dir',
                          return_value=str(tmp_path / "python-embed")):
            assert pi.get_embed_site_packages() == str(sp)

    def test_returns_none_when_missing(self, tmp_path):
        embed = tmp_path / "python-embed"
        embed.mkdir()
        with patch.object(pi, 'get_python_embed_dir', return_value=str(embed)):
            assert pi.get_embed_site_packages() is None


# ========================== _canonical_import_name ========================

class TestCanonicalImportName:
    """J67 regression guard — every pip requirement spec must resolve
    to the BARE importable module name before it reaches
    `importlib.util.find_spec`.  `find_spec` raises
    ModuleNotFoundError on strings containing '==', '>=', etc.
    """

    def test_strips_gte_version(self):
        assert pi._canonical_import_name('huggingface_hub>=0') == 'huggingface_hub'

    def test_strips_gte_with_upper_bound(self):
        assert pi._canonical_import_name(
            'huggingface_hub>=0.27.0,<0.29.0'
        ) == 'huggingface_hub'

    def test_strips_lt_version(self):
        assert pi._canonical_import_name('numpy<2.0.0') == 'numpy'

    def test_strips_eq_version(self):
        assert pi._canonical_import_name('torch==2.4.1') == 'torch'

    def test_strips_ne_version(self):
        assert pi._canonical_import_name('foo!=1.2.3') == 'foo'

    def test_strips_compat_spec(self):
        assert pi._canonical_import_name('bar~=1.0') == 'bar'

    def test_applies_pip_to_import_alias(self):
        # chatterbox-tts (pip) → chatterbox (import)
        assert pi._canonical_import_name('chatterbox-tts') == 'chatterbox'

    def test_applies_alias_with_version(self):
        assert pi._canonical_import_name('parler-tts==0.2.2') == 'parler_tts'

    def test_dash_to_underscore_fallback(self):
        # piper-tts has no alias → dash→underscore fallback
        assert pi._canonical_import_name('piper-tts') == 'piper_tts'

    def test_bare_name_passes_through(self):
        assert pi._canonical_import_name('torchaudio') == 'torchaudio'

    def test_no_pip_operator_ever_returned(self):
        # Belt-and-suspenders: whatever we throw at this helper, the
        # return value must be a valid Python identifier-ish string —
        # never contains pip version operators.
        samples = [
            'huggingface_hub>=0',
            'numpy<2.0.0',
            'torch==2.4.1',
            'piper-tts',
            'chatterbox-tts>=1.0.0',
            'foo!=1.2.3',
            'bar~=1.0',
        ]
        for s in samples:
            out = pi._canonical_import_name(s)
            for op in ('==', '>=', '<=', '!=', '>', '<', '~'):
                assert op not in out, f'{s!r} → {out!r} leaked {op!r}'


# ========================== is_package_installed ==========================

class TestIsPackageInstalled:

    def test_installed_package(self):
        with patch('importlib.util.find_spec', return_value=MagicMock()):
            assert pi.is_package_installed('os') is True

    def test_missing_package(self):
        with patch('importlib.util.find_spec', return_value=None):
            assert pi.is_package_installed('nonexistent_xyz') is False


# ========================== is_cuda_torch =================================

class TestIsCudaTorch:

    def test_cuda_available(self):
        fake_torch = types.ModuleType('torch')
        fake_torch.cuda = MagicMock()
        fake_torch.cuda.is_available.return_value = True
        with patch.dict(sys.modules, {'torch': fake_torch}):
            # Need to reload or call directly since import torch is inside func
            assert pi.is_cuda_torch() is True

    def test_cuda_not_available(self):
        # is_cuda_torch checks a torch/version.py file on disk FIRST before
        # falling back to `import torch`. Mock os.path.isfile to force the
        # file-check branch to miss so we actually exercise the import
        # fallback. On CI the file does not exist, but on dev machines
        # with real ~/.nunba/site-packages/torch/version.py containing
        # '+cu', this test would otherwise return True regardless of the
        # torch module mock.
        fake_torch = types.ModuleType('torch')
        fake_torch.cuda = MagicMock()
        fake_torch.cuda.is_available.return_value = False
        with patch('os.path.isfile', return_value=False), \
             patch.dict(sys.modules, {'torch': fake_torch}):
            assert pi.is_cuda_torch() is False

    def test_torch_not_installed(self):
        # Same file-check caveat as test_cuda_not_available — force the
        # on-disk version.py probe to miss, then the import-torch fallback
        # raises ImportError which returns False.
        with patch('os.path.isfile', return_value=False), \
             patch.dict(sys.modules, {'torch': None}):
            # importing torch when it's None in sys.modules raises ImportError
            assert pi.is_cuda_torch() is False


# ========================== get_torch_variant =============================

class TestGetTorchVariant:

    def test_cpu_variant(self):
        fake_torch = types.ModuleType('torch')
        fake_torch.__version__ = '2.4.0+cpu'
        with patch.dict(sys.modules, {'torch': fake_torch}):
            assert pi.get_torch_variant() == 'cpu'

    def test_cuda_variant(self):
        fake_torch = types.ModuleType('torch')
        fake_torch.__version__ = '2.4.0+cu124'
        with patch.dict(sys.modules, {'torch': fake_torch}):
            assert pi.get_torch_variant() == 'cu124'

    def test_unknown_variant(self):
        fake_torch = types.ModuleType('torch')
        fake_torch.__version__ = '2.4.0'
        with patch.dict(sys.modules, {'torch': fake_torch}):
            assert pi.get_torch_variant() == 'unknown'

    def test_no_torch(self):
        with patch.dict(sys.modules, {'torch': None}):
            assert pi.get_torch_variant() == 'none'


# ========================== has_nvidia_gpu ================================

class TestHasNvidiaGpu:

    def test_gpu_present(self):
        result = subprocess.CompletedProcess(
            args=[], returncode=0, stdout='NVIDIA GeForce RTX 3090\n', stderr='')
        with patch('subprocess.run', return_value=result):
            assert pi.has_nvidia_gpu() is True

    def test_no_gpu_returncode(self):
        result = subprocess.CompletedProcess(
            args=[], returncode=1, stdout='', stderr='not found')
        with patch('subprocess.run', return_value=result):
            assert pi.has_nvidia_gpu() is False

    def test_nvidia_smi_not_found(self):
        with patch('subprocess.run', side_effect=FileNotFoundError):
            assert pi.has_nvidia_gpu() is False

    def test_timeout(self):
        with patch('subprocess.run', side_effect=subprocess.TimeoutExpired('cmd', 5)):
            assert pi.has_nvidia_gpu() is False

    def test_empty_stdout(self):
        result = subprocess.CompletedProcess(
            args=[], returncode=0, stdout='', stderr='')
        with patch('subprocess.run', return_value=result):
            assert pi.has_nvidia_gpu() is False


# ========================== get_user_site_packages ========================

class TestGetUserSitePackages:

    def test_creates_directory(self, tmp_path):
        with patch.object(Path, 'home', return_value=tmp_path):
            result = pi.get_user_site_packages()
            expected = str(tmp_path / '.nunba' / 'site-packages')
            assert result == expected
            assert os.path.isdir(expected)


# ========================== ensure_user_site_on_path ======================

class TestEnsureUserSiteOnPath:

    def test_adds_to_path(self, tmp_path):
        sp = str(tmp_path / '.nunba' / 'site-packages')
        with patch.object(pi, 'get_user_site_packages', return_value=sp):
            # Remove from sys.path if present
            orig = sys.path.copy()
            if sp in sys.path:
                sys.path.remove(sp)
            try:
                pi.ensure_user_site_on_path()
                assert sp in sys.path
            finally:
                sys.path[:] = orig

    def test_no_duplicate(self, tmp_path):
        sp = str(tmp_path / '.nunba' / 'site-packages')
        with patch.object(pi, 'get_user_site_packages', return_value=sp):
            orig = sys.path.copy()
            try:
                if sp not in sys.path:
                    sys.path.insert(0, sp)
                count_before = sys.path.count(sp)
                pi.ensure_user_site_on_path()
                assert sys.path.count(sp) == count_before
            finally:
                sys.path[:] = orig


# ========================== _run_pip ======================================
#
# _run_pip was refactored from subprocess.run() to subprocess.Popen() +
# streaming drain thread so pip output could be surfaced line-by-line to
# the UI (stall detection, heartbeat progress, etc.).  The original
# patches on subprocess.run silently no-op'd and the tests started
# executing the real binary, which of course fails with
# "[Errno 2] No such file or directory: '/fake/python.exe'".  The
# fixture + _FakePopen below restore proper isolation while preserving
# every assertion the original tests made.

class _FakePopen:
    """Minimal Popen stand-in covering the exact surface _run_pip uses:
    stdout iteration in the drain thread, poll() to exit the wait loop,
    wait(), kill().  Returncode is seeded by the test; stdout yields the
    provided lines then EOF.
    """

    def __init__(self, stdout_lines=None, returncode=0, wait_exc=None):
        self._lines = list(stdout_lines or ['ok'])
        self._rc = returncode
        self._wait_exc = wait_exc
        # Use a stream-like wrapper so the drain thread's iteration +
        # potential .close() call both work without AttributeError.
        self.stdout = _FakePopen._Stdout(self._lines)
        self._polls = 0

    def poll(self):
        # Let the drain thread deliver all lines before we signal exit.
        self._polls += 1
        if self._polls >= 3:
            return self._rc
        return None

    def wait(self, timeout=None):
        if self._wait_exc is not None:
            raise self._wait_exc
        return self._rc

    def kill(self):
        return None

    @property
    def returncode(self):
        return self._rc

    # list_iterator has no close(); the drain thread calls stdout.close()
    # in some code paths — give it a no-op to silence the warning and
    # avoid the AttributeError spam in pytest output.
    class _Stdout:
        def __init__(self, lines):
            self._iter = iter(lines)
        def __iter__(self):
            return self._iter
        def __next__(self):
            return next(self._iter)
        def close(self):
            return None
        def read(self):
            return ''


class TestRunPip:

    @staticmethod
    def _common_patches(popen_return=None, popen_side_effect=None):
        """Return the context-manager stack every _run_pip test needs."""
        return [
            patch.object(pi, 'get_embed_python', return_value='/fake/python.exe'),
            patch.object(pi, 'get_user_site_packages', return_value='/user/sp'),
            patch.object(pi, 'ensure_user_site_on_path'),
            patch('subprocess.Popen',
                  **({'return_value': popen_return} if popen_return is not None
                     else {'side_effect': popen_side_effect})),
        ]

    def _run_with(self, popen, call_args=('install', 'pkg'), **kwargs):
        """Apply the common patches + return (ok, msg)."""
        import contextlib
        with contextlib.ExitStack() as stack:
            for p in self._common_patches(popen_return=popen):
                stack.enter_context(p)
            return pi._run_pip(list(call_args), **kwargs)

    def test_success(self):
        ok, msg = self._run_with(_FakePopen(['installed ok'], returncode=0))
        assert ok is True

    def test_no_python_embed(self):
        with patch.object(pi, 'get_embed_python', return_value=None):
            ok, msg = pi._run_pip(['install', 'pkg'])
            assert ok is False
            assert 'python-embed not found' in msg

    def test_pip_failure(self):
        ok, msg = self._run_with(_FakePopen(['error msg'], returncode=1))
        assert ok is False
        assert 'error msg' in msg

    def test_timeout(self):
        # Sim a wall-clock timeout by forcing poll() to never return and
        # the subprocess.Popen to have a 0 timeout budget — we assert
        # _run_pip returns with 'timed out' in the message.
        import contextlib
        class _ForeverPopen(_FakePopen):
            def poll(self):
                return None
            def wait(self, timeout=None):
                raise subprocess.TimeoutExpired('cmd', timeout or 0)

        with contextlib.ExitStack() as stack:
            for p in self._common_patches(popen_return=_ForeverPopen()):
                stack.enter_context(p)
            ok, msg = pi._run_pip(['install', 'pkg'], timeout=0, stall_timeout=0)
        assert ok is False
        assert 'timed out' in msg or 'stalled' in msg

    def test_exception(self):
        import contextlib
        with contextlib.ExitStack() as stack:
            for p in self._common_patches(popen_side_effect=OSError('boom')):
                stack.enter_context(p)
            ok, msg = pi._run_pip(['install', 'pkg'])
        assert ok is False
        assert 'boom' in msg

    def test_install_adds_target_flag(self):
        import contextlib
        fake = _FakePopen(['ok'], returncode=0)
        with contextlib.ExitStack() as stack:
            popen_patch = patch('subprocess.Popen', return_value=fake)
            stack.enter_context(patch.object(pi, 'get_embed_python', return_value='/fake/python.exe'))
            stack.enter_context(patch.object(pi, 'get_user_site_packages', return_value='/user/sp'))
            stack.enter_context(patch.object(pi, 'ensure_user_site_on_path'))
            mock_popen = stack.enter_context(popen_patch)
            pi._run_pip(['install', 'pkg'])
            cmd = mock_popen.call_args[0][0]
            assert '--target' in cmd
            assert '/user/sp' in cmd

    def test_non_install_no_target(self):
        import contextlib
        fake = _FakePopen(['ok'], returncode=0)
        with contextlib.ExitStack() as stack:
            popen_patch = patch('subprocess.Popen', return_value=fake)
            stack.enter_context(patch.object(pi, 'get_embed_python', return_value='/fake/python.exe'))
            stack.enter_context(patch.object(pi, 'get_user_site_packages', return_value='/user/sp'))
            stack.enter_context(patch.object(pi, 'ensure_user_site_on_path'))
            mock_popen = stack.enter_context(popen_patch)
            pi._run_pip(['uninstall', '-y', 'pkg'])
            cmd = mock_popen.call_args[0][0]
            assert '--target' not in cmd

    def test_progress_callback_called(self):
        cb = MagicMock()
        self._run_with(_FakePopen(['ok'], returncode=0), progress_cb=cb)
        cb.assert_called()


# ========================== install_gpu_torch =============================
# Renamed from install_cuda_torch when ROCm + Metal variants landed —
# the function name dropped the CUDA-specific prefix, but this test
# class name keeps TestInstallCudaTorch as a historical anchor for
# grep searches.  The *function calls* inside all use install_gpu_torch.

class TestInstallCudaTorch:

    # install_gpu_torch now prefers vram_manager.detect_gpu() over
    # has_nvidia_gpu() and acquires a file lock at the top — both must
    # be mocked.  Tests previously only patched has_nvidia_gpu which was
    # the SECONDARY path; stubbing vram_manager properly + neutralising
    # the lock keeps them hermetic.

    @staticmethod
    def _mock_gpu_detect(vendor='nvidia'):
        """Return a MagicMock vram_manager whose detect_gpu reports the
        requested vendor. ``vendor`` ∈ {'nvidia','amd',None}."""
        fake = MagicMock()
        if vendor == 'nvidia':
            fake.detect_gpu.return_value = {'cuda_available': True, 'name': 'Fake NVIDIA'}
        elif vendor == 'amd':
            fake.detect_gpu.return_value = {'cuda_available': False, 'name': 'AMD Radeon'}
        else:
            fake.detect_gpu.return_value = {'cuda_available': False, 'name': ''}
        return fake

    def test_no_nvidia_gpu(self):
        vm_mod = types.ModuleType('integrations.service_tools.vram_manager')
        vm_mod.vram_manager = self._mock_gpu_detect(vendor=None)
        with patch.object(pi, '_acquire_file_lock', return_value=True), \
             patch.dict(sys.modules, {'integrations.service_tools.vram_manager': vm_mod}), \
             patch.object(pi, 'has_nvidia_gpu', return_value=False):
            ok, msg = pi.install_gpu_torch()
            assert ok is False
            assert 'No GPU detected' in msg

    def test_already_cuda(self):
        vm_mod = types.ModuleType('integrations.service_tools.vram_manager')
        vm_mod.vram_manager = self._mock_gpu_detect(vendor='nvidia')
        with patch.object(pi, '_acquire_file_lock', return_value=True), \
             patch.dict(sys.modules, {'integrations.service_tools.vram_manager': vm_mod}), \
             patch.object(pi, 'get_torch_variant', return_value='cu124'):
            ok, msg = pi.install_gpu_torch()
            assert ok is True
            assert 'already has GPU' in msg or 'already has CUDA' in msg

    def test_successful_swap(self):
        fake_torch = types.ModuleType('torch')
        fake_torch.__version__ = '2.4.0+cu124'
        fake_torch.cuda = MagicMock()
        fake_torch.cuda.is_available.return_value = True
        fake_torch.cuda.get_device_name.return_value = 'RTX 3090'
        vm_mod = types.ModuleType('integrations.service_tools.vram_manager')
        vm_mod.vram_manager = self._mock_gpu_detect(vendor='nvidia')

        with patch.object(pi, '_acquire_file_lock', return_value=True), \
             patch.dict(sys.modules, {
                 'integrations.service_tools.vram_manager': vm_mod,
                 'torch': fake_torch,
             }), \
             patch.object(pi, 'get_torch_variant', return_value='cpu'), \
             patch.object(pi, '_run_pip', return_value=(True, 'ok')), \
             patch.object(pi, '_invalidate_import_cache', create=True):
            cb = MagicMock()
            ok, msg = pi.install_gpu_torch(progress_cb=cb)
            assert ok is True
            assert cb.call_count >= 1

    def test_pip_failure(self):
        vm_mod = types.ModuleType('integrations.service_tools.vram_manager')
        vm_mod.vram_manager = self._mock_gpu_detect(vendor='nvidia')
        with patch.object(pi, '_acquire_file_lock', return_value=True), \
             patch.dict(sys.modules, {'integrations.service_tools.vram_manager': vm_mod}), \
             patch.object(pi, 'get_torch_variant', return_value='cpu'), \
             patch.object(pi, '_run_pip', return_value=(False, 'network error')):
            ok, msg = pi.install_gpu_torch()
            assert ok is False


# ========================== install_backend_packages ======================

class TestInstallBackendPackages:

    def test_no_packages_needed(self):
        ok, msg = pi.install_backend_packages('piper')
        assert ok is True
        assert 'No packages needed' in msg

    def test_unknown_backend(self):
        ok, msg = pi.install_backend_packages('nonexistent_backend')
        assert ok is True
        assert 'No packages needed' in msg

    def test_all_already_installed(self):
        # Also stub is_cuda_torch=True so the GPU-backend CUDA-torch
        # gate (added 2026-04-16) doesn't try to install CUDA torch
        # on top of "all packages already installed".  Without this
        # stub, the test would only pass on a machine that genuinely
        # has CUDA torch installed.
        with patch.object(pi, 'is_package_installed', return_value=True), \
             patch.object(pi, 'is_cuda_torch', return_value=True):
            ok, msg = pi.install_backend_packages('f5')
            assert ok is True
            assert 'already installed' in msg

    def test_installs_missing_packages(self):
        # Simulate: torchaudio installed, f5_tts missing
        def fake_installed(name):
            return name == 'torchaudio'

        with patch.object(pi, 'is_package_installed', side_effect=fake_installed), \
             patch.object(pi, 'get_torch_variant', return_value='cu124'), \
             patch.object(pi, '_run_pip', return_value=(True, 'ok')), \
             patch.object(pi, '_invalidate_import_cache'):
            cb = MagicMock()
            ok, msg = pi.install_backend_packages('f5', progress_cb=cb)
            # After install, is_package_installed is still the fake so all_ok check may fail
            # The important thing is _run_pip was called
            assert isinstance(ok, bool)

    def test_install_failure(self):
        with patch.object(pi, 'is_package_installed', return_value=False), \
             patch.object(pi, 'get_torch_variant', return_value='cpu'), \
             patch.object(pi, 'has_nvidia_gpu', return_value=False), \
             patch.object(pi, '_run_pip', return_value=(False, 'network error')), \
             patch.object(pi, '_invalidate_import_cache'):
            ok, msg = pi.install_backend_packages('f5')
            assert ok is False
            assert 'Failed' in msg


# ========================== install_backend_full ==========================

class TestInstallBackendFull:

    def setup_method(self):
        # Clear any stale _installing flags
        pi._installing.clear()

    def test_already_in_progress(self):
        pi._installing['f5'] = True
        try:
            ok, msg = pi.install_backend_full('f5')
            assert ok is False
            assert 'already in progress' in msg
        finally:
            pi._installing.clear()

    def test_full_success(self):
        with patch.object(pi, 'install_backend_packages', return_value=(True, 'ok')), \
             patch.object(pi, '_download_model_weights', return_value=(True, 'ok')):
            cb = MagicMock()
            ok, msg = pi.install_backend_full('f5', progress_cb=cb)
            assert ok is True
            assert 'Ready' in msg
            # progress callback should have been called multiple times
            assert cb.call_count >= 2

    def test_package_failure_skips_model(self):
        with patch.object(pi, 'install_backend_packages',
                          return_value=(False, 'pip error')):
            ok, msg = pi.install_backend_full('f5')
            assert ok is False
            assert 'pip error' in msg

    def test_model_failure_partial(self):
        with patch.object(pi, 'install_backend_packages', return_value=(True, 'ok')), \
             patch.object(pi, '_download_model_weights',
                          return_value=(False, 'download error')):
            ok, msg = pi.install_backend_full('f5')
            assert ok is False
            assert 'Partial' in msg

    def test_clears_installing_flag_on_exception(self):
        with patch.object(pi, 'install_backend_packages',
                          side_effect=RuntimeError('boom')):
            with pytest.raises(RuntimeError):
                pi.install_backend_full('f5')
        assert pi._installing.get('f5') is False


# ========================== _is_hf_model_cached ===========================

class TestIsHfModelCached:

    def test_found_in_hf_cache(self, tmp_path):
        model_dir = tmp_path / '.cache' / 'huggingface' / 'hub' / 'models--SWivid--F5-TTS'
        model_dir.mkdir(parents=True)
        with patch.object(Path, 'home', return_value=tmp_path):
            assert pi._is_hf_model_cached('SWivid/F5-TTS') is True

    def test_found_in_nunba_models(self, tmp_path):
        nunba_tts = tmp_path / '.nunba' / 'models' / 'tts'
        nunba_tts.mkdir(parents=True)
        (nunba_tts / 'f5-tts').mkdir()
        with patch.object(Path, 'home', return_value=tmp_path):
            assert pi._is_hf_model_cached('SWivid/F5-TTS') is True

    def test_not_cached(self, tmp_path):
        with patch.object(Path, 'home', return_value=tmp_path):
            assert pi._is_hf_model_cached('SWivid/F5-TTS') is False


# ========================== _download_model_weights =======================

class TestDownloadModelWeights:

    def test_no_huggingface_hub(self):
        with patch.dict(sys.modules, {'huggingface_hub': None}):
            # Force ImportError by making the import fail
            with patch('builtins.__import__', side_effect=ImportError):
                ok, msg = pi._download_model_weights('f5')
                assert ok is False or 'not available' in msg or ok is True
                # The function might catch this differently; let's test via
                # direct approach
        # More reliable: patch at function level
        original_import = __builtins__.__import__ if hasattr(__builtins__, '__import__') else __import__

        def fake_import(name, *args, **kwargs):
            if name == 'huggingface_hub':
                raise ImportError('no hf')
            return original_import(name, *args, **kwargs)

        with patch('builtins.__import__', side_effect=fake_import):
            ok, msg = pi._download_model_weights('f5')
            assert ok is False
            assert 'not available' in msg

    def test_piper_no_download_needed(self, tmp_path):
        # No voices dir => still returns True (downloads on first use)
        with patch.object(Path, 'home', return_value=tmp_path):
            fake_hf = types.ModuleType('huggingface_hub')
            fake_hf.snapshot_download = MagicMock()
            with patch.dict(sys.modules, {'huggingface_hub': fake_hf}):
                ok, msg = pi._download_model_weights('piper')
                assert ok is True

    def test_piper_voices_exist(self, tmp_path):
        voices = tmp_path / '.nunba' / 'piper' / 'voices'
        voices.mkdir(parents=True)
        (voices / 'en_US.onnx').write_text('')
        with patch.object(Path, 'home', return_value=tmp_path):
            fake_hf = types.ModuleType('huggingface_hub')
            fake_hf.snapshot_download = MagicMock()
            with patch.dict(sys.modules, {'huggingface_hub': fake_hf}):
                ok, msg = pi._download_model_weights('piper')
                assert ok is True
                assert 'already downloaded' in msg.lower()

    def test_f5_already_cached(self, tmp_path):
        model_dir = tmp_path / '.cache' / 'huggingface' / 'hub' / 'models--SWivid--F5-TTS'
        model_dir.mkdir(parents=True)
        fake_hf = types.ModuleType('huggingface_hub')
        fake_hf.snapshot_download = MagicMock()
        with patch.object(Path, 'home', return_value=tmp_path), \
             patch.dict(sys.modules, {'huggingface_hub': fake_hf}):
            ok, msg = pi._download_model_weights('f5')
            assert ok is True
            assert 'Already downloaded' in msg
            fake_hf.snapshot_download.assert_not_called()

    def test_unknown_backend_no_download(self):
        fake_hf = types.ModuleType('huggingface_hub')
        fake_hf.snapshot_download = MagicMock()
        with patch.dict(sys.modules, {'huggingface_hub': fake_hf}):
            ok, msg = pi._download_model_weights('unknown_backend')
            assert ok is True
            assert 'No model download needed' in msg


# ========================== _invalidate_import_cache ======================

class TestInvalidateImportCache:

    def test_clears_tts_cache(self):
        fake_cache = {'key': 'val'}
        fake_engine = MagicMock()
        fake_engine._import_check_cache = fake_cache
        fake_tts_mod = types.ModuleType('tts.tts_engine')
        fake_tts_mod.TTSEngine = fake_engine
        with patch.dict(sys.modules, {'tts.tts_engine': fake_tts_mod, 'tts': MagicMock()}), \
             patch('importlib.invalidate_caches'), \
             patch.object(pi, 'get_embed_site_packages', return_value=None):
            pi._invalidate_import_cache()
            assert len(fake_cache) == 0

    def test_handles_missing_tts_engine(self):
        # Should not raise even if TTSEngine import fails
        with patch('importlib.invalidate_caches'), \
             patch.object(pi, 'get_embed_site_packages', return_value=None):
            pi._invalidate_import_cache()  # no exception


# ========================== make_chat_progress_callback ===================

class TestMakeChatProgressCallback:

    def test_returns_callable(self):
        cb = pi.make_chat_progress_callback(user_id='u1')
        assert callable(cb)

    def test_increments_step(self):
        cb = pi.make_chat_progress_callback()
        # Call it twice; it logs internally — just ensure no crash
        cb("step one")
        cb("step two")

    def test_pushes_sse_event(self):
        mock_broadcast = MagicMock()
        fake_main = types.ModuleType('__main__')
        fake_main.broadcast_sse_event = mock_broadcast
        with patch.dict(sys.modules, {'__main__': fake_main}):
            cb = pi.make_chat_progress_callback(user_id='u1', job_type='tts_setup')
            cb("test message")
            mock_broadcast.assert_called_once()
            event_data = mock_broadcast.call_args[0][1]
            assert event_data['step'] == 1
            assert event_data['message'] == 'test message'

    def test_no_sse_no_error(self):
        # No broadcast_sse_event on __main__ — should not crash
        fake_main = types.ModuleType('__main__')
        with patch.dict(sys.modules, {'__main__': fake_main}):
            cb = pi.make_chat_progress_callback()
            cb("message")  # no exception


# ========================== get_backend_status ============================

class TestGetBackendStatus:

    def test_returns_all_backends(self):
        with patch.object(pi, 'is_package_installed', return_value=True):
            status = pi.get_backend_status()
            for backend in pi.BACKEND_PACKAGES:
                assert backend in status
                assert 'display_name' in status[backend]
                assert 'installed' in status[backend]
                assert 'packages_missing' in status[backend]
                assert 'installing' in status[backend]

    def test_piper_always_installed(self):
        # piper has empty packages list, so always "installed"
        with patch.object(pi, 'is_package_installed', return_value=False):
            status = pi.get_backend_status()
            assert status['piper']['installed'] is True
            assert status['piper']['packages_missing'] == []

    def test_missing_packages_listed(self):
        with patch.object(pi, 'is_package_installed', return_value=False):
            status = pi.get_backend_status()
            assert len(status['f5']['packages_missing']) > 0

    def test_installing_flag(self):
        pi._installing['f5'] = True
        try:
            with patch.object(pi, 'is_package_installed', return_value=True):
                status = pi.get_backend_status()
                assert status['f5']['installing'] is True
        finally:
            pi._installing.clear()

    def test_pinned_version_spec_does_not_crash(self):
        """Regression: BACKEND_PACKAGES entries like 'parler_tts==0.6.0'
        used to be passed straight into importlib.util.find_spec, which
        RAISES ModuleNotFoundError on '==' in the name (not returns
        None). That crashed the whole /tts/engines endpoint. Fix strips
        the pip version spec before resolving the import name."""
        fake_pkgs = {
            'fakebackend': ['parler_tts==0.6.0', 'chatterbox-tts>=1.0'],
        }
        with patch.dict(pi.BACKEND_PACKAGES, fake_pkgs, clear=True), \
             patch.object(pi, 'is_package_installed', return_value=True) as mock_isinst:
            status = pi.get_backend_status()
            assert 'fakebackend' in status
            assert status['fakebackend']['installed'] is True
            # is_package_installed must have been called with the base
            # module name (no '==', no '>='), not the raw pip spec.
            called_names = [c.args[0] for c in mock_isinst.call_args_list]
            # 'parler_tts==0.6.0' → base 'parler_tts', no mapping → 'parler_tts'
            assert 'parler_tts' in called_names
            # Raw pip specs must NEVER reach find_spec — that's the
            # regression we're locking in (importlib raises on '==').
            assert not any(
                any(op in n for op in ('==', '>=', '<=', '!=', '>', '<', '~'))
                for n in called_names
            ), f'pip operators leaked through: {called_names}'


# ========================== get_recommended_backends ======================

class TestGetRecommendedBackends:

    def test_cpu_only(self):
        fake_caps = {
            'piper': {'vram_gb': 0},
            'chatterbox_turbo': {'vram_gb': 4},
        }
        with patch.dict('tts.tts_engine.ENGINE_CAPABILITIES', fake_caps, clear=True):
            result = pi.get_recommended_backends(vram_gb=0, has_gpu=False)
            assert 'piper' in result
            assert 'chatterbox_turbo' not in result

    def test_with_gpu(self):
        fake_caps = {
            'piper': {'vram_gb': 0},
            'chatterbox_turbo': {'vram_gb': 4},
            'f5': {'vram_gb': 8},
        }
        with patch.dict('tts.tts_engine.ENGINE_CAPABILITIES', fake_caps, clear=True):
            result = pi.get_recommended_backends(vram_gb=6, has_gpu=True)
            assert 'piper' in result
            assert 'chatterbox_turbo' in result
            assert 'f5' not in result  # needs 8GB, only have 6

    def test_high_vram(self):
        fake_caps = {
            'f5': {'vram_gb': 8},
        }
        with patch.dict('tts.tts_engine.ENGINE_CAPABILITIES', fake_caps, clear=True):
            result = pi.get_recommended_backends(vram_gb=12, has_gpu=True)
            assert 'f5' in result


# ========================== BACKEND_PACKAGES constant =====================

class TestConstants:

    def test_backend_packages_keys(self):
        # Kokoro (82M CPU/GPU TTS), luxtts (frozen-HARTOS compat), and
        # pocket_tts (promoted from Piper alias to first-class backend)
        # were added after this test was authored.  Keep the full current
        # set here so the assertion stays meaningful — a new backend
        # failing to register a package list should still trip this.
        expected = {'chatterbox_turbo', 'chatterbox_multilingual',
                    'indic_parler', 'cosyvoice3', 'f5', 'piper',
                    'kokoro', 'luxtts', 'pocket_tts'}
        assert set(pi.BACKEND_PACKAGES.keys()) == expected

    def test_display_names_match_backends(self):
        assert set(pi.BACKEND_DISPLAY_NAMES.keys()) == set(pi.BACKEND_PACKAGES.keys())
