"""
tts/package_installer.py - Runtime TTS package installer

Installs TTS Python packages into python-embed at runtime.
Three trigger points:
  1. Onboarding (ai_installer) — during setup wizard
  2. First TTS request — auto-install when engine selected but package missing
  3. Conversational — LLM tool or /tts/setup-engine endpoint

Packages are installed into python-embed/Lib/site-packages/ using pip.
CUDA torch swap is handled if GPU detected but torch+cpu is installed.

Progress is pushed to the chat view via broadcast_sse_event so the user
sees real-time download status.
"""
import importlib
import importlib.util
import logging
import os
import re
import subprocess
import sys
import threading
import time
from collections.abc import Callable
from pathlib import Path

logger = logging.getLogger('NunbaTTSInstaller')

# huggingface_hub 0.29+ removes is_offline_mode needed by transformers <5.x
# Re-exported from here for any caller that depends on the constant; the
# canonical pin lives in HARTOS's tts_router._HF_HUB_PIN now.
_HF_HUB_PIN = 'huggingface_hub>=0.27.0,<0.29.0'

# ─── Backend → pip packages needed (in install order) ──────────────────
#
# The actual install plan for each engine is OWNED BY HARTOS via
# TTSEngineSpec.pip_install_plan in
# integrations/channels/media/tts_router.py.  HARTOS already declares
# required_package + tool_module per engine; the install plan belongs
# alongside that knowledge so adding a new engine doesn't require
# parallel edits in two repos that drift.
#
# This module re-exports the same dict shape Nunba's existing callers
# expect ({backend_id: [pip_specs...]}), populated from HARTOS at
# import time, plus a thin name-alias layer for the two engines that
# Nunba historically called by different names (chatterbox_multilingual
# vs chatterbox_ml; f5 vs f5_tts) and the bundled-only engines that
# don't appear in HARTOS's registry (piper, luxtts).
#
# If the HARTOS import fails (cx_Freeze tracer edge case where the
# sibling repo isn't yet mounted), we fall back to the legacy hardcoded
# dict — the user-visible behaviour stays the same instead of erroring
# at module-load.

# Nunba-side aliases for legacy backend names (Nunba_id -> HARTOS_id).
# Drop entry if HARTOS gets renamed; add entry if Nunba's UI keeps
# calling an engine by an old name for back-compat.
_NUNBA_TO_HARTOS_BACKEND = {
    'chatterbox_multilingual': 'chatterbox_ml',
    'f5':                      'f5_tts',
}

# Backends Nunba ships bundled (piper voices in python-embed, luxtts
# in HARTOS image) — no pip install needed; keys must still appear in
# BACKEND_PACKAGES so callers iterating it see the full surface.
_BUNDLED_ONLY_BACKENDS = ('piper', 'luxtts')

# Legacy hardcoded plan — used as fallback ONLY when HARTOS import
# fails at module load.  The HARTOS-owned plan is the source of truth
# whenever the import succeeds (almost always).
_LEGACY_BACKEND_PACKAGES_FALLBACK = {
    'chatterbox_turbo':        [_HF_HUB_PIN, 'torchaudio', 'chatterbox-tts', 'librosa', 'soundfile'],
    'chatterbox_multilingual': [_HF_HUB_PIN, 'torchaudio', 'chatterbox-tts', 'librosa', 'soundfile'],
    'indic_parler':            [],
    'cosyvoice3':              [],
    'f5':                      ['torchaudio', 'f5-tts'],
    'piper':                   [],
    'kokoro':                  [_HF_HUB_PIN, 'kokoro', 'espeakng'],
    'luxtts':                  [],
    'pocket_tts':              ['pocket-tts'],
}


def _hartos_engine_registry() -> dict:
    """Single-call import of HARTOS's ENGINE_REGISTRY with a
    well-defined empty-dict fallback on import error.

    cx_Freeze can occasionally land Nunba into a state where
    integrations/* isn't yet on sys.path (build phase, partial install).
    The HARTOS-derived dicts below all degrade gracefully when this
    function returns {} — install paths use the legacy fallback dict,
    which keeps onboarding functional but drifts."""
    try:
        from integrations.channels.media.tts_router import ENGINE_REGISTRY
        return dict(ENGINE_REGISTRY)
    except Exception as exc:  # noqa: BLE001 — broad on purpose
        logger.warning(
            "HARTOS tts_router import failed; falling back to legacy "
            "engine dicts (engine drift risk). reason=%s", exc,
        )
        return {}


def _build_backend_packages_from_hartos() -> dict:
    """{backend_id: [pip_specs...]} for engines that install into the
    MAIN interpreter (install_target == 'main').

    Skips engines routed elsewhere (venv / bundled / cloud / git_clone)
    so a caller that does `pip install BACKEND_PACKAGES[backend]`
    against a venv'd engine doesn't accidentally contaminate the main
    interpreter with parler/chatterbox deps.

    Includes Nunba-side aliases (chatterbox_multilingual, f5) for
    legacy callers + the bundled-only entries (piper, luxtts) so the
    keyspace covers what every existing Nunba caller expects.

    Empty `[]` for venv / bundled / cloud / git_clone engines —
    callers iterating BACKEND_PACKAGES see them but get a no-op
    install plan, matching the prior Nunba behavior for indic_parler."""
    registry = _hartos_engine_registry()
    if not registry:
        return dict(_LEGACY_BACKEND_PACKAGES_FALLBACK)

    out: dict[str, list[str]] = {}
    for engine_id, spec in registry.items():
        target = getattr(spec, 'install_target', 'main')
        # Engines that DON'T install into the main interpreter still
        # appear here (with an empty plan) for keyspace compatibility
        # with existing Nunba callers iterating the dict.  The
        # install_backend_packages() router below uses install_target
        # to decide what install path to actually take.
        if target == 'main':
            out[engine_id] = list(spec.pip_install_plan)
        else:
            out[engine_id] = []

    for nunba_name, hartos_name in _NUNBA_TO_HARTOS_BACKEND.items():
        if hartos_name in out:
            out[nunba_name] = list(out[hartos_name])

    for engine_id in _BUNDLED_ONLY_BACKENDS:
        out.setdefault(engine_id, [])

    return out


