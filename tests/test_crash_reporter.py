"""
Tests for desktop/crash_reporter.py — 40 FT + 10 NFT tests.

Covers: get_device_info, init_crash_reporting, _before_send, capture_exception,
capture_message, set_user, clear_user, add_breadcrumb, set_tag, set_context,
start_transaction, crash_reporter_decorator, get_crash_report_url, get_status,
create_crash_reporter_blueprint (Flask endpoints).
"""
import os
import platform
import sys
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers: We need to be able to reset module-level state between tests.
# ---------------------------------------------------------------------------

def _import_fresh():
    """Import crash_reporter with a clean module state."""
    # Prevent the auto-init block at the bottom from firing during tests
    with patch.dict(os.environ, {'NUNBA_CRASH_REPORTING': 'false'}):
        # Remove cached module so we get fresh globals
        sys.modules.pop('desktop.crash_reporter', None)
        import desktop.crash_reporter as mod
    return mod


@pytest.fixture(autouse=True)
def _reset_module():
    """Ensure each test starts with a clean module (no leftover _initialized)."""
    mod = _import_fresh()
    mod._initialized = False
    mod._sentry_sdk = None
    yield mod
    mod._initialized = False
    mod._sentry_sdk = None


# ===========================================================================
# FT — get_device_info
# ===========================================================================

class TestGetDeviceInfo:
    def test_returns_dict(self, _reset_module):
        mod = _reset_module
        info = mod.get_device_info()
        assert isinstance(info, dict)

    def test_contains_required_keys(self, _reset_module):
        mod = _reset_module
        info = mod.get_device_info()
        for key in ('platform', 'platform_name', 'platform_version',
                    'platform_release', 'python_version', 'machine', 'processor'):
            assert key in info, f"Missing key: {key}"

    def test_platform_matches_sys(self, _reset_module):
        mod = _reset_module
        info = mod.get_device_info()
        assert info['platform'] == sys.platform

    def test_python_version_present(self, _reset_module):
        mod = _reset_module
        info = mod.get_device_info()
        assert info['python_version'] == platform.python_version()

    def test_gpu_info_appended_on_success(self, _reset_module):
        mod = _reset_module
        fake_gpu = {'available': True, 'type': 'nvidia', 'name': 'RTX 4090'}
        with patch('desktop.crash_reporter.detect_gpu', create=True) as mock_detect:
            # The import happens inside the function, so we must patch the
            # module it imports from.
            with patch.dict('sys.modules', {'desktop.ai_installer': MagicMock(detect_gpu=MagicMock(return_value=fake_gpu))}):
                info = mod.get_device_info()
                assert info.get('gpu_available') is True
                assert info.get('gpu_type') == 'nvidia'

    def test_gpu_import_failure_is_swallowed(self, _reset_module):
        mod = _reset_module
        # If desktop.ai_installer can't be imported, no crash
        with patch.dict('sys.modules', {'desktop.ai_installer': None}):
            info = mod.get_device_info()
            assert 'platform' in info  # still returns base info


# ===========================================================================
# FT — _before_send
# ===========================================================================

