"""
hartos_backend_adapter.py - Adapter to route requests to hart-backend

This module provides proxy functions to forward API requests to the hart-backend
package, allowing Nunba to use the full LangChain-powered chat, social, and prompt
capabilities while keeping desktop-specific features local.

In bundled/pip-installed mode (NUNBA_BUNDLED env var set by main.py):
  - Tier-1: direct in-process import of hart_intelligence (no ports)
  - Tier-2: llama.cpp fallback (if import fails)
  - HTTP proxy to port 6777 is NEVER used in bundled mode.

In standalone mode (no NUNBA_BUNDLED):
  - Tier-1: direct import (if pip-installed)
  - Tier-2: HTTP proxy to port 6777
  - Tier-3: llama.cpp fallback

Usage:
    from routes.hartos_backend_adapter import chat, get_prompts, social_api
"""

import logging
import os
import sys
import time
from functools import wraps
from typing import Any

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

# Detect bundled mode: PyInstaller frozen or NUNBA_BUNDLED env var.
# In bundled mode, direct in-process import won't work (hart_intelligence not bundled),
# but HTTP proxy to port 6777 is allowed if the service is running externally.
_BUNDLED_MODE = bool(os.environ.get('NUNBA_BUNDLED') or getattr(sys, 'frozen', False))

# Enable HARTOS tracing by default in Nunba.  AGENT_ENGINE is OPT-IN
# (2026-04-19 regression fix): having it default-true caused a 244s cold-
# boot stall in frozen builds because `init_agent_engine` transitively
# pulls autogen → openai → langchain → transformers → sympy at import time,
# and that chain races with Nunba's own `hartos-init` thread (below).  Flat
# desktop users get no benefit from it (it's a hive/central-tier daemon),
# so default-off is the correct default.  Hive deployments can set the env
# var explicitly.  Smoking gun: HARTOS commit 41d99d6 ("master key changes
# with embodied Ai integration", 2026-02-12) added the unconditional
# init_agent_engine(app) call to init_social.
os.environ.setdefault('AGENT_LIGHTNING_ENABLED', 'true')

# Configuration
HARTOS_BACKEND_URL = os.environ.get('HARTOS_BACKEND_URL', 'http://localhost:6777')
HEVOLVE_SOCIAL_URL = os.environ.get('HEVOLVE_SOCIAL_URL', f'{HARTOS_BACKEND_URL}/api/social')
REQUEST_TIMEOUT = 60  # seconds (read timeout)
AGENT_CREATION_TIMEOUT = 300  # seconds (5 min for agent creation via autogen)
CONNECT_TIMEOUT = 3   # seconds (connection timeout - fail fast if port is dead)

# Session with no retries — fail fast when port 6777 is dead instead of
# urllib3's default 3 retries (which turns a 3s timeout into 12s).
_session = requests.Session()
_session.mount('http://', HTTPAdapter(max_retries=Retry(total=0)))
_session.mount('https://', HTTPAdapter(max_retries=Retry(total=0)))

# Circuit breaker: after N consecutive HTTP failures, stop trying port 6777
# and go straight to fallback (llama.cpp). Resets on success or after cooldown.
_http_fail_count = 0
_HTTP_FAIL_THRESHOLD = 2  # After 2 failures, skip HTTP and go to fallback
_http_fail_time = 0       # Timestamp of the last failure (epoch seconds)
_HTTP_FAIL_COOLDOWN = 60  # Seconds before retrying after circuit breaker opens

# ── Thinking Trace Capture ──────────────────────────────────────────────
# In local/desktop mode, crossbar (WAMP) is not running. The autogen pipeline
# in create_recipe.py / reuse_recipe.py publishes thinking traces (priority=49)
# via publish_async → crossbar, but those messages silently vanish.
# We monkey-patch publish_async in all 3 modules so thinking traces are
# captured into a thread-safe deque, then drained into the HTTP response.
import threading as _threading
from collections import OrderedDict as _OrderedDict

# Per-request thinking traces — isolated by request_id to prevent daemon
# traces from leaking into user chat responses.
# OrderedDict preserves insertion order so FIFO eviction works correctly
# (request_ids are UUIDs — alphabetical sort ≠ chronological order).
_thinking_traces_by_request = _OrderedDict()  # {request_id: [traces]}
_thinking_traces_lock = _threading.Lock()


def _capture_thinking(message):
    """Capture priority-49 thinking messages into per-request trace buffer."""
    try:
        import json as _json
        msg = message if isinstance(message, dict) else _json.loads(message)
        if isinstance(msg, dict) and msg.get('priority') == 49 and msg.get('action') == 'Thinking':
            req_id = msg.get('request_id') or msg.get('request_Id') or 'unknown'
            with _thinking_traces_lock:
                if req_id not in _thinking_traces_by_request:
                    _thinking_traces_by_request[req_id] = []
                _thinking_traces_by_request[req_id].append(msg)
                # Cap per-request to 50 traces
                if len(_thinking_traces_by_request[req_id]) > 50:
                    _thinking_traces_by_request[req_id] = _thinking_traces_by_request[req_id][-50:]
                # Evict oldest request (FIFO via OrderedDict insertion order)
                if len(_thinking_traces_by_request) > 20:
                    _thinking_traces_by_request.popitem(last=False)
    except Exception:
        pass


