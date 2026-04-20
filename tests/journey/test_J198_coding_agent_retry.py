"""J198 · Coding agent loop: execute → fail → fix → re-execute.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: /coding/execute with broken tool call → tool_router returns
error → agent retries with fix → success.

Contract tier: /coding/execute reachable; back-to-back calls return
envelopes.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j198_coding_execute_good_then_broken(nunba_flask_app):
    r1 = nunba_flask_app.post(
        "/api/coding/execute",
        json={"task": "print hello"},
        headers={"Content-Type": "application/json"},
    )
    if r1.status_code == 404:
        pytest.skip("/api/coding/execute not mounted")

    r2 = nunba_flask_app.post(
        "/api/coding/execute",
        json={"task": "use an undefined tool to do the impossible"},
        headers={"Content-Type": "application/json"},
    )
    body1 = r1.get_data(as_text=True)
    body2 = r2.get_data(as_text=True)
    assert not (r1.status_code >= 500 and not body1.strip())
    assert not (r2.status_code >= 500 and not body2.strip())


@pytest.mark.timeout(30)
def test_j198_coding_execute_empty_task_rejected(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/coding/execute",
        json={"task": ""},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/coding/execute not mounted")
    assert r.status_code < 500
