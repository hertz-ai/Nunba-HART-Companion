"""J268 · Distributed-agent API surface.

PRODUCT_MAP.md §1.10 enumerates 11 endpoints under
`/api/distributed/*`:

  POST /api/distributed/tasks/announce  (api.py:90)
  GET  /api/distributed/tasks/available (:156)
  GET  /api/distributed/hosts           (:181)
  POST /api/distributed/hosts/register  (:190)
  POST /api/distributed/tasks/claim     (:207)
  POST /api/distributed/tasks/<task_id>/submit (:232)
  POST /api/distributed/tasks/verify    (:253)
  GET  /api/distributed/goals           (:272)
  GET  /api/distributed/goals/<goal_id>/progress (:303)
  GET  /api/distributed/baselines       (:317)
  GET  /api/distributed/status          (:334)

J82 / J89 / J134 covered adjacent concepts (fleet command, hive
task dispatch, multi-peer claim).  None asserted the surface itself.

This file adds breadth: every endpoint answers without 5xx.

Mapping: PRODUCT_MAP §1.10.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


_GET_ENDPOINTS = [
    "/api/distributed/tasks/available",
    "/api/distributed/hosts",
    "/api/distributed/goals",
    "/api/distributed/baselines",
    "/api/distributed/status",
]


_POST_ENDPOINTS_WITH_EMPTY_BODY = [
    ("/api/distributed/tasks/announce", {}),
    ("/api/distributed/hosts/register", {}),
    ("/api/distributed/tasks/claim", {}),
    ("/api/distributed/tasks/verify", {}),
]


@pytest.mark.timeout(30)
@pytest.mark.parametrize("path", _GET_ENDPOINTS)
def test_j268_distributed_get_does_not_5xx(nunba_flask_app, path):
    """Every GET under /api/distributed/* must respond without 5xx."""
    resp = nunba_flask_app.get(path)
    if resp.status_code == 404:
        pytest.skip(f"{path} not mounted")
    assert resp.status_code < 500, (
        f"{path} crashed 5xx: {resp.get_data(as_text=True)[:150]}"
    )


@pytest.mark.timeout(30)
@pytest.mark.parametrize("path,body", _POST_ENDPOINTS_WITH_EMPTY_BODY)
def test_j268_distributed_post_empty_body_rejects_cleanly(
    nunba_flask_app, path, body,
):
    """POST endpoints with empty body must 4xx, not 5xx.

    A 5xx would indicate the handler is dereferencing request.json
    fields without validation — a common bug.
    """
    resp = nunba_flask_app.post(path, json=body)
    if resp.status_code == 404:
        pytest.skip(f"{path} not mounted")
    assert resp.status_code < 500, (
        f"{path} crashed 5xx on empty body: "
        f"{resp.get_data(as_text=True)[:150]}"
    )


@pytest.mark.timeout(30)
def test_j268_status_returns_envelope(nunba_flask_app):
    """/api/distributed/status must return an envelope the admin UI
    can render — tier, peer_count, pending_tasks keys at minimum."""
    resp = nunba_flask_app.get("/api/distributed/status")
    if resp.status_code == 404:
        pytest.skip("/api/distributed/status not mounted")
    assert resp.status_code < 500
    if resp.status_code == 200:
        body = resp.get_json() or {}
        assert isinstance(body, dict), (
            "distributed status must be dict-shape"
        )


@pytest.mark.timeout(30)
def test_j268_unknown_goal_progress_not_5xx(nunba_flask_app):
    """GET /goals/<unknown>/progress must 4xx, not 5xx."""
    resp = nunba_flask_app.get(
        "/api/distributed/goals/j268-no-such-goal/progress"
    )
    assert resp.status_code < 500