def _build_backend_venv_packages_from_hartos() -> dict:
    """{backend_id: [pip_specs...]} for engines that install into their
    OWN private venv (install_target == 'venv').

    Mirrors HARTOS's TTSEngineSpec.pip_install_plan for venv engines,
    so the Nunba-side BACKEND_VENV_PACKAGES literal goes away and the
    install plan + venv-routing decision both live in HARTOS.

    Falls back to a hand-maintained dict (currently parler-only) when
    HARTOS isn't importable, same as BACKEND_PACKAGES does."""
    registry = _hartos_engine_registry()
    if not registry:
        # Hand-maintained venv plan as fallback.  Kept minimal — only
        # parler today, matching the prior Nunba state.
        return {
            'indic_parler': [
                'colorama>=0.4.6', 'tqdm>=4.65',
                'transformers==4.46.1',
                'torch', 'torchaudio',
                'sentencepiece', 'descript-audio-codec',
                'parler-tts==0.2.2', 'soundfile',
                _HF_HUB_PIN,
            ],
        }

    out: dict[str, list[str]] = {}
    for engine_id, spec in registry.items():
        target = getattr(spec, 'install_target', 'main')
        if target == 'venv':
            out[engine_id] = list(spec.pip_install_plan)
    return out


BACKEND_PACKAGES = _build_backend_packages_from_hartos()

# Backends routed into their OWN venv under ~/Documents/Nunba/data/venvs/
# (see tts/backend_venv.py).  Each venv's dep set is independent and may
# pin conflicting transformers / torch versions without contaminating
# the main interpreter or each other.
#
# Source of truth lives in HARTOS — TTSEngineSpec.install_target='venv'
# selects an engine for venv routing, and TTSEngineSpec.pip_install_plan
# is the plan that lands in the venv.  This dict is now derived state.
#
# Today only `indic_parler` qualifies (parler-tts 0.2.2 hard-pins
# transformers<4.47, conflicts with main's 5.1.0).  Migrating
# chatterbox / cosyvoice / f5 / kokoro / omnivoice into their own
# venvs is a follow-up task per engine — flip install_target='venv'
# in HARTOS *only after* the matching tts/<engine>_worker.py file
# lands in Nunba (mirroring tts/indic_parler_worker.py), otherwise
# the synth dispatch can't reach the engine inside its venv.
BACKEND_VENV_PACKAGES = _build_backend_venv_packages_from_hartos()


def get_install_target(backend: str) -> str:
    """Return the install_target string ('main' | 'venv' | 'bundled' |
    'cloud' | 'git_clone') HARTOS declares for this backend.

    Defaults to 'main' if the engine isn't in HARTOS's ENGINE_REGISTRY
    (matches the dataclass default; preserves Nunba's prior behavior
    for any legacy backend ID a caller might still address)."""
    registry = _hartos_engine_registry()
    spec = registry.get(backend)
    if spec is None:
        # Resolve through Nunba alias map before giving up (e.g.
        # 'chatterbox_multilingual' -> 'chatterbox_ml').
        canonical = _NUNBA_TO_HARTOS_BACKEND.get(backend)
        if canonical:
            spec = registry.get(canonical)
    return getattr(spec, 'install_target', 'main') if spec is not None else 'main'

# pip package name → import name (for verification)
_PIP_TO_IMPORT = {
    'chatterbox-tts': 'chatterbox',
    'parler-tts': 'parler_tts',
    'f5-tts': 'f5_tts',
    'torchaudio': 'torchaudio',
    'descript-audio-codec': 'dac',
    'descript-audiotools': 'audiotools',
    'tensorboard': 'tensorboard',
    'kokoro': 'kokoro',
    'espeakng': 'espeakng',
    'pocket-tts': 'pocket_tts',
}

# Human-readable names for progress messages.  Must cover the full
# keyspace of BACKEND_PACKAGES (which now includes HARTOS-canonical
# names like chatterbox_ml + f5_tts + omnivoice + espeak + makeittalk
# in addition to Nunba's legacy keys), enforced by
# TestConstants.test_display_names_match_backends.
BACKEND_DISPLAY_NAMES = {
    # Legacy Nunba names (kept for the UI surface)
    'chatterbox_turbo':        'Chatterbox Turbo (English, expressive)',
    'chatterbox_multilingual': 'Chatterbox Multilingual (23 languages)',
    'indic_parler':            'Indic Parler TTS (21 Indian languages + English)',
    'cosyvoice3':              'CosyVoice3 (9 international languages)',
    'f5':                      'F5-TTS (voice cloning)',
    'piper':                   'Piper TTS (CPU fallback)',
    'kokoro':                  'Kokoro 82M (CPU/GPU, multilingual)',
    'luxtts':                  'LuxTTS (CPU, English voice-clone)',
    'pocket_tts':              'Pocket TTS (CPU, English voice-clone)',
    # HARTOS-canonical names exposed via BACKEND_PACKAGES — same
    # display strings as their Nunba aliases so users see one name
    # whichever entry-point the request hits.
    'chatterbox_ml':           'Chatterbox Multilingual (23 languages)',
    'f5_tts':                  'F5-TTS (voice cloning)',
    'omnivoice':               'OmniVoice (646 languages, voice clone)',
    'espeak':                  'eSpeak NG (CPU last-resort fallback)',
    'makeittalk':              'MakeItTalk (cloud, English)',
}

# Lock to prevent concurrent installs (in-process)
_install_lock = threading.Lock()
_installing = {}  # backend → True while installing

# File-based lock to prevent concurrent pip installs ACROSS process
# restarts.  Without this, each Nunba boot stacks another pip process
# on top of the one still downloading from the prior boot — 3 concurrent
# 2.5GB downloads racing for disk (observed 2026-04-16).
_INSTALL_LOCK_DIR = os.path.join(os.path.expanduser('~'), '.nunba')
_INSTALL_LOCK_STALE_S = 900  # 15 min — pip timeout is also 900s


def _acquire_file_lock(name: str) -> bool:
    """Acquire a file-based lock.  Returns True if acquired, False if
    another process holds it (and it's not stale)."""
    os.makedirs(_INSTALL_LOCK_DIR, exist_ok=True)
    lock_file = os.path.join(_INSTALL_LOCK_DIR, f'.{name}.lock')
    try:
        if os.path.exists(lock_file):
            age = time.time() - os.path.getmtime(lock_file)
            if age < _INSTALL_LOCK_STALE_S:
                # Lock is fresh — another process is installing
                try:
                    pid = int(open(lock_file).read().strip())
                    # Check if the PID is still alive (Windows-specific)
                    import subprocess as _sp
                    _r = _sp.run(['tasklist', '/FI', f'PID eq {pid}'],
                                 capture_output=True, text=True, timeout=5)
                    if str(pid) in _r.stdout:
                        logger.info(f"Install lock '{name}' held by PID {pid} (age {age:.0f}s)")
                        return False
                except Exception:
                    pass  # PID check failed — treat as stale
            # Lock is stale — remove and re-acquire
            logger.info(f"Removing stale install lock '{name}' (age {age:.0f}s)")
        with open(lock_file, 'w') as f:
            f.write(str(os.getpid()))
        return True
    except Exception as e:
        logger.debug(f"File lock error for '{name}': {e}")
        return True  # Fail open — better to risk a duplicate than block forever


