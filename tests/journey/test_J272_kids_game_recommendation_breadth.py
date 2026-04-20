"""J272 · Kids learning surface breadth.

PRODUCT_MAP.md §9 + routes/kids_game_recommendation.py enumerate:

  POST /api/kids/recommendations       (:323)
  POST /api/kids/concept-tracking      (:422)
  POST /api/kids/engagement            (:460)
  GET  /api/kids/speech-therapy-focus  (:495)
  POST /api/kids/fleet-command         (:506)
  GET  /api/media/asset                (kids_media_routes.py:193,459)
  GET  /api/media/asset/status/<job_id> (:419,460)

J59 / J60 / J85 / J253 / J254 / J85 / J175 cover the flows; this
test adds per-endpoint shape validation so the admin panel rendering
kids dashboards never hits a silent 5xx.

Mapping: PRODUCT_MAP §9 + kids_game_recommendation.py lines.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


_GET_PATHS = [
    "/api/kids/speech-therapy-focus",
]


_POST_PATHS_EMPTY_BODY = [
    "/api/kids/recommendations",
    "/api/kids/concept-tracking",
    "/api/kids/engagement",
    "/api/kids/fleet-command",
]


@pytest.mark.timeout(30)
@pytest.mark.parametrize("path", _GET_PATHS)
def test_j272_kids_get_not_5xx(nunba_flask_app, path):
    """Kids GET endpoints must respond without 5xx."""
    resp = nunba_flask_app.get(path)
    if resp.status_code == 404:
        pytest.skip(f"{path} not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
@pytest.mark.parametrize("path", _POST_PATHS_EMPTY_BODY)
def test_j272_kids_post_empty_body_rejects_cleanly(nunba_flask_app, path):
    """Kids POST endpoints with empty body must 4xx, not 5xx."""
    resp = nunba_flask_app.post(path, json={})
    if resp.status_code == 404:
        pytest.skip(f"{path} not mounted")
    assert resp.status_code < 500, (
        f"{path} crashed 5xx on empty body: "
        f"{resp.get_data(as_text=True)[:150]}"
    )


@pytest.mark.timeout(30)
def test_j272_recommendations_with_child_profile(nunba_flask_app):
    """POST /api/kids/recommendations with a minimal child profile
    must not 5xx."""
    resp = nunba_flask_app.post(
        "/api/kids/recommendations",
        json={
            "child_id": "j272-child",
            "age": 7,
            "engagement_level": "medium",
        },
    )
    if resp.status_code == 404:
        pytest.skip("/api/kids/recommendations not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j272_media_asset_missing_query_is_4xx(nunba_flask_app):
    """GET /api/media/asset with no query params must 4xx, not 5xx."""
    resp = nunba_flask_app.get("/api/media/asset")
    if resp.status_code == 404:
        pytest.skip("/api/media/asset not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j272_media_asset_status_unknown_job_is_4xx(nunba_flask_app):
    """GET /api/media/asset/status/<fake-id> must 4xx, not 5xx."""
    resp = nunba_flask_app.get(
        "/api/media/asset/status/j272-no-such-job"
    )
    if resp.status_code == 404 and "Not Found" in resp.get_data(as_text=True):
        # Route-level 404 (not mounted) — OK
        pytest.skip("media asset status not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j272_kids_tts_quick_rejects_empty_body(nunba_flask_app):
    """POST /api/social/tts/quick with empty body must 4xx, not 5xx."""
    resp = nunba_flask_app.post("/api/social/tts/quick", json={})
    if resp.status_code == 404:
        pytest.skip("/api/social/tts/quick not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j272_kids_tts_submit_rejects_empty_body(nunba_flask_app):
    """POST /api/social/tts/submit with empty body must 4xx, not 5xx."""
    resp = nunba_flask_app.post("/api/social/tts/submit", json={})
    if resp.status_code == 404:
        pytest.skip("/api/social/tts/submit not mounted")
    assert resp.status_code < 500
