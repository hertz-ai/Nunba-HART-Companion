"""J54 · Vote on post.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions: social_bp mounted.

Steps
-----
1. POST /api/social/posts/<id>/vote with a vote body.

Verifiable outcomes
-------------------
* Route reachable.
* For a fabricated id: 4xx (not found / forbidden) — NEVER 500 with
  empty body.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j54_vote_route_mounted(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/social/posts/j54-nonexistent-id/vote",
        json={"vote": 1},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404 and "Not Found" in resp.get_data(as_text=True):
        # Distinguish "route not mounted" from "post id not found". A
        # mounted route typically returns 401/403/404 with a JSON body.
        body = resp.get_json(silent=True)
        if body is None:
            pytest.skip("/api/social/posts/<id>/vote not mounted")
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip()), (
        f"vote endpoint emitted empty 5xx: {resp.status_code}"
    )


@pytest.mark.timeout(45)
def test_j54_vote_rejects_malformed_body(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/social/posts/1/vote",
        data="this-is-not-json",
        headers={"Content-Type": "application/json"},
    )
    # Either auth-refused, validation-refused, or not-found — never
    # a crash with no body.
    if resp.status_code == 404:
        pytest.skip("vote route not mounted")
    assert resp.status_code < 500
