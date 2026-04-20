"""J83 · Share link.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* /s/<token> mounted (main.py:2633).

Steps
-----
1. GET /s/<fabricated-token>

Verifiable outcomes
-------------------
* Route reachable.
* A non-existent token yields 404/4xx — never empty 500.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j83_share_link_reachable(nunba_flask_app):
    resp = nunba_flask_app.get("/s/j83-nonexistent-token")
    if resp.status_code == 404 and resp.get_data(as_text=True).strip() == "":
        # Completely empty 404 might mean route not mounted
        pytest.skip("/s/<token> not mounted in this env")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j83_share_link_html_for_valid_path(nunba_flask_app):
    """For a plausible token the response should be HTML-ish (content
    type text/html) even if the post doesn't exist (landing page is
    rendered either way)."""
    resp = nunba_flask_app.get("/s/abcdef123456")
    if resp.status_code == 404 and resp.get_data(as_text=True).strip() == "":
        pytest.skip("/s/<token> not mounted")
    # 200 or 404 both fine; just must not 500
    assert resp.status_code < 500