def drain_thinking_traces(request_id=None):
    """Drain thinking traces for a specific request.

    Returns only traces matching the given request_id. Daemon traces
    (request_id starting with 'daemon_' or 'unknown') are never returned
    to user-facing callers — they belong to background agent tasks.
    """
    with _thinking_traces_lock:
        if request_id and request_id in _thinking_traces_by_request:
            return _thinking_traces_by_request.pop(request_id)
        if request_id:
            # Specific request_id not found — return empty, don't drain daemon traces
            return []
        # No request_id: drain only non-daemon traces (backward compat)
        user_traces = []
        daemon_keys = []
        for req_id, traces in _thinking_traces_by_request.items():
            if req_id == 'unknown' or str(req_id).startswith('daemon_'):
                daemon_keys.append(req_id)
            else:
                user_traces.extend(traces)
        # Remove drained user traces, keep daemon traces
        for key in list(_thinking_traces_by_request.keys()):
            if key not in daemon_keys:
                del _thinking_traces_by_request[key]
        return user_traces


# ── Non-blocking HARTOS import — starts immediately, doesn't block main.py ──
# LangChain + helper imports take 30s. Instead of blocking module load,
# we start the import in a background thread immediately. By the time the
# user sends their first message, it's usually already done.
_hartos_backend_available = False
_hevolve_app = None
_active_tier = "unknown"
_hartos_init_lock = _threading.Lock()
_hartos_initialized = False


# NOTE: `_ensure_hartos` is defined later (after `_background_hartos_init`),
# where it can lazy-spawn the init thread if `start_hartos_init_background()`
# wasn't called explicitly.  Historically there was an earlier stub here; it
# was removed 2026-04-19 to avoid a confusing duplicate definition.


def _background_hartos_init():
    """Import HARTOS in background thread. Runs at module load, not on first chat."""
    global _hartos_backend_available, _hevolve_app, _active_tier, _hartos_initialized

    with _hartos_init_lock:
        if _hartos_initialized:
            return
        try:
            from hart_intelligence import app as hevolve_app
            _hartos_backend_available = True
            _hevolve_app = hevolve_app
            _active_tier = "Tier-1 (direct in-process LangChain)"
            logger.info("=" * 60)
            logger.info("BACKEND ADAPTER: Tier-1 ACTIVE — hart-backend loaded (background)")
            logger.info("=" * 60)

            # Patch publish_async for thinking traces
            import hart_intelligence as _lgapi
            _orig = _lgapi.publish_async

            def _patched(topic, message, timeout=2.0):
                _orig(topic, message, timeout)
                _capture_thinking(message)

            _lgapi.publish_async = _patched

            for _mod_name in ('create_recipe', 'reuse_recipe'):
                try:
                    _mod = __import__(_mod_name)
                    _orig_fn = _mod.publish_async

                    def _make_patch(orig):
                        def _p(topic, message, timeout=2.0):
                            orig(topic, message, timeout)
                            _capture_thinking(message)
                        return _p

                    _mod.publish_async = _make_patch(_orig_fn)
                except ImportError:
                    pass

            logger.info("  Thinking trace capture: ACTIVE")
            _hartos_initialized = True
        except Exception as _ie:
            _hartos_initialized = True  # mark done even on failure
            # Write to file directly — logger may be silenced in frozen builds
            try:
                import traceback as _tb
                _err_path = os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba', 'logs', 'hartos_init_error.log')
                with open(_err_path, 'w') as _ef:
                    _ef.write(f"Tier-1 import failed: {_ie}\n")
                    _tb.print_exc(file=_ef)
            except Exception:
                pass
            if _BUNDLED_MODE:
                _user_set_backend = os.environ.get('HARTOS_BACKEND_URL')
                if _user_set_backend:
                    _active_tier = "Tier-2 (HTTP proxy, bundled with explicit HARTOS_BACKEND_URL)"
                    logger.info(f"BACKEND ADAPTER: Tier-1 FAILED — Tier-2 ({_ie})")
                else:
                    _active_tier = "Tier-3 (llama.cpp fallback, bundled mode)"
                    _http_fail_count = _HTTP_FAIL_THRESHOLD
                    _http_fail_time = time.time()
                    logger.warning(f"BACKEND ADAPTER: Tier-1 FAILED — Tier-3 llama.cpp ({_ie})")
            else:
                _active_tier = "Tier-2 (HTTP proxy to port 6777)"
                logger.info(f"BACKEND ADAPTER: Tier-1 unavailable — Tier-2 proxy ({_ie})")


# ── HARTOS import lifecycle — EXPLICIT KICKOFF ONLY ──
# Previously we spawned a `hartos-init` thread at module-import time (i.e.,
# while Nunba's `main.py` was still executing).  That thread races with
# `_bg_import` (app.py) on the same langchain/transformers/torch module
# import locks; Python serializes per-module, so on a cold DLL cache the
# two threads alternate and each boot adds 30-120s of wall-clock to
# `main.py.exec_module`.  2026-04-19 startup_trace.log confirmed this
# via parallel Thread-9 (hartos-init) vs _bg_import stacks.
#
# Fix: DO NOT spawn at module load.  Caller must invoke
# `start_hartos_init_background()` AFTER main.py is fully imported.
# `main.py._deferred_social_init()` is the designated kickoff site.
#
# `_ensure_hartos()` also lazy-spawns on first query, so accidental
# early access from an alternate call-path still works — just slower.

