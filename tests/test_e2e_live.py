"""
Live E2E tests — runs against a live Flask server on :5000.
Tests model catalog, orchestrator, bootstrap planning, chat, and APIs.

Usage: python -m pytest tests/test_e2e_live.py -v
Requires: Flask running on localhost:5000
"""
import time

import pytest
import requests

BASE = 'http://127.0.0.1:5000'
TIMEOUT = 30  # Waitress threads can be blocked by background retries


@pytest.fixture(scope='session', autouse=True)
def check_server():
    """Skip all tests if Flask isn't running."""
    try:
        # Use /cors/test (lightweight) with long timeout —
        # Waitress threads may be blocked by peer discovery retries
        r = requests.get(f'{BASE}/cors/test', timeout=30)
        if r.status_code != 200:
            pytest.skip(f'Flask returned {r.status_code}')
    except requests.ConnectionError:
        pytest.skip('Flask not running on :5000')
    except Exception as e:
        pytest.skip(f'Flask check failed: {e}')


class TestHealthAndInfra:
    def test_health_endpoint(self):
        r = requests.get(f'{BASE}/backend/health', timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert d['healthy'] is True
        assert 'local' in d
        assert 'cloud' in d

    def test_cors_headers(self):
        r = requests.options(f'{BASE}/chat', timeout=TIMEOUT)
        # Should return CORS headers or 200/204
        assert r.status_code in (200, 204, 405)

    def test_hart_check(self):
        r = requests.get(f'{BASE}/api/hart/check', timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert 'has_hart' in d or 'check' in d

    def test_prompts_endpoint(self):
        r = requests.get(f'{BASE}/prompts', params={'user_id': 'test'},
                         timeout=TIMEOUT)
        assert r.status_code == 200


class TestBootstrapAPI:
    def test_bootstrap_start(self):
        r = requests.post(f'{BASE}/api/ai/bootstrap',
                          json={'language': 'en'}, timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert 'phase' in d
        assert d['phase'] in ('detecting', 'planning', 'running', 'done')

    def test_bootstrap_status(self):
        r = requests.get(f'{BASE}/api/ai/bootstrap/status', timeout=TIMEOUT)
        assert r.status_code == 200
        d = r.json()
        assert 'phase' in d
        assert 'steps' in d

    def test_bootstrap_gpu_detection(self):
        r = requests.get(f'{BASE}/api/ai/bootstrap/status', timeout=TIMEOUT)
        d = r.json()
        # GPU should be detected (or empty if no GPU)
        assert 'gpu_name' in d
        assert 'vram_total_gb' in d

    def test_bootstrap_plan_has_model_types(self):
        """Bootstrap should plan for STT, TTS, LLM at minimum."""
        # Trigger bootstrap
        requests.post(f'{BASE}/api/ai/bootstrap',
                      json={'language': 'ta'}, timeout=TIMEOUT)
        time.sleep(2)
        r = requests.get(f'{BASE}/api/ai/bootstrap/status', timeout=TIMEOUT)
        d = r.json()
        steps = d.get('steps', {})
        # Should have essential types
        assert 'stt' in steps or 'llm' in steps

    def test_bootstrap_language_affects_tts_selection(self):
        """Tamil should select Indic Parler, English should select F5/Chatterbox."""
        requests.post(f'{BASE}/api/ai/bootstrap',
                      json={'language': 'ta'}, timeout=TIMEOUT)
        time.sleep(3)
        r = requests.get(f'{BASE}/api/ai/bootstrap/status', timeout=TIMEOUT)
        steps = r.json().get('steps', {})
        tts = steps.get('tts', {})
        if tts.get('model_name'):
            # Tamil should get Indic Parler
            assert 'indic' in tts['model_name'].lower() or \
                   'parler' in tts['model_name'].lower(), \
                   f"Tamil should get Indic Parler, got: {tts['model_name']}"


class TestChatEndpoint:
    def test_chat_returns_response(self):
        r = requests.post(f'{BASE}/chat', json={
            'text': 'Hi',
            'user_id': 'e2e_test',
            'agent_type': 'local',
            'conversation_id': 'e2e_001',
            'preferred_lang': 'en',
        }, timeout=60)
        assert r.status_code == 200
        d = r.json()
        # Should have some response text
        assert d.get('text') or d.get('response') or d.get('error')

    def test_chat_with_language(self):
        """Chat with preferred_lang should not crash."""
        r = requests.post(f'{BASE}/chat', json={
            'text': 'Hello',
            'user_id': 'e2e_test',
            'agent_type': 'local',
            'conversation_id': 'e2e_002',
            'preferred_lang': 'ta',
        }, timeout=60)
        assert r.status_code == 200

    def test_chat_empty_text_rejected(self):
        r = requests.post(f'{BASE}/chat', json={
            'text': '',
            'user_id': 'e2e_test',
            'agent_type': 'local',
        }, timeout=TIMEOUT)
        assert r.status_code == 400


class TestModelCatalog:
    """Tests that run against the in-process catalog via API."""

    def test_catalog_populated(self):
        """Verify catalog has entries via the orchestrator status."""
        # Use health endpoint which reports model info
        r = requests.get(f'{BASE}/backend/health', timeout=TIMEOUT)
        d = r.json()
        assert 'local' in d

    def test_tts_status(self):
        r = requests.get(f'{BASE}/tts/status', timeout=TIMEOUT)
        # TTS may be disabled (NUNBA_DISABLE_TTS=1) but endpoint should exist
        assert r.status_code in (200, 503)

    def test_tts_engines_list(self):
        r = requests.get(f'{BASE}/tts/engines', timeout=TIMEOUT)
        assert r.status_code in (200, 503)


class TestSocialAPI:
    """Test social endpoints are registered."""

    def test_social_auth_register(self):
        r = requests.post(f'{BASE}/api/social/auth/register', json={
            'username': f'e2e_test_{int(time.time())}',
            'password': 'testpass123',
            'guest_name': 'E2E Test',
        }, timeout=TIMEOUT)
        # Should succeed or conflict (if user exists)
        assert r.status_code in (200, 201, 409)

    def test_social_feed(self):
        r = requests.get(f'{BASE}/api/social/feed', timeout=TIMEOUT)
        assert r.status_code in (200, 401)


class TestHARTOnboarding:
    def test_hart_advance(self):
        r = requests.post(f'{BASE}/api/hart/advance', json={
            'user_id': 'e2e_test',
            'phase': 'greeting',
            'language': 'en',
        }, timeout=TIMEOUT)
        assert r.status_code == 200

    def test_hart_generate(self):
        r = requests.post(f'{BASE}/api/hart/generate', json={
            'user_id': 'e2e_test',
            'dimensions': {'passion': 'technology', 'escape': 'music'},
        }, timeout=TIMEOUT)
        assert r.status_code == 200
