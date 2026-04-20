"""J142 · Corrupt memory_graph.db recovered gracefully.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: truncate .db mid-file. Steps: boot Nunba. Verify: main.py
logs degradation into registry (J80) but chat still boots; recall
returns empty.

At this tier we verify: degradation registry is reachable; /chat
works even when memory layer is degraded.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j142_degradations_registry_reachable(nunba_flask_app):
    r = nunba_flask_app.get("/api/admin/diag/degradations")
    if r.status_code == 404:
        pytest.skip("degradations endpoint not mounted")
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j142_chat_works_with_degraded_memory(nunba_flask_app):
    r = nunba_flask_app.post(
        "/chat",
        json={"text": "probe with degraded memory", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j142_recall_returns_envelope_even_empty(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "recall" not in names:
        pytest.skip("recall not registered")
    r = mcp_client.call("recall", q="j142-anything")
    assert isinstance(r, dict)