_hartos_init_thread_started = False
_hartos_init_thread_started_lock = _threading.Lock()


def start_hartos_init_background():
    """Spawn the HARTOS background init thread.  Idempotent.

    Call this AFTER main.py has finished importing (e.g., from
    `_deferred_social_init`), never from module-load path.  Safe to call
    multiple times — only the first call spawns the thread.
    """
    global _hartos_init_thread_started
    with _hartos_init_thread_started_lock:
        if _hartos_init_thread_started:
            return
        _hartos_init_thread_started = True
    _threading.Thread(target=_background_hartos_init, daemon=True,
                      name='hartos-init').start()


def _ensure_hartos():  # noqa: F811 — intentional override of earlier stub
    """Check if HARTOS is ready. Non-blocking — returns current state.

    If the background init thread was never started (caller skipped the
    `_deferred_social_init` path), lazy-spawn it here so Tier-1 still has
    a chance.  Does not block the caller.
    """
    if not _hartos_init_thread_started:
        start_hartos_init_background()
    return _hartos_backend_available


_first_chat_logged = False


def _handle_response(response: requests.Response) -> dict[str, Any]:
    """Handle HTTP response and return JSON or error dict"""
    try:
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP error: {e}")
        return {"error": str(e), "status_code": response.status_code}
    except requests.exceptions.JSONDecodeError:
        return {"response": response.text}
    except Exception as e:
        logger.error(f"Request error: {e}")
        return {"error": str(e)}


def with_fallback(fallback_fn):
    """Decorator to provide fallback when hart-backend is unavailable"""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                return fn(*args, **kwargs)
            except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
                logger.warning(f"hart-backend unavailable, using fallback: {e}")
                return fallback_fn(*args, **kwargs)
        return wrapper
    return decorator


# ============== CHAT API ==============

def _fallback_chat(text: str, user_id: str = None, **kwargs) -> dict[str, Any]:
    """Fallback chat using local llama.cpp directly (no langchain needed).

    Builds a minimal context with system prompt + preferred language so the
    response isn't a bare completion. Used while langchain is still loading.
    """
    try:
        from llama.llama_config import check_llama_health, get_llama_endpoint
        if check_llama_health():
            endpoint = get_llama_endpoint()

            # Build context: system prompt + language
            preferred_lang = kwargs.get('preferred_lang', 'en')
            _lang_names = {
                'en': 'English', 'ta': 'Tamil', 'hi': 'Hindi', 'te': 'Telugu',
                'bn': 'Bengali', 'mr': 'Marathi', 'gu': 'Gujarati', 'kn': 'Kannada',
                'ml': 'Malayalam', 'pa': 'Punjabi', 'ur': 'Urdu',
                'es': 'Spanish', 'fr': 'French', 'de': 'German', 'pt': 'Portuguese',
                'ru': 'Russian', 'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese',
                'ar': 'Arabic', 'tr': 'Turkish', 'vi': 'Vietnamese', 'th': 'Thai',
                'id': 'Indonesian', 'pl': 'Polish', 'nl': 'Dutch', 'sv': 'Swedish',
                'fi': 'Finnish', 'it': 'Italian',
            }
            lang = _lang_names.get(preferred_lang, 'English')

            system_prompt = (
                f"You are Nunba, a friendly and helpful local AI assistant. "
                f"You are part of Hevolve — a personal AI platform that runs locally "
                f"on the user's device. Privacy-first: everything stays on the user's "
                f"device. Respond in {lang}. Be concise and natural."
            )

            messages = [{"role": "system", "content": system_prompt}]

            # Include conversation history if available
            conv_id = kwargs.get('conversation_id')
            if conv_id:
                try:
                    from sql.crud import get_conversation_history
                    history = get_conversation_history(conv_id, limit=10)
                    for msg in (history or []):
                        role = 'assistant' if msg.get('is_bot') else 'user'
                        messages.append({"role": role, "content": msg.get('text', '')})
                except Exception:
                    pass  # DB not ready — no history, that's fine

            messages.append({"role": "user", "content": text})

            response = requests.post(
                f"{endpoint}/v1/chat/completions",
                json={"model": "local", "messages": messages, "stream": False},
                timeout=120
            )
            data = response.json()
            return {
                "text": data.get("choices", [{}])[0].get("message", {}).get("content", ""),
                "source": "local_llama"
            }
    except Exception as e:
        logger.error(f"Local Llama fallback failed: {e}")

    return {
        "text": "Loading tools... try again in a moment.",
        "source": "loading", "loading": True
    }


