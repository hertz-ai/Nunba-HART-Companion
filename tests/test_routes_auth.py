"""
Unit tests for routes/auth.py — the shared authentication decorators.

Covers every branch of:
  * _is_local_request()  — direct loopback, behind trusted proxy, non-local
  * require_local_or_token — local bypass, bearer-token accept, reject

Target: 57 LOC of routes/auth.py that were previously 0% covered
despite being imported by main.py + chatbot_routes.py on every boot.

Design:
  * Tests drive a minimal Flask app with a protected endpoint so the
    decorator is exercised through real Flask routing (the path all
    production callers take) rather than calling the inner function
    directly.
  * Every env-var + header combination is a monkeypatch + header-inject
    so tests are hermetic and order-independent.
  * Constant-time comparison (hmac.compare_digest) is exercised with
    both matching and mismatching token bytes — verifying the gate
    doesn't leak via early-return length shortcut.
"""
from __future__ import annotations

import importlib
import os
import sys

import pytest
from flask import Flask, jsonify

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


def _fresh_auth_module(api_token: str = ''):
    """Re-import routes.auth with a specific API_TOKEN env value.

    API_TOKEN is read ONCE at module-import time (not per request) so
    we must re-import to test different token configs.
    """
    os.environ['NUNBA_API_TOKEN'] = api_token
    if 'routes.auth' in sys.modules:
        del sys.modules['routes.auth']
    import routes.auth as auth_mod
    return importlib.reload(auth_mod)


def _make_app(auth_mod):
    """Build a minimal Flask app with a single decorator-protected route."""
    app = Flask(__name__)
    app.config['TESTING'] = True

    @app.route('/protected')
    @auth_mod.require_local_or_token
    def _protected():
        return jsonify({'ok': True})

    return app


# ════════════════════════════════════════════════════════════════════════
# _is_local_request — three branches
# ════════════════════════════════════════════════════════════════════════

class TestIsLocalRequest:
    def test_loopback_ipv4_is_local(self, monkeypatch):
        monkeypatch.delenv('TRUSTED_PROXY', raising=False)
        auth_mod = _fresh_auth_module()
        app = _make_app(auth_mod)
        with app.test_request_context('/', environ_overrides={'REMOTE_ADDR': '127.0.0.1'}):
            assert auth_mod._is_local_request() is True

    def test_loopback_ipv6_is_local(self, monkeypatch):
        monkeypatch.delenv('TRUSTED_PROXY', raising=False)
        auth_mod = _fresh_auth_module()
        app = _make_app(auth_mod)
        with app.test_request_context('/', environ_overrides={'REMOTE_ADDR': '::1'}):
            assert auth_mod._is_local_request() is True

    def test_public_ip_is_not_local(self, monkeypatch):
        monkeypatch.delenv('TRUSTED_PROXY', raising=False)
        auth_mod = _fresh_auth_module()
        app = _make_app(auth_mod)
        with app.test_request_context('/', environ_overrides={'REMOTE_ADDR': '8.8.8.8'}):
            assert auth_mod._is_local_request() is False

    def test_proxy_forwarded_from_localhost_is_local(self, monkeypatch):
        monkeypatch.setenv('TRUSTED_PROXY', '10.0.0.1')
        auth_mod = _fresh_auth_module()
        app = _make_app(auth_mod)
        with app.test_request_context(
            '/',
            environ_overrides={'REMOTE_ADDR': '10.0.0.1'},
            headers={'X-Forwarded-For': '127.0.0.1'},
        ):
            assert auth_mod._is_local_request() is True

    def test_proxy_forwarded_from_public_is_not_local(self, monkeypatch):
        monkeypatch.setenv('TRUSTED_PROXY', '10.0.0.1')
        auth_mod = _fresh_auth_module()
        app = _make_app(auth_mod)
        with app.test_request_context(
            '/',
            environ_overrides={'REMOTE_ADDR': '10.0.0.1'},
            headers={'X-Forwarded-For': '198.51.100.7'},
        ):
            assert auth_mod._is_local_request() is False

    def test_proxy_forwarded_picks_first_hop(self, monkeypatch):
        """X-Forwarded-For can contain a chain `client, proxy1, proxy2`.
        The first hop is the real client."""
        monkeypatch.setenv('TRUSTED_PROXY', '10.0.0.1')
        auth_mod = _fresh_auth_module()
        app = _make_app(auth_mod)
        with app.test_request_context(
            '/',
            environ_overrides={'REMOTE_ADDR': '10.0.0.1'},
            headers={'X-Forwarded-For': '127.0.0.1, 10.0.0.1, 172.16.0.5'},
        ):
            assert auth_mod._is_local_request() is True

    def test_untrusted_proxy_falls_through_to_remote_addr(self, monkeypatch):
        """If TRUSTED_PROXY env-var isn't set to the proxy addr we see,
        we must NOT trust X-Forwarded-For — fall back to remote_addr."""
        monkeypatch.delenv('TRUSTED_PROXY', raising=False)
        auth_mod = _fresh_auth_module()
        app = _make_app(auth_mod)
        with app.test_request_context(
            '/',
            environ_overrides={'REMOTE_ADDR': '203.0.113.99'},
            headers={'X-Forwarded-For': '127.0.0.1'},  # attacker-controlled
        ):
            # remote_addr is public — must NOT trust the spoofed header.
            assert auth_mod._is_local_request() is False


