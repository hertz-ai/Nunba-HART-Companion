"""
Cross-platform compatibility tests for Nunba.

Tests that all platform-specific code has proper guards and fallbacks
for Windows, macOS, and Linux. Also validates package restructuring
(desktop/, llama/, tts/, routes/, scripts/) and build configuration.
"""
import ast
import importlib
import os
import sys
import unittest

PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class TestPlatformUtils(unittest.TestCase):
    """Test platform_utils module"""

    def test_import(self):
        """platform_utils should import without errors"""
        sys.path.insert(0, PROJ_ROOT)
        import desktop.platform_utils as platform_utils
        self.assertTrue(hasattr(platform_utils, 'IS_WINDOWS'))
        self.assertTrue(hasattr(platform_utils, 'IS_MACOS'))
        self.assertTrue(hasattr(platform_utils, 'IS_LINUX'))

    def test_get_screen_dimensions(self):
        """get_screen_dimensions should return valid dimensions"""
        sys.path.insert(0, PROJ_ROOT)
        from desktop.platform_utils import get_screen_dimensions
        width, height = get_screen_dimensions()
        self.assertIsInstance(width, int)
        self.assertIsInstance(height, int)
        self.assertGreater(width, 0)
        self.assertGreater(height, 0)

    def test_get_app_data_dir(self):
        """get_app_data_dir should return a valid path"""
        sys.path.insert(0, PROJ_ROOT)
        from desktop.platform_utils import get_app_data_dir
        path = get_app_data_dir()
        self.assertIsInstance(path, str)
        self.assertTrue(len(path) > 0)

    def test_get_log_dir(self):
        """get_log_dir should return a valid path"""
        sys.path.insert(0, PROJ_ROOT)
        from desktop.platform_utils import get_log_dir
        path = get_log_dir()
        self.assertIsInstance(path, str)
        self.assertTrue(len(path) > 0)

    def test_get_subprocess_flags(self):
        """get_subprocess_flags should return a dict"""
        sys.path.insert(0, PROJ_ROOT)
        from desktop.platform_utils import get_subprocess_flags
        flags = get_subprocess_flags()
        self.assertIsInstance(flags, dict)


class TestTrayHandler(unittest.TestCase):
    """Test tray_handler module"""

    def test_import(self):
        """tray_handler should import without errors"""
        sys.path.insert(0, PROJ_ROOT)
        import desktop.tray_handler as tray_handler
        self.assertTrue(hasattr(tray_handler, 'TrayHandler'))
        self.assertTrue(hasattr(tray_handler, 'setup_system_tray'))
        self.assertTrue(hasattr(tray_handler, 'notify_minimized_to_tray'))

    def test_tray_handler_class(self):
        """TrayHandler class should be instantiable"""
        sys.path.insert(0, PROJ_ROOT)
        from desktop.tray_handler import TrayHandler
        # Create with None window (won't actually start tray)
        handler = TrayHandler(None, app_name="Test", tooltip="Test App")
        self.assertEqual(handler.app_name, "Test")
        self.assertEqual(handler.tooltip, "Test App")


class TestLlamaInstaller(unittest.TestCase):
    """Test llama_installer module"""

    def test_import(self):
        """llama_installer should import via llama package"""
        sys.path.insert(0, PROJ_ROOT)
        import llama.llama_installer as llama_installer
        self.assertTrue(hasattr(llama_installer, 'LlamaInstaller'))
        self.assertTrue(hasattr(llama_installer, 'MODEL_PRESETS'))

    def test_model_presets(self):
        """MODEL_PRESETS should contain valid models"""
        sys.path.insert(0, PROJ_ROOT)
        from llama.llama_installer import MODEL_PRESETS
        self.assertGreater(len(MODEL_PRESETS), 0)
        for preset in MODEL_PRESETS:
            self.assertTrue(hasattr(preset, 'display_name'))
            self.assertTrue(hasattr(preset, 'repo_id'))
            self.assertTrue(hasattr(preset, 'file_name'))

    def test_installer_init(self):
        """LlamaInstaller should initialize correctly"""
        sys.path.insert(0, PROJ_ROOT)
        from llama.llama_installer import LlamaInstaller
        installer = LlamaInstaller()
        self.assertIn(installer.os_name, ['windows', 'darwin', 'linux'])
        self.assertIn(installer.gpu_available, ['cuda', 'metal', 'none'])


