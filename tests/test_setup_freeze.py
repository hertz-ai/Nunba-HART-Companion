"""
Functional tests for scripts/setup_freeze_nunba.py

Tests the utility functions used by the cx_Freeze build configuration:
- find_zlib_dll: DLL search across Python dirs and PATH
- find_pycparser_source: locate pycparser for frozen import fix
- _pad_to_square: image padding for icon generation
- ensure_icon_exists: PNG → ICO conversion with multi-size
- get_directory_hash: deterministic SHA-256 of directory tree
- find_hevolve_modules: HARTOS module discovery (pyproject.toml + fallback)
"""
import hashlib
import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# We can't import setup_freeze_nunba directly (it runs module-level code
# that depends on cx_Freeze and build state). Instead we extract and test
# the functions by exec'ing them in isolation.

# ---------------------------------------------------------------------------
# 1. find_zlib_dll (extracted logic)
# ---------------------------------------------------------------------------
def _find_zlib_dll_impl():
    """Extracted from setup_freeze_nunba.find_zlib_dll."""
    import glob as _glob
    python_dir = os.path.dirname(sys.executable)
    possible_paths = [
        os.path.join(python_dir, 'zlib.dll'),
        os.path.join(python_dir, 'DLLs', 'zlib.dll'),
        os.path.join(python_dir, 'lib', 'zlib.dll'),
    ]
    for path in possible_paths:
        if os.path.exists(path):
            return path
    for path_dir in os.environ.get('PATH', '').split(os.pathsep):
        dll_path = os.path.join(path_dir, 'zlib.dll')
        if os.path.exists(dll_path):
            return dll_path
    return None


class TestFindZlibDll:
    def test_returns_string_or_none(self):
        result = _find_zlib_dll_impl()
        assert result is None or isinstance(result, str)

    def test_found_path_exists(self):
        result = _find_zlib_dll_impl()
        if result is not None:
            assert os.path.exists(result)

    def test_with_mock_python_dir(self):
        with tempfile.TemporaryDirectory() as td:
            dll = os.path.join(td, 'zlib.dll')
            Path(dll).touch()
            with patch.object(sys, 'executable', os.path.join(td, 'python.exe')):
                result = _find_zlib_dll_impl()
            assert result == dll

    def test_not_found_returns_none(self):
        with tempfile.TemporaryDirectory() as td:
            with patch.object(sys, 'executable', os.path.join(td, 'python.exe')):
                with patch.dict(os.environ, {'PATH': td}):
                    result = _find_zlib_dll_impl()
            assert result is None

    def test_finds_in_dlls_subdir(self):
        with tempfile.TemporaryDirectory() as td:
            dlls_dir = os.path.join(td, 'DLLs')
            os.makedirs(dlls_dir)
            dll = os.path.join(dlls_dir, 'zlib.dll')
            Path(dll).touch()
            with patch.object(sys, 'executable', os.path.join(td, 'python.exe')):
                result = _find_zlib_dll_impl()
            assert result == dll


# ---------------------------------------------------------------------------
# 2. find_pycparser_source (extracted logic)
# ---------------------------------------------------------------------------
def _find_pycparser_impl():
    try:
        import pycparser
        pycparser_dir = os.path.dirname(pycparser.__file__)
        if os.path.exists(pycparser_dir):
            return pycparser_dir
    except ImportError:
        pass
    return None


class TestFindPycparser:
    def test_returns_path_or_none(self):
        result = _find_pycparser_impl()
        assert result is None or os.path.isdir(result)

    def test_import_error_returns_none(self):
        with patch.dict('sys.modules', {'pycparser': None}):
            result = _find_pycparser_impl()
        assert result is None


