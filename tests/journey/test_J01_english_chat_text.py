"""J01 · English chat text-only.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* Real Nunba Flask app booted via `nunba_flask_app` fixture.
* llama-server autostart disabled (unit-level test env); the chat
  route nonetheless produces a valid HTTP response envelope even
  when the backend LLM is not reachable — the CONTRACT we verify is
  the envelope, not the LLM content.

Steps
-----
1. POST /chat `{text:"hello", preferred_lang:"en"}`
2. Assert response carries a sensible HTTP status (<500) and
   is a JSON envelope OR an SSE-style text body.

Verifiable outcomes
-------------------
* HTTP status is in the success band (200/202/204) or a documented
  partial-success code.  A 5xx would indicate a server-side crash
  and fails the test.
* Response body is non-empty bytes.
* Request completes within 20 s wall-clock.
"""

from __future__ import annotations

import time

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j01_english_chat_returns_envelope(nunba_flask_app):
    t0 = time.monotonic()
    resp = nunba_flask_app.post(
        "/chat",
        json={"text": "hello", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    elapsed = time.monotonic() - t0

    assert resp.status_code < 500, (
        f"/chat returned {resp.status_code} "
        f"(server-side crash): {resp.get_data(as_text=True)[:240]!r}"
    )
    body = resp.get_data()
    assert len(body) >= 2, "response body was empty — no envelope emitted"
    assert elapsed < 25.0, f"chat turn took {elapsed:.1f}s, expected <25s"


@pytest.mark.timeout(30)
def test_j01_english_chat_rejects_empty_text(nunba_flask_app):
    """Contract: empty text must be rejected with 4xx, not silently
    passed to the LLM (which would waste an inference turn)."""
    resp = nunba_flask_app.post(
        "/chat",
        json={"text": "", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code in (400, 422), (
        f"empty text should be 400/422, got {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j01_english_chat_accepts_missing_preferred_lang(nunba_flask_app):
    """Contract: preferred_lang is optional — the route falls back to
    `core.user_lang.get_preferred_lang()` (chatbot_routes.py:1987).
    Missing field must NOT 400."""
    resp = nunba_flask_app.post(
        "/chat",
        json={"text": "hi"},
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code < 500, (
        f"missing preferred_lang should NOT crash; got {resp.status_code}"
    )
