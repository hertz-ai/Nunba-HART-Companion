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


def probe_err_path(backend: str) -> str:
    """Return the canonical path to a backend's probe-error file.

    ``~/Documents/Nunba/logs/probe_<backend>.err``.  Single source of
    truth — both `_write_probe_err` (writer) and downstream consumers
    in `tts.package_installer` (which include the path in error_advice
    context dicts AND read the file in `_self_heal_missing_transitives`
    to discover missing transitives) call this so the path formula
    cannot drift between writer and reader.  Underscore prefix dropped
    so `package_installer` can import it as a supported public symbol.
    """
    return os.path.join(
        os.path.expanduser('~'), 'Documents', 'Nunba', 'logs',
        f'probe_{backend}.err',
    )


def _write_probe_err(backend: str, content: str) -> None:
    """Write a backend probe failure to the canonical err-file path.

    Both the venv-routed branch and the python-embed branch of
    ``check_backend_runnable`` use this so the err-file write logic
    cannot drift between them.  Best-effort — silently no-ops on any
    OSError so a logging blunder never aborts the probe.

    The file is rewritten on each failure (not appended).  Operators
    grep this file when triaging a broken engine; the latest failure
    is what they need.
    """
    _err_file = probe_err_path(backend)
    try:
        os.makedirs(os.path.dirname(_err_file), exist_ok=True)
        with open(_err_file, 'w') as _ef:
            _ef.write(content)
    except Exception:
        pass


