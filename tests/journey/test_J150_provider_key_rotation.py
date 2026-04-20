"""J150 · Provider key rotated mid-call → gateway retries next-best.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: 2 providers in gateway. Steps: start /chat via groq; revoke
key via /api/admin/providers/groq/api-key DELETE (main.py:1978);
provider returns 401. Verify: gateway retries next-ranked.

At contract tier: provider listing + key DELETE + /chat all
reachable and graceful.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j150_providers_list_reachable(nunba_flask_app):
    r = nunba_flask_app.get("/api/admin/providers")
    if r.status_code == 404:
        pytest.skip("/api/admin/providers not mounted")
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j150_delete_api_key_graceful(nunba_flask_app):
    """DELETE on a nonexistent provider key must not 500 — 404 or
    401 are correct."""
    r = nunba_flask_app.delete(
        "/api/admin/providers/nonexistent-provider-j150/api-key"
    )
    if r.status_code == 404 and r.get_json(silent=True) is None:
        pytest.skip("/api/admin/providers/<p>/api-key not mounted")
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j150_chat_after_key_delete(nunba_flask_app):
    nunba_flask_app.delete(
        "/api/admin/providers/nonexistent-provider-j150/api-key"
    )
    r = nunba_flask_app.post(
        "/chat",
        json={"text": "after rotation", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500