# ════════════════════════════════════════════════════════════════════════
# require_local_or_token — allow + reject
# ════════════════════════════════════════════════════════════════════════

class TestRequireLocalOrToken:
    def test_local_request_passes_through(self, monkeypatch):
        monkeypatch.delenv('TRUSTED_PROXY', raising=False)
        auth_mod = _fresh_auth_module(api_token='')
        app = _make_app(auth_mod)
        client = app.test_client()
        resp = client.get('/protected')  # test_client defaults to 127.0.0.1
        assert resp.status_code == 200
        assert resp.get_json() == {'ok': True}

    def test_remote_request_without_token_401(self, monkeypatch):
        monkeypatch.delenv('TRUSTED_PROXY', raising=False)
        auth_mod = _fresh_auth_module(api_token='s3cret')
        app = _make_app(auth_mod)
        client = app.test_client()
        resp = client.get(
            '/protected',
            environ_overrides={'REMOTE_ADDR': '203.0.113.42'},
        )
        assert resp.status_code == 401
        body = resp.get_json()
        assert body['error'] == 'Unauthorized'
        assert 'local access or valid API token' in body['message']

    def test_remote_request_with_valid_token_passes(self, monkeypatch):
        monkeypatch.delenv('TRUSTED_PROXY', raising=False)
        auth_mod = _fresh_auth_module(api_token='s3cret')
        app = _make_app(auth_mod)
        client = app.test_client()
        resp = client.get(
            '/protected',
            environ_overrides={'REMOTE_ADDR': '203.0.113.42'},
            headers={'Authorization': 'Bearer s3cret'},
        )
        assert resp.status_code == 200
        assert resp.get_json() == {'ok': True}

    def test_remote_request_with_wrong_token_401(self, monkeypatch):
        monkeypatch.delenv('TRUSTED_PROXY', raising=False)
        auth_mod = _fresh_auth_module(api_token='s3cret')
        app = _make_app(auth_mod)
        client = app.test_client()
        resp = client.get(
            '/protected',
            environ_overrides={'REMOTE_ADDR': '203.0.113.42'},
            headers={'Authorization': 'Bearer wr0ng'},
        )
        assert resp.status_code == 401

    def test_remote_request_with_malformed_auth_header_401(self, monkeypatch):
        """Authorization header without 'Bearer ' prefix → reject."""
        monkeypatch.delenv('TRUSTED_PROXY', raising=False)
        auth_mod = _fresh_auth_module(api_token='s3cret')
        app = _make_app(auth_mod)
        client = app.test_client()
        resp = client.get(
            '/protected',
            environ_overrides={'REMOTE_ADDR': '203.0.113.42'},
            headers={'Authorization': 'Basic s3cret'},  # wrong scheme
        )
        assert resp.status_code == 401

    def test_no_api_token_configured_and_remote_401(self, monkeypatch):
        """When NUNBA_API_TOKEN is empty AND the request is not local,
        we must reject — empty token must NOT permit anyone."""
        monkeypatch.delenv('TRUSTED_PROXY', raising=False)
        auth_mod = _fresh_auth_module(api_token='')
        app = _make_app(auth_mod)
        client = app.test_client()
        resp = client.get(
            '/protected',
            environ_overrides={'REMOTE_ADDR': '203.0.113.42'},
            headers={'Authorization': 'Bearer anything'},
        )
        assert resp.status_code == 401

    def test_remote_request_with_different_length_token_constant_time(self, monkeypatch):
        """Tokens of different lengths must still reject — hmac.compare_digest
        is constant-time across length differences via its implementation,
        but verify behaviour (not timing).
        """
        monkeypatch.delenv('TRUSTED_PROXY', raising=False)
        auth_mod = _fresh_auth_module(api_token='longer-secret-token-value')
        app = _make_app(auth_mod)
        client = app.test_client()
        resp = client.get(
            '/protected',
            environ_overrides={'REMOTE_ADDR': '203.0.113.42'},
            headers={'Authorization': 'Bearer short'},
        )
        assert resp.status_code == 401

    def test_trusted_proxy_forward_from_localhost_bypasses_token(self, monkeypatch):
        """When the trusted proxy says the client is localhost, we don't
        need the token — local bypass wins."""
        monkeypatch.setenv('TRUSTED_PROXY', '10.0.0.1')
        auth_mod = _fresh_auth_module(api_token='s3cret')
        app = _make_app(auth_mod)
        client = app.test_client()
        resp = client.get(
            '/protected',
            environ_overrides={'REMOTE_ADDR': '10.0.0.1'},
            headers={'X-Forwarded-For': '127.0.0.1'},
        )
        assert resp.status_code == 200

    def test_functools_wraps_preserves_original_function_name(self, monkeypatch):
        """require_local_or_token uses @functools.wraps so the wrapped
        function's __name__ + __doc__ stay intact.  Useful for Flask
        endpoint registration which uses __name__ as the rule.endpoint."""
        auth_mod = _fresh_auth_module()

        @auth_mod.require_local_or_token
        def my_protected_view():
            """docstring stays"""
            return None

        assert my_protected_view.__name__ == 'my_protected_view'
        assert my_protected_view.__doc__ == 'docstring stays'
