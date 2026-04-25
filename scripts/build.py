#!/usr/bin/env python3
"""
build.py - Cross-platform build script for Nunba Desktop App

"A Friend, A Well Wisher, Your LocalMind"

Usage:
    python build.py              - Full build (auto-detect platform)
    python build.py app          - Build application only
    python build.py installer    - Build installer only (requires existing build)
    python build.py clean        - Clean build artifacts
    python build.py --platform windows  - Force Windows build
    python build.py --platform macos    - Force macOS build

Developer Setup — Clone repos (sibling directories):
    projects/
    ├── Nunba/              ← this repo (desktop app + React frontend)
    ├── HARTOS/             ← private: hertz-ai/HARTOS (backend engine)
    │   └── pyproject.toml declares these as dependencies (transitive):
    │       ├── hevolve-database  ← git+hertz-ai/Hevolve_Database
    │       └── embodied-ai       ← git+hertz-ai/HevolveAI
    ├── Hevolve_Database/   ← private: hertz-ai/Hevolve_Database (DB models, canonical)
    └── hevolveai/          ← private: hertz-ai/HevolveAI (embodied continual learner)

    Quick start:
        git clone https://github.com/hertz-ai/Nunba.git
        git clone https://github.com/hertz-ai/HARTOS.git
        # HARTOS gives transitive access to Hevolve_Database + hevolveai.
        # For direct editable installs (recommended for dev):
        git clone https://github.com/hertz-ai/Hevolve_Database.git
        git clone https://github.com/hertz-ai/HevolveAI.git
        cd Hevolve_Database && pip install -e . && cd ..
        cd hevolveai && pip install -e . && cd ..
        cd HARTOS && pip install -e . && cd ..

    The build script auto-discovers these sibling directories. If not found
    locally, it falls back to pip install from GitHub (requires git credentials
    for private repos).
"""
import argparse
import datetime
import os
import platform as plat
import re
import shutil
import subprocess
import sys
import threading

# Force unbuffered output so build logs appear in real time (not held until exit).
# Critical when running from IDEs, CI, or piped environments.
os.environ['PYTHONUNBUFFERED'] = '1'

# Ensure scripts/ is on sys.path so deps.py can be imported
_scripts_dir = os.path.dirname(os.path.abspath(__file__))
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

from deps import VERSION, generate_requirements

APP_NAME = "Nunba"

# Detect platform
IS_WINDOWS = sys.platform == 'win32'
IS_MACOS = sys.platform == 'darwin'
IS_LINUX = sys.platform.startswith('linux')


HEVOLVE_REPO_URL = 'https://github.com/hertz-ai/HARTOS.git'
HEVOLVE_BRANCH = 'gpt4.1'
HEVOLVE_SOURCE_DIR = 'hartos_backend_src'


def fetch_hartos_backend_source():
    """Clone latest hart-backend source for bundling into the installer.

    This is used as a fallback when pip install fails, and also provides
    the source files that cx_Freeze bundles into the frozen executable.
    """
    print_info("Fetching latest hart-backend source...")

    if os.path.exists(HEVOLVE_SOURCE_DIR):
        # Pull latest if already cloned
        if os.path.exists(os.path.join(HEVOLVE_SOURCE_DIR, '.git')):
            if run_command(
                ['git', '-C', HEVOLVE_SOURCE_DIR, 'pull', '--ff-only'],
                "Updating existing hart-backend clone...",
                check=False
            ):
                return True

        # Remove stale directory and re-clone
        shutil.rmtree(HEVOLVE_SOURCE_DIR, ignore_errors=True)

    return run_command(
        ['git', 'clone', '--depth', '1', '--branch', HEVOLVE_BRANCH,
         HEVOLVE_REPO_URL, HEVOLVE_SOURCE_DIR],
        f"Cloning hart-backend ({HEVOLVE_BRANCH})...",
        check=False
    )


def print_header(text):
    """Print a header line"""
    print("=" * 60, flush=True)
    print(f"  {text}", flush=True)
    print("=" * 60, flush=True)


def print_info(text):
    """Print info message"""
    print(f"[INFO] {text}", flush=True)


def print_warn(text):
    """Print warning message"""
    print(f"[WARN] {text}", flush=True)


def print_error(text):
    """Print error message"""
    print(f"[ERROR] {text}", flush=True)


def _nunba_build_log_path(name):
    """Return the absolute path to a build-category log file under
    ~/Documents/Nunba/logs/.

    Matches the convention CLAUDE.md calls out ("~/Documents/Nunba/logs"
    for all user-writable logs) so a single `tail -f` across that
    directory surfaces both build-time and runtime events.  The dir is
    created if missing so callers never have to guard for it.
    """
    _dir = os.path.join(
        os.path.expanduser('~'), 'Documents', 'Nunba', 'logs',
    )
    try:
        os.makedirs(_dir, exist_ok=True)
    except Exception:
        pass
    return os.path.join(_dir, name)


def _tee_subprocess_to_log(cmd, log_path, description=None, timeout_s=None):
    """Run a subprocess and stream (tee) stdout+stderr in real time to
    both the console AND `log_path` — so a `tail -f log_path` shows
    progress live even when the subprocess emits nothing to its own
    internal log files.

    Returns True on exit-code 0, False on failure / timeout / kill.
    On timeout the process is hard-killed and a clear marker is written
    to the log so operators can tell "wedged" from "errored".
    """
    if description:
        print_info(description)
    _cmd_str = cmd if isinstance(cmd, str) else ' '.join(cmd)
    print(f"  > {_cmd_str}", flush=True)

    try:
        _log = open(log_path, 'a', encoding='utf-8', buffering=1)  # line-buffered
    except OSError:
        _log = None

    _session_hdr = (
        f"\n===== build subprocess {datetime.datetime.now().isoformat()} "
        f"timeout={timeout_s}s =====\n  cmd: {_cmd_str}\n"
    )
    if _log:
        _log.write(_session_hdr)
        _log.flush()

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
    except Exception as e:
        _msg = f"[tee] failed to spawn: {e}"
        if _log:
            _log.write(_msg + '\n')
            _log.close()
        print_error(_msg)
        return False

    _timed_out = {'hit': False}

    def _killer():
        try:
            proc.wait(timeout=timeout_s)
        except subprocess.TimeoutExpired:
            _timed_out['hit'] = True
            try:
                proc.kill()
            except Exception:
                pass

    _killer_thread = None
    if timeout_s:
        _killer_thread = threading.Thread(target=_killer, daemon=True)
        _killer_thread.start()

    try:
        assert proc.stdout is not None
        for _line in proc.stdout:
            _line = _line.rstrip('\n')
            _ts = datetime.datetime.now().strftime('%H:%M:%S')
            _out = f"[{_ts}] {_line}"
            print(_out, flush=True)
            if _log:
                try:
                    _log.write(_out + '\n')
                    _log.flush()
                except Exception:
                    pass
    except Exception as e:
        print_error(f"[tee] read failed: {e}")

    try:
        _rc = proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        _timed_out['hit'] = True
        try:
            proc.kill()
        except Exception:
            pass
        _rc = -1

    _footer = (
        f"===== build subprocess exit rc={_rc} timed_out={_timed_out['hit']} "
        f"@ {datetime.datetime.now().isoformat()} =====\n"
    )
    if _log:
        _log.write(_footer)
        _log.close()

    if _timed_out['hit']:
        print_error(
            f"Subprocess TIMED OUT after {timeout_s}s (killed). "
            f"Full live log: {log_path}"
        )
        return False
    if _rc != 0:
        print_warn(
            f"Subprocess exited rc={_rc}.  Live log: {log_path}"
        )
        return False
    return True


def run_command(cmd, description=None, check=True, timeout_s=None):
    """Run a command and optionally check for errors.

    timeout_s: if set, kill the subprocess after this many seconds and
    return False instead of blocking forever.  Used by acceptance gates
    that historically have wedged (e.g. the langchain-fix infinite-loop
    on some dev machines, 2026-04-19) — the bundle itself is usable but
    the verify step loops for 80+ min of CPU with no log output.
    """
    if description:
        print_info(description)
    print(f"  > {cmd if isinstance(cmd, str) else ' '.join(cmd)}", flush=True)

    try:
        if isinstance(cmd, str):
            result = subprocess.run(cmd, shell=True, check=check, timeout=timeout_s)
        else:
            result = subprocess.run(cmd, check=check, timeout=timeout_s)
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        _cmd_str = cmd if isinstance(cmd, str) else ' '.join(cmd)
        print_error(f"Command TIMED OUT after {timeout_s}s: {_cmd_str}")
        return False
    except subprocess.CalledProcessError as e:
        print_error(f"Command failed with exit code {e.returncode}")
        return False
    except Exception as e:
        print_error(f"Command failed: {e}")
        return False


def _find_best_python():
    """Find the best non-conda Python for building.

    Conda Python bundles packages (numpy, etc.) with broken _distributor_init
    that lacks DLL loading code. cx_Freeze then bundles this broken numpy,
    causing 'numpy._core.multiarray failed to import' in the frozen app.

    Prefer standalone CPython (e.g. C:\\Python312) over conda/miniconda.
    """
    # Prefer specific standalone CPython installations
    candidates = []
    if IS_WINDOWS:
        for ver in ['312', '311', '313', '310']:
            for base in [f'C:\\Python{ver}', os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'Python', f'Python{ver}')]:
                exe = os.path.join(base, 'python.exe')
                if os.path.isfile(exe):
                    candidates.append(exe)
    else:
        for ver in ['3.12', '3.11', '3.13', '3.10']:
            for base in [f'/usr/local/bin/python{ver}', f'/usr/bin/python{ver}']:
                if os.path.isfile(base):
                    candidates.append(base)

    # Filter out conda/miniconda
    conda_keywords = ('conda', 'miniconda', 'anaconda', 'miniforge', 'mambaforge')
    for exe in candidates:
        low = exe.lower()
        if not any(kw in low for kw in conda_keywords):
            return exe

    # Fallback: use current Python even if conda
    return sys.executable


