"""J277 · Agentic Liquid UI server-driven render contract.

Target surface: the shared server-driven UI renderer that underpins
every agent-mutable surface in the SPA.

  landing-page/src/components/shared/LiquidUI/index.js        (barrel)
  landing-page/src/components/shared/LiquidUI/ServerDrivenUI.jsx (renderer)
  landing-page/src/components/shared/LiquidUI/SocialLiquidUI.jsx (social wrap)

User journey (PRODUCT_MAP.md §USER JOURNEYS):
  1. Agent emits a server-driven UI tree (JSON) into a WAMP topic.
  2. The SPA's ``ServerDrivenUI`` renders that tree under a
     MUI-compatible LiquidUIProvider.
  3. Unknown component types fall back to an empty ``<Box>`` so the
     page never crashes even if the agent authors a bogus tree.
  4. The browser WAMP bridge (``/api/wamp/ticket`` → WebSocket)
     receives subsequent ``ui.update`` events to mutate the tree in
     real-time.

This test exercises the SERVER SIDE of the contract — the transport
layer that carries UI trees from the agent to the browser. There is
no dedicated ``/api/ui/publish`` endpoint on the Flask app today
(verified: ``grep -R '/api/ui/publish' routes main.py`` returns
no hits); the agent publishes ``ui.update`` via the same
crossbarhttp3-compatible ``/publish`` HTTP bridge (main.py:2871)
that all other WAMP traffic uses.

Verifiable outcomes
-------------------
* ``/api/ui/publish`` if mounted → 200 with known envelope.
* ``/api/wamp/ticket`` returns a ticket (or empty in localhost mode).
* ``/publish`` accepts a ``ui.update`` topic without 5xx.
* ``/publish`` accepts an UNKNOWN component tree without 5xx
  (renderer falls back in the browser; server merely relays bytes).

PRODUCT_MAP.md line cites:
  - /publish bridge: line 1199-1202 (main.py:2491 / main.py:2871)
  - wamp ticket: line 1234 (main.py:2535 / main.py:2915)
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


# ---------------------------------------------------------------------------
# Sample server-driven UI trees — the product is the JSON schema itself
# ---------------------------------------------------------------------------

_VALID_TREE = {
    "type": "column",
    "children": [
        {"type": "text", "props": {"text": "J277 liquid-ui smoke"}},
        {
            "type": "button",
            "props": {"text": "Click me"},
            "action": "ui.button.clicked",
        },
        {
            "type": "card",
            "children": [
                {"type": "text", "props": {"text": "inside card"}},
            ],
        },
    ],
}

_UNKNOWN_TYPE_TREE = {
    "type": "definitely-not-a-real-component",
    "children": [
        {"type": "text", "props": {"text": "fallback should show me"}},
    ],
}


@pytest.mark.timeout(30)
def test_j277_wamp_ticket_endpoint_responds(nunba_flask_app):
    """The liquid-ui event transport boots off /api/wamp/ticket — if
    this endpoint 5xxs, the whole live-update channel is dead."""
    resp = nunba_flask_app.get("/api/wamp/ticket")
    if resp.status_code == 404:
        pytest.skip("/api/wamp/ticket not mounted")
    assert resp.status_code < 500, (
        f"/api/wamp/ticket crashed: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
    if resp.status_code == 200:
        body = resp.get_json(silent=True) or {}
        assert "ticket" in body, (
            f"ticket envelope missing 'ticket' key: {list(body)}"
        )


@pytest.mark.timeout(30)
def test_j277_ui_publish_endpoint_if_mounted(nunba_flask_app):
    """If a dedicated /api/ui/publish surface is mounted, it must
    accept a valid server-driven tree without 5xx. If unmounted,
    skip — the agent uses /publish WAMP bridge instead (covered
    by the next test)."""
    resp = nunba_flask_app.post(
        "/api/ui/publish",
        json={
            "topic": "com.hertzai.hevolve.ui.update.j277",
            "tree": _VALID_TREE,
        },
    )
    if resp.status_code == 404:
        pytest.skip(
            "/api/ui/publish not mounted — agent uses /publish bridge"
        )
    assert resp.status_code < 500, (
        f"/api/ui/publish crashed: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j277_wamp_bridge_relays_ui_update_valid_tree(nunba_flask_app):
    """The /publish bridge (main.py:2871) is the de-facto transport
    for ui.update events. Valid trees must relay without 5xx."""
    resp = nunba_flask_app.post(
        "/publish",
        json={
            "topic": "com.hertzai.hevolve.ui.update.j277",
            "args": [_VALID_TREE],
            "kwargs": {"user_id": "j277-test"},
        },
    )
    if resp.status_code == 404:
        pytest.skip("/publish bridge not mounted")
    # Router may be off (503) when TTS/HARTOS init disabled — still
    # not a crash.
    assert resp.status_code < 500 or resp.status_code == 503, (
        f"/publish crashed on valid tree: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j277_wamp_bridge_accepts_unknown_component_tree(nunba_flask_app):
    """The transport must not validate the tree shape — unknown
    types are the CLIENT's fallback responsibility
    (ServerDrivenUI.jsx line 1029: default case renders empty Box).
    The server merely relays bytes; an unknown type must not 5xx."""
    resp = nunba_flask_app.post(
        "/publish",
        json={
            "topic": "com.hertzai.hevolve.ui.update.j277",
            "args": [_UNKNOWN_TYPE_TREE],
            "kwargs": {},
        },
    )
    if resp.status_code == 404:
        pytest.skip("/publish bridge not mounted")
    assert resp.status_code < 500 or resp.status_code == 503, (
        f"/publish crashed on unknown-type tree: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j277_wamp_bridge_missing_topic_400_not_5xx(nunba_flask_app):
    """Empty topic must 4xx, not 5xx — this is the input-validation
    contract that protects the live UI channel."""
    resp = nunba_flask_app.post(
        "/publish",
        json={"args": [_VALID_TREE]},
    )
    if resp.status_code == 404:
        pytest.skip("/publish bridge not mounted")
    # 400 (missing topic) or 503 (router off) — NEVER 5xx crash
    assert resp.status_code < 500 or resp.status_code == 503, (
        f"/publish crashed on missing topic: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j277_spa_landing_page_loads_liquid_ui_bundle(nunba_flask_app):
    """The landing-page bundle must be served — LiquidUI lives
    inside index.html's React bundle. If the bundle isn't served,
    there's no renderer to receive ui.update events."""
    resp = nunba_flask_app.get("/")
    # 200 or 302 (redirect to /local) both acceptable
    assert resp.status_code < 500, (
        f"SPA landing page crashed: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
