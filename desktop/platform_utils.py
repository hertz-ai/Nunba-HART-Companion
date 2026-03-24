"""
platform_utils.py - Cross-platform utilities for Nunba

Provides platform-specific functionality for:
- Screen dimensions
- Window management
- Protocol handler registration
- Autostart configuration
- Console window hiding
"""
import logging
import os
import subprocess
import sys

logger = logging.getLogger('NunbaPlatform')

# Platform detection
IS_MACOS = sys.platform == 'darwin'
IS_WINDOWS = sys.platform == 'win32'
IS_LINUX = sys.platform.startswith('linux')


def get_screen_dimensions():
    """Get screen dimensions (working area, excludes taskbar/dock)"""
    try:
        if IS_WINDOWS:
            return _get_screen_dimensions_windows()
        elif IS_MACOS:
            return _get_screen_dimensions_macos()
        else:
            return _get_screen_dimensions_linux()
    except Exception as e:
        logger.warning(f"Error getting screen dimensions: {e}, using fallback")
        return _get_screen_dimensions_fallback()


def _get_win32_dpi_scale():
    """Detect Windows DPI scale factor.

    Returns >1.0 when the process is DPI-aware and the display uses scaling
    (e.g. 1.5 for 150%).  Returns 1.0 when DPI-unaware (virtualised to 96 dpi)
    or when no scaling is active.
    """
    try:
        import ctypes
        hdc = ctypes.windll.user32.GetDC(0)
        if hdc:
            dpi = ctypes.windll.gdi32.GetDeviceCaps(hdc, 88)  # LOGPIXELSX
            ctypes.windll.user32.ReleaseDC(0, hdc)
            if dpi > 96:
                return dpi / 96.0
    except Exception:
        pass
    return 1.0


def _get_screen_dimensions_windows():
    """Get screen dimensions on Windows, normalised to logical pixels.

    SystemParametersInfoW(SPI_GETWORKAREA) returns physical pixels when the
    calling process is DPI-aware, but pywebview's move()/resize() always
    operates in logical (DPI-unaware) coordinates.  We detect the DPI scale
    and divide accordingly so the values are safe for window positioning.
    """
    import ctypes
    from ctypes import Structure, byref, windll
    from ctypes.wintypes import RECT

    class RECT(Structure):
        _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long),
                   ("right", ctypes.c_long), ("bottom", ctypes.c_long)]

    rect = RECT()
    windll.user32.SystemParametersInfoW(0x0030, 0, byref(rect), 0)  # SPI_GETWORKAREA
    raw_w = rect.right - rect.left
    raw_h = rect.bottom - rect.top

    scale = _get_win32_dpi_scale()
    if scale > 1.0:
        logical_w = round(raw_w / scale)
        logical_h = round(raw_h / scale)
        logger.info(f"DPI normalisation: raw={raw_w}x{raw_h}, scale={scale:.2f}, "
                    f"logical={logical_w}x{logical_h}")
        return logical_w, logical_h

    return raw_w, raw_h