def activate_venv():
    """Get or create an isolated build venv.

    A dedicated venv ensures:
    - All packages are pip-installed from wheels (no conda mixing)
    - No --user fallback (venv site-packages is always writable)
    - No user site-packages leaking into the build
    - Reproducible builds regardless of host Python environment

    On CI (NUNBA_CI=1), skip venv — deps are pre-installed by the workflow.
    """
    if os.environ.get('NUNBA_CI'):
        print_info("CI mode — using system Python (deps pre-installed by workflow)")
        return sys.executable

    venv_dir = '.venv'
    venv_paths = ['.venv', 'venv']

    for venv in venv_paths:
        if IS_WINDOWS:
            python_exe = os.path.join(venv, 'Scripts', 'python.exe')
        else:
            python_exe = os.path.join(venv, 'bin', 'python')

        if os.path.exists(python_exe):
            print_info(f"Using existing virtual environment: {venv}")
            return python_exe

    # No venv found — create one for clean, isolated builds
    base_python = _find_best_python()
    print_header("Creating build virtual environment")
    print_info(f"Base Python: {base_python}")

    if not run_command(
        [base_python, '-m', 'venv', venv_dir],
        f"Creating .venv with {base_python}...",
        check=False
    ):
        print_warn(f"Failed to create venv. Using system Python: {sys.executable}")
        return sys.executable

    if IS_WINDOWS:
        python_exe = os.path.join(venv_dir, 'Scripts', 'python.exe')
    else:
        python_exe = os.path.join(venv_dir, 'bin', 'python')

    if not os.path.exists(python_exe):
        print_warn("Venv created but python not found. Using system Python.")
        return sys.executable

    # Upgrade pip in the fresh venv
    run_command(
        [python_exe, '-m', 'pip', 'install', '--upgrade', 'pip'],
        "Upgrading pip in venv...",
        check=False
    )

    print_info(f"Build venv ready: {python_exe}")
    return python_exe


def clean_build():
    """Clean build artifacts"""
    print_header("Cleaning build artifacts")

    dirs_to_remove = ['build', 'dist', 'Output', 'dmg_temp']
    files_to_remove = ['app.icns', '*.dmg']

    for d in dirs_to_remove:
        if os.path.exists(d):
            print_info(f"Removing {d}/")
            shutil.rmtree(d, ignore_errors=True)

    for pattern in files_to_remove:
        if '*' in pattern:
            import glob
            for f in glob.glob(pattern):
                print_info(f"Removing {f}")
                os.remove(f)
        elif os.path.exists(pattern):
            print_info(f"Removing {pattern}")
            os.remove(pattern)

    # Clean iconset on macOS
    if os.path.exists('app.iconset'):
        shutil.rmtree('app.iconset', ignore_errors=True)

    print_info("Done. All build artifacts removed.")


def install_dependencies(python_exe):
    """Install required dependencies from centralized deps.py

    Generates requirements.txt from deps.py (single source of truth),
    then installs via pip install -r. All versions are exact-pinned
    so pip has zero resolution work.
    """
    print_header("Installing Python dependencies")

    # Generate requirements.txt from deps.py — the ONE source of truth.
    # This keeps requirements.txt in sync for CI cache keys + pip-audit.
    req_file = generate_requirements('requirements.txt', sys.platform)
    print_info(f"Installing dependencies (VERSION {VERSION})")

    cmd = [python_exe, '-m', 'pip', 'install', '-r', req_file]
    if not run_command(cmd, "Installing dependencies...", check=False):
        print_warn("Some dependencies may have failed to install.")
        print_info("Continuing with build...")

    # Fix crossbarhttp circular import: its __init__.py uses Python 2-style
    # absolute self-import (from crossbarhttp import Client) which fails in
    # frozen executables. Patch to relative import (from .crossbarhttp import ...).
    _fix_crossbarhttp(python_exe)

    # Install hart-backend: prefer local sibling project, fall back to git
    _install_hartos_backend(python_exe)


def _fix_crossbarhttp(python_exe):
    """Fix crossbarhttp's circular import for cx_Freeze compatibility.

    crossbarhttp 0.1.2's __init__.py uses `from crossbarhttp import Client`
    (Python 2-style absolute self-import). In frozen executables this causes:
        ImportError: cannot import name 'Client' from partially initialized
        module 'crossbarhttp' (circular import)
    Fix: patch to relative import `from .crossbarhttp import Client`.
    """
    # Find the installed __init__.py
    site_pkgs = subprocess.check_output(
        [python_exe, '-c', 'import site; print(site.getsitepackages()[0])'],
        text=True,
    ).strip()
    init_py = os.path.join(site_pkgs, 'crossbarhttp', '__init__.py')
    if not os.path.exists(init_py):
        return
    with open(init_py) as f:
        content = f.read()
    old = 'from crossbarhttp import ('
    new = 'from .crossbarhttp import ('
    if old in content and new not in content:
        content = content.replace(old, new)
        with open(init_py, 'w') as f:
            f.write(content)
        print_info("Fixed crossbarhttp circular import (absolute to relative)")


def _stamp_version_in_file(filepath, pattern, replacement):
    """Replace a version string in a file using regex.

    Used to propagate VERSION from deps.py into files that can't import it
    at runtime (e.g. desktop/config.py runs inside frozen exe where scripts/
    doesn't exist).
    """
    if not os.path.exists(filepath):
        print_warn(f"Cannot stamp version: {filepath} not found")
        return False
    with open(filepath, encoding='utf-8') as f:
        content = f.read()
    new_content = re.sub(pattern, replacement, content)
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print_info(f"Stamped VERSION {VERSION} into {os.path.basename(filepath)}")
        return True
    return False


def generate_build_hashes():
    """Generate build_hashes.json with git commit hashes of all repos.

    Queried at runtime via GET /api/harthash (@HARTHASH magic word).
    """
    import datetime
    import json
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(scripts_dir)
    repos = {
        'nunba': project_dir,
        'hartos': os.path.join(project_dir, '..', 'HARTOS'),
        'hevolve_database': os.path.join(project_dir, '..', 'Hevolve_Database'),
        'hevolveai': os.path.join(project_dir, '..', 'hevolveai'),
    }
    hashes = {}
    for name, path in repos.items():
        try:
            r = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'],
                               capture_output=True, text=True, cwd=path, timeout=5)
            hashes[name] = r.stdout.strip() if r.returncode == 0 else 'unknown'
        except Exception:
            hashes[name] = 'unknown'
    hashes['build_time'] = datetime.datetime.now().isoformat()
    out_path = os.path.join(project_dir, 'build_hashes.json')
    with open(out_path, 'w') as f:
        json.dump(hashes, f, indent=2)
    print_info(f"Build hashes: {hashes}")


def stamp_version():
    """Stamp VERSION from deps.py into runtime files that can't import it."""
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(scripts_dir)

    # desktop/config.py: APP_VERSION = "X.Y.Z"
    _stamp_version_in_file(
        os.path.join(project_dir, 'desktop', 'config.py'),
        r'APP_VERSION\s*=\s*"[^"]*"',
        f'APP_VERSION = "{VERSION}"',
    )

    # desktop/crash_reporter.py: APP_VERSION = "X.Y.Z" (fallback)
    _stamp_version_in_file(
        os.path.join(project_dir, 'desktop', 'crash_reporter.py'),
        r'APP_VERSION\s*=\s*"[^"]*"',
        f'APP_VERSION = "{VERSION}"',
    )


def _find_local_hartos_backend():
    """Look for local HARTOS repo as a sibling directory."""
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(scripts_dir)
    parent = os.path.dirname(project_dir)

    candidates = [
        os.path.join(parent, 'HARTOS'),
        os.path.join(parent, 'hart-backend'),
    ]

    for path in candidates:
        pyproject = os.path.join(path, 'pyproject.toml')
        if os.path.exists(pyproject):
            print_info(f"Found local hart-backend at: {path}")
            return path

    return None


def _install_hevolve_database(python_exe):
    """Install hevolve-database (single source of truth for all DB models) from local sibling.

    MUST be called BEFORE hart-backend install. hart-backend's pyproject.toml
    declares hevolve-database as a git dependency. Pre-installing from local
    sibling satisfies the dependency so pip skips the git URL.
    """
    candidates = [
        # 1. Sibling directory (canonical repo clone)
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'Hevolve_Database'),
        # 2. User's PycharmProjects directory (fallback)
        os.path.join(os.path.expanduser('~'), 'PycharmProjects', 'Hevolve_Database'),
    ]
    for path in candidates:
        if os.path.exists(os.path.join(path, 'setup.py')):
            if run_command(
                [python_exe, '-m', 'pip', 'install', path],
                "Installing hevolve-database from local project...",
                check=False,
            ):
                return

    # Fallback: pip install from GitHub
    run_command(
        [python_exe, '-m', 'pip', 'install',
         'hevolve-database@git+https://github.com/hertz-ai/Hevolve_Database.git@realistic_intro_video'],
        "Installing hevolve-database (DB models)...",
        check=False,
    )


def _install_embodied_ai(python_exe):
    """Install HevolveAI (Embodied Continual Learner With Hiveintelligence) from local sibling first.

    MUST be called BEFORE hart-backend install. hart-backend's pyproject.toml
    declares `embodied-ai @ git+https://github.com/hertz-ai/HevolveAI.git@main`
    which is a private repo. If pip can't reach it, the entire hart-backend
    install fails. Pre-installing from the local sibling satisfies the dependency
    so pip skips the git URL during hart-backend resolution.

    Falls back to git install only if local sibling is unavailable (requires
    the user's git credentials for private repo access).
    """
    # Try local sibling first
    candidates = [
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'hevolveai'),
        os.path.join(os.path.expanduser('~'), 'PycharmProjects', 'hevolveai'),
    ]
    for path in candidates:
        if os.path.exists(os.path.join(path, 'setup.py')):
            if run_command(
                [python_exe, '-m', 'pip', 'install', path],
                "Installing embodied-ai from local project...",
                check=False,
            ):
                return

    # Fallback: pip install from GitHub
    run_command(
        [python_exe, '-m', 'pip', 'install',
         'embodied-ai@git+https://github.com/hertz-ai/HevolveAI.git@main'],
        "Installing HevolveAI (Continual Learner)...",
        check=False,
    )


