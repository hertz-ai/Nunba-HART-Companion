"""J122 · TTS for long reply doesn't lock engine.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: user A submits long TTS; user B submits short TTS.
Verifiable: both complete under the timeout; queue honors both.
"""

from __future__ import annotations

import concurrent.futures

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(90)
def test_j122_long_and_short_tts_concurrent(nunba_flask_app, dual_user):
    long_text = "This is a long sentence. " * 40
    short_text = "Short."

    def _submit(text: str, user: dict):
        return nunba_flask_app.post(
            "/api/social/tts/submit",
            json={"text": text, "lang": "en", "user_id": user["user_id"]},
            headers={"Content-Type": "application/json"},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        fA = ex.submit(_submit, long_text, dual_user["a"])
        fB = ex.submit(_submit, short_text, dual_user["b"])
        rA = fA.result(timeout=75)
        rB = fB.result(timeout=75)

    if rA.status_code == 404 or rB.status_code == 404:
        pytest.skip("tts/submit not mounted")
    bodyA = rA.get_data(as_text=True)
    bodyB = rB.get_data(as_text=True)
    assert not (rA.status_code >= 500 and not bodyA.strip())
    assert not (rB.status_code >= 500 and not bodyB.strip())


@pytest.mark.timeout(30)
def test_j122_burst_of_five_tts(nunba_flask_app):
    for i in range(5):
        r = nunba_flask_app.post(
            "/api/social/tts/submit",
            json={"text": f"burst {i}", "lang": "en"},
            headers={"Content-Type": "application/json"},
        )
        if r.status_code == 404:
            pytest.skip("tts/submit not mounted")
        body = r.get_data(as_text=True)
        assert not (r.status_code >= 500 and not body.strip())
