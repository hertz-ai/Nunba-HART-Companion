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
import json
import logging
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

logger = logging.getLogger('NunbaTTSInstaller')

# Backend → pip packages needed (in install order)
BACKEND_PACKAGES = {
    'chatterbox_turbo': [
        'torchaudio',
        'chatterbox-tts',
    ],
    'chatterbox_multilingual': [
        'torchaudio',
        'chatterbox-tts',
    ],
    'indic_parler': [
        'torchaudio',
        'parler-tts',
    ],
    'cosyvoice3': [
        'torchaudio',
        # cosyvoice is NOT pip-installable — needs cloned repo
        # Model weights downloaded separately via huggingface_hub
    ],
    'f5': [
        'torchaudio',
        'f5-tts',
    ],
    'piper': [],  # Bundled, no pip install needed
}

# pip package name → import name (for verification)
_PIP_TO_IMPORT = {
    'chatterbox-tts': 'chatterbox',
    'parler-tts': 'parler_tts',
    'f5-tts': 'f5_tts',
    'torchaudio': 'torchaudio',
}

# Human-readable names for progress messages
BACKEND_DISPLAY_NAMES = {
    'chatterbox_turbo': 'Chatterbox Turbo (English, expressive)',
    'chatterbox_multilingual': 'Chatterbox Multilingual (23 languages)',
    'indic_parler': 'Indic Parler TTS (21 Indian languages + English)',
    'cosyvoice3': 'CosyVoice3 (9 international languages)',
    'f5': 'F5-TTS (voice cloning)',
    'piper': 'Piper TTS (CPU fallback)',
}

# Lock to prevent concurrent installs
_install_lock = threading.Lock()
_installing = {}  # backend → True while installing


def get_python_embed_dir() -> Optional[str]:
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


def get_embed_python() -> Optional[str]:
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


def get_embed_site_packages() -> Optional[str]:
    """Get python-embed site-packages path."""
    embed_dir = get_python_embed_dir()
    if not embed_dir:
        return None
    sp = os.path.join(embed_dir, 'Lib', 'site-packages')
    if os.path.isdir(sp):
        return sp
    return None


def is_package_installed(import_name: str) -> bool:
    """Check if a Python package is importable."""
    return importlib.util.find_spec(import_name) is not None


def is_cuda_torch() -> bool:
    """Check if installed torch has CUDA support."""
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


def get_torch_variant() -> str:
    """Return 'cpu', 'cu124', etc. for the installed torch."""
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
        si = None
        cf = 0
        if sys.platform == 'win32':
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            si.wShowWindow = 0
            cf = subprocess.CREATE_NO_WINDOW
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
    """Add ~/.nunba/site-packages/ to sys.path if not already there."""
    sp = get_user_site_packages()
    if sp not in sys.path:
        sys.path.insert(0, sp)


