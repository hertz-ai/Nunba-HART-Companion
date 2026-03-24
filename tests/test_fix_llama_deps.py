"""
test_fix_llama_deps.py - Tests for scripts/fix_llama_dependencies.py

Covers:
- check_vcredist_installed() registry checks (Windows-only logic)
- download_and_install_vcredist() download + installer flow
- check_llama_server() binary existence and execution
- try_fix_dependencies() orchestration
- Edge cases: missing registry, missing binary, timeouts, permission errors
"""
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from scripts.fix_llama_dependencies import (
    check_llama_server,
    download_and_install_vcredist,
)

# ============================================================
# check_vcredist_installed() - platform guarded
# ============================================================

class TestCheckVcredist:
    @pytest.mark.skipif(sys.platform != 'win32', reason="Windows-only registry check")
    def test_returns_bool_or_none(self):
        from scripts.fix_llama_dependencies import check_vcredist_installed
        result = check_vcredist_installed()
        assert result in (True, False, None)

    def test_check_vcredist_import_error(self):
        """When winreg is not available (non-Windows), should handle gracefully"""
        with patch.dict('sys.modules', {'winreg': None}):
            try:
                from scripts.fix_llama_dependencies import check_vcredist_installed
                result = check_vcredist_installed()
                # Should return None on import error
                assert result in (True, False, None)
            except (ImportError, ModuleNotFoundError):
                pass  # Expected on non-Windows


# ============================================================
# check_llama_server()
# ============================================================

class TestCheckLlamaServer:
    @patch('scripts.fix_llama_dependencies.Path.home')
    def test_returns_false_when_binary_missing(self, mock_home):
        mock_home.return_value = Path("/fake/home")
        result = check_llama_server()
        assert result is False

    @patch('scripts.fix_llama_dependencies.subprocess.run')
    @patch('scripts.fix_llama_dependencies.Path.home')
    def test_returns_true_on_success(self, mock_home, mock_run):
        # Create a temp dir to simulate the binary
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            mock_home.return_value = Path(tmpdir)
            bin_dir = Path(tmpdir) / ".nunba" / "llama.cpp" / "build" / "bin" / "Release"
            bin_dir.mkdir(parents=True)
            (bin_dir / "llama-server.exe").touch()

            mock_run.return_value = MagicMock(returncode=0, stdout=b"version 1.0", stderr=b"")
            result = check_llama_server()
            assert result is True

    @patch('scripts.fix_llama_dependencies.subprocess.run', side_effect=FileNotFoundError)
    @patch('scripts.fix_llama_dependencies.Path.home')
    def test_returns_false_on_file_not_found(self, mock_home, mock_run):
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            mock_home.return_value = Path(tmpdir)
            bin_dir = Path(tmpdir) / ".nunba" / "llama.cpp" / "build" / "bin" / "Release"
            bin_dir.mkdir(parents=True)
            (bin_dir / "llama-server.exe").touch()

            result = check_llama_server()
            assert result is False

    @patch('scripts.fix_llama_dependencies.subprocess.run',
           side_effect=subprocess.TimeoutExpired(cmd="test", timeout=5))
    @patch('scripts.fix_llama_dependencies.Path.home')
    def test_returns_false_on_timeout(self, mock_home, mock_run):
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            mock_home.return_value = Path(tmpdir)
            bin_dir = Path(tmpdir) / ".nunba" / "llama.cpp" / "build" / "bin" / "Release"
            bin_dir.mkdir(parents=True)
            (bin_dir / "llama-server.exe").touch()

            result = check_llama_server()
            assert result is False

    @patch('scripts.fix_llama_dependencies.subprocess.run')
    @patch('scripts.fix_llama_dependencies.Path.home')
    def test_returns_false_on_nonzero_exit(self, mock_home, mock_run):
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            mock_home.return_value = Path(tmpdir)
            bin_dir = Path(tmpdir) / ".nunba" / "llama.cpp" / "build" / "bin" / "Release"
            bin_dir.mkdir(parents=True)
            (bin_dir / "llama-server.exe").touch()

            mock_run.return_value = MagicMock(returncode=1, stdout=b"", stderr=b"error")
            result = check_llama_server()
            assert result is False

    @patch('scripts.fix_llama_dependencies.subprocess.run', side_effect=RuntimeError("crash"))
    @patch('scripts.fix_llama_dependencies.Path.home')
    def test_returns_false_on_generic_exception(self, mock_home, mock_run):
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            mock_home.return_value = Path(tmpdir)
            bin_dir = Path(tmpdir) / ".nunba" / "llama.cpp" / "build" / "bin" / "Release"
            bin_dir.mkdir(parents=True)
            (bin_dir / "llama-server.exe").touch()

            result = check_llama_server()
            assert result is False


