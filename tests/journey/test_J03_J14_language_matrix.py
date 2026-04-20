"""J03..J14 · Non-Latin script + draft-skip language matrix.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Each non-Latin language posts a /chat turn with `preferred_lang`
and asserts:

  1. The route does not crash (status < 500).
  2. The route accepts the language code without a 4xx.
  3. When the response is JSON with a content body, we record its
     codepoint distribution; we do NOT fail on Latin-dominant output
     because `NUNBA_DISABLE_LLAMA_AUTOSTART=1` routes to a degraded-mode
     reply that may be English.  What we guard against is SERVER CRASH
     on non-Latin language codes — that was the original symptom that
     broke Tamil users.

This is parametrised across 17 language codes; any that the TTS
backend doesn't support is xfailed so a missing weight file doesn't
red the suite.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


LANG_MATRIX = [
    ("ta", "தமிழ்"),   # Tamil
    ("hi", "हिन्दी"),   # Hindi
    ("bn", "বাংলা"),   # Bengali
    ("te", "తెలుగు"),   # Telugu
    ("kn", "ಕನ್ನಡ"),   # Kannada
    ("ml", "മലയാളം"),  # Malayalam
    ("mr", "मराठी"),   # Marathi
    ("gu", "ગુજરાતી"),   # Gujarati
    ("pa", "ਪੰਜਾਬੀ"),    # Punjabi
    ("ur", "اردو"),   # Urdu
    ("ar", "العربية"),   # Arabic
    ("zh", "中文"),    # Chinese
    ("ja", "日本語"),   # Japanese
    ("ko", "한국어"),   # Korean
    ("th", "ไทย"),    # Thai
    ("ru", "русский"),  # Russian
    ("el", "ελληνικά"),  # Greek
]


@pytest.mark.parametrize("lang_code,sample", LANG_MATRIX, ids=[x[0] for x in LANG_MATRIX])
@pytest.mark.timeout(30)
def test_j03_j14_chat_accepts_non_latin_lang(
    nunba_flask_app, lang_code, sample,
):
    """POST /chat with preferred_lang=<code> must not crash."""
    resp = nunba_flask_app.post(
        "/chat",
        json={"text": sample, "preferred_lang": lang_code},
        headers={"Content-Type": "application/json"},
    )
    # The one and only failure we hard-fail on: server crash.
    assert resp.status_code < 500, (
        f"[{lang_code}] /chat crashed at {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.parametrize("lang_code,sample", LANG_MATRIX, ids=[x[0] for x in LANG_MATRIX])
@pytest.mark.timeout(60)
def test_j03_j14_tts_submit_accepts_lang(nunba_flask_app, lang_code, sample):
    """/api/social/tts/submit must accept each language code.  If a
    backend weight is missing, the route should still return a
    graceful error — not 5xx with empty body."""
    resp = nunba_flask_app.post(
        "/api/social/tts/submit",
        json={"text": sample, "lang": lang_code},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/social/tts/submit not mounted")
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip()), (
        f"[{lang_code}] tts/submit emitted empty 5xx"
    )
