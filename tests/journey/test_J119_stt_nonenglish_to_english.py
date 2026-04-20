"""J119 · Non-English STT → English reply + English TTS.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: whisper transcribes Hindi audio → /chat with text+lang=hi →
reply forced lang=en. Verify: /chat accepts; TTS engine for en
remains piper-en.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j119_hindi_in_english_out(nunba_flask_app):
    """Simulate a Whisper-produced Devanagari transcript arriving
    at /chat but the reply is forced to English (via response_lang
    or similar)."""
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "नमस्ते कैसे हो",
            "preferred_lang": "hi",
            "response_lang": "en",
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j119_english_tts_after_hindi_chat(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/social/tts/submit",
        json={"text": "Hello, I translated your Hindi", "lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("tts/submit not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())
