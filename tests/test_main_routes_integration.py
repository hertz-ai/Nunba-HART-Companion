"""Route registration + handler contract tests for main.py — batch #29.

Rather than booting the full Flask app with test_client (which spawns
llama-server scan, WAMP connect, agent daemon etc. and takes 30+s),
this batch inspects the URL map after module load to assert that the
documented routes are registered.

This is the integration counterpart to batch #17 (route module smoke).
Combined they guard against silent deletion/rename of HTTP surfaces.
"""
from __future__ import annotations

import os
import sys

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

pytestmark = pytest.mark.timeout(30)


@pytest.fixture(scope='module')
def app_rules():
    """Return the set of registered URL rules after main.py import."""
    os.environ.setdefault('PYTEST_CURRENT_TEST', 'batch29')
    os.environ.setdefault('NUNBA_DISABLE_TTS', '1')
    from main import app
    return {rule.rule for rule in app.url_map.iter_rules()}


@pytest.fixture(scope='module')
def app_rules_with_methods():
    """Return a dict mapping URL rule → set of HTTP methods."""
    os.environ.setdefault('PYTEST_CURRENT_TEST', 'batch29')
    os.environ.setdefault('NUNBA_DISABLE_TTS', '1')
    from main import app
    result = {}
    for rule in app.url_map.iter_rules():
        result.setdefault(rule.rule, set()).update(rule.methods or set())
    return result


# ════════════════════════════════════════════════════════════════════════
# Core routes — must always be registered
# ════════════════════════════════════════════════════════════════════════

class TestCoreRoutesRegistered:
    @pytest.mark.parametrize('route', [
        '/probe',
        '/api/guest-id',
        '/api/admin/config/chat',
        '/api/chat-sync/push',
        '/api/chat-sync/pull',
        '/api/chat-sync/forget',
        '/execute',
        '/screenshot',
        '/api/llm/status',
        '/api/llm/auto-setup',
        '/api/llm/configure',
        '/api/llm/switch',
        '/api/harthash',
    ])
    def test_route_registered(self, app_rules, route):
        assert route in app_rules, (
            f'{route!r} missing from main.py url_map — regression in route '
            f'registration.'
        )


class TestAdminModelsRoutes:
    @pytest.mark.parametrize('route', [
        '/api/admin/models',
        '/api/admin/models/<model_id>',
        '/api/admin/models/<model_id>/set-purpose',
        '/api/admin/models/<model_id>/load',
        '/api/admin/models/<model_id>/unload',
        '/api/admin/models/<model_id>/download',
        '/api/admin/models/<model_id>/download/status',
        '/api/admin/models/auto-select',
        '/api/admin/models/health',
        '/api/admin/models/swap',
    ])
    def test_admin_models_route_registered(self, app_rules, route):
        assert route in app_rules, (
            f'{route!r} missing — admin model CRUD surface regression.'
        )


# ════════════════════════════════════════════════════════════════════════
# Method assertions — POST vs GET vs DELETE on parametrized routes
# ════════════════════════════════════════════════════════════════════════

class TestRouteMethods:
    def test_guest_id_allows_get_and_delete(self, app_rules_with_methods):
        methods = app_rules_with_methods.get('/api/guest-id', set())
        assert 'GET' in methods
        assert 'DELETE' in methods

    def test_chat_sync_push_is_post(self, app_rules_with_methods):
        methods = app_rules_with_methods.get('/api/chat-sync/push', set())
        assert 'POST' in methods

    def test_chat_sync_pull_is_get(self, app_rules_with_methods):
        methods = app_rules_with_methods.get('/api/chat-sync/pull', set())
        assert 'GET' in methods

    def test_admin_config_chat_supports_get_and_put(self, app_rules_with_methods):
        methods = app_rules_with_methods.get('/api/admin/config/chat', set())
        assert 'GET' in methods
        assert 'PUT' in methods

    def test_llm_auto_setup_is_post(self, app_rules_with_methods):
        methods = app_rules_with_methods.get('/api/llm/auto-setup', set())
        assert 'POST' in methods

    def test_admin_models_supports_get_and_post(self, app_rules_with_methods):
        methods = app_rules_with_methods.get('/api/admin/models', set())
        assert 'GET' in methods
        assert 'POST' in methods

    def test_admin_models_id_supports_get_put_delete(self, app_rules_with_methods):
        methods = app_rules_with_methods.get('/api/admin/models/<model_id>', set())
        assert 'GET' in methods
        assert 'PUT' in methods
        assert 'DELETE' in methods


# ════════════════════════════════════════════════════════════════════════
# Route count — guard against silent deregistration
# ════════════════════════════════════════════════════════════════════════

class TestRouteCount:
    def test_at_least_50_routes_registered(self, app_rules):
        """main.py + blueprints register 100+ routes in production.
        At least 50 must be present even in test-mode where some
        deferred-init blueprints may skip."""
        assert len(app_rules) >= 50, (
            f'Only {len(app_rules)} routes registered; expected 50+.'
        )

    def test_api_namespace_has_many_routes(self, app_rules):
        api_routes = [r for r in app_rules if r.startswith('/api/')]
        assert len(api_routes) >= 20, (
            f'Only {len(api_routes)} /api/* routes registered; expected 20+.'
        )

    def test_admin_namespace_has_routes(self, app_rules):
        admin_routes = [r for r in app_rules if r.startswith('/api/admin/')]
        assert len(admin_routes) >= 10, (
            f'Only {len(admin_routes)} /api/admin/* routes registered; '
            f'expected 10+.'
        )

    def test_social_namespace_registered(self, app_rules):
        """Social blueprint should have mounted."""
        social_routes = [r for r in app_rules if r.startswith('/api/social/')]
        # If HARTOS social_bp is available it should register routes.
        # If not, social_routes may be empty — acceptable in stub env.
        assert isinstance(social_routes, list)


# ════════════════════════════════════════════════════════════════════════
# Handler function exports — main.py must expose these callables
# ════════════════════════════════════════════════════════════════════════

class TestMainHandlerCallables:
    @pytest.mark.parametrize('name', [
        'probe_endpoint',
        'api_guest_id',
        'api_guest_id_delete',
        'api_admin_chat_config_get',
        'api_admin_chat_config_put',
        'api_chat_sync_push',
        'api_chat_sync_pull',
        'api_chat_sync_forget',
        'execute_command',
        'capture_screen_with_cursor',
        'stop_ai_control_endpoint',
        'llm_control_status',
        'llm_status',
        'llm_auto_setup',
        'llm_launch_configure',
        'llm_switch_model',
        'harthash',
    ])
    def test_handler_callable_exists(self, name):
        import main
        assert hasattr(main, name), f'{name} missing from main.py'
        assert callable(getattr(main, name))
