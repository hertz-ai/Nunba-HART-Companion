"""
setup_freeze_linux.py - Creates Nunba executable for Linux (AppImage target)

Nunba: A Friend, A Well Wisher, Your LocalMind
Connect to Hivemind with your friends' agents.

Usage:
    python setup_freeze_linux.py build       # Build frozen executable
    python setup_freeze_linux.py build_exe   # Same as above

Requires: GTK3 + webkit2gtk for pywebview on Linux.
    sudo apt install libgirepository1.0-dev libwebkit2gtk-4.0-dev gir1.2-webkit2-4.0
"""
import compileall
import glob
import os
import py_compile
import shutil
import sys

# Ensure we're on Linux
if not sys.platform.startswith('linux'):
    print("This script is for Linux only.")
    print("  Windows: use setup_freeze_nunba.py")
    print("  macOS:   use setup_freeze_mac.py")
    sys.exit(1)

# hevolveai/embodied_ai pull in torch/transformers which cause cx_Freeze
# import recursion. Block them from being importable during the build --
# they're bundled via python-embed, not cx_Freeze.
# 1. Remove editable src paths
_hevolveai_src = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', '..', 'hevolveai', 'src'))
if _hevolveai_src in sys.path:
    sys.path.remove(_hevolveai_src)
    print("Removed hevolveai/src from sys.path")

# 2. Block wheel-installed hevolveai/embodied_ai from being found
for _block_pkg in ('hevolveai', 'embodied_ai'):
    if _block_pkg in sys.modules:
        del sys.modules[_block_pkg]

sys.setrecursionlimit(5000)  # safety margin for deep import chains

from cx_Freeze import Executable, setup

# Ensure current directory is in path for module discovery
if os.getcwd() not in sys.path:
    sys.path.append(os.getcwd())

# Import version from centralized deps.py
_scripts_dir = os.path.dirname(os.path.abspath(__file__))
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)
from deps import version_short

# -- Auto-install sibling project editable deps ------
# Ensures HARTOS, hevolveai, hevolve-database, agent-ledger are
# pip-installed from sibling directories BEFORE cx_Freeze traces imports.
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
    # Clean stale build/ directory
    _build_dir = os.path.join(_sib_path, 'build')
    if os.path.isdir(_build_dir):
        try:
            shutil.rmtree(_build_dir)
            print(f"  Cleaned stale {_build_dir}")
        except OSError:
            pass
    # Install editable (no deps -- avoids git clone failures)
    print(f"Auto-installing {_pkg_name} from {_sib_path}...")
    _result = _sp.run(
        [sys.executable, '-m', 'pip', 'install', '-e', _sib_path, '--no-deps', '--quiet'],
        capture_output=True, text=True, timeout=60)
    if _result.returncode != 0:
        # Retry once after aggressive build cleanup
        print(f"  Retry: cleaning build artifacts and reinstalling {_pkg_name}...")
        for _stale in ('build', 'dist', f'{_pkg_name.replace("-","_")}.egg-info'):
            _stale_path = os.path.join(_sib_path, _stale)
            if os.path.isdir(_stale_path):
                shutil.rmtree(_stale_path, ignore_errors=True)
        _result = _sp.run(
            [sys.executable, '-m', 'pip', 'install', '-e', _sib_path, '--no-deps', '--quiet'],
            capture_output=True, text=True, timeout=60)
        if _result.returncode != 0:
            print(f"  WARNING: {_pkg_name} install failed: {_result.stderr.strip()}")
print("Sibling deps verified")


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


