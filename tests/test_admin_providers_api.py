"""
Unit tests for the Provider Gateway + WAMP admin API endpoints.

Covers:
  * The 4 optional_import resolvers in main.py:
      _providers_registry / _providers_gateway / _providers_matrix / _wamp_mod
  * Every endpoint in the /api/admin/providers/* family (9 routes)
  * /api/wamp/status + /api/wamp/ticket + the WAMP HTTP bridge

Design:
  * All HARTOS-side modules (integrations.providers.* / wamp_router) are
    injected into sys.modules so the route bodies never hit network or
    disk.  The core.optional_import registry is reset before every test
    so a prior test's cached lookup doesn't bleed.
  * Each endpoint is exercised through the Flask test client (the
    canonical in-process entry) so Flask routing, JSON shape, and
    status codes are all verified at the surface callers actually hit.

Target: ~180 LOC of previously uncovered main.py admin endpoints +
the 4 helpers that route through core.optional_import.
"""
from __future__ import annotations

import os
import sys
import types
from dataclasses import dataclass
from unittest.mock import MagicMock, patch

import pytest
from flask import json as _flask_json

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ────────────────────────────────────────────────────────────────────────
# Fixtures
# ────────────────────────────────────────────────────────────────────────

def _reset_optional_import_registry():
    """Drop the module-global _LOADED + _DEGRADED dicts so each test
    exercises the resolver fresh."""
    try:
        from core.optional_import import _DEGRADED, _LOADED
        _LOADED.clear()
        _DEGRADED.clear()
    except ImportError:
        pass


@pytest.fixture
def app_client():
    """Flask test client for main.app.

    Runs with the optional_import registry reset so each test's
    sys.modules injections are seen for the FIRST time by
    optional_import (successful imports are cached; we need the test
    to exercise the lookup, not the cache).
    """
    _reset_optional_import_registry()
    from main import app
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client
    _reset_optional_import_registry()


@pytest.fixture
def fake_registry_module():
    """Inject a fake integrations.providers.registry into sys.modules."""
    fake = types.ModuleType('integrations.providers.registry')
    fake.get_registry = MagicMock()
    sys.modules['integrations.providers.registry'] = fake
    yield fake
    sys.modules.pop('integrations.providers.registry', None)


@pytest.fixture
def fake_gateway_module():
    """Inject a fake integrations.providers.gateway into sys.modules."""
    fake = types.ModuleType('integrations.providers.gateway')
    fake.get_gateway = MagicMock()
    sys.modules['integrations.providers.gateway'] = fake
    yield fake
    sys.modules.pop('integrations.providers.gateway', None)


@pytest.fixture
def fake_matrix_module():
    """Inject a fake integrations.providers.efficiency_matrix into sys.modules."""
    fake = types.ModuleType('integrations.providers.efficiency_matrix')
    fake.get_matrix = MagicMock()
    sys.modules['integrations.providers.efficiency_matrix'] = fake
    yield fake
    sys.modules.pop('integrations.providers.efficiency_matrix', None)


@pytest.fixture
def fake_wamp_module():
    """Inject a fake wamp_router into sys.modules."""
    fake = types.ModuleType('wamp_router')
    fake.is_running = MagicMock(return_value=True)
    fake.publish_local = MagicMock()
    fake.get_stats = MagicMock()
    fake.get_wamp_ticket = MagicMock()
    sys.modules['wamp_router'] = fake
    yield fake
    sys.modules.pop('wamp_router', None)


# A minimal provider-stub shape matching registry.get() return values.
@dataclass
class _FakeProvider:
    id: str
    name: str = 'Fake'
    provider_type: str = 'api'
    url: str = 'https://fake.example'
    categories: list = None
    tags: list = None
    models: list = None
    enabled: bool = True
    healthy: bool = True
    commission_pct: float = 0.0
    commission_type: str = 'none'
    avg_latency_ms: float = 10.0
    env_key: str = 'FAKE_KEY'
    api_key_set: bool = False

    def __post_init__(self):
        self.categories = self.categories or []
        self.tags = self.tags or []
        self.models = self.models or []

    def has_api_key(self):
        return self.api_key_set

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name,
            'provider_type': self.provider_type,
        }


# ────────────────────────────────────────────────────────────────────────
# _providers_registry / _providers_gateway / _providers_matrix / _wamp_mod
# ────────────────────────────────────────────────────────────────────────

