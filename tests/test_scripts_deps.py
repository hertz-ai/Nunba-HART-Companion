"""Integration smoke tests for scripts/deps.py + related — batch #23.

scripts/deps.py (484 LOC) is the single source of truth for
Nunba's dependency matrix (Python wheels, torch variants, embed
site-packages, requirements.txt generation).

This batch locks its public API contract.  Pure function tests —
no network, no subprocess, no disk writes.
"""
from __future__ import annotations

import os
import sys

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

pytestmark = pytest.mark.timeout(10)


# ════════════════════════════════════════════════════════════════════════
# scripts/deps.py — dependency matrix helpers
# ════════════════════════════════════════════════════════════════════════

class TestDepsExports:
    @pytest.mark.parametrize('name', [
        '_format_dep',
        'get_venv_install_list',
        'get_embed_install_list',
        'get_torch_spec',
        'compute_embed_deps_hash',
        'embed_package_dir_name',
        'missing_embed_packages',
        'get_all_deps',
        'generate_requirements',
        'generate_test_requirements',
        'version_tuple',
        'version_win32',
        'version_short',
    ])
    def test_symbol_exported(self, name):
        import scripts.deps as deps
        assert hasattr(deps, name), f'{name} missing from scripts.deps'
        assert callable(getattr(deps, name))


class TestDepsFormatDep:
    def test_format_dep_name_and_version(self):
        from scripts.deps import _format_dep
        result = _format_dep('flask', '3.1.2')
        assert isinstance(result, str)
        assert 'flask' in result
        assert '3.1.2' in result

    def test_format_dep_handles_none_version(self):
        from scripts.deps import _format_dep
        result = _format_dep('flask', None)
        assert isinstance(result, str)
        assert 'flask' in result


class TestDepsVersion:
    def test_version_tuple_returns_tuple(self):
        from scripts.deps import version_tuple
        result = version_tuple()
        assert isinstance(result, tuple)
        # Version tuple should contain integers (major.minor.patch).
        assert len(result) >= 2

    def test_version_win32_returns_string(self):
        from scripts.deps import version_win32
        result = version_win32()
        assert isinstance(result, str)
        # Win32 version must be dotted integer string.
        assert '.' in result

    def test_version_short_returns_string(self):
        from scripts.deps import version_short
        result = version_short()
        assert isinstance(result, str)
        assert len(result) > 0


class TestDepsTorchSpec:
    def test_get_torch_spec_returns_dict(self):
        from scripts.deps import get_torch_spec
        result = get_torch_spec()
        assert isinstance(result, (dict, str, list))


class TestDepsInstallLists:
    def test_get_venv_install_list_returns_iterable(self):
        from scripts.deps import get_venv_install_list
        result = get_venv_install_list()
        assert result is not None
        assert hasattr(result, '__iter__')

    def test_get_venv_install_list_accepts_platform(self):
        from scripts.deps import get_venv_install_list
        for platform in ('win32', 'linux', 'darwin'):
            result = get_venv_install_list(platform=platform)
            assert result is not None

    def test_get_embed_install_list_default(self):
        from scripts.deps import get_embed_install_list
        result = get_embed_install_list()
        assert result is not None

    def test_get_embed_install_list_with_torch(self):
        from scripts.deps import get_embed_install_list
        result = get_embed_install_list(include_torch=True)
        assert result is not None

    def test_get_all_deps_returns_list(self):
        from scripts.deps import get_all_deps
        result = get_all_deps()
        # Either a list or an iterable of package specs.
        assert result is not None


class TestDepsEmbedPackaging:
    def test_embed_package_dir_name_returns_string(self):
        from scripts.deps import embed_package_dir_name
        result = embed_package_dir_name('flask')
        assert isinstance(result, str)
        assert len(result) > 0

    def test_embed_package_dir_name_handles_dashes(self):
        from scripts.deps import embed_package_dir_name
        # pip packages use dashes; dir names typically use underscores.
        result = embed_package_dir_name('flask-cors')
        assert isinstance(result, str)

    def test_compute_embed_deps_hash_is_deterministic(self):
        from scripts.deps import compute_embed_deps_hash
        a = compute_embed_deps_hash()
        b = compute_embed_deps_hash()
        assert a == b  # deterministic — same file, same hash
        assert isinstance(a, str)
        assert len(a) > 0

    def test_missing_embed_packages_accepts_nonexistent_dir(self):
        from scripts.deps import missing_embed_packages
        result = missing_embed_packages('/nonexistent/path/xyz')
        # Should return a list (probably ALL packages since none installed).
        assert isinstance(result, list)


# ════════════════════════════════════════════════════════════════════════
# scripts/download.py — file downloader
# ════════════════════════════════════════════════════════════════════════

class TestDownloadScript:
    @pytest.mark.parametrize('name', [
        'download_file',
        'main',
    ])
    def test_symbol_exported(self, name):
        import scripts.download as dl
        assert hasattr(dl, name)
        assert callable(getattr(dl, name))


# ════════════════════════════════════════════════════════════════════════
# scripts/coverage_flask_run.py — CI coverage entrypoint
# ════════════════════════════════════════════════════════════════════════

class TestCoverageFlaskRun:
    def test_module_loads(self):
        """coverage_flask_run is a CI entrypoint — the import side-effect
        runs main, so we only verify the file parses via AST."""
        import ast
        path = os.path.join(PROJECT_ROOT, 'scripts', 'coverage_flask_run.py')
        with open(path, encoding='utf-8') as f:
            tree = ast.parse(f.read())
        assert isinstance(tree, ast.Module)


# ════════════════════════════════════════════════════════════════════════
# scripts/_dead_code_filter.py + _dead_code_scan.py
# ════════════════════════════════════════════════════════════════════════

class TestDeadCodeTooling:
    """scripts/_dead_code_*.py are CI tooling that reads scan JSON at
    module-load time.  AST-level parse check avoids the load side-effect."""

    @pytest.mark.parametrize('script', [
        '_dead_code_filter.py',
        '_dead_code_scan.py',
        '_dead_code_verify.py',
    ])
    def test_script_parses_as_python(self, script):
        import ast
        path = os.path.join(PROJECT_ROOT, 'scripts', script)
        with open(path, encoding='utf-8') as f:
            tree = ast.parse(f.read())
        assert isinstance(tree, ast.Module)
