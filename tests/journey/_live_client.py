"""Live-HTTP client for the running Nunba desktop instance.

Journey tests under J200-series target the ALREADY-RUNNING Nunba
(PID 1612 on :5000 at test time), not a freshly-imported Flask
app.  Importing main.py pulls in HARTOS + autogen + torch → many
seconds of cold start that blows past pytest's timeout.

This fixture returns a thin object that mimics the Flask
test_client API (`post(path, json=..., headers=...)` returns an
object with `status_code`, `get_json()`, `get_data(as_text=...)`)
so existing journey-style assertions work unchanged.

If the live Nunba is not reachable (CI, dev box without app
running), the fixture SKIPS the test with a clear reason.  We
never mock — we either exercise the real running instance or we
skip.
"""

from __future__ import annotations

import os
import time

import pytest
import requests

NUNBA_BASE = os.environ.get("NUNBA_LIVE_URL", "http://localhost:5000")
# Short timeouts — live tests need to run fast or bail.
DEFAULT_TIMEOUT = float(os.environ.get("NUNBA_LIVE_TIMEOUT", "8"))


class _Resp:
    """Adapter making a `requests.Response` quack like Flask's test
    response object (status_code / get_json / get_data)."""

    def __init__(self, r: requests.Response):
        self._r = r
        self.status_code = r.status_code
        self.headers = r.headers

    def get_json(self, silent: bool = False):
        try:
            return self._r.json()
        except Exception:
            if silent:
                return None
            return None

    def get_data(self, as_text: bool = False):
        if as_text:
            return self._r.text
        return self._r.content


class _LiveNunba:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self._s = requests.Session()

    def _url(self, path: str) -> str:
        if path.startswith("http"):
            return path
        if not path.startswith("/"):
            path = "/" + path
        return f"{self.base}{path}"

    def get(self, path: str, **kw):
        kw.setdefault("timeout", DEFAULT_TIMEOUT)
        r = self._s.get(self._url(path), **kw)
        return _Resp(r)

    def post(self, path: str, json=None, headers=None, data=None, **kw):
        kw.setdefault("timeout", DEFAULT_TIMEOUT)
        r = self._s.post(self._url(path), json=json, headers=headers, data=data, **kw)
        return _Resp(r)

    def delete(self, path: str, **kw):
        kw.setdefault("timeout", DEFAULT_TIMEOUT)
        r = self._s.delete(self._url(path), **kw)
        return _Resp(r)


def _live_nunba_reachable(base: str, timeout: float = 3.0) -> bool:
    try:
        r = requests.get(f"{base}/status", timeout=timeout)
        return r.status_code == 200
    except Exception:
        return False


@pytest.fixture
def live_nunba():
    """Return a live-HTTP client for the running Nunba instance.

    Skips the test if the live instance is unreachable.  The running
    instance is assumed to be the frozen desktop build on :5000
    (PID typically in the thousands) driven by a human operator — we
    don't own its lifecycle.
    """
    if not _live_nunba_reachable(NUNBA_BASE):
        pytest.skip(
            f"Live Nunba unreachable at {NUNBA_BASE}/status — "
            "start the desktop app or set NUNBA_LIVE_URL."
        )
    return _LiveNunba(NUNBA_BASE)


def _unique_device_id(prefix: str) -> str:
    """Return a unique device_id per test to avoid collisions with
    the running Nunba's real guest users."""
    return f"{prefix}-{int(time.time()*1000)}"
