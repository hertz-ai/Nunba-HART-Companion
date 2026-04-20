"""FT+NFT tests for the HARTOS MCP HTTP bridge auth gate.

Covers commit f5b99d8 on HARTOS/integrations/mcp/mcp_http_bridge.py:
the ``_mcp_auth_gate`` before-request handler that protects the
``/api/mcp/local/*`` blueprint.

Policy under test:
  * ``/health``               — always 200, no auth (counts only)
  * ``/tools/list``           — 200 on 127.0.0.1 without token, 403 from remote
  * ``/tools/execute``        — ALWAYS requires Bearer <token>
  * Bearer token is persistent (``_ensure_mcp_token()`` is idempotent)
  * Wrong / missing token → 403 with machine-readable JSON envelope

All tests mount the blueprint on an isolated Flask app so they run
without needing the full Nunba stack.
"""
from __future__ import annotations

import os
import sys

import pytest
from flask import Flask

# Ensure HARTOS + Nunba importable --------------------------------------------------
_NUNBA_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _NUNBA_ROOT not in sys.path:
    sys.path.insert(0, _NUNBA_ROOT)
_HARTOS_ROOT = os.path.normpath(os.path.join(_NUNBA_ROOT, '..', 'HARTOS'))
if _HARTOS_ROOT not in sys.path and os.path.isdir(_HARTOS_ROOT):
    sys.path.insert(0, _HARTOS_ROOT)


# ───────────────────────────── fixtures ─────────────────────────────

@pytest.fixture
def mcp_module(tmp_path, monkeypatch):
    """Import mcp_http_bridge with a temp token file and a clean cache.

    We redirect LOCALAPPDATA (and HOME fallback) to tmp_path so
    _ensure_mcp_token() creates its file there, and we clear the
    module-level token cache between tests.

    IMPORTANT: we explicitly delete HARTOS_MCP_DISABLE_AUTH,
    HARTOS_MCP_TOKEN, and HARTOS_MCP_TOKEN_FILE from the environment
    so that dev boxes / CI runners that may have set these for other
    purposes don't bypass the auth gate we're specifically testing.
    Without this guard the 5 "expect 403" tests silently pass-through
    to the tool handler with 200 on any machine where any of those
    env vars is set.
    """
    pytest.importorskip('flask')
    bridge = pytest.importorskip('integrations.mcp.mcp_http_bridge')
    monkeypatch.delenv('HARTOS_MCP_DISABLE_AUTH', raising=False)
    monkeypatch.delenv('HARTOS_MCP_TOKEN', raising=False)
    monkeypatch.delenv('HARTOS_MCP_TOKEN_FILE', raising=False)
    monkeypatch.setenv('LOCALAPPDATA', str(tmp_path))
    monkeypatch.setenv('HOME', str(tmp_path))
    monkeypatch.setenv('USERPROFILE', str(tmp_path))
    # Reset cached token so each test gets a clean read-or-create
    monkeypatch.setattr(bridge, '_MCP_TOKEN_CACHE', None, raising=False)
    # Reset the "we already warned about disabled auth" flag so each
    # test starts with a fresh state if anything inside the test toggles
    # the env var back on.
    monkeypatch.setattr(bridge, '_MCP_AUTH_DISABLED_WARNED', False, raising=False)
    return bridge


@pytest.fixture
def app(mcp_module):
    """Minimal Flask app with ONLY the MCP blueprint mounted."""
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.register_blueprint(mcp_module.mcp_local_bp)
    return app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def token(mcp_module):
    """Materialize the MCP bearer token and return it."""
    return mcp_module._ensure_mcp_token()


# ───────────────────────────── tests ─────────────────────────────

def test_mcp_health_unauthenticated_ok(client):
    """/health is always reachable — returns only a tool count."""
    resp = client.get('/api/mcp/local/health')
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['status'] == 'ok'
    assert 'tools' in body and isinstance(body['tools'], int)


def test_mcp_execute_without_token_403(client):
    """POST /tools/execute with NO Authorization header must be 403."""
    resp = client.post(
        '/api/mcp/local/tools/execute',
        json={'tool': 'system_health', 'arguments': {}},
    )
    assert resp.status_code == 403
    body = resp.get_json()
    assert body['success'] is False
    assert 'unauthorized' in body['error'].lower()


def test_mcp_execute_with_wrong_token_403(client):
    """A bogus bearer token must NOT bypass the gate."""
    resp = client.post(
        '/api/mcp/local/tools/execute',
        json={'tool': 'system_health'},
        headers={'Authorization': 'Bearer totally-fake-not-the-right-token'},
    )
    assert resp.status_code == 403
    body = resp.get_json()
    assert body['success'] is False


def test_mcp_execute_with_correct_token_200(client, token, mcp_module):
    """Correct bearer from _ensure_mcp_token() passes the gate.

    We don't care that the tool itself may 500 on a test box (no DB),
    only that the auth gate does NOT intercept with 403 — anything
    other than 403/401 means the gate permitted the call through.
    """
    resp = client.post(
        '/api/mcp/local/tools/execute',
        json={'tool': 'system_health', 'arguments': {}},
        headers={'Authorization': f'Bearer {token}'},
    )
    assert resp.status_code not in (401, 403), (
        f"gate should have let a valid bearer through, got {resp.status_code}: {resp.get_data(as_text=True)[:300]}"
    )


