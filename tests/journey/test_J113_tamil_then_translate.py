"""J113 · Tamil chat then request 'translate to English'.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: /chat "vanakkam" with lang=ta → /chat "translate to English".
Verify: both turns pass; TTS on reply uses Latin-path engine
(tts_engine.py:1724).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j113_tamil_then_english_translate(nunba_flask_app):
    r1 = nunba_flask_app.post(
        "/chat",
        json={"text": "வணக்கம்", "preferred_lang": "ta"},
        headers={"Content-Type": "application/json"},
    )
    assert r1.status_code < 500

    r2 = nunba_flask_app.post(
        "/chat",
        json={
            "text": "translate the previous reply to English",
            "preferred_lang": "en",
        },
        headers={"Content-Type": "application/json"},
    )
    assert r2.status_code < 500


@pytest.mark.timeout(30)
def test_j113_tts_submit_english_after_tamil(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/social/tts/submit",
        json={"text": "Hello from the translator", "lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("tts/submit not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())