def _get_screen_dimensions_macos():
    """Get screen dimensions on macOS"""
    try:
        # Try using AppKit
        from AppKit import NSScreen
        screen = NSScreen.mainScreen()
        frame = screen.visibleFrame()
        return int(frame.size.width), int(frame.size.height)
    except ImportError:
        pass

    # Fallback: use system_profiler
    try:
        result = subprocess.run(
            ['system_profiler', 'SPDisplaysDataType'],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.split('\n'):
            if 'Resolution' in line:
                parts = line.split(':')[1].strip().split(' x ')
                if len(parts) >= 2:
                    width = int(parts[0].strip())
                    height = int(parts[1].split()[0].strip())
                    # Subtract dock/menu bar space (approximate)
                    return width, height - 100
    except Exception:
        pass

    return _get_screen_dimensions_fallback()


def _get_screen_dimensions_linux():
    """Get screen dimensions on Linux"""
    try:
        result = subprocess.run(
            ['xdpyinfo'],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.split('\n'):
            if 'dimensions:' in line:
                dims = line.split(':')[1].strip().split()[0]
                width, height = dims.split('x')
                return int(width), int(height) - 50  # Subtract panel space
    except Exception:
        pass

    return _get_screen_dimensions_fallback()


def _get_screen_dimensions_fallback():
    """Fallback screen dimensions using tkinter"""
    try:
        import tkinter as tk
        root = tk.Tk()
        root.withdraw()
        width = root.winfo_screenwidth()
        height = root.winfo_screenheight()
        root.destroy()
        return width, height
    except Exception:
        return 1920, 1080


def hide_console_window():
    """Hide the console window (Windows only)"""
    if IS_WINDOWS:
        try:
            import ctypes
            ctypes.windll.user32.ShowWindow(
                ctypes.windll.kernel32.GetConsoleWindow(), 0
            )
        except Exception as e:
            logger.debug(f"Could not hide console: {e}")


def set_window_always_on_top(window_handle, on_top=True):
    """Set a window to be always on top"""
    if IS_WINDOWS:
        try:
            import ctypes
            HWND_TOPMOST = -1
            HWND_NOTOPMOST = -2
            SWP_NOMOVE = 0x0002
            SWP_NOSIZE = 0x0001

            hwnd = window_handle
            flag = HWND_TOPMOST if on_top else HWND_NOTOPMOST
            ctypes.windll.user32.SetWindowPos(
                hwnd, flag, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE
            )
        except Exception as e:
            logger.error(f"Error setting window on top: {e}")


def register_protocol_handler(protocol="hevolveai", app_path=None):
    """Register a custom URL protocol handler"""
    if app_path is None:
        if getattr(sys, 'frozen', False):
            app_path = sys.executable
        else:
            app_path = os.path.abspath(__file__)

    if IS_WINDOWS:
        _register_protocol_windows(protocol, app_path)
    elif IS_MACOS:
        _register_protocol_macos(protocol, app_path)
    elif IS_LINUX:
        _register_protocol_linux(protocol, app_path)


def _register_protocol_windows(protocol, app_path):
    """Register protocol handler on Windows"""
    try:
        import winreg

        # Create protocol key
        key_path = f"{protocol}"
        with winreg.CreateKey(winreg.HKEY_CLASSES_ROOT, key_path) as key:
            winreg.SetValue(key, "", winreg.REG_SZ, f"URL:{protocol} Protocol")
            winreg.SetValueEx(key, "URL Protocol", 0, winreg.REG_SZ, "")

        # Set default icon
        with winreg.CreateKey(winreg.HKEY_CLASSES_ROOT, f"{protocol}\\DefaultIcon") as key:
            winreg.SetValue(key, "", winreg.REG_SZ, f'"{app_path}",0')

        # Set command
        with winreg.CreateKey(winreg.HKEY_CLASSES_ROOT, f"{protocol}\\shell\\open\\command") as key:
            winreg.SetValue(key, "", winreg.REG_SZ, f'"{app_path}" --protocol "%1"')

        logger.info(f"Registered {protocol}:// protocol handler")
    except Exception as e:
        logger.error(f"Failed to register protocol handler: {e}")


def _register_protocol_macos(protocol, app_path):
    """Register protocol handler on macOS (handled by Info.plist in app bundle)"""
    # On macOS, protocol handlers are defined in the app's Info.plist
    # This is handled during build time in setup_freeze_mac.py
    logger.info(f"Protocol handler {protocol}:// configured in Info.plist")


def _register_protocol_linux(protocol, app_path):
    """Register protocol handler on Linux"""
    try:
        desktop_entry = f"""[Desktop Entry]
Type=Application
Name=Nunba
Exec={app_path} --protocol %u
StartupNotify=false
MimeType=x-scheme-handler/{protocol};
"""
        desktop_file = os.path.expanduser(f"~/.local/share/applications/nunba-{protocol}.desktop")
        os.makedirs(os.path.dirname(desktop_file), exist_ok=True)

        with open(desktop_file, 'w') as f:
            f.write(desktop_entry)

        # Register with xdg-mime
        subprocess.run([
            'xdg-mime', 'default', f'nunba-{protocol}.desktop',
            f'x-scheme-handler/{protocol}'
        ], check=False)

        logger.info(f"Registered {protocol}:// protocol handler")
    except Exception as e:
        logger.error(f"Failed to register protocol handler: {e}")


def register_autostart(enabled=True, background=True):
    """Register/unregister app to start at login"""
    if IS_WINDOWS:
        _register_autostart_windows(enabled, background)
    elif IS_MACOS:
        _register_autostart_macos(enabled, background)
    elif IS_LINUX:
        _register_autostart_linux(enabled, background)


def _register_autostart_windows(enabled, background):
    """Register autostart on Windows"""
    try:
        import winreg
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"

        if getattr(sys, 'frozen', False):
            app_path = sys.executable
        else:
            app_path = os.path.abspath(__file__)

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE) as key:
            if enabled:
                cmd = f'"{app_path}"'
                if background:
                    cmd += ' --background'
                winreg.SetValueEx(key, "Nunba", 0, winreg.REG_SZ, cmd)
                logger.info("Registered autostart")
            else:
                try:
                    winreg.DeleteValue(key, "Nunba")
                    logger.info("Removed autostart")
                except FileNotFoundError:
                    pass
    except Exception as e:
        logger.error(f"Failed to configure autostart: {e}")


def _register_autostart_macos(enabled, background):
    """Register autostart on macOS using Login Items"""
    try:
        if getattr(sys, 'frozen', False):
            app_path = os.path.dirname(os.path.dirname(os.path.dirname(sys.executable)))
            if not app_path.endswith('.app'):
                # Find the .app bundle
                parts = sys.executable.split('/')
                for i, part in enumerate(parts):
                    if part.endswith('.app'):
                        app_path = '/'.join(parts[:i+1])
                        break
        else:
            logger.warning("Autostart only works with bundled .app")
            return

        if enabled:
            # Add to Login Items using osascript
            # Escape path to prevent AppleScript injection
            _safe_path = app_path.replace('\\', '\\\\').replace('"', '\\"')
            script = f'''
            tell application "System Events"
                make login item at end with properties {{path:"{_safe_path}", hidden:{str(background).lower()}}}
            end tell
            '''
            subprocess.run(['osascript', '-e', script], check=False, timeout=10)
            logger.info("Registered autostart")
        else:
            # Remove from Login Items
            script = '''
            tell application "System Events"
                delete login item "Nunba"
            end tell
            '''
            subprocess.run(['osascript', '-e', script], check=False)
            logger.info("Removed autostart")
    except Exception as e:
        logger.error(f"Failed to configure autostart: {e}")


def _register_autostart_linux(enabled, background):
    """Register autostart on Linux"""
    try:
        if getattr(sys, 'frozen', False):
            app_path = sys.executable
        else:
            app_path = os.path.abspath(__file__)

        autostart_dir = os.path.expanduser("~/.config/autostart")
        autostart_file = os.path.join(autostart_dir, "nunba.desktop")

        if enabled:
            os.makedirs(autostart_dir, exist_ok=True)
            cmd = app_path
            if background:
                cmd += ' --background'

            desktop_entry = f"""[Desktop Entry]
Type=Application
Name=Nunba
Exec={cmd}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
"""
            with open(autostart_file, 'w') as f:
                f.write(desktop_entry)
            logger.info("Registered autostart")
        else:
            if os.path.exists(autostart_file):
                os.remove(autostart_file)
            logger.info("Removed autostart")
    except Exception as e:
        logger.error(f"Failed to configure autostart: {e}")


def get_app_data_dir():
    """Get the appropriate application data directory for the current platform"""
    if IS_WINDOWS:
        base = os.environ.get('APPDATA', os.path.expanduser('~'))
        return os.path.join(base, 'Nunba')
    elif IS_MACOS:
        return os.path.expanduser('~/Library/Application Support/Nunba')
    else:
        return os.path.expanduser('~/.nunba')


def get_log_dir():
    """Get the appropriate log directory for the current platform"""
    try:
        from core.platform_paths import get_log_dir as _platform_log_dir
        return _platform_log_dir()
    except ImportError:
        pass
    if IS_WINDOWS:
        return os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba', 'logs')
    elif IS_MACOS:
        return os.path.expanduser('~/Library/Logs/Nunba')
    else:
        return os.path.expanduser('~/.nunba/logs')


def open_file_browser(path):
    """Open file browser at the given path"""
    try:
        if IS_WINDOWS:
            os.startfile(path)
        elif IS_MACOS:
            subprocess.run(['open', path], check=False)
        else:
            subprocess.run(['xdg-open', path], check=False)
    except Exception as e:
        logger.error(f"Failed to open file browser: {e}")


def get_subprocess_flags():
    """Get subprocess creation flags for the current platform (hides console windows)"""
    if IS_WINDOWS:
        si = subprocess.STARTUPINFO()
        si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        si.wShowWindow = 0  # SW_HIDE
        return {'startupinfo': si, 'creationflags': subprocess.CREATE_NO_WINDOW}
    else:
        return {}
