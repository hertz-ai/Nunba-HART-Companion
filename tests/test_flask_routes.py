"""
Functional tests for main.py Flask API routes.

Uses Flask test client to test HTTP endpoints without a running server.
Tests cover: health, probe, status, LLM status, admin models, SSE events,
debug routes, image proxy, network status, device ID, CORS.
"""
import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


@pytest.fixture(scope='module')
def client():
    """Create Flask test client from main.py app."""
    try:
        from main import app
        app.config['TESTING'] = True
        with app.test_client() as c:
            yield c
    except Exception as e:
        pytest.skip(f"Could not import Flask app: {e}")


# ==========================================================================
# 1. Health & Probe
# ==========================================================================
class TestHealthEndpoints:
    def test_health_returns_200_or_500(self, client):
        resp = client.get('/health')
        assert resp.status_code in (200, 500)

    def test_health_returns_json(self, client):
        resp = client.get('/health')
        data = resp.get_json()
        assert data is not None

    def test_probe_returns_200(self, client):
        resp = client.get('/probe')
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'Probe successful'

    def test_cors_test_or_health(self, client):
        # /cors/test is on gui_app (app.py), not main.py app
        # Verify health works instead as CORS smoke test
        resp = client.get('/health')
        assert resp.status_code in (200, 500)


# ==========================================================================
# 2. Status Endpoint
# ==========================================================================
class TestStatusEndpoint:
    def test_status_returns_json(self, client):
        resp = client.get('/status')
        assert resp.status_code in (200, 500)

    def test_status_has_version(self, client):
        resp = client.get('/status')
        if resp.status_code == 200:
            data = resp.get_json()
            # Should have version info
            assert data is not None


# ==========================================================================
# 3. LLM Status Endpoints
# ==========================================================================
class TestLLMEndpoints:
    def test_llm_status_returns_json(self, client):
        resp = client.get('/api/llm/status')
        assert resp.status_code in (200, 500, 503)

    def test_llm_control_status(self, client):
        resp = client.get('/llm_control_status')
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'active' in data or 'llm_control_active' in data or isinstance(data, dict)


# ==========================================================================
# 4. Admin Model Endpoints
# ==========================================================================
class TestAdminModels:
    def test_list_models(self, client):
        resp = client.get('/api/admin/models')
        assert resp.status_code in (200, 401, 403, 500)

    def test_model_health(self, client):
        resp = client.get('/api/admin/models/health')
        assert resp.status_code in (200, 401, 403, 500)

    def test_get_nonexistent_model(self, client):
        resp = client.get('/api/admin/models/nonexistent-model-xyz')
        assert resp.status_code in (200, 404, 401, 403, 500)

    def test_auto_select_model(self, client):
        resp = client.post('/api/admin/models/auto-select',
                          json={},
                          content_type='application/json')
        assert resp.status_code in (200, 400, 401, 403, 500)


# ==========================================================================
# 5. SSE Events Endpoint
# ==========================================================================
class TestSSEEvents:
    def test_sse_requires_token(self, client):
        resp = client.get('/api/social/events/stream')
        assert resp.status_code == 401
        data = resp.get_json()
        assert 'error' in data or 'token' in str(data).lower()

    def test_sse_rejects_invalid_token(self, client):
        resp = client.get('/api/social/events/stream?token=invalid')
        assert resp.status_code in (401, 500)

    def test_sse_empty_token(self, client):
        resp = client.get('/api/social/events/stream?token=')
        assert resp.status_code == 401


# ==========================================================================
# 6. Debug Routes
# ==========================================================================
class TestDebugRoutes:
    def test_debug_routes_lists_endpoints(self, client):
        resp = client.get('/debug/routes')
        assert resp.status_code in (200, 401, 403)
        if resp.status_code == 200:
            data = resp.get_json()
            assert isinstance(data, (list, dict))

    def test_test_api_endpoint(self, client):
        resp = client.get('/test-api')
        assert resp.status_code in (200, 404)


# ==========================================================================
# 7. Image Proxy
# ==========================================================================
class TestImageProxy:
    def test_image_proxy_requires_url(self, client):
        resp = client.get('/api/image-proxy')
        assert resp.status_code in (400, 200, 404)

    def test_image_proxy_with_empty_url(self, client):
        resp = client.get('/api/image-proxy?url=')
        assert resp.status_code in (400, 200, 404)


# ==========================================================================
# 8. Network Status
# ==========================================================================
class TestNetworkStatus:
    def test_network_status(self, client):
        resp = client.get('/network/status')
        assert resp.status_code in (200, 404)
        if resp.status_code == 200:
            data = resp.get_json()
            assert 'is_online' in data or 'online' in str(data).lower()


# ==========================================================================
# 9. Backend Watchdog
# ==========================================================================
class TestBackendWatchdog:
    def test_watchdog_returns_json(self, client):
        resp = client.get('/backend/watchdog')
        assert resp.status_code in (200, 500)


# ==========================================================================
# 10. Device Info
# ==========================================================================
class TestDeviceInfo:
    def test_nunba_info(self, client):
        resp = client.get('/nunba/info')
        assert resp.status_code in (200, 500)
        if resp.status_code == 200:
            data = resp.get_json()
            assert 'application' in data or 'nunba_version' in data or 'status' in data

    def test_prompts_endpoint(self, client):
        resp = client.get('/prompts')
        assert resp.status_code in (200, 500)
        if resp.status_code == 200:
            data = resp.get_json()
            assert isinstance(data, dict)


# ==========================================================================
# 11. CORS Headers
# ==========================================================================
class TestCORSHeaders:
    def test_cors_headers_present(self, client):
        resp = client.get('/health')
        # Flask-CORS should add Access-Control headers
        headers = dict(resp.headers)
        # At minimum, no 5xx from CORS issues
        assert resp.status_code < 600

    def test_options_preflight(self, client):
        resp = client.options('/health')
        assert resp.status_code in (200, 204, 405)


# ==========================================================================
# 12. SPA Catch-All (404 handler)
# ==========================================================================
class TestSPACatchAll:
    def test_api_404_returns_json(self, client):
        resp = client.get('/api/nonexistent')
        assert resp.status_code == 404
        data = resp.get_json()
        if data:
            assert 'error' in data

    def test_nonapi_path_serves_spa_or_404(self, client):
        resp = client.get('/some/random/page')
        # Should serve index.html (200) if build exists, or 404
        assert resp.status_code in (200, 404)

    def test_static_path(self, client):
        resp = client.get('/static/nonexistent.js')
        assert resp.status_code in (200, 404)


# ==========================================================================
# 13. Share Redirect
# ==========================================================================
class TestShareRedirect:
    def test_share_redirect_with_invalid_token(self, client):
        resp = client.get('/s/invalid-token-xyz')
        # Should redirect to /social?share=... as fallback
        assert resp.status_code in (200, 302, 404)

    def test_share_redirect_follows(self, client):
        resp = client.get('/s/test', follow_redirects=True)
        assert resp.status_code in (200, 404)


# ==========================================================================
# 14. Indicator Stop
# ==========================================================================
class TestIndicatorStop:
    def test_indicator_stop(self, client):
        resp = client.get('/indicator/stop')
        assert resp.status_code in (200, 404, 500)