class TestHelperResolvers:
    """Direct tests of the 4 optional-import helper functions."""

    def test_providers_registry_returns_mod_when_importable(self, fake_registry_module):
        from main import _providers_registry
        mod, err = _providers_registry()
        assert err is None
        assert mod is fake_registry_module

    def test_providers_registry_returns_503_when_missing(self):
        # Ensure the module is NOT in sys.modules so optional_import
        # truly fails; also clear its _LOADED cache.
        sys.modules.pop('integrations.providers.registry', None)
        _reset_optional_import_registry()
        with patch('importlib.import_module', side_effect=ImportError('forced')):
            from main import _providers_registry
            mod, err = _providers_registry()
        assert mod is None
        resp, status = err
        assert status == 503
        body = resp.get_json()
        assert body['error'] == 'Provider gateway not available'

    def test_providers_gateway_returns_mod_when_importable(self, fake_gateway_module):
        from main import _providers_gateway
        mod, err = _providers_gateway()
        assert err is None
        assert mod is fake_gateway_module

    def test_providers_matrix_returns_mod_when_importable(self, fake_matrix_module):
        from main import _providers_matrix
        mod, err = _providers_matrix()
        assert err is None
        assert mod is fake_matrix_module

    def test_providers_matrix_503_uses_efficiency_matrix_message(self):
        sys.modules.pop('integrations.providers.efficiency_matrix', None)
        _reset_optional_import_registry()
        with patch('importlib.import_module', side_effect=ImportError('forced')):
            from main import _providers_matrix
            mod, err = _providers_matrix()
        assert mod is None
        resp, status = err
        assert status == 503
        assert resp.get_json()['error'] == 'Efficiency matrix not available'

    def test_wamp_mod_returns_mod_when_importable(self, fake_wamp_module):
        from main import _wamp_mod
        mod, err = _wamp_mod()
        assert err is None
        assert mod is fake_wamp_module

    def test_wamp_mod_503_message(self):
        sys.modules.pop('wamp_router', None)
        _reset_optional_import_registry()
        with patch('importlib.import_module', side_effect=ImportError('forced')):
            from main import _wamp_mod
            mod, err = _wamp_mod()
        assert mod is None
        resp, status = err
        assert status == 503
        assert resp.get_json()['error'] == 'WAMP router not available'


# ────────────────────────────────────────────────────────────────────────
# /api/admin/providers — list + get + CRUD
# ────────────────────────────────────────────────────────────────────────

class TestAdminProvidersList:
    def test_list_returns_providers(self, app_client, fake_registry_module):
        reg = MagicMock()
        reg.list_all.return_value = [_FakeProvider(id='p1'), _FakeProvider(id='p2')]
        fake_registry_module.get_registry.return_value = reg
        resp = app_client.get('/api/admin/providers')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert len(body['providers']) == 2
        assert body['providers'][0]['id'] == 'p1'

    def test_list_filters_by_category(self, app_client, fake_registry_module):
        reg = MagicMock()
        reg.list_all.return_value = [
            _FakeProvider(id='p1', categories=['vision']),
            _FakeProvider(id='p2', categories=['text']),
        ]
        fake_registry_module.get_registry.return_value = reg
        resp = app_client.get('/api/admin/providers?category=vision')
        body = resp.get_json()
        assert [p['id'] for p in body['providers']] == ['p1']

    def test_list_filters_by_type(self, app_client, fake_registry_module):
        reg = MagicMock()
        reg.list_all.return_value = [
            _FakeProvider(id='p1', provider_type='api'),
            _FakeProvider(id='p2', provider_type='affiliate'),
        ]
        fake_registry_module.get_registry.return_value = reg
        resp = app_client.get('/api/admin/providers?type=affiliate')
        assert [p['id'] for p in resp.get_json()['providers']] == ['p2']

    def test_list_503_when_registry_unavailable(self, app_client):
        sys.modules.pop('integrations.providers.registry', None)
        _reset_optional_import_registry()
        with patch('importlib.import_module', side_effect=ImportError('no mod')):
            resp = app_client.get('/api/admin/providers')
        assert resp.status_code == 503
        assert resp.get_json()['error'] == 'Provider gateway not available'


class TestAdminProvidersGet:
    def test_get_existing(self, app_client, fake_registry_module):
        reg = MagicMock()
        p = _FakeProvider(id='openai')
        reg.get.return_value = p
        fake_registry_module.get_registry.return_value = reg
        resp = app_client.get('/api/admin/providers/openai')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert body['provider']['id'] == 'openai'

    def test_get_missing_returns_404(self, app_client, fake_registry_module):
        reg = MagicMock()
        reg.get.return_value = None
        fake_registry_module.get_registry.return_value = reg
        resp = app_client.get('/api/admin/providers/does-not-exist')
        assert resp.status_code == 404
        assert resp.get_json()['error'] == 'Provider not found'