def _install_hartos_backend(python_exe):
    """Install hart-backend with smart source detection.

    Priority:
      1. Local sibling project (non-editable install for frozen exe compatibility)
      2. pip install from GitHub main branch (requires user's git credentials)
      3. git clone fallback for cx_Freeze bundling

    Installs embodied-ai from local sibling FIRST, because hart-backend's
    pyproject.toml declares it as a git dependency. If pip can't reach the
    private git repo, the entire install fails. Pre-installing from local
    sibling satisfies the dependency so pip skips the git URL.

    Pins langchain==0.0.230 (monolithic) after install because pyproject.toml
    says >=0.0.230 which pip resolves to 1.x (slim package without llms/chains/etc.),
    breaking `from langchain.llms import OpenAI` in hart_intelligence (hart_intelligence.py).
    """
    # Pre-install dependencies from local siblings so pip doesn't try git URLs
    _install_hevolve_database(python_exe)
    _install_embodied_ai(python_exe)

    # 1. Check for local sibling project (non-editable for frozen exe compatibility)
    #    Use --no-deps because pyproject.toml declares embodied-ai as a private
    #    git URL that pip can't resolve. All deps are already installed above.
    local_path = _find_local_hartos_backend()
    if local_path:
        # Try with --no-deps first (avoids private git URL resolution failure)
        cmd = [python_exe, '-m', 'pip', 'install', '--no-deps', local_path]
        if not run_command(cmd, "Installing hart-backend (--no-deps)...", check=False):
            # Fallback: try full install (may work if git credentials are available)
            cmd = [python_exe, '-m', 'pip', 'install', local_path]
            if not run_command(cmd, "Installing hart-backend (full)...", check=False):
                print_warn("Local install failed. Trying git...")
                local_path = None  # fall through to git attempt

        if local_path:
            return

    # 2. pip install from GitHub (requires user's git credentials for private repos)
    hevolve_cmd = [
        python_exe, '-m', 'pip', 'install', '--no-deps',
        'hart-backend@git+https://github.com/hertz-ai/HARTOS.git@main'
    ]
    if run_command(hevolve_cmd, "Installing latest hart-backend from GitHub...", check=False):
        return

    # 3. Fallback: clone the repo source for cx_Freeze bundling
    print_warn("hart-backend pip install failed. Trying local clone...")
    fetch_hartos_backend_source()


def build_react_landing_page():
    """Build React landing-page if Node.js is available"""
    landing_dir = 'landing-page'

    if not os.path.isdir(landing_dir):
        print_info("No landing-page directory found, skipping React build.")
        return True

    # Check if Node.js is available
    try:
        result = subprocess.run(
            ['node', '--version'], capture_output=True, text=True
        )
        if result.returncode != 0:
            raise FileNotFoundError
    except (FileNotFoundError, OSError):
        print_warn("Node.js not found. Skipping React build.")
        print_info("Using existing landing-page/build.")
        return True

    print_header("Building React landing-page")
    # Unconditional `npm run build` — no mtime heuristic, no
    # "if _stale" guard.  Stale landing-page/build/ has shipped twice
    # in this session; every build run rebuilds the React bundle so the
    # installer always reflects HEAD.
    print_info("React bundle: running `npm run build` unconditionally.")

    # Install npm packages
    npm_cmd = 'npm.cmd' if IS_WINDOWS else 'npm'
    node_modules = os.path.join(landing_dir, 'node_modules')

    if os.path.isdir(node_modules):
        subprocess.run(
            [npm_cmd, 'install', '--legacy-peer-deps'],
            cwd=landing_dir, check=False
        )
    else:
        result = subprocess.run(
            [npm_cmd, 'install', '--legacy-peer-deps'],
            cwd=landing_dir, check=False
        )
        if result.returncode != 0:
            print_warn("npm install failed. Using existing landing-page/build.")
            return True

    # Build — increase Node.js heap to prevent OOM on large bundles.
    # 4GB was insufficient on the current landing-page bundle size
    # (webpack + tailwind + all lazy-split chunks): saw `FATAL ERROR:
    # CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of
    # memory` at 4096MB on 2026-04-15.  Bumped to 8192MB.  If CI runners
    # have less than 8GB available, scale via env override.
    env = os.environ.copy()
    env['CI'] = 'false'
    env['ESLINT_NO_DEV_ERRORS'] = 'true'
    env['DISABLE_ESLINT_PLUGIN'] = 'true'  # skip ESLint entirely during build
    _node_heap_mb = os.environ.get('NUNBA_NODE_HEAP_MB', '8192')
    env['NODE_OPTIONS'] = f'--max-old-space-size={_node_heap_mb}'

    result = subprocess.run(
        [npm_cmd, 'run', 'build'],
        cwd=landing_dir, env=env, check=False
    )
    if result.returncode != 0:
        print_error("React build failed! Fix the build errors before freezing.")
        print_error("The frozen app will ship a broken frontend otherwise.")
        return False

    print_info("React build complete (output in landing-page/build/).")
    return True