@with_fallback(_fallback_chat)
def chat(
    text: str,
    user_id: str = None,
    agent_id: int = None,
    conversation_id: str = None,
    request_id: str = None,
    preferred_lang: str = "en",
    probe: bool = False,
    create_agent: bool = False,
    casual_conv: bool = False,
    video_req: bool = False,
    media_request: bool = False,
    media_mode: str = 'text',
    autonomous: bool = False,
    agentic_execute: bool = False,
    agentic_plan: dict = None,
    intelligence_preference: str = 'auto',
    **kwargs
) -> dict[str, Any]:
    """
    Send chat message to hart_intelligence.

    When hart-backend is pip-installed, calls the /chat endpoint directly
    via Flask test_client (in-process, no HTTP round-trip).
    Otherwise falls back to HTTP proxy on port 6777.

    Maps Nunba's parameter names to what hart_intelligence /chat expects:
      text → prompt, agent_id → prompt_id
    """
    import time as _time

    # If HARTOS (langchain) is still loading, use llama.cpp directly —
    # no need to wait, the LLM is already running
    if not _hartos_initialized:
        logger.info("[CHAT] HARTOS still loading — using direct llama.cpp fallback")
        return _fallback_chat(text, user_id, **kwargs)

    # Log which path the first chat call takes
    global _first_chat_logged, _http_fail_count, _http_fail_time
    if not _first_chat_logged:
        _first_chat_logged = True
        logger.info(f"[FIRST CHAT] active_tier={_active_tier}, "
                     f"backend_available={_hartos_backend_available}, "
                     f"bundled={_BUNDLED_MODE}, "
                     f"http_fails={_http_fail_count}")

    payload = {
        "prompt": text,
        "user_id": user_id or "guest",
        "prompt_id": int(agent_id) if agent_id is not None and str(agent_id).isdigit() else None,
        "request_id": request_id or str(int(_time.time())),
        "casual_conv": casual_conv,
        "probe": probe,
        "intermediate": False,
        "create_agent": create_agent,
        "file_id": 0,
        "preferred_lang": preferred_lang,
        "tools": None,
        "video_req": video_req,
        "media_request": media_request,
        "media_mode": media_mode,  # TODO: HARTOS /chat needs data.get('media_mode') to use this
        "autonomous": autonomous,
        "agentic_execute": agentic_execute,
    }
    if agentic_plan:
        payload["agentic_plan"] = agentic_plan
    # Tier ladder pref: forwarded so HARTOS dispatcher can route
    # delegate='hive' to MoE HiveMind fusion when user asks for it.
    # Older HARTOS builds ignore unknown keys, so this is safe to send
    # unconditionally; we still guard the key so tests that snapshot
    # the payload shape don't see spurious defaults.
    if intelligence_preference and intelligence_preference != 'auto':
        payload["intelligence_preference"] = intelligence_preference

    # Direct in-process call when hart-backend is available
    if _hartos_backend_available and _hevolve_app:
        try:
            logger.debug("Chat routing: Tier-1 (direct in-process)")
            with _hevolve_app.test_client() as client:
                resp = client.post('/chat', json=payload)
                result = resp.get_json() or {}
                if "response" in result and "text" not in result:
                    result["text"] = result["response"]
                result["_tier"] = "direct"
                return result
        except Exception as e:
            logger.warning(f"Tier-1 direct call FAILED, falling through: {e}")
            if _BUNDLED_MODE:
                logger.warning(f"Bundled mode: Tier-1 failed, trying HTTP proxy: {e}")

    # Circuit breaker: skip HTTP if port 6777 has failed repeatedly
    if _http_fail_count >= _HTTP_FAIL_THRESHOLD:
        if time.time() - _http_fail_time > _HTTP_FAIL_COOLDOWN:
            _http_fail_count = 0  # Cooldown expired, allow a retry
            logger.info("Circuit breaker reset after cooldown, retrying HTTP to port 6777")
        else:
            logger.debug("Circuit breaker open: skipping HTTP to port 6777, using fallback")
            raise requests.exceptions.ConnectionError("Circuit breaker: port 6777 not available")

    # HTTP proxy fallback (standalone, remote, or bundled mode)
    try:
        logger.debug(f"Chat routing: Tier-2 (HTTP proxy to {HARTOS_BACKEND_URL}/chat)")
        _read_timeout = AGENT_CREATION_TIMEOUT if (create_agent or agentic_execute) else REQUEST_TIMEOUT
        response = _session.post(
            f"{HARTOS_BACKEND_URL}/chat",
            json=payload,
            timeout=(CONNECT_TIMEOUT, _read_timeout),
        )
        _http_fail_count = 0  # Reset on success
        logger.debug("Chat routing: Tier-2 HTTP proxy succeeded")
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
        _http_fail_count += 1
        _http_fail_time = time.time()
        logger.warning(f"Tier-2 HTTP proxy FAILED ({_http_fail_count}/{_HTTP_FAIL_THRESHOLD}): {e}")
        raise
    result = _handle_response(response)

    # Normalize response: langchain returns {"response": "..."}, Nunba expects {"text": "..."}
    if "response" in result and "text" not in result:
        result["text"] = result["response"]

    return result


def chat_stream(text: str, user_id: str = None, **kwargs):
    """Stream chat response from hart-backend"""
    payload = {
        "prompt": text,  # Backend /chat expects 'prompt', not 'text'
        "user_id": user_id or "guest",
        "stream": True,
        **kwargs
    }

    response = requests.post(
        f"{HARTOS_BACKEND_URL}/chat",
        json=payload,
        stream=True,
        timeout=REQUEST_TIMEOUT
    )

    for line in response.iter_lines():
        if line:
            yield line.decode('utf-8')


# ============== PROMPTS API ==============

