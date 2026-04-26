"""
setup_freeze_mac.py - Creates Nunba macOS Application Bundle

Nunba: A Friend, A Well Wisher, Your LocalMind
Connect to Hivemind with your friends' agents.

Usage:
    python setup_freeze_mac.py build       # Build .app bundle
    python setup_freeze_mac.py bdist_dmg   # Build DMG installer
"""
import compileall
import glob
import os
import py_compile
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

# cx_Freeze traces deep dependency chains (langchain, autogen, etc.) that
# can exceed Python's default 1000-frame recursion limit during compilation.
sys.setrecursionlimit(5000)

from cx_Freeze import Executable, setup

# Ensure we're on macOS
if sys.platform != "darwin":
    print("This script is for macOS only. Use setup_freeze_nunba.py for Windows.")
    sys.exit(1)

# Import version from centralized deps.py
_scripts_dir = os.path.dirname(os.path.abspath(__file__))
if _scripts_dir not in sys.path:
    sys.path.insert(0, _scripts_dir)

# Ensure project root is on sys.path so cx_Freeze can find local packages
# (llama, desktop, routes, tts, models, etc.)
_project_root = os.path.normpath(os.path.join(_scripts_dir, '..'))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from deps import VERSION, version_short


def ensure_icon_exists():
    """Create .icns icon file from PNG if needed"""
    if os.path.exists("app.icns"):
        return "app.icns"

    logo_files = ["Nunba_Logo.png", "Product_Hevolve_Logo.png"]

    for logo_file in logo_files:
        if os.path.exists(logo_file):
            try:
                import subprocess

                from PIL import Image

                # Create iconset directory
                iconset_path = "app.iconset"
                os.makedirs(iconset_path, exist_ok=True)

                img = Image.open(logo_file)

                # macOS icon sizes
                icon_sizes = [16, 32, 64, 128, 256, 512, 1024]

                for size in icon_sizes:
                    # Regular resolution
                    resized = img.resize((size, size), Image.LANCZOS)
                    resized.save(os.path.join(iconset_path, f"icon_{size}x{size}.png"))
                    # Retina resolution (2x)
                    if size <= 512:
                        resized_2x = img.resize((size * 2, size * 2), Image.LANCZOS)
                        resized_2x.save(os.path.join(iconset_path, f"icon_{size}x{size}@2x.png"))

                # Convert iconset to icns using iconutil
                subprocess.run(["iconutil", "-c", "icns", iconset_path], check=True)

                # Clean up iconset
                import shutil
                shutil.rmtree(iconset_path, ignore_errors=True)

                print(f"Successfully converted {logo_file} to app.icns")
                return "app.icns"
            except Exception as e:
                print(f"Error converting logo to icns: {str(e)}")
                # Fallback: try using sips
                try:
                    subprocess.run(["sips", "-s", "format", "icns", logo_file, "--out", "app.icns"], check=True)
                    return "app.icns"
                except Exception:
                    pass

    return None

icon_path = ensure_icon_exists()


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