class TestAdminProvidersApiKey:
    def test_set_api_key_success(self, app_client, fake_registry_module):
        reg = MagicMock()
        reg.set_api_key.return_value = True
        fake_registry_module.get_registry.return_value = reg
        resp = app_client.post(
            '/api/admin/providers/openai/api-key',
            json={'api_key': 'sk-test'},
        )
        assert resp.status_code == 200
        assert resp.get_json()['success'] is True
        reg.set_api_key.assert_called_once_with('openai', 'sk-test')

    def test_set_api_key_missing_body_400(self, app_client, fake_registry_module):
        fake_registry_module.get_registry.return_value = MagicMock()
        resp = app_client.post(
            '/api/admin/providers/openai/api-key',
            json={},
        )
        assert resp.status_code == 400
        assert resp.get_json()['error'] == 'api_key required'

    def test_set_api_key_unknown_provider_404(self, app_client, fake_registry_module):
        reg = MagicMock()
        reg.set_api_key.return_value = False
        fake_registry_module.get_registry.return_value = reg
        resp = app_client.post(
            '/api/admin/providers/unknown/api-key',
            json={'api_key': 'sk-test'},
        )
        assert resp.status_code == 404

    def test_remove_api_key(self, app_client, fake_registry_module, monkeypatch):
        reg = MagicMock()
        p = _FakeProvider(id='openai', env_key='OPENAI_API_KEY', api_key_set=True)
        reg.get.return_value = p
        fake_registry_module.get_registry.return_value = reg
        monkeypatch.setenv('OPENAI_API_KEY', 'sk-existing')
        resp = app_client.delete('/api/admin/providers/openai/api-key')
        assert resp.status_code == 200
        assert 'OPENAI_API_KEY' not in os.environ
        reg.save.assert_called_once()

    def test_remove_api_key_unknown_provider_404(self, app_client, fake_registry_module):
        reg = MagicMock()
        reg.get.return_value = None
        fake_registry_module.get_registry.return_value = reg
        resp = app_client.delete('/api/admin/providers/unknown/api-key')
        assert resp.status_code == 404


