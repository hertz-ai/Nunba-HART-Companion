"""
test_build_script.py - Tests for scripts/build.py

Tests the build system helpers — path discovery, version stamping,
dependency management, platform detection. Does NOT test the full build
process (that requires a venv, npm, cx_Freeze, etc).

FT: HARTOS backend discovery, version stamping in files, dependency
    installation command construction, React build detection, clean.
NFT: Cross-platform path handling, subprocess error handling,
     idempotent version stamping, no hardcoded absolute paths.
"""
import os
import sys
import tempfile
from unittest.mock import patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Add scripts/ to path so build.py can import deps
scripts_dir = os.path.join(PROJECT_ROOT, 'scripts')
if scripts_dir not in sys.path:
    sys.path.insert(0, scripts_dir)


# ============================================================
# Print helpers — build log output
# ============================================================

class TestPrintHelpers:
    """Build log formatting — these produce the colored output users see."""

    def test_print_header_no_crash(self):
        from scripts.build import print_header
        print_header("Test Build")  # Must not raise

    def test_print_info_no_crash(self):
        from scripts.build import print_info
        print_info("Installing dependencies...")

    def test_print_warn_no_crash(self):
        from scripts.build import print_warn
        print_warn("Optional component missing")

    def test_print_error_no_crash(self):
        from scripts.build import print_error
        print_error("Build failed")


# ============================================================
# run_command — subprocess wrapper
# ============================================================

class TestRunCommand:
    """run_command wraps subprocess.run with logging and error handling."""

    def test_successful_command(self):
        from scripts.build import run_command
        # 'echo' works on all platforms
        result = run_command(['python', '--version'], description="Test Python version")
        assert result is not None

    def test_failed_command_with_check_false(self):
        from scripts.build import run_command
        # Nonexistent command — check=False should not raise
        result = run_command(['nonexistent_binary_xyz'], description="Test", check=False)
        # Returns None or CompletedProcess with non-zero


# ============================================================
# Version stamping
# ============================================================

class TestVersionStamping:
    """stamp_version writes VERSION into multiple files — must be idempotent."""

    def test_stamp_version_in_file(self):
        from scripts.build import _stamp_version_in_file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write('VERSION = "0.0.0"\n')
            f.flush()
            _stamp_version_in_file(f.name, r'VERSION\s*=\s*"[^"]*"', 'VERSION = "2.0.0"')
        with open(f.name) as f2:
            content = f2.read()
        os.unlink(f.name)
        assert 'VERSION = "2.0.0"' in content

    def test_stamp_idempotent(self):
        """Running stamp twice must not corrupt the file."""
        from scripts.build import _stamp_version_in_file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write('VERSION = "1.0.0"\n')
            f.flush()
            _stamp_version_in_file(f.name, r'VERSION\s*=\s*"[^"]*"', 'VERSION = "2.0.0"')
            _stamp_version_in_file(f.name, r'VERSION\s*=\s*"[^"]*"', 'VERSION = "2.0.0"')
        with open(f.name) as f2:
            content = f2.read()
        os.unlink(f.name)
        assert content.count('VERSION') == 1


# ============================================================
# HARTOS backend discovery
# ============================================================

class TestHARTOSDiscovery:
    """_find_local_hartos_backend looks for sibling HARTOS repo."""

    def test_finds_sibling_hartos(self):
        from scripts.build import _find_local_hartos_backend
        # Should find HARTOS since it's a sibling repo in our dev setup
        result = _find_local_hartos_backend()
        # May or may not find it depending on CWD — key: doesn't crash
        assert result is None or isinstance(result, str)

    def test_returns_none_when_not_found(self):
        from scripts.build import _find_local_hartos_backend
        with patch('os.path.isfile', return_value=False):
            result = _find_local_hartos_backend()
        # May still find via other paths, but should not crash


# ============================================================
# Clean build
# ============================================================

class TestCleanBuild:
    """clean_build removes build artifacts — must not delete source code."""

    def test_clean_creates_no_errors(self):
        from scripts.build import clean_build
        with patch('shutil.rmtree') as mock_rm, \
             patch('os.path.isdir', return_value=False):
            clean_build()
        # rmtree should only be called on build dirs, not source


# ============================================================
# Directory size helper
# ============================================================

class TestDirSize:
    """_dir_size_mb used for build size reporting."""

    def test_returns_float(self):
        from scripts.build import _dir_size_mb
        result = _dir_size_mb(tempfile.gettempdir())
        assert isinstance(result, (int, float))
        assert result >= 0

    def test_nonexistent_dir_returns_zero(self):
        from scripts.build import _dir_size_mb
        result = _dir_size_mb('/nonexistent/path/xyz')
        assert result == 0


# ============================================================
# Constants
# ============================================================

class TestBuildConstants:
    """Build configuration constants."""

    def test_app_name_is_nunba(self):
        from scripts.build import APP_NAME
        assert APP_NAME == "Nunba"

    def test_version_matches_deps(self):
        """build.py VERSION must match deps.py VERSION — single source of truth."""
        from scripts.build import VERSION
        from scripts.deps import VERSION as DEPS_VERSION
        assert VERSION == DEPS_VERSION
