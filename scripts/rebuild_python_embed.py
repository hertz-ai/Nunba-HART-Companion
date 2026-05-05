"""
Rebuild python-embed with Python 3.12 to match the cx_Freeze runtime.

The old python-embed uses Python 3.10.11, but cx_Freeze builds with Python 3.12.6.
All .pyd extensions compiled for cp310 fail to load on the 3.12 runtime -> torch
(and everything else with C extensions) is broken in the bundled Nunba app.

Atomic forward-only build:
  All work happens inside ``python-embed.building/`` (the scratch dir).
  The live ``python-embed/`` tree is never touched until the very last
  step — an atomic rename that ONLY runs after every install + every
  verification has passed.  On any failure the scratch dir is preserved
  for forensics and the live tree is left exactly as it was, so the
  build process never ships a half-finished python-embed.  The script
  exits non-zero on failure, and ``scripts/build.py`` aborts the build
  rather than packaging a stale or broken bundle.

  No backup / restore step.  Recovery is forward-only: re-run after
  fixing the underlying error.

Usage:
    python rebuild_python_embed.py             # full rebuild (default)
    python rebuild_python_embed.py --overlay-only
        # apply venv + ensurepip + launcher overlay to the existing
        # python-embed/ in place — useful when deps are unchanged
        # but the overlay is missing.

This script:
1. Prepares the scratch dir (deletes any leftover from a prior failed run)
2. Downloads Python 3.12 embeddable zip from python.org -> scratch
3. Extracts to scratch
3b. Overlays venv + ensurepip + launcher binaries onto scratch
4. Configures ._pth + creates Lib/site-packages in scratch
5. Installs pip via get-pip.py into scratch
6. Installs all packages from deps.py into scratch
7. Installs HevolveAI (Embodied Continual Learner With Hiveintelligence)
   then hart-backend, then writes sitecustomize.py into scratch
8. Verifies torch + torch._C + every HevolveAI Cython submodule load.
   ANY failure here aborts the rebuild (scratch retained, live tree
   untouched).
9. Atomic swap: rename live python-embed -> .discard, scratch -> live,
   then delete .discard.  Only reached if every prior step succeeded.
"""

import argparse
import datetime
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile

# --- Config ---
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPTS_DIR)
# Atomic rebuild model: build into a scratch dir, atomic-swap into the
# live location only after end-to-end verification succeeds.  EMBED_DIR
# below points at the SCRATCH dir during rebuild — every helper that
# writes into "python-embed" goes into the scratch tree.  EMBED_DIR_FINAL
# is the canonical install location used by build.py + the cx_Freeze
# build.  --overlay-only mode points EMBED_DIR at the live tree because
# it patches in place (no atomic swap needed for a tiny <10MB overlay).
EMBED_DIR_FINAL = os.path.join(PROJECT_DIR, "python-embed")
EMBED_DIR = EMBED_DIR_FINAL + ".building"
# Snapshot of a previously-working python-embed kept around when a
# rebuild detects the live tree is broken.  Suffix is the date the
# rescue snapshot was taken.  No automatic restore is performed —
# operator copies it back manually if the new build misbehaves.  The
# dir-name pattern is asserted by tests/test_rebuild_python_embed.py
# (must start with PROJECT_DIR + contain 'backup' lower-cased).
BACKUP_DIR = os.path.join(PROJECT_DIR, "python-embed-backup")
REQUIREMENTS_FILE = os.path.join(SCRIPTS_DIR, "python-embed-requirements.txt")
HARTOS_BACKEND_SRC = os.path.join(PROJECT_DIR, "hartos_backend_src")

def _find_sibling(name):
    """Resolve a sibling repo path, preferring _deps/ (CI) over ../name (local dev)."""
    parent = os.path.dirname(PROJECT_DIR)
    candidates = [
        os.path.join(PROJECT_DIR, "_deps", name),   # CI: actions/checkout
        os.path.join(parent, name),                  # local dev
        os.path.join(parent, name.lower()),          # local dev (lowercase variant)
    ]
    for c in candidates:
        if os.path.isdir(c):
            return c
    return candidates[1]  # return the ../name path so warning messages show a useful hint

HEVOLVEAI_SRC = _find_sibling("hevolveai")
LLM_LANGCHAIN_SRC = _find_sibling("HARTOS")

# Import version + deps from centralized deps.py
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)
from deps import EMBED_DEPS, PYTHON_EMBED_VERSION, TORCH_INDEX_URL, get_embed_install_list, get_torch_spec

PY_VERSION = PYTHON_EMBED_VERSION
PY_EMBED_URL = f"https://www.python.org/ftp/python/{PY_VERSION}/python-{PY_VERSION}-embed-amd64.zip"
PY_GETPIP_URL = "https://bootstrap.pypa.io/get-pip.py"


def step(msg):
    print(f"\n{'='*60}\n  {msg}\n{'='*60}")