def run_setup_wizard(python_exe, dsn=None):
    """Run the configuration wizard for crash reporting setup"""
    print_header("Configuration Wizard")

    # Check if already configured
    result = subprocess.run(
        [python_exe, os.path.join('desktop', 'setup_wizard.py'), '--check'],
        capture_output=True, text=True
    )

    if 'configured' in result.stdout and 'not_configured' not in result.stdout:
        print_info("Crash reporting is already configured.")
        return True

    # If DSN provided via command line, set it directly
    if dsn:
        print_info("Setting Sentry DSN from command line...")
        result = subprocess.run(
            [python_exe, os.path.join('desktop', 'setup_wizard.py'), '--dsn', dsn],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print_info("Sentry DSN configured successfully.")
            return True
        else:
            print_warn("Failed to set DSN. Continuing without crash reporting.")
            return False

    # Run interactive wizard
    print_info("Running interactive setup wizard...")
    print()
    result = subprocess.run([python_exe, os.path.join('desktop', 'setup_wizard.py')])

    return result.returncode == 0


def ensure_webview2_bootstrapper():
    """Download WebView2 bootstrapper if not present"""
    bootstrapper_path = "MicrosoftEdgeWebview2Setup.exe"
    bootstrapper_url = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"

    if os.path.exists(bootstrapper_path):
        print_info("WebView2 bootstrapper already present")
        return True

    print_info("Downloading WebView2 bootstrapper...")
    try:
        import urllib.request
        urllib.request.urlretrieve(bootstrapper_url, bootstrapper_path)
        if os.path.exists(bootstrapper_path):
            print_info(f"Downloaded: {bootstrapper_path}")
            return True
        else:
            print_error("Download failed - file not created")
            return False
    except Exception as e:
        print_error(f"Failed to download WebView2 bootstrapper: {e}")
        print_info("Please download manually from: https://developer.microsoft.com/en-us/microsoft-edge/webview2/")
        return False


def slim_python_embed():
    """Remove unnecessary files from python-embed to reduce installer size.

    Strips pip, setuptools, test suites, __pycache__, .dist-info metadata,
    and CLI scripts that aren't needed at runtime.
    """
    embed_dir = os.path.join('build', 'Nunba', 'python-embed')
    if not os.path.exists(embed_dir):
        print_info("No python-embed in build, skipping slim step")
        return

    print_header("Slimming python-embed")
    site_packages = os.path.join(embed_dir, 'Lib', 'site-packages')
    removed_mb = 0

    # Tier 1: Remove dev/build tools not needed at runtime.
    # NOTE: pip is KEPT — needed for runtime auto-install of GPU torch,
    # TTS backends (chatterbox, cosyvoice), and model dependencies.
    # The install_cuda_torch() and install_backend_full() paths in
    # tts/package_installer.py call python-embed's pip at runtime.
    dev_packages = ['_distutils_hack', 'pkg_resources']
    for pkg in dev_packages:
        pkg_dir = os.path.join(site_packages, pkg)
        if os.path.exists(pkg_dir):
            size = _dir_size_mb(pkg_dir)
            shutil.rmtree(pkg_dir, ignore_errors=True)
            removed_mb += size
            print_info(f"Removed {pkg}/ ({size:.1f} MB)")

    # Dead-code removal (2026-04-17): the former allowlist-based strip
    # approach kept biting — transformers' runtime dep graph reaches
    # filelock, tqdm, regex, and others that the allowlist repeatedly
    # missed.  Policy now: keep ALL .dist-info (~5 MB total, negligible
    # vs installer size).  The dist-info branch in the walker below is
    # a no-op `continue`; the whole set is gone.

    # Remove tests, __pycache__ always; dist-info is kept (not stripped) per
    # runtime-metadata consumers.
    for root, dirs, files in os.walk(site_packages, topdown=False):
        for d in list(dirs):
            full_path = os.path.join(root, d)
            if d in ('tests', 'test', '__pycache__'):
                size = _dir_size_mb(full_path)
                shutil.rmtree(full_path, ignore_errors=True)
                removed_mb += size
            elif d.endswith('.dist-info'):
                # KEEP ALL dist-info in python-embed.  Total size is ~5MB.
                # transformers.dependency_versions_check calls
                # importlib.metadata.version() for tqdm, filelock, regex,
                # numpy, tokenizers, safetensors, accelerate, packaging,
                # pyyaml at import time.  ANY missing dist-info crashes
                # the entire parler_tts import chain.  An earlier
                # allowlist approach failed repeatedly — tqdm, filelock,
                # and others kept getting stripped because the set
                # couldn't keep up with transformers' dep checks.
                # 5MB of metadata is not worth the ongoing breakage.
                continue

    # Remove Scripts directory (CLI tools not needed at runtime)
    scripts_dir = os.path.join(embed_dir, 'Scripts')
    if os.path.exists(scripts_dir):
        size = _dir_size_mb(scripts_dir)
        shutil.rmtree(scripts_dir, ignore_errors=True)
        removed_mb += size
        print_info(f"Removed Scripts/ ({size:.1f} MB)")

    # Remove editable install artifacts (hardcoded dev paths won't work in frozen exe)
    import glob as _glob
    for f in _glob.glob(os.path.join(site_packages, '__editable__*')):
        try:
            fsize = os.path.getsize(f) / (1024 * 1024)
            os.remove(f)
            removed_mb += fsize
            print_info(f"Removed editable artifact: {os.path.basename(f)}")
        except OSError:
            pass
    # Remove editable finder modules (e.g. __editable___hartos_backend_0_0_0_finder.py)
    for f in _glob.glob(os.path.join(site_packages, '__editable___*_finder.py')):
        try:
            fsize = os.path.getsize(f) / (1024 * 1024)
            os.remove(f)
            removed_mb += fsize
            print_info(f"Removed editable finder: {os.path.basename(f)}")
        except OSError:
            pass
    # Remove .pth files that reference dev machine paths
    for f in _glob.glob(os.path.join(site_packages, '*.pth')):
        try:
            with open(f) as fh:
                content = fh.read()
            if '__editable__' in content or 'PycharmProjects' in content:
                os.remove(f)
                print_info(f"Removed dev .pth file: {os.path.basename(f)}")
        except (OSError, UnicodeDecodeError):
            pass

    # Tier 2: Remove confirmed-unused large packages.
    # Verified: zero imports in Nunba core or HARTOS core code.
    # Packages like torch, cv2, numpy, faiss, transformers ARE used and kept.
    # sympy was previously listed here but is LOAD-BEARING: torch 2.10's
    # torch._dynamo / torch.fx.experimental.symbolic_shapes / torch.utils._sympy
    # all import sympy at torch import time.  Indic Parler TTS (and every
    # transformers-backed generator) crashes with `ModuleNotFoundError:
    # No module named 'sympy'` when it's stripped from python-embed.
    # It now lives in EMBED_DEPS (deps.py) so the presence gate reinstalls
    # it on every build; do NOT re-add it to unused_packages.
    unused_packages = [
        # Not imported anywhere in core code (0 references)
        'scipy', 'scipy.libs',           # 137 MB - not imported
        'pandas',                          # 60 MB  - not imported
        'chromadb_rust_bindings',          # 57 MB  - chromadb not used in core
        'sklearn',                         # 41 MB  - not imported
        'kubernetes', 'kubernetes_asyncio',# 34 MB  - server-only, not desktop
        'networkx',                        # 15 MB  - transitive dep only
        'lief',                            # 12 MB  - binary analysis, not needed
        'pythonwin',                       # 11 MB  - dev tool
        'grpc', 'grpcio',                  # 12 MB  - google cloud only
    ]
    for pkg in unused_packages:
        pkg_dir = os.path.join(site_packages, pkg)
        if os.path.exists(pkg_dir):
            size = _dir_size_mb(pkg_dir)
            shutil.rmtree(pkg_dir, ignore_errors=True)
            removed_mb += size
            print_info(f"Removed {pkg}/ ({size:.1f} MB)")

    print_info(f"Total removed: {removed_mb:.0f} MB")


def _dir_size_mb(path):
    """Get directory size in MB"""
    total = 0
    for dirpath, dirnames, filenames in os.walk(path):
        for f in filenames:
            try:
                total += os.path.getsize(os.path.join(dirpath, f))
            except OSError:
                pass
    return total / (1024 * 1024)


def build_windows(python_exe, app_only=False, installer_only=False):
    """Build on Windows"""
    if installer_only:
        # Skip cx_Freeze, jump straight to Inno Setup
        return _build_windows_installer(python_exe)

    # Clean previous build before rebuilding
    build_dir = os.path.join('build', 'Nunba')
    if os.path.exists(build_dir):
        print_info("Cleaning previous build (preserving python-embed if unchanged)...")
        for item in os.listdir(build_dir):
            if item in ['python-embed', 'python-embed.hash']:
                continue
            item_path = os.path.join(build_dir, item)
            try:
                if os.path.isdir(item_path):
                    shutil.rmtree(item_path, ignore_errors=True)
                else:
                    os.remove(item_path)
            except Exception as e:
                print_warn(f"Failed to remove {item_path}: {e}")

    # Auto-create / refresh python-embed.
    #
    # Two invalidation gates — BOTH had to be added (2026-04-16) because
    # the original "only rebuild if dir missing" check turned every
    # EMBED_DEPS edit into a silent no-op: the `regex` pin landed in
    # deps.py (commits 481f25a, 31e480e, 0c6274f) but the stale snapshot
    # from an earlier build kept being reused, so every Indic Parler
    # load failed with `ModuleNotFoundError: No module named 'regex'`.
    #
    #   Gate A (hash): compare compute_embed_deps_hash() against the
    #   hash stored in python-embed.hash — mismatch triggers a full
    #   rebuild.  Any addition / removal / version bump in EMBED_DEPS
    #   flips the hash.
    #
    #   Gate B (presence): even on hash match, verify every package
    #   has a directory under site-packages and top-up any missing
    #   ones.  Survives the case where someone slimmed the snapshot
    #   manually or a prior build's slim step deleted too much.
    from deps import compute_embed_deps_hash, get_embed_install_list, missing_embed_packages
    embed_src = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'python-embed')
    hash_file = embed_src + '.hash'
    current_hash = compute_embed_deps_hash()
    stored_hash = None
    if os.path.isfile(hash_file):
        try:
            with open(hash_file, encoding='utf-8') as _hf:
                stored_hash = _hf.read().strip()
        except OSError:
            stored_hash = None

    _needs_full_rebuild = (
        not os.path.isdir(embed_src)
        or not os.listdir(embed_src)
        or stored_hash != current_hash
    )
    rebuild_script = os.path.join('scripts', 'rebuild_python_embed.py')

    if _needs_full_rebuild:
        _reason = ('missing' if not os.path.isdir(embed_src) or not os.listdir(embed_src)
                    else f'EMBED_DEPS hash changed ({stored_hash} -> {current_hash})')
        print_header(f"Rebuilding python-embed ({_reason})")
        if os.path.isfile(rebuild_script):
            if run_command([python_exe, rebuild_script],
                            "Building python-embed from scratch..."):
                # Stamp the new hash so subsequent builds skip the rebuild
                try:
                    with open(hash_file, 'w', encoding='utf-8') as _hf:
                        _hf.write(current_hash)
                    print_info(f"Wrote python-embed.hash = {current_hash}")
                except OSError as _e:
                    print_warn(f"Failed to write {hash_file}: {_e}")
            else:
                print_warn("python-embed creation failed — TTS/STT/VLM features will be unavailable")
                print_warn("You can run 'python scripts/rebuild_python_embed.py' manually later")
        else:
            print_warn("rebuild_python_embed.py not found — skipping python-embed")
    else:
        print_info(f"python-embed exists and hash matches ({embed_src}, {current_hash})")

    # Gate B — presence check for each EMBED_DEPS package.  Fires even
    # when the hash matched, because a slim step or manual edit can
    # remove a directory without bumping the hash.  Top up just the
    # missing packages via an incremental pip install — no full rebuild.
    _embed_sp = os.path.join(embed_src, 'Lib', 'site-packages')
    if os.path.isdir(_embed_sp):
        _missing = missing_embed_packages(_embed_sp)
        if _missing:
            print_header(f"Topping up {len(_missing)} missing embed package(s): {_missing}")
            # Resolve pinned specs for just the missing names
            _all_specs = get_embed_install_list(include_torch=True)
            _by_name = {spec.split('==', 1)[0].lower(): spec for spec in _all_specs}
            _missing_specs = [_by_name[n.lower()] for n in _missing if n.lower() in _by_name]
            if _missing_specs:
                _embed_py = os.path.join(embed_src, 'python.exe' if sys.platform == 'win32' else 'bin/python')
                if os.path.isfile(_embed_py):
                    run_command(
                        [_embed_py, '-m', 'pip', 'install', *_missing_specs,
                         '--no-warn-script-location', '--no-deps'],
                        "Installing missing embed packages",
                    )

    print_header("Building Nunba executable with cx_Freeze")

    # Purge all __pycache__ dirs and stale .pyc files before cx_Freeze.
    # cx_Freeze reads source .py files directly and compiles them into
    # lib/*.pyc. If stale __pycache__/*.pyc exist from a previous build
    # or IDE run, cx_Freeze may pick those up instead of the latest source.
    # Also removes the previous build output to prevent stale .pyc carry-over.
    print_info("Purging __pycache__ and stale .pyc to ensure fresh compilation...")
    _purged = 0
    for _purge_root in ['.', os.path.join('..', 'HARTOS')]:
        if os.path.isdir(_purge_root):
            for _root, _dirs, _files in os.walk(_purge_root):
                if '__pycache__' in _dirs:
                    _pc = os.path.join(_root, '__pycache__')
                    shutil.rmtree(_pc, ignore_errors=True)
                    _purged += 1
                    _dirs.remove('__pycache__')
    # Remove ENTIRE previous build output — not just lib/.
    # Any leftover .pyc, .py, or __pycache__ in build/Nunba/ can shadow fresh sources.
    if os.path.isdir(os.path.join('build', 'Nunba')):
        shutil.rmtree(os.path.join('build', 'Nunba'), ignore_errors=True)
        print_info("Removed previous build/Nunba/ entirely to prevent ANY stale carry-over")
    # Also purge python-embed __pycache__ in the SOURCE copy (not build/)
    embed_src = os.path.join('python-embed')
    if os.path.isdir(embed_src):
        for _root, _dirs, _files in os.walk(embed_src):
            if '__pycache__' in _dirs:
                _pc = os.path.join(_root, '__pycache__')
                shutil.rmtree(_pc, ignore_errors=True)
                _purged += 1
                _dirs.remove('__pycache__')
    print_info(f"Purged {_purged} __pycache__ directories")

    # Run cx_Freeze
    if not run_command([python_exe, os.path.join('scripts', 'setup_freeze_nunba.py'), 'build'],
                       "Running cx_Freeze..."):
        print_error("cx_Freeze build failed!")
        return False

    # Verify executable was created
    exe_path = os.path.join('build', 'Nunba', 'Nunba.exe')
    if not os.path.exists(exe_path):
        print_error(f"Nunba.exe was not created at {exe_path}")
        return False

    print_info(f"Build successful: {exe_path}")

    # Record build provenance: write the current git HEAD sha into
    # build/Nunba/BUILD_INFO.txt so a stale/reused build dir can be
    # detected (compare stored sha vs `git rev-parse HEAD`).  Without
    # this, the installer that ships out of build/ cannot be traced
    # to a specific source commit (see 2026-04-16 session: a Nunba.exe
    # built 24 minutes before a critical fix shipped and the stale
    # binary hid the fix for hours).
    try:
        import datetime as _bi_dt
        _head = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            capture_output=True, text=True, check=False,
        ).stdout.strip() or 'unknown'
        _bi_path = os.path.join('build', 'Nunba', 'BUILD_INFO.txt')
        with open(_bi_path, 'w', encoding='utf-8') as _bi:
            _bi.write(f"BUILD_SHA={_head}\n")
            _bi.write(f"BUILD_TIME={_bi_dt.datetime.utcnow().isoformat(timespec='seconds')}Z\n")
            _bi.write(f"BUILD_PLATFORM={sys.platform}\n")
        print_info(f"Wrote {_bi_path} (sha={_head[:12]})")
    except Exception as _bi_err:
        print_warn(f"Could not write BUILD_INFO.txt: {_bi_err}")

    # -- Sync HARTOS source into python-embed --
    # The source python-embed/ is a snapshot that may contain stale HARTOS
    # files from a previous build. cx_Freeze copies modules via include_files
    # but the post-build copytree from python-embed/ can overwrite them.
    # This step ensures both the source python-embed/ AND the build output
    # always have the latest HARTOS files from the sibling source directory.
    _hartos_src = _find_local_hartos_backend()
    if _hartos_src:
        _embed_sp = os.path.join(embed_src, 'Lib', 'site-packages')
        _build_sp = os.path.join('build', 'Nunba', 'python-embed', 'Lib', 'site-packages')
        _synced = 0

        # Sync top-level HARTOS .py modules (hart_intelligence_entry.py, create_recipe.py, etc.)
        for _fname in os.listdir(_hartos_src):
            if _fname.endswith('.py') and not _fname.startswith(('setup', 'embedded_main', 'conftest')):
                _src_file = os.path.join(_hartos_src, _fname)
                for _dst_dir in [_embed_sp, _build_sp]:
                    if os.path.isdir(_dst_dir):
                        _dst_file = os.path.join(_dst_dir, _fname)
                        if os.path.exists(_dst_file):
                            # Only copy if source is newer or different size
                            _src_size = os.path.getsize(_src_file)
                            _dst_size = os.path.getsize(_dst_file)
                            if _src_size != _dst_size:
                                shutil.copy2(_src_file, _dst_file)
                                _synced += 1

        # Sync HARTOS packages (integrations/, core/, security/, agent-ledger)
        for _pkg_name in ['integrations', 'core', 'security']:
            _pkg_src = os.path.join(_hartos_src, _pkg_name)
            if os.path.isdir(_pkg_src):
                for _dst_dir in [_embed_sp, _build_sp]:
                    _pkg_dst = os.path.join(_dst_dir, _pkg_name)
                    if os.path.isdir(_pkg_dst):
                        # Walk source and copy changed files
                        for _root, _dirs, _files in os.walk(_pkg_src):
                            for _f in _files:
                                if _f.endswith('.py'):
                                    _rel = os.path.relpath(os.path.join(_root, _f), _pkg_src)
                                    _s = os.path.join(_root, _f)
                                    _d = os.path.join(_pkg_dst, _rel)
                                    if os.path.exists(_d):
                                        if os.path.getsize(_s) != os.path.getsize(_d):
                                            os.makedirs(os.path.dirname(_d), exist_ok=True)
                                            shutil.copy2(_s, _d)
                                            _synced += 1
                                    else:
                                        # New file — copy it
                                        os.makedirs(os.path.dirname(_d), exist_ok=True)
                                        shutil.copy2(_s, _d)
                                        _synced += 1

        if _synced:
            print_info(f"Synced {_synced} HARTOS file(s) into python-embed (source -> build)")
        else:
            print_info("HARTOS files in python-embed are up to date")

    # Strip HevolveAI source from python-embed (proprietary — .pyc only)
    _compile_script = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    '..', '..', 'HARTOS', 'scripts', 'compile_hevolveai.py')
    if os.path.isfile(_compile_script):
        _hv_sp = os.path.join('build', 'Nunba', 'python-embed', 'Lib', 'site-packages')
        _hv_dir = os.path.join(_hv_sp, 'hevolveai')
        if os.path.isdir(_hv_dir):
            print_info("Stripping HevolveAI source (proprietary)...")
            run_command([python_exe, _compile_script, '--strip-source',
                        '--output-dir', _hv_dir],
                       "Compiling HevolveAI .py to .pyc...")
        else:
            print_info("HevolveAI not in python-embed — skipping source strip")
    else:
        print_info("HARTOS compile script not found — HevolveAI source strip skipped")

    # ── Build-time patch for transformers __init__.py ──────────────────
    # transformers 5.x uses `import_structure[frozenset({})].update(...)`
    # which crashes under cx_Freeze because dict-key resolution for
    # `frozenset({})` doesn't match at frozen-module import time.
    # Previous approach: rewrite the file at runtime on every boot
    # (app.py:648) — caused Defender-scan contention, needed a sentinel
    # to be idempotent.  Proper fix: patch it ONCE during build so the
    # runtime never touches the file.
    def _patch_transformers_at_build():
        """Patch transformers/__init__.py atomically.  A mid-write ENOSPC
        on `open('w')` + `f.write` leaves the file truncated/zero-byte
        and bricks every future boot with ImportError.  Mitigation: write
        to `.tmp` then `os.replace` (atomic on both POSIX and Win32).
        The original bytes remain in-memory as `_src`; if replace fails
        we restore from memory before raising."""
        _bad_line = 'import_structure[frozenset({})].update(_import_structure)'
        _fixed_line = (
            'import_structure.setdefault(frozenset({}), {})'
            '.update(_import_structure)'
        )
        _patched_any = False
        for _sp_candidate in [
            os.path.join('build', 'Nunba', 'python-embed', 'Lib', 'site-packages'),
            os.path.join('python-embed', 'Lib', 'site-packages'),
        ]:
            _tf_init = os.path.join(_sp_candidate, 'transformers', '__init__.py')
            if not os.path.isfile(_tf_init):
                continue
            try:
                with open(_tf_init, encoding='utf-8') as _f:
                    _src = _f.read()
                if _bad_line not in _src:
                    continue  # already patched or not the vulnerable line
                _patched = _src.replace(_bad_line, _fixed_line)
                _tmp_path = _tf_init + '.nunba-patch.tmp'
                # Write tmp file with explicit fsync so the bytes hit
                # disk before os.replace — crash-safety across ENOSPC.
                try:
                    with open(_tmp_path, 'w', encoding='utf-8') as _tf:
                        _tf.write(_patched)
                        _tf.flush()
                        try:
                            os.fsync(_tf.fileno())
                        except OSError:
                            pass
                    os.replace(_tmp_path, _tf_init)
                    # Log pre/post hashes for build reproducibility
                    import hashlib as _hl
                    _pre_h = _hl.sha256(_src.encode('utf-8')).hexdigest()[:12]
                    _post_h = _hl.sha256(_patched.encode('utf-8')).hexdigest()[:12]
                    print_info(
                        f"Patched transformers __init__ at {_tf_init} "
                        f"(sha256 {_pre_h} -> {_post_h})",
                    )
                    _patched_any = True
                except OSError as _we:
                    # Write failed — try to clean up the tmp file.  The
                    # original _tf_init is still untouched (os.replace
                    # hadn't run yet), so the build remains recoverable.
                    try:
                        if os.path.isfile(_tmp_path):
                            os.remove(_tmp_path)
                    except OSError:
                        pass
                    print_info(
                        f"Could not atomically patch {_tf_init}: {_we} — "
                        "original untouched, boot will retry via runtime",
                    )
            except OSError as _pe:
                print_info(f"Could not read {_tf_init}: {_pe}")
        if not _patched_any:
            print_info(
                "transformers __init__ already patched (or not found) — "
                "no build-time change needed",
            )
    _patch_transformers_at_build()

    # Slim python-embed (remove pip, setuptools, tests, etc.)
    slim_python_embed()

    # ── Post-build: extract missing stdlib modules from python312.zip ──
    # cx_Freeze's lib/ often misses stdlib modules that GPU TTS backends
    # need at runtime (unittest, email.mime.application, fileinput, etc.).
    # Extract any .pyc from python312.zip that isn't already in lib/.
    _zip_path = os.path.join('build', 'Nunba', 'python-embed', 'python312.zip')
    _lib_dir = os.path.join('build', 'Nunba', 'lib')
    if os.path.isfile(_zip_path) and os.path.isdir(_lib_dir):
        import zipfile
        _extracted = 0
        with zipfile.ZipFile(_zip_path) as _zf:
            for _zname in _zf.namelist():
                if _zname.endswith('.pyc'):
                    _dst = os.path.join(_lib_dir, _zname)
                    if not os.path.exists(_dst):
                        os.makedirs(os.path.dirname(_dst), exist_ok=True)
                        with open(_dst, 'wb') as _f:
                            _f.write(_zf.read(_zname))
                        _extracted += 1
        if _extracted:
            print_info(f"Extracted {_extracted} missing stdlib .pyc from python312.zip to lib/")

    # ── Acceptance gate — HARD-FAIL by default (2026-04-19 restore) ─
    # Runs Nunba.exe --acceptance-test to verify Stage-A/Stage-B fixes
    # survived the freeze.  Three modes:
    #
    #   Default (STRICT): runs with 180s timeout; failure/timeout →
    #            returns False, installer packaging blocked.  This is
    #            the restored pre-regression behavior — a build that
    #            can't boot its own verify subprocess is NOT shippable.
    #            The 240s-cold-boot stall that motivated downgrading
    #            this to warn-only (see commit 5dec11da) has been
    #            fixed in the 2026-04-19 deferred-init refactor, so
    #            strict is safe again.
    #
    #   NUNBA_SKIP_ACCEPTANCE=1 or --skip-acceptance: entire block is
    #            bypassed (INFO log, no subprocess spawn).  Intended for
    #            rapid local iteration when the tester already knows
    #            the bundle boots.  `build.bat` prepends this flag by
    #            default for dev-loop ergonomics.  CI workflows must
    #            NOT set this — CI's whole job is to catch what local
    #            devs might skip.
    #
    #   NUNBA_WARN_ACCEPTANCE=1 or --warn-acceptance: downgrade failures
    #            to warnings (the old default).  Use only as a temporary
    #            escape hatch while debugging a flaky verify step —
    #            NOT a long-term mode, since it masks real regressions.
    _skip_acc = (
        os.environ.get('NUNBA_SKIP_ACCEPTANCE', '').strip().lower()
        in ('1', 'true', 'yes')
    )
    # Strict is now the DEFAULT.  Only flip to warn-only when the
    # operator explicitly opts in via --warn-acceptance / env.
    _warn_acc = (
        os.environ.get('NUNBA_WARN_ACCEPTANCE', '').strip().lower()
        in ('1', 'true', 'yes')
    )
    _strict_acc = not _warn_acc
    _built_exe = os.path.join('build', 'Nunba', 'Nunba.exe')
    if _skip_acc:
        print_info(
            "Acceptance test SKIPPED (NUNBA_SKIP_ACCEPTANCE set). "
            "Bundle at build/Nunba/Nunba.exe was NOT verified — do "
            "not ship without re-running with acceptance enabled."
        )
    elif os.path.isfile(_built_exe):
        print_header("Acceptance test — verifying built bundle (optional)")
        # Tee the subprocess stdout+stderr LIVE to
        # ~/Documents/Nunba/logs/build_acceptance.log so the operator
        # can `tail -f` it and see exactly which check is wedged even
        # when --acceptance-test itself emits nothing to its own log
        # (the langchain-fix infinite-loop symptom, 2026-04-19).
        _acc_log = _nunba_build_log_path('build_acceptance.log')
        print_info(f"Live log: {_acc_log}   (tail -f to watch progress)")
        _ac_ok = _tee_subprocess_to_log(
            [_built_exe, '--acceptance-test'],
            log_path=_acc_log,
            description="Running Nunba --acceptance-test (180s timeout)...",
            timeout_s=180,
        )
        if not _ac_ok:
            if _strict_acc:
                print_error(
                    "Acceptance test FAILED (strict mode — the default as "
                    "of 2026-04-19).  Installer packaging BLOCKED.  See "
                    f"{_acc_log} for the tee'd subprocess output.  To "
                    "unblock temporarily (NOT for CI), rerun with "
                    "--warn-acceptance or set NUNBA_WARN_ACCEPTANCE=1."
                )
                return False
            print_warn(
                "Acceptance test FAILED or TIMED OUT — continuing "
                "because NUNBA_WARN_ACCEPTANCE is set.  This masks a "
                "real boot regression; investigate before shipping."
            )
        else:
            print_info("Acceptance test PASSED")
    else:
        print_warn(
            f"Nunba.exe not found at {_built_exe} — acceptance test skipped. "
            "cx_Freeze build likely failed earlier."
        )

    if app_only:
        return True

    return _build_windows_installer(python_exe)


