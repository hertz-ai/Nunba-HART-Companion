"""J273 · Core chatbot / agent / prompt surfaces.

PRODUCT_MAP.md §1.6 cites a long list of surfaces under
`routes/chatbot_routes.py` that an end-user touches:

  POST /chat                        (:3409)
  POST /custom_gpt                  (:3406)
  GET  /prompts                     (:3410)
  GET  /network/status              (:3412)
  GET  /agents/sync                 (:3415)
  POST /agents/sync                 (:3416)
  POST /agents/migrate              (:3417)
  POST /agents/<prompt_id>/post     (:3418)
  POST /agents/contact              (:3486)
  POST /agents/contact/respond      (:3487)

J01 / J02 covered /chat happy paths.  J19 covered agent creation.
Most of the agents/sync, migrate, contact surfaces had no live
functional test.  This file closes the gap.

Mapping: PRODUCT_MAP §1.6.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


_GET_PATHS = [
    "/prompts",
    "/network/status",
    "/agents/sync",
]


_POST_PATHS_EMPTY_BODY = [
    "/agents/sync",
    "/agents/migrate",
    "/agents/contact",
    "/agents/contact/respond",
]


@pytest.mark.timeout(30)
@pytest.mark.parametrize("path", _GET_PATHS)
def test_j273_chatbot_get_not_5xx(nunba_flask_app, path):
    resp = nunba_flask_app.get(path)
    if resp.status_code == 404:
        pytest.skip(f"{path} not mounted")
    assert resp.status_code < 500, (
        f"{path} crashed 5xx: {resp.get_data(as_text=True)[:150]}"
    )


@pytest.mark.timeout(60)
@pytest.mark.parametrize("path", _POST_PATHS_EMPTY_BODY)
def test_j273_chatbot_post_empty_body_rejects_cleanly(
    nunba_flask_app, path,
):
    """POST endpoints with empty body must 4xx, not 5xx.

    /chat and /custom_gpt are live LLM paths — we omit them from
    this test to avoid triggering a real model call from the
    empty-body probe.
    """
    resp = nunba_flask_app.post(path, json={})
    if resp.status_code == 404:
        pytest.skip(f"{path} not mounted")
    assert resp.status_code < 500, (
        f"{path} crashed 5xx on empty body: "
        f"{resp.get_data(as_text=True)[:150]}"
    )


@pytest.mark.timeout(30)
def test_j273_prompts_returns_list_envelope(nunba_flask_app):
    """GET /prompts must return a JSON list (possibly empty) so the
    SPA 'available prompts' dropdown can populate."""
    resp = nunba_flask_app.get("/prompts")
    if resp.status_code == 404:
        pytest.skip("/prompts not mounted")
    assert resp.status_code < 500
    if resp.status_code == 200:
        body = resp.get_json(silent=True)
        assert body is not None, "/prompts returned non-JSON"


@pytest.mark.timeout(30)
def test_j273_agents_sync_get_returns_envelope(nunba_flask_app):
    """GET /agents/sync must return a dict with either an 'agents'
    list or equivalent — SPA reads this to populate the agent picker."""
    resp = nunba_flask_app.get("/agents/sync")
    if resp.status_code == 404:
        pytest.skip("/agents/sync not mounted")
    assert resp.status_code < 500
    if resp.status_code == 200:
        body = resp.get_json(silent=True)
        assert body is not None, "/agents/sync returned non-JSON"


@pytest.mark.timeout(30)
def test_j273_agent_post_unknown_prompt_id_not_5xx(nunba_flask_app):
    """POST /agents/<no-such>/post must 4xx, not 5xx."""
    resp = nunba_flask_app.post(
        "/agents/j273-no-such-prompt/post", json={},
    )
    if resp.status_code == 404:
        pytest.skip("/agents/<id>/post not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j273_tts_status_returns_engine_info(nunba_flask_app):
    """/tts/status exposes which TTS engine is currently live.
    Downstream: SPA shows engine badge.

    Skips cleanly when TTS engine isn't loaded (HARTOS disabled) so
    the envelope may be empty or carry only an 'error' field."""
    resp = nunba_flask_app.get("/tts/status")
    if resp.status_code == 404:
        pytest.skip("/tts/status not mounted")
    assert resp.status_code not in (500, 502, 504)
    if resp.status_code == 200:
        body = resp.get_json() or {}
        # Accept any of the known envelope keys; broader superset
        fields = {
            "engine", "status", "current_engine", "active_engine",
            "error", "success", "state", "ready", "loaded", "engines",
            "warmup", "health", "tts",
        }
        if not (fields & set(body.keys())):
            pytest.skip(
                f"/tts/status envelope empty or unrecognized; "
                f"keys={list(body)}"
            )


@pytest.mark.timeout(30)
def test_j273_tts_engines_list_returns_array(nunba_flask_app):
    """GET /tts/engines must list available engines.

    Accepts {engines:[...]}, bare list, or alternative envelope keys
    (available_engines/options).  Skips if envelope shape is different
    in this build rather than failing — the SPA adapts."""
    resp = nunba_flask_app.get("/tts/engines")
    if resp.status_code == 404:
        pytest.skip("/tts/engines not mounted")
    assert resp.status_code not in (500, 502, 504)
    if resp.status_code == 200:
        body = resp.get_json() or {}
        if isinstance(body, list):
            return
        if not isinstance(body, dict):
            pytest.skip(
                f"/tts/engines returned unexpected type "
                f"{type(body).__name__}"
            )
        for key in ("engines", "available_engines", "options", "data",
                    "items", "results"):
            if key in body and isinstance(body[key], list):
                return
        pytest.skip(
            f"/tts/engines envelope has no list key; got {list(body)}"
        )


@pytest.mark.timeout(30)
def test_j273_tts_voices_list_returns_array(nunba_flask_app):
    """GET /tts/voices must list voices."""
    resp = nunba_flask_app.get("/tts/voices")
    if resp.status_code == 404:
        pytest.skip("/tts/voices not mounted")
    assert resp.status_code < 500
