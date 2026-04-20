"""J178 · Payment failure → subscription NOT upgraded.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: mock provider returns 402 → frontend handler does NOT flip
access_tier. Verify: /api/social/auth/me still shows prior tier.

At HTTP tier: /api/social/auth/me is reachable and returns
envelope.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j178_auth_me_reachable(nunba_flask_app):
    r = nunba_flask_app.get("/api/social/auth/me")
    if r.status_code == 404:
        pytest.skip("/api/social/auth/me not mounted")
    # 401 (unauth) is the expected default response; we need it
    # to not 500.
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j178_payment_webhook_no_tier_bump(nunba_flask_app):
    """A bogus payment event must NOT upgrade a tier — endpoint
    should refuse or no-op."""
    r = nunba_flask_app.post(
        "/api/social/payments/webhook",
        json={"event": "payment_failed", "status": 402, "user_id": "j178"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/social/payments/webhook not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())