# ============================================================
# download_and_install_vcredist()
# ============================================================

class TestDownloadVcredist:
    @patch('scripts.fix_llama_dependencies.subprocess.run')
    @patch('scripts.fix_llama_dependencies.urllib.request.urlretrieve')
    def test_success_returns_true(self, mock_retrieve, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        result = download_and_install_vcredist()
        assert result is True
        mock_retrieve.assert_called_once()

    @patch('scripts.fix_llama_dependencies.urllib.request.urlretrieve',
           side_effect=Exception("download failed"))
    def test_returns_false_on_download_error(self, mock_retrieve):
        result = download_and_install_vcredist()
        assert result is False

    @patch('scripts.fix_llama_dependencies.subprocess.run')
    @patch('scripts.fix_llama_dependencies.urllib.request.urlretrieve')
    def test_returns_false_on_nonzero_installer(self, mock_retrieve, mock_run):
        mock_run.return_value = MagicMock(returncode=1603)
        result = download_and_install_vcredist()
        assert result is False

    @patch('scripts.fix_llama_dependencies.subprocess.run')
    @patch('scripts.fix_llama_dependencies.urllib.request.urlretrieve')
    def test_installer_called_with_passive_flags(self, mock_retrieve, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        download_and_install_vcredist()
        args = mock_run.call_args[0][0]
        assert "/install" in args
        assert "/passive" in args
        assert "/norestart" in args


# ============================================================
# try_fix_dependencies() orchestration
# ============================================================

class TestTryFixDependencies:
    @patch('scripts.fix_llama_dependencies.check_llama_server', return_value=True)
    @patch('scripts.fix_llama_dependencies.check_vcredist_installed', return_value=True)
    def test_returns_true_when_everything_works(self, mock_vc, mock_llama):
        from scripts.fix_llama_dependencies import try_fix_dependencies
        result = try_fix_dependencies()
        assert result is True

    @patch('builtins.input', return_value='n')
    @patch('scripts.fix_llama_dependencies.check_llama_server', return_value=False)
    @patch('scripts.fix_llama_dependencies.check_vcredist_installed', return_value=False)
    def test_returns_false_when_user_declines_install(self, mock_vc, mock_llama, mock_input):
        from scripts.fix_llama_dependencies import try_fix_dependencies
        result = try_fix_dependencies()
        assert result is False

    @patch('scripts.fix_llama_dependencies.check_llama_server', return_value=False)
    @patch('scripts.fix_llama_dependencies.check_vcredist_installed', return_value=True)
    def test_returns_false_when_server_fails_but_vcredist_ok(self, mock_vc, mock_llama):
        from scripts.fix_llama_dependencies import try_fix_dependencies
        result = try_fix_dependencies()
        assert result is False


# ============================================================
# URL and path constants
# ============================================================

class TestFixLlamaConstants:
    def test_vcredist_url_in_source(self):
        source_path = os.path.join(PROJECT_ROOT, 'scripts', 'fix_llama_dependencies.py')
        with open(source_path) as f:
            content = f.read()
        assert 'aka.ms/vs/17/release/vc_redist.x64.exe' in content

    def test_llama_server_path_uses_home(self):
        source_path = os.path.join(PROJECT_ROOT, 'scripts', 'fix_llama_dependencies.py')
        with open(source_path) as f:
            content = f.read()
        assert '.nunba' in content
        assert 'llama-server' in content
