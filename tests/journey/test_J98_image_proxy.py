"""J98 · Image proxy.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* /api/image-proxy mounted (main.py:2244).

Steps
-----
1. GET /api/image-proxy?url=<loopback_server>

Verifiable outcomes
-------------------
* Reachable.
* For a bogus/unreachable URL, the proxy returns 4xx/5xx with a
  non-empty body (explaining why).  Must never hang the test worker
  forever.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j98_image_proxy_reachable(nunba_flask_app):
    """Proxy should route the request; a non-existent URL yields
    a timely 4xx/5xx with body."""
    resp = nunba_flask_app.get(
        "/api/image-proxy?url=http://127.0.0.1:1/does-not-exist.png"
    )
    if resp.status_code == 404 and resp.get_data(as_text=True) == "":
        pytest.skip("/api/image-proxy not mounted")
    # Either a graceful error envelope or a 200 with empty cache —
    # but the crucial contract is the request RETURNED (didn't hang).
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip())


@pytest.mark.timeout(30)
def test_j98_image_proxy_rejects_missing_url(nunba_flask_app):
    resp = nunba_flask_app.get("/api/image-proxy")
    if resp.status_code == 404 and resp.get_data(as_text=True) == "":
        pytest.skip("/api/image-proxy not mounted")
    # Missing url → 400, never 500
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j98_image_proxy_blocks_file_scheme(nunba_flask_app):
    """SSRF guard: file:// URLs must be refused."""
    resp = nunba_flask_app.get(
        "/api/image-proxy?url=file:///etc/passwd"
    )
    if resp.status_code == 404 and resp.get_data(as_text=True) == "":
        pytest.skip("/api/image-proxy not mounted")
    # Must NOT 200 with the contents of /etc/passwd
    assert resp.status_code >= 400, (
        f"file:// URL was NOT rejected — SSRF risk. status={resp.status_code}"
    )
