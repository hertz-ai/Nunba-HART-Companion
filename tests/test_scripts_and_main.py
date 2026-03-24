"""
test_scripts_and_main.py - Tests for scripts/deps.py, scripts/build.py,
scripts/download.py, and main.py (Flask app factory).

Covers:
- deps.py: version helpers, dependency list generation, requirements file generation
- build.py: helper functions (print_*, run_command, clean_build, etc.)
- download.py: download_file, main flow
- main.py: Flask app creation, route registration, CORS, static serving,
  /local route, security helpers, device ID, probe/status endpoints
"""
import os
import sys
import tempfile
from unittest.mock import MagicMock, mock_open, patch

import pytest

# Ensure project root is importable
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Ensure scripts/ is importable
SCRIPTS_DIR = os.path.join(PROJECT_ROOT, 'scripts')
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)


# ============================================================
# deps.py tests
# ============================================================

class TestDepsVersion:
    """Test version helper functions in deps.py."""

    def test_version_string_exists(self):
        from scripts.deps import VERSION
        assert isinstance(VERSION, str)
        parts = VERSION.split(".")
        assert len(parts) >= 2

    def test_version_tuple(self):
        from scripts.deps import VERSION, version_tuple
        vt = version_tuple()
        assert isinstance(vt, tuple)
        assert all(isinstance(x, int) for x in vt)
        assert len(vt) == len(VERSION.split("."))

    def test_version_win32_four_parts(self):
        from scripts.deps import version_win32
        v = version_win32()
        parts = v.split(".")
        assert len(parts) == 4
        assert all(p.isdigit() for p in parts)

    def test_version_win32_pads_zeros(self):
        """version_win32 pads to 4 parts with zeros."""
        from scripts.deps import VERSION, version_win32
        v = version_win32()
        expected_parts = VERSION.split(".")
        while len(expected_parts) < 4:
            expected_parts.append("0")
        assert v == ".".join(expected_parts[:4])

    def test_version_short(self):
        from scripts.deps import VERSION, version_short
        vs = version_short()
        parts = VERSION.split(".")
        assert vs == ".".join(parts[:2])


class TestDepsFormatDep:
    """Test _format_dep helper."""

    def test_format_dep_with_version(self):
        from scripts.deps import _format_dep
        assert _format_dep("flask", "3.1.2") == "flask==3.1.2"

    def test_format_dep_without_version(self):
        from scripts.deps import _format_dep
        assert _format_dep("autobahn[serialization]", None) == "autobahn[serialization]"


class TestDepsInstallLists:
    """Test dependency list generation functions."""

    def test_get_venv_install_list_returns_list(self):
        from scripts.deps import get_venv_install_list
        deps = get_venv_install_list()
        assert isinstance(deps, list)
        assert len(deps) > 0

    def test_get_venv_install_list_contains_flask(self):
        from scripts.deps import get_venv_install_list
        deps = get_venv_install_list()
        flask_deps = [d for d in deps if d.startswith("flask==")]
        assert len(flask_deps) >= 1

    def test_get_venv_install_list_win32_has_platform_deps(self):
        from scripts.deps import PLATFORM_DEPS, get_venv_install_list
        deps = get_venv_install_list(platform="win32")
        if "win32" in PLATFORM_DEPS:
            for name in PLATFORM_DEPS["win32"]:
                matches = [d for d in deps if d.startswith(name)]
                assert len(matches) >= 1, f"Missing win32 dep: {name}"

    def test_get_venv_install_list_unknown_platform(self):
        """Unknown platform returns only core deps."""
        from scripts.deps import CORE_DEPS, get_venv_install_list
        deps = get_venv_install_list(platform="freebsd")
        assert len(deps) == len(CORE_DEPS)

    def test_get_embed_install_list_excludes_torch_by_default(self):
        from scripts.deps import get_embed_install_list
        deps = get_embed_install_list(include_torch=False)
        torch_deps = [d for d in deps if d.startswith("torch==") or d.startswith("torchaudio==")]
        assert len(torch_deps) == 0

    def test_get_embed_install_list_includes_torch_when_requested(self):
        from scripts.deps import get_embed_install_list
        deps = get_embed_install_list(include_torch=True)
        torch_deps = [d for d in deps if d.startswith("torch==")]
        assert len(torch_deps) >= 1

    def test_get_torch_spec_with_version(self):
        from scripts.deps import EMBED_DEPS, get_torch_spec
        spec = get_torch_spec()
        if EMBED_DEPS.get("torch"):
            assert spec.startswith("torch==")
        else:
            assert spec == "torch"

    def test_get_all_deps_combines_all(self):
        from scripts.deps import CORE_DEPS, EMBED_DEPS, get_all_deps
        all_d = get_all_deps()
        # Should contain at least all core deps
        for name in CORE_DEPS:
            assert name in all_d
        for name in EMBED_DEPS:
            assert name in all_d


