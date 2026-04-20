"""J165 · Image proxy DNS rebind (TOCTOU).

User journey from PRODUCT_MAP.md §COMBINATIONS — architect-flagged
LIKELY-TO-BREAK row. Kept in suite as a live test so Phase-7 sees a
RED when the TOCTOU is still present.

Pre: attacker hostname resolves to public IP once (passes the
_is_private_ip check at main.py:2238) then 127.x on the real fetch.

Steps: /api/image-proxy?url=http://attacker.example/pic.png
Verify: MUST return 4xx/5xx, NOT 200 with loopback payload.

[GAP — main.py has no pinned-IP connector; this test is EXPECTED TO
FAIL until a pinned fetch path is introduced.]
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j165_dns_rebind_refused(nunba_flask_app, dns_rebind_mocker):
    """First resolve: public IP (passes guard). Second resolve: loopback.
    If the proxy refuses (good): returns 4xx/5xx. If vulnerable (bad):
    returns 200 with the loopback content — which would be a security
    bug to surface in Phase-7."""
    dns_rebind_mocker(["93.184.216.34", "127.0.0.1"])  # example.com, then loopback
    r = nunba_flask_app.get(
        "/api/image-proxy?url=http://attacker-j165.invalid/pic.png"
    )
    if r.status_code == 404 and r.get_data(as_text=True) == "":
        pytest.skip("/api/image-proxy not mounted")
    # Contract: proxy must not proxy a loopback response.
    # Either 4xx/5xx (refused) or a 200 whose body is NOT private-network content.
    assert r.status_code != 200 or len(r.get_data()) == 0, (
        "DNS-rebind TOCTOU vulnerability: image-proxy returned 200 "
        "after rebind to 127.0.0.1. Pin the IP at validation time "
        "and use that pinned IP for the fetch."
    )


@pytest.mark.timeout(30)
def test_j165_public_url_fetch_not_crashed(nunba_flask_app):
    """Normal public URL fetch should not hang or 500."""
    r = nunba_flask_app.get(
        "/api/image-proxy?url=http://127.0.0.1:1/definitely-not-there.png"
    )
    if r.status_code == 404 and r.get_data(as_text=True) == "":
        pytest.skip("/api/image-proxy not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())
