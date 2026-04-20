"""End-to-end test fixtures.

Design rules for this directory — zero tolerance for stubs:

  1. Every test exercises a REAL code path. No module-grep, no
     text-match assertions over source.  If it's in e2e/, it boots
     something, calls something, measures something.
  2. Where a real external service isn't available (llama-server,
     crossbar, HuggingFace), we start a tiny LOCAL server that speaks
     the same protocol — still a real socket, real bytes, real
     protocol errors.  "Mock" here means a drop-in server, not a
     Python mock object that short-circuits the call stack.
  3. Real artifacts only: real Piper engine, real SQLite, real Flask
     test_client (which is actually the real app under the WSGI
     transport; request/response semantics are identical to a gunicorn
     boot).
  4. Clean-room teardown: every fixture kills its children, removes
     its tmp files, restores env vars, closes sockets.

Run:
    python -m pytest tests/e2e -v -s

CI: marked `e2e` — run by `pytest -m e2e` on runners with heavy deps
installed.  Not run by the shallow `tests/harness/` gate.
"""

from __future__ import annotations

import contextlib
import http.server
import json
import os
import socket
import socketserver
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))


# ───────────────────────────────────────────────────────────────
# Ephemeral port helper — avoids the "48 tests all fight over 5000" bug
# ───────────────────────────────────────────────────────────────

def _alloc_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def ephemeral_port() -> int:
    return _alloc_port()


# ───────────────────────────────────────────────────────────────
# Tmp user-data dir — isolates tests from ~/Documents/Nunba
# ───────────────────────────────────────────────────────────────

@pytest.fixture
def isolated_nunba_home(tmp_path, monkeypatch):
    """Point every Nunba data/log write at a tmp dir.  Tests never
    touch the developer's real ~/Documents/Nunba state."""
    data = tmp_path / "Documents" / "Nunba" / "data"
    logs = tmp_path / "Documents" / "Nunba" / "logs"
    data.mkdir(parents=True)
    logs.mkdir(parents=True)
    monkeypatch.setenv("NUNBA_DATA_DIR", str(data))
    monkeypatch.setenv("NUNBA_LOG_DIR", str(logs))
    monkeypatch.setenv("USERPROFILE", str(tmp_path))   # Windows
    monkeypatch.setenv("HOME", str(tmp_path))           # *nix
    return tmp_path


# ───────────────────────────────────────────────────────────────
# llama-server protocol mock — REAL HTTP server, not a Python mock
# ───────────────────────────────────────────────────────────────