def ensure_png_icon():
    """Ensure a PNG icon exists for the AppImage/desktop file.

    Returns the path to a usable PNG icon, or None.
    """
    # Prefer dedicated Nunba logo, then fallback
    for logo in ["Nunba_Logo.png", "Product_Hevolve_Logo.png"]:
        if os.path.exists(logo):
            print(f"Found icon: {logo}")
            return logo

    # Try to extract from app.ico if it exists (Windows builds may have it)
    if os.path.exists("app.ico"):
        try:
            from PIL import Image
            img = Image.open("app.ico")
            # Get the largest size from the ICO
            img.save("nunba_icon.png", format="PNG")
            print("Extracted PNG icon from app.ico")
            return "nunba_icon.png"
        except Exception as e:
            print(f"Warning: Could not extract icon from app.ico: {e}")

    return None


icon_path = ensure_png_icon()


# -- Build options --
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
        "tkinter",
        "flask_cors",
        "pyautogui",
        "PIL",
        # langchain_classic uses __getattr__ + create_importer for lazy imports.
        # cx_Freeze can't trace importlib.import_module() calls at runtime,
        # so include the full package trees.
        "langchain_classic",
        "langchain_core",
        "io",
        "uuid",
        "subprocess",
        "shlex",
        # Linux: pystray for system tray (requires gi/AppIndicator3)
        "pystray",
        "pyperclip",
        "waitress",
        "requests",

        "routes.chatbot_routes",
        "routes.kids_media_routes",

        "uvicorn",
        "fastapi",
        "pydantic",
        "sqlalchemy",
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
        "llama.llama_installer",
        "llama.llama_config",
        "llama.llama_health_endpoint",
        "desktop.tray_handler",
        "desktop.platform_utils",
        "tts.piper_tts",
        "tts.package_installer",
        "tts.tts_engine",
        "desktop.ai_installer",
        "desktop.ai_key_vault",
        "desktop.crash_reporter",
        "desktop.config",
        "desktop.indicator_window",
        "desktop.tray_handler",
        "desktop.platform_utils",
        "desktop.splash_effects",
        "desktop.media_classification",
        "routes.hartos_backend_adapter",
        "numpy",
        "jose",
        # hevolve-database SQL package
        "sql",
        "sql.crud",
        "sql.models",
        "sql.database",
        "sql.schemas",
        "sql.otp",
        "sql.bookparsing",
        # HARTOS runtime deps
        "aiohttp",
        "dotenv",
        "cryptography",
        "redis",
        "bs4",
    ],
    "zip_includes": [],
    "build_exe": "build/Nunba",
    "excludes": [
        "unittest", "test", "tests",
        "shapely.plotting", "shapely.tests",
        # Exclude large unnecessary packages
        "cv2", "opencv",
        "torch", "tensorflow", "keras",
        # embodied_ai/hevolveai bundled via python-embed, not cx_Freeze
        "embodied_ai", "hevolveai",
        "matplotlib", "scipy", "numpy.tests",
        "IPython", "jupyter", "notebook",
        "pandas.tests", "PIL.tests",
        "setuptools", "distutils",
        "lib2to3", "email.test",
        "asyncio.test", "ctypes.test",
        "tkinter.test", "sqlite3.test",
        "pydoc_data",
        # Exclude Qt (using GTK/WebKit2 backend on Linux)
        "PyQt5", "PyQt6", "PySide2", "PySide6", "qtpy",
        "webview.platforms.qt",
        # Exclude Windows-only backends
        "webview.platforms.edgechromium",
        "webview.platforms.winforms",
        "webview.platforms.mshtml",
        # Exclude Windows-only packages
        "win10toast", "winreg", "win32api", "win32con", "win32gui",
        "pywin32", "pythoncom", "pywintypes",
        # pycparser included as source files
        "pycparser",
        # Linux agent_engine modules excluded (same as Windows)
        "integrations.agent_engine.liquid_ui_service",
        "integrations.agent_engine.shell_manifest",
        "integrations.agent_engine.theme_service",
        "integrations.agent_engine.model_bus_service",
        "integrations.agent_engine.compute_mesh_service",
        "integrations.agent_engine.app_bridge_service",
    ],
    "zip_exclude_packages": [
        "cffi",
    ],
    # Auto-discover source files
    "include_files": (
        # 1. Auto-include ALL .py files from project root
        [(f, f) for f in glob.glob("*.py")
         if f not in ("app.py", "setup.py")]
        # 2. Auto-include ALL .json config files
        + [(f, f) for f in glob.glob("*.json")]
        # 3. Auto-include ALL .png/.ico asset files
        + [(f, f) for f in glob.glob("*.png") + glob.glob("*.ico")]
        # 4. Key directories
        + [
            ("templates", "templates"),
            ("landing-page/build", "landing-page/build"),
        ]
        # 5. Assets directory if it exists
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
        # pywebview GTK/WebKit2 backend for Linux
        "webview.platforms.gtk",
    ],
}

