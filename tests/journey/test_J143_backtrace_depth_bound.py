"""J143 · Memory backtrace depth bound honored.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: call backtrace with depth=100 on a short chain. Verify:
result is bounded (no infinite loop); returns within budget.
"""

from __future__ import annotations

import time

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j143_depth_100_returns_under_5s(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "backtrace_memory" not in names:
        pytest.skip("backtrace_memory not registered")

    t0 = time.monotonic()
    r = mcp_client.call("backtrace_memory", memory_id="j143-root", depth=100)
    elapsed = time.monotonic() - t0
    assert isinstance(r, dict)
    # 5s is a generous ceiling; depth-bound logic should finish much faster
    assert elapsed < 5.0, f"backtrace(depth=100) took {elapsed:.1f}s"


@pytest.mark.timeout(30)
def test_j143_negative_depth_graceful(mcp_client):
    lst = mcp_client.list_tools()
    if lst.get("_status") != 200:
        pytest.skip("mcp unreachable")
    names = {
        t.get("name") for t in (lst.get("tools") or []) if isinstance(t, dict)
    }
    if "backtrace_memory" not in names:
        pytest.skip("backtrace_memory not registered")
    r = mcp_client.call("backtrace_memory", memory_id="j143", depth=-1)
    assert isinstance(r, dict)