def _release_file_lock(name: str):
    """Release the file-based lock."""
    lock_file = os.path.join(_INSTALL_LOCK_DIR, f'.{name}.lock')
    try:
        if os.path.exists(lock_file):
            # Only release if we own it
            pid = int(open(lock_file).read().strip())
            if pid == os.getpid():
                os.remove(lock_file)
    except Exception:
        pass


def get_python_embed_dir() -> str | None:
    """Find python-embed directory relative to the running app."""
    if getattr(sys, 'frozen', False):
        # Frozen build: python-embed is sibling of the exe
        app_dir = os.path.dirname(sys.executable)
    else:
        # Dev: python-embed is in project root
        app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    embed_dir = os.path.join(app_dir, 'python-embed')
    if os.path.isdir(embed_dir):
        return embed_dir
    return None


def get_embed_python() -> str | None:
    """Get path to python-embed's Python executable."""
    embed_dir = get_python_embed_dir()
    if not embed_dir:
        return None
    python_exe = os.path.join(embed_dir, 'python.exe')
    if os.path.isfile(python_exe):
        return python_exe
    # Linux/Mac
    python_bin = os.path.join(embed_dir, 'bin', 'python3')
    if os.path.isfile(python_bin):
        return python_bin
    return None


def get_embed_site_packages() -> str | None:
    """Get python-embed site-packages path."""
    embed_dir = get_python_embed_dir()
    if not embed_dir:
        return None
    sp = os.path.join(embed_dir, 'Lib', 'site-packages')
    if os.path.isdir(sp):
        return sp
    return None


def _canonical_import_name(pkg_spec: str) -> str:
    """Convert a pip requirement spec into the importable module name.

    Handles version specifiers (``huggingface_hub>=0.27.0,<0.29.0`` →
    ``huggingface_hub``) and pip→import aliasing (``chatterbox-tts`` →
    ``chatterbox``) in a single pass.  Single source of truth — callers
    who need to ask "is this pip package importable?" MUST go through
    this helper.  See J67 regression: previously version specifiers
    leaked into ``importlib.util.find_spec`` which raises
    ``ModuleNotFoundError`` on strings like ``huggingface_hub>=0``.
    """
    bare = re.split(r'[<>=!~]', pkg_spec, maxsplit=1)[0].strip()
    return _PIP_TO_IMPORT.get(bare, bare.replace('-', '_'))


def is_package_installed(import_name: str) -> bool:
    """Check if a Python package is importable."""
    return importlib.util.find_spec(import_name) is not None


def is_cuda_torch() -> bool:
    """Check if CUDA torch exists — checks user site-packages first.

    The frozen build ships a torch 0.0.0 stub at python-embed/ which shadows
    the real CUDA torch at ~/.nunba/site-packages/. Check the file on disk
    rather than importing (which would find the stub).
    """
    # Check both C: and D: site-packages (CUDA torch may be on secondary
    # drive when C: is too small for the 2.5GB install)
    for _sp in [get_user_site_packages(), os.path.join('D:\\', '.nunba', 'site-packages')]:
        user_torch = os.path.join(_sp, 'torch', 'version.py')
        if os.path.isfile(user_torch):
            try:
                with open(user_torch) as f:
                    content = f.read()
                if '+cu' in content:
                    return True
            except Exception:
                pass
    # Fallback: try import (works when not in frozen build)
    try:
        import torch
        return torch.cuda.is_available()
    except (ImportError, AttributeError):
        return False


def get_torch_variant() -> str:
    """Return 'cpu', 'cu124', etc. — checks user site-packages first."""
    user_torch = os.path.join(get_user_site_packages(), 'torch', 'version.py')
    if os.path.isfile(user_torch):
        try:
            with open(user_torch) as f:
                for line in f:
                    if '__version__' in line and '+' in line:
                        ver = line.split("'")[1] if "'" in line else line.split('"')[1]
                        if '+cpu' in ver:
                            return 'cpu'
                        if '+cu' in ver:
                            return ver.split('+')[1]
        except Exception:
            pass
    try:
        import torch
        ver = torch.__version__
        if '+cpu' in ver:
            return 'cpu'
        if '+cu' in ver:
            return ver.split('+')[1]
        return 'unknown'
    except ImportError:
        return 'none'


def has_nvidia_gpu() -> bool:
    """Check if NVIDIA GPU is available via nvidia-smi."""
    try:
        from tts._subprocess import hidden_startupinfo
        si, cf = hidden_startupinfo()
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=name', '--format=csv,noheader'],
            capture_output=True, text=True, timeout=5,
            startupinfo=si, creationflags=cf,
        )
        return result.returncode == 0 and result.stdout.strip() != ''
    except Exception:
        return False


def get_user_site_packages() -> str:
    """Get user-writable site-packages directory at ~/.nunba/site-packages/.

    This is where runtime pip installs go — Program Files is read-only
    for non-admin users. Added to sys.path at startup.
    """
    sp = os.path.join(Path.home(), '.nunba', 'site-packages')
    os.makedirs(sp, exist_ok=True)
    return sp


def ensure_user_site_on_path():
    """Add ~/.nunba/site-packages/ to sys.path and set up DLL directories.

    Must run before any torch import — the CUDA torch installed at runtime
    lives here, and its DLLs need to be discoverable.
    """
    sp = get_user_site_packages()
    if sp not in sys.path:
        sys.path.insert(0, sp)
    # Windows: add torch/lib to DLL search path for CUDA DLLs
    if sys.platform == 'win32':
        _torch_lib = os.path.join(sp, 'torch', 'lib')
        if os.path.isdir(_torch_lib):
            try:
                os.add_dll_directory(_torch_lib)
            except Exception:
                pass
            if _torch_lib not in os.environ.get('PATH', ''):
                os.environ['PATH'] = _torch_lib + os.pathsep + os.environ.get('PATH', '')


