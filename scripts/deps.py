"""
deps.py - Centralized dependency management for Nunba

Single source of truth for:
  - App version (VERSION)
  - Python embed version (PYTHON_EMBED_VERSION)
  - All pip dependencies with pinned versions
  - Platform-specific dependencies

Every build script (build.py, setup_freeze_nunba.py, setup_freeze_mac.py,
rebuild_python_embed.py) imports from here. To bump a version or add a dep,
edit THIS file only.
"""
import sys

# =============================================================================
# Version -- the ONE place this lives
# =============================================================================
VERSION = "0.1.0"
PYTHON_EMBED_VERSION = "3.12.6"

# =============================================================================
# Core Dependencies (venv -- cx_Freeze traced)
#
# These are installed into the build venv so cx_Freeze can trace their import
# graphs and bundle them into the frozen executable. None = latest (no pin).
# =============================================================================
CORE_DEPS = {
    # Web framework
    "flask": "3.1.2",
    "flask-cors": "6.0.2",
    "werkzeug": "3.1.5",
    "waitress": "3.0.2",
    # Desktop GUI -- pywebview + pyautogui need a windowing system at
    # IMPORT time (Quartz on macOS, Win32 on Windows, X11/Wayland on
    # Linux).  Headless Linux CI runners (no DISPLAY) USED TO fail on
    # import, blocking the python-quality matrix even though zero tests
    # touch desktop UI.  CI now installs requirements-test.txt (minimal,
    # no GUI deps); requirements.txt remains the production install.
    "pywebview": "6.1",
    "pyautogui": "0.9.54",
    "pyperclip": "1.11.0",
    "pillow": "12.1.1",
    # API framework
    "uvicorn": "0.40.0",
    "fastapi": "0.133.0",
    "starlette": "0.52.1",
    "pydantic": "2.12.5",
    # Database
    "sqlalchemy": "2.0.46",
    "alembic": "1.18.4",
    "greenlet": "3.3.1",
    # Network / messaging
    "requests": "2.32.5",
    "certifi": "2026.1.4",
    "autobahn": "25.12.2",
    "autobahn[serialization]": None,
    "autobahn[twisted]": None,
    "crossbarhttp3": "1.1",
    # Geo
    "shapely": "2.1.2",
    # Build tooling
    "cx_Freeze": "8.5.3",
    # Data -- must be pip wheel (not conda) for proper DLL loading
    "numpy": "1.26.4",
    # LangChain -- ALL pinned to prevent pip backtracking
    "langchain-classic": "1.0.1",
    "langchain-community": "0.4.1",
    "langchain-core": "1.2.15",
    "langchain-text-splitters": "1.1.1",
    "langsmith": "0.7.6",
    # TTS
    "piper-tts": "1.4.1",
    "onnxruntime": "1.24.1",
    "soundfile": "0.13.1",
    # Monitoring
    "sentry-sdk[flask]": "2.52.0",
    # Auth
    "google-auth": "2.48.0",
    "cachetools": "7.0.1",
    "PyJWT": "2.11.0",
    # HARTOS runtime deps (--no-deps install skips these)
    "autogen-agentchat": "0.2.37",
    "apscheduler": "3.11.2",
    "json-repair": "0.57.1",
    "beautifulsoup4": "4.14.3",
    "PyPDF2": "3.0.1",
    "redis": "7.1.1",
    "websockets": "16.0",
    "python-multipart": "0.0.22",
    "coloredlogs": "15.0.1",
    "pandas": "3.0.0",
    "python-jose": "3.5.0",
    "pytz": "2025.2",
    "aiohttp": "3.13.3",
    "python-dotenv": "1.2.1",
    "cryptography": "46.0.5",
}

