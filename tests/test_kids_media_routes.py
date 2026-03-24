"""
test_kids_media_routes.py - Comprehensive tests for kids media route handlers.

Covers:
- GET /api/media/asset (all media types: image, tts, music, video)
- GET /api/media/asset/status/<job_id> (async job polling)
- Input validation (prompt, type, style, classification, speed)
- Auth / access control (JWT, private assets, anonymous)
- Cache hit / miss paths
- TTS synthesis flow
- Async job lifecycle (music/video)
- Helper functions: _cleanup_jobs, _get_user_id_from_request,
  _safe_send_file, _generate_image_via_agent, _download_and_cache
- Edge cases: path traversal, job cap, TTL expiration
"""
import json
import os
import sys
import time
from unittest.mock import MagicMock, patch

import pytest

# Ensure project root is importable
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_mock_classifier(tmp_path):
    """Build a mock classifier module with real-ish behavior rooted in tmp_path."""
    cache_root = str(tmp_path / "media_cache")
    os.makedirs(os.path.join(cache_root, "public", "image"), exist_ok=True)

    mock_classifier = MagicMock()
    mock_classifier.can_access.return_value = True
    mock_classifier.get_cache_path.side_effect = lambda sha, mt, cl, owner_id=None, ext='png': (
        os.path.join(cache_root, "public", mt, f"{sha}.{ext}")
    )

    def _cache_key(prompt, media_type, style=''):
        import hashlib
        raw = f"{media_type}:{prompt}:{style}".encode()
        return hashlib.sha256(raw).hexdigest()

    mock_register = MagicMock()
    mock_get_meta = MagicMock(return_value=None)

    return mock_classifier, _cache_key, mock_register, mock_get_meta, cache_root


@pytest.fixture
def media_app(tmp_path):
    """
    Create a minimal Flask app with kids_media_routes registered.
    Mocks the classifier/media_classification dependency.
    """
    from flask import Flask

    app = Flask(__name__)
    app.config["TESTING"] = True

    mock_classifier, cache_key_fn, mock_register, mock_get_meta, cache_root = _make_mock_classifier(tmp_path)

    with patch("routes.kids_media_routes._get_classifier") as mock_gc:
        mock_gc.return_value = (mock_classifier, cache_key_fn, mock_register, mock_get_meta, cache_root)

        from routes.kids_media_routes import register_routes
        register_routes(app)

    # Store references for tests
    app._test_mock_classifier = mock_classifier
    app._test_mock_register = mock_register
    app._test_mock_get_meta = mock_get_meta
    app._test_cache_root = cache_root
    app._test_cache_key = cache_key_fn

    return app


@pytest.fixture
def client(media_app):
    """Flask test client."""
    return media_app.test_client()


@pytest.fixture(autouse=True)
def _reset_module_state():
    """Reset module-level state between tests."""
    import routes.kids_media_routes as mod
    with mod._jobs_lock:
        mod._async_jobs.clear()
    mod._tts_synthesize = None
    mod._tts_available = False
    yield


# ---------------------------------------------------------------------------
# Tests: Input validation on /api/media/asset
# ---------------------------------------------------------------------------

class TestMediaAssetValidation:
    """Input validation for GET /api/media/asset."""

    def test_missing_prompt_returns_400(self, client, media_app):
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                resp = client.get("/api/media/asset")
        assert resp.status_code == 400
        assert resp.get_json()["error"] == "prompt parameter required"

    def test_empty_prompt_returns_400(self, client, media_app):
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                resp = client.get("/api/media/asset?prompt=")
        assert resp.status_code == 400

    def test_prompt_too_long_returns_400(self, client, media_app):
        long_prompt = "x" * 501
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                resp = client.get(f"/api/media/asset?prompt={long_prompt}")
        assert resp.status_code == 400
        assert "too long" in resp.get_json()["error"]

    def test_prompt_exactly_max_length_accepted(self, client, media_app):
        """Prompt at exactly 500 chars should not be rejected for length."""
        prompt = "a" * 500
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                with patch("routes.kids_media_routes._generate_image_via_agent", return_value=None):
                    resp = client.get(f"/api/media/asset?prompt={prompt}")
        # Should pass validation (503 = generation failed, not 400)
        assert resp.status_code != 400 or "too long" not in resp.get_json().get("error", "")

    def test_invalid_media_type_returns_400(self, client, media_app):
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                resp = client.get("/api/media/asset?prompt=hello&type=pdf")
        assert resp.status_code == 400
        assert "type must be" in resp.get_json()["error"]

    def test_invalid_style_falls_back_to_cartoon(self, client, media_app):
        """Invalid style should silently default to 'cartoon', not 400."""
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                with patch("routes.kids_media_routes._generate_image_via_agent", return_value=None) as mock_gen:
                    resp = client.get("/api/media/asset?prompt=cat&style=abstract")
        # Should not be 400 for style; will be 503 since generation returns None
        assert resp.status_code != 400

    def test_invalid_classification_falls_back_to_public(self, client, media_app):
        """Invalid classification should silently default, not 400."""
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                with patch("routes.kids_media_routes._generate_image_via_agent", return_value=None):
                    resp = client.get("/api/media/asset?prompt=cat&classification=top_secret")
        assert resp.status_code != 400


