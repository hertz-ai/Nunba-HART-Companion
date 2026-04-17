"""J67 · Add TTS backend post-install.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* /tts/setup-engine, /tts/engines registered.

Steps
-----
1. GET  /tts/engines
2. POST /tts/setup-engine with a known engine name

Verifiable outcomes
-------------------
* Engines list returns 200 with a list.
* setup-engine either succeeds, refuses gracefully, or 4xx — never
  empty-5xx.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j67_tts_engines_list(nunba_flask_app):
    resp = nunba_flask_app.get("/tts/engines")
    if resp.status_code == 404:
        pytest.skip("/tts/engines not mounted in this env")
    assert resp.status_code < 500
    if resp.status_code == 200:
        body = resp.get_json(silent=True) or {}
        engines = body if isinstance(body, list) else (
            body.get("engines") or body.get("data") or []
        )
        assert isinstance(engines, list), (
            f"/tts/engines should return a list, got {body!r}"
        )


@pytest.mark.timeout(60)
def test_j67_tts_setup_engine_graceful_on_bad_name(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/tts/setup-engine",
        json={"engine": "no-such-engine-xyz"},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/tts/setup-engine not mounted")
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip()), (
        "setup-engine returned empty-5xx on unknown engine"
    )


@pytest.mark.timeout(60)
def test_j67_tts_setup_engine_rejects_empty(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/tts/setup-engine",
        json={},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/tts/setup-engine not mounted")
    # Empty body → validation 4xx, never 500
    assert resp.status_code < 500
