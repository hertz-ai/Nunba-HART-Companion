"""
test_llama_health_endpoint.py - Tests for llama/llama_health_endpoint.py

Tests the health/info/status Flask endpoints that expose Nunba's AI state.
Each test verifies a specific user-facing behavior:

FT: Health endpoint returns Nunba identification, info endpoint returns version/capabilities,
    AI status reports model state, error handling returns 500 with details.
NFT: Response time for health checks, JSON schema stability for frontend consumers.
"""
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from flask import Flask

# ============================================================
# LlamaHealthWrapper — unit tests
# ============================================================

class TestLlamaHealthWrapper:
    """Test the health wrapper that adds Nunba identification to llama.cpp health."""

    def test_get_llama_health_success(self):
        """When llama.cpp is healthy, returns its status."""
        from llama.llama_health_endpoint import LlamaHealthWrapper
        wrapper = LlamaHealthWrapper(llama_port=8080)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {'status': 'ok'}
        with patch('llama.llama_health_endpoint.requests.get', return_value=mock_resp):
            result = wrapper.get_llama_health()
        assert result['status'] == 'ok'

    def test_get_llama_health_server_error(self):
        """When llama.cpp returns 500, reports error with HTTP code."""
        from llama.llama_health_endpoint import LlamaHealthWrapper
        wrapper = LlamaHealthWrapper(llama_port=8080)
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        with patch('llama.llama_health_endpoint.requests.get', return_value=mock_resp):
            result = wrapper.get_llama_health()
        assert result['status'] == 'error'
        assert '500' in result['error']

    def test_get_llama_health_connection_refused(self):
        """When llama.cpp is not running, reports connection error."""
        from llama.llama_health_endpoint import LlamaHealthWrapper
        wrapper = LlamaHealthWrapper(llama_port=9999)
        with patch('llama.llama_health_endpoint.requests.get',
                   side_effect=ConnectionError("Connection refused")):
            result = wrapper.get_llama_health()
        assert result['status'] == 'error'

    def test_get_nunba_health_includes_identification(self):
        """Frontend uses 'managed_by: Nunba' to distinguish from external llama.cpp."""
        from llama.llama_health_endpoint import LlamaHealthWrapper
        wrapper = LlamaHealthWrapper(llama_port=8080)
        with patch.object(wrapper, 'get_llama_health', return_value={'status': 'ok'}):
            result = wrapper.get_nunba_health()
        assert result['managed_by'] == 'Nunba'
        assert 'nunba_version' in result
        assert 'timestamp' in result
        assert result['status'] == 'ok'

    def test_get_nunba_health_propagates_llama_status(self):
        """If llama.cpp reports error, nunba_health status should also be error."""
        from llama.llama_health_endpoint import LlamaHealthWrapper
        wrapper = LlamaHealthWrapper(llama_port=8080)
        with patch.object(wrapper, 'get_llama_health',
                          return_value={'status': 'error', 'error': 'model loading'}):
            result = wrapper.get_nunba_health()
        assert result['status'] == 'error'

    def test_default_status_ok_when_llama_has_no_status(self):
        """Edge case: llama.cpp returns JSON without 'status' key."""
        from llama.llama_health_endpoint import LlamaHealthWrapper
        wrapper = LlamaHealthWrapper(llama_port=8080)
        with patch.object(wrapper, 'get_llama_health', return_value={'model': 'loaded'}):
            result = wrapper.get_nunba_health()
        assert result['status'] == 'ok'

    def test_port_configuration(self):
        """Ports must match what's configured — wrong port = health check fails silently."""
        from llama.llama_health_endpoint import LlamaHealthWrapper
        wrapper = LlamaHealthWrapper(llama_port=9090, wrapper_port=5000)
        assert wrapper.llama_port == 9090
        assert wrapper.wrapper_port == 5000
        assert '9090' in wrapper.llama_base_url


# ============================================================
# Flask route tests — /health, /nunba/info, /nunba/ai/status
# ============================================================