# =============================================================================
# Embed Dependencies (python-embed -- heavy ML, excluded from cx_Freeze)
#
# These live in python-embed/ and are loaded at runtime via sys.path injection.
# cx_Freeze explicitly excludes torch, tensorflow, etc. to keep the frozen exe
# small. The frozen app adds python-embed/Lib/site-packages to sys.path.
# =============================================================================
EMBED_DEPS = {
    # PyTorch (CPU-only default -- installed via --index-url pytorch)
    # CUDA variant swapped in at runtime by tts/package_installer.py if GPU detected
    "torch": "2.10.0",
    "torchaudio": "2.10.0",
    # Transformers / embeddings
    "transformers": "5.1.0",
    "sentence-transformers": "5.2.2",
    "tokenizers": "0.22.2",
    "safetensors": "0.7.0",
    "huggingface_hub": "1.4.1",
    # transformers/torch deps that must live inside python-embed because the
    # frozen Nunba app sets PYTHONNOUSERSITE=1 (app.py:61), so gpu_worker
    # subprocesses spawned from python-embed/python.exe CAN'T see the cx_Freeze
    # lib/ numpy/regex/tqdm/yaml. Without these pins every transformers-based TTS
    # worker (Indic Parler, Chatterbox, F5) crashes on load.
    "regex": "2024.11.6",
    "numpy": "1.26.4",
    "tqdm": "4.67.1",
    "pyyaml": "6.0.2",
    "packaging": None,  # transformers dependency_versions_check requires metadata
    "accelerate": None, # transformers checks at import; light package (~5MB)
    "sentencepiece": None, # transformers dependency_versions_check
    # sympy + mpmath: torch 2.10 declares `sympy>=1.13.3` and torch._dynamo
    # imports sympy at the top of torch/utils/_sympy/functions.py.  Indic
    # Parler TTS (and every transformers-backed generator that hits
    # torch.fx.experimental.symbolic_shapes) crashes with
    # `ModuleNotFoundError: No module named 'sympy'` when missing.
    # Pin to 1.14.0 (matches torch 2.10's own pinned install).  mpmath is
    # the one hard sympy dep (mpmath<1.4,>=1.1.0) — listed explicitly so
    # the embed install doesn't silently drop it when --no-deps is used.
    "sympy": "1.14.0",
    "mpmath": "1.3.0",
    # NOTE: descript-audio-codec (dac) is NOT here — it pulls a massive
    # transitive tree (descript-audiotools → librosa → scipy → matplotlib).
    # It's installed at RUNTIME by install_backend_full('indic_parler')
    # into ~/.nunba/site-packages/ via pip.  The gpu_worker subprocess
    # finds it there via sitecustomize.py path injection.
    # Vector DB
    "chromadb": "1.5.0",
    "faiss-cpu": "1.13.2",
    # Vision — 4.10.x is last line supporting numpy<2 (autogen-agentchat needs numpy<2)
    "opencv-python": "4.10.0.84",
    # ML
    "scikit-learn": "1.7.2",
    # Tokenization
    "tiktoken": "0.12.0",
    # LangGraph (agent orchestration -- runs in python-embed context)
    "langchain": "1.2.10",
    "langchain-core": "1.2.15",
    "langgraph": "1.0.8",
    "langsmith": "0.7.6",
    # TTS engines -- ALL installed at runtime by tts/package_installer.py via
    # pip --target to ~/.nunba/site-packages (avoids pinning conflicts — e.g.
    # chatterbox-tts pins torch==2.6.0 + numpy<1.26, which would break our
    # torch==2.10.0 + numpy==1.26.4 base).  Removed from requirements.txt so
    # `pip install -r requirements.txt` doesn't ResolutionImpossible.
}

# =============================================================================
# Platform-Specific Dependencies
# =============================================================================
PLATFORM_DEPS = {
    "win32": {
        "pystray": "0.19.5",
        "win10toast": "0.9",
        "pywin32": "311",
    },
    "darwin": {
        "rumps": None,
        "pystray": "0.19.5",
        "pyobjc-framework-Cocoa": None,
    },
    "linux": {
        "pystray": "0.19.5",
    },
}

