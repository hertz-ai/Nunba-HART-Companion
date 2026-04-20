"""J84 · Search posts.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* /api/social/search mounted.

Steps
-----
1. GET /api/social/search?q=test

Verifiable outcomes
-------------------
* Reachable; non-5xx.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j84_search_reachable(nunba_flask_app):
    resp = nunba_flask_app.get("/api/social/search?q=test")
    if resp.status_code == 404:
        pytest.skip("/api/social/search not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j84_search_empty_query_handled(nunba_flask_app):
    resp = nunba_flask_app.get("/api/social/search")
    if resp.status_code == 404:
        pytest.skip("/api/social/search not mounted")
    # Empty q → 400 or empty list; NOT 500
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j84_search_special_chars_escape(nunba_flask_app):
    """SQL-ish special chars in q should not crash the search."""
    resp = nunba_flask_app.get("/api/social/search?q=%27%22%3B--")
    if resp.status_code == 404:
        pytest.skip("/api/social/search not mounted")
    assert resp.status_code < 500