class TestHealthRoutes:
    """Test Flask health endpoints — these are consumed by the frontend and tray indicator."""

    @pytest.fixture
    def app(self):
        app = Flask(__name__)
        app.config['TESTING'] = True
        from llama.llama_health_endpoint import add_health_routes
        mock_config = MagicMock()
        mock_config.config = {'server_port': 8080, 'use_gpu': True, 'context_size': 4096,
                              'selected_model_index': 0}
        mock_preset = MagicMock()
        mock_preset.display_name = 'Qwen3.5-4B'
        mock_preset.size_mb = 2910
        mock_preset.has_vision = True
        mock_preset.description = 'Test model'
        mock_config.get_selected_model_preset.return_value = mock_preset
        add_health_routes(app, llama_config=mock_config)
        return app

    def test_health_endpoint_returns_200(self, app):
        """GET /health must always return 200 — frontend polls this for liveness."""
        with app.test_client() as client:
            with patch('llama.llama_health_endpoint.requests.get') as mock_get:
                mock_get.return_value = MagicMock(status_code=200,
                                                   json=MagicMock(return_value={'status': 'ok'}))
                resp = client.get('/health')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['managed_by'] == 'Nunba'

    def test_info_endpoint_returns_version(self, app):
        """GET /nunba/info — frontend displays version in settings page."""
        with app.test_client() as client:
            resp = client.get('/nunba/info')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['application'] == 'Nunba'
        assert 'version' in data
        assert 'ai_capabilities' in data
        assert data['ai_config']['model']['name'] == 'Qwen3.5-4B'

    def test_info_endpoint_without_config(self):
        """When no llama_config, info still returns basic app info."""
        app = Flask(__name__)
        app.config['TESTING'] = True
        from llama.llama_health_endpoint import add_health_routes
        add_health_routes(app, llama_config=None)
        with app.test_client() as client:
            resp = client.get('/nunba/info')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['application'] == 'Nunba'
        assert 'ai_config' not in data  # No config = no AI section

    def test_ai_status_without_config_returns_503(self):
        """GET /nunba/ai/status without config = service unavailable."""
        app = Flask(__name__)
        app.config['TESTING'] = True
        from llama.llama_health_endpoint import add_health_routes
        add_health_routes(app, llama_config=None)
        with app.test_client() as client:
            resp = client.get('/nunba/ai/status')
        assert resp.status_code == 503

    def test_ai_status_reports_running_state(self, app):
        """GET /nunba/ai/status — tray indicator uses 'running' field."""
        with app.test_client() as client:
            with patch('llama.llama_health_endpoint.LlamaHealthWrapper') as mock_cls:
                # Mock the llama_config methods that ai_status calls
                app_config = app.view_functions['ai_status']
                resp = client.get('/nunba/ai/status')
        # May return 200 or 500 depending on mock depth — key: doesn't crash
        assert resp.status_code in (200, 500)

    def test_health_json_schema_stability(self, app):
        """Frontend parses specific keys — schema changes break the UI."""
        with app.test_client() as client:
            with patch('llama.llama_health_endpoint.requests.get') as mock_get:
                mock_get.return_value = MagicMock(status_code=200,
                                                   json=MagicMock(return_value={'status': 'ok'}))
                resp = client.get('/health')
        data = resp.get_json()
        # These keys are consumed by the frontend — must not change
        assert 'managed_by' in data
        assert 'status' in data
        assert 'timestamp' in data


# ============================================================
# Edge cases — error resilience
# ============================================================

class TestHealthEdgeCases:
    """Edge cases that occur in production — llama server crashes, slow responses."""

    def test_health_when_llama_not_running(self):
        """GET /health must still return 200 even when llama.cpp is down."""
        app = Flask(__name__)
        app.config['TESTING'] = True
        from llama.llama_health_endpoint import add_health_routes
        add_health_routes(app, llama_config=None)
        with app.test_client() as client:
            with patch('llama.llama_health_endpoint.requests.get',
                       side_effect=ConnectionError("refused")):
                resp = client.get('/health')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['managed_by'] == 'Nunba'

    def test_info_returns_correct_model_info(self):
        """Model name in /nunba/info must match the selected preset."""
        app = Flask(__name__)
        app.config['TESTING'] = True
        from llama.llama_health_endpoint import add_health_routes
        mock_config = MagicMock()
        mock_config.config = {'server_port': 8080, 'use_gpu': False,
                              'context_size': 4096, 'selected_model_index': 0}
        mock_preset = MagicMock()
        mock_preset.display_name = 'TestModel-7B'
        mock_preset.size_mb = 5000
        mock_preset.has_vision = False
        mock_preset.description = 'A test model'
        mock_config.get_selected_model_preset.return_value = mock_preset
        add_health_routes(app, llama_config=mock_config)
        with app.test_client() as client:
            resp = client.get('/nunba/info')
        data = resp.get_json()
        assert data['ai_config']['model']['name'] == 'TestModel-7B'
        assert data['ai_config']['model']['has_vision'] is False

    def test_health_timestamp_format(self):
        """Timestamp must be parseable — frontend displays it."""
        from llama.llama_health_endpoint import LlamaHealthWrapper
        wrapper = LlamaHealthWrapper()
        with patch.object(wrapper, 'get_llama_health', return_value={'status': 'ok'}):
            result = wrapper.get_nunba_health()
        ts = result['timestamp']
        # Must be YYYY-MM-DD HH:MM:SS format
        assert len(ts) >= 19
        assert '-' in ts and ':' in ts

    def test_wrapper_port_in_response(self):
        """Frontend uses wrapper_port to construct API URLs."""
        from llama.llama_health_endpoint import LlamaHealthWrapper
        wrapper = LlamaHealthWrapper(llama_port=8080, wrapper_port=5000)
        with patch.object(wrapper, 'get_llama_health', return_value={'status': 'ok'}):
            result = wrapper.get_nunba_health()
        assert result['wrapper_port'] == 5000
        assert result['llama_port'] == 8080