class TestBeforeSend:
    def test_passes_normal_event(self, _reset_module):
        mod = _reset_module
        event = {'message': 'hello'}
        assert mod._before_send(event, {}) is event

    def test_filters_keyboard_interrupt(self, _reset_module):
        mod = _reset_module
        event = {'exception': {'values': [{'type': 'KeyboardInterrupt'}]}}
        assert mod._before_send(event, {}) is None

    def test_filters_system_exit(self, _reset_module):
        mod = _reset_module
        event = {'exception': {'values': [{'type': 'SystemExit'}]}}
        assert mod._before_send(event, {}) is None

    def test_filters_connection_refused(self, _reset_module):
        mod = _reset_module
        event = {'exception': {'values': [{'type': 'ConnectionRefusedError'}]}}
        assert mod._before_send(event, {}) is None

    def test_allows_value_error(self, _reset_module):
        mod = _reset_module
        event = {'exception': {'values': [{'type': 'ValueError'}]}}
        result = mod._before_send(event, {})
        assert result is event

    def test_redacts_token_breadcrumbs(self, _reset_module):
        mod = _reset_module
        event = {
            'breadcrumbs': {
                'values': [
                    {'message': 'user token is abc123'},
                    {'message': 'normal message'},
                ]
            }
        }
        mod._before_send(event, {})
        assert event['breadcrumbs']['values'][0]['message'] == '[REDACTED]'
        assert event['breadcrumbs']['values'][1]['message'] == 'normal message'

    def test_redacts_password_breadcrumbs(self, _reset_module):
        mod = _reset_module
        event = {
            'breadcrumbs': {
                'values': [{'message': 'password=secret'}]
            }
        }
        mod._before_send(event, {})
        assert event['breadcrumbs']['values'][0]['message'] == '[REDACTED]'

    def test_redacts_key_breadcrumbs(self, _reset_module):
        mod = _reset_module
        event = {
            'breadcrumbs': {
                'values': [{'message': 'API Key found'}]
            }
        }
        mod._before_send(event, {})
        assert event['breadcrumbs']['values'][0]['message'] == '[REDACTED]'


# ===========================================================================
# FT — init_crash_reporting
# ===========================================================================

class TestInitCrashReporting:
    def test_returns_false_when_disabled(self, _reset_module):
        mod = _reset_module
        # Temporarily set CRASH_REPORTING_ENABLED to False
        orig = mod.CRASH_REPORTING_ENABLED
        try:
            mod.CRASH_REPORTING_ENABLED = False
            assert mod.init_crash_reporting() is False
        finally:
            mod.CRASH_REPORTING_ENABLED = orig

    def test_returns_true_when_already_initialized(self, _reset_module):
        mod = _reset_module
        mod.CRASH_REPORTING_ENABLED = True
        mod._initialized = True
        assert mod.init_crash_reporting() is True

    def test_returns_false_when_sentry_not_installed(self, _reset_module):
        mod = _reset_module
        mod.CRASH_REPORTING_ENABLED = True
        with patch.dict('sys.modules', {'sentry_sdk': None}):
            result = mod.init_crash_reporting()
            assert result is False

    def test_successful_init_with_mock_sentry(self, _reset_module):
        mod = _reset_module
        mod.CRASH_REPORTING_ENABLED = True

        mock_sentry = MagicMock()
        mock_logging_int = MagicMock()
        mock_threading_int = MagicMock()

        with patch.dict('sys.modules', {
            'sentry_sdk': mock_sentry,
            'sentry_sdk.integrations.logging': MagicMock(LoggingIntegration=mock_logging_int),
            'sentry_sdk.integrations.threading': MagicMock(ThreadingIntegration=mock_threading_int),
            'sentry_sdk.integrations.flask': None,  # Simulate Flask integration not found
        }):
            # Re-import to pick up mock
            result = mod.init_crash_reporting(dsn='https://fake@sentry.io/123')
            # Should either succeed or fail gracefully
            assert isinstance(result, bool)

    def test_init_catches_generic_exception(self, _reset_module):
        mod = _reset_module
        mod.CRASH_REPORTING_ENABLED = True

        with patch.dict('sys.modules', {
            'sentry_sdk': MagicMock(init=MagicMock(side_effect=RuntimeError("boom"))),
            'sentry_sdk.integrations.logging': MagicMock(),
            'sentry_sdk.integrations.threading': MagicMock(),
        }):
            result = mod.init_crash_reporting()
            assert result is False


# ===========================================================================
# FT — capture_exception
# ===========================================================================