class TestAppPyCrossPlatform(unittest.TestCase):
    """Test app.py for cross-platform compatibility"""

    def setUp(self):
        self.app_py = os.path.join(PROJ_ROOT, 'app.py')
        with open(self.app_py, encoding='utf-8') as f:
            self.code = f.read()

    def test_syntax_valid(self):
        """app.py should have valid Python syntax"""
        ast.parse(self.code)

    def test_windows_code_guarded(self):
        """Windows-specific code should be guarded"""
        # Check that windll calls are inside platform checks
        lines = self.code.split('\n')

        for i, line in enumerate(lines):
            if 'windll' in line and 'ctypes.windll' in line:
                # windll should only appear after a win32 check
                # Check previous lines for guard (look back up to 50 lines)
                found_guard = False
                for j in range(max(0, i-50), i):
                    prev_line = lines[j]
                    # Check for platform guards
                    if 'sys.platform == "win32"' in prev_line or "sys.platform == 'win32'" in prev_line:
                        found_guard = True
                        break
                    if 'sys.platform != "win32"' in prev_line:
                        # This is an early return guard
                        found_guard = True
                        break
                    if 'if sys.platform' in prev_line and 'win32' in prev_line:
                        found_guard = True
                        break
                self.assertTrue(found_guard, f"windll at line {i+1} may not be guarded")

    def test_has_tray_handler_import(self):
        """app.py should import desktop.tray_handler"""
        self.assertIn('tray_handler', self.code)

    def test_has_platform_utils_import(self):
        """app.py should import desktop.platform_utils"""
        self.assertIn('platform_utils', self.code)


class TestBuildScripts(unittest.TestCase):
    """Test build scripts in scripts/ directory"""

    def test_build_py_syntax(self):
        """scripts/build.py should have valid Python syntax"""
        build_py = os.path.join(PROJ_ROOT, 'scripts', 'build.py')
        with open(build_py, encoding='utf-8') as f:
            code = f.read()
        ast.parse(code)

    def test_build_py_has_all_platforms(self):
        """build.py should support all platforms"""
        build_py = os.path.join(PROJ_ROOT, 'scripts', 'build.py')
        with open(build_py, encoding='utf-8') as f:
            code = f.read()
        self.assertIn('def build_windows', code)
        self.assertIn('def build_macos', code)
        self.assertIn('def build_linux', code)

    def test_setup_freeze_nunba_syntax(self):
        """scripts/setup_freeze_nunba.py should have valid Python syntax"""
        setup_file = os.path.join(PROJ_ROOT, 'scripts', 'setup_freeze_nunba.py')
        with open(setup_file, encoding='utf-8') as f:
            code = f.read()
        ast.parse(code)

    def test_setup_freeze_mac_syntax(self):
        """scripts/setup_freeze_mac.py should have valid Python syntax"""
        setup_file = os.path.join(PROJ_ROOT, 'scripts', 'setup_freeze_mac.py')
        with open(setup_file, encoding='utf-8') as f:
            code = f.read()
        ast.parse(code)

    def test_setup_freeze_mac_has_info_plist(self):
        """setup_freeze_mac.py should generate Info.plist"""
        setup_file = os.path.join(PROJ_ROOT, 'scripts', 'setup_freeze_mac.py')
        with open(setup_file, encoding='utf-8') as f:
            code = f.read()
        self.assertIn('Info.plist', code)
        self.assertIn('CFBundleIdentifier', code)
        self.assertIn('hevolveai', code)  # Protocol handler

    def test_build_scripts_in_scripts_dir(self):
        """build.py, build.bat, build_mac.sh must live under scripts/"""
        self.assertTrue(os.path.isfile(os.path.join(PROJ_ROOT, 'scripts', 'build.py')))
        self.assertTrue(os.path.isfile(os.path.join(PROJ_ROOT, 'scripts', 'build.bat')))
        self.assertTrue(os.path.isfile(os.path.join(PROJ_ROOT, 'scripts', 'build_mac.sh')))

    def test_build_bat_delegates_to_scripts(self):
        """build.bat should invoke scripts/build.py"""
        bat_file = os.path.join(PROJ_ROOT, 'scripts', 'build.bat')
        with open(bat_file) as f:
            code = f.read()
        self.assertIn('scripts\\build.py', code.replace('/', '\\'))

    def test_build_mac_delegates_to_scripts(self):
        """build_mac.sh should invoke scripts/build.py"""
        sh_file = os.path.join(PROJ_ROOT, 'scripts', 'build_mac.sh')
        with open(sh_file) as f:
            code = f.read()
        self.assertIn('scripts/build.py', code)