def _build_windows_installer(python_exe):
    """Build Windows installer with Inno Setup (assumes exe already built)"""
    # Verify exe exists
    exe_path = os.path.join('build', 'Nunba', 'Nunba.exe')
    if not os.path.exists(exe_path):
        print_error(f"Nunba.exe not found at {exe_path}. Run 'python build.py app' first.")
        return False

    # Ensure WebView2 bootstrapper is present (required for installer)
    if not ensure_webview2_bootstrapper():
        print_error("WebView2 bootstrapper required for installer")
        return False

    # Build installer with Inno Setup
    print_header("Creating installer with Inno Setup")

    # Find Inno Setup
    iscc_paths = [
        os.path.join(os.environ.get('ProgramFiles(x86)', ''), 'Inno Setup 6', 'ISCC.exe'),
        os.path.join(os.environ.get('ProgramFiles', ''), 'Inno Setup 6', 'ISCC.exe'),
        os.path.join(os.environ.get('ProgramFiles(x86)', ''), 'Inno Setup 5', 'ISCC.exe'),
    ]

    iscc = None
    for path in iscc_paths:
        if os.path.exists(path):
            iscc = path
            break

    if not iscc:
        print_error("Inno Setup Compiler (ISCC.exe) not found!")
        print_info("Please install Inno Setup from https://jrsoftware.org/isinfo.php")
        print_info("Then re-run: python build.py installer")
        return False

    print_info(f"Using Inno Setup: {iscc}")

    if not run_command([iscc, os.path.join('scripts', 'Nunba_Installer.iss')], "Compiling installer..."):
        print_error("Inno Setup compilation failed!")
        return False

    installer_path = os.path.join('Output', 'Nunba_Setup.exe')
    if not os.path.exists(installer_path):
        print_error(f"Installer was not created at {installer_path}")
        return False

    print_info(f"Installer created: {installer_path}")
    return True