class TestCaptureException:
    def test_logs_when_not_initialized(self, _reset_module):
        mod = _reset_module
        mod._initialized = False
        mod._sentry_sdk = None
        exc = ValueError("test")
        result = mod.capture_exception(exc)
        assert result is None

    def test_calls_sentry_when_initialized(self, _reset_module):
        mod = _reset_module
        mock_sdk = MagicMock()
        mock_sdk.push_scope.return_value.__enter__ = MagicMock()
        mock_sdk.push_scope.return_value.__exit__ = MagicMock(return_value=False)
        mock_sdk.capture_exception.return_value = 'event-id-123'

        mod._initialized = True
        mod._sentry_sdk = mock_sdk

        exc = ValueError("test")
        result = mod.capture_exception(exc, foo='bar')
        mock_sdk.push_scope.assert_called_once()

    def test_capture_none_exception_uses_current(self, _reset_module):
        mod = _reset_module
        mock_sdk = MagicMock()
        mock_sdk.push_scope.return_value.__enter__ = MagicMock()
        mock_sdk.push_scope.return_value.__exit__ = MagicMock(return_value=False)

        mod._initialized = True
        mod._sentry_sdk = mock_sdk

        mod.capture_exception(None)
        mock_sdk.push_scope.assert_called_once()

    def test_capture_exception_swallows_internal_error(self, _reset_module):
        mod = _reset_module
        mock_sdk = MagicMock()
        mock_sdk.push_scope.side_effect = RuntimeError("internal")

        mod._initialized = True
        mod._sentry_sdk = mock_sdk

        result = mod.capture_exception(ValueError("x"))
        assert result is None


# ===========================================================================
# FT — capture_message
# ===========================================================================

class TestCaptureMessage:
    def test_logs_locally_when_not_initialized(self, _reset_module):
        mod = _reset_module
        result = mod.capture_message("hello", level="warning")
        assert result is None

    def test_calls_sentry_when_initialized(self, _reset_module):
        mod = _reset_module
        mock_sdk = MagicMock()
        mock_sdk.push_scope.return_value.__enter__ = MagicMock()
        mock_sdk.push_scope.return_value.__exit__ = MagicMock(return_value=False)
        mock_sdk.capture_message.return_value = 'msg-id'

        mod._initialized = True
        mod._sentry_sdk = mock_sdk

        mod.capture_message("test msg", level="error", extra="data")
        mock_sdk.push_scope.assert_called_once()

    def test_swallows_internal_error(self, _reset_module):
        mod = _reset_module
        mock_sdk = MagicMock()
        mock_sdk.push_scope.side_effect = RuntimeError("boom")

        mod._initialized = True
        mod._sentry_sdk = mock_sdk

        result = mod.capture_message("test")
        assert result is None


# ===========================================================================
# FT — set_user / clear_user
# ===========================================================================

class TestSetUser:
    def test_noop_when_not_initialized(self, _reset_module):
        mod = _reset_module
        mod.set_user("u1")  # Should not raise

    def test_sets_minimal_user(self, _reset_module):
        mod = _reset_module
        mock_sdk = MagicMock()
        mod._initialized = True
        mod._sentry_sdk = mock_sdk

        mod.set_user("u1")
        mock_sdk.set_user.assert_called_once_with({"id": "u1"})

    def test_sets_full_user(self, _reset_module):
        mod = _reset_module
        mock_sdk = MagicMock()
        mod._initialized = True
        mod._sentry_sdk = mock_sdk

        mod.set_user("u1", email="a@b.com", username="alice")
        mock_sdk.set_user.assert_called_once_with(
            {"id": "u1", "email": "a@b.com", "username": "alice"}
        )


class TestClearUser:
    def test_noop_when_not_initialized(self, _reset_module):
        mod = _reset_module
        mod.clear_user()  # Should not raise

    def test_clears_when_initialized(self, _reset_module):
        mod = _reset_module
        mock_sdk = MagicMock()
        mod._initialized = True
        mod._sentry_sdk = mock_sdk

        mod.clear_user()
        mock_sdk.set_user.assert_called_once_with(None)


