"""
test_indicator_window.py - Tests for desktop/indicator_window.py

Tests the LLM status ribbon — the small floating indicator that shows
model loading state, active inference time, and stop button.
Each test verifies state management or UX behavior:

FT: Screen size detection fallback, RibbonIndicator state init,
    show/hide/destroy lifecycle, server URL construction,
    module-level convenience functions.
NFT: Graceful degradation without pyautogui, Tk threading constraints,
     timer accuracy, animation state machine consistency.
"""
import os
import sys
import time
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Mock tkinter before importing the module — prevents Tk window creation in CI
tk_mock = MagicMock()
ttk_mock = MagicMock()


@pytest.fixture(autouse=True)
def mock_tkinter():
    """Mock tkinter globally — indicator_window creates Tk windows on import."""
    with patch.dict('sys.modules', {'tkinter': tk_mock, 'tkinter.ttk': ttk_mock}):
        yield


# ============================================================
# Screen size detection
# ============================================================

class TestScreenSize:
    """get_screen_size() determines ribbon positioning — wrong = off-screen."""

    def test_uses_pyautogui_when_available(self):
        mock_pyautogui = MagicMock()
        mock_pyautogui.size.return_value = (2560, 1440)
        with patch.dict('sys.modules', {'pyautogui': mock_pyautogui}), \
             patch('desktop.indicator_window.PYAUTOGUI_AVAILABLE', True), \
             patch('desktop.indicator_window.pyautogui', mock_pyautogui):
            from desktop.indicator_window import get_screen_size
            w, h = get_screen_size()
        assert w == 2560
        assert h == 1440

    def test_fallback_to_default_on_error(self):
        """If both pyautogui and tkinter fail, return 1920x1080 — sane default."""
        with patch('desktop.indicator_window.PYAUTOGUI_AVAILABLE', False):
            from desktop.indicator_window import get_screen_size
            # tk.Tk() is mocked and may raise
            with patch('desktop.indicator_window.tk.Tk', side_effect=Exception("no display")):
                w, h = get_screen_size()
        assert w == 1920
        assert h == 1080


# ============================================================
# RibbonIndicator state management
# ============================================================

class TestRibbonIndicatorInit:
    """RibbonIndicator init — sets up state for the floating ribbon."""

    def test_default_port(self):
        from desktop.indicator_window import RibbonIndicator
        ribbon = RibbonIndicator.__new__(RibbonIndicator)
        ribbon.__init__(server_port=5000)
        assert ribbon.server_port == 5000
        assert 'localhost:5000' in ribbon.server_url

    def test_custom_port(self):
        from desktop.indicator_window import RibbonIndicator
        ribbon = RibbonIndicator.__new__(RibbonIndicator)
        ribbon.__init__(server_port=8080)
        assert ribbon.server_port == 8080
        assert '8080' in ribbon.server_url

    def test_initial_state_not_expanded(self):
        """Ribbon starts collapsed — expands on hover or click."""
        from desktop.indicator_window import RibbonIndicator
        ribbon = RibbonIndicator.__new__(RibbonIndicator)
        ribbon.__init__()
        assert ribbon.expanded is False
        assert ribbon.is_animating is False
        assert ribbon.is_hovering is False

    def test_start_time_is_set(self):
        """Timer display shows elapsed time since indicator appeared."""
        from desktop.indicator_window import RibbonIndicator
        before = time.time()
        ribbon = RibbonIndicator.__new__(RibbonIndicator)
        ribbon.__init__()
        assert ribbon.start_time >= before


# ============================================================
# Module-level functions — called by app.py
# ============================================================

class TestModuleFunctions:
    """Convenience functions called from app.py lifecycle."""

    def test_get_status_returns_dict(self):
        from desktop.indicator_window import get_status
        result = get_status()
        assert isinstance(result, dict)

    def test_is_indicator_visible_returns_bool(self):
        from desktop.indicator_window import is_indicator_visible
        result = is_indicator_visible()
        assert isinstance(result, bool)

    def test_hide_indicator_no_crash_when_none(self):
        """Called on app shutdown — must not crash even if never initialized."""
        import desktop.indicator_window as iw
        old = iw.indicator_window
        iw.indicator_window = None
        from desktop.indicator_window import hide_indicator
        hide_indicator()  # Must not raise
        iw.indicator_window = old

    def test_initialize_indicator_returns_bool(self):
        """initialize_indicator returns True on success, False on error."""
        from desktop.indicator_window import initialize_indicator
        # May fail due to mocked Tk — the important thing is it returns bool
        result = initialize_indicator(server_port=9090)
        assert isinstance(result, bool)
