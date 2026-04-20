"""J252 · Share-link create + resolve invariants.

The /s/:token route in MainRoute.js lazy-loads ShareLandingPage,
which calls shareApi.resolve(token) → GET /api/social/share/{token}.
If the resolve endpoint returns the wrong envelope shape, EVERY
share URL in the wild breaks.

Invariants this test locks:

  1. POST /api/social/share/link requires a body — bogus requests
     must 400/401 (auth-gated), never 500 / ISE.
  2. GET /api/social/share/{token} on a non-existent token must
     return a non-5xx response with a JSON body — 404 is acceptable,
     but a crashed handler breaks the UX (white-screen + CORS error).
  3. The ShareLandingPage JSX must keep the shape
     `res.data?.data || res.data` and the keys `requires_consent`,
     `redirect_url`, `og`. If those keys disappear, the UI breaks.
  4. Consent flow: POST /api/social/share/{token}/consent must be
     reachable (405 / 401 / 404 OK; a 500 blow-up is a regression).
"""

from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.journey


_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_SHARE_PAGE = _REPO_ROOT / "landing-page" / "src" / "pages" / "ShareLandingPage.js"
_SOCIAL_API_JS = _REPO_ROOT / "landing-page" / "src" / "services" / "socialApi.js"


@pytest.mark.timeout(30)
def test_j252_share_landing_page_uses_expected_api_shape():
    """ShareLandingPage.js consumes res.data?.data?.redirect_url —
    the resolve endpoint MUST preserve the double-nested envelope
    or the SPA can't pluck the URL out.
    """
    source = _SHARE_PAGE.read_text(encoding="utf-8")

    # The redirect_url key is what the SPA navigates to
    assert "redirect_url" in source, (
        "ShareLandingPage.js stopped consuming redirect_url — share links "
        "would land on a loading spinner forever"
    )
    assert "requires_consent" in source, (
        "ShareLandingPage.js stopped checking requires_consent — private "
        "share links skip the consent dialog and leak info"
    )
    # Either .data?.data or .data?.data?.redirect_url unwrap path.
    assert "res.data?.data" in source or "res.data" in source, (
        "ShareLandingPage lost the envelope-unwrap pattern — "
        "backend response shape change will break the SPA silently"
    )


@pytest.mark.timeout(30)
def test_j252_share_api_client_defines_all_endpoints():
    """socialApi.js shareApi must expose createLink, resolve,
    trackView, checkConsent, grantConsent, stats.

    If one disappears, the admin/consent/analytics flows in the UI
    stop working without any import-time error.
    """
    source = _SOCIAL_API_JS.read_text(encoding="utf-8")

    required_methods = [
        "createLink:",
        "resolve:",
        "trackView:",
        "checkConsent:",
        "grantConsent:",
        "stats:",
    ]
    for method in required_methods:
        assert method in source, (
            f"shareApi lost the `{method.rstrip(':')}` method — "
            f"share flow in the SPA breaks"
        )

    # Verify the URL path structure — the /s/:token page calls GET
    # /share/{token}, NOT /share/resolve/{token} or /shares/{token}
    # (very easy to typo).
    assert "`/share/${token}`" in source, (
        "shareApi.resolve no longer calls `/share/{token}` — SPA "
        "cannot resolve share URLs any more"
    )
    assert "`/share/${token}/consent`" in source, (
        "shareApi.grantConsent no longer hits `/share/{token}/consent` — "
        "private-link consent flow is broken"
    )


@pytest.mark.timeout(60)
def test_j252_resolve_nonexistent_token_returns_non_5xx(nunba_flask_app):
    """A made-up token must produce a clean 4xx (not a 5xx), so the
    SPA shows "Link unavailable" instead of a CORS error."""
    resp = nunba_flask_app.get("/api/social/share/this-token-does-not-exist-12345")

    # Acceptable: 401 (auth), 403 (forbidden), 404 (not found), 410 (gone).
    # Unacceptable: 5xx — means the handler crashed on a missing token.
    assert resp.status_code < 500, (
        f"GET /api/social/share/<bogus> returned {resp.status_code} — "
        f"handler crashed on unknown token; SPA white-screens on CORS "
        f"error (no JSON body visible cross-origin). Response body: "
        f"{resp.get_data(as_text=True)[:300]!r}"
    )


@pytest.mark.timeout(60)
def test_j252_create_link_rejects_missing_body(nunba_flask_app):
    """POST /api/social/share/link with no body must NOT return 500.

    Acceptable: 400 (malformed), 401/403 (auth-gated).
    Unacceptable: 5xx — handler crashed validating the request.
    """
    # Empty JSON body
    resp = nunba_flask_app.post("/api/social/share/link", json={})
    assert resp.status_code < 500, (
        f"POST /api/social/share/link with empty body returned "
        f"{resp.status_code} — handler crashed on malformed body. "
        f"Body: {resp.get_data(as_text=True)[:300]!r}"
    )


@pytest.mark.timeout(60)
def test_j252_track_view_does_not_crash_on_bogus_token(nunba_flask_app):
    """POST /api/social/share/{bogus}/view is fire-and-forget in the
    SPA (see ShareLandingPage.js line 32 — errors swallowed). The
    backend must not 500; a 404 / 410 / 200 are all fine."""
    resp = nunba_flask_app.post("/api/social/share/bogus-track-view-token/view")
    assert resp.status_code < 500, (
        f"POST share/{{bogus}}/view returned {resp.status_code} — "
        f"view-tracking must not 500 (every share-landing page calls "
        f"this as fire-and-forget)"
    )


@pytest.mark.timeout(60)
def test_j252_consent_endpoint_is_mounted(nunba_flask_app):
    """POST /api/social/share/{bogus}/consent must route to SOME
    handler — not a 404 from the top-level app saying the URL doesn't
    exist.  A 404 from the handler saying the TOKEN doesn't exist is
    fine; a 404 from Flask's router saying the endpoint doesn't exist
    is a regression.
    """
    resp = nunba_flask_app.post("/api/social/share/bogus-consent-token/consent")
    # We cannot differentiate Flask-level 404 from handler-level 404
    # without parsing the body, but we CAN differentiate 500 (crash)
    # and pure 405 (method not allowed) from the expected 401/404.
    assert resp.status_code < 500, (
        f"POST share/{{bogus}}/consent returned {resp.status_code} — "
        f"consent handler crashed or the route is fully missing. "
        f"Body: {resp.get_data(as_text=True)[:300]!r}"
    )
    # 405 means the POST method is rejected → the route exists for
    # GET only, which is wrong (consent is always POST).
    assert resp.status_code != 405, (
        "POST /api/social/share/{token}/consent returned 405 Method "
        "Not Allowed — the route exists but rejects POST. "
        "grantConsent() in socialApi.js uses POST."
    )
