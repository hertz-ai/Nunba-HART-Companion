"""J162 · Hot-reload chatbot_routes while /chat active.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Dev-only surface. At this tier we verify that the Flask test_client
/chat continues to respond when a second /chat fires in parallel —
which is the closest proxy to "route-table mutation under load".
"""

from __future__ import annotations

import concurrent.futures

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j162_parallel_chat_no_hangs(nunba_flask_app):
    def _post(i: int):
        return nunba_flask_app.post(
            "/chat",
            json={"text": f"hr-{i}", "preferred_lang": "en"},
            headers={"Content-Type": "application/json"},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        results = list(ex.map(_post, range(3)))

    for r in results:
        assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j162_chat_post_after_admin_config_read(nunba_flask_app):
    """Reading admin config must not block /chat."""
    nunba_flask_app.get("/api/admin/config")
    r = nunba_flask_app.post(
        "/chat",
        json={"text": "after admin read", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500
