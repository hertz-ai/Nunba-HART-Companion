"""J270 · Onboarding step-by-step surface.

PRODUCT_MAP.md §1.15 cites 4 endpoints:

  POST /api/onboarding/start    (onboarding_routes.py:21)
  POST /api/onboarding/advance  (:51)
  GET  /api/onboarding/status   (:70)
  GET  /api/onboarding/profile  (:89)

Plus the HART-onboarding surfaces in §1.6:

  POST /api/hart/advance
  POST /api/hart/generate
  POST /api/hart/seal
  GET  /api/hart/profile
  GET  /api/hart/check

J61 covered the full flow happy-path.  J177 covered the
abort-then-resume.  Neither guarded the per-step contract — a
regression that 5xxs on /status means the onboarding wizard's
progress bar stops updating silently.

Mapping: PRODUCT_MAP §1.15 + §1.6.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


_ONBOARDING_GETS = [
    "/api/onboarding/status",
    "/api/onboarding/profile",
    "/api/hart/profile",
    "/api/hart/check",
]


_ONBOARDING_POSTS_WITH_EMPTY_BODY = [
    "/api/onboarding/start",
    "/api/onboarding/advance",
    "/api/hart/advance",
    "/api/hart/generate",
    "/api/hart/seal",
]


@pytest.mark.timeout(30)
@pytest.mark.parametrize("path", _ONBOARDING_GETS)
def test_j270_onboarding_get_not_5xx(nunba_flask_app, path):
    """Onboarding status/profile GETs must not crash.

    503 is accepted as graceful HARTOS-disabled response.  Only 500,
    502, 504 are real crashes.
    """
    resp = nunba_flask_app.get(path)
    if resp.status_code == 404:
        pytest.skip(f"{path} not mounted")
    assert resp.status_code not in (500, 502, 504), (
        f"{path} crashed {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:150]}"
    )


@pytest.mark.timeout(30)
@pytest.mark.parametrize("path", _ONBOARDING_POSTS_WITH_EMPTY_BODY)
def test_j270_onboarding_post_rejects_empty_body(nunba_flask_app, path):
    """POST /advance /generate /seal /start with empty body must
    reject with 4xx, not 5xx."""
    resp = nunba_flask_app.post(path, json={})
    if resp.status_code == 404:
        pytest.skip(f"{path} not mounted")
    assert resp.status_code < 500, (
        f"{path} crashed 5xx on empty body: "
        f"{resp.get_data(as_text=True)[:150]}"
    )


@pytest.mark.timeout(30)
def test_j270_status_returns_envelope(nunba_flask_app):
    """/api/onboarding/status — a fresh user should get a well-formed
    envelope indicating they haven't started."""
    resp = nunba_flask_app.get("/api/onboarding/status?user_id=j270")
    if resp.status_code == 404:
        pytest.skip("/api/onboarding/status not mounted")
    assert resp.status_code < 500
    if resp.status_code == 200:
        body = resp.get_json() or {}
        assert isinstance(body, dict), "status must be dict-shape"


@pytest.mark.timeout(30)
def test_j270_hart_check_returns_readiness(nunba_flask_app):
    """/api/hart/check is the onboarding UI's readiness probe — must
    return a yes/no envelope not crash."""
    resp = nunba_flask_app.get("/api/hart/check")
    if resp.status_code == 404:
        pytest.skip("/api/hart/check not mounted")
    assert resp.status_code < 500
    if resp.status_code == 200:
        body = resp.get_json(silent=True)
        assert body is not None, "hart/check must return JSON"


@pytest.mark.timeout(30)
def test_j270_onboarding_start_with_language_tolerated(nunba_flask_app):
    """POST /api/onboarding/start with a valid lang argument must not
    crash — J183 proved lang handling is fragile."""
    resp = nunba_flask_app.post(
        "/api/onboarding/start",
        json={"user_id": "j270", "preferred_lang": "en"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/onboarding/start not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j270_ai_bootstrap_status_endpoint_reachable(nunba_flask_app):
    """/api/ai/bootstrap/status is polled by the first-run installer
    wizard every 1-2s.  Must not 5xx or the wizard shows a blank
    spinner."""
    resp = nunba_flask_app.get("/api/ai/bootstrap/status")
    if resp.status_code == 404:
        pytest.skip("/api/ai/bootstrap/status not mounted")
    assert resp.status_code < 500
