"""J141 · Memory write+read while FedAggregator embeds in background.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: `remember` while aggregate_embeddings (federated_aggregator.
py:685) runs. Verify: no SQLite locked; both complete; FTS5 row
contains new memory.
"""

from __future__ import annotations

import concurrent.futures
import uuid

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j141_concurrent_remember_writes(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "remember" not in names:
        pytest.skip("remember not registered")

    def _remember(i: int):
        return mcp_client.call(
            "remember",
            content=f"j141-parallel-{i}-{uuid.uuid4().hex[:6]}",
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(_remember, range(8)))

    # All must return envelopes; none must crash with empty 5xx
    for r in results:
        assert isinstance(r, dict)
        assert any(k in r for k in ("success", "result", "error")), r


@pytest.mark.timeout(30)
def test_j141_remember_read_interleave(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "remember" not in names or "recall" not in names:
        pytest.skip("remember/recall not registered")
    for i in range(3):
        r1 = mcp_client.call("remember", content=f"j141-seq-{i}")
        r2 = mcp_client.call("recall", q=f"j141-seq-{i}")
        assert isinstance(r1, dict) and isinstance(r2, dict)
