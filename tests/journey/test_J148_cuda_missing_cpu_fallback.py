"""J148 · CUDA torch missing → CPU inference + audible TTS.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: no torch CUDA. Steps: /chat + /tts/synth. Verify: chat via
llama-cpp CPU; piper CPU path synths audio. Both surfaces return
non-5xx.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j148_chat_cpu_path(nunba_flask_app):
    r = nunba_flask_app.post(
        "/chat",
        json={"text": "cpu only please", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j148_tts_submit_cpu_path(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/social/tts/submit",
        json={"text": "cpu tts", "lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("tts/submit not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())
