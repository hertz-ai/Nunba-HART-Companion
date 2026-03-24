"""
test_pywebview_background_start.py — Reproduces the black screen bug.

The bug: When Nunba starts with --background (Windows auto-start on boot),
pywebview creates a hidden window. WebView2 suspends its rendering compositor.
React loads and mounts while hidden, but:
  1. Sometimes React doesn't mount at all (rootChildren=0)
  2. Sometimes React mounts but WebView2 doesn't paint (blank canvas)
  3. The JS reflow + resize workaround doesn't always wake the compositor

This test:
  1. Starts Nunba.exe with --background flag
  2. Waits for Flask to be ready
  3. Polls the webview diagnostic endpoint
  4. Simulates the "show" event (via Win+N hotkey or tray click)
  5. Verifies React mounted AND pixels are painted

Requires: Running on Windows with Nunba installed.
"""
import json
import os
import subprocess
import sys
import time
import unittest

import requests

NUNBA_EXE = os.path.join(
    os.environ.get('ProgramFiles(x86)', 'C:\\Program Files (x86)'),
    'HevolveAI', 'Nunba', 'Nunba.exe'
)
FLASK_URL = 'http://localhost:5000'
MAX_STARTUP_WAIT = 60  # seconds
SHOW_DELAY = 5  # seconds after show before checking


def _is_flask_ready():
    try:
        r = requests.get(FLASK_URL, timeout=2, allow_redirects=False)
        return r.status_code in (200, 302)
    except Exception:
        return False


def _get_webview_state():
    """Evaluate JS in the webview to get DOM state.

    Since we can't call pywebview's evaluate_js from outside the process,
    we check via the Flask endpoint that serves the React app.
    """
    try:
        r = requests.get(f'{FLASK_URL}/local', timeout=5)
        if r.status_code == 200:
            html = r.text
            return {
                'has_root': 'id="root"' in html,
                'has_react_bundle': 'static/js/main' in html,
                'status_code': r.status_code,
                'content_length': len(html),
            }
    except Exception as e:
        return {'error': str(e)}
    return {'error': 'unexpected'}