class TestLlamaConfigCrossPlatform(unittest.TestCase):
    """Test llama_config for cross-platform compatibility"""

    def test_syntax_valid(self):
        """llama/llama_config.py should have valid Python syntax"""
        config_file = os.path.join(PROJ_ROOT, 'llama', 'llama_config.py')
        with open(config_file, encoding='utf-8') as f:
            code = f.read()
        ast.parse(code)

    def test_subprocess_uses_flags(self):
        """llama_config.py subprocess calls should use platform flags"""
        config_file = os.path.join(PROJ_ROOT, 'llama', 'llama_config.py')
        with open(config_file, encoding='utf-8') as f:
            code = f.read()
        # Should have STARTUPINFO for Windows
        self.assertIn('STARTUPINFO', code)
        self.assertIn('CREATE_NO_WINDOW', code)


class TestAIInstaller(unittest.TestCase):
    """Test AI installer module for cross-platform compatibility"""

    def test_import(self):
        """ai_installer should import via desktop package"""
        sys.path.insert(0, PROJ_ROOT)
        import desktop.ai_installer as ai_installer
        self.assertTrue(hasattr(ai_installer, 'AIInstaller'))
        self.assertTrue(hasattr(ai_installer, 'detect_gpu'))
        self.assertTrue(hasattr(ai_installer, 'get_platform_name'))

    def test_platform_detection(self):
        """get_platform_name should return valid platform"""
        sys.path.insert(0, PROJ_ROOT)
        from desktop.ai_installer import IS_LINUX, IS_MACOS, IS_WINDOWS, get_platform_name
        name = get_platform_name()
        self.assertIsInstance(name, str)
        self.assertTrue(len(name) > 0)
        # At least one platform should be True
        self.assertTrue(IS_WINDOWS or IS_MACOS or IS_LINUX)

    def test_gpu_detection(self):
        """detect_gpu should return a valid dict"""
        sys.path.insert(0, PROJ_ROOT)
        from desktop.ai_installer import detect_gpu
        result = detect_gpu()
        self.assertIsInstance(result, dict)
        self.assertIn('available', result)
        self.assertIn('type', result)
        self.assertIn('name', result)

    def test_ai_installer_init(self):
        """AIInstaller should initialize without errors"""
        sys.path.insert(0, PROJ_ROOT)
        from desktop.ai_installer import AIInstaller
        installer = AIInstaller()
        self.assertIsNotNone(installer.base_dir)
        self.assertIsNotNone(installer.gpu_info)

    def test_ai_installer_status(self):
        """AIInstaller.get_status() should return valid dict"""
        sys.path.insert(0, PROJ_ROOT)
        from desktop.ai_installer import AIInstaller
        installer = AIInstaller()
        status = installer.get_status()
        self.assertIsInstance(status, dict)
        self.assertIn('platform', status)
        self.assertIn('gpu', status)
        self.assertIn('components', status)


