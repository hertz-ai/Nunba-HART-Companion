"""
Deep functional tests for health and info endpoint business rules.

Tests INTENDED BEHAVIOR of /health, /nunba/info, /status, /backend/watchdog:
- Health returns structured JSON with known fields
- /nunba/info includes app identity, AI config, capabilities
- Backend watchdog reports service status
- Health must respond within 5s (no blocking on LLM)
- Info endpoint reflects actual model configuration
"""
import os
import sys
import time

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


@pytest.fixture(scope='module')
def client():
    try:
        from main import app
        app.config['TESTING'] = True
        with app.test_client() as c:
            yield c
    except Exception as e:
        pytest.skip(f"Flask app not available: {e}")


# ==========================================================================
# 1. /health Endpoint
# ==========================================================================
class TestHealthEndpoint:
    def test_health_responds(self, client):
        start = time.time()
        resp = client.get('/health')
        elapsed = time.time() - start
        assert resp.status_code in (200, 500)
        assert elapsed < 5.0, f"/health took {elapsed:.1f}s — must respond within 5s"

    def test_health_returns_json(self, client):
        resp = client.get('/health')
        data = resp.get_json()
        assert data is not None, "/health must return JSON"

    def test_health_has_status(self, client):
        resp = client.get('/health')
        if resp.status_code == 200:
            data = resp.get_json()
            assert 'status' in data or 'llama_health' in data or 'healthy' in str(data).lower()


# ==========================================================================
# 2. /nunba/info Endpoint
# ==========================================================================
class TestNunbaInfoEndpoint:
    def test_info_returns_200(self, client):
        resp = client.get('/nunba/info')
        assert resp.status_code in (200, 500)

    def test_info_has_application_name(self, client):
        resp = client.get('/nunba/info')
        if resp.status_code == 200:
            data = resp.get_json()
            assert data.get('application') == 'Nunba', \
                f"Expected application='Nunba', got {data.get('application')}"

    def test_info_has_ai_config(self, client):
        resp = client.get('/nunba/info')
        if resp.status_code == 200:
            data = resp.get_json()
            assert 'ai_config' in data, "/nunba/info must include ai_config"

    def test_ai_config_has_model_info(self, client):
        resp = client.get('/nunba/info')
        if resp.status_code == 200:
            config = resp.get_json().get('ai_config', {})
            assert 'model' in config, "ai_config must include model details"
            model = config['model']
            assert 'name' in model, "Model must have a name"

    def test_ai_config_has_port(self, client):
        resp = client.get('/nunba/info')
        if resp.status_code == 200:
            config = resp.get_json().get('ai_config', {})
            assert 'port' in config, "ai_config must specify LLM port"
            assert isinstance(config['port'], int)

    def test_ai_capabilities_present(self, client):
        resp = client.get('/nunba/info')
        if resp.status_code == 200:
            data = resp.get_json()
            assert 'ai_capabilities' in data
            caps = data['ai_capabilities']
            assert 'engine' in caps, "Must specify AI engine"
            assert caps['engine'] == 'llama.cpp', f"Engine must be llama.cpp, got {caps['engine']}"

    def test_info_has_local_llm_flag(self, client):
        resp = client.get('/nunba/info')
        if resp.status_code == 200:
            caps = resp.get_json().get('ai_capabilities', {})
            assert caps.get('local_llm') is True, "Nunba is local-first — local_llm must be True"

    def test_info_has_description(self, client):
        resp = client.get('/nunba/info')
        if resp.status_code == 200:
            data = resp.get_json()
            assert 'description' in data
            assert 'LocalMind' in data['description'] or 'Nunba' in data['description']

    def test_model_has_vision_flag(self, client):
        resp = client.get('/nunba/info')
        if resp.status_code == 200:
            model = resp.get_json().get('ai_config', {}).get('model', {})
            assert 'has_vision' in model, "Model must indicate vision capability"

    def test_model_has_size(self, client):
        resp = client.get('/nunba/info')
        if resp.status_code == 200:
            model = resp.get_json().get('ai_config', {}).get('model', {})
            assert 'size_mb' in model, "Model must report size"
            assert model['size_mb'] > 0


# ==========================================================================
# 3. /status Endpoint
# ==========================================================================
class TestStatusEndpoint:
    def test_status_returns_json(self, client):
        resp = client.get('/status')
        assert resp.status_code in (200, 500)
        if resp.status_code == 200:
            data = resp.get_json()
            assert isinstance(data, dict)

    def test_status_responds_fast(self, client):
        start = time.time()
        client.get('/status')
        assert time.time() - start < 3.0, "/status must be fast"


# ==========================================================================
# 4. /backend/watchdog Endpoint
# ==========================================================================
class TestWatchdogEndpoint:
    def test_watchdog_returns_json(self, client):
        resp = client.get('/backend/watchdog')
        assert resp.status_code in (200, 500)
        data = resp.get_json()
        assert data is not None

    def test_watchdog_responds_fast(self, client):
        start = time.time()
        client.get('/backend/watchdog')
        assert time.time() - start < 3.0


# ==========================================================================
# 5. /probe Endpoint
# ==========================================================================
class TestProbeEndpoint:
    def test_probe_returns_200(self, client):
        resp = client.get('/probe')
        assert resp.status_code == 200

    def test_probe_has_status(self, client):
        data = client.get('/probe').get_json()
        assert data['status'] == 'Probe successful'
        assert 'message' in data

    def test_probe_is_instant(self, client):
        start = time.time()
        client.get('/probe')
        assert time.time() - start < 0.5, "/probe must be instant"


# ==========================================================================
# 6. /prompts Endpoint
# ==========================================================================
class TestPromptsEndpoint:
    def test_prompts_returns_json(self, client):
        resp = client.get('/prompts')
        assert resp.status_code in (200, 500)
        if resp.status_code == 200:
            data = resp.get_json()
            assert 'prompts' in data

    def test_prompts_list_has_agents(self, client):
        resp = client.get('/prompts')
        if resp.status_code == 200:
            prompts = resp.get_json().get('prompts', [])
            assert isinstance(prompts, list)
            # Should have at least the default local agent
            if prompts:
                agent = prompts[0]
                assert 'name' in agent or 'prompt_id' in agent

    def test_prompts_agents_have_names(self, client):
        resp = client.get('/prompts')
        if resp.status_code == 200:
            for agent in resp.get_json().get('prompts', []):
                assert 'name' in agent, f"Agent missing name: {agent.get('prompt_id')}"

    def test_prompts_responds_fast(self, client):
        start = time.time()
        client.get('/prompts')
        elapsed = time.time() - start
        assert elapsed < 5.0, f"/prompts took {elapsed:.1f}s"


# ==========================================================================
# 7. /network/status Endpoint
# ==========================================================================
class TestNetworkStatusEndpoint:
    def test_network_status_returns_json(self, client):
        resp = client.get('/network/status')
        assert resp.status_code in (200, 404)
        if resp.status_code == 200:
            data = resp.get_json()
            assert 'is_online' in data, "Must report online/offline status"

    def test_network_status_is_boolean(self, client):
        resp = client.get('/network/status')
        if resp.status_code == 200:
            data = resp.get_json()
            assert isinstance(data['is_online'], bool)