# =============================================================================
# Test/CI Dependencies
#
# MINIMAL set installed by .github/workflows/quality.yml on the cross-OS
# matrix (ubuntu + windows + macos).  Excludes:
#   - Desktop GUI (pywebview, pyautogui — fail import on headless Linux CI
#     runners that lack X11/Wayland; would block the entire matrix).
#   - Heavy ML (torch, transformers, faiss, chromadb — multi-GB downloads
#     that 10x runner cost without buying signal for ruff/pytest unit tests).
#   - Build tooling (cx_Freeze — only the build job needs it).
#
# ALL pytest fixtures and unit tests must work against this minimal set.
# If a test imports a heavy dep, mock it (see tests/conftest_cuda_mock.py
# for the synthetic_cuda fixture pattern) or skip with a clear reason.
# =============================================================================
TEST_DEPS = {
    "pytest": "8.4.2",
    "pytest-html": "4.2.0",
    "flask": CORE_DEPS["flask"],
    "flask-cors": CORE_DEPS["flask-cors"],
    "werkzeug": CORE_DEPS["werkzeug"],
    "requests": CORE_DEPS["requests"],
    "pydantic": CORE_DEPS["pydantic"],
    "sqlalchemy": CORE_DEPS["sqlalchemy"],
    "PyJWT": CORE_DEPS["PyJWT"],
    "pyyaml": EMBED_DEPS["pyyaml"],
    "cryptography": CORE_DEPS["cryptography"],
}


# =============================================================================
# Torch install config (CPU-only for the build -- hardware-agnostic base)
#
# Ships CPU torch (~200MB) which works on any hardware. At runtime,
# tts/package_installer.py detects NVIDIA GPU via nvidia-smi and
# auto-upgrades to CUDA torch (install_cuda_torch, ~2.5GB one-time download).
# This way the installer stays small and works everywhere.
# =============================================================================
TORCH_INDEX_URL = "https://download.pytorch.org/whl/cpu"


# =============================================================================
# Helper Functions
# =============================================================================

def _format_dep(name, version):
    """Format a dependency as 'name==version' or just 'name' if no pin."""
    if version is None:
        return name
    return f"{name}=={version}"


def get_venv_install_list(platform=None):
    """Get flat list of 'pkg==ver' strings for venv pip install.

    Includes CORE_DEPS + platform-specific deps for the given platform.
    """
    if platform is None:
        platform = sys.platform

    deps = [_format_dep(name, ver) for name, ver in CORE_DEPS.items()]

    plat_deps = PLATFORM_DEPS.get(platform, {})
    deps.extend(_format_dep(name, ver) for name, ver in plat_deps.items())

    return deps


def get_embed_install_list(include_torch=False):
    """Get flat list of 'pkg==ver' strings for python-embed pip install.

    Torch and torchaudio are excluded by default -- they need the special
    --index-url for CUDA variant and are installed separately.
    Pass include_torch=True to include them.
    """
    _torch_pkgs = {"torch", "torchaudio"}
    deps = []
    for name, ver in EMBED_DEPS.items():
        if name in _torch_pkgs and not include_torch:
            continue
        deps.append(_format_dep(name, ver))
    return deps


def get_torch_spec():
    """Get torch version string for special CPU install."""
    ver = EMBED_DEPS.get("torch")
    if ver:
        return f"torch=={ver}"
    return "torch"


# =============================================================================
# python-embed invalidation helpers
#
# build.py preserves python-embed/ across builds (it's a ~2GB snapshot).
# Without an invalidation trigger, any EMBED_DEPS addition (e.g. pinning
# `regex`, `tqdm`, `pyyaml`) never propagates — a stale snapshot from a
# previous build is reused forever.  That caused the Indic Parler
# `ModuleNotFoundError: No module named 'regex'` regression three times.
#
# Two layers of defense:
#   1. Hash gate: if EMBED_DEPS changes, invalidate the snapshot.
#   2. Presence gate: even if hash matches, verify every EMBED_DEPS
#      package has a directory in site-packages and top-up any that
#      don't.  Survives the case where someone manually touched
#      python-embed but didn't bump the hash.
# =============================================================================

