"""
crash_reporter.py - Unified crash reporting for Nunba

Integrates with Sentry for automatic crash reporting and monitoring.
Captures exceptions, performance data, and user feedback.

Dashboard: https://sentry.io (view your project issues)
"""
import logging
import os
import platform
import sys
from functools import wraps
from typing import Any

logger = logging.getLogger('NunbaCrashReporter')

# Import from central config
try:
    from desktop.config import APP_NAME, APP_VERSION, CRASH_REPORTING_ENABLED, ENVIRONMENT, SENTRY_DSN
    from desktop.config import PERFORMANCE_MONITORING_ENABLED as PERFORMANCE_MONITORING
except ImportError:
    # Fallback if config not available
    SENTRY_DSN = os.environ.get(
        'SENTRY_DSN',
        'https://b5e7f8c9d1234567890abcdef1234567@o4508123456789.ingest.us.sentry.io/4508123456789'
    )
    APP_NAME = "Nunba"
    APP_VERSION = "2.0.0"
    ENVIRONMENT = "development"
    CRASH_REPORTING_ENABLED = os.environ.get('NUNBA_CRASH_REPORTING', 'true').lower() == 'true'
    PERFORMANCE_MONITORING = os.environ.get('NUNBA_PERFORMANCE', 'true').lower() == 'true'

# Sentry SDK reference
_sentry_sdk = None
_initialized = False


def get_device_info() -> dict[str, Any]:
    """Get device/system information for crash reports"""
    info = {
        'platform': sys.platform,
        'platform_name': platform.system(),
        'platform_version': platform.version(),
        'platform_release': platform.release(),
        'python_version': platform.python_version(),
        'machine': platform.machine(),
        'processor': platform.processor(),
    }

    # Add GPU info if available
    try:
        from desktop.ai_installer import detect_gpu
        gpu_info = detect_gpu()
        info['gpu_available'] = gpu_info.get('available', False)
        info['gpu_type'] = gpu_info.get('type', 'none')
        info['gpu_name'] = gpu_info.get('name', 'Unknown')
    except Exception:
        pass

    return info


def init_crash_reporting(
    dsn: str | None = None,
    environment: str = "production",
    release: str | None = None,
    user_id: str | None = None,
    enable_performance: bool = True
) -> bool:
    """
    Initialize Sentry crash reporting.

    Args:
        dsn: Sentry DSN (uses env var or default if not provided)
        environment: Environment name (production, development, staging)
        release: App version/release identifier
        user_id: Optional user identifier for tracking
        enable_performance: Enable performance monitoring

    Returns:
        True if initialization successful
    """
    global _sentry_sdk, _initialized

    if not CRASH_REPORTING_ENABLED:
        logger.info("Crash reporting disabled via environment variable")
        return False

    if _initialized:
        logger.debug("Crash reporting already initialized")
        return True

    dsn = dsn or SENTRY_DSN

    try:
        import sentry_sdk
        from sentry_sdk.integrations.logging import LoggingIntegration
        from sentry_sdk.integrations.threading import ThreadingIntegration

        _sentry_sdk = sentry_sdk

        # Configure logging integration
        logging_integration = LoggingIntegration(
            level=logging.INFO,        # Capture info and above as breadcrumbs
            event_level=logging.ERROR  # Send errors as events
        )

        integrations = [
            logging_integration,
            ThreadingIntegration(propagate_hub=True),
        ]

        # Try to add Flask integration if available
        try:
            from sentry_sdk.integrations.flask import FlaskIntegration
            integrations.append(FlaskIntegration())
        except ImportError:
            pass

        # Initialize Sentry
        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            release=release or f"{APP_NAME}@{APP_VERSION}",
            integrations=integrations,
            traces_sample_rate=0.1 if enable_performance and PERFORMANCE_MONITORING else 0,
            profiles_sample_rate=0.1 if enable_performance and PERFORMANCE_MONITORING else 0,
            send_default_pii=False,  # Don't send personally identifiable info
            attach_stacktrace=True,
            max_breadcrumbs=50,
            before_send=_before_send,
        )

        # Set device context
        device_info = get_device_info()
        sentry_sdk.set_context("device", device_info)

        # Set user if provided
        if user_id:
            sentry_sdk.set_user({"id": user_id})

        _initialized = True
        logger.info(f"Crash reporting initialized (env: {environment})")
        return True

    except ImportError:
        logger.warning(
            "sentry-sdk not installed. Run: pip install sentry-sdk[flask]"
        )
        return False
    except Exception as e:
        logger.error(f"Failed to initialize crash reporting: {e}")
        return False


