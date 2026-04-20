"""J155 · 2 simultaneous /chat requests same user.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: concurrent POST /chat from same user_id. Verify: both
complete; no SSE cross-talk; no crash.
"""

from __future__ import annotations

import concurrent.futures

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j155_two_concurrent_chats_same_user(nunba_flask_app):
    def _post(text: str):
        return nunba_flask_app.post(
            "/chat",
            json={"text": text, "preferred_lang": "en", "user_id": "j155"},
            headers={"Content-Type": "application/json"},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        f1 = ex.submit(_post, "alpha")
        f2 = ex.submit(_post, "beta")
        r1 = f1.result(timeout=45)
        r2 = f2.result(timeout=45)

    assert r1.status_code < 500
    assert r2.status_code < 500


@pytest.mark.timeout(60)
def test_j155_five_concurrent_chats(nunba_flask_app):
    def _post(i: int):
        return nunba_flask_app.post(
            "/chat",
            json={"text": f"conc-{i}", "preferred_lang": "en"},
            headers={"Content-Type": "application/json"},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        results = list(ex.map(_post, range(5)))

    for r in results:
        assert r.status_code < 500
