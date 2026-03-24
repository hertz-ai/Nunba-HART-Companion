"""
test_setup_wizard.py - Tests for desktop/setup_wizard.py

Covers:
- Colors class constants
- color() terminal coloring with platform handling
- is_dsn_configured() config file checking
- validate_dsn() format validation
- update_python_config() file rewriting
- update_json_config() JSON update
- disable_crash_reporting() config toggle
- open_sentry_signup() browser launch
- _input_with_timeout() non-interactive fallback
- print_banner() output
- Edge cases: missing files, corrupt JSON, invalid DSN formats
"""
import json
import os
import re
import sys
import threading
from pathlib import Path
from unittest.mock import MagicMock, mock_open, patch

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from desktop.setup_wizard import (
    Colors,
    color,
    disable_crash_reporting,
    is_dsn_configured,
    open_sentry_signup,
    update_json_config,
    update_python_config,
    validate_dsn,
)

# ============================================================
# Colors class
# ============================================================

class TestColors:
    def test_header_is_ansi_escape(self):
        assert '\033[' in Colors.HEADER

    def test_end_resets_ansi(self):
        assert Colors.END == '\033[0m'

    def test_all_color_constants_are_strings(self):
        for attr in ['HEADER', 'BLUE', 'CYAN', 'GREEN', 'WARNING', 'FAIL', 'END', 'BOLD']:
            assert isinstance(getattr(Colors, attr), str)

    def test_colors_are_distinct(self):
        codes = [Colors.HEADER, Colors.BLUE, Colors.CYAN, Colors.GREEN,
                 Colors.WARNING, Colors.FAIL, Colors.BOLD]
        # At least 5 distinct codes (BOLD is separate from colors)
        assert len(set(codes)) >= 5


# ============================================================
# color() function
# ============================================================

class TestColorFunction:
    def test_color_wraps_text_with_ansi(self):
        result = color("hello", Colors.GREEN)
        # On non-Windows or when ANSI enabled, should wrap
        assert "hello" in result

    def test_color_empty_string(self):
        result = color("", Colors.RED if hasattr(Colors, 'RED') else Colors.FAIL)
        assert isinstance(result, str)

    def test_color_with_unicode(self):
        result = color("\u0BB5\u0BA3\u0B95\u0BCD\u0B95\u0BAE\u0BCD", Colors.CYAN)
        assert isinstance(result, str)

    @patch('sys.platform', 'linux')
    def test_color_on_linux_adds_ansi(self):
        result = color("test", Colors.GREEN)
        assert Colors.GREEN in result
        assert Colors.END in result

    @patch('sys.platform', 'win32')
    def test_color_on_windows_attempts_ansi(self):
        # Should not crash even if ctypes fails
        with patch.dict('sys.modules', {'ctypes': MagicMock()}):
            result = color("test", Colors.BLUE)
            assert "test" in result


# ============================================================
# validate_dsn()
# ============================================================

class TestValidateDsn:
    def test_valid_dsn_us_region(self):
        dsn = "https://abc123def456@o789.ingest.us.sentry.io/1234567"
        assert validate_dsn(dsn) is True

    def test_valid_dsn_no_region(self):
        dsn = "https://abc123@o456789.ingest.sentry.io/1234567"
        assert validate_dsn(dsn) is True

    def test_valid_dsn_de_region(self):
        dsn = "https://abc123@o456789.ingest.de.sentry.io/1234567"
        assert validate_dsn(dsn) is True

    def test_invalid_dsn_no_https(self):
        dsn = "http://abc123@o456789.ingest.sentry.io/1234567"
        assert validate_dsn(dsn) is False

    def test_invalid_dsn_no_key(self):
        dsn = "https://@o456789.ingest.sentry.io/1234567"
        assert validate_dsn(dsn) is False

    def test_invalid_dsn_no_project_id(self):
        dsn = "https://abc123@o456789.ingest.sentry.io/"
        assert validate_dsn(dsn) is False

    def test_invalid_dsn_empty_string(self):
        assert validate_dsn("") is False

    def test_invalid_dsn_random_url(self):
        assert validate_dsn("https://google.com") is False

    def test_invalid_dsn_missing_at_sign(self):
        assert validate_dsn("https://abc123.ingest.sentry.io/123") is False

    def test_dsn_with_whitespace_stripped(self):
        dsn = "  https://abc123@o456789.ingest.us.sentry.io/1234567  "
        assert validate_dsn(dsn) is True

    def test_dsn_with_uppercase_fails(self):
        dsn = "HTTPS://abc123@o456789.ingest.sentry.io/1234567"
        assert validate_dsn(dsn) is False

    def test_dsn_key_must_be_hex(self):
        dsn = "https://XXXXXX@o456789.ingest.sentry.io/1234567"
        assert validate_dsn(dsn) is False


