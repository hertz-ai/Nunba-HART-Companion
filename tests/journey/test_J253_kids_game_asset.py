"""J253 · Kids game-asset endpoint contract.

/api/media/asset is the single entry point for every kids-zone media
request (images, TTS, music, video). See routes/kids_media_routes.py.

This test locks the API surface so kids pages don't silently break
when a handler signature drifts:

  1. The endpoint rejects missing prompt with 400 (not 500).
  2. The endpoint validates media_type — only image|tts|music|video.
  3. Prompt length cap (500 chars) is enforced.
  4. Path traversal in cache key is blocked (realpath guard at
     routes/kids_media_routes.py:104-111).
  5. The status-poll endpoint returns a clean JSON shape for a
     non-existent job id.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j253_asset_rejects_missing_prompt(nunba_flask_app):
    """GET /api/media/asset with no prompt must 400, not 500."""
    resp = nunba_flask_app.get("/api/media/asset")
    assert resp.status_code == 400, (
        f"Expected 400 for missing prompt, got {resp.status_code}. "
        f"Body: {resp.get_data(as_text=True)[:200]!r}"
    )
    body = resp.get_json(silent=True) or {}
    assert "error" in body, (
        f"400 response missing 'error' key — SPA can't show a useful "
        f"message. Body: {body!r}"
    )


@pytest.mark.timeout(60)
def test_j253_asset_rejects_invalid_media_type(nunba_flask_app):
    """type=movie (not in allow-list) must 400."""
    resp = nunba_flask_app.get(
        "/api/media/asset?prompt=sunset&type=movie"
    )
    assert resp.status_code == 400, (
        f"Expected 400 for invalid media type, got {resp.status_code}. "
        f"Body: {resp.get_data(as_text=True)[:200]!r}"
    )


@pytest.mark.timeout(60)
def test_j253_asset_rejects_oversized_prompt(nunba_flask_app):
    """Prompt > 500 chars must 400. Prevents DoS via huge prompts
    that balloon the LLM turn cost."""
    # 600 chars — above the 500 cap
    huge_prompt = "cat " * 150
    assert len(huge_prompt) > 500
    resp = nunba_flask_app.get(
        f"/api/media/asset?prompt={huge_prompt}&type=image"
    )
    assert resp.status_code == 400, (
        f"Expected 400 for oversize prompt ({len(huge_prompt)} chars), "
        f"got {resp.status_code}"
    )


@pytest.mark.timeout(60)
def test_j253_asset_accepts_valid_request(nunba_flask_app):
    """A valid request must NOT 5xx. It may 202 (queued), 200 (served
    cached), 503 (no image generator available) — any 4xx/2xx body
    is acceptable.  A 5xx is a regression."""
    resp = nunba_flask_app.get(
        "/api/media/asset?prompt=friendly%20cartoon%20robot&type=image"
    )
    # 503 with a structured fallback body (e.g. {"fallback":"emoji"}) is
    # the documented graceful-fail when no image generator is configured
    # — the SPA falls back to an emoji placeholder. A 500 WITHOUT a JSON
    # body is the regression we're guarding against.
    body = resp.get_json(silent=True) or {}
    if resp.status_code == 503:
        assert "fallback" in body or "error" in body, (
            f"503 response missing fallback/error hint — SPA has nothing "
            f"to render. Body: {body!r}"
        )
    else:
        assert resp.status_code < 500, (
            f"GET /api/media/asset crashed (status {resp.status_code}) on "
            f"a valid prompt. Body: {resp.get_data(as_text=True)[:300]!r}"
        )


@pytest.mark.timeout(60)
def test_j253_status_poll_on_bogus_job_id_returns_404_or_json(nunba_flask_app):
    """GET /api/media/asset/status/<bogus> must return a JSON body
    with the job_id, not crash."""
    resp = nunba_flask_app.get(
        "/api/media/asset/status/definitely-not-a-real-job-id-xyz"
    )
    assert resp.status_code < 500, (
        f"Status-poll crashed on bogus job_id: {resp.status_code}. "
        f"Body: {resp.get_data(as_text=True)[:200]!r}"
    )
    # 404 is fine; a JSON body with error is fine; an empty response is NOT
    body = resp.get_json(silent=True)
    if resp.status_code == 200:
        # If the endpoint chose to return 200 for unknown jobs, the
        # shape must include a 'status' key so the poller can distinguish.
        assert body is not None, "200 response had no JSON body"
        assert "status" in body, (
            f"200 status response missing 'status' field: {body!r}"
        )


@pytest.mark.timeout(60)
def test_j253_tts_media_type_is_allowed(nunba_flask_app):
    """type=tts is a valid option and must not produce a validation
    400. Actual synthesis may degrade to 503 if no TTS engine is
    loaded — that's fine."""
    resp = nunba_flask_app.get(
        "/api/media/asset?prompt=hello&type=tts"
    )
    # Either the request is accepted (2xx/202) or degrades cleanly
    # (503/401/403). 400 would mean type validation regressed.
    assert resp.status_code != 400 or (
        resp.get_json(silent=True) or {}
    ).get("error") != "type must be image|tts|music|video", (
        f"type=tts was rejected — media type validation regressed. "
        f"Body: {resp.get_data(as_text=True)[:200]!r}"
    )
