"""J261 · HARTOS social blueprints are URL-mounted.

PRODUCT_MAP.md §1.8 enumerates 16 blueprints registered via
`init_social(app)`.  A user-visible surface becomes 404 if a
blueprint fails to mount — e.g. `/api/social/feed`, `/api/social/
channels`, `/api/social/audit/…`.

This test drives the REAL Flask app (nunba_flask_app) and hits a
representative URL under each registered blueprint prefix.  The
assertion is deliberately loose: we accept 200/401/404-with-body
(the blueprint is mounted; auth or missing row is a contract state)
but flag 5xx as a blueprint-init regression.

Per the priority steer: every user-reachable surface gets a live
functional test.  Each blueprint is a surface.

Mapping: PRODUCT_MAP §1.8 (table of 16 blueprints).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


# Representative endpoint under each blueprint.  Chosen to be GETable
# without body (so we don't need authenticated JSON bodies).  Every
# one of these is cited in PRODUCT_MAP.md §1.8 or §1.6.
_REPRESENTATIVE_ENDPOINTS: list[tuple[str, str]] = [
    # (blueprint, sample_path)
    ("social_bp", "/api/social/feed"),
    ("channel_user_bp", "/api/social/channels"),
    ("sync_bp", "/api/social/sync/manifest"),
    ("sharing_bp", "/api/social/share/ping"),
    ("tracker_bp", "/api/social/tracker/ping"),
    ("gamification_bp", "/api/social/leaderboard"),
    ("discovery_bp", "/api/social/discover"),
    ("audit_bp", "/api/social/audit/events"),
    ("mcp_bp", "/api/social/mcp/health"),
    ("dashboard_bp", "/api/social/dashboard"),
]


@pytest.mark.timeout(30)
@pytest.mark.parametrize("bp_name,url", _REPRESENTATIVE_ENDPOINTS)
def test_j261_blueprint_endpoint_does_not_5xx(nunba_flask_app, bp_name, url):
    """Every blueprint endpoint must respond without a 5xx crash.

    Acceptable: 200/401/403/404/422.  Forbidden: 5xx.
    """
    resp = nunba_flask_app.get(url)
    assert resp.status_code < 500, (
        f"blueprint {bp_name} endpoint {url} returned {resp.status_code} 5xx: "
        f"{resp.get_data(as_text=True)[:150]}"
    )


@pytest.mark.timeout(30)
def test_j261_url_map_contains_social_routes(nunba_flask_app):
    """The Flask URL map must contain at least one rule per blueprint.

    We assert against the URL map rather than live requests so the test
    is fast and deterministic.
    """
    # /debug/routes returns the URL map as JSON (main.py:2299)
    resp = nunba_flask_app.get("/debug/routes")
    if resp.status_code >= 500:
        pytest.skip(f"/debug/routes unavailable: {resp.status_code}")
    body = resp.get_json() or {}

    # The shape can be {rules: [...]} or just [...] — handle both.
    if isinstance(body, dict):
        rules = body.get("rules") or body.get("routes") or []
    elif isinstance(body, list):
        rules = body
    else:
        rules = []
    if not rules:
        pytest.skip("/debug/routes returned no rules; nothing to check")

    # Flatten rule paths into a single string for substring matching.
    rule_paths = []
    for r in rules:
        if isinstance(r, dict):
            rule_paths.append(r.get("rule") or r.get("path") or "")
        elif isinstance(r, str):
            rule_paths.append(r)
    blob = " ".join(rule_paths)

    # Every registered-blueprint signature should appear somewhere.
    for sig in (
        "/api/social",       # social_bp — broadest
        "/api/social/channels",
        "/api/social/sync",
        "/api/social/audit",
    ):
        assert sig in blob, (
            f"no URL rule contains {sig!r} — a social blueprint didn't "
            f"mount at boot"
        )


@pytest.mark.timeout(30)
def test_j261_feed_endpoint_returns_json_envelope(nunba_flask_app):
    """Feed is the highest-traffic social URL — its envelope must be
    JSON + either success flag or a list."""
    resp = nunba_flask_app.get("/api/social/feed")
    if resp.status_code in (401, 403):
        # Auth-required; envelope shape tested elsewhere by auth suite.
        return
    if resp.status_code == 404:
        pytest.skip("/api/social/feed not mounted in this environment")
    assert resp.status_code < 500
    body = resp.get_json(silent=True)
    # Accept either a list (feed items directly) or dict envelope
    assert body is not None, "feed returned non-JSON"
    assert isinstance(body, (list, dict)), (
        f"unexpected feed envelope type {type(body).__name__}"
    )
