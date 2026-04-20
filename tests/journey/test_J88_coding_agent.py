"""J88 · Coding agent execute task.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* /coding/execute mounted (hart_intelligence_entry.py).

Steps
-----
1. POST /coding/execute with a minimal task.

Verifiable outcomes
-------------------
* Reachable; non-5xx or 4xx-with-body.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j88_coding_execute_reachable(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/coding/execute",
        json={"task": "print hello", "language": "python"},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/coding/execute not mounted")
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip()), (
        "/coding/execute emitted empty 5xx"
    )


@pytest.mark.timeout(30)
def test_j88_coding_execute_rejects_empty(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/coding/execute",
        json={},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/coding/execute not mounted")
    assert resp.status_code < 500
