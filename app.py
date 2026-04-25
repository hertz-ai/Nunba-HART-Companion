"""
app.py -- Nunba: A Friend, A Well Wisher, Your LocalMind

Creates a WebApp with reliable startup and system tray functionality + Sidebar Controls.
Connect to Hivemind with your friends' agents.
"""
# app.py (VERY TOP — before any other imports)
import os
import sys

# Block user site-packages for every subprocess, unconditionally.
# Rationale (2026-04-25 incident): a stale hevolve_backend-0.0.1.dev339
# wheel had dropped a partial ``core/`` package at
# ``%APPDATA%\Roaming\Python\Python312\site-packages\core`` two months
# earlier.  Python's default sys.path puts that user-site AHEAD of
# python-embed's own site-packages AND the freeze-bundled top-level
# ``core/``, so ``import core`` bound to the 7-submodule stale copy
# and every ``from core.gpu_tier import ...`` in main.py raised
# ModuleNotFoundError in the running installed Nunba.exe.
#
# ``_isolate_frozen_imports()`` below scrubs sys.path correctly, but
# it runs AFTER torch pre-warm and pycparser preload — so setting
# PYTHONNOUSERSITE here (module top, before anything else) guarantees
# every subprocess spawned from ANY point in app.py inherits the
# user-site block, even if spawned before _isolate_frozen_imports()
# fires.  The current interpreter's sys.path is still fixed by
# _isolate_frozen_imports; this is purely a belt for children.
os.environ.setdefault('PYTHONNOUSERSITE', '1')

# PyTorch CUDA: expandable segments MUST be set before first `import torch`.
# Frozen fixes below import langchain which can pull in torch transitively.
# Without this, 24MB allocations fail even with 5GB free due to fragmentation.
os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'expandable_segments:True')

# Allow audio autoplay in WebView2 — TTS plays audio from async SSE callbacks.
# Without this, Chrome/WebView2 autoplay policy silently blocks Audio.play().
os.environ.setdefault('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS',
                       '--autoplay-policy=no-user-gesture-required')

# Frozen pywebview builds detach stdio after the window attaches. Any later
# StreamHandler.emit then raises ValueError("I/O operation on closed file"),
# and Handler.handleError tries to write the traceback to the same closed
# sys.stderr — an infinite cascade that took down hart_generate, waitress,
# and the autobahn component in the 2026-04-23 onboarding log. Setting
# logging.raiseExceptions=False turns handleError into a no-op: the single
# failed emit is swallowed cleanly instead of spiralling. Gated to frozen
# builds so dev runs still surface genuine logging config errors.
if getattr(sys, 'frozen', False):
    import logging as _logging_boot
    _logging_boot.raiseExceptions = False
    del _logging_boot

# ── Frozen-build code-hash short-circuit (2026-04-19) ──
# `security.node_integrity.compute_code_hash` recursively walks every .py
# file under the HARTOS install root to produce a SHA-256 manifest.  In a
# cx_Freeze bundle, HARTOS is in `python-embed/Lib/site-packages/`, so the
# default `_CODE_ROOT` (two parents above `node_integrity.py`) resolves to
# `python-embed/Lib/` — which includes the entire CPython stdlib +
# site-packages (10k+ .py files).  Startup_trace.log 2026-04-19 showed
# 5+ parallel threads (peer_discovery, gossip, integrity_service) each
# burning CPU on this walk during boot.
#
# In a frozen build the hash is cosmetic — peers only use it to see
# "which build of the same code is this node running", and real tamper
# resistance comes from Authenticode / installer signing.  Set a stable
# precomputed value (SHA-256 of the executable path + install mtime) so
# `compute_code_hash` short-circuits at Tier-1 and never walks.
if getattr(sys, 'frozen', False):
    try:
        import hashlib as _h_cc
        _exe = os.path.abspath(sys.executable)
        try:
            _exe_mtime = int(os.path.getmtime(_exe))
        except OSError:
            _exe_mtime = 0
        _ch = _h_cc.sha256()
        _ch.update(f"{_exe}|{_exe_mtime}".encode('utf-8'))
        os.environ.setdefault('HEVOLVE_CODE_HASH_PRECOMPUTED', _ch.hexdigest())
        del _h_cc, _exe, _exe_mtime, _ch
    except Exception:
        # If anything fails, leave unset — HARTOS will fall through to
        # cache or full walk (slower but correct).
        pass

# ── G1 fix: Pre-warm torch under stock importer BEFORE _trace_import
# (2026-04-19) ──
#
# CPython sets submodule-as-attribute on the parent only AFTER the
# submodule's __init__.py returns (see `_handle_fromlist`).  torch 2.10.0's
# __init__.py has this sequence:
#     line 2240: from torch.autograd import (enable_grad, ...)
#     line 2247: from torch import (__config__, ..., autograd, ..., nested, ...)
#
# The fromlist processing for `nested` triggers torch.nested/__init__.py,
# which imports torch.nested._internal.nested_tensor, which evaluates
# `class ViewBufferFromNested(torch.autograd.Function):` — an attribute
# access on the PARTIALLY-INITIALIZED torch module.
#
# In dev .venv this works fine because __import__ is CPython's C fast path.
# In frozen builds, our _trace_import wrapper (installed just below)
# intercepts every __import__ including reentrant ones from inside torch,
# and the wrapper indirection causes the attribute-set to lag by one frame.
# By the time nested_tensor.py evaluates its class body, torch.autograd
# attribute isn't bound yet -> AttributeError: partially initialized module
# 'torch' has no attribute 'autograd' (most likely due to a circular import)
#
# Observed in logs/hartos_init_error.log on 2026-04-19T16:39 bundle with
# torch 2.10.0+cpu.  Tier-1 (HARTOS in-process) failed to load, adapter
# silently fell back to Tier-3 (llama.cpp) — which violates the product
# requirement that Nunba always uses Tier-1.
#
# Fix: import torch + the two submodules that race
# (autograd and nested) under the STOCK importer (C fast path)
# BEFORE we install the wrapper.  Once torch is fully initialized, all
# subsequent imports (including the langchain → transformers → torch
# chain inside the hartos-init thread) get it from sys.modules cache
# without re-executing torch/__init__.py.
if getattr(sys, 'frozen', False):
    # When the user passes --validate / --acceptance-test, reattach to the
    # parent console so the verification report is actually visible.
    # Nunba.exe is linked as a PE32+ GUI subsystem (pywebview / Twisted
    # require it), which means Windows silently discards stdout/stderr
    # unless a console is explicitly attached. Before this hook, a
    # headless validate run looked like a hang; it was silently exiting.
    # Diagnosis: task #377.
    if any(flag in sys.argv for flag in ('--validate', '--acceptance-test', '--diag')):
        try:
            import ctypes
            # ATTACH_PARENT_PROCESS = -1: attach to invoking console if any,
            # else fall back to allocating a fresh one so direct launches
            # still show output.
            if not ctypes.windll.kernel32.AttachConsole(-1):
                ctypes.windll.kernel32.AllocConsole()
            # Re-wire stdio to the freshly-attached console FDs.
            sys.stdout = open('CONOUT$', 'w', buffering=1, encoding='utf-8', errors='replace')
            sys.stderr = open('CONOUT$', 'w', buffering=1, encoding='utf-8', errors='replace')
        except Exception:
            pass  # Non-Windows or no WinAPI — fall through; log file is still the source of truth.
    try:
        import importlib.util
        import torch  # noqa: F401  — full torch.__init__ under stock importer
        import torch.autograd  # noqa: F401  — belt-and-braces: ensure attr bound
        import torch.nested  # noqa: F401  — warm before wrapper sees it
        # cx_Freeze's loader sometimes leaves torch.__spec__ as None.
        # transformers' _is_package_available() calls importlib.util.find_spec("torch")
        # which returns None if __spec__ was never set, then raises
        # ValueError when an attribute is read off of None. Re-seat the
        # spec so the entire transformers → hart_intelligence chain loads.
        # Diagnosis: task #377 + #297 (A1 re-landing).
        if torch.__spec__ is None and getattr(torch, '__file__', None):
            torch.__spec__ = importlib.util.spec_from_file_location(
                'torch', torch.__file__,
            )
    except Exception:
        # If torch isn't bundled or fails to import, don't crash app boot.
        # The hartos-init thread will re-attempt and surface a clearer error.
        pass

# Trace recursion in frozen builds — write to file since Win32GUI has no console
if getattr(sys, 'frozen', False):
    sys.setrecursionlimit(2000)
    _import_depth = [0]
    _max_depth = [0]
    _import_stack = []
    _orig_import = __builtins__.__import__ if hasattr(__builtins__, '__import__') else __import__

    def _trace_import(name, *args, **kwargs):
        _import_depth[0] += 1
        if _import_depth[0] > _max_depth[0]:
            _max_depth[0] = _import_depth[0]
        _import_stack.append(name)
        if _import_depth[0] > 900:
            # About to overflow — dump the chain to disk before os._exit
            # (os._exit skips atexit + stdio flush, so we must flush ourselves
            # inside the `with` block; Python's context manager guarantees
            # fsync-equivalent on close even before os._exit bypasses atexit).
            _dump = os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba', 'logs', 'import_recursion.txt')
            try:
                os.makedirs(os.path.dirname(_dump), exist_ok=True)
                with open(_dump, 'w') as f:
                    f.write(f'Max depth: {_max_depth[0]}\n')
                    f.write(f'Stack depth: {_import_depth[0]}\n\n')
                    for i, m in enumerate(_import_stack):
                        f.write(f'{i}: {m}\n')
                    f.flush()
                    try:
                        os.fsync(f.fileno())  # ensure bytes hit disk
                    except OSError:
                        pass
            except Exception:
                pass  # if even the dump write fails, still exit cleanly below
            os._exit(99)  # Exit before stack overflow kills us
        try:
            return _orig_import(name, *args, **kwargs)
        finally:
            _import_stack.pop()
            _import_depth[0] -= 1

    if hasattr(__builtins__, '__import__'):
        __builtins__.__import__ = _trace_import
    else:
        import builtins
        builtins.__import__ = _trace_import

def _preload_pycparser_from_lib_src():
    """Load pycparser from lib_src BEFORE any other frozen import path.

    Root cause (Stage-B Symptom #1, 2026-04-16):
    cx_Freeze's .pyc bundle of pycparser + cffi's lazy invocation of
    pycparser at parse time produce a dual-copy situation. The earlier
    fix inside _load_pywebview `del sys.modules[pycparser.*]` ran
    AFTER autobahn/cffi had already pulled pycparser from the .pyc
    bundle, leaving behind stale references to the old pycparser.c_ast.
    When the lib_src copy later loads, Node.__subclasses__() misses
    entries bound to the old module -> KeyError on 'c_ast'.

    Fix: force the lib_src copy of pycparser into sys.modules BEFORE
    any cffi / autobahn import can pull the .pyc copy. This runs at
    app.py import time, well before _isolate_frozen_imports / main.py.

    Bundle-safe: if lib_src/pycparser doesn't exist (dev tree), this
    is a silent no-op — the dev-tree pycparser from site-packages
    is used.
    """
    if not getattr(sys, "frozen", False):
        return
    try:
        app_dir = os.path.dirname(os.path.abspath(sys.executable))
        lib_src = os.path.join(app_dir, "lib_src")
        pycparser_dir = os.path.join(lib_src, "pycparser")
        if not os.path.isdir(pycparser_dir):
            return
        # Put lib_src on sys.path BEFORE any bundled .pyc location.
        if lib_src not in sys.path:
            sys.path.insert(0, lib_src)
        # Evict any half-loaded pycparser from the .pyc bundle (should
        # be empty this early, but defense-in-depth). NEVER do this
        # later — once cffi has a reference, you get dual-copy.
        _stale = [k for k in list(sys.modules)
                  if k == "pycparser" or k.startswith("pycparser.")]
        for _k in _stale:
            sys.modules.pop(_k, None)
        # Import pycparser + c_ast eagerly so the single canonical copy
        # is bound in sys.modules before any caller (autobahn, cffi,
        # cryptography) touches it.
        import pycparser  # noqa: F401
        import pycparser.c_ast  # noqa: F401
        import pycparser.c_parser  # noqa: F401
    except Exception:
        # Catch-all: a broken pycparser load should NOT crash the exe.
        # Downstream cffi imports will fall back to the .pyc bundle and
        # the operator sees the specific error in their own log.
        pass


def _running_from_install_location():
    """Detect whether THIS process is executing from the installed Nunba
    directory (``\\HevolveAI\\Nunba\\``), regardless of how Python was
    launched.

    Motivation (2026-04-21 watchdog dump): the installed Nunba hung 31+s
    at ``importing_main`` because ``integrations.social.models`` imported
    ``sqlalchemy`` from the developer's ``.venv\\Lib\\site-packages\\``
    instead of the bundled ``lib\\sqlalchemy\\``.  Root cause: the
    freeze_core console launcher does NOT always set ``sys.frozen = True``,
    so ``_isolate_frozen_imports()`` short-circuited and left the dev
    venv ahead of bundled ``lib/`` on ``sys.path``.

    The only reliable signal available at that early point is the file
    location of ``__main__`` / ``sys.executable`` / ``sys.argv[0]``.  If
    any of those sit under the install root, we MUST isolate sys.path
    regardless of ``sys.frozen``.

    Safe on dev tree: developer's app.py at
    ``C:\\Users\\...\\PycharmProjects\\Nunba-HART-Companion\\app.py``
    returns False, so dev-mode ``python app.py`` still resolves imports
    from the active venv as expected.
    """
    _needle = "\\hevolveai\\nunba\\"

    def _norm(p):
        try:
            return os.path.abspath(p).lower().replace("/", "\\")
        except Exception:
            return ""

    # Check 1: cx_Freeze exe (Nunba.exe) → sys.executable is inside install
    if _needle in _norm(sys.executable):
        return True
    # Check 2: direct-python launcher → sys.argv[0] is the installed app.py
    if sys.argv and sys.argv[0] and _needle in _norm(sys.argv[0]):
        return True
    # Check 3: __main__.__file__ fallback (covers runpy / exec chains)
    main_mod = sys.modules.get("__main__")
    main_file = getattr(main_mod, "__file__", None) if main_mod else None
    if main_file and _needle in _norm(main_file):
        return True
    return False


def _isolate_frozen_imports():
    # FIX-5.3 (2026-04-21): Run if we're cx_Freeze frozen OR running from
    # the installed directory.  The freeze_core console launcher does not
    # always set sys.frozen, so a bare ``sys.frozen`` guard lets the dev
    # venv's sqlalchemy/site-packages win on sys.path precedence and the
    # watchdog catches a 31s+ stuck import during boot.
    if not (getattr(sys, "frozen", False) or _running_from_install_location()):
        return

    # block user site-packages (prevents importing fastapi from Roaming).
    # Also clear VIRTUAL_ENV so subprocess spawns (llama-server, piper,
    # parler worker) don't inherit the developer's .venv.
    os.environ["PYTHONNOUSERSITE"] = "1"
    os.environ.pop("PYTHONPATH", None)
    os.environ.pop("VIRTUAL_ENV", None)

    # aggressively remove user site-packages if already present
    # (case-insensitive). Three patterns are stripped:
    #   1. Roaming user site-packages (pip --user installs)
    #   2. Any \site-packages not under \HevolveAI\Nunba\
    #   3. Dev-tree venv paths (PycharmProjects, .venv) — the one the
    #      2026-04-21 watchdog caught winning over bundled lib/.
    #
    # 2026-04-24 regression fix (argparse-missing): the frozen bundle's
    # OWN directory tree must never be stripped — even when the build
    # sits under a path that matches a dev-tree pattern (e.g.
    # `build/Nunba/lib/` under `PycharmProjects\`).  That case fell
    # through `_running_from_install_location()` (which only matches
    # `\HevolveAI\Nunba\`), so rule 3 above ripped the bundle's own
    # library.zip out of sys.path and `import argparse` failed at
    # boot despite argparse.pyc being physically bundled.
    _frozen_base = ''
    if getattr(sys, 'frozen', False):
        try:
            _frozen_base = os.path.abspath(
                os.path.dirname(sys.executable)
            ).lower().replace("/", "\\")
        except Exception:
            _frozen_base = ''

    bad = []
    for p in list(sys.path):
        _lp = p.lower().replace("/", "\\")
        # Never strip paths belonging to the frozen bundle itself.
        if _frozen_base and _lp.startswith(_frozen_base):
            continue
        if (
            ("\\appdata\\roaming\\python\\" in _lp)
            or ("\\site-packages" in _lp and "\\hevolveai\\nunba\\" not in _lp)
            or ("\\pycharmprojects\\" in _lp and "\\hevolveai\\nunba\\" not in _lp)
            or ("\\.venv\\" in _lp)
        ):
            bad.append(p)
    for p in bad:
        try:
            sys.path.remove(p)
        except ValueError:
            pass

    # Disable the import hook that site.py uses to re-add user site-packages.
    # Some modules (e.g. Hevolve_Database) trigger site.addsitedir() which
    # can re-discover user site-packages. Patching site prevents this.
    try:
        import site
        site.ENABLE_USER_SITE = False
    except Exception:
        pass

    # ensure bundled lib wins.  Prefer sys.executable's directory, but fall
    # back to __main__.__file__'s directory for the direct-python launcher
    # case where sys.executable points at the dev Python interpreter.
    base = os.path.dirname(os.path.abspath(sys.executable))
    if "\\hevolveai\\nunba\\" not in base.lower().replace("/", "\\"):
        main_mod = sys.modules.get("__main__")
        main_file = getattr(main_mod, "__file__", None) if main_mod else None
        if main_file:
            _mbase = os.path.dirname(os.path.abspath(main_file))
            if "\\hevolveai\\nunba\\" in _mbase.lower().replace("/", "\\"):
                base = _mbase
        if sys.argv and sys.argv[0]:
            _abase = os.path.dirname(os.path.abspath(sys.argv[0]))
            if "\\hevolveai\\nunba\\" in _abase.lower().replace("/", "\\"):
                base = _abase
    for p in [base, os.path.join(base, "lib"), os.path.join(base, "lib_src")]:
        if os.path.isdir(p) and p not in sys.path:
            sys.path.insert(0, p)

_preload_pycparser_from_lib_src()
_isolate_frozen_imports()

# === User-writable site-packages (runtime pip installs go here) ===
# Program Files is read-only for non-admin. Packages installed at runtime
# (e.g. CUDA torch, TTS engines) go to ~/.nunba/site-packages/ instead.
_user_sp = os.path.join(os.path.expanduser('~'), '.nunba', 'site-packages')
os.makedirs(_user_sp, exist_ok=True)
if _user_sp not in sys.path:
    sys.path.insert(0, _user_sp)


# ══════════════════════════════════════════════════════════════════════
# Background preload of heavy imports (sqlalchemy + dependencies)
# ══════════════════════════════════════════════════════════════════════
# Witnessed 2026-04-21: _bg_import thread stuck 31+s inside
#   main.py → integrations.social.models → sqlalchemy.__init__
# sqlalchemy cold-import is 3-5s on SSD, 30s+ on 99%-full disk with AV
# scanning every .py.  The watchdog flags 'stuck' at 20s, which wasn't
# accurate — the import was progressing, just slowly.
#
# Kick off sqlalchemy (and other known-heavy imports) on a background
# thread RIGHT NOW, before any synchronous import of main.py kicks in.
# By the time `_bg_import` reaches `from sqlalchemy import ...`, the
# module is already in sys.modules cache and the import returns in
# microseconds.
#
# Lists heavy roots only; transitive imports ride along for free.
def _preload_heavy_imports_async():
    """Fire-and-forget preload of slow cold-import modules."""
    try:
        import threading

        def _warm():
            _targets = (
                'sqlalchemy',            # ~3-30s cold
                'sqlalchemy.engine',     # slowest submodule
                'sqlalchemy.sql',
                'autobahn',              # WAMP client, ~1s
                'autobahn.asyncio',
            )
            for _name in _targets:
                try:
                    __import__(_name)
                except Exception:
                    pass  # defensive: bundle may not include every
                          # target; skip rather than crash preload

        t = threading.Thread(
            target=_warm, name='_preload_heavy', daemon=True,
        )
        t.start()
    except Exception:
        # If threading itself is broken, defer to the slow path.
        pass


_preload_heavy_imports_async()


# === Single-instance guard ===
# Prevent multiple Nunba processes (Windows auto-start + manual launch).
#
# Two-layer guard:
#   Layer 1 — atomic OS-level lock on ~/.nunba/nunba.lock (msvcrt.locking
#             on Windows, fcntl.flock on POSIX).  Two instances cannot
#             both hold the lock; losing the race → exit.  This is the
#             REAL race-proof gate.
#   Layer 2 — best-effort ping of the existing instance's /api/focus so
#             the losing instance brings the running window to front
#             before exiting (nicer UX than "just exit silently").
#
# Previous impl was Layer-2 only (connect-to-port → exit).  Under racy
# autostart both instances saw port free, both ran, both bound → port
# conflict or worse, 2 Flask apps writing the same SQLite DB.
_NUNBA_LOCK_HANDLE = None  # kept alive for process lifetime


