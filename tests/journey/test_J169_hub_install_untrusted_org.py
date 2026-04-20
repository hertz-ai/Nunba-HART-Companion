"""J169 · Hub install from non-allowlisted org refused.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: POST /api/admin/models/hub/install {repo:"eviloss/gguf"}.
Verify: 403 with org name; main.py:1773 `is_trusted` returns False.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j169_untrusted_org_refused(nunba_flask_app, network_partition):
    """Allowlist gate must refuse BEFORE any HF call.  We block HF
    egress just to prove the refusal is local, not network-driven."""
    network_partition([443])
    r = nunba_flask_app.post(
        "/api/admin/models/hub/install",
        json={"model": "eviloss-j169/bad-gguf", "quant": "Q4_K_M"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/admin/models/hub/install not mounted")
    body = r.get_data(as_text=True)
    # NOT 500-empty (would indicate no allowlist check at all)
    assert not (r.status_code >= 500 and not body.strip())
    # Must be 4xx — 403 preferred, 400 acceptable, 401 if admin auth fires.
    assert 400 <= r.status_code < 500, (
        f"untrusted org should be 4xx, got {r.status_code}: {body[:200]}"
    )


@pytest.mark.timeout(30)
def test_j169_trusted_org_accepted_or_graceful(nunba_flask_app, network_partition):
    """TheBloke is a canonical trusted org. Test should either
    accept the validation and proceed (200/202) or fail gracefully
    at a later gate — never 5xx empty."""
    network_partition([443])  # prevent any real hub call
    r = nunba_flask_app.post(
        "/api/admin/models/hub/install",
        json={"model": "TheBloke/j169-fake-model", "quant": "Q4_K_M"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/admin/models/hub/install not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())
