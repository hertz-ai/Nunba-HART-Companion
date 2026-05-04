"""Journey-test conftest.

Extends tests/e2e/conftest.py by re-exporting its fixtures so journey
tests can request `nunba_flask_app`, `isolated_nunba_home`,
`llama_mock_server`, `real_piper_engine`, `nunba_subprocess_factory`,
`ephemeral_port`, `piper_voice_path`.

Adds the `mcp_client` fixture which exercises the REAL
`/api/mcp/local/tools/execute` endpoint on the real Flask app. To
avoid depending on the on-disk token file (test runners on CI don't
have `%LOCALAPPDATA%/Nunba/mcp.token` pre-seeded), we set
`HARTOS_MCP_DISABLE_AUTH=1` so the `before_request` gate yields —
this is the documented env bypass for air-gapped / container / test
deployments (mcp_http_bridge.py:236).

Registers the `journey` marker so `pytest -m journey` selects this
suite.
"""

from __future__ import annotations

import os
import socket
import sys
import threading
import time
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest

# ── make the e2e fixtures visible in this directory ─────────────────
_HERE = Path(__file__).resolve().parent
_E2E = _HERE.parent / "e2e"
if str(_E2E) not in sys.path:
    sys.path.insert(0, str(_E2E))

# Re-export every fixture from tests/e2e/conftest.py verbatim.  pytest
# collects fixtures from any conftest in the test-path ancestry; by
# importing the e2e conftest module here, pytest sees the symbols via
# this conftest's namespace too.
from conftest import (  # type: ignore  # noqa: E402,F401
    _alloc_port,
    ephemeral_port,
    isolated_nunba_home,
    llama_mock_server,
    nunba_subprocess_factory,
    piper_voice_path,
    real_piper_engine,
    wait_for_port,
)
from conftest import (
    nunba_flask_app as _fixture_nunba_flask_app,
)

# ── NUNBA_USE_LIVE override ─────────────────────────────────────────
# When NUNBA_USE_LIVE=1, we bypass the in-process Flask fixture and
# route `nunba_flask_app` to an HTTP client that talks to the already-
# running desktop Nunba on :5000.  This avoids re-importing main.py
# (HARTOS + torch + redis cold-boot) for every test.


@pytest.fixture
def nunba_flask_app(request):  # noqa: F811 — intentional override
    if os.environ.get("NUNBA_USE_LIVE") != "1":
        return request.getfixturevalue("_fixture_nunba_flask_app")
    # Live mode — import lazily to avoid circulars
    from tests.journey._live_client import _LiveNunba  # type: ignore
    base = os.environ.get("NUNBA_LIVE_URL", "http://localhost:5000")
    try:
        import requests
        r = requests.get(f"{base}/backend/health", timeout=5)
        if r.status_code >= 500:
            pytest.skip(f"Live Nunba at {base} unhealthy: {r.status_code}")
    except Exception as e:
        pytest.skip(f"Live Nunba not reachable at {base}: {e}")
    return _LiveNunba(base)

# ── journey marker ─────────────────────────────────────────────────

def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "journey: end-to-end user journey test — drives real Flask / "
        "real MCP / real WAMP",
    )


# ── HARTOS_MCP_DISABLE_AUTH env bypass — session-scoped ─────────────
# We flip the env var BEFORE `nunba_flask_app` imports `main`, so the
# `mcp_local_bp.before_request` hook (mcp_http_bridge.py:236) honors
# it on every subsequent request.


@pytest.fixture(autouse=True, scope="session")
def _enable_mcp_test_bypass():
    """Session-wide env flag so MCP auth gate stays open for journey
    tests.  Restored to prior state at session teardown."""
    prior = os.environ.get("HARTOS_MCP_DISABLE_AUTH")
    os.environ["HARTOS_MCP_DISABLE_AUTH"] = "1"
    yield
    if prior is None:
        os.environ.pop("HARTOS_MCP_DISABLE_AUTH", None)
    else:
        os.environ["HARTOS_MCP_DISABLE_AUTH"] = prior


# ── mcp_client — thin wrapper that POSTs to /api/mcp/local/tools/execute
# using the REAL Flask test-client.  No Python mocks, no bearer
# required (bypass env set above).


class _MCPClient:
    """Minimal MCP client — call(tool_name, **args) → dict.

    Uses the real Flask test_client; requests hit the real blueprint,
    the real tool registry, the real dispatcher.  On errors the raw
    JSON envelope is returned so callers can assert on
    `{success:false, error:...}` payloads too.
    """

    def __init__(self, flask_client):
        self._c = flask_client

    def call(self, tool: str, **arguments: Any) -> dict:
        resp = self._c.post(
            "/api/mcp/local/tools/execute",
            json={"tool": tool, "arguments": arguments},
            headers={"Content-Type": "application/json"},
        )
        body = resp.get_json(silent=True)
        if body is None:
            # Return raw text for debuggability when body is non-JSON
            return {
                "_status": resp.status_code,
                "_raw": resp.get_data(as_text=True)[:500],
            }
        body.setdefault("_status", resp.status_code)
        return body

    def list_tools(self) -> dict:
        resp = self._c.get("/api/mcp/local/tools/list")
        body = resp.get_json(silent=True) or {}
        body.setdefault("_status", resp.status_code)
        return body

    def health(self) -> dict:
        resp = self._c.get("/api/mcp/local/health")
        body = resp.get_json(silent=True) or {}
        body.setdefault("_status", resp.status_code)
        return body


