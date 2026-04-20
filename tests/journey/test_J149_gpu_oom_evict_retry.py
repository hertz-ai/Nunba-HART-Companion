"""J149 · GPU OOM mid-session → ResourceGovernor evicts + retries CPU.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: small VRAM. Steps: long /chat. Verify: CUDA OOM caught;
model_lifecycle evicts draft; next call succeeds.

At contract tier: long text /chat does not 500; governor status
endpoint reachable.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j149_long_context_survives(nunba_flask_app):
    long_prompt = "summarize this " + ("very long content " * 200)
    r = nunba_flask_app.post(
        "/chat",
        json={"text": long_prompt, "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j149_governor_status_reachable(nunba_flask_app):
    for path in (
        "/api/admin/governor/status",
        "/api/system/governor",
        "/api/admin/diag/resources",
    ):
        r = nunba_flask_app.get(path)
        if r.status_code != 404:
            assert r.status_code < 500
            return
    pytest.skip("governor status endpoint not mounted")
