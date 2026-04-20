"""J275 · DB-level routes breadth — posts, votes, comments, social.

PRODUCT_MAP.md §1.7 + §1.8 list HARTOS social routes that a user
reaches via the feed.  J53-J57 covered core happy paths; this file
adds the breadth test that every user-facing social endpoint does
not 5xx when hit with plausible arguments.

Covers:
  GET  /api/social/feed
  GET  /api/social/feed?cursor=...
  GET  /api/social/search?q=...
  GET  /api/social/posts/<id>
  GET  /api/social/users/<id>
  GET  /api/social/channels
  GET  /api/social/notifications
  GET  /api/social/communities
  GET  /api/social/recipes
  GET  /api/social/achievements
  GET  /api/social/leaderboard

Mapping: PRODUCT_MAP §1.8 + integrations/social/*.py.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


_SOCIAL_GETS = [
    "/api/social/feed",
    "/api/social/feed?cursor=0",
    "/api/social/search?q=hello",
    "/api/social/channels",
    "/api/social/communities",
    "/api/social/recipes",
    "/api/social/leaderboard",
    "/api/social/notifications",
    "/api/social/achievements",
]


@pytest.mark.timeout(30)
@pytest.mark.parametrize("path", _SOCIAL_GETS)
def test_j275_social_get_not_5xx(nunba_flask_app, path):
    """Every social GET must respond without 5xx."""
    resp = nunba_flask_app.get(path)
    if resp.status_code == 404:
        pytest.skip(f"{path} not mounted")
    # 401/403 (auth required) OK.  200 OK.  4xx with envelope OK.
    # 5xx is NOT OK.
    assert resp.status_code < 500, (
        f"{path} crashed 5xx: {resp.get_data(as_text=True)[:150]}"
    )


@pytest.mark.timeout(30)
def test_j275_unknown_post_detail_is_4xx(nunba_flask_app):
    """GET /api/social/posts/<nonexistent> must 4xx, not 5xx."""
    resp = nunba_flask_app.get("/api/social/posts/j275-no-such-post")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j275_unknown_user_detail_is_4xx(nunba_flask_app):
    """GET /api/social/users/<nonexistent> must 4xx, not 5xx."""
    resp = nunba_flask_app.get("/api/social/users/j275-no-such-user")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j275_post_creation_rejects_empty_body(nunba_flask_app):
    """POST /api/social/posts with empty body must 4xx, not 5xx."""
    resp = nunba_flask_app.post("/api/social/posts", json={})
    if resp.status_code == 404:
        pytest.skip("/api/social/posts not mounted")
    # Auth-required routes should return 401/403, not 5xx.
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j275_feed_pagination_cursor_tolerated(nunba_flask_app):
    """Various cursor shapes must not crash — ISO timestamps, numbers,
    opaque base64 strings all appear in the wild."""
    for cursor in ("0", "2026-04-18T12:00:00Z", "abc123=="):
        resp = nunba_flask_app.get(f"/api/social/feed?cursor={cursor}")
        if resp.status_code == 404:
            pytest.skip("/api/social/feed not mounted")
        assert resp.status_code < 500, (
            f"feed crashed with cursor={cursor}: "
            f"{resp.get_data(as_text=True)[:120]}"
        )


@pytest.mark.timeout(30)
def test_j275_search_extreme_query_tolerated(nunba_flask_app):
    """Long / unicode / punctuation-heavy queries must not crash."""
    for q in ("a" * 500, "'; DROP TABLE posts;--", "שלום", "😀"):
        import urllib.parse as up
        safe_q = up.quote(q)
        resp = nunba_flask_app.get(f"/api/social/search?q={safe_q}")
        if resp.status_code == 404:
            pytest.skip("/api/social/search not mounted")
        assert resp.status_code < 500, (
            f"search crashed with q={q[:30]!r}: "
            f"{resp.get_data(as_text=True)[:120]}"
        )
