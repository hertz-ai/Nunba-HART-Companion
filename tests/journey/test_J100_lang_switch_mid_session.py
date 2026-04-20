"""J100 · English→Tamil language switch mid-session.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: Turn 1 uses preferred_lang=en (Latin path, draft eligible).
Steps: Turn 2 switches to preferred_lang=ta — speculative_dispatcher
NON_LATIN_SCRIPT_LANGS gate (speculative_dispatcher.py:236-238) must
skip draft; `core.user_lang.set_preferred_lang` is the canonical
writer for `hart_language.json` (user_lang.py:170).

Verifiable: both turns respond with non-5xx envelopes; server accepts
the mid-session switch without crashing. hart_language.json is
rewritten (or at least not corrupted) after turn 2.
"""

from __future__ import annotations

import json

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j100_english_then_tamil_switch(nunba_flask_app, isolated_nunba_home):
    r1 = nunba_flask_app.post(
        "/chat",
        json={"text": "hello", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r1.status_code < 500, (
        f"turn1 en /chat crashed {r1.status_code}: "
        f"{r1.get_data(as_text=True)[:200]}"
    )

    r2 = nunba_flask_app.post(
        "/chat",
        json={"text": "வணக்கம்", "preferred_lang": "ta"},
        headers={"Content-Type": "application/json"},
    )
    assert r2.status_code < 500, (
        f"turn2 ta /chat crashed {r2.status_code}: "
        f"{r2.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j100_hart_language_json_not_corrupt(
    nunba_flask_app, isolated_nunba_home,
):
    """After a language switch, if `hart_language.json` is written,
    it must be valid JSON — never a truncated/partial write."""
    nunba_flask_app.post(
        "/chat",
        json={"text": "vanakkam", "preferred_lang": "ta"},
        headers={"Content-Type": "application/json"},
    )
    # Best-effort find the canonical path
    candidates = list(isolated_nunba_home.rglob("hart_language.json"))
    if not candidates:
        pytest.skip("hart_language.json not written in this env")
    for p in candidates:
        text = p.read_text(encoding="utf-8", errors="replace")
        # File may be empty if writer was suppressed — that's OK.
        # But if non-empty it MUST parse.
        if text.strip():
            json.loads(text)  # will raise if corrupt


@pytest.mark.timeout(30)
def test_j100_rapid_switch_stability(nunba_flask_app):
    """5 alternating turns — server stays up."""
    for lang, text in [
        ("en", "hi"), ("ta", "வணக்கம்"), ("en", "hello"),
        ("hi", "नमस्ते"), ("en", "goodbye"),
    ]:
        r = nunba_flask_app.post(
            "/chat",
            json={"text": text, "preferred_lang": lang},
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code < 500, f"[{lang}] /chat 5xx at {r.status_code}"