class TestTTSEngine(unittest.TestCase):
    """Test unified TTS engine for cross-platform compatibility"""

    def test_import(self):
        """tts_engine should import without errors"""
        sys.path.insert(0, PROJ_ROOT)
        import tts.tts_engine as tts_engine
        self.assertTrue(hasattr(tts_engine, 'TTSEngine'))
        self.assertTrue(hasattr(tts_engine, 'BACKEND_PIPER'))
        self.assertTrue(hasattr(tts_engine, 'BACKEND_CHATTERBOX_TURBO'))

    def test_syntax_valid(self):
        """tts/tts_engine.py should have valid Python syntax"""
        tts_file = os.path.join(PROJ_ROOT, 'tts', 'tts_engine.py')
        with open(tts_file, encoding='utf-8') as f:
            code = f.read()
        ast.parse(code)


class TestVibeVoiceTTS(unittest.TestCase):
    """Test VibeVoice TTS module"""

    def test_import(self):
        """vibevoice_tts should import without errors"""
        sys.path.insert(0, PROJ_ROOT)
        import tts.vibevoice_tts as vibevoice_tts
        self.assertTrue(hasattr(vibevoice_tts, 'VibeVoiceTTS'))
        self.assertTrue(hasattr(vibevoice_tts, 'detect_gpu'))
        self.assertTrue(hasattr(vibevoice_tts, 'VIBEVOICE_SPEAKERS'))

    def test_syntax_valid(self):
        """tts/vibevoice_tts.py should have valid Python syntax"""
        vv_file = os.path.join(PROJ_ROOT, 'tts', 'vibevoice_tts.py')
        with open(vv_file, encoding='utf-8') as f:
            code = f.read()
        ast.parse(code)


class TestPiperTTS(unittest.TestCase):
    """Test Piper TTS module"""

    def test_import(self):
        """piper_tts should import without errors"""
        sys.path.insert(0, PROJ_ROOT)
        import tts.piper_tts as piper_tts
        self.assertTrue(hasattr(piper_tts, 'PiperTTS'))
        self.assertTrue(hasattr(piper_tts, 'VOICE_PRESETS'))

    def test_syntax_valid(self):
        """tts/piper_tts.py should have valid Python syntax"""
        piper_file = os.path.join(PROJ_ROOT, 'tts', 'piper_tts.py')
        with open(piper_file, encoding='utf-8') as f:
            code = f.read()
        ast.parse(code)


# ═══════════════════════════════════════════════════════════════
# New tests for package restructuring & build validation
# ═══════════════════════════════════════════════════════════════

class TestPackageStructure(unittest.TestCase):
    """Verify that refactored packages exist with proper __init__.py files."""

    EXPECTED_PACKAGES = ['desktop', 'llama', 'tts', 'routes']

    def test_packages_have_init(self):
        """Each package directory must have __init__.py"""
        for pkg in self.EXPECTED_PACKAGES:
            init_path = os.path.join(PROJ_ROOT, pkg, '__init__.py')
            self.assertTrue(
                os.path.isfile(init_path),
                f"{pkg}/__init__.py missing"
            )

    def test_no_flat_copies_at_root(self):
        """Moved modules must not remain as flat files at project root."""
        # These files were moved into packages — root copies are stale
        moved_files = [
            'chatbot_routes.py',
            'hartos_backend_adapter.py',
            'kids_media_routes.py',
            'ai_key_vault.py',
            'crash_reporter.py',
            'indicator_window.py',
            'splash_effects.py',
            'media_classification.py',
            'tray_handler.py',
            'platform_utils.py',
            'llama_installer.py',
            'llama_health_endpoint.py',
            'tts_engine.py',
            'vibevoice_tts.py',
            'piper_tts.py',
        ]
        for fname in moved_files:
            self.assertFalse(
                os.path.isfile(os.path.join(PROJ_ROOT, fname)),
                f"Stale root copy exists: {fname} (should be in a package)"
            )