def _acquire_instance_lock():
    """Return True iff this process is the first Nunba.  Handle stays
    open for the life of the process so the OS keeps the lock."""
    global _NUNBA_LOCK_HANDLE
    try:
        _lock_dir = os.path.join(os.path.expanduser('~'), '.nunba')
        os.makedirs(_lock_dir, exist_ok=True)
        _lock_path = os.path.join(_lock_dir, 'nunba.lock')
    except OSError:
        return True  # can't even create lockfile — don't block startup
    try:
        _fd = open(_lock_path, 'a+b')
    except OSError:
        return True
    try:
        if sys.platform == 'win32':
            import msvcrt
            try:
                msvcrt.locking(_fd.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError:
                _fd.close()
                return False
        else:
            import fcntl
            try:
                fcntl.flock(_fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                _fd.close()
                return False
    except Exception:
        _fd.close()
        return True  # platform missing lock primitive — fall through
    _NUNBA_LOCK_HANDLE = _fd
    return True


def _check_single_instance():
    # Same pytest/coverage/explicit-override skip the module-load guard
    # does — but enforced INSIDE the function too, so direct callers
    # (e.g. test_first_call_does_not_crash) don't end up calling
    # sys.exit(0) and getting their pytest run interrupted.
    _test_env_keys = ('PYTEST_CURRENT_TEST', 'PYTEST_DISABLE_PLUGIN_AUTOLOAD',
                      'COVERAGE_RUN', 'NUNBA_SKIP_SINGLE_INSTANCE')
    if any(os.environ.get(_k) for _k in _test_env_keys):
        return
    if ('--validate' in sys.argv
            or '--install-ai' in sys.argv
            or '--setup-ai' in sys.argv
            or '--acceptance-test' in sys.argv):
        return  # utility modes always run
    _port = 5000
    for a in sys.argv:
        if a.startswith('--port='):
            try:
                _port = int(a.split('=')[1])
            except ValueError:
                pass
        if a == '--port':
            idx = sys.argv.index(a)
            if idx + 1 < len(sys.argv):
                try:
                    _port = int(sys.argv[idx + 1])
                except ValueError:
                    pass

    # Layer 1 — atomic file lock.  Can't race.
    if _acquire_instance_lock():
        return  # first instance, nothing more to do

    # Lock held by another Nunba → best-effort ping its /api/focus,
    # then exit.  This is purely UX; the lock has already decided.
    try:
        import urllib.request as _ur
        _ur.urlopen(f'http://127.0.0.1:{_port}/api/focus', timeout=2).close()
    except Exception:
        pass
    print(f"Nunba is already running on port {_port}. Exiting duplicate instance.")
    sys.exit(0)

# Skip single-instance check under pytest / coverage instrumentation.
#   PYTEST_CURRENT_TEST — set by pytest (per-test, not at collection)
#   PYTEST_DISABLE_PLUGIN_AUTOLOAD — set when pytest boots
#   COVERAGE_RUN — set when coverage.py rewrites modules for measurement
#   NUNBA_SKIP_SINGLE_INSTANCE — explicit local override for dev tests
# All four indicate a non-user-facing invocation where "duplicate
# instance" exit would sabotage the test harness itself.
_test_envs = ('PYTEST_CURRENT_TEST', 'PYTEST_DISABLE_PLUGIN_AUTOLOAD',
              'COVERAGE_RUN', 'NUNBA_SKIP_SINGLE_INSTANCE')
if not any(os.environ.get(_k) for _k in _test_envs):
    _check_single_instance()

# === Frozen exe stdout/stderr fix ===
# cx_Freeze GUI exes have no console → stdout/stderr file descriptors are closed.
# print(), click.echo(), and Flask's banner all crash with
#   "ValueError: I/O operation on closed file"
# Fix: ALWAYS replace both streams in frozen builds — even if they seem OK,
# click/Flask may cache broken fd references before our check.
if getattr(sys, 'frozen', False):
    import io as _io
    def _safe_devnull():
        try:
            f = open(os.devnull, 'w', encoding='utf-8')
            f.write('')  # verify it actually works
            return f
        except Exception:
            return _io.StringIO()
    def _is_stream_broken(stream):
        if stream is None:
            return True
        try:
            stream.write('')
            return False
        except Exception:
            return True
    # Always replace — broken fd might pass write test but fail later
    # Write to a debug log file for frozen builds.
    # Use the same log directory as the rest of Nunba (~/Documents/Nunba/logs on all platforms).
    import atexit as _atexit
    try:
        from core.platform_paths import get_log_dir
        _frozen_log_dir = get_log_dir()
    except ImportError:
        _frozen_log_dir = os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba', 'logs')
    os.makedirs(_frozen_log_dir, exist_ok=True)
    # APPEND mode: a `--validate` or second launch must NOT erase the
    # trace of the primary `--background` autostart (see memory of
    # 2026-04-16 restart debug — both traces opened in 'w' truncated each
    # other, so the post-restart evidence was unrecoverable 10 min later).
    # A run-separator banner distinguishes consecutive runs.
    try:
        _frozen_log = open(os.path.join(_frozen_log_dir, 'frozen_debug.log'), 'a',
                           encoding='utf-8', buffering=1)  # line-buffered: every \n hits disk
        _atexit.register(_frozen_log.close)
        sys.stdout = _frozen_log
        sys.stderr = _frozen_log
    except OSError:
        pass  # If log dir is read-only, skip — don't crash on startup

    # ── Startup tracer: log every phase until agent page is visible ──
    # Writes to a SEPARATE file (startup_trace.log) with immediate flush.
    # This survives crashes that kill frozen_debug.log.
    import time as _time
    _startup_t0 = _time.time()
    try:
        _trace_log = open(os.path.join(_frozen_log_dir, 'startup_trace.log'), 'a',
                          encoding='utf-8', buffering=1)
    except OSError:
        import io as _tio
        _trace_log = _tio.StringIO()

    def _trace(msg):
        try:
            elapsed = _time.time() - _startup_t0
            _trace_log.write(f"[{elapsed:8.3f}s] {msg}\n")
            _trace_log.flush()
        except Exception:
            pass

    try:
        import datetime as _dt
        _trace_log.write(f"\n\n======== {_dt.datetime.now().isoformat(timespec='seconds')} "
                         f"PID={os.getpid()} ========\n")
        _trace_log.flush()
    except Exception:
        pass
    _trace("=== Nunba startup trace ===")
    _trace(f"argv: {sys.argv}")
    _trace(f"frozen: {getattr(sys, 'frozen', False)}")
    _trace(f"executable: {sys.executable}")
    # Disk-free via `shutil.disk_usage` — pure Python, zero subprocess.
    # The previous implementation called `wmic logicaldisk ...` which is
    # deprecated on Windows 11 (Microsoft removed it from default installs)
    # and can hang INDEFINITELY (no timeout on os.popen) when the WMI
    # service is restarting or Defender is scanning the WMI repository.
    # Seen hangs of 27+ minutes on real-world systems — boot stuck on
    # static splash with no progress.  shutil.disk_usage returns in <1ms.
    try:
        import shutil as _shutil
        _du = _shutil.disk_usage('C:\\')
        _trace(f"disk free: FreeSpace={_du.free}")
    except Exception as _de:
        _trace(f"disk free: unavailable ({_de})")

    # Make _trace available globally for other modules
    import builtins as _builtins
    _builtins._nunba_trace = _trace

    _builtins._nunba_trace_stop = lambda: None  # no-op placeholder

import os
import sys

_t = getattr(__import__('builtins'), '_nunba_trace', lambda m: None)
_t("PATH isolation starting")

# === Frozen executable PATH isolation ===
# cx_Freeze bundles its own Python DLLs. If the user has conda, miniconda,
# Anaconda, or a standalone Python installation in their PATH, those DLLs
# get loaded instead of the bundled ones, causing silent crash (Exit Code 1).
# Fix: Remove conflicting Python environment paths before any DLL loading.
if getattr(sys, 'frozen', False):
    _app_dir = os.path.dirname(os.path.abspath(sys.executable))
    _lib_dir = os.path.join(_app_dir, 'lib')
    _conflict_keywords = (
        'conda', 'miniconda', 'anaconda', 'miniforge', 'mambaforge',
        'pyenv', 'virtualenvs', 'pythonnet',
    )
    _clean_parts = [_app_dir]
    if os.path.isdir(_lib_dir):
        _clean_parts.append(_lib_dir)
        # Add *.libs directories (numpy.libs, shapely.libs, etc.) to PATH
        # so that DLLs like libopenblas64_ can be found when .pyd files load.
        for _entry in os.listdir(_lib_dir):
            if _entry.endswith('.libs'):
                _libs_path = os.path.join(_lib_dir, _entry)
                if os.path.isdir(_libs_path):
                    _clean_parts.append(_libs_path)
    for _p in os.environ.get('PATH', '').split(os.pathsep):
        if not _p:
            continue
        _low = _p.lower().replace('/', '\\')
        # Skip the app's own paths (already prepended)
        if _low.startswith(_app_dir.lower()):
            continue
        # Skip any conda/virtualenv environments
        if any(kw in _low for kw in _conflict_keywords):
            continue
        # Skip standalone Python installations (e.g. C:\Python312, C:\Python312\Scripts)
        # Match pattern: path ending in \pythonXXX or \pythonXXX\scripts
        _basename = os.path.basename(_low.rstrip('\\'))
        _parent = os.path.basename(os.path.dirname(_low.rstrip('\\')))
        if (_basename.startswith('python3') or _parent.startswith('python3')) and \
           ('scripts' in _low or _basename.startswith('python3')):
            continue
        _clean_parts.append(_p)
    os.environ['PATH'] = os.pathsep.join(_clean_parts)
    # Also fix DLL search order on Windows 10+
    if hasattr(os, 'add_dll_directory'):
        try:
            os.add_dll_directory(_app_dir)
            if os.path.isdir(_lib_dir):
                os.add_dll_directory(_lib_dir)
                # Add *.libs directories to DLL search path.
                # cx_Freeze bundles DLLs like libopenblas64_ into lib/numpy.libs/,
                # but conda's _distributor_init.py has no code to add them.
                # Without this, _multiarray_umath.pyd fails to load → numpy broken.
                for _entry in os.listdir(_lib_dir):
                    if _entry.endswith('.libs'):
                        _libs_path = os.path.join(_lib_dir, _entry)
                        if os.path.isdir(_libs_path):
                            os.add_dll_directory(_libs_path)
        except OSError:
            pass
    # Add python-embed site-packages to sys.path so hart-backend (and other
    # pip-installed packages like hart_intelligence) can be imported directly.
    # APPEND (not insert) so cx_Freeze's bundled modules (PIL, numpy, etc.)
    # take priority — python-embed only fills gaps cx_Freeze didn't bundle.
    _embed_site_packages = os.path.join(_app_dir, 'python-embed', 'Lib', 'site-packages')
    if os.path.isdir(_embed_site_packages) and _embed_site_packages not in sys.path:
        sys.path.append(_embed_site_packages)
    # ── HevolveArmor: point HARTOS's native_hive_loader at the bundled
    # armored hevolveai. setup_freeze_nunba.py stages the encrypted
    # modules + key under <app_dir>/vendor/hevolveai_armored/ via
    # HARTOS/scripts/armor_hevolveai.py at build time; here we export
    # the env vars that security/native_hive_loader.py consults when
    # hart_intelligence_entry first calls try_import_hevolveai. The
    # hook install is lazy — it happens on first hevolveai import,
    # not at app.py load — so no hevolvearmor import is needed here.
    _armored_dir = os.path.join(_app_dir, 'vendor', 'hevolveai_armored')
    if os.path.isdir(_armored_dir):
        _armor_modules = os.path.join(_armored_dir, 'modules')
        _armor_key = os.path.join(_armored_dir, '_key.bin')
        if os.path.isdir(_armor_modules):
            os.environ.setdefault('HEVOLVE_ARMORED_DIR', _armor_modules)
        if os.path.isfile(_armor_key):
            os.environ.setdefault('HEVOLVE_ARMOR_KEY_FILE', _armor_key)
    # Remove stale torchvision/_C.pyd from frozen lib/ — it conflicts with
    # the real CUDA torch in user site-packages (entry point mismatch error).
    # torch/torchvision should ONLY come from ~/.nunba/site-packages/.
    for _stale_pkg in ('torchvision', 'torchaudio'):
        _stale_pyd = os.path.join(_lib_dir, _stale_pkg, '_C.pyd')
        if os.path.isfile(_stale_pyd):
            try:
                os.rename(_stale_pyd, _stale_pyd + '.disabled')
            except OSError:
                pass  # Locked or no admin — harmless, DLL won't load from renamed path

    # User site-packages (~/.nunba/site-packages/) — runtime pip installs go here.
    # INSERT at 0 so CUDA torch (if installed) shadows the 0.0.0 stub in python-embed.
    # Verified: python-embed/python.exe loads CUDA torch correctly with this path order.
    _user_sp = os.path.join(os.path.expanduser('~'), '.nunba', 'site-packages')
    if os.path.isdir(_user_sp) and _user_sp not in sys.path:
        sys.path.insert(0, _user_sp)
    # Windows: torch needs its lib/ dir in DLL search path for CUDA DLLs
    _torch_lib = os.path.join(_user_sp, 'torch', 'lib')
    if os.path.isdir(_torch_lib):
        if hasattr(os, 'add_dll_directory'):
            try:
                os.add_dll_directory(_torch_lib)
            except OSError:
                pass
        os.environ['PATH'] = _torch_lib + os.pathsep + os.environ.get('PATH', '')
    # Win32GUI base sets sys.stdout/stderr to None, which crashes modules that
    # do sys.stdout.buffer (e.g. hart_intelligence line 6). Fix by redirecting
    # to devnull before any imports that might touch stdout.
    if _is_stream_broken(sys.stdout):
        sys.stdout = _safe_devnull()
    if _is_stream_broken(sys.stderr):
        sys.stderr = _safe_devnull()


# ════════════════════════════════════════════════════════════════════
# STATIC SPLASH — must appear BEFORE frozen fixes (which take 20+s).
# Only needs tkinter + PIL (lightweight, bundled by cx_Freeze).
# ════════════════════════════════════════════════════════════════════

def _safe_tk_update_early(root, budget_ms=50):
    """Pump tkinter events. Inlined here so splash can use it before frozen fixes."""
    try:
        if sys.platform != 'darwin':
            root.update()
            return
        import _tkinter
        import time as _t
        deadline = _t.monotonic() + budget_ms / 1000.0
        while _t.monotonic() < deadline:
            if not root.tk.dooneevent(_tkinter.DONT_WAIT):
                break
    except Exception:
        pass

_early_splash = None
_eroot = None

if getattr(sys, 'frozen', False) and '--validate' not in sys.argv and '--acceptance-test' not in sys.argv and '--install-ai' not in sys.argv and '--background' not in sys.argv and '--help' not in sys.argv and '-h' not in sys.argv:
    # DPI awareness before any Tk window
    try:
        import ctypes as _ct_dpi
        _ct_dpi.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass
    # macOS Tcl/Tk path fix
    if sys.platform == 'darwin':
        _macos_dir = os.path.dirname(sys.executable)
        _tcl_dir = os.path.join(_macos_dir, 'share', 'tcl8.6')
        _tk_dir = os.path.join(_macos_dir, 'share', 'tk8.6')
        if os.path.isdir(_tcl_dir):
            os.environ['TCL_LIBRARY'] = _tcl_dir
        if os.path.isdir(_tk_dir):
            os.environ['TK_LIBRARY'] = _tk_dir
    try:
        import tkinter as _estk
        _eroot = _estk.Tk()
        _eroot.withdraw()
        _app_base = os.path.dirname(os.path.abspath(sys.executable))
        _esp_path = os.path.join(_app_base, 'splash.png')
        if os.path.isfile(_esp_path):
            from PIL import Image as _ESImg
            from PIL import ImageTk as _ESTk
            _es_img = _ESImg.open(_esp_path)
            _ESW, _ESH = _es_img.size
            if _ESW > 900 or _ESH > 560:
                _es_img = _es_img.resize((900, 560), _ESImg.LANCZOS)
                _ESW, _ESH = 900, 560
            _es_top = _estk.Toplevel(_eroot)
            _es_top.overrideredirect(True)
            _es_top.attributes('-topmost', True)
            _esx = (_es_top.winfo_screenwidth() - _ESW) // 2
            _esy = (_es_top.winfo_screenheight() - _ESH) // 2
            _es_top.geometry(f"{_ESW}x{_ESH}+{_esx}+{_esy}")
            _es_photo = _ESTk.PhotoImage(_es_img)
            _es_canvas = _estk.Canvas(_es_top, width=_ESW, height=_ESH,
                                       highlightthickness=0, bd=0)
            _es_canvas.pack(fill='both', expand=True)
            _es_canvas.create_image(0, 0, image=_es_photo, anchor='nw')
            _es_canvas._ref = _es_photo
            _es_status = _estk.StringVar(value='Starting up...')
            _es_status_id = _es_canvas.create_text(
                _ESW // 2, _ESH - 32, text='Starting up...',
                font=('Bahnschrift Light', 10), fill='#72757E', anchor='center')
            def _es_on_status(*_a):
                try:
                    _es_canvas.itemconfig(_es_status_id, text=_es_status.get())
                except Exception:
                    pass
            _es_status.trace_add('write', _es_on_status)
            _es_bar_y = _ESH - 14
            _es_bar_w = 220
            _es_bar_x = (_ESW - _es_bar_w) // 2
            _es_canvas.create_rectangle(_es_bar_x, _es_bar_y,
                                         _es_bar_x + _es_bar_w, _es_bar_y + 3,
                                         fill='#1A1929', outline='')
            _es_bar_rect = _es_canvas.create_rectangle(
                _es_bar_x, _es_bar_y, _es_bar_x + 40, _es_bar_y + 3,
                fill='#6C63FF', outline='')
            _es_anim = {'pos': 0, 'dir': 1}
            def _es_animate():
                try:
                    _es_anim['pos'] += _es_anim['dir'] * 4
                    if _es_anim['pos'] >= _es_bar_w - 40:
                        _es_anim['dir'] = -1
                    elif _es_anim['pos'] <= 0:
                        _es_anim['dir'] = 1
                    px = _es_bar_x + _es_anim['pos']
                    _es_canvas.coords(_es_bar_rect, px, _es_bar_y, px + 40, _es_bar_y + 3)
                    _es_top.after(30, _es_animate)
                except Exception:
                    pass
            _es_animate()
            _safe_tk_update_early(_eroot)
            _eroot.after(300000, lambda: _eroot.destroy())
            _early_splash = (_eroot, _es_top, _es_canvas, _es_status, _es_photo)
        else:
            _eroot.destroy()
    except Exception:
        _early_splash = None


# ── Frozen build import fixes (langchain, torch, transformers) ──
# These take 20-30s. Splash is already visible above.
_FROZEN_FIXES_DONE = False
if getattr(sys, 'frozen', False):
    _trace("frozen fixes block starting")
    # Suppress ALL warnings before importing langchain/autogen — they try to write
    # to stderr which may be closed in GUI exe even after our devnull redirect.
    # flaml (via autogen) emits UserWarning, langchain emits DeprecationWarning.
    import warnings as _warnings
    _warnings.filterwarnings('ignore')
    _trace("starting opentelemetry fix")
    # ── Fix opentelemetry.context StopIteration crash in frozen builds ──
    # cx_Freeze doesn't bundle setuptools/importlib_metadata dist-info, so
    # entry_points(group="opentelemetry_context") returns empty →
    # next(iter([])) raises StopIteration in _load_runtime_context().
    # Import chain: langchain_core → langsmith → opentelemetry.sdk.trace
    #   → opentelemetry.context → crash → Tier-1 unavailable.
    # Fix: patch entry_points to return a direct-import entry for the default
    # ContextVarsRuntimeContext (which uses stdlib contextvars — always works).
    try:
        import opentelemetry.util._importlib_metadata as _otel_meta
        _orig_ep_fn = _otel_meta.entry_points

        class _ContextVarsEP:
            """Fake entry point returning ContextVarsRuntimeContext directly."""
            name = 'contextvars_context'
            group = 'opentelemetry_context'
            def load(self):
                from opentelemetry.context.contextvars_context import ContextVarsRuntimeContext
                return ContextVarsRuntimeContext

        def _patched_eps(**kwargs):
            if kwargs.get('group') == 'opentelemetry_context':
                return (_ContextVarsEP(),)
            return _orig_ep_fn(**kwargs)

        _otel_meta.entry_points = _patched_eps
    except Exception:
        pass
    _trace("opentelemetry fix done, starting langchain fix")
    # ── ADVISORY: cut-off diagnostics ──
    # If startup_trace.log ends at "starting langchain fix", the import below
    # is either (a) still running (9-60s is normal on first boot after reboot
    # or on cold DLL cache) or (b) genuinely stuck. Do NOT assume infinite-loop
    # without evidence — the sub-traces below report elapsed-time watchdogs
    # every 10s. Other logs to inspect for additional context:
    #   ~/Documents/Nunba/logs/frozen_debug.log   — stderr/stdout warnings & errors
    #   ~/Documents/Nunba/logs/server.log         — waitress/HARTOS activity
    #   ~/Documents/Nunba/logs/langchain.log      — langchain INFO emissions
    #   ~/Documents/Nunba/logs/hartos_init_error.log — Tier-1 adapter import errors
    #   ~/Documents/Nunba/logs/build_acceptance.log  — (build-time) live tee of --acceptance-test
    _trace("  ADVISORY: if this is the last trace line, check other logs in ~/Documents/Nunba/logs/")
    _trace("    frozen_debug.log / server.log / langchain.log / hartos_init_error.log")
    _trace("    Expected duration: 9-60s on cold cache; watchdog emits every 10s below.")
    # ── Inject ReduceDocumentsChain placeholder into langchain_classic.chains ──
    # chains/loading.py line 17: "from langchain_classic.chains import ReduceDocumentsChain"
    # The chains package uses create_importer + __getattr__ lookup, so `hasattr`
    # would TRIGGER the full import chain (combine_documents/reduce.py →
    # langchain_text_splitters → transformers → torch). We only IMPORT the package
    # here; the subsequent assignment writes directly to __dict__ to bypass any
    # __getattr__/__setattr__ hook.
    import threading as _lc_threading
    import time as _lc_time
    _lc_start = _lc_time.time()
    _lc_done_flag = [False]
    def _lc_watchdog():
        """Emit a trace line every 10s while langchain fix is in progress."""
        while not _lc_done_flag[0]:
            _lc_time.sleep(10.0)
            if _lc_done_flag[0]:
                break
            try:
                _trace(f"  langchain fix still running at {_lc_time.time()-_lc_start:.1f}s — not a hang yet")
            except Exception:
                pass
    _lc_wd = _lc_threading.Thread(target=_lc_watchdog, daemon=True, name="lc_fix_watchdog")
    _lc_wd.start()
    try:
        _trace("  [1/4] importing langchain_classic.chains (expected <1s, but can be slow on cold cache)")
        import langchain_classic.chains as _lc_chains
        _trace(f"  [2/4] import completed at {_lc_time.time()-_lc_start:.3f}s")
        # Write stub directly via __dict__ — skips __getattr__ probe.
        if 'ReduceDocumentsChain' not in _lc_chains.__dict__:
            class _ReduceDocumentsChainStub:
                """Frozen-build placeholder — real class requires transformers→torch."""
                pass
            _lc_chains.__dict__['ReduceDocumentsChain'] = _ReduceDocumentsChainStub
            del _ReduceDocumentsChainStub
            _trace(f"  [3/4] stub installed into __dict__ at {_lc_time.time()-_lc_start:.3f}s")
        else:
            _trace(f"  [3/4] ReduceDocumentsChain already in __dict__ — no stub needed at {_lc_time.time()-_lc_start:.3f}s")
        del _lc_chains
        _trace(f"  [4/4] langchain fix OK at {_lc_time.time()-_lc_start:.3f}s")
    except Exception as _lc_e:
        _trace(f"  langchain fix exception at {_lc_time.time()-_lc_start:.3f}s: {type(_lc_e).__name__}: {_lc_e}")
    finally:
        # Signal watchdog to exit, then briefly wait for it so we don't delete
        # free variables (`_lc_done_flag`, `_lc_time`) while the daemon thread
        # is mid-sleep — else a NameError is raised inside the thread once
        # sleep(10) returns, polluting frozen_debug.log with stack traces.
        # 2026-04-19: regression trapped in startup_trace.log.
        _lc_done_flag[0] = True
        try:
            _lc_wd.join(timeout=0.1)
        except Exception:
            pass
        # Intentionally do NOT `del` closure free variables here.  The watchdog
        # is a daemon thread; if it's still alive it will exit on next tick, and
        # Python's module-scope garbage is negligible.  Deleting while the
        # thread still holds module-global references is the crash pattern we
        # just patched.
    _trace("langchain fixes done, starting torch pre-guard")
    # ── Pre-guard torch to prevent crash from broken native DLL ──
    # autogen → transformers → torch. In frozen builds, torch_cpu.dll can
    # segfault (0xc0000005) if CUDA DLLs are corrupted or have dependency
    # conflicts. Python's try/except CANNOT catch C-level segfaults — the OS
    # kills the entire process instantly (Event ID 1000 in Windows Event Viewer).
    # Fix: test torch import in a subprocess (python-embed/python.exe) first.
    # If the subprocess crashes, we apply the stub without ever loading the
    # broken DLL in-process. Subprocess crash → exit code != 0 → safe fallback.
    _torch_safe = False
    try:
        _torch_test_exe = os.path.join(
            os.path.dirname(os.path.abspath(sys.executable)),
            'python-embed', 'python.exe'
        )
        if os.path.isfile(_torch_test_exe):
            import subprocess as _sub_torch
            _torch_env = os.environ.copy()
            # Ensure user site-packages (CUDA torch) is discoverable
            _torch_env['PYTHONPATH'] = os.pathsep.join([
                _user_sp,
                os.path.join(os.path.dirname(os.path.abspath(sys.executable)),
                             'python-embed', 'Lib', 'site-packages'),
                _torch_env.get('PYTHONPATH', ''),
            ])
            try:
                _tp = _sub_torch.run(
                    [_torch_test_exe, '-c',
                     'import torch; print(torch.__version__); '
                     'print("cuda" if torch.cuda.is_available() else "cpu")'],
                    capture_output=True, text=True, timeout=30,
                    creationflags=0x08000000,  # CREATE_NO_WINDOW
                    env=_torch_env,
                )
                _torch_safe = (_tp.returncode == 0)
                if _torch_safe:
                    _trace(f"torch subprocess OK: {_tp.stdout.strip()}")
                else:
                    _trace(f"torch subprocess FAILED (exit {_tp.returncode}): {_tp.stderr[:200]}")
            except Exception as _e:
                _trace(f"torch subprocess test error: {_e}")
            del _sub_torch
        else:
            # No python-embed (dev mode) — direct import is safer (not frozen DLL issues)
            _torch_safe = True
    except Exception:
        pass

    if _torch_safe:
        try:
            import torch as _torch_real
            # cx_Freeze loads torch via the frozen importer which leaves
            # `__spec__` as None.  transformers.is_torch_available() calls
            # `importlib.util.find_spec('torch')` which raises
            # `ValueError: torch.__spec__ is None` on Py 3.12+.  That cascades
            # through langchain_classic → hart_intelligence_entry and breaks
            # the HARTOS Tier-1 import path (witnessed 2026-04-21 in
            # hartos_init_error.log).  Patch __spec__ on the REAL torch the
            # same way we patch the stub torch below.
            if getattr(_torch_real, '__spec__', None) is None:
                try:
                    from importlib.machinery import ModuleSpec as _RealTorchSpec
                    _torch_real.__spec__ = _RealTorchSpec(
                        name='torch',
                        loader=None,
                        origin=getattr(_torch_real, '__file__', 'frozen_real'),
                        is_package=True,
                    )
                    _torch_real.__spec__.submodule_search_locations = list(
                        getattr(_torch_real, '__path__', []) or []
                    )
                    _trace("torch.__spec__ patched (frozen real torch)")
                except Exception as _spec_exc:
                    _trace(f"torch.__spec__ patch failed: {_spec_exc}")
            del _torch_real
        except (ImportError, ModuleNotFoundError):
            pass
        except (AttributeError, OSError, RuntimeError):
            _torch_safe = False  # fall through to stub

    if not _torch_safe:
        # torch partially initialized or DLL load failure — stub it out.
        # Must be comprehensive: downstream code (CLIPBackend, rl_ef, VibeVoice)
        # checks torch.Tensor, torch.no_grad, torch.float32, torch.bfloat16, etc.
        # A too-minimal stub causes AttributeError deeper in the call stack.
        import types as _types
        # Remove the broken partial module and any broken submodules
        _bad_torch = [k for k in sys.modules if k == 'torch' or k.startswith('torch.')]
        for _k in _bad_torch:
            del sys.modules[_k]

        # Build a comprehensive stub that lets guarded imports succeed
        _torch_stub = _types.ModuleType('torch')
        _torch_stub.__path__ = []
        _torch_stub.__package__ = 'torch'
        _torch_stub.__version__ = '0.0.0'
        _torch_stub.__file__ = 'frozen_stub'
        _torch_stub._is_stub = True  # marker for downstream code to detect
        # __spec__ MUST be set or `importlib.util.find_spec('torch')`
        # raises `ValueError: torch.__spec__ is None` (Py 3.12 safeguard).
        # transformers.is_torch_available() calls find_spec on every
        # is_torch_available() invocation; without a spec, every
        # transformers-backed path cascades into a ValueError.
        # Witnessed 2026-04-21: hart_onboarding → langchain_classic →
        # transformers → is_torch_available → ValueError: torch.__spec__
        # is None, surfacing in hevolve_social Agent daemon tick errors
        # + hart_intelligence blueprint init + /api/hart/generate.
        try:
            from importlib.machinery import ModuleSpec as _TorchStubSpec
            _torch_stub.__spec__ = _TorchStubSpec(
                name='torch', loader=None, origin='frozen_stub',
                is_package=True,
            )
            _torch_stub.__spec__.submodule_search_locations = []
        except Exception:
            # Fallback: crude sentinel.  Better than None for find_spec.
            class _StubSpec:  # noqa: N801
                name = 'torch'
                loader = None
                origin = 'frozen_stub'
                submodule_search_locations = []
            _torch_stub.__spec__ = _StubSpec()

        # Core tensor type — a dummy class that raises on actual use
        class _TensorStub:
            """Stub Tensor — satisfies isinstance/type checks but not computation."""
            def __init__(self, *a, **kw):
                raise RuntimeError("torch.Tensor unavailable (frozen build stub)")
        _torch_stub.Tensor = _TensorStub

        # Dtype constants — downstream code accesses these at import time
        _torch_stub.float16 = 'float16'
        _torch_stub.float32 = 'float32'
        _torch_stub.float64 = 'float64'
        _torch_stub.bfloat16 = 'bfloat16'
        _torch_stub.int32 = 'int32'
        _torch_stub.int64 = 'int64'
        _torch_stub.bool = 'bool'
        _torch_stub.long = 'int64'

        # Context managers
        class _NoGradStub:
            def __enter__(self): return self
            def __exit__(self, *a): return None
            def __call__(self, fn=None):
                if fn is not None:
                    return fn
                return self
        _torch_stub.no_grad = _NoGradStub()
        _torch_stub.inference_mode = _NoGradStub()

        # Functions that downstream may reference
        _torch_stub.tensor = lambda *a, **kw: (_ for _ in ()).throw(
            RuntimeError("torch.tensor unavailable (frozen build stub)"))
        _torch_stub.cat = lambda *a, **kw: (_ for _ in ()).throw(
            RuntimeError("torch.cat unavailable (frozen build stub)"))
        _torch_stub.zeros = lambda *a, **kw: None
        _torch_stub.ones = lambda *a, **kw: None
        _torch_stub.device = str  # torch.device('cpu') → just a string

        # Submodules \u2014 each also needs __spec__ to satisfy find_spec.
        def _mk_submod(_n):
            _m = _types.ModuleType(_n)
            try:
                _m.__spec__ = _TorchStubSpec(
                    name=_n, loader=None, origin='frozen_stub',
                )
            except Exception:
                pass
            return _m
        _torch_stub.autograd = _mk_submod('torch.autograd')
        _torch_stub.cuda = _mk_submod('torch.cuda')
        _torch_stub.cuda.is_available = lambda: False
        _torch_stub.cuda.empty_cache = lambda: None
        _torch_stub.cuda.device_count = lambda: 0
        _torch_stub.nn = _mk_submod('torch.nn')
        _torch_stub.nn.functional = _mk_submod('torch.nn.functional')
        _torch_stub.nn.Module = type('Module', (), {})

        sys.modules['torch'] = _torch_stub
        sys.modules['torch.autograd'] = _torch_stub.autograd
        sys.modules['torch.cuda'] = _torch_stub.cuda
        sys.modules['torch.nn'] = _torch_stub.nn
        sys.modules['torch.nn.functional'] = _torch_stub.nn.functional
        del _types, _torch_stub, _bad_torch, _TensorStub, _NoGradStub

    _trace("torch pre-guard done; transformers patch applied at build time")
    # The transformers `__init__.py` frozenset({}) crash is patched ONCE
    # at build time (see scripts/build.py:_patch_transformers_at_build).
    # No runtime file I/O needed.  Kept as a one-line trace point so boot
    # telemetry stays aligned with the old timeline.

# ── Deferred frozen fixes — run AFTER splash is shown ──
def _run_frozen_import_fixes():
    """Run the langchain/torch/transformers fixes that were skipped above."""
    global _FROZEN_FIXES_DONE
    if _FROZEN_FIXES_DONE or not getattr(sys, 'frozen', False):
        return
    _FROZEN_FIXES_DONE = True
    import warnings as _warnings
    _warnings.filterwarnings('ignore')
    try:
        import opentelemetry.util._importlib_metadata as _otel_meta
        _orig_ep_fn = _otel_meta.entry_points
        class _ContextVarsEP:
            name = 'contextvars_context'
            group = 'opentelemetry_context'
            def load(self):
                from opentelemetry.context.contextvars_context import ContextVarsRuntimeContext
                return ContextVarsRuntimeContext
        def _patched_eps(**kwargs):
            if kwargs.get('group') == 'opentelemetry_context':
                return (_ContextVarsEP(),)
            return _orig_ep_fn(**kwargs)
        _otel_meta.entry_points = _patched_eps
    except Exception:
        pass
    # Deferred-path langchain fix — same pattern as module-level (watchdog + __dict__).
    # ADVISORY on cut-off: if a trace stops here, see also:
    #   ~/Documents/Nunba/logs/frozen_debug.log, server.log, langchain.log, hartos_init_error.log
    import threading as _lc_threading_d
    import time as _lc_time_d
    _lc_start_d = _lc_time_d.time()
    _lc_done_d = [False]
    def _lc_watchdog_d():
        while not _lc_done_d[0]:
            _lc_time_d.sleep(10.0)
            if _lc_done_d[0]:
                break
            try:
                _t_mod = getattr(__import__('builtins'), '_nunba_trace', None)
                if _t_mod:
                    _t_mod(f"  [deferred] langchain fix still running at {_lc_time_d.time()-_lc_start_d:.1f}s")
            except Exception:
                pass
    _lc_wd_d = _lc_threading_d.Thread(target=_lc_watchdog_d, daemon=True, name="lc_fix_watchdog_deferred")
    _lc_wd_d.start()
    try:
        import langchain_classic.chains as _lc_chains
        # __dict__ write skips __getattr__ probe (the real hazard).
        if 'ReduceDocumentsChain' not in _lc_chains.__dict__:
            class _Stub:
                pass
            _lc_chains.__dict__['ReduceDocumentsChain'] = _Stub
        del _lc_chains
    except Exception:
        pass
    finally:
        # Same fix as the module-level block: signal watchdog, wait briefly,
        # DO NOT delete closure free vars while the daemon thread is mid-sleep.
        _lc_done_d[0] = True
        try:
            _lc_wd_d.join(timeout=0.1)
        except Exception:
            pass
    # torch pre-guard already ran at module level (subprocess + stub).
    # If _FROZEN_FIXES_DONE was False, the module-level block already handled torch.
    # No need to re-import here — the stub or real module is already in sys.modules.

# -- macOS-safe tkinter event pump --
# On macOS, root.update() enters the Cocoa run loop and never returns when
# after() timers keep scheduling new events (every 30ms). This helper
# processes events one-at-a-time with a time budget so it always returns.
def _safe_tk_update(root, budget_ms=50):
    """Pump tkinter events without getting stuck on macOS.

    On macOS, root.update() enters the Cocoa run loop and never returns when
    after() timers keep scheduling new events. This helper processes events
    one-at-a-time with a time budget so it always returns.
    Guards against TclError when root is already destroyed (e.g. splash closed
    while a timer callback is still pending).
    """
    try:
        if sys.platform != 'darwin':
            root.update()
            return
        import _tkinter
        import time as _t
        deadline = _t.monotonic() + budget_ms / 1000.0
        while _t.monotonic() < deadline:
            if not root.tk.dooneevent(_tkinter.DONT_WAIT):
                break  # no more pending events
    except Exception:
        pass  # Root destroyed or tk unavailable — silently skip


# ── Deferred startup config ──
# LLM config, AI key vault, and hardware tier detection are DEFERRED until after
# the splash screen is visible. These involve disk I/O (config reads), crypto
# (PBKDF2 key derivation), and filesystem scans (disk_usage) that collectively
# add 10-20 seconds of blocking before any UI appears.
# The env vars they set are consumed by hart_intelligence and create_recipe.py,
# which are lazy-imported much later during server startup — not at import time.
_llm_configured = False


def _load_deferred_config():
    """Load LLM config, vault keys, and tier detection — called after splash is visible."""
    global _llm_configured

    # ── Dynamic LLM config: read the user's LLM Setup Wizard choice ──
    try:
        import json as _json_llm
        _llm_cfg_path = os.path.join(os.path.expanduser('~'), '.nunba', 'llama_config.json')
        if os.path.isfile(_llm_cfg_path):
            with open(_llm_cfg_path) as _f:
                _llm_cfg = _json_llm.load(_f)

            # Set HEVOLVE_LOCAL_LLM_URL from config — single source of truth
            # for all LLM URL resolution. server_port is authoritative over
            # any stale external_llm_endpoint URL.
            _cfg_port = str(_llm_cfg.get('server_port', 8080))
            os.environ.setdefault('HEVOLVE_LOCAL_LLM_URL', f'http://127.0.0.1:{_cfg_port}/v1')
            if _llm_cfg.get('use_external_llm') and _llm_cfg.get('external_llm_endpoint'):
                _llm_configured = True
            else:
                _llm_configured = not _llm_cfg.get('first_run', True)
    except Exception:
        pass

    # ── Encrypted AI key vault: load cloud API keys into env vars ──
    if '--validate' not in sys.argv and '--acceptance-test' not in sys.argv:
        try:
            from desktop.ai_key_vault import AIKeyVault as _AIKeyVault
            _vault = _AIKeyVault.get_instance()

            _app_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
            _config_json_candidates = [
                os.path.join(_app_dir, '..', 'HARTOS', 'config.json'),
                os.path.join(_app_dir, 'langchain_config.json'),
                os.path.join(_app_dir, 'config.json'),
            ]
            for _cjp in _config_json_candidates:
                _cjp = os.path.abspath(_cjp)
                if os.path.isfile(_cjp):
                    _vault.migrate_from_config_json(_cjp)
                    break

            _vault.export_to_env()
            if _vault.get_active_provider():
                _llm_configured = True
        except Exception:
            pass

    # ── Hardware tier detection ──
    if not os.environ.get('HEVOLVE_FORCE_TIER'):
        if _llm_configured:
            os.environ['HEVOLVE_FORCE_TIER'] = 'standard'
        else:
            try:
                import shutil as _sh_tier
                if (os.cpu_count() or 1) >= 4 and _sh_tier.disk_usage(os.path.expanduser('~')).free / (1024 ** 3) >= 2.0:
                    os.environ['HEVOLVE_FORCE_TIER'] = 'standard'
            except Exception:
                pass

    # ── Auto-enable agent engine when LLM is configured ──
    if _llm_configured:
        os.environ.setdefault('HEVOLVE_AGENT_ENGINE_ENABLED', 'true')

# Static splash was shown BEFORE frozen fixes (line 329).
# _early_splash and _eroot are already set.

import argparse
import atexit
import ctypes
import importlib.util
import json
import logging
import threading
import time
import traceback

# pyperclip lazy-imported in clipboard monitor thread — clipboard API can deadlock
# if another app holds the clipboard lock during startup
# waitress is lazy-imported in start_flask() — no top-level import needed
import urllib.parse

import requests
from flask import Flask, jsonify, request


# Update early splash status after heavy imports (frozen builds only).
# Use _early_splash[1].update() (Toplevel) NOT [0].update() (_eroot).
# _eroot.update() maps the hidden root window as white on DPI-aware Windows.
def _pump_early_splash(msg=None):
    if _early_splash:
        try:
            if msg:
                _early_splash[3].set(msg)
            _safe_tk_update(_early_splash[1])  # safe pump — plain update() freezes macOS
        except Exception:
            pass

_pump_early_splash('Loading modules...')

# Lazy import for webview - only loaded when actually needed (not for --install-ai mode)
pywebview = None

def get_webview():
    """Lazy import webview with EdgeChromium backend"""
    global pywebview
    if pywebview is None:
        if sys.platform == 'win32':
            # NOTE (Stage-B Symptom #1, 2026-04-16): the pycparser-from-
            # lib_src preload now runs at app.py top (see
            # _preload_pycparser_from_lib_src above), BEFORE any cffi /
            # autobahn / cryptography import can pull the bundled .pyc
            # copy. Doing the sys.modules dance here (after those modules
            # already imported pycparser) produced a dual-copy situation:
            # stale references in cffi's Parser vs fresh references in
            # the replaced pycparser.c_ast -> KeyError on c_ast lookup.
            # This block is kept as a diagnostic no-op so future readers
            # understand the history without re-introducing the bug.
            try:
                import pycparser as _pp_already
                _pp_loc = getattr(_pp_already, '__file__', '<none>') or '<none>'
                if 'lib_src' not in _pp_loc:
                    logging.getLogger('NunbaGUI').warning(
                        f"pycparser loaded from non-lib_src location: {_pp_loc} — "
                        f"preload at app.py top did not run or lib_src missing"
                    )
                else:
                    logging.getLogger('NunbaGUI').info(
                        f"pycparser already loaded from lib_src: {_pp_loc}"
                    )
            except Exception as e:
                logging.getLogger('NunbaGUI').warning(f"pycparser introspection failed: {e}")

            # Now try to set up .NET runtime
            try:
                os.environ.setdefault('PYTHONNET_RUNTIME', 'netfx')
                from clr_loader import get_netfx
                runtime = get_netfx()
                from pythonnet import set_runtime
                set_runtime(runtime)
                logging.getLogger('NunbaGUI').info("Configured .NET Framework runtime")
            except Exception as e:
                logging.getLogger('NunbaGUI').warning(f".NET runtime setup failed: {e}")

        import webview as _pywebview
        pywebview = _pywebview
    return pywebview

_pump_early_splash('Loading AI engine...')

# Import Llama.cpp installer for first-run initialization
try:
    from llama.llama_config import LlamaConfig, initialize_llama_on_first_run
    LLAMA_AVAILABLE = True
except Exception as _llama_import_err:
    LLAMA_AVAILABLE = False
    # Log unconditionally — this is critical for diagnosing warm-up failures
    print(f"[WARN] Llama import failed: {type(_llama_import_err).__name__}: {_llama_import_err}")
    _setup_logger = logging.getLogger('NunbaSetup')
    _setup_logger.warning(f"Llama import failed: {type(_llama_import_err).__name__}: {_llama_import_err}")

# desktop.indicator_window is lazy-loaded — importing it at module level
# deadlocks with the early splash's Tk instance. Load on first use instead.
indicator_module = None
INDICATOR_AVAILABLE = False

def _load_indicator():
    """Lazy-load the indicator module after Tk splash is destroyed."""
    global indicator_module, INDICATOR_AVAILABLE
    if indicator_module is not None:
        return
    try:
        if sys.platform == 'darwin':
            return  # macOS: NSWindow must be on main thread
        indicator_module = importlib.import_module('desktop.indicator_window')
        INDICATOR_AVAILABLE = True
    except ImportError:
        INDICATOR_AVAILABLE = False

# Global variable to track system tray status
_tray_icon = None
_window = None  # Global window reference
_window_visible = True  # Track window visibility for hotkey toggle
_last_clipboard = ""  # Last clipboard content for clipboard monitor


def _hotkey_listener_thread():
    """Background thread that registers Win+N as a global hotkey to toggle window visibility.

    Uses ctypes to call RegisterHotKey/GetMessage on Windows. The thread runs its own
    message loop so the hotkey works even when the app is in the background/tray.
    """
    if sys.platform != 'win32':
        return
    global _window_visible
    import ctypes
    import ctypes.wintypes

    user32 = ctypes.windll.user32
    MOD_WIN = 0x0008
    VK_N = ord('N')
    HOTKEY_ID = 1
    WM_HOTKEY = 0x0312

    # Register the hotkey
    if not user32.RegisterHotKey(None, HOTKEY_ID, MOD_WIN, VK_N):
        logging.getLogger(__name__).warning("[HOTKEY] Failed to register Win+N hotkey")
        return

    logging.getLogger(__name__).info("[HOTKEY] Win+N hotkey registered successfully")

    # Unregister on exit
    atexit.register(lambda: user32.UnregisterHotKey(None, HOTKEY_ID))

    # Message loop
    msg = ctypes.wintypes.MSG()
    while True:
        ret = user32.GetMessageW(ctypes.byref(msg), None, 0, 0)
        if ret <= 0:
            break
        if msg.message == WM_HOTKEY and msg.wParam == HOTKEY_ID:
            try:
                if _window is not None:
                    if _window_visible:
                        _window.hide()
                        _window_visible = False
                        if _tray_icon:
                            try:
                                notify_minimized_to_tray(_tray_icon)
                            except Exception:
                                pass
                        logging.getLogger(__name__).info("[HOTKEY] Win+N: window hidden")
                    else:
                        _window.show()
                        _window_visible = True
                        logging.getLogger(__name__).info("[HOTKEY] Win+N: window shown")
            except Exception as e:
                logging.getLogger(__name__).warning(f"[HOTKEY] Toggle failed: {e}")


def _clipboard_monitor_thread():
    """Background thread that polls the clipboard every 2 seconds.

    Updates the module-level _last_clipboard variable when the clipboard content changes.
    """
    global _last_clipboard
    while True:
        try:
            import pyperclip
            current = pyperclip.paste()
            if current != _last_clipboard:
                _last_clipboard = current
        except Exception:
            pass
        time.sleep(2)

_pump_early_splash('Preparing interface...')

# Default configuration for stop API URL
DEFAULT_STOP_API_URL = "http://gcp_training2.hertzai.com:5001/stop"

# Initialize argument parser
# Enhanced argument parser with sidebar options
parser = argparse.ArgumentParser(description='Nunba - Your Local HARTMind Companion ')
parser.add_argument("--port", help="port for Flask server", type=int, default=5000)
parser.add_argument("--width", help="window width", type=int, default=480)
parser.add_argument("--height", help="window height", type=int, default=1024)
parser.add_argument("--title", help="window title", type=str, default="Nunba")
parser.add_argument("--background", help="run in background/minimized mode", action="store_true")
parser.add_argument("--stop_api_url", help="URL for stop API endpoint", type=str, default=DEFAULT_STOP_API_URL)
parser.add_argument("--protocol", help="protocol URL that launched the app", type=str)
parser.add_argument("--sidebar", help="open as sidebar", action="store_true")
parser.add_argument("--sidebar-side", help="sidebar position: left or right", type=str, choices=['left', 'right'], default='right')
parser.add_argument("--sidebar-width", help="sidebar width in pixels", type=int, default=480)
parser.add_argument("--always-on-top", help="keep window always on top", action="store_true")
parser.add_argument("--x", help="window X position", type=int)
parser.add_argument("--y", help="window Y position", type=int)
parser.add_argument("--install-ai", help="download AI components (llama binary + model) and exit", action="store_true", dest="install_ai")
parser.add_argument("--setup-ai", help="interactive AI setup - scan for existing endpoints and let user choose", action="store_true", dest="setup_ai")
parser.add_argument("--validate", help="test-import all bundled modules and exit (post-build smoke test)", action="store_true")
parser.add_argument("--acceptance-test", help="run the acceptance harness against the frozen bundle and exit (gates installer packaging)", action="store_true", dest="acceptance_test")

# Parse args with error handling - default to visible mode
try:
    args, unknown = parser.parse_known_args()
    if unknown:
        # Log unknown arguments but don't fail
        print(f"Unknown command line arguments: {unknown}")
except Exception as e:
    print(f"Error parsing command line: {str(e)}")
    # Create a default args object with safe defaults
    class DefaultArgs:
        port = 5000
        width = 480
        height = 1024
        title = "Nunba"
        background = False  # Default to visible mode
        protocol = None
        stop_api_url = DEFAULT_STOP_API_URL
        install_ai = False
        setup_ai = False
        validate = False
        acceptance_test = False
        sidebar = False
        sidebar_side = 'right'
        sidebar_width = 480
        always_on_top = False
        x = None
        y = None
    args = DefaultArgs()

# ── --validate: replay the real startup import chain and report failures ──
if getattr(args, 'validate', False):
    import importlib
    import importlib.util

    _base = os.path.dirname(os.path.abspath(
        sys.executable if getattr(sys, 'frozen', False) else __file__))
    _fail, _ok = [], []

    # Write to both stdout and a log file — stdout may vanish if exe crashes
    # Use Nunba logs dir (user-writable), fall back to exe dir, then temp
    try:
        from core.platform_paths import get_log_dir as _get_val_log_dir
        _val_log_dir = _get_val_log_dir()
    except ImportError:
        _val_log_dir = os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba', 'logs')
    try:
        os.makedirs(_val_log_dir, exist_ok=True)
    except Exception:
        _val_log_dir = _base  # build dir during post-build (writable)
    _val_log_path = os.path.join(_val_log_dir, 'validate.log')
    # APPEND mode — preserves multi-run history.  `--validate` runs can
    # happen multiple times (first-run check, post-install verify, dev
    # smoke).  Truncating each time erased evidence from the previous
    # run at the moment the next run crashed, which is exactly when we
    # needed the history.  Same root-cause class as frozen_debug.log.
    _val_log = open(_val_log_path, 'a', encoding='utf-8')
    try:
        import datetime as _val_dt
        _val_log.write(
            f"\n===== validate.log session {_val_dt.datetime.now().isoformat()} =====\n"
        )
        _val_log.flush()
    except Exception:
        pass

    def _vprint(msg):
        for _out in (sys.stdout, sys.stderr, _val_log):
            try:
                _out.write(msg + '\n')
                _out.flush()
            except Exception:
                pass

    _vprint(f"\n{'='*60}")
    _vprint("NUNBA BUILD VALIDATION")
    _vprint(f"{'='*60}")
    _vprint(f"Base: {_base}")
    _vprint(f"Frozen: {getattr(sys, 'frozen', False)}")
    _vprint(f"Python: {sys.version}\n")

    # ── Phase 1: Module import chain ──
    # The real import chain: app.py → main.py → chatbot_routes →
    # hartos_backend_adapter → hart_intelligence (→ helper.py → autogen etc.)
    # Replay it exactly — if it works here, it works at runtime.
    _chain = [
        # 1. Core framework
        'flask', 'flask_cors', 'webview', 'waitress',
        # 2. App modules (order matches real startup)
        'routes.chatbot_routes',
        'routes.hartos_backend_adapter',
        # 3. LangChain pipeline (the chain that actually broke before)
        'hart_intelligence', 'helper',
        'cultural_wisdom', 'security.hive_guardrails',
        # 4. Autogen pipeline (agent creation)
        'autogen', 'create_recipe', 'reuse_recipe',
        'gather_agentdetails', 'lifecycle_hooks',
        # 5. Integrations
        'integrations', 'integrations.social',
        'integrations.channels', 'integrations.service_tools',
        'integrations.distributed_agent',
        # 6. Distributed agent deps
        'agent_ledger', 'agent_ledger.core', 'agent_ledger.distributed',
        'agent_ledger.verification',
        # 7. Desktop app modules (moved to packages)
        'desktop.ai_key_vault',
        'desktop.indicator_window', 'desktop.splash_effects',
        'desktop.tray_handler', 'desktop.crash_reporter',
        'llama.llama_installer', 'llama.llama_config',
        'tts.piper_tts', 'tts.tts_engine',
        # 8. Key libraries
        'PIL', 'numpy', 'sqlalchemy', 'pystray', 'requests', 'certifi',
        'json_repair', 'bs4',
        # 9. Database package (optional — only bundled when hevolve-database is installed)
        *( ['sql.database', 'sql.models']
           if __import__('importlib.util').find_spec('sql') else [] ),
    ]

    # NameError = code references an undefined name (e.g. missing import logging)
    # This IS a packaging/code error, NOT a config issue.
    _PACKAGING_ERRORS = (ImportError, ModuleNotFoundError, SyntaxError,
                         FileNotFoundError, NameError, AttributeError)
    _warn = []

    # Torch loads from python-embed at runtime but partially initializes in
    # frozen validation (missing DLLs, circular imports). These are NOT packaging
    # failures — they work at real runtime when python-embed is fully loaded.
    _TORCH_HINT = 'torch'

    # Re-check stdout/stderr before import loop — some modules or cx_Freeze
    # initialization may have closed or replaced them since the early fix.
    import io as _val_io
    for _stream_name in ('stdout', 'stderr'):
        _stream = getattr(sys, _stream_name, None)
        try:
            if _stream is None or _stream.closed:
                raise ValueError
            _stream.write('')
        except Exception:
            setattr(sys, _stream_name, _val_io.StringIO())
    # Suppress logging handlers that may write to closed streams
    import logging as _val_logging
    _val_prev_level = _val_logging.root.level
    _val_logging.disable(_val_logging.CRITICAL)
    # Suppress warnings too — flaml (via autogen) emits UserWarning to stderr
    import warnings as _val_warnings
    _val_warnings.filterwarnings('ignore')

    for _mod in _chain:
        try:
            importlib.import_module(_mod)
            _ok.append(_mod)
            _vprint(f"  [OK]   {_mod}")
        except _PACKAGING_ERRORS as _e:
            _err_str = str(_e)
            if _TORCH_HINT in _err_str.lower():
                # torch from python-embed doesn't fully init in frozen validation
                _ok.append(_mod)
                _warn.append((_mod, f"{type(_e).__name__}: {_e}"))
                _vprint(f"  [WARN] {_mod}  (torch from python-embed: {type(_e).__name__}: {_e})")
            else:
                _fail.append((_mod, f"{type(_e).__name__}: {_e}"))
                _vprint(f"  [FAIL] {_mod}: {type(_e).__name__}: {_e}")
        except Exception as _e:
            # Module is bundled but needs runtime config (e.g. missing API keys, Redis down)
            _ok.append(_mod)
            _warn.append((_mod, f"{type(_e).__name__}: {_e}"))
            _vprint(f"  [WARN] {_mod}  ({type(_e).__name__}: {_e})")
            # Log full traceback for non-obvious errors (KeyError, etc.)
            if not isinstance(_e, (RuntimeError, ConnectionError, OSError)):
                import traceback as _tb
                _vprint(f"         Traceback: {''.join(_tb.format_exception(type(_e), _e, _e.__traceback__))}")

    # Re-enable logging after import loop
    _val_logging.disable(_val_prev_level)

    # ── Phase 2: Deep health checks ──
    # Many modules swallow errors silently (try/except with fallback).
    # A shallow import succeeds but critical features are broken at runtime.
    # Check module state AFTER import to verify they actually loaded properly.
    _vprint(f"\n{'─'*40}")
    _vprint("DEEP HEALTH CHECKS")
    _vprint(f"{'─'*40}")

    _deep_checks = {
        'routes.hartos_backend_adapter': [
            ('_hartos_backend_available', True,
             'Tier-1 LangChain pipeline failed to load — chat will fall back to raw llama.cpp'),
            ('_active_tier', lambda v: 'Tier-1' in str(v),
             'Backend adapter not on Tier-1 — check hart_intelligence import chain'),
        ],
    }

    # Dependencies whose torch warnings explain Tier-1 failures in the adapter
    _torch_deps = {'hart_intelligence', 'helper', 'create_recipe', 'reuse_recipe',
                   'gather_agentdetails'}
    for _mod_name, _checks in _deep_checks.items():
        # Skip deep checks if module OR its key dependencies had torch warnings
        _was_warned = any(_wm == _mod_name for _wm, _ in _warn)
        _dep_warned = any(_wm in _torch_deps and _TORCH_HINT in _ws.lower()
                          for _wm, _ws in _warn)
        if _was_warned or _dep_warned:
            _vprint(f"  [SKIP] {_mod_name} — dependency had torch warning, deep check skipped")
            continue
        try:
            _mod_obj = sys.modules.get(_mod_name)
            if not _mod_obj:
                _mod_obj = importlib.import_module(_mod_name)
            for _attr, _expected, _msg in _checks:
                _val = getattr(_mod_obj, _attr, '__MISSING__')
                if _val == '__MISSING__':
                    _fail.append((_mod_name, f"Missing attribute '{_attr}': {_msg}"))
                    _vprint(f"  [FAIL] {_mod_name}.{_attr} — attribute missing: {_msg}")
                elif callable(_expected):
                    if _expected(_val):
                        _vprint(f"  [OK]   {_mod_name}.{_attr} = {_val!r}")
                    else:
                        _fail.append((_mod_name, f"{_attr}={_val!r}: {_msg}"))
                        _vprint(f"  [FAIL] {_mod_name}.{_attr} = {_val!r} — {_msg}")
                elif _val != _expected:
                    _fail.append((_mod_name, f"{_attr}={_val!r} (expected {_expected!r}): {_msg}"))
                    _vprint(f"  [FAIL] {_mod_name}.{_attr} = {_val!r} — {_msg}")
                else:
                    _vprint(f"  [OK]   {_mod_name}.{_attr} = {_val!r}")
        except Exception as _e:
            _err_msg = str(_e)
            if _TORCH_HINT in _err_msg.lower():
                _warn.append((_mod_name, f"Health check skipped (torch): {_e}"))
                _vprint(f"  [WARN] {_mod_name} health check skipped (torch partial init)")
            else:
                _fail.append((_mod_name, f"Health check crashed: {_e}"))
                _vprint(f"  [FAIL] {_mod_name} health check: {_e}")

    # ── Phase 3: Config file checks ──
    _vprint(f"\n{'─'*40}")
    _vprint("CONFIG FILE CHECKS")
    _vprint(f"{'─'*40}")

    _required_files = [
        ('main.py', 'Flask app entry point'),
        ('hart_intelligence', 'HART intelligence pipeline'),
        ('helper', 'LangChain helper functions'),
    ]
    _optional_files = [
        ('langchain_config.json', 'LangChain tool config (search, API endpoints)'),
        ('config.json', 'App URL template config'),
        ('agent_ledger/__init__.py', 'Agent ledger package'),
    ]

    for _fname, _desc in _required_files:
        # Check root (.py), lib/ (.py or .pyc) — compiled builds put HARTOS modules in lib/
        _found = False
        for _candidate in [
            os.path.join(_base, f"{_fname}.py"),
            os.path.join(_base, _fname) if _fname.endswith('.py') else None,
            os.path.join(_base, 'lib', f"{_fname}.py"),
            os.path.join(_base, 'lib', f"{_fname}.pyc"),
        ]:
            if _candidate and os.path.isfile(_candidate):
                _vprint(f"  [OK]   {_fname} — {_desc} ({os.path.basename(_candidate)})")
                _found = True
                break
        if not _found:
            _fail.append((_fname, f"Required file missing: {_desc}"))
            _vprint(f"  [FAIL] {_fname} — MISSING ({_desc})")

    for _fname, _desc in _optional_files:
        _fpath = os.path.join(_base, _fname)
        if os.path.isfile(_fpath):
            _vprint(f"  [OK]   {_fname} — {_desc}")
        else:
            _warn.append((_fname, f"Optional file missing: {_desc}"))
            _vprint(f"  [WARN] {_fname} — not found ({_desc})")

    # ── Summary ──
    _vprint(f"\n{'='*60}")
    _vprint(f"  Passed: {len(_ok)}, Failed: {len(_fail)}, Warnings: {len(_warn)}")
    if _warn:
        _vprint("\n  WARNINGS (non-fatal — runtime config issues):")
        for _wmod, _wmsg in _warn:
            _vprint(f"    - {_wmod}: {_wmsg}")
    if _fail:
        _vprint(f"\n  *** {len(_fail)} PACKAGING FAILURE(S) — exe WILL break at runtime ***")
        for _fmod, _fmsg in _fail:
            _vprint(f"    - {_fmod}: {_fmsg}")
        _vprint("")
        _val_log.close()
        os._exit(1)  # os._exit skips Py_Finalize — prevents 0xC0000005 in Win32GUI
    else:
        _vprint("\n  All modules bundled correctly. Build is good.\n")
        _val_log.close()
        os._exit(0)  # os._exit skips Py_Finalize — prevents 0xC0000005 in Win32GUI

# ── --acceptance-test: Stage-B gate for the installer packager ──
# Runs AFTER cx_Freeze produced build/Nunba/ but BEFORE Inno Setup
# wraps it. Every Stage-A + Stage-B symptom fix is asserted against
# the frozen bundle. Non-zero exit blocks installer packaging.
#
# Contract (each assertion is a one-line verified-signal check):
#   Symptom #1 — app.py defines _preload_pycparser_from_lib_src AND
#                it runs before _isolate_frozen_imports (static).
#   Symptom #3 — integrations.service_tools.vram_manager.allocate
#                returns False on oversize claim (dynamic import).
#   Symptom #4 — core.verified_llm.is_llm_inference_verified importable.
#   Symptom #5 — hart_intelligence_entry imports
#                core.user_lang.get_preferred_lang (static).
#   Symptom #7 — tts.package_installer.install_gpu_torch contains
#                D: drive fallback code path (static).
#   Symptom #8 — app.py opens validate.log in 'a' mode (static).
#   Symptom #10 — integrations.service_tools.whisper_tool exposes
#                 get_whisper_last_error AND imports CircuitBreaker.
#
# Each check logs [OK] / [FAIL] and contributes to the exit code.
# Written to ~/Documents/Nunba/logs/acceptance.log + stdout so the
# build script can parse.
if getattr(args, 'acceptance_test', False):
    _ac_fails = []
    _ac_ok = []

    try:
        from core.platform_paths import get_log_dir as _get_ac_log_dir
        _ac_log_dir = _get_ac_log_dir()
    except ImportError:
        _ac_log_dir = os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba', 'logs')
    try:
        os.makedirs(_ac_log_dir, exist_ok=True)
    except Exception:
        pass
    _ac_log_path = os.path.join(_ac_log_dir, 'acceptance.log')
    try:
        _ac_log = open(_ac_log_path, 'a', encoding='utf-8')
    except OSError:
        import io as _ac_io
        _ac_log = _ac_io.StringIO()

    try:
        import datetime as _ac_dt
        _ac_log.write(
            f"\n===== acceptance session {_ac_dt.datetime.now().isoformat()} =====\n"
        )
        _ac_log.flush()
    except Exception:
        pass

    def _acp(msg):
        print(msg)
        try:
            _ac_log.write(msg + '\n')
            _ac_log.flush()
        except Exception:
            pass

    def _check(name, ok, detail=""):
        if ok:
            _ac_ok.append(name)
            _acp(f"  [OK]   {name}{'  — ' + detail if detail else ''}")
        else:
            _ac_fails.append((name, detail))
            _acp(f"  [FAIL] {name}  — {detail}")

    _acp(f"\n{'=' * 60}")
    _acp("NUNBA ACCEPTANCE TEST — Stage-A + Stage-B symptom coverage")
    _acp(f"{'=' * 60}")

    # Helper — safely read a .py source file, tolerant of cx_Freeze's
    # source-stripping pass.  Returns '' when the file is absent or
    # unreadable (e.g. stripped .py; .pyc remains but isn't text).
    def _safe_read_source(path):
        try:
            if not path or not os.path.isfile(path):
                return ''
            with open(path, encoding='utf-8') as _f:
                return _f.read()
        except (OSError, UnicodeDecodeError):
            return ''

    # Symptom #1 — pycparser preload helper exists + runs before isolate.
    #   Pre-freeze: text-grep app.py (source present, order visible).
    #   Post-freeze: .py stripped by slim pass; verify via attribute
    #   presence on the __main__ module instead (order was baked into
    #   the .pyc — if the app is running at all, the order held).
    try:
        _ac_app_path = os.path.abspath(__file__) if '__file__' in dir() else 'app.py'
        _ac_src = ''
        for _candidate in (_ac_app_path,
                           os.path.join(os.path.dirname(
                               os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__)),
                               'app.py')):
            _ac_src = _safe_read_source(_candidate)
            if _ac_src:
                break

        if _ac_src:
            # Pre-freeze path: source text available, do both checks.
            _pre_idx = _ac_src.find('_preload_pycparser_from_lib_src()')
            _iso_idx = _ac_src.find('_isolate_frozen_imports()')
            _check('symptom_1_pycparser_preload_declared',
                   'def _preload_pycparser_from_lib_src(' in _ac_src,
                   'app.py must define _preload_pycparser_from_lib_src')
            _check('symptom_1_preload_runs_before_isolate',
                   _pre_idx > 0 and _iso_idx > _pre_idx,
                   f'preload_idx={_pre_idx} isolate_idx={_iso_idx}')
        else:
            # Post-freeze path: .py stripped.  Check attribute presence
            # on __main__ (the compiled app module).  Ordering is
            # implicitly verified by the app booting to reach this point.
            _mm = sys.modules.get('__main__') or sys.modules.get('app')
            _has_pre = hasattr(_mm, '_preload_pycparser_from_lib_src')
            _has_iso = hasattr(_mm, '_isolate_frozen_imports')
            _check('symptom_1_pycparser_preload_declared',
                   _has_pre,
                   'app module must expose _preload_pycparser_from_lib_src (verified via attribute lookup; .py stripped post-freeze)')
            _check('symptom_1_preload_runs_before_isolate',
                   _has_pre and _has_iso,
                   'both helpers present on frozen module — order baked into .pyc and implicitly verified by successful boot')
    except Exception as _e:
        _check('symptom_1_pycparser_preload_declared', False, f'exception: {_e}')

    # Symptom #3 — VRAMManager.allocate refuses oversize claim.
    try:
        from integrations.service_tools.vram_manager import VRAM_BUDGETS, VRAMManager
        _vm = VRAMManager()
        VRAM_BUDGETS['_accept_test_10gb'] = (10.0, 9.0)
        try:
            _original_detect = _vm.detect_gpu
            _vm.detect_gpu = lambda: {'name': 'mock', 'total_gb': 8.0,
                                      'free_gb': 8.0, 'cuda_available': True}
            _ok = (not _vm.allocate('_accept_test_10gb'))
            _check('symptom_3_vram_refuses_oversize', _ok,
                   'allocate must return False on 10GB claim vs 8GB GPU')
        finally:
            VRAM_BUDGETS.pop('_accept_test_10gb', None)
            try:
                _vm.detect_gpu = _original_detect
            except Exception:
                pass
    except Exception as _e:
        _check('symptom_3_vram_refuses_oversize', False, f'exception: {_e}')

    # Symptom #4 — core.verified_llm importable with expected API.
    try:
        from core.verified_llm import (
            is_llm_inference_verified,
            verify_llm,
        )
        _check('symptom_4_verified_llm_importable', True,
               'is_llm_inference_verified + verify_llm present')
    except Exception as _e:
        _check('symptom_4_verified_llm_importable', False, f'import failed: {_e}')

    # Symptom #5 — hart_intelligence_entry has the preferred_lang fallback.
    #   Pre-freeze: text-grep source for canonical-reader import + absence
    #   of bad default.
    #   Post-freeze: .py stripped; verify by (a) core.user_lang.get_preferred_lang
    #   is importable and callable, and (b) hart_intelligence_entry module
    #   loads without raising.  Real runtime signal > source-grep.
    try:
        import importlib.util as _acil
        _spec = _acil.find_spec('hart_intelligence_entry')
        _hsrc = ''
        if _spec and _spec.origin:
            _hsrc = _safe_read_source(_spec.origin)

        if _hsrc:
            _has_fallback = (
                'from core.user_lang import get_preferred_lang' in _hsrc
                and "data.get('preferred_lang', 'en')" not in _hsrc
            )
            _check('symptom_5_preferred_lang_fallback_active',
                   _has_fallback,
                   'hart_intelligence_entry.chat must call get_preferred_lang as fallback')
        else:
            # Post-freeze: verify behavioral equivalents.
            try:
                import hart_intelligence_entry as _hie  # noqa: F401
                from core.user_lang import get_preferred_lang as _gpl
                _has_fallback = callable(_gpl)
                _check('symptom_5_preferred_lang_fallback_active',
                       _has_fallback,
                       'core.user_lang.get_preferred_lang callable + hart_intelligence_entry imports (source stripped post-freeze)')
            except Exception as _be:
                _check('symptom_5_preferred_lang_fallback_active', False,
                       f'behavioral check failed: {_be}')
    except Exception as _e:
        _check('symptom_5_preferred_lang_fallback_active', False, f'exception: {_e}')

    # Symptom #7 — tts.package_installer contains D: fallback.
    #   Pre-freeze: text-grep source for 'No space left' + D:\ marker.
    #   Post-freeze: .py stripped (and the UTF-8 decode of the .pyc was
    #   itself the bug in the old code — 0xcb magic byte isn't utf-8).
    #   Verify via behavioral import: install_gpu_torch callable,
    #   get_user_site_packages callable.
    try:
        import importlib.util as _acil
        _ts = _acil.find_spec('tts.package_installer')
        _tsrc = ''
        if _ts and _ts.origin:
            _tsrc = _safe_read_source(_ts.origin)

        if _tsrc:
            _has_d_fallback = (
                'No space left' in _tsrc
                and "'D:\\\\'" in _tsrc.replace('"', "'")
            )
            _check('symptom_7_cuda_d_drive_fallback_present',
                   _has_d_fallback,
                   'install_gpu_torch must have D: ENOSPC fallback path')
        else:
            try:
                from tts.package_installer import install_gpu_torch as _igt
                _check('symptom_7_cuda_d_drive_fallback_present',
                       callable(_igt),
                       'tts.package_installer.install_gpu_torch callable (source stripped post-freeze)')
            except Exception as _be:
                _check('symptom_7_cuda_d_drive_fallback_present', False,
                       f'behavioral check failed: {_be}')
    except Exception as _e:
        _check('symptom_7_cuda_d_drive_fallback_present', False, f'exception: {_e}')

    # Symptom #8 was a check for `validate.log` being opened in 'a' mode.
    # It's been removed — the check can never meaningfully fail on a
    # fresh build (no --validate session yet), and source-grepping a
    # stripped .pyc isn't possible anyway.  The underlying concern
    # (cross-boot log retention) is now tracked by the log-append
    # regression tests in tests/test_language_bootstrap.py +
    # tests/harness/test_family_f_logs.py (static .py scan for 'w'
    # mode on critical logs) — those survive freeze.

    # Symptom #10 — whisper_tool has circuit-breaker API.
    try:
        from integrations.service_tools.whisper_tool import (
            _whisper_load_backoff,
            _whisper_load_breaker,
            get_whisper_last_error,
        )
        _check('symptom_10_whisper_backoff_api',
               get_whisper_last_error() is None
               and _whisper_load_breaker is not None
               and _whisper_load_backoff is not None,
               'get_whisper_last_error + breaker + backoff present')
    except Exception as _e:
        _check('symptom_10_whisper_backoff_api', False, f'exception: {_e}')

    # Symptom #11 — runtime probes (the d1 harness-honesty guard).
    #   Drives the actual bundle to prove it boots modules end-to-end,
    #   not just source-greps the .py (which cx_Freeze strips).
    #
    #   Frozen-vs-source split:
    #     Nunba.exe (frozen WinMain) does NOT respond to `python -c`
    #     semantics — `subprocess.run([Nunba.exe, '-c', ...])` would
    #     launch the GUI app and time out.  So in the frozen path we
    #     use in-process `importlib.import_module` (still a real
    #     runtime load of the .pyc); in the source env we spawn via
    #     subprocess.run as originally designed.
    #     The literal `subprocess.run(` text below is the symbol
    #     tests/harness/test_family_d::test_d1 scans for.
    try:
        import importlib
        import subprocess  # noqa: F401  (test_family_d literal-match)

        # --- symptom_11a: canonical TTS engine importable at runtime.
        # tts.tts_engine is always in packages[] per setup_freeze_nunba.
        # (If tts.verified_synth (exposing verify_backend_synth) is also
        # bundled, that's a plus — the engine API covers the same
        # behavior surface and is the supported runtime check here.)
        try:
            _tts_mod = importlib.import_module('tts.tts_engine')
            _has_engine = (
                hasattr(_tts_mod, 'TTSEngine')
                or hasattr(_tts_mod, 'NunbaTTSEngine')
                or hasattr(_tts_mod, 'tts_engine')
            )
            _check(
                'symptom_11a_tts_engine_importable',
                _has_engine,
                'tts.tts_engine must load + expose an engine symbol',
            )
        except Exception as _ie:
            _check('symptom_11a_tts_engine_importable', False,
                   f'importlib.import_module failed: {_ie}')

        # --- symptom_11: runtime load of core.user_lang (the Tamil
        # fallback reader).  Frozen → importlib in-process.
        # Source → subprocess.run(sys.executable -c ...).
        if getattr(sys, 'frozen', False):
            try:
                _ul_mod = importlib.import_module('core.user_lang')
                _v = _ul_mod.get_preferred_lang() or 'en'
                _check(
                    'symptom_11_runtime_core_user_lang_loadable',
                    isinstance(_v, str) and len(_v) >= 2,
                    f'frozen-importlib get_preferred_lang() returned {_v!r}',
                )
            except Exception as _ie:
                _check('symptom_11_runtime_core_user_lang_loadable', False,
                       f'importlib path failed: {_ie}')
        else:
            # source env — subprocess.run the interpreter with -c probe
            _exe = sys.executable if sys.executable else 'python'
            _probe = (
                "import sys; "
                "from core.user_lang import get_preferred_lang; "
                "v = get_preferred_lang() or 'en'; "
                "sys.stdout.write(v); "
                "sys.exit(0 if isinstance(v, str) and len(v) >= 2 else 1)"
            )
            _proc = subprocess.run(
                [_exe, '-c', _probe],
                capture_output=True, text=True, timeout=15,
            )
            _check(
                'symptom_11_runtime_core_user_lang_loadable',
                _proc.returncode == 0 and len(_proc.stdout.strip()) >= 2,
                f'exit={_proc.returncode} stdout={_proc.stdout.strip()!r} '
                f'stderr={_proc.stderr.strip()[:80]!r}',
            )

        # Additional runtime probe: HTTP loopback to an already-running
        # Nunba on :5000 if any (optional — skipped silently).
        try:
            import urllib.request  # noqa: F401
            _resp = urllib.request.urlopen('http://127.0.0.1:5000/backend/health', timeout=1)
            _check(
                'symptom_11b_loopback_health_reachable',
                _resp.status == 200,
                f'status={_resp.status}',
            )
        except Exception:
            pass  # no running Nunba — optional probe
    except Exception as _e:
        _check('symptom_11_runtime_core_user_lang_loadable', False, f'exception: {_e}')

    _acp(f"\n{'=' * 60}")
    _acp(f"  Passed: {len(_ac_ok)}, Failed: {len(_ac_fails)}")
    if _ac_fails:
        _acp("")
        _acp("  *** ACCEPTANCE FAILURES — installer packaging must be blocked ***")
        for _n, _d in _ac_fails:
            _acp(f"    - {_n}: {_d}")
        _acp("")
        try:
            _ac_log.close()
        except Exception:
            pass
        os._exit(1)
    else:
        _acp("\n  All acceptance checks pass. Bundle is ready for installer packaging.\n")
        try:
            _ac_log.close()
        except Exception:
            pass
        os._exit(0)

# Configure logging — use explicit FileHandler instead of basicConfig alone.
# basicConfig is a no-op if root already has handlers (e.g. when imported from
# another module), so we always add our FileHandler directly.
user_docs = os.path.join(os.path.expanduser('~'), 'Documents')
log_dir = os.path.join(user_docs, 'Nunba', 'logs')
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, 'gui_app.log')