def get_prompts(user_id: str = None) -> dict[str, Any]:
    """Get prompts/agents from hart-backend"""
    global _http_fail_count, _http_fail_time
    params = {"user_id": user_id} if user_id else {}

    if _hartos_backend_available and _hevolve_app:
        try:
            with _hevolve_app.test_client() as client:
                resp = client.get('/prompts', query_string=params)
                return resp.get_json() or {}
        except Exception as e:
            logger.warning(f"Direct get_prompts failed: {e}")

    # Bundled mode: import-only, no HTTP proxy
    if _BUNDLED_MODE:
        return {"prompts": [], "error": "backend_unavailable"}

    if _http_fail_count >= _HTTP_FAIL_THRESHOLD:
        if time.time() - _http_fail_time > _HTTP_FAIL_COOLDOWN:
            _http_fail_count = 0  # Cooldown expired, allow a retry
            logger.info("Circuit breaker reset after cooldown (get_prompts)")
        else:
            return {"prompts": [], "error": "backend_unavailable"}

    try:
        response = _session.get(
            f"{HARTOS_BACKEND_URL}/prompts",
            params=params,
            timeout=(CONNECT_TIMEOUT, REQUEST_TIMEOUT),
        )
        _http_fail_count = 0
        return _handle_response(response)
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
        _http_fail_count += 1
        _http_fail_time = time.time()
        return {"prompts": [], "error": "backend_unavailable"}


def create_prompt(data: dict[str, Any]) -> dict[str, Any]:
    """Create a new prompt/agent"""
    response = requests.post(
        f"{HARTOS_BACKEND_URL}/prompts",
        json=data,
        timeout=REQUEST_TIMEOUT
    )
    return _handle_response(response)


def update_prompt(prompt_id: int, data: dict[str, Any]) -> dict[str, Any]:
    """Update an existing prompt/agent"""
    response = requests.patch(
        f"{HARTOS_BACKEND_URL}/prompts/{prompt_id}",
        json=data,
        timeout=REQUEST_TIMEOUT
    )
    return _handle_response(response)


# ============== SOCIAL API ==============

