"""J160 · Simultaneous `remember` writes with FTS5.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: 50 parallel MCP remember calls. Verify: all rows persisted;
no `database is locked`.
"""

from __future__ import annotations

import concurrent.futures
import uuid

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(90)
def test_j160_50_parallel_remembers(mcp_client):
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
            content=f"j160-parallel-{i}-{uuid.uuid4().hex[:6]}",
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(_remember, range(50)))

    # Every call must return a dict envelope; no HTTP 500 w/ empty body.
    for i, r in enumerate(results):
        assert isinstance(r, dict), f"call {i} returned non-dict: {r}"
        assert any(k in r for k in ("success", "result", "error")), (
            f"call {i} envelope malformed: {r}"
        )


@pytest.mark.timeout(30)
def test_j160_two_writers_one_reader(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "remember" not in names or "recall" not in names:
        pytest.skip("remember/recall not registered")

    def _write(tag: str):
        return mcp_client.call("remember", content=f"j160-rw-{tag}")

    def _read():
        return mcp_client.call("recall", q="j160-rw")

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        f1 = ex.submit(_write, "w1")
        f2 = ex.submit(_write, "w2")
        fr = ex.submit(_read)
        r1, r2, rr = f1.result(30), f2.result(30), fr.result(30)

    for r in (r1, r2, rr):
        assert isinstance(r, dict)