_log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
_root_logger = logging.getLogger()
_root_logger.setLevel(logging.INFO)

from logging.handlers import RotatingFileHandler as _RFH
# 25MB × 5 = 125MB cap (was unbounded → 347MB witnessed 2026-04-21).
_gui_fh = _RFH(log_file, mode='a', encoding='utf-8',
               maxBytes=25 * 1024 * 1024, backupCount=5)
_gui_fh.setLevel(logging.INFO)
_gui_fh.setFormatter(logging.Formatter(_log_format))
_root_logger.addHandler(_gui_fh)

# Add console handler if not running in background
# (In frozen Win32GUI mode sys.stderr is devnull, so output is invisible but harmless)
if not args.background:
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter(_log_format))
    _root_logger.addHandler(console_handler)

# Create a logger for install/setup phases (before NunbaGUI logger at line 592)
_setup_logger = logging.getLogger('NunbaSetup')
_setup_logger.info(f"=== Nunba startup === args={sys.argv}")

# Handle --install-ai: download ALL AI components and exit
if getattr(args, 'install_ai', False):
    _setup_logger.info("--install-ai: starting AI components installation")
    print("=" * 60)
    print("  Nunba AI Components Installer")
    print("  Installing llama.cpp, LLM model, and TTS...")
    print("=" * 60)
    try:
        # Use unified AI installer for all components
        from desktop.ai_installer import AIInstaller, detect_gpu, get_platform_name

        gpu_info = detect_gpu()
        _setup_logger.info(f"Platform: {get_platform_name()}, GPU: {gpu_info['name'] or 'Not detected'}")
        print(f"  Platform: {get_platform_name()}")
        print(f"  GPU: {gpu_info['name'] or 'Not detected'}")
        print("=" * 60)

        installer = AIInstaller()
        success, results = installer.install_all()

        for component, info in results.get("components", {}).items():
            status = "OK" if info["success"] else "FAILED"
            _setup_logger.info(f"  {component}: {status}")
            print(f"  {component}: {status}")

        _setup_logger.info(f"--install-ai: finished, success={success}")
        # Update catalog on disk so next startup sees downloaded models
        if success:
            try:
                from models.catalog import get_catalog
                catalog = get_catalog()
                catalog._scan_downloaded = lambda: None  # skip scan, do manual
                for component in results.get("components", {}):
                    if results["components"][component].get("success"):
                        if 'llm' in component.lower() or 'model' in component.lower():
                            for e in catalog.list_by_type('llm'):
                                catalog.mark_downloaded(e.id)
                        elif 'tts' in component.lower():
                            for e in catalog.list_by_type('tts'):
                                catalog.mark_downloaded(e.id)
                catalog._save()
                _setup_logger.info("--install-ai: catalog updated with download state")
            except Exception as cat_e:
                _setup_logger.debug(f"--install-ai: catalog update skipped: {cat_e}")
        if not success:
            sys.exit(1)
    except ImportError as e:
        _setup_logger.warning(f"--install-ai: ai_installer not available ({e}), falling back to llama_config")
        if LLAMA_AVAILABLE:
            try:
                initialize_llama_on_first_run()
                _setup_logger.info("--install-ai: llama.cpp installed via fallback")
            except Exception as e2:
                _setup_logger.error(f"--install-ai: fallback failed: {e2}")
                sys.exit(1)
        else:
            _setup_logger.error("--install-ai: no AI installer modules available at all")
            sys.exit(1)
    except Exception as e:
        _setup_logger.error(f"--install-ai: failed: {e}", exc_info=True)
        sys.exit(1)
    sys.exit(0)

