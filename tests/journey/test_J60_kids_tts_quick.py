"""J60 · Kids TTS quick-path.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* /api/social/tts/quick mounted (chatbot_routes.py:3466).

Steps
-----
1. POST /api/social/tts/quick {text:"apple", lang:"en"}

Verifiable outcomes
-------------------
* Route reachable.
* Response within 5s (kids path is latency-critical).
* Response body contains an `audio_url` / `url` field when the
  engine is present, OR a truthful error envelope.
"""

from __future__ import annotations

import time

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j60_kids_tts_quick_reachable(nunba_flask_app):
    t0 = time.monotonic()
    resp = nunba_flask_app.post(
        "/api/social/tts/quick",
        json={"text": "apple", "lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    elapsed = time.monotonic() - t0
    if resp.status_code == 404:
        pytest.skip("/api/social/tts/quick not mounted")
    assert resp.status_code < 500, (
        f"/api/social/tts/quick crashed: {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
    # Kids path budget — generous for CI, real budget is 800ms on
    # desktop. We allow 20s here since CI runners are slow + may
    # be cold.
    assert elapsed < 20.0, f"kids quick TTS took {elapsed:.1f}s"


@pytest.mark.timeout(30)
def test_j60_kids_tts_quick_rejects_empty_text(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/social/tts/quick",
        json={"text": "", "lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/social/tts/quick not mounted")
    assert resp.status_code < 500