def build_macos(python_exe, app_only=False, installer_only=False):
    """Build on macOS"""
    app_path = os.path.join('build', 'Nunba.app')

    if not installer_only:
        # Clean previous build before rebuilding
        if os.path.isdir(app_path):
            print_info("Removing previous build...")
            shutil.rmtree(app_path, ignore_errors=True)

        print_header("Building Nunba.app with cx_Freeze")

        # Run cx_Freeze
        if not run_command([python_exe, os.path.join('scripts', 'setup_freeze_mac.py'), 'build'],
                           "Running cx_Freeze..."):
            print_error("cx_Freeze build failed!")
            return False

        # Verify app was created
        if not os.path.isdir(app_path):
            print_error(f"Nunba.app was not created at {app_path}")
            return False

        # Make executable runnable
        exe_path = os.path.join(app_path, 'Contents', 'MacOS', 'Nunba')
        if os.path.exists(exe_path):
            os.chmod(exe_path, 0o755)

        # -- Copy tcl/tk scripts to Contents/Resources/share/ --
        # cx_Freeze puts tcl/tk in Contents/MacOS/share/ but _tkinter looks in
        # Contents/Resources/share/ on macOS.  Copy so tkinter finds init.tcl.
        _macos_share = os.path.join(app_path, 'Contents', 'MacOS', 'share')
        _resources_share = os.path.join(app_path, 'Contents', 'Resources', 'share')
        if os.path.isdir(_macos_share) and not os.path.isdir(_resources_share):
            shutil.copytree(_macos_share, _resources_share)
            print_info("Copied tcl/tk scripts to Contents/Resources/share/")

        # -- Thin universal binaries to arm64 on Apple Silicon --
        # cx_Freeze bundles a universal Python executable but .so extensions are
        # arm64-only.  If the OS picks the x86_64 slice the .so files fail to
        # load.  Thinning both the launcher and libPython forces arm64.
        import platform as _plat
        import tempfile
        if _plat.machine() == 'arm64' and shutil.which('lipo'):
            _python_lib = os.path.join(app_path, 'Contents', 'MacOS', 'lib', 'Python')
            for _bin in [exe_path, _python_lib]:
                if not os.path.exists(_bin):
                    continue
                try:
                    _arch_out = subprocess.check_output(['lipo', '-archs', _bin], text=True).strip()
                    if 'x86_64' in _arch_out and 'arm64' in _arch_out:
                        _tmp = os.path.join(tempfile.gettempdir(), os.path.basename(_bin) + '.arm64')
                        subprocess.run(['lipo', _bin, '-thin', 'arm64', '-output', _tmp], check=True)
                        # Sign in temp location (avoids codesign treating it as bundle root)
                        subprocess.run(['codesign', '--force', '--sign', '-', _tmp], check=True)
                        os.replace(_tmp, _bin)
                        os.chmod(_bin, 0o755)
                        print_info(f"Thinned to arm64 + re-signed: {os.path.basename(_bin)}")
                except Exception as _e:
                    print_warn(f"lipo thin failed for {os.path.basename(_bin)}: {_e}")

        print_info(f"Build successful: {app_path}")

        if app_only:
            return True

    # Build DMG installer
    print_header("Creating DMG installer")

    dmg_name = 'Nunba_Setup.dmg'
    os.makedirs('Output', exist_ok=True)

    # Remove old DMG
    output_dmg = os.path.join('Output', dmg_name)
    if os.path.exists(output_dmg):
        os.remove(output_dmg)

    # Try create-dmg first (if installed via brew)
    try:
        result = subprocess.run(['which', 'create-dmg'], capture_output=True, text=True)
        if result.returncode == 0:
            print_info("Using create-dmg...")
            cmd = [
                'create-dmg',
                '--volname', 'Nunba',
                '--window-pos', '200', '120',
                '--window-size', '600', '400',
                '--icon-size', '100',
                '--icon', 'Nunba.app', '150', '190',
                '--app-drop-link', '450', '190',
                '--hide-extension', 'Nunba.app',
                '--no-internet-enable',  # prevents hdiutil internet-enable which fails on CI
                output_dmg,
                app_path
            ]
            if run_command(cmd, "Creating DMG with create-dmg...", check=False):
                if os.path.exists(output_dmg):
                    print_info(f"DMG created: {output_dmg}")
                    return True
    except Exception:
        pass

    # Fallback to hdiutil
    print_info("Using hdiutil...")
    dmg_temp = 'dmg_temp'
    if os.path.exists(dmg_temp):
        shutil.rmtree(dmg_temp)
    os.makedirs(dmg_temp)

    # Copy app to temp
    shutil.copytree(app_path, os.path.join(dmg_temp, 'Nunba.app'))

    # Create Applications symlink
    os.symlink('/Applications', os.path.join(dmg_temp, 'Applications'))

    # Create DMG
    cmd = [
        'hdiutil', 'create',
        '-volname', 'Nunba',
        '-srcfolder', dmg_temp,
        '-ov', '-format', 'UDZO',
        output_dmg
    ]

    success = run_command(cmd, "Creating DMG with hdiutil...")

    # Cleanup
    shutil.rmtree(dmg_temp, ignore_errors=True)

    if success and os.path.exists(output_dmg):
        print_info(f"DMG created: {output_dmg}")
        return True

    print_error("DMG creation failed!")
    return False


