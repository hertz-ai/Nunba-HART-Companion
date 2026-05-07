"""
tts/backend_venv.py - Per-backend virtual environment infrastructure.

Track A of the TTS-venv-isolation refactor (Phase 6). Motivation:

  The main Nunba interpreter runs transformers 5.1.0 (chatterbox_ml,
  f5, etc.). parler-tts==0.2.2 needs transformers<4.47. The two pins
  are mutually exclusive — there is no "middle-ground" dependency set.

  Solution: each backend that imposes its own transitive-dep cage
  gets its OWN venv under ~/Documents/Nunba/data/venvs/<backend>/.
  The main interpreter stays pristine; the backend's worker runs
  inside its venv via subprocess.

  tts/_torch_probe.py + integrations/service_tools/gpu_worker.py
  already run backends in subprocess. This module is the venv-aware
  layer that sits under them: the subprocess python exe is the venv's,
  not the frozen app's python-embed.

Public API
----------
  venv_root()                                 -> Path
  venv_path(backend)                          -> Path
  ensure_venv(backend, python_version="3.11") -> Path         (python exe)
  install_into_venv(backend, packages)        -> (ok, msg)
  invoke_in_venv(backend, module, args, timeout=120)
                                               -> (rc, stdout, stderr)
  is_venv_healthy(backend)                    -> bool
  wipe_venv(backend)                          -> None

Design notes
------------
  * Idempotent: ensure_venv short-circuits if the python exe already
    exists. Re-entrant-safe.
  * Survives reinstall: venvs live in the user-writable
    ~/Documents/Nunba/data/venvs/ tree (via
    core.platform_paths.get_data_dir), NOT under Program Files, so a
    Nunba uninstall/reinstall leaves them intact.
  * DRY with tts/package_installer.py: version-spec stripping goes
    through `_canonical_import_name`. The lock-file plumbing reuses
    `_acquire_file_lock` / `_release_file_lock`. Logs share the same
    ~/Documents/Nunba/logs/ directory via core.platform_paths.
  * Cross-OS: uses `sys.executable -m venv`, resolves python via
    pathlib (Scripts/python.exe on Windows, bin/python on POSIX).
  * Override hook: NUNBA_VENV_ROOT_OVERRIDE env var lets tests drop
    the venv root into tmp_path.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

logger = logging.getLogger("NunbaBackendVenv")

# Import-validate timeout for `python -c "import <pkg>"` probes.  Default
# is 90s (was 30s — too short for backends that initialize CUDA on import,
# notably chatterbox_turbo which observed a hard rc=124 timeout in
# venv_chatterbox_turbo.log on 2026-05-04).  Env-overridable so a future
# even-heavier backend can bump this without a code change.  Lower bound
# is 30s — anything below that is wishful thinking on a cold-cache start.
_IMPORT_PROBE_TIMEOUT = max(
    30, int(os.environ.get("NUNBA_TTS_IMPORT_PROBE_TIMEOUT", "90"))
)

# ── Venv root resolution ─────────────────────────────────────────────

def _reset_cache_for_tests() -> None:
    """Reset the cached venv root.  Test hook only.

    Delegates to ``core.venv_paths._reset_cache_for_tests`` since the
    actual cache moved there as part of the parallel-path elimination
    (2026-05-03).  9 journey tests (J215–J219) call this to clear state
    between cases that mutate ``NUNBA_VENV_ROOT_OVERRIDE`` — the
    forwarding here keeps them green without rewriting every call site.
    """
    from core.venv_paths import _reset_cache_for_tests as _canonical_reset
    _canonical_reset()


def venv_root() -> Path:
    """Return the root directory that holds every backend venv.

    Single source of truth lives in ``core.venv_paths.venv_root()`` so
    this install path and HARTOS's ``gpu_worker._resolve_backend_venv_python``
    spawn path can never disagree.  Returned as ``Path`` (not str) for
    backward compat with the rest of this module.
    """
    from core.venv_paths import venv_root as _canonical_venv_root
    return Path(_canonical_venv_root())


def venv_path(backend: str) -> Path:
    """Return the directory for a specific backend's venv."""
    from core.venv_paths import venv_path as _canonical_venv_path
    return Path(_canonical_venv_path(backend))