# ---------------------------------------------------------------------------
# Tests: Auth / access control
# ---------------------------------------------------------------------------

class TestMediaAssetAuth:
    """Auth and access control for media assets."""

    def test_private_asset_without_auth_returns_401(self, client, media_app):
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value=None):
                    resp = client.get("/api/media/asset?prompt=secret&classification=user_private")
        assert resp.status_code == 401
        assert "Authentication required" in resp.get_json()["error"]

    def test_agent_private_without_auth_returns_401(self, client, media_app):
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value=None):
                    resp = client.get("/api/media/asset?prompt=secret&classification=agent_private")
        assert resp.status_code == 401

    def test_public_asset_without_auth_allowed(self, client, media_app):
        """Public assets should not require authentication."""
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value=None):
                    with patch("routes.kids_media_routes._generate_image_via_agent", return_value=None):
                        resp = client.get("/api/media/asset?prompt=cat&classification=public_educational")
        # Should NOT be 401
        assert resp.status_code != 401

    def test_existing_asset_access_denied(self, client, media_app):
        """If asset exists but user cannot access it, return 403."""
        media_app._test_mock_get_meta.return_value = {"label": "user_private", "owner_id": "other_user"}
        media_app._test_mock_classifier.can_access.return_value = False

        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value="user123"):
                    resp = client.get("/api/media/asset?prompt=secret&classification=public_educational")
        assert resp.status_code == 403
        assert resp.get_json()["error"] == "access_denied"


# ---------------------------------------------------------------------------
# Tests: Image generation (cache miss)
# ---------------------------------------------------------------------------

class TestMediaAssetImage:
    """Image generation through agent pipeline."""

    def test_image_generation_success(self, client, media_app, tmp_path):
        cache_root = media_app._test_cache_root

        def mock_get_cache_path(sha, mt, cl, owner_id=None, ext='png'):
            p = os.path.join(cache_root, "public", mt, f"{sha}.{ext}")
            os.makedirs(os.path.dirname(p), exist_ok=True)
            return p

        media_app._test_mock_classifier.get_cache_path.side_effect = mock_get_cache_path

        def mock_download(url, path, timeout=30):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'wb') as f:
                f.write(b'\x89PNG' + b'\x00' * 100)
            return 104

        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value="user1"):
                    with patch("routes.kids_media_routes._generate_image_via_agent", return_value="https://example.com/img.png"):
                        with patch("routes.kids_media_routes._download_and_cache", side_effect=mock_download):
                            resp = client.get("/api/media/asset?prompt=a+cat&type=image")
        assert resp.status_code == 200

    def test_image_generation_failure_returns_503(self, client, media_app):
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value="user1"):
                    with patch("routes.kids_media_routes._generate_image_via_agent", return_value=None):
                        resp = client.get("/api/media/asset?prompt=a+cat&type=image")
        assert resp.status_code == 503
        data = resp.get_json()
        assert data["error"] == "generation_failed"
        assert data["fallback"] == "emoji"

    def test_image_download_fails_returns_503(self, client, media_app):
        """Agent returns URL but download returns 0 bytes."""
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value="user1"):
                    with patch("routes.kids_media_routes._generate_image_via_agent", return_value="https://example.com/img.png"):
                        with patch("routes.kids_media_routes._download_and_cache", return_value=0):
                            resp = client.get("/api/media/asset?prompt=cat&type=image")
        assert resp.status_code == 503