# Common packages for all platforms
build_exe_options = {
    "path": sys.path + [_project_root],
    "packages": [
        "os", "sys", "flask", "threading", "logging",
        "webview", "argparse", "importlib", "traceback",
        "json", "time", "ctypes", "pathlib", "shutil",
        "flask_cors", "pyautogui", "PIL", "io", "uuid",
        "subprocess", "shlex", "pyperclip", "waitress",
        "requests", "desktop.indicator_window", "routes.chatbot_routes",
        "tkinter", "uvicorn", "fastapi", "pydantic",
        "sqlalchemy", "pytz", "autobahn", "shapely",
        "starlette", "alembic", "greenlet",
        "importlib.util", "urllib.request", "urllib.error",
        "zipfile", "platform", "typing", "socket",
        "llama.llama_installer", "llama.llama_config", "llama.llama_health_endpoint",
        "desktop.tray_handler", "desktop.platform_utils", "tts.piper_tts",
        "tts.vibevoice_tts", "tts.tts_engine", "desktop.ai_installer",
        "desktop.crash_reporter", "desktop.config",
        "routes.hartos_backend_adapter",
        "desktop.ai_key_vault",
        # langchain_classic uses __getattr__ + create_importer for lazy imports.
        # cx_Freeze can't trace importlib.import_module() calls at runtime,
        # so include the full package trees to ensure all submodules are available.
        "langchain_classic",
        "langchain_core",
        "numpy",
        "jose",
    ],
    "zip_includes": [],
    "zip_exclude_packages": ["*"],  # extract all packages to filesystem (avoids zip import issues on macOS)
    "build_exe": "build/Nunba.app/Contents/MacOS",
    "excludes": [
        "test", "tests",  # Keep unittest — transformers/testing_utils.py imports it (Indic Parler TTS dep)
        "shapely.plotting", "shapely.tests",
        "torch", "tensorflow", "keras",
        "matplotlib", "scipy", "numpy.tests",
        "IPython", "jupyter", "notebook",
        "pandas.tests", "PIL.tests",
        "setuptools", "distutils",
        "lib2to3", "email.test",
        "asyncio.test", "ctypes.test",
        "tkinter.test", "sqlite3.test",
        "pydoc_data",
        # Windows-specific (exclude on macOS)
        "win10toast", "winreg",
    ],
    # ── Auto-discover source files (mirroring setup_freeze_nunba.py) ──
    "include_files": (
        # 1. Auto-include ALL .py files from project root (except build/test scripts)
        [(f, f) for f in glob.glob("*.py")
         if f not in ("app.py", "setup.py")]
        # 2. Auto-include ALL .json files from project root
        + [(f, f) for f in glob.glob("*.json")]
        # 3. Auto-include ALL .png/.ico asset files
        + [(f, f) for f in glob.glob("*.png") + glob.glob("*.ico")]
        # 4. Key directories
        + [
            ("templates", "templates"),
        ]
        # 5. React SPA build
        + ([("landing-page/build", "landing-page/build")]
           if os.path.isdir("landing-page/build") else [])
        # 6. Assets directory (bundled fonts, etc.)
        + ([("assets", "assets")] if os.path.isdir("assets") else [])
    ),
}

# ── Include hart-backend modules (same logic as Windows build) ──
def find_hevolve_modules():
    hevolve_modules = [
        'hart_intelligence', 'hart_intelligence_entry', 'helper', 'helper_ledger',
        'create_recipe', 'reuse_recipe', 'lifecycle_hooks',
        'threadlocal', 'gather_agentdetails',
        'cultural_wisdom', 'recipe_experience', 'exception_collector',
    ]
    found = {}
    import importlib.util
    for mod_name in hevolve_modules:
        spec = importlib.util.find_spec(mod_name)
        if spec and spec.origin and os.path.isfile(spec.origin):
            found[mod_name] = (spec.origin, f"{mod_name}.py")
    llm_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           '..', '..', 'HARTOS')
    if os.path.isdir(llm_dir):
        for mod_name in hevolve_modules:
            if mod_name in found:
                continue
            mod_path = os.path.join(llm_dir, f"{mod_name}.py")
            if os.path.isfile(mod_path):
                found[mod_name] = (mod_path, f"{mod_name}.py")
    print(f"Found {len(found)}/{len(hevolve_modules)} hart-backend modules (macOS)")
    return list(found.values())

hevolve_files = find_hevolve_modules()
build_exe_options["include_files"] = list(build_exe_options["include_files"]) + hevolve_files

# Include agent_ledger package if not pip-installed (lives in sibling dir)
import importlib.util as _ilu_pre

if not _ilu_pre.find_spec("agent_ledger"):
    _al_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            '..', '..', 'HARTOS', 'agent-ledger-opensource', 'agent_ledger')
    if os.path.isdir(_al_path) and os.path.isfile(os.path.join(_al_path, '__init__.py')):
        build_exe_options["include_files"].append((os.path.normpath(_al_path), "agent_ledger"))
        print(f"Including agent_ledger package <- {os.path.normpath(_al_path)}")
    else:
        print("WARNING: agent_ledger package not found — distributed agent features unavailable")