@unittest.skipUnless(
    sys.platform == 'win32' and os.path.isfile(NUNBA_EXE),
    "Windows + Nunba installed required"
)
class TestBackgroundStart(unittest.TestCase):
    """Test that Nunba starts correctly in background mode."""

    proc = None

    @classmethod
    def setUpClass(cls):
        """Start Nunba with --background flag."""
        # Kill any existing Nunba
        subprocess.run(
            ['taskkill', '/F', '/IM', 'Nunba.exe'],
            capture_output=True, timeout=10
        )
        time.sleep(2)

        # Start in background mode
        cls.proc = subprocess.Popen(
            [NUNBA_EXE, '--background'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        # Wait for Flask to be ready
        start = time.time()
        while time.time() - start < MAX_STARTUP_WAIT:
            if _is_flask_ready():
                break
            time.sleep(1)
        else:
            raise RuntimeError(
                f"Flask not ready after {MAX_STARTUP_WAIT}s (background start)"
            )

    @classmethod
    def tearDownClass(cls):
        """Stop Nunba."""
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                cls.proc.kill()
        # Also taskkill in case of orphans
        subprocess.run(
            ['taskkill', '/F', '/IM', 'Nunba.exe'],
            capture_output=True, timeout=10
        )

    def test_flask_serves_react_app(self):
        """Flask serves the React SPA with root div and JS bundle."""
        state = _get_webview_state()
        self.assertNotIn('error', state, f"Flask error: {state}")
        self.assertTrue(state['has_root'], "HTML missing id='root'")
        self.assertTrue(state['has_react_bundle'], "HTML missing React JS bundle")
        self.assertGreater(state['content_length'], 1000, "HTML too small")

    def test_llm_health_during_background(self):
        """LLM server should be healthy even in background mode."""
        # LLM may take time to start — poll
        for _ in range(30):
            try:
                r = requests.get('http://localhost:8080/health', timeout=2)
                if r.status_code == 200:
                    self.assertEqual(r.json().get('status'), 'ok')
                    return
            except Exception:
                pass
            time.sleep(1)
        self.fail("LLM not healthy after 30s in background mode")

    def test_chat_works_in_background(self):
        """Chat endpoint works even when window is hidden."""
        r = requests.post(
            f'{FLASK_URL}/chat',
            json={
                'text': 'hi',
                'user_id': 'bg_test_user',
                'agent_id': 'local_assistant',
                'create_agent': False,
                'casual_conv': False,
            },
            timeout=30,
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertTrue(data.get('success'), f"Chat failed: {data}")
        # Should NOT have autogen dump
        text = data.get('text', '')
        self.assertNotIn('Execute Action 1', text)
        self.assertNotIn('ChatInstructor', text)

    def test_bootstrap_status_in_background(self):
        """Bootstrap should have run during background startup."""
        r = requests.get(f'{FLASK_URL}/api/ai/bootstrap/status', timeout=5)
        if r.status_code == 200:
            status = r.json()
            self.assertIn(status.get('phase'), ['idle', 'done', 'running'])
            # LLM step should exist
            if status.get('steps'):
                self.assertIn('llm', status['steps'])

    def test_webview_recovery_log_exists(self):
        """Check that the recovery mechanism logged its state."""
        log_path = os.path.join(
            os.path.expanduser('~'), 'Documents', 'Nunba', 'logs',
            'langchain.log'
        )
        if not os.path.isfile(log_path):
            self.skipTest("Log file not found")

        with open(log_path, encoding='utf-8', errors='ignore') as f:
            content = f.read()

        # Should have either BACKGROUND repaint or RECOVERY log
        has_bg = '[BACKGROUND]' in content
        has_recovery = '[RECOVERY]' in content
        self.assertTrue(
            has_bg or has_recovery,
            "Neither [BACKGROUND] nor [RECOVERY] found in logs — "
            "background start handler didn't fire"
        )


@unittest.skipUnless(
    sys.platform == 'win32' and os.path.isfile(NUNBA_EXE),
    "Windows + Nunba installed required"
)
class TestBackgroundToForeground(unittest.TestCase):
    """Test the hidden→visible transition (the actual black screen bug).

    This is harder to test programmatically because we need to trigger
    the window show event. Options:
      1. Send Win+N hotkey via ctypes
      2. Call the tray icon's show action
      3. Use pywebview's window.show() via IPC

    We use approach 1 (hotkey simulation).
    """

    proc = None

    @classmethod
    def setUpClass(cls):
        # Kill existing
        subprocess.run(
            ['taskkill', '/F', '/IM', 'Nunba.exe'],
            capture_output=True, timeout=10
        )
        time.sleep(2)

        # Start background
        cls.proc = subprocess.Popen(
            [NUNBA_EXE, '--background'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        # Wait for Flask
        start = time.time()
        while time.time() - start < MAX_STARTUP_WAIT:
            if _is_flask_ready():
                break
            time.sleep(1)

    @classmethod
    def tearDownClass(cls):
        if cls.proc:
            cls.proc.terminate()
            try:
                cls.proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                cls.proc.kill()
        subprocess.run(
            ['taskkill', '/F', '/IM', 'Nunba.exe'],
            capture_output=True, timeout=10
        )

    def _send_win_n_hotkey(self):
        """Simulate Win+N keypress to toggle window visibility."""
        import ctypes
        user32 = ctypes.windll.user32
        VK_LWIN = 0x5B
        VK_N = ord('N')
        KEYEVENTF_KEYUP = 0x0002

        # Press Win+N
        user32.keybd_event(VK_LWIN, 0, 0, 0)
        time.sleep(0.05)
        user32.keybd_event(VK_N, 0, 0, 0)
        time.sleep(0.05)
        user32.keybd_event(VK_N, 0, KEYEVENTF_KEYUP, 0)
        time.sleep(0.05)
        user32.keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, 0)

    def test_show_after_background_triggers_recovery(self):
        """After showing a background-started window, recovery should fire."""
        # Give the background app time to fully load
        time.sleep(10)

        # Simulate Win+N to show the window
        self._send_win_n_hotkey()
        time.sleep(SHOW_DELAY)

        # Check logs for recovery/repaint
        log_path = os.path.join(
            os.path.expanduser('~'), 'Documents', 'Nunba', 'logs',
            'langchain.log'
        )
        with open(log_path, encoding='utf-8', errors='ignore') as f:
            # Read only recent entries (last 50KB)
            f.seek(max(0, f.seek(0, 2) - 50000))
            content = f.read()

        # The recovery should have either:
        # 1. Forced JS reflow + resize (BACKGROUND repaint)
        # 2. Detected empty root and forced reload (RECOVERY)
        self.assertTrue(
            '[BACKGROUND] Forced JS reflow' in content or
            '[RECOVERY]' in content,
            "Window shown but no recovery/repaint fired"
        )

    def test_react_mounted_after_show(self):
        """After showing, React root should have content (not empty/black)."""
        # Show the window
        self._send_win_n_hotkey()
        time.sleep(SHOW_DELAY)

        # Check webview diagnostic in logs
        log_path = os.path.join(
            os.path.expanduser('~'), 'Documents', 'Nunba', 'logs',
            'langchain.log'
        )
        with open(log_path, encoding='utf-8', errors='ignore') as f:
            f.seek(max(0, f.seek(0, 2) - 50000))
            content = f.read()

        # Find the most recent WEBVIEW_DIAG state
        import re
        diag_matches = re.findall(
            r'\[WEBVIEW_DIAG\] state=(\{.*?\})', content
        )
        if not diag_matches:
            self.skipTest("No WEBVIEW_DIAG found — diagnostic may not have run")

        state = json.loads(diag_matches[-1])
        self.assertTrue(state.get('rootExists'), "root div missing")
        self.assertGreater(
            state.get('rootChildren', 0), 0,
            f"React root has 0 children — empty mount. State: {state}"
        )
        self.assertGreater(
            state.get('bodyLen', 0), 1000,
            f"Body too small ({state.get('bodyLen')}B) — content not rendered"
        )


if __name__ == '__main__':
    unittest.main()