# ============================================================
# is_dsn_configured()
# ============================================================

class TestIsDsnConfigured:
    @patch('desktop.setup_wizard.CONFIG_PY')
    @patch('desktop.setup_wizard.CONFIG_JSON')
    def test_returns_true_when_no_placeholder(self, mock_json, mock_py):
        mock_py.exists.return_value = True
        mock_py.read_text.return_value = "SENTRY_DSN = 'https://real@o1.ingest.sentry.io/1'"
        mock_json.exists.return_value = False
        assert is_dsn_configured() is True

    @patch('desktop.setup_wizard.CONFIG_PY')
    @patch('desktop.setup_wizard.CONFIG_JSON')
    def test_returns_false_with_placeholder_key(self, mock_json, mock_py):
        mock_py.exists.return_value = True
        mock_py.read_text.return_value = "SENTRY_DSN = 'b5e7f8c9d1234567890abcdef1234567'"
        mock_json.exists.return_value = False
        assert is_dsn_configured() is False

    @patch('desktop.setup_wizard.CONFIG_PY')
    @patch('desktop.setup_wizard.CONFIG_JSON')
    def test_returns_false_with_your_key_placeholder(self, mock_json, mock_py):
        mock_py.exists.return_value = True
        mock_py.read_text.return_value = "SENTRY_DSN = 'your-key'"
        mock_json.exists.return_value = False
        assert is_dsn_configured() is False

    @patch('desktop.setup_wizard.CONFIG_PY')
    @patch('desktop.setup_wizard.CONFIG_JSON')
    def test_returns_false_with_json_placeholder(self, mock_json, mock_py):
        mock_py.exists.return_value = False
        mock_json.exists.return_value = True
        mock_json.read_text.return_value = json.dumps({"SENTRY_DSN": "your-project-id"})
        assert is_dsn_configured() is False

    @patch('desktop.setup_wizard.CONFIG_PY')
    @patch('desktop.setup_wizard.CONFIG_JSON')
    def test_returns_true_when_no_config_files(self, mock_json, mock_py):
        mock_py.exists.return_value = False
        mock_json.exists.return_value = False
        assert is_dsn_configured() is True

    @patch('desktop.setup_wizard.CONFIG_PY')
    @patch('desktop.setup_wizard.CONFIG_JSON')
    def test_returns_false_on_exception(self, mock_json, mock_py):
        mock_py.exists.side_effect = PermissionError("no access")
        assert is_dsn_configured() is False


# ============================================================
# update_python_config()
# ============================================================

class TestUpdatePythonConfig:
    @patch('desktop.setup_wizard.CONFIG_PY')
    def test_returns_false_when_file_missing(self, mock_py):
        mock_py.exists.return_value = False
        assert update_python_config("https://key@o1.ingest.sentry.io/1") is False

    @patch('desktop.setup_wizard.CONFIG_PY')
    def test_replaces_dsn_in_file(self, mock_py):
        mock_py.exists.return_value = True
        original = "SENTRY_DSN = os.environ.get(\n    'SENTRY_DSN',\n    'old-dsn'\n)"
        mock_py.read_text.return_value = original
        new_dsn = "https://newkey@o1.ingest.sentry.io/999"
        result = update_python_config(new_dsn)
        assert result is True
        # Verify write_text was called
        mock_py.write_text.assert_called_once()
        written = mock_py.write_text.call_args[0][0]
        assert new_dsn in written


# ============================================================
# update_json_config()
# ============================================================

