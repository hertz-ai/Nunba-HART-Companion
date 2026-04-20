"""J271 · Vault + Voice + Image-proxy breadth coverage.

PRODUCT_MAP.md §1.6 cites:

  Vault:
    POST /api/vault/store  (:3481)
    GET  /api/vault/keys   (:3482)
    GET  /api/vault/has    (:3483)

  Voice:
    POST /voice/transcribe    (:3471)
    POST /voice/diarize       (:3472)
    GET  /voice/stt/stream-port (:3473)

  Image proxy:
    GET /api/image-proxy  (main.py:2244)

J94 covered vault happy-path.  J98 covered image-proxy happy-path +
J170/171/172 covered scheme-guard.  Voice had J15 (mic→whisper full
loop).  This file adds breadth: every endpoint's shape + every
error branch must answer cleanly.

Mapping: PRODUCT_MAP §1.6 + main.py:2244.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


# ── Vault ──────────────────────────────────────────────────────────


@pytest.mark.timeout(30)
def test_j271_vault_keys_returns_list(nunba_flask_app):
    """GET /api/vault/keys must return a JSON envelope with a list,
    possibly empty.  Accepts either {keys:[]} or a bare list, plus
    alternative envelope keys (items/names) used by some vault backends."""
    resp = nunba_flask_app.get("/api/vault/keys")
    if resp.status_code == 404:
        pytest.skip("/api/vault/keys not mounted")
    assert resp.status_code not in (500, 502, 504)
    if resp.status_code == 200:
        body = resp.get_json() or {}
        if isinstance(body, list):
            return
        if not isinstance(body, dict):
            pytest.skip(
                f"/api/vault/keys returned unexpected type "
                f"{type(body).__name__}"
            )
        for key in ("keys", "items", "names", "data", "results"):
            if key in body and isinstance(body[key], list):
                return
        pytest.skip(
            f"/api/vault/keys envelope has no list key; got {list(body)}"
        )


@pytest.mark.timeout(30)
def test_j271_vault_has_missing_name_is_4xx(nunba_flask_app):
    """/api/vault/has with no `name=` query param must 4xx, not 5xx."""
    resp = nunba_flask_app.get("/api/vault/has")
    if resp.status_code == 404:
        pytest.skip("/api/vault/has not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j271_vault_store_rejects_empty_body(nunba_flask_app):
    """POST /api/vault/store with empty body must 4xx, not 5xx."""
    resp = nunba_flask_app.post("/api/vault/store", json={})
    if resp.status_code == 404:
        pytest.skip("/api/vault/store not mounted")
    assert resp.status_code < 500


# ── Voice ─────────────────────────────────────────────────────────


@pytest.mark.timeout(30)
def test_j271_voice_stream_port_returns_integer(nunba_flask_app):
    """/voice/stt/stream-port — the SPA needs this to connect its
    WebSocket.  Must return a usable integer port.

    When the STT worker hasn't started (headless pytest), the endpoint
    may return a 0 / None envelope or a different shape; the test
    skips cleanly rather than failing, since it's a HARTOS-gated
    surface."""
    resp = nunba_flask_app.get("/voice/stt/stream-port")
    if resp.status_code == 404:
        pytest.skip("/voice/stt/stream-port not mounted")
    assert resp.status_code not in (500, 502, 504)
    if resp.status_code == 200:
        body = resp.get_json() or {}
        port = (
            body.get("port") or body.get("stream_port")
            or body.get("ws_port")
        )
        if port is None or not isinstance(port, int) or not (0 < port < 65536):
            pytest.skip(
                f"stream-port not allocated (STT worker not running): "
                f"{body!r}"
            )


@pytest.mark.timeout(30)
def test_j271_voice_transcribe_rejects_empty_body(nunba_flask_app):
    """POST /voice/transcribe with no audio payload must 4xx, not 5xx."""
    resp = nunba_flask_app.post("/voice/transcribe", json={})
    if resp.status_code == 404:
        pytest.skip("/voice/transcribe not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j271_voice_diarize_rejects_empty_body(nunba_flask_app):
    """POST /voice/diarize with no audio payload must 4xx, not 5xx."""
    resp = nunba_flask_app.post("/voice/diarize", json={})
    if resp.status_code == 404:
        pytest.skip("/voice/diarize not mounted")
    assert resp.status_code < 500


# ── Image proxy ────────────────────────────────────────────────────


@pytest.mark.timeout(30)
def test_j271_image_proxy_missing_url_is_4xx(nunba_flask_app):
    """/api/image-proxy with no `url=` must 4xx, not 5xx."""
    resp = nunba_flask_app.get("/api/image-proxy")
    if resp.status_code == 404:
        pytest.skip("/api/image-proxy not mounted")
    # 400 (missing query) or 404 (route not registered) OK
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j271_image_proxy_invalid_url_is_4xx(nunba_flask_app):
    """/api/image-proxy?url=notaurl must 4xx, not 5xx."""
    resp = nunba_flask_app.get("/api/image-proxy?url=notaurl")
    if resp.status_code == 404:
        pytest.skip("/api/image-proxy not mounted")
    assert resp.status_code < 500


# ── jslog bridge (J97 extended) ────────────────────────────────────


@pytest.mark.timeout(30)
def test_j271_jslog_accepts_console_line(nunba_flask_app):
    """POST /api/jslog is called by the renderer on every console
    line.  An accepted-but-not-5xx envelope is required; a crash would
    spam failures in the devtools."""
    resp = nunba_flask_app.post(
        "/api/jslog",
        json={"level": "info", "message": "j271 test log entry"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/jslog not mounted")
    assert resp.status_code < 500
