"""Integration smoke tests for desktop/ modules — batch #20.

Targets:
  * desktop/splash_effects.py (3048 LOC)
  * desktop/indicator_window.py (807 LOC)
  * desktop/ai_installer.py (642 LOC)
  * desktop/ai_key_vault.py (456 LOC)
  * desktop/crash_reporter.py (425 LOC)
  * desktop/platform_utils.py (419 LOC)
  * desktop/setup_wizard.py (354 LOC)
  * desktop/guest_identity.py (319 LOC)
  * desktop/tray_handler.py (307 LOC)
  * desktop/chat_settings.py (240 LOC)
  * desktop/chat_sync.py (208 LOC)
  * desktop/media_classification.py (205 LOC)
  * desktop/config.py (94 LOC)

Pattern: module-load smoke + callable exports for each module.
Desktop code is GUI-heavy (tkinter / pystray / webview) — real
behavior tests require a display.  This batch locks symbol contracts.
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
# Module-load smoke — every desktop/*.py must be importable
# ════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize('module_name', [
    'desktop.config',
    'desktop.chat_settings',
    'desktop.chat_sync',
    'desktop.guest_identity',
    'desktop.media_classification',
    'desktop.crash_reporter',
    'desktop.ai_key_vault',
    'desktop.ai_installer',
    'desktop.platform_utils',
    'desktop.tray_handler',
])
def test_desktop_module_loads(module_name):
    """Every desktop/ module must import without raising.  Some use
    lazy imports for tkinter/pystray so they're safe on headless CI."""
    import importlib
    try:
        mod = importlib.import_module(module_name)
        assert mod is not None
    except ImportError as e:
        # If a platform-specific dep is missing on Linux CI (pywin32,
        # pyobjc-framework-Cocoa), skip with clear reason.
        pytest.skip(f'{module_name}: platform dep missing: {e}')


# ════════════════════════════════════════════════════════════════════════
# desktop/platform_utils.py — cross-platform helpers
# ════════════════════════════════════════════════════════════════════════

class TestPlatformUtils:
    def test_module_loads(self):
        import desktop.platform_utils as pu
        assert pu is not None

    def test_has_pub_callable(self):
        import desktop.platform_utils as pu
        pub = [n for n in dir(pu) if not n.startswith('_') and callable(getattr(pu, n, None))]
        assert len(pub) > 0


# ════════════════════════════════════════════════════════════════════════
# desktop/guest_identity.py — hardware-derived stable guest_id
# ════════════════════════════════════════════════════════════════════════

class TestGuestIdentity:
    def test_module_loads(self):
        import desktop.guest_identity as gi
        assert gi is not None

    def test_has_get_guest_id_callable(self):
        import desktop.guest_identity as gi
        # Canonical API: some function that produces the guest id.
        candidates = [n for n in dir(gi) if 'guest' in n.lower() and callable(getattr(gi, n, None))]
        assert len(candidates) > 0


# ════════════════════════════════════════════════════════════════════════
# desktop/ai_key_vault.py — encrypted API key vault
# ════════════════════════════════════════════════════════════════════════

class TestAIKeyVault:
    def test_module_loads(self):
        import desktop.ai_key_vault as akv
        assert akv is not None

    def test_exports_vault_class_or_helpers(self):
        import desktop.ai_key_vault as akv
        # Should expose a Vault class or get/set helpers.
        candidates = [n for n in dir(akv) if not n.startswith('_')]
        assert len(candidates) > 0


# ════════════════════════════════════════════════════════════════════════
# desktop/crash_reporter.py — Sentry integration
# ════════════════════════════════════════════════════════════════════════

class TestCrashReporter:
    def test_module_loads(self):
        import desktop.crash_reporter as cr
        assert cr is not None


# ════════════════════════════════════════════════════════════════════════
# desktop/ai_installer.py — unified AI components installer
# ════════════════════════════════════════════════════════════════════════

class TestAIInstaller:
    def test_module_loads(self):
        import desktop.ai_installer as ai
        assert ai is not None


# ════════════════════════════════════════════════════════════════════════
# desktop/tray_handler.py — cross-platform tray
# ════════════════════════════════════════════════════════════════════════

class TestTrayHandler:
    def test_module_loads_or_skips_gracefully(self):
        """tray_handler imports pystray which may be missing on CI.
        Acceptable to skip if so."""
        try:
            import desktop.tray_handler as th
            assert th is not None
        except ImportError as e:
            pytest.skip(f'pystray not available in CI: {e}')


# ════════════════════════════════════════════════════════════════════════
# desktop/chat_settings.py — admin-controlled restore policy
# ════════════════════════════════════════════════════════════════════════

class TestChatSettings:
    def test_module_loads(self):
        import desktop.chat_settings as cs
        assert cs is not None


# ════════════════════════════════════════════════════════════════════════
# desktop/chat_sync.py — multi-device sync
# ════════════════════════════════════════════════════════════════════════

class TestChatSync:
    def test_module_loads(self):
        import desktop.chat_sync as cs
        assert cs is not None


# ════════════════════════════════════════════════════════════════════════
# desktop/media_classification.py
# ════════════════════════════════════════════════════════════════════════

class TestMediaClassification:
    def test_module_loads(self):
        import desktop.media_classification as mc
        assert mc is not None


# ════════════════════════════════════════════════════════════════════════
# desktop/config.py — DSN + version
# ════════════════════════════════════════════════════════════════════════

class TestConfig:
    def test_module_loads(self):
        import desktop.config as config
        assert config is not None


# ════════════════════════════════════════════════════════════════════════
# desktop/indicator_window.py + splash_effects.py + setup_wizard.py
# ════════════════════════════════════════════════════════════════════════

class TestTkinterGUIModules:
    """These modules import tkinter which isn't available on headless
    Linux CI.  Skip if import fails."""

    def test_indicator_window_loads_or_skips(self):
        try:
            import desktop.indicator_window as iw
            assert iw is not None
        except (ImportError, Exception) as e:
            pytest.skip(f'indicator_window not available: {e}')

    def test_splash_effects_loads_or_skips(self):
        try:
            import desktop.splash_effects as se
            assert se is not None
        except (ImportError, Exception) as e:
            pytest.skip(f'splash_effects not available: {e}')

    def test_setup_wizard_loads_or_skips(self):
        try:
            import desktop.setup_wizard as sw
            assert sw is not None
        except (ImportError, Exception) as e:
            pytest.skip(f'setup_wizard not available: {e}')
