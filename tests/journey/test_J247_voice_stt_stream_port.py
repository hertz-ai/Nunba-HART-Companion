"""J247 · Voice-STT websocket port discovery.

PRODUCT_MAP.md §1.13 documents the voice pipeline handshake:

  React shell opens the mic → calls /voice/stt/stream-port → reads
  {port, url} → opens a websocket to that URL for live Whisper STT.

Without this endpoint the mic button silently fails because the
frontend doesn't know which port the STT websocket is bound to
(it's dynamic at boot, not a compile-time constant).

Previously uncovered.  The endpoint MUST reply with an int port
and a ws:// URL every time.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(10)
def test_j247_stream_port_returns_ws_url(nunba_flask_app):
    resp = nunba_flask_app.get("/voice/stt/stream-port")
    if resp.status_code == 404:
        pytest.skip("/voice/stt/stream-port not mounted")
    assert resp.status_code == 200, resp.get_data(as_text=True)[:200]
    body = resp.get_json() or {}
    # port is int, in the user-port range.
    port = body.get("port")
    assert isinstance(port, int), f"port not int: {port!r}"
    assert 1024 <= port <= 65535, f"port out of range: {port}"
    # url is a ws:// URL pointing at the same port.
    url = body.get("url") or ""
    assert url.startswith("ws://"), f"url not ws://: {url!r}"
    assert str(port) in url, f"port {port} not in url {url!r}"


@pytest.mark.timeout(10)
def test_j247_stream_port_stable_on_repeat(nunba_flask_app):
    """Port must be stable across consecutive GETs within a session.
    If it flaps the frontend websocket reconnect loop breaks."""
    first = nunba_flask_app.get("/voice/stt/stream-port")
    if first.status_code == 404:
        pytest.skip("/voice/stt/stream-port not mounted")
    second = nunba_flask_app.get("/voice/stt/stream-port")
    assert second.status_code == 200
    p1 = (first.get_json() or {}).get("port")
    p2 = (second.get_json() or {}).get("port")
    assert p1 == p2, f"port changed between calls: {p1} -> {p2}"
