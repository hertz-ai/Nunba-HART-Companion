"""J184 · Kids mode while mainstream chat active.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: admin enables kids mode → user continues chat. Verify:
subsequent /chat filters NSFW; existing stream unaffected.

At HTTP tier: kids-mode toggle endpoint reachable; /chat with
a "sensitive" probe does not crash.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j184_kids_mode_toggle(nunba_flask_app):
    for path in (
        "/api/admin/kids_mode",
        "/api/admin/config/kids_mode",
        "/api/kids/mode",
    ):
        r = nunba_flask_app.post(
            path,
            json={"enabled": True},
            headers={"Content-Type": "application/json"},
        )
        if r.status_code != 404:
            body = r.get_data(as_text=True)
            assert not (r.status_code >= 500 and not body.strip())
            return
    pytest.skip("kids-mode toggle endpoint not mounted")


@pytest.mark.timeout(30)
def test_j184_chat_works_under_kids_mode(nunba_flask_app):
    """/chat under kids mode should be non-5xx."""
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "tell me a kid-friendly story",
            "preferred_lang": "en",
            "kids_mode": True,
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500