# ---------------------------------------------------------------------------
# Tests: TTS generation
# ---------------------------------------------------------------------------

class TestMediaAssetTTS:
    """TTS synthesis flow."""

    def test_tts_not_available_returns_503(self, client, media_app):
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value="user1"):
                    with patch("routes.kids_media_routes._get_tts", return_value=(MagicMock(), False)):
                        resp = client.get("/api/media/asset?prompt=hello&type=tts")
        assert resp.status_code == 503
        assert resp.get_json()["error"] == "tts_not_available"

    def test_tts_synthesis_success(self, client, media_app, tmp_path):
        audio_file = str(tmp_path / "synth.wav")
        with open(audio_file, 'wb') as f:
            f.write(b'RIFF' + b'\x00' * 100)

        cache_root = media_app._test_cache_root

        def mock_get_cache_path(sha, mt, cl, owner_id=None, ext='png'):
            p = os.path.join(cache_root, "public", mt, f"{sha}.{ext}")
            os.makedirs(os.path.dirname(p), exist_ok=True)
            return p

        media_app._test_mock_classifier.get_cache_path.side_effect = mock_get_cache_path

        mock_synth = MagicMock(return_value=audio_file)

        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value="user1"):
                    with patch("routes.kids_media_routes._get_tts", return_value=(mock_synth, True)):
                        resp = client.get("/api/media/asset?prompt=hello+world&type=tts&voice=nova&speed=1.5")
        assert resp.status_code == 200
        mock_synth.assert_called_once()
        call_kwargs = mock_synth.call_args
        assert call_kwargs[1]["voice"] == "nova"
        assert call_kwargs[1]["speed"] == 1.5

    def test_tts_synthesis_returns_none_503(self, client, media_app):
        mock_synth = MagicMock(return_value=None)
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value="user1"):
                    with patch("routes.kids_media_routes._get_tts", return_value=(mock_synth, True)):
                        resp = client.get("/api/media/asset?prompt=hello&type=tts")
        assert resp.status_code == 503
        assert resp.get_json()["error"] == "tts_synthesis_failed"

    def test_tts_speed_clamped_low(self, client, media_app, tmp_path):
        """Speed below 0.25 should be clamped to 0.25."""
        audio_file = str(tmp_path / "synth.wav")
        with open(audio_file, 'wb') as f:
            f.write(b'RIFF' + b'\x00' * 100)

        cache_root = media_app._test_cache_root

        def mock_get_cache_path(sha, mt, cl, owner_id=None, ext='png'):
            p = os.path.join(cache_root, "public", mt, f"{sha}.{ext}")
            os.makedirs(os.path.dirname(p), exist_ok=True)
            return p

        media_app._test_mock_classifier.get_cache_path.side_effect = mock_get_cache_path
        mock_synth = MagicMock(return_value=audio_file)

        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value="u"):
                    with patch("routes.kids_media_routes._get_tts", return_value=(mock_synth, True)):
                        resp = client.get("/api/media/asset?prompt=hi&type=tts&speed=0.1")
        assert mock_synth.call_args[1]["speed"] == 0.25

    def test_tts_speed_clamped_high(self, client, media_app, tmp_path):
        """Speed above 4.0 should be clamped to 4.0."""
        audio_file = str(tmp_path / "synth.wav")
        with open(audio_file, 'wb') as f:
            f.write(b'RIFF' + b'\x00' * 100)

        cache_root = media_app._test_cache_root

        def mock_get_cache_path(sha, mt, cl, owner_id=None, ext='png'):
            p = os.path.join(cache_root, "public", mt, f"{sha}.{ext}")
            os.makedirs(os.path.dirname(p), exist_ok=True)
            return p

        media_app._test_mock_classifier.get_cache_path.side_effect = mock_get_cache_path
        mock_synth = MagicMock(return_value=audio_file)

        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value="u"):
                    with patch("routes.kids_media_routes._get_tts", return_value=(mock_synth, True)):
                        resp = client.get("/api/media/asset?prompt=hi&type=tts&speed=10.0")
        assert mock_synth.call_args[1]["speed"] == 4.0

    def test_tts_speed_invalid_string_defaults_to_1(self, client, media_app, tmp_path):
        """Non-numeric speed should default to 1.0."""
        audio_file = str(tmp_path / "synth.wav")
        with open(audio_file, 'wb') as f:
            f.write(b'RIFF' + b'\x00' * 100)

        cache_root = media_app._test_cache_root

        def mock_get_cache_path(sha, mt, cl, owner_id=None, ext='png'):
            p = os.path.join(cache_root, "public", mt, f"{sha}.{ext}")
            os.makedirs(os.path.dirname(p), exist_ok=True)
            return p

        media_app._test_mock_classifier.get_cache_path.side_effect = mock_get_cache_path
        mock_synth = MagicMock(return_value=audio_file)

        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value="u"):
                    with patch("routes.kids_media_routes._get_tts", return_value=(mock_synth, True)):
                        resp = client.get("/api/media/asset?prompt=hi&type=tts&speed=notanumber")
        assert mock_synth.call_args[1]["speed"] == 1.0