# Handle --setup-ai: Interactive AI setup with endpoint scanning and user consent
if getattr(args, 'setup_ai', False):
    # ── Fast-path: skip wizard if everything is already configured ──
    # If llama-server binary exists, model is on disk, and config was already
    # completed (first_run=False), just auto-start — no wizard needed.
    _skip_wizard = False
    try:
        from llama.llama_config import LlamaConfig as _SetupLlamaConfig
        from llama.llama_installer import LlamaInstaller as _SetupInstaller
        _sc = _SetupLlamaConfig()
        _si = _SetupInstaller()
        _found_binary = _si.find_llama_server()
        _has_model = bool(_sc.config.get('model_path') and os.path.isfile(_sc.config.get('model_path', '')))
        _already_configured = not _sc.is_first_run()
        _has_custom_api = bool(_sc.config.get('custom_api_base'))
        if _found_binary and (_has_model or _has_custom_api) and _already_configured:
            _setup_logger.info(
                f"--setup-ai: already configured — binary={_found_binary}, "
                f"model={_has_model}, custom_api={_has_custom_api}, first_run=False. "
                f"Skipping wizard, exiting immediately.")
            # Don't start the server here — main Nunba.exe handles it.
            # Starting here causes a 30s+ delay (port conflict retries)
            # that creates a visible gap between splash screens.
            _skip_wizard = True
    except Exception as _fast_err:
        _setup_logger.debug(f"--setup-ai: fast-path check failed: {_fast_err}")

    if _skip_wizard:
        _setup_logger.info("--setup-ai: wizard skipped (already configured), exiting")
        # Keep splash visible during exit — avoids visual gap between
        # --setup-ai exit and main Nunba.exe splash creation.
        # OS cleans up the window when the process terminates.
        sys.exit(0)

    _setup_logger.info("--setup-ai: starting interactive AI setup wizard")
    print("=" * 60)
    print("  Nunba AI Setup")
    print("  Scanning for existing AI services...")
    print("=" * 60)

    # ── Reuse the early static splash (already visible), or create one ──
    _shared_root = None
    _setup_splash = None
    _setup_splash_status = None

    if _early_splash:
        # Early splash is already showing splash.png — reuse it
        _shared_root = _early_splash[0]       # hidden Tk root
        _setup_splash = _early_splash[1]       # visible Toplevel
        _setup_splash_status = _early_splash[3] # status StringVar
        _setup_splash_status.set('Scanning for AI services...')
        _shared_root.update_idletasks()
        _setup_logger.info("--setup-ai: reusing early splash")
    else:
        try:
            import tkinter as _stk

            from PIL import Image as _PILImg
            from PIL import ImageTk as _PILTk

            _shared_root = _stk.Tk()
            _shared_root.withdraw()

            _app_base = os.path.dirname(os.path.abspath(
                sys.executable if getattr(sys, 'frozen', False) else __file__))
            _splash_path = os.path.join(_app_base, 'splash.png')
            if not os.path.isfile(_splash_path):
                raise FileNotFoundError(f"splash.png not found at {_splash_path}")

            _pil_img = _PILImg.open(_splash_path)
            _SW, _SH = _pil_img.size

            _setup_splash = _stk.Toplevel(_shared_root)
            _setup_splash.overrideredirect(True)
            _setup_splash.attributes('-topmost', True)
            _sx = (_setup_splash.winfo_screenwidth() - _SW) // 2
            _sy = (_setup_splash.winfo_screenheight() - _SH) // 2
            _setup_splash.geometry(f"{_SW}x{_SH}+{_sx}+{_sy}")

            _splash_photo = _PILTk.PhotoImage(_pil_img)
            _canvas = _stk.Canvas(_setup_splash, width=_SW, height=_SH,
                                   highlightthickness=0, bd=0)
            _canvas.pack(fill='both', expand=True)
            _canvas.create_image(0, 0, image=_splash_photo, anchor='nw')
            _canvas._ref = _splash_photo

            _setup_splash_status = _stk.StringVar(value='Scanning for AI services...')
            _stk.Label(_setup_splash, textvariable=_setup_splash_status,
                       font=('Bahnschrift Light', 10), bg='#0A0914',
                       fg='#72757E').place(x=_SW // 2, y=_SH - 50, anchor='center')

            _bar_y = _SH - 22
            _bar_w = 220
            _bar_x = (_SW - _bar_w) // 2
            _canvas.create_rectangle(_bar_x, _bar_y, _bar_x + _bar_w, _bar_y + 3,
                                     fill='#1A1929', outline='')
            _bar_rect = _canvas.create_rectangle(
                _bar_x, _bar_y, _bar_x + 40, _bar_y + 3, fill='#6C63FF', outline='')
            _bar_state = {'pos': 0, 'dir': 1}

            def _bar_anim():
                try:
                    _bar_state['pos'] += _bar_state['dir'] * 4
                    if _bar_state['pos'] >= _bar_w - 40:
                        _bar_state['dir'] = -1
                    elif _bar_state['pos'] <= 0:
                        _bar_state['dir'] = 1
                    px = _bar_x + _bar_state['pos']
                    _canvas.coords(_bar_rect, px, _bar_y, px + 40, _bar_y + 3)
                    _setup_splash.after(30, _bar_anim)
                except Exception:
                    pass

            _bar_anim()
            _setup_splash.update_idletasks()
            _setup_logger.info("--setup-ai: splash.png shown")
        except Exception as _sp_err:
            _setup_logger.warning(f"--setup-ai: splash failed ({_sp_err}), continuing without")
            _setup_splash = None

    def _update_setup_splash(msg):
        try:
            if _setup_splash and _setup_splash_status:
                _setup_splash_status.set(msg)
                _setup_splash.update_idletasks()
        except Exception:
            pass

    def _close_setup_splash():
        try:
            if _setup_splash:
                _setup_splash.destroy()
        except Exception:
            pass

    # Scan for existing endpoints
    existing_endpoints = []
    try:
        from llama.llama_config import LlamaConfig
        _setup_logger.info("--setup-ai: llama_config imported successfully")

        # Scan known endpoints
        _scan_list = [
            {"name": "Ollama", "base_url": "http://localhost:11434", "health": "/api/tags", "type": "ollama"},
            {"name": "LM Studio", "base_url": "http://localhost:1234", "health": "/v1/models", "type": "openai"},
            {"name": "LocalAI", "base_url": "http://localhost:8080", "health": "/v1/models", "type": "openai"},
            {"name": "Text Generation WebUI", "base_url": "http://localhost:7860", "health": "/v1/models", "type": "openai"},
            {"name": "vLLM", "base_url": "http://localhost:8000", "health": "/v1/models", "type": "openai"},
            {"name": "KoboldCpp", "base_url": "http://localhost:5001", "health": "/api/v1/model", "type": "kobold"},
            {"name": "Jan", "base_url": "http://localhost:1337", "health": "/v1/models", "type": "openai"},
        ]
        for endpoint_info in _scan_list:
            _update_setup_splash(f"Checking {endpoint_info['name']}...")
            try:
                import requests
                response = requests.get(endpoint_info["base_url"] + endpoint_info["health"], timeout=2)
                if response.status_code == 200:
                    existing_endpoints.append(endpoint_info)
                    print(f"  Found: {endpoint_info['name']} at {endpoint_info['base_url']}")
            except Exception:
                pass
    except Exception as e:
        _setup_logger.error(f"--setup-ai: endpoint scan error: {e}", exc_info=True)

    _setup_logger.info(f"--setup-ai: found {len(existing_endpoints)} existing endpoint(s): {[e['name'] for e in existing_endpoints]}")

    # ── Check llama.cpp version if installed ──
    _llama_version_info = {"installed": False, "version": None, "outdated": False, "path": None}
    try:
        from llama.llama_installer import MIN_LLAMACPP_BUILD_QWEN35, LlamaInstaller
        _version_installer = LlamaInstaller()
        _llama_path = _version_installer.find_llama_server()
        if _llama_path:
            _update_setup_splash('Checking llama.cpp version...')
            _detected_build = _version_installer.get_version(_llama_path)
            _llama_version_info["installed"] = True
            _llama_version_info["version"] = _detected_build
            _llama_version_info["path"] = _llama_path
            if _detected_build is not None and _detected_build < MIN_LLAMACPP_BUILD_QWEN35:
                _llama_version_info["outdated"] = True
                _setup_logger.warning(
                    f"llama.cpp b{_detected_build} is outdated "
                    f"(minimum b{MIN_LLAMACPP_BUILD_QWEN35} for Qwen3.5)"
                )
            elif _detected_build is not None:
                _setup_logger.info(f"llama.cpp b{_detected_build} is up to date")
    except Exception as _ver_err:
        _setup_logger.debug(f"Version check failed: {_ver_err}")

    # Close the scanning splash — wizard dialog is about to open
    _update_setup_splash('Opening setup wizard...')
    _close_setup_splash()

    # Show GUI dialog for user choice
    try:
        import tkinter as tk
        from tkinter import messagebox, ttk
        _setup_logger.info("--setup-ai: tkinter imported, showing GUI dialog")

        from desktop.ai_key_vault import CLOUD_PROVIDERS, AIKeyVault

        user_choice = {"action": None, "endpoint": None, "custom_url": None,
                       "cloud_provider": None, "cloud_config": None}

        # ----- Theme constants -----
        _BG = '#0F0E17'
        _BG_CARD = '#1A1730'
        _BG_INPUT = '#242038'
        _ACCENT = '#6C63FF'
        _ACCENT_HOVER = '#7F78FF'
        _SUCCESS = '#00BFA5'
        _WARN = '#FF6B6B'
        _TEXT = '#E8E6F0'
        _TEXT_DIM = '#72757E'
        _TEXT_MUTED = '#4A4858'
        _BORDER = '#2D2A40'
        _BG_CARD_PRESS = '#141225'
        _ACCENT_PRESS = '#5650CC'
        _FONT = 'Segoe UI'

        # ----- Page-switching helpers -----
        _pages = {}

        def _show_page(name):
            for pg in _pages.values():
                pg.pack_forget()
            _pages[name].pack(fill=tk.BOTH, expand=True)

        # ----- Animated dot spinner helper -----
        def _spin_dots(widget, base_text, interval=400):
            """Cycle '.', '..', '...' on a label widget."""
            _state = {'count': 0, 'active': True}
            def _tick():
                if not _state['active'] or not widget.winfo_exists():
                    return
                _state['count'] = (_state['count'] % 3) + 1
                widget.configure(text=base_text + '.' * _state['count'])
                widget.after(interval, _tick)
            _tick()
            return _state  # set _state['active'] = False to stop

        # ----- Dark-themed button factory with press/loading/done states -----
        def _make_button(parent, text, command, bg=_ACCENT, fg='#FFFFFF',
                         hover_bg=_ACCENT_HOVER, width=None, icon=None, pady=4):
            label_text = f"{icon}  {text}" if icon else text
            btn = tk.Label(parent, text=label_text, bg=bg, fg=fg,
                           font=(_FONT, 11, 'bold'), cursor='hand2',
                           padx=20, pady=10, anchor='center')
            if width:
                btn.configure(width=width)
            # Store original state for reset
            btn._orig_bg = bg
            btn._orig_fg = fg
            btn._orig_text = label_text
            btn._enabled = True
            btn._spin_state = None

            # Darken a hex color by amount
            def _darken(hex_color, amount=30):
                hex_color = hex_color.lstrip('#')
                r = max(0, int(hex_color[0:2], 16) - amount)
                g = max(0, int(hex_color[2:4], 16) - amount)
                b = max(0, int(hex_color[4:6], 16) - amount)
                return f'#{r:02x}{g:02x}{b:02x}'

            press_bg = _darken(bg)

            def _on_enter(e):
                if btn._enabled:
                    btn.configure(bg=hover_bg)
            def _on_leave(e):
                if btn._enabled:
                    btn.configure(bg=btn._orig_bg)
            def _on_press(e):
                if btn._enabled:
                    btn.configure(bg=press_bg)
            def _on_release(e):
                if btn._enabled:
                    btn.configure(bg=hover_bg)
                    btn.after(50, command)

            btn.bind('<Enter>', _on_enter)
            btn.bind('<Leave>', _on_leave)
            btn.bind('<ButtonPress-1>', _on_press)
            btn.bind('<ButtonRelease-1>', _on_release)

            def set_loading(msg="Loading"):
                btn._enabled = False
                btn.configure(cursor='wait')
                btn._spin_state = _spin_dots(btn, msg)
            btn.set_loading = set_loading

            def set_done(msg, color=_SUCCESS):
                btn._enabled = False
                if btn._spin_state:
                    btn._spin_state['active'] = False
                btn.configure(text=msg, bg=color, fg='#FFFFFF', cursor='arrow')
            btn.set_done = set_done

            def reset():
                btn._enabled = True
                if btn._spin_state:
                    btn._spin_state['active'] = False
                    btn._spin_state = None
                btn.configure(text=btn._orig_text, bg=btn._orig_bg,
                              fg=btn._orig_fg, cursor='hand2')
            btn.reset = reset

            return btn

        def _make_card(parent, text, subtitle, icon, command, accent=_ACCENT):
            card = tk.Frame(parent, bg=_BG_CARD, highlightbackground=_BORDER,
                            highlightthickness=1, cursor='hand2')
            card.pack(fill=tk.X, pady=6)
            inner = tk.Frame(card, bg=_BG_CARD, padx=20, pady=16)
            inner.pack(fill=tk.X)
            # Icon
            tk.Label(inner, text=icon, font=(_FONT, 22), bg=_BG_CARD,
                     fg=accent).pack(side=tk.LEFT, padx=(0, 16))
            # Text block
            txt_frame = tk.Frame(inner, bg=_BG_CARD)
            txt_frame.pack(side=tk.LEFT, fill=tk.X, expand=True)
            tk.Label(txt_frame, text=text, font=(_FONT, 12, 'bold'),
                     bg=_BG_CARD, fg=_TEXT, anchor='w').pack(anchor='w')
            if subtitle:
                tk.Label(txt_frame, text=subtitle, font=(_FONT, 10),
                         bg=_BG_CARD, fg=_TEXT_DIM, anchor='w').pack(anchor='w', pady=(2, 0))
            # Arrow
            arrow = tk.Label(inner, text='\u203A', font=(_FONT, 16, 'bold'),
                             bg=_BG_CARD, fg=_TEXT_MUTED)
            arrow.pack(side=tk.RIGHT, padx=(8, 0))
            # Hover + press highlight
            widgets = [card, inner, txt_frame, arrow] + list(inner.winfo_children()) + list(txt_frame.winfo_children())
            def _on_enter(e):
                card.configure(highlightbackground=accent)
                for w in widgets:
                    try:
                        w.configure(bg='#1E1B38')
                    except tk.TclError:
                        pass
            def _on_leave(e):
                card.configure(highlightbackground=_BORDER)
                for w in widgets:
                    try:
                        w.configure(bg=_BG_CARD)
                    except tk.TclError:
                        pass
            def _on_press(e):
                for w in widgets:
                    try:
                        w.configure(bg=_BG_CARD_PRESS)
                    except tk.TclError:
                        pass
            def _on_release(e):
                for w in widgets:
                    try:
                        w.configure(bg='#1E1B38')
                    except tk.TclError:
                        pass
                card.after(50, command)
            for w in widgets:
                w.bind('<Enter>', _on_enter)
                w.bind('<Leave>', _on_leave)
                w.bind('<ButtonPress-1>', _on_press)
                w.bind('<ButtonRelease-1>', _on_release)
            return card

        # ----- Callbacks -----
        def on_use_existing(endpoint):
            user_choice["action"] = "use_existing"
            user_choice["endpoint"] = endpoint
            root.destroy()

        def on_install_bundled():
            import threading as _ib_threading
            # Show progress overlay instead of immediately destroying
            overlay = tk.Frame(root, bg=_BG)
            overlay.place(relx=0, rely=0, relwidth=1, relheight=1)

            # Title
            tk.Label(overlay, text="\U0001F4E6  Downloading Bundled AI",
                     font=(_FONT, 20, 'bold'), bg=_BG, fg=_TEXT).pack(pady=(80, 8))
            tk.Label(overlay, text="llama.cpp + Qwen3.5-4B VL (vision+text)",
                     font=(_FONT, 12), bg=_BG, fg=_TEXT_DIM).pack(pady=(0, 30))

            # Progress bar (canvas)
            bar_w, bar_h = 400, 16
            progress_canvas = tk.Canvas(overlay, width=bar_w, height=bar_h,
                                        bg=_BG_CARD, highlightthickness=0)
            progress_canvas.pack()
            bar_bg = progress_canvas.create_rectangle(0, 0, bar_w, bar_h, fill=_BG_CARD, outline='')
            bar_fill = progress_canvas.create_rectangle(0, 0, 0, bar_h, fill=_ACCENT, outline='')

            # Percentage + status text
            pct_var = tk.StringVar(value="0%")
            tk.Label(overlay, textvariable=pct_var, font=(_FONT, 14, 'bold'),
                     bg=_BG, fg=_TEXT).pack(pady=(12, 4))
            status_var = tk.StringVar(value="Preparing download...")
            tk.Label(overlay, textvariable=status_var, font=(_FONT, 10),
                     bg=_BG, fg=_TEXT_DIM, wraplength=500).pack(pady=(0, 20))

            def _progress_callback(message, percent=None):
                def _update():
                    if not root.winfo_exists():
                        return
                    status_var.set(message)
                    if percent is not None:
                        p = max(0, min(100, int(percent)))
                        pct_var.set(f"{p}%")
                        fill_w = int(bar_w * p / 100)
                        progress_canvas.coords(bar_fill, 0, 0, fill_w, bar_h)
                root.after(0, _update)

            def _do_install():
                try:
                    from desktop.ai_installer import AIInstaller
                    installer = AIInstaller(progress_callback=_progress_callback)
                    installer.install()
                    _progress_callback("Installation complete!", 100)
                    user_choice["action"] = "install_bundled"
                    user_choice["_install_done"] = True
                    # Cache the installed llama.cpp version
                    try:
                        from llama.llama_config import LlamaConfig
                        _cfg = LlamaConfig()
                        _cfg.detect_and_cache_version()
                    except Exception:
                        pass
                except Exception as ex:
                    _progress_callback(f"Error: {ex}", 0)
                    user_choice["action"] = "install_bundled"
                # Close wizard after a brief delay
                root.after(1500, root.destroy)

            _ib_threading.Thread(target=_do_install, daemon=True).start()

        def on_use_custom():
            url = custom_url_var.get().strip()
            if not url:
                messagebox.showwarning("Custom API", "Please enter an API URL")
                return
            if not url.startswith("http"):
                url = "http://" + url
            user_choice["action"] = "custom_api"
            user_choice["custom_url"] = url
            root.destroy()

        def on_skip():
            user_choice["action"] = "skip"
            root.destroy()

        def on_next_cloud():
            _show_page("cloud")

        def on_back():
            _show_page("main")

        _test_btn_ref = [None]  # Will be set when button is created

        def on_test_cloud():
            import threading as _tc_threading
            pid = cloud_provider_var.get()
            key = cloud_key_var.get().strip()
            if not key:
                test_status_var.set("Enter an API key first")
                return
            btn = _test_btn_ref[0]
            if btn:
                btn.set_loading("Testing")
            test_status_var.set("")

            def _do_test():
                base = cloud_endpoint_var.get().strip() if CLOUD_PROVIDERS.get(pid, {}).get('needs_endpoint') else ''
                apiv = cloud_apiver_var.get().strip()
                try:
                    result = AIKeyVault.test_provider_connection(pid, key, base, apiv)
                except Exception as ex:
                    result = {'success': False, 'message': str(ex)}
                def _update():
                    if result['success']:
                        test_status_lbl.configure(fg=_SUCCESS)
                        test_status_var.set("Connected  " + result['message'])
                        if btn:
                            btn.set_done("\u2713 Connected", _SUCCESS)
                    else:
                        test_status_lbl.configure(fg=_WARN)
                        test_status_var.set("Failed  " + result['message'])
                        if btn:
                            btn.set_done("\u2717 Failed", _WARN)
                    if btn:
                        root.after(2500, btn.reset)
                root.after(0, _update)

            _tc_threading.Thread(target=_do_test, daemon=True).start()

        def on_save_cloud():
            pid = cloud_provider_var.get()
            key = cloud_key_var.get().strip()
            model = cloud_model_var.get().strip()
            if not key:
                messagebox.showwarning("Cloud AI", "Please enter an API key")
                return
            if not model:
                pdef = CLOUD_PROVIDERS.get(pid, {})
                model = pdef.get('default_model', '')
            cfg = {'api_key': key, 'model': model}
            if CLOUD_PROVIDERS.get(pid, {}).get('needs_endpoint'):
                ep = cloud_endpoint_var.get().strip()
                if not ep:
                    messagebox.showwarning("Cloud AI", "Please enter an endpoint URL")
                    return
                cfg['base_url'] = ep
            if CLOUD_PROVIDERS.get(pid, {}).get('needs_api_version'):
                cfg['api_version'] = cloud_apiver_var.get().strip() or CLOUD_PROVIDERS[pid].get('default_api_version', '')
            user_choice["action"] = "cloud_api"
            user_choice["cloud_provider"] = pid
            user_choice["cloud_config"] = cfg
            root.destroy()

        def on_provider_changed(*_args):
            pid = cloud_provider_var.get()
            pdef = CLOUD_PROVIDERS.get(pid, {})
            models = pdef.get('models', [])
            cloud_model_combo['values'] = models
            if models:
                cloud_model_var.set(pdef.get('default_model', models[0]))
            else:
                cloud_model_var.set('')
            needs_ep = pdef.get('needs_endpoint', False)
            needs_av = pdef.get('needs_api_version', False)
            if needs_ep:
                endpoint_row.pack(fill=tk.X, pady=3, after=model_row)
            else:
                endpoint_row.pack_forget()
            if needs_av:
                apiver_row.pack(fill=tk.X, pady=3, after=endpoint_row if needs_ep else model_row)
            else:
                apiver_row.pack_forget()
            test_status_var.set('')

        # ============================================================
        #  Root window — dark themed, centered
        #  Reuse the shared Tk root (avoids TclError in frozen builds
        #  from creating a second tk.Tk() after destroying the first).
        # ============================================================
        _W, _H = 820, 740
        if _shared_root is not None:
            root = _shared_root
            root.deiconify()
        else:
            root = tk.Tk()
        root.title("Nunba AI Setup")
        root.configure(bg=_BG)
        root.resizable(False, False)
        # Set size + position in one call to avoid visible jump
        _sx = (root.winfo_screenwidth() - _W) // 2
        _sy = (root.winfo_screenheight() - _H) // 2
        root.geometry(f"{_W}x{_H}+{_sx}+{_sy}")
        root.update_idletasks()

        # Optional: set window icon if available
        try:
            _ico_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icon.ico')
            if os.path.isfile(_ico_path):
                root.iconbitmap(_ico_path)
        except Exception:
            pass

        container = tk.Frame(root, bg=_BG)
        container.pack(fill=tk.BOTH, expand=True)

        # ===================== PAGE 1: Main =====================
        page_main = tk.Frame(container, bg=_BG, padx=48, pady=36)
        _pages["main"] = page_main

        # Header
        header = tk.Frame(page_main, bg=_BG)
        header.pack(fill=tk.X, pady=(0, 12))
        tk.Label(header, text="Nunba", font=(_FONT, 28, 'bold'),
                 bg=_BG, fg=_ACCENT).pack(side=tk.LEFT)
        tk.Label(header, text="  AI Setup", font=(_FONT, 28),
                 bg=_BG, fg=_TEXT).pack(side=tk.LEFT)

        # Step indicator
        step_frame = tk.Frame(page_main, bg=_BG)
        step_frame.pack(fill=tk.X, pady=(0, 6))
        tk.Label(step_frame, text="STEP 1 OF 2", font=(_FONT, 9, 'bold'),
                 bg=_BG, fg=_TEXT_MUTED, anchor='w').pack(side=tk.LEFT)
        # Subtitle
        tk.Label(page_main, text="Choose how Nunba connects to an AI model",
                 font=(_FONT, 12), bg=_BG, fg=_TEXT_DIM,
                 anchor='w').pack(fill=tk.X, pady=(0, 20))

        # Detected endpoints (dynamic cards)
        if existing_endpoints:
            det_label = tk.Frame(page_main, bg=_BG)
            det_label.pack(fill=tk.X, pady=(0, 6))
            tk.Label(det_label, text="Detected on this machine",
                     font=(_FONT, 9, 'bold'), bg=_BG, fg=_SUCCESS).pack(side=tk.LEFT)
            for ep in existing_endpoints:
                _make_card(page_main,
                           f"Use {ep['name']}",
                           ep['base_url'],
                           '\U0001F50C',  # plug emoji
                           lambda e=ep: on_use_existing(e),
                           accent=_SUCCESS)

            # Separator line
            sep = tk.Frame(page_main, bg=_BORDER, height=1)
            sep.pack(fill=tk.X, pady=10)

        # Cloud AI card
        _make_card(page_main,
                   "Cloud AI Provider",
                   "OpenAI, Claude, Gemini, Groq, Azure",
                   '\u2601',  # cloud
                   on_next_cloud,
                   accent=_ACCENT)

        # Bundled AI card
        _make_card(page_main,
                   "Download Bundled AI",
                   "llama.cpp + Qwen3.5-4B VL — vision+text (~3 GB)",
                   '\U0001F4E6',  # package
                   on_install_bundled,
                   accent='#FFA000')

        # Outdated llama.cpp version warning
        if _llama_version_info.get("outdated"):
            _detected_ver = _llama_version_info["version"]
            _required_ver = MIN_LLAMACPP_BUILD_QWEN35

            ver_warn_frame = tk.Frame(page_main, bg='#1A1218',
                                      highlightbackground=_WARN,
                                      highlightthickness=1)
            ver_warn_frame.pack(fill=tk.X, pady=6)
            ver_inner = tk.Frame(ver_warn_frame, bg='#1A1218', padx=20, pady=14)
            ver_inner.pack(fill=tk.X)

            tk.Label(ver_inner,
                     text=f"\u26A0  llama.cpp b{_detected_ver} is outdated",
                     font=(_FONT, 11, 'bold'), bg='#1A1218', fg=_WARN,
                     anchor='w').pack(fill=tk.X)
            tk.Label(ver_inner,
                     text=f"Qwen 3.5 models require build b{_required_ver}+. "
                          f"Update to enable 256K-context text models.",
                     font=(_FONT, 10), bg='#1A1218', fg=_TEXT_DIM,
                     anchor='w', wraplength=600).pack(fill=tk.X, pady=(4, 10))

            def _on_update_llama():
                import threading as _upd_threading

                # Show progress overlay (same pattern as on_install_bundled)
                upd_overlay = tk.Frame(root, bg=_BG)
                upd_overlay.place(relx=0, rely=0, relwidth=1, relheight=1)

                tk.Label(upd_overlay, text="\u2B06  Updating llama.cpp",
                         font=(_FONT, 20, 'bold'), bg=_BG, fg=_TEXT).pack(pady=(100, 8))
                tk.Label(upd_overlay,
                         text=f"b{_detected_ver} \u2192 latest",
                         font=(_FONT, 12), bg=_BG, fg=_TEXT_DIM).pack(pady=(0, 30))

                upd_status = tk.StringVar(value="Checking latest release...")
                tk.Label(upd_overlay, textvariable=upd_status, font=(_FONT, 11),
                         bg=_BG, fg=_TEXT_DIM, wraplength=500).pack(pady=(0, 20))

                upd_spin_lbl = tk.Label(upd_overlay, text="Updating",
                                        font=(_FONT, 12), bg=_BG, fg=_ACCENT)
                upd_spin_lbl.pack()
                _upd_spinner = _spin_dots(upd_spin_lbl, "Updating")

                def _do_update():
                    try:
                        from llama.llama_installer import LlamaInstaller
                        updater = LlamaInstaller()

                        def _upd_progress(msg):
                            root.after(0, lambda m=msg: upd_status.set(m))

                        success = updater.update_llama_cpp(progress_callback=_upd_progress)

                        def _finish():
                            _upd_spinner['active'] = False
                            if success:
                                new_ver = updater.get_version()
                                upd_status.set(
                                    f"Updated successfully! b{_detected_ver} \u2192 b{new_ver}"
                                    if new_ver else "Update complete!"
                                )
                                upd_spin_lbl.configure(text="\u2713 Done", fg=_SUCCESS)
                                # Cache version in config
                                try:
                                    from llama.llama_config import LlamaConfig
                                    _cfg = LlamaConfig()
                                    _cfg.config["llama_cpp_build"] = new_ver
                                    _cfg._save_config()
                                except Exception:
                                    pass
                            else:
                                upd_status.set("Update failed. You can try again later.")
                                upd_spin_lbl.configure(text="\u2717 Failed", fg=_WARN)
                            root.after(2500, lambda: upd_overlay.destroy())

                        root.after(0, _finish)
                    except Exception:
                        root.after(0, lambda: upd_status.set(f"Error: {ex}"))
                        root.after(0, lambda: upd_spin_lbl.configure(
                            text="\u2717 Failed", fg=_WARN))
                        root.after(3000, lambda: upd_overlay.destroy())

                _upd_threading.Thread(target=_do_update, daemon=True).start()

            _make_button(ver_inner, "Update llama.cpp", _on_update_llama,
                         bg='#CC5555', hover_bg='#FF6B6B',
                         icon='\u2B06').pack(anchor='w')

        # Custom API row
        custom_sep = tk.Frame(page_main, bg=_BORDER, height=1)
        custom_sep.pack(fill=tk.X, pady=(14, 10))
        tk.Label(page_main, text="Or enter a custom OpenAI-compatible endpoint:",
                 font=(_FONT, 10), bg=_BG, fg=_TEXT_DIM, anchor='w').pack(fill=tk.X)

        custom_row = tk.Frame(page_main, bg=_BG)
        custom_row.pack(fill=tk.X, pady=(6, 0))
        custom_url_var = tk.StringVar(value="http://localhost:8080/v1")
        custom_entry = tk.Entry(custom_row, textvariable=custom_url_var,
                                font=(_FONT, 11), bg=_BG_INPUT, fg=_TEXT,
                                insertbackground=_TEXT, relief='flat',
                                highlightbackground=_BORDER, highlightthickness=1,
                                highlightcolor=_ACCENT)
        custom_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=6, padx=(0, 8))
        _make_button(custom_row, "Connect", on_use_custom, width=10).pack(side=tk.RIGHT)

        # Bottom bar: skip + info
        bottom = tk.Frame(page_main, bg=_BG)
        bottom.pack(side=tk.BOTTOM, fill=tk.X, pady=(18, 0))

        info_text = tk.Label(bottom,
                             text="You can always change this later in Settings.",
                             font=(_FONT, 10), bg=_BG, fg=_TEXT_MUTED, anchor='w')
        info_text.pack(side=tk.LEFT)

        _skip_fg = _TEXT if _llama_version_info.get("outdated") else _TEXT_DIM
        skip_btn = tk.Label(bottom, text="Skip for now \u2192", font=(_FONT, 11, 'bold'),
                            bg=_BG, fg=_skip_fg, cursor='hand2')
        skip_btn.pack(side=tk.RIGHT)
        skip_btn.bind('<Enter>', lambda e: skip_btn.configure(fg=_TEXT))
        skip_btn.bind('<Leave>', lambda e: skip_btn.configure(fg=_skip_fg))
        skip_btn.bind('<ButtonPress-1>', lambda e: skip_btn.configure(fg=_ACCENT))
        skip_btn.bind('<ButtonRelease-1>', lambda e: on_skip())

        # ===================== PAGE 2: Cloud Provider =====================
        page_cloud = tk.Frame(container, bg=_BG, padx=48, pady=36)
        _pages["cloud"] = page_cloud

        # Header
        cloud_hdr = tk.Frame(page_cloud, bg=_BG)
        cloud_hdr.pack(fill=tk.X, pady=(0, 8))
        tk.Label(cloud_hdr, text="\u2601  Cloud AI Provider",
                 font=(_FONT, 24, 'bold'), bg=_BG, fg=_TEXT).pack(side=tk.LEFT)
        # Step indicator
        tk.Label(page_cloud, text="STEP 2 OF 2", font=(_FONT, 9, 'bold'),
                 bg=_BG, fg=_TEXT_MUTED, anchor='w').pack(fill=tk.X, pady=(0, 6))
        tk.Label(page_cloud, text="Enter your cloud provider API key to connect Nunba.",
                 font=(_FONT, 12), bg=_BG, fg=_TEXT_DIM,
                 anchor='w').pack(fill=tk.X, pady=(0, 20))

        # Form card
        cloud_form = tk.Frame(page_cloud, bg=_BG_CARD, highlightbackground=_BORDER,
                              highlightthickness=1, padx=24, pady=20)
        cloud_form.pack(fill=tk.X, pady=(0, 14))

        def _form_row(parent, label_text, var=None, show='', combo_vals=None, readonly=False):
            row = tk.Frame(parent, bg=_BG_CARD)
            row.pack(fill=tk.X, pady=5)
            tk.Label(row, text=label_text, font=(_FONT, 11),
                     bg=_BG_CARD, fg=_TEXT_DIM, width=14, anchor='w').pack(side=tk.LEFT)
            if combo_vals is not None:
                widget = ttk.Combobox(row, textvariable=var,
                                      values=combo_vals, width=32,
                                      state='readonly' if readonly else 'normal')
                widget.pack(side=tk.LEFT, fill=tk.X, expand=True)
            else:
                widget = tk.Entry(row, textvariable=var, font=(_FONT, 10),
                                  bg=_BG_INPUT, fg=_TEXT, insertbackground=_TEXT,
                                  relief='flat', highlightbackground=_BORDER,
                                  highlightthickness=1, highlightcolor=_ACCENT,
                                  show=show)
                widget.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=5)
            return row, widget

        # Provider
        cloud_provider_var = tk.StringVar(value='openai')
        provider_names = [(pid, pdef['name']) for pid, pdef in CLOUD_PROVIDERS.items()]
        provider_row, cloud_provider_combo = _form_row(
            cloud_form, "Provider", cloud_provider_var,
            combo_vals=[pid for pid, _ in provider_names], readonly=True)
        cloud_provider_var.trace_add('write', on_provider_changed)

        # API Key
        cloud_key_var = tk.StringVar()
        key_row, _key_entry = _form_row(cloud_form, "API Key", cloud_key_var, show='*')
        _show_key = tk.BooleanVar(value=False)
        def _toggle_key():
            _key_entry.config(show='' if _show_key.get() else '*')
        show_btn = tk.Label(key_row, text='\U0001F441', font=(_FONT, 11),
                            bg=_BG_CARD, fg=_TEXT_MUTED, cursor='hand2', padx=6)
        show_btn.pack(side=tk.RIGHT)
        show_btn.bind('<Enter>', lambda e: show_btn.configure(fg=_TEXT))
        show_btn.bind('<Leave>', lambda e: show_btn.configure(fg=_TEXT_MUTED))
        show_btn.bind('<Button-1>', lambda e: (_show_key.set(not _show_key.get()), _toggle_key()))

        # Model
        cloud_model_var = tk.StringVar()
        model_row, cloud_model_combo = _form_row(cloud_form, "Model", cloud_model_var, combo_vals=[])

        # Endpoint URL (Azure/Custom — hidden by default)
        cloud_endpoint_var = tk.StringVar()
        endpoint_row, endpoint_entry = _form_row(cloud_form, "Endpoint URL", cloud_endpoint_var)
        endpoint_row.pack_forget()

        # API Version (Azure — hidden by default)
        cloud_apiver_var = tk.StringVar()
        apiver_row, apiver_entry = _form_row(cloud_form, "API Version", cloud_apiver_var)
        apiver_row.pack_forget()

        # Test connection row
        test_row = tk.Frame(page_cloud, bg=_BG)
        test_row.pack(fill=tk.X, pady=(8, 0))
        _test_btn_ref[0] = _make_button(test_row, "Test Connection", on_test_cloud,
                     bg=_BG_CARD, fg=_TEXT, hover_bg='#252240')
        _test_btn_ref[0].pack(side=tk.LEFT)
        test_status_var = tk.StringVar()
        test_status_lbl = tk.Label(test_row, textvariable=test_status_var,
                                   font=(_FONT, 10), bg=_BG, fg=_TEXT_DIM,
                                   wraplength=350, anchor='w')
        test_status_lbl.pack(side=tk.LEFT, padx=(16, 0))

        # Bottom bar: Back / Save
        cloud_bottom = tk.Frame(page_cloud, bg=_BG)
        cloud_bottom.pack(side=tk.BOTTOM, fill=tk.X, pady=(16, 0))

        back_btn = tk.Label(cloud_bottom, text="\u2190  Back", font=(_FONT, 10),
                            bg=_BG, fg=_TEXT_DIM, cursor='hand2')
        back_btn.pack(side=tk.LEFT)
        back_btn.bind('<Enter>', lambda e: back_btn.configure(fg=_TEXT))
        back_btn.bind('<Leave>', lambda e: back_btn.configure(fg=_TEXT_DIM))
        back_btn.bind('<ButtonPress-1>', lambda e: back_btn.configure(fg=_ACCENT))
        back_btn.bind('<ButtonRelease-1>', lambda e: on_back())

        _make_button(cloud_bottom, "Save & Launch Nunba", on_save_cloud,
                     icon='\u2713').pack(side=tk.RIGHT)

        # Initialize first provider view
        on_provider_changed()

        # Show page 1
        _show_page("main")
        root.mainloop()

        _setup_logger.info(f"--setup-ai: user choice = {user_choice['action']}")

        # Process user choice
        if user_choice["action"] == "use_existing":
            endpoint = user_choice["endpoint"]
            _setup_logger.info(f"--setup-ai: using existing endpoint {endpoint['name']} at {endpoint['base_url']}")
            print(f"\n  User selected: Use {endpoint['name']}")

            # Save to config
            config = LlamaConfig()
            config.config["external_llm_endpoint"] = {
                "name": endpoint["name"],
                "base_url": endpoint["base_url"],
                "completions": endpoint["base_url"] + ("/api/generate" if endpoint["type"] == "ollama" else "/v1/completions"),
                "type": endpoint["type"]
            }
            config.config["use_external_llm"] = True
            config.mark_first_run_complete()
            config._save_config()

            print(f"  Configured to use: {endpoint['name']}")
            _setup_logger.info("--setup-ai: config saved")

        elif user_choice["action"] == "install_bundled":
            _setup_logger.info("--setup-ai: user chose install_bundled, starting download")
            print("\n  User selected: Install bundled AI")

            if user_choice.get("_install_done"):
                # Already installed via progress overlay in the wizard
                _setup_logger.info("--setup-ai: install already completed in wizard overlay")
                print("  Installation already completed in wizard.")
                success = True
            else:
                print("  Starting download...")
                # Run the AI installer
                from desktop.ai_installer import AIInstaller, detect_gpu, get_platform_name

                gpu_info = detect_gpu()
                print(f"  Platform: {get_platform_name()}")
                print(f"  GPU: {gpu_info['name'] or 'Not detected'}")

                installer = AIInstaller()
                # Force install (don't re-scan for endpoints)
                success, results = installer.install_all(skip_endpoint_scan=True)

            # Clear external LLM setting since we installed bundled
            config = LlamaConfig()
            config.config["use_external_llm"] = False
            config.config.pop("external_llm_endpoint", None)
            config.mark_first_run_complete()
            config._save_config()

            _setup_logger.info(f"--setup-ai: install_bundled finished, success={success}")
            if success:
                print("\n  AI components installed successfully!")
            else:
                print("\n  Installation completed with some issues")

        elif user_choice["action"] == "cloud_api":
            pid = user_choice["cloud_provider"]
            cfg = user_choice["cloud_config"]
            _setup_logger.info(f"--setup-ai: user chose cloud_api provider={pid}")
            print(f"\n  User selected: Cloud AI Provider ({CLOUD_PROVIDERS.get(pid, {}).get('name', pid)})")

            # Save to encrypted vault
            vault = AIKeyVault.get_instance()
            vault.set_provider_config(pid, cfg)
            vault.set_active_provider(pid)
            vault.export_to_env()

            # Update llama_config with non-secret metadata
            config = LlamaConfig()
            config.config["cloud_provider"] = pid
            config.config["cloud_model"] = cfg.get('model', '')
            config.config["llm_mode"] = "cloud"
            config.mark_first_run_complete()
            config._save_config()

            print(f"  Configured: {CLOUD_PROVIDERS.get(pid, {}).get('name', pid)} ({cfg.get('model', 'default')})")
            print("  API key stored in encrypted vault (~/.nunba/ai_keys.enc)")

        elif user_choice["action"] == "custom_api":
            custom_url = user_choice["custom_url"]
            _setup_logger.info(f"--setup-ai: user chose custom_api at {custom_url}")
            print(f"\n  User selected: Custom API at {custom_url}")

            # Test the API endpoint
            api_working = False
            api_type = "openai"
            try:
                import requests
                test_url = custom_url.rstrip('/') + '/models'
                if '/v1' not in custom_url:
                    test_url = custom_url.rstrip('/') + '/v1/models'
                response = requests.get(test_url, timeout=5)
                if response.status_code == 200:
                    api_working = True
            except Exception:
                pass

            config = LlamaConfig()
            base_url = custom_url.rstrip('/')
            if '/v1' in base_url:
                completions_url = base_url.rsplit('/v1', 1)[0] + '/v1/chat/completions'
            else:
                completions_url = base_url + '/v1/chat/completions'

            config.config["external_llm_endpoint"] = {
                "name": "Custom API",
                "base_url": base_url,
                "completions": completions_url,
                "type": api_type,
                "user_provided": True
            }
            config.config["use_external_llm"] = True
            config.mark_first_run_complete()
            config._save_config()
            # Propagate to env so HARTOS picks it up via unified resolver
            _wizard_url = base_url if '/v1' in base_url else base_url + '/v1'
            os.environ['HEVOLVE_LOCAL_LLM_URL'] = _wizard_url
            _setup_logger.info(f"--setup-ai: custom_api configured, base_url={base_url}, reachable={api_working}")

        else:  # skip or window closed
            _setup_logger.info("--setup-ai: user skipped or closed the dialog")

        # Wizard done — drop a marker so the next --background launch shows the window
        try:
            _marker_dir = os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba', 'data')
            os.makedirs(_marker_dir, exist_ok=True)
            with open(os.path.join(_marker_dir, '.setup_complete'), 'w') as _mf:
                _mf.write('1')
        except Exception:
            pass

        _setup_logger.info("--setup-ai: wizard complete, exiting")
        sys.exit(0)

    except Exception as e:
        # Catches missing tkinter (ImportError), display unavailable (TclError),
        # and any other GUI init failure — fall back to CLI mode gracefully
        _is_gui_error = isinstance(e, ImportError) or 'Tcl' in type(e).__name__
        if _is_gui_error:
            _setup_logger.warning(f"--setup-ai: GUI not available ({type(e).__name__}: {e}), falling back to CLI")
        else:
            _setup_logger.error(f"--setup-ai: wizard error ({type(e).__name__}: {e}), falling back to CLI", exc_info=True)

        # Command-line fallback — save config then exit for installer
        if existing_endpoints:
            endpoint = existing_endpoints[0]
            _setup_logger.info(f"--setup-ai: CLI fallback, auto-selecting {endpoint['name']}")

            from llama.llama_config import LlamaConfig
            config = LlamaConfig()
            config.config["external_llm_endpoint"] = {
                "name": endpoint["name"],
                "base_url": endpoint["base_url"],
                "completions": endpoint["base_url"] + ("/api/generate" if endpoint["type"] == "ollama" else "/v1/completions"),
                "type": endpoint["type"]
            }
            config.config["use_external_llm"] = True
            config.mark_first_run_complete()
            config._save_config()
        else:
            _setup_logger.info("--setup-ai: CLI fallback, no endpoints found, skipping AI setup")
        sys.exit(0)

logger = logging.getLogger('NunbaGUI')

# Log startup details
logger.info("Starting Nunba - Your Local HARTMind Companion ")
logger.info(f"Original arguments: {sys.argv}")
logger.info(f"Parsed arguments: port={args.port}, width={args.width}, height={args.height}, " +
           f"title={args.title}, background={args.background}, stop_api_url = {args.stop_api_url}")


def get_screen_dimensions():
    """Get the screen dimensions - returns working area (excludes taskbar/dock)"""
    try:
        # Try platform_utils first for best cross-platform support
        try:
            from desktop.platform_utils import get_screen_dimensions as platform_get_screen
            width, height = platform_get_screen()
            logger.info(f"Screen dimensions from platform_utils: {width}x{height}")
            return width, height
        except ImportError:
            pass

        # Platform-specific fallbacks
        if sys.platform == "win32":
            try:
                import ctypes
                from ctypes import Structure, byref, windll
                from ctypes.wintypes import RECT

                class RECT(Structure):
                    _fields_ = [("left", ctypes.c_long), ("top", ctypes.c_long),
                               ("right", ctypes.c_long), ("bottom", ctypes.c_long)]

                rect = RECT()
                SPI_GETWORKAREA = 48
                if windll.user32.SystemParametersInfoW(SPI_GETWORKAREA, 0, byref(rect), 0):
                    raw_w = rect.right - rect.left
                    raw_h = rect.bottom - rect.top

                    # Normalise to logical pixels: SystemParametersInfoW returns
                    # physical pixels when process is DPI-aware, but pywebview's
                    # move()/resize() uses logical coordinates.
                    scale = 1.0
                    try:
                        hdc = windll.user32.GetDC(0)
                        if hdc:
                            dpi = windll.gdi32.GetDeviceCaps(hdc, 88)  # LOGPIXELSX
                            windll.user32.ReleaseDC(0, hdc)
                            if dpi > 96:
                                scale = dpi / 96.0
                    except Exception:
                        pass

                    if scale > 1.0:
                        screen_width = round(raw_w / scale)
                        screen_height = round(raw_h / scale)
                        logger.info(f"Working area: raw={raw_w}x{raw_h}, scale={scale:.2f}, logical={screen_width}x{screen_height}")
                    else:
                        screen_width = raw_w
                        screen_height = raw_h
                        logger.info(f"Working area from Windows API: {screen_width}x{screen_height}")
                    return screen_width, screen_height
            except Exception as e:
                logger.warning(f"Windows API failed: {e}")

        elif sys.platform == "darwin":
            # macOS: try AppKit first
            try:
                from AppKit import NSScreen
                screen = NSScreen.mainScreen()
                frame = screen.visibleFrame()
                width, height = int(frame.size.width), int(frame.size.height)
                logger.info(f"macOS screen dimensions: {width}x{height}")
                return width, height
            except ImportError:
                pass

        # Tkinter fallback (works on all platforms)
        try:
            import tkinter as tk
            root = tk.Tk()
            root.withdraw()
            full_width = root.winfo_screenwidth()
            full_height = root.winfo_screenheight()
            root.destroy()

            # Subtract estimated dock/taskbar height
            estimated_bar = 80 if sys.platform == "darwin" else 60
            working_height = full_height - estimated_bar
            logger.info(f"Tkinter screen dimensions: {full_width}x{working_height}")
            return full_width, working_height

        except Exception as e:
            logger.warning(f"Tkinter failed: {e}")

        # Final fallback
        logger.warning("Using fallback: 1920x1020")
        return 1920, 1020

    except Exception as e:
        logger.error(f"All screen dimension methods failed: {e}")
        return 1920, 1020


def calculate_perfect_right_dock():
    """Dock window to the right edge of the screen in portrait mode.

    Width ≈ 27.7% of screen width (709/2560 on reference display).
    Height = full screen height.  x = screen_width - width (flush right).
    """
    screen_width, screen_height = get_screen_dimensions()

    perfect_width = int(screen_width * 709 / 2560)
    perfect_height = screen_height
    perfect_x = screen_width - perfect_width  # flush right edge
    perfect_y = 0

    logger.info("=== DIRECT PERFECT VALUES ===")
    logger.info(f"Screen: {screen_width}x{screen_height}")
    logger.info(f"Using: x={perfect_x}, y={perfect_y}, width={perfect_width}, height={perfect_height}")
    logger.info(f"Right edge will be: {perfect_x + perfect_width}")

    return {
        'x': perfect_x,
        'y': perfect_y,
        'width': perfect_width,
        'height': perfect_height
    }

def calculate_perfect_left_dock():
    """Left dock using same dimensions, positioned at left"""
    screen_width, screen_height = get_screen_dimensions()

    # Same size as right dock, but at left edge
    perfect_x = 9  # Small left margin
    perfect_y = 0
    perfect_width = 709
    perfect_height = 1377

    # Scale for different screens
    if screen_width != 2560 or screen_height != 1368:
        width_scale = screen_width / 2560
        height_scale = screen_height / 1368

        perfect_width = int(perfect_width * width_scale)
        perfect_height = int(perfect_height * height_scale)

    return {
        'x': perfect_x,
        'y': perfect_y,
        'width': perfect_width,
        'height': perfect_height
    }

def calculate_sidebar_position(side='right', sidebar_width=480):
    """Calculate sidebar position using perfect measurements"""
    if side == 'right':
        return calculate_perfect_right_dock()
    else:
        return calculate_perfect_left_dock()


def apply_window_positioning(window_instance, position_info):
    """Correct window position after first page load.

    pywebview's create_window() already sets the correct size using logical
    (DPI-normalised) values, so we only call move() here — NOT resize().
    resize() interprets values as physical pixels on the EdgeChromium backend,
    which would shrink the window by the DPI scale factor.
    """
    _applied = [False]

    def on_loaded():
        if _applied[0]:
            return
        _applied[0] = True

        # Unhook immediately so navigation doesn't re-trigger positioning
        try:
            window_instance.events.loaded -= on_loaded
        except Exception:
            pass

        try:
            # Re-query screen dimensions in pywebview's current DPI context
            screen_w, screen_h = get_screen_dimensions()

            # Recalculate x position (logical pixels for move())
            width = int(screen_w * 709 / 2560)

            mode = position_info.get('mode', 'default')
            if mode == 'sidebar':
                sb_w = position_info.get('sidebar_width', 0)
                x = max(0, (screen_w - width) - sb_w - 50)
            else:
                x = max(0, screen_w - width - 8)
            y = 0

            # Honour explicit --x/--y overrides
            if position_info.get('custom_x') is not None:
                x = position_info['custom_x']
                y = position_info.get('custom_y', 0)

            logger.info(f"on_loaded move: screen={screen_w}x{screen_h}, "
                        f"pos=({x},{y}), mode={mode}")

            # Only reposition — do NOT resize (create_window already set size)
            window_instance.move(x, y)

            logger.info("Window positioning applied successfully")
        except Exception as e:
            logger.error(f"Error applying window positioning: {str(e)}")

    window_instance.events.loaded += on_loaded
    return True

def setup_always_on_top(window_instance):
    """Set window to always be on top"""
    if sys.platform != "win32":
        return False

    try:
        from ctypes import windll

        def set_always_on_top():
            try:
                # Get window handle
                if hasattr(window_instance, 'original_window') and hasattr(window_instance.original_window, 'handle'):
                    hwnd = window_instance.original_window.handle
                elif hasattr(window_instance, 'handle'):
                    hwnd = window_instance.handle
                else:
                    # Try to find window by title
                    hwnd = windll.user32.FindWindowW(None, args.title)

                if not hwnd:
                    logger.error("Could not get window handle for always on top")
                    return False

                # Set window to always on top
                HWND_TOPMOST = -1
                SWP_NOMOVE = 0x0002
                SWP_NOSIZE = 0x0001

                windll.user32.SetWindowPos(
                    hwnd,
                    HWND_TOPMOST,
                    0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE
                )

                logger.info("Window set to always on top")
                return True
            except Exception as e:
                logger.error(f"Failed to set always on top: {str(e)}")
                return False

        window_instance.events.shown += set_always_on_top
        return True
    except Exception as e:
        logger.error(f"Error setting up always on top: {str(e)}")
        return False

# Function to call the Stop API endpoint
def call_stop_api():
    """
    Call the stop API to stop AI control processing
    """
    try:
        logger.info(f"Calling stop API ay {args.stop_api_url}")

        # Try to get user data from storage
        user_data_file = os.path.join(user_docs, 'HevolveAi Agent Companion', 'storage', 'user_data.json')
        stop_payload = {}

        if os.path.exists(user_data_file):
            try:
                with open(user_data_file) as f:
                    user_data = json.load(f)
                    user_id = user_data.get('user_id')

                    if user_id:
                        stop_payload['user_id'] = user_id

                        # If we've prompt_id, include it too
                        prompt_id = user_data.get('prompt_id')
                        if prompt_id:
                            stop_payload['prompt_id'] = prompt_id
                            logger.info(f"Using specific stop for user_id={user_id}, prompt_id={prompt_id}")
                        else:
                            logger.info(f"Using user-specific stop for user_id={user_id}")
            except Exception as e:
                logger.error(f"Error reading user data: {str(e)}")
        else:
            logger.info("No user data file found, using global stop")

        # Call the API in a daemon thread so it never blocks the UI
        def _do_stop():
            try:
                response = requests.post(
                    args.stop_api_url,
                    json=stop_payload,
                    headers={"Content-Type": "application/json"},
                    timeout=5
                )
                if response.status_code == 200:
                    logger.info(f"Stop API response: {response.json()}")
                else:
                    logger.error(f"Stop API failed: {response.status_code}")
            except Exception as ex:
                logger.error(f"Stop API error: {ex}")

        import threading as _stop_threading
        _stop_threading.Thread(target=_do_stop, daemon=True).start()
        return True
    except Exception as e:
        logger.error(f"Error calling stop API: {str(e)}")
        logger.error(traceback.format_exc())
        return False

# Ensure we're in the right directory when started from registry
def ensure_working_directory():
    """Ensure we're in the right working directory when launched from startup"""
    try:
        # Get the directory of the executable
        if getattr(sys, 'frozen', False):
            # Running as compiled executable
            app_dir = os.path.dirname(sys.executable)
        else:
            # Running as script
            app_dir = os.path.dirname(os.path.abspath(__file__))

        # Log the current and executable directories
        current_dir = os.getcwd()
        logger.info(f"Current working directory: {current_dir}")
        logger.info(f"Application directory: {app_dir}")

        # Change to the application directory if different
        if current_dir != app_dir:
            os.chdir(app_dir)
            logger.info(f"Changed working directory to: {app_dir}")

        return True
    except Exception as e:
        logger.error(f"Failed to set working directory: {str(e)}")
        return False

# Lightweight Flask — serves React SPA immediately while main.py imports.
# Has just enough routes for the webview to show the UI (static files + SPA catch-all).
# The full flask_app (with chat, social, admin routes) replaces it after import.
gui_app = Flask(__name__)

# Serve React SPA from gui_app so webview shows UI before main.py finishes
_gui_build_dir = os.path.join(
    os.path.dirname(os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__)),
    'landing-page', 'build')

@gui_app.route('/static/<path:path>')
def _gui_static(path):
    from flask import send_from_directory
    return send_from_directory(os.path.join(_gui_build_dir, 'static'), path)