def _run_pip(args: list[str], progress_cb: Callable | None = None,
             timeout: int = 900,
             stall_timeout: int = 120,
             heartbeat_s: int = 20) -> tuple[bool, str]:
    """Run pip with --target ~/.nunba/site-packages/ for user-writable installs.

    Streams pip stdout line-by-line, firing `progress_cb` with a status
    message every `heartbeat_s` seconds so the UI sees forward motion
    instead of a frozen "Step 1/2" card.

    Two independent deadlines:
      - `stall_timeout` (default 120s): aborts if pip produces NO output
        for that long. Catches stuck DNS, stuck mirrors, dead connection.
        Slow-downloading-but-progressing installs are not killed.
      - `timeout` (default 900s = 15 min): absolute wall-clock ceiling.
        Legitimate big installs (torch, parler_tts) can approach this
        on slow connections; short enough that a user never sees a card
        stuck for longer than the worst-case real install.

    Uses python-embed/python.exe -m pip but targets the user-writable
    ~/.nunba/site-packages/ directory instead of Program Files.
    """
    python_exe = get_embed_python()
    if not python_exe:
        return False, "python-embed not found"

    # Use --target for install commands so packages go to user-writable dir
    # instead of Program Files (which needs admin)
    user_sp = get_user_site_packages()
    if args and args[0] == 'install':
        args = args[:1] + [
            '--target', user_sp,
            '--no-build-isolation',  # Use system setuptools (pip's isolated build fails in frozen builds)
            '--progress-bar', 'off',  # Line-based output for streaming parse
        ] + args[1:]

    cmd = [python_exe, '-m', 'pip'] + args
    env = os.environ.copy()
    env['PYTHONNOUSERSITE'] = '1'  # Don't leak to user site-packages
    env['SETUPTOOLS_USE_DISTUTILS'] = 'stdlib'  # Skip _distutils_hack shim (missing in frozen build)
    env['PYTHONUNBUFFERED'] = '1'  # Stream stdout immediately — no buffering

    logger.info(f"Running: {' '.join(cmd)}")
    if progress_cb:
        progress_cb(f"Running pip: {' '.join(args[:4])}...")

    import threading
    import time as _time

    try:
        from tts._subprocess import hidden_startupinfo
        si, cf = hidden_startupinfo()

        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1, env=env,
            startupinfo=si, creationflags=cf,
        )

        # Shared state between the drain thread and the main body.
        state = {
            'last_line_t': _time.monotonic(),
            'last_beat_t': _time.monotonic(),
            'lines': [],
            'current_pkg': '',
        }

        def _drain():
            assert proc.stdout is not None
            for raw in proc.stdout:
                line = raw.rstrip()
                if not line:
                    continue
                state['last_line_t'] = _time.monotonic()
                state['lines'].append(line)
                # Heuristic: pip "Collecting <pkg>" / "Downloading <file>"
                low = line.lower()
                if low.startswith('collecting '):
                    state['current_pkg'] = line.split(None, 1)[1].split('<')[0].strip()
                elif low.startswith('downloading '):
                    state['current_pkg'] = line
            proc.stdout.close()

        drain = threading.Thread(target=_drain, daemon=True, name='pip-drain')
        drain.start()

        t0 = _time.monotonic()
        while True:
            rc = proc.poll()
            if rc is not None:
                break
            now = _time.monotonic()
            # Heartbeat: tell the UI something is still happening.
            if progress_cb and (now - state['last_beat_t']) >= heartbeat_s:
                pkg = state['current_pkg'] or 'packages'
                progress_cb(f"pip: {pkg} (elapsed {int(now - t0)}s)")
                state['last_beat_t'] = now
            # Stall detection: no stdout line for stall_timeout seconds.
            if (now - state['last_line_t']) >= stall_timeout:
                proc.kill()
                drain.join(timeout=2)
                msg = (f"pip stalled — no output for {stall_timeout}s "
                       f"after '{state['current_pkg'] or 'startup'}'. "
                       f"Check network / mirror.")
                if progress_cb:
                    progress_cb(msg)
                return False, msg
            # Absolute wall-clock ceiling.
            if (now - t0) >= timeout:
                proc.kill()
                drain.join(timeout=2)
                msg = f"pip timed out after {timeout}s"
                if progress_cb:
                    progress_cb(msg)
                return False, msg
            _time.sleep(0.5)

        drain.join(timeout=2)
        out = "\n".join(state['lines'])
        if rc == 0:
            # Ensure the target dir is on sys.path NOW (not just next restart)
            ensure_user_site_on_path()
            return True, out
        else:
            logger.error(f"pip failed (rc={rc}): {out[-800:]}")
            return False, out
    except Exception as e:
        return False, str(e)


def install_gpu_torch(progress_cb: Callable | None = None) -> tuple[bool, str]:
    """Install GPU-accelerated PyTorch — detects GPU type centrally via vram_manager.

    Selects the correct pip index:
      NVIDIA → cu124 (CUDA 12.4)
      AMD    → rocm6.2 (ROCm, Linux only)
      None   → returns False

    ~2.5GB download. Only runs if current torch is +cpu variant.
    Uses a file-based lock so multiple Nunba boots don't stack
    concurrent 2.5GB downloads.
    """
    if not _acquire_file_lock('cuda_torch'):
        return False, "Another process is already installing CUDA torch"
    # Central GPU detection — one source of truth
    try:
        from integrations.service_tools.vram_manager import vram_manager
        gpu = vram_manager.detect_gpu()
        gpu_type = 'nvidia' if gpu.get('cuda_available') else (
            'amd' if gpu.get('name', '').upper().find('AMD') >= 0 or
            gpu.get('name', '').upper().find('RADEON') >= 0 else None)
    except Exception:
        gpu_type = 'nvidia' if has_nvidia_gpu() else None

    if not gpu_type:
        return False, "No GPU detected"

    variant = get_torch_variant()
    if variant not in ('cpu', 'unknown', 'none'):
        return True, f"torch already has GPU support ({variant})"

    label = 'ROCm' if gpu_type == 'amd' else 'CUDA'
    if progress_cb:
        progress_cb(f"Installing {label} PyTorch (~2.5GB download)...")

    # Don't uninstall CPU torch from python-embed (read-only Program Files).
    # Just install GPU torch to ~/.nunba/site-packages/ — it shadows the
    # CPU stub on sys.path (app.py inserts user site at index 0).

    # Install GPU torch — index URL depends on GPU vendor
    _torch_index = ('https://download.pytorch.org/whl/rocm6.2' if gpu_type == 'amd'
                     else 'https://download.pytorch.org/whl/cu124')
    _target = get_user_site_packages()
    ok, msg = _run_pip([
        'install', 'torch', 'torchaudio',
        '--index-url', _torch_index,
    ], progress_cb, timeout=900)

    # Fallback: if C: is full (ENOSPC), retry to D: drive.
    # CUDA torch is 2.5GB — C: often has <5GB free on 500GB disks
    # that are full with system files + models.
    if not ok and 'No space left' in msg:
        _d_target = os.path.join('D:\\', '.nunba', 'site-packages')
        os.makedirs(_d_target, exist_ok=True)
        if progress_cb:
            progress_cb("C: drive full — installing CUDA torch to D: drive...")
        logger.info("CUDA torch: C: ENOSPC, retrying to D: drive")
        ok, msg = _run_pip([
            'install', 'torch', 'torchaudio',
            '--index-url', _torch_index,
            '--target', _d_target, '--no-deps',
        ], progress_cb, timeout=900)
        if ok:
            _target = _d_target
            logger.info("CUDA torch installed to D: drive successfully")

    if ok:
        # Remove the stub torch (0.0.0) from python-embed so the CUDA version
        # from ~/.nunba/site-packages is the only one Python finds
        _embed_sp = get_embed_site_packages()
        if _embed_sp:
            import shutil
            for _stub_dir in ('torch', 'torchaudio'):
                _stub_path = os.path.join(_embed_sp, _stub_dir)
                if os.path.isdir(_stub_path):
                    try:
                        _ver_file = os.path.join(_stub_path, 'version.py')
                        _is_stub = False
                        if os.path.isfile(_ver_file):
                            with open(_ver_file) as _vf:
                                _is_stub = '0.0.0' in _vf.read()
                        if _is_stub:
                            shutil.rmtree(_stub_path, ignore_errors=True)
                            logger.info(f"Removed stub {_stub_dir} from python-embed")
                    except Exception as _e:
                        logger.debug(f"Could not remove stub {_stub_dir}: {_e}")

        # Fix torch/_C directory conflict in CUDA install target too
        # pip creates both _C.cpXYZ.pyd (the real extension) AND _C/ (stubs).
        # The directory shadows the .pyd → "Failed to load PyTorch C extensions"
        _user_sp = get_user_site_packages()
        _torch_c_dir = os.path.join(_user_sp, 'torch', '_C')
        if os.path.isdir(_torch_c_dir):
            import shutil
            shutil.rmtree(_torch_c_dir, ignore_errors=True)
            logger.info("Removed torch/_C directory conflict from user site-packages")
        _torch_c_fb = os.path.join(_user_sp, 'torch', '_C_flatbuffer')
        if os.path.isdir(_torch_c_fb):
            shutil.rmtree(_torch_c_fb, ignore_errors=True)

        # Ensure user site-packages is on sys.path BEFORE python-embed
        ensure_user_site_on_path()

        # Add torch/lib to DLL search path (Windows — needed for CUDA DLLs)
        _torch_lib = os.path.join(_user_sp, 'torch', 'lib')
        if os.path.isdir(_torch_lib) and sys.platform == 'win32':
            try:
                os.add_dll_directory(_torch_lib)
            except Exception:
                pass
            os.environ['PATH'] = _torch_lib + os.pathsep + os.environ.get('PATH', '')

        # Invalidate cached import checks
        _invalidate_import_cache()

        # Force-reload torch in current session
        _torch_mods = [k for k in sys.modules if k == 'torch' or k.startswith('torch.')]
        for k in _torch_mods:
            del sys.modules[k]
        try:
            import torch
            if torch.cuda.is_available():
                logger.info(f"CUDA torch active in current session: {torch.cuda.get_device_name(0)}")
                if progress_cb:
                    progress_cb(f"CUDA PyTorch ready — {torch.cuda.get_device_name(0)}")
            else:
                logger.warning("CUDA torch installed but not available in current session (may need restart)")
                if progress_cb:
                    progress_cb("CUDA PyTorch installed — will activate on next start")
        except Exception as e:
            logger.warning(f"torch reload after CUDA install failed: {e}")
            if progress_cb:
                progress_cb("CUDA PyTorch installed — will activate on next start")
    _release_file_lock('cuda_torch')
    return ok, msg


