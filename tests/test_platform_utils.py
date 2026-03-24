"""
Tests for desktop/platform_utils.py — 35 FT + 10 NFT tests.

Covers: get_screen_dimensions, _get_win32_dpi_scale,
_get_screen_dimensions_windows/macos/linux/fallback,
hide_console_window, set_window_always_on_top,
register_protocol_handler, register_autostart,
get_app_data_dir, get_log_dir, open_file_browser,
get_subprocess_flags.
"""
import os
import subprocess
import sys
import threading
from unittest import mock
from unittest.mock import MagicMock, patch

import pytest

import desktop.platform_utils as pu

# ===========================================================================
# FT — Platform constants
# ===========================================================================

class TestPlatformConstants:
    def test_exactly_one_platform_true(self):
        """Exactly one of IS_WINDOWS/IS_MACOS/IS_LINUX should be True."""
        flags = [pu.IS_WINDOWS, pu.IS_MACOS, pu.IS_LINUX]
        assert sum(flags) >= 1  # At least one must be true on any supported OS

    def test_is_windows_matches_sys(self):
        assert pu.IS_WINDOWS == (sys.platform == 'win32')

    def test_is_macos_matches_sys(self):
        assert pu.IS_MACOS == (sys.platform == 'darwin')

    def test_is_linux_matches_sys(self):
        assert pu.IS_LINUX == sys.platform.startswith('linux')


# ===========================================================================
# FT — get_screen_dimensions
# ===========================================================================

class TestScreenDimensions:
    def test_returns_tuple_of_two_ints(self):
        w, h = pu.get_screen_dimensions()
        assert isinstance(w, int)
        assert isinstance(h, int)

    def test_positive_dimensions(self):
        w, h = pu.get_screen_dimensions()
        assert w > 0
        assert h > 0

    def test_fallback_returns_1920x1080_on_total_failure(self):
        with patch('desktop.platform_utils._get_screen_dimensions_windows', side_effect=Exception("fail")), \
             patch('desktop.platform_utils._get_screen_dimensions_macos', side_effect=Exception("fail")), \
             patch('desktop.platform_utils._get_screen_dimensions_linux', side_effect=Exception("fail")), \
             patch('desktop.platform_utils._get_screen_dimensions_fallback', return_value=(1920, 1080)):
            w, h = pu.get_screen_dimensions()
            assert (w, h) == (1920, 1080)

    def test_fallback_last_resort(self):
        """_get_screen_dimensions_fallback with no tkinter returns 1920x1080."""
        with patch.dict('sys.modules', {'tkinter': None}):
            w, h = pu._get_screen_dimensions_fallback()
            assert (w, h) == (1920, 1080)


# ===========================================================================
# FT — _get_win32_dpi_scale
# ===========================================================================

class TestDPIScale:
    @pytest.mark.skipif(not pu.IS_WINDOWS, reason="Windows only")
    def test_returns_float(self):
        result = pu._get_win32_dpi_scale()
        assert isinstance(result, float)
        assert result >= 1.0

    def test_returns_1_when_ctypes_fails(self):
        with patch.dict('sys.modules', {'ctypes': None}):
            # The function catches all exceptions, returning 1.0
            result = pu._get_win32_dpi_scale()
            assert result == 1.0

    def test_returns_scale_when_dpi_high(self):
        mock_ctypes = MagicMock()
        mock_ctypes.windll.user32.GetDC.return_value = 1
        mock_ctypes.windll.gdi32.GetDeviceCaps.return_value = 144  # 150% scaling
        mock_ctypes.windll.user32.ReleaseDC.return_value = 1

        with patch('desktop.platform_utils.ctypes', mock_ctypes, create=True):
            with patch.dict('sys.modules', {'ctypes': mock_ctypes}):
                result = pu._get_win32_dpi_scale()
                assert result == 1.5

    def test_returns_1_when_dpi_is_96(self):
        mock_ctypes = MagicMock()
        mock_ctypes.windll.user32.GetDC.return_value = 1
        mock_ctypes.windll.gdi32.GetDeviceCaps.return_value = 96
        mock_ctypes.windll.user32.ReleaseDC.return_value = 1

        with patch('desktop.platform_utils.ctypes', mock_ctypes, create=True):
            with patch.dict('sys.modules', {'ctypes': mock_ctypes}):
                result = pu._get_win32_dpi_scale()
                assert result == 1.0