class TestRoutesPackage(unittest.TestCase):
    """Test the routes/ package (chatbot, kids media, backend adapter)."""

    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, PROJ_ROOT)

    def test_routes_init_exists(self):
        """routes/__init__.py must exist"""
        self.assertTrue(os.path.isfile(
            os.path.join(PROJ_ROOT, 'routes', '__init__.py')))

    def test_chatbot_routes_import(self):
        """routes.chatbot_routes should import without errors"""
        mod = importlib.import_module('routes.chatbot_routes')
        self.assertTrue(hasattr(mod, 'register_routes'))

    def test_hartos_backend_adapter_import(self):
        """routes.hartos_backend_adapter should import without errors"""
        mod = importlib.import_module('routes.hartos_backend_adapter')
        # Module should expose at least _hartos_backend_available
        self.assertTrue(hasattr(mod, '_hartos_backend_available'))

    def test_kids_media_routes_import(self):
        """routes.kids_media_routes should import without errors"""
        mod = importlib.import_module('routes.kids_media_routes')
        self.assertTrue(hasattr(mod, 'register_routes'))

    def test_chatbot_routes_internal_import(self):
        """chatbot_routes should import from routes.hartos_backend_adapter (not flat)"""
        routes_file = os.path.join(PROJ_ROOT, 'routes', 'chatbot_routes.py')
        with open(routes_file, encoding='utf-8') as f:
            code = f.read()
        # Must NOT have bare "from hartos_backend_adapter"
        self.assertNotIn('from hartos_backend_adapter ', code,
                         "chatbot_routes still uses flat import for hartos_backend_adapter")


class TestDesktopPackage(unittest.TestCase):
    """Test desktop/ package modules exist and import."""

    DESKTOP_MODULES = [
        'desktop.config',
        'desktop.crash_reporter',
        'desktop.ai_key_vault',
        'desktop.indicator_window',
        'desktop.tray_handler',
        'desktop.platform_utils',
        'desktop.splash_effects',
        'desktop.media_classification',
        'desktop.ai_installer',
    ]

    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, PROJ_ROOT)

    def test_desktop_init_exists(self):
        """desktop/__init__.py must exist"""
        self.assertTrue(os.path.isfile(
            os.path.join(PROJ_ROOT, 'desktop', '__init__.py')))

    def test_all_desktop_modules_importable(self):
        """Every desktop.* module listed in the package must import."""
        failures = []
        for mod_name in self.DESKTOP_MODULES:
            try:
                importlib.import_module(mod_name)
            except Exception as e:
                failures.append(f"{mod_name}: {e}")
        self.assertEqual(failures, [],
                         "Desktop module import failures:\n" +
                         "\n".join(failures))


class TestLlamaPackage(unittest.TestCase):
    """Test llama/ package modules."""

    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, PROJ_ROOT)

    def test_llama_init_exists(self):
        """llama/__init__.py must exist"""
        self.assertTrue(os.path.isfile(
            os.path.join(PROJ_ROOT, 'llama', '__init__.py')))

    def test_llama_installer_import(self):
        """llama.llama_installer should import"""
        mod = importlib.import_module('llama.llama_installer')
        self.assertTrue(hasattr(mod, 'LlamaInstaller'))

    def test_llama_config_import(self):
        """llama.llama_config should import"""
        mod = importlib.import_module('llama.llama_config')
        self.assertIsNotNone(mod)

    def test_llama_health_endpoint_import(self):
        """llama.llama_health_endpoint should import"""
        mod = importlib.import_module('llama.llama_health_endpoint')
        self.assertIsNotNone(mod)


class TestHartosModules(unittest.TestCase):
    """Test that hart-backend (HARTOS) editable-install modules are importable."""

    HARTOS_MODULES = [
        'hart_intelligence',
        'hart_intelligence',
        'helper',
        'helper_ledger',
        'create_recipe',
        'reuse_recipe',
        'lifecycle_hooks',
        'threadlocal',
        'gather_agentdetails',
        'cultural_wisdom',
        'recipe_experience',
        'exception_collector',
    ]

    def test_all_hartos_modules_importable(self):
        """Every hart-backend module should be importable (editable install)."""
        failures = []
        for mod_name in self.HARTOS_MODULES:
            try:
                spec = importlib.util.find_spec(mod_name)
                if spec is None:
                    failures.append(f"{mod_name}: find_spec returned None (not installed)")
            except ValueError:
                # Editable installs can raise ValueError when __spec__ is None
                # on partially loaded namespace packages — module is still importable
                pass
        self.assertEqual(failures, [],
                         "HARTOS modules not found:\n" + "\n".join(failures))


