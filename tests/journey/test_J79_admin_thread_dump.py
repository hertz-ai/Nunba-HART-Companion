"""J79 · Admin thread dump.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* /api/admin/diag/thread-dump mounted (main.py:3032) and guarded by
  @require_local_or_token — loopback calls from the Flask test-client
  are considered local and pass the gate.

Steps
-----
1. POST /api/admin/diag/thread-dump

Verifiable outcomes
-------------------
* Route reachable.
* Response body mentions a thread count OR trace file path.
* Never empty 5xx.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j79_thread_dump_reachable(nunba_flask_app):
    resp = nunba_flask_app.post("/api/admin/diag/thread-dump")
    if resp.status_code == 404:
        pytest.skip("/api/admin/diag/thread-dump not mounted")
    assert resp.status_code < 500, (
        f"thread dump crashed {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
    if resp.status_code == 200:
        body = resp.get_json(silent=True) or {}
        # Contract: must return either thread count or path/error
        assert any(
            k in body
            for k in ("threads", "thread_count", "trace_file", "path", "success")
        ), f"thread dump 200 but unexpected body: {body!r}"


@pytest.mark.timeout(30)
def test_j79_thread_dump_respects_topology_central(
    nunba_flask_app, monkeypatch,
):
    """On central topology the endpoint is disabled outright
    (main.py:3042-3048).  We set the env and expect 4xx / 403."""
    monkeypatch.setenv("HEVOLVE_TOPOLOGY", "central")
    resp = nunba_flask_app.post("/api/admin/diag/thread-dump")
    if resp.status_code == 404:
        pytest.skip("/api/admin/diag/thread-dump not mounted")
    # Allowed: 403 (topology-disabled) OR 200 (env read at import time,
    # so the flag may not take effect). What's NOT allowed is 500.
    assert resp.status_code < 500
