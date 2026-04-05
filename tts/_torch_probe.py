"""
Torch CUDA Probe — subprocess check that avoids stub module poisoning.

Single source of truth for both main.py and tts_engine.py.
Passes paths via sys.argv (not f-string interpolation) to avoid code injection.
"""

import logging
import os
import sys

logger = logging.getLogger(__name__)

# Sentinel: None = not checked yet, True/False = result
_cached_result = None


def check_cuda_available() -> bool:
    """Check if CUDA torch is usable via a clean subprocess.

    Uses python-embed/python.exe (frozen builds) to avoid the stub torch
    that poisons sys.modules in the main process.

    Returns True if CUDA torch works, False otherwise.
    Thread-safe: first caller does the subprocess, subsequent callers get cached result.
    """
    global _cached_result
    if _cached_result is not None:
        return _cached_result

    # Only relevant for frozen Windows builds
    if sys.platform != 'win32' or not getattr(sys, 'frozen', False):
        _cached_result = False
        return False

    embed_py = os.path.join(os.path.dirname(sys.executable), 'python-embed', 'python.exe')
    if not os.path.isfile(embed_py):
        _cached_result = False
        return False

    usp = os.path.join(os.path.expanduser('~'), '.nunba', 'site-packages')
    tlib = os.path.join(usp, 'torch', 'lib')
    if not os.path.isdir(tlib):
        _cached_result = False
        return False

    try:
        import subprocess
        # Paths passed via sys.argv — no f-string interpolation in code (avoids injection)
        result = subprocess.run(
            [embed_py, '-c',
             'import sys,os;'
             'sys.path.insert(0,sys.argv[1]);'
             'os.add_dll_directory(sys.argv[2]) if hasattr(os,"add_dll_directory") else None;'
             'import torch;print(torch.__version__,torch.cuda.is_available())',
             usp, tlib],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode == 0:
            parts = result.stdout.strip().split()
            version = parts[0] if parts else '?'
            cuda = len(parts) > 1 and parts[1] == 'True'
            _cached_result = cuda
            logger.info("Torch probe: %s cuda=%s (subprocess)", version, cuda)
            return cuda
        else:
            logger.debug("Torch probe failed (exit %d): %s",
                         result.returncode, result.stderr[:200])
    except Exception as e:
        logger.debug("Torch probe error: %s", e)

    _cached_result = False
    return False