if pycparser_source:
    build_exe_options["include_files"].append((pycparser_source, "lib_src/pycparser"))
    print("Including pycparser source files for proper import handling")

build_exe_options["include_files"] = [item for item in build_exe_options["include_files"] if item is not None]

# Include *.libs shared library directories (numpy.libs, shapely.libs, etc.)
# cx_Freeze traces Python modules but NOT these companion .so directories.
import site as _site

_site_packages_dirs = _site.getsitepackages() if hasattr(_site, 'getsitepackages') else []
# Also check the venv site-packages directly
_venv_sp = os.path.join(os.path.dirname(os.path.dirname(sys.executable)), 'lib',
                         f'python{sys.version_info.major}.{sys.version_info.minor}',
                         'site-packages')
if os.path.isdir(_venv_sp) and _venv_sp not in _site_packages_dirs:
    _site_packages_dirs.append(_venv_sp)

for _sp_dir in _site_packages_dirs:
    if not os.path.isdir(_sp_dir):
        continue
    for _entry in os.listdir(_sp_dir):
        if _entry.endswith('.libs'):
            _libs_src = os.path.join(_sp_dir, _entry)
            if os.path.isdir(_libs_src):
                build_exe_options["include_files"].append((_libs_src, f"lib/{_entry}"))
                print(f"Including shared lib directory: {_entry}")

# Conditionally include optional packages that may not be installed
import importlib.util as _ilu

