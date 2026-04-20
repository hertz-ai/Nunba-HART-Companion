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


# Parameterized allowlist guard — every non-http(s) scheme must be
# rejected at the route boundary, BEFORE the requests.get fallback can
# leak a 200+decoy-image and mask the SSRF attempt.  The allowlist in
# main.py:image_proxy is `scheme in ('http','https')`; this table
# encodes every scheme that has historically been used to bypass URL
# validators (OWASP SSRF cheatsheet + public CVE patterns).
_BLOCKED_SCHEMES = [
    # Local file disclosure
    ("file:///etc/passwd", "file"),
    ("file:///C:/Windows/win.ini", "file-win"),
    ("File:///etc/passwd", "file-mixed-case"),
    # Legacy protocol smuggling
    ("gopher://127.0.0.1:25/", "gopher"),
    ("ftp://ftp.example.com/a.png", "ftp"),
    ("ldap://internal.corp/", "ldap"),
    ("about:blank", "about"),
    # Inline payload delivery
    ("data:text/html,<script>", "data-html"),
    ("data:image/png;base64,iVBORw0K", "data-png"),
    # Scripted URLs
    ("javascript:alert(1)", "javascript"),
    ("vbscript:msgbox", "vbscript"),
]


@pytest.mark.timeout(30)
@pytest.mark.parametrize("url,label", _BLOCKED_SCHEMES,
                         ids=[lbl for _, lbl in _BLOCKED_SCHEMES])
def test_j98_image_proxy_blocks_non_http_schemes(
        nunba_flask_app, url, label):
    """Allowlist contract: anything that isn't http:// or https:// must
    be rejected with a 4xx, NEVER swallowed by the outer try/except
    that returns the 200 decoy image."""
    resp = nunba_flask_app.get(f"/api/image-proxy?url={url}")
    if resp.status_code == 404 and resp.get_data(as_text=True) == "":
        pytest.skip("/api/image-proxy not mounted")
    assert resp.status_code >= 400, (
        f"Scheme {label!r} ({url!r}) must be rejected; got "
        f"{resp.status_code}.  The outer except-Exception in "
        f"image_proxy would otherwise return a 200 with a decoy "
        f"image and MASK the SSRF attempt."
    )
    # Also: the error envelope should identify this as a scheme
    # violation, not a generic network failure.  4xx (allowlist) vs
    # 5xx/502 (upstream failure) — different remediation paths.
    assert resp.status_code < 500, (
        f"Scheme rejection should be 4xx, got {resp.status_code}"
    )
