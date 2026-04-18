"""Wrapper that starts Nunba's Flask app under coverage.py parallel
mode so that any HTTP traffic (Cypress, curl, external probes)
exercising the backend contributes to Python runtime coverage.

Usage:
    python scripts/coverage_flask_run.py --port 5189

On shutdown (SIGTERM / SIGINT / exit), the atexit handler
`coverage.Coverage.save()` flushes the parallel-mode `.coverage.*`
fragment.  A subsequent `coverage combine` in the regression runner
merges every Flask session's fragment with the pytest fragments into
a single aggregate measurement.

Why a wrapper:
    - pytest-cov covers pytest invocations.
    - Cypress invocations are browser-driven — not pytest.
    - Without this wrapper, Cypress would drive hundreds of real
      Flask handlers while coverage.py records nothing, producing a
      false-low Python coverage number.

Parallel mode is set via the imported `coverage` module (not the
shell `coverage run`) so the wrapper process IS the Flask process —
no parent/child pid split, no handlers-not-instrumented gap.

Graceful shutdown on Windows:
    POST / GET to /_debug/coverage/flush triggers `cov.save()` and
    then `os._exit(0)` — this is the only reliable way to collect a
    coverage fragment on Windows where SIGTERM often arrives via
    `TerminateProcess` which bypasses atexit.  The endpoint is gated
    to loopback (`request.remote_addr` starts with 127.) and to the
    presence of `NUNBA_COVERAGE_ENABLED=1` in the environment.
"""

from __future__ import annotations

import atexit
import os
import signal
import sys
from pathlib import Path

# Start coverage BEFORE any app module is imported.  Otherwise every
# function def / class def at module-init time is missed.
import coverage

_cov = coverage.Coverage(
    config_file=str(Path(__file__).resolve().parent.parent / ".coveragerc"),
    auto_data=True,   # parallel-mode filenames (.coverage.hostname.pid.NNN)
    branch=True,
)
_cov.start()

os.environ["NUNBA_COVERAGE_ENABLED"] = "1"


def _flush_coverage(*_args, **_kwargs) -> None:
    try:
        _cov.stop()
        _cov.save()
    except Exception:
        pass


atexit.register(_flush_coverage)

# Signal handlers — fire first, then exit so atexit also runs.
def _sig_handler(_signum, _frame):  # pragma: no cover — handler
    _flush_coverage()
    # Windows doesn't actually deliver SIGTERM reliably; if we get
    # here, os._exit is sufficient to ensure the fragment is flushed.
    os._exit(0)


signal.signal(signal.SIGINT, _sig_handler)
signal.signal(signal.SIGTERM, _sig_handler)
# Windows: SIGBREAK is the Ctrl+Break signal — the most reliable
# user-triggered shutdown signal on Windows terminals.
if hasattr(signal, "SIGBREAK"):
    signal.signal(signal.SIGBREAK, _sig_handler)


# Allow the real Nunba main.py to run.  Same CLI args apply (--port etc.).
os.environ.setdefault("NUNBA_SKIP_SINGLE_INSTANCE", "1")

# Re-exec Nunba's main() with the existing argv (already contains --port).
sys.argv[0] = "main.py"
_main_path = Path(__file__).resolve().parent.parent / "main.py"
sys.path.insert(0, str(_main_path.parent))

# ── inject /_debug/coverage/{flush,shutdown} routes ────────────────
# Nunba runs on waitress, not Flask's dev server.  We patch both
# `flask.Flask.run` AND `waitress.serve` so the routes are registered
# on the Flask app instance no matter which WSGI server main.py picks.
#
# The routes must land BEFORE the WSGI server binds.  That's why we
# install the attached routes inside the patched serve/run wrappers —
# the `app` instance is passed in as the first positional argument.

import flask  # noqa: E402


def _install_coverage_routes(app) -> None:
    """Attach /_debug/coverage/{flush,shutdown} to the given Flask
    app.  Idempotent — safe to call multiple times."""

    if not os.environ.get("NUNBA_COVERAGE_ENABLED"):
        return
    if getattr(app, "_coverage_routes_installed", False):
        return
    app._coverage_routes_installed = True  # type: ignore[attr-defined]

    @app.route("/_debug/coverage/flush", methods=["GET", "POST"])
    def _coverage_flush():  # pragma: no cover — loopback helper
        from flask import jsonify, request
        remote = (request.remote_addr or "")
        if not (remote.startswith("127.") or remote == "::1"):
            return jsonify({"error": "loopback only"}), 403
        _flush_coverage()
        # restart coverage so subsequent traffic continues to be
        # captured until the next flush or process shutdown.
        try:
            _cov.erase()
        except Exception:
            pass
        try:
            _cov.start()
        except Exception:
            pass
        return jsonify({"ok": True, "flushed": True})

    @app.route("/_debug/coverage/shutdown", methods=["GET", "POST"])
    def _coverage_shutdown():  # pragma: no cover — loopback helper
        """Flush coverage + exit the process so the wrapper script
        returns without needing SIGTERM.  The reliable way to
        terminate on Windows."""

        from flask import jsonify, request
        remote = (request.remote_addr or "")
        if not (remote.startswith("127.") or remote == "::1"):
            return jsonify({"error": "loopback only"}), 403
        _flush_coverage()
        import threading
        threading.Timer(0.25, lambda: os._exit(0)).start()
        return jsonify({"ok": True, "shutdown": True})


_original_flask_run = flask.Flask.run


def _patched_flask_run(self, *args, **kwargs):
    _install_coverage_routes(self)
    return _original_flask_run(self, *args, **kwargs)


flask.Flask.run = _patched_flask_run


# Patch waitress.serve — this is what main.py actually calls.
try:
    import waitress  # noqa: E402
except ImportError:
    waitress = None  # type: ignore

if waitress is not None:
    _original_waitress_serve = waitress.serve

    def _patched_waitress_serve(app, *args, **kwargs):
        _install_coverage_routes(app)
        return _original_waitress_serve(app, *args, **kwargs)

    waitress.serve = _patched_waitress_serve


# runpy preserves __main__ semantics so Flask's app.run(...) actually fires.
import runpy  # noqa: E402

try:
    runpy.run_path(str(_main_path), run_name="__main__")
finally:
    _flush_coverage()