def _validate_backend_name(backend: str) -> None:
    """Reject unsafe backend names before they touch the filesystem.

    Thin shim — single source of truth lives in ``core.venv_paths``.
    Kept module-local because 5 callers in this file already use the
    bare name and the public API in PHASE6_RESULTS.md documents it
    here.
    """
    from core.venv_paths import _validate_backend_name as _canonical
    _canonical(backend)


# ── Venv python exe resolution ───────────────────────────────────────


def _python_exe_in(vpath: Path) -> Path:
    """Return the Python executable inside a venv directory."""
    if sys.platform == "win32":
        return vpath / "Scripts" / "python.exe"
    return vpath / "bin" / "python"


# ── ensure_venv ──────────────────────────────────────────────────────


def _resolve_venv_creator_python() -> str:
    """Return the path to the python interpreter that should drive
    ``python -m venv``.

    In a cx_Freeze bundled install, ``sys.executable`` is the **app
    binary** (``Nunba.exe``) — not a real Python interpreter.  Spawning
    ``Nunba.exe -m venv <path>`` boots Nunba's main entry, which sees
    the running Nunba on :5000, exits as a duplicate-instance, and
    leaves the venv directory empty.  Symptom (logged 2026-05-01):

        venv module output: 'Nunba is already running on port 5000.
        Exiting duplicate instance.'
        venv created but python exe missing at .../Scripts/python.exe

    Resolution:
      1. Frozen mode — look for ``python-embed/python.exe`` next to
         the app binary.  python.org's embeddable distribution strips
         ``Lib/venv/`` and ``Lib/ensurepip/``, which made bare
         ``python-embed/python.exe -m venv`` crash with
         ``No module named venv.__main__`` (logged 2026-05-02).  The
         build pipeline now overlays both packages from the matching
         CPython source tarball — see
         ``scripts/rebuild_python_embed.py:_overlay_venv_and_ensurepip``.
         Bundles produced after that change have a working ``venv``
         module under ``python-embed/Lib/venv/``.
      2. Dev mode — ``sys.executable`` is a real Python, use it.

    The bundled interpreter is the same Python version Nunba was
    built against, so the venv it creates is binary-compatible with
    everything Nunba already imported.
    """
    if getattr(sys, 'frozen', False):
        # Frozen — sys.executable is Nunba.exe.  Look for the bundled
        # interpreter at <app-dir>/python-embed/python.exe.
        app_dir = Path(sys.executable).resolve().parent
        candidate = app_dir / 'python-embed' / 'python.exe'
        if candidate.is_file():
            return str(candidate)
        # Linux/macOS bundle layout — interpreter typically under
        # python-embed/bin/python or similar.
        for alt in (
            app_dir / 'python-embed' / 'bin' / 'python3',
            app_dir / 'python-embed' / 'bin' / 'python',
        ):
            if alt.is_file():
                return str(alt)
        # If we somehow can't find the bundled python, raise loudly
        # rather than silently invoking Nunba.exe again — that path
        # produces the misleading "duplicate instance" error.
        raise RuntimeError(
            f"frozen mode: could not find bundled python interpreter "
            f"under {app_dir / 'python-embed'}; refusing to spawn "
            f"{sys.executable!r} which would re-launch the app and "
            f"trigger the duplicate-instance guard."
        )
    # Dev / source-run mode — sys.executable is a real Python.
    return sys.executable