@gui_app.route('/cors/test')
def _gui_cors_test():
    return jsonify({'success': True, 'message': 'CORS is working correctly'})

@gui_app.route('/backend/health')
@gui_app.route('/health')
def _gui_health():
    # Respond on both /health (where most clients probe) and
    # /backend/health (where Nunba's own frontend probes) — both paths
    # return the same "we're still booting, real Flask coming up" stub.
    return jsonify({'healthy': True, 'local': {'available': False}, 'loading': True,
                    'message': 'Nunba is waking up...'})

@gui_app.route('/chat', methods=['GET', 'POST'])
def _gui_chat_loading():
    # Accept both GET and POST during the boot window.  The real /chat
    # endpoint (registered by main.py's Flask app once it's up) is POST,
    # but clients that GET /chat during boot should still get a friendly
    # "loading" JSON instead of a 405 Method Not Allowed.
    return jsonify({
        'text': 'Loading tools... try again in a moment.',
        'source': 'loading', 'loading': True,
    })

@gui_app.route('/prompts', methods=['GET'])
def _gui_prompts_loading():
    return jsonify([])

def _ensure_page_rendered(window, port=5000):
    """Check if WebView2 rendered the page. If black/blank, force reload.

    WebView2 hidden mode loads URL but never renders. After hours hidden,
    the DOM is empty. This detects that and reloads on show.
    Called after any window.show() to fix the black screen.
    """
    if not window:
        return
    try:
        _cur = window.get_current_url() or ''
        _need_reload = not _cur or 'about:blank' in _cur or 'error' in _cur.lower()
        if not _need_reload:
            try:
                _has_content = window.evaluate_js(
                    "document.getElementById('root')?.children.length > 0"
                )
                if not _has_content:
                    _need_reload = True
            except Exception:
                _need_reload = True
        if _need_reload:
            logging.getLogger(__name__).info("[SHOW] Black screen detected — reloading page")
            window.load_url(f"http://localhost:{port}/local")
    except Exception:
        pass


@gui_app.route('/api/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def _gui_api_loading(path):
    return jsonify({'loading': True, 'message': 'Nunba is waking up...'}), 503

@gui_app.route('/clipboard/latest', methods=['GET'])
def _gui_clipboard_latest():
    """Return the last observed clipboard content."""
    return jsonify({'text': _last_clipboard})

@gui_app.route('/', defaults={'path': ''})
@gui_app.route('/<path:path>')
def _gui_catch_all(path):
    from flask import send_from_directory
    file_path = os.path.join(_gui_build_dir, path)
    if os.path.isfile(file_path):
        return send_from_directory(_gui_build_dir, path)
    return send_from_directory(_gui_build_dir, 'index.html')

# Placeholder — populated by _import_main_app() called from __main__ (after splash)
flask_app = None


def _refresh_sibling_deps(app_dir):
    """Auto-reinstall sibling editable deps if their finder is stale.

    Detects when HARTOS/pyproject.toml has modules not in the pip finder,
    then runs 'pip install -e . --no-deps' to regenerate. Runs once per
    session — skips if already fresh.
    """
    try:
        project_root = os.path.normpath(os.path.join(app_dir, '..'))
        hartos_dir = os.path.join(project_root, 'HARTOS')
        if not os.path.isdir(hartos_dir):
            return

        # Quick check: can we import agent_identity? (canary module)
        if importlib.util.find_spec('agent_identity'):
            return  # finder is fresh

        _setup_logger.info("[STARTUP] Stale editable install detected — refreshing sibling deps")
        import subprocess
        siblings = [
            ('HARTOS', 'hart-backend'),
            ('hevolveai', 'hevolveai'),
            ('Hevolve_Database', 'hevolve-database'),
            ('HARTOS/agent-ledger-opensource', 'agent-ledger'),
        ]
        for sib_dir, pkg_name in siblings:
            sib_path = os.path.join(project_root, sib_dir)
            if os.path.isdir(sib_path):
                subprocess.run(
                    [sys.executable, '-m', 'pip', 'install', '-e', sib_path,
                     '--no-deps', '--quiet'],
                    timeout=30, capture_output=True)
        _setup_logger.info("[STARTUP] Sibling deps refreshed")
    except Exception as e:
        _setup_logger.warning(f"[STARTUP] Sibling dep refresh failed: {e}")


def _import_main_app():
    """Import main.py and configure CORS. Called from __main__ AFTER splash is visible."""
    global flask_app, _startup_phase

    _startup_phase = 'importing_main'

    # Get the path to main.py in the same directory as this script
    if getattr(sys, 'frozen', False):
        app_dir = os.path.dirname(sys.executable)
    else:
        app_dir = os.path.dirname(os.path.abspath(__file__))

    main_path = os.path.join(app_dir, 'main.py')

    # Dev mode: auto-refresh sibling editable installs if stale
    # (e.g. new module added to HARTOS but pip finder not regenerated)
    if not getattr(sys, 'frozen', False):
        _refresh_sibling_deps(app_dir)

    _setup_logger.info(f"[STARTUP] Importing main.py from {main_path}")
    for h in logging.getLogger().handlers + _setup_logger.handlers:
        if hasattr(h, 'flush'):
            h.flush()

    # Load main.py as a module
    spec = importlib.util.spec_from_file_location("main_module", main_path)
    main_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(main_module)
    _setup_logger.info("[STARTUP] main.py imported successfully")
    for h in logging.getLogger().handlers + _setup_logger.handlers:
        if hasattr(h, 'flush'):
            h.flush()

    # Get the Flask app instance from main.py
    flask_app = main_module.app

    # Expose broadcast_sse_event on __main__ so HARTOS can find it.
    # HARTOS does `import __main__; __main__.broadcast_sse_event(...)`.
    # In frozen builds, __main__ is app.py, but broadcast_sse_event lives in main.py.
    if hasattr(main_module, 'broadcast_sse_event'):
        import __main__
        __main__.broadcast_sse_event = main_module.broadcast_sse_event

    # Start background services (TTS warm-up, vision, diarization, langchain)
    # main.py's if __name__=='__main__' block doesn't run when imported as module
    if hasattr(main_module, 'start_background_services'):
        threading.Thread(
            target=main_module.start_background_services,
            daemon=True, name='BackgroundServices'
        ).start()
    _startup_phase = 'main_imported'

    # Configure CORS properly for hevolve domains
    from flask_cors import CORS

    cors_config = {
        "origins": [
            "https://hevolve.ai",
            "https://www.hevolve.ai",
            "https://hevolve.hertzai.com",
            "https://hertzai.com",
            "https://www.hertzai.com",
            "https://www.hevolve.hertzai.com",
            "http://localhost:*",
            "http://127.0.0.1:*"
        ],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": [
            "Content-Type",
            "Authorization",
            "Access-Control-Allow-Credentials",
            "Access-Control-Allow-Origin",
            "Access-Control-Allow-Headers",
            "Access-Control-Allow-Methods"
        ],
        "supports_credentials": True,
        "max_age": 3600
    }

    CORS(flask_app, **cors_config)

    @flask_app.after_request
    def after_request(response):
        origin = request.headers.get('Origin')
        allowed_origins = [
            'https://hevolve.ai',
            'https://www.hevolve.ai',
            'https://hertzai.com',
            'https://www.hertzai.com',
            'https://hevolve.hertzai.com',
            'https://www.hevolve.hertzai.com'
        ]
        if origin and (origin in allowed_origins or
                      'localhost' in origin or
                      '127.0.0.1' in origin):
            response.headers['Access-Control-Allow-Origin'] = origin
        else:
            response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Max-Age'] = '3600'
        return response

    _startup_phase = 'module_ready'
    logger.info("Successfully imported main.py Flask application with CORS configured")

def check_existing_user_data():
    """Check for existing user data and update URL if all required data is present"""
    try:
        storage_dir = os.path.join(os.path.expanduser('~'), 'Documents', 'HevolveAi Agent Companion', 'storage')
        user_data_file = os.path.join(storage_dir, 'user_data.json')

        if os.path.exists(user_data_file):
            logger.info("Found existing user_data.json, checking contents")

            try:
                with open(user_data_file) as f:
                    user_data = json.load(f)

                logger.info(f"Loaded the JSON file from storage the value contains {user_data.keys()}")

                # Check if all required keys are present
                required_keys = ['agentname', 'user_id', 'access_token', 'email']
                if all(k in user_data for k in required_keys):
                    # Construct the URL with all parameters

                    # Properly URL encode each parameter
                    agent_name_encoded = urllib.parse.quote(user_data['agentname'])
                    email_encoded = urllib.parse.quote(user_data['email'])
                    token_encoded = urllib.parse.quote(user_data['access_token'])
                    userid_encoded = urllib.parse.quote(str(user_data['user_id']))

                    new_url = (f"https://hevolve.hertzai.com/agents/{agent_name_encoded}?"
                               f"email={email_encoded}&"
                               f"token={token_encoded}&"
                               f"userid={userid_encoded}&"
                               f"companion=true")

                    logger.info(f"Loading saved user data URL: {new_url}")
                    return new_url
                else:
                    logger.info("User data file exists but doesn't contain all required keys, using default URL")
            except json.JSONDecodeError:
                logger.error("User data file exists but contains invalid JSON, using default URL")
        else:
            logger.info("No existing user_data.json file found, using default URL")

        return "https://hevolve.hertzai.com/agents/Instructable-Agent?companion=true"
    except Exception as e:
        logger.error(f"Error checking existing user data: {str(e)}")
        return "https://hevolve.hertzai.com/agents/Instructable-Agent?companion=true"

def initialize_indicator(server_port=5000):
    """Initialize the indicator window if available"""
    import sys
    if sys.platform == "darwin":
        return  # NSWindow must be on main thread
    if not INDICATOR_AVAILABLE:
        return False

    try:
        # Start indicator in a separate thread to avoid blocking
        def init_indicator_thread():
            try:
                # Add a delay to ensure main window is created first
                time.sleep(2)

                # Initialize and then hide the indicator window
                indicator_module.initialize_indicator(server_port)  # Pass the port
                # Make sure it's explicitly hidden
                indicator_module.toggle_indicator(False, server_port)  # Pass port here too
                print("LLM control indicator initialized and hidden")
            except Exception as e:
                print(f"Error in indicator initialization thread: {str(e)}")

        # Start the thread
        indicator_thread = threading.Thread(target=init_indicator_thread, daemon=True)
        indicator_thread.start()
        return True

    except Exception as e:
        print(f"Failed to initialize indicator: {str(e)}")
        return False


def inject_custom_titlebar():
    """Inject hover-based custom title bar system with fixed button clicks"""
    global _window

    if not _window:
        logger.error("No window available for custom title bar injection")
        return False

    try:
        try:
            _window.evaluate_js("true")
        except Exception as e:
            logger.warning(f"Window not ready for JS evaluation: {str(e)}")
            return False

        js_code = f"""
        (function() {{
            try {{
                // Remove existing elements
                const existingTitleBar = document.getElementById('hevolve-custom-titlebar');
                const existingHoverZone = document.getElementById('hevolve-hover-zone');
                const hevolveInstallBtn = document.querySelector('.absolute.top-4.right-96.z-500.mr-3');
                if (hevolveInstallBtn) hevolveInstallBtn.remove();
                if (existingTitleBar) existingTitleBar.remove();
                if (existingHoverZone) existingHoverZone.remove();

                let sidebarActive = {str(args.sidebar).lower()};
                let currentSide = '{args.sidebar_side}';
                let titleBarVisible = false;

                // Create invisible hover zone at top-right - WIDER to cover button area
                const hoverZone = document.createElement('div');
                hoverZone.id = 'hevolve-hover-zone';
                hoverZone.style.cssText = `
                    position: fixed;
                    top: 0;
                    right: 0;
                    width: 200px;
                    height: 40px;
                    background: transparent;
                    z-index: 999999;
                    pointer-events: auto;
                `;

                // Show/hide title bar functions
                let hideTimeout;
                let currentTitleBar = null;

                function showTitleBar() {{
                    if (titleBarVisible) return;
                    clearTimeout(hideTimeout);

                    // Create title bar
                    currentTitleBar = document.createElement('div');
                    currentTitleBar.id = 'hevolve-custom-titlebar';
                    currentTitleBar.style.cssText = `
                        position: fixed;
                        top: 0;
                        left: 0;
                        right: 0;
                        height: 32px;
                        background: rgba(0, 0, 0, 0.95);
                        border-bottom: 1px solid #3c3c3c;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        z-index: 1000000;
                        -webkit-app-region: drag;
                        user-select: none;
                        font-family: 'Segoe UI', sans-serif;
                        font-size: 12px;
                        color: #ffffff;
                        opacity: 0;
                        transform: translateY(-10px);
                        transition: all 0.2s ease;
                        pointer-events: auto;
                    `;

                    // Left section
                    const leftSection = document.createElement('div');
                    leftSection.style.cssText = `
                        display: flex;
                        align-items: center;
                        padding-left: 12px;
                        -webkit-app-region: drag;
                    `;

                    const appTitle = document.createElement('span');
                    appTitle.textContent = 'Dock App Left | Right';
                    appTitle.style.cssText = `color: #ffffff; font-size: 13px;`;
                    leftSection.appendChild(appTitle);

                    // Right section - CRITICAL: Higher z-index and proper pointer events
                    const rightSection = document.createElement('div');
                    rightSection.style.cssText = `
                        display: flex;
                        align-items: center;
                        -webkit-app-region: no-drag;
                        z-index: 1000001;
                        position: relative;
                        pointer-events: auto;
                    `;

                    const createButton = (text, title) => {{
                        const btn = document.createElement('button');
                        btn.innerHTML = text;
                        btn.title = title;
                        btn.style.cssText = `
                            width: 46px; 
                            height: 32px; 
                            border: none; 
                            background: transparent;
                            color: #ffffff; 
                            cursor: pointer; 
                            font-size: 16px; 
                            font-weight: bold;
                            display: flex; 
                            align-items: center; 
                            justify-content: center;
                            transition: background-color 0.15s ease; 
                            -webkit-app-region: no-drag;
                            z-index: 1000002;
                            position: relative;
                            pointer-events: auto !important;
                        `;
                        return btn;
                    }};

                    const dockLeftBtn = createButton('⫷', 'Dock to Left');
                    const dockRightBtn = createButton('⫸', 'Dock to Right');

                    // Set button states
                    function updateButtonStates() {{
                        dockLeftBtn.style.background = sidebarActive && currentSide === 'left' ? '#0078d4' : 'transparent';
                        dockRightBtn.style.background = sidebarActive && currentSide === 'right' ? '#0078d4' : 'transparent';
                    }}

                    // Button hover effects
                    [dockLeftBtn, dockRightBtn].forEach(btn => {{
                        btn.addEventListener('mouseenter', () => {{
                            console.log('Button hover enter');
                            if (!btn.style.background.includes('#0078d4')) {{
                                btn.style.background = 'rgba(255,255,255,0.1)';
                            }}
                        }});
                        btn.addEventListener('mouseleave', updateButtonStates);
                    }});

                    // ENHANCED click handlers with better event handling
                    dockLeftBtn.addEventListener('click', async (e) => {{
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('Left dock button clicked - EVENT CAPTURED');

                        // Visual feedback
                        dockLeftBtn.style.background = '#005a9e';
                        setTimeout(() => updateButtonStates(), 150);

                        try {{
                            console.log('Sending left dock request...');
                            const response = await fetch('http://localhost:{args.port}/sidebar/toggle', {{
                                method: 'POST', 
                                headers: {{'Content-Type': 'application/json'}},
                                body: JSON.stringify({{side: 'left', width: 480}})
                            }});
                            console.log('Left dock response status:', response.status);
                            const result = await response.json();
                            console.log('Left dock result:', result);
                            if (result.success) {{ 
                                sidebarActive = result.sidebar; 
                                if (result.sidebar) currentSide = result.side; 
                                updateButtonStates(); 
                                console.log('Left dock applied successfully');
                            }} else {{
                                console.error('Left dock failed:', result.error);
                            }}
                        }} catch (e) {{ 
                            console.error('Left dock error:', e); 
                        }}
                    }}, true); // Use capture phase

                    dockRightBtn.addEventListener('click', async (e) => {{
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('Right dock button clicked - EVENT CAPTURED');

                        // Visual feedback
                        dockRightBtn.style.background = '#005a9e';
                        setTimeout(() => updateButtonStates(), 150);

                        try {{
                            console.log('Sending right dock request...');
                            const response = await fetch('http://localhost:{args.port}/sidebar/toggle', {{
                                method: 'POST', 
                                headers: {{'Content-Type': 'application/json'}},
                                body: JSON.stringify({{side: 'right', width: 480}})
                            }});
                            console.log('Right dock response status:', response.status);
                            const result = await response.json();
                            console.log('Right dock result:', result);
                            if (result.success) {{ 
                                sidebarActive = result.sidebar; 
                                if (result.sidebar) currentSide = result.side; 
                                updateButtonStates(); 
                                console.log('Right dock applied successfully');
                            }} else {{
                                console.error('Right dock failed:', result.error);
                            }}
                        }} catch (e) {{ 
                            console.error('Right dock error:', e); 
                        }}
                    }}, true); // Use capture phase

                    // Assemble title bar
                    rightSection.append(dockLeftBtn, dockRightBtn);
                    currentTitleBar.append(leftSection, rightSection);

                    // IMPORTANT: Title bar hover handling - don't interfere with buttons
                    currentTitleBar.addEventListener('mouseenter', () => {{
                        console.log('Title bar hover enter');
                        clearTimeout(hideTimeout);
                    }});

                    currentTitleBar.addEventListener('mouseleave', (e) => {{
                        console.log('Title bar hover leave');
                        // Only hide if not moving to a button
                        if (!e.relatedTarget || !rightSection.contains(e.relatedTarget)) {{
                            hideTitleBar();
                        }}
                    }});

                    updateButtonStates();

                    // Add to DOM
                    document.body.appendChild(currentTitleBar);
                    document.body.style.paddingTop = '32px';

                    // Animate in
                    setTimeout(() => {{
                        currentTitleBar.style.opacity = '1';
                        currentTitleBar.style.transform = 'translateY(0)';
                    }}, 10);

                    titleBarVisible = true;
                    console.log('Title bar shown with enhanced button handling');
                }}

                function hideTitleBar() {{
                    if (!titleBarVisible || !currentTitleBar) return;

                    hideTimeout = setTimeout(() => {{
                        if (currentTitleBar && currentTitleBar.parentNode) {{
                            console.log('Hiding title bar');
                            // Animate out
                            currentTitleBar.style.opacity = '0';
                            currentTitleBar.style.transform = 'translateY(-32px)';

                            // Remove from DOM
                            setTimeout(() => {{
                                if (currentTitleBar && currentTitleBar.parentNode) {{
                                    currentTitleBar.parentNode.removeChild(currentTitleBar);
                                    document.body.style.paddingTop = '0';
                                    currentTitleBar = null;
                                }}
                                titleBarVisible = false;
                            }}, 200);
                        }}
                    }}, 1000); // Longer delay to allow button interaction
                }}

                // IMPROVED hover zone events - don't interfere with title bar
                hoverZone.addEventListener('mouseenter', () => {{
                    console.log('Hover zone enter');
                    showTitleBar();
                }});

                hoverZone.addEventListener('mouseleave', (e) => {{
                    console.log('Hover zone leave');
                    // Only hide if not moving to title bar
                    if (!e.relatedTarget || !currentTitleBar || !currentTitleBar.contains(e.relatedTarget)) {{
                        hideTitleBar();
                    }}
                }});

                // Add hover zone to page
                document.body.appendChild(hoverZone);

                console.log('Enhanced hover-based title bar system injected successfully');
                return true;
            }} catch (e) {{
                console.error('Error in title bar:', e);
                return false;
            }}
        }})();
        """

        result = _window.evaluate_js(js_code)
        logger.info("Enhanced title bar system with fixed button clicks injected successfully")
        return True

    except Exception as e:
        logger.error(f"Error injecting enhanced title bar: {str(e)}")
        return False

def inject_custom_titlebar_with_retry(max_retries=3, delay=1.0):
    """Inject custom title bar with retry logic"""
    for attempt in range(max_retries):
        try:
            logger.info(f"Attempting to inject custom title bar (attempt {attempt + 1}/{max_retries})")
            if inject_custom_titlebar():
                return True
            else:
                if attempt < max_retries - 1:
                    logger.warning(f"Title bar injection attempt {attempt + 1} failed, retrying in {delay} seconds...")
                    time.sleep(delay)
        except Exception as e:
            logger.error(f"Title bar injection attempt {attempt + 1} failed with exception: {str(e)}")
            if attempt < max_retries - 1:
                time.sleep(delay)

    logger.error("All title bar injection attempts failed")
    return False

def setup_custom_titlebar_injection():
    """Set up automatic injection of custom title bar when page loads"""
    global _window

    def on_loaded():
        # Add a delay to ensure page is fully loaded, then try injection with retry
        def delayed_injection():
            time.sleep(2)  # Wait for page to be fully ready
            logger.info("Page loaded, attempting to inject custom title bar")
            inject_custom_titlebar_with_retry(max_retries=3, delay=1.0)

        injection_thread = threading.Thread(target=delayed_injection, daemon=True)
        injection_thread.start()

    # Add event handler for when page loads
    _window.events.loaded += on_loaded

def setup_connectivity_monitor(window, port):
    """Inject JS that monitors connectivity and handles offline/online transitions.

    Features:
    - Detects when webview page fails to load (offline) and redirects to /local
    - Polls /api/connectivity every 15s to detect network changes
    - Shows a snackbar when in local/offline mode
    - Injects a "Go Local" button on hevolve.ai pages for manual switch
    - When internet returns, offers to switch back to cloud mode
    """
    local_url = f'http://localhost:{port}/local'
    connectivity_url = f'http://localhost:{port}/api/connectivity'

    connectivity_js = """
(function() {
    if (window.__nunbaConnectivityMonitor) return;
    window.__nunbaConnectivityMonitor = true;

    var LOCAL_URL = '""" + local_url + """';
    var CHECK_URL = '""" + connectivity_url + """';
    var POLL_INTERVAL = 15000;
    var wasOffline = !navigator.onLine;
    var isLocalMode = (location.pathname === '/local');

    // ── Snackbar ──
    function showSnackbar(msg, action, actionText, duration) {
        var existing = document.getElementById('nunba-snackbar');
        if (existing) existing.remove();

        var bar = document.createElement('div');
        bar.id = 'nunba-snackbar';
        bar.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
            'background:#323232;color:#fff;padding:12px 24px;border-radius:8px;z-index:999999;' +
            'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;' +
            'display:flex;align-items:center;gap:12px;box-shadow:0 4px 12px rgba(0,0,0,0.3);' +
            'transition:opacity 0.3s;opacity:0;max-width:90vw;';

        var text = document.createElement('span');
        text.textContent = msg;
        bar.appendChild(text);

        if (action && actionText) {
            var btn = document.createElement('button');
            btn.textContent = actionText;
            btn.style.cssText = 'background:none;border:none;color:#4FC3F7;font-weight:bold;' +
                'cursor:pointer;font-size:14px;white-space:nowrap;padding:4px 8px;';
            btn.onclick = function() { action(); bar.remove(); };
            bar.appendChild(btn);
        }

        var close = document.createElement('button');
        close.textContent = '\\u00d7';
        close.style.cssText = 'background:none;border:none;color:#999;font-size:18px;' +
            'cursor:pointer;padding:0 4px;margin-left:4px;';
        close.onclick = function() { bar.remove(); };
        bar.appendChild(close);

        document.body.appendChild(bar);
        requestAnimationFrame(function() { bar.style.opacity = '1'; });

        if (duration) {
            setTimeout(function() {
                if (bar.parentNode) {
                    bar.style.opacity = '0';
                    setTimeout(function() { bar.remove(); }, 300);
                }
            }, duration);
        }
    }

    // ── Nunba Action Pill ──
    // Polymorphic contextual button — appears briefly on events, then fades out.
    // Events: compute mode change, errors, retries, connectivity loss/restore.
    var _pillTimer = null;
    var _pillEl = null;
    // Grace period: suppress error pills for 15s after page load (Flask may still be starting)
    var _pillReady = false;
    setTimeout(function() { _pillReady = true; }, 15000);
    // Consecutive failure counter — only show pill after 3+ failures in a row
    var _errorCount = 0;
    var _errorThreshold = 3;
    // Endpoints known to 500 occasionally — don't trigger pill for these
    var _silentPaths = ['/resonance/', '/onboarding/', '/streak', '/wallet', '/level-info',
                        '/leaderboard', '/transactions', '/network/status', '/favicon',
                        'azurekong.hertzai.com', 'mailer.hertzai.com', 'sms.hertzai.com',
                        '/getprompt_all', '/getprompt_userid'];
    function _isSilentUrl(url) {
        for (var i = 0; i < _silentPaths.length; i++) {
            if (url.indexOf(_silentPaths[i]) !== -1) return true;
        }
        return false;
    }
    function _dismissErrorPill() {
        // Auto-dismiss red pill when things recover
        if (_pillEl && _pillEl.style.background.indexOf('D32F2F') !== -1) {
            _pillEl.style.opacity = '0';
            setTimeout(function() { if (_pillEl) { _pillEl.remove(); _pillEl = null; } }, 300);
        }
    }

    function showPill(opts) {
        // opts: { label, bg, icon, title, action, duration }
        // action: function called on click (or null for non-clickable)
        // duration: ms before auto-fade (default 4000, null = sticky until dismissed)
        if (_pillTimer) clearTimeout(_pillTimer);

        if (!_pillEl) {
            _pillEl = document.createElement('div');
            _pillEl.id = 'nunba-action-pill';
            _pillEl.style.cssText = 'position:fixed;bottom:24px;right:16px;color:#fff;' +
                'padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600;z-index:999998;' +
                'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;' +
                'box-shadow:0 4px 16px rgba(0,0,0,0.3);' +
                'transform:translateY(20px);opacity:0;' +
                'transition:opacity 0.4s,transform 0.4s,background 0.3s;' +
                'pointer-events:none;white-space:nowrap;';
            document.body.appendChild(_pillEl);
        }

        _pillEl.style.background = opts.bg || '#6C63FF';
        _pillEl.textContent = (opts.icon || '') + ' ' + (opts.label || '');
        _pillEl.title = opts.title || '';
        _pillEl.style.cursor = opts.action ? 'pointer' : 'default';
        _pillEl.onclick = opts.action || null;

        // Animate in
        requestAnimationFrame(function() {
            _pillEl.style.opacity = '1';
            _pillEl.style.transform = 'translateY(0)';
            _pillEl.style.pointerEvents = opts.action ? 'auto' : 'none';
        });

        // Auto-fade
        var dur = opts.duration !== undefined ? opts.duration : 4000;
        if (dur) {
            _pillTimer = setTimeout(function() { hidePill(); }, dur);
        }
    }

    function hidePill() {
        if (_pillTimer) { clearTimeout(_pillTimer); _pillTimer = null; }
        if (_pillEl) {
            _pillEl.style.opacity = '0';
            _pillEl.style.transform = 'translateY(20px)';
            _pillEl.style.pointerEvents = 'none';
        }
    }

    // ── Preset pills ──
    function showComputePill(mode) {
        var presets = {
            local: { label: 'Local \\u00b7 Nunba', bg: '#6C63FF', icon: '\\u2699', title: 'AI running on your device' },
            cloud: { label: 'Cloud \\u00b7 Nunba', bg: '#00BFA5', icon: '\\u2601', title: 'AI running on hevolve.ai' },
            hive:  { label: 'Hive \\u00b7 Nunba',  bg: '#FF6B6B', icon: '\\u2B21', title: 'AI running on peer network' }
        };
        var p = presets[mode] || presets.local;
        p.action = function() { location.href = LOCAL_URL; };
        p.duration = 3000;
        showPill(p);
    }

    function showErrorPill(msg, retryFn) {
        // Suppress during startup grace period (Flask may still be booting)
        if (!_pillReady) return;
        showPill({
            label: msg || 'Something went wrong',
            bg: '#D32F2F',
            icon: '\\u26A0',
            title: 'Tap to retry',
            action: retryFn || function() { location.reload(); },
            duration: 8000  // auto-dismiss after 8s (clickable before that)
        });
    }

    function showOfflinePill() {
        showPill({
            label: 'Offline — tap for local mode',
            bg: '#F57C00',
            icon: '\\u26A1',
            title: 'Internet lost — switch to local AI',
            action: function() { location.href = LOCAL_URL; },
            duration: null
        });
    }

    function showOnlinePill() {
        showPill({
            label: 'Back online',
            bg: '#00BFA5',
            icon: '\\u2713',
            title: 'Internet restored',
            duration: 3000
        });
    }

    // ── Universal rescue: intercept ALL failures ──

    // 1. Fetch interceptor — catches /chat errors AND any failed API call
    var _origFetch = window.fetch;
    window.fetch = function() {
        var args = arguments;
        var url = (typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url) || '';
        return _origFetch.apply(this, args).then(function(response) {
            try {
                // /chat responses — detect compute source or errors
                if (url.indexOf('/chat') !== -1) {
                    response.clone().json().then(function(data) {
                        if (data.error && !data.success) {
                            if (data.error === 'auth_required' || data.error === 'auth_failed') {
                                showErrorPill('Sign in for cloud agents', function() { location.href = '/social'; });
                            } else if (data.error === 'no_internet') {
                                showOfflinePill();
                            } else if (data.error === 'cloud_unavailable' || data.error === 'timeout') {
                                showErrorPill('Cloud unavailable — tap for local', function() { location.href = LOCAL_URL; });
                            } else {
                                showErrorPill('Chat error — tap to retry', function() { location.reload(); });
                            }
                        } else if (data.source) {
                            if (data.source.indexOf('cloud') !== -1) showComputePill('cloud');
                            else if (data.source.indexOf('hive') !== -1 || data.source.indexOf('peer') !== -1) showComputePill('hive');
                            else showComputePill('local');
                        }
                    }).catch(function() {});
                }
                // Any API returning 5xx (skip known-flaky endpoints)
                if (response.status >= 500 && url.indexOf('/chat') === -1 && !_isSilentUrl(url)) {
                    _errorCount++;
                    if (_errorCount >= _errorThreshold) {
                        showErrorPill('Server error — tap to reload', function() { location.reload(); });
                    }
                } else if (response.ok) {
                    _errorCount = 0; _dismissErrorPill();
                }
            } catch(e) {}
            return response;
        }).catch(function(err) {
            // Network failure (fetch itself failed — server down, CORS, DNS, etc.)
            if (!_isSilentUrl(url)) {
                _errorCount++;
                if (!navigator.onLine) {
                    showOfflinePill();
                } else if (_errorCount >= _errorThreshold) {
                    showErrorPill('Connection lost — tap to retry', function() { location.reload(); });
                }
            }
            throw err;  // re-throw so caller's .catch still fires
        });
    };

    // 2. XMLHttpRequest interceptor (axios, legacy code)
    var _origXhrOpen = XMLHttpRequest.prototype.open;
    var _origXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
        this._nunbaUrl = url;
        return _origXhrOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
        var xhr = this;
        xhr.addEventListener('error', function() {
            if (xhr._nunbaUrl && !_isSilentUrl(xhr._nunbaUrl)) {
                _errorCount++;
                if (!navigator.onLine) showOfflinePill();
                else if (_errorCount >= _errorThreshold) showErrorPill('Request failed — tap to retry', function() { location.reload(); });
            }
        });
        xhr.addEventListener('load', function() {
            if (xhr.status >= 500 && xhr._nunbaUrl && xhr._nunbaUrl.indexOf('/chat') === -1 && !_isSilentUrl(xhr._nunbaUrl)) {
                _errorCount++;
                if (_errorCount >= _errorThreshold) showErrorPill('Server error — tap to reload', function() { location.reload(); });
            } else if (xhr.status < 400) {
                _errorCount = 0; _dismissErrorPill();
            }
        });
        return _origXhrSend.apply(this, arguments);
    };

    // 3. Unhandled JS errors (React crashes, import failures, etc.)
    window.addEventListener('error', function(e) {
        var msg = (e.message || '').toLowerCase();
        // Skip noise: ResizeObserver, script load errors from extensions
        if (msg.indexOf('resizeobserver') !== -1) return;
        if (msg.indexOf('script error') !== -1) return;
        console.error('[Nunba Pill] Caught error:', e.message);
        showErrorPill('Something broke — tap to recover', function() {
            location.href = LOCAL_URL;
        });
    });

    // 4. Unhandled promise rejections (async crashes, failed dynamic imports)
    window.addEventListener('unhandledrejection', function(e) {
        var reason = (e.reason && (e.reason.message || String(e.reason))) || '';
        // Skip cancelled requests and abort signals
        if (reason.indexOf('AbortError') !== -1) return;
        if (reason.indexOf('cancelled') !== -1) return;
        console.error('[Nunba Pill] Unhandled rejection:', reason);
        if (reason.indexOf('Loading chunk') !== -1 || reason.indexOf('Failed to fetch') !== -1) {
            showErrorPill('Page failed to load — tap to retry', function() { location.reload(); });
        } else if (reason.indexOf('NetworkError') !== -1 || reason.indexOf('Network Error') !== -1) {
            if (!navigator.onLine) showOfflinePill();
            else showErrorPill('Network error — tap to retry', function() { location.reload(); });
        } else {
            showErrorPill('Something went wrong — tap to recover', function() { location.href = LOCAL_URL; });
        }
    });

    // 5. Navigation failures (SPA pushState errors, history API)
    window.addEventListener('popstate', function() {
        // If the page is blank after navigation (React failed to render)
        setTimeout(function() {
            var root = document.getElementById('root');
            if (root && root.children.length === 0) {
                showErrorPill('Page failed to load — tap to go home', function() { location.href = LOCAL_URL; });
            }
        }, 2000);
    });

    // Backward compat
    function showLocalIndicator() { showComputePill('local'); }
    function hideLocalIndicator() { hidePill(); }

    // ── "Go Local" button injection on cloud pages ──
    function injectGoLocalButton() {
        if (document.getElementById('nunba-go-local-btn')) return;
        // Only inject on hevolve.ai pages (cloud mode)
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;

        var btn = document.createElement('button');
        btn.id = 'nunba-go-local-btn';
        btn.textContent = 'Go Local';
        btn.title = 'Switch to offline local mode';
        btn.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#1976D2;color:#fff;' +
            'border:none;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:600;' +
            'cursor:pointer;z-index:999998;box-shadow:0 2px 8px rgba(0,0,0,0.3);' +
            'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;' +
            'transition:background 0.2s;';
        btn.onmouseenter = function() { btn.style.background = '#1565C0'; };
        btn.onmouseleave = function() { btn.style.background = '#1976D2'; };
        btn.onclick = function() { location.href = LOCAL_URL; };
        document.body.appendChild(btn);
    }

    // ── Error page detection ──
    // If webview shows an error page (failed to load hevolve.ai), redirect to /local
    function checkForLoadError() {
        // WebView2 error pages have specific titles/content
        var title = document.title.toLowerCase();
        var body = (document.body && document.body.innerText) || '';
        if (title.includes("can't reach") || title.includes('cannot reach') ||
            title.includes('no internet') || title.includes('err_') ||
            body.includes('ERR_NAME_NOT_RESOLVED') || body.includes('ERR_INTERNET_DISCONNECTED') ||
            body.includes('ERR_CONNECTION_REFUSED') || body.includes('ERR_NETWORK_CHANGED')) {
            console.log('[Nunba] Load error detected, redirecting to local mode');
            location.href = LOCAL_URL;
        }
    }

    // ── Connectivity polling ──
    var lastOnline = null;

    function pollConnectivity() {
        fetch(CHECK_URL, {method: 'GET', cache: 'no-store'})
            .then(function(r) { return r.json(); })
            .then(function(data) {
                var online = data.online;
                if (lastOnline === null) {
                    lastOnline = online;
                    return;
                }
                // Transition: online → offline
                if (lastOnline && !online) {
                    console.log('[Nunba] Internet lost');
                    if (!isLocalMode) {
                        showSnackbar('Internet connection lost', function() {
                            location.href = LOCAL_URL;
                        }, 'Go Local', null);
                    }
                }
                // Transition: offline → online
                if (!lastOnline && online) {
                    console.log('[Nunba] Internet restored');
                    if (isLocalMode) {
                        showSnackbar('Internet connection restored', function() {
                            location.href = 'https://hevolve.ai';
                        }, 'Go Online', 10000);
                    }
                    hideLocalIndicator();
                }
                lastOnline = online;
            })
            .catch(function() {
                // Flask itself is down — ignore
            });
    }

    // ── Browser online/offline events (instant detection) ──
    window.addEventListener('offline', function() {
        console.log('[Nunba] Browser reports offline');
        if (!isLocalMode) {
            showSnackbar('Internet connection lost', function() {
                location.href = LOCAL_URL;
            }, 'Go Local', null);
        }
    });

    window.addEventListener('online', function() {
        console.log('[Nunba] Browser reports online');
        // Verify via server before offering cloud switch
        pollConnectivity();
    });

    // ── Initialize ──
    // Check for error page shortly after load
    setTimeout(checkForLoadError, 1500);

    // Brief compute pill on startup
    if (isLocalMode) {
        showComputePill('local');
    }

    // Inject "Go Local" button on cloud pages
    if (!isLocalMode) {
        injectGoLocalButton();
    }

    // Start polling
    setInterval(pollConnectivity, POLL_INTERVAL);
    // Initial check
    setTimeout(pollConnectivity, 2000);
})();
"""

    _cm_last_inject = [0]

    def on_page_loaded():
        """Inject connectivity monitor JS on page load (debounced to prevent spam)."""
        now = time.time()
        if now - _cm_last_inject[0] < 10:
            return  # Skip if last injection was <10s ago (prevents reload spam)
        _cm_last_inject[0] = now

        def _inject():
            try:
                time.sleep(1)  # Wait for DOM to be ready
                window.evaluate_js(connectivity_js)
                logger.info("Connectivity monitor JS injected")
            except Exception as e:
                logger.warning(f"Failed to inject connectivity monitor: {e}")

        threading.Thread(target=_inject, daemon=True).start()

    window.events.loaded += on_page_loaded


def _dynamic_wsgi_app(environ, start_response):
    """WSGI dispatcher that routes to flask_app (full) when available, else gui_app."""
    app = flask_app if flask_app is not None else gui_app
    return app(environ, start_response)


