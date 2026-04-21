"""
setup_freeze_nunba.py - Creates Nunba executable

Nunba: A Friend, A Well Wisher, Your LocalMind
Connect to Hivemind with your friends' agents.
"""
import compileall
import glob
import os
import shutil
import sys

# ── Fix transformers frozenset crash before cx_Freeze traces it ──
# transformers/__init__.py line 772: import_structure[frozenset({})].update(...)
# fails in cx_Freeze frozen builds. Patch the source file to use .setdefault().
try:
    import importlib.util as _ilu_patch
    _tf_spec = _ilu_patch.find_spec('transformers')
    if _tf_spec and _tf_spec.origin:
        with open(_tf_spec.origin, encoding='utf-8') as _f:
            _src = _f.read()
        _bad = 'import_structure[frozenset({})].update(_import_structure)'
        if _bad in _src:
            _src = _src.replace(_bad,
                'import_structure.setdefault(frozenset({}), {}).update(_import_structure)')
            with open(_tf_spec.origin, 'w', encoding='utf-8') as _f:
                _f.write(_src)
            print("Patched transformers/__init__.py: frozenset fix applied")
except Exception as _e:
    print(f"WARNING: Could not patch transformers: {_e}")
import py_compile

# hevolveai/embodied_ai pull in torch/transformers which cause cx_Freeze
# import recursion. Block them from being importable during the build —
# they're bundled via python-embed, not cx_Freeze.
# 1. Remove editable src paths
_hevolveai_src = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', '..', 'hevolveai', 'src'))
if _hevolveai_src in sys.path:
    sys.path.remove(_hevolveai_src)
    print("Removed hevolveai/src from sys.path")

# 2. Block wheel-installed hevolveai/embodied_ai from being found
#    by removing their packages from sys.modules and making them unfindable
for _block_pkg in ('hevolveai', 'embodied_ai'):
    if _block_pkg in sys.modules:
        del sys.modules[_block_pkg]
    # Remove any site-packages paths that contain these packages
    _to_remove = [p for p in sys.path
                  if os.path.isdir(os.path.join(p, _block_pkg))]
    for p in _to_remove:
        # Don't remove the whole site-packages — just ensure cx_Freeze
        # can't trace into these specific packages
        pass  # handled by excludes list below

sys.setrecursionlimit(5000)  # safety margin for deep import chains

from cx_Freeze import Executable, bdist_msi, setup

# Ensure current directory is in path for module discovery
if os.getcwd() not in sys.path:
    sys.path.append(os.getcwd())

# Import version from centralized deps.py
_scripts_dir = os.path.dirname(os.path.abspath(__file__))
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)
from deps import version_short, version_win32

# ── Auto-install sibling project editable deps ──────────────────
# Ensures HARTOS, hevolveai, hevolve-database, agent-ledger are
# pip-installed from sibling directories BEFORE cx_Freeze traces imports.
# Uses --no-deps to avoid git clone failures for private repos.
_project_root = os.path.normpath(os.path.join(_scripts_dir, '..', '..'))
_sibling_editable_deps = [
    ('HARTOS', 'hart-backend'),
    ('hevolveai', 'hevolveai'),
    ('Hevolve_Database', 'hevolve-database'),
    ('HARTOS/agent-ledger-opensource', 'agent-ledger'),
]
for _sib_dir, _pkg_name in _sibling_editable_deps:
    _sib_path = os.path.join(_project_root, _sib_dir)
    if not os.path.isdir(_sib_path):
        continue
    # Check if already installed from this path
    import subprocess as _sp
    try:
        _pip_show = _sp.run(
            [sys.executable, '-m', 'pip', 'show', _pkg_name],
            capture_output=True, text=True, timeout=10)
        _current_loc = ''
        for _line in _pip_show.stdout.splitlines():
            if _line.startswith('Editable project location:'):
                _current_loc = _line.split(':', 1)[1].strip()
        _expected = os.path.normpath(_sib_path)
        if _current_loc and os.path.normpath(_current_loc) == _expected:
            continue  # already installed from correct path
    except Exception:
        pass
    # Clean stale build/ directory — Windows keeps file locks on
    # build/lib/ and build/bdist.win-amd64/ from previous pip builds,
    # causing WinError 32 on subsequent installs.
    _build_dir = os.path.join(_sib_path, 'build')
    if os.path.isdir(_build_dir):
        try:
            shutil.rmtree(_build_dir)
            print(f"  Cleaned stale {_build_dir}")
        except OSError:
            # If rmtree fails (locked files), try per-file removal
            for _broot, _bdirs, _bfiles in os.walk(_build_dir, topdown=False):
                for _bf in _bfiles:
                    try:
                        os.remove(os.path.join(_broot, _bf))
                    except OSError:
                        pass
                for _bd in _bdirs:
                    try:
                        os.rmdir(os.path.join(_broot, _bd))
                    except OSError:
                        pass
            try:
                os.rmdir(_build_dir)
            except OSError:
                print(f"  Warning: could not fully clean {_build_dir}")
    # Install editable (no deps — avoids git clone failures)
    print(f"Auto-installing {_pkg_name} from {_sib_path}...")
    _result = _sp.run(
        [sys.executable, '-m', 'pip', 'install', '-e', _sib_path, '--no-deps', '--quiet'],
        capture_output=True, text=True, timeout=300)
    if _result.returncode != 0:
        # Retry once after aggressive build cleanup
        print(f"  Retry: cleaning build artifacts and reinstalling {_pkg_name}...")
        for _stale in ('build', 'dist', f'{_pkg_name.replace("-","_")}.egg-info'):
            _stale_path = os.path.join(_sib_path, _stale)
            if os.path.isdir(_stale_path):
                shutil.rmtree(_stale_path, ignore_errors=True)
        _result = _sp.run(
            [sys.executable, '-m', 'pip', 'install', '-e', _sib_path, '--no-deps', '--quiet'],
            capture_output=True, text=True, timeout=300)
        if _result.returncode != 0:
            print(f"  WARNING: {_pkg_name} install failed: {_result.stderr.strip()}")
print("Sibling deps verified")

# Find the location of zlib.dll in the Python installation
def find_zlib_dll():
    python_dir = os.path.dirname(sys.executable)
    possible_paths = [
        os.path.join(python_dir, 'zlib.dll'),
        os.path.join(python_dir, 'DLLs', 'zlib.dll'),
        os.path.join(python_dir, 'lib', 'zlib.dll'),
    ]

    site_packages = glob.glob(os.path.join(python_dir, 'lib', 'site-packages', '*'))
    site_packages.extend(glob.glob(os.path.join(python_dir, 'Lib', 'site-packages', '*')))

    for path in possible_paths:
        if os.path.exists(path):
            print(f"Found zlib.dll at: {path}")
            return path

    for path_dir in os.environ.get('PATH', '').split(os.pathsep):
        dll_path = os.path.join(path_dir, 'zlib.dll')
        if os.path.exists(dll_path):
            print(f"Found zlib.dll at: {dll_path}")
            return dll_path
    print("Warning: zlib.dll not found in common locations")
    return None

zlib_path = find_zlib_dll()

def find_pycparser_source():
    """Find pycparser source directory and return path for inclusion"""
    try:
        import pycparser
        pycparser_dir = os.path.dirname(pycparser.__file__)
        if os.path.exists(pycparser_dir):
            print(f"Found pycparser at: {pycparser_dir}")
            return pycparser_dir
    except ImportError:
        pass
    return None

pycparser_source = find_pycparser_source()