def compute_embed_deps_hash() -> str:
    """Stable hash of EMBED_DEPS content + Python ABI version.

    Used by build.py as the invalidation key for python-embed/.  Any
    addition, removal, or version bump in EMBED_DEPS changes the hash,
    which triggers a rebuild.  Independent of dict ordering.

    PYTHON_EMBED_VERSION is folded in because a Python minor-version
    bump (e.g. 3.11.x -> 3.12.x) changes the CPython ABI tag baked
    into every compiled extension (.pyd / .so).  Without that in the
    hash, a cached python-embed from a prior Python version is reused
    and the extensions inside it fail to load against the new ABI
    -- exactly the ABI-mismatch that caused the 3.11 -> 3.12 regression
    fixed in rebuild_python_embed.py (commit ec5533c5).  Folding the
    Python version into the hash guarantees any ABI-relevant change
    invalidates the snapshot automatically.

    Formatting note: the 'python==' line is prefixed so future sorted
    dict entries can never collide with it (no real pypi package is
    named 'python').
    """
    import hashlib
    payload_lines = [f'python=={PYTHON_EMBED_VERSION}']
    payload_lines.extend(f'{k}=={v}' for k, v in sorted(EMBED_DEPS.items()))
    payload = '\n'.join(payload_lines)
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()[:16]


# Package name → site-packages directory name.  Most packages use
# name.replace('-', '_'), but a few normalize differently.  List only
# the exceptions; fall back to the default mapping for everything else.
_EMBED_DIR_EXCEPTIONS = {
    'pyyaml': 'yaml',
    'faiss-cpu': 'faiss',
    'opencv-python': 'cv2',
    'scikit-learn': 'sklearn',
    'huggingface_hub': 'huggingface_hub',
    'sentence-transformers': 'sentence_transformers',
    'langchain-core': 'langchain_core',
    'tiktoken': 'tiktoken',
    # descript-audio-codec → 'dac' mapping not needed in EMBED_DEPS
    # (installed at runtime by install_backend_full, not build-time)
}


def embed_package_dir_name(pkg_name: str) -> str:
    """Map a pip package name to its import/site-packages directory name."""
    return _EMBED_DIR_EXCEPTIONS.get(pkg_name, pkg_name.replace('-', '_'))


def missing_embed_packages(site_packages_dir: str) -> list[str]:
    """Return list of EMBED_DEPS package names whose install directory
    is absent from the given site-packages path.

    Used after the hash gate as a belt-and-braces check: catches cases
    where the snapshot has the right hash but a prior slim step or
    manual edit removed a package directory.
    """
    import os
    missing = []
    for name in EMBED_DEPS:
        dir_name = embed_package_dir_name(name)
        if not os.path.isdir(os.path.join(site_packages_dir, dir_name)):
            missing.append(name)
    return missing


def get_all_deps():
    """Get combined dict of all deps for auditing."""
    all_deps = {}
    all_deps.update(CORE_DEPS)
    all_deps.update(EMBED_DEPS)
    for plat_deps in PLATFORM_DEPS.values():
        all_deps.update(plat_deps)
    return all_deps


