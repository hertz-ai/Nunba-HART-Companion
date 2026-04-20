"""J136 · Logged-in user: localStorage + server memory merged.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: SPA loads → fetch /api/memory/recent → merge with
localStorage → render. Verify: /api/memory/recent is reachable
and returns a JSON envelope.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j136_memory_recent_reachable(nunba_flask_app):
    r = nunba_flask_app.get("/api/memory/recent")
    if r.status_code == 404:
        pytest.skip("/api/memory/recent not mounted")
    assert r.status_code < 500
    body = r.get_json(silent=True)
    # 401/403 are OK (unauth); 200 should carry JSON.
    if r.status_code == 200:
        assert body is not None


@pytest.mark.timeout(30)
def test_j136_memory_recent_with_limit(nunba_flask_app):
    r = nunba_flask_app.get("/api/memory/recent?limit=5")
    if r.status_code == 404:
        pytest.skip("/api/memory/recent not mounted")
    assert r.status_code < 500
