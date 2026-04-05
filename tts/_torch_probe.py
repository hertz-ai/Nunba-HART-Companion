"""
Torch CUDA Probe — subprocess checks that avoid stub module poisoning.

Single source of truth for main.py and tts_engine.py.
ALL torch/model import checks run in python-embed subprocess,
never in the main frozen process (where the stub torch poisons sys.modules).

Passes paths via sys.argv (not f-string interpolation) to avoid code injection.
"""

import logging
import os
import subprocess
import sys

logger = logging.getLogger(__name__)

# ── Shared state ──────────────────────────────────────────────────────

_embed_py = None   # Resolved once, cached
_usp = None        # User site-packages path
_tlib = None       # torch/lib DLL path


def _resolve_paths():
    """Resolve python-embed and user site-packages paths once."""
    global _embed_py, _usp, _tlib

    if _usp is not None:
        return _embed_py is not None

    _usp = os.path.join(os.path.expanduser('~'), '.nunba', 'site-packages')
    _tlib = os.path.join(_usp, 'torch', 'lib')

    if sys.platform != 'win32' or not getattr(sys, 'frozen', False):
        return False

    candidate = os.path.join(os.path.dirname(sys.executable), 'python-embed', 'python.exe')
    if os.path.isfile(candidate):
        _embed_py = candidate
        return True
    return False


def _run_in_embed(code: str, extra_argv: list = None, timeout: int = 15) -> subprocess.CompletedProcess:
    """Run Python code in python-embed subprocess with user site-packages on path.

    Args:
        code: Python code string (paths come via sys.argv, not interpolated)
        extra_argv: Additional args passed as sys.argv[3:]
        timeout: Subprocess timeout in seconds
    """
    if not _resolve_paths() or not _embed_py:
        raise RuntimeError("python-embed not available")

    cmd = [_embed_py, '-c', code, _usp, _tlib]
    if extra_argv:
        cmd.extend(extra_argv)

    # CREATE_NO_WINDOW prevents console popups on Windows
    kwargs = {}
    if sys.platform == 'win32':
        kwargs['creationflags'] = 0x08000000  # CREATE_NO_WINDOW
    return subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout, **kwargs,
    )


# ── CUDA check ────────────────────────────────────────────────────────

_cuda_cached = None


def check_cuda_available() -> bool:
    """Check if CUDA torch is usable via a clean subprocess.

    Returns True if CUDA torch works, False otherwise.
    Thread-safe: first caller does the subprocess, subsequent callers get cached result.
    """
    global _cuda_cached
    if _cuda_cached is not None:
        return _cuda_cached

    if not _resolve_paths():
        _cuda_cached = False
        return False

    if not os.path.isdir(_tlib):
        _cuda_cached = False
        return False

    try:
        r = _run_in_embed(
            'import sys,os;'
            'sys.path.insert(0,sys.argv[1]);'
            'os.add_dll_directory(sys.argv[2]) if hasattr(os,"add_dll_directory") else None;'
            'import torch;print(torch.__version__,torch.cuda.is_available())'
        )
        if r.returncode == 0:
            parts = r.stdout.strip().split()
            version = parts[0] if parts else '?'
            cuda = len(parts) > 1 and parts[1] == 'True'
            _cuda_cached = cuda
            logger.info("Torch probe: %s cuda=%s (subprocess)", version, cuda)
            return cuda
        else:
            logger.debug("Torch probe failed (exit %d): %s", r.returncode, r.stderr[:200])
    except Exception as e:
        logger.debug("Torch probe error: %s", e)

    _cuda_cached = False
    return False


# ── Backend runnable check ────────────────────────────────────────────

_backend_cache = {}   # backend_name → bool


def check_backend_runnable(backend: str, import_name: str) -> bool:
    """Check if a TTS backend can actually import + run in python-embed.

    This is the REAL runnable check — runs in a clean subprocess so the
    stub torch doesn't poison the import. Much more reliable than
    importlib.util.find_spec() which only checks if the .py file exists.

    Args:
        backend: Backend name (e.g. 'indic_parler', 'f5', 'chatterbox_turbo')
        import_name: Python import name (e.g. 'parler_tts', 'f5_tts', 'chatterbox')

    Returns True if the backend can be imported in python-embed.
    Cached per backend.
    """
    if backend in _backend_cache:
        return _backend_cache[backend]

    if not _resolve_paths():
        _backend_cache[backend] = False
        return False

    try:
        r = _run_in_embed(
            'import sys,os;'
            'sys.path.insert(0,sys.argv[1]);'
            'os.add_dll_directory(sys.argv[2]) if hasattr(os,"add_dll_directory") else None;'
            'mod=sys.argv[3];'
            'exec(f"import {mod}");'
            'print("OK")',
            extra_argv=[import_name],
            timeout=20,
        )
        ok = r.returncode == 0 and 'OK' in r.stdout
        _backend_cache[backend] = ok
        if ok:
            logger.info("Backend probe: %s (%s) importable (subprocess)", backend, import_name)
        else:
            # Write full error to file for debugging (log truncates)
            try:
                _err_file = os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba', 'logs', f'probe_{backend}.err')
                with open(_err_file, 'w') as _ef:
                    _ef.write(r.stderr)
            except Exception:
                pass
            logger.info("Backend probe: %s (%s) NOT importable (see probe_%s.err)",
                        backend, import_name, backend)
        return ok
    except Exception as e:
        logger.debug("Backend probe error for %s: %s", backend, e)
        _backend_cache[backend] = False
        return False