@pytest.fixture
def mcp_client(nunba_flask_app) -> _MCPClient:
    """Real MCP client over the real Flask /api/mcp/local blueprint.

    Usage::

        def test_foo(mcp_client):
            r = mcp_client.call("system_health")
            assert r.get("success") is True
    """
    return _MCPClient(nunba_flask_app)


# ── Combination-journey fixtures (Phase 6) ──────────────────────────


@pytest.fixture
def dual_user(nunba_flask_app) -> dict:
    """Return two distinct user identities + bearer tokens.

    For CI we cannot rely on a real registered account; instead we
    synthesise two user_ids with a distinct bearer-header value each.
    Every test using this fixture drives the real Flask app; any
    auth gate that demands a real JWT will surface as a 401/403
    which the test accepts as a documented contract state.
    """
    import uuid
    a = f"j-user-a-{uuid.uuid4().hex[:6]}"
    b = f"j-user-b-{uuid.uuid4().hex[:6]}"
    return {
        "a": {"user_id": a, "token": f"Bearer test-token-{a}"},
        "b": {"user_id": b, "token": f"Bearer test-token-{b}"},
    }


class _WAMPSubscriber:
    """In-process WAMP subscription buffer.

    Since the real crossbar router may not be reachable in CI, this
    subscriber uses the nunba SSE event stream (main.py:2561) as the
    event observation surface — /publish POSTs are fanned out to SSE
    subscribers by the same realtime dispatcher.
    """

    def __init__(self, flask_client):
        self._c = flask_client
        self.received: list[dict] = []
        self._stop = threading.Event()
        self._t: threading.Thread | None = None

    def start(self, topic: str, timeout: float = 3.0) -> None:
        """Open a brief SSE read so the event bus knows a subscriber
        exists.  Non-blocking; stores any events in `received`."""
        def _reader():
            try:
                resp = self._c.get(
                    "/api/social/events/stream",
                    headers={"Accept": "text/event-stream"},
                    buffered=False,
                )
                if resp.status_code != 200:
                    return
                deadline = time.monotonic() + timeout
                for line in resp.response:  # type: ignore
                    if self._stop.is_set() or time.monotonic() > deadline:
                        break
                    try:
                        text = line.decode("utf-8", "replace") if isinstance(line, bytes) else line
                    except Exception:
                        continue
                    if text.startswith("data: "):
                        try:
                            import json as _json
                            self.received.append(_json.loads(text[6:]))
                        except Exception:
                            self.received.append({"_raw": text})
            except Exception:
                return

        self._t = threading.Thread(target=_reader, daemon=True, name="wamp-sub")
        self._t.start()

    def stop(self) -> None:
        self._stop.set()
        if self._t is not None:
            self._t.join(timeout=2)


@pytest.fixture
def wamp_subscriber(nunba_flask_app) -> Iterator[_WAMPSubscriber]:
    """Start an in-process subscriber against the SSE event stream.

    Journey tests can poll `subscriber.received` after firing an
    action; `stop()` is called automatically at teardown.
    """
    sub = _WAMPSubscriber(nunba_flask_app)
    yield sub
    sub.stop()


@pytest.fixture
def disk_full_simulator(monkeypatch) -> Callable[[], None]:
    """Monkey-patch `shutil.disk_usage` to report no free bytes.

    Returns a callable; invoking it activates the ENOSPC simulation.
    Useful for J147 install-under-ENOSPC and any test that needs to
    prove a graceful-fail-on-no-disk path.
    """
    import shutil
    from collections import namedtuple
    _U = namedtuple("usage", "total used free")

    def _activate() -> None:
        def _fake_disk_usage(_path):
            return _U(total=1_000_000_000, used=1_000_000_000, free=0)
        monkeypatch.setattr(shutil, "disk_usage", _fake_disk_usage, raising=False)

    return _activate


@pytest.fixture
def dns_rebind_mocker(monkeypatch) -> Callable[[list[str]], None]:
    """Flip socket.gethostbyname between scripted IPs on each call.

    Used by J165 to simulate DNS TOCTOU: first resolve returns a
    public IP (passes the _is_private_ip guard), subsequent resolves
    return 127.x.x.x (the attacker payload).
    """
    def _activate(ip_sequence: list[str]) -> None:
        seq = list(ip_sequence)
        idx = {"i": 0}

        def _fake_gethostbyname(host: str) -> str:
            i = idx["i"]
            idx["i"] = min(i + 1, len(seq) - 1)
            return seq[i] if seq else "127.0.0.1"

        monkeypatch.setattr(socket, "gethostbyname", _fake_gethostbyname, raising=False)

    return _activate


@pytest.fixture
def network_partition(monkeypatch) -> Callable[[list[int] | None], None]:
    """Block outbound socket.connect on designated ports.

    Default ports: 443, 80, 8080 (HF hub, HTTP providers, llama).
    Raises ConnectionError so CUT's error-handling path is exercised.
    """
    real_connect = socket.socket.connect

    def _activate(ports: list[int] | None = None) -> None:
        blocked = set(ports or [443, 80, 8080])

        def _fake_connect(self, address, *a, **kw):
            try:
                host, port = address[0], address[1]
            except Exception:
                return real_connect(self, address, *a, **kw)
            # Always allow loopback — Flask test client, mock servers
            if host in ("127.0.0.1", "localhost", "::1"):
                return real_connect(self, address, *a, **kw)
            if port in blocked:
                raise ConnectionError(
                    f"network partition: {host}:{port} blocked"
                )
            return real_connect(self, address, *a, **kw)

        monkeypatch.setattr(socket.socket, "connect", _fake_connect, raising=False)

    return _activate