def install_backend_packages(backend: str,
                              progress_cb: Callable | None = None) -> tuple[bool, str]:
    """Install pip packages required for a TTS backend.

    Returns (success, message).
    """
    packages = BACKEND_PACKAGES.get(backend, [])
    if not packages:
        return True, f"No packages needed for {backend}"

    # Check what's already installed.  Pip specs like `parler-tts==0.2.2`
    # carry a version clause; `_canonical_import_name` strips it before
    # the import-name lookup — otherwise `importlib.util.find_spec(
    # 'parler_tts==0.2.2')` raises ModuleNotFoundError (J67 red-product).
    to_install = []
    for pkg in packages:
        if not is_package_installed(_canonical_import_name(pkg)):
            to_install.append(pkg)

    display_name = BACKEND_DISPLAY_NAMES.get(backend, backend)

    # CUDA torch gate — runs BEFORE the "all packages installed" early
    # return.  Previously this check was gated by 'torchaudio in
    # to_install', but torchaudio's .py files often pre-exist in
    # python-embed/ so find_spec() reports True and torchaudio is NOT
    # in to_install — even when CUDA torch is entirely missing.  That
    # turned "all packages reported installed" into a false positive
    # for GPU backends and CUDA torch upgrade never ran on a fresh
    # machine.  Now we ask is_cuda_torch() directly — single source of
    # truth for "is CUDA torch present?" — and the check runs before
    # the to_install short-circuit.
    needs_gpu = backend not in ('piper',)
    cuda_torch_was_installed = False
    if needs_gpu and has_nvidia_gpu() and not is_cuda_torch():
        if progress_cb:
            progress_cb("GPU detected but CUDA torch missing — installing CUDA torch first (~2.5GB)...")
        cuda_ok, cuda_msg = install_gpu_torch(progress_cb)
        if cuda_ok:
            cuda_torch_was_installed = True
            # install_gpu_torch installs torch + torchaudio together
            to_install = [p for p in to_install if p != 'torchaudio']
        else:
            logger.warning(f"CUDA torch install failed: {cuda_msg}")
            # Continue — caller decides how to handle a still-CPU torch.

    if not to_install and not cuda_torch_was_installed:
        # Pip-level "all installed" is an unreliable success signal —
        # is_package_installed only checks top-level find_spec, missing
        # transitives the upstream package omits from install_requires
        # (chatterbox-tts pulled this stunt twice: librosa, then perth).
        # Run the deep self-heal probe BEFORE returning so we either
        # confirm the engine is truly runnable or auto-install the
        # actual missing transitive.  Skipping this check is what
        # caused the perth failure on a chatterbox re-install where
        # librosa was already on disk from the prior heal attempt.
        deep_ok, healed = _self_heal_missing_transitives(
            backend, progress_cb=progress_cb,
        )
        if healed:
            logger.info(
                f"Self-heal (early-return path) installed transitives for "
                f"{backend}: {healed} — add to HARTOS pip_install_plan"
            )
        if deep_ok:
            return True, f"All packages for {backend} already installed"
        # Deep probe failed even after self-heal — fall through to the
        # error_advice handoff at the bottom of the function so an
        # autogen agent can investigate.
        all_ok = False
        # Skip the redundant top-level verify since to_install is empty
        # — go straight to the agent-remediation path below.
        try:
            from core.error_advice import handle_exception
            handle_exception(
                RuntimeError(
                    f"deterministic self-heal exhausted for {backend} "
                    f"(early-return path) after installing {healed}"
                ),
                category='tts.install.self_heal_exhausted',
                severity='high',
                agent_remediation=True,
                context={
                    'backend': backend,
                    'display_name': display_name,
                    'attempted_packages': packages,
                    'healed_during_loop': healed,
                    'path': 'early-return (all-pip-installed)',
                    'probe_err_file': os.path.join(
                        os.path.expanduser('~'),
                        'Documents', 'Nunba', 'logs',
                        f'probe_{backend}.err',
                    ),
                },
            )
        except Exception:
            pass
        return False, f"Deep probe failed for {backend} after self-heal"

    if to_install and progress_cb:
        progress_cb(f"Installing packages for {display_name}: {', '.join(to_install)}")

    # torchaudio install for the case where CUDA torch was already
    # present (or no GPU) but torchaudio itself is genuinely missing.
    if needs_gpu and 'torchaudio' in to_install:
        variant = get_torch_variant()
        if variant == 'cpu':
            idx_url = 'https://download.pytorch.org/whl/cpu'
        else:
            idx_url = f'https://download.pytorch.org/whl/{variant}'
        ok, msg = _run_pip([
            'install', 'torchaudio', '--index-url', idx_url,
        ], progress_cb)
        if ok:
            to_install = [p for p in to_install if p != 'torchaudio']

    # Install remaining packages
    if to_install:
        ok, msg = _run_pip(['install'] + to_install, progress_cb)
        if not ok:
            return False, f"Failed to install {to_install}: {msg}"

    # Invalidate import cache so _can_run_backend() re-checks
    _invalidate_import_cache()

    # Verify installation.  Use `_canonical_import_name` so a spec like
    # `huggingface_hub>=0.27.0,<0.29.0` is stripped to `huggingface_hub`
    # before `find_spec` — otherwise `find_spec('huggingface_hub>=0')`
    # raises ModuleNotFoundError, masking a successful install and
    # producing an empty-500 to the caller (J67 red-product).
    all_ok = True
    for pkg in packages:
        import_name = _canonical_import_name(pkg)
        if not is_package_installed(import_name):
            all_ok = False
            logger.warning(f"Package {pkg} ({import_name}) not importable after install")

    # Deep self-heal probe — runs the SAME subprocess import that
    # _torch_probe uses at runtime, so a chatterbox-style failure
    # (top-level `import chatterbox` succeeds → `from .tts import
    # ChatterboxTTS` blows up on missing `import librosa` because the
    # upstream package omits it from install_requires) gets caught
    # HERE, on the install screen, instead of 5 minutes later when the
    # user actually tries to talk and verified_synth reports
    # "synthesize returned no path" with no recovery path.
    #
    # If the deep probe surfaces a ModuleNotFoundError for an
    # un-declared transitive, install it + retry.  Bounded so a
    # genuinely broken upstream doesn't loop forever — when the loop
    # gives up (3 iterations or non-ModuleNotFound failure mode), the
    # central error_advice handler files an AgentGoal so an autogen
    # agent can take over investigation (alternate package versions,
    # upstream-issue search, alternate engines).
    if all_ok:
        deep_ok, healed = _self_heal_missing_transitives(
            backend, progress_cb=progress_cb,
        )
        if healed:
            logger.info(
                f"Self-heal installed transitive deps for {backend}: {healed} "
                f"— add these to HARTOS pip_install_plan to skip this loop next time"
            )
        if not deep_ok:
            all_ok = False
            # Hand off to the central error advice fan-out so an
            # autogen agent can investigate beyond the deterministic
            # loop.  Uses the existing crash_reporter (Sentry capture)
            # + GoalManager.create_goal pipeline; no parallel paths.
            try:
                from core.error_advice import handle_exception
                handle_exception(
                    RuntimeError(
                        f"deterministic self-heal exhausted for {backend} "
                        f"after installing {healed}; deep probe still fails"
                    ),
                    category='tts.install.self_heal_exhausted',
                    severity='high',
                    agent_remediation=True,
                    context={
                        'backend': backend,
                        'display_name': display_name,
                        'attempted_packages': packages,
                        'healed_during_loop': healed,
                        'probe_err_file': os.path.join(
                            os.path.expanduser('~'),
                            'Documents', 'Nunba', 'logs',
                            f'probe_{backend}.err',
                        ),
                    },
                )
            except Exception:
                # Never let observability break the install path
                pass

    if all_ok and progress_cb:
        progress_cb(f"{display_name} packages installed successfully")

    return all_ok, f"{'All' if all_ok else 'Some'} packages installed for {backend}"


