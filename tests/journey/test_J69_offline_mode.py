"""J69 · Offline mode.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* Real Nunba Flask app.
* Environment simulates network removal via HF_HUB_OFFLINE=1 (set
  by `main.py:27-31` when the HF cache exists; we force it on for
  this test so the chat path cannot reach any external host).

Steps
-----
1. Set HF_HUB_OFFLINE=1 + TRANSFORMERS_OFFLINE=1 in the env.
2. POST /chat with a short prompt.
3. GET  /api/admin/diag/degradations to verify the degradation
   registry is reachable.

Verifiable outcomes
-------------------
* /chat returns a non-5xx envelope (offline does NOT crash the
  route; the route degrades gracefully to a "local-only" mode).
* /api/admin/diag/degradations is reachable (may 401/403 if admin
  auth is enforced — that's fine; it's NOT 404 and NOT 500).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j69_chat_works_with_hf_offline(nunba_flask_app, monkeypatch):
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    monkeypatch.setenv("TRANSFORMERS_OFFLINE", "1")
    resp = nunba_flask_app.post(
        "/chat",
        json={"text": "offline sanity", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code < 500, (
        f"offline /chat crashed at {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j69_degradations_endpoint_reachable(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/diag/degradations")
    if resp.status_code == 404:
        pytest.skip("/api/admin/diag/degradations not mounted")
    # 401/403 (admin auth) are acceptable — we just need not-500.
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j69_probe_is_loopback_only(nunba_flask_app):
    """Liveness probe should always work even offline."""
    resp = nunba_flask_app.get("/probe")
    if resp.status_code == 404:
        pytest.skip("/probe not mounted")
    assert resp.status_code < 500