def generate_requirements(output_path='requirements.txt', platform=None):
    """Generate requirements.txt from deps.py -- the single source of truth.

    All deployment modes (dev, build, CI) use this generated file.
    """
    if platform is None:
        platform = sys.platform

    lines = [
        "# AUTO-GENERATED from scripts/deps.py -- DO NOT EDIT MANUALLY",
        "# Regenerate: python scripts/deps.py requirements",
        f"# Nunba {VERSION} | Python Embed {PYTHON_EMBED_VERSION}",
        "",
    ]

    # Group deps by category (use comments from CORE_DEPS ordering)
    for name, ver in CORE_DEPS.items():
        lines.append(_format_dep(name, ver))

    # Python-embed deps (torch, transformers, regex, tqdm, pyyaml, etc.).
    # These MUST live inside python-embed/Lib/site-packages because the
    # frozen app sets PYTHONNOUSERSITE=1, so gpu_worker subprocesses can't
    # see cx_Freeze lib/.  Include them in requirements.txt so CI + builds
    # install them into the python-embed target.
    lines.append("")
    lines.append("# Python-embed deps (transformers/torch worker deps)")
    for name, ver in EMBED_DEPS.items():
        lines.append(_format_dep(name, ver))

    # Platform-specific (use PEP 508 markers so one file works everywhere)
    _marker_map = {
        "win32": 'sys_platform == "win32"',
        "darwin": 'sys_platform == "darwin"',
        "linux": 'sys_platform == "linux"',
    }
    lines.append("")
    lines.append("# Platform-conditional dependencies")
    for plat_key, plat_deps in PLATFORM_DEPS.items():
        marker = _marker_map.get(plat_key, f'sys_platform == "{plat_key}"')
        for name, ver in plat_deps.items():
            dep_str = _format_dep(name, ver)
            lines.append(f"{dep_str}; {marker}")

    with open(output_path, 'w') as f:
        f.write('\n'.join(lines) + '\n')

    count = sum(1 for l in lines if l and not l.startswith('#'))
    print(f"Generated {output_path} ({count} deps, platform={platform})")
    return output_path


def generate_test_requirements(output_path='requirements-test.txt'):
    """Generate the MINIMAL CI test requirements file.

    Cross-OS-safe: no GUI deps (would fail on headless Linux runners),
    no heavy ML (would 10x runner cost without buying signal for ruff/
    pytest unit tests), no build tooling (only the build job needs it).

    .github/workflows/quality.yml installs THIS file instead of
    requirements.txt so the python-quality matrix succeeds on
    ubuntu + windows + macos without provisioning X11 / CUDA.
    """
    lines = [
        "# AUTO-GENERATED from scripts/deps.py -- DO NOT EDIT MANUALLY",
        "# Regenerate: python scripts/deps.py test-requirements",
        f"# Nunba {VERSION} — minimal CI test deps (no GUI, no heavy ML)",
        "#",
        "# Used by .github/workflows/quality.yml on the cross-OS matrix.",
        "# Production install uses requirements.txt (full set).",
        "",
    ]
    for name, ver in TEST_DEPS.items():
        lines.append(_format_dep(name, ver))
    with open(output_path, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print(f"Generated {output_path} ({len(TEST_DEPS)} test deps)")
    return output_path


def version_tuple():
    """Return version as tuple of ints, e.g. (2, 0, 0)."""
    return tuple(int(x) for x in VERSION.split("."))


def version_win32():
    """Return 4-part Windows version string, e.g. '2.0.0.0'."""
    parts = VERSION.split(".")
    while len(parts) < 4:
        parts.append("0")
    return ".".join(parts[:4])


def version_short():
    """Return short version for setup() calls, e.g. '2.0'."""
    parts = VERSION.split(".")
    return ".".join(parts[:2])


# =============================================================================
# CLI: print deps for debugging / requirements generation
# =============================================================================
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Nunba dependency manager")
    parser.add_argument("command",
                        choices=["version", "venv", "embed", "all", "requirements"],
                        help="What to print/generate")
    parser.add_argument("--platform", default=sys.platform,
                        help="Platform for venv/requirements deps (win32/darwin/linux)")
    parser.add_argument("-o", "--output", default="requirements.txt",
                        help="Output path for 'requirements' command")
    args = parser.parse_args()

    if args.command == "version":
        print(VERSION)
    elif args.command == "venv":
        for dep in get_venv_install_list(args.platform):
            print(dep)
    elif args.command == "embed":
        for dep in get_embed_install_list(include_torch=True):
            print(dep)
    elif args.command == "requirements":
        generate_requirements(args.output, args.platform)
    elif args.command == "all":
        print(f"# Nunba {VERSION} -- All Dependencies")
        print(f"# Python Embed: {PYTHON_EMBED_VERSION}")
        print(f"# Core: {len(CORE_DEPS)}, Embed: {len(EMBED_DEPS)}, "
              f"Platform: {sum(len(v) for v in PLATFORM_DEPS.values())}")
        for name, ver in sorted(get_all_deps().items()):
            print(_format_dep(name, ver))