# ── Generic transitive-dep self-heal ──────────────────────────────────
#
# Catches the chatterbox-librosa class of failure: upstream package
# imports a runtime dep that isn't in its install_requires.  Pip
# completes "successfully", top-level `find_spec` returns True, but
# the deep import chain blows up.  This loop runs the same deep probe
# the runtime uses (subprocess `import <required_pkg>`), parses the
# probe's already-written ~/Documents/Nunba/logs/probe_<backend>.err
# for ModuleNotFoundError, pip-installs the missing module, retries.
#
# Pure SRP: this function does ONE thing — find + install the
# transitive deps that the engine's runtime import chain reveals.  No
# duplicated install logic (uses _run_pip), no duplicated probe logic
# (uses _torch_probe.check_backend_runnable), no parallel cache (uses
# _invalidate_import_cache).
_MISSING_MODULE_RE = re.compile(
    r"ModuleNotFoundError:\s+No module named ['\"]([^'\"]+)['\"]"
)


def _self_heal_missing_transitives(
    backend: str,
    max_iter: int = 3,
    progress_cb: Callable | None = None,
) -> tuple[bool, list[str]]:
    """Run the runtime deep-import probe; if it fails on a
    ModuleNotFoundError, install the missing module and retry.

    Returns (deep_probe_ok, [packages_installed_during_heal]).
    deep_probe_ok=False means the engine STILL won't work — caller
    should mark backend as failed.
    """
    # Resolve the required_package from HARTOS's spec.  No-op for
    # engines that don't declare one (espeak / piper / makeittalk —
    # the bundled / cloud paths).
    registry = _hartos_engine_registry()
    spec = registry.get(backend) or registry.get(
        _NUNBA_TO_HARTOS_BACKEND.get(backend, ''),
    )
    required_pkg = getattr(spec, 'required_package', None) if spec else None
    if not required_pkg:
        return True, []  # nothing to probe; treat as healthy

    try:
        from tts._torch_probe import check_backend_runnable, _resolve_paths
    except Exception:
        return True, []  # probe unavailable in dev mode — treat as healthy

    # Probe requires a frozen python-embed bundle to run the deep
    # subprocess import.  In dev mode (running from source, not a
    # frozen .exe), `_resolve_paths()` returns False, and a direct
    # call to check_backend_runnable would return False without ever
    # actually running the probe — indistinguishable from "probe ran
    # and the engine is broken".  Treat unavailable-probe as healthy
    # so dev-mode + unit-test runs trust the pip-level signal that
    # called us; only frozen-build users get the deep-probe gate.
    if not _resolve_paths():
        return True, []

    err_file = os.path.join(
        os.path.expanduser('~'), 'Documents', 'Nunba', 'logs',
        f'probe_{backend}.err',
    )

    healed: list[str] = []
    for iteration in range(max_iter):
        _invalidate_import_cache()
        if check_backend_runnable(backend, required_pkg):
            return True, healed

        # Deep probe failed — read the error file the probe just wrote
        if not os.path.isfile(err_file):
            return False, healed
        try:
            with open(err_file) as _ef:
                err_text = _ef.read()
        except Exception:
            return False, healed

        m = _MISSING_MODULE_RE.search(err_text)
        if not m:
            # Different kind of failure (e.g., DLL not found, runtime
            # error in __init__) — can't auto-heal; bail.
            return False, healed
        missing = m.group(1).split('.')[0]  # heal at top-level only

        if missing in healed:
            # Already installed it this run, probe still fails — circular
            # or the install lied; stop looping.
            return False, healed

        if progress_cb:
            progress_cb(
                f"Auto-healing {backend}: deep probe needs '{missing}' — installing..."
            )
        ok, msg = _run_pip(['install', missing], progress_cb)
        if not ok:
            logger.warning(
                f"Self-heal pip install of '{missing}' for {backend} failed: {msg}"
            )
            return False, healed
        healed.append(missing)
        # Loop re-runs deep probe

    # Exhausted max_iter — treat as failed
    logger.warning(
        f"Self-heal for {backend} hit max_iter={max_iter} after installing "
        f"{healed}; deep probe still fails"
    )
    return False, healed