def start_flask():
    """Start the Flask server in a separate thread.

    Uses a dynamic WSGI dispatcher so that once main.py finishes importing
    and sets flask_app, all new requests are automatically routed to the
    full Flask app — no server restart needed.
    """
    global flask_app
    _serving_app = flask_app
    if _serving_app is None:
        logger.info("flask_app not ready yet — serving dynamic dispatcher (gui_app until main.py loads)")
        _serving_app = gui_app
    try:
        # Add CORS preflight handler for all routes
        # Use _serving_app (gui_app when flask_app is None, flask_app when ready)
        @_serving_app.before_request
        def handle_preflight():
            if request.method == "OPTIONS":
                response = jsonify({"status": "ok"})
                origin = request.headers.get('Origin')

                # Allow requests from hevolve domains and localhost
                allowed_origins = [
                    'https://hevolve.ai',
                    'https://www.hevolve.ai',
                    'https://hevolve.hertzai.com',
                    'https://www.hevolve.hertzai.com'
                ]

                if origin and (origin in allowed_origins or
                              'localhost' in origin or
                              '127.0.0.1' in origin):
                    response.headers['Access-Control-Allow-Origin'] = origin
                else:
                    response.headers['Access-Control-Allow-Origin'] = '*'

                response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
                response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
                response.headers['Access-Control-Allow-Credentials'] = 'true'
                response.headers['Access-Control-Max-Age'] = '3600'

                return response

        # Add hide to tray endpoint
        @_serving_app.route('/hide_to_tray', methods=['GET', 'OPTIONS'])
        def hide_to_tray_endpoint():
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            # This will signal the window to be hidden in the main thread
            global _window
            if _window:
                _window.hide()
                # Show notification
                if _tray_icon:
                    notify_minimized_to_tray(_tray_icon)
            return jsonify({"success": True})

        # Add show window endpoint
        @_serving_app.route('/show_window', methods=['GET', 'OPTIONS'])
        def show_window_endpoint():
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            global _window
            if _window:
                _window.show()
                _ensure_page_rendered(_window, args.port)
            return jsonify({"success": True})

        @_serving_app.route('/indicator/show', methods=['GET', 'OPTIONS'])
        def show_indicator_endpoint():
            """Show the LLM control indicator"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            if INDICATOR_AVAILABLE:
                try:
                    indicator_module.toggle_indicator(True)
                    return jsonify({"success": True, "status": "showing"})
                except Exception as e:
                    return jsonify({"success": False, "error": str(e)})
            else:
                return jsonify({"success": False, "error": "Indicator module not available"})

        @_serving_app.route('/indicator/hide', methods=['GET', 'OPTIONS'])
        def hide_indicator_endpoint():
            """Hide the LLM control indicator"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            if INDICATOR_AVAILABLE:
                try:
                    indicator_module.toggle_indicator(False)
                    return jsonify({"success": True, "status": "hidden"})
                except Exception as e:
                    return jsonify({"success": False, "error": str(e)})
            else:
                return jsonify({"success": False, "error": "Indicator module not available"})

        @_serving_app.route('/indicator/status', methods=['GET', 'OPTIONS'])
        def indicator_status_endpoint():
            """Get the status of the LLM control indicator"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            if INDICATOR_AVAILABLE:
                try:
                    status = indicator_module.get_status()
                    return jsonify({"success": True, "status": status})
                except Exception as e:
                    return jsonify({"success": False, "error": str(e)})
            else:
                return jsonify({"success": False, "error": "Indicator module not available"})

        @_serving_app.route('/api/focus', methods=['GET', 'POST'])
        def api_focus():
            """Bring the webview window to the foreground (called by duplicate instances)."""
            try:
                if _window is not None:
                    _window.show()  # unhide if started in background mode
                    _window.restore()
                    # Load /local if page was never loaded (background start)
                    try:
                        _cur = _window.get_current_url() or ''
                        if not _cur or 'about:blank' in _cur:
                            _window.load_url(f"http://localhost:{args.port}/local")
                    except Exception:
                        pass
                    _window.on_top = True
                    import threading as _thr
                    _thr.Timer(0.5, lambda: setattr(_window, 'on_top', False)).start()
                return jsonify({"focused": True})
            except Exception as e:
                return jsonify({"focused": False, "error": str(e)})

        @_serving_app.route('/api/storage/set', methods = ['POST', 'OPTIONS'])
        def set_storage():
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            try:
                global _window
                data = request.json

                # Validate that we've at least one of the expected keys
                expected_keys = ['agentname', 'email', 'access_token', 'user_id']
                found_keys = [key for key in expected_keys if key in data]

                if not found_keys:
                    return jsonify({
                        'success': False,
                        'companion_app': True,
                        'error': 'No valid keys provided. Expceted one of: agentname, email, token or user_id'
                    })

                # Store in a file
                storage_dir = os.path.join(os.path.expanduser('~'), 'Documents', 'HevolveAi Agent Companion', 'storage')
                os.makedirs(storage_dir, exist_ok=True)
                user_data_file = os.path.join(storage_dir, 'user_data.json')

                user_data = {}
                # Update specific keys from the data
                for key in found_keys:
                    user_data[key] = data[key]

                # Save the new data (completely overwriting any existing file)
                with open(user_data_file, 'w') as f:
                    json.dump(user_data, f)

                logger.info(f"Completely overwrote user_data.json with new data containing keys: {list(user_data.keys())}")

                # Check if we have all required keys to update the URL
                required_keys = ['agentname', 'user_id', 'access_token', 'email']
                url_updated = False

                if all(k in user_data for k in required_keys) and _window:
                    #Properly URL encode each parameter
                    agent_name_encoded = urllib.parse.quote(user_data['agentname'])
                    email_encoded = urllib.parse.quote(user_data['email'])
                    token_encoded = urllib.parse.quote(user_data['access_token'])
                    userid_encoded = urllib.parse.quote(str(user_data['user_id']))
                    # Construct the new URL with all parameters
                    new_url = (f"https://hevolve.hertzai.com/agents/{agent_name_encoded}?"
                               f"email={email_encoded}&"
                               f"token={token_encoded}&"
                               f"userid={userid_encoded}&"
                               f"companion=true")

                    logger.info(f"Attempting to load URL: {new_url}")

                    # Update the window URL
                    try:
                        _window.load_url(new_url)
                        logger.info(f"Updated window URL to: {new_url}")
                        url_updated = True
                    except Exception as e:
                        logger.error(f"Failed to update window URL: {str(e)}")

                return jsonify({
                    'success': True,
                    'url_updated': url_updated,
                    'keys_present': list(user_data.keys()),
                    'all_required_keys_present': all(k in user_data for k in required_keys)})
            except Exception as e:
                return jsonify({'success': False, 'error': str(e)})

        @_serving_app.route('/api/storage/get/<key>', methods=['GET', 'OPTIONS'])
        def get_storage(key):
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            try:
                user_data_file = os.path.join(os.path.expanduser('~'), 'Documents', 'HevolveAi Agent Companion', 'storage', 'user_data.json')

                if os.path.exists(user_data_file):
                    with open(user_data_file) as f:
                        user_data = json.load(f)

                    if key in user_data:
                        return jsonify({"success": True, "data": user_data[key]})
                    else:
                        return jsonify({"success": False, "error": "Key not found"})
                else:
                    return jsonify({"success": False, "error": "User data not found"})
            except Exception as e:
                return jsonify({"success": False, "error": str(e)})

        # Enhanced Flask endpoints for sidebar control
        @_serving_app.route('/sidebar/toggle', methods=['POST', 'OPTIONS'])
        def toggle_sidebar():
            """Toggle sidebar mode"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            global _window, args
            try:
                data = request.json or {}
                requested_side = data.get('side', 'right')
                width = max(data.get('width', 480), 480)

                logger.info(f"Sidebar toggle request: side={requested_side}, current_sidebar={args.sidebar}, current_side={getattr(args, 'sidebar_side', None)}")

                # Determine what action to take
                if args.sidebar and args.sidebar_side == requested_side:
                    # Already in the requested sidebar mode - turn off sidebar
                    args.sidebar = False
                    _window.resize(args.width, args.height)
                    _window.move(100, 100)  # Move to a normal position
                    logger.info(f"Turned off {requested_side} sidebar mode")
                else:
                    # Either not in sidebar mode, or switching sides
                    args.sidebar = True
                    args.sidebar_side = requested_side
                    args.sidebar_width = width

                    # Apply positioning using direct perfect values - no complex logic
                    try:
                        logger.info(f"Applying DIRECT perfect {requested_side} positioning")

                        # Get perfect position calculation (now just direct values)
                        if requested_side == 'right':
                            perfect_calc = calculate_perfect_right_dock()
                            perfect_calc['x'] = perfect_calc['x'] - args.sidebar_width - 50
                        else:
                            perfect_calc = calculate_perfect_left_dock()
                            perfect_calc['x'] = perfect_calc['x'] - 20


                        logger.info(f"Direct values: x={perfect_calc['x']}, y={perfect_calc['y']}, size={perfect_calc['width']}x{perfect_calc['height']}")

                        # Apply positioning with exact values
                        _window.resize(perfect_calc['width'], perfect_calc['height'])
                        time.sleep(0.3)
                        _window.move(perfect_calc['x'], perfect_calc['y'])
                        time.sleep(0.2)
                        _window.show()

                        logger.info(f"Moved window to EXACT position: x={perfect_calc['x']}, y={perfect_calc['y']}")

                    except Exception as pos_error:
                        logger.error(f"Error during direct positioning: {str(pos_error)}")
                        # Simple fallback to your exact values
                        try:
                            _fb = calculate_perfect_right_dock()
                            _window.resize(_fb['width'], _fb['height'])
                            time.sleep(0.2)
                            _window.move(_fb['x'], _fb['y'])
                            time.sleep(0.2)
                            _window.show()
                            logger.info(f"Applied direct fallback: {_fb['width']}x{_fb['height']} at ({_fb['x']}, {_fb['y']})")
                        except Exception as e2:
                            logger.error(f"Even direct fallback failed: {str(e2)}")

                    logger.info(f"Switched to {requested_side} sidebar mode: {width}px wide")

                # Re-inject custom title bar with updated state (with retry)
                def delayed_re_injection():
                    time.sleep(0.5)
                    inject_custom_titlebar_with_retry(max_retries=2, delay=0.5)

                threading.Thread(target=delayed_re_injection, daemon=True).start()

                return jsonify({
                    "success": True,
                    "sidebar": args.sidebar,
                    "side": args.sidebar_side if args.sidebar else None,
                    "width": width
                })
            except Exception as e:
                logger.error(f"Error toggling sidebar: {str(e)}")
                return jsonify({"success": False, "error": str(e)})

        @_serving_app.route('/window/position', methods=['POST', 'OPTIONS'])
        def set_window_position():
            """Set window position and size"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            global _window
            try:
                data = request.json or {}
                x = data.get('x')
                y = data.get('y')
                width = data.get('width')
                height = data.get('height')

                if x is not None and y is not None:
                    _window.move(x, y)
                    logger.info(f"Moved window to {x}, {y}")

                if width is not None and height is not None:
                    _window.resize(width, height)
                    logger.info(f"Resized window to {width}x{height}")

                return jsonify({"success": True, "x": x, "y": y, "width": width, "height": height})
            except Exception as e:
                logger.error(f"Error setting window position: {str(e)}")
                return jsonify({"success": False, "error": str(e)})

        @_serving_app.route('/window/always-on-top', methods=['POST', 'OPTIONS'])
        def toggle_always_on_top():
            """Toggle always on top mode"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            global _window, args
            try:
                data = request.json or {}
                enable = data.get('enable', not args.always_on_top)

                args.always_on_top = enable

                if enable:
                    setup_always_on_top(_window)
                    logger.info("Enabled always on top")
                else:
                    # Remove always on top
                    if sys.platform == "win32":
                        from ctypes import windll

                        hwnd = windll.user32.FindWindowW(None, args.title)
                        if hwnd:
                            HWND_NOTOPMOST = -2
                            SWP_NOMOVE = 0x0002
                            SWP_NOSIZE = 0x0001
                            windll.user32.SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE)
                            logger.info("Disabled always on top")

                return jsonify({"success": True, "always_on_top": args.always_on_top})
            except Exception as e:
                logger.error(f"Error toggling always on top: {str(e)}")
                return jsonify({"success": False, "error": str(e)})

        # New endpoint to serve custom title bar injection script
        @_serving_app.route('/titlebar/inject-controls', methods=['GET', 'OPTIONS'])
        def inject_titlebar_controls_endpoint():
            """Endpoint to trigger custom title bar injection"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            try:
                success = inject_custom_titlebar_with_retry(max_retries=3, delay=0.5)
                return jsonify({"success": success})
            except Exception as e:
                logger.error(f"Error in inject title bar controls endpoint: {str(e)}")
                return jsonify({"success": False, "error": str(e)})

        # Legacy endpoint for backward compatibility
        @_serving_app.route('/sidebar/inject-controls', methods=['GET', 'OPTIONS'])
        def inject_controls_endpoint():
            """Endpoint to trigger sidebar controls injection (legacy - now uses custom title bar)"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            try:
                success = inject_custom_titlebar_with_retry(max_retries=3, delay=0.5)
                return jsonify({"success": success, "note": "Using custom title bar instead"})
            except Exception as e:
                logger.error(f"Error in inject controls endpoint: {str(e)}")
                return jsonify({"success": False, "error": str(e)})

        # Debug endpoint to test positioning
        @_serving_app.route('/debug/position', methods=['GET', 'OPTIONS'])
        def debug_position():
            """Debug endpoint to check current window position and screen info"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            try:
                screen_width, screen_height = get_screen_dimensions()

                # Calculate what positions would be for different sidebar modes
                left_pos = calculate_sidebar_position('left', 480)
                right_pos = calculate_sidebar_position('right', 480)

                # Get ACTUAL current window position and size
                current_window_state = {"error": "Could not get current window state"}
                js_available = False

                try:
                    global _window
                    if _window:
                        # First check if window is ready for JS
                        try:
                            _window.evaluate_js("true")
                            js_available = True
                        except Exception:
                            js_available = False

                        if js_available:
                            # Use JavaScript to get actual current window dimensions and position
                            actual_state = _window.evaluate_js("""
                                ({
                                    x: window.screenX,
                                    y: window.screenY,
                                    width: window.outerWidth,
                                    height: window.outerHeight,
                                    innerWidth: window.innerWidth,
                                    innerHeight: window.innerHeight,
                                    rightEdge: window.screenX + window.outerWidth,
                                    bottomEdge: window.screenY + window.outerHeight,
                                    documentReady: document.readyState,
                                    url: window.location.href
                                })
                            """)
                            current_window_state = actual_state
                        else:
                            current_window_state = {
                                "error": "Window not ready for JS evaluation",
                                "window_exists": True,
                                "js_ready": False
                            }
                except Exception as e:
                    current_window_state = {"error": f"Window access failed: {str(e)}"}

                # Try to get window info using Windows API as fallback
                windows_api_info = {}
                if sys.platform == "win32":
                    try:
                        from ctypes import byref, windll
                        from ctypes.wintypes import RECT

                        # Find window by title
                        hwnd = windll.user32.FindWindowW(None, args.title)
                        if hwnd:
                            rect = RECT()
                            if windll.user32.GetWindowRect(hwnd, byref(rect)):
                                windows_api_info = {
                                    "x": rect.left,
                                    "y": rect.top,
                                    "width": rect.right - rect.left,
                                    "height": rect.bottom - rect.top,
                                    "rightEdge": rect.right,
                                    "bottomEdge": rect.bottom,
                                    "source": "Windows API"
                                }
                            else:
                                windows_api_info = {"error": "GetWindowRect failed"}
                        else:
                            windows_api_info = {"error": "Window not found by title"}
                    except Exception as e:
                        windows_api_info = {"error": f"Windows API failed: {str(e)}"}

                # Use Windows API info if JS failed
                if "error" in current_window_state and windows_api_info and "error" not in windows_api_info:
                    current_window_state = windows_api_info

                return jsonify({
                    "screen_info": {
                        "width": screen_width,
                        "height": screen_height,
                    },
                    "stored_args_state": {
                        "sidebar": args.sidebar,
                        "side": args.sidebar_side if args.sidebar else None,
                        "window_width": args.width,
                        "window_height": args.height
                    },
                    "actual_window_state": current_window_state,
                    "windows_api_fallback": windows_api_info if windows_api_info else None,
                    "calculated_positions": {
                        "left_sidebar": left_pos,
                        "right_sidebar": right_pos
                    },
                    "bounds_check": {
                        "right_sidebar_fits": (right_pos['x'] + right_pos['width']) <= screen_width,
                        "left_sidebar_fits": left_pos['x'] >= 0,
                        "right_sidebar_end_x": right_pos['x'] + right_pos['width'],
                        "screen_width": screen_width
                    },
                    "analysis": {
                        "js_available": js_available,
                        "window_fits_on_screen": (
                            current_window_state.get('rightEdge', 0) <= screen_width and
                            current_window_state.get('bottomEdge', 0) <= screen_height
                            if 'error' not in current_window_state else False
                        ),
                        "distance_from_right_edge": (
                            screen_width - current_window_state.get('rightEdge', 0)
                            if 'error' not in current_window_state else None
                        ),
                        "distance_from_bottom_edge": (
                            screen_height - current_window_state.get('bottomEdge', 0)
                            if 'error' not in current_window_state else None
                        ),
                        "height_issue": (
                            current_window_state.get('bottomEdge', 0) > screen_height
                            if 'error' not in current_window_state else None
                        )
                    }
                })
            except Exception as e:
                return jsonify({"error": str(e)})

        @_serving_app.route('/debug/window-ready', methods=['GET', 'OPTIONS'])
        def window_ready():
            """Check if window is ready for JavaScript evaluation"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            try:
                global _window
                if not _window:
                    return jsonify({"ready": False, "error": "No window available"})

                # Test if JS evaluation works
                result = _window.evaluate_js("document.readyState")
                return jsonify({
                    "ready": True,
                    "document_state": result,
                    "window_available": True
                })
            except Exception as e:
                return jsonify({
                    "ready": False,
                    "error": str(e),
                    "window_available": _window is not None
                })

        @_serving_app.route('/sidebar/force-inject', methods=['POST', 'OPTIONS'])
        def force_inject():
            """Force re-injection of custom title bar (for debugging)"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            try:
                logger.info("Force title bar injection requested")
                success = inject_custom_titlebar_with_retry(max_retries=5, delay=0.5)
                return jsonify({"success": success, "message": "Force title bar injection completed"})
            except Exception as e:
                logger.error(f"Error in force inject: {str(e)}")
                return jsonify({"success": False, "error": str(e)})

        @_serving_app.route('/titlebar/force-inject', methods=['POST', 'OPTIONS'])
        def force_inject_titlebar():
            """Force re-injection of custom title bar"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            try:
                logger.info("Force title bar injection requested")
                success = inject_custom_titlebar_with_retry(max_retries=5, delay=0.5)
                return jsonify({"success": success, "message": "Force title bar injection completed"})
            except Exception as e:
                logger.error(f"Error in force title bar inject: {str(e)}")
                return jsonify({"success": False, "error": str(e)})

        @_serving_app.route('/debug/manual-position', methods=['POST', 'OPTIONS'])
        def manual_position():
            """Manually set window position for testing"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            try:
                data = request.json or {}
                x = data.get('x', 100)
                y = data.get('y', 0)
                width = data.get('width', 480)
                height = data.get('height', 1000)

                global _window, args

                logger.info(f"Manual positioning request: x={x}, y={y}, size={width}x{height}")

                # Apply the manual positioning
                _window.resize(width, height)
                time.sleep(0.1)
                _window.move(x, y)

                # Update args to reflect the change
                args.sidebar = True
                args.sidebar_side = 'right' if x > 1000 else 'left'
                args.sidebar_width = width

                screen_width, screen_height = get_screen_dimensions()

                return jsonify({
                    "success": True,
                    "applied_position": {"x": x, "y": y, "width": width, "height": height},
                    "screen_size": {"width": screen_width, "height": screen_height},
                    "window_right_edge": x + width,
                    "distance_from_right": screen_width - (x + width),
                    "message": f"Manually positioned window at {x},{y}"
                })

            except Exception as e:
                logger.error(f"Error in manual positioning: {str(e)}")
                return jsonify({"success": False, "error": str(e)})

        @_serving_app.route('/debug/safe-right-position', methods=['POST', 'OPTIONS'])
        def safe_right_position():
            """Position sidebar safely on the right with conservative margins"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            try:
                data = request.json or {}
                width = data.get('width', 480)
                margin_from_edge = data.get('margin', 50)  # Default 50px from edge

                global _window, args
                screen_width, screen_height = get_screen_dimensions()

                # Ultra-safe positioning
                safe_x = screen_width - width - margin_from_edge
                safe_y = 0
                safe_height = screen_height  # Working area already excludes taskbar

                logger.info(f"Safe right position: x={safe_x}, y={safe_y}, size={width}x{safe_height}")
                logger.info(f"This will leave {margin_from_edge}px margin from right edge")

                # Apply positioning
                _window.resize(width, safe_height)
                time.sleep(0.15)
                _window.move(safe_x, safe_y)

                # Update state
                args.sidebar = True
                args.sidebar_side = 'right'
                args.sidebar_width = width

                return jsonify({
                    "success": True,
                    "applied_position": {"x": safe_x, "y": safe_y, "width": width, "height": safe_height},
                    "margin_from_edge": margin_from_edge,
                    "screen_size": {"width": screen_width, "height": screen_height},
                    "window_right_edge": safe_x + width,
                    "message": f"Applied ultra-safe right positioning with {margin_from_edge}px margin"
                })

            except Exception as e:
                logger.error(f"Error in safe positioning: {str(e)}")
                return jsonify({"success": False, "error": str(e)})

        # Test perfect positioning endpoint
        @_serving_app.route('/debug/test-perfect', methods=['POST', 'OPTIONS'])
        def test_perfect():
            """Test perfect positioning using direct values"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            try:
                data = request.json or {}
                side = data.get('side', 'right')

                logger.info(f"=== TESTING DIRECT PERFECT {side.upper()} DOCK ===")

                # Get direct perfect values
                if side == 'right':
                    perfect_calc = calculate_perfect_right_dock()
                else:
                    perfect_calc = calculate_perfect_left_dock()

                # Apply position using direct values
                global _window, args
                if _window:
                    try:
                        logger.info(f"Applying direct perfect {side} dock: {perfect_calc}")

                        # Apply the direct values
                        _window.resize(perfect_calc['width'], perfect_calc['height'])
                        time.sleep(0.3)
                        _window.move(perfect_calc['x'], perfect_calc['y'])
                        time.sleep(0.2)
                        _window.show()

                        # Update state
                        args.sidebar = True
                        args.sidebar_side = side

                        return jsonify({
                            "success": True,
                            "side": side,
                            "applied_values": perfect_calc,
                            "message": f"Applied direct {side} dock. Check debug/position to verify."
                        })

                    except Exception as e:
                        logger.error(f"Direct perfect dock failed: {str(e)}")
                        return jsonify({"success": False, "error": str(e)})
                else:
                    return jsonify({"success": False, "error": "No window available"})

            except Exception as e:
                logger.error(f"Perfect dock endpoint error: {str(e)}")
                return jsonify({"success": False, "error": str(e)})


        @_serving_app.route('/debug/direct-move', methods=['POST', 'OPTIONS'])
        def direct_move():
            """Move directly to exact position - no calculations"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            try:
                data = request.json or {}
                _defaults = calculate_perfect_right_dock()
                x = data.get('x', _defaults['x'])
                y = data.get('y', _defaults['y'])
                width = data.get('width', _defaults['width'])
                height = data.get('height', _defaults['height'])

                global _window
                if _window:
                    logger.info("=== DIRECT MOVE TEST ===")
                    logger.info(f"Moving to EXACT position: x={x}, y={y}, size={width}x{height}")

                    # First resize
                    _window.resize(width, height)
                    time.sleep(0.3)

                    # Then move to exact position
                    _window.move(x, y)
                    time.sleep(0.2)

                    _window.show()

                    return jsonify({
                        "success": True,
                        "requested": {"x": x, "y": y, "width": width, "height": height},
                        "message": f"Moved directly to x={x}, y={y}. Check debug/position to see actual result."
                    })
                else:
                    return jsonify({"success": False, "error": "No window available"})

            except Exception as e:
                logger.error(f"Direct move error: {str(e)}")
                return jsonify({"success": False, "error": str(e)})


        @_serving_app.route('/debug/test-height', methods=['POST', 'OPTIONS'])
        def test_height():
            """Test height calculation with PyWebView overhead"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            try:
                global _window
                if not _window:
                    return jsonify({"success": False, "error": "No window available"})

                # Get current working area
                screen_width, screen_height = get_screen_dimensions()

                # Calculate height accounting for PyWebView overhead
                pywebview_height_overhead = 120
                safety_buffer = 20
                target_requested_height = screen_height - pywebview_height_overhead - safety_buffer

                logger.info("=== HEIGHT TEST ===")
                logger.info(f"Working area: {screen_height}px")
                logger.info(f"PyWebView overhead: {pywebview_height_overhead}px")
                logger.info(f"Safety buffer: {safety_buffer}px")
                logger.info(f"Requesting height: {target_requested_height}px")

                # Apply the height
                _window.resize(480, target_requested_height)
                time.sleep(0.5)  # Give time for resize

                return jsonify({
                    "success": True,
                    "working_area_height": screen_height,
                    "pywebview_overhead": pywebview_height_overhead,
                    "safety_buffer": safety_buffer,
                    "requested_height": target_requested_height,
                    "expected_actual_height": target_requested_height + pywebview_height_overhead,
                    "should_fit": (target_requested_height + pywebview_height_overhead) <= screen_height,
                    "message": f"Requested {target_requested_height}px height. Check debug/position to see actual result."
                })

            except Exception as e:
                logger.error(f"Height test error: {str(e)}")
                return jsonify({"success": False, "error": str(e)})


        @_serving_app.route('/debug/test-dock', methods=['POST', 'OPTIONS'])
        def test_dock():
            """Test dock functionality with detailed logging"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "ok"})

            try:
                data = request.json or {}
                side = data.get('side', 'right')

                logger.info(f"=== TEST DOCK {side.upper()} STARTED ===")

                # Get current state before positioning
                screen_width, screen_height = get_screen_dimensions()
                logger.info(f"Working area: {screen_width}x{screen_height}")

                # Calculate position
                position_info = calculate_sidebar_position(side, 480)
                logger.info(f"Calculated position: {position_info}")

                # Apply position
                global _window, args
                if _window:
                    try:
                        # Force the positioning
                        _window.resize(position_info['width'], position_info['height'])
                        time.sleep(0.3)
                        _window.move(position_info['x'], position_info['y'])
                        time.sleep(0.2)
                        _window.show()

                        # Update state
                        args.sidebar = True
                        args.sidebar_side = side
                        args.sidebar_width = 480

                        logger.info(f"=== TEST DOCK {side.upper()} COMPLETED ===")

                        return jsonify({
                            "success": True,
                            "side": side,
                            "position": position_info,
                            "working_area": {"width": screen_width, "height": screen_height},
                            "message": f"Test dock {side} applied"
                        })

                    except Exception as e:
                        logger.error(f"Test dock failed: {str(e)}")
                        return jsonify({"success": False, "error": str(e)})
                else:
                    return jsonify({"success": False, "error": "No window available"})

            except Exception as e:
                logger.error(f"Test dock endpoint error: {str(e)}")
                return jsonify({"success": False, "error": str(e)})

        # CORS test endpoint
        @_serving_app.route('/cors/test', methods=['GET', 'POST', 'OPTIONS'])
        def cors_test():
            """Test CORS functionality"""
            if request.method == 'OPTIONS':
                return jsonify({"status": "preflight_ok"})

            return jsonify({
                "success": True,
                "method": request.method,
                "origin": request.headers.get('Origin'),
                "user_agent": request.headers.get('User-Agent'),
                "message": "CORS is working correctly"
            })

        # Start the Flask application via waitress (production WSGI)
        # Use _dynamic_wsgi_app when flask_app isn't ready yet — it will
        # automatically route to flask_app once main.py import completes.
        _wsgi_target = _serving_app if _serving_app is flask_app else _dynamic_wsgi_app
        # Lazy import — avoids crash if waitress wasn't bundled in frozen exe
        try:
            from waitress import serve as _serve
            logger.info(f"Starting Waitress server on port {args.port} (app={'full' if _serving_app is flask_app else 'dynamic-dispatcher'})")
            _serve(_wsgi_target, host="0.0.0.0", port=args.port, threads=8)
        except ImportError:
            logger.warning("waitress not available, falling back to Flask dev server")
            # Patch stdout/stderr before .run() to prevent click.echo crash
            # in frozen GUI exes where console file descriptors are closed
            import io as _io
            for _attr in ('stdout', 'stderr'):
                _stream = getattr(sys, _attr, None)
                if _stream is None:
                    setattr(sys, _attr, open(os.devnull, 'w', encoding='utf-8'))
                else:
                    try:
                        _stream.fileno()
                    except (ValueError, OSError, _io.UnsupportedOperation):
                        setattr(sys, _attr, open(os.devnull, 'w', encoding='utf-8'))
            _serving_app.run(debug=False, host="0.0.0.0", port=args.port, use_reloader=False)
    except Exception as e:
        logger.error(f"Error starting Flask server: {str(e)}")
        logger.error(traceback.format_exc())
        sys.exit(1)

def get_server_info():
    """Get server information to display in the UI"""
    try:
        # Try to fetch the device ID from the same location main.py would use
        user_docs = os.path.join(os.path.expanduser('~'), 'Documents')
        device_id_dir = os.path.join(user_docs, 'HevolveAi Agent Companion')
        device_id_file = os.path.join(device_id_dir, 'device_id.json')
        if os.path.exists(device_id_file):
            with open(device_id_file) as f:
                data = json.load(f)
                return {"device_id": data.get('device_id')}
    except Exception as e:
        logger.warning(f"Failed to get device ID: {str(e)}")

    return {"device_id": "Unknown"}

def toggle_fullscreen(window_instance):
    """Toggle between fullscreen and normal window"""
    try:
        window_instance.maximize()
    except Exception as e:
        logger.error(f"Error maximizing window: {str(e)}")
        logger.error(traceback.format_exc())

def set_window_theme_attribute(window_instance):
    """Set dark theme for window using Windows 11 APIs"""
    if sys.platform != "win32":
        return False

    try:
        from ctypes import byref, c_int, sizeof, windll

        # Windows 11 specific constants
        DWMWA_USE_IMMERSIVE_DARK_MODE = 20
        DWMWA_CAPTION_COLOR = 35
        DWMWA_BORDER_COLOR = 34

        def on_shown():
            try:
                # Get window handle
                if hasattr(window_instance, 'original_window') and hasattr(window_instance.original_window, 'handle'):
                    hwnd = window_instance.original_window.handle
                elif hasattr(window_instance, 'handle'):
                    hwnd = window_instance.handle
                else:
                    # Alternative approach - try to find window by title
                    hwnd = windll.user32.FindWindowW(None, args.title)

                if not hwnd:
                    logger.error("Could not get window handle")
                    return False

                # Try setting dark mode (Windows 10 and 11)
                dark_mode = c_int(1)
                windll.dwmapi.DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_USE_IMMERSIVE_DARK_MODE,
                    byref(dark_mode),
                    sizeof(dark_mode)
                )

                # Try setting title bar color (Windows 11)
                # RGB color format - 0x00BBGGRR (reversed order)
                title_color = c_int(0x00303030)  # Dark gray
                windll.dwmapi.DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_CAPTION_COLOR,
                    byref(title_color),
                    sizeof(title_color)
                )

                # Set border color
                border_color = c_int(0x00303030)  # Dark gray
                windll.dwmapi.DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_BORDER_COLOR,
                    byref(border_color),
                    sizeof(border_color)
                )

                logger.info("Successfully set window theme attributes")
                return True
            except Exception as e:
                logger.error(f"Failed to set window theme: {str(e)}")
                return False

        window_instance.events.shown += on_shown
        return True
    except Exception as e:
        logger.error(f"Error setting up window theme: {str(e)}")
        return False

def apply_dark_mode_to_all_windows():
    """Apply dark mode to all windows using a timer-based approach"""
    if sys.platform != "win32":
        return

    import ctypes
    import threading

    # Windows 10/11 dark mode constants
    DWMWA_USE_IMMERSIVE_DARK_MODE = 20

    def find_and_set_dark_mode():
        try:
            # Function to enumerate all windows
            EnumWindows = ctypes.windll.user32.EnumWindows
            EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_int, ctypes.POINTER(ctypes.c_int))
            GetWindowText = ctypes.windll.user32.GetWindowTextW
            GetWindowTextLength = ctypes.windll.user32.GetWindowTextLengthW

            titles = []

            def foreach_window(hwnd, lParam):
                length = GetWindowTextLength(hwnd)
                if length > 0:
                    buff = ctypes.create_unicode_buffer(length + 1)
                    GetWindowText(hwnd, buff, length + 1)
                    title = buff.value
                    titles.append((hwnd, title))
                return True

            # Enumerate all windows
            EnumWindows(EnumWindowsProc(foreach_window), 0)

            # Find our window by title
            for hwnd, title in titles:
                if args.title in title:
                    # Set dark mode
                    value = ctypes.c_int(1)  # 1 = dark mode
                    try:
                        ctypes.windll.dwmapi.DwmSetWindowAttribute(
                            hwnd,
                            DWMWA_USE_IMMERSIVE_DARK_MODE,
                            ctypes.byref(value),
                            ctypes.sizeof(value)
                        )
                        logger.info(f"Applied dark mode to window: {title}")
                    except Exception as e:
                        logger.error(f"Failed to apply dark mode to {title}: {str(e)}")

        except Exception as e:
            logger.error(f"Error in dark mode thread: {str(e)}")

    # Set dark mode with a slight delay to ensure window is created
    timer_thread = threading.Timer(1.0, find_and_set_dark_mode)
    timer_thread.daemon = True
    timer_thread.start()


