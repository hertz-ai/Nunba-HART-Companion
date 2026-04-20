"""J204 · Two different guests on the same device, no history bleed.

User bug report (2026-04-18):
  "since not logged in it is not persistent I believe due to lack
   of token in the url ... It used to load earlier I believe only
   for guest login it's not working."

Pre-fix bug: STORAGE_KEY was scoped ONLY by agentId, so two guests
on the same webview shared buckets.  The 5089109 fix scopes the
key by (userId, agentId).  This test is the regression guard for
the first of the three failure modes in the commit message.

Two DIFFERENT guest identities on the SAME device MUST see
DIFFERENT conversations.  Levels of assertion:
  1. Storage-key level: key_A != key_B for same agent, diff users.
  2. Backend level: different device_ids → different user.id.
  3. Source-code regression pin: the userId fallback in
     NunbaChatProvider.jsx must fall back to 'guest' (matching the
     STORAGE_KEY own fallback), NOT a hardcoded '1'.  If it falls
     to '1', every fresh-guest collapses to bucket
     `nunba_chat_1_default` and bleeds.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from ._live_client import _unique_device_id, live_nunba  # noqa: F401

pytestmark = pytest.mark.journey


def _storage_key(user_id, agent_id):
    uid = user_id or "guest"
    aid = agent_id or "default"
    return f"nunba_chat_{uid}_{aid}"


@pytest.mark.timeout(15)
def test_j204_different_guest_ids_yield_different_storage_keys():
    """Pin-at-source: two distinct guest user.ids partition buckets."""
    k_a = _storage_key("guest-a-uuid", "agent-default")
    k_b = _storage_key("guest-b-uuid", "agent-default")
    assert k_a != k_b, (
        "two guests share a bucket — messages bleed across users"
    )


@pytest.mark.timeout(45)
def test_j204_two_devices_two_distinct_guest_users(live_nunba):
    """Backend invariant: different device_id → different user.id.
    Different storage keys follow.
    """
    dev_a = _unique_device_id("j204-A")
    dev_b = _unique_device_id("j204-B")
    r_a = live_nunba.post(
        "/api/social/auth/guest-register",
        json={"guest_name": "guest-a", "device_id": dev_a},
        headers={"Content-Type": "application/json"},
    )
    if r_a.status_code in (404, 429):
        pytest.skip(f"guest-register unavailable ({r_a.status_code})")
    r_b = live_nunba.post(
        "/api/social/auth/guest-register",
        json={"guest_name": "guest-b", "device_id": dev_b},
        headers={"Content-Type": "application/json"},
    )
    if r_b.status_code == 429:
        pytest.skip("rate limited")
    id_a = ((r_a.get_json() or {}).get("data") or {}).get("user", {}).get("id")
    id_b = ((r_b.get_json() or {}).get("data") or {}).get("user", {}).get("id")
    assert id_a and id_b
    assert id_a != id_b, (
        f"two different devices collapsed to same guest user.id: "
        f"{id_a}. Cross-user chat bleed."
    )
    assert _storage_key(id_a, "default") != _storage_key(id_b, "default")


@pytest.mark.timeout(15)
def test_j204_hardcoded_fallback_literal_1_is_a_bug_pin():
    """REGRESSION PIN: NunbaChatProvider.jsx currently reads
    `currentUser?.id || localStorage.getItem('hevolve_access_id') || '1'`.

    If neither `currentUser` nor `hevolve_access_id` is present
    (the truly-fresh-guest case), userId falls back to literal
    '1' — which means EVERY fresh guest on any device shares the
    bucket `nunba_chat_1_default`.  That's a bleed.

    The STORAGE_KEY helper itself falls back to 'guest' — but the
    userId expression upstream reaches '1' first.  Fallback should
    end in 'guest' to match the STORAGE_KEY's own fallback.
    """
    provider = (
        Path(__file__).resolve().parents[2]
        / "landing-page"
        / "src"
        / "components"
        / "Social"
        / "shared"
        / "NunbaChat"
        / "NunbaChatProvider.jsx"
    )
    if not provider.exists():
        pytest.skip(f"provider file not found at {provider}")
    src = provider.read_text(encoding="utf-8")
    # Strip block comments (/* ... */) and line comments (// ...)
    # to avoid matching the comment that EXPLAINS the old bug.
    src_no_block = re.sub(r"/\*.*?\*/", "", src, flags=re.DOTALL)
    src_no_comments = re.sub(r"//[^\n]*", "", src_no_block)
    # Now look for the userId expression specifically:
    # `const userId = ... || '1'` or `... || "1"` without any
    # downstream `|| 'guest'`.
    userid_match = re.search(
        r"const\s+userId\s*=\s*([^;]+);",
        src_no_comments,
        flags=re.DOTALL,
    )
    if not userid_match:
        pytest.skip("could not locate userId declaration in provider")
    userid_expr = userid_match.group(1)
    # Fail if the expression contains a literal '1' fallback AND
    # doesn't contain a 'guest' fallback downstream.
    has_literal_1 = bool(
        re.search(r"\|\|\s*['\"]1['\"]", userid_expr)
    )
    has_guest = bool(
        re.search(r"\|\|\s*['\"]guest['\"]", userid_expr)
    )
    if has_literal_1 and not has_guest:
        pytest.fail(
            "NunbaChatProvider.jsx userId expression falls back to "
            "literal '1' with no 'guest' safety net.  Every fresh "
            "guest collapses to `nunba_chat_1_default` and shares "
            "state.  Add `|| 'guest'` as the final fallback to align "
            "with the STORAGE_KEY helper (commit 5089109)."
        )
    if not has_guest:
        pytest.fail(
            "NunbaChatProvider.jsx userId expression is missing a "
            "final `|| 'guest'` fallback.  A null userId would produce "
            "storage key `nunba_chat_null_default` or similar, which "
            "either throws at JSON.parse or collapses across guests."
        )


@pytest.mark.timeout(15)
def test_j204_storage_key_regex_rejects_bleed_shapes():
    """Final shape guard: a key missing EITHER scope is rejected."""
    contract = re.compile(
        r"^nunba_chat_(?P<user>[A-Za-z0-9_\-]+)_(?P<agent>[A-Za-z0-9_\-\.]+)$"
    )
    valid = [
        "nunba_chat_guest_default",
        "nunba_chat_abc-123_agent-42",
        "nunba_chat_uuid-12345_default",
    ]
    for k in valid:
        assert contract.match(k), f"valid key rejected: {k}"
    invalid = [
        "nunba_chat_default",  # missing userId
        "nunba_chat_guest_",   # empty agentId
        "nunba_chat__agent",   # empty userId
        "nunba_chat_",
    ]
    for k in invalid:
        assert contract.match(k) is None, (
            f"bleed-prone shape matched contract regex: {k}"
        )