def install_backend_full(backend: str,
                          progress_cb: Callable | None = None) -> tuple[bool, str]:
    """Full install: pip packages + model weights for a backend.

    This is the main entry point — called from ai_installer, /tts/setup-engine,
    and the LangChain Setup_TTS_Engine tool.
    Uses file-based lock to prevent concurrent installs across process restarts.
    """
    global _installing

    if _installing.get(backend):
        return False, f"{backend} installation already in progress"

    if not _acquire_file_lock(f'install_{backend}'):
        return False, f"{backend} installation in progress (another Nunba instance)"

    with _install_lock:
        _installing[backend] = True

    try:
        display_name = BACKEND_DISPLAY_NAMES.get(backend, backend)
        if progress_cb:
            progress_cb(f"Setting up {display_name}...")

        # Step 1a: if this backend is venv-quarantined, route the pip
        # install into its dedicated venv instead of the main interp.
        # Track B, Phase 6: Indic Parler's parler-tts+transformers pins
        # collide with the main interpreter, so it lives in its own venv.
        venv_pkgs = BACKEND_VENV_PACKAGES.get(backend)
        if venv_pkgs:
            if progress_cb:
                progress_cb(
                    f"Step 1/2: Creating dedicated venv for {display_name} "
                    f"({len(venv_pkgs)} packages)..."
                )
            from tts.backend_venv import ensure_venv, install_into_venv
            ensure_venv(backend)
            venv_ok, venv_msg = install_into_venv(backend, venv_pkgs)
            if not venv_ok:
                return False, f"venv install failed: {venv_msg}"
            pkg_ok, pkg_msg = True, venv_msg
        else:
            # Step 1b: normal main-interpreter install path.
            if progress_cb:
                progress_cb(f"Step 1/2: Installing Python packages for {display_name}...")
            pkg_ok, pkg_msg = install_backend_packages(backend, progress_cb)
            if not pkg_ok:
                return False, pkg_msg

        # Post-install patches for known compatibility issues
        _apply_post_install_patches(backend)

        # Step 2: Model weights (via huggingface_hub)
        if progress_cb:
            progress_cb(f"Step 2/2: Downloading model weights for {display_name}...")
        model_ok, model_msg = _download_model_weights(backend, progress_cb)

        success = pkg_ok and model_ok
        status = f"{'Ready' if success else 'Partial'}: packages={pkg_msg}, models={model_msg}"
        if progress_cb:
            if success:
                # Intentionally phrased so the frontend's
                # string-heuristic does NOT flip the banner to green
                # on install-complete.  The banner only turns green
                # after tts.tts_handshake.run_handshake emits a
                # tts_handshake event with status='ready'.  Install
                # success is a proxy signal; audio bytes are the
                # only truth.
                progress_cb(f"{display_name} installed — verifying voice...")
            else:
                progress_cb(f"{display_name} setup incomplete: {status}")

        return success, status

    finally:
        _installing[backend] = False
        _release_file_lock(f'install_{backend}')


def _is_hf_model_cached(model_id: str) -> bool:
    """Check if a HuggingFace model is already cached (any location)."""
    # Check standard HF cache
    hf_cache = Path.home() / '.cache' / 'huggingface' / 'hub'
    model_dir = hf_cache / f'models--{model_id.replace("/", "--")}'
    if model_dir.exists():
        return True
    # Check ~/.nunba/models/tts/
    nunba_tts = Path.home() / '.nunba' / 'models' / 'tts'
    if nunba_tts.exists():
        # Model might be stored under a simplified name
        simple_name = model_id.split('/')[-1].lower()
        for entry in nunba_tts.iterdir():
            if simple_name in entry.name.lower():
                return True
    return False


def _apply_post_install_patches(backend: str):
    """Apply source patches for known package compatibility issues."""
    if backend == 'indic_parler':
        # parler_tts dac_wrapper calls model.decode(audio_values) but HF's
        # DACModel.decode() expects keyword arg 'quantized_representation'.
        user_sp = get_user_site_packages()
        target = os.path.join(user_sp, 'parler_tts', 'dac_wrapper', 'modeling_dac.py')
        if os.path.isfile(target):
            try:
                with open(target) as f:
                    src = f.read()
                old = 'audio_values = self.model.decode(audio_values)'
                new = ('try:\n'
                       '            audio_values = self.model.decode(audio_values)\n'
                       '        except TypeError:\n'
                       '            audio_values = self.model.decode(quantized_representation=audio_values)')
                if old in src and 'except TypeError' not in src:
                    src = src.replace(old, new)
                    with open(target, 'w') as f:
                        f.write(src)
                    logger.info("Patched parler_tts DACModel.decode() for HF compatibility")
            except Exception as e:
                logger.debug(f"DAC decode patch skipped: {e}")


