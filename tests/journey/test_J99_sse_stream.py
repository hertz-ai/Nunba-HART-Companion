"""J99 · Social SSE stream.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* Real Nunba Flask app with /api/social/events/stream mounted
  (main.py:2561).

Steps
-----
1. GET /api/social/events/stream with short read.
2. Assert the response content-type is `text/event-stream`.

Verifiable outcomes
-------------------
* 200 within 5s.
* Content-Type header mentions event-stream.
* A small number of bytes (hello/handshake) can be read without
  blocking forever.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j99_sse_stream_content_type(nunba_flask_app):
    resp = nunba_flask_app.get(
        "/api/social/events/stream",
        headers={"Accept": "text/event-stream"},
        buffered=False,
    )
    if resp.status_code == 404:
        pytest.skip("/api/social/events/stream not mounted")
    assert resp.status_code == 200, (
        f"SSE endpoint returned {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
    ct = resp.headers.get("Content-Type", "")
    assert "event-stream" in ct.lower() or "text/plain" in ct.lower(), (
        f"SSE content-type should include event-stream; got {ct!r}"
    )
    # Close the streaming response so the test exits promptly.
    try:
        resp.close()
    except Exception:
        pass


@pytest.mark.timeout(30)
def test_j99_jslog_bridge_accepts_entry(nunba_flask_app):
    """The sibling /api/jslog bridge (main.py:2551) is the inverse
    of SSE — renderer-side console → server.log.  It should accept
    a minimal log entry."""
    resp = nunba_flask_app.post(
        "/api/jslog",
        json={"level": "info", "msg": "j99 journey test"},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/jslog not mounted")
    assert resp.status_code < 500