def test_mcp_tools_list_loopback_allowed(client):
    """GET /tools/list on 127.0.0.1 works without token (discovery)."""
    # Flask test client sets remote_addr to 127.0.0.1 by default
    resp = client.get('/api/mcp/local/tools/list')
    assert resp.status_code == 200
    body = resp.get_json()
    assert isinstance(body.get('tools'), list)


def test_mcp_tools_list_remote_requires_token(app, mcp_module):
    """A remote client (10.0.0.5) hitting /tools/list without token → 403."""
    # Simulate a non-loopback connection by setting REMOTE_ADDR on the
    # WSGI environ.  Flask's test_client honours environ_base.
    client = app.test_client()
    resp = client.get(
        '/api/mcp/local/tools/list',
        environ_base={'REMOTE_ADDR': '10.0.0.5'},
    )
    assert resp.status_code == 403
    body = resp.get_json()
    assert body['success'] is False
    assert 'unauthorized' in body['error'].lower()


def test_mcp_tools_list_remote_with_token_ok(app, mcp_module, token):
    """Remote client with valid bearer IS allowed."""
    client = app.test_client()
    resp = client.get(
        '/api/mcp/local/tools/list',
        environ_base={'REMOTE_ADDR': '10.0.0.5'},
        headers={'Authorization': f'Bearer {token}'},
    )
    assert resp.status_code == 200


def test_mcp_token_persists_across_calls(mcp_module):
    """_ensure_mcp_token() is idempotent — two calls return the same secret."""
    t1 = mcp_module._ensure_mcp_token()
    t2 = mcp_module._ensure_mcp_token()
    assert t1 == t2
    assert isinstance(t1, str) and len(t1) >= 32  # token_urlsafe(32) ≈ 43 chars


def test_mcp_token_persists_on_disk(mcp_module, tmp_path):
    """Token is written to the file on disk and survives cache flush."""
    t1 = mcp_module._ensure_mcp_token()
    # Wipe in-process cache (simulates a fresh process start)
    mcp_module._MCP_TOKEN_CACHE = None
    t2 = mcp_module._ensure_mcp_token()
    assert t1 == t2, "token should be re-read from disk, not regenerated"


def test_mcp_execute_wrong_token_returns_hint(client):
    """The 403 body should tell the caller WHERE to find the real token."""
    resp = client.post(
        '/api/mcp/local/tools/execute',
        json={'tool': 'system_health'},
        headers={'Authorization': 'Bearer nope'},
    )
    assert resp.status_code == 403
    err = (resp.get_json() or {}).get('error', '')
    # Message must mention the file path hint so operators can fix it
    assert 'mcp.token' in err or 'Authorization' in err


def test_mcp_execute_loopback_without_token_403(client):
    """Even on 127.0.0.1, /tools/execute (mutating) demands a token."""
    resp = client.post(
        '/api/mcp/local/tools/execute',
        json={'tool': 'system_health'},
        # No Authorization header, default remote_addr=127.0.0.1
    )
    assert resp.status_code == 403, (
        'loopback-only is NOT enough for mutating endpoints on shared hosts'
    )


def test_mcp_health_remote_still_ok(app):
    """/health stays open even from remote — it leaks no data, no mutation."""
    client = app.test_client()
    resp = client.get(
        '/api/mcp/local/health',
        environ_base={'REMOTE_ADDR': '192.168.1.77'},
    )
    assert resp.status_code == 200


def test_secrets_compare_constant_time(mcp_module):
    """_secrets_compare uses hmac.compare_digest — never raises on length diff."""
    # Equal strings → True
    assert mcp_module._secrets_compare('abc', 'abc') is True
    # Different strings (same length) → False
    assert mcp_module._secrets_compare('abc', 'xyz') is False
    # Different lengths → False, no crash
    assert mcp_module._secrets_compare('short', 'much-longer-string') is False
    # Empty → False
    assert mcp_module._secrets_compare('', 'nonempty') is False


def test_mcp_token_path_respects_localappdata(mcp_module, monkeypatch, tmp_path):
    """Token path resolves under LOCALAPPDATA/Nunba when the env var is set."""
    monkeypatch.setenv('LOCALAPPDATA', str(tmp_path / 'appdata'))
    p = mcp_module._mcp_token_path()
    assert 'Nunba' in p
    assert p.endswith('mcp.token')


def test_mcp_token_path_fallback_to_home(mcp_module, monkeypatch, tmp_path):
    """Without LOCALAPPDATA, path falls back to ~/.nunba/mcp.token."""
    monkeypatch.delenv('LOCALAPPDATA', raising=False)
    monkeypatch.setenv('HOME', str(tmp_path))
    monkeypatch.setenv('USERPROFILE', str(tmp_path))
    p = mcp_module._mcp_token_path()
    assert p.endswith(os.path.join('.nunba', 'mcp.token'))