def _resolve_paths():
    """Resolve python-embed and user site-packages paths once."""
    global _embed_py, _usp, _tlib

    if _usp is not None:
        return _embed_py is not None

    _usp = os.path.join(os.path.expanduser('~'), '.nunba', 'site-packages')
    _tlib = os.path.join(_usp, 'torch', 'lib')

    # CUDA torch may live on a secondary drive (D:) when C: is too small
    # for the 2.5GB torch + CUDA DLLs.  Check D:/.nunba/site-packages as
    # fallback — mirrors sitecustomize.py's D: path injection.
    if not os.path.isdir(_tlib):
        _alt = os.path.join('D:\\', '.nunba', 'site-packages', 'torch', 'lib')
        if os.path.isdir(_alt):
            _tlib = _alt
            _usp = os.path.join('D:\\', '.nunba', 'site-packages')

    if sys.platform != 'win32' or not getattr(sys, 'frozen', False):
        return False

    _embed_dir = os.path.join(os.path.dirname(sys.executable), 'python-embed')
    # Prefer pythonw.exe (GUI subsystem, never creates console window)
    # over python.exe (console subsystem, briefly flashes even with CREATE_NO_WINDOW)
    for _name in ('pythonw.exe', 'python.exe'):
        candidate = os.path.join(_embed_dir, _name)
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

    PYTHONNOUSERSITE=1 mirrors the install path in package_installer._run_pip:
    without it, the user's SYSTEM Python (e.g. Python 3.12 at
    %APPDATA%/Roaming/Python/Python312/site-packages) leaks into
    python-embed's sys.path.  That leak loads the WRONG transformers /
    chatterbox / numpy and surfaces as a fake "ModuleNotFoundError"
    for s3tokenizer / einops — pip dutifully heals the named symbol,
    but the next probe still picks up the leaked package and fails
    again.  Endless heal cycle.  Set it once here; same env shape as
    every other subprocess in this codebase.
    """
    if not _resolve_paths() or not _embed_py:
        raise RuntimeError("python-embed not available")

    cmd = [_embed_py, '-c', code, _usp, _tlib]
    if extra_argv:
        cmd.extend(extra_argv)

    env = os.environ.copy()
    env['PYTHONNOUSERSITE'] = '1'

    from tts._subprocess import hidden_startupinfo
    si, cf = hidden_startupinfo()
    return subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout,
        env=env, startupinfo=si, creationflags=cf,
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

    # Guard: if torch/lib doesn't exist (CUDA torch never installed),
    # the subprocess would crash on os.add_dll_directory before it
    # could even attempt the import.  Return False cleanly so the
    # caller routes to install instead of seeing a FileNotFoundError
    # in probe_<backend>.err every probe call.  Mirrors the guard at
    # check_cuda_available() above — single behavior for both probes.
    if not os.path.isdir(_tlib):
        _backend_cache[backend] = False
        return False

    # Guard: engines with install_target='git_clone' (e.g. cosyvoice3 →
    # FunAudioLLM/CosyVoice) have no pip path.  Running `import X` on
    # them is guaranteed to fail until the user manually clones the
    # repo and pip-installs from the clone dir.  Without this guard,
    # every probe rewrites probe_<backend>.err with the same
    # ModuleNotFoundError; the dispatch path's log fills with
    # `Backend probe: <git_clone_engine> NOT importable` noise that
    # has nothing to do with a real install failure.
    #
    # If the user HAS cloned + installed (find_spec returns a real
    # location), fall through to the normal subprocess probe so a
    # post-clone install gets verified properly.  This way the guard
    # is a no-op for engines the user has already set up.
    install_target = 'main'
    try:
        from integrations.channels.media.tts_router import ENGINE_REGISTRY
        _spec = ENGINE_REGISTRY.get(backend)
        if _spec is not None:
            install_target = getattr(_spec, 'install_target', 'main') or 'main'
        if install_target == 'git_clone':
            import importlib.util as _ilu
            if _ilu.find_spec(import_name) is None:
                _backend_cache[backend] = False
                logger.debug(
                    "Backend probe: %s (%s) skipped — install_target='git_clone' "
                    "and package not yet cloned (this is expected; no install "
                    "path can fix it without a manual git clone of the upstream "
                    "repo)", backend, import_name,
                )
                return False
    except Exception:
        # HARTOS spec unreachable in dev mode → fall through to the
        # normal probe; same behavior as before this guard existed.
        pass

    # Venv-quarantined engines (install_target='venv', e.g. chatterbox_turbo,
    # indic_parler) have their packages installed into a dedicated venv at
    # ~/Documents/Nunba/data/venvs/<backend>/, NOT into python-embed.  Probing
    # the import via _run_in_embed for these engines is guaranteed-wrong:
    # python-embed never sees the package, OR it sees a stale main-interp
    # copy whose transitives diverge from the venv's pinned set.  Symptom
    # observed in probe_chatterbox_turbo.err 2026-05-07: traceback shows
    # `python-embed/Lib/site-packages/chatterbox/` (main interp) failing on
    # `import omegaconf` even though omegaconf IS installed in the venv.
    # Route the probe through invoke_in_venv to test the actual interpreter
    # that synth will run under.
    if install_target == 'venv':
        try:
            from tts.backend_venv import (
                _IMPORT_PROBE_TIMEOUT,
                invoke_in_venv,
                is_venv_healthy,
            )
        except ImportError:
            # Defensive — if backend_venv isn't importable here, fall back
            # to the embed probe (better than silently skipping).
            invoke_in_venv = None  # type: ignore
            is_venv_healthy = None  # type: ignore
            _IMPORT_PROBE_TIMEOUT = 30  # type: ignore
        if invoke_in_venv is not None:
            # ensure_venv inside invoke_in_venv would create the venv if
            # missing; for a probe we just want to test "is it usable RIGHT
            # NOW" — short-circuit when the venv directory doesn't exist.
            try:
                if is_venv_healthy is not None and not is_venv_healthy(backend):
                    _backend_cache[backend] = False
                    logger.info(
                        "Backend probe: %s (%s) NOT importable — venv at "
                        "~/Documents/Nunba/data/venvs/%s does not exist or "
                        "lacks python.exe (install_target='venv' but install "
                        "has not run)", backend, import_name, backend,
                    )
                    return False
            except Exception:
                pass
            try:
                # Reuse backend_venv's canonical _IMPORT_PROBE_TIMEOUT
                # (90s default, env-overridable via
                # NUNBA_TTS_IMPORT_PROBE_TIMEOUT) — same value
                # `is_venv_healthy` and `install_into_venv`'s post-install
                # verify already use.  Per #81: chatterbox_turbo cold-start
                # needs > 30s when CUDA initializes on import; raising the
                # ceiling once means all three probe sites get the
                # consistent timeout.  Single source of truth, no parallel
                # values.
                rc, out, err = invoke_in_venv(
                    backend, import_name, [],
                    timeout=_IMPORT_PROBE_TIMEOUT, _probe_mode=True,
                )
            except Exception as _ve:
                logger.debug("venv probe spawn failed for %s: %s", backend, _ve)
                _backend_cache[backend] = False
                return False
            ok = rc == 0
            _backend_cache[backend] = ok
            if ok:
                logger.info(
                    "Backend probe: %s (%s) importable (venv subprocess)",
                    backend, import_name,
                )
            else:
                _write_probe_err(
                    backend,
                    f"venv probe rc={rc}\n"
                    f"-- stdout --\n{out}\n-- stderr --\n{err}\n",
                )
                logger.info(
                    "Backend probe: %s (%s) NOT importable in venv "
                    "(rc=%d, see probe_%s.err)",
                    backend, import_name, rc, backend,
                )
            return ok
        # invoke_in_venv unavailable — fall through to the embed probe
        # below; not ideal but keeps the probe non-fatal.

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
            # Single source of truth for probe-err file writes (#refactor:
            # was a duplicate try/except + path-compute block prior to
            # consolidation with _write_probe_err).
            _write_probe_err(backend, r.stderr)
            logger.info("Backend probe: %s (%s) NOT importable (see probe_%s.err)",
                        backend, import_name, backend)
        return ok
    except Exception as e:
        logger.debug("Backend probe error for %s: %s", backend, e)
        _backend_cache[backend] = False
        return False
