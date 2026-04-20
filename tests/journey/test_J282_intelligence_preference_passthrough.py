"""J282 · intelligence_preference pass-through survives /chat.

User journey: the Demopage "intelligence" toggle writes
`intelligence_preference ∈ {local_only, auto, hive_preferred}` into
localStorage and sends it on every POST /chat.  That key rides the
Nunba → HARTOS pipe end-to-end:

    Demopage.js  → POST /chat body
    chatbot_routes.py  → hevolve_chat(intelligence_preference=...)
    hartos_backend_adapter.chat  → payload["intelligence_preference"]
    HARTOS /chat → dispatcher.dispatch_draft_first(user_pref=...)

This test guards the HEAD of that pipe.  If a future edit drops the
key anywhere, /chat will either 5xx (breaking all users) or silently
degrade to 'auto' (breaking the hive-preferred tier).  We verify:

  1. All three enum values POST without 5xx  (local_only, auto,
     hive_preferred) — matches frontend toggle.
  2. An omitted key still works (legacy clients unchanged).
  3. An invalid value soft-lands (no 5xx; route normalizes to 'auto').

Companion tests:
  * J192 already sends `hive_preferred` and asserts `< 500`; covers
    the degraded-hive failure mode.
  * J65/J124/J127 cover the HiveBenchmarkProver surface that
    `hive_preferred` ultimately consults.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


_ENUM_VALUES = ("local_only", "auto", "hive_preferred")


@pytest.mark.timeout(30)
@pytest.mark.parametrize("pref", _ENUM_VALUES)
def test_j282_chat_accepts_each_enum_value(nunba_flask_app, pref):
    """Every enum value on the frontend toggle must survive /chat."""
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "J282 pref probe",
            "user_id": "guest",
            "request_id": f"j282-{pref}",
            "preferred_lang": "en",
            "intelligence_preference": pref,
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500, (
        f"/chat 5xx on intelligence_preference={pref!r} — "
        f"pass-through broken; body={r.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j282_chat_without_key_unchanged(nunba_flask_app):
    """Legacy clients that never send the key must still work.

    This is the critical non-regression guard: the new optional kwarg
    has default 'auto', so POST bodies that omit `intelligence_pref`
    must produce identical behavior to pre-J282 callers.
    """
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "J282 legacy probe",
            "user_id": "guest",
            "request_id": "j282-legacy",
            "preferred_lang": "en",
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500, (
        "legacy /chat (no intelligence_preference) 5xx — "
        "non-regression broken"
    )


@pytest.mark.timeout(30)
def test_j282_invalid_value_soft_lands(nunba_flask_app):
    """A garbage value must not 5xx — the route normalizes to 'auto'.

    If validation tightened to 400, that'd be a breaking contract
    change (every old frontend build would break); a soft-land to
    'auto' is the safer degradation.
    """
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "J282 bad enum probe",
            "user_id": "guest",
            "request_id": "j282-bad",
            "preferred_lang": "en",
            "intelligence_preference": "claude_preferred",  # invalid
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500, (
        "invalid intelligence_preference 5xx — should soft-land "
        "to 'auto', not blow up"
    )
