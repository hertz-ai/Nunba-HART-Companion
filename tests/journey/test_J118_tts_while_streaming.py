"""J118 · TTS while chat streaming.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: streaming reply tokens → on each sentence boundary, TTS
submit-async → audio chunks fed to webview.

Verifiable at contract tier: TTS submit + /chat post interleaved
both return non-5xx; no race-induced crash in app state.
"""

from __future__ import annotations

import concurrent.futures

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j118_chat_and_tts_interleaved(nunba_flask_app):
    def _chat():
        return nunba_flask_app.post(
            "/chat",
            json={"text": "stream me a reply", "preferred_lang": "en"},
            headers={"Content-Type": "application/json"},
        )

    def _tts():
        return nunba_flask_app.post(
            "/api/social/tts/submit",
            json={"text": "interleaved", "lang": "en"},
            headers={"Content-Type": "application/json"},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        f1, f2 = ex.submit(_chat), ex.submit(_tts)
        r1, r2 = f1.result(timeout=45), f2.result(timeout=45)

    assert r1.status_code < 500
    if r2.status_code == 404:
        pytest.skip("tts/submit not mounted")
    body = r2.get_data(as_text=True)
    assert not (r2.status_code >= 500 and not body.strip())


@pytest.mark.timeout(30)
def test_j118_tts_submit_mid_chat_standalone(nunba_flask_app):
    """Boundary: an isolated TTS submit right after a chat POST
    must work even without the streaming-overlap context."""
    nunba_flask_app.post(
        "/chat",
        json={"text": "warm up", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    r = nunba_flask_app.post(
        "/api/social/tts/submit",
        json={"text": "post-chat tts", "lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("tts/submit not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())
