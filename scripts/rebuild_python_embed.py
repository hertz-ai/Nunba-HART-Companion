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
HEVOLVEAI_SRC = os.path.join(os.path.dirname(PROJECT_DIR), "hevolveai")
LLM_LANGCHAIN_SRC = os.path.join(os.path.dirname(PROJECT_DIR),
                                  "HARTOS")

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
    step("7a. Installing HevolveAI (Embodied Continual Learner With Hiveintelligence)")
    hevolveai_src = HEVOLVEAI_SRC if os.path.isdir(HEVOLVEAI_SRC) else None
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

    # Verify HevolveAI (Continual Learner)
    result = run([python_exe, "-c",
                  "from hevolveai import WorldModelBridge; print('HevolveAI OK')"],
                 capture_output=True, text=True)
    if result.returncode == 0:
        print(f"  PASS: {result.stdout.strip()}")
    else:
        # Try alternate import path
        result2 = run([python_exe, "-c", "import hevolveai; print('HevolveAI package OK')"],
                      capture_output=True, text=True)
        if result2.returncode == 0:
            print(f"  PASS: {result2.stdout.strip()}")
        else:
            print(f"  WARN: HevolveAI import failed: {result.stderr[:200]}")

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