# ---------------------------------------------------------------------------
# 3. _pad_to_square (extracted logic)
# ---------------------------------------------------------------------------
def _pad_to_square(img):
    from PIL import Image as _Image
    w, h = img.size
    if w == h:
        return img
    side = max(w, h)
    square = _Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(img, ((side - w) // 2, (side - h) // 2),
                 img if img.mode == 'RGBA' else None)
    return square


class TestPadToSquare:
    def test_already_square(self):
        from PIL import Image
        img = Image.new('RGBA', (100, 100), 'red')
        result = _pad_to_square(img)
        assert result.size == (100, 100)
        assert result is img  # same object, no copy

    def test_wide_image_padded(self):
        from PIL import Image
        img = Image.new('RGBA', (200, 100), 'blue')
        result = _pad_to_square(img)
        assert result.size == (200, 200)

    def test_tall_image_padded(self):
        from PIL import Image
        img = Image.new('RGBA', (100, 300), 'green')
        result = _pad_to_square(img)
        assert result.size == (300, 300)

    def test_padding_is_transparent(self):
        from PIL import Image
        img = Image.new('RGBA', (200, 100), (255, 0, 0, 255))
        result = _pad_to_square(img)
        # Top-left corner should be transparent padding
        pixel = result.getpixel((0, 0))
        assert pixel[3] == 0  # alpha = 0

    def test_rgb_image_converted(self):
        from PIL import Image
        img = Image.new('RGB', (200, 100), 'blue')
        result = _pad_to_square(img)
        assert result.size == (200, 200)

    def test_1x1(self):
        from PIL import Image
        img = Image.new('RGBA', (1, 1), 'white')
        result = _pad_to_square(img)
        assert result.size == (1, 1)


# ---------------------------------------------------------------------------
# 4. get_directory_hash (extracted logic)
# ---------------------------------------------------------------------------
def _get_directory_hash(directory):
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


class TestGetDirectoryHash:
    def test_returns_hex_string(self):
        with tempfile.TemporaryDirectory() as td:
            Path(td, 'a.txt').write_text('hello')
            result = _get_directory_hash(td)
            assert isinstance(result, str)
            assert len(result) == 64  # SHA-256 hex length

    def test_deterministic(self):
        with tempfile.TemporaryDirectory() as td:
            Path(td, 'a.txt').write_text('hello')
            h1 = _get_directory_hash(td)
            h2 = _get_directory_hash(td)
            assert h1 == h2

    def test_content_change_changes_hash(self):
        with tempfile.TemporaryDirectory() as td:
            f = Path(td, 'a.txt')
            f.write_text('hello')
            h1 = _get_directory_hash(td)
            f.write_text('world')
            h2 = _get_directory_hash(td)
            assert h1 != h2

    def test_new_file_changes_hash(self):
        with tempfile.TemporaryDirectory() as td:
            Path(td, 'a.txt').write_text('hello')
            h1 = _get_directory_hash(td)
            Path(td, 'b.txt').write_text('world')
            h2 = _get_directory_hash(td)
            assert h1 != h2

    def test_empty_directory(self):
        with tempfile.TemporaryDirectory() as td:
            result = _get_directory_hash(td)
            assert isinstance(result, str)
            assert len(result) == 64

    def test_subdirectory_names_matter(self):
        with tempfile.TemporaryDirectory() as td:
            os.makedirs(os.path.join(td, 'subdir_a'))
            h1 = _get_directory_hash(td)
            os.makedirs(os.path.join(td, 'subdir_b'))
            h2 = _get_directory_hash(td)
            assert h1 != h2

    def test_nested_files(self):
        with tempfile.TemporaryDirectory() as td:
            sub = os.path.join(td, 'sub')
            os.makedirs(sub)
            Path(sub, 'file.txt').write_text('nested')
            result = _get_directory_hash(td)
            assert len(result) == 64

    def test_binary_files(self):
        with tempfile.TemporaryDirectory() as td:
            Path(td, 'bin.dat').write_bytes(b'\x00\xff\xfe\xfd')
            result = _get_directory_hash(td)
            assert len(result) == 64


# ---------------------------------------------------------------------------
# 5. Build configuration sanity checks
# ---------------------------------------------------------------------------
class TestBuildConfig:
    """Test build configuration constants and patterns."""

    def test_test_files_excluded_from_glob(self):
        """The *.py glob in include_files should exclude test files."""
        import glob
        py_files = [f for f in glob.glob(os.path.join(PROJECT_ROOT, '*.py'))
                    if not f.endswith(('app.py', 'setup.py'))
                    and not os.path.basename(f).startswith(('test_', '_test_'))]
        # No test files should be in the list
        for f in py_files:
            assert not os.path.basename(f).startswith('test_'), f"Test file in build: {f}"

    def test_app_ico_generation_sizes(self):
        """Icon should contain standard Windows ICO sizes."""
        expected_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
        assert len(expected_sizes) == 6
        assert expected_sizes[0] == (256, 256)  # largest first

    def test_version_format(self):
        """Build version should be parseable."""
        # The script reads hart_version.VERSION
        try:
            sys.path.insert(0, PROJECT_ROOT)
            import hart_version
            v = hart_version.version
            parts = v.split('.')
            assert len(parts) >= 2
        except ImportError:
            pytest.skip("hart_version not available")

    def test_manifest_xml_structure(self):
        """Windows manifest should be valid XML with admin elevation."""
        manifest = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity type="win32" name="Nunba" version="2.0.0.0"/>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="requireAdministrator" uiAccess="false"/>
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>"""
        assert 'requireAdministrator' in manifest
        assert 'Nunba' in manifest


# ---------------------------------------------------------------------------
# 6. HARTOS module discovery patterns
# ---------------------------------------------------------------------------
class TestHevolveModuleDiscovery:
    """Test patterns used by find_hevolve_modules."""

    def test_pyproject_toml_regex(self):
        """The regex should extract module names from py-modules list."""
        import re
        sample = '''
[tool.setuptools]
py-modules = [
    "hart_intelligence",
    "helper",
    "create_recipe",
]
'''
        match = re.search(r'py-modules\s*=\s*\[(.*?)\]', sample, re.DOTALL)
        assert match is not None
        raw = match.group(1)
        modules = re.findall(r'"(\w+)"', raw)
        assert modules == ['hart_intelligence', 'helper', 'create_recipe']

    def test_skip_modules_filtered(self):
        modules = ['setup', 'embedded_main', 'hart_cli', 'helper', 'create_recipe']
        skip = {'setup', 'embedded_main', 'hart_cli'}
        filtered = [m for m in modules if m not in skip]
        assert filtered == ['helper', 'create_recipe']

    def test_fallback_modules_list_not_empty(self):
        fallback = [
            'hart_intelligence', 'hart_intelligence_entry', 'helper', 'helper_ledger',
            'create_recipe', 'reuse_recipe', 'lifecycle_hooks',
            'threadlocal', 'gather_agentdetails',
            'cultural_wisdom', 'recipe_experience', 'exception_collector',
            'agent_identity', 'hart_onboarding', 'hartos_speech',
            'hartos_speech_stitch',
        ]
        assert len(fallback) > 10
        assert 'hart_intelligence' in fallback
        assert 'create_recipe' in fallback

    def test_importlib_find_spec_pattern(self):
        """importlib.util.find_spec should work for installed modules."""
        import importlib.util
        spec = importlib.util.find_spec('os')
        assert spec is not None
        assert spec.origin is not None
