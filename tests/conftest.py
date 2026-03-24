"""
conftest.py - Shared pytest fixtures for Nunba backend tests.

Provides:
- Flask test client (isolated from main.py side-effects)
- Temp directory fixtures for config files
- Mock LLM server fixture
- Auth token fixture (register + login to get JWT)
"""
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import patch

import pytest

# Ensure project root is on sys.path so imports work
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ---------------------------------------------------------------------------
# Temp directory for config files (llama_config, etc.)
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_config_dir(tmp_path):
    """Provide an isolated temp directory for config files."""
    config_dir = tmp_path / ".nunba"
    config_dir.mkdir()
    return str(config_dir)


@pytest.fixture
def sample_llama_config(tmp_config_dir):
    """Write a sample llama_config.json and return the dir path."""
    config_file = os.path.join(tmp_config_dir, "llama_config.json")
    config = {
        "first_run": False,
        "auto_start_server": True,
        "selected_model_index": 0,
        "server_port": 8080,
        "use_gpu": False,
        "context_size": 8192,
        "cloud_provider": None,
        "cloud_model": None,
        "llm_mode": "local",
        "llama_cpp_build": None,
    }
    with open(config_file, "w") as f:
        json.dump(config, f, indent=2)
    return tmp_config_dir


# ---------------------------------------------------------------------------
# Mock LLM HTTP server (simulates llama.cpp /v1/* and /health)
# ---------------------------------------------------------------------------

class MockLLMHandler(BaseHTTPRequestHandler):
    """Minimal HTTP handler that mimics llama.cpp server endpoints."""

    def do_GET(self):
        if self.path == "/health":
            self._respond(200, {"status": "ok"})
        elif self.path == "/v1/models":
            self._respond(200, {
                "object": "list",
                "data": [{"id": "mock-model", "object": "model"}]
            })
        else:
            self._respond(404, {"error": "not found"})

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length else b""
        if self.path == "/v1/chat/completions":
            self._respond(200, {
                "choices": [
                    {"message": {"role": "assistant", "content": "Hello from mock LLM!"}}
                ]
            })
        else:
            self._respond(404, {"error": "not found"})

    def _respond(self, code, body_dict):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body_dict).encode())

    def log_message(self, *args):
        """Suppress log output during tests."""
        pass


@pytest.fixture
def mock_llm_server():
    """
    Start a mock LLM HTTP server on a random available port.

    Yields (host, port) tuple.  Server is shut down after the test.
    """
    server = HTTPServer(("127.0.0.1", 0), MockLLMHandler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield "127.0.0.1", port
    server.shutdown()


# ---------------------------------------------------------------------------
# Flask test client (lightweight -- avoids heavy main.py side-effects)
# ---------------------------------------------------------------------------

@pytest.fixture
def flask_app(tmp_path):
    """
    Create a minimal Flask app with chatbot_routes registered.

    This avoids importing main.py directly (which triggers argparse, logging,
    social init, etc.). Instead we create a bare Flask app and register only
    the chatbot routes.
    """
    from flask import Flask

    # Set required env vars before importing chatbot_routes
    os.environ.setdefault("HEVOLVE_DB_PATH", str(tmp_path / "test.db"))
    os.environ.setdefault("SOCIAL_RATE_LIMIT_DISABLED", "1")

    # Write minimal config.json and template.json that chatbot_routes expects
    config_json = tmp_path / "config.json"
    template_json = tmp_path / "template.json"
    config_json.write_text(json.dumps({"IP_ADDRESS": {}}))
    template_json.write_text(json.dumps({
        "abusive": ["Please be respectful."],
        "greet": ["Hello!"],
        "learn": ["What do you want to learn?"],
        "revise": ["What do you want to revise?"],
    }))

    app = Flask(__name__, static_folder=None)
    app.config["TESTING"] = True

    # Patch the config/template loading paths used by chatbot_routes
    # chatbot_routes uses script_dir to locate config.json/template.json.
    # We patch module-level variables after import.
    with patch.dict(os.environ, {
        "HEVOLVE_DB_PATH": str(tmp_path / "test.db"),
        "SOCIAL_RATE_LIMIT_DISABLED": "1",
    }):
        from routes import chatbot_routes as cr
        cr.register_routes(app)

    return app


@pytest.fixture
def client(flask_app):
    """Flask test client for making HTTP requests."""
    return flask_app.test_client()


# ---------------------------------------------------------------------------
# Auth token fixture (for endpoints that check auth)
# ---------------------------------------------------------------------------

@pytest.fixture
def auth_headers():
    """Return Authorization headers with a test API token."""
    token = "test-api-token-12345"
    # Set the env var so require_local_or_token accepts it
    os.environ["NUNBA_API_TOKEN"] = token
    yield {"Authorization": f"Bearer {token}"}
    os.environ.pop("NUNBA_API_TOKEN", None)
