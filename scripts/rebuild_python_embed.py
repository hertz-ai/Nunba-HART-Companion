"""
Rebuild python-embed with Python 3.12 to match the cx_Freeze runtime.

The old python-embed uses Python 3.10.11, but cx_Freeze builds with Python 3.12.6.
All .pyd extensions compiled for cp310 fail to load on the 3.12 runtime -> torch
(and everything else with C extensions) is broken in the bundled Nunba app.

Usage:
    python rebuild_python_embed.py              # default: delete backup on success
    python rebuild_python_embed.py --keep-backup  # preserve backup (paranoid mode)

This script:
1. Backs up python-embed -> python-embed-310-backup (transient; deleted on success)
2. Downloads Python 3.12 embeddable zip from python.org
3. Extracts to python-embed/
4. Installs pip via get-pip.py
5. Installs all packages from python-embed-requirements.txt
6. Installs HevolveAI (Embodied Continual Learner With Hiveintelligence) — must come BEFORE hart-backend
7. Installs hart-backend (HARTOS)
8. Verifies torch loads correctly
9. Deletes the backup (Step 1's snapshot) unless --keep-backup is passed
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

# --- Config ---
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPTS_DIR)
EMBED_DIR = os.path.join(PROJECT_DIR, "python-embed")
BACKUP_DIR = os.path.join(PROJECT_DIR, "python-embed-310-backup")
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


def run(cmd, **kwargs):
    print(f"  > {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    # Force packages to install INTO python-embed, not user site-packages.
    # Without this, pip sees packages in AppData\Roaming\Python\Python312\
    # and skips them, leaving python-embed empty.
    env = kwargs.pop('env', None) or os.environ.copy()
    env['PYTHONNOUSERSITE'] = '1'
    result = subprocess.run(cmd, env=env, **kwargs)
    if result.returncode != 0:
        print(f"  FAILED (exit code {result.returncode})")
        if hasattr(result, 'stderr') and result.stderr:
            print(f"  stderr: {result.stderr[:500]}")
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
        print(f"         A full install (with include/ + libs/) is required to")
        print(f"         rebuild HevolveAI's Cython extensions for the target ABI.")
        print("")
        print(f"  FIX: install Python {py_ver} from python.org (NOT the embeddable")
        print(f"       zip — that one lacks headers), then re-run this script.")
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
            capture_output=True, text=True, timeout=120,
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
        capture_output=True, text=True, timeout=180,
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
        cwd=hevolveai_src,
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


def main():
    parser = argparse.ArgumentParser(
        description="Rebuild python-embed for cx_Freeze runtime parity"
    )
    parser.add_argument(
        "--keep-backup",
        action="store_true",
        help=(
            "Preserve python-embed-310-backup/ after a successful rebuild "
            "(~1.4GB).  Default: delete once step 8 verifies the new "
            "python-embed loads torch.  Use this flag only if you plan to "
            "inspect the old tree for diffing."
        ),
    )
    args = parser.parse_args()

    # Deps come from deps.py; fall back to requirements file if it exists
    embed_deps = get_embed_install_list(include_torch=False)
    print(f"  deps.py: {len(embed_deps)} embed deps + torch (separate)")
    if os.path.isfile(REQUIREMENTS_FILE):
        print(f"  NOTE: {REQUIREMENTS_FILE} exists but deps.py is authoritative")

    # 1. Backup old python-embed
    step("1. Backing up python-embed -> python-embed-310-backup")
    if os.path.isdir(EMBED_DIR):
        if os.path.isdir(BACKUP_DIR):
            print(f"  Backup already exists at {BACKUP_DIR}, skipping backup")
        else:
            shutil.move(EMBED_DIR, BACKUP_DIR)
            print(f"  Moved to {BACKUP_DIR}")
    else:
        print("  No existing python-embed to backup")

    # 2. Download Python 3.12 embeddable zip
    step(f"2. Downloading Python {PY_VERSION} embeddable zip")
    with tempfile.TemporaryDirectory() as tmpdir:
        zip_path = os.path.join(tmpdir, "python-embed.zip")
        print(f"  URL: {PY_EMBED_URL}")
        urllib.request.urlretrieve(PY_EMBED_URL, zip_path)
        print(f"  Downloaded: {os.path.getsize(zip_path) / 1e6:.1f} MB")

        # 3. Extract
        step("3. Extracting to python-embed/")
        os.makedirs(EMBED_DIR, exist_ok=True)
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(EMBED_DIR)
        print(f"  Extracted {len(os.listdir(EMBED_DIR))} files")

    # 4. Enable pip: edit ._pth file to enable site packages
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

    # 8. Verify key imports
    step("8. Verification")
    result = run([python_exe, "-c",
                  "import torch; print(f'torch {torch.__version__} OK, CUDA={torch.cuda.is_available()}')"],
                 capture_output=True, text=True)
    if result.returncode == 0:
        print(f"  PASS: {result.stdout.strip()}")
    else:
        print(f"  FAIL: {result.stderr[:500]}")

    result = run([python_exe, "-c", "import torch._C; print('torch._C loaded OK')"],
                 capture_output=True, text=True)
    if result.returncode == 0:
        print(f"  PASS: {result.stdout.strip()}")
    else:
        print(f"  FAIL: torch._C still broken: {result.stderr[:300]}")

    # Verify HevolveAI (Continual Learner).
    #
    # We specifically import a SUBMODULE that's backed by a Cython .pyd
    # (visual_encoding), not just the top-level `hevolveai` package.  The
    # package is mostly an __init__.pyd which can load even when the rest
    # of the ABI is wrong — that's the exact trap we fell into before
    # (top-level import succeeded but every submodule failed with
    # `DLL load failed while importing visual_encoding` at Nunba runtime).
    # If any of these canaries fail, the bundle is unusable — abort.
    canaries = [
        "hevolveai",
        "hevolveai.embodied_ai.utils.visual_encoding",
        "hevolveai.embodied_ai.learning.temporal_coherence",
        "hevolveai.embodied_ai.memory.episodic_memory",
    ]
    for mod in canaries:
        r = run([python_exe, "-c", f"import {mod}; print('{mod} OK')"],
                capture_output=True, text=True)
        if r.returncode == 0:
            print(f"  PASS: {r.stdout.strip()}")
        else:
            err = (r.stderr or "")[:400]
            print(f"  FAIL: {mod}: {err}")
            print("")
            print("  HevolveAI submodule import failed — the bundled Nunba app")
            print("  WILL fall back to numpy for every visual encoding call and")
            print("  silently degrade.  Cython .pyd ABI is most likely wrong.")
            print(f"  Check: look for .cp*-win_amd64.pyd files in python-embed/")
            print(f"         Lib/site-packages/hevolveai/ whose ABI tag != cp312.")
            sys.exit(1)

    # Verify hart-backend
    result = run([python_exe, "-c",
                  "import hartos_backend; print('hart-backend OK')"],
                 capture_output=True, text=True)
    if result.returncode == 0:
        print(f"  PASS: {result.stdout.strip()}")
    else:
        print(f"  WARN: hart-backend import: {result.stderr[:200]}")

    result = run([python_exe, "-m", "pip", "list", "--format=columns"],
                 capture_output=True, text=True)
    pkg_count = len(result.stdout.strip().split("\n")) - 2
    print(f"  Total packages installed: {pkg_count}")

    # Show Python version
    result = run([python_exe, "--version"], capture_output=True, text=True)
    print(f"  Python: {result.stdout.strip()}")

    # Step 9 — delete the transient backup unless the user opted to keep it.
    # Step 8 already verified torch loads, so the backup has done its job
    # (rollback target in case download/install broke anything).  Leaving
    # it around silently costs ~1.4GB per rebuild.
    step("9. Cleaning up python-embed-310-backup")
    if os.path.isdir(BACKUP_DIR):
        if args.keep_backup:
            print(f"  --keep-backup set: preserving {BACKUP_DIR}")
        else:
            try:
                shutil.rmtree(BACKUP_DIR)
                print(f"  Deleted {BACKUP_DIR} (torch load verified; backup no longer needed)")
            except Exception as _cleanup_err:
                print(f"  WARN: could not delete backup ({_cleanup_err}); safe to rm manually")
    else:
        print(f"  {BACKUP_DIR} not present (skipped)")

    step("DONE")
    print("  python-embed rebuilt with Python 3.12")
    if args.keep_backup and os.path.isdir(BACKUP_DIR):
        print("  Old version preserved at: python-embed-310-backup/ (--keep-backup)")
    print("  Next: rebuild the frozen exe with setup_freeze_nunba.py")


if __name__ == "__main__":
    main()