def _before_send(event, hint):
    """
    Filter/modify events before sending to Sentry.
    Use this to scrub sensitive data or filter unwanted errors.
    """
    # Remove sensitive data from breadcrumbs
    if 'breadcrumbs' in event:
        for breadcrumb in event.get('breadcrumbs', {}).get('values', []):
            # Remove any API keys or tokens from messages
            if 'message' in breadcrumb:
                msg = breadcrumb['message']
                if 'token' in msg.lower() or 'key' in msg.lower() or 'password' in msg.lower():
                    breadcrumb['message'] = '[REDACTED]'

    # Filter out expected/handled errors
    if 'exception' in event:
        exc_type = event['exception']['values'][0].get('type', '')

        # Don't report these expected errors
        ignored_exceptions = [
            'KeyboardInterrupt',
            'SystemExit',
            'ConnectionRefusedError',  # Expected when services aren't running
        ]

        if exc_type in ignored_exceptions:
            return None

    return event


def capture_exception(exception: Exception = None, **extra_context):
    """
    Capture and report an exception to Sentry.

    Args:
        exception: The exception to report (uses current exception if None)
        **extra_context: Additional context to attach to the event
    """
    if not _initialized or not _sentry_sdk:
        # Log locally if Sentry not available
        if exception:
            logger.error(f"Exception: {exception}", exc_info=True)
        else:
            logger.error("Exception occurred", exc_info=True)
        return None

    try:
        with _sentry_sdk.push_scope() as scope:
            for key, value in extra_context.items():
                scope.set_extra(key, value)

            if exception:
                return _sentry_sdk.capture_exception(exception)
            else:
                return _sentry_sdk.capture_exception()
    except Exception as e:
        logger.error(f"Failed to capture exception: {e}")
        return None


def capture_message(message: str, level: str = "info", **extra_context):
    """
    Capture and report a message to Sentry.

    Args:
        message: The message to report
        level: Severity level (debug, info, warning, error, fatal)
        **extra_context: Additional context to attach
    """
    if not _initialized or not _sentry_sdk:
        log_fn = getattr(logger, level, logger.info)
        log_fn(message)
        return None

    try:
        with _sentry_sdk.push_scope() as scope:
            for key, value in extra_context.items():
                scope.set_extra(key, value)

            return _sentry_sdk.capture_message(message, level=level)
    except Exception as e:
        logger.error(f"Failed to capture message: {e}")
        return None


def set_user(user_id: str, email: str | None = None, username: str | None = None):
    """
    Set user context for crash reports.

    Args:
        user_id: Unique user identifier
        email: Optional user email
        username: Optional username
    """
    if not _initialized or not _sentry_sdk:
        return

    user_data = {"id": user_id}
    if email:
        user_data["email"] = email
    if username:
        user_data["username"] = username

    _sentry_sdk.set_user(user_data)


def clear_user():
    """Clear user context (e.g., on logout)"""
    if _initialized and _sentry_sdk:
        _sentry_sdk.set_user(None)