def _overlay_venv_and_ensurepip():
    """Restore venv + ensurepip + their launcher .exe files in the
    embeddable distribution.

    The python.org Windows embeddable distribution intentionally
    strips three things needed for `python -m venv` to work:

      1. ``Lib/venv/`` — the venv module itself
      2. ``Lib/ensurepip/`` — bootstraps pip into a new venv
      3. ``venvlauncher.exe`` + ``venvwlauncher.exe`` — Windows
         redirector binaries that the venv module copies into the
         new venv as its ``python.exe`` / ``pythonw.exe``

    Without them, runtime venv creation fails:
      - Without (1):  ``No module named venv.__main__``
      - Without (1)+(2):  venv module imports but `ensurepip` errors on
        ``--with-pip`` (default)
      - Without (3):  venv creates structure then errors out:
        ``Unable to copy 'venvlauncher.exe'`` and the new venv has
        no ``python.exe``.

    Source for (1)+(2): python.org's source tarball (pure-Python,
    version-locked, ZIP-extractable on every OS).
    Source for (3): NuGet ``python`` package — Microsoft's official
    redistribution of the regular Windows install as a portable ZIP.
    Same version, same launcher binaries the regular installer ships.

    Total overlay size: ~6 MB (mostly the pip+setuptools wheels in
    ``ensurepip/_bundled/`` and the two launcher binaries).

    Verified post-overlay by:
      a. ``python.exe -m venv --help`` exits 0 (module reachable)
      b. ``python.exe -m venv --without-pip <tmp>`` produces a
         ``python.exe`` inside ``<tmp>/Scripts/`` (launcher reachable)
    """
    with tempfile.TemporaryDirectory() as tmp:
        # ---- Part 1: Lib/venv + Lib/ensurepip from source tarball ----
        src_url = f"https://www.python.org/ftp/python/{PY_VERSION}/Python-{PY_VERSION}.tgz"
        print(f"  Source tarball: {src_url}")
        tgz_path = os.path.join(tmp, "python-source.tgz")
        urllib.request.urlretrieve(src_url, tgz_path)
        size_mb = os.path.getsize(tgz_path) / 1e6
        print(f"  Downloaded: {size_mb:.1f} MB")

        prefix = f"Python-{PY_VERSION}/Lib/"
        wanted_pkgs = ("venv", "ensurepip")
        with tarfile.open(tgz_path, "r:gz") as tf:
            members = [
                m for m in tf.getmembers()
                if any(m.name.startswith(f"{prefix}{p}/") for p in wanted_pkgs)
                or m.name in {f"{prefix}{p}.py" for p in wanted_pkgs}
            ]
            if not members:
                raise RuntimeError(
                    f"venv/ensurepip not found inside {src_url} — "
                    f"PY_VERSION={PY_VERSION} may be wrong"
                )
            tf.extractall(tmp, members=members)  # noqa: S202 — source is python.org tarball verified by URL pin + filtered member list

        src_lib = os.path.join(tmp, f"Python-{PY_VERSION}", "Lib")
        dst_lib = os.path.join(EMBED_DIR, "Lib")
        os.makedirs(dst_lib, exist_ok=True)

        for pkg in wanted_pkgs:
            src_pkg = os.path.join(src_lib, pkg)
            dst_pkg = os.path.join(dst_lib, pkg)
            if not os.path.isdir(src_pkg):
                raise RuntimeError(
                    f"missing {pkg}/ in extracted source under {src_lib}"
                )
            if os.path.isdir(dst_pkg):
                shutil.rmtree(dst_pkg)
            shutil.copytree(src_pkg, dst_pkg)
            file_count = sum(len(files) for _, _, files in os.walk(dst_pkg))
            byte_count = sum(
                os.path.getsize(os.path.join(r, f))
                for r, _, files in os.walk(dst_pkg)
                for f in files
            )
            print(f"  Overlaid Lib/{pkg}/ — {file_count} files, "
                  f"{byte_count / 1e6:.1f} MB")

        # ---- Part 2: venvlauncher.exe + venvwlauncher.exe from NuGet ----
        # NuGet's "python" package is Microsoft's official redistribution
        # of the regular Windows install as a portable ZIP; it includes
        # the launcher .exe files that the embeddable strips.  URL is
        # stable across versions (just swap the version segment).
        nuget_url = f"https://globalcdn.nuget.org/packages/python.{PY_VERSION}.nupkg"
        print(f"  NuGet package: {nuget_url}")
        nupkg_path = os.path.join(tmp, "python.nupkg")
        try:
            urllib.request.urlretrieve(nuget_url, nupkg_path)
        except Exception as e:
            raise RuntimeError(
                f"failed to download NuGet python package from {nuget_url}: "
                f"{e!r}"
            ) from e
        size_mb = os.path.getsize(nupkg_path) / 1e6
        print(f"  Downloaded: {size_mb:.1f} MB")

        # Python 3.12+ venv looks for the launcher at
        # ``Lib/venv/scripts/nt/{python,pythonw}.exe`` first
        # (CPython 3.12.6 source: Lib/venv/__init__.py:284-287), then
        # falls back to legacy ``<base>/venvlauncher.exe``.  We use the
        # modern path so a venv create succeeds without leaning on the
        # fallback. NuGet's regular Python install ships the launcher
        # templates at exactly that relative path under tools/.
        launcher_arc_to_local = {
            "tools/Lib/venv/scripts/nt/python.exe":
                os.path.join("Lib", "venv", "scripts", "nt", "python.exe"),
            "tools/Lib/venv/scripts/nt/pythonw.exe":
                os.path.join("Lib", "venv", "scripts", "nt", "pythonw.exe"),
        }
        with zipfile.ZipFile(nupkg_path) as zf:
            for arc_name, local_path in launcher_arc_to_local.items():
                try:
                    member = zf.getinfo(arc_name)
                except KeyError:
                    raise RuntimeError(
                        f"{arc_name} not found in NuGet python "
                        f"{PY_VERSION}; package layout may have changed"
                    )
                dst_full = os.path.join(EMBED_DIR, local_path)
                os.makedirs(os.path.dirname(dst_full), exist_ok=True)
                with zf.open(member) as src, open(dst_full, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                size_kb = os.path.getsize(dst_full) / 1024
                print(f"  Overlaid {local_path} — {size_kb:.0f} KB")

    # Verify the overlay end-to-end.  Two checks:
    #   (a) the venv module is reachable (--help exits 0)
    #   (b) creating an actual venv produces a working python.exe.
    # Catching both protects against a partial overlay where the .py
    # modules land but the launchers don't (or vice versa).
    py_exe = os.path.join(EMBED_DIR, "python.exe")
    print(f"  Verifying (a): {py_exe} -m venv --help ...")
    result = subprocess.run(
        [py_exe, "-m", "venv", "--help"],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"venv module verification failed (rc={result.returncode})\n"
            f"  stdout: {(result.stdout or '')[:300]}\n"
            f"  stderr: {(result.stderr or '')[:300]}"
        )

    with tempfile.TemporaryDirectory() as smoke_tmp:
        smoke_venv = os.path.join(smoke_tmp, "smoke_venv")
        print(f"  Verifying (b): {py_exe} -m venv --without-pip {smoke_venv}")
        result2 = subprocess.run(
            [py_exe, "-m", "venv", "--without-pip", smoke_venv],
            capture_output=True, text=True, timeout=60,
        )
        smoke_py = os.path.join(smoke_venv, "Scripts", "python.exe")
        if result2.returncode != 0 or not os.path.isfile(smoke_py):
            raise RuntimeError(
                f"venv launcher verification failed (rc={result2.returncode})\n"
                f"  stdout: {(result2.stdout or '')[:300]}\n"
                f"  stderr: {(result2.stderr or '')[:300]}\n"
                f"  smoke venv python.exe present? {os.path.isfile(smoke_py)}"
            )
    print("  OK: venv module + launcher overlay verified end-to-end")


def run(cmd, check=True, **kwargs):
    """Run a subprocess and raise on non-zero rc unless ``check=False``.

    Forward-only rebuild: install steps must NOT cascade silently.  A
    failed pip install is the difference between a working python-embed
    and a half-baked one that would later fail in cx_Freeze with the
    real cause buried under hundreds of lines of import errors.  Default
    behavior is "raise immediately" so the surrounding try/except in
    main() catches the failure, prints the postscript, and exits clean.

    Use ``check=False`` for verification-style calls where the caller
    inspects ``result.returncode`` itself (e.g. probing whether torch
    loads, listing installed packages).
    """
    print(f"  > {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    # Force packages to install INTO python-embed, not user site-packages.
    # Without this, pip sees packages in AppData\Roaming\Python\Python312\
    # and skips them, leaving python-embed empty.
    env = kwargs.pop('env', None) or os.environ.copy()
    env['PYTHONNOUSERSITE'] = '1'
    result = subprocess.run(cmd, env=env, **kwargs)
    if result.returncode != 0:
        _cmd_str = ' '.join(cmd) if isinstance(cmd, list) else cmd
        print(f"  FAILED (exit code {result.returncode}): {_cmd_str}")
        if hasattr(result, 'stderr') and result.stderr:
            print(f"  stderr: {result.stderr[:500]}")
        if check:
            raise subprocess.CalledProcessError(
                result.returncode, cmd,
                output=getattr(result, 'stdout', None),
                stderr=getattr(result, 'stderr', None),
            )
    return result


def _query_embed_abi_tag(python_exe):
    """Return the CPython ABI tag of python-embed, e.g. 'cp312'."""
    result = subprocess.run(
        [python_exe, "-c",
         "import sys; print(f'cp{sys.version_info.major}{sys.version_info.minor}')"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def _scan_pyd_abis(pkg_dir):
    """Walk pkg_dir and classify every *.pyd by its ABI tag.

    Returns (by_tag, untagged) where by_tag maps 'cp312' -> [paths...] and
    untagged is the list of .pyd files without a recognizable ABI suffix.
    """
    import re
    tag_re = re.compile(r'\.(cp\d+)-win_amd64\.pyd$')
    by_tag = {}
    untagged = []
    for root, _dirs, files in os.walk(pkg_dir):
        for fname in files:
            if not fname.endswith('.pyd'):
                continue
            path = os.path.join(root, fname)
            m = tag_re.search(fname)
            if m:
                by_tag.setdefault(m.group(1), []).append(path)
            else:
                untagged.append(path)
    return by_tag, untagged


def _find_matching_host_python(target_tag):
    """Locate a FULL CPython install (with include/ and libs/) matching target_tag.

    python-embed is a minimal runtime — it ships WITHOUT Python.h and
    python3XX.lib, so it cannot compile C extensions.  To rebuild HevolveAI's
    Cython extensions we need a full host Python install at the same
    version as python-embed (so the resulting .pyd ABI tag matches).

    Search order:
      1. `sys.executable` if its version matches target_tag.
      2. Python Launcher (`py -<major.minor>`), the default Windows
         installation flow.

    Returns absolute path to python.exe, or None.  None triggers an
    abort with clear instructions — automatic rebuild is not possible
    without a matching full Python install.
    """
    import re
    m = re.match(r'cp(\d)(\d+)$', target_tag)
    if not m:
        return None
    major, minor = int(m.group(1)), int(m.group(2))

    def _has_build_headers(pyexe):
        # A full CPython install puts Python.h at <prefix>/include/Python.h
        # and python3XX.lib at <prefix>/libs/python3XX.lib.  python-embed
        # skips both, which is how we distinguish embed from full install.
        base = os.path.dirname(pyexe)
        return (os.path.isfile(os.path.join(base, "include", "Python.h")) and
                os.path.isdir(os.path.join(base, "libs")))

    # 1. Self, if version matches.
    if sys.version_info.major == major and sys.version_info.minor == minor:
        if _has_build_headers(sys.executable):
            return sys.executable

    # 2. Windows `py` launcher — resolves e.g. `py -3.12` to the registered
    # Python 3.12 install, which is a full install (include/ + libs/) by
    # default.  Stdin must be closed to prevent py.exe from blocking on
    # interactive prompts (it can prompt if no matching version exists).
    try:
        r = subprocess.run(
            ["py", f"-{major}.{minor}", "-c",
             "import sys; print(sys.executable)"],
            capture_output=True, text=True, timeout=15, stdin=subprocess.DEVNULL,
        )
        if r.returncode == 0:
            candidate = r.stdout.strip()
            if candidate and os.path.isfile(candidate) and _has_build_headers(candidate):
                return candidate
    except (OSError, subprocess.TimeoutExpired, FileNotFoundError):
        pass

    return None


def _rebuild_hevolveai_cython(python_exe, hevolveai_src):
    """Rebuild HevolveAI's Cython extensions with python-embed's ABI.

    HevolveAI's MANIFEST.in copies .pyd files into the install as-is (no
    Cython recompile), so whatever ABI they were built under is the ABI
    that lands in python-embed.  If that doesn't match python-embed's
    Python version, every compiled submodule fails to load at runtime
    with `DLL load failed` (the missing DLL is the wrong-version
    python3XX.dll).  Rebuilding in-place here before `pip install`
    guarantees alignment.

    Build interpreter selection:
      - We CANNOT use python-embed itself — it lacks include/ + libs/
        needed for C extension compilation.
      - We locate a FULL CPython install at the same major.minor via
        _find_matching_host_python().  Its ABI tag matches python-embed.

    Build isolation:
      - A scratch venv at <hevolveai_src>/_build_venv_<tag>/ avoids
        polluting the host Python's site-packages with build-time deps
        (cython, setuptools, wheel).  The venv is removed on success.

    If MSVC Build Tools are absent the Cython compile step WILL fail.
    We surface a clear remediation message rather than let the build
    continue and emit a broken Nunba bundle.
    """
    target_tag = _query_embed_abi_tag(python_exe)
    if not target_tag:
        print("  WARN: could not query python-embed ABI tag; skipping rebuild")
        return

    pkg_dir = os.path.join(hevolveai_src, "src", "hevolveai")
    if not os.path.isdir(pkg_dir):
        print(f"  NOTE: {pkg_dir} not found — hevolveai may be pure-Python; skipping")
        return

    # Pre-scan: what ABIs are currently present?
    by_tag, _untagged = _scan_pyd_abis(pkg_dir)
    pre_counts = {tag: len(paths) for tag, paths in by_tag.items()}
    print(f"  Target ABI: .{target_tag}-win_amd64.pyd")
    print(f"  Current .pyd counts by ABI: {pre_counts or 'none'}")

    # Early-out: if every .pyd already matches and there are no stragglers,
    # skip the expensive rebuild.  This makes reruns cheap.
    if pre_counts.get(target_tag, 0) > 0 and len(pre_counts) == 1:
        print(f"  All {pre_counts[target_tag]} .pyd files already match target ABI; skipping rebuild")
        return

    # Locate a build interpreter — needs full include/ + libs/.
    build_python = _find_matching_host_python(target_tag)
    if not build_python:
        py_ver = f"{target_tag[2]}.{target_tag[3:]}"  # cp312 -> 3.12
        print(f"  ERROR: no full CPython {py_ver} install found on host.")
        print("         A full install (with include/ + libs/) is required to")
        print("         rebuild HevolveAI's Cython extensions for the target ABI.")
        print("")
        print(f"  FIX: install Python {py_ver} from python.org (NOT the embeddable")
        print("       zip — that one lacks headers), then re-run this script.")
        print(f"       Or make sure `py -{py_ver}` resolves to your Python {py_ver}.")
        sys.exit(1)
    print(f"  Build interpreter: {build_python}")

    # Delete stale .pyd files from the source tree that DON'T match target ABI.
    # Without this, `pip install` would copy them anyway (MANIFEST grabs
    # everything that ends in .pyd), bloating python-embed with dead weight
    # AND making it harder to spot if the rebuild silently did nothing.
    removed = 0
    for tag, paths in by_tag.items():
        if tag == target_tag:
            continue
        for path in paths:
            try:
                os.remove(path)
                removed += 1
            except OSError as e:
                print(f"  WARN: could not delete stale {os.path.basename(path)}: {e}")
    if removed:
        print(f"  Removed {removed} stale .pyd files with non-{target_tag} ABI")

    # Scratch venv for build-time deps.  Isolates cython/setuptools/wheel
    # from the host Python's site-packages.  Named after the ABI tag so
    # concurrent builds for different targets don't clobber each other.
    venv_dir = os.path.join(hevolveai_src, f"_build_venv_{target_tag}")
    if os.path.isdir(venv_dir):
        print(f"  Reusing existing build venv: {venv_dir}")
    else:
        print(f"  Creating build venv: {venv_dir}")
        venv_result = run(
            [build_python, "-m", "venv", venv_dir],
            check=False, capture_output=True, text=True, timeout=120,
        )
        if venv_result.returncode != 0:
            print("  ERROR: venv creation failed.")
            print(f"  stderr: {(venv_result.stderr or '')[:400]}")
            sys.exit(1)

    venv_python = os.path.join(venv_dir, "Scripts", "python.exe")
    if not os.path.isfile(venv_python):
        print(f"  ERROR: venv python not at expected path: {venv_python}")
        sys.exit(1)

    # Install build-time deps into the venv.
    print("  Installing Cython/setuptools/wheel into build venv...")
    cy_install = run(
        [venv_python, "-m", "pip", "install",
         "cython", "setuptools", "wheel",
         "--no-warn-script-location"],
        check=False, capture_output=True, text=True, timeout=180,
    )
    if cy_install.returncode != 0:
        print("  ERROR: Cython install failed; rebuild cannot proceed.")
        print(f"  pip stderr: {(cy_install.stderr or '')[:400]}")
        sys.exit(1)

    # Run the rebuild.  Long timeout — setup_cython.py compiles ~150 files;
    # MSVC cl.exe is slow on Windows.  30 minutes is generous but bounded.
    # The venv python matches python-embed's major.minor, so the .pyd tags
    # produced here will match python-embed's ABI.
    print(f"  Rebuilding Cython extensions in {pkg_dir} ...")
    build_result = run(
        [venv_python, "setup_cython.py"],
        check=False, cwd=hevolveai_src,
        timeout=1800,
    )
    if build_result.returncode != 0:
        print("  ERROR: HevolveAI Cython rebuild FAILED.")
        print("  Most likely cause: MSVC Build Tools missing.")
        print("  Fix: install 'Desktop development with C++' from:")
        print("       https://visualstudio.microsoft.com/visual-cpp-build-tools/")
        print("  Then re-run this script.")
        sys.exit(1)

    # Post-scan: verify new .pyd landed for target ABI.
    by_tag_post, _ = _scan_pyd_abis(pkg_dir)
    post_match = len(by_tag_post.get(target_tag, []))
    if post_match == 0:
        print(f"  ERROR: rebuild produced zero .{target_tag}-win_amd64.pyd files.")
        print("  Something is wrong with setup_cython.py — check its output above.")
        sys.exit(1)
    print(f"  Rebuild OK: {post_match} .{target_tag}-win_amd64.pyd files present")

    # Spot-check a critical submodule that frame_store.py relies on.
    canary = os.path.join(pkg_dir, "embodied_ai", "utils",
                          f"visual_encoding.{target_tag}-win_amd64.pyd")
    if not os.path.isfile(canary):
        print(f"  WARN: canary {os.path.basename(canary)} missing after rebuild.")
        print("  frame_store.try_import_hevolveai_names() will fall back to numpy.")
    else:
        print(f"  Canary present: {os.path.relpath(canary, hevolveai_src)}")


def _print_failure_postscript():
    """Diagnostic block printed whenever the rebuild aborts.

    The cardinal rule of the forward-only design: if anything fails,
    the live ``python-embed/`` is unchanged and the scratch tree is
    left intact for forensics.  A subsequent re-run will wipe the
    scratch dir at step 1 and start fresh.
    """
    print()
    print("  Rebuild ABORTED — atomic swap NOT performed.")
    if os.path.isdir(EMBED_DIR_FINAL):
        print(f"  Live tree (untouched):   {EMBED_DIR_FINAL}")
    else:
        print(f"  Live tree:               {EMBED_DIR_FINAL} (does not exist)")
    if os.path.isdir(EMBED_DIR):
        try:
            sz = sum(
                os.path.getsize(os.path.join(r, f))
                for r, _, files in os.walk(EMBED_DIR)
                for f in files
            ) / 1e6
            print(f"  Scratch tree (forensic): {EMBED_DIR} ({sz:.0f} MB)")
        except OSError:
            print(f"  Scratch tree (forensic): {EMBED_DIR}")
    print()
    print("  Re-run after fixing the underlying error.  The next run")
    print("  will wipe the scratch dir at step 1 and start fresh.")


def _do_overlay_only():
    """Apply the venv + ensurepip + launcher overlay to the live tree.

    Useful when EMBED_DEPS is unchanged (so a full rebuild would be
    wasteful) but the existing ``python-embed/`` predates the overlay.
    Modifies the live tree in place — the overlay only adds files
    (Lib/venv/, Lib/ensurepip/, the two launcher .exe binaries), so a
    crash mid-overlay leaves the tree usable for everything else; the
    next run can simply re-apply.
    """
    if not os.path.isdir(EMBED_DIR_FINAL):
        print(f"  ERROR: {EMBED_DIR_FINAL} does not exist.")
        print( "         --overlay-only patches an existing python-embed in place.")
        print( "         Run without --overlay-only to do a full rebuild.")
        sys.exit(1)
    # _overlay_venv_and_ensurepip() writes into module-level EMBED_DIR.
    # In overlay-only mode we want it to write into the LIVE tree, so
    # rebind EMBED_DIR for the duration of this call.
    global EMBED_DIR
    saved = EMBED_DIR
    EMBED_DIR = EMBED_DIR_FINAL
    try:
        step(f"Overlay-only: applying venv + ensurepip + launcher onto {EMBED_DIR_FINAL}")
        _overlay_venv_and_ensurepip()
    finally:
        EMBED_DIR = saved
    print()
    print("  Overlay applied successfully.")


def _atomic_swap():
    """Replace EMBED_DIR_FINAL with the freshly built scratch tree.

    Reached only after step 8 verification has succeeded.  Sequence:
      1. Move existing live tree -> ``<live>.discard-<timestamp>``
      2. Move scratch tree -> live location
      3. Best-effort rmtree of the discarded prior tree

    Step 1 is atomic on Windows when both source and target are on the
    same volume (which they always are — sibling dirs in PROJECT_DIR).
    Step 2 is similarly atomic.  If step 3 fails (file held open by
    another process, antivirus lock, etc.) the build is still complete
    and correct — leftover dir is safe to rm manually later.
    """
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    discard_dir = f"{EMBED_DIR_FINAL}.discard-{timestamp}"
    if os.path.isdir(EMBED_DIR_FINAL):
        print(f"  Moving live tree aside: {EMBED_DIR_FINAL} -> {os.path.basename(discard_dir)}")
        os.rename(EMBED_DIR_FINAL, discard_dir)
    print(f"  Promoting scratch:      {os.path.basename(EMBED_DIR)} -> {os.path.basename(EMBED_DIR_FINAL)}")
    os.rename(EMBED_DIR, EMBED_DIR_FINAL)
    if os.path.isdir(discard_dir):
        try:
            shutil.rmtree(discard_dir)
            print(f"  Removed prior tree:     {os.path.basename(discard_dir)}")
        except OSError as _e:
            print(f"  WARN: could not remove {discard_dir}: {_e}")
            print( "        Build is complete and correct; safe to delete manually.")


def main():
    parser = argparse.ArgumentParser(
        description="Rebuild python-embed for cx_Freeze runtime parity"
    )
    parser.add_argument(
        "--overlay-only",
        action="store_true",
        help=(
            "Apply only the venv + ensurepip + launcher overlay to the "
            "EXISTING python-embed/ in place.  Skips download + pip install "
            "+ verification.  Use when deps are unchanged but the overlay "
            "is missing from a prior snapshot."
        ),
    )
    args = parser.parse_args()

    if args.overlay_only:
        _do_overlay_only()
        return

    # Forward-only atomic rebuild: every step writes to the scratch dir.
    # Live python-embed/ is untouched until _atomic_swap() at the end,
    # which only runs if every install + verify succeeds.
    try:
        _run_rebuild_steps()
    except SystemExit:
        # A step called sys.exit(N) explicitly (e.g. canary failure).
        # Diagnostic was already printed; just emit the standard
        # postscript so the user sees the scratch path + next steps.
        _print_failure_postscript()
        raise
    except BaseException as e:
        # subprocess.CalledProcessError, network failure, disk full,
        # KeyboardInterrupt, anything else.  The live tree is safe.
        print()
        print(f"  FATAL: {type(e).__name__}: {e}")
        _print_failure_postscript()
        sys.exit(1)


def _run_rebuild_steps():
    """Execute steps 1-9 of the atomic rebuild.

    Every step writes into ``EMBED_DIR`` (the scratch tree).  Step 9
    is the atomic swap into ``EMBED_DIR_FINAL``.  Any uncaught
    exception leaves the scratch tree in place and the live tree
    untouched.
    """
    # Deps come from deps.py; fall back to requirements file if it exists
    embed_deps = get_embed_install_list(include_torch=False)
    print(f"  deps.py: {len(embed_deps)} embed deps + torch (separate)")
    if os.path.isfile(REQUIREMENTS_FILE):
        print(f"  NOTE: {REQUIREMENTS_FILE} exists but deps.py is authoritative")

    # 1. Prepare the scratch dir.  Forward-only design: we never touch
    # EMBED_DIR_FINAL until step 9's atomic swap, which only runs after
    # every install + every verification has passed.
    step("1. Preparing scratch dir for atomic build")
    if os.path.isdir(EMBED_DIR):
        print(f"  Removing leftover scratch dir: {EMBED_DIR}")
        shutil.rmtree(EMBED_DIR)
    print(f"  Scratch dir:        {EMBED_DIR}")
    print(f"  Live (swap target): {EMBED_DIR_FINAL} (untouched until step 9)")

    # 2. Download Python 3.12 embeddable zip
    step(f"2. Downloading Python {PY_VERSION} embeddable zip")
    with tempfile.TemporaryDirectory() as tmpdir:
        zip_path = os.path.join(tmpdir, "python-embed.zip")
        print(f"  URL: {PY_EMBED_URL}")
        urllib.request.urlretrieve(PY_EMBED_URL, zip_path)
        print(f"  Downloaded: {os.path.getsize(zip_path) / 1e6:.1f} MB")

        # 3. Extract into the scratch dir
        step("3. Extracting to python-embed.building/")
        os.makedirs(EMBED_DIR, exist_ok=True)
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(EMBED_DIR)  # noqa: S202 — source is python.org embed zip verified by URL pin
        print(f"  Extracted {len(os.listdir(EMBED_DIR))} files")

    # 4. Enable pip: edit ._pth file to enable site packages.
    #
    # MUST run BEFORE step 3b's overlay verification.  The default
    # embeddable ._pth ships with only ``python312.zip`` and ``.`` on
    # sys.path — it does NOT include ``Lib``.  Without ``Lib`` in the
    # path the freshly overlaid ``Lib/venv/`` is unreachable and
    # ``python -m venv --help`` fails with ``No module named venv``,
    # which aborts the rebuild at step 3b.  We therefore configure
    # ._pth first so that step 3b's verification gates can actually
    # find the overlay it just dropped on disk.
    step("4. Configuring ._pth for site packages")
    pth_files = [f for f in os.listdir(EMBED_DIR) if f.endswith("._pth")]
    if pth_files:
        pth_path = os.path.join(EMBED_DIR, pth_files[0])
        with open(pth_path) as f:
            content = f.read()
        # Uncomment "import site" and add Lib path
        content = content.replace("#import site", "import site")
        if "import site" not in content:
            content += "\nimport site\n"
        # Add Lib to path
        if "Lib" not in content:
            content = "Lib\n" + content
        with open(pth_path, "w") as f:
            f.write(content)
        print(f"  Updated {pth_files[0]}")

    # Create Lib/site-packages directory
    sp_dir = os.path.join(EMBED_DIR, "Lib", "site-packages")
    os.makedirs(sp_dir, exist_ok=True)

    # 3b. Restore venv + ensurepip from the regular Python source.
    # The embeddable distribution strips both, which breaks every
    # runtime `python -m venv` call (TTS backend isolation, etc.).
    # See _overlay_venv_and_ensurepip() docstring for full rationale.
    # Runs AFTER step 4 so the overlay's own verification (`python
    # -m venv --help`) can see Lib on sys.path.
    step("3b. Overlaying venv + ensurepip from CPython source")
    _overlay_venv_and_ensurepip()

    # 5. Install pip
    step("5. Installing pip via get-pip.py")
    getpip_path = os.path.join(EMBED_DIR, "get-pip.py")
    urllib.request.urlretrieve(PY_GETPIP_URL, getpip_path)
    python_exe = os.path.join(EMBED_DIR, "python.exe")
    run([python_exe, getpip_path, "--no-warn-script-location"])
    os.remove(getpip_path)

    # Verify pip
    result = run([python_exe, "-m", "pip", "--version"], capture_output=True, text=True)
    if result.returncode == 0:
        print(f"  pip installed: {result.stdout.strip()}")
    else:
        print("  ERROR: pip installation failed!")
        sys.exit(1)

    # 6. Install packages from deps.py (centralized dependency management)
    step("6. Installing packages from deps.py (this may take a while)")
    # Install setuptools + wheel first (needed to build source dists)
    print("  Installing setuptools + wheel...")
    run([python_exe, "-m", "pip", "install",
         "setuptools", "wheel",
         "--no-warn-script-location"], timeout=120)

    # Install torch first (needs special --index-url for CUDA variant)
    torch_spec = get_torch_spec()
    torchaudio_ver = EMBED_DEPS.get("torchaudio")
    torchaudio_spec = f"torchaudio=={torchaudio_ver}" if torchaudio_ver else "torchaudio"
    print(f"  Installing {torch_spec} + {torchaudio_spec} from {TORCH_INDEX_URL}...")
    run([python_exe, "-m", "pip", "install",
         torch_spec, torchaudio_spec,
         "--index-url", TORCH_INDEX_URL,
         "--no-warn-script-location"], timeout=600)

    # Install remaining embed deps from deps.py
    print(f"  Installing {len(embed_deps)} embed dependencies...")
    run([python_exe, "-m", "pip", "install"] + embed_deps +
        ["--no-warn-script-location",
         "--no-deps"],  # no-deps to avoid pulling unexpected versions
        timeout=600)

    # Resolve any missing transitive deps
    print("  Resolving transitive dependencies...")
    run([python_exe, "-m", "pip", "install"] + embed_deps +
        ["--no-warn-script-location"],
        timeout=600)

    # 7. Install HevolveAI (Continual Learner) — MUST come before hart-backend
    #    hart-backend declares `embodied-ai @ git+...` as a dependency;
    #    pre-installing from local avoids the private git fetch.
    hevolveai_src = HEVOLVEAI_SRC if os.path.isdir(HEVOLVEAI_SRC) else None

    # 7a-prebuild: Align HevolveAI .pyd ABI with python-embed.
    #
    # HevolveAI ships as Cython-compiled binaries.  Its MANIFEST.in is:
    #     recursive-exclude src *.py
    #     recursive-include src *.pyd
    # so `pip install <hevolveai_src>` copies the pre-built .pyd files AS-IS
    # and does NOT rebuild them.  If those .pyd were built under Python 3.11
    # (e.g. someone ran build_hevolveai.bat with conda's 3.11 on PATH), they
    # arrive in python-embed tagged `.cp311-win_amd64.pyd` — and the bundled
    # Python 3.12 silently refuses to load them.  Failure mode at Nunba
    # runtime: `ImportError: DLL load failed while importing visual_encoding`
    # (python311.dll is not bundled).  The frame_store.py fallback to numpy
    # makes the damage invisible: HevolveAI's visual encoder is just gone.
    #
    # Fix: ALWAYS rebuild the Cython extensions using python-embed's own
    # python.exe right before install.  Tag is guaranteed to match.
    if hevolveai_src:
        step("7a-prebuild. Rebuilding HevolveAI Cython extensions with target ABI")
        _rebuild_hevolveai_cython(python_exe, hevolveai_src)

    step("7a. Installing HevolveAI (Embodied Continual Learner With Hiveintelligence)")
    if hevolveai_src:
        run([python_exe, "-m", "pip", "install", hevolveai_src,
             "--no-warn-script-location", "--no-deps"], timeout=120)
        print(f"  Installed from {hevolveai_src}")
    else:
        print(f"  WARNING: HevolveAI not found at {HEVOLVEAI_SRC}, skipping")

    # 7b. Install hart-backend (non-editable for cx_Freeze compatibility)
    step("7b. Installing hart-backend")
    hevolve_src = None
    if os.path.isdir(HARTOS_BACKEND_SRC):
        hevolve_src = HARTOS_BACKEND_SRC
    elif os.path.isdir(LLM_LANGCHAIN_SRC):
        hevolve_src = LLM_LANGCHAIN_SRC

    if hevolve_src:
        run([python_exe, "-m", "pip", "install", hevolve_src,
             "--no-warn-script-location", "--no-deps"], timeout=120)
        print(f"  Installed from {hevolve_src}")
    else:
        print("  WARNING: hart-backend source not found, skipping")

    # 7c. Write sitecustomize.py — injects ~/.nunba/site-packages at the
    # FRONT of sys.path for every python-embed subprocess. Without this,
    # gpu_worker subprocesses spawned by the frozen Nunba app can't see
    # the real CUDA torch that install_gpu_torch() drops into
    # ~/.nunba/site-packages — they get the 0.0.0 stub instead, and every
    # transformers-based TTS/VLM worker crashes with torch.types missing.
    # PYTHONPATH doesn't help because python-embed's _pth file disables it.
    step("7c. Writing sitecustomize.py (~/.nunba/site-packages injector)")
    sitecustomize_path = os.path.join(sp_dir, "sitecustomize.py")
    with open(sitecustomize_path, "w", encoding="utf-8") as f:
        f.write('''"""sitecustomize.py — auto-runs at Python startup via site.py.

Injects ~/.nunba/site-packages at the FRONT of sys.path so that gpu_worker
subprocesses spawned by the frozen Nunba app can see the real CUDA torch,
numpy, transformers deps, etc. that get installed there at runtime by
install_gpu_torch().

python-embed uses a `_pth` file which disables PYTHONPATH processing,
so environment-based injection doesn't work — we have to modify sys.path
from within Python itself. sitecustomize is the standard CPython hook.

Also appends the cx_Freeze lib/ directory as a last-resort fallback for
deps that happen to be bundled there but not in python-embed.
"""

import os
import sys


def _inject_path(path, front=True):
    if os.path.isdir(path) and path not in sys.path:
        if front:
            sys.path.insert(0, path)
        else:
            sys.path.append(path)


_home = os.path.expanduser("~")
_nunba_sp = os.path.join(_home, ".nunba", "site-packages")
_inject_path(_nunba_sp, front=True)

# CUDA torch may live on D: when C: is too small (2.5GB install).
# install_gpu_torch() falls back to D: on ENOSPC.
_nunba_sp_d = os.path.join("D:\\\\", ".nunba", "site-packages")
_inject_path(_nunba_sp_d, front=True)

if sys.platform == "win32":
    for _sp in [_nunba_sp, _nunba_sp_d]:
        _torch_lib = os.path.join(_sp, "torch", "lib")
        if os.path.isdir(_torch_lib):
            try:
                os.add_dll_directory(_torch_lib)
            except (OSError, AttributeError):
                pass
            os.environ["PATH"] = _torch_lib + os.pathsep + os.environ.get("PATH", "")
            break  # first found wins

# cx_Freeze lib/ — only present inside frozen Nunba build
_self = os.path.dirname(os.path.abspath(__file__))
_embed_dir = os.path.dirname(os.path.dirname(_self))
_app_dir = os.path.dirname(_embed_dir)
_lib_dir = os.path.join(_app_dir, "lib")
_inject_path(_lib_dir, front=False)
''')
    print(f"  Wrote: {sitecustomize_path}")

    # 8. Verification — HARD GATE for the atomic swap.
    #
    # All checks below run with check=False so we can collect every
    # failure into _failures rather than aborting on the first one
    # (more diagnostic value).  At the end of step 8 we inspect the
    # list: if anything critical failed, sys.exit(1) — which the outer
    # main() catches and turns into a clean abort with the postscript.
    # The atomic swap (_atomic_swap()) is only reached when this list
    # is empty.
    step("8. Verification (hard gate — atomic swap only on full pass)")
    _failures = []

    def _verify(label, cmd, critical=True, _capture=True):
        r = run(cmd, check=False, capture_output=True, text=True)
        if r.returncode == 0:
            print(f"  PASS: {label}: {(r.stdout or '').strip() or 'ok'}")
            return True
        err_head = (r.stderr or r.stdout or '').strip()[:400]
        if critical:
            print(f"  FAIL: {label}: {err_head}")
            _failures.append((label, err_head))
        else:
            print(f"  WARN (non-critical): {label}: {err_head}")
        return False

    _verify("torch import",
            [python_exe, "-c",
             "import torch; print(f'torch {torch.__version__} CUDA={torch.cuda.is_available()}')"])
    _verify("torch._C load",
            [python_exe, "-c", "import torch._C; print('torch._C OK')"])
    _verify("transformers import",
            [python_exe, "-c",
             "import transformers; print(f'transformers {transformers.__version__}')"])

    # HevolveAI (Continual Learner) Cython submodules.
    #
    # We specifically import SUBMODULES backed by Cython .pyd files
    # (visual_encoding, etc.), not just the top-level `hevolveai`
    # package.  The package is mostly an __init__.pyd which can load
    # even when the rest of the ABI is wrong — that's the exact trap
    # we fell into before (top-level import succeeded but every
    # submodule failed with `DLL load failed while importing
    # visual_encoding` at Nunba runtime).  If any canary fails the
    # bundle is unusable, so they're critical.
    canaries = [
        "hevolveai",
        "hevolveai.embodied_ai.utils.visual_encoding",
        "hevolveai.embodied_ai.learning.temporal_coherence",
        "hevolveai.embodied_ai.memory.episodic_memory",
    ]
    for mod in canaries:
        _verify(f"hevolveai canary: {mod}",
                [python_exe, "-c", f"import {mod}; print('{mod} OK')"])

    # hart-backend is non-critical at this stage — its install can
    # legitimately fail in dev setups where the source tree isn't
    # checked out, and the cx_Freeze step can still bundle.  Surface
    # the failure but don't block the swap.
    _verify("hart-backend import",
            [python_exe, "-c", "import hartos_backend; print('hart-backend OK')"],
            critical=False)

    # Informational — package count + python version
    pkg_list = run([python_exe, "-m", "pip", "list", "--format=columns"],
                   check=False, capture_output=True, text=True)
    if pkg_list.returncode == 0:
        pkg_count = len((pkg_list.stdout or '').strip().split("\n")) - 2
        print(f"  Total packages installed: {pkg_count}")
    pyver = run([python_exe, "--version"], check=False,
                capture_output=True, text=True)
    if pyver.returncode == 0:
        print(f"  Python: {(pyver.stdout or '').strip()}")

    if _failures:
        print()
        print(f"  {len(_failures)} critical verification(s) FAILED:")
        for label, err in _failures:
            print(f"    - {label}")
            for ln in err.splitlines()[:4]:
                print(f"        {ln}")
        print()
        print("  HevolveAI submodule failure means Nunba's visual encoder")
        print("  would silently fall back to numpy at runtime.  Refusing")
        print("  to ship.")
        print("  Look for .cp*-win_amd64.pyd files in")
        print(f"  {EMBED_DIR}/Lib/site-packages/hevolveai/")
        print("  whose ABI tag != cp312.")
        sys.exit(1)

    # 9. Atomic swap — verification passed, promote scratch to live.
    # This is the ONLY moment EMBED_DIR_FINAL is touched in the entire
    # rebuild.  After the swap the scratch dir no longer exists.
    step("9. Atomic swap: python-embed.building -> python-embed")
    _atomic_swap()

    step("DONE")
    print("  python-embed rebuilt with Python 3.12 and atomic-swapped into place")
    print("  Next: rebuild the frozen exe with setup_freeze_nunba.py")


if __name__ == "__main__":
    main()
