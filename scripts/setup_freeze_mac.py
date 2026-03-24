"""
setup_freeze_mac.py - Creates Nunba macOS Application Bundle

Nunba: A Friend, A Well Wisher, Your LocalMind
Connect to Hivemind with your friends' agents.

Usage:
    python setup_freeze_mac.py build       # Build .app bundle
    python setup_freeze_mac.py bdist_dmg   # Build DMG installer
"""
import glob
import os
import sys

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
        "unittest", "test", "tests",
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

# Write Info.plist if building
if "build" in sys.argv or "bdist_mac" in sys.argv or "bdist_dmg" in sys.argv:
    os.makedirs("build/Nunba.app/Contents", exist_ok=True)
    with open("build/Nunba.app/Contents/Info.plist", "w") as f:
        f.write(info_plist)
    print("Created Info.plist")

    # Copy icon to Resources
    if icon_path and os.path.exists(icon_path):
        os.makedirs("build/Nunba.app/Contents/Resources", exist_ok=True)
        import shutil
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