# ---------------------------------------------------------------------------
# Tests: Music/Video async generation
# ---------------------------------------------------------------------------

class TestMediaAssetAsync:
    """Async generation (music/video) returns 202 with job_id."""

    def test_music_returns_202_with_job_id(self, client, media_app):
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value="u1"):
                    # Patch _async_generate to prevent actual thread work
                    with patch("routes.kids_media_routes._async_generate"):
                        resp = client.get("/api/media/asset?prompt=happy+tune&type=music")
        assert resp.status_code == 202
        data = resp.get_json()
        assert data["status"] == "pending"
        assert "job_id" in data
        assert data["job_id"].startswith("music_")
        assert "poll_url" in data

    def test_video_returns_202_with_job_id(self, client, media_app):
        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value="u1"):
                    with patch("routes.kids_media_routes._async_generate"):
                        resp = client.get("/api/media/asset?prompt=dancing+cat&type=video")
        assert resp.status_code == 202
        data = resp.get_json()
        assert data["job_id"].startswith("video_")

    def test_too_many_jobs_returns_429(self, client, media_app):
        """When job cap is reached, return 429."""
        import routes.kids_media_routes as mod
        # Fill jobs to MAX
        with mod._jobs_lock:
            for i in range(mod._MAX_JOBS):
                mod._async_jobs[f"music_{i:012x}"] = {
                    "status": "pending",
                    "created": time.time(),
                }

        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    media_app._test_cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value="u1"):
                    with patch("routes.kids_media_routes._async_generate"):
                        resp = client.get("/api/media/asset?prompt=tune&type=music")
        assert resp.status_code == 429


# ---------------------------------------------------------------------------
# Tests: Job status polling /api/media/asset/status/<job_id>
# ---------------------------------------------------------------------------