def sign_macos():
    """Sign and notarize macOS app (requires Apple Developer ID)"""
    print_header("Signing and Notarizing")

    app_path = os.path.join('build', 'Nunba.app')
    dmg_path = os.path.join('Output', 'Nunba_Setup.dmg')

    if not os.path.isdir(app_path):
        print_error("build/Nunba.app not found. Run 'python build.py app' first.")
        return False

    dev_id = os.environ.get('APPLE_DEVELOPER_ID')
    if not dev_id:
        print_warn("APPLE_DEVELOPER_ID not set. Skipping code signing.")
        print_info("To sign, set: export APPLE_DEVELOPER_ID='Developer ID Application: Your Name (TEAMID)'")
        return True

    print_info(f"Signing Nunba.app with: {dev_id}")

    # Create entitlements if missing
    entitlements = 'entitlements.plist'
    if not os.path.exists(entitlements):
        with open(entitlements, 'w') as f:
            f.write('''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.automation.apple-events</key>
    <true/>
</dict>
</plist>''')

    # Sign the app
    if not run_command(
        ['codesign', '--force', '--deep', '--sign', dev_id,
         '--options', 'runtime', '--entitlements', entitlements, app_path],
        "Signing app bundle...", check=False
    ):
        print_error("Code signing failed!")
        return False

    print_info("App signed successfully.")

    # Re-create DMG with the now-signed .app inside, then sign the DMG itself.
    # The previous DMG (from build.py full) contained the unsigned .app.
    print_info("Re-creating DMG with signed .app...")
    output_dmg = dmg_path
    if os.path.exists(output_dmg):
        os.remove(output_dmg)
    os.makedirs(os.path.dirname(output_dmg), exist_ok=True)
    _dmg_created = False
    try:
        result = subprocess.run(['which', 'create-dmg'], capture_output=True, text=True)
        if result.returncode == 0:
            cmd = [
                'create-dmg',
                '--volname', 'Nunba',
                '--window-pos', '200', '120',
                '--window-size', '600', '400',
                '--icon-size', '100',
                '--icon', 'Nunba.app', '150', '190',
                '--app-drop-link', '450', '190',
                '--hide-extension', 'Nunba.app',
                '--no-internet-enable',  # prevents hdiutil internet-enable which fails on CI
                output_dmg,
                app_path
            ]
            if run_command(cmd, "Creating DMG with create-dmg...", check=False):
                _dmg_created = os.path.exists(output_dmg)
    except Exception:
        pass
    if not _dmg_created:
        # Fallback to hdiutil
        import tempfile
        _dmg_temp = tempfile.mkdtemp(prefix='nunba_dmg_')
        import shutil as _sh
        _sh.copytree(app_path, os.path.join(_dmg_temp, 'Nunba.app'))
        os.symlink('/Applications', os.path.join(_dmg_temp, 'Applications'))
        run_command(
            ['hdiutil', 'create', '-volname', 'Nunba', '-srcfolder', _dmg_temp,
             '-ov', '-format', 'UDZO', output_dmg],
            "Creating DMG with hdiutil...", check=False
        )
        _sh.rmtree(_dmg_temp, ignore_errors=True)
        _dmg_created = os.path.exists(output_dmg)

    # Sign DMG if present
    if os.path.exists(dmg_path):
        run_command(
            ['codesign', '--force', '--sign', dev_id, dmg_path],
            "Signing DMG...", check=False
        )

    # Notarize if credentials are available
    apple_id = os.environ.get('APPLE_ID')
    apple_pw = os.environ.get('APPLE_APP_PASSWORD')
    team_id = os.environ.get('APPLE_TEAM_ID')

    if apple_id and apple_pw and team_id and os.path.exists(dmg_path):
        print_info("Notarizing app...")
        if run_command(
            ['xcrun', 'notarytool', 'submit', dmg_path,
             '--apple-id', apple_id, '--password', apple_pw,
             '--team-id', team_id, '--wait'],
            "Submitting for notarization...", check=False
        ):
            run_command(
                ['xcrun', 'stapler', 'staple', dmg_path],
                "Stapling notarization ticket...", check=False
            )
            print_info("Notarization complete.")
        else:
            print_warn("Notarization failed.")
    else:
        print_info("Notarization credentials not set. Skipping.")

    return True


def build_linux(python_exe, app_only=False, installer_only=False):
    """Build on Linux (cx_Freeze + AppImage)

    Flow mirrors Windows: deps -> React build -> cx_Freeze -> package (AppImage).
    Uses setup_freeze_linux.py for the cx_Freeze step and build_appimage.sh for
    packaging into a self-contained AppImage.
    """
    if installer_only:
        # Skip cx_Freeze, jump straight to AppImage packaging
        return _build_linux_appimage(python_exe)

    # Clean previous build before rebuilding
    build_dir = os.path.join('build', 'Nunba')
    if os.path.exists(build_dir):
        print_info("Cleaning previous build (preserving python-embed if unchanged)...")
        for item in os.listdir(build_dir):
            if item in ['python-embed', 'python-embed.hash']:
                continue
            item_path = os.path.join(build_dir, item)
            try:
                if os.path.isdir(item_path):
                    shutil.rmtree(item_path, ignore_errors=True)
                else:
                    os.remove(item_path)
            except Exception as e:
                print_warn(f"Failed to remove {item_path}: {e}")

    print_header("Building Nunba executable with cx_Freeze (Linux)")

    # Run cx_Freeze with the Linux-specific freeze script
    if not run_command([python_exe, os.path.join('scripts', 'setup_freeze_linux.py'), 'build'],
                       "Running cx_Freeze (Linux)..."):
        print_error("cx_Freeze build failed!")
        return False

    # Verify executable was created
    exe_path = os.path.join('build', 'Nunba', 'Nunba')
    if not os.path.exists(exe_path):
        print_error(f"Nunba executable was not created at {exe_path}")
        return False

    # Ensure executable permission
    os.chmod(exe_path, 0o755)
    print_info(f"Build successful: {exe_path}")

    # Strip HevolveAI source from python-embed (proprietary -- .pyc only)
    _compile_script = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    '..', '..', 'HARTOS', 'scripts', 'compile_hevolveai.py')
    if os.path.isfile(_compile_script):
        _hv_sp = os.path.join('build', 'Nunba', 'python-embed', 'Lib', 'site-packages')
        # Also check Linux-style path
        if not os.path.isdir(_hv_sp):
            _pyver = f"python{sys.version_info.major}.{sys.version_info.minor}"
            _hv_sp = os.path.join('build', 'Nunba', 'python-embed', 'lib', _pyver, 'site-packages')
        _hv_dir = os.path.join(_hv_sp, 'hevolveai')
        if os.path.isdir(_hv_dir):
            print_info("Stripping HevolveAI source (proprietary)...")
            run_command([python_exe, _compile_script, '--strip-source',
                        '--output-dir', _hv_dir],
                       "Compiling HevolveAI .py -> .pyc...")
        else:
            print_info("HevolveAI not in python-embed -- skipping source strip")
    else:
        print_info("HARTOS compile script not found -- HevolveAI source strip skipped")

    # Slim python-embed
    slim_python_embed()

    if app_only:
        return True

    return _build_linux_appimage(python_exe)


def _build_linux_appimage(python_exe):
    """Package the cx_Freeze output into an AppImage.

    Calls build_appimage.sh which:
    1. Creates AppDir structure (usr/bin, usr/share/applications, icons)
    2. Copies cx_Freeze output into AppDir
    3. Generates AppRun launcher with LD_LIBRARY_PATH setup
    4. Runs appimagetool to produce a self-contained .AppImage
    """
    # Verify the cx_Freeze output exists
    exe_path = os.path.join('build', 'Nunba', 'Nunba')
    if not os.path.exists(exe_path):
        print_error(f"Nunba executable not found at {exe_path}. Run 'python build.py app' first.")
        return False

    print_header("Creating AppImage")

    appimage_script = os.path.join('scripts', 'build_appimage.sh')
    if not os.path.exists(appimage_script):
        print_error(f"AppImage build script not found: {appimage_script}")
        return False

    # Make the script executable
    os.chmod(appimage_script, 0o755)

    if not run_command(['bash', appimage_script, '--skip-freeze'],
                       "Packaging AppImage..."):
        print_error("AppImage packaging failed!")
        return False

    # Check if AppImage was created
    import glob as _glob
    appimages = _glob.glob(os.path.join('Output', 'Nunba-*.AppImage'))
    if appimages:
        latest = max(appimages, key=os.path.getmtime)
        print_info(f"AppImage created: {latest}")
        return True

    print_error("AppImage was not created in Output/")
    return False


