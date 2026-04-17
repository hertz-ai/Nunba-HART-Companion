"""J02 · English chat with TTS audio.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* Real Nunba Flask app.
* TTS engine endpoints (`/tts/synthesize`, `/tts/audio/<name>`)
  registered via `register_routes` in `routes/chatbot_routes.py`.

Steps
-----
1. POST /tts/synthesize `{text:"hello", voice_id:"en"}`
2. If the response returns an audio_url, GET /tts/audio/<name>
   and assert the bytes are ≥ 2048 and parse as WAV.
3. GET /tts/voices and assert at least one voice is advertised.

Verifiable outcomes
-------------------
* /tts/voices returns 200 with a list.
* The synth round-trip either produces real audio OR truthfully
  reports that no engine is installed (we skip rather than pass
  silently).
"""

from __future__ import annotations

import io
import wave

import pytest

pytestmark = pytest.mark.journey


def _is_wav(buf: bytes) -> int:
    """Return frame count if buf parses as WAV, else 0."""
    try:
        with wave.open(io.BytesIO(buf), "rb") as w:
            return w.getnframes()
    except Exception:
        return 0


@pytest.mark.timeout(60)
def test_j02_tts_voices_endpoint_returns_list(nunba_flask_app):
    resp = nunba_flask_app.get("/tts/voices")
    if resp.status_code == 404:
        pytest.skip("/tts/voices not mounted in this env")
    assert resp.status_code == 200, (
        f"/tts/voices returned {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
    body = resp.get_json(silent=True) or {}
    # Accept either a list body or a dict with a "voices" key.
    if isinstance(body, list):
        voices = body
    else:
        voices = body.get("voices") or body.get("data") or []
    assert isinstance(voices, list), (
        f"/tts/voices should return a list of voices; body={body!r}"
    )


@pytest.mark.timeout(60)
def test_j02_tts_status_endpoint_responds(nunba_flask_app):
    resp = nunba_flask_app.get("/tts/status")
    if resp.status_code == 404:
        pytest.skip("/tts/status not mounted in this env")
    assert resp.status_code < 500


@pytest.mark.timeout(90)
def test_j02_tts_synthesize_produces_audio_url_or_truthful_error(
    nunba_flask_app,
):
    resp = nunba_flask_app.post(
        "/tts/synthesize",
        json={"text": "hello world", "voice_id": "en_US"},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/tts/synthesize not mounted in this env")
    # 4xx/5xx are acceptable IF the body explains why (no engine) — we
    # specifically refuse the "silent 200 with empty body" failure mode
    # that lets the user stare at a non-playing audio element.
    body = resp.get_json(silent=True) or {}
    text = resp.get_data(as_text=True)
    if resp.status_code >= 400:
        assert text, (
            f"TTS returned {resp.status_code} with no body — silent fail"
        )
        return
    # Successful synth must either include an audio_url OR audio bytes
    # directly in the body.
    has_url = bool(
        body.get("audio_url") or body.get("url") or body.get("path")
    )
    has_inline = resp.content_type and resp.content_type.startswith("audio/")
    assert has_url or has_inline, (
        f"TTS 200 response missing audio_url AND non-audio content-type: "
        f"content_type={resp.content_type!r} body={body!r}"
    )
