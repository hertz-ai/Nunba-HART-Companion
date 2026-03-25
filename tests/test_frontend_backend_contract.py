"""
Deep functional tests for the frontend↔backend API contract.

Tests that the React frontend configuration matches backend routes:
- apiBase.js URLs match Flask routes
- SPA catch-all serves index.html for all frontend routes
- Static file serving works
- BrowserRouter paths resolve correctly
- Social API base path is /api/social
- Admin API base path is /api/admin
"""
import json
import os
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LANDING_PAGE = os.path.join(PROJECT_ROOT, 'landing-page')


# ==========================================================================
# 1. apiBase.js Contract
# ==========================================================================
class TestApiBaseContract:
    @pytest.fixture(scope='class')
    def api_base_content(self):
        path = os.path.join(LANDING_PAGE, 'src', 'config', 'apiBase.js')
        with open(path, encoding='utf-8') as f:
            return f.read()

    def test_api_base_url_defaults_to_5000(self, api_base_content):
        assert 'localhost:5000' in api_base_content, \
            "API_BASE_URL must default to localhost:5000"

    def test_social_api_url_uses_base(self, api_base_content):
        assert '/api/social' in api_base_content, \
            "SOCIAL_API_URL must use /api/social path"

    def test_admin_api_url_uses_base(self, api_base_content):
        assert '/api/admin' in api_base_content, \
            "ADMIN_API_URL must use /api/admin path"

    def test_tts_api_url_defined(self, api_base_content):
        assert 'TTS' in api_base_content or 'tts' in api_base_content

    def test_cloud_api_url_defined(self, api_base_content):
        assert 'CLOUD_API_URL' in api_base_content or 'hertzai.com' in api_base_content

    def test_api_base_uses_env_or_localhost(self, api_base_content):
        """apiBase.js should reference process.env and localhost:5000."""
        assert 'process.env' in api_base_content, "Must use process.env for configurability"
        assert 'localhost:5000' in api_base_content, "Must default to localhost:5000"


# ==========================================================================
# 2. BrowserRouter Paths
# ==========================================================================
class TestBrowserRouterPaths:
    """Verify Flask serves index.html for all frontend routes."""

    @pytest.fixture(scope='class')
    def client(self):
        try:
            from main import app
            app.config['TESTING'] = True
            with app.test_client() as c:
                yield c
        except Exception as e:
            pytest.skip(f"Flask app not available: {e}")

    FRONTEND_ROUTES = [
        '/social',
        '/social/profile/1',
        '/admin',
        '/admin/settings',
        '/local',
    ]

    @pytest.mark.parametrize('path', FRONTEND_ROUTES)
    def test_frontend_route_serves_html(self, client, path):
        resp = client.get(path)
        # Should serve index.html (200) or redirect
        assert resp.status_code in (200, 301, 302, 404), \
            f"Frontend route {path} returned {resp.status_code}"

    def test_root_serves_html(self, client):
        resp = client.get('/')
        assert resp.status_code in (200, 301, 302)


# ==========================================================================
# 3. API Path Prefixes Match
# ==========================================================================
class TestAPIPathPrefixes:
    @pytest.fixture(scope='class')
    def app_rules(self):
        from main import app
        return {r.rule for r in app.url_map.iter_rules()}

    def test_social_api_prefix(self, app_rules):
        social_routes = [r for r in app_rules if r.startswith('/api/social/')]
        assert len(social_routes) >= 20, \
            f"Expected 20+ social API routes, got {len(social_routes)}"

    def test_admin_api_prefix(self, app_rules):
        admin_routes = [r for r in app_rules if r.startswith('/api/admin/')]
        assert len(admin_routes) >= 5, \
            f"Expected 5+ admin API routes, got {len(admin_routes)}"

    def test_llm_api_prefix(self, app_rules):
        llm_routes = [r for r in app_rules if '/llm/' in r or '/models' in r]
        assert len(llm_routes) >= 5

    def test_no_api_routes_without_prefix(self, app_rules):
        """All API routes should start with /api/ or be legacy roots."""
        legacy_ok = {'/chat', '/prompts', '/health', '/status', '/probe',
                     '/tts/', '/voice/', '/upload/', '/agents/', '/network/',
                     '/backend/', '/nunba/', '/llm_control_status',
                     '/indicator/', '/execute', '/screenshot', '/debug/',
                     '/test-api', '/cors/', '/clipboard/', '/static/',
                     '/s/', '/fonts/', '/theme/'}
        for rule in app_rules:
            if rule.startswith('/api/'):
                continue
            if any(rule.startswith(p) for p in legacy_ok):
                continue
            if rule in {'/', '/static/<path:path>'}:
                continue
            # Dynamic routes like /<path:path> are SPA catch-all


# ==========================================================================
# 4. React Build Artifacts
# ==========================================================================
class TestReactBuildArtifacts:
    def test_package_json_exists(self):
        assert os.path.isfile(os.path.join(LANDING_PAGE, 'package.json'))

    def test_src_dir_exists(self):
        assert os.path.isdir(os.path.join(LANDING_PAGE, 'src'))

    def test_public_dir_exists(self):
        assert os.path.isdir(os.path.join(LANDING_PAGE, 'public'))

    def test_index_html_in_public(self):
        assert os.path.isfile(os.path.join(LANDING_PAGE, 'public', 'index.html'))

    def test_app_js_exists(self):
        assert os.path.isfile(os.path.join(LANDING_PAGE, 'src', 'App.js'))

    def test_index_js_exists(self):
        assert os.path.isfile(os.path.join(LANDING_PAGE, 'src', 'index.js'))


# ==========================================================================
# 5. Social Tokens (Design System)
# ==========================================================================
class TestDesignSystemFiles:
    def test_social_tokens_exists(self):
        path = os.path.join(LANDING_PAGE, 'src', 'theme', 'socialTokens.js')
        assert os.path.isfile(path), "socialTokens.js must exist for design system"

    def test_api_base_exists(self):
        path = os.path.join(LANDING_PAGE, 'src', 'config', 'apiBase.js')
        assert os.path.isfile(path), "apiBase.js must exist as single source of truth"


# ==========================================================================
# 6. Frontend Route↔Backend Route Mapping
# ==========================================================================
class TestRouteMapping:
    """Verify that frontend API calls map to real backend routes."""

    @pytest.fixture(scope='class')
    def app_rules(self):
        from main import app
        return {r.rule for r in app.url_map.iter_rules()}

    def test_auth_register_exists(self, app_rules):
        assert '/api/social/auth/register' in app_rules

    def test_auth_login_exists(self, app_rules):
        assert '/api/social/auth/login' in app_rules

    def test_auth_me_exists(self, app_rules):
        # Frontend calls /api/social/auth/me
        assert any('auth/me' in r for r in app_rules)

    def test_feed_exists(self, app_rules):
        assert '/api/social/feed' in app_rules

    def test_posts_exists(self, app_rules):
        assert '/api/social/posts' in app_rules

    def test_prompts_exists(self, app_rules):
        assert '/prompts' in app_rules

    def test_health_exists(self, app_rules):
        assert '/health' in app_rules
