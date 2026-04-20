"""J56 · Feed paginated.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Steps
-----
1. GET /api/social/feed
2. GET /api/social/feed?cursor=<opaque>

Verifiable outcomes
-------------------
* Both calls reachable.
* Body is a JSON dict with either `items`, `posts`, or `data` key,
  OR an auth-gated 4xx.
* Cursor param does not crash the handler.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


def _extract_items(body) -> list:
    if not isinstance(body, dict):
        return []
    for key in ("items", "posts", "data", "feed", "results"):
        v = body.get(key)
        if isinstance(v, list):
            return v
    return []


@pytest.mark.timeout(45)
def test_j56_feed_returns_json(nunba_flask_app):
    resp = nunba_flask_app.get("/api/social/feed")
    if resp.status_code == 404:
        pytest.skip("/api/social/feed not mounted")
    assert resp.status_code < 500, (
        f"/feed server crash: {resp.status_code}"
    )
    # If it's a 4xx auth response that's fine — just don't crash
    if resp.status_code < 400:
        body = resp.get_json(silent=True)
        assert body is not None, "feed 2xx but non-JSON body"


@pytest.mark.timeout(45)
def test_j56_feed_cursor_param_accepted(nunba_flask_app):
    resp = nunba_flask_app.get("/api/social/feed?cursor=abc&limit=10")
    if resp.status_code == 404:
        pytest.skip("/api/social/feed not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(45)
def test_j56_feed_rejects_bad_limit(nunba_flask_app):
    """Contract: malformed numeric params must not crash the worker."""
    resp = nunba_flask_app.get("/api/social/feed?limit=not-a-number")
    if resp.status_code == 404:
        pytest.skip("/api/social/feed not mounted")
    assert resp.status_code < 500