class SocialAPI:
    """Proxy class for social API endpoints"""

    def __init__(self, base_url: str = None):
        self.base_url = base_url or HEVOLVE_SOCIAL_URL
        self._token = None

    def set_token(self, token: str):
        """Set authentication token"""
        self._token = token

    def _headers(self) -> dict[str, str]:
        """Get request headers with auth token"""
        headers = {"Content-Type": "application/json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        return headers

    def _request(self, method: str, endpoint: str, **kwargs) -> dict[str, Any]:
        """Make HTTP request to social API"""
        url = f"{self.base_url}{endpoint}"
        kwargs.setdefault("headers", self._headers())
        kwargs.setdefault("timeout", REQUEST_TIMEOUT)

        response = requests.request(method, url, **kwargs)
        return _handle_response(response)

    # Auth endpoints
    def register(self, data: dict) -> dict:
        return self._request("POST", "/auth/register", json=data)

    def login(self, data: dict) -> dict:
        result = self._request("POST", "/auth/login", json=data)
        if "token" in result:
            self._token = result["token"]
        return result

    def logout(self) -> dict:
        result = self._request("POST", "/auth/logout")
        self._token = None
        return result

    def me(self) -> dict:
        return self._request("GET", "/auth/me")

    # Users endpoints
    def get_user(self, user_id: str) -> dict:
        return self._request("GET", f"/users/{user_id}")

    def update_user(self, user_id: str, data: dict) -> dict:
        return self._request("PATCH", f"/users/{user_id}", json=data)

    def follow_user(self, user_id: str) -> dict:
        return self._request("POST", f"/users/{user_id}/follow")

    def unfollow_user(self, user_id: str) -> dict:
        return self._request("DELETE", f"/users/{user_id}/follow")

    def get_followers(self, user_id: str) -> dict:
        return self._request("GET", f"/users/{user_id}/followers")

    def get_following(self, user_id: str) -> dict:
        return self._request("GET", f"/users/{user_id}/following")

    # Posts endpoints
    def get_posts(self, params: dict = None) -> dict:
        return self._request("GET", "/posts", params=params)

    def create_post(self, data: dict) -> dict:
        return self._request("POST", "/posts", json=data)

    def get_post(self, post_id: str) -> dict:
        return self._request("GET", f"/posts/{post_id}")

    def update_post(self, post_id: str, data: dict) -> dict:
        return self._request("PATCH", f"/posts/{post_id}", json=data)

    def delete_post(self, post_id: str) -> dict:
        return self._request("DELETE", f"/posts/{post_id}")

    def upvote_post(self, post_id: str) -> dict:
        return self._request("POST", f"/posts/{post_id}/upvote")

    def downvote_post(self, post_id: str) -> dict:
        return self._request("POST", f"/posts/{post_id}/downvote")

    def get_comments(self, post_id: str) -> dict:
        return self._request("GET", f"/posts/{post_id}/comments")

    def create_comment(self, post_id: str, data: dict) -> dict:
        return self._request("POST", f"/posts/{post_id}/comments", json=data)

    # Feed endpoints
    def get_feed(self, params: dict = None) -> dict:
        return self._request("GET", "/feed", params=params)

    def get_trending(self, params: dict = None) -> dict:
        return self._request("GET", "/feed/trending", params=params)

    # Search endpoint
    def search(self, query: str, search_type: str = "posts") -> dict:
        return self._request("GET", "/search", params={"q": query, "type": search_type})

    # Communities endpoints (renamed from submolts in v17)
    def get_communities(self, params: dict = None) -> dict:
        return self._request("GET", "/communities", params=params)

    def create_community(self, data: dict) -> dict:
        return self._request("POST", "/communities", json=data)

    def get_community(self, community_id: str) -> dict:
        return self._request("GET", f"/communities/{community_id}")

    def get_community_posts(self, community_id: str, params: dict = None) -> dict:
        return self._request("GET", f"/communities/{community_id}/posts", params=params)

    def join_community(self, community_id: str) -> dict:
        return self._request("POST", f"/communities/{community_id}/join")

    def leave_community(self, community_id: str) -> dict:
        return self._request("DELETE", f"/communities/{community_id}/leave")

    def get_community_members(self, community_id: str, params: dict = None) -> dict:
        return self._request("GET", f"/communities/{community_id}/members", params=params)

    # Backwards compat aliases
    get_submolts = get_communities
    create_submolt = create_community
    get_submolt = get_community
    join_submolt = join_community
    leave_submolt = leave_community

    # Notifications endpoints
    def get_notifications(self, params: dict = None) -> dict:
        return self._request("GET", "/notifications", params=params)

    def mark_notifications_read(self, ids: list) -> dict:
        return self._request("POST", "/notifications/read", json={"ids": ids})

    # Recipes endpoints
    def get_recipes(self, params: dict = None) -> dict:
        return self._request("GET", "/recipes", params=params)

    def share_recipe(self, data: dict) -> dict:
        return self._request("POST", "/recipes/share", json=data)

    def fork_recipe(self, recipe_id: str) -> dict:
        return self._request("POST", f"/recipes/{recipe_id}/fork")

    # Resonance/Gamification endpoints
    def get_wallet(self) -> dict:
        return self._request("GET", "/resonance/wallet")

    def get_achievements(self, user_id: str = None) -> dict:
        endpoint = f"/achievements/{user_id}" if user_id else "/achievements"
        return self._request("GET", endpoint)

    def daily_checkin(self) -> dict:
        return self._request("POST", "/resonance/daily-checkin")

    # Dashboard endpoints
    def get_dashboard_agents(self) -> dict:
        return self._request("GET", "/dashboard/agents")

    def get_dashboard_health(self) -> dict:
        return self._request("GET", "/dashboard/health")

    # Referral endpoints
    def get_referral_code(self) -> dict:
        return self._request("GET", "/referral/code")

    def use_referral_code(self, data: dict) -> dict:
        return self._request("POST", "/referral/use", json=data)

    def get_referral_stats(self) -> dict:
        return self._request("GET", "/referral/stats")

    # Onboarding endpoints
    def get_onboarding_progress(self) -> dict:
        return self._request("GET", "/onboarding/progress")

    def complete_onboarding_step(self, data: dict) -> dict:
        return self._request("POST", "/onboarding/complete-step", json=data)

    # Campaigns endpoints
    def get_campaigns(self, params: dict = None) -> dict:
        return self._request("GET", "/campaigns", params=params)

    def create_campaign(self, data: dict) -> dict:
        return self._request("POST", "/campaigns", json=data)


# Global social API instance
social_api = SocialAPI()


# ============== COMMERCIAL INTELLIGENCE API ==============

class IntelligenceAPI:
    """Client for the Commercial Intelligence API (X-API-Key auth)."""

    def __init__(self, base_url: str = None):
        self.base_url = base_url or os.environ.get(
            'HARTOS_BACKEND_URL', 'http://localhost:6777')
        self._api_key = None

    def set_api_key(self, key: str):
        self._api_key = key

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["X-API-Key"] = self._api_key
        return headers

    def _auth_headers(self) -> dict[str, str]:
        """Headers using JWT (for key management, not intelligence calls)."""
        headers = {"Content-Type": "application/json"}
        token = social_api._token
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    def _request(self, method: str, endpoint: str, auth: str = 'api_key', **kwargs) -> dict:
        url = f"{self.base_url}{endpoint}"
        kwargs.setdefault("headers",
                          self._auth_headers() if auth == 'jwt' else self._headers())
        kwargs.setdefault("timeout", REQUEST_TIMEOUT)
        try:
            response = requests.request(method, url, **kwargs)
            return _handle_response(response)
        except Exception as e:
            return {"error": str(e)}

    # Intelligence endpoints (X-API-Key)
    def chat(self, data: dict) -> dict:
        return self._request("POST", "/api/v1/intelligence/chat", json=data)

    def analyze(self, data: dict) -> dict:
        return self._request("POST", "/api/v1/intelligence/analyze", json=data)

    def generate(self, data: dict) -> dict:
        return self._request("POST", "/api/v1/intelligence/generate", json=data)

    def hivemind(self, params: dict = None) -> dict:
        return self._request("GET", "/api/v1/intelligence/hivemind", params=params)

    def get_usage(self, params: dict = None) -> dict:
        return self._request("GET", "/api/v1/intelligence/usage", params=params)

    # Key management (JWT auth)
    def create_key(self, data: dict) -> dict:
        return self._request("POST", "/api/v1/intelligence/keys", auth='jwt', json=data)

    def list_keys(self) -> dict:
        return self._request("GET", "/api/v1/intelligence/keys", auth='jwt')

    def revoke_key(self, key_id: str) -> dict:
        return self._request("DELETE", f"/api/v1/intelligence/keys/{key_id}", auth='jwt')


# ============== BUILD DISTRIBUTION API ==============

class BuildDistributionAPI:
    """Client for build license and download endpoints."""

    def __init__(self, base_url: str = None):
        self.base_url = base_url or os.environ.get(
            'HARTOS_BACKEND_URL', 'http://localhost:6777')

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        token = social_api._token
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    def _request(self, method: str, endpoint: str, **kwargs) -> dict:
        url = f"{self.base_url}{endpoint}"
        kwargs.setdefault("headers", self._headers())
        kwargs.setdefault("timeout", REQUEST_TIMEOUT)
        try:
            response = requests.request(method, url, **kwargs)
            return _handle_response(response)
        except Exception as e:
            return {"error": str(e)}

    def purchase(self, data: dict) -> dict:
        return self._request("POST", "/api/v1/builds/purchase", json=data)

    def get_download_url(self, license_id: str) -> dict:
        return self._request("GET", f"/api/v1/builds/download/{license_id}")

    def list_licenses(self) -> dict:
        return self._request("GET", "/api/v1/builds/licenses")

    def verify_license(self, data: dict) -> dict:
        return self._request("POST", "/api/v1/builds/verify", json=data)


# ============== DEFENSIVE IP / PROVENANCE API ==============

class IPProvenanceAPI:
    """Client for defensive publications and provenance."""

    def __init__(self, base_url: str = None):
        self.base_url = base_url or os.environ.get(
            'HARTOS_BACKEND_URL', 'http://localhost:6777')

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        token = social_api._token
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    def _request(self, method: str, endpoint: str, **kwargs) -> dict:
        url = f"{self.base_url}{endpoint}"
        kwargs.setdefault("headers", self._headers())
        kwargs.setdefault("timeout", REQUEST_TIMEOUT)
        try:
            response = requests.request(method, url, **kwargs)
            return _handle_response(response)
        except Exception as e:
            return {"error": str(e)}

    def list_publications(self) -> dict:
        return self._request("GET", "/api/ip/defensive-publications")

    def create_publication(self, data: dict) -> dict:
        return self._request("POST", "/api/ip/defensive-publications", json=data)

    def get_provenance(self) -> dict:
        return self._request("GET", "/api/ip/provenance")

    def get_milestone(self) -> dict:
        return self._request("GET", "/api/ip/milestone")


# Global API instances
intelligence_api = IntelligenceAPI()
builds_api = BuildDistributionAPI()
ip_api = IPProvenanceAPI()


# ============== ZERO-SHOT CLASSIFICATION ==============

def zeroshot(text: str, labels: list, **kwargs) -> dict[str, Any]:
    """Zero-shot classification via hart-backend"""
    global _http_fail_count, _http_fail_time
    payload = {"input_text": text, "labels": labels, **kwargs}

    if _hartos_backend_available and _hevolve_app:
        try:
            with _hevolve_app.test_client() as client:
                resp = client.post('/zeroshot', json=payload)
                return resp.get_json() or {}
        except Exception as e:
            logger.warning(f"Direct zeroshot failed: {e}")

    # Bundled mode: import-only, no HTTP proxy
    if _BUNDLED_MODE:
        return {"error": "backend_unavailable"}

    if _http_fail_count >= _HTTP_FAIL_THRESHOLD:
        if time.time() - _http_fail_time > _HTTP_FAIL_COOLDOWN:
            _http_fail_count = 0  # Cooldown expired, allow a retry
            logger.info("Circuit breaker reset after cooldown (zeroshot)")
        else:
            return {"error": "backend_unavailable"}

    try:
        response = _session.post(
            f"{HARTOS_BACKEND_URL}/zeroshot",
            json=payload,
            timeout=(CONNECT_TIMEOUT, REQUEST_TIMEOUT),
        )
        _http_fail_count = 0
        return _handle_response(response)
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
        _http_fail_count += 1
        _http_fail_time = time.time()
        return {"error": "backend_unavailable"}


# ============== TIME-BASED AGENT ==============

def time_agent(text: str, user_id: str = None, **kwargs) -> dict[str, Any]:
    """Time-based agent for scheduled tasks"""
    response = requests.post(
        f"{HARTOS_BACKEND_URL}/time_agent",
        json={"text": text, "user_id": user_id, **kwargs},
        timeout=REQUEST_TIMEOUT
    )
    return _handle_response(response)


# ============== VISUAL AGENT ==============

def visual_agent(image_data: str, text: str = None, **kwargs) -> dict[str, Any]:
    """Visual agent for image understanding"""
    response = requests.post(
        f"{HARTOS_BACKEND_URL}/visual_agent",
        json={"image": image_data, "text": text, **kwargs},
        timeout=REQUEST_TIMEOUT
    )
    return _handle_response(response)


# ============== HEALTH CHECK ==============

def check_backend_health() -> dict[str, Any]:
    """Check if hart-backend is healthy"""
    try:
        response = requests.get(
            f"{HARTOS_BACKEND_URL}/status",
            timeout=5
        )
        return {
            "healthy": response.status_code == 200,
            "status_code": response.status_code,
            "backend_url": HARTOS_BACKEND_URL
        }
    except Exception as e:
        return {
            "healthy": False,
            "error": str(e),
            "backend_url": HARTOS_BACKEND_URL
        }


# ============== FLASK BLUEPRINT FOR PROXY ROUTES ==============

def create_proxy_blueprint():
    """Create Flask blueprint with proxy routes to hart-backend"""
    from flask import Blueprint, Response, jsonify
    from flask import request as flask_request

    proxy_bp = Blueprint('hevolve_proxy', __name__)

    @proxy_bp.route('/chat', methods=['POST'])
    def proxy_chat():
        data = flask_request.get_json() or {}
        result = chat(
            text=data.get('text', ''),
            user_id=data.get('user_id'),
            agent_id=data.get('teacher_avatar_id') or data.get('agent_id'),
            conversation_id=data.get('conversation_id'),
            request_id=data.get('request_id')
        )
        # TTS is fired from hart_intelligence_entry.py line 5431 (inside HARTOS /chat handler)
        # No duplicate call needed here — proxy_chat calls HARTOS via test_client
        # which goes through the full /chat handler including _tts_synthesize_and_publish.
        return jsonify(result)

    @proxy_bp.route('/prompts', methods=['GET'])
    def proxy_get_prompts():
        user_id = flask_request.args.get('user_id')
        result = get_prompts(user_id)
        return jsonify(result)

    @proxy_bp.route('/prompts', methods=['POST'])
    def proxy_create_prompt():
        data = flask_request.get_json() or {}
        result = create_prompt(data)
        return jsonify(result)

    @proxy_bp.route('/zeroshot', methods=['POST'])
    def proxy_zeroshot():
        data = flask_request.get_json() or {}
        result = zeroshot(
            text=data.get('text', ''),
            labels=data.get('labels', [])
        )
        return jsonify(result)

    @proxy_bp.route('/backend/health', methods=['GET'])
    def proxy_health():
        return jsonify(check_backend_health())

    # Proxy all /api/social/* requests
    @proxy_bp.route('/api/social/<path:path>', methods=['GET', 'POST', 'PATCH', 'DELETE'])
    def proxy_social(path):
        url = f"{HEVOLVE_SOCIAL_URL}/{path}"

        # Forward the request
        resp = requests.request(
            method=flask_request.method,
            url=url,
            headers={k: v for k, v in flask_request.headers if k.lower() != 'host'},
            params=flask_request.args,
            data=flask_request.get_data(),
            timeout=REQUEST_TIMEOUT,
            allow_redirects=False
        )

        # Return the response
        return Response(
            resp.content,
            status=resp.status_code,
            headers=dict(resp.headers)
        )

    return proxy_bp


# ============== RSS/ATOM FEED API ==============

def get_rss_feed(feed_type: str = 'global', limit: int = 50) -> str:
    """Get RSS feed from hart-backend"""
    response = requests.get(
        f"{HEVOLVE_SOCIAL_URL}/feeds/rss",
        params={'type': feed_type, 'limit': limit},
        timeout=REQUEST_TIMEOUT
    )
    return response.text


def get_atom_feed(feed_type: str = 'global', limit: int = 50) -> str:
    """Get Atom feed from hart-backend"""
    response = requests.get(
        f"{HEVOLVE_SOCIAL_URL}/feeds/atom",
        params={'type': feed_type, 'limit': limit},
        timeout=REQUEST_TIMEOUT
    )
    return response.text


def get_json_feed(feed_type: str = 'global', limit: int = 50) -> dict[str, Any]:
    """Get JSON Feed from hart-backend"""
    response = requests.get(
        f"{HEVOLVE_SOCIAL_URL}/feeds/json",
        params={'type': feed_type, 'limit': limit},
        timeout=REQUEST_TIMEOUT
    )
    return response.json()


def preview_feed(url: str) -> dict[str, Any]:
    """Preview an external feed"""
    response = requests.post(
        f"{HEVOLVE_SOCIAL_URL}/feeds/preview",
        json={'url': url},
        timeout=REQUEST_TIMEOUT
    )
    return _handle_response(response)


def import_feed(url: str, submolt_id: int = None, limit: int = 10) -> dict[str, Any]:
    """Import items from an external feed"""
    response = requests.post(
        f"{HEVOLVE_SOCIAL_URL}/feeds/import",
        json={'url': url, 'submolt_id': submolt_id, 'limit': limit},
        timeout=REQUEST_TIMEOUT
    )
    return _handle_response(response)


# Export commonly used functions
__all__ = [
    'chat',
    'chat_stream',
    'get_prompts',
    'create_prompt',
    'update_prompt',
    'social_api',
    'SocialAPI',
    'intelligence_api',
    'IntelligenceAPI',
    'builds_api',
    'BuildDistributionAPI',
    'ip_api',
    'IPProvenanceAPI',
    'zeroshot',
    'time_agent',
    'visual_agent',
    'check_backend_health',
    'create_proxy_blueprint',
    'get_rss_feed',
    'get_atom_feed',
    'get_json_feed',
    'preview_feed',
    'import_feed',
    'HARTOS_BACKEND_URL',
    'HEVOLVE_SOCIAL_URL'
]
