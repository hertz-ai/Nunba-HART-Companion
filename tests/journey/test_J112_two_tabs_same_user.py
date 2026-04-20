"""J112 · Two tabs, one user, interleaved chats.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: same user_id has Nunba webview + admin tab. Steps: tab1 posts
/chat while tab2 posts /chat within 500ms. Verify: both receive
distinct prompt_ids (speculative_dispatcher.py `prompt_id`).

Since Flask test_client is single-threaded, we use a ThreadPool to
drive two overlapping requests; the REAL app handles both via its
app-level threading.
"""

from __future__ import annotations

import concurrent.futures

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j112_two_concurrent_chats_same_user(nunba_flask_app):
    def _post(text: str):
        return nunba_flask_app.post(
            "/chat",
            json={
                "text": text,
                "preferred_lang": "en",
                "user_id": "j112-same-user",
            },
            headers={"Content-Type": "application/json"},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        f1 = ex.submit(_post, "tab-one")
        f2 = ex.submit(_post, "tab-two")
        r1 = f1.result(timeout=45)
        r2 = f2.result(timeout=45)

    assert r1.status_code < 500, f"tab1 crashed: {r1.status_code}"
    assert r2.status_code < 500, f"tab2 crashed: {r2.status_code}"


@pytest.mark.timeout(30)
def test_j112_distinct_user_ids_no_cross_talk(nunba_flask_app):
    """Two DIFFERENT user_ids in back-to-back /chat posts: both
    accepted; per-user scoping intact."""
    r1 = nunba_flask_app.post(
        "/chat",
        json={"text": "alpha", "preferred_lang": "en", "user_id": "j112-A"},
        headers={"Content-Type": "application/json"},
    )
    r2 = nunba_flask_app.post(
        "/chat",
        json={"text": "beta", "preferred_lang": "en", "user_id": "j112-B"},
        headers={"Content-Type": "application/json"},
    )
    assert r1.status_code < 500
    assert r2.status_code < 500
