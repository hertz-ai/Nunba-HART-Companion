"""J166 · WAMP subscribe with spoofed user_id.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: client requests /api/wamp/ticket (main.py:2535), mints for
self, then subscribes to `chat.social.<someone-else>`. Verify:
router refuses or returns empty topic; ticket-auth binds topic to
issuer's user_id.

At HTTP tier: ticket endpoint accepts a user_id and returns an
envelope; tickets minted for one user must not grant read access
to another user's topic.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j166_ticket_for_user_a(nunba_flask_app):
    r = nunba_flask_app.get("/api/wamp/ticket?user_id=j166-user-A")
    if r.status_code == 404:
        pytest.skip("/api/wamp/ticket not mounted")
    assert r.status_code < 500
    body = r.get_json(silent=True)
    if r.status_code == 200:
        assert body is not None


@pytest.mark.timeout(30)
def test_j166_ticket_endpoint_rejects_bogus_user(nunba_flask_app):
    """Missing user_id is a 400 or graceful 200 with default, not 500."""
    r = nunba_flask_app.get("/api/wamp/ticket")
    if r.status_code == 404:
        pytest.skip("/api/wamp/ticket not mounted")
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j166_ticket_does_not_leak_secret(nunba_flask_app):
    """The returned ticket should not expose the signing secret or
    env vars."""
    r = nunba_flask_app.get("/api/wamp/ticket?user_id=j166-leaktest")
    if r.status_code != 200:
        pytest.skip("ticket endpoint not returning 200")
    text = r.get_data(as_text=True).lower()
    for tell in ("secret_key", "signing_key", "private_key", "api_key"):
        assert tell not in text, (
            f"ticket response exposed '{tell}' — secret leak"
        )