def ensure_venv(backend: str, python_version: str = "3.11") -> Path:
    """Create the venv for `backend` if missing, and return its python exe.

    Idempotent — second call is a stat-check, not a re-create.

    The ``python_version`` argument is advisory in this base
    implementation (matches the operator-supplied contract) — the venv
    is created with the bundled python interpreter (frozen mode) or
    ``sys.executable`` (dev mode), see ``_resolve_venv_creator_python``.
    Cross-version virtualenv bootstrap is out of scope.  A future
    enhancement can honor the arg by shelling out to pyenv / py -<ver>
    when available.
    """
    _validate_backend_name(backend)
    vpath = venv_path(backend)
    pyexe = _python_exe_in(vpath)

    if pyexe.is_file():
        return pyexe

    vpath.parent.mkdir(parents=True, exist_ok=True)

    # Use the interpreter currently running — the venv inherits its
    # Python version. stdlib venv module is preferred over the third-
    # party virtualenv library because it ships with every Python.
    #
    # `--without-pip` keeps the venv tiny — we install pip manually
    # below only if a caller requests install_into_venv. That matches
    # user expectations on slow disks (don't download pip wheels up
    # front for a venv that might stay empty).
    #
    # Except: on Windows the bundled venv + pip is already cached, so
    # we skip --without-pip to avoid a second ensurepip roundtrip.
    creator_python = _resolve_venv_creator_python()
    cmd = [creator_python, "-m", "venv", str(vpath)]
    logger.info(
        "Creating venv for backend %r at %s (creator=%s)",
        backend, vpath, creator_python,
    )
    try:
        # Hide subprocess console window on Windows via the same helper
        # the rest of tts/ uses. Lazy import so non-Windows hosts don't
        # pay for the module load.
        si = cf = None
        if sys.platform == "win32":
            try:
                from tts._subprocess import hidden_startupinfo

                si, cf = hidden_startupinfo()
            except Exception:
                si = cf = None

        r = subprocess.run(
            cmd, capture_output=True, text=True, timeout=180,
            startupinfo=si, creationflags=cf or 0,
        )
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(
            f"venv creation for {backend!r} timed out after 180s"
        ) from e
    except FileNotFoundError as e:
        raise RuntimeError(
            f"could not spawn {creator_python!r} to create venv: {e}"
        ) from e

    if r.returncode != 0:
        # Clean up a partially-created venv so the next call isn't
        # confused by a half-built directory tree.
        try:
            if vpath.is_dir():
                shutil.rmtree(vpath, ignore_errors=True)
        except Exception:
            pass
        raise RuntimeError(
            f"venv creation failed for {backend!r}: "
            f"rc={r.returncode} stderr={r.stderr[-400:]!r}"
        )

    if not pyexe.is_file():
        raise RuntimeError(
            f"venv created but python exe missing at {pyexe} — "
            f"venv module output: {r.stdout[-400:]!r}"
        )

    logger.info("Venv ready for backend %r (python %s)", backend, pyexe)
    return pyexe


# ── install_into_venv ────────────────────────────────────────────────


def _venv_log_path(backend: str) -> Path:
    """Return the log file path for a backend's pip installs."""
    try:
        from core.platform_paths import get_log_dir  # type: ignore

        log_dir = Path(get_log_dir())
    except Exception:
        log_dir = Path.home() / "Documents" / "Nunba" / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir / f"venv_{backend}.log"