def _download_model_weights(backend: str,
                             progress_cb: Callable | None = None) -> tuple[bool, str]:
    """Download model weights from HuggingFace for a backend.

    Checks ~/.cache/huggingface/hub/ AND ~/.nunba/ before downloading.
    """
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        return False, "huggingface_hub not available"

    if backend in ('chatterbox_turbo', 'chatterbox_multilingual'):
        model_id = 'ResembleAI/chatterbox-turbo'
        if _is_hf_model_cached(model_id):
            return True, "Already downloaded"
        if progress_cb:
            progress_cb("Downloading Chatterbox Turbo model (~2GB)...")
        snapshot_download(model_id)
        return True, "Model downloaded"

    elif backend == 'indic_parler':
        model_id = 'ai4bharat/indic-parler-tts'
        if _is_hf_model_cached(model_id):
            return True, "Already downloaded"
        if progress_cb:
            progress_cb("Downloading Indic Parler TTS model (~3.5GB)...")
        snapshot_download(model_id)
        return True, "Model downloaded"

    elif backend == 'cosyvoice3':
        # CosyVoice3 uses a cloned repo path, not standard HF cache
        cosyvoice_dir = os.path.join(
            os.path.expanduser('~'), 'PycharmProjects', 'CosyVoice',
            'pretrained_models', 'CosyVoice3-0.5B')
        if os.path.isdir(cosyvoice_dir):
            return True, "Already downloaded"
        # Also check HF cache
        if _is_hf_model_cached('FunAudioLLM/Fun-CosyVoice3-0.5B-2512'):
            return True, "Already downloaded"
        if progress_cb:
            progress_cb("Downloading CosyVoice3 model (~4GB)...")
        os.makedirs(cosyvoice_dir, exist_ok=True)
        snapshot_download('FunAudioLLM/Fun-CosyVoice3-0.5B-2512',
                          local_dir=cosyvoice_dir)
        return True, "Model downloaded"

    elif backend == 'f5':
        model_id = 'SWivid/F5-TTS'
        if _is_hf_model_cached(model_id):
            return True, "Already downloaded"
        if progress_cb:
            progress_cb("Downloading F5-TTS model (~2GB)...")
        snapshot_download(model_id)
        return True, "Model downloaded"

    elif backend == 'piper':
        # Piper voices are tiny (~20MB), downloaded by PiperTTS._ensure_loaded
        # Check if default voice exists in ~/.nunba/piper/voices/
        piper_voices = Path.home() / '.nunba' / 'piper' / 'voices'
        if piper_voices.exists() and any(piper_voices.iterdir()):
            return True, "Piper voice already downloaded"
        return True, "Piper downloads voices on first use (~20MB)"

    return True, "No model download needed"


def _invalidate_import_cache():
    """Clear ALL import-related caches so newly installed packages are
    detected on the very next probe.  Three independent caches sit
    between the install path and the runnable check:

      1. TTSEngine._import_check_cache       (per-package, in-process)
      2. importlib's internal finder cache   (in-process)
      3. _torch_probe._backend_cache         (per-backend, in-process,
                                              keys the subprocess
                                              import probe — was the
                                              missed one that caused
                                              chatterbox-librosa
                                              self-heal to spin: pip
                                              installed librosa, this
                                              fn cleared (1) and (2)
                                              but NOT (3), so the next
                                              probe call returned the
                                              stale pre-install False
                                              instead of re-running
                                              the subprocess.)

    Cheap to clear all three, expensive to forget any one of them.
    """
    # 1. TTSEngine's static cache
    try:
        from tts.tts_engine import TTSEngine
        TTSEngine._import_check_cache.clear()
    except Exception:
        pass

    # 2. importlib finders
    importlib.invalidate_caches()

    # 3. _torch_probe per-backend subprocess result cache
    try:
        from tts import _torch_probe as _tp
        _tp._backend_cache.clear()
    except Exception:
        pass

    # Re-add python-embed to sys.path if not present (edge case after pip install)
    sp = get_embed_site_packages()
    if sp and sp not in sys.path:
        sys.path.append(sp)


def make_chat_progress_callback(user_id: str = '', job_type: str = 'tts_setup'):
    """Create a progress callback that pushes updates to the chat view.

    Sends setup progress as SSE events that the frontend renders
    as a SetupProgressCard in the chat messages.
    """
    _step_count = [0]

    def _push_progress(message: str):
        _step_count[0] += 1
        event_data = {
            'type': 'setup_progress',
            'job_type': job_type,
            'step': _step_count[0],
            'message': message,
            'timestamp': time.time(),
        }

        # Log always
        logger.info(f"[{job_type}] Step {_step_count[0]}: {message}")

        # Push to frontend via SSE (broadcast_sse_event in main.py)
        try:
            import sys as _sys
            main_mod = _sys.modules.get('__main__')
            if main_mod and hasattr(main_mod, 'broadcast_sse_event'):
                main_mod.broadcast_sse_event('setup_progress', event_data,
                                             user_id=user_id or None)
        except Exception:
            pass

    return _push_progress


def get_backend_status() -> dict[str, dict]:
    """Get installation status for all TTS backends.

    Returns dict of backend → {installed, has_model, display_name, packages_missing}.

    For venv-quarantined backends (Track B, Phase 6), readiness is
    determined by `backend_venv.is_venv_healthy(<backend>, <probe>)`
    rather than by main-interpreter find_spec — the backend's
    packages live in its dedicated venv and are never importable
    from the main process.
    """
    # Probe module per venv backend — single source of truth so UI
    # reflects reality post-install.
    _VENV_PROBE = {'indic_parler': 'parler_tts'}

    status = {}
    for backend, packages in BACKEND_PACKAGES.items():
        if backend in BACKEND_VENV_PACKAGES:
            # Venv-quarantined: ask backend_venv, not main interpreter.
            try:
                from tts.backend_venv import is_venv_healthy
                healthy = is_venv_healthy(backend, _VENV_PROBE.get(backend))
            except Exception:
                healthy = False
            status[backend] = {
                'display_name': BACKEND_DISPLAY_NAMES.get(backend, backend),
                'installed': healthy,
                'packages_missing': (
                    [] if healthy else list(BACKEND_VENV_PACKAGES[backend])
                ),
                'installing': _installing.get(backend, False),
                'venv_backed': True,
            }
            continue

        missing = []
        for pkg in packages:
            # `_canonical_import_name` strips the pip version spec before
            # the import-name lookup — see J67 regression note on
            # `importlib.util.find_spec` crashing on unstripped specs.
            if not is_package_installed(_canonical_import_name(pkg)):
                missing.append(pkg)

        status[backend] = {
            'display_name': BACKEND_DISPLAY_NAMES.get(backend, backend),
            'installed': len(missing) == 0,
            'packages_missing': missing,
            'installing': _installing.get(backend, False),
        }
    return status


def get_recommended_backends(vram_gb: float = 0, has_gpu: bool = False) -> list[str]:
    """Get list of recommended backends for this hardware."""
    from tts.tts_engine import ENGINE_CAPABILITIES
    recommended = []
    for backend, cap in ENGINE_CAPABILITIES.items():
        required_vram = cap.get('vram_gb', 0)
        if required_vram == 0:
            recommended.append(backend)
        elif has_gpu and vram_gb >= required_vram:
            recommended.append(backend)
    return recommended
