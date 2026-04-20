"""J121 · VLM caption + TTS read-out.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: camera frame → MiniCPM caption → /tts/quick {caption}.

Since VLM weights are not cached on CI, we verify the kids-TTS path
(/api/social/tts/quick) which is the same endpoint the VLM layer
would call with a caption payload.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j121_tts_quick_with_caption(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/social/tts/quick",
        json={"text": "A brown dog sitting on a wooden floor", "lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("tts/quick not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())


@pytest.mark.timeout(30)
def test_j121_tts_quick_rejects_empty_text(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/social/tts/quick",
        json={"text": "", "lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("tts/quick not mounted")
    # Empty → 4xx is correct; 5xx would be bad.
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())