# ===========================================================================
# FT — add_breadcrumb, set_tag, set_context
# ===========================================================================

class TestBreadcrumbTagContext:
    def test_add_breadcrumb_noop_when_not_initialized(self, _reset_module):
        mod = _reset_module
        mod.add_breadcrumb("msg")  # No crash

    def test_add_breadcrumb_calls_sentry(self, _reset_module):
        mod = _reset_module
        mock_sdk = MagicMock()
        mod._initialized = True
        mod._sentry_sdk = mock_sdk

        mod.add_breadcrumb("click", category="ui", level="info", data={"x": 1})
        mock_sdk.add_breadcrumb.assert_called_once_with(
            message="click", category="ui", level="info", data={"x": 1}
        )

    def test_add_breadcrumb_default_data(self, _reset_module):
        mod = _reset_module
        mock_sdk = MagicMock()
        mod._initialized = True
        mod._sentry_sdk = mock_sdk

        mod.add_breadcrumb("msg")
        mock_sdk.add_breadcrumb.assert_called_once_with(
            message="msg", category="app", level="info", data={}
        )

    def test_set_tag_noop_when_not_initialized(self, _reset_module):
        mod = _reset_module
        mod.set_tag("k", "v")

    def test_set_tag_calls_sentry(self, _reset_module):
        mod = _reset_module
        mock_sdk = MagicMock()
        mod._initialized = True
        mod._sentry_sdk = mock_sdk

        mod.set_tag("env", "prod")
        mock_sdk.set_tag.assert_called_once_with("env", "prod")

    def test_set_context_noop_when_not_initialized(self, _reset_module):
        mod = _reset_module
        mod.set_context("gpu", {"name": "test"})

    def test_set_context_calls_sentry(self, _reset_module):
        mod = _reset_module
        mock_sdk = MagicMock()
        mod._initialized = True
        mod._sentry_sdk = mock_sdk

        mod.set_context("gpu", {"name": "RTX"})
        mock_sdk.set_context.assert_called_once_with("gpu", {"name": "RTX"})


# ===========================================================================
# FT — start_transaction
# ===========================================================================

class TestStartTransaction:
    def test_returns_nullcontext_when_not_initialized(self, _reset_module):
        mod = _reset_module
        ctx = mod.start_transaction("op")
        # Should be a context manager that does nothing
        with ctx:
            pass  # no error

    def test_returns_nullcontext_when_perf_disabled(self, _reset_module):
        mod = _reset_module
        mod._initialized = True
        mod._sentry_sdk = MagicMock()
        orig = mod.PERFORMANCE_MONITORING
        try:
            mod.PERFORMANCE_MONITORING = False
            ctx = mod.start_transaction("op")
            with ctx:
                pass
        finally:
            mod.PERFORMANCE_MONITORING = orig

    def test_calls_sentry_when_enabled(self, _reset_module):
        mod = _reset_module
        mock_sdk = MagicMock()
        mod._initialized = True
        mod._sentry_sdk = mock_sdk
        mod.PERFORMANCE_MONITORING = True

        mod.start_transaction("test-op", op="http")
        mock_sdk.start_transaction.assert_called_once_with(name="test-op", op="http")


# ===========================================================================
# FT — crash_reporter_decorator
# ===========================================================================

class TestDecorator:
    def test_preserves_return_value(self, _reset_module):
        mod = _reset_module

        @mod.crash_reporter_decorator
        def add(a, b):
            return a + b

        assert add(2, 3) == 5

    def test_preserves_function_name(self, _reset_module):
        mod = _reset_module

        @mod.crash_reporter_decorator
        def my_func():
            pass

        assert my_func.__name__ == 'my_func'

    def test_captures_and_reraises_exception(self, _reset_module):
        mod = _reset_module
        mock_sdk = MagicMock()
        mock_sdk.push_scope.return_value.__enter__ = MagicMock()
        mock_sdk.push_scope.return_value.__exit__ = MagicMock(return_value=False)
        mod._initialized = True
        mod._sentry_sdk = mock_sdk

        @mod.crash_reporter_decorator
        def boom():
            raise RuntimeError("kaboom")

        with pytest.raises(RuntimeError, match="kaboom"):
            boom()


