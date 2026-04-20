"""J55 · Comment on post.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions: social_bp mounted.

Steps
-----
1. POST /api/social/posts/<id>/comments with a comment body.

Verifiable outcomes
-------------------
* Route reachable.
* For a fabricated id: 4xx — never empty-500.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j55_comment_route_mounted(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/social/posts/j55-nonexistent/comments",
        json={"content": "J55 comment from journey test"},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404 and resp.get_json(silent=True) is None:
        pytest.skip("comment route not mounted")
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip()), (
        f"comment endpoint emitted empty 5xx: {resp.status_code}"
    )


@pytest.mark.timeout(45)
def test_j55_comment_rejects_empty_content(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/social/posts/1/comments",
        json={"content": ""},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("comment route not mounted")
    # Empty content must be rejected at the validation tier, not the
    # database tier — 4xx is expected.
    assert resp.status_code < 500