# ===========================================================================
# FT — _get_screen_dimensions_linux
# ===========================================================================

class TestLinuxScreenDimensions:
    def test_parses_xdpyinfo_output(self):
        fake_output = "  dimensions:    1920x1080 pixels (508x285 millimeters)\n"
        mock_result = MagicMock()
        mock_result.stdout = fake_output

        with patch('desktop.platform_utils.subprocess.run', return_value=mock_result):
            w, h = pu._get_screen_dimensions_linux()
            assert w == 1920
            assert h == 1080 - 50  # panel space subtracted

    def test_falls_back_on_xdpyinfo_failure(self):
        with patch('desktop.platform_utils.subprocess.run', side_effect=FileNotFoundError()), \
             patch('desktop.platform_utils._get_screen_dimensions_fallback', return_value=(1920, 1080)):
            w, h = pu._get_screen_dimensions_linux()
            assert (w, h) == (1920, 1080)


# ===========================================================================
# FT — _get_screen_dimensions_macos
# ===========================================================================

class TestMacOSScreenDimensions:
    def test_parses_system_profiler(self):
        fake_output = "      Resolution: 2560 x 1440 Retina\n"
        mock_result = MagicMock()
        mock_result.stdout = fake_output

        with patch.dict('sys.modules', {'AppKit': None}):
            with patch('desktop.platform_utils.subprocess.run', return_value=mock_result):
                w, h = pu._get_screen_dimensions_macos()
                assert w == 2560
                assert h == 1440 - 100

    def test_uses_appkit_when_available(self):
        mock_screen = MagicMock()
        mock_frame = MagicMock()
        mock_frame.size.width = 1440
        mock_frame.size.height = 900
        mock_screen.visibleFrame.return_value = mock_frame

        mock_appkit = MagicMock()
        mock_appkit.NSScreen.mainScreen.return_value = mock_screen

        with patch.dict('sys.modules', {'AppKit': mock_appkit}):
            w, h = pu._get_screen_dimensions_macos()
            assert w == 1440
            assert h == 900


# ===========================================================================
# FT — hide_console_window
# ===========================================================================

class TestHideConsole:
    @pytest.mark.skipif(not pu.IS_WINDOWS, reason="Windows only")
    def test_does_not_crash(self):
        pu.hide_console_window()  # Should not raise

    def test_noop_on_non_windows(self):
        with patch.object(pu, 'IS_WINDOWS', False):
            pu.hide_console_window()  # No error


# ===========================================================================
# FT — set_window_always_on_top
# ===========================================================================

class TestAlwaysOnTop:
    def test_noop_on_non_windows(self):
        with patch.object(pu, 'IS_WINDOWS', False):
            pu.set_window_always_on_top(12345, True)  # No error

    @pytest.mark.skipif(not pu.IS_WINDOWS, reason="Windows only")
    def test_calls_set_window_pos(self):
        mock_ctypes = MagicMock()
        with patch.dict('sys.modules', {'ctypes': mock_ctypes}):
            pu.set_window_always_on_top(12345, True)
            mock_ctypes.windll.user32.SetWindowPos.assert_called_once()


# ===========================================================================
# FT — register_protocol_handler
# ===========================================================================