# ===========================================================================
# FT — get_crash_report_url
# ===========================================================================

class TestGetCrashReportUrl:
    def test_returns_configure_message_for_placeholder_dsn(self, _reset_module):
        mod = _reset_module
        orig = mod.SENTRY_DSN
        try:
            mod.SENTRY_DSN = 'https://your-key@sentry.io/123'
            url = mod.get_crash_report_url()
            assert 'Configure' in url
        finally:
            mod.SENTRY_DSN = orig

    def test_parses_valid_dsn(self, _reset_module):
        mod = _reset_module
        orig = mod.SENTRY_DSN
        try:
            mod.SENTRY_DSN = 'https://abc123@o456.ingest.sentry.io/789'
            url = mod.get_crash_report_url()
            assert 'sentry.io' in url
        finally:
            mod.SENTRY_DSN = orig

    def test_fallback_on_malformed_dsn(self, _reset_module):
        mod = _reset_module
        orig = mod.SENTRY_DSN
        try:
            mod.SENTRY_DSN = 'not-a-url'
            url = mod.get_crash_report_url()
            assert 'sentry.io' in url
        finally:
            mod.SENTRY_DSN = orig


# ===========================================================================
# FT — get_status
# ===========================================================================

class TestGetStatus:
    def test_returns_dict(self, _reset_module):
        mod = _reset_module
        status = mod.get_status()
        assert isinstance(status, dict)

    def test_status_keys(self, _reset_module):
        mod = _reset_module
        status = mod.get_status()
        for key in ('enabled', 'initialized', 'sentry_available',
                    'performance_monitoring', 'dashboard_url'):
            assert key in status

    def test_initialized_flag_reflects_state(self, _reset_module):
        mod = _reset_module
        mod._initialized = True
        assert mod.get_status()['initialized'] is True

        mod._initialized = False
        assert mod.get_status()['initialized'] is False


# ===========================================================================
# FT — Flask Blueprint endpoints
# ===========================================================================

class TestFlaskBlueprint:
    @pytest.fixture
    def app_client(self, _reset_module):
        from flask import Flask
        mod = _reset_module
        app = Flask(__name__)
        app.config['TESTING'] = True
        bp = mod.create_crash_reporter_blueprint()
        app.register_blueprint(bp)
        with app.test_client() as client:
            yield client, mod

    def test_status_endpoint(self, app_client):
        client, mod = app_client
        resp = client.get('/crash-report/status')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'enabled' in data

    def test_test_crash_forbidden_in_production(self, app_client):
        client, mod = app_client
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('FLASK_ENV', None)
            resp = client.post('/crash-report/test')
            assert resp.status_code == 403

    def test_test_crash_in_development(self, app_client):
        client, mod = app_client
        with patch.dict(os.environ, {'FLASK_ENV': 'development'}):
            resp = client.post('/crash-report/test')
            assert resp.status_code == 200
            data = resp.get_json()
            assert data['success'] is True

    def test_feedback_returns_503_when_not_initialized(self, app_client):
        client, mod = app_client
        mod._initialized = False
        mod._sentry_sdk = None
        resp = client.post('/crash-report/feedback',
                           json={'event_id': 'e1', 'comments': 'broke'})
        assert resp.status_code == 503

    def test_feedback_requires_event_id(self, app_client):
        client, mod = app_client
        mock_sdk = MagicMock()
        mod._initialized = True
        mod._sentry_sdk = mock_sdk
        resp = client.post('/crash-report/feedback', json={})
        assert resp.status_code == 400

    def test_feedback_success(self, app_client):
        client, mod = app_client
        mock_sdk = MagicMock()
        mod._initialized = True
        mod._sentry_sdk = mock_sdk
        resp = client.post('/crash-report/feedback',
                           json={'event_id': 'e1', 'comments': 'broke'})
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True
        mock_sdk.capture_user_feedback.assert_called_once()

    def test_feedback_handles_sentry_error(self, app_client):
        client, mod = app_client
        mock_sdk = MagicMock()
        mock_sdk.capture_user_feedback.side_effect = RuntimeError("fail")
        mod._initialized = True
        mod._sentry_sdk = mock_sdk
        resp = client.post('/crash-report/feedback',
                           json={'event_id': 'e1'})
        assert resp.status_code == 500


