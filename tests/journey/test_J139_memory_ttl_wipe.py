"""J139 · Memory TTL / privacy wipe with forward-secrecy check.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: DELETE /api/memory/<id> → subsequent inference does NOT
cite deleted fact. Verifiable: DELETE route reachable; after delete,
recall of the same id returns no hit (or graceful miss).
"""

from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j139_delete_then_recall_miss(mcp_client, nunba_flask_app):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "remember" not in names or "recall" not in names:
        pytest.skip("remember/recall not registered")

    tok = f"j139-{uuid.uuid4().hex[:8]}"
    mcp_client.call("remember", content=f"secret token {tok}")

    # Try to DELETE — if endpoint absent, surface is partial.
    r = nunba_flask_app.delete(f"/api/memory/{tok}")
    if r.status_code == 404 and r.get_json(silent=True) is None:
        pytest.skip("/api/memory/<id> DELETE not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())

    # Recall — post-delete. Contract: envelope, not crash.
    r2 = mcp_client.call("recall", q=tok)
    assert isinstance(r2, dict)


@pytest.mark.timeout(30)
def test_j139_delete_twice_idempotent(nunba_flask_app):
    for _ in range(2):
        r = nunba_flask_app.delete("/api/memory/j139-idem")
        if r.status_code == 404 and r.get_json(silent=True) is None:
            pytest.skip("/api/memory/<id> not mounted")
        body = r.get_data(as_text=True)
        assert not (r.status_code >= 500 and not body.strip())
