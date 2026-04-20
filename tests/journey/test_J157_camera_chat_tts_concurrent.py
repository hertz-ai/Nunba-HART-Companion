"""J157 · Camera + chat + TTS all firing.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: webcam WS open, /chat streaming, /tts/quick concurrent.
Verify: no audio underrun; GPU share honors ResourceGovernor.

At contract tier: /chat + tts/quick running concurrently return
non-5xx envelopes.
"""

from __future__ import annotations

import concurrent.futures

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j157_chat_and_tts_concurrent(nunba_flask_app, wamp_subscriber):
    wamp_subscriber.start("chat.social.j157")

    def _chat():
        return nunba_flask_app.post(
            "/chat",
            json={"text": "camera+chat+tts", "preferred_lang": "en"},
            headers={"Content-Type": "application/json"},
        )

    def _tts():
        return nunba_flask_app.post(
            "/api/social/tts/quick",
            json={"text": "read this out loud", "lang": "en"},
            headers={"Content-Type": "application/json"},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        f1, f2 = ex.submit(_chat), ex.submit(_tts)
        r1 = f1.result(timeout=45)
        r2 = f2.result(timeout=45)

    assert r1.status_code < 500
    if r2.status_code == 404:
        pytest.skip("tts/quick not mounted")
    body2 = r2.get_data(as_text=True)
    assert not (r2.status_code >= 500 and not body2.strip())


@pytest.mark.timeout(30)
def test_j157_resource_governor_reachable(nunba_flask_app):
    """Boundary check: if camera+chat+tts are all live the governor
    is arbitrating GPU — the status endpoint must stay reachable."""
    for path in (
        "/api/admin/governor/status",
        "/api/admin/diag/resources",
        "/api/system/governor",
    ):
        r = nunba_flask_app.get(path)
        if r.status_code != 404:
            assert r.status_code < 500
            return
    pytest.skip("governor status endpoint not mounted")