class TestAdminProvidersTestConnection:
    def test_test_provider_success(self, app_client, fake_gateway_module):
        gw = MagicMock()
        result = MagicMock()
        result.success = True
        result.content = 'hello'
        result.latency_ms = 123.4
        result.cost_usd = 0.0001
        result.error = None
        gw.generate.return_value = result
        fake_gateway_module.get_gateway.return_value = gw
        resp = app_client.post(
            '/api/admin/providers/openai/test',
            json={},
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert body['content'] == 'hello'
        assert body['latency_ms'] == 123.4

    def test_test_provider_generate_raises_500(self, app_client, fake_gateway_module):
        gw = MagicMock()
        gw.generate.side_effect = RuntimeError('backend exploded')
        fake_gateway_module.get_gateway.return_value = gw
        resp = app_client.post('/api/admin/providers/openai/test', json={})
        assert resp.status_code == 500
        assert resp.get_json()['success'] is False


class TestAdminProvidersEnable:
    def test_enable_provider(self, app_client, fake_registry_module):
        reg = MagicMock()
        p = _FakeProvider(id='anthropic', enabled=False)
        reg.get.return_value = p
        fake_registry_module.get_registry.return_value = reg
        resp = app_client.post(
            '/api/admin/providers/anthropic/enable',
            json={'enabled': True},
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert body['enabled'] is True
        assert p.enabled is True
        reg.save.assert_called_once()

    def test_enable_unknown_provider_404(self, app_client, fake_registry_module):
        reg = MagicMock()
        reg.get.return_value = None
        fake_registry_module.get_registry.return_value = reg
        resp = app_client.post(
            '/api/admin/providers/unknown/enable',
            json={'enabled': True},
        )
        assert resp.status_code == 404


class TestAdminProvidersStatsAndLeaderboard:
    def test_gateway_stats(self, app_client, fake_gateway_module):
        gw = MagicMock()
        gw.get_stats.return_value = {'total_cost': 1.23, 'requests': 42}
        fake_gateway_module.get_gateway.return_value = gw
        resp = app_client.get('/api/admin/providers/gateway/stats')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert body['total_cost'] == 1.23
        assert body['requests'] == 42

    def test_leaderboard(self, app_client, fake_matrix_module):
        matrix = MagicMock()

        @dataclass
        class _Entry:
            provider: str = 'openai'
            model: str = 'gpt-4'
            quality: float = 0.9
            speed: float = 0.7
            cost: float = 0.01
            efficiency: float = 0.8
        matrix.get_leaderboard.return_value = [_Entry(), _Entry(provider='anthropic')]
        matrix.get_matrix_summary.return_value = {'total_models': 2}
        fake_matrix_module.get_matrix.return_value = matrix
        resp = app_client.get('/api/admin/providers/efficiency/leaderboard')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert len(body['leaderboard']) == 2
        assert body['summary']['total_models'] == 2


class TestAdminProvidersCapabilities:
    def test_capabilities_returns_registry_summary(self, app_client, fake_registry_module):
        reg = MagicMock()
        reg.get_capabilities_summary.return_value = {'llm': 2, 'image': 1}
        fake_registry_module.get_registry.return_value = reg
        resp = app_client.get('/api/admin/providers/capabilities')
        assert resp.status_code == 200
        body = resp.get_json()
        assert body['success'] is True
        assert body['capabilities']['llm'] == 2


# ────────────────────────────────────────────────────────────────────────
# /api/wamp/* + /crossbar HTTP bridge
# ────────────────────────────────────────────────────────────────────────

class TestWampEndpoints:
    def test_status_returns_stats(self, app_client, fake_wamp_module):
        fake_wamp_module.get_stats.return_value = {'running': True, 'subscribers': 3}
        resp = app_client.get('/api/wamp/status')
        # local test-client remote_addr = 127.0.0.1, local-or-token gate passes
        assert resp.status_code == 200
        assert resp.get_json() == {'running': True, 'subscribers': 3}

    def test_status_module_missing_preserves_response_shape(self, app_client):
        sys.modules.pop('wamp_router', None)
        _reset_optional_import_registry()
        with patch('importlib.import_module', side_effect=ImportError('no mod')):
            resp = app_client.get('/api/wamp/status')
        assert resp.status_code == 503
        body = resp.get_json()
        assert body['running'] is False
        assert 'module not available' in body['error']

    def test_ticket_returns_token(self, app_client, fake_wamp_module):
        fake_wamp_module.get_wamp_ticket.return_value = 'sekret'
        resp = app_client.get('/api/wamp/ticket')
        assert resp.status_code == 200
        assert resp.get_json() == {'ticket': 'sekret'}

    def test_ticket_module_missing_returns_empty_ticket(self, app_client):
        # Ticket endpoint's contract is {ticket: ''} on unavailability —
        # frontend falls back to LAN mode w/o auth.
        sys.modules.pop('wamp_router', None)
        _reset_optional_import_registry()
        with patch('importlib.import_module', side_effect=ImportError('no mod')):
            resp = app_client.get('/api/wamp/ticket')
        assert resp.status_code == 200
        assert resp.get_json() == {'ticket': ''}


class TestCrossbarHttpBridge:
    """The /crossbar HTTP → WAMP publish bridge used by legacy clients."""

    def test_publish_topic_forwards_to_wamp(self, app_client, fake_wamp_module):
        fake_wamp_module.is_running.return_value = True
        resp = app_client.post(
            '/crossbar',
            json={'topic': 'com.hertzai.test', 'args': [1, 2], 'kwargs': {'k': 'v'}},
        )
        assert resp.status_code == 200
        body = resp.get_json()
        assert body == {'id': None}
        fake_wamp_module.publish_local.assert_called_once_with(
            'com.hertzai.test', [1, 2], {'k': 'v'})

    def test_publish_not_running_returns_503(self, app_client, fake_wamp_module):
        fake_wamp_module.is_running.return_value = False
        resp = app_client.post(
            '/crossbar',
            json={'topic': 'com.hertzai.test'},
        )
        assert resp.status_code == 503
        assert resp.get_json()['error'] == 'WAMP router not running'

    def test_publish_missing_topic_400(self, app_client, fake_wamp_module):
        fake_wamp_module.is_running.return_value = True
        resp = app_client.post('/crossbar', json={'args': [1]})
        assert resp.status_code == 400
        assert resp.get_json()['error'] == 'Missing topic'

    def test_publish_unwraps_crossbarhttp3_string_args(self, app_client, fake_wamp_module):
        # crossbarhttp3 serializes args as a single JSON string; the
        # bridge unwraps it so subscribers see the original structure.
        fake_wamp_module.is_running.return_value = True
        resp = app_client.post(
            '/crossbar',
            json={'topic': 'com.hertzai.test', 'args': _flask_json.dumps({'wrapped': True})},
        )
        assert resp.status_code == 200
        args_called = fake_wamp_module.publish_local.call_args[0][1]
        assert args_called == [{'wrapped': True}]

    def test_publish_module_missing_returns_503(self, app_client):
        sys.modules.pop('wamp_router', None)
        _reset_optional_import_registry()
        with patch('importlib.import_module', side_effect=ImportError('no mod')):
            resp = app_client.post('/crossbar', json={'topic': 'x'})
        assert resp.status_code == 503
        assert resp.get_json()['error'] == 'WAMP router not available'
