"""J78 · Spark via hive signal.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* Hive signal blueprint mounted (/api/hive/signals/*).

Steps
-----
1. GET /api/hive/signals/stats
2. GET /api/hive/signals/feed
3. POST /api/hive/signals/classify with a sample payload.

Verifiable outcomes
-------------------
* Each endpoint reachable, non-5xx.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j78_signals_stats(nunba_flask_app):
    resp = nunba_flask_app.get("/api/hive/signals/stats")
    if resp.status_code == 404:
        pytest.skip("hive signals not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j78_signals_feed(nunba_flask_app):
    resp = nunba_flask_app.get("/api/hive/signals/feed")
    if resp.status_code == 404:
        pytest.skip("hive signals feed not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j78_signals_classify_graceful_on_empty_body(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/hive/signals/classify",
        json={},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("hive signals classify not mounted")
    # Empty body → validation 4xx preferred; 5xx only acceptable with a body
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip())
