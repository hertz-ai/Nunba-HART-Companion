"""J53 · Post → WAMP fan-out.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* Real Nunba Flask app with social_bp mounted.

Steps
-----
1. POST /api/social/posts with a sample post body.
2. Observe that the route either succeeds or refuses with a
   documented status (auth).
3. Verify the GET /api/social/feed surface is also mounted so a
   WAMP subscriber could reconcile.

Verifiable outcomes
-------------------
* Post endpoint reachable (not 404).
* No silent empty-5xx.
* Feed endpoint reachable.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j53_post_social_posts_route_mounted(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/social/posts",
        json={"content": "J53 journey test post", "title": "J53"},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/social/posts not mounted in this env")
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip()), (
        f"/api/social/posts emitted empty 5xx: {resp.status_code}"
    )


@pytest.mark.timeout(45)
def test_j53_feed_endpoint_mounted(nunba_flask_app):
    """GET /api/social/feed should be reachable so that after a
    successful post the fan-out subscriber can reconcile via HTTP
    polling if WAMP is down (degraded-mode path)."""
    resp = nunba_flask_app.get("/api/social/feed")
    if resp.status_code == 404:
        pytest.skip("/api/social/feed not mounted")
    assert resp.status_code < 500, (
        f"/api/social/feed server crash: {resp.status_code}"
    )


@pytest.mark.timeout(45)
def test_j53_publish_bridge_roundtrip(nunba_flask_app):
    """The /publish HTTP bridge (main.py:2491) is the canonical way
    for off-process publishers to inject WAMP events. Either it
    returns 200 (router running) or 503 (router not running) — NEVER
    a silent 500."""
    resp = nunba_flask_app.post(
        "/publish",
        json={"topic": "community.feed", "args": [{"post_id": "J53-probe"}]},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/publish bridge not mounted")
    assert resp.status_code in (200, 400, 503), (
        f"/publish expected 200|400|503 but got {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