def _run_pip(args: List[str], progress_cb: Optional[Callable] = None,
             timeout: int = 600) -> Tuple[bool, str]:
    """Run pip with --target ~/.nunba/site-packages/ for user-writable installs.

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
        args = args[:1] + ['--target', user_sp] + args[1:]

    cmd = [python_exe, '-m', 'pip'] + args
    env = os.environ.copy()
    env['PYTHONNOUSERSITE'] = '1'  # Don't leak to user site-packages

    logger.info(f"Running: {' '.join(cmd)}")
    if progress_cb:
        progress_cb(f"Running pip: {' '.join(args[:4])}...")

    try:
        si = None
        cf = 0
        if sys.platform == 'win32':
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            si.wShowWindow = 0
            cf = subprocess.CREATE_NO_WINDOW

        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
            env=env, startupinfo=si, creationflags=cf,
        )
        if proc.returncode == 0:
            # Ensure the target dir is on sys.path NOW (not just next restart)
            ensure_user_site_on_path()
            return True, proc.stdout
        else:
            logger.error(f"pip failed: {proc.stderr}")
            return False, proc.stderr
    except subprocess.TimeoutExpired:
        return False, f"pip timed out after {timeout}s"
    except Exception as e:
        return False, str(e)


def install_cuda_torch(progress_cb: Optional[Callable] = None) -> Tuple[bool, str]:
    """Swap torch+cpu for torch+cu124 in python-embed.

    This is a ~2.5GB download. Only runs if:
    - GPU detected via nvidia-smi
    - Current torch is +cpu variant
    """
    if not has_nvidia_gpu():
        return False, "No NVIDIA GPU detected"

    variant = get_torch_variant()
    if variant != 'cpu':
        return True, f"torch already has CUDA ({variant})"

    if progress_cb:
        progress_cb("Upgrading PyTorch to CUDA version (~2.5GB download)...")

    # Uninstall CPU torch first
    _run_pip(['uninstall', '-y', 'torch'], progress_cb)

    # Install CUDA torch
    ok, msg = _run_pip([
        'install', 'torch', 'torchaudio',
        '--index-url', 'https://download.pytorch.org/whl/cu124',
    ], progress_cb, timeout=900)

    if ok:
        # Invalidate cached import checks
        _invalidate_import_cache()

        # Force-reload torch in current session — the old stub (0.0.0)
        # is cached in sys.modules and won't be replaced by importlib alone
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
    return ok, msg


def install_backend_packages(backend: str,
                              progress_cb: Optional[Callable] = None) -> Tuple[bool, str]:
    """Install pip packages required for a TTS backend.

    Returns (success, message).
    """
    packages = BACKEND_PACKAGES.get(backend, [])
    if not packages:
        return True, f"No packages needed for {backend}"

    # Check what's already installed
    to_install = []
    for pkg in packages:
        import_name = _PIP_TO_IMPORT.get(pkg, pkg.replace('-', '_'))
        if not is_package_installed(import_name):
            to_install.append(pkg)

    if not to_install:
        return True, f"All packages for {backend} already installed"

    display_name = BACKEND_DISPLAY_NAMES.get(backend, backend)
    if progress_cb:
        progress_cb(f"Installing packages for {display_name}: {', '.join(to_install)}")

    # Check if we need CUDA torch first
    needs_gpu = backend not in ('piper',)
    if needs_gpu and 'torchaudio' in to_install:
        # torchaudio must match torch version — install via pytorch index
        variant = get_torch_variant()
        if variant == 'cpu' and has_nvidia_gpu():
            if progress_cb:
                progress_cb("GPU detected but torch is CPU-only — upgrading to CUDA torch first...")
            cuda_ok, cuda_msg = install_cuda_torch(progress_cb)
            if cuda_ok:
                # torchaudio was installed with CUDA torch
                to_install = [p for p in to_install if p != 'torchaudio']
            else:
                logger.warning(f"CUDA torch install failed: {cuda_msg}")
                # Continue with CPU — torchaudio will work but no GPU acceleration
        elif 'torchaudio' in to_install:
            # Install torchaudio matching current torch
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

    # Verify installation
    all_ok = True
    for pkg in packages:
        import_name = _PIP_TO_IMPORT.get(pkg, pkg.replace('-', '_'))
        if not is_package_installed(import_name):
            all_ok = False
            logger.warning(f"Package {pkg} ({import_name}) not importable after install")

    if all_ok and progress_cb:
        progress_cb(f"{display_name} packages installed successfully")

    return all_ok, f"{'All' if all_ok else 'Some'} packages installed for {backend}"


def install_backend_full(backend: str,
                          progress_cb: Optional[Callable] = None) -> Tuple[bool, str]:
    """Full install: pip packages + model weights for a backend.

    This is the main entry point — called from ai_installer, /tts/setup-engine,
    and the LangChain Setup_TTS_Engine tool.
    """
    global _installing

    if _installing.get(backend):
        return False, f"{backend} installation already in progress"

    with _install_lock:
        _installing[backend] = True

    try:
        display_name = BACKEND_DISPLAY_NAMES.get(backend, backend)
        if progress_cb:
            progress_cb(f"Setting up {display_name}...")

        # Step 1: pip packages
        if progress_cb:
            progress_cb(f"Step 1/2: Installing Python packages for {display_name}...")
        pkg_ok, pkg_msg = install_backend_packages(backend, progress_cb)
        if not pkg_ok:
            return False, pkg_msg

        # Step 2: Model weights (via huggingface_hub)
        if progress_cb:
            progress_cb(f"Step 2/2: Downloading model weights for {display_name}...")
        model_ok, model_msg = _download_model_weights(backend, progress_cb)

        success = pkg_ok and model_ok
        status = f"{'Ready' if success else 'Partial'}: packages={pkg_msg}, models={model_msg}"
        if progress_cb:
            if success:
                progress_cb(f"{display_name} is ready to use!")
            else:
                progress_cb(f"{display_name} setup incomplete: {status}")

        return success, status

    finally:
        _installing[backend] = False


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


def _download_model_weights(backend: str,
                             progress_cb: Optional[Callable] = None) -> Tuple[bool, str]:
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
    """Clear TTSEngine import cache so newly installed packages are detected.

    Also refreshes importlib's finder cache.
    """
    # Clear TTSEngine's static cache
    try:
        from tts.tts_engine import TTSEngine
        TTSEngine._import_check_cache.clear()
    except Exception:
        pass

    # Refresh importlib finders
    importlib.invalidate_caches()

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


def get_backend_status() -> Dict[str, Dict]:
    """Get installation status for all TTS backends.

    Returns dict of backend → {installed, has_model, display_name, packages_missing}.
    """
    status = {}
    for backend, packages in BACKEND_PACKAGES.items():
        missing = []
        for pkg in packages:
            import_name = _PIP_TO_IMPORT.get(pkg, pkg.replace('-', '_'))
            if not is_package_installed(import_name):
                missing.append(pkg)

        status[backend] = {
            'display_name': BACKEND_DISPLAY_NAMES.get(backend, backend),
            'installed': len(missing) == 0,
            'packages_missing': missing,
            'installing': _installing.get(backend, False),
        }
    return status


def get_recommended_backends(vram_gb: float = 0, has_gpu: bool = False) -> List[str]:
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