def print_summary():
    """Print build summary"""
    print_header("BUILD COMPLETE")

    if IS_WINDOWS:
        exe_path = os.path.join('build', 'Nunba', 'Nunba.exe')
        installer_path = os.path.join('Output', 'Nunba_Setup.exe')

        if os.path.exists(exe_path):
            size = os.path.getsize(exe_path) // (1024 * 1024)
            print(f"  Executable: {exe_path}")
            print(f"  Size: ~{size} MB")

        if os.path.exists(installer_path):
            size = os.path.getsize(installer_path) // (1024 * 1024)
            print(f"  Installer:  {installer_path} ({size} MB)")

        print("=" * 60)
        print("\n  To test:    build\\Nunba\\Nunba.exe")
        print("  To install: Output\\Nunba_Setup.exe")

    elif IS_MACOS:
        app_path = os.path.join('build', 'Nunba.app')
        dmg_path = os.path.join('Output', 'Nunba_Setup.dmg')

        if os.path.isdir(app_path):
            # Get directory size
            total = 0
            for dirpath, dirnames, filenames in os.walk(app_path):
                for f in filenames:
                    fp = os.path.join(dirpath, f)
                    total += os.path.getsize(fp)
            size = total // (1024 * 1024)
            print(f"  Application: {app_path} ({size} MB)")

        if os.path.exists(dmg_path):
            size = os.path.getsize(dmg_path) // (1024 * 1024)
            print(f"  Installer:   {dmg_path} ({size} MB)")

        print("=" * 60)
        print("\n  To test:    open build/Nunba.app")
        print("  To install: open Output/Nunba_Setup.dmg")

    elif IS_LINUX:
        exe_path = os.path.join('build', 'Nunba', 'Nunba')

        if os.path.exists(exe_path):
            size = os.path.getsize(exe_path) // (1024 * 1024)
            print(f"  Executable: {exe_path}")
            print(f"  Size: ~{size} MB")

        # Find the AppImage
        import glob as _glob
        appimages = _glob.glob(os.path.join('Output', 'Nunba-*.AppImage'))
        if appimages:
            latest = max(appimages, key=os.path.getmtime)
            size = os.path.getsize(latest) // (1024 * 1024)
            print(f"  AppImage:   {latest} ({size} MB)")

        print("=" * 60)
        print("\n  To test:    ./build/Nunba/Nunba")
        if appimages:
            print("  To install: ./deploy/linux/install.sh")
        print("\n  Requirements: GTK 3.0, WebKit2GTK 4.0")


def main():
    parser = argparse.ArgumentParser(
        description='Nunba Desktop App Build Script',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument('mode', nargs='?', default='full',
                        choices=['full', 'app', 'installer', 'clean', 'sign'],
                        help='Build mode (default: full)')
    parser.add_argument('--platform', choices=['windows', 'macos', 'linux'],
                        help='Target platform (default: auto-detect)')
    parser.add_argument('--skip-deps', action='store_true',
                        help='Skip dependency installation')
    parser.add_argument('--skip-wizard', action='store_true',
                        help='Skip configuration wizard')
    parser.add_argument('--sentry-dsn', type=str, metavar='DSN',
                        help='Set Sentry DSN directly (non-interactive)')
    parser.add_argument('--skip-acceptance', action='store_true',
                        help='Skip the post-freeze acceptance-test subprocess '
                        'entirely.  Fastest for local dev iteration; build.bat '
                        'prepends this by default.  Do NOT use in CI.')
    parser.add_argument('--strict-acceptance', action='store_true',
                        help='[DEPRECATED — strict is now the DEFAULT as of '
                        '2026-04-19.]  Kept for backward compat with existing '
                        'invocations; has no additional effect.')
    parser.add_argument('--warn-acceptance', action='store_true',
                        help='Downgrade acceptance-test failures from HARD-FAIL '
                        'to WARN.  Temporary escape hatch while diagnosing a '
                        'flaky verify step; must NOT be used in CI or release '
                        'builds (it masks boot regressions).')

    args = parser.parse_args()

    # Plumb acceptance-gate flags to env vars so build_windows() can
    # read them without threading kwargs through every build function.
    # `--strict-acceptance` is deprecated (strict is now the default);
    # we keep the flag so existing invocations still parse but the
    # env var it used to set (NUNBA_STRICT_ACCEPTANCE) is no longer
    # read by build_windows().
    if args.skip_acceptance:
        os.environ['NUNBA_SKIP_ACCEPTANCE'] = '1'
    if args.warn_acceptance:
        os.environ['NUNBA_WARN_ACCEPTANCE'] = '1'
    if args.strict_acceptance:
        # No-op (strict is default) — log a one-line migration hint so
        # script callers know they can drop the flag.
        print_info(
            "--strict-acceptance is now a no-op (strict is the default "
            "as of 2026-04-19).  Safe to remove from invocations."
        )

    # Change to project directory (build.py lives in scripts/)
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(project_dir)

    print(f"\nNunba Desktop App Build Script v{VERSION}", flush=True)
    print(f"Platform: {plat.system()} {plat.machine()}\n", flush=True)

    # ── Pre-flight resource check ────────────────────────────────────
    # A mid-build `pip install hart-backend` with [Errno 28] No space
    # left on device or `WinError 1455 paging file too small` leaves
    # python-embed partially populated, site-packages corrupt, and the
    # installer in a non-reproducible state.  Fail loud *before* we
    # start, not 20 minutes in after eight wheels downloaded.
    if args.mode != 'clean':
        import shutil as _shutil_pf
        import tempfile as _tf_pf
        _free_gb_cwd = _shutil_pf.disk_usage(project_dir).free / (1 << 30)
        _free_gb_tmp = _shutil_pf.disk_usage(_tf_pf.gettempdir()).free / (1 << 30)
        # Real cost = CUDA torch wheel (2.5GB) + python-embed tree (1.5GB)
        # + cx_Freeze tree (3GB) + signed installer artifact (1GB) ≈ 8GB.
        # Add 2GB headroom for pip-build-env-* and partial-extraction
        # crashes.  The previous 2.5GB threshold was a regression that
        # let installs fail halfway through (witnessed 2026-04-21,
        # FreeSpace=4.3GB during a partial build that left python-embed
        # corrupt and required full rebuild).
        _MIN_DISK_GB = 7.0
        if _free_gb_cwd < _MIN_DISK_GB:
            sys.exit(
                f"[PREFLIGHT] Refusing to build: CWD drive has only "
                f"{_free_gb_cwd:.1f}GB free (need {_MIN_DISK_GB}GB). "
                f"Clear %TEMP%\\pip-* and ~/.cache/pip then retry.",
            )
        if _free_gb_tmp < _MIN_DISK_GB:
            sys.exit(
                f"[PREFLIGHT] Refusing to build: %TEMP% drive has only "
                f"{_free_gb_tmp:.1f}GB free (need {_MIN_DISK_GB}GB). "
                f"pip uses it for build isolation (pip-build-env-*).",
            )
        # RAM check — WinError 1455 paging file too small is a commit-
        # limit issue, not disk.  Require 8GB available committed.
        try:
            import psutil as _psutil_pf
            _avail_gb = _psutil_pf.virtual_memory().available / (1 << 30)
            if _avail_gb < 4:
                print(
                    f"[PREFLIGHT] Warning: only {_avail_gb:.1f}GB RAM "
                    f"available; git clone --filter and torch wheel "
                    f"build may OOM.  Recommend closing apps.",
                    flush=True,
                )
        except ImportError:
            pass  # psutil not installed — skip soft check
        # Stale pip-build-env cleanup — prevents cumulative %TEMP% bloat
        try:
            import glob as _glob_pf
            _stale = _glob_pf.glob(
                os.path.join(_tf_pf.gettempdir(), 'pip-build-env-*'),
            ) + _glob_pf.glob(
                os.path.join(_tf_pf.gettempdir(), 'pip-ephem-wheel-cache-*'),
            )
            _freed = 0
            for _d in _stale:
                try:
                    _shutil_pf.rmtree(_d, ignore_errors=True)
                    _freed += 1
                except Exception:
                    pass
            if _freed:
                print(
                    f"[PREFLIGHT] Cleared {_freed} stale pip-build-env dirs",
                    flush=True,
                )
        except Exception:
            pass

    # Clean mode
    if args.mode == 'clean':
        clean_build()
        return 0

    # Sign mode (macOS only)
    if args.mode == 'sign':
        if not IS_MACOS:
            print_error("Signing is only supported on macOS")
            return 1
        return 0 if sign_macos() else 1

    # Get Python executable (from venv if available)
    python_exe = activate_venv()

    # Install dependencies
    if not args.skip_deps and args.mode != 'installer':
        install_dependencies(python_exe)

    # Stamp VERSION into runtime files (desktop/config.py, crash_reporter.py)
    stamp_version()

    # Build React landing-page
    if not args.skip_deps and args.mode != 'installer':
        if not build_react_landing_page():
            print_error("Cannot proceed without a React build.")
            return 1

    # Run setup wizard for crash reporting configuration
    if not args.skip_wizard and args.mode != 'installer':
        run_setup_wizard(python_exe, args.sentry_dsn)

    # Determine target platform
    target = args.platform
    if not target:
        if IS_WINDOWS:
            target = 'windows'
        elif IS_MACOS:
            target = 'macos'
        else:
            target = 'linux'

    # Build
    app_only = args.mode == 'app'
    installer_only = args.mode == 'installer'

    success = False
    if target == 'windows':
        if not IS_WINDOWS:
            print_error("Windows builds must be done on Windows")
            return 1
        success = build_windows(python_exe, app_only, installer_only)
    elif target == 'macos':
        if not IS_MACOS:
            print_error("macOS builds must be done on macOS")
            return 1
        success = build_macos(python_exe, app_only, installer_only)
    elif target == 'linux':
        if not IS_LINUX:
            print_error("Linux builds must be done on Linux")
            return 1
        success = build_linux(python_exe, app_only, installer_only)

    if success:
        print_summary()
        return 0
    else:
        print_error("Build failed!")
        return 1


if __name__ == '__main__':
    sys.exit(main())
