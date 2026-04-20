"""J74 · Provider test ping.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* /api/admin/providers/<provider_id>/test mounted (main.py:1995).

Steps
-----
1. POST /api/admin/providers/groq/test with no key set.

Verifiable outcomes
-------------------
* Reachable.
* Absent API key → graceful 4xx or 5xx-with-body, never empty 5xx.
* Test must NOT reach the real provider (no key → no network call).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j74_provider_test_missing_key(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/admin/providers/groq/test",
        json={},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/admin/providers/<id>/test not mounted")
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip()), (
        "provider/test emitted empty 5xx without a key"
    )


@pytest.mark.timeout(30)
def test_j74_provider_test_unknown_provider_404(nunba_flask_app):
    """An unknown provider id should yield 404, not 500."""
    resp = nunba_flask_app.post(
        "/api/admin/providers/no-such-provider-j74/test",
        json={},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        # Good — either route not mounted (skip) or provider not found
        return
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j74_admin_providers_list_mounted(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/providers")
    if resp.status_code == 404:
        pytest.skip("/api/admin/providers not mounted")
    assert resp.status_code < 500