class TestMediaAssetStatus:
    """GET /api/media/asset/status/<job_id>."""

    def test_invalid_job_id_format_returns_400(self, client):
        resp = client.get("/api/media/asset/status/invalid_id")
        assert resp.status_code == 400
        assert "invalid job_id" in resp.get_json()["error"]

    def test_nonexistent_job_returns_404(self, client):
        resp = client.get("/api/media/asset/status/music_aabbccddeeff")
        assert resp.status_code == 404
        assert resp.get_json()["error"] == "job_not_found"

    def test_pending_job_returns_status(self, client):
        import routes.kids_media_routes as mod
        job_id = "music_aabbccddeeff"
        with mod._jobs_lock:
            mod._async_jobs[job_id] = {
                "status": "pending",
                "classification": "public_educational",
                "created": time.time(),
            }
        resp = client.get(f"/api/media/asset/status/{job_id}")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "pending"
        assert data["job_id"] == job_id

    def test_failed_job_returns_error(self, client):
        import routes.kids_media_routes as mod
        job_id = "video_112233445566"
        with mod._jobs_lock:
            mod._async_jobs[job_id] = {
                "status": "failed",
                "error": "generation_failed",
                "classification": "public_educational",
                "created": time.time(),
            }
        resp = client.get(f"/api/media/asset/status/{job_id}")
        data = resp.get_json()
        assert data["status"] == "failed"
        assert data["error"] == "generation_failed"

    def test_complete_job_serves_file(self, client, media_app, tmp_path):
        import routes.kids_media_routes as mod
        job_id = "music_aabbccddeeff"

        cache_root = media_app._test_cache_root
        result_path = os.path.join(cache_root, "public", "music", "test.mp3")
        os.makedirs(os.path.dirname(result_path), exist_ok=True)
        with open(result_path, 'wb') as f:
            f.write(b'\xff\xfb' + b'\x00' * 100)

        with mod._jobs_lock:
            mod._async_jobs[job_id] = {
                "status": "complete",
                "result_path": result_path,
                "media_type": "music",
                "classification": "public_educational",
                "created": time.time(),
            }

        with patch("routes.kids_media_routes._get_classifier") as gc:
            gc.return_value = (
                media_app._test_mock_classifier,
                media_app._test_cache_key,
                media_app._test_mock_register,
                media_app._test_mock_get_meta,
                cache_root,
            )
            resp = client.get(f"/api/media/asset/status/{job_id}")
        assert resp.status_code == 200

    def test_private_job_access_denied_wrong_user(self, client):
        """Private job polled by a different user returns 403."""
        import routes.kids_media_routes as mod
        job_id = "music_aabbccddeeff"
        with mod._jobs_lock:
            mod._async_jobs[job_id] = {
                "status": "pending",
                "classification": "user_private",
                "user_id": "owner_user",
                "created": time.time(),
            }

        with patch("routes.kids_media_routes._get_user_id_from_request", return_value="other_user"):
            resp = client.get(f"/api/media/asset/status/{job_id}")
        assert resp.status_code == 403

    def test_private_job_access_allowed_correct_user(self, client):
        """Private job polled by the owner returns status."""
        import routes.kids_media_routes as mod
        job_id = "video_112233445566"
        with mod._jobs_lock:
            mod._async_jobs[job_id] = {
                "status": "pending",
                "classification": "user_private",
                "user_id": "owner_user",
                "created": time.time(),
            }

        with patch("routes.kids_media_routes._get_user_id_from_request", return_value="owner_user"):
            resp = client.get(f"/api/media/asset/status/{job_id}")
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "pending"


# ---------------------------------------------------------------------------
# Tests: Helper functions (unit tests, no Flask needed)
# ---------------------------------------------------------------------------

class TestCleanupJobs:
    """Test _cleanup_jobs TTL expiration."""

    def test_removes_expired_jobs(self):
        import routes.kids_media_routes as mod
        with mod._jobs_lock:
            mod._async_jobs["old_job"] = {"status": "complete", "created": time.time() - 700}
            mod._async_jobs["new_job"] = {"status": "pending", "created": time.time()}
        mod._cleanup_jobs()
        with mod._jobs_lock:
            assert "old_job" not in mod._async_jobs
            assert "new_job" in mod._async_jobs

    def test_keeps_recent_jobs(self):
        import routes.kids_media_routes as mod
        with mod._jobs_lock:
            mod._async_jobs["recent"] = {"status": "pending", "created": time.time()}
        mod._cleanup_jobs()
        with mod._jobs_lock:
            assert "recent" in mod._async_jobs


class TestSafeSendFile:
    """Test _safe_send_file path traversal prevention."""

    def test_blocks_path_traversal(self, media_app):
        from routes.kids_media_routes import _safe_send_file
        with media_app.app_context():
            cache_root = media_app._test_cache_root
            # Try to escape cache root
            traversal_path = os.path.join(cache_root, "..", "..", "etc", "passwd")
            resp = _safe_send_file(traversal_path, "text/plain", cache_root)
            # Returns tuple (response, status_code)
            assert resp[1] == 403

    def test_allows_valid_path(self, media_app, tmp_path):
        from routes.kids_media_routes import _safe_send_file
        cache_root = media_app._test_cache_root
        valid_file = os.path.join(cache_root, "public", "image", "test.png")
        os.makedirs(os.path.dirname(valid_file), exist_ok=True)
        with open(valid_file, 'wb') as f:
            f.write(b'\x89PNG' + b'\x00' * 10)

        with media_app.app_context():
            resp = _safe_send_file(valid_file, "image/png", cache_root)
            # send_file returns a Response object, not a tuple
            assert hasattr(resp, 'status_code') and resp.status_code == 200


