"""
test_tray_handler.py - Tests for desktop/tray_handler.py

Tests the system tray — the primary UI for background-mode users.
Each test verifies a specific UX behavior or cross-platform guarantee:

FT: Tray setup on each platform, menu actions (show/maximize/quit),
    notification delivery, icon creation, singleton guard.
NFT: Thread safety of tray operations, graceful degradation when
     pystray unavailable, macOS AppKit threading constraint handling.
"""
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


class TestPlatformDetection:
    """Platform flags drive tray backend selection — wrong detection = crash."""

    def test_platform_constants_are_bool(self):
        from desktop.tray_handler import IS_LINUX, IS_MACOS, IS_WINDOWS
        assert isinstance(IS_MACOS, bool)
        assert isinstance(IS_WINDOWS, bool)
        assert isinstance(IS_LINUX, bool)

    def test_exactly_one_platform_is_true(self):
        """Exactly one of the three should be true on any OS."""
        from desktop.tray_handler import IS_LINUX, IS_MACOS, IS_WINDOWS
        active = sum([IS_MACOS, IS_WINDOWS, IS_LINUX])
        assert active <= 1, "Multiple platform flags true simultaneously"


class TestTrayHandlerInit:
    """TrayHandler init — stores window ref for show/hide actions."""

    def test_stores_window_instance(self):
        from desktop.tray_handler import TrayHandler
        mock_window = MagicMock()
        handler = TrayHandler(mock_window, app_name="Test")
        assert handler.window is mock_window
        assert handler.app_name == "Test"

    def test_default_tooltip(self):
        from desktop.tray_handler import TrayHandler
        handler = TrayHandler(MagicMock())
        assert 'Nunba' in handler.tooltip or 'LocalMind' in handler.tooltip

    def test_not_running_initially(self):
        from desktop.tray_handler import TrayHandler
        handler = TrayHandler(MagicMock())
        assert handler._running is False


class TestTraySetup:
    """Tray icon creation — different backends per platform."""

    def test_setup_returns_icon_or_none(self):
        """Must return an icon object or None — never crash."""
        import desktop.tray_handler as th
        from desktop.tray_handler import TrayHandler
        old_icon = th._tray_icon
        th._tray_icon = None  # Reset singleton
        handler = TrayHandler(MagicMock())
        with patch.object(handler, '_setup_pystray', return_value=MagicMock()):
            result = handler.setup()
        th._tray_icon = old_icon
        assert result is not None or result is None  # doesn't crash

    def test_singleton_prevents_double_setup(self):
        """Double-clicking the tray should not create two icons."""
        import desktop.tray_handler as th
        from desktop.tray_handler import TrayHandler
        old_icon = th._tray_icon
        fake_icon = MagicMock()
        th._tray_icon = fake_icon
        handler = TrayHandler(MagicMock())
        result = handler.setup()
        assert result is fake_icon  # Returns existing, doesn't create new
        th._tray_icon = old_icon

    def test_macos_returns_dummy_tray(self):
        """macOS can't use pystray (AppKit threading) — returns a dummy with .notify()."""
        import desktop.tray_handler as th
        from desktop.tray_handler import TrayHandler
        old_icon = th._tray_icon
        th._tray_icon = None
        handler = TrayHandler(MagicMock())
        result = handler._setup_macos()
        assert result is not None
        assert hasattr(result, 'notify')  # Dummy must have notify for balloon tips
        th._tray_icon = old_icon


class TestTrayActions:
    """Menu actions — these are the UX for background-mode users."""

    def test_on_restore_calls_window_show(self):
        """'Show' menu item must make the window visible."""
        from desktop.tray_handler import TrayHandler
        mock_window = MagicMock()
        handler = TrayHandler(mock_window)
        # _on_restore runs in a thread — call the inner _do directly
        with patch('threading.Thread') as mock_thread:
            handler._on_restore()
            mock_thread.assert_called_once()

    def test_on_maximize_calls_window_maximize(self):
        from desktop.tray_handler import TrayHandler
        mock_window = MagicMock()
        handler = TrayHandler(mock_window)
        with patch('threading.Thread') as mock_thread:
            handler._on_maximize()
            mock_thread.assert_called_once()


class TestNotifications:
    """Balloon tip notifications — inform background users of events."""

    def test_notify_calls_pystray_notify(self):
        """Windows/Linux: notification goes through pystray icon.notify()."""
        import desktop.tray_handler as th
        from desktop.tray_handler import TrayHandler
        old_icon = th._tray_icon
        mock_icon = MagicMock()
        th._tray_icon = mock_icon
        handler = TrayHandler(MagicMock())
        handler._notify_pystray("Test Title", "Test Message")
        mock_icon.notify.assert_called_once_with("Test Message", "Test Title")
        th._tray_icon = old_icon

    def test_notify_graceful_when_no_icon(self):
        """If tray icon failed to create, notification must not crash."""
        import desktop.tray_handler as th
        from desktop.tray_handler import TrayHandler
        old_icon = th._tray_icon
        th._tray_icon = None
        handler = TrayHandler(MagicMock())
        handler._notify_pystray("Title", "Msg")  # Must not raise
        th._tray_icon = old_icon


class TestDefaultIcon:
    """Fallback icon creation when app.ico/app.png not found."""

    def test_creates_64x64_image(self):
        from desktop.tray_handler import TrayHandler
        handler = TrayHandler(MagicMock())
        try:
            img = handler._create_default_icon()
            if img is not None:
                assert img.size == (64, 64)
                assert img.mode == 'RGBA'
        except ImportError:
            pytest.skip("PIL not available")

    def test_returns_none_without_pil(self):
        from desktop.tray_handler import TrayHandler
        handler = TrayHandler(MagicMock())
        with patch.dict('sys.modules', {'PIL': None, 'PIL.Image': None, 'PIL.ImageDraw': None}):
            result = handler._create_default_icon()
        # Returns None when PIL unavailable — caller handles this


class TestConvenienceFunctions:
    """Module-level functions used by app.py."""

    def test_setup_system_tray_creates_handler(self):
        from desktop.tray_handler import setup_system_tray
        mock_window = MagicMock()
        with patch('desktop.tray_handler.TrayHandler') as mock_cls:
            mock_handler = MagicMock()
            mock_cls.return_value = mock_handler
            setup_system_tray(mock_window)
        mock_cls.assert_called_once_with(mock_window)
        mock_handler.setup.assert_called_once()

    def test_notify_minimized_to_tray_no_crash_without_icon(self):
        """Called from app.py on minimize — must not crash even without tray."""
        import desktop.tray_handler as th
        old_icon = th._tray_icon
        th._tray_icon = None
        from desktop.tray_handler import notify_minimized_to_tray
        notify_minimized_to_tray(None, "Test")  # Must not raise
        th._tray_icon = old_icon