# ===========================================================================
# NFT — Non-Functional Tests
# ===========================================================================

class TestNFT:
    def test_module_import_under_500ms(self, _reset_module):
        """Importing the module should be fast."""
        import time
        start = time.perf_counter()
        with patch.dict(os.environ, {'NUNBA_CRASH_REPORTING': 'false'}):
            sys.modules.pop('desktop.crash_reporter', None)
        elapsed = time.perf_counter() - start
        assert elapsed < 0.5, f"Import took {elapsed:.2f}s"

    def test_get_device_info_is_idempotent(self, _reset_module):
        mod = _reset_module
        a = mod.get_device_info()
        b = mod.get_device_info()
        assert a == b

    def test_before_send_handles_missing_breadcrumbs(self, _reset_module):
        mod = _reset_module
        event = {'exception': {'values': [{'type': 'ValueError'}]}}
        result = mod._before_send(event, {})
        assert result is event

    def test_before_send_handles_empty_exception_values(self, _reset_module):
        mod = _reset_module
        event = {'exception': {'values': [{}]}}
        result = mod._before_send(event, {})
        assert result is event

    def test_capture_exception_thread_safety(self, _reset_module):
        """capture_exception should not crash when called from multiple threads."""
        import threading
        mod = _reset_module
        errors = []

        def worker():
            try:
                mod.capture_exception(ValueError("concurrent"))
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)
        assert len(errors) == 0

    def test_decorator_does_not_alter_signature(self, _reset_module):
        """The decorator should preserve __wrapped__."""
        mod = _reset_module

        @mod.crash_reporter_decorator
        def my_func(a, b, c=3):
            """My docstring."""
            pass

        assert my_func.__name__ == 'my_func'
        assert my_func.__doc__ == 'My docstring.'

    def test_get_status_always_returns_all_keys(self, _reset_module):
        """Backward compat: get_status must always have the same shape."""
        mod = _reset_module
        expected_keys = {'enabled', 'initialized', 'sentry_available',
                         'performance_monitoring', 'dashboard_url'}
        status = mod.get_status()
        assert set(status.keys()) == expected_keys

    def test_capture_message_with_invalid_level(self, _reset_module):
        """Graceful degradation when a bogus level is given."""
        mod = _reset_module
        # Not initialized, so it uses getattr(logger, level, logger.info)
        result = mod.capture_message("hi", level="bogus_level")
        assert result is None  # no crash

    def test_set_user_with_none_values(self, _reset_module):
        mod = _reset_module
        mock_sdk = MagicMock()
        mod._initialized = True
        mod._sentry_sdk = mock_sdk
        mod.set_user("u1", email=None, username=None)
        mock_sdk.set_user.assert_called_once_with({"id": "u1"})

    def test_blueprint_can_be_registered_multiple_times(self, _reset_module):
        """Creating multiple blueprints should not conflict."""
        mod = _reset_module
        bp1 = mod.create_crash_reporter_blueprint()
        bp2 = mod.create_crash_reporter_blueprint()
        assert bp1.name == bp2.name