class TestGetTTS:
    """Test _get_tts lazy loading."""

    def test_returns_lambda_on_import_error(self):
        import routes.kids_media_routes as mod
        mod._tts_synthesize = None
        mod._tts_available = False
        with patch.dict("sys.modules", {"tts.tts_engine": None}):
            # Force re-import by resetting
            mod._tts_synthesize = None
            synth, available = mod._get_tts()
        # Should return a fallback lambda, not crash
        assert callable(synth)
        assert available is False

    def test_returns_real_synth_when_available(self):
        import routes.kids_media_routes as mod
        mod._tts_synthesize = None
        mock_module = MagicMock()
        mock_module.synthesize_text = MagicMock()
        mock_module.get_tts_status.return_value = {"available": True}
        with patch.dict("sys.modules", {"tts": MagicMock(), "tts.tts_engine": mock_module}):
            mod._tts_synthesize = None
            synth, available = mod._get_tts()
        assert synth is mock_module.synthesize_text
        assert available is True


class TestDownloadAndCache:
    """Test _download_and_cache."""

    def test_successful_download(self, tmp_path):
        from routes.kids_media_routes import _download_and_cache
        cache_path = str(tmp_path / "subdir" / "file.png")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.iter_content.return_value = [b'\x89PNG', b'\x00' * 50]

        with patch("routes.kids_media_routes.req.get", return_value=mock_resp) as mock_get:
            # The function imports `requests as req` locally, so we need to patch it there
            import requests as req_mod
            with patch.object(req_mod, 'get', return_value=mock_resp):
                size = _download_and_cache("https://example.com/img.png", cache_path)
        assert os.path.isfile(cache_path)
        assert size > 0

    def test_failed_download_returns_zero(self, tmp_path):
        from routes.kids_media_routes import _download_and_cache
        cache_path = str(tmp_path / "file.png")

        import requests as req_mod
        with patch.object(req_mod, 'get', side_effect=Exception("connection error")):
            size = _download_and_cache("https://example.com/img.png", cache_path)
        assert size == 0
        assert not os.path.isfile(cache_path)


class TestGenerateImageViaAgent:
    """Test _generate_image_via_agent."""

    def test_extracts_url_from_response(self):
        from routes.kids_media_routes import _generate_image_via_agent
        mock_adapter = MagicMock()
        mock_adapter.chat.return_value = {"text": "Here is your image: https://cdn.example.com/cat.png"}
        with patch("routes.kids_media_routes.adapter", mock_adapter):
            with patch.dict("sys.modules", {"routes.hartos_backend_adapter": mock_adapter}):
                url = _generate_image_via_agent("a cat", "user1", "cartoon")
        assert url == "https://cdn.example.com/cat.png"

    def test_returns_none_on_exception(self):
        from routes.kids_media_routes import _generate_image_via_agent
        mock_adapter = MagicMock()
        mock_adapter.chat.side_effect = Exception("adapter down")
        with patch("routes.kids_media_routes.adapter", mock_adapter):
            with patch.dict("sys.modules", {"routes.hartos_backend_adapter": mock_adapter}):
                url = _generate_image_via_agent("a cat", "user1")
        assert url is None

    def test_extracts_url_from_json_response(self):
        from routes.kids_media_routes import _generate_image_via_agent
        mock_adapter = MagicMock()
        mock_adapter.chat.return_value = {
            "text": json.dumps({"img_url": "https://cdn.example.com/dog.png"})
        }
        with patch("routes.kids_media_routes.adapter", mock_adapter):
            with patch.dict("sys.modules", {"routes.hartos_backend_adapter": mock_adapter}):
                url = _generate_image_via_agent("a dog", "user1")
        assert url == "https://cdn.example.com/dog.png"

    def test_returns_none_for_no_url_in_response(self):
        from routes.kids_media_routes import _generate_image_via_agent
        mock_adapter = MagicMock()
        mock_adapter.chat.return_value = {"text": "Sorry, I could not generate an image."}
        with patch("routes.kids_media_routes.adapter", mock_adapter):
            with patch.dict("sys.modules", {"routes.hartos_backend_adapter": mock_adapter}):
                url = _generate_image_via_agent("a cat", "user1")
        assert url is None