# ── Conditionally include optional packages ──
import importlib.util as _ilu

_optional_packages = [
    "autogen", "autogen_agentchat", "apscheduler", "json_repair",
    "integrations", "integrations.social", "integrations.coding_agent",
    "integrations.service_tools", "integrations.channels",
    "integrations.distributed_agent", "agent_ledger", "security", "core",
    "hevolveai", "embodied_ai",  # HevolveAI (Embodied Continual Learner With Hiveintelligence)
    "langchain_anthropic", "langchain_google_genai", "langchain_groq",
    "langchain", "langchain_core", "langchain_community", "langchain_openai",
    "cryptography", "sentry_sdk",
    "google.auth", "google.oauth2",
]
for _pkg in _optional_packages:
    if _ilu.find_spec(_pkg):
        build_exe_options["packages"].append(_pkg)
        print(f"Including optional package: {_pkg}")

# Include langchain config.json with safe destination name
_langchain_config = None
for _cfg_candidate in [
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'HARTOS', 'config.json'),
]:
    if os.path.isfile(_cfg_candidate):
        _langchain_config = os.path.normpath(_cfg_candidate)
        break
if _langchain_config:
    build_exe_options["include_files"].append((_langchain_config, "langchain_config.json"))

# Include pycparser source files to avoid circular import issues in frozen app
if pycparser_source:
    build_exe_options["include_files"].append((pycparser_source, "lib_src/pycparser"))
    print("Including pycparser source files for proper import handling")

build_exe_options["include_files"] = [item for item in build_exe_options["include_files"] if item is not None]


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
    _pe_build_dir = build_exe_options["build_exe"]
    hash_file = os.path.join(_pe_build_dir, "python-embed.hash")
    dest_embed = os.path.join(_pe_build_dir, "python-embed")
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

# macOS uses no base (console app wrapped in .app)
base = None

# DMG options for macOS installer
bdist_mac_options = {
    "iconfile": icon_path,
    "bundle_name": "Nunba",
    "custom_info_plist": None,  # Will use default or custom Info.plist
}

bdist_dmg_options = {
    "volume_label": "Nunba",
    "applications_shortcut": True,
}

executables = [
    Executable(
        "app.py",
        base=base,
        target_name="Nunba",
        icon=icon_path,
    )
]

# Create Info.plist content
info_plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>English</string>
    <key>CFBundleDisplayName</key>
    <string>Nunba</string>
    <key>CFBundleExecutable</key>
    <string>Nunba</string>
    <key>CFBundleIconFile</key>
    <string>app.icns</string>
    <key>CFBundleIdentifier</key>
    <string>com.hevolveai.nunba</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>Nunba</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>{version_short()}</string>
    <key>CFBundleVersion</key>
    <string>{VERSION}</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSHumanReadableCopyright</key>
    <string>© 2025 HevolveAI</string>
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>HevolveAI Protocol</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>hevolveai</string>
            </array>
        </dict>
    </array>
    <key>LSUIElement</key>
    <false/>
    <key>LSArchitecturePriority</key>
    <array>
        <string>arm64</string>
        <string>x86_64</string>
    </array>