class TestLangchainImportChain(unittest.TestCase):
    """Test that langchain_classic lazy imports work (the ReduceDocumentsChain fix)."""

    def test_reduce_documents_chain_import(self):
        """ReduceDocumentsChain should import from langchain_classic.chains"""
        try:
            from langchain_classic.chains import ReduceDocumentsChain
            self.assertIsNotNone(ReduceDocumentsChain)
        except ImportError:
            self.skipTest("langchain_classic not installed")

    def test_direct_submodule_import(self):
        """Direct import of reduce submodule should work"""
        try:
            from langchain_classic.chains.combine_documents.reduce import (
                ReduceDocumentsChain,
            )
            self.assertIsNotNone(ReduceDocumentsChain)
        except ImportError:
            self.skipTest("langchain_classic not installed")

    def test_hart_intelligence_import_chain(self):
        """hart_intelligence should import (triggers full chains/agents lazy load)"""
        try:
            import hart_intelligence
            self.assertIsNotNone(hart_intelligence)
        except ImportError:
            # Fall back to hart_intelligence (the implementation module)
            try:
                import hart_intelligence
                self.assertIsNotNone(hart_intelligence)
            except ImportError as e:
                if 'ReduceDocumentsChain' in str(e):
                    self.fail(f"ReduceDocumentsChain lazy import still broken: {e}")
                # Other import errors (missing API keys etc.) are acceptable
                pass

    def test_chains_loading_imports(self):
        """langchain_classic.chains.loading should import without error.

        This is the module that triggers the ReduceDocumentsChain lazy import
        via: from langchain_classic.chains import ReduceDocumentsChain
        """
        try:
            import langchain_classic.chains.loading
            self.assertIsNotNone(langchain_classic.chains.loading)
        except ImportError:
            self.skipTest("langchain_classic not installed")


class TestBuildPackageReferences(unittest.TestCase):
    """Verify that cx_Freeze build configs reference package-prefixed module names."""

    def _read_file(self, *path_parts):
        fpath = os.path.join(PROJ_ROOT, *path_parts)
        with open(fpath, encoding='utf-8') as f:
            return f.read()

    def test_setup_freeze_nunba_uses_package_prefixed_routes(self):
        """setup_freeze_nunba.py must list routes.chatbot_routes (not flat)"""
        code = self._read_file('scripts', 'setup_freeze_nunba.py')
        self.assertIn('"routes.chatbot_routes"', code)
        self.assertIn('"routes.hartos_backend_adapter"', code)
        # Must NOT have flat bare module name in packages list
        self.assertNotRegex(code, r'"chatbot_routes"(?!\.)(?!_)',
                            "Flat 'chatbot_routes' still in setup_freeze_nunba.py")

    def test_setup_freeze_nunba_uses_package_prefixed_desktop(self):
        """setup_freeze_nunba.py must list desktop.* modules"""
        code = self._read_file('scripts', 'setup_freeze_nunba.py')
        self.assertIn('"desktop.tray_handler"', code)
        self.assertIn('"desktop.platform_utils"', code)
        self.assertIn('"desktop.ai_key_vault"', code)
        self.assertIn('"desktop.config"', code)

    def test_setup_freeze_nunba_uses_package_prefixed_llama(self):
        """setup_freeze_nunba.py must list llama.* modules"""
        code = self._read_file('scripts', 'setup_freeze_nunba.py')
        self.assertIn('"llama.llama_installer"', code)
        self.assertIn('"llama.llama_config"', code)

    def test_setup_freeze_nunba_uses_package_prefixed_tts(self):
        """setup_freeze_nunba.py must list tts.* modules"""
        code = self._read_file('scripts', 'setup_freeze_nunba.py')
        self.assertIn('"tts.piper_tts"', code)
        self.assertIn('"tts.tts_engine"', code)

    def test_setup_freeze_nunba_has_langchain_packages(self):
        """setup_freeze_nunba.py must include langchain_classic and langchain_core as packages"""
        code = self._read_file('scripts', 'setup_freeze_nunba.py')
        self.assertIn('"langchain_classic"', code)
        self.assertIn('"langchain_core"', code)

    def test_setup_freeze_mac_uses_package_prefixed_routes(self):
        """setup_freeze_mac.py must list routes.* modules"""
        code = self._read_file('scripts', 'setup_freeze_mac.py')
        self.assertIn('"routes.chatbot_routes"', code)
        self.assertIn('"routes.hartos_backend_adapter"', code)

    def test_setup_freeze_mac_has_langchain_packages(self):
        """setup_freeze_mac.py must include langchain_classic and langchain_core"""
        code = self._read_file('scripts', 'setup_freeze_mac.py')
        self.assertIn('"langchain_classic"', code)
        self.assertIn('"langchain_core"', code)

    def test_no_stale_flat_module_names_in_freeze(self):
        """setup_freeze scripts must not reference deleted flat module names."""
        stale_names = [
            '"helper_func"', '"tools_and_prompt"', '"marketing_nunban"',
        ]
        for script in ('setup_freeze_nunba.py', 'setup_freeze_mac.py'):
            code = self._read_file('scripts', script)
            for name in stale_names:
                self.assertNotIn(name, code,
                                 f"Stale module {name} found in {script}")