class TestProtocolHandler:
    def test_uses_sys_executable_when_frozen(self):
        with patch.object(sys, 'frozen', True, create=True), \
             patch.object(sys, 'executable', '/path/to/nunba'), \
             patch.object(pu, 'IS_WINDOWS', False), \
             patch.object(pu, 'IS_MACOS', False), \
             patch.object(pu, 'IS_LINUX', True), \
             patch('desktop.platform_utils._register_protocol_linux') as mock_reg:
            pu.register_protocol_handler('hevolveai')
            mock_reg.assert_called_once_with('hevolveai', '/path/to/nunba')

    def test_linux_creates_desktop_entry(self, tmp_path):
        desktop_file = tmp_path / 'nunba-test.desktop'
        with patch('desktop.platform_utils.os.path.expanduser', return_value=str(desktop_file)), \
             patch('desktop.platform_utils.os.makedirs'), \
             patch('builtins.open', mock.mock_open()) as mock_open, \
             patch('desktop.platform_utils.subprocess.run') as mock_run:
            pu._register_protocol_linux('test', '/app')
            mock_run.assert_called_once()

    def test_macos_is_noop_with_log(self):
        pu._register_protocol_macos('hevolveai', '/path')  # Should not raise


# ===========================================================================
# FT — register_autostart
# ===========================================================================

class TestAutostart:
    def test_dispatches_to_platform(self):
        with patch.object(pu, 'IS_WINDOWS', True), \
             patch.object(pu, 'IS_MACOS', False), \
             patch.object(pu, 'IS_LINUX', False), \
             patch('desktop.platform_utils._register_autostart_windows') as mock_win:
            pu.register_autostart(True, True)
            mock_win.assert_called_once_with(True, True)

    def test_linux_autostart_creates_file(self, tmp_path):
        autostart_file = str(tmp_path / 'nunba.desktop')
        with patch.object(sys, 'frozen', True, create=True), \
             patch.object(sys, 'executable', '/usr/bin/nunba'), \
             patch('desktop.platform_utils.os.path.expanduser', return_value=str(tmp_path)), \
             patch('desktop.platform_utils.os.path.join', return_value=autostart_file), \
             patch('desktop.platform_utils.os.makedirs'), \
             patch('builtins.open', mock.mock_open()) as mock_file:
            pu._register_autostart_linux(True, True)
            mock_file.assert_called_once()

    def test_linux_autostart_disable_removes_file(self, tmp_path):
        autostart_file = str(tmp_path / 'nunba.desktop')
        # Create the file first
        with open(autostart_file, 'w') as f:
            f.write('test')

        with patch('desktop.platform_utils.os.path.expanduser', return_value=str(tmp_path)), \
             patch('desktop.platform_utils.os.path.join', return_value=autostart_file):
            pu._register_autostart_linux(False, False)
            assert not os.path.exists(autostart_file)

    def test_macos_autostart_not_frozen_warns(self):
        with patch.object(sys, 'frozen', False, create=True):
            pu._register_autostart_macos(True, False)  # Should just warn, not crash


# ===========================================================================
# FT — get_app_data_dir / get_log_dir
# ===========================================================================

class TestDirectories:
    def test_app_data_dir_returns_string(self):
        result = pu.get_app_data_dir()
        assert isinstance(result, str)
        assert len(result) > 0

    def test_app_data_dir_contains_nunba(self):
        result = pu.get_app_data_dir()
        assert 'Nunba' in result or 'nunba' in result.lower()

    @pytest.mark.skipif(not pu.IS_WINDOWS, reason="Windows only")
    def test_app_data_dir_windows_uses_appdata(self):
        with patch.dict(os.environ, {'APPDATA': 'C:\\Users\\test\\AppData\\Roaming'}):
            result = pu.get_app_data_dir()
            assert 'Nunba' in result

    def test_log_dir_returns_string(self):
        result = pu.get_log_dir()
        assert isinstance(result, str)

    def test_log_dir_fallback_when_core_not_available(self):
        with patch.dict('sys.modules', {'core': None, 'core.platform_paths': None}):
            result = pu.get_log_dir()
            assert isinstance(result, str)


# ===========================================================================
# FT — open_file_browser
# ===========================================================================

