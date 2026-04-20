"""J245 · TTS engine + voice listing.

PRODUCT_MAP.md §1.13 documents the lightweight TTS discovery
endpoints React reads at chat-start to populate the voice picker:

  * GET /tts/engines  -> {<engine_id>: {display_name, installed, ...}}
  * GET /tts/voices   -> {backend, voices, installed, ...}

These are NOT authenticated — every guest / anonymous user's React
shell calls them.  Previously uncovered.  A 500 here leaves the
voice dropdown blank and the user cannot hear TTS at all.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(20)
def test_j245_tts_engines_list(nunba_flask_app):
    resp = nunba_flask_app.get("/tts/engines")
    if resp.status_code == 404:
        pytest.skip("/tts/engines not mounted")
    assert resp.status_code == 200, resp.get_data(as_text=True)[:200]
    body = resp.get_json() or {}
    # Body is a MAP of engine_id -> {display_name, installed, ...}.
    assert isinstance(body, dict) and body, "engines dict empty"
    # Every entry must be a dict with display_name + installed — used
    # directly by the voice picker.
    for eid, meta in list(body.items())[:10]:
        assert isinstance(meta, dict), f"engine {eid} meta not dict"
        assert "display_name" in meta, f"engine {eid} missing display_name"
        assert "installed" in meta, f"engine {eid} missing installed flag"
        assert isinstance(meta["installed"], bool), f"engine {eid} installed not bool"


@pytest.mark.timeout(20)
def test_j245_tts_voices_list(nunba_flask_app):
    resp = nunba_flask_app.get("/tts/voices")
    if resp.status_code == 404:
        pytest.skip("/tts/voices not mounted")
    assert resp.status_code == 200, resp.get_data(as_text=True)[:200]
    body = resp.get_json() or {}
    # Must describe which backend is active and what voices it offers.
    assert "backend" in body, f"missing backend; body={list(body.keys())}"
    assert "voices" in body, f"missing voices; body={list(body.keys())}"
    voices = body["voices"]
    # voices is a dict — may be empty (no-voice backend) but must be dict.
    assert isinstance(voices, dict), f"voices not dict: {type(voices).__name__}"


@pytest.mark.timeout(20)
def test_j245_tts_engines_include_known_ids(nunba_flask_app):
    """At least one of the canonical engines (piper, f5, kokoro,
    chatterbox_*, cosyvoice3, indic_parler) must be listed.  Catches
    a TTS subsystem that silently failed to register any engine."""
    resp = nunba_flask_app.get("/tts/engines")
    if resp.status_code == 404:
        pytest.skip("/tts/engines not mounted")
    body = resp.get_json() or {}
    known = {
        "piper", "f5", "kokoro", "chatterbox_turbo",
        "chatterbox_multilingual", "cosyvoice3", "indic_parler",
    }
    overlap = set(body.keys()) & known
    assert overlap, (
        f"no known TTS engine present; got {sorted(body.keys())}"
    )