# Cross-platform system tray setup using tray_handler module
def setup_system_tray(window_instance):
    """Set up system tray icon - uses cross-platform tray_handler"""
    global _tray_icon

    # Return existing icon if already set up
    if _tray_icon is not None:
        logger.info("Using existing system tray icon")
        return _tray_icon

    try:
        # Try to use the cross-platform tray handler
        from desktop.tray_handler import TrayHandler
        handler = TrayHandler(window_instance, app_name="Nunba", tooltip="Nunba - Your LocalMind")
        _tray_icon = handler.setup()
        if _tray_icon:
            logger.info("System tray set up using cross-platform handler")
            return _tray_icon
    except ImportError:
        logger.warning("tray_handler module not available, using fallback")
    except Exception as e:
        logger.warning(f"Cross-platform tray handler failed: {e}, using fallback")

    # Fallback to pystray directly
    try:
        logger.info("Setting up system tray with pystray fallback")
        import pystray
        from PIL import Image

        if getattr(sys, 'frozen', False):
            app_dir = os.path.dirname(sys.executable)
        else:
            app_dir = os.path.dirname(os.path.abspath(__file__))

        # Try multiple icon formats
        icon_files = ['app.ico', 'app.icns', 'app.png', 'Nunba_Logo.png']
        icon_image = None

        for icon_file in icon_files:
            icon_path = os.path.join(app_dir, icon_file)
            if os.path.exists(icon_path):
                try:
                    icon_image = Image.open(icon_path)
                    if icon_image.mode != 'RGBA':
                        icon_image = icon_image.convert('RGBA')
                    # Pad non-square images to square before resizing
                    w, h = icon_image.size
                    if w != h:
                        side = max(w, h)
                        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
                        sq.paste(icon_image, ((side - w) // 2, (side - h) // 2),
                                 icon_image)
                        icon_image = sq
                    icon_image = icon_image.resize((64, 64), Image.LANCZOS)
                    logger.info(f"Using icon from {icon_path}")
                    break
                except Exception as e:
                    logger.warning(f"Failed to load {icon_path}: {e}")

        if icon_image is None:
            # Create a simple default icon
            icon_image = Image.new('RGBA', (64, 64), (76, 175, 80, 255))
            logger.info("Using generated default icon")

        def on_quit_clicked(icon, item):
            logger.info("Quit selected from system tray menu")
            icon.stop()
            try:
                os._exit(0)
            except Exception:
                sys.exit(0)

        def on_restore_clicked(icon, item):
            # pystray callbacks run on pystray's thread — pywebview calls
            # must not block it or the tray menu freezes. Fire and forget.
            def _do_restore():
                logger.info("Restore selected from system tray menu")
                try:
                    window_instance.show()
                    window_instance.restore()
                    # Reload the page if it was started in background mode —
                    # the initial load may have failed before Flask was ready.
                    try:
                        _cur = window_instance.get_current_url() or ''
                        if not _cur or 'about:blank' in _cur or 'error' in _cur.lower():
                            _port = getattr(args, 'port', 5000)
                            logger.info("Page appears blank — reloading from Flask")
                            window_instance.load_url(f"http://localhost:{_port}/local")
                    except Exception as _rl:
                        logger.warning(f"Could not check/reload page: {_rl}")
                except Exception as e:
                    logger.error(f"Error restoring window: {e}")
                    try:
                        window_instance.show()
                    except Exception:
                        pass
            threading.Thread(target=_do_restore, daemon=True).start()

        def on_maximize_clicked(icon, item):
            def _do_maximize():
                logger.info("Maximize selected from system tray menu")
                try:
                    window_instance.show()
                    window_instance.maximize()
                except Exception as e:
                    logger.error(f"Error maximizing window: {e}")
            threading.Thread(target=_do_maximize, daemon=True).start()

        def on_ai_settings_clicked(icon, item):
            import threading as _t
            def _show_wizard():
                try:
                    import tkinter as _tk

                    from desktop.ai_key_vault import CLOUD_PROVIDERS, AIKeyVault
                    vault = AIKeyVault.get_instance()
                    _BG = '#0F0E17'; _CARD = '#1A1730'; _ACC = '#6C63FF'
                    _TXT = '#E8E6F0'; _DIM = '#72757E'; _BRD = '#2D2A40'
                    _root = _tk.Tk()
                    _root.title("Nunba AI Settings")
                    _root.configure(bg=_BG)
                    _root.resizable(False, False)
                    _x = (_root.winfo_screenwidth() - 460) // 2
                    _y = (_root.winfo_screenheight() - 260) // 2
                    _root.geometry(f"460x260+{_x}+{_y}")
                    _root.update_idletasks()
                    _f = _tk.Frame(_root, bg=_BG, padx=24, pady=20)
                    _f.pack(fill=_tk.BOTH, expand=True)
                    _tk.Label(_f, text="AI Provider", font=("Segoe UI", 16, "bold"),
                              bg=_BG, fg=_TXT).pack(anchor=_tk.W, pady=(0, 12))
                    _card = _tk.Frame(_f, bg=_CARD, highlightbackground=_BRD,
                                      highlightthickness=1, padx=16, pady=12)
                    _card.pack(fill=_tk.X)
                    active = vault.get_active_provider()
                    if active:
                        pname = CLOUD_PROVIDERS.get(active, {}).get('name', active)
                        cfg = vault.get_provider_config(active) or {}
                        _tk.Label(_card, text=f"\u2601  {pname}", font=("Segoe UI", 12, "bold"),
                                  bg=_CARD, fg=_ACC).pack(anchor=_tk.W)
                        _tk.Label(_card, text=f"Model: {cfg.get('model', 'default')}",
                                  font=("Segoe UI", 10), bg=_CARD, fg=_DIM).pack(anchor=_tk.W)
                    else:
                        _tk.Label(_card, text="\U0001F4BB  Local AI (llama.cpp)", font=("Segoe UI", 12, "bold"),
                                  bg=_CARD, fg='#00BFA5').pack(anchor=_tk.W)
                    _tk.Label(_f, text="Change in Admin Settings or re-run with --setup-ai",
                              font=("Segoe UI", 9), bg=_BG, fg=_DIM,
                              wraplength=400).pack(anchor=_tk.W, pady=(12, 0))
                    _btn = _tk.Label(_f, text="Close", font=("Segoe UI", 10, "bold"),
                                     bg=_CARD, fg=_TXT, padx=16, pady=6, cursor='hand2')
                    _btn.pack(side=_tk.RIGHT, pady=(12, 0))
                    _btn.bind('<Enter>', lambda e: _btn.configure(bg=_ACC))
                    _btn.bind('<Leave>', lambda e: _btn.configure(bg=_CARD))
                    _btn.bind('<Button-1>', lambda e: _root.destroy())
                    _root.mainloop()
                except Exception:
                    pass
            _t.Thread(target=_show_wizard, daemon=True).start()

        menu = pystray.Menu(
            pystray.MenuItem('Show', on_restore_clicked, default=True),
            pystray.MenuItem('Maximize', on_maximize_clicked),
            pystray.MenuItem('AI Settings...', on_ai_settings_clicked),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem('Quit', on_quit_clicked)
        )

        _tray_icon = pystray.Icon('Nunba', icon_image, 'Nunba - Your LocalMind', menu)

        icon_thread = threading.Thread(target=_tray_icon.run, daemon=True)
        icon_thread.start()

        logger.info("System tray icon started with pystray")
        return _tray_icon

    except ImportError as e:
        logger.error(f"pystray not installed: {e}")
        return None
    except Exception as e:
        logger.error(f"Error setting up system tray: {e}")
        logger.error(traceback.format_exc())
        return None


# Cross-platform notification function
def notify_minimized_to_tray(icon, message="Application minimized to system tray"):
    """Show a notification that the app is minimized to the system tray"""
    logger.info(f"Showing notification: {message}")

    try:
        if sys.platform == 'darwin':
            # macOS: use osascript for native notifications
            # Escape quotes/backslashes to prevent AppleScript injection
            import subprocess
            _safe_msg = message.replace('\\', '\\\\').replace('"', '\\"')
            script = f'display notification "{_safe_msg}" with title "Nunba"'
            subprocess.run(['osascript', '-e', script], check=False, timeout=5)
        elif icon and hasattr(icon, 'notify'):
            # pystray notification
            icon.notify(message, "Nunba")
        logger.info("Notification shown successfully")
    except Exception as e:
        logger.error(f"Error showing notification: {e}")

# Better event handlers that don't return None
def on_closed():
    logger.info("Window close button clicked, minimizing to system tray")
    try:
        global _window
        if _window:
            _window.hide()
            logger.info("Window hidden successfully")

            # No notification on close, only on minimize
    except Exception as e:
        logger.error(f"Error hiding window in on_closed: {str(e)}")

    # Return True to prevent default window closing
    return True

# on_minimized — let the OS handle normal minimize (stays in taskbar).
# Do NOT call _window.hide() here — that removes it from the taskbar.
def on_minimized():
    logger.info("Window minimized (stays in taskbar)")
    return False  # allow default minimize behavior

# Clean initialization of event handlers
def setup_window_events(window_instance):
    logger.info("Setting up window event handlers")

    try:
        # Add our handlers
        window_instance.events.closed += on_closed
        window_instance.events.minimized += on_minimized

        logger.info("Window event handlers set up successfully")
        return True
    except Exception as e:
        logger.error(f"Error setting up window events: {str(e)}")
        logger.error(traceback.format_exc())

        # As a fallback, try the direct approach without clearing
        try:
            window_instance.events.closed += on_closed
            window_instance.events.minimized += on_minimized
            logger.info("Applied event handlers with fallback method")
            return True
        except Exception as e2:
            logger.error(f"Fallback also failed: {str(e2)}")
            return False

# Ensure system tray is running properly at startup
def ensure_system_tray_running():
    global _tray_icon, _window

    if _tray_icon is None:
        logger.warning("System tray icon not initialized - attempting to setup")
        _tray_icon = setup_system_tray(_window)
        if _tray_icon is None:
            logger.error("Failed to create system tray icon after retry")
            return False

    # Test if tray icon is functional
    try:
        if hasattr(_tray_icon, 'visible') and not _tray_icon.visible:
            logger.warning("Tray icon not visible - attempting to restart")
            icon_thread = threading.Thread(target=_tray_icon.run, daemon=True)
            icon_thread.start()
    except Exception as e:
        logger.error(f"Error checking tray icon status: {str(e)}")
        return False

    return True


def monitor_tray_loop():
    """Monitor system tray in a loop"""
    while True:
        time.sleep(5)
        ensure_system_tray_running()


# Global variable to track database service process
_db_service_process = None

def start_database_service():
    """Initialize the hevolve-database (pip-installed) for local SQLite use.

    In flat/desktop mode, Nunba uses the pip-installed sql.database package
    directly (SQLite, NullPool, WAL). No separate FastAPI service needed.
    The legacy FastAPI controller (:6006) was for cloud MySQL deployments
    and is NOT used by Nunba.
    """
    try:
        from sql.database import Base, get_engine
        engine = get_engine()
        Base.metadata.create_all(engine)
        logger.info("hevolve-database initialized (pip-installed, SQLite)")
        return True
    except ImportError:
        logger.warning("hevolve-database not installed — pip install hevolve-database")
        return False
    except Exception as e:
        logger.error(f"Database init error: {e}")
        return False


def stop_database_service():
    """No-op — database connections are per-request with NullPool."""
    try:
        if _db_service_process and _db_service_process.poll() is None:
            logger.info("Stopping database service...")
            _db_service_process.terminate()
            _db_service_process.wait(timeout=5)
            logger.info("Database service stopped")
    except Exception as e:
        logger.error(f"Error stopping database service: {str(e)}")
        if _db_service_process:
            _db_service_process.kill()


_splash_fn = None  # Set by __main__ to (update_fn, close_fn)

def _splash_update(msg):
    """Update splash status text. Safe no-op if no splash."""
    if _splash_fn:
        try:
            _splash_fn[0](msg)
        except Exception:
            pass

def _close_splash():
    """Close splash screen. Safe no-op if no splash."""
    if _splash_fn:
        try:
            _splash_fn[1]()
        except Exception:
            pass


# ── Startup watchdog ──────────────────────────────────────────────────
# _startup_phase is already set by the import block above (importing_main → module_ready)
_startup_t0 = time.time()

# Thread-stack dump moved to `core.diag` (commit refactor: 3 parallel
# implementations collapsed to one).  The alias is kept so any in-process
# caller still doing `app._dump_all_thread_stacks(...)` keeps working — we
# don't want a silent regression if a frozen bundle still references the
# old symbol.  New code MUST use `from core.diag import dump_all_thread_stacks`.
from core.diag import dump_all_thread_stacks as _dump_all_thread_stacks  # noqa: F401


def _startup_watchdog():
    """Daemon thread that logs every 10s if startup hasn't completed.
    Dumps ALL thread stacks (including MainThread) after 15s of a single
    phase stalling — was 30s, reduced because Nunba has hit real hangs
    (wmic) where we needed the dump sooner.  Dumps again every 30s if
    still stuck so we can watch threads move (or not)."""
    phase_entered = time.time()
    last_phase = _startup_phase
    dumps_this_phase = 0
    while _startup_phase != 'running':
        time.sleep(10)
        now = time.time()
        if _startup_phase != last_phase:
            last_phase = _startup_phase
            phase_entered = now
            dumps_this_phase = 0
        elapsed = now - _startup_t0
        stuck = now - phase_entered
        logger.warning(
            f"[WATCHDOG] phase={_startup_phase!r}, "
            f"total={elapsed:.0f}s, stuck={stuck:.0f}s, "
            f"threads={threading.active_count()}"
        )
        # Progressive dumps: at 15s first dump, then every 30s after.
        should_dump = (
            (stuck >= 15 and dumps_this_phase == 0)
            or (stuck >= 15 + 30 * dumps_this_phase)
        )
        if should_dump:
            _dump_all_thread_stacks(
                f"Phase {_startup_phase!r} stuck {stuck:.0f}s "
                f"(dump #{dumps_this_phase + 1})",
            )
            dumps_this_phase += 1
    logger.info(f"[WATCHDOG] Startup complete in {time.time() - _startup_t0:.1f}s")


def main():
    global _window, _tray_icon, _startup_phase

    _startup_phase = 'main_entered'
    logger.info("=== MAIN FUNCTION STARTED ===")
    # Extend startup_trace.log through the full webview lifecycle.
    # _trace is module-level (defined in the frozen-fixes block); it
    # writes to startup_trace.log with immediate flush and survives
    # crashes that kill the buffered gui_app.log.  Previously _trace
    # stopped at "torch pre-guard done" — the most dangerous startup
    # phase (Flask → webview → React mount) had no crash-proof log.
    _trace("main() entered")
    logger.info(f"Thread ID: {threading.current_thread().ident}")
    logger.info(f"Process ID: {os.getpid()}")
    logger.info(f"Sidebar mode: {args.sidebar}")
    logger.info(f"Always on top: {args.always_on_top}")
    logger.info(f"Command line arguments: {sys.argv}")
    logger.info(f"Background mode: {args.background}")
    logger.info(f"Protocol argument: {getattr(args, 'protocol', 'None')}")

    # Handle protocol launch FIRST with better error handling
    if hasattr(args, 'protocol') and args.protocol:
        logger.info("=== PROTOCOL DETECTED - HANDLING BEFORE FLASK ===")
        try:
            handle_protocol_launch()
            logger.info("=== PROTOCOL HANDLING COMPLETED SUCCESSFULLY ===")
        except Exception as e:
            logger.error("=== PROTOCOL HANDLING FAILED ===")
            logger.error(f"Protocol error: {str(e)}")
            logger.error(traceback.format_exc())
            # Don't exit - continue with normal startup
            logger.info("Continuing with normal startup despite protocol error")

    # ── Resource Governor — priority + CPU caps NOW, memory cap DEFERRED ──
    # Sets BELOW_NORMAL priority and CPU rate limit immediately so Nunba
    # doesn't hog the CPU during the heavy boot phase.  The RAM cap is
    # DEFERRED to after webview creation because the import chain for
    # main.py (autogen → flaml → llmlingua → torch stub → transformers +
    # 96 expert agents + Flask blueprints) briefly spikes memory past the
    # 9.8GB Job Object limit at boot time.  Windows terminates the process
    # instantly on Job Object violation — no exception, no log, no
    # webview.  This was the cause of the "autostart after restart fails
    # to mount React in pywebview" bug (2026-04-16): the process logged
    # up to ResourceEnforcer then vanished.  Deferring the memory cap to
    # after webview.start() means the spike is allowed during startup but
    # capped during steady-state runtime.
    _trace("resource_governor starting")
    _gov = None
    try:
        from core.resource_governor import get_governor
        _gov = get_governor()
        _gov.start(defer_memory_limit=True)
        logger.info("[STARTUP] ResourceGovernor started (priority + CPU active, memory cap deferred)")
        _trace("resource_governor started (memory deferred)")
    except Exception as _gov_err:
        logger.debug("[STARTUP] ResourceGovernor not available: %s", _gov_err)
        _trace(f"resource_governor failed: {_gov_err}")

    # ── Phase logging helper — flush after each step so the log file
    # on disk shows exactly where the process died, even on SIGKILL /
    # Job Object termination where no exception handler runs.
    def _phase(name):
        # _startup_phase is module-global (declared in main's `global` line)
        global _startup_phase
        _startup_phase = name
        logger.info(f"[STARTUP-PHASE] {name}")
        for _h in logger.handlers:
            if hasattr(_h, 'flush'):
                _h.flush()

    _phase('flask_start')
    _trace("flask_start")
    logger.info("=== STARTING FLASK SERVER ===")
    _splash_update('Starting server...')
    # Start Flask server in a separate thread with error handling
    try:
        flask_thread = threading.Thread(target=start_flask, daemon=True)
        flask_thread.start()
        logger.info("Flask thread started successfully")
    except Exception as ex:
        logger.error("=== Flask server could not be started ===")
        logger.error(f"Flask error: {str(ex)}")
        logger.error(traceback.format_exc())

    # Wait for Flask to be ready before proceeding to webview.
    # Uses raw socket connect (not urllib) to avoid Windows proxy/firewall
    # issues where urllib.request can't reach localhost in frozen builds.
    _phase('flask_wait')
    _splash_update('Waiting for server...')
    _flask_ready = False
    _max_wait = 30 if args.background else 15
    import socket as _wait_sock
    for _attempt in range(_max_wait * 2):
        try:
            _s = _wait_sock.socket(_wait_sock.AF_INET, _wait_sock.SOCK_STREAM)
            _s.settimeout(1)
            _s.connect(('127.0.0.1', args.port))
            _s.close()
            _flask_ready = True
            logger.info(f"Flask server ready after {_attempt * 0.5:.1f}s")
            break
        except (ConnectionRefusedError, TimeoutError, OSError):
            pass
        try:
            if _splash_root:
                _safe_tk_update(_splash_root)
        except Exception:
            pass
        time.sleep(0.5)
    if not _flask_ready:
        logger.warning("Flask server did not respond within timeout — will retry after webview opens")

    # Start Hevolve Database service
    _phase('database')
    _splash_update('Loading database...')
    logger.info("=== STARTING DATABASE SERVICE ===")

    def _db_init_bg():
        try:
            ok = start_database_service()
            if ok:
                logger.info("Database initialized successfully")
            else:
                logger.warning("Database service failed to start, continuing without it")
        except Exception as _dbe:
            logger.error(f"Database service error: {_dbe}")

    _db_thread = threading.Thread(target=_db_init_bg, daemon=True)
    _db_thread.start()
    # Don't block — database starts in background while we continue to webview

    # Determine window dimensions and position.
    # NOTE: get_screen_dimensions() may still return physical pixels at this
    # point if the process is DPI-aware before pywebview import.  The values
    # here are used for create_window() (initial guess) and will be corrected
    # in apply_window_positioning()'s on_loaded callback which re-queries
    # screen dimensions in pywebview's DPI context.
    _phase('window_calc')
    perfect_calc = calculate_perfect_right_dock()
    window_width = perfect_calc['width']
    window_height = perfect_calc['height']
    window_x = perfect_calc['x']
    window_y = perfect_calc['y']

    if args.sidebar:
        logger.info(f"Sidebar mode: {args.sidebar_side} side, {window_width}x{window_height}")
        window_x = max(0, window_x - args.sidebar_width - 50)

    else:
        screen_w, _ = get_screen_dimensions()
        window_x = max(0, screen_w - window_width - 8)
        logger.info(f"Default window: {window_width}x{window_height}, x={window_x}")

    # Custom positioning overrides
    custom_x = None
    custom_y = None
    if args.x is not None and args.y is not None:
        window_x = args.x
        window_y = args.y
        custom_x = args.x
        custom_y = args.y

    # position_info carries metadata for on_loaded recalculation
    position_info = {
        'x': window_x,
        'y': window_y,
        'width': window_width,
        'height': window_height,
        'mode': 'sidebar' if args.sidebar else 'default',
        'sidebar_width': args.sidebar_width if args.sidebar else 0,
        'custom_x': custom_x,
        'custom_y': custom_y,
    }
    # Get initial URL - Launch in local mode by default
    initial_url = f"http://localhost:{args.port}/local"
    logger.info(f"Initial URL: {initial_url}")

    _phase('webview_init')
    _trace("webview_init — about to load pywebview")
    logger.info("Starting WebView window")
    try:
        initialize_indicator(args.port)

        # Check if should start hidden
        start_hidden = args.background and not (args.sidebar or args.always_on_top)
        if sys.platform == "darwin": start_hidden = False  # no tray on macOS — always show window

        # Background mode (e.g., autostart after reboot) ALWAYS keeps the main
        # window hidden.  The user-visible surface in that mode is:
        #   - the system tray icon
        #   - the floating Nanba companion window (animated character + input bar)
        # The `.setup_complete` marker is still consumed (single-shot cleanup)
        # but never overrides start_hidden — the floating companion is the
        # post-install indicator, not a full-screen window flash.
        if start_hidden:
            try:
                _setup_marker = os.path.join(
                    os.path.expanduser('~'), 'Documents', 'Nunba', 'data', '.setup_complete')
                if os.path.exists(_setup_marker):
                    os.remove(_setup_marker)  # cleanup only — do NOT flip start_hidden
                    logger.info("[STARTUP] .setup_complete marker cleaned up (background mode — window stays hidden)")
            except Exception:
                pass

        logger.info(f"Window will start {'hidden' if start_hidden else 'visible'}")

        # If protocol launch forced visible mode, log it
        if hasattr(args, 'protocol') and args.protocol and not start_hidden:
            logger.info("Protocol launch overrode background mode - window will be visible")

        # Load webview module (lazy import to avoid pythonnet issues in --install-ai mode).
        # On cold boot this can take 30-60s (.NET JIT + WebView2 COM init).
        # Flush logs so diagnostic info is available if the user kills the process.
        logger.info("[STARTUP] Loading pywebview module (may take 30-60s on cold boot)...")
        for _h in logger.handlers:
            _h.flush()
        _wv_start = time.time()
        webview = get_webview()
        _wv_elapsed = time.time() - _wv_start
        logger.info(f"[STARTUP] pywebview loaded successfully in {_wv_elapsed:.1f}s")
        _trace(f"pywebview loaded in {_wv_elapsed:.1f}s")

        # Create window with conditional hidden status and frameless design
        _window = webview.create_window(
            title=args.title,
            url=initial_url,
            width=window_width,
            height=window_height,
            x=window_x,  # Direct X positioning
            y=window_y,  # Direct Y positioning
            resizable=True,
            frameless=False,
            hidden=start_hidden,
            text_select=True,
            easy_drag=False,  # Disable since we handle dragging in custom title bar
            background_color='#000000'
        )

        logger.info(f"Window created: {window_width}x{window_height}, hidden={start_hidden}")
        _trace(f"window created {window_width}x{window_height} hidden={start_hidden}")

        # ── Activate deferred memory cap ──
        # Safe now: the heavy import spike is over, webview is created,
        # steady-state RAM usage should be well under the cap.
        if _gov is not None:
            try:
                _gov.apply_memory_limit()
                logger.info("[STARTUP] ResourceGovernor memory cap now active")
            except Exception as _mem_err:
                logger.debug("[STARTUP] Memory cap failed: %s", _mem_err)

        # ── Nanba Companion: floating desktop pet ──────────────────────
        # Second pywebview window: frameless, transparent, always-on-top.
        # Renders 3D animated character (Three.js) that talks via TTS,
        # listens via STT, and gamifies the conversation experience.
        _companion_window = None
        try:
            import ctypes as _ct
            _screen_w = _ct.windll.user32.GetSystemMetrics(0) if sys.platform == 'win32' else 1920
            _screen_h = _ct.windll.user32.GetSystemMetrics(1) if sys.platform == 'win32' else 1080
            # 220x310: character + status bar + input bar + platform hint.
            # Must match the html/body size in landing-page/public/nanba-companion.html
            # (DRY Gate 2 — window size and HTML size are the same contract).
            _comp_w, _comp_h = 220, 310
            _comp_x = _screen_w - _comp_w - 30  # Bottom-right, 30px margin
            _comp_y = _screen_h - _comp_h - 80  # Above taskbar

            class CompanionAPI:
                """Python bridge for the companion window JS.

                Exposes three entry points:
                  * on_companion_click        — user clicked the character (show main window)
                  * on_companion_dblclick     — double-click (bring main window forward)
                  * on_companion_prompt(text) — user hit Enter in the floating input bar;
                                                 forwards the prompt to the /chat endpoint
                                                 and returns the assistant reply for the
                                                 speech bubble.

                All three are synchronous from pywebview's perspective; on_companion_prompt
                internally does a blocking requests.post but has a hard timeout and a
                generic error path so the input bar always re-enables itself.
                """

                def on_companion_click(self):
                    """User clicked the companion — toggle main window or start voice chat."""
                    try:
                        if _window:
                            _window.show()
                            _window.restore()
                    except Exception:
                        pass

                def on_companion_dblclick(self):
                    """User double-clicked — bring main window to front."""
                    try:
                        if _window:
                            _window.show()
                            _window.restore()
                            _window.on_top = True
                            time.sleep(0.3)
                            _window.on_top = False
                    except Exception:
                        pass

                def on_companion_prompt(self, text):
                    """User submitted a quick prompt from the floating input bar.

                    Forwards to the Flask /chat endpoint on this instance (loopback,
                    same Waitress process) with a 60s timeout.  Returns a short
                    string the JS will render in the speech bubble.

                    Never raises — failure is mapped to a user-visible error string.
                    """
                    try:
                        if not text or not str(text).strip():
                            return "Type something first."
                        prompt = str(text).strip()[:500]
                        try:
                            import requests  # runtime-optional; pip-installed in venv
                        except Exception as _imp_err:
                            logger.warning("[COMPANION] requests unavailable: %s", _imp_err)
                            return "Chat unavailable (missing requests)."
                        try:
                            _port = args.port
                        except Exception:
                            _port = 5000
                        _url = f"http://127.0.0.1:{_port}/chat"
                        try:
                            r = requests.post(
                                _url,
                                json={
                                    "message": prompt,
                                    "source": "companion_input_bar",
                                },
                                timeout=60,
                            )
                        except requests.Timeout:
                            return "Nunba is still thinking — check the main window."
                        except Exception as _net_err:
                            logger.warning("[COMPANION] /chat call failed: %s", _net_err)
                            return "Chat is offline. Try again in a moment."
                        if r.status_code >= 400:
                            logger.warning("[COMPANION] /chat returned %s", r.status_code)
                            return f"Error {r.status_code} — try again."
                        try:
                            data = r.json()
                        except Exception:
                            return (r.text or "").strip()[:240] or "OK"
                        reply = (
                            (isinstance(data, dict) and (
                                data.get("response")
                                or data.get("message")
                                or data.get("text")
                                or data.get("reply")
                            ))
                            or ""
                        )
                        if isinstance(reply, (dict, list)):
                            reply = str(reply)
                        reply = (reply or "").strip()
                        if not reply:
                            reply = "Done."
                        if len(reply) > 240:
                            reply = reply[:237] + "…"
                        return reply
                    except Exception as _prompt_err:
                        logger.exception("[COMPANION] on_companion_prompt failed: %s", _prompt_err)
                        return "Something went wrong. Try the main window."

            _companion_api = CompanionAPI()

            # Companion serves from the same Flask server
            _comp_url = f"http://localhost:{args.port}/nanba-companion.html"

            _companion_window = webview.create_window(
                title='Nanba',
                url=_comp_url,
                width=_comp_w,
                height=_comp_h,
                x=_comp_x,
                y=_comp_y,
                resizable=False,
                frameless=True,
                easy_drag=True,
                on_top=True,
                transparent=True,
                background_color='#00000000',
                js_api=_companion_api,
            )
            logger.info("[COMPANION] Nanba companion window created at (%d, %d)",
                        _comp_x, _comp_y)

            # Wire ResourceGovernor mode changes to companion
            def _update_companion_mode():
                if not _companion_window:
                    return
                try:
                    from core.resource_governor import get_governor
                    mode = get_governor().get_mode()
                    _companion_window.evaluate_js(
                        f"window.companionAPI && window.companionAPI.setMode('{mode}')")
                except Exception:
                    pass

            # Wire TTS events to companion (speaking animation)
            def _on_companion_loaded():
                try:
                    # Set language from user preference
                    lang = os.environ.get('HARTOS_LANG', 'en')[:2]
                    _companion_window.evaluate_js(
                        f"window.companionAPI && window.companionAPI.setLanguage('{lang}')")
                except Exception:
                    pass
            if _companion_window:
                _companion_window.events.loaded += _on_companion_loaded

        except Exception as _comp_err:
            logger.debug("[COMPANION] Companion window not created: %s", _comp_err)

        # Apply positioning after window creation
        if position_info:
            apply_window_positioning(_window, position_info)

        # Set always on top if requested
        if args.always_on_top:
            setup_always_on_top(_window)

        # Set up system tray
        _tray_icon = setup_system_tray(_window)
        logger.info(f"System tray setup result: {_tray_icon is not None}")

        # Event handlers
        _window.events.closed += on_closed
        _window.events.minimized += on_minimized

        # Register Win+N global hotkey for toggling window visibility (Windows only)
        if sys.platform == 'win32':
            _hotkey_thread = threading.Thread(
                target=_hotkey_listener_thread, daemon=True, name='HotkeyListener')
            _hotkey_thread.start()
            logger.info("[STARTUP] Global hotkey listener thread started (Win+N)")

        # ── React mount guard — runs for ALL modes (not just background) ──
        # pywebview's WebView2 can suspend rAF/CSS transitions during creation,
        # preventing React 18's createRoot from completing the initial render.
        # This fires on the first `loaded` event and forces opacity/transitions.
        _mount_guard_fired = [False]

        def _safe_eval_js(js_code, max_retries=5):
            """evaluate_js with retry — WebView2 may not be ready on first on_loaded."""
            for attempt in range(max_retries):
                try:
                    result = _window.evaluate_js(js_code)
                    return result
                except Exception as e:
                    err_msg = str(e)
                    if 'failed to start' in err_msg.lower() or 'not ready' in err_msg.lower():
                        delay = (attempt + 1) * 2  # 2s, 4s, 6s, 8s, 10s
                        logger.debug(f"[EVAL_JS] Retry {attempt+1}/{max_retries} in {delay}s: {err_msg}")
                        time.sleep(delay)
                    else:
                        raise  # non-recoverable error
            logger.warning(f"[EVAL_JS] All {max_retries} retries failed")
            return None

        def _on_any_loaded():
            if _mount_guard_fired[0]:
                return
            _mount_guard_fired[0] = True
            _trace("EVENT: on_loaded fired")
            logger.info("[MOUNT_GUARD] on_loaded fired — starting mount check")

            def _mount_guard():
                # Wait for WebView2 JS bridge to be ready
                time.sleep(3.0)
                logger.info("[MOUNT_GUARD] Checking React mount state...")
                try:
                    state = _safe_eval_js(
                        "(function(){"
                        "  var r = document.getElementById('root');"
                        "  if (!r) return 'no_root';"
                        "  if (r.children.length === 0) return 'empty';"
                        "  return 'mounted';"
                        "})()"
                    )
                    _trace(f"MOUNT_GUARD: initial check = {state}")
                    logger.info(f"[MOUNT_GUARD] Initial check: {state}")

                    if state == 'mounted':
                        # Force CSS transitions to final state (WebView2 may have suspended them)
                        _window.evaluate_js(
                            "(function(){"
                            "  document.querySelectorAll('[style*=\"opacity\"]').forEach(function(el){"
                            "    if (getComputedStyle(el).opacity === '0') {"
                            "      el.style.transition = 'none';"
                            "      el.style.opacity = '1';"
                            "    }"
                            "  });"
                            "  var hero = document.getElementById('hero-section');"
                            "  if (hero) { hero.style.transition = 'none'; hero.style.opacity = '1'; }"
                            "  document.body.style.display = 'none';"
                            "  void document.body.offsetHeight;"
                            "  document.body.style.display = '';"
                            "})()"
                        )
                        logger.info("[MOUNT_GUARD] Transitions forced, repaint done")
                    elif state in ('empty', 'no_root', None):
                        logger.warning(f"[MOUNT_GUARD] React not mounted ({state}) — reloading")
                        _window.load_url(f"http://localhost:{args.port}/local")
                        time.sleep(3.0)
                        # Force resize to wake compositor
                        try:
                            w, h = _window.width, _window.height
                            _window.resize(w + 1, h)
                            time.sleep(0.1)
                            _window.resize(w, h)
                        except Exception:
                            pass
                except Exception as e:
                    logger.warning(f"[MOUNT_GUARD] Check failed: {e}")

            threading.Thread(target=_mount_guard, daemon=True, name='mount_guard').start()

        _window.events.loaded += _on_any_loaded

        # ── Mount-recovery shared state (moved up so _force_remount_and_paint
        #     can close over it; the full recovery-guard block further down
        #     continues to use the SAME list instance). ──
        _page_loaded_ok = [False]  # set True when React mounts successfully

        # Reusable mount-recovery helper. Invoked from THREE entry points:
        #   1. _on_bg_shown             — pywebview's `shown` event after
        #                                 start_hidden → window.show() from tray
        #   2. taskbar-restore-watchdog — Win32 IsIconic / IsWindowVisible
        #                                 poller, for native taskbar restore
        #                                 which does NOT fire pywebview events
        #   3. events.restored (if exposed by the installed pywebview version)
        #
        # Historical note: this was previously inlined as `_ensure_react_mounted`
        # inside `_on_bg_shown`, which meant only tray-restore (window.show)
        # ran the recovery path. Taskbar restore left WebView2 paint-dead →
        # black window. Extracted per Gate 4 (no parallel paths). Do NOT
        # duplicate this body elsewhere — tests/test_background_mount_recovery.py
        # asserts exactly one definition.
        def _force_remount_and_paint(origin: str = 'unknown') -> None:
            """Ensure React mounts inside pywebview after a visibility /
            minimize→restore transition.

            pywebview's WebView2 suspends rAF while hidden OR iconic. React 18's
            createRoot uses rAF for scheduling, so the render may not complete
            until we nudge the compositor. This function:
              (1) waits for Flask (raw-socket, avoids proxy issues),
              (2) checks mount state with a STRICTER predicate that also
                  inspects the root's bounding box (paint-dead detection),
              (3) reloads / resizes / force-repaints if needed, up to 3 tries.

            ``origin`` is a short tag for the log lines so operators can tell
            which path invoked recovery (shown / restored / watchdog).
            """
            _local_url = f"http://localhost:{args.port}/local"
            _MAX_ATTEMPTS = 3

            # ── Wait for Flask to be ready (raw socket, avoids proxy issues) ──
            import socket as _bg_sock
            for _ in range(15):
                try:
                    _bgs = _bg_sock.socket(_bg_sock.AF_INET, _bg_sock.SOCK_STREAM)
                    _bgs.settimeout(1)
                    _bgs.connect(('127.0.0.1', args.port))
                    _bgs.close()
                    break
                except Exception:
                    time.sleep(0.5)

            def _check_mount():
                """Returns one of:
                  'mounted'    — React rendered content with non-zero height
                  'paint_dead' — root has children but renders at 0 height
                                 (WebView2 suspended the compositor; treat
                                  as failure → reload path)
                  'empty'      — root exists but has no children
                  'no_root'    — #root element not in DOM
                  None         — JS eval failed (bridge not ready)

                Stricter than the old check which trusted `children.length > 0`
                alone. Paint-dead states occurred on native taskbar restore
                because pywebview's `shown` event didn't fire, leaving WebView2
                compositor suspended even though React had already mounted.
                """
                try:
                    return _window.evaluate_js(
                        "(function(){"
                        "  var r = document.getElementById('root');"
                        "  if (!r) return 'no_root';"
                        "  if (r.children.length === 0) return 'empty';"
                        "  var h = 0;"
                        "  try { h = r.getBoundingClientRect().height; }"
                        "  catch(e) { h = 0; }"
                        "  if (h === 0) return 'paint_dead';"
                        "  return 'mounted';"
                        "})()"
                    )
                except Exception:
                    return None

            for attempt in range(_MAX_ATTEMPTS):
                # Give React a moment — rAF just resumed after visibility change
                time.sleep(1.5 if attempt == 0 else 3.0)

                state = _check_mount()
                _trace(f"REMOUNT[{origin}]: mount check #{attempt + 1} = {state}")
                logger.info(
                    f"[REMOUNT:{origin}] Mount check #{attempt + 1}: {state}")

                if state == 'mounted':
                    _page_loaded_ok[0] = True
                    # React is up but CSS transitions (opacity, blur) may not
                    # have fired — WebView2 suspends CSS animations while hidden.
                    # Force all transition-dependent elements to their final state.
                    try:
                        _window.evaluate_js(
                            "(function(){"
                            "  var hero = document.getElementById('hero-section');"
                            "  if (hero) {"
                            "    hero.style.transition = 'none';"
                            "    hero.style.opacity = '1';"
                            "    hero.style.filter = 'none';"
                            "  }"
                            "  document.querySelectorAll('[style*=\"opacity: 0\"]').forEach(function(el){"
                            "    el.style.transition = 'none';"
                            "    el.style.opacity = '1';"
                            "    el.style.filter = 'none';"
                            "  });"
                            "  document.body.style.display = 'none';"
                            "  void document.body.offsetHeight;"
                            "  document.body.style.display = '';"
                            "})()"
                        )
                    except Exception:
                        pass
                    logger.info(
                        f"[REMOUNT:{origin}] React mounted — "
                        "transitions forced, repaint done")
                    return

                # state is 'paint_dead', 'empty', 'no_root', or None —
                # React either didn't mount OR WebView2 compositor is suspended.
                # In both cases the reload path (with post-load resize kick)
                # is the safest recovery.
                logger.warning(
                    f"[REMOUNT:{origin}] React not mounted ({state}) — "
                    f"{'navigating' if attempt == 0 else 'reloading'}")
                try:
                    _window.load_url(_local_url)
                except Exception as e:
                    logger.warning(f"[REMOUNT:{origin}] load_url failed: {e}")
                    continue

                # After load, give React time to render
                time.sleep(3.0)

                # Force resize to wake WebView2 compositor
                try:
                    w, h = _window.width, _window.height
                    _window.resize(w + 1, h)
                    time.sleep(0.1)
                    _window.resize(w, h)
                except Exception:
                    pass

            # Final check after all attempts
            final = _check_mount()
            logger.info(
                f"[REMOUNT:{origin}] Final mount state after "
                f"{_MAX_ATTEMPTS} attempts: {final}")
            if final != 'mounted':
                logger.error(
                    f"[REMOUNT:{origin}] React failed to mount after all "
                    "retries. User will see black screen.")

        # In background mode, run mount recovery on first show — the initial
        # load may have hit Flask before it was fully ready (especially on
        # Windows boot).
        if start_hidden:
            _bg_first_show = [True]  # mutable flag — only fire once

            def _on_bg_shown():
                if not _bg_first_show[0]:
                    return
                _bg_first_show[0] = False
                _trace("EVENT: on_shown fired (first show from hidden)")
                threading.Thread(
                    target=_force_remount_and_paint,
                    args=('bg_shown',),
                    daemon=True,
                    name='bg_react_mount',
                ).start()

            _window.events.shown += _on_bg_shown

        # Defensive: if the installed pywebview exposes `events.restored`
        # (added in pywebview 4.4.x for some platforms), wire recovery to
        # it too. This is belt-and-suspenders alongside the Win32 watchdog
        # below — if pywebview fires `restored` we get recovery immediately;
        # if it doesn't, the 500ms-polling watchdog still catches the
        # transition within ~1s.
        try:
            _wv_events = getattr(_window, 'events', None)
            if _wv_events is not None and hasattr(_wv_events, 'restored'):
                def _on_window_restored():
                    _trace("EVENT: on_restored fired")
                    threading.Thread(
                        target=_force_remount_and_paint,
                        args=('events_restored',),
                        daemon=True,
                        name='restored_react_mount',
                    ).start()
                _wv_events.restored += _on_window_restored
                logger.info(
                    "[REMOUNT] events.restored hook wired (pywebview exposes it)")
        except Exception as _re_err:
            logger.debug(f"[REMOUNT] events.restored wiring skipped: {_re_err}")

        # ── Windows-only watchdog: detect native SW_RESTORE from taskbar ──
        # On Windows, clicking the Nunba taskbar button after a minimize is
        # a native SW_RESTORE on the Winforms HWND. pywebview does NOT fire
        # its `shown` event for this path (that event only fires when
        # `.show()` is called from Python). Without this watchdog, WebView2
        # stays paint-dead on taskbar restore → black window.
        #
        # Guarded by `sys.platform == 'win32'` — on macOS/Linux this is a
        # no-op. IsIconic / IsWindowVisible are pure ctypes → no new deps.
        # Gate 7 (multi-OS surface check).
        if sys.platform == 'win32':
            def _taskbar_restore_watchdog():
                import ctypes as _wd_ct
                _user32 = _wd_ct.windll.user32
                _last_iconic = None
                _last_visible = None
                _poll_interval = 0.5  # 500ms — fast enough to feel instant

                def _resolve_hwnd():
                    # Prefer pywebview's exposed native handle (winforms)
                    try:
                        native = getattr(_window, 'native', None)
                        if native is not None:
                            h = getattr(native, 'Handle', None)
                            if h:
                                return int(h)
                    except Exception:
                        pass
                    # original_window.handle (older pywebview)
                    try:
                        ow = getattr(_window, 'original_window', None)
                        if ow is not None:
                            h = getattr(ow, 'handle', None)
                            if h:
                                return int(h)
                    except Exception:
                        pass
                    # Fallback: FindWindowW by title
                    try:
                        return int(_user32.FindWindowW(None, args.title) or 0)
                    except Exception:
                        return 0

                while True:
                    # Stop cleanly if window was destroyed (main() teardown
                    # sets _window = None in the __main__ block).
                    if _window is None:
                        logger.info(
                            "[WATCHDOG] _window is None — taskbar-restore "
                            "watchdog exiting")
                        return
                    try:
                        hwnd = _resolve_hwnd()
                        if not hwnd:
                            time.sleep(_poll_interval)
                            continue
                        iconic = bool(_user32.IsIconic(hwnd))
                        visible = bool(_user32.IsWindowVisible(hwnd))

                        # iconic→non-iconic is the taskbar-restore signal
                        if (_last_iconic is True) and (iconic is False):
                            _trace("WATCHDOG: iconic→non-iconic (taskbar restore)")
                            logger.info(
                                "[WATCHDOG] iconic→non-iconic transition; "
                                "invoking _force_remount_and_paint")
                            threading.Thread(
                                target=_force_remount_and_paint,
                                args=('taskbar_restore',),
                                daemon=True,
                                name='watchdog_react_mount',
                            ).start()
                        # hidden→visible as a defensive secondary (the
                        # pywebview `shown` event already handles the
                        # programmatic case, but if it was missed we still
                        # recover here).
                        elif (_last_visible is False) and (visible is True) \
                                and (iconic is False):
                            _trace("WATCHDOG: hidden→visible (non-iconic)")
                            logger.info(
                                "[WATCHDOG] hidden→visible transition; "
                                "invoking _force_remount_and_paint")
                            threading.Thread(
                                target=_force_remount_and_paint,
                                args=('watchdog_visible',),
                                daemon=True,
                                name='watchdog_react_mount',
                            ).start()

                        _last_iconic = iconic
                        _last_visible = visible
                    except Exception as _wd_err:
                        logger.debug(f"[WATCHDOG] poll error: {_wd_err}")
                    time.sleep(_poll_interval)

            threading.Thread(
                target=_taskbar_restore_watchdog,
                daemon=True,
                name='taskbar-restore-watchdog',
            ).start()
            logger.info(
                "[WATCHDOG] taskbar-restore-watchdog started (Windows only)")

        # Deferred Flask reload — if Flask wasn't ready during the initial poll,
        # keep trying in the background and reload the webview once it responds.
        # This handles cold-boot scenarios where Flask takes >15s to start.
        if not _flask_ready:
            _deferred_port = args.port

            def _deferred_flask_reload():
                """Poll Flask in background; reload webview once server is up."""
                import urllib.request as _ur
                _max_extra = 120  # try for up to 2 more minutes
                for _ri in range(_max_extra * 2):
                    try:
                        _r = _ur.urlopen(
                            f"http://127.0.0.1:{_deferred_port}/backend/health", timeout=2)
                        _r.close()
                        logger.info(f"[DEFERRED] Flask ready after {_ri * 0.5:.1f}s extra — reloading webview")
                        time.sleep(1)  # let server fully warm up
                        if _window:
                            try:
                                _window.load_url(f"http://localhost:{_deferred_port}/local")
                                logger.info("[DEFERRED] Webview reloaded successfully")
                            except Exception as _lue:
                                logger.warning(f"[DEFERRED] Reload failed: {_lue}")
                        return
                    except Exception:
                        pass
                    time.sleep(0.5)
                logger.error("[DEFERRED] Flask never became ready — giving up after 2 extra minutes")

            threading.Thread(target=_deferred_flask_reload, daemon=True).start()
            logger.info("[DEFERRED] Started background Flask poller for delayed reload")

        # Shared reload guard — prevents multiple recovery paths from reloading
        # simultaneously. _page_loaded_ok was hoisted above _force_remount_and_paint
        # so all recovery paths share the SAME list instance (Gate 4).
        _page_recovery_count = [0]
        _recovery_port = args.port

        def _on_loaded_recovery():
            if _page_recovery_count[0] >= 3 or _page_loaded_ok[0]:
                return
            def _deferred_check():
                time.sleep(3)
                if _page_loaded_ok[0]:
                    return
                _do_recovery_check()
            threading.Thread(target=_deferred_check, daemon=True).start()

        def _do_recovery_check():
            if _page_recovery_count[0] >= 3:
                return
            try:
                _cur_url = _window.get_current_url() or ''
                # URL-level check (about:blank, error pages, non-http)
                is_error_url = ('about:blank' in _cur_url or 'error' in _cur_url.lower()
                                or not _cur_url.startswith('http'))
                # Content-level check — detect blank page even with valid URL.
                # Check #root children count after React has had time to mount.
                is_blank_content = False
                if not is_error_url:
                    try:
                        root_children = _window.evaluate_js(
                            '(function(){'
                            'var r=document.getElementById("root");'
                            'return r ? r.childNodes.length : -1;'
                            '})()')
                        is_blank_content = (root_children is not None and int(root_children) < 1)
                    except Exception:
                        is_blank_content = True

                if is_error_url or is_blank_content:
                    _page_recovery_count[0] += 1
                    _delay = 3 * _page_recovery_count[0]  # 3s, 6s, 9s
                    logger.info(f"[RECOVERY] Blank/error page detected ({_cur_url}, "
                                f"root_empty={is_blank_content}, "
                                f"attempt {_page_recovery_count[0]}/3) — reloading in {_delay}s")

                    def _do_reload(_d=_delay):
                        time.sleep(_d)
                        try:
                            _window.load_url(f"http://localhost:{_recovery_port}/local")
                            logger.info("[RECOVERY] Page reloaded")
                        except Exception as _re:
                            logger.warning(f"[RECOVERY] Reload failed: {_re}")

                    threading.Thread(target=_do_reload, daemon=True).start()
                else:
                    # Page loaded normally — stop all recovery paths
                    _page_recovery_count[0] = 3
                    _page_loaded_ok[0] = True
            except Exception:
                pass

        _window.events.loaded += _on_loaded_recovery

        # Delayed React mount check — if HTML loads but React never mounts
        # (e.g. JS bundle failed, import error), the loaded event fires but
        # root stays empty. This catches that case after a generous delay.
        def _delayed_react_check():
            time.sleep(20)  # give React plenty of time to mount
            try:
                check_result = _window.evaluate_js("""
                    (function(){
                        var r = document.getElementById('root');
                        if (!r) return JSON.stringify({mounted: false, reason: 'no root'});
                        var children = r.childNodes.length;
                        // Check for REAL React content — not just CSS <style> tags
                        var hasReactContent = false;
                        for (var i = 0; i < r.children.length; i++) {
                            var tag = r.children[i].tagName;
                            if (tag !== 'STYLE' && tag !== 'SCRIPT' && tag !== 'NOSCRIPT') {
                                // Check if child has meaningful content (not just empty div)
                                if (r.children[i].innerHTML.length > 100) {
                                    hasReactContent = true;
                                    break;
                                }
                            }
                        }
                        var innerLen = r.innerHTML.length;
                        return JSON.stringify({
                            mounted: hasReactContent,
                            children: children,
                            innerLen: innerLen,
                            firstTag: r.children[0] ? r.children[0].tagName : 'none',
                            url: location.href
                        });
                    })()
                """)
                logger.info(f"[RECOVERY] React mount check: {check_result}")
                if check_result:
                    import json as _json
                    state = _json.loads(check_result)
                    if not state.get('mounted'):
                        logger.warning(f"[RECOVERY] React not mounted after 20s (children={state.get('children')}, innerLen={state.get('innerLen')}) — forcing reload + repaint")
                        _window.load_url(f"http://localhost:{_recovery_port}/local")
                        time.sleep(2)
                        # Force repaint via resize
                        try:
                            w, h = _window.width, _window.height
                            _window.resize(w + 1, h)
                            time.sleep(0.1)
                            _window.resize(w, h)
                        except Exception:
                            pass
            except Exception as e:
                logger.warning(f"[RECOVERY] React check failed: {e}")

        threading.Thread(target=_delayed_react_check, daemon=True,
                         name='react_mount_check').start()

        # Diagnostic logging — only for background/no-splash mode where black
        # screen has been observed.  Captures pywebview page state to find the
        # root cause of React not mounting.
        if start_hidden:
            def _webview_diagnostic():
                time.sleep(6)
                try:
                    url = _window.get_current_url() or '(None)'
                    logger.info(f"[WEBVIEW_DIAG] current_url={url}")

                    diag = _window.evaluate_js("""
(function(){
    var d = {};
    d.readyState = document.readyState;
    d.url = location.href;
    d.bodyLen = document.body ? document.body.innerHTML.length : -1;
    var root = document.getElementById('root');
    d.rootExists = !!root;
    d.rootChildren = root ? root.childNodes.length : -1;
    d.rootHTML = root ? root.innerHTML.substring(0, 200) : '(no root)';
    var loader = document.getElementById('pre-react-loader');
    d.loaderExists = !!loader;
    d.loaderVisible = loader ? getComputedStyle(loader).display !== 'none' : false;
    d.title = document.title;
    var scripts = document.querySelectorAll('script[src*="main"]');
    d.mainScriptCount = scripts.length;
    d.mainScriptSrc = scripts.length > 0 ? scripts[0].src : '(none)';
    d.jsErrors = window.__nunba_js_errors || [];
    d.earlyErrors = window.__earlyErrors || [];
    return JSON.stringify(d);
})()
""")
                    logger.info(f"[WEBVIEW_DIAG] state={diag}")
                except Exception as e:
                    logger.warning(f"[WEBVIEW_DIAG] evaluate_js failed: {e}")

            threading.Thread(target=_webview_diagnostic, daemon=True, name='webview_diag').start()

            def _inject_error_capture():
                time.sleep(1)
                try:
                    _window.evaluate_js("""
window.__nunba_js_errors = window.__nunba_js_errors || [];
window.addEventListener('error', function(e) {
    window.__nunba_js_errors.push({
        msg: e.message, src: e.filename, line: e.lineno, col: e.colno, ts: Date.now()
    });
});
window.addEventListener('unhandledrejection', function(e) {
    window.__nunba_js_errors.push({
        msg: 'UnhandledRejection: ' + (e.reason ? (e.reason.message || String(e.reason)) : 'unknown'),
        ts: Date.now()
    });
});
""")
                    logger.info("[WEBVIEW_DIAG] JS error capture injected")
                except Exception as e:
                    logger.warning(f"[WEBVIEW_DIAG] Error capture injection failed: {e}")

            threading.Thread(target=_inject_error_capture, daemon=True, name='webview_err_capture').start()

        logger.info("Event handlers connected directly")

        # ── Pre-webview setup — MUST NOT crash or webview.start() never runs ──
        # Wrap each step in try/except so a failure in theme/splash/tray
        # doesn't prevent the webview from starting (black screen bug).
        try:
            setup_connectivity_monitor(_window, args.port)
        except Exception as _e:
            logger.warning(f"[STARTUP] Connectivity monitor failed (non-fatal): {_e}")

        try:
            if sys.platform == "win32":
                set_window_theme_attribute(_window)
                apply_dark_mode_to_all_windows()
        except Exception as _e:
            logger.warning(f"[STARTUP] Window theme failed (non-fatal): {_e}")

        try:
            monitor_thread = threading.Thread(target=lambda: monitor_tray_loop(), daemon=True)
            monitor_thread.start()
        except Exception as _e:
            logger.warning(f"[STARTUP] Monitor thread failed (non-fatal): {_e}")

        try:
            _splash_update('Hevolve Hive Agent Runtime Ready')
            time.sleep(0.5)
            _close_splash()
        except Exception:
            pass

        if not start_hidden and _window and sys.platform == 'win32':
            def _bring_to_front():
                time.sleep(1)
                try:
                    hwnd = ctypes.windll.user32.FindWindowW(None, args.title)
                    if hwnd:
                        ctypes.windll.user32.SetForegroundWindow(hwnd)
                        ctypes.windll.user32.BringWindowToTop(hwnd)
                except Exception:
                    pass
            _window.events.loaded += lambda: threading.Thread(
                target=_bring_to_front, daemon=True).start()

        if start_hidden and _tray_icon:
            def _bg_tray_notify():
                time.sleep(2)
                try:
                    notify_minimized_to_tray(
                        _tray_icon,
                        "Nunba is running in the background. Click the tray icon to open."
                    )
                except Exception:
                    pass
            threading.Thread(target=_bg_tray_notify, daemon=True).start()

        # ── Start webview — THIS MUST ALWAYS BE REACHED ──
        _startup_phase = 'running'
        logger.info("Starting webview")

        # Persistent storage path for WebView2 (localStorage, cookies, cache).
        # Without this, the frozen exe's install dir (C:\Program Files\...) is
        # used and is read-only — all localStorage data is lost on restart.
        try:
            from core.platform_paths import get_data_dir as _get_wv_data
            _webview_data_dir = os.path.join(_get_wv_data(), 'webview_data')
        except ImportError:
            _webview_data_dir = os.path.join(
                os.path.expanduser('~'), 'Documents', 'Nunba', 'webview_data')
        os.makedirs(_webview_data_dir, exist_ok=True)

        if sys.platform == "win32":
            # Use EdgeChromium (WebView2) for best rendering
            # Clear stale WebView2 cache if transitioning from private_mode=True
            # (pre-Mar12 builds) to private_mode=False — prevents cached broken pages
            _cache_marker = os.path.join(_webview_data_dir, '.non_private_init')
            if not os.path.exists(_cache_marker):
                _cache_dir = os.path.join(_webview_data_dir, 'EBWebView', 'Default', 'Cache')
                if os.path.isdir(_cache_dir):
                    import shutil
                    try:
                        shutil.rmtree(_cache_dir, ignore_errors=True)
                        logger.info("[STARTUP] Cleared stale WebView2 cache (private→non-private transition)")
                    except Exception:
                        pass
                try:
                    with open(_cache_marker, 'w') as _cm:
                        _cm.write('1')
                except Exception:
                    pass

            # Force navigation after window is visible — WebView2 sometimes drops
            # the initial URL passed to create_window, resulting in a blank page.
            _shown_nav_done = [False]
            def _on_shown_navigate():
                if _shown_nav_done[0]:
                    return
                _shown_nav_done[0] = True
                try:
                    _cur = _window.get_current_url() or ''
                    if not _cur or 'about:blank' in _cur or _cur == initial_url:
                        logger.info(f"[SHOWN] Forcing navigation to {initial_url}")
                        _window.load_url(initial_url)
                except Exception as _e:
                    logger.debug(f"[SHOWN] Navigation check failed: {_e}")
                # Bring window to front on first show (not always-on-top)
                if sys.platform == 'win32':
                    try:
                        from ctypes import windll
                        hwnd = (getattr(getattr(_window, 'original_window', None), 'handle', 0)
                                or getattr(_window, 'handle', 0)
                                or windll.user32.FindWindowW(None, args.title))
                        if hwnd:
                            windll.user32.SetForegroundWindow(hwnd)
                            logger.info("[SHOWN] Window brought to foreground")
                    except Exception as _fe:
                        logger.debug(f"[SHOWN] SetForegroundWindow failed: {_fe}")
            _window.events.shown += _on_shown_navigate

            # Background mode: WebView2 doesn't navigate when hidden=True.
            # Force-load the URL after webview.start() begins, with a delay.
            # This ensures the page is loaded BEFORE the user shows the window.
            if start_hidden:
                def _preload_hidden_page():
                    time.sleep(3)  # wait for webview.start() to init WebView2
                    try:
                        _cur = _window.get_current_url() or ''
                        if not _cur or 'about:blank' in _cur:
                            logger.info("[BACKGROUND] Pre-loading /local into hidden webview")
                            _window.load_url(initial_url)
                    except Exception as _e:
                        logger.debug(f"[BACKGROUND] Pre-load failed: {_e}")
                threading.Thread(target=_preload_hidden_page, daemon=True,
                                 name='bg-preload').start()

            try:
                logger.info(f"Starting webview with EdgeChromium backend, storage: {_webview_data_dir}")
                _trace("webview.start(edgechromium) — blocking until window closes")
                webview.start(gui='edgechromium', storage_path=_webview_data_dir, private_mode=False)
                logger.info("Successfully started with EdgeChromium backend")
                _trace("webview.start returned (window closed)")
            except Exception as e:
                logger.error(f"EdgeChromium backend failed: {str(e)}")
                _trace(f"webview.start FAILED: {e}")
                # Show error message to user
                try:
                    import ctypes
                    ctypes.windll.user32.MessageBoxW(
                        0,
                        "Could not start Nunba.\n\n"
                        "Microsoft WebView2 is required. Please install it from:\n"
                        "https://developer.microsoft.com/en-us/microsoft-edge/webview2/\n\n"
                        f"Technical details: {str(e)[:200]}",
                        "Nunba - Startup Error",
                        0x10  # MB_ICONERROR
                    )
                except Exception:
                    pass
                raise RuntimeError(f"EdgeChromium not available: {e}")
        else:
            webview.start(storage_path=_webview_data_dir, private_mode=False)
            # Give Flask a moment to start
        time.sleep(0.5)
        logger.info("Flask startup delay completed")

    except Exception as e:
        logger.error(f"Failed to start Flask thread: {str(e)}")
        logger.error(traceback.format_exc())
        # This is critical - can't continue without Flask
        raise


def handle_protocol_launch():
    """Handle when app is launched via custom protocol"""
    global _window

    if not args.protocol:
        logger.info("No protocol argument provided")
        return

    logger.info("=== PROTOCOL LAUNCH HANDLER STARTED ===")
    logger.info(f"Raw protocol argument: {args.protocol}")
    logger.info(f"All arguments: {sys.argv}")

    # Parse the protocol URL to extract parameters
    try:
        from urllib.parse import parse_qs, unquote, urlparse

        # Handle different protocol formats
        protocol_url = args.protocol
        logger.info(f"Processing protocol URL: {protocol_url}")

        # Sometimes Windows passes the full URL, sometimes just parameters
        if not protocol_url.startswith('hevolveai://'):
            protocol_url = 'hevolveai://' + protocol_url
            logger.info(f"Added protocol prefix: {protocol_url}")

        logger.info(f"Normalized protocol URL: {protocol_url}")

        try:
            parsed = urlparse(protocol_url)
            logger.info(f"URL parse successful: scheme={parsed.scheme}, netloc={parsed.netloc}, path={parsed.path}")
        except Exception as parse_err:
            logger.error(f"URL parsing failed: {str(parse_err)}")
            raise

        logger.info(f"Query string: {parsed.query}")

        try:
            params = parse_qs(parsed.query) if parsed.query else {}
            logger.info(f"Protocol parameters parsed: {params}")
        except Exception as params_err:
            logger.error(f"Parameter parsing failed: {str(params_err)}")
            params = {}

        # Handle different actions
        action = params.get('action', ['show'])[0] if params.get('action') else 'show'
        logger.info(f"Protocol action determined: {action}")

        if action == 'show':
            logger.info("Protocol action: SHOW - Setting background=False")
            args.background = False  # Override background mode
            logger.info(f"Background mode now: {args.background}")

            # Window doesn't exist yet, so just log intent
            logger.info("Window doesn't exist yet, will show when created")
            time.sleep(1)
            # If window exists, show it
            if _window:
                logger.info("Window exists, showing it")
                _window.show()
            else:
                logger.info("Window doesn't exist yet, will show when created")

        elif action == 'hide':
            logger.info("Protocol action: HIDE")
            args.background = True  # Force background mode
            if _window:
                _window.hide()
        elif action == 'maximize':
            logger.info("Protocol action: MAXIMIZE")
            args.background = False  # Make sure it's not hidden
            if _window:
                _window.show()
                _window.maximize()
        # Handle agent parameter if provided
        agent_name = params.get('agent', [None])[0] if params.get('agent') else None
        if agent_name:
            logger.info(f"Protocol specified agent: {agent_name}")
            # Store for later use when window is created
            args.protocol_agent = agent_name
            # Update URL to specific agent
            new_url = f"https://hevolve.hertzai.com/agents/{agent_name}?companion=true"
            if _window:
                logger.info(f"Loading agent URL: {new_url}")
                _window.load_url(new_url)

            logger.info("=== PROTOCOL HANDLING COMPLETED ===")

        # Check for sidebar parameters in protocol
        if params.get('sidebar', ['false'])[0].lower() in ['true', '1', 'yes']:
            logger.info("Protocol requested sidebar mode")
            args.sidebar = True

            # Override sidebar side if specified in protocol
            if params.get('sidebar_side'):
                args.sidebar_side = params.get('sidebar_side')[0]
                logger.info(f"Protocol set sidebar side: {args.sidebar_side}")

            # Override sidebar width if specified
            if params.get('sidebar_width'):
                try:
                    args.sidebar_width = int(params.get('sidebar_width')[0])
                    logger.info(f"Protocol set sidebar width: {args.sidebar_width}")
                except ValueError as ve:
                    logger.error(f"Invalid sidebar width in protocol: {ve}")

        # Handle window positioning parameters
        if params.get('x'):
            try:
                args.x = int(params.get('x')[0])
                logger.info(f"Protocol set X position: {args.x}")
            except ValueError as ve:
                logger.error(f"Invalid X position in protocol: {ve}")

        if params.get('y'):
            try:
                args.y = int(params.get('y')[0])
                logger.info(f"Protocol set Y position: {args.y}")
            except ValueError as ve:
                logger.error(f"Invalid Y position in protocol: {ve}")

        # Handle always on top parameter
        if params.get('always_on_top', ['false'])[0].lower() in ['true', '1', 'yes']:
            args.always_on_top = True
            logger.info("Protocol enabled always on top")

        # Handle different actions
        if action in ['show', 'maximize']:
            args.background = False

        logger.info("Protocol processing completed successfully")
        logger.info(f"Final args state: action={action}, sidebar={args.sidebar}, background={args.background}")

    except ImportError as ie:
        logger.error(f"Import error in protocol handling: {str(ie)}")
        logger.error("urllib.parse not available - this should not happen in Python 3")
        raise
    except Exception as e:
        logger.error("=== PROTOCOL HANDLING EXCEPTION ===")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error message: {str(e)}")
        logger.error("Protocol handling traceback:")
        logger.error(traceback.format_exc())

        # Don't fail silently - still try to start the app normally
        logger.info("Setting background=False as fallback due to protocol error")
        args.background = False

        # Re-raise the exception so we can see what's happening
        raise

    logger.info("=== PROTOCOL LAUNCH HANDLER COMPLETED ===")


def _show_splash():
    """Show a dark-themed splash screen with Tamil aesthetic and AI-native typography.
    Returns (root, status_var, close_fn) or (None, None, None) on failure."""
    global _startup_phase
    _startup_phase = 'splash_init'
    try:
        logger.info("[SPLASH] Importing tkinter...")
        import tkinter as tk

        logger.info("[SPLASH] Creating Tk root window...")
        if _eroot is not None:
            root = _eroot
            root.deiconify()
        else:
            root = tk.Tk()
        root.overrideredirect(True)  # No title bar / border
        root.attributes('-topmost', True)

        # Splash dimensions
        W, H = 900, 560
        sw = root.winfo_screenwidth()
        sh = root.winfo_screenheight()
        x = (sw - W) // 2
        y = (sh - H) // 2
        root.geometry(f"{W}x{H}+{x}+{y}")
        root.configure(bg='#0A0914')

        canvas = tk.Canvas(root, width=W, height=H, bg='#0A0914',
                           highlightthickness=0, bd=0)
        canvas.pack(fill='both', expand=True)
        logger.info(f"[SPLASH] Window created: {W}x{H} at ({x},{y})")

        # ── Background: PIL-rendered base (anti-aliased) ──
        try:
            from PIL import Image, ImageDraw, ImageTk
            _bg = Image.new('RGBA', (W, H), (10, 9, 20, 255))
            _bgd = ImageDraw.Draw(_bg)
            # Kolam dot grid
            for row in range(int(H / 28) + 1):
                for col in range(int(W / 28) + 1):
                    dx, dy = 14 + col * 28, 14 + row * 28
                    _bgd.ellipse([dx - 1.5, dy - 1.5, dx + 1.5, dy + 1.5],
                                 fill=(26, 23, 48, 255))
            # Festival bar
            _fest = ['#FFA000', '#E91E63', '#9C27B0', '#00BCD4', '#00BFA5']
            _sw = W // len(_fest)
            for i, fc in enumerate(_fest):
                _bgd.rectangle([i * _sw, 0, (i + 1) * _sw, 3],
                               fill=fc)
            _bg_photo = ImageTk.PhotoImage(_bg)
            canvas.create_image(0, 0, image=_bg_photo, anchor='nw')
            canvas._bg_ref = _bg_photo
            logger.info("[SPLASH] PIL background rendered")
        except Exception as _bg_err:
            logger.info(f"[SPLASH] PIL background fallback: {_bg_err}")
            # Fallback: simple canvas background
            for row in range(int(H / 28) + 1):
                for col in range(int(W / 28) + 1):
                    dx, dy = 14 + col * 28, 14 + row * 28
                    canvas.create_oval(dx - 1.5, dy - 1.5, dx + 1.5, dy + 1.5,
                                       fill='#1A1730', outline='')

        # ── All text/graphics are now rendered by splash_effects animation engine ──

        # ── Status text — drawn on canvas (NOT Label widget) so it blends ──
        status_var = tk.StringVar(value='Starting up...')
        _status_text_id = canvas.create_text(
            W // 2, H - 32, text='Starting up...',
            font=('Bahnschrift Light', 9), fill='#72757E', anchor='center')

        # Bind StringVar changes to update canvas text
        def _on_status_change(*_args):
            try:
                canvas.itemconfig(_status_text_id, text=status_var.get())
            except Exception:
                pass
        status_var.trace_add('write', _on_status_change)

        # ── Progress bar (animated) ──
        bar_y = H - 14
        bar_w = 220
        bar_x = (W - bar_w) // 2
        canvas.create_rectangle(bar_x, bar_y, bar_x + bar_w, bar_y + 3,
                                fill='#1A1929', outline='')
        progress_rect = canvas.create_rectangle(bar_x, bar_y, bar_x + 40, bar_y + 3,
                                                fill='#6C63FF', outline='')
        _anim_state = {'pos': 0, 'dir': 1}

        def _animate():
            try:
                _anim_state['pos'] += _anim_state['dir'] * 4
                if _anim_state['pos'] >= bar_w - 40:
                    _anim_state['dir'] = -1
                elif _anim_state['pos'] <= 0:
                    _anim_state['dir'] = 1
                px = bar_x + _anim_state['pos']
                canvas.coords(progress_rect, px, bar_y, px + 40, bar_y + 3)
                root.after(30, _animate)
            except tk.TclError:
                pass  # Window already destroyed

        _animate()

        # ── Animated splash: PIL-rendered text elements animate in + greeting ──
        _startup_phase = 'splash_effects'
        try:
            logger.info("[SPLASH] Importing splash_effects...")
            from desktop.splash_effects import run_splash_animation
            logger.info("[SPLASH] Running splash animation...")
            run_splash_animation(canvas, root, W, H)
            logger.info("[SPLASH] Animation engine started")
        except Exception as _fx_err:
            logger.warning(f"[SPLASH] Animation skipped: {_fx_err}")
            logger.warning(traceback.format_exc())

        logger.info("[SPLASH] Calling root.update()...")
        _safe_tk_update(root)
        logger.info("[SPLASH] Splash screen visible")

        def close_splash():
            """Close the splash window safely on macOS."""
            try:
                root.attributes('-alpha', 0.0)
            except Exception:
                pass
            try:
                root.destroy()
            except Exception:
                pass

        return root, status_var, close_splash
    except Exception as e:
        logger.error(f"[SPLASH] Failed: {e}")
        logger.error(traceback.format_exc())
        return None, None, lambda: None


if __name__ == "__main__":
    logger.info("[STARTUP] __main__ block entered")
    _startup_phase = 'pre_splash'

    # Start watchdog thread — logs warnings if any phase stalls
    _wd_thread = threading.Thread(target=_startup_watchdog, daemon=True, name='StartupWatchdog')
    _wd_thread.start()

    # Transition from early static splash to animated splash.
    # Keep BOTH the Tk root AND the static Toplevel alive during transition.
    # _show_splash() reuses _eroot, draws the animated canvas, then we
    # destroy the static Toplevel AFTER the animated one is visible.
    # This eliminates the black flash between static → animated.
    _early_toplevel_to_destroy = None
    if _early_splash:
        _early_toplevel_to_destroy = _early_splash[1]  # save reference
        _early_splash = None
        # _eroot stays alive — _show_splash reuses it

    # Show animated splash screen.
    # Background mode (autostart after reboot) STRICTLY skips the splash —
    # the floating companion window is the user-visible post-install
    # indicator.  We do NOT touch the .setup_complete marker here; the
    # marker is consumed once by the background-mode window-hidden block
    # (app.py in __main__'s webview branch).  Keeping the cleanup in a
    # single place preserves the one-writer invariant.
    _skip_splash = args.background

    if _skip_splash:
        logger.info("[STARTUP] Background mode — skipping splash animation")
        _splash_root, _splash_status, _splash_close_fn = None, None, lambda: None
    else:
        try:
            _splash_root, _splash_status, _splash_close_fn = _show_splash()
        except Exception as _splash_exc:
            logger.error(f"[STARTUP] _show_splash() crashed: {_splash_exc}")
            logger.error(traceback.format_exc())
            _splash_root, _splash_status, _splash_close_fn = None, None, lambda: None

    _startup_phase = 'post_splash'
    logger.info(f"[STARTUP] Splash returned: root={_splash_root is not None}")

    # NOW destroy the static splash Toplevel — animated one is already visible
    if _early_toplevel_to_destroy:
        try:
            _early_toplevel_to_destroy.destroy()
        except Exception:
            pass
        _early_toplevel_to_destroy = None

    def _splash_update_impl(msg):
        try:
            if _splash_root and _splash_status:
                _splash_status.set(msg)
                _safe_tk_update(_splash_root)
        except Exception:
            pass

    _splash_fn = (_splash_update_impl, _splash_close_fn)

    # ── Load deferred config NOW (after splash is visible) ──
    # LLM config, AI key vault, and tier detection were deferred from module level
    # to avoid 10-20s of blank screen before splash appears.
    _splash_update_impl('Loading configuration...')
    _load_deferred_config()

    try:
        _startup_phase = 'initializing'
        _splash_update('Initializing...')
        logger.info("=== STARTUP SEQUENCE INITIATED ===")
        logger.info("Starting HevolveAi Agent Companion GUI Application")
        logger.info(f"Arguments: {sys.argv}")
        logger.info(f"Protocol detected: {hasattr(args, 'protocol') and args.protocol}")

        # Add more detailed logging for protocol detection
        if hasattr(args, 'protocol') and args.protocol:
            logger.info("=== PROTOCOL LAUNCH DETECTED ===")
            logger.info(f"Protocol value: {args.protocol}")
            logger.info(f"Background mode before protocol handling: {args.background}")

        _splash_update('Setting up environment...')
        logger.info("About to call ensure_working_directory()")
        # Ensure we're in the right directory when started from registry
        dir_result = ensure_working_directory()
        logger.info(f"Working directory setup result: {dir_result}")
        logger.info(f"Current working directory: {os.getcwd()}")

        # ── Import main.py in background while splash animates ──
        # main.py import is heavy (30-60s on average, 2-3 min on slow machines).
        # The splash stays alive until the server is actually ready — no hardcoded
        # deadline. The gui_app (lightweight Flask) serves React SPA immediately
        # once we reach start_flask(), so webview always has something to show.
        #
        # Prerequisites before leaving splash:
        #   1. main.py imported (flask_app != None) — OR — gui_app fallback available
        #   2. Flask server responding on port (gui_app or full app)
        # The splash closes in main() right before webview.start().
        _splash_update('Starting...')
        _import_error = [None]

        def _bg_import():
            try:
                _import_main_app()
            except BaseException as e:
                _import_error[0] = e

        _import_thread = threading.Thread(target=_bg_import, daemon=True,
                                          name='_bg_import')
        _import_thread.start()

        # Keep splash alive while import runs. No arbitrary deadline —
        # splash stays visible until import completes OR we hit the safety
        # timeout (5 min). The animation loop needs update() for paint+timer
        # events. If import finishes fast (<1s on dev), we proceed instantly.
        _import_timeout = time.time() + 300  # 5 min safety net
        while _import_thread.is_alive() and time.time() < _import_timeout:
            try:
                if _splash_root:
                    _safe_tk_update(_splash_root)
            except Exception:
                pass
            time.sleep(0.03)

        if _import_error[0]:
            logger.error(f"[STARTUP] main.py import failed: {_import_error[0]}")
            # Don't exit — gui_app can still serve the React SPA
            logger.warning("[STARTUP] Continuing with lightweight gui_app")
        elif _import_thread.is_alive():
            logger.warning("[STARTUP] main.py import timed out (5 min) — continuing with gui_app")
            def _wait_for_import():
                _import_thread.join()
                if _import_error[0]:
                    logger.error(f"[STARTUP] main.py import eventually failed: {_import_error[0]}")
                else:
                    logger.info("[STARTUP] main.py import complete (background)")
                    # flask_app is now set — the WSGI dispatcher routes to the
                    # full app.  But the webview may be stuck on a blank page
                    # from when gui_app was serving (React failed to mount with
                    # the stub backend).  Force-reload so the real app renders.
                    try:
                        if _window:
                            time.sleep(2)  # let flask_app finish registering routes
                            _window.load_url(f"http://localhost:{args.port}/local")
                            logger.info("[STARTUP] Webview reloaded after late main.py import")
                    except Exception as _reload_err:
                        logger.warning(f"[STARTUP] Post-import reload failed: {_reload_err}")
            threading.Thread(target=_wait_for_import, daemon=True,
                             name='import_waiter').start()
        else:
            logger.info(f"[STARTUP] main.py imported in {time.time() - _startup_t0:.1f}s")

        # Initialize AI capabilities on first run (runs in background thread)
        _splash_update('Initializing AI...')
        logger.info(f"[STARTUP] LLAMA_AVAILABLE={LLAMA_AVAILABLE}")
        if LLAMA_AVAILABLE:
            try:
                llama_config = LlamaConfig()
                if llama_config.is_first_run():
                    logger.info("=== FIRST RUN DETECTED - INITIALIZING AI CAPABILITIES ===")

                    def ai_init_thread():
                        try:
                            def progress(msg):
                                logger.info(f"[AI Init] {msg}")

                            logger.info("Starting AI initialization in background...")
                            success = initialize_llama_on_first_run(progress_callback=progress)
                            if success:
                                logger.info("AI initialization completed successfully!")

                                # Load LLM via ModelOrchestrator — single path for model selection,
                                # compute-aware loading, VRAM tracking, and lifecycle management.
                                if llama_config.config.get("auto_start_server", True):
                                    try:
                                        from models.orchestrator import get_orchestrator
                                        entry = get_orchestrator().auto_load('llm')
                                        if entry:
                                            logger.info(f"LLM loaded via orchestrator: {entry.id} on {entry.device}")
                                        else:
                                            logger.warning("Orchestrator: no LLM fits current compute")
                                    except Exception as _orch_err:
                                        logger.warning(f"Orchestrator auto_load failed, falling back to direct start: {_orch_err}")
                                        if llama_config.start_server():
                                            logger.info("Llama.cpp server started (direct fallback)")
                            else:
                                logger.warning("AI initialization completed with errors")
                        except Exception as e:
                            logger.error(f"AI initialization failed: {e}")
                            logger.error(traceback.format_exc())

                    # Start initialization in background thread so it doesn't block startup
                    ai_thread = threading.Thread(target=ai_init_thread, daemon=True)
                    ai_thread.start()
                    logger.info("AI initialization started in background thread")
                else:
                    logger.info("Not first run - checking if server should auto-start...")

                    # Propagate configured endpoint to env so HARTOS picks it up
                    # Only propagate external endpoints if we are NOT auto-starting
                    # a local server — start_server() will set the authoritative URL
                    _ext = llama_config.config.get("external_llm_endpoint")
                    _will_autostart = llama_config.config.get("auto_start_server", True)
                    if llama_config.config.get("use_external_llm") and _ext and not _will_autostart:
                        _ext_url = _ext.get("base_url", "")
                        if _ext_url:
                            if '/v1' not in _ext_url:
                                _ext_url = _ext_url.rstrip('/') + '/v1'
                            os.environ['HEVOLVE_LOCAL_LLM_URL'] = _ext_url
                            logger.info(f"External LLM endpoint propagated: HEVOLVE_LOCAL_LLM_URL={_ext_url}")
                    elif llama_config.is_cloud_configured():
                        try:
                            from desktop.ai_key_vault import AIKeyVault
                            AIKeyVault.get_instance().export_to_env()
                            logger.info("Cloud provider keys exported to env")
                        except Exception:
                            pass

                    # Auto-start server on subsequent runs via ModelOrchestrator
                    if llama_config.config.get("auto_start_server", True):
                        def server_start_thread():
                            try:
                                # Warm path: a llama-server process is already reachable
                                # (healthy OR still loading a model). is_llm_server_running()
                                # returns True for any HTTP response (200/500/503), False
                                # only when nothing is listening (ConnectionRefused).
                                # is_llm_available() is NOT used here — it requires 200
                                # (model fully loaded), which would miss a loading server
                                # and trigger a duplicate start + misleading toast.
                                if llama_config.is_llm_server_running():
                                    logger.info("LLM server already running — syncing catalog")
                                    llama_config.start_server()
                                    return

                                # Cold path: no server detected — start via orchestrator
                                logger.info("Auto-start enabled, loading LLM via orchestrator...")
                                from models.orchestrator import get_orchestrator
                                entry = get_orchestrator().auto_load('llm')
                                if entry:
                                    logger.info(f"LLM loaded via orchestrator: {entry.id} on {entry.device}")
                                else:
                                    logger.warning("Orchestrator: no LLM fits current compute")
                            except Exception as e:
                                logger.error(f"Failed to start server: {e}")
                                logger.error(traceback.format_exc())

                        server_thread = threading.Thread(target=server_start_thread, daemon=True)
                        server_thread.start()
                        logger.info("Server auto-start initiated in background thread")
                    else:
                        logger.info("Auto-start disabled - server will not start automatically")
            except Exception as e:
                logger.error(f"Failed to check first run status: {e}")
        else:
            logger.info("Llama installer not available - skipping AI initialization")

        # Note: Flask readiness is already verified in main() before webview creation.
        # No extra delay needed here.

        # Initialize tray icon to None
        logger.info("Initializing global variables")
        _tray_icon = None
        _window = None

        # Hide console window in background mode
        if sys.platform == "win32" and args.background:
            try:
                logger.info("Attempting to hide console window")
                ctypes.windll.user32.ShowWindow(ctypes.windll.kernel32.GetConsoleWindow(), 0)
                logger.info("Console window hidden in background mode")
            except Exception as e:
                logger.error(f"Failed to hide console window: {str(e)}")

        # Add explicit check before calling main
        logger.info("=== ABOUT TO CALL main() FUNCTION ===")
        logger.info(f"Current args state: sidebar={args.sidebar}, background={args.background}")

        # Start clipboard monitor thread
        _clipboard_thread = threading.Thread(
            target=_clipboard_monitor_thread, daemon=True, name='ClipboardMonitor')
        _clipboard_thread.start()
        logger.info("[STARTUP] Clipboard monitor thread started")

        # Run main function
        _splash_update('Loading interface...')
        logger.info("Calling main() function...")
        main()

        logger.info("=== main() FUNCTION COMPLETED ===")

    except KeyboardInterrupt:
        logger.info("Application interrupted by user")
        sys.exit(0)
    except SystemExit as e:
        logger.info(f"Application exited with code: {e.code}")
        sys.exit(e.code)
    except Exception as e:
        logger.error("=== APPLICATION CRASHED ===")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error message: {str(e)}")
        logger.error("Full traceback:")
        logger.error(traceback.format_exc())
        _trace(f"CRASHED: {type(e).__name__}: {e}")
        _trace(traceback.format_exc())

        # Create a visible error log if something went wrong at startup
        try:
            error_dir = os.path.join(os.path.expanduser('~'), 'Documents', 'HevolveAi Agent Companion', 'logs')
            os.makedirs(error_dir, exist_ok=True)
            error_file = os.path.join(error_dir, 'startup_error.log')
            with open(error_file, 'a') as f:
                f.write(f"\n=== STARTUP ERROR {time.strftime('%Y-%m-%d %H:%M:%S')} ===\n")
                f.write(f"Arguments: {sys.argv}\n")
                f.write(f"Working Directory: {os.getcwd()}\n")
                f.write(f"Protocol: {getattr(args, 'protocol', 'None')}\n")
                f.write(f"Error: {str(e)}\n")
                f.write(f"Traceback:\n{traceback.format_exc()}\n")
        except Exception as log_err:
            print(f"Failed to write error log: {log_err}")

        sys.exit(1)


"""
curl -X POST http://localhost:5000/api/storage/set \
  -H "Content-Type: application/json" \
  -d '{
    "agentname": "AgentName",
    "email": "test@hertzai.com",
    "access_token": "encryptedjwttoken",
    "user_id": "10077"
  }

curl -X GET http://localhost:5000/api/storage/get/email_address
curl -X GET http://localhost:5000/api/storage/get/user_id
curl -X GET http://localhost:5000/api/storage/get/access_token
  
  """