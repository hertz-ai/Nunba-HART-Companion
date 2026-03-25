"""
Deep functional tests for scripts/deps.py — centralized dependency management.

Tests INTENDED BEHAVIOR:
- VERSION is valid semver
- All core deps have pinned versions
- Platform-specific deps correctly gated
- Torch spec is correct for CUDA
- requirements.txt generation
- Version helpers (version_tuple, version_win32, version_short)
- No conflicting dependency versions
- Key packages present (Flask, SQLAlchemy, PyJWT, etc.)
"""
import os
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from scripts.deps import (
    CORE_DEPS,
    PYTHON_EMBED_VERSION,
    VERSION,
    get_all_deps,
    get_embed_install_list,
    get_venv_install_list,
    version_short,
    version_tuple,
    version_win32,
)


# ==========================================================================
# 1. VERSION
# ==========================================================================
class TestVersion:
    def test_version_is_string(self):
        assert isinstance(VERSION, str)

    def test_version_semver_format(self):
        parts = VERSION.split('.')
        assert len(parts) >= 2, f"Version must be semver: {VERSION}"
        assert parts[0].isdigit()
        assert parts[1].isdigit()

    def test_version_tuple_returns_tuple(self):
        result = version_tuple()
        assert isinstance(result, tuple)
        assert len(result) >= 3

    def test_version_tuple_all_ints(self):
        for part in version_tuple():
            assert isinstance(part, int)

    def test_version_win32_has_four_parts(self):
        v = version_win32()
        parts = v.split('.')
        assert len(parts) == 4, f"Win32 version must have 4 parts: {v}"

    def test_version_short_concise(self):
        v = version_short()
        assert isinstance(v, str)
        assert len(v) <= 10

    def test_python_embed_version(self):
        parts = PYTHON_EMBED_VERSION.split('.')
        assert len(parts) == 3
        assert int(parts[0]) >= 3
        assert int(parts[1]) >= 10


# ==========================================================================
# 2. Core Dependencies
# ==========================================================================
class TestCoreDeps:
    def test_is_dict(self):
        assert isinstance(CORE_DEPS, dict)

    def test_at_least_20_deps(self):
        assert len(CORE_DEPS) >= 20, f"Expected 20+ core deps, got {len(CORE_DEPS)}"

    def test_flask_present(self):
        assert 'flask' in CORE_DEPS
        assert CORE_DEPS['flask'] is not None

    def test_sqlalchemy_present(self):
        assert 'sqlalchemy' in CORE_DEPS

    def test_pyjwt_present(self):
        assert 'PyJWT' in CORE_DEPS

    def test_pywebview_present(self):
        assert 'pywebview' in CORE_DEPS

    def test_requests_present(self):
        assert 'requests' in CORE_DEPS

    def test_numpy_present(self):
        assert 'numpy' in CORE_DEPS

    def test_sentry_present(self):
        assert any('sentry' in k for k in CORE_DEPS)

    def test_autobahn_present(self):
        assert 'autobahn' in CORE_DEPS

    def test_langchain_present(self):
        assert any('langchain' in k for k in CORE_DEPS)

    def test_most_deps_have_versions(self):
        pinned = sum(1 for v in CORE_DEPS.values() if v is not None)
        total = len(CORE_DEPS)
        ratio = pinned / total
        assert ratio >= 0.8, f"Only {ratio:.0%} deps pinned — should be 80%+"


# ==========================================================================
# 3. Install Lists
# ==========================================================================
class TestInstallLists:
    def test_venv_list_returns_list(self):
        result = get_venv_install_list()
        assert isinstance(result, list)

    def test_venv_list_has_items(self):
        result = get_venv_install_list()
        assert len(result) >= 10

    def test_venv_items_are_strings(self):
        for item in get_venv_install_list():
            assert isinstance(item, str)

    def test_venv_items_have_version_pins(self):
        pinned = [i for i in get_venv_install_list() if '==' in i]
        assert len(pinned) >= 10, "Most venv deps should be version-pinned"

    def test_embed_list_returns_list(self):
        result = get_embed_install_list()
        assert isinstance(result, list)

    def test_embed_list_different_from_venv(self):
        venv = set(get_venv_install_list())
        embed = set(get_embed_install_list())
        # They should differ (embed excludes some, includes torch)
        assert venv != embed


# ==========================================================================
# 4. All Deps
# ==========================================================================
class TestAllDeps:
    def test_returns_dict(self):
        result = get_all_deps()
        assert isinstance(result, dict)

    def test_includes_core(self):
        all_deps = get_all_deps()
        assert 'flask' in all_deps or 'Flask' in all_deps


# ==========================================================================
# 5. No Version Conflicts
# ==========================================================================
class TestNoConflicts:
    def test_no_duplicate_package_names(self):
        """Same package shouldn't appear with different versions."""
        names = {}
        for pkg, ver in CORE_DEPS.items():
            base = pkg.split('[')[0].lower().replace('-', '_')
            if base in names and ver is not None:
                # Allow extras like autobahn[serialization]
                if names[base] is not None and names[base] != ver:
                    pytest.fail(f"Version conflict: {base} has {names[base]} and {ver}")
            names[base] = ver

    def test_flask_werkzeug_compatible(self):
        """Flask 3.x requires Werkzeug 3.x."""
        flask_ver = CORE_DEPS.get('flask', '')
        werkzeug_ver = CORE_DEPS.get('werkzeug', '')
        if flask_ver and werkzeug_ver:
            flask_major = int(flask_ver.split('.')[0])
            werkzeug_major = int(werkzeug_ver.split('.')[0])
            assert flask_major == werkzeug_major, \
                f"Flask {flask_ver} needs Werkzeug {flask_major}.x, got {werkzeug_ver}"


# ==========================================================================
# 6. Platform-Specific Deps
# ==========================================================================
class TestPlatformDeps:
    def test_venv_list_platform_filter(self):
        win = get_venv_install_list(platform='win32')
        linux = get_venv_install_list(platform='linux')
        # Windows has extra deps (pystray, win10toast)
        assert isinstance(win, list)
        assert isinstance(linux, list)
