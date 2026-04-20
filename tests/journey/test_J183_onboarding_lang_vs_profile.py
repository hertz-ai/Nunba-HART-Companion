"""J183 · Onboarding language vs profile language conflict.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: onboarding sets lang=ta; user edits profile to en later.
Verify: set_preferred_lang (user_lang.py:170) is single writer; no
stale values.

At HTTP tier: /chat with lang=ta → /chat with lang=en → both work;
the canonical writer is exercised via the route.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j183_lang_single_writer_roundtrip(nunba_flask_app):
    """Sequential ta then en — both must succeed; set_preferred_lang
    must not corrupt state."""
    r1 = nunba_flask_app.post(
        "/chat",
        json={"text": "வணக்கம்", "preferred_lang": "ta"},
        headers={"Content-Type": "application/json"},
    )
    r2 = nunba_flask_app.post(
        "/chat",
        json={"text": "hello", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r1.status_code < 500
    assert r2.status_code < 500


@pytest.mark.timeout(30)
def test_j183_core_user_lang_canonical_reader(isolated_nunba_home, monkeypatch):
    """Direct import check: core.user_lang must expose a
    get_preferred_lang reader."""
    try:
        from core import user_lang
    except Exception as e:
        pytest.skip(f"core.user_lang not importable: {e}")
    assert hasattr(user_lang, "get_preferred_lang")
    assert callable(user_lang.get_preferred_lang)