_optional_packages = [
    "autogen",
    "autogen_agentchat",
    "apscheduler",
    "json_repair",
    *[p for p in ["agent_ledger"]
      if _ilu.find_spec(p) and getattr(_ilu.find_spec(p), 'origin', None)],
    "langchain_anthropic",
    "langchain_google_genai",
    "langchain_groq",
    "langchain",
    "langchain_community",
    "langchain_openai",
    "cryptography",
    "sentry_sdk",
    "google.auth",
    "google.oauth2",
    # Linux notification support
    "gi",  # PyGObject (GTK bindings)
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

    Checks ALL sources and merges results.
    """
    # Auto-discover from HARTOS pyproject.toml
    hevolve_modules = None
    _hartos_toml = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                '..', '..', 'HARTOS', 'pyproject.toml')
    if os.path.isfile(_hartos_toml):
        import re
        try:
            with open(_hartos_toml, encoding='utf-8') as _tf:
                _toml_text = _tf.read()
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
        # Fallback: hardcoded list
        hevolve_modules = [
            'hart_intelligence', 'hart_intelligence_entry', 'helper', 'helper_ledger',
            'create_recipe', 'reuse_recipe', 'lifecycle_hooks',
            'threadlocal', 'gather_agentdetails',
            'cultural_wisdom', 'recipe_experience', 'exception_collector',
            'agent_identity', 'hart_onboarding', 'hartos_speech',
            'hartos_speech_stitch',
        ]
    found = {}

    # 1. pip-installed modules
    import importlib.util
    for mod_name in hevolve_modules:
        spec = importlib.util.find_spec(mod_name)
        if spec and spec.origin and os.path.isfile(spec.origin):
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
    print("WARNING: agent_ledger package not found -- distributed agent features unavailable")

# Include HARTOS package directories (integrations, core, security)
_hartos_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           '..', '..', 'HARTOS')
_hartos_packages = [
    ("integrations", "integrations"),
    ("core", "core"),
    ("security", "security"),
]
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
        print(f"WARNING: {_pkg_name} package not found -- related features unavailable")

# Verify sql package is pip-installed
try:
    _sql_spec = _ilu.find_spec("sql")
    if _sql_spec:
        print(f"sql package found: {_sql_spec.origin or _sql_spec.submodule_search_locations}")
    else:
        print("WARNING: hevolve-database not pip-installed -- run: pip install -e ../Hevolve_Database")
except Exception as _sql_err:
    print(f"WARNING: sql package check failed ({_sql_err})")

# Include langchain config.json
_langchain_config = None
for _cfg_candidate in [
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'HARTOS', 'config.json'),
    os.path.join('hartos_backend_src', 'config.json'),
]:
    if os.path.isfile(_cfg_candidate):
        _langchain_config = os.path.normpath(_cfg_candidate)
        break
if _langchain_config and os.path.isfile(_langchain_config):
    try:
        import json as _json_check
        with open(_langchain_config) as _f:
            _cfg_data = _json_check.load(_f)
        _secret_keys = [k for k in _cfg_data if 'API_KEY' in k.upper() or 'SECRET' in k.upper()]
        if _secret_keys:
            print(f"WARNING: langchain config.json contains secret keys: {_secret_keys}")
    except Exception:
        pass
    print(f"Including langchain config.json <- {_langchain_config}")
    build_exe_options["include_files"].append((_langchain_config, "langchain_config.json"))
    _openapi_yaml = os.path.join(os.path.dirname(_langchain_config), 'openapi.yaml')
    if os.path.isfile(_openapi_yaml):
        build_exe_options["include_files"].append((os.path.normpath(_openapi_yaml), "openapi.yaml"))
        print(f"Including openapi.yaml <- {_openapi_yaml}")
else:
    import json as _json_min
    _min_config = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'langchain_config.json')
    if not os.path.isfile(_min_config):
        with open(_min_config, 'w') as _f:
            _json_min.dump({"OPENAI_API_KEY": "", "GOOGLE_CSE_ID": ""}, _f)
    build_exe_options["include_files"].append((os.path.normpath(_min_config), "langchain_config.json"))
    print("NOTE: langchain config.json not found -- created minimal placeholder")


def get_directory_hash(directory):
    """SHA-256 hash of entire directory tree."""
    import hashlib
    hash_obj = hashlib.sha256()
    for root, dirs, files in os.walk(directory):
        dirs.sort()
        rel_root = os.path.relpath(root, directory)
        for d in dirs:
            hash_obj.update(os.path.join(rel_root, d).encode('utf-8'))
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


# python-embed is copied via shutil.copytree in the post-build step
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
            dest_hash = get_directory_hash(dest_embed)
            if dest_hash == _old_dest_hash:
                _skip_python_embed_copy = True
            else:
                print("python-embed build dir is stale/incomplete, will re-copy...")
    if _skip_python_embed_copy:
        print("python-embed unchanged and verified, skipping copy...")


# -- Linux executable (no base = console; pywebview opens GTK window) --
executables = [
    Executable(
        "app.py",
        base=None,  # Console on Linux (no Win32GUI equivalent)
        target_name="Nunba",
        icon=icon_path,  # PNG icon (or None)
    )
]

setup(
    name="Nunba",
    version=version_short(),
    description="Nunba - A Friend, A Well Wisher, Your LocalMind",
    author="HevolveAI",
    options={
        "build_exe": build_exe_options,
    },
    executables=executables,
)

# ============================================================================
# Post-build steps
# ============================================================================

if 'build' in sys.argv or 'build_exe' in sys.argv:
    _build_dir = os.path.abspath(build_exe_options["build_exe"])

    # -- Post-build: compile raw .py to .pyc and remove source --
    _build_lib = os.path.join(_build_dir, "lib")
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

    # Remove stale HARTOS .py files from build root
    _root_cleaned = 0
    for _hartos_mod in ['hart_intelligence', 'hart_intelligence_entry', 'helper',
                        'helper_ledger', 'create_recipe', 'reuse_recipe',
                        'lifecycle_hooks', 'threadlocal', 'gather_agentdetails',
                        'cultural_wisdom', 'recipe_experience', 'exception_collector',
                        'agent_identity', 'hart_onboarding', 'hartos_speech',
                        'hartos_speech_stitch', 'crossbar_server', 'hart_version']:
        _old_py = os.path.join(_build_dir, f"{_hartos_mod}.py")
        if os.path.isfile(_old_py):
            os.remove(_old_py)
            _root_cleaned += 1
    if _root_cleaned:
        print(f"Post-build: removed {_root_cleaned} stale HARTOS .py files from build root")

    # -- Post-build cleanup: remove stale __pycache__ dirs --
    _removed = 0
    for _root, _dirs, _files in os.walk(_build_dir):
        if '__pycache__' in _dirs:
            _pc = os.path.join(_root, '__pycache__')
            try:
                shutil.rmtree(_pc)
                _removed += 1
            except Exception:
                pass
    if _removed:
        print(f"Post-build: removed {_removed} __pycache__ dirs from build")

    # -- Post-build: copy python-embed via shutil.copytree --
    if not _skip_python_embed_copy:
        _src_embed = os.path.abspath("python-embed")
        _dst_embed = os.path.join(_build_dir, "python-embed")
        if os.path.isdir(_src_embed):
            print("Post-build: copying python-embed via copytree...")
            shutil.copytree(_src_embed, _dst_embed, dirs_exist_ok=True)

            # Clean orphans
            _orphan_count = 0
            for _root, _dirs, _files in os.walk(_dst_embed, topdown=False):
                _rel = os.path.relpath(_root, _dst_embed)
                _src_dir_check = os.path.join(_src_embed, _rel)
                for _f in _files:
                    if not os.path.exists(os.path.join(_src_dir_check, _f)):
                        try:
                            os.remove(os.path.join(_root, _f))
                            _orphan_count += 1
                        except OSError:
                            pass
                if _root != _dst_embed and not os.path.isdir(_src_dir_check):
                    try:
                        os.rmdir(_root)
                        _orphan_count += 1
                    except OSError:
                        pass
            if _orphan_count:
                print(f"Post-build: cleaned {_orphan_count} orphan files/dirs from python-embed")
            print(f"Post-build: python-embed copied ({_src_embed} -> {_dst_embed})")

    # -- Post-build: strip HevolveAI source from python-embed --
    _hv_sp = os.path.join(_build_dir, "python-embed", "Lib", "site-packages")
    # Also check Linux-style path
    if not os.path.isdir(_hv_sp):
        _hv_sp = os.path.join(_build_dir, "python-embed", "lib",
                               f"python{sys.version_info.major}.{sys.version_info.minor}",
                               "site-packages")
    _hv_stripped = 0
    for _hv_pkg in ("hevolveai", "embodied_ai"):
        _hv_dir = os.path.join(_hv_sp, _hv_pkg)
        if not os.path.isdir(_hv_dir):
            continue
        compileall.compile_dir(_hv_dir, quiet=2, force=True, optimize=2)
        for _hv_root, _hv_dirs, _hv_files in os.walk(_hv_dir):
            for _hf in _hv_files:
                if _hf.endswith('.py'):
                    _hf_path = os.path.join(_hv_root, _hf)
                    if _hf == '__init__.py':
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
                        _base_name = _pcf.split('.')[0]
                        _dst_pyc = os.path.join(os.path.dirname(_hv_root), f"{_base_name}.pyc")
                        if not os.path.exists(_dst_pyc):
                            shutil.move(os.path.join(_hv_root, _pcf), _dst_pyc)
                shutil.rmtree(_hv_root, ignore_errors=True)
        # Clean dist-info
        for _di in glob.glob(os.path.join(_hv_sp, f"*{_hv_pkg}*.dist-info")):
            for _leak in ("direct_url.json", "RECORD"):
                _lp = os.path.join(_di, _leak)
                if os.path.isfile(_lp):
                    os.remove(_lp)
        if _hv_stripped:
            print(f"Post-build: stripped {_hv_stripped} .py source files from {_hv_pkg}")

    # -- Post-build: set executable permissions on binaries --
    print("Post-build: setting executable permissions on binaries...")
    _nunba_exe = os.path.join(_build_dir, "Nunba")
    if os.path.isfile(_nunba_exe):
        os.chmod(_nunba_exe, 0o755)
    # Set +x on all .so files
    _so_count = 0
    for _root, _dirs, _files in os.walk(_build_dir):
        for _f in _files:
            if _f.endswith('.so') or '.so.' in _f:
                _so_path = os.path.join(_root, _f)
                try:
                    os.chmod(_so_path, 0o755)
                    _so_count += 1
                except OSError:
                    pass
    if _so_count:
        print(f"Post-build: set +x on {_so_count} shared libraries")

    # -- Post-build validation --
    _exe = os.path.join(_build_dir, "Nunba")
    if os.path.isfile(_exe):
        print(f"\n{'='*60}")
        print("POST-BUILD: Running Nunba --validate")
        print(f"{'='*60}")
        import subprocess as _sp
        try:
            _ret = _sp.run([_exe, "--validate"], capture_output=True, text=True, timeout=300)
        except _sp.TimeoutExpired:
            print("\n*** VALIDATION TIMED OUT after 300s ***")
            print("Build artifacts are still usable -- validation is a smoke test only.")
            _ret = None
        if _ret is not None:
            if _ret.stdout:
                print(_ret.stdout)
            if _ret.stderr:
                print(_ret.stderr)
            # Check validate.log
            _val_log_candidates = [
                os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba', 'logs', 'validate.log'),
                os.path.join(_build_dir, 'validate.log'),
            ]
            _val_log = next((p for p in _val_log_candidates if os.path.isfile(p)), None)
            if _val_log:
                _log_text = open(_val_log, encoding='utf-8').read().strip()
                if _log_text and _log_text not in (_ret.stdout or ''):
                    print("\n--- validate.log ---")
                    print(_log_text)
            if _ret.returncode != 0:
                _log_says_good = _val_log and 'Failed: 0' in open(_val_log, encoding='utf-8').read()
                if _log_says_good:
                    print(f"\n[INFO] Exe exited with code {_ret.returncode} but validate.log "
                          f"shows 0 failures -- build is good.\n")
                else:
                    print(f"\n*** VALIDATION FAILED (exit {_ret.returncode}) ***")
                    print("Fix import errors above before distributing.\n")
                    sys.exit(1)
            else:
                print("Validation passed.\n")
    else:
        print(f"\n[WARN] {_exe} not found -- skipping validation\n")

# Update python-embed hash after all post-build modifications
if current_python_embed_hash:
    build_dir = build_exe_options["build_exe"]
    dest_embed_path = os.path.join(build_dir, "python-embed")
    if os.path.isdir(dest_embed_path):
        os.makedirs(build_dir, exist_ok=True)
        _final_dest_hash = get_directory_hash(dest_embed_path)
        hash_file = os.path.join(build_dir, "python-embed.hash")
        with open(hash_file, 'w') as f:
            f.write(f"{current_python_embed_hash}\n{_final_dest_hash}")
        print(f"Updated python-embed.hash in {build_dir}")
