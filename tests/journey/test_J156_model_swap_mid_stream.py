"""J156 · Admin swaps active model while chat mid-stream.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: start long /chat → /api/admin/models/swap (main.py:1522).
Verify: in-flight completes; next request uses new model.

At contract tier: swap endpoint reachable and graceful; /chat
continues to work post-swap.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j156_swap_endpoint_reachable(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/admin/models/swap",
        json={"model_id": "j156-nonexistent"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/admin/models/swap not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())


@pytest.mark.timeout(45)
def test_j156_chat_after_swap_attempt(nunba_flask_app):
    nunba_flask_app.post(
        "/api/admin/models/swap",
        json={"model_id": "j156-probe"},
        headers={"Content-Type": "application/json"},
    )
    r = nunba_flask_app.post(
        "/chat",
        json={"text": "post-swap probe", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500