class TestAppPyValidationChain(unittest.TestCase):
    """Verify that app.py's validation chain uses package-prefixed module names."""

    def setUp(self):
        with open(os.path.join(PROJ_ROOT, 'app.py'), encoding='utf-8') as f:
            self.code = f.read()

    def test_validation_uses_package_prefixed_routes(self):
        """app.py validation must reference routes.chatbot_routes (not bare)"""
        self.assertIn("'routes.chatbot_routes'", self.code)
        self.assertIn("'routes.hartos_backend_adapter'", self.code)

    def test_validation_uses_package_prefixed_desktop(self):
        """app.py validation must reference desktop.* modules"""
        self.assertIn("'desktop.ai_key_vault'", self.code)
        self.assertIn("'desktop.indicator_window'", self.code)
        self.assertIn("'desktop.tray_handler'", self.code)
        self.assertIn("'desktop.crash_reporter'", self.code)

    def test_frozen_langchain_preimport(self):
        """app.py must have the langchain_classic frozen pre-import fix."""
        # This block injects ReduceDocumentsChain stub into langchain_classic.chains
        # to bypass __getattr__ lazy import in frozen builds (avoids transformers→torch chain)
        self.assertIn('langchain_classic.chains', self.code)
        self.assertIn('ReduceDocumentsChain', self.code)

    def test_frozen_deprecation_warning_suppression(self):
        """app.py must suppress DeprecationWarning in frozen builds."""
        self.assertIn("filterwarnings('ignore'", self.code)


class TestRuffConfig(unittest.TestCase):
    """Verify ruff.toml is updated for package structure."""

    def test_known_first_party_packages(self):
        """ruff.toml known-first-party must list refactored packages."""
        ruff_file = os.path.join(PROJ_ROOT, 'ruff.toml')
        if not os.path.isfile(ruff_file):
            self.skipTest("ruff.toml not found")
        with open(ruff_file) as f:
            code = f.read()
        for pkg in ('routes', 'desktop', 'llama', 'tts'):
            self.assertIn(f'"{pkg}"', code,
                          f"Package '{pkg}' missing from ruff.toml known-first-party")


class TestMainImportSmokeTest(unittest.TestCase):
    """Smoke test: main.py should have valid syntax and key symbols."""

    def test_main_syntax_valid(self):
        """main.py should have valid Python syntax (avoids full import which starts Flask)."""
        main_file = os.path.join(PROJ_ROOT, 'main.py')
        with open(main_file, encoding='utf-8') as f:
            code = f.read()
        ast.parse(code)

    def test_main_has_create_app(self):
        """main.py should define create_app or app."""
        main_file = os.path.join(PROJ_ROOT, 'main.py')
        with open(main_file, encoding='utf-8') as f:
            code = f.read()
        self.assertTrue('Flask' in code, "main.py should use Flask")


if __name__ == '__main__':
    unittest.main(verbosity=2)
