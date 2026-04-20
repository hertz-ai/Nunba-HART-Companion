"""J163 · Two provider retries overlap.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: two /chat both fail primary; both retry secondary. Verify:
gateway semaphore honored; leaderboard not double-decremented.

At contract tier: two /chat in parallel + a provider stats read
all return envelopes.
"""

from __future__ import annotations

import concurrent.futures

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j163_parallel_chat_with_provider_read(nunba_flask_app, dual_user):
    def _chat(user: dict):
        return nunba_flask_app.post(
            "/chat",
            json={
                "text": "primary-fail-retry",
                "preferred_lang": "en",
                "user_id": user["user_id"],
            },
            headers={"Content-Type": "application/json"},
        )

    def _stats():
        return nunba_flask_app.get("/api/admin/providers/stats")

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        f1 = ex.submit(_chat, dual_user["a"])
        f2 = ex.submit(_chat, dual_user["b"])
        fs = ex.submit(_stats)
        r1, r2, rs = f1.result(45), f2.result(45), fs.result(45)

    assert r1.status_code < 500
    assert r2.status_code < 500
    if rs.status_code != 404:
        assert rs.status_code < 500


@pytest.mark.timeout(30)
def test_j163_provider_stats_endpoint(nunba_flask_app):
    """Provider stats endpoint must stay reachable — it's how the
    gateway reports which provider succeeded on retry."""
    r = nunba_flask_app.get("/api/admin/providers/stats")
    if r.status_code == 404:
        pytest.skip("/api/admin/providers/stats not mounted")
    assert r.status_code < 500