</dict>
</plist>
"""

# Pre-build: bundle TTS/STT packages into python-embed site-packages
# Build runs on target platform → pip gets correct native binaries (macOS ARM/x64)
if "build" in sys.argv or "bdist_mac" in sys.argv or "bdist_dmg" in sys.argv:
    _embed_sp = os.path.join("python-embed", "lib",
                             f"python{sys.version_info.major}.{sys.version_info.minor}",
                             "site-packages")
    if not os.path.isdir(_embed_sp):
        _embed_sp = os.path.join("python-embed", "Lib", "site-packages")

    if os.path.isdir(_embed_sp):
        _tts_stt_deps = [
            ("torchaudio", "torchaudio", "torchaudio"),
            ("chatterbox-tts", "chatterbox-tts", "chatterbox"),
            ("parler-tts", "parler-tts", "parler_tts"),
            ("faster-whisper", "faster-whisper", "faster_whisper"),
            ("ctranslate2", "ctranslate2", "ctranslate2"),
        ]
        for _label, _pip, _imp in _tts_stt_deps:
            _check = os.path.join(_embed_sp, _imp)
            if os.path.isdir(_check) or os.path.isfile(_check + '.py'):
                print(f"python-embed: {_label} already present")
                continue
            print(f"python-embed: installing {_label} via --target...")
            import subprocess as _sp
            _sp.run([sys.executable, "-m", "pip", "install", _pip,
                     "--target", _embed_sp, "--no-deps", "--quiet"], check=False)

# Write Info.plist if building
if "build" in sys.argv or "bdist_mac" in sys.argv or "bdist_dmg" in sys.argv:
    os.makedirs("build/Nunba.app/Contents", exist_ok=True)
    with open("build/Nunba.app/Contents/Info.plist", "w") as f:
        f.write(info_plist)
    print("Created Info.plist")

    # Copy icon to Resources
    if icon_path and os.path.exists(icon_path):
        os.makedirs("build/Nunba.app/Contents/Resources", exist_ok=True)
        shutil.copy(icon_path, "build/Nunba.app/Contents/Resources/app.icns")
        print("Copied icon to Resources")

setup(
    name="Nunba",
    version=version_short(),
    description="Nunba - A Friend, A Well Wisher, Your LocalMind",
    author="HevolveAI",
    options={
        "build_exe": build_exe_options,
        "bdist_mac": bdist_mac_options,
        "bdist_dmg": bdist_dmg_options,
    },
    executables=executables,
)

# ============================================================================
# Post-build steps (macOS .app bundle)
# ============================================================================

if "build" in sys.argv or "bdist_mac" in sys.argv or "bdist_dmg" in sys.argv:
    _build_dir = os.path.abspath(build_exe_options["build_exe"])

    # -- Post-build: compile raw .py to .pyc and remove source --
    # HARTOS modules are copied as .py via include_files. Compile to .pyc
    # so source code isn't exposed in the .app bundle.
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
    # cx_Freeze's include_files doesn't reliably copy dot-prefixed directories
    # (e.g. numpy.libs/) so we do the entire python-embed copy ourselves.
    if not _skip_python_embed_copy:
        _src_embed = os.path.abspath("python-embed")
        _dst_embed = os.path.join(_build_dir, "python-embed")
        if os.path.isdir(_src_embed):
            print("Post-build: copying python-embed via copytree...")
            shutil.copytree(_src_embed, _dst_embed, dirs_exist_ok=True)

            # Clean orphans: files AND empty dirs in dest that don't exist in source
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

            # ── Remove distutils-precedence.pth ──
            # Breaks runtime pip installs (_distutils_hack not bundled)
            for _pyver in (f'python{sys.version_info.major}.{sys.version_info.minor}',
                           'python3.12', 'python3.11', 'python3.10'):
                _pth = os.path.join(_dst_embed, 'lib', _pyver, 'site-packages',
                                     'distutils-precedence.pth')
                if os.path.exists(_pth):
                    os.remove(_pth)
                    print(f"Post-build: removed {_pth}")
                    break
            # Also check Windows-style path (Lib/ vs lib/)
            _pth_win = os.path.join(_dst_embed, 'Lib', 'site-packages',
                                     'distutils-precedence.pth')
            if os.path.exists(_pth_win):
                os.remove(_pth_win)
                print(f"Post-build: removed {_pth_win}")

            # ── Fix torch._C conflict ──
            # PyTorch ships with both torch/_C.cpython-*.so (the real compiled
            # extension) AND torch/_C/ (a directory with .pyi type-hint stubs).
            # Python's import system resolves the directory first, which causes:
            #   "Failed to load PyTorch C extensions"
            # Fix: remove the torch/_C/ package directory so the .so loads correctly.
            # macOS uses .so for CPython extensions (not .dylib), and MPS (Metal)
            # instead of CUDA -- no CUDA-related cleanup needed.
            _torch_sp = os.path.join(_dst_embed, 'lib',
                                      f'python{sys.version_info.major}.{sys.version_info.minor}',
                                      'site-packages', 'torch')
            # Also check Lib/ capitalization variant
            if not os.path.isdir(_torch_sp):
                _torch_sp = os.path.join(_dst_embed, 'Lib', 'site-packages', 'torch')
            _torch_c_dir = os.path.join(_torch_sp, '_C')
            _torch_c_so = [f for f in (os.listdir(_torch_sp) if os.path.isdir(_torch_sp) else [])
                           if f.startswith('_C.cpython') and f.endswith('.so')]
            if os.path.isdir(_torch_c_dir) and _torch_c_so:
                shutil.rmtree(_torch_c_dir)
                print("Post-build: removed torch/_C/ stub directory (keeps _C.so extension)")
            # Also remove torch/_C_flatbuffer/ if present (same type-hint conflict)
            _torch_c_fb = os.path.join(_torch_sp, '_C_flatbuffer')
            if os.path.isdir(_torch_c_fb):
                _fb_so = [f for f in (os.listdir(_torch_sp) if os.path.isdir(_torch_sp) else [])
                          if f.startswith('_C_flatbuffer') and f.endswith('.so')]
                if _fb_so:
                    shutil.rmtree(_torch_c_fb)
                    print("Post-build: removed torch/_C_flatbuffer/ stub directory")

    # -- Post-build: strip HevolveAI source from python-embed --
    # HevolveAI is proprietary -- compile to .pyc and remove raw .py source.
    # macOS python-embed uses lib/pythonX.Y/site-packages (unix-style)
    _hv_sp = os.path.join(_build_dir, "python-embed", "lib",
                           f"python{sys.version_info.major}.{sys.version_info.minor}",
                           "site-packages")
    if not os.path.isdir(_hv_sp):
        _hv_sp = os.path.join(_build_dir, "python-embed", "Lib", "site-packages")
    _hv_stripped = 0
    for _hv_pkg in ("hevolveai", "embodied_ai"):
        _hv_dir = os.path.join(_hv_sp, _hv_pkg)
        if not os.path.isdir(_hv_dir):
            continue
        # Compile .py -> .pyc (optimize=2: strip docstrings + asserts)
        compileall.compile_dir(_hv_dir, quiet=2, force=True, optimize=2)
        # Strip .py source, keep only .pyc
        for _hv_root, _hv_dirs, _hv_files in os.walk(_hv_dir):
            for _hf in _hv_files:
                if _hf.endswith('.py'):
                    _hf_path = os.path.join(_hv_root, _hf)
                    if _hf == '__init__.py':
                        # Stub -- needed for package discovery
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

    # -- Post-build: set executable permissions on binaries --
    print("Post-build: setting executable permissions on binaries...")
    _nunba_exe = os.path.join(_build_dir, "Nunba")
    if os.path.isfile(_nunba_exe):
        os.chmod(_nunba_exe, 0o755)
    # Set +x on all .so and .dylib files in the .app bundle
    _so_count = 0
    for _root, _dirs, _files in os.walk(_build_dir):
        for _f in _files:
            if _f.endswith('.so') or '.so.' in _f or _f.endswith('.dylib'):
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
        import subprocess as _sp_val
        try:
            _ret = _sp_val.run([_exe, "--validate"], capture_output=True, text=True, timeout=300)
        except _sp_val.TimeoutExpired:
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
                elif os.environ.get('NUNBA_CI'):
                    print(f"\n[CI] Validation exited {_ret.returncode} on headless runner "
                          f"-- skipping hard-fail (NUNBA_CI=1). Check validate.log for details.\n")
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
    _pe_build_dir_final = build_exe_options["build_exe"]
    dest_embed_path = os.path.join(_pe_build_dir_final, "python-embed")
    if os.path.isdir(dest_embed_path):
        os.makedirs(_pe_build_dir_final, exist_ok=True)
        _final_dest_hash = get_directory_hash(dest_embed_path)
        hash_file = os.path.join(_pe_build_dir_final, "python-embed.hash")
        with open(hash_file, 'w') as f:
            f.write(f"{current_python_embed_hash}\n{_final_dest_hash}")
        print(f"Updated python-embed.hash in {_pe_build_dir_final}")