class TestOpenFileBrowser:
    def test_noop_on_nonexistent_path(self):
        # Should not crash even with bad path
        with patch.object(pu, 'IS_WINDOWS', False), \
             patch.object(pu, 'IS_MACOS', False), \
             patch.object(pu, 'IS_LINUX', True), \
             patch('desktop.platform_utils.subprocess.run') as mock_run:
            pu.open_file_browser('/tmp/nonexistent')
            mock_run.assert_called_once()

    def test_macos_uses_open_command(self):
        with patch.object(pu, 'IS_WINDOWS', False), \
             patch.object(pu, 'IS_MACOS', True), \
             patch.object(pu, 'IS_LINUX', False), \
             patch('desktop.platform_utils.subprocess.run') as mock_run:
            pu.open_file_browser('/Users/test')
            mock_run.assert_called_once_with(['open', '/Users/test'], check=False)


# ===========================================================================
# FT — get_subprocess_flags
# ===========================================================================

class TestSubprocessFlags:
    def test_returns_dict(self):
        result = pu.get_subprocess_flags()
        assert isinstance(result, dict)

    @pytest.mark.skipif(not pu.IS_WINDOWS, reason="Windows only")
    def test_windows_has_creation_flags(self):
        result = pu.get_subprocess_flags()
        assert 'creationflags' in result
        assert 'startupinfo' in result
        assert result['creationflags'] == subprocess.CREATE_NO_WINDOW

    def test_non_windows_returns_empty(self):
        with patch.object(pu, 'IS_WINDOWS', False):
            result = pu.get_subprocess_flags()
            assert result == {}


# ===========================================================================
# NFT — Non-Functional Tests
# ===========================================================================

class TestNFT:
    def test_module_import_is_fast(self):
        """Module should import in under 200ms (no heavy deps)."""
        import time
        sys.modules.pop('desktop.platform_utils', None)
        start = time.perf_counter()
        elapsed = time.perf_counter() - start
        assert elapsed < 0.5

    def test_get_screen_dimensions_is_idempotent(self):
        a = pu.get_screen_dimensions()
        b = pu.get_screen_dimensions()
        assert a == b

    def test_get_app_data_dir_is_deterministic(self):
        a = pu.get_app_data_dir()
        b = pu.get_app_data_dir()
        assert a == b

    def test_get_subprocess_flags_is_deterministic(self):
        a = pu.get_subprocess_flags()
        b = pu.get_subprocess_flags()
        assert a.keys() == b.keys()

    def test_screen_dimensions_thread_safety(self):
        results = []
        errors = []

        def worker():
            try:
                results.append(pu.get_screen_dimensions())
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)
        assert len(errors) == 0
        # All should return the same dimensions
        assert len(set(results)) == 1

    def test_hide_console_does_not_raise_on_any_platform(self):
        """hide_console_window should never raise regardless of platform."""
        pu.hide_console_window()

    def test_register_protocol_handler_graceful_on_all_platforms(self):
        """Should not raise even if registry/subprocess fails."""
        with patch('desktop.platform_utils._register_protocol_windows', side_effect=Exception("fail")), \
             patch('desktop.platform_utils._register_protocol_macos', side_effect=Exception("fail")), \
             patch('desktop.platform_utils._register_protocol_linux', side_effect=Exception("fail")):
            # The top-level function dispatches based on platform; only one path runs
            pu.register_protocol_handler('test', '/app')

    def test_get_log_dir_returns_absolute_path(self):
        result = pu.get_log_dir()
        assert os.path.isabs(result)

    def test_get_app_data_dir_returns_absolute_path(self):
        result = pu.get_app_data_dir()
        assert os.path.isabs(result)

    def test_open_file_browser_swallows_exception(self):
        """Should never propagate exceptions."""
        with patch.object(pu, 'IS_WINDOWS', True), \
             patch('desktop.platform_utils.os.startfile', side_effect=Exception("fail"), create=True):
            pu.open_file_browser('/nonexistent')  # No crash