def install_into_venv(
    backend: str,
    packages: list[str],
    timeout_per_package: int = 1800,
) -> tuple[bool, str]:
    """pip-install a list of packages into the backend's venv.

    Returns ``(ok, message)``. ``ok`` is True iff every pip invocation
    exited 0 AND the resulting import name is find_spec-able inside the
    venv (verified via invoke_in_venv).

    Each package install is streamed to ~/Documents/Nunba/logs/venv_<backend>.log
    for post-hoc debugging.

    The per-package timeout defaults to 30 minutes because parler-tts
    and torch are 2GB+ downloads on slow mirrors.
    """
    _validate_backend_name(backend)
    if not packages:
        return True, f"no packages requested for {backend}"

    # DRY: use the same spec→import-name stripper as package_installer.
    # If the import fails (pure-Nunba env without HARTOS tts present),
    # a local shim does the best-effort parse.
    try:
        from tts.package_installer import _canonical_import_name  # type: ignore
    except Exception:
        import re

        def _canonical_import_name(pkg_spec: str) -> str:  # noqa: N802
            bare = re.split(r"[<>=!~]", pkg_spec, maxsplit=1)[0].strip()
            return bare.replace("-", "_")

    pyexe = ensure_venv(backend)
    log_path = _venv_log_path(backend)

    logger.info(
        "Installing %d package(s) into venv %r: %s",
        len(packages),
        backend,
        packages,
    )

    with open(log_path, "a", encoding="utf-8") as log_f:
        log_f.write(f"\n===== {time.strftime('%Y-%m-%dT%H:%M:%S')} install {packages} =====\n")
        # Diagnostic header: pyexe + cwd + sys.platform — required for
        # #82.  The 2026-04-29 indic_parler install log was 234 bytes
        # (banner only, no pip output) — root cause was a non-Timeout
        # exception raised in the subprocess.run below that NEVER got
        # logged (only TimeoutExpired was caught).  Logging pyexe up
        # front means a FileNotFoundError / OSError leaves diagnostic
        # context behind even if the subprocess raises before its
        # output makes it to disk.
        log_f.write(
            f"-- pyexe={str(pyexe)!r} exists={os.path.exists(str(pyexe))} "
            f"platform={sys.platform!r} packages_count={len(packages)}\n"
        )
        log_f.flush()

        si = cf = None
        if sys.platform == "win32":
            try:
                from tts._subprocess import hidden_startupinfo

                si, cf = hidden_startupinfo()
            except Exception:
                si = cf = None

        # Upgrade pip + setuptools + wheel.  All three are required:
        #   pip:        recent versions resolve wheels for parler-tts
        #               sdist deps (sentencepiece, descript-audio-codec).
        #   setuptools: chatterbox-tts pulls antlr4-python3-runtime==4.9.3,
        #               an old PEP 517 sdist whose default backend is
        #               ``setuptools.build_meta``.  Pip's build-isolation
        #               env tries to import that backend; if setuptools
        #               isn't installable into the parent venv (the
        #               source pip uses as a fallback when the isolation
        #               env's setuptools resolution is incomplete), the
        #               build aborts with ``BackendUnavailable: Cannot
        #               import 'setuptools.build_meta'``.  Pre-installing
        #               setuptools here covers that fallback path.
        #   wheel:      installs cleanly when sdists ARE built.
        try:
            up = subprocess.run(
                [str(pyexe), "-m", "pip", "install", "--upgrade",
                 "pip", "setuptools", "wheel"],
                capture_output=True,
                text=True,
                timeout=300,
                startupinfo=si,
                creationflags=cf or 0,
            )
            log_f.write(f"-- pip+setuptools+wheel upgrade rc={up.returncode}\n")
            log_f.write(up.stdout or "")
            log_f.write(up.stderr or "")
            log_f.flush()
        except subprocess.TimeoutExpired:
            log_f.write("-- pip+setuptools+wheel upgrade TIMEOUT (300s) — continuing\n")
            log_f.flush()
        except Exception as _up_err:
            # CATCH-ALL for #82 — pre-fix the subprocess.run raising
            # FileNotFoundError (pyexe missing) or OSError left zero
            # forensic trace.  Now we log the exception type + message
            # AND continue (return False with msg) so the upstream
            # caller can dispatch self-heal via #102's wiring.
            import traceback as _tb
            log_f.write(
                f"-- pip+setuptools+wheel upgrade FAILED with non-timeout "
                f"exception: {type(_up_err).__name__}: {_up_err}\n"
            )
            log_f.write(f"-- traceback:\n{_tb.format_exc()}\n")
            log_f.flush()
            return (
                False,
                f"pip pre-upgrade failed: {type(_up_err).__name__}: "
                f"{_up_err} (see {log_path})"
            )

        # Install packages one-by-one so a failure localises to the
        # offending spec. Retry transient failures (network blip, mirror
        # 5xx) with exponential backoff before giving up — full venv
        # rebuild on a single flake costs the user 5+ minutes.
        import random as _random
        _MAX_PIP_ATTEMPTS = 3
        _RETRY_RC = {1, 2}  # generic pip failures (network, hash mismatch)
        for pkg in packages:
            log_f.write(f"\n-- installing {pkg!r}\n")
            log_f.flush()
            r = None
            for attempt in range(1, _MAX_PIP_ATTEMPTS + 1):
                try:
                    r = subprocess.run(
                        [str(pyexe), "-m", "pip", "install", pkg],
                        capture_output=True,
                        text=True,
                        timeout=timeout_per_package,
                        startupinfo=si,
                        creationflags=cf or 0,
                    )
                except subprocess.TimeoutExpired:
                    msg = f"pip install {pkg!r} timed out after {timeout_per_package}s"
                    log_f.write(msg + "\n")
                    return False, msg
                log_f.write(r.stdout or "")
                log_f.write(r.stderr or "")
                if r.returncode == 0:
                    break
                if attempt >= _MAX_PIP_ATTEMPTS or r.returncode not in _RETRY_RC:
                    break
                # Exp backoff with jitter — 2s, 4s, 8s ± up to 25%.
                backoff = (2 ** attempt) * (1.0 + _random.uniform(-0.25, 0.25))
                log_f.write(
                    f"-- attempt {attempt}/{_MAX_PIP_ATTEMPTS} rc={r.returncode}; "
                    f"retrying in {backoff:.1f}s\n"
                )
                log_f.flush()
                time.sleep(backoff)
            log_f.flush()
            if r is None or r.returncode != 0:
                return False, (
                    f"pip install {pkg!r} failed after "
                    f"{_MAX_PIP_ATTEMPTS} attempts: "
                    f"rc={getattr(r, 'returncode', '?')} "
                    f"tail={(getattr(r, 'stderr', '') or '')[-400:]!r}"
                )

        # Verify importability inside the venv. For each pip spec, strip
        # to the import name and try `python -c "import <name>"`.
        for pkg in packages:
            mod = _canonical_import_name(pkg)
            rc, out, err = invoke_in_venv(
                backend,
                mod,
                ["--version-probe"],
                timeout=_IMPORT_PROBE_TIMEOUT,
                _probe_mode=True,
            )
            log_f.write(
                f"-- verify import {mod!r} rc={rc} out={out[:60]!r} "
                f"err={err[:120]!r}\n"
            )
            if rc != 0:
                return False, (
                    f"package {pkg!r} installed but import {mod!r} "
                    f"failed: {err[-400:]!r}"
                )

    return True, f"installed {len(packages)} package(s) into venv {backend!r}"