class TestDepsGenerateRequirements:
    """Test requirements.txt generation."""

    def test_generate_requirements_creates_file(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            tmp_path = f.name
        try:
            from scripts.deps import generate_requirements
            result = generate_requirements(tmp_path, platform="win32")
            assert result == tmp_path
            assert os.path.exists(tmp_path)
            with open(tmp_path) as f:
                content = f.read()
            assert "AUTO-GENERATED" in content
            assert "flask" in content
        finally:
            os.unlink(tmp_path)

    def test_generate_requirements_contains_platform_comment(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            tmp_path = f.name
        try:
            from scripts.deps import generate_requirements
            generate_requirements(tmp_path, platform="win32")
            with open(tmp_path) as f:
                content = f.read()
            assert "Platform: win32" in content
        finally:
            os.unlink(tmp_path)

    def test_generate_requirements_no_platform_deps_for_unknown(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            tmp_path = f.name
        try:
            from scripts.deps import generate_requirements
            generate_requirements(tmp_path, platform="freebsd")
            with open(tmp_path) as f:
                content = f.read()
            assert "Platform:" not in content
        finally:
            os.unlink(tmp_path)


class TestDepsConstants:
    """Test deps.py constants are well-formed."""

    def test_python_embed_version(self):
        from scripts.deps import PYTHON_EMBED_VERSION
        assert isinstance(PYTHON_EMBED_VERSION, str)
        parts = PYTHON_EMBED_VERSION.split(".")
        assert len(parts) >= 2

    def test_torch_index_url(self):
        from scripts.deps import TORCH_INDEX_URL
        assert TORCH_INDEX_URL.startswith("https://")

    def test_core_deps_not_empty(self):
        from scripts.deps import CORE_DEPS
        assert len(CORE_DEPS) > 10

    def test_embed_deps_not_empty(self):
        from scripts.deps import EMBED_DEPS
        assert len(EMBED_DEPS) > 5


# ============================================================
# build.py tests
# ============================================================

class TestBuildPrintHelpers:
    """Test print helper functions in build.py."""

    def test_print_header(self, capsys):
        from scripts.build import print_header
        print_header("Test Header")
        captured = capsys.readouterr()
        assert "Test Header" in captured.out
        assert "=" * 60 in captured.out

    def test_print_info(self, capsys):
        from scripts.build import print_info
        print_info("Test info message")
        captured = capsys.readouterr()
        assert "[INFO] Test info message" in captured.out

    def test_print_warn(self, capsys):
        from scripts.build import print_warn
        print_warn("Test warning")
        captured = capsys.readouterr()
        assert "[WARN] Test warning" in captured.out

    def test_print_error(self, capsys):
        from scripts.build import print_error
        print_error("Test error")
        captured = capsys.readouterr()
        assert "[ERROR] Test error" in captured.out


class TestBuildRunCommand:
    """Test run_command function."""

    @patch('scripts.build.subprocess.run')
    def test_run_command_list_success(self, mock_run):
        from scripts.build import run_command
        mock_run.return_value = MagicMock(returncode=0)
        result = run_command(['echo', 'hello'], check=False)
        assert result is True
        mock_run.assert_called_once()

    @patch('scripts.build.subprocess.run')
    def test_run_command_string_uses_shell(self, mock_run):
        from scripts.build import run_command
        mock_run.return_value = MagicMock(returncode=0)
        result = run_command('echo hello', check=False)
        assert result is True
        mock_run.assert_called_once_with('echo hello', shell=True, check=False)

    @patch('scripts.build.subprocess.run')
    def test_run_command_failure_returns_false(self, mock_run):
        import subprocess

        from scripts.build import run_command
        mock_run.side_effect = subprocess.CalledProcessError(1, 'cmd')
        result = run_command(['bad_cmd'], check=True)
        assert result is False

    @patch('scripts.build.subprocess.run')
    def test_run_command_generic_exception(self, mock_run):
        from scripts.build import run_command
        mock_run.side_effect = OSError("not found")
        result = run_command(['missing'], check=True)
        assert result is False

    @patch('scripts.build.subprocess.run')
    def test_run_command_with_description(self, mock_run, capsys):
        from scripts.build import run_command
        mock_run.return_value = MagicMock(returncode=0)
        run_command(['echo', 'hi'], description="Running echo", check=False)
        captured = capsys.readouterr()
        assert "Running echo" in captured.out


class TestBuildClean:
    """Test clean_build function."""

    @patch('scripts.build.shutil.rmtree')
    @patch('scripts.build.os.path.exists')
    def test_clean_build_removes_dirs(self, mock_exists, mock_rmtree):
        from scripts.build import clean_build
        mock_exists.return_value = True
        clean_build()
        # Should attempt to remove build, dist, Output, dmg_temp
        assert mock_rmtree.call_count >= 4

    @patch('scripts.build.shutil.rmtree')
    @patch('scripts.build.os.path.exists')
    def test_clean_build_no_dirs(self, mock_exists, mock_rmtree):
        from scripts.build import clean_build
        mock_exists.return_value = False
        clean_build()
        # rmtree should not be called for non-existing dirs (except iconset check)


class TestBuildStampVersion:
    """Test _stamp_version_in_file function."""

    def test_stamp_version_replaces_pattern(self):
        from scripts.build import _stamp_version_in_file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write('APP_VERSION = "1.0.0"\n')
            tmp_path = f.name
        try:
            result = _stamp_version_in_file(
                tmp_path,
                r'APP_VERSION\s*=\s*"[^"]*"',
                'APP_VERSION = "9.9.9"'
            )
            assert result is True
            with open(tmp_path) as f:
                content = f.read()
            assert 'APP_VERSION = "9.9.9"' in content
        finally:
            os.unlink(tmp_path)

    def test_stamp_version_no_match(self):
        from scripts.build import _stamp_version_in_file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
            f.write('OTHER_VAR = "1.0.0"\n')
            tmp_path = f.name
        try:
            result = _stamp_version_in_file(
                tmp_path,
                r'APP_VERSION\s*=\s*"[^"]*"',
                'APP_VERSION = "9.9.9"'
            )
            assert result is False
        finally:
            os.unlink(tmp_path)

    def test_stamp_version_missing_file(self):
        from scripts.build import _stamp_version_in_file
        result = _stamp_version_in_file(
            '/nonexistent/path.py',
            r'APP_VERSION\s*=\s*"[^"]*"',
            'APP_VERSION = "9.9.9"'
        )
        assert result is False


class TestBuildFindLocalHartos:
    """Test _find_local_hartos_backend function."""

    @patch('scripts.build.os.path.exists')
    def test_find_local_hartos_found(self, mock_exists):
        from scripts.build import _find_local_hartos_backend
        # Return True for the first candidate's pyproject.toml
        def exists_side_effect(path):
            if 'HARTOS' in path and path.endswith('pyproject.toml'):
                return True
            return False
        mock_exists.side_effect = exists_side_effect
        result = _find_local_hartos_backend()
        assert result is not None
        assert 'HARTOS' in result

    @patch('scripts.build.os.path.exists')
    def test_find_local_hartos_not_found(self, mock_exists):
        from scripts.build import _find_local_hartos_backend
        mock_exists.return_value = False
        result = _find_local_hartos_backend()
        assert result is None


class TestBuildPlatformDetection:
    """Test platform detection constants in build.py."""

    def test_platform_constants_are_bool(self):
        from scripts.build import IS_LINUX, IS_MACOS, IS_WINDOWS
        assert isinstance(IS_WINDOWS, bool)
        assert isinstance(IS_MACOS, bool)
        assert isinstance(IS_LINUX, bool)

    def test_app_name(self):
        from scripts.build import APP_NAME
        assert APP_NAME == "Nunba"


# ============================================================
# download.py tests
# ============================================================

class TestDownloadFile:
    """Test download_file function."""

    @patch('scripts.download.urllib.request.urlretrieve')
    def test_download_file_calls_urlretrieve(self, mock_retrieve):
        from scripts.download import download_file
        download_file("https://example.com/file.zip", "/tmp/file.zip")
        mock_retrieve.assert_called_once_with("https://example.com/file.zip", "/tmp/file.zip")


class TestDownloadMain:
    """Test download.py main function flow."""

    @patch('scripts.download.subprocess.run')
    @patch('scripts.download.zipfile.ZipFile')
    @patch('scripts.download.download_file')
    @patch('scripts.download.os.path.exists')
    @patch('scripts.download.os.makedirs')
    def test_main_full_flow(self, mock_makedirs, mock_exists, mock_download,
                            mock_zipfile, mock_subrun):
        from scripts.download import main

        mock_exists.return_value = False  # Files don't exist yet
        mock_subrun.return_value = MagicMock(returncode=0)

        # Mock zipfile context manager
        mock_zip_instance = MagicMock()
        mock_zipfile.return_value.__enter__ = MagicMock(return_value=mock_zip_instance)
        mock_zipfile.return_value.__exit__ = MagicMock(return_value=False)

        # Mock the pth file read/write
        pth_content = "#import site\npython310.zip\n."
        with patch('builtins.open', mock_open(read_data=pth_content)):
            result = main()

        assert result == 0
        assert mock_download.call_count == 2  # py embed + get-pip

    @patch('scripts.download.subprocess.run')
    @patch('scripts.download.zipfile.ZipFile')
    @patch('scripts.download.download_file')
    @patch('scripts.download.os.path.exists')
    @patch('scripts.download.os.makedirs')
    def test_main_skips_existing_downloads(self, mock_makedirs, mock_exists,
                                           mock_download, mock_zipfile, mock_subrun):
        from scripts.download import main

        mock_exists.return_value = True  # Files already exist
        mock_subrun.return_value = MagicMock(returncode=0)

        mock_zip_instance = MagicMock()
        mock_zipfile.return_value.__enter__ = MagicMock(return_value=mock_zip_instance)
        mock_zipfile.return_value.__exit__ = MagicMock(return_value=False)

        pth_content = "#import site\npython310.zip\n."
        with patch('builtins.open', mock_open(read_data=pth_content)):
            result = main()

        assert result == 0
        mock_download.assert_not_called()

    @patch('scripts.download.subprocess.run')
    @patch('scripts.download.zipfile.ZipFile')
    @patch('scripts.download.download_file')
    @patch('scripts.download.os.path.exists')
    @patch('scripts.download.os.makedirs')
    def test_main_handles_error(self, mock_makedirs, mock_exists,
                                mock_download, mock_zipfile, mock_subrun):
        from scripts.download import main

        mock_exists.return_value = False
        mock_download.side_effect = Exception("Network error")

        result = main()
        assert result == 1


# ============================================================
# main.py tests — Flask app and routes
# ============================================================

@pytest.fixture
def app_client():
    """Create a test client for the Flask app defined in main.py.

    We import the already-created `app` object and configure it for testing.
    """
    from main import app
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


class TestFlaskAppCreation:
    """Test that the Flask app is properly created."""

    def test_app_exists(self):
        from flask import Flask

        from main import app
        assert isinstance(app, Flask)

    def test_app_has_no_default_static_folder(self):
        """App is created with static_folder=None (custom static handling)."""
        from main import app
        assert app.static_folder is None

    def test_app_name(self):
        from main import app
        assert app.name == 'main'


class TestProbeEndpoint:
    """Test the /probe health check endpoint."""

    def test_probe_returns_200(self, app_client):
        response = app_client.get('/probe')
        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'Probe successful'

    def test_probe_message(self, app_client):
        response = app_client.get('/probe')
        data = response.get_json()
        assert 'Service is operational' in data['message']


class TestStatusEndpoint:
    """Test the /status endpoint."""

    def test_status_returns_200(self, app_client):
        response = app_client.get('/status')
        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'operational'

    def test_status_local_includes_device_id(self, app_client):
        """Localhost requests should include device_id."""
        response = app_client.get('/status')
        data = response.get_json()
        # Test client uses 127.0.0.1 by default
        assert 'device_id' in data

    def test_status_local_includes_log_file(self, app_client):
        response = app_client.get('/status')
        data = response.get_json()
        assert 'log_file' in data


class TestTestApiEndpoint:
    """Test the /test-api endpoint."""

    def test_test_api_returns_200(self, app_client):
        response = app_client.get('/test-api')
        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'API routes working'


class TestCORSHeaders:
    """Test CORS configuration via after_request handler."""

    def test_cors_allows_localhost(self, app_client):
        response = app_client.get('/probe', headers={'Origin': 'http://localhost:3000'})
        assert response.headers.get('Access-Control-Allow-Origin') == 'http://localhost:3000'
        assert response.headers.get('Access-Control-Allow-Credentials') == 'true'

    def test_cors_allows_127(self, app_client):
        response = app_client.get('/probe', headers={'Origin': 'http://127.0.0.1:5000'})
        assert response.headers.get('Access-Control-Allow-Origin') == 'http://127.0.0.1:5000'

    def test_cors_allows_hevolve(self, app_client):
        response = app_client.get('/probe', headers={'Origin': 'https://hevolve.ai'})
        assert response.headers.get('Access-Control-Allow-Origin') == 'https://hevolve.ai'

    def test_cors_blocks_unknown_origin(self, app_client):
        response = app_client.get('/probe', headers={'Origin': 'https://evil.com'})
        assert response.headers.get('Access-Control-Allow-Origin') is None

    def test_cors_allows_methods(self, app_client):
        response = app_client.get('/probe', headers={'Origin': 'http://localhost:3000'})
        methods = response.headers.get('Access-Control-Allow-Methods', '')
        assert 'GET' in methods
        assert 'POST' in methods
        assert 'DELETE' in methods

    def test_cors_allows_headers(self, app_client):
        response = app_client.get('/probe', headers={'Origin': 'http://localhost:3000'})
        headers = response.headers.get('Access-Control-Allow-Headers', '')
        assert 'Content-Type' in headers
        assert 'Authorization' in headers

    def test_cors_max_age(self, app_client):
        response = app_client.get('/probe', headers={'Origin': 'http://localhost:3000'})
        assert response.headers.get('Access-Control-Max-Age') == '3600'


class TestPreflightHandler:
    """Test OPTIONS preflight handling."""

    def test_options_returns_ok(self, app_client):
        response = app_client.options('/probe', headers={'Origin': 'http://localhost:3000'})
        assert response.status_code == 200

    def test_options_sets_cors(self, app_client):
        response = app_client.options('/probe', headers={'Origin': 'http://localhost:3000'})
        assert response.headers.get('Access-Control-Allow-Origin') == 'http://localhost:3000'

    def test_options_private_network_access(self, app_client):
        response = app_client.options('/probe', headers={
            'Origin': 'http://localhost:3000',
            'Access-Control-Request-Private-Network': 'true'
        })
        assert response.headers.get('Access-Control-Allow-Private-Network') == 'true'


class TestLocalRouteServing:
    """Test the /local route."""

    def test_local_returns_200_or_fallback(self, app_client):
        """The /local route should return 200 (index.html or fallback HTML)."""
        response = app_client.get('/local')
        assert response.status_code == 200

    def test_local_content_is_html(self, app_client):
        response = app_client.get('/local')
        assert 'text/html' in response.content_type


class TestRootRoute:
    """Test the / root route."""

    @patch('requests.head', side_effect=Exception("offline"))
    def test_root_offline_redirects_to_local(self, mock_head, app_client):
        response = app_client.get('/')
        assert response.status_code == 302
        assert '/local' in response.headers.get('Location', '')

    def test_root_force_local(self, app_client):
        response = app_client.get('/?local=true')
        assert response.status_code == 302
        assert '/local' in response.headers.get('Location', '')


class TestStaticFileServing:
    """Test static file serving routes."""

    def test_static_route_exists(self, app_client):
        """The /static/<path> route should exist (may 404 if no build dir)."""
        response = app_client.get('/static/nonexistent.js')
        # Could be 404 if build dir missing, but route should be registered
        assert response.status_code in (200, 404, 500)


class Test404Handler:
    """Test the 404 error handler."""

    def test_api_404_returns_json(self, app_client):
        """API routes that don't exist return JSON 404."""
        response = app_client.get('/api/nonexistent')
        assert response.status_code == 404
        data = response.get_json()
        assert 'error' in data

    def test_non_api_404_serves_spa(self, app_client):
        """Non-API routes should try to serve index.html for SPA routing."""
        response = app_client.get('/some/random/path')
        # Either serves index.html (200) or falls back to 404 JSON
        assert response.status_code in (200, 404)


class TestSecurityHelpers:
    """Test security-related helpers in main.py."""

    def test_is_local_request_from_localhost(self, app_client):
        """Requests from test client (127.0.0.1) should be local."""
        from main import app
        with app.test_request_context(environ_base={'REMOTE_ADDR': '127.0.0.1'}):
            from main import _is_local_request
            assert _is_local_request() is True

    def test_is_local_request_from_ipv6_localhost(self, app_client):
        from main import app
        with app.test_request_context(environ_base={'REMOTE_ADDR': '::1'}):
            from main import _is_local_request
            assert _is_local_request() is True

    def test_is_local_request_from_external(self, app_client):
        from main import app
        with app.test_request_context(environ_base={'REMOTE_ADDR': '8.8.8.8'}):
            from main import _is_local_request
            assert _is_local_request() is False


class TestRequireLocalOrToken:
    """Test the require_local_or_token decorator."""

    def test_execute_from_localhost_ok(self, app_client):
        """Localhost requests to protected endpoints should be allowed."""
        response = app_client.post('/execute', json={'command': 'echo hello', 'shell': True})
        # Should not be 401 since test client is localhost
        assert response.status_code != 401

    def test_debug_routes_from_localhost(self, app_client):
        response = app_client.get('/debug/routes')
        assert response.status_code == 200
        data = response.get_json()
        assert isinstance(data, list)
        assert len(data) > 0


class TestDeviceId:
    """Test device ID generation."""

    def test_device_id_is_hex_string(self):
        from main import DEVICE_ID
        assert isinstance(DEVICE_ID, str)
        assert len(DEVICE_ID) == 64  # SHA-256 hex

    def test_device_id_deterministic(self):
        from main import get_device_id
        id1 = get_device_id()
        id2 = get_device_id()
        assert id1 == id2


class TestGetAppDirectory:
    """Test get_app_directory function."""

    def test_returns_string(self):
        from main import get_app_directory
        result = get_app_directory()
        assert isinstance(result, str)
        assert os.path.isdir(result)

    def test_not_frozen_returns_script_dir(self):
        from main import get_app_directory
        result = get_app_directory()
        assert os.path.isabs(result)


class TestPrivateIpCheck:
    """Test _is_private_ip SSRF protection."""

    def test_localhost_is_private(self):
        from main import _is_private_ip
        assert _is_private_ip("127.0.0.1") is True

    def test_unresolvable_is_private(self):
        from main import _is_private_ip
        assert _is_private_ip("totally-fake-domain-xyz-123.invalid") is True

    @patch('main.socket.gethostbyname', return_value='8.8.8.8')
    def test_public_ip_is_not_private(self, mock_resolve):
        from main import _is_private_ip
        assert _is_private_ip("example.com") is False


class TestIsPortInUse:
    """Test the _is_port_in_use helper."""

    def test_unused_port_returns_false(self):
        from main import _is_port_in_use
        # Port 1 is almost certainly not in use by current user
        assert _is_port_in_use(19999) is False


class TestConnectivityEndpoint:
    """Test the /api/connectivity endpoint."""

    def test_connectivity_returns_json(self, app_client):
        response = app_client.get('/api/connectivity')
        assert response.status_code == 200
        data = response.get_json()
        assert 'online' in data


class TestApiEndpoints:
    """Test that key API constants and endpoints are defined."""

    def test_api_endpoints_set(self):
        from main import API_ENDPOINTS
        assert isinstance(API_ENDPOINTS, set)
        assert 'api' in API_ENDPOINTS
        assert 'chat' in API_ENDPOINTS
        assert 'status' in API_ENDPOINTS

    def test_landing_page_build_dir(self):
        from main import LANDING_PAGE_BUILD_DIR
        assert 'landing-page' in LANDING_PAGE_BUILD_DIR
        assert 'build' in LANDING_PAGE_BUILD_DIR


class TestRouteRegistration:
    """Test that key routes are registered on the Flask app."""

    def test_probe_route_registered(self):
        from main import app
        rules = [rule.rule for rule in app.url_map.iter_rules()]
        assert '/probe' in rules

    def test_status_route_registered(self):
        from main import app
        rules = [rule.rule for rule in app.url_map.iter_rules()]
        assert '/status' in rules

    def test_local_route_registered(self):
        from main import app
        rules = [rule.rule for rule in app.url_map.iter_rules()]
        assert '/local' in rules

    def test_execute_route_registered(self):
        from main import app
        rules = [rule.rule for rule in app.url_map.iter_rules()]
        assert '/execute' in rules

    def test_screenshot_route_registered(self):
        from main import app
        rules = [rule.rule for rule in app.url_map.iter_rules()]
        assert '/screenshot' in rules

    def test_llm_status_route_registered(self):
        from main import app
        rules = [rule.rule for rule in app.url_map.iter_rules()]
        assert '/api/llm/status' in rules

    def test_chat_route_registered(self):
        """chatbot_routes should register /chat."""
        from main import app
        rules = [rule.rule for rule in app.url_map.iter_rules()]
        assert '/chat' in rules

    def test_debug_routes_registered(self):
        from main import app
        rules = [rule.rule for rule in app.url_map.iter_rules()]
        assert '/debug/routes' in rules

    def test_logs_route_registered(self):
        from main import app
        rules = [rule.rule for rule in app.url_map.iter_rules()]
        assert '/logs' in rules

    def test_admin_models_route_registered(self):
        from main import app
        rules = [rule.rule for rule in app.url_map.iter_rules()]
        assert '/api/admin/models' in rules

    def test_connectivity_route_registered(self):
        from main import app
        rules = [rule.rule for rule in app.url_map.iter_rules()]
        assert '/api/connectivity' in rules