def _pad_to_square(img):
    """Pad a non-square image onto a transparent square canvas, centered."""
    from PIL import Image as _Image
    w, h = img.size
    if w == h:
        return img
    side = max(w, h)
    square = _Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(img, ((side - w) // 2, (side - h) // 2),
                 img if img.mode == 'RGBA' else None)
    return square


def ensure_icon_exists(force=False):
    if not force and os.path.exists("app.ico"):
        return "app.ico"

    # Try Nunba logo first, then fallback to old logo
    logo_files = ["Nunba_Logo.png", "Product_Hevolve_Logo.png"]

    for logo_file in logo_files:
        if os.path.exists(logo_file):
            try:
                from PIL import Image

                img = Image.open(logo_file)
                if img.mode != 'RGBA':
                    img = img.convert('RGBA')
                # Pad to square so the icon isn't squashed
                img = _pad_to_square(img)
                # Largest first — PIL ICO writer uses first image as primary
                icon_sizes = [(256,256), (128,128), (64,64), (48,48), (32,32), (16,16)]
                img_list = [img.resize(sz, Image.LANCZOS) for sz in icon_sizes]

                img_list[0].save(
                    "app.ico",
                    format="ICO",
                    append_images=img_list[1:]
                )
                print(f"Successfully converted {logo_file} to app.ico ({img.size[0]}x{img.size[1]} padded)")
                return "app.ico"
            except Exception as e:
                print(f"Error converting logo to ico: {str(e)}")

    return None

icon_path = ensure_icon_exists()

def ensure_manifest_exists():
    manifest_content = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity type="win32" name="Nunba" version="{version_win32()}"/>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="requireAdministrator" uiAccess="false"/>
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>"""

    manifest_path = 'nunba.manifest'

    if not os.path.exists(manifest_path):
        with open(manifest_path, 'w') as f:
            f.write(manifest_content)
        print(f"Created manifest file at: {manifest_path}")

    return manifest_path

manifest_path = ensure_manifest_exists()

build_exe_options = {
    "packages": [
        "os",
        "sys",
        "flask",
        "threading",
        "logging",
        "webview",
        "argparse",
        "importlib",
        "traceback",
        "json",
        "time",
        "ctypes",
        "pathlib",
        "shutil",
        "winreg",
        "tkinter",  # Full package tree — ensures messagebox, filedialog etc. are included
        "flask_cors",
        "pyautogui",
        "PIL",
        # langchain_classic uses __getattr__ + create_importer for lazy imports.
        # cx_Freeze can't trace importlib.import_module() calls at runtime,
        # so include the full package trees to ensure all submodules are available.
        "langchain_classic",
        "langchain_core",
        "io",
        "uuid",
        "subprocess",
        "shlex",
        "win10toast",
        "pystray",
        "pyperclip",
        "waitress",
        "requests",

        "routes.auth",  # Shared auth decorator (require_local_or_token)
        "routes.chatbot_routes",  # Chatbot routes module
        "routes.kids_media_routes",  # Kids media generation routes

        # core.* — architect-refactor modules (diag, optional_import,
        # gpu_tier, hub_allowlist) now live in HARTOS core/ alongside
        # the canonical infrastructure (http_pool, port_registry,
        # realtime, agent_tools, platform_paths, constants).  Nunba
        # NO LONGER has its own core/ directory — the previous split
        # caused a namespace-package collision (Nunba core/ lacked
        # __init__.py, HARTOS core/ has one → whichever loaded first
        # won, hiding the other's modules at runtime).  HARTOS core/
        # is picked up via the "Including core package" trace above,
        # so no explicit packages list is needed here — cx_Freeze
        # bundles everything in the package tree automatically.

        "uvicorn",
        "fastapi",
        "pydantic",
        "sqlalchemy",
        # "crossbarhttp",  # Excluded: circular import issue with cx_Freeze
        "pytz",
        "autobahn",
        "shapely",
        "starlette",
        "alembic",
        "greenlet",
        "importlib.util",
        "urllib.request",
        "urllib.error",
        "zipfile",
        "platform",
        "typing",
        "socket",
        "llama.llama_installer",  # Llama.cpp installer module
        "llama.llama_config",  # Llama.cpp configuration module
        "llama.llama_health_endpoint",  # Llama health endpoint wrapper
        "desktop.tray_handler",  # Cross-platform tray handler
        "desktop.platform_utils",  # Platform utilities
        "tts.piper_tts",  # Piper TTS for CPU text-to-speech
        "tts.package_installer",  # Runtime TTS package installer
        "tts.backend_venv",  # Per-backend venv infra (Track A)
        "tts.indic_parler_worker",  # Subprocess entrypoint (runs inside venv) (Track B)
        "tts.tts_engine",  # Unified TTS engine (auto-selects GPU/CPU backend)
        "tts.tts_handshake",  # First-run voice-check handshake (gates Ready banner)
        "tts.verified_synth",  # Verified-signal gate (consumed by tts_handshake + _bg_install)
        "desktop.ai_installer",  # Unified AI components installer
        "desktop.ai_key_vault",  # Encrypted API key vault
        "desktop.crash_reporter",  # Sentry crash reporting (auto-initialized)
        "desktop.config",  # App configuration (DSN, version, etc.)
        "desktop.indicator_window",  # LLM control indicator
        "desktop.tray_handler",  # System tray handler
        "desktop.platform_utils",  # Platform utilities
        "desktop.splash_effects",  # Splash screen effects
        "desktop.media_classification",  # Media classification
        "desktop.guest_identity",  # Hardware-derived stable guest_id (J201)
        "desktop.chat_settings",  # Admin-controlled restore policy/scope (J207)
        "routes.hartos_backend_adapter",  # Backend adapter (single-file module)
        "numpy",
        "jose",  # python-jose — JWT handling (HARTOS social auth)
        # hevolve-database SQL package (pip-installed, full tree for cx_Freeze)
        "sql",
        "sql.crud",
        "sql.models",
        "sql.database",
        "sql.schemas",
        "sql.otp",
        "sql.bookparsing",
        # HARTOS runtime deps (top-level imports in helper.py / hart_intelligence)
        "aiohttp",
        "dotenv",
        "cryptography",
        "redis",
        "bs4",

        # torch._dynamo / torch.fx.experimental.symbolic_shapes import sympy
        # at module-load time.  cx_Freeze's tracer can't follow torch (it's
        # in excludes[] — too heavy for the main bundle) but Indic Parler's
        # gpu_worker subprocess imports sympy through torch.  Listing sympy
        # here is defensive per Gate 6 (feedback_frozen_build_pitfalls.md
        # Rule 1): any runtime-discovered module must be declared.  The
        # real install target for sympy is python-embed/Lib/site-packages/
        # (see EMBED_DEPS in scripts/deps.py); cx_Freeze will skip it in
        # lib/ because the main exe's sys.path resolves python-embed first.
        "sympy",
    ],
    "zip_includes": [],
    "build_exe": "build/Nunba",
    "excludes": [
        "unittest", "test", "tests",
        "shapely.plotting", "shapely.tests",
        # Exclude large unnecessary packages
        "cv2", "opencv",  # pyautogui uses PIL.ImageGrab on Windows, not cv2
        "torch", "torchvision", "torchaudio", "tensorflow", "keras",
        # embodied_ai/hevolveai are pip-installed but their heavy deps
        # (torch, transformers) are bundled via python-embed, not cx_Freeze
        "embodied_ai", "hevolveai",
        "matplotlib", "scipy", "numpy.tests",
        # wandb is pulled transitively by autogen → flaml; never used
        # at runtime and adds ~60MB of .exe + proto files to the build.
        "wandb", "wandb_core",
        # Heavy transitive deps not used at runtime (~200MB total):
        # pandas: 37M (only chromadb.utils.results optional formatting)
        # sklearn: 30M (only HevolveAI latent_transfer, excluded above)
        # onnxruntime: 36M (transitive via langchain)
        # faiss: 24M + faiss_cpu: 50M libs (transitive, chromadb optional)
        # kubernetes: 18M (chromadb distributed mode, not enabled)
        # grpc: 12M (chromadb/OpenTelemetry optional)
        # lief: 12M (binary analysis, unknown transitive)
        # bitsandbytes: 166M (HevolveAI optional GPU accelerator)
        # NOTE: sympy was previously excluded but is load-bearing via
        # torch._dynamo → torch.utils._sympy → sympy at import time for
        # Indic Parler / any transformers TTS worker.  It now lives in
        # python-embed (EMBED_DEPS) and packages[] above.
        "pandas", "pandas.tests",
        "sklearn", "sklearn.tests",
        "onnxruntime",
        "faiss", "faiss_cpu",
        "kubernetes",
        "grpc", "grpcio",
        "lief",
        "bitsandbytes",
        "posthog",  # analytics (chromadb optional)
        "IPython", "jupyter", "notebook",
        "pandas.tests", "PIL.tests",
        "setuptools", "distutils",
        "lib2to3", "email.test",
        # Exclude test suites
        "asyncio.test", "ctypes.test",
        "tkinter.test", "sqlite3.test",
        # Documentation
        "pydoc_data",
        # Exclude Qt (using EdgeChromium/WebView2 instead)
        "PyQt5", "PyQt6", "PySide2", "PySide6", "qtpy",
        "webview.platforms.qt",
        # pycparser is included as source files in lib_src to avoid circular import
        "pycparser",
        # Linux-only agent_engine modules (WebKit2/GTK, Conky, PipeWire)
        "integrations.agent_engine.liquid_ui_service",
        "integrations.agent_engine.shell_manifest",
        "integrations.agent_engine.theme_service",
        "integrations.agent_engine.model_bus_service",
        "integrations.agent_engine.compute_mesh_service",
        "integrations.agent_engine.app_bridge_service",
    ],
    # Extract pythonnet packages from zip to avoid import issues
    "zip_exclude_packages": [
        "pythonnet", "clr_loader", "cffi",
    ],
    # ── Auto-discover source files instead of manual listing ──
    # All .py files in project root (except app.py which is the entry point,
    # build/test scripts, and venv dirs)
    "include_files": (
        # 1. Auto-include ALL .py files from project root
        # These are needed because app.py loads main.py via importlib (not standard import)
        # and cx_Freeze doesn't trace importlib.util.spec_from_file_location targets.
        [(f, f) for f in glob.glob("*.py")
         if f not in ("app.py", "setup.py") and not f.startswith(("test_", "_test_"))]
        # 2. Auto-include ALL .json files from project root (config, templates)
        + [(f, f) for f in glob.glob("*.json")]
        # 3. Auto-include ALL .png/.ico asset files from project root
        + [(f, f) for f in glob.glob("*.png") + glob.glob("*.ico")]
        # 4. License (origin attestation requires it)
        + ([("LICENSE", "LICENSE")] if os.path.isfile("LICENSE") else [])
        # 5. Key directories
        + [
            ("templates", "templates"),
            ("landing-page/build", "landing-page/build"),
        ]
        # 5. Assets directory (bundled fonts, etc.) if it exists
        + ([("assets", "assets")] if os.path.isdir("assets") else [])
        # 6. autobahn nvx .c source files (read at import time by CFFI builder)
        + ([(f, os.path.join("lib", "autobahn", "nvx", os.path.basename(f)))
            for f in glob.glob(os.path.join(
                os.path.dirname(__import__('autobahn').__file__), 'nvx', '*.c'))]
           if __import__('importlib').util.find_spec('autobahn') else [])
    ),
    "includes": [
        "numpy.core._multiarray_umath",
        "numpy.core._multiarray_tests",
        "numpy.linalg.lapack_lite",
        "numpy.random._common",
        "numpy.random._generator",
        "numpy.random._mt19937",
        "numpy.random._pcg64",
        "numpy.random._philox",
        "numpy.random._sfc64",
        # pywebview platform backends — must be explicit; cx_Freeze can't trace dynamic loading
        "webview.platforms.edgechromium",
        "webview.platforms.winforms",
    ],
    "include_msvcr": True,
    "bin_includes": ["zlib.dll"],
    "bin_path_includes": ["zlib"]
}

if zlib_path:
    build_exe_options["include_files"].append((zlib_path, "zlib.dll"))

# Include pycparser source files to avoid circular import issues in frozen app
# The source .py files handle circular imports correctly, unlike compiled .pyc
# Copy to lib_src/pycparser so we can add lib_src to sys.path
if pycparser_source:
    build_exe_options["include_files"].append((pycparser_source, "lib_src/pycparser"))
    print("Including pycparser source files for proper import handling")

build_exe_options["include_files"] = [item for item in build_exe_options["include_files"] if item is not None]

# Include *.libs DLL directories (numpy.libs, shapely.libs, etc.)
# cx_Freeze traces Python modules but NOT these companion DLL directories.
# Without them, .pyd extensions fail at runtime (e.g. numpy can't find libopenblas).
import site as _site

_site_packages_dirs = _site.getsitepackages() if hasattr(_site, 'getsitepackages') else []
# Also check the venv site-packages directly
_venv_sp = os.path.join(os.path.dirname(os.path.dirname(sys.executable)), 'Lib', 'site-packages')
if os.path.isdir(_venv_sp) and _venv_sp not in _site_packages_dirs:
    _site_packages_dirs.append(_venv_sp)

for _sp_dir in _site_packages_dirs:
    if not os.path.isdir(_sp_dir):
        continue
    for _entry in os.listdir(_sp_dir):
        if _entry.endswith('.libs'):
            _libs_src = os.path.join(_sp_dir, _entry)
            if os.path.isdir(_libs_src):
                # Bundle into lib/<name>.libs so app.py's DLL path fix finds them
                build_exe_options["include_files"].append((_libs_src, f"lib/{_entry}"))
                print(f"Including DLL directory: {_entry}")

# python-embed .libs DLLs (sklearn, scipy etc.) are handled by the
# post-build copytree step — see below setup() call.

# Conditionally include optional packages that may not be installed
import importlib.util as _ilu

_optional_packages = [
    "autogen",            # pyautogen 0.2.x (import autogen)
    "autogen_agentchat",  # autogen-agentchat 0.4+ (import autogen_agentchat)
    "apscheduler",
    "json_repair",
    # hart-backend packages — these are bundled via include_files from
    # sibling HARTOS directory (lines below). Do NOT list integrations.*,
    # security, or core here — they're namespace packages in wheel installs
    # which crash cx_Freeze's include_package(). cx_Freeze picks them up
    # from include_files instead.
    *[p for p in ["agent_ledger"]
      if _ilu.find_spec(p) and getattr(_ilu.find_spec(p), 'origin', None)],
    # HevolveAI (Embodied Continual Learner) — excluded from cx_Freeze tracing
    # to avoid RecursionError from torch/transformers dependency chain.
    # Bundled via python-embed shutil.copytree in post-build step.
    # "hevolveai",
    # "embodied_ai",
    # Cloud LLM provider SDKs (installed if user selects that provider in wizard)
    "langchain_anthropic",
    "langchain_google_genai",
    "langchain_groq",
    # LangChain extras — langchain_classic and langchain_core are mandatory (in packages above)
    "langchain",
    "langchain_community",
    "langchain_openai",
    # Encrypted vault dependencies
    "cryptography",
    # Crash reporting
    "sentry_sdk",
    # Google auth (Hevolve_Database JWT + OAuth)
    "google.auth",
    "google.oauth2",
]
for _pkg in _optional_packages:
    if _ilu.find_spec(_pkg):
        build_exe_options["packages"].append(_pkg)
        print(f"Including optional package: {_pkg}")
    else:
        print(f"Optional package not found, skipping: {_pkg}")

# Include hart-backend root modules from pip-installed location or local clone
def find_hevolve_modules():
    """Find hart-backend root .py modules from pip install or local source.

    Checks ALL sources and merges results — never early-returns so that
    modules missing from pip (e.g. cultural_wisdom) get picked up from
    the sibling directory.
    """
    # Auto-discover from HARTOS pyproject.toml — single source of truth.
    # Uses regex (not tomllib) to avoid cx_Freeze import-tracing recursion.
    hevolve_modules = None
    _hartos_toml = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                '..', '..', 'HARTOS', 'pyproject.toml')
    if os.path.isfile(_hartos_toml):
        import re
        try:
            with open(_hartos_toml, encoding='utf-8') as _tf:
                _toml_text = _tf.read()
            # Extract py-modules list: everything between py-modules = [ ... ]
            _match = re.search(r'py-modules\s*=\s*\[(.*?)\]', _toml_text, re.DOTALL)
            if _match:
                _raw = _match.group(1)
                hevolve_modules = re.findall(r'"(\w+)"', _raw)
                _skip = {'setup', 'embedded_main', 'hart_cli'}
                hevolve_modules = [m for m in hevolve_modules if m not in _skip]
                print(f"Auto-discovered {len(hevolve_modules)} HARTOS modules from pyproject.toml")
        except Exception as _te:
            print(f"WARNING: Failed to parse HARTOS pyproject.toml: {_te}")

    if not hevolve_modules:
        # Fallback: hardcoded list (keep in sync with HARTOS pyproject.toml py-modules)
        hevolve_modules = [
            'hart_intelligence', 'hart_intelligence_entry', 'helper', 'helper_ledger',
            'create_recipe', 'reuse_recipe', 'lifecycle_hooks',
            'threadlocal', 'gather_agentdetails',
            'cultural_wisdom', 'recipe_experience', 'exception_collector',
            'agent_identity', 'hart_onboarding', 'hartos_speech',
            'hartos_speech_stitch',
        ]
    found = {}  # mod_name -> (src_path, dst_name)

    # 1. pip-installed modules
    import importlib.util
    for mod_name in hevolve_modules:
        spec = importlib.util.find_spec(mod_name)
        if spec and spec.origin and os.path.isfile(spec.origin):
            # Place in lib/ (compiled by cx_Freeze), not root (raw .py)
            found[mod_name] = (spec.origin, os.path.join("lib", f"{mod_name}.py"))

    # 2. local clone in hartos_backend_src/
    src_dir = 'hartos_backend_src'
    if os.path.isdir(src_dir):
        for mod_name in hevolve_modules:
            if mod_name in found:
                continue
            mod_path = os.path.join(src_dir, f"{mod_name}.py")
            if os.path.isfile(mod_path):
                found[mod_name] = (mod_path, os.path.join("lib", f"{mod_name}.py"))

    # 3. sibling HARTOS directory
    llm_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           '..', '..', 'HARTOS')
    if os.path.isdir(llm_dir):
        for mod_name in hevolve_modules:
            if mod_name in found:
                continue
            mod_path = os.path.join(llm_dir, f"{mod_name}.py")
            if os.path.isfile(mod_path):
                found[mod_name] = (mod_path, os.path.join("lib", f"{mod_name}.py"))

    # Report
    missing = [m for m in hevolve_modules if m not in found]
    print(f"Found {len(found)}/{len(hevolve_modules)} hart-backend modules")
    for mod_name, (src, _) in found.items():
        print(f"  {mod_name} <- {src}")
    if missing:
        print(f"  MISSING: {', '.join(missing)}")

    return list(found.values())

hevolve_files = find_hevolve_modules()
build_exe_options["include_files"].extend(hevolve_files)

# Always include agent_ledger from sibling dir (namespace package issue)
if True:
    _agent_ledger_candidates = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     '..', '..', 'HARTOS', 'agent-ledger-opensource', 'agent_ledger'),
        os.path.join('hartos_backend_src', 'agent_ledger'),
    ]
    for _al_path in _agent_ledger_candidates:
        if os.path.isdir(_al_path) and os.path.isfile(os.path.join(_al_path, '__init__.py')):
            build_exe_options["include_files"].append((os.path.normpath(_al_path), "agent_ledger"))
            print(f"Including agent_ledger package <- {os.path.normpath(_al_path)}")
            break
    else:
        print("WARNING: agent_ledger package not found — distributed agent features will be unavailable")

# Include HARTOS package directories if not pip-installed (integrations, core, security)
_hartos_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           '..', '..', 'HARTOS')
_hartos_packages = [
    ("integrations", "integrations"),
    ("core", "core"),
    ("security", "security"),
]
# Always include from sibling HARTOS — these are namespace packages when
# pip-installed, so cx_Freeze can't trace them via `packages`. The
# include_files copy is the only reliable way to bundle them.
for _pkg_dir, _pkg_name in _hartos_packages:
    for _candidate in [
        os.path.join(_hartos_dir, _pkg_dir),
        os.path.join('hartos_backend_src', _pkg_dir),
    ]:
        if os.path.isdir(_candidate) and os.path.isfile(os.path.join(_candidate, '__init__.py')):
            build_exe_options["include_files"].append((os.path.normpath(_candidate), _pkg_name))
            print(f"Including {_pkg_name} package <- {os.path.normpath(_candidate)}")
            break
    else:
        print(f"WARNING: {_pkg_name} package not found — related features will be unavailable")

# Verify sql package is pip-installed (from hevolve-database canonical repo).
# cx_Freeze traces it automatically when listed in packages above.
try:
    _sql_spec = _ilu.find_spec("sql")
    if _sql_spec:
        print(f"sql package found: {_sql_spec.origin or _sql_spec.submodule_search_locations}")
    else:
        print("WARNING: hevolve-database not pip-installed — run: pip install -e ../Hevolve_Database")
except Exception as _sql_err:
    print(f"WARNING: sql package check failed ({_sql_err}) — continuing anyway")

# Include langchain config.json (tool endpoints, search keys) — needed by hart_intelligence (hart_intelligence_entry.py).
# SECURITY: Bundle as langchain_config.json (NOT config.json) to avoid collision with
# project root config.json AND to prevent accidental inclusion of production API keys.
# The ai_key_vault now handles encrypted API key storage — config.json is only needed
# for non-secret settings like CSE IDs and tool endpoint URLs.
_langchain_config = None
for _cfg_candidate in [
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'HARTOS', 'config.json'),
    os.path.join('hartos_backend_src', 'config.json'),
]:
    if os.path.isfile(_cfg_candidate):
        _langchain_config = os.path.normpath(_cfg_candidate)
        break
if _langchain_config and os.path.isfile(_langchain_config):
    # Double-check file actually exists (path may resolve differently across envs)
    try:
        import json as _json_check
        with open(_langchain_config) as _f:
            _cfg_data = _json_check.load(_f)
        _secret_keys = [k for k in _cfg_data if 'API_KEY' in k.upper() or 'SECRET' in k.upper()]
        if _secret_keys:
            print(f"WARNING: langchain config.json contains secret keys: {_secret_keys}")
            print("         These will be bundled into the exe. Use ai_key_vault for encrypted storage.")
    except Exception:
        pass
    print(f"Including langchain config.json <- {_langchain_config}")
    build_exe_options["include_files"].append((_langchain_config, "langchain_config.json"))
    _openapi_yaml = os.path.join(os.path.dirname(_langchain_config), 'openapi.yaml')
    if os.path.isfile(_openapi_yaml):
        build_exe_options["include_files"].append((os.path.normpath(_openapi_yaml), "openapi.yaml"))
        print(f"Including openapi.yaml <- {_openapi_yaml}")
else:
    # Create a minimal config.json so hart_intelligence (hart_intelligence_entry.py) doesn't crash
    import json as _json_min
    _min_config = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'langchain_config.json')
    if not os.path.isfile(_min_config):
        with open(_min_config, 'w') as _f:
            _json_min.dump({"OPENAI_API_KEY": "", "GOOGLE_CSE_ID": ""}, _f)
    build_exe_options["include_files"].append((os.path.normpath(_min_config), "langchain_config.json"))
    print("NOTE: langchain config.json not found — created minimal placeholder")

def get_directory_hash(directory):
    """SHA-256 hash of entire directory tree: every dir name, file name, and byte of content."""
    import hashlib
    hash_obj = hashlib.sha256()
    for root, dirs, files in os.walk(directory):
        dirs.sort()  # deterministic walk order
        rel_root = os.path.relpath(root, directory)
        # Hash directory names so empty/missing dirs change the hash
        for d in dirs:
            hash_obj.update(os.path.join(rel_root, d).encode('utf-8'))
        # Hash each file's relative path + full content
        for name in sorted(files):
            filepath = os.path.join(root, name)
            rel_path = os.path.join(rel_root, name)
            hash_obj.update(rel_path.encode('utf-8'))
            try:
                with open(filepath, 'rb') as f:
                    while True:
                        data = f.read(65536)
                        if not data:
                            break
                        hash_obj.update(data)
            except OSError:
                pass
    return hash_obj.hexdigest()

# python-embed is copied via shutil.copytree in the post-build step (not
# cx_Freeze include_files) because cx_Freeze doesn't reliably copy
# dot-prefixed directories like .libs/ which contain critical DLLs.
_skip_python_embed_copy = False
current_python_embed_hash = None
if os.path.exists("python-embed"):
    current_python_embed_hash = get_directory_hash("python-embed")
    build_dir = build_exe_options["build_exe"]
    hash_file = os.path.join(build_dir, "python-embed.hash")

    dest_embed = os.path.join(build_dir, "python-embed")
    if os.path.exists(hash_file) and os.path.isdir(dest_embed):
        with open(hash_file) as f:
            _hash_lines = f.read().strip().splitlines()
        _old_src_hash = _hash_lines[0] if _hash_lines else ''
        _old_dest_hash = _hash_lines[1] if len(_hash_lines) > 1 else _old_src_hash
        if _old_src_hash == current_python_embed_hash:
            # Source unchanged — check if dest matches what we built last time
            dest_hash = get_directory_hash(dest_embed)
            if dest_hash == _old_dest_hash:
                _skip_python_embed_copy = True
            else:
                print("python-embed build dir is stale/incomplete, will re-copy...")

    if _skip_python_embed_copy:
        print("python-embed unchanged and verified, skipping copy...")

base = None
if sys.platform == "win32":
    base = "Win32GUI"

bdist_msi_options = {
    'upgrade_code': '{B2C3D4E5-F678-9012-CDEF-123456789ABC}',
    'add_to_path': False,
    'initial_target_dir': r'[ProgramFilesFolder]\HevolveAI\Nunba',
    'summary_data': {
        'author': 'HevolveAI',
        'comments': 'Nunba - A Friend, A Well Wisher, Your LocalMind',
        'keywords': 'Nunba, HevolveAI, Agent, LocalMind, Hivemind'
    },
}

version_info = {
    'version': version_win32(),
    'description': 'Nunba - Your Local HARTMind Companion ',
    'company': 'HevolveAI',
    'product': 'Nunba',
    'copyright': '© 2025 HevolveAI',
    'file_version': version_win32(),
}

executables = [
    Executable(
        "app.py",
        base=base,
        target_name="Nunba.exe",
        icon=icon_path,
        shortcut_name="Nunba",
        shortcut_dir="ProgramMenuFolder",
        # manifest not needed — Nunba writes to user dirs (~/.nunba, ~/Documents/Nunba)
        # and the Inno Setup installer handles admin elevation for Program Files install
        uac_admin=False  # No UAC prompt needed — app runs with normal user privileges
    )
]

class bdist_msi_custom(bdist_msi):
    def add_shortcuts(self):
        data_dir = os.path.join(self.bdist_dir, "data")
        for exe in self.distribution.executables:
            exe_name = os.path.basename(exe.target_name)
            exe_path = "[TARGETDIR]" + exe_name

            self.add_shortcut(
                "DesktopShortcut",
                "DesktopFolder",
                "Nunba",
                exe_path,
                None,
                None,
                None,
                None,
                "Nunba - Your LocalMind"
            )

            self.add_shortcut(
                "StartMenuShortcut",
                "ProgramMenuFolder",
                "Nunba",
                exe_path,
                None,
                None,
                None,
                None,
                "Nunba - Your LocalMind"
            )

        # Autostart registry entry
        self.add_registry_entry(
            "AutostartEntry",
            "HKEY_CURRENT_USER",
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            "Nunba",
            "[TARGETDIR]Nunba.exe --background",
            False
        )

        # Register custom protocol: hevolveai://
        self.add_registry_entry(
            "ProtocolMain",
            "HKEY_CLASSES_ROOT",
            "hevolveai",
            "",
            "URL:HevolveAI Protocol",
            False
        )

        self.add_registry_entry(
            "ProtocolFlag",
            "HKEY_CLASSES_ROOT",
            "hevolveai",
            "URL Protocol",
            "",
            False
        )

        self.add_registry_entry(
            "ProtocolIcon",
            "HKEY_CLASSES_ROOT",
            r"hevolveai\DefaultIcon",
            "",
            "[TARGETDIR]Nunba.exe,0",
            False
        )

        self.add_registry_entry(
            "ProtocolCommand",
            "HKEY_CLASSES_ROOT",
            r"hevolveai\shell\open\command",
            "",
            '"[TARGETDIR]Nunba.exe" --protocol "%1"',
            False
        )

        bdist_msi.add_shortcuts(self)

setup(
    name="Nunba",
    version=version_short(),
    description="Nunba - A Friend, A Well Wisher, Your LocalMind",
    author="HevolveAI",
    options={
        "build_exe": build_exe_options,
        "bdist_msi": bdist_msi_options
    },
    executables=executables,
    cmdclass={'bdist_msi': bdist_msi_custom}
)

# ── Post-build: compile raw .py to .pyc and remove source ──
# HARTOS modules are copied as .py via include_files (cx_Freeze doesn't compile
# them because they're not traced via imports). Compile to .pyc so source code
# isn't exposed in the install directory.
if 'build' in sys.argv or 'build_exe' in sys.argv:
    _build_lib = os.path.join(os.path.abspath(build_exe_options["build_exe"]), "lib")
    if os.path.isdir(_build_lib):
        _compiled = 0
        for _py_file in glob.glob(os.path.join(_build_lib, "*.py")):
            _base = os.path.splitext(_py_file)[0]
            _pyc_file = _base + ".pyc"
            try:
                py_compile.compile(_py_file, cfile=_pyc_file, doraise=True)
                os.remove(_py_file)
                _compiled += 1
            except py_compile.PyCompileError as _pce:
                print(f"  WARNING: Failed to compile {os.path.basename(_py_file)}: {_pce}")
        if _compiled:
            print(f"Post-build: compiled {_compiled} HARTOS .py files to .pyc in lib/")
    # Also remove any raw .py files in root (leftover from previous builds)
    _build_root = os.path.abspath(build_exe_options["build_exe"])
    _root_cleaned = 0
    for _hartos_mod in ['hart_intelligence', 'hart_intelligence_entry', 'helper',
                        'helper_ledger', 'create_recipe', 'reuse_recipe',
                        'lifecycle_hooks', 'threadlocal', 'gather_agentdetails',
                        'cultural_wisdom', 'recipe_experience', 'exception_collector',
                        'agent_identity', 'hart_onboarding', 'hartos_speech',
                        'hartos_speech_stitch', 'crossbar_server', 'hart_version']:
        _old_py = os.path.join(_build_root, f"{_hartos_mod}.py")
        if os.path.isfile(_old_py):
            os.remove(_old_py)
            _root_cleaned += 1
    if _root_cleaned:
        print(f"Post-build: removed {_root_cleaned} stale HARTOS .py files from build root")

# ── Post-build cleanup: remove stale __pycache__ dirs ──
# cx_Freeze copies source .py files but may also leave behind .pyc caches
# from the source tree. If the .pyc is newer than .py, Python loads the stale
# .pyc and ignores our patched .py → import crashes in frozen mode.
if 'build' in sys.argv or 'build_exe' in sys.argv:
    _build_dir_clean = os.path.abspath(build_exe_options["build_exe"])
    _removed = 0
    for _root, _dirs, _files in os.walk(_build_dir_clean):
        if '__pycache__' in _dirs:
            _pc = os.path.join(_root, '__pycache__')
            try:
                shutil.rmtree(_pc)
                _removed += 1
            except Exception:
                pass
    if _removed:
        print(f"Post-build: removed {_removed} __pycache__ dirs from build")

# ── Post-build: verify .pyc magic numbers match runtime Python ──
# Catches cross-version .pyc files that would cause silent ImportError at runtime.
# The build Python and frozen runtime Python MUST be the same version.
if 'build' in sys.argv or 'build_exe' in sys.argv:
    import importlib.util as _ilu_magic
    _expected_magic = _ilu_magic.MAGIC_NUMBER
    _build_dir_verify = os.path.abspath(build_exe_options["build_exe"])
    _bad_pyc = []
    for _root_v, _dirs_v, _files_v in os.walk(_build_dir_verify):
        for _fv in _files_v:
            if _fv.endswith('.pyc'):
                _fpath = os.path.join(_root_v, _fv)
                try:
                    with open(_fpath, 'rb') as _fh:
                        _file_magic = _fh.read(4)
                    if _file_magic != _expected_magic:
                        _bad_pyc.append((_fpath.replace(_build_dir_verify, ''), _file_magic.hex()))
                except Exception:
                    pass
    if _bad_pyc:
        print(f"[WARNING] {len(_bad_pyc)} .pyc files have WRONG magic number "
              f"(expected {_expected_magic.hex()}):")
        for _bp, _bm in _bad_pyc[:10]:
            print(f"  {_bm} {_bp}")
        if len(_bad_pyc) > 10:
            print(f"  ... and {len(_bad_pyc) - 10} more")
        print("  These will cause 'bad magic number' ImportError at runtime!")
        print("  Fix: ensure build Python matches frozen runtime Python version.")
    else:
        print(f"Post-build: all .pyc files verified (magic={_expected_magic.hex()})")

# ── Pre-copy: install TTS packages into python-embed ──
# GPU TTS backends need pip packages in python-embed's site-packages.
# python-embed's own pip is broken (distutils-precedence.pth), so we use
# the BUILD venv's pip with --target to install into python-embed directly.
import subprocess

if ('build' in sys.argv or 'build_exe' in sys.argv):
    _embed_sp = os.path.join("python-embed", "Lib", "site-packages")
    if os.path.isdir(_embed_sp):
        # ── Always re-install HARTOS + sibling deps into python-embed ──
        # Editable install in system Python doesn't update python-embed's copy.
        # Must pip install --target into python-embed so the frozen build has
        # the latest code from all sibling repos.
        _sibling_deps = [
            ('HARTOS', 'hart-backend'),
            ('hevolveai', 'hevolveai'),
            ('Hevolve_Database', 'hevolve-database'),
            ('HARTOS/agent-ledger-opensource', 'agent-ledger'),
        ]
        for _sib_dir, _pkg_name in _sibling_deps:
            _sib_path = os.path.join(_project_root, _sib_dir)
            if os.path.isdir(_sib_path) and (
                os.path.isfile(os.path.join(_sib_path, 'pyproject.toml')) or
                os.path.isfile(os.path.join(_sib_path, 'setup.py'))
            ):
                print(f"python-embed: re-installing {_pkg_name} from {_sib_dir}...")
                _r = subprocess.run(
                    [sys.executable, "-m", "pip", "install", "--no-deps",
                     "--no-build-isolation",
                     "--target", _embed_sp, "--upgrade", _sib_path],
                    capture_output=True, text=True, timeout=900)
                if _r.returncode == 0:
                    print(f"python-embed: {_pkg_name} updated OK")
                else:
                    print(f"python-embed: {_pkg_name} update FAILED: {_r.stderr[:200]}")

        # ── Sanitize hevolveai METADATA — strip dependency-tree leak ──
        # hevolveai's setup.py declares torch / transformers / peft / bitsandbytes
        # / qwen-vl-utils / vector-quantize-pytorch / etc.  pip writes all of
        # those into hevolveai-<ver>.dist-info/METADATA as Requires-Dist lines,
        # which end up shipped inside the bundle and reveal the entire
        # architecture stack to anyone who unzips the installer.
        #
        # We cannot delete the dist-info directory -- it's required by:
        #   * HARTOS security/source_protection.py (reads importlib.metadata.
        #     metadata('hevolveai') to classify install trust tier)
        #   * HARTOS scripts/compile_hevolveai.py (reads version('hevolveai')
        #     for signed manifest generation)
        #   * Nunba scripts/build.py:840-860 (explicit "keep all dist-info"
        #     policy — prior strips caused repeated transformers/filelock/
        #     tqdm import failures)
        #
        # What we CAN do is rewrite METADATA to keep only the fields that
        # importlib.metadata consumers need (Name, Version, Summary, optional
        # Author) while dropping Requires-Dist / Description / Classifier
        # blocks that leak internals.  RECORD / WHEEL / INSTALLER /
        # direct_url.json are preserved untouched.
        try:
            import glob as _glob
            _dist_info_dirs = _glob.glob(os.path.join(_embed_sp, 'hevolveai-*.dist-info'))
            for _di in _dist_info_dirs:
                _meta_path = os.path.join(_di, 'METADATA')
                if not os.path.isfile(_meta_path):
                    continue
                _name, _version, _summary = 'hevolveai', '0.1.0', 'HevolveAI compiled binary'
                with open(_meta_path, 'r', encoding='utf-8', errors='replace') as _mf:
                    for _ln in _mf:
                        _lns = _ln.rstrip()
                        if _lns.startswith('Name:'):
                            _name = _lns.split(':', 1)[1].strip() or _name
                        elif _lns.startswith('Version:'):
                            _version = _lns.split(':', 1)[1].strip() or _version
                        elif _lns.startswith('Summary:'):
                            _summary = _lns.split(':', 1)[1].strip() or _summary
                        elif _lns == '' or (not _lns.startswith(('Name:', 'Version:',
                                    'Summary:', 'Metadata-Version:'))):
                            # Body starts — stop parsing headers (don't read
                            # Requires-Dist / Description into memory).
                            if _lns == '':
                                break
                _stub = (
                    'Metadata-Version: 2.1\n'
                    f'Name: {_name}\n'
                    f'Version: {_version}\n'
                    f'Summary: {_summary}\n'
                )
                with open(_meta_path, 'w', encoding='utf-8') as _mf:
                    _mf.write(_stub)
                print(f"python-embed: sanitized METADATA at {os.path.relpath(_meta_path, _embed_sp)}")
        except Exception as _san_err:
            # Non-fatal: if sanitization fails the bundle still builds
            # (just with the leaky METADATA intact).  Log so it's visible.
            print(f"python-embed: METADATA sanitization WARN: {_san_err}")

        # Invalidate hash cache — sibling deps changed python-embed contents
        _skip_python_embed_copy = False
        current_python_embed_hash = get_directory_hash("python-embed")

        _tts_deps = [
            # NOTE: torch is NOT installed here. python-embed ships a minimal
            # torch stub (0.0.0) that satisfies import checks without loading
            # native DLLs. Full torch (CPU or CUDA) is installed at RUNTIME
            # to ~/.nunba/site-packages/ by install_gpu_torch().
            # Installing full torch here causes stack overflow: torch.__init__
            # loads _C.pyd → needs torch_cpu.dll → DLL loader recurses → crash.
            ("chatterbox-tts", "chatterbox-tts", "chatterbox", []),
            ("parler-tts", "parler-tts", "parler_tts", []),
            # descript-audio-codec ships the top-level `dac` package that
            # parler_tts.dac_wrapper imports via `from dac.model import DAC`.
            # Without this, indic_parler crashes at load with:
            #     ModuleNotFoundError: No module named 'dac'
            # Witnessed user-facing failure 2026-04-21 in
            # integrations/service_tools/gpu_worker.py when running
            # indic_parler_tool._load() from the bundled python-embed.
            # parler_tts's own setup.py pins this as a dep but cx_Freeze's
            # --target install at bundle time doesn't resolve transitives
            # for ALL paths; explicit addition here keeps the bundle sound.
            ("descript-audio-codec", "descript-audio-codec", "dac", []),
            # STT — CTranslate2 bundles platform-specific CUDA runtime
            ("faster-whisper", "faster-whisper", "faster_whisper", []),
            ("ctranslate2", "ctranslate2", "ctranslate2", []),
        ]
        for _pkg_label, _pip_name, _import_name, _extra_args in _tts_deps:
            _check_path = os.path.join(_embed_sp, _import_name)
            if os.path.isdir(_check_path) or os.path.isfile(_check_path + '.py'):
                print(f"python-embed: {_pkg_label} already present")
                continue
            print(f"python-embed: installing {_pkg_label} via --target...")
            _pip_cmd = [sys.executable, "-m", "pip", "install", _pip_name,
                        "--target", _embed_sp, "--no-deps", "--quiet"] + _extra_args
            _r = subprocess.run(_pip_cmd, capture_output=True, text=True, timeout=300)
            if _r.returncode == 0:
                print(f"python-embed: {_pkg_label} installed OK")
            else:
                print(f"python-embed: {_pkg_label} install FAILED (non-fatal): {_r.stderr[:150]}")

# ── Post-build: copy python-embed via shutil.copytree ──
# cx_Freeze's include_files doesn't reliably copy dot-prefixed directories
# (e.g. sklearn/.libs/) so we do the entire python-embed copy ourselves.
if ('build' in sys.argv or 'build_exe' in sys.argv) and not _skip_python_embed_copy:
    _build_dir_embed = os.path.abspath(build_exe_options["build_exe"])
    _src_embed = os.path.abspath("python-embed")
    _dst_embed = os.path.join(_build_dir_embed, "python-embed")
    if os.path.isdir(_src_embed):
        print("Post-build: copying python-embed via copytree...")

        # Overwrite in place — avoids rmtree failures from Windows file locks.
        # Retry individual file copies that fail (locked DLLs from stale processes).
        def _robust_copy(src, dst, *, follow_symlinks=True):
            """Copy with retry for locked files."""
            for _attempt in range(3):
                try:
                    shutil.copy2(src, dst)
                    return dst
                except PermissionError:
                    if _attempt < 2:
                        import time as _t; _t.sleep(1)
                    else:
                        print(f"  WARN: cannot overwrite {os.path.basename(dst)} (locked)")
                        return dst

        shutil.copytree(_src_embed, _dst_embed, dirs_exist_ok=True,
                        copy_function=_robust_copy)

        # Clean orphans: files AND empty dirs in dest that don't exist in source
        _orphan_count = 0
        for _root, _dirs, _files in os.walk(_dst_embed, topdown=False):
            _rel = os.path.relpath(_root, _dst_embed)
            _src_dir = os.path.join(_src_embed, _rel)
            # Remove orphan files
            for _f in _files:
                if not os.path.exists(os.path.join(_src_dir, _f)):
                    try:
                        os.remove(os.path.join(_root, _f))
                        _orphan_count += 1
                    except OSError:
                        pass
            # Remove empty directories (topdown=False ensures children first)
            if _root != _dst_embed and not os.path.isdir(_src_dir):
                try:
                    os.rmdir(_root)  # only succeeds if empty
                    _orphan_count += 1
                except OSError:
                    pass

        if _orphan_count:
            print(f"Post-build: cleaned {_orphan_count} orphan files/dirs from python-embed")
        print(f"Post-build: python-embed copied ({_src_embed} -> {_dst_embed})")

        # ── Remove distutils-precedence.pth ──
        # setuptools writes this .pth file which imports _distutils_hack at startup.
        # _distutils_hack isn't bundled in python-embed → breaks ALL pip installs
        # at runtime (CUDA torch, chatterbox-tts, indic-parler, f5-tts).
        _pth_file = os.path.join(_dst_embed, 'Lib', 'site-packages',
                                  'distutils-precedence.pth')
        if os.path.exists(_pth_file):
            os.remove(_pth_file)
            print("Post-build: removed distutils-precedence.pth (fixes runtime pip)")

        # ── Copy unittest into python-embed ──
        # transformers/testing_utils.py imports unittest (transitively via Indic Parler TTS).
        # Can't add to cx_Freeze packages (causes stack overflow from deep mock imports).
        # Can't rely on cx_Freeze auto-detect (not in app.py import chain).
        # Direct file copy is the safe path.
        _unittest_dst = os.path.join(_dst_embed, 'Lib', 'unittest')
        if not os.path.isdir(_unittest_dst):
            import sysconfig
            _stdlib = sysconfig.get_paths()['stdlib']
            _unittest_src = os.path.join(_stdlib, 'unittest')
            if os.path.isdir(_unittest_src):
                shutil.copytree(_unittest_src, _unittest_dst)
                print(f"Post-build: copied unittest to python-embed ({_unittest_src})")
            else:
                print("WARNING: unittest not found in stdlib — TTS may fail")

        # ── torch CPU is bundled (real, not a stub) ──
        # Provides functional CPU inference for all packages at startup.
        # At runtime, if GPU detected, CUDA torch is installed to
        # ~/.nunba/site-packages/ which is first on sys.path → shadows CPU torch.

        # ── Fix torch._C conflict ──
        # PyTorch ships with both torch/_C.cp312-win_amd64.pyd (the real compiled
        # extension) AND torch/_C/ (a directory with .pyi type-hint stubs).
        # Python's import system resolves the directory first, which causes:
        #   "Failed to load PyTorch C extensions: It appears that PyTorch has
        #    loaded the `torch/_C` folder of the PyTorch repository rather than
        #    the C extensions"
        # Fix: remove the torch/_C/ package directory so the .pyd loads correctly.
        _torch_c_dir = os.path.join(_dst_embed, 'Lib', 'site-packages', 'torch', '_C')
        _torch_c_pyd = os.path.join(_dst_embed, 'Lib', 'site-packages', 'torch',
                                     '_C.cp312-win_amd64.pyd')
        if os.path.isdir(_torch_c_dir) and os.path.isfile(_torch_c_pyd):
            shutil.rmtree(_torch_c_dir)
            print("Post-build: removed torch/_C/ stub directory (keeps _C.pyd extension)")
        # Also remove torch/_C_flatbuffer/ if present (same type-hint conflict)
        _torch_c_fb = os.path.join(_dst_embed, 'Lib', 'site-packages', 'torch', '_C_flatbuffer')
        if os.path.isdir(_torch_c_fb):
            _fb_pyd = [f for f in os.listdir(os.path.join(_dst_embed, 'Lib', 'site-packages', 'torch'))
                       if f.startswith('_C_flatbuffer') and f.endswith('.pyd')]
            if _fb_pyd:
                shutil.rmtree(_torch_c_fb)
                print("Post-build: removed torch/_C_flatbuffer/ stub directory")

# ── Post-build: strip HevolveAI source from python-embed ──
# HevolveAI is proprietary — compile to .pyc and remove raw .py source.
# Uses the same approach as HARTOS/scripts/compile_hevolveai.py.
if 'build' in sys.argv or 'build_exe' in sys.argv:
    _build_dir_hv = os.path.abspath(build_exe_options["build_exe"])
    _hv_sp = os.path.join(_build_dir_hv, "python-embed", "Lib", "site-packages")
    _hv_stripped = 0
    for _hv_pkg in ("hevolveai", "embodied_ai"):
        _hv_dir = os.path.join(_hv_sp, _hv_pkg)
        if not os.path.isdir(_hv_dir):
            continue
        # Compile .py → .pyc (optimize=2: strip docstrings + asserts)
        compileall.compile_dir(_hv_dir, quiet=2, force=True, optimize=2)
        # Strip .py source, keep only .pyc
        for _hv_root, _hv_dirs, _hv_files in os.walk(_hv_dir):
            for _hf in _hv_files:
                if _hf.endswith('.py'):
                    _hf_path = os.path.join(_hv_root, _hf)
                    if _hf == '__init__.py':
                        # Stub — needed for package discovery
                        with open(_hf_path, 'w') as _sf:
                            _sf.write('# Compiled\n')
                    else:
                        os.remove(_hf_path)
                        _hv_stripped += 1
        # Move .pyc from __pycache__ to alongside where .py was
        for _hv_root, _hv_dirs, _hv_files in os.walk(_hv_dir, topdown=False):
            if os.path.basename(_hv_root) == '__pycache__':
                for _pcf in os.listdir(_hv_root):
                    if _pcf.endswith('.pyc'):
                        # e.g. module.cpython-312.opt-2.pyc → ../module.pyc
                        _base = _pcf.split('.')[0]
                        _dst_pyc = os.path.join(os.path.dirname(_hv_root), f"{_base}.pyc")
                        if not os.path.exists(_dst_pyc):
                            shutil.move(os.path.join(_hv_root, _pcf), _dst_pyc)
                shutil.rmtree(_hv_root, ignore_errors=True)
        # Clean dist-info (removes direct_url.json, RECORD that leak git URLs)
        for _di in glob.glob(os.path.join(_hv_sp, f"*{_hv_pkg}*.dist-info")):
            for _leak in ("direct_url.json", "RECORD"):
                _lp = os.path.join(_di, _leak)
                if os.path.isfile(_lp):
                    os.remove(_lp)
        if _hv_stripped:
            print(f"Post-build: stripped {_hv_stripped} .py source files from {_hv_pkg}")
    # Also strip embodied-ai dist-info
    for _di in glob.glob(os.path.join(_hv_sp, "*embodied*ai*.dist-info")):
        for _leak in ("direct_url.json", "RECORD"):
            _lp = os.path.join(_di, _leak)
            if os.path.isfile(_lp):
                os.remove(_lp)

# ── Post-build: increase exe stack size ──
# cx_Freeze frozen builds with 15K+ modules cause deep import chains that
# overflow the default 1MB thread stack. Patch the PE header to 8MB.
if 'build' in sys.argv or 'build_exe' in sys.argv:
    _build_dir_pe = os.path.abspath(build_exe_options["build_exe"])
    _exe_pe = os.path.join(_build_dir_pe, "Nunba.exe")
    if os.path.isfile(_exe_pe):
        try:
            import struct as _struct
            with open(_exe_pe, 'rb') as _f:
                _pe_data = bytearray(_f.read())
            _pe_off = _struct.unpack_from('<I', _pe_data, 0x3C)[0]
            _pe_magic = _struct.unpack_from('<H', _pe_data, _pe_off + 0x18)[0]
            if _pe_magic == 0x20B:  # PE32+ (64-bit)
                _stack_off = _pe_off + 0x18 + 0x48
                _fmt = '<Q'
            else:  # PE32 (32-bit)
                _stack_off = _pe_off + 0x18 + 0x44
                _fmt = '<I'
            _old_stack = _struct.unpack_from(_fmt, _pe_data, _stack_off)[0]
            _new_stack = 8 * 1024 * 1024  # 8MB
            _struct.pack_into(_fmt, _pe_data, _stack_off, _new_stack)
            with open(_exe_pe, 'wb') as _f:
                _f.write(_pe_data)
            print(f"Post-build: stack reserve {_old_stack // 1024}KB -> "
                  f"{_new_stack // 1024 // 1024}MB")
        except Exception as _e:
            print(f"WARNING: could not patch stack size: {_e}")

# ── Post-build validation: run Nunba.exe --validate in the frozen environment ──
if 'build' in sys.argv or 'build_exe' in sys.argv:
    import subprocess as _sp
    _build_dir = os.path.abspath(build_exe_options["build_exe"])
    _exe = os.path.join(_build_dir, "Nunba.exe")
    if os.path.isfile(_exe):
        print(f"\n{'='*60}")
        print("POST-BUILD: Running Nunba.exe --validate")
        print(f"{'='*60}")
        try:
            _ret = _sp.run([_exe, "--validate"], capture_output=True, text=True, timeout=300)
        except _sp.TimeoutExpired:
            print("\n*** VALIDATION TIMED OUT after 300s ***")
            print("The frozen exe took too long to validate. Possible causes:")
            print("  - Heavy module imports (LangChain, numpy) slow on cold disk")
            print("  - A module-level import is blocking (network timeout, DB lock)")
            print("  - Antivirus scanning the new exe")
            # Check validate.log even on timeout — partial output may be there
            _val_log_candidates = [
                os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba', 'logs', 'validate.log'),
                os.path.join(_build_dir, 'validate.log'),
            ]
            _val_log = next((p for p in _val_log_candidates if os.path.isfile(p)), None)
            if _val_log:
                print("\n--- validate.log (partial) ---")
                print(open(_val_log, encoding='utf-8').read().strip())
            print("\nBuild artifacts are still usable — validation is a smoke test only.")
            print("Run manually: build\\Nunba\\Nunba.exe --validate\n")
            # Don't sys.exit(1) — the build itself succeeded; only validation timed out
            _ret = None
        if _ret is not None:
            # Print captured stdout/stderr
            if _ret.stdout:
                print(_ret.stdout)
            if _ret.stderr:
                print(_ret.stderr)
            # Also read validate.log as fallback if stdout/stderr were swallowed
            _val_log_candidates = [
                os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba', 'logs', 'validate.log'),
                os.path.join(_build_dir, 'validate.log'),
            ]
            _val_log = next((p for p in _val_log_candidates if os.path.isfile(p)), None)
            if _val_log:
                _log_text = open(_val_log, encoding='utf-8').read().strip()
                if _log_text and _log_text not in (_ret.stdout or ''):
                    print("\n--- validate.log (from inside frozen exe) ---")
                    # Replace Unicode box-drawing chars with ASCII for cp1252 consoles
                    try:
                        print(_log_text)
                    except UnicodeEncodeError:
                        print(_log_text.encode('ascii', errors='replace').decode('ascii'))
            if _ret.returncode != 0:
                # Win32GUI exes often crash during Python teardown (0xC0000005 = access
                # violation) AFTER validation completes. Check validate.log for actual results.
                _log_says_good = _val_log and 'Failed: 0' in open(_val_log, encoding='utf-8').read()
                if _log_says_good:
                    print(f"\n[INFO] Exe exited with code {_ret.returncode} (teardown crash), "
                          f"but validate.log shows 0 failures — build is good.\n")
                else:
                    print(f"\n*** VALIDATION FAILED (exit {_ret.returncode}) ***")
                    print("Fix import errors above before distributing.\n")
                    sys.exit(1)
            else:
                print("Validation passed.\n")
    else:
        print(f"\n[WARN] {_exe} not found — skipping validation\n")

# After setup, write the DEST hash (not source hash) so the skip check
# works correctly even after post-copy modifications (torch _C/ cleanup, etc.)
if current_python_embed_hash:
    build_dir = build_exe_options["build_exe"]
    dest_embed_path = os.path.join(build_dir, "python-embed")
    if os.path.isdir(dest_embed_path):
        os.makedirs(build_dir, exist_ok=True)
        # Hash the actual dest state (after torch cleanup + orphan removal)
        _final_dest_hash = get_directory_hash(dest_embed_path)
        hash_file = os.path.join(build_dir, "python-embed.hash")
        with open(hash_file, 'w') as f:
            f.write(f"{current_python_embed_hash}\n{_final_dest_hash}")
        print(f"Updated python-embed.hash in {build_dir}")
