"""Family G — startup defects.

Evidence gathered from real startup_trace.log / gui_app.log sessions.
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.unit


def test_g1_single_instance_guard_atomic(source_app_py, source_text):
    """FAILS if _check_single_instance races with autostart.

    A race-free check uses a file lock or a bound-socket check, not a
    'ping then bind' two-step.
    """
    src = source_text(source_app_py)
    # A safe impl binds to the port OR uses a mutex/lockfile atomically.
    has_atomic = (
        "socket.socket" in src and "bind(" in src and "SO_REUSEADDR" not in src
    ) or "msvcrt.locking" in src or "fcntl.flock" in src or \
         "CreateMutex" in src
    assert has_atomic, (
        "single-instance guard uses a non-atomic ping-then-bind pattern; "
        "two Nunba.exe can both bind :5000 on a race"
    )


def test_g2_resource_governor_deferred_until_webview_up(source_main_py, source_app_py, source_text):
    """FAILS if the ResourceEnforcer memory cap fires before pywebview
    finishes loading. Cold-boot SIGKILL has been observed when the cap
    activated too early.
    """
    app = source_text(source_app_py)
    # The canonical fix (commit c8cc739) defers memory limit until after
    # the webview is up; look for the "memory deferred" trace breadcrumb.
    assert "memory deferred" in app or \
           "defer_memory_cap" in app or \
           "after webview" in app.lower(), (
        "ResourceGovernor memory cap not deferred until after webview; "
        "see commit c8cc739 for the canonical fix"
    )


def test_g3_pywebview_handler_trace_survives_buffered_logger(source_app_py, source_text):
    """FAILS if on_loaded / on_shown / mount handlers don't call the
    unbuffered _trace() writer. The buffered gui_app.log swallowed
    handler events during autostart crashes.
    """
    src = source_text(source_app_py)
    on_loaded_idx = src.find("EVENT: on_loaded fired")
    on_shown_idx = src.find("EVENT: on_shown fired")
    mount_idx = src.find("BG_SHOWN: mount check")
    assert on_loaded_idx > 0, "no _trace call inside on_loaded handler"
    assert on_shown_idx > 0, "no _trace call inside on_shown handler"
    assert mount_idx > 0, "no _trace call inside mount-check loop"
