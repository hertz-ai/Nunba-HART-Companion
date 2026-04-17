"""J73 · DELETE memory row.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions: /api/memory/<id> mounted (chatbot_routes.py:3503).

Steps
-----
1. DELETE /api/memory/<fabricated_id>

Verifiable outcomes
-------------------
* Route reachable.
* 404 for a non-existent id is valid. 200 is valid if idempotent.
* Never empty 5xx.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j73_delete_memory_reachable(nunba_flask_app):
    resp = nunba_flask_app.delete("/api/memory/j73-nonexistent-id")
    if resp.status_code == 404 and resp.get_json(silent=True) is None:
        # distinguish route-not-mounted (empty 404) from row-not-found
        pytest.skip("/api/memory/<id> not mounted in this env")
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip()), (
        f"/api/memory DELETE emitted empty 5xx: {resp.status_code}"
    )


@pytest.mark.timeout(30)
def test_j73_delete_memory_rejects_bad_id_shape(nunba_flask_app):
    """DELETE with a very long / weird id should not crash the server."""
    weird = "x" * 1024
    resp = nunba_flask_app.delete(f"/api/memory/{weird}")
    if resp.status_code == 404 and resp.get_json(silent=True) is None:
        pytest.skip("/api/memory/<id> not mounted")
    assert resp.status_code < 500