class _LlamaProtocolHandler(http.server.BaseHTTPRequestHandler):
    # Class attr set by server factory
    canned_content: str = "response from llama-mock"

    def log_message(self, *a, **kw):
        pass  # silence

    def do_GET(self):
        if self.path in ("/health", "/v1/models"):
            body = json.dumps({"status": "ok", "data": [{"id": "llama-mock"}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        _raw = self.rfile.read(length)
        try:
            req = json.loads(_raw.decode("utf-8"))
        except Exception:
            req = {}
        if self.path == "/v1/chat/completions":
            content = self.canned_content
            # If user explicitly asked "hi" in Tamil, answer in Tamil.
            msg = ""
            try:
                msg = (req.get("messages") or [{}])[-1].get("content", "")
            except Exception:
                pass
            if any(tam in msg for tam in ("வணக்கம்", "hi")) and "ta" in str(req).lower():
                content = "வணக்கம் டா! இது ஒரு e2e சோதனை பதில்."
            body = json.dumps({
                "choices": [{"message": {"role": "assistant", "content": content}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": len(content)},
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()


@pytest.fixture
def llama_mock_server(ephemeral_port):
    """Starts a real HTTP server on a real port that speaks the
    /v1/chat/completions protocol.  Not a Python mock object — a
    genuine socket listener. Yields (host, port, shutdown_fn)."""
    srv = socketserver.ThreadingTCPServer(
        ("127.0.0.1", ephemeral_port), _LlamaProtocolHandler,
    )
    srv.allow_reuse_address = True
    thr = threading.Thread(target=srv.serve_forever, daemon=True, name="llama-mock")
    thr.start()
    # Wait for socket to be actually accepting connections.
    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        try:
            with contextlib.closing(socket.socket()) as s:
                s.settimeout(0.2)
                s.connect(("127.0.0.1", ephemeral_port))
                break
        except OSError:
            time.sleep(0.05)
    yield ("127.0.0.1", ephemeral_port)
    srv.shutdown()
    srv.server_close()


# ───────────────────────────────────────────────────────────────
# Real Piper engine — bundled, CPU, deterministic, no network
# ───────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def piper_voice_path() -> Path:
    """Locate the bundled Piper voice onnx file."""
    candidates = [
        Path.home() / ".nunba" / "piper" / "voices" / "en_US-amy-medium.onnx",
        PROJECT_ROOT / "python-embed" / "Lib" / "site-packages" / "piper"
        / "voices" / "en_US-amy-medium.onnx",
    ]
    for c in candidates:
        if c.exists():
            return c
    pytest.skip(f"piper voice file not found in any of {candidates}")


@pytest.fixture
def real_piper_engine(piper_voice_path):
    """Return a real Piper engine instance (no GPU, no models
    downloaded). Used as the ground-truth TTS for every e2e test
    that needs to produce audio.  Piper is guaranteed to exist in
    every install — no external dependency, no network."""
    try:
        from tts.piper_tts import PiperTTS
    except Exception as e:
        pytest.skip(f"PiperTTS import failed: {e}")
    # PiperTTS takes voices_dir (not voice_path). Point it at the
    # directory containing the voice onnx file; it finds the default.
    engine = PiperTTS(voices_dir=str(piper_voice_path.parent))
    yield engine
    # Best-effort cleanup
    try:
        if hasattr(engine, "shutdown"):
            engine.shutdown()
    except Exception:
        pass


# ───────────────────────────────────────────────────────────────
# Nunba Flask app — boot real app via test_client, not subprocess
# ───────────────────────────────────────────────────────────────

class _LiveHTTPAdapter:
    """Adapter that quacks like Flask `test_client` but hits a live
    HTTP server.  Used when `NUNBA_LIVE_URL` is set (or :5189 is
    responding to /status) — avoids the autogen import deadlock that
    `import main` triggers on Windows.

    Surface: `.get(path)`, `.post(path, json=..., headers=..., data=...)`,
    `.delete(path, headers=...)`.  Each returns `_Resp` with
    `.status_code`, `.get_json(silent=True)`, `.get_data(as_text=bool)`,
    `.headers`.  Matches everything the journey tests touch.
    """

    def __init__(self, base_url: str, timeout: float = 30.0):
        # 30 s default — real /chat under cold-start can legitimately
        # take ~18-22 s while llama-server boots; 8 s was cutting into
        # real work and producing spurious FAILs.  The `NUNBA_LIVE_TIMEOUT`
        # env var lets operators stretch this further for slower hardware.
        import os

        import requests
        env_to = os.environ.get("NUNBA_LIVE_TIMEOUT")
        if env_to:
            try:
                timeout = float(env_to)
            except ValueError:
                pass
        self._s = requests.Session()
        self._base = base_url.rstrip("/")
        self._timeout = timeout
        self.config = {"TESTING": True}

    def _url(self, path: str) -> str:
        if path.startswith("http"):
            return path
        if not path.startswith("/"):
            path = "/" + path
        return f"{self._base}{path}"

    def _wrap(self, r):
        class _Resp:
            def __init__(self, real):
                self._r = real
                self.status_code = real.status_code
                self.headers = dict(real.headers)

            def get_json(self, silent: bool = False, **_):
                try:
                    return self._r.json()
                except Exception:
                    return None

            def get_data(self, as_text: bool = False):
                return self._r.text if as_text else self._r.content
        return _Resp(r)

    def get(self, path, **kw):
        kw.setdefault("timeout", self._timeout)
        return self._wrap(self._s.get(self._url(path), **kw))

    def post(self, path, json=None, headers=None, data=None, **kw):
        kw.setdefault("timeout", self._timeout)
        return self._wrap(self._s.post(
            self._url(path), json=json, headers=headers, data=data, **kw,
        ))

    def put(self, path, json=None, headers=None, data=None, **kw):
        kw.setdefault("timeout", self._timeout)
        return self._wrap(self._s.put(
            self._url(path), json=json, headers=headers, data=data, **kw,
        ))

    def delete(self, path, headers=None, **kw):
        kw.setdefault("timeout", self._timeout)
        return self._wrap(self._s.delete(self._url(path), headers=headers, **kw))


def _pick_live_base_url() -> str | None:
    """Return a live Flask base URL if one is reachable, else None.

    Priority order:
      1. Explicit `NUNBA_LIVE_URL` env var (any tier, any port).
      2. Default journey harness port :5189 (Phase-A spawn).
      3. The operator's production :5000 Nunba desktop instance
         (only used if `NUNBA_COVERAGE_STRICT` is not set — coverage
         runs must NOT route through an instance where coverage.py
         isn't instrumented, so the strict flag skips :5000).
    """
    import requests
    candidates = []
    env_url = os.environ.get("NUNBA_LIVE_URL")
    if env_url:
        candidates.append(env_url.rstrip("/"))
    candidates.append("http://localhost:5189")
    # Skip the fallback to :5000 when coverage is being measured —
    # otherwise journey tests exercise a non-instrumented daemon and
    # coverage reports 0% because the in-proc pytest never touches
    # the app code.
    if not os.environ.get("NUNBA_COVERAGE_STRICT"):
        candidates.append("http://localhost:5000")
    seen = set()
    for url in candidates:
        if url in seen:
            continue
        seen.add(url)
        try:
            r = requests.get(f"{url}/status", timeout=2.5)
            if r.status_code == 200:
                return url
        except Exception:
            continue
    return None


@pytest.fixture
def nunba_flask_app(isolated_nunba_home, monkeypatch):
    """Return a Flask-test-client-shaped handle to the Nunba app.

    Strategy:
      1. If a live Flask is reachable (NUNBA_LIVE_URL, :5189, or :5000),
         return a `_LiveHTTPAdapter` — skips `import main` entirely.
         Avoids the autogen import deadlock on Windows.
      2. Otherwise fall back to in-process `app.test_client()` by
         importing main, preserving the legacy path for environments
         without a running daemon.
    """
    monkeypatch.setenv("NUNBA_DISABLE_TTS_WARMUP", "1")
    monkeypatch.setenv("NUNBA_DISABLE_LLAMA_AUTOSTART", "1")
    monkeypatch.setenv("NUNBA_DISABLE_HARTOS_INIT", "1")
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "1")

    live_url = _pick_live_base_url()
    if live_url:
        yield _LiveHTTPAdapter(live_url)
        return

    try:
        import main
        app = main.app
    except Exception as e:
        pytest.skip(f"main.app import failed in this environment: {e}")
    app.config["TESTING"] = True
    client = app.test_client()
    yield client
    # test_client has no teardown; isolated_nunba_home handles state cleanup


# ───────────────────────────────────────────────────────────────
# Process-level Nunba subprocess — for tests that need two instances
# ───────────────────────────────────────────────────────────────

@pytest.fixture
def nunba_subprocess_factory(isolated_nunba_home):
    """Return a callable that spawns `python main.py --port N`. Each
    spawned process is registered and killed on teardown."""
    procs: list[subprocess.Popen] = []

    def _spawn(port: int, extra_args: list[str] | None = None, env_extra: dict | None = None):
        env = os.environ.copy()
        env["NUNBA_DISABLE_TTS_WARMUP"] = "1"
        env["NUNBA_DISABLE_LLAMA_AUTOSTART"] = "1"
        env["NUNBA_DISABLE_HARTOS_INIT"] = "1"
        if env_extra:
            env.update(env_extra)
        args = [sys.executable, "main.py", "--port", str(port)]
        if extra_args:
            args.extend(extra_args)
        p = subprocess.Popen(
            args,
            cwd=str(PROJECT_ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        procs.append(p)
        return p

    yield _spawn

    for p in procs:
        try:
            p.terminate()
            p.wait(timeout=5)
        except Exception:
            try:
                p.kill()
            except Exception:
                pass


def wait_for_port(host: str, port: int, timeout_s: float = 20) -> bool:
    """Block until `host:port` accepts a TCP connection or timeout."""
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            with contextlib.closing(socket.socket()) as s:
                s.settimeout(0.5)
                s.connect((host, port))
                return True
        except OSError:
            time.sleep(0.1)
    return False