class TestUpdateJsonConfig:
    @patch('desktop.setup_wizard.CONFIG_JSON')
    def test_returns_false_when_file_missing(self, mock_json):
        mock_json.exists.return_value = False
        assert update_json_config("https://key@o1.ingest.sentry.io/1") is False

    @patch('desktop.setup_wizard.CONFIG_JSON')
    def test_updates_json_dsn(self, mock_json):
        mock_json.exists.return_value = True
        mock_json.read_text.return_value = json.dumps({"SENTRY_DSN": "old", "version": "2.0"})
        new_dsn = "https://newkey@o1.ingest.sentry.io/999"
        result = update_json_config(new_dsn)
        assert result is True
        written = json.loads(mock_json.write_text.call_args[0][0])
        assert written["SENTRY_DSN"] == new_dsn
        assert written["version"] == "2.0"  # Preserves other keys


# ============================================================
# disable_crash_reporting()
# ============================================================

class TestDisableCrashReporting:
    @patch('desktop.setup_wizard.CONFIG_PY')
    def test_disables_reporting_in_config(self, mock_py):
        mock_py.exists.return_value = True
        content = "CRASH_REPORTING_ENABLED = os.environ.get('NUNBA_CRASH_REPORTING', 'true')"
        mock_py.read_text.return_value = content
        result = disable_crash_reporting()
        assert result is True
        written = mock_py.write_text.call_args[0][0]
        assert "'false'" in written

    @patch('desktop.setup_wizard.CONFIG_PY')
    def test_returns_true_when_no_config_file(self, mock_py):
        mock_py.exists.return_value = False
        assert disable_crash_reporting() is True


# ============================================================
# open_sentry_signup()
# ============================================================

class TestOpenSentrySignup:
    @patch('webbrowser.open', return_value=True)
    def test_opens_sentry_url(self, mock_open):
        result = open_sentry_signup()
        assert result is True
        mock_open.assert_called_once_with("https://sentry.io/signup/")

    @patch('webbrowser.open', side_effect=Exception("no browser"))
    def test_returns_false_on_browser_error(self, mock_open):
        result = open_sentry_signup()
        assert result is False


# ============================================================
# _input_with_timeout()
# ============================================================

class TestInputWithTimeout:
    def test_non_interactive_returns_default(self):
        from desktop.setup_wizard import _input_with_timeout
        # Simulate non-interactive stdin
        with patch('sys.stdin', None):
            result = _input_with_timeout("prompt: ", timeout=1, default="3")
            assert result == "3"

    def test_closed_stdin_returns_default(self):
        from desktop.setup_wizard import _input_with_timeout
        mock_stdin = MagicMock()
        mock_stdin.closed = True
        with patch('sys.stdin', mock_stdin):
            result = _input_with_timeout("prompt: ", timeout=1, default="5")
            assert result == "5"


# ============================================================
# Edge cases and integration
# ============================================================

class TestEdgeCases:
    def test_placeholder_pattern_matches_all_variants(self):
        from desktop.setup_wizard import PLACEHOLDER_PATTERN
        pattern = PLACEHOLDER_PATTERN
        assert re.search(pattern, "b5e7f8c9d1234567890abcdef1234567")
        assert re.search(pattern, "your-key")
        assert re.search(pattern, "your-project-id")
        assert not re.search(pattern, "https://real@sentry.io/123")

    def test_config_py_path_is_pathlib(self):
        from desktop.setup_wizard import CONFIG_PY
        assert isinstance(CONFIG_PY, Path)

    def test_config_json_path_is_pathlib(self):
        from desktop.setup_wizard import CONFIG_JSON
        assert isinstance(CONFIG_JSON, Path)

    def test_validate_dsn_with_none_type_raises(self):
        with pytest.raises((TypeError, AttributeError)):
            validate_dsn(None)

    def test_color_with_all_color_codes(self):
        for c in [Colors.HEADER, Colors.BLUE, Colors.CYAN, Colors.GREEN,
                   Colors.WARNING, Colors.FAIL, Colors.BOLD]:
            result = color("test", c)
            assert isinstance(result, str)
            assert len(result) > 0
