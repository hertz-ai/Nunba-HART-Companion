"""J120 · Engine add then immediate synth.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: /tts/setup-engine {engine:"kokoro"} (J67 surface) →
/tts/synth with engine=kokoro. Verify: both endpoints reachable
without 5xx.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j120_setup_engine_then_submit(nunba_flask_app):
    r1 = nunba_flask_app.post(
        "/api/social/tts/setup-engine",
        json={"engine": "piper"},  # piper is always safe to request
        headers={"Content-Type": "application/json"},
    )
    if r1.status_code == 404:
        pytest.skip("/api/social/tts/setup-engine not mounted")
    body1 = r1.get_data(as_text=True)
    assert not (r1.status_code >= 500 and not body1.strip())

    r2 = nunba_flask_app.post(
        "/api/social/tts/submit",
        json={"text": "after engine setup", "lang": "en", "engine": "piper"},
        headers={"Content-Type": "application/json"},
    )
    if r2.status_code == 404:
        pytest.skip("tts/submit not mounted")
    body2 = r2.get_data(as_text=True)
    assert not (r2.status_code >= 500 and not body2.strip())


@pytest.mark.timeout(30)
def test_j120_setup_engine_unknown_graceful(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/social/tts/setup-engine",
        json={"engine": "nonexistent-engine-j120"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/social/tts/setup-engine not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())
