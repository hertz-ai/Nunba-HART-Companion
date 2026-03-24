"""
tray_handler.py - Cross-platform system tray handler for Nunba

Provides a unified interface for system tray functionality on:
- Windows: Uses pystray
- macOS: Uses rumps (or pystray fallback)
- Linux: Uses pystray
"""
import logging
import os
import sys
import threading

logger = logging.getLogger('NunbaTray')

# Detect platform
IS_MACOS = sys.platform == 'darwin'
IS_WINDOWS = sys.platform == 'win32'
IS_LINUX = sys.platform.startswith('linux')

# Global tray icon reference
_tray_icon = None
_window_instance = None


class TrayHandler:
    """Cross-platform system tray handler"""

    def __init__(self, window_instance, app_name="Nunba", tooltip="Nunba - Your LocalMind"):
        global _window_instance
        _window_instance = window_instance
        self.window = window_instance
        self.app_name = app_name
        self.tooltip = tooltip
        self.icon = None
        self._running = False

    def _get_icon_path(self):
        """Get the appropriate icon file for the current platform"""
        if getattr(sys, 'frozen', False):
            app_dir = os.path.dirname(sys.executable)
            # On macOS app bundle, check Resources folder too
            if IS_MACOS:
                resources_dir = os.path.join(os.path.dirname(app_dir), 'Resources')
                icns_path = os.path.join(resources_dir, 'app.icns')
                if os.path.exists(icns_path):
                    return icns_path
        else:
            app_dir = os.path.dirname(os.path.abspath(__file__))

        # Try different icon formats
        icon_files = ['app.icns', 'app.ico', 'app.png', 'Nunba_Logo.png', 'Product_Hevolve_Logo.png']
        for icon_file in icon_files:
            path = os.path.join(app_dir, icon_file)
            if os.path.exists(path):
                return path

        return None

    def _on_quit(self, *args):
        """Handle quit action"""
        logger.info("Quit selected from system tray")
        self.stop()
        try:
            os._exit(0)
        except Exception:
            sys.exit(0)

    def _on_restore(self, *args):
        """Handle restore/show action — restores to previous position and size.
        Runs off pystray's callback thread to avoid blocking the tray menu."""
        import threading
        def _do():
            logger.info("Restore selected from system tray")
            try:
                if self.window:
                    self.window.show()
                    self.window.restore()
            except Exception as e:
                logger.error(f"Error restoring window: {e}")
                try:
                    self.window.show()
                except Exception:
                    pass
        threading.Thread(target=_do, daemon=True).start()

    def _on_maximize(self, *args):
        """Handle maximize action.
        Runs off pystray's callback thread to avoid blocking the tray menu."""
        import threading
        def _do():
            logger.info("Maximize selected from system tray")
            try:
                if self.window:
                    self.window.show()
                    self.window.maximize()
            except Exception as e:
                logger.error(f"Error maximizing window: {e}")
        threading.Thread(target=_do, daemon=True).start()

    def setup(self):
        """Set up system tray icon based on platform"""
        global _tray_icon

        if _tray_icon is not None:
            logger.info("System tray already set up")
            return _tray_icon

        if IS_MACOS:
            return self._setup_macos()
        else:
            return self._setup_pystray()

    def _setup_macos(self):
        """Set up system tray on macOS - skip menu bar to avoid threading issues"""
        global _tray_icon

        # macOS AppKit requires menu operations on the main thread.
        # Since pywebview uses the main thread, we cannot run rumps or pystray
        # with AppKit in a background thread without causing crashes.
        #
        # Solution: On macOS, we skip the system tray entirely.
        # The app will just run in the Dock like a normal macOS app.
        # Users can use Cmd+Q to quit or the window close button.

        logger.info("macOS: Skipping system tray (AppKit threading constraints)")
        logger.info("macOS: App will appear in Dock. Use Cmd+Q to quit.")

        # Return a dummy object that won't crash
        class MacOSDummyTray:
            def __init__(self, handler):
                self.handler = handler

            def notify(self, message, title=None):
                """Show notification using osascript"""
                try:
                    import subprocess
                    title = title or "Nunba"
                    _m = message.replace('\\', '\\\\').replace('"', '\\"')
                    _t = title.replace('\\', '\\\\').replace('"', '\\"')
                    script = f'display notification "{_m}" with title "{_t}"'
                    subprocess.run(['osascript', '-e', script], check=False, timeout=5)
                except Exception as e:
                    logger.error(f"Notification failed: {e}")

        _tray_icon = MacOSDummyTray(self)
        self._running = True
        return _tray_icon

    def _setup_pystray(self):
        """Set up system tray using pystray (Windows/Linux/macOS fallback)"""
        global _tray_icon

        try:
            import pystray
            from PIL import Image

            icon_path = self._get_icon_path()
            logger.info(f"Looking for icon at: {icon_path}")

            if icon_path and os.path.exists(icon_path):
                try:
                    icon_image = Image.open(icon_path)
                    # Convert to RGBA if needed
                    if icon_image.mode != 'RGBA':
                        icon_image = icon_image.convert('RGBA')
                    # Resize for tray icon
                    icon_image = icon_image.resize((64, 64), Image.LANCZOS)
                    logger.info(f"Using icon from {icon_path}")
                except Exception as e:
                    logger.error(f"Error loading icon: {e}")
                    icon_image = self._create_default_icon()
            else:
                logger.warning("Icon file not found, creating default")
                icon_image = self._create_default_icon()

            if icon_image is None:
                logger.error("Could not create icon image")
                return None

            # Create menu — default=True makes left-click trigger Show
            menu = pystray.Menu(
                pystray.MenuItem('Show', lambda: self._on_restore(), default=True),
                pystray.MenuItem('Maximize', lambda: self._on_maximize()),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem('Quit', lambda: self._on_quit())
            )

            # Create icon
            _tray_icon = pystray.Icon(
                self.app_name,
                icon_image,
                self.tooltip,
                menu
            )

            # Start in background thread
            thread = threading.Thread(target=_tray_icon.run, daemon=True)
            thread.start()

            self._running = True
            logger.info("System tray icon started with pystray")
            return _tray_icon

        except ImportError as e:
            logger.error(f"pystray not available: {e}")
            return None
        except Exception as e:
            logger.error(f"Error setting up pystray: {e}")
            return None

    def _create_default_icon(self):
        """Create a simple default icon"""
        try:
            from PIL import Image, ImageDraw

            # Create a simple colored square
            size = 64
            img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)

            # Draw a rounded rectangle with gradient-like effect
            draw.ellipse([4, 4, size-4, size-4], fill=(76, 175, 80, 255))  # Green
            draw.ellipse([8, 8, size-8, size-8], fill=(129, 199, 132, 255))  # Lighter green

            return img
        except Exception as e:
            logger.error(f"Error creating default icon: {e}")
            return None

    def notify(self, message, title=None):
        """Show a notification"""
        title = title or self.app_name

        if IS_MACOS:
            self._notify_macos(title, message)
        else:
            self._notify_pystray(title, message)

    def _notify_macos(self, title, message):
        """Show notification on macOS"""
        try:
            # Try using osascript for native notifications
            import subprocess
            script = f'display notification "{message}" with title "{title}"'
            subprocess.run(['osascript', '-e', script], check=False)
            logger.info(f"Notification shown: {title} - {message}")
        except Exception as e:
            logger.error(f"Error showing macOS notification: {e}")

    def _notify_pystray(self, title, message):
        """Show notification using pystray"""
        global _tray_icon
        try:
            if _tray_icon and hasattr(_tray_icon, 'notify'):
                _tray_icon.notify(message, title)
                logger.info(f"Notification shown: {title} - {message}")
        except Exception as e:
            logger.error(f"Error showing notification: {e}")

    def stop(self):
        """Stop the tray icon"""
        global _tray_icon
        self._running = False

        if _tray_icon:
            try:
                if IS_MACOS and hasattr(_tray_icon, 'quit_application'):
                    # rumps
                    pass  # Will be handled by quit callback
                elif hasattr(_tray_icon, 'stop'):
                    # pystray
                    _tray_icon.stop()
            except Exception as e:
                logger.error(f"Error stopping tray icon: {e}")

            _tray_icon = None


def setup_system_tray(window_instance):
    """
    Convenience function to set up system tray.
    Compatible with existing app.py calls.
    """
    handler = TrayHandler(window_instance)
    return handler.setup()


def notify_minimized_to_tray(icon, message="Application minimized to system tray"):
    """
    Show a notification that the app is minimized.
    Compatible with existing app.py calls.
    """
    global _tray_icon

    if IS_MACOS:
        try:
            import subprocess
            script = f'display notification "{message}" with title "Nunba"'
            subprocess.run(['osascript', '-e', script], check=False)
        except Exception as e:
            logger.error(f"Error showing notification: {e}")
    elif _tray_icon and hasattr(_tray_icon, 'notify'):
        try:
            _tray_icon.notify(message, "Nunba")
        except Exception as e:
            logger.error(f"Error showing notification: {e}")