class TestGetUserIdFromRequest:
    """Test _get_user_id_from_request JWT extraction."""

    def test_returns_none_without_auth(self, media_app):
        from routes.kids_media_routes import _get_user_id_from_request
        with media_app.test_request_context(
            "/api/media/asset",
            environ_base={"REMOTE_ADDR": "192.168.1.1"},
        ):
            uid = _get_user_id_from_request()
        assert uid is None

    def test_returns_user_id_from_query_param_for_localhost(self, media_app):
        """Localhost dev fallback: accepts user_id from query param."""
        from routes.kids_media_routes import _get_user_id_from_request
        with media_app.test_request_context(
            "/api/media/asset?user_id=devuser",
            environ_base={"REMOTE_ADDR": "127.0.0.1"},
        ):
            uid = _get_user_id_from_request()
        assert uid == "devuser"

    def test_decodes_valid_jwt(self, media_app):
        """Valid JWT with SOCIAL_SECRET_KEY should return user_id."""
        import jwt as pyjwt

        from routes.kids_media_routes import _get_user_id_from_request
        secret = "a" * 32
        token = pyjwt.encode({"user_id": "jwt_user"}, secret, algorithm="HS256")
        with patch.dict(os.environ, {"SOCIAL_SECRET_KEY": secret}):
            with media_app.test_request_context(
                "/api/media/asset",
                headers={"Authorization": f"Bearer {token}"},
            ):
                uid = _get_user_id_from_request()
        assert uid == "jwt_user"

    def test_returns_none_for_invalid_jwt(self, media_app):
        """Invalid JWT token should return None (not crash)."""
        from routes.kids_media_routes import _get_user_id_from_request
        with patch.dict(os.environ, {"SOCIAL_SECRET_KEY": "b" * 32}):
            with media_app.test_request_context(
                "/api/media/asset",
                headers={"Authorization": "Bearer invalid.token.here"},
                environ_base={"REMOTE_ADDR": "192.168.1.1"},
            ):
                uid = _get_user_id_from_request()
        assert uid is None


# ---------------------------------------------------------------------------
# Tests: Cache hit path
# ---------------------------------------------------------------------------

class TestMediaAssetCacheHit:
    """When a cached file already exists, serve it directly."""

    def test_cache_hit_serves_file(self, client, media_app):
        cache_root = media_app._test_cache_root

        def mock_get_cache_path(sha, mt, cl, owner_id=None, ext='png'):
            p = os.path.join(cache_root, "public", mt, f"{sha}.{ext}")
            os.makedirs(os.path.dirname(p), exist_ok=True)
            return p

        media_app._test_mock_classifier.get_cache_path.side_effect = mock_get_cache_path

        # Pre-create the cached file
        import hashlib
        sha = hashlib.sha256(b"image:cached cat:cartoon").hexdigest()
        cached_file = os.path.join(cache_root, "public", "image", f"{sha}.png")
        os.makedirs(os.path.dirname(cached_file), exist_ok=True)
        with open(cached_file, 'wb') as f:
            f.write(b'\x89PNG\r\n\x1a\n' + b'\x00' * 50)

        with media_app.app_context():
            with patch("routes.kids_media_routes._get_classifier") as gc:
                gc.return_value = (
                    media_app._test_mock_classifier,
                    media_app._test_cache_key,
                    media_app._test_mock_register,
                    media_app._test_mock_get_meta,
                    cache_root,
                )
                with patch("routes.kids_media_routes._get_user_id_from_request", return_value="u"):
                    resp = client.get("/api/media/asset?prompt=cached+cat&type=image&style=cartoon")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Tests: register_routes
# ---------------------------------------------------------------------------

class TestRegisterRoutes:
    """Test that register_routes wires both endpoints."""

    def test_registers_both_routes(self):
        from flask import Flask

        from routes.kids_media_routes import register_routes
        app = Flask(__name__)
        register_routes(app)
        rules = [r.rule for r in app.url_map.iter_rules()]
        assert "/api/media/asset" in rules
        assert "/api/media/asset/status/<job_id>" in rules
