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
# Version — the ONE place this lives
# =============================================================================
VERSION = "2.0.0"
PYTHON_EMBED_VERSION = "3.12.6"

# =============================================================================
# Core Dependencies (venv — cx_Freeze traced)
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
    # Desktop GUI
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
    # Data — must be pip wheel (not conda) for proper DLL loading
    "numpy": "1.26.4",
    # LangChain — ALL pinned to prevent pip backtracking
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
# Embed Dependencies (python-embed — heavy ML, excluded from cx_Freeze)
#
# These live in python-embed/ and are loaded at runtime via sys.path injection.
# cx_Freeze explicitly excludes torch, tensorflow, etc. to keep the frozen exe
# small. The frozen app adds python-embed/Lib/site-packages to sys.path.
# =============================================================================
EMBED_DEPS = {
    # PyTorch (CPU-only default — installed via --index-url pytorch)
    # CUDA variant swapped in at runtime by tts/package_installer.py if GPU detected
    "torch": "2.10.0",
    "torchaudio": "2.10.0",
    # Transformers / embeddings
    "transformers": "5.1.0",
    "sentence-transformers": "5.2.2",
    "tokenizers": "0.22.2",
    "safetensors": "0.7.0",
    "huggingface_hub": "1.4.1",
    # Vector DB
    "chromadb": "1.5.0",
    "faiss-cpu": "1.13.2",
    # Vision
    "opencv-python": "4.13.0.92",
    # ML
    "scikit-learn": "1.7.2",
    # Tokenization
    "tiktoken": "0.12.0",
    # LangGraph (agent orchestration — runs in python-embed context)
    "langchain": "1.2.10",
    "langchain-core": "1.2.15",
    "langgraph": "1.0.8",
    "langsmith": "0.7.6",
    # TTS engines — GPU engines auto-download models on first use
    "chatterbox-tts": None,       # Chatterbox Turbo (English, [laugh]/[chuckle])
    "parler-tts": None,           # Indic Parler (21 Indian langs + English)
    # f5-tts and cosyvoice are NOT pip-installable — handled by package_installer
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
# Torch install config (CPU-only for the build — hardware-agnostic base)
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

    Torch and torchaudio are excluded by default — they need the special
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


def get_all_deps():
    """Get combined dict of all deps for auditing."""
    all_deps = {}
    all_deps.update(CORE_DEPS)
    all_deps.update(EMBED_DEPS)
    for plat_deps in PLATFORM_DEPS.values():
        all_deps.update(plat_deps)
    return all_deps


def generate_requirements(output_path='requirements.txt', platform=None):
    """Generate requirements.txt from deps.py — the single source of truth.

    All deployment modes (dev, build, CI) use this generated file.
    """
    if platform is None:
        platform = sys.platform

    lines = [
        "# AUTO-GENERATED from scripts/deps.py — DO NOT EDIT MANUALLY",
        "# Regenerate: python scripts/deps.py requirements",
        f"# Nunba {VERSION} | Python Embed {PYTHON_EMBED_VERSION}",
        "",
    ]

    # Group deps by category (use comments from CORE_DEPS ordering)
    for name, ver in CORE_DEPS.items():
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
        print(f"# Nunba {VERSION} — All Dependencies")
        print(f"# Python Embed: {PYTHON_EMBED_VERSION}")
        print(f"# Core: {len(CORE_DEPS)}, Embed: {len(EMBED_DEPS)}, "
              f"Platform: {sum(len(v) for v in PLATFORM_DEPS.values())}")
        for name, ver in sorted(get_all_deps().items()):
            print(_format_dep(name, ver))
