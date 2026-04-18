"""J210 · Portuguese (pt) TTS has a routable engine.

Gap from 2026-04-18 live audit (report §1):

    `_DEFAULT_PREFERENCE` at `tts/tts_engine.py:283` skips 'pt'.
    User selecting Portuguese got a silent fallback through
    CosyVoice3 (which doesn't speak pt) then to Chatterbox ML via
    capability guard — every synth round-trip had the wrong-lang
    warning fire and the first-pass ladder lookup returned an
    engine that can't actually speak pt.

Outcome asserted
----------------
1. The degraded-mode fallback dict `_FALLBACK_LANG_ENGINE_PREFERENCE`
   DOES have 'pt' (this is a structural guard — the canonical
   home ModelCatalog is not always populated on first boot).
2. Every engine listed for 'pt' claims Portuguese support in
   `_FALLBACK_ENGINE_CAPABILITIES`.
3. Live Nunba `/tts/status` + `/tts/engines` responds without crashing
   when we POST `/tts/synthesize {language:"pt"}` (byte count ≥ 0 and
   the error envelope, if any, is truthful rather than silent).

A "silent fallback" — 200 OK with empty body or an English-phonemes
audio labelled pt — is the failure mode we reject.  In live-instance
mode, we accept:
- a real WAV ≥ 10 KB, or
- a clear 4xx/5xx body that names the missing engine (the user sees
  the degradation, so the UI can offer Install Chatterbox ML).
"""

from __future__ import annotations

import os

import pytest
import requests

pytestmark = pytest.mark.journey

_LIVE_URL = os.environ.get("NUNBA_LIVE_URL", "http://localhost:5000")


def _live_reachable() -> bool:
    try:
        r = requests.get(f"{_LIVE_URL}/status", timeout=3)
        return r.ok and "operational" in r.text
    except Exception:
        return False


# ────────────────────────────────────────────────────────────────────
# Structural guard — the degraded fallback preference ladder.
# This runs in-process, does NOT require a live server.
# ────────────────────────────────────────────────────────────────────


def test_j210_fallback_preference_has_pt():
    from tts.tts_engine import (
        _DEFAULT_PREFERENCE,
        _FALLBACK_ENGINE_CAPABILITIES,
        _FALLBACK_LANG_ENGINE_PREFERENCE,
    )
    assert "pt" in _FALLBACK_LANG_ENGINE_PREFERENCE, (
        "pt missing from _FALLBACK_LANG_ENGINE_PREFERENCE — a Portuguese "
        "user on a standalone install (no HARTOS catalog populated) "
        f"would silently fall through to _DEFAULT_PREFERENCE={_DEFAULT_PREFERENCE} "
        "whose first entry (cosyvoice3) doesn't speak pt."
    )
    prefs = _FALLBACK_LANG_ENGINE_PREFERENCE["pt"]
    assert prefs, "pt preference list is empty"
    # Every backend in the ladder must actually claim pt in its cap dict.
    for backend in prefs:
        caps = _FALLBACK_ENGINE_CAPABILITIES.get(backend, {})
        langs = caps.get("languages", set())
        # Piper is a wildcard CPU fallback — it doesn't claim a per-lang
        # set in the fallback matrix but is allowed as the universal floor.
        if backend == "piper":
            continue
        assert "pt" in langs, (
            f"Backend {backend!r} is in pt's preference ladder but its "
            f"capability dict doesn't list pt. "
            f"Declared languages: {sorted(langs)}"
        )


# ────────────────────────────────────────────────────────────────────
# Live-instance probe — real HTTP round-trip to running Nunba :5000.
# Skips when the live instance isn't up (isolated CI, e.g.).
# ────────────────────────────────────────────────────────────────────


@pytest.mark.timeout(60)
def test_j210_live_portuguese_synth_or_truthful_error():
    if not _live_reachable():
        pytest.skip(f"{_LIVE_URL}/status not operational — live test skipped")

    phrase = "Ol\u00e1, eu sou o Nunba. Voc\u00ea consegue me ouvir?"
    r = requests.post(
        f"{_LIVE_URL}/tts/synthesize",
        json={"text": phrase, "language": "pt"},
        timeout=60,
    )

    # We refuse the "200 OK with empty body" silent-failure mode, and
    # we refuse a 500 with no explanation.  Everything else is either
    # a real audio payload or a truthful degradation message.
    body_bytes = r.content or b""
    content_type = r.headers.get("Content-Type", "")

    if r.status_code == 200:
        # Must be audio bytes.  Accept "audio/*" mime OR a raw WAV
        # header (RIFF....WAVE at the start of the payload).
        is_audio_mime = content_type.startswith("audio/")
        is_wav_magic = body_bytes[:4] == b"RIFF" and body_bytes[8:12] == b"WAVE"
        assert is_audio_mime or is_wav_magic, (
            f"200 OK but not audio: content_type={content_type!r} "
            f"first16={body_bytes[:16]!r}"
        )
        # Real speech should be larger than a silent-WAV header.
        assert len(body_bytes) >= 10_000, (
            f"Portuguese synth produced tiny audio ({len(body_bytes)}B < "
            f"10KB) — likely an empty-WAV silent-fallback. "
            f"First 32 bytes: {body_bytes[:32]!r}"
        )
    else:
        # 4xx/5xx — must have an explanatory body, not an empty payload.
        text = body_bytes.decode("utf-8", errors="replace").strip()
        assert text, (
            f"{r.status_code} returned with empty body for pt synth — "
            "silent failure. The UI would show a blank error."
        )
        # The error must name the reason (engine missing, lang unsupported,
        # install required, etc.) — not a generic 400 proxy string.
        lower = text.lower()
        likely_truthful = any(
            token in lower for token in (
                "engine", "backend", "install", "synthesis",
                "chatterbox", "cosyvoice", "piper", "portugu",
                "lang", "missing",
            )
        )
        assert likely_truthful, (
            f"{r.status_code} body doesn't explain why pt synth failed — "
            f"body={text[:200]!r}"
        )