# ── invoke_in_venv ───────────────────────────────────────────────────


def invoke_in_venv(
    backend: str,
    module: str,
    args: list[str],
    timeout: int = 120,
    _probe_mode: bool = False,
) -> tuple[int, str, str]:
    """Run ``python -m <module> <args>`` inside the backend venv.

    Returns (returncode, stdout, stderr). Raises only on the absence of
    the venv python itself — every other failure surfaces as a non-zero
    returncode so callers can pattern-match.

    When ``_probe_mode`` is True, runs ``python -c "import <module>"``
    instead (used by install_into_venv's verify step). Keeps the
    import-probe contract DRY across callers.
    """
    _validate_backend_name(backend)
    pyexe = ensure_venv(backend)

    if _probe_mode:
        cmd = [str(pyexe), "-c", f"import {module}"]
    else:
        cmd = [str(pyexe), "-u", "-m", module, *args]

    si = cf = None
    if sys.platform == "win32":
        try:
            from tts._subprocess import hidden_startupinfo

            si, cf = hidden_startupinfo()
        except Exception:
            si = cf = None

    try:
        r = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            startupinfo=si,
            creationflags=cf or 0,
        )
    except subprocess.TimeoutExpired as e:
        return (
            124,
            e.stdout.decode("utf-8", "replace") if isinstance(e.stdout, bytes) else (e.stdout or ""),
            f"invoke_in_venv({backend!r},{module!r}) timed out after {timeout}s",
        )
    return r.returncode, r.stdout or "", r.stderr or ""


# ── is_venv_healthy ─────────────────────────────────────────────────


def is_venv_healthy(backend: str, probe_module: str | None = None) -> bool:
    """Return True iff the backend venv exists and can import its main module.

    The ``probe_module`` is the canonical import name (e.g. ``parler_tts``,
    ``chatterbox``). If not supplied, the check only validates that the
    venv's python exe exists — use this when a caller just wants to
    know "has the backend venv been created?".
    """
    try:
        _validate_backend_name(backend)
    except ValueError:
        return False
    vpath = venv_path(backend)
    pyexe = _python_exe_in(vpath)
    if not pyexe.is_file():
        return False
    if probe_module is None:
        return True
    rc, _, _ = invoke_in_venv(
        backend, probe_module, [], timeout=_IMPORT_PROBE_TIMEOUT,
        _probe_mode=True,
    )
    return rc == 0


# ── wipe_venv ────────────────────────────────────────────────────────


def wipe_venv(backend: str) -> None:
    """Delete a backend's venv. Used by Forget-Me and admin reinstall.

    No-op if the venv doesn't exist. Never raises — a failure to delete
    shouldn't block the user's Forget-Me journey.
    """
    try:
        _validate_backend_name(backend)
    except ValueError:
        return
    vpath = venv_path(backend)
    if not vpath.is_dir():
        return
    logger.info("Wiping venv for backend %r at %s", backend, vpath)
    shutil.rmtree(vpath, ignore_errors=True)
