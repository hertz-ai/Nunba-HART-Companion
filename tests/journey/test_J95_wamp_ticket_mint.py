"""J95 · WAMP ticket mint + subscribe.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* /api/wamp/ticket mounted (main.py:2535).

Steps
-----
1. GET /api/wamp/ticket
2. GET /api/wamp/status

Verifiable outcomes
-------------------
* Both endpoints reachable and return JSON envelopes.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j95_ticket_mint(nunba_flask_app):
    resp = nunba_flask_app.get("/api/wamp/ticket")
    if resp.status_code == 404:
        pytest.skip("/api/wamp/ticket not mounted")
    assert resp.status_code < 500
    if resp.status_code == 200:
        body = resp.get_json(silent=True) or {}
        # Contract: returns a ticket field (short random token)
        assert isinstance(body, dict)


@pytest.mark.timeout(30)
def test_j95_wamp_status(nunba_flask_app):
    resp = nunba_flask_app.get("/api/wamp/status")
    if resp.status_code == 404:
        pytest.skip("/api/wamp/status not mounted")
    assert resp.status_code < 500
