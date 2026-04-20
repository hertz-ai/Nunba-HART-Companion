"""
test_deps.py - Tests for scripts/deps.py

Tests the centralized dependency management — single source of truth for
all package versions across build scripts. Each test verifies a specific
build/deploy guarantee:

FT: Version format, dependency list generation, platform filtering,
    torch exclusion from embed list, helper formatting.
NFT: No duplicate packages, no conflicting versions, HTTPS for torch URL,
     version strings are valid semver-ish.
"""
import os
import re
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# Version constants — displayed in UI, used by installer
# ============================================================

class TestVersionConstants:
    """VERSION and PYTHON_EMBED_VERSION are displayed to users and used by the build."""

    def test_version_is_semver_format(self):
        """Build scripts parse VERSION — must be X.Y.Z format."""
        from scripts.deps import VERSION
        assert re.match(r'^\d+\.\d+\.\d+', VERSION), f"VERSION '{VERSION}' not semver"

    def test_python_embed_version_is_valid(self):
        from scripts.deps import PYTHON_EMBED_VERSION
        assert re.match(r'^\d+\.\d+\.\d+', PYTHON_EMBED_VERSION)


# ============================================================
# Core dependencies — what cx_Freeze bundles
# ============================================================

class TestCoreDeps:
    """CORE_DEPS must be complete — missing dep = runtime ImportError in the frozen exe."""

    def test_flask_is_pinned(self):
        """Flask is the web server — must be pinned to avoid breaking changes."""
        from scripts.deps import CORE_DEPS
        assert 'flask' in CORE_DEPS
        assert CORE_DEPS['flask'] is not None

    def test_pywebview_is_pinned(self):
        """pywebview is the desktop GUI — version changes break WebView2 integration."""
        from scripts.deps import CORE_DEPS
        assert 'pywebview' in CORE_DEPS

    def test_langchain_classic_is_pinned(self):
        """LangChain versions must be pinned — unpinned causes pip backtracking for hours."""
        from scripts.deps import CORE_DEPS
        assert 'langchain-classic' in CORE_DEPS
        assert CORE_DEPS['langchain-classic'] is not None

    def test_no_duplicate_packages(self):
        """Dict keys are unique by definition, but extras variants must not conflict."""
        from scripts.deps import CORE_DEPS
        base_names = [k.split('[')[0] for k in CORE_DEPS.keys()]
        # Extras like 'autobahn[serialization]' share base with 'autobahn'
        # That's OK, but two different base names must not pin different versions
        seen = {}
        for k, v in CORE_DEPS.items():
            base = k.split('[')[0]
            if base in seen and v is not None and seen[base] is not None:
                assert v == seen[base], f"Conflicting versions for {base}: {seen[base]} vs {v}"
            if v is not None:
                seen[base] = v


# ============================================================
# Embed dependencies — ML packages in python-embed/
# ============================================================

class TestEmbedDeps:
    """EMBED_DEPS are the heavy ML packages — installed separately from cx_Freeze."""

    def test_torch_is_present(self):
        from scripts.deps import EMBED_DEPS
        assert 'torch' in EMBED_DEPS

    def test_transformers_is_present(self):
        from scripts.deps import EMBED_DEPS
        assert 'transformers' in EMBED_DEPS

    def test_chatterbox_tts_is_runtime_installed(self):
        """Chatterbox moved out of EMBED_DEPS on 2026-04-16 because it
        pins torch==2.6.0 + numpy<1.26, which conflicts with Nunba's
        own numpy pin (see scripts/deps.py:161).  It's now a RUNTIME
        pip install via tts/package_installer.py::BACKEND_PACKAGES
        — fetched on-demand only when a Chatterbox backend is selected,
        into ~/.nunba/site-packages/ where it can't shadow embed deps.
        """
        from tts.package_installer import BACKEND_PACKAGES
        turbo = BACKEND_PACKAGES.get('chatterbox_turbo', [])
        ml = BACKEND_PACKAGES.get('chatterbox_multilingual', [])
        assert any('chatterbox-tts' in p for p in turbo), (
            "chatterbox-tts missing from chatterbox_turbo runtime install list")
        assert any('chatterbox-tts' in p for p in ml), (
            "chatterbox-tts missing from chatterbox_multilingual runtime install list")


# ============================================================
# Platform dependencies
# ============================================================

class TestPlatformDeps:
    """Platform-specific deps — wrong platform = crash on import."""

    def test_win32_has_pystray(self):
        """Windows system tray needs pystray."""
        from scripts.deps import PLATFORM_DEPS
        assert 'pystray' in PLATFORM_DEPS['win32']

    def test_win32_has_pywin32(self):
        """Win32 API access for window management, console hiding."""
        from scripts.deps import PLATFORM_DEPS
        assert 'pywin32' in PLATFORM_DEPS['win32']

    def test_linux_has_pystray(self):
        from scripts.deps import PLATFORM_DEPS
        assert 'pystray' in PLATFORM_DEPS['linux']

    def test_darwin_has_rumps(self):
        from scripts.deps import PLATFORM_DEPS
        assert 'rumps' in PLATFORM_DEPS['darwin']


# ============================================================
# Helper functions — used by build scripts
# ============================================================

class TestHelperFunctions:
    """Build scripts call these to generate pip install commands."""

    def test_format_dep_with_version(self):
        from scripts.deps import _format_dep
        assert _format_dep('flask', '3.0.0') == 'flask==3.0.0'

    def test_format_dep_without_version(self):
        from scripts.deps import _format_dep
        assert _format_dep('chatterbox-tts', None) == 'chatterbox-tts'

    def test_get_venv_install_list_returns_list(self):
        from scripts.deps import get_venv_install_list
        result = get_venv_install_list(platform='win32')
        assert isinstance(result, list)
        assert len(result) > 10  # Should have many deps

    def test_get_venv_install_list_includes_platform_deps(self):
        from scripts.deps import get_venv_install_list
        result = get_venv_install_list(platform='win32')
        joined = ' '.join(result)
        assert 'pystray' in joined

    def test_get_embed_install_list_excludes_torch_by_default(self):
        """Torch needs special --index-url — must not be in the default list."""
        from scripts.deps import get_embed_install_list
        result = get_embed_install_list(include_torch=False)
        joined = ' '.join(result)
        assert 'torch==' not in joined

    def test_get_embed_install_list_includes_torch_when_requested(self):
        from scripts.deps import get_embed_install_list
        result = get_embed_install_list(include_torch=True)
        joined = ' '.join(result)
        assert 'torch==' in joined

    def test_get_torch_spec_returns_pinned(self):
        from scripts.deps import get_torch_spec
        spec = get_torch_spec()
        assert spec.startswith('torch')
        assert '==' in spec  # Should be pinned

    def test_get_all_deps_merges_all_sources(self):
        from scripts.deps import get_all_deps
        all_deps = get_all_deps()
        # Should contain both core and embed
        assert 'flask' in all_deps
        assert 'torch' in all_deps

    def test_torch_index_url_is_https(self):
        """Torch download must use HTTPS — HTTP would allow MITM on model weights."""
        from scripts.deps import TORCH_INDEX_URL
        assert TORCH_INDEX_URL.startswith('https://')
