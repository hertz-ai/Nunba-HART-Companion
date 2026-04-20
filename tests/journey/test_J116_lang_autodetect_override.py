"""J116 · Language auto-detect overrides stored preference.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: hart_language.json='en'. Steps: user types Tamil text with no
explicit preferred_lang → `core.user_lang.get_preferred_lang`
request_override path (user_lang.py:110) picks up Tamil glyphs.

Verifiable: /chat with non-Latin text but no explicit lang returns
non-5xx.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j116_non_latin_text_without_lang_code(nunba_flask_app):
    r = nunba_flask_app.post(
        "/chat",
        json={"text": "வணக்கம்"},  # no preferred_lang
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500, (
        f"non-latin autodetect crashed: {r.status_code} "
        f"{r.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j116_mixed_script_text(nunba_flask_app):
    """Mixed Latin + Devanagari should not crash."""
    r = nunba_flask_app.post(
        "/chat",
        json={"text": "hello नमस्ते"},
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500