def add_breadcrumb(message: str, category: str = "app", level: str = "info", data: dict = None):
    """
    Add a breadcrumb for debugging context.

    Breadcrumbs are a trail of events leading up to a crash.

    Args:
        message: Description of the event
        category: Category (app, navigation, ui, http, etc.)
        level: Severity (debug, info, warning, error)
        data: Additional data dictionary
    """
    if not _initialized or not _sentry_sdk:
        return

    _sentry_sdk.add_breadcrumb(
        message=message,
        category=category,
        level=level,
        data=data or {}
    )


def set_tag(key: str, value: str):
    """Set a tag for filtering/searching in Sentry dashboard"""
    if _initialized and _sentry_sdk:
        _sentry_sdk.set_tag(key, value)


def set_context(name: str, data: dict[str, Any]):
    """Set additional context data for crash reports"""
    if _initialized and _sentry_sdk:
        _sentry_sdk.set_context(name, data)


def start_transaction(name: str, op: str = "task"):
    """
    Start a performance transaction.

    Usage:
        with start_transaction("process_message", "ai"):
            # ... do work ...
    """
    if not _initialized or not _sentry_sdk or not PERFORMANCE_MONITORING:
        # Return a dummy context manager
        from contextlib import nullcontext
        return nullcontext()

    return _sentry_sdk.start_transaction(name=name, op=op)


def crash_reporter_decorator(func):
    """
    Decorator to automatically capture exceptions from a function.

    Usage:
        @crash_reporter_decorator
        def my_function():
            ...
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            capture_exception(e, function=func.__name__)
            raise
    return wrapper


def get_crash_report_url() -> str:
    """Get the URL to view crash reports in Sentry dashboard"""
    # Parse DSN to get organization and project
    if 'your-key' in SENTRY_DSN:
        return "https://sentry.io (Configure SENTRY_DSN first)"

    try:
        # DSN format: https://key@org.ingest.sentry.io/project_id
        parts = SENTRY_DSN.split('@')
        if len(parts) >= 2:
            org_project = parts[1].replace('.ingest.sentry.io/', '/')
            return f"https://sentry.io/organizations/{org_project.split('/')[0]}/issues/"
    except Exception:
        pass

    return "https://sentry.io"


def get_status() -> dict[str, Any]:
    """Get crash reporting status"""
    return {
        'enabled': CRASH_REPORTING_ENABLED,
        'initialized': _initialized,
        'sentry_available': _sentry_sdk is not None,
        'performance_monitoring': PERFORMANCE_MONITORING,
        'dashboard_url': get_crash_report_url(),
    }


# Flask blueprint for crash reporting endpoints
def create_crash_reporter_blueprint():
    """Create Flask blueprint with crash reporting endpoints"""
    from flask import Blueprint, jsonify, request

    bp = Blueprint('crash_reporter', __name__)

    @bp.route('/crash-report/status', methods=['GET'])
    def status():
        """Get crash reporting status"""
        return jsonify(get_status())

    @bp.route('/crash-report/test', methods=['POST'])
    def test_crash():
        """Test crash reporting (development only)"""
        if os.environ.get('FLASK_ENV') != 'development':
            return jsonify({'error': 'Only available in development'}), 403

        try:
            raise Exception("Test crash from Nunba")
        except Exception as e:
            event_id = capture_exception(e, test=True)
            return jsonify({
                'success': True,
                'event_id': event_id,
                'dashboard_url': get_crash_report_url()
            })

    @bp.route('/crash-report/feedback', methods=['POST'])
    def user_feedback():
        """Submit user feedback for a crash"""
        if not _initialized or not _sentry_sdk:
            return jsonify({'error': 'Crash reporting not initialized'}), 503

        data = request.get_json() or {}
        event_id = data.get('event_id')

        if not event_id:
            return jsonify({'error': 'event_id required'}), 400

        try:
            _sentry_sdk.capture_user_feedback({
                'event_id': event_id,
                'name': data.get('name', 'Anonymous'),
                'email': data.get('email', ''),
                'comments': data.get('comments', '')
            })
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    return bp


# Auto-initialize on import - no manual steps needed
if CRASH_REPORTING_ENABLED:
    init_crash_reporting()
