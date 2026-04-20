"""
main.py -- Nunba Server

A Friend, A Well Wisher, Your LocalMind
Connect to Hivemind to collaborate with your friends' agents.
"""
import argparse
import logging
import os
import shlex
import subprocess
import tempfile
import threading
import traceback

# PYTORCH_CUDA_ALLOC_CONF is set in app.py (must be before first torch import).

# WebView2 autoplay: allow Audio.play() from async callbacks (TTS via SSE).
# Must be set before pywebview creates the WebView2 environment.
# main.py loads before webview.start() in the frozen build.
os.environ.setdefault('WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS',
                       '--autoplay-policy=no-user-gesture-required')

# HuggingFace: skip model update checks when running offline / cached.
# Prevents 30-60s of HEAD request timeouts on every model load.
# Models are downloaded during install — no need to re-check at runtime.
if not os.environ.get('HF_HUB_OFFLINE'):
    _hf_cache = os.path.join(os.path.expanduser('~'), '.cache', 'huggingface', 'hub')
    if os.path.isdir(_hf_cache) and any(
            d.startswith('models--') for d in os.listdir(_hf_cache)):
        os.environ['HF_HUB_OFFLINE'] = '1'

from flask import Flask, jsonify, request, send_file

try:
    import pyautogui
    PYAUTOGUI_AVAILABLE = True
except Exception:
    pyautogui = None
    PYAUTOGUI_AVAILABLE = False
import hashlib
import ipaddress
import json
import platform
import socket
import sys
import time
import uuid
from io import BytesIO

import requests
from PIL import Image

try:
    from desktop.indicator_window import get_status, initialize_indicator, toggle_indicator
except ImportError:
    logging.warning("Failed to import indicator_window (likely missing tkinter). UI features disabled.")
    def initialize_indicator(server_port=5000):
        import sys
        if sys.platform == "darwin":
            return False  # NSWindow must be on main thread
        return False
    def toggle_indicator(show=True, server_port=5000): return False
    def get_status(): return {"active": False, "start_time": 0}


def _splash(msg):
    """Update startup splash status. Safe no-op if splash not available."""
    try:
        import app as _app
        if hasattr(_app, '_startup_splash_update'):
            _app._startup_splash_update(msg)
    except Exception:
        pass


_splash('Configuring database...')

# ============== Configure hart-backend for local SQLite ==============
# Set database path BEFORE importing ANY hart-backend modules (chatbot_routes
# triggers import chain: adapter → helper → cache_loaders which reads HEVOLVE_DB_PATH
# at module level to resolve AGENT_DATA_DIR).
# Cross-platform: Windows → ~/Documents/Nunba, macOS → ~/Library/Application Support/Nunba,
# Linux → ~/.config/nunba, HARTOS OS → /var/lib/hartos. Override with NUNBA_DATA_DIR env var.
try:
    from core.platform_paths import get_data_dir, get_db_dir, get_db_path
    PROGRAM_DATA_DIR = get_data_dir()
    NUNBA_DB_PATH = get_db_path('hevolve_database.db')
except ImportError:
    # Fallback if HARTOS not installed yet
    _home = os.path.expanduser('~')
    if sys.platform == 'win32':
        PROGRAM_DATA_DIR = os.path.join(_home, 'Documents', 'Nunba')
    elif sys.platform == 'darwin':
        PROGRAM_DATA_DIR = os.path.join(_home, 'Library', 'Application Support', 'Nunba')
    else:
        PROGRAM_DATA_DIR = os.path.join(_home, '.config', 'nunba')
    NUNBA_DB_PATH = os.path.join(PROGRAM_DATA_DIR, 'data', 'hevolve_database.db')

# Ensure data directory exists
os.makedirs(os.path.dirname(NUNBA_DB_PATH), exist_ok=True)

# Configure hart-backend to use local SQLite
os.environ.setdefault('HEVOLVE_DB_PATH', NUNBA_DB_PATH)
os.environ.setdefault('HARTOS_BACKEND_URL', 'http://localhost:6777')  # LangChain service port
# Signal bundled mode so langchain/HevolveAI redirect logs to Documents/Nunba/logs
os.environ['NUNBA_BUNDLED'] = '1'

# Restore persisted node config (master key, tier) from previous session
_node_config_path = os.path.join(PROGRAM_DATA_DIR, 'data', 'node_config.json')
if os.path.isfile(_node_config_path):
    try:
        with open(_node_config_path) as _ncf:
            _node_cfg = json.load(_ncf)
        if _node_cfg.get('master_key_hex'):
            os.environ.setdefault('HEVOLVE_MASTER_PRIVATE_KEY', _node_cfg['master_key_hex'])
        if _node_cfg.get('tier'):
            os.environ.setdefault('HEVOLVE_NODE_TIER', _node_cfg['tier'])
    except Exception:
        pass  # Config unreadable — proceed with defaults

# Ensure SSL certs are findable in frozen builds (autogen/httpx need this)
if not os.environ.get('SSL_CERT_FILE'):
    try:
        import certifi
        os.environ['SSL_CERT_FILE'] = certifi.where()
    except Exception:
        pass

# Dev mode: disable social rate limiter when running locally (not frozen/production)
# This must be set BEFORE importing social modules (rate_limiter reads env at import time)
if not getattr(sys, 'frozen', False):
    os.environ.setdefault('SOCIAL_RATE_LIMIT_DISABLED', '1')

# Import chatbot routes (AFTER env vars are set so hart-backend modules resolve paths correctly)

# Try to import hart-backend adapter
HARTOS_BACKEND_AVAILABLE = False
try:
    from routes.hartos_backend_adapter import create_proxy_blueprint
    HARTOS_BACKEND_AVAILABLE = True
    # Register alias so HARTOS code using bare "from hartos_backend_adapter" works
    import sys

    import routes.hartos_backend_adapter as _hba
    sys.modules['hartos_backend_adapter'] = _hba
except Exception as e:
    # Use logging (not print) — in frozen mode print goes to devnull and is lost.
    # In frozen mode the root logger already has gui_app.log handler from app.py.
    logging.warning(f"hartos_backend_adapter import failed: {e}")

_splash('Loading chat routes...')
from routes import chatbot_routes

_splash('Loading social platform...')
# Try to import hart-backend directly (pip installed).  Uses
# core.optional_import so the failure (if any) lands in
# /api/admin/diag/degradations instead of being silently swallowed.
HARTOS_BACKEND_DIRECT = False
init_social = None
social_bp = None
get_engine = None
init_db = None
try:
    from core.optional_import import optional_import as _opt_import
    _social_mod = _opt_import(
        'integrations.social',
        reason='HARTOS social platform (posts, comments, channels, auth)',
    )
    _social_models = _opt_import(
        'integrations.social.models',
        reason='HARTOS social DB engine + init_db migration runner',
    )
    if _social_mod is not None and _social_models is not None:
        init_social = _social_mod.init_social
        social_bp = _social_mod.social_bp
        get_engine = _social_models.get_engine
        init_db = _social_models.init_db
        HARTOS_BACKEND_DIRECT = True
except Exception as _se:
    # core.optional_import itself failing is a cold-boot bug — log loud.
    logging.warning(f"social platform optional-import wiring failed: {_se}")

# Import crash reporter — visible in /api/admin/diag/degradations so the
# operator can SEE that crash telemetry is off (silent absence used to be
# the failure mode for "we never get crash reports from this build").
CRASH_REPORTER_AVAILABLE = False
add_breadcrumb = None
capture_exception = None
capture_message = None
create_crash_reporter_blueprint = None
init_crash_reporting = None
set_user = None
get_crash_status = None
try:
    from core.optional_import import optional_import as _opt_import_cr
    _cr_mod = _opt_import_cr(
        'desktop.crash_reporter',
        reason='Sentry crash reporter (operator-visible incident telemetry)',
    )
    if _cr_mod is not None:
        add_breadcrumb = _cr_mod.add_breadcrumb
        capture_exception = _cr_mod.capture_exception
        capture_message = _cr_mod.capture_message
        create_crash_reporter_blueprint = _cr_mod.create_crash_reporter_blueprint
        init_crash_reporting = _cr_mod.init_crash_reporting
        set_user = _cr_mod.set_user
        get_crash_status = _cr_mod.get_status
        CRASH_REPORTER_AVAILABLE = True
except Exception as _cre:
    logging.warning(f"crash_reporter optional-import wiring failed: {_cre}")

# Define default paths in Documents (uses PROGRAM_DATA_DIR defined above)
DEFAULT_LOG_DIR = os.path.join(PROGRAM_DATA_DIR, 'logs')
DEFAULT_LOG_FILE = os.path.join(DEFAULT_LOG_DIR, 'server.log')
DEFAULT_DEVICE_ID_FILE = os.path.join(PROGRAM_DATA_DIR, 'device_id.json')
DEFAULT_STORAGE_DIR = os.path.join(PROGRAM_DATA_DIR, 'storage')
DEFAULT_USER_DATA_FILE = os.path.join(DEFAULT_STORAGE_DIR, 'user_data.json')

def get_app_directory():
    """Get the application directory - works in both dev and frozen environments"""
    if getattr(sys, 'frozen', False):
        # Running as frozen executable
        return os.path.dirname(sys.executable)
    else:
        # Running as script
        return os.path.dirname(os.path.abspath(__file__))

APP_DIR = get_app_directory()

# Landing page build directory (built from landing-page source in Nunba)
LANDING_PAGE_BUILD_DIR = os.path.join(APP_DIR, 'landing-page', 'build')

# Default API Endpoint
DEFAULT_STOP_API_URL = "http://gcp_training2.hertzai.com:5001/stop"

# Setting global variables to track LLM Control Status
llm_control_active = False
last_activity_time = 0
ACTIVITY_TIMEOUT = 15.0 # Seconds before considering control inactive

parser = argparse.ArgumentParser()
parser.add_argument("--log_file", help="log file path", type=str,
                    default=DEFAULT_LOG_FILE)
parser.add_argument("--port", help="port", type=int, default=5000)
parser.add_argument("--device_id_file", help="device ID file path", type=str,
                    default=DEFAULT_DEVICE_ID_FILE)
parser.add_argument("--stop_api_url", help="URL for stop API endpoint", type=str,
                    default=DEFAULT_STOP_API_URL)
args, _unknown = parser.parse_known_args()

# Ensure log directory exists
log_dir = os.path.dirname(args.log_file)
if not os.path.exists(log_dir):
    try:
        os.makedirs(log_dir, exist_ok=True)
    except Exception as e:
        # If there's an error creating the log directory, fall back to temporary directory
        temp_log_dir = os.path.join(tempfile.gettempdir(), 'Nunba')
        os.makedirs(temp_log_dir, exist_ok=True)
        args.log_file = os.path.join(temp_log_dir, 'server.log')
        print(f"Failed to create log directory {log_dir}: {str(e)}. Using {args.log_file} instead.")

# Ensure device_id directory exists
device_id_dir = os.path.dirname(args.device_id_file)
if not os.path.exists(device_id_dir):
    try:
        os.makedirs(device_id_dir, exist_ok=True)
    except Exception as e:
        # If there's an error creating the device ID directory, fall back to app directory
        args.device_id_file = os.path.join(os.path.dirname(__file__), 'device_id.json')
        print(f"Failed to create device ID directory {device_id_dir}: {str(e)}. Using {args.device_id_file} instead.")

# Configure logging
# When imported by app.py (frozen/GUI mode), the root logger already has
# a gui_app.log FileHandler. We only add server.log when:
# (a) running standalone (python main.py), or
# (b) root has no file handlers yet (first setup).
# This prevents duplicate handlers and the gui_app.log death bug.
_log_format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
_root_logger = logging.getLogger()
_root_logger.setLevel(logging.INFO)

# Check if root already has a FileHandler (set up by app.py)
_has_file_handler = any(
    isinstance(h, logging.FileHandler) for h in _root_logger.handlers
)

if not _has_file_handler:
    # Standalone mode — no app.py, so set up server.log ourselves
    try:
        _server_fh = logging.FileHandler(args.log_file, mode='a', encoding='utf-8')
        _server_fh.setLevel(logging.INFO)
        _server_fh.setFormatter(logging.Formatter(_log_format))
        _root_logger.addHandler(_server_fh)
    except Exception:
        temp_log_file = os.path.join(tempfile.gettempdir(), 'Nunba', 'server.log')
        os.makedirs(os.path.dirname(temp_log_file), exist_ok=True)
        _server_fh = logging.FileHandler(temp_log_file, mode='a', encoding='utf-8')
        _server_fh.setLevel(logging.INFO)
        _server_fh.setFormatter(logging.Formatter(_log_format))
        _root_logger.addHandler(_server_fh)

    # Console handler only in standalone mode
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter(_log_format))
    _root_logger.addHandler(console_handler)
else:
    # Imported by app.py — DON'T add new handlers.
    # app.py's gui_app.log FileHandler is the primary log destination.
    # Just add server.log as a SECONDARY destination (not replacing gui_app.log).
    try:
        _server_fh = logging.FileHandler(args.log_file, mode='a', encoding='utf-8')
        _server_fh.setLevel(logging.INFO)
        _server_fh.setFormatter(logging.Formatter(_log_format))
        _root_logger.addHandler(_server_fh)
    except Exception:
        pass  # gui_app.log is sufficient

logger = logging.getLogger('werkzeug')
logger.setLevel(logging.INFO)

# Create a dedicated langchain.log file handler.
# ONLY in standalone mode — when imported by app.py, hart_intelligence
# creates its own RotatingFileHandler. Two handlers on the same rotating
# file causes PermissionError on Windows (file lock during rotation).
_langchain_fh = None
if not _has_file_handler:
    try:
        from logging.handlers import RotatingFileHandler as _RFH
        _langchain_log_path = os.path.join(DEFAULT_LOG_DIR, 'langchain.log')
        _langchain_fh = _RFH(_langchain_log_path, maxBytes=5_000_000, backupCount=2)
        _langchain_fh.setLevel(logging.INFO)
        _langchain_fh.setFormatter(logging.Formatter(_log_format))
    except Exception:
        pass

# Ensure third-party library loggers (langchain, HevolveAI) propagate to root's
# file handlers so their output appears in Documents/Nunba/logs/server.log.
# Also attach the dedicated langchain.log handler to each library logger.
for _lib_name in ('langchain', 'langchain_core', 'langchain_community',
                   'hevolveai', 'embodied_ai', 'embodied_ai.context',
                   'embodied_ai.learning', 'routes.hartos_backend_adapter',
                   'hart_intelligence', 'LangChainWatchdog'):
    _lib_logger = logging.getLogger(_lib_name)
    _lib_logger.setLevel(logging.INFO)
    _lib_logger.propagate = True  # ensure propagation to root (→ server.log)
    if _langchain_fh:
        _lib_logger.addHandler(_langchain_fh)  # also write to langchain.log

logging.info(f"Starting Nunba Server on port {args.port}")
logging.info(f"Using log file: {args.log_file}")
logging.info(f"Using device ID file: {args.device_id_file}")
logging.info(f"Using Stop API URL: {args.stop_api_url}")

def initialize_indicator_window():
    import sys
    if sys.platform == "darwin": return  # NSWindow must be on main thread
    try:
        # Start in a separate thread to avoid blocking Flask startup
        def init_indicator_thread():
            initialize_indicator()
            toggle_indicator(False)
            logging.info("LLM Control indicator initialized and hidden")
        threading.Thread(target=init_indicator_thread, daemon=True).start()
    except Exception as e:
        logger.error(f"Error initializing indicator: {str(e)}")

app = Flask(__name__, static_folder=None)

# Bootstrap HARTOS subsystems in background — none of these are needed
# for serving the React SPA or handling the first chat message.
def _deferred_platform_init():
    """Bootstrap EventBus + Crossbar subscribers in background."""
    # Point HARTOS crossbar_server.py (WAMP client) at our embedded router
    # so it connects locally instead of trying the unreachable cloud router.
    _wamp_port = os.environ.get('NUNBA_WAMP_PORT', '8088')
    if not os.environ.get('CBURL'):
        os.environ['CBURL'] = f'ws://localhost:{_wamp_port}/ws'
    # Point HARTOS realtime.py HTTP publisher at our Flask HTTP bridge
    # (crossbarhttp3 defaults to :8088/publish which is the full Crossbar
    # node's HTTP bridge — our embedded router doesn't have that, but
    # Flask :5000/publish acts as the equivalent).
    if not os.environ.get('WAMP_URL'):
        _flask_port = os.environ.get('NUNBA_PORT', '5000')
        os.environ['WAMP_URL'] = f'http://localhost:{_flask_port}/publish'

    try:
        from core.platform.bootstrap import bootstrap_platform
        bootstrap_platform()
        logging.info("Platform EventBus bootstrapped")
    except Exception as e:
        logging.warning(f"Platform bootstrap skipped: {e}")
    try:
        from core.peer_link.local_subscribers import bootstrap_local_subscribers
        bootstrap_local_subscribers()
        logging.info("Local Crossbar subscribers bootstrapped")
    except Exception as e:
        logging.warning(f"Local subscribers bootstrap skipped: {e}")

    # Subscribe to HARTOS caption server events (lazy start/stop 0.8B VLM)
    try:
        from core.platform.registry import get_registry
        bus = get_registry().get('events')
        if bus:
            def _on_caption_requested(data):
                try:
                    from llama.llama_config import LlamaConfig
                    port = data.get('port', 8081)
                    LlamaConfig().start_caption_server(port=port)
                except Exception as e:
                    logging.warning(f"Caption server start failed: {e}")

            def _on_caption_stop(data):
                try:
                    from llama.llama_config import LlamaConfig
                    LlamaConfig().stop_caption_server()
                except Exception as e:
                    logging.debug(f"Caption server stop: {e}")

            bus.on('vlm_caption.requested', lambda topic, data: _on_caption_requested(data))
            bus.on('vlm_caption.stop', lambda topic, data: _on_caption_stop(data))
            logging.info("Caption server event subscribers registered")
    except Exception as e:
        logging.debug(f"Caption server event subscription skipped: {e}")

    # Eager-start BOTH llama-server instances at boot so the first /chat
    # request doesn't cold-start either model.
    #
    # Why both, and why parallel:
    #   - The draft 0.8B (port 8081) services HARTOS's draft-first
    #     dispatcher, which expects an immediate ~300ms classifier reply
    #     on every /chat. Without it, draft-first silently falls through
    #     to the 4B and the user eats the full 4B latency on every "hi".
    #   - The main 4B (port 8080) services the full agentic path
    #     (LangChain + autogen tool calls). Lazy-starting it on first
    #     chat adds ~8-15s of cold-start on top of LangChain setup.
    #   - Each model has its OWN mmproj file — mmproj-Qwen3.5-0.8B-F16.gguf
    #     for the draft and mmproj-Qwen3.5-4B-F16.gguf for the main.
    #     The installer.get_mmproj_path(preset) resolver inside
    #     start_server / start_caption_server handles the preset-specific
    #     download + path independently, so booting both in parallel
    #     does not race on a shared mmproj file.
    #   - We boot them on two separate background threads so the slower
    #     4B download+load doesn't hold up the faster 0.8B, and neither
    #     blocks the Flask app thread.
    #
    # Env var overrides; otherwise LlamaConfig.should_boot_draft() decides
    # based on VRAMManager (≥8GB → dual, 4-6GB → main only, ≤2GB → single 0.8B).
    _draft_env = os.environ.get('HEVOLVE_DRAFT_FIRST', '').strip()
    # Accept BOTH env var names so pytest fixtures using either spelling
    # toggle eager-LLM-boot correctly.  Historically the flag migrated
    # from NUNBA_DISABLE_LLAMA_AUTOSTART to HEVOLVE_EAGER_LLM; tests/e2e
    # /conftest.py still sets the old name.  Either '0' disables eager
    # boot so pytest collection doesn't hang waiting for llama-server.
    _main_env = (
        os.environ.get('HEVOLVE_EAGER_LLM', '').strip()
        or ('0' if os.environ.get('NUNBA_DISABLE_LLAMA_AUTOSTART') == '1' else '')
    )

    if _draft_env:
        _boot_draft = _draft_env != '0'
    else:
        try:
            from llama.llama_config import LlamaConfig
            _boot_draft = LlamaConfig.should_boot_draft()
        except Exception:
            _boot_draft = True  # safe default if detection fails

    _boot_main = _main_env != '0' if _main_env else True

    if _boot_draft:
        def _boot_draft_server():
            try:
                from llama.llama_config import LlamaConfig
                port = int(os.environ.get('HEVOLVE_VLM_CAPTION_PORT', 8081))
                ok = LlamaConfig().start_caption_server(port=port)
                if ok:
                    logging.info(f"Draft server (0.8B) ready on port {port}")
                else:
                    logging.warning(
                        "Draft server failed to start — chat draft-first will "
                        "fall through to the 4B main model")
            except Exception as e:
                logging.warning(f"Draft server boot failed: {e}")

        threading.Thread(target=_boot_draft_server, daemon=True,
                         name='draft-server-boot').start()

    if _boot_main:
        def _boot_main_server():
            try:
                from llama.llama_config import LlamaConfig
                cfg = LlamaConfig()
                main_port = int(cfg.config.get('server_port', 8080))
                # Verify the port is ACTUALLY serving a llama.cpp model
                # by calling /v1/models. The previous check_server_running()
                # accepted any HTTP 200 on /health, which meant a stale
                # process or a non-llama service would cause the boot to
                # skip, leaving the main LLM down. This was the root cause
                # of the "Main LLM server already running — skipping" log
                # line at 01:26:08 on 2026-04-12 despite :8080 being dead.
                _already_running = False
                if cfg.check_server_running(main_port):
                    try:
                        import requests as _req
                        resp = _req.get(
                            f'http://127.0.0.1:{main_port}/v1/models',
                            timeout=2,
                        )
                        if resp.status_code == 200:
                            models = resp.json().get('data', [])
                            if any(m.get('id', '') for m in models):
                                model_id = models[0].get('id', 'unknown')
                                logging.info(
                                    f"Main LLM server verified on port "
                                    f"{main_port} (model={model_id}) — "
                                    f"skipping eager boot")
                                _already_running = True
                    except Exception:
                        pass
                if _already_running:
                    return
                ok = cfg.start_server()
                if ok:
                    logging.info(
                        f"Main LLM server ready on port {main_port} "
                        f"(mmproj auto-loaded by start_server)")
                else:
                    logging.warning(
                        "Main LLM server failed to start at boot — "
                        "first /chat request will cold-start it")
            except Exception as e:
                logging.warning(f"Main LLM boot failed: {e}")

        threading.Thread(target=_boot_main_server, daemon=True,
                         name='main-llm-boot').start()

threading.Thread(target=_deferred_platform_init, daemon=True,
                 name='platform-init').start()

# CORS is handled manually via the after_request handler and handle_preflight
# below. This avoids duplicate/conflicting headers from flask-cors CORS() init.

# =============================================================================
# Security: API Token Authentication for sensitive endpoints
# =============================================================================
# Auth decorators — single source of truth in routes/auth.py
from routes.auth import _is_local_request, require_local_or_token  # noqa: E402

# Register Nunba AI health endpoints
try:
    from llama.llama_config import LlamaConfig
    from llama.llama_health_endpoint import add_health_routes

    # Initialize LlamaConfig for health endpoints
    try:
        llama_config = LlamaConfig()
        add_health_routes(app, llama_config)
        logging.info("Nunba AI health endpoints registered")
    except Exception as e:
        # If config fails, register without config (basic health only)
        add_health_routes(app, None)
        logging.warning(f"Nunba AI health endpoints registered without config: {e}")
except ImportError:
    logging.info("Llama health endpoints not available (modules not found)")
except Exception as e:
    logging.error(f"Failed to register AI health endpoints: {e}")

# Auto-bootstrap is triggered by:
# 1. Frontend Agent.js on mount (POST /api/ai/bootstrap) — for returning users
# 2. Welcome bridge after HART onboarding — for new users
# NOT at import time — that blocks Waitress threads and causes OOM/starvation.

# Request logging for debugging static file issues
@app.before_request
def log_request():
    # Log all image/static requests for debugging
    path = request.path
    if path.startswith('/static/') or path.endswith(('.png', '.gif', '.svg', '.jpg', '.jpeg')):
        logging.debug(f"Static request: {request.method} {path}")

# ── CORS origin check (single source of truth) ─────────────────────────
_ALLOWED_ORIGINS = {
    'https://hevolve.ai',
    'https://www.hevolve.ai',
    'https://hertzai.com',
    'https://www.hertzai.com',
    'https://hevolve.hertzai.com',
    'https://www.hevolve.hertzai.com',
}


def _is_allowed_origin(origin):
    if origin in _ALLOWED_ORIGINS:
        return True
    if origin.startswith('http://localhost:') or origin == 'http://localhost':
        return True
    if origin.startswith('http://127.0.0.1:') or origin == 'http://127.0.0.1':
        return True
    return False


# Additional CORS headers for all routes
@app.after_request
def after_request(response):
    # Log response status for static files
    path = request.path
    if path.startswith('/static/') or path.endswith(('.png', '.gif', '.svg', '.jpg', '.jpeg')):
        logging.debug(f"Static response: {path} -> {response.status_code}")

    origin = request.headers.get('Origin')

    if origin and _is_allowed_origin(origin):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
    # If origin doesn't match, don't set Access-Control-Allow-Origin at all

    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
    response.headers['Access-Control-Max-Age'] = '3600'

    # Chrome Private Network Access (PNA) headers — required for local network
    # requests from secure contexts.  Without these Chrome shows warnings and
    # may block requests to localhost in future versions.
    if request.headers.get('Access-Control-Request-Private-Network') == 'true':
        response.headers['Access-Control-Allow-Private-Network'] = 'true'

    # Security headers — desktop app, never iframed, no external scripts
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    # Content-Security-Policy — desktop app only talks to its own
    # Flask origin + localhost llama-server (:8080/:8082) + VisionService
    # (:5460) + crossbar (:8088). `unsafe-inline` is required because
    # CRA's runtime and MUI emotion inject inline styles; migrating to
    # nonce/hash CSP is a separate, larger task. blob: covers generated
    # audio URLs used for synthesized TTS playback.
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob: https:; "
        "media-src 'self' blob: data:; "
        "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:*; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )

    return response

# Add CORS preflight handler for all routes
@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = jsonify({"status": "ok"})
        origin = request.headers.get('Origin')

        if origin and _is_allowed_origin(origin):
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Access-Control-Allow-Credentials'] = 'true'
        # If origin doesn't match, don't set Access-Control-Allow-Origin at all

        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
        response.headers['Access-Control-Max-Age'] = '3600'

        # Chrome Private Network Access preflight
        if request.headers.get('Access-Control-Request-Private-Network') == 'true':
            response.headers['Access-Control-Allow-Private-Network'] = 'true'

        return response

computer_control_lock = threading.Lock()

# Function to get a deterministic device ID based on hardware identifiers.
# The same physical device always produces the same hash.
def _get_machine_fingerprint():
    """Build a stable fingerprint from hardware identifiers."""
    parts = [str(uuid.getnode())]  # MAC address (integer)

    if sys.platform == 'win32':
        try:
            import winreg
            with winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r'SOFTWARE\Microsoft\Cryptography'
            ) as key:
                guid, _ = winreg.QueryValueEx(key, 'MachineGuid')
                parts.append(guid)
        except Exception:
            pass
    elif sys.platform == 'darwin':
        try:
            result = subprocess.run(
                ['ioreg', '-rd1', '-c', 'IOPlatformExpertDevice'],
                capture_output=True, text=True, timeout=5
            )
            for line in result.stdout.splitlines():
                if 'IOPlatformSerialNumber' in line:
                    serial = line.split('"')[-2]
                    parts.append(serial)
                    break
        except Exception:
            pass

    parts.append(platform.node())
    return '|'.join(parts)


def get_device_id():
    """Get a deterministic device ID (SHA-256 hash of hardware fingerprint).

    Always returns the same ID for the same physical device.
    Cached to device_id.json for fast lookup.
    """
    device_id = hashlib.sha256(_get_machine_fingerprint().encode()).hexdigest()

    # Read cached value — if it matches, nothing to do
    if os.path.exists(args.device_id_file):
        try:
            with open(args.device_id_file) as f:
                data = json.load(f)
                cached = data.get('device_id')
                if cached == device_id:
                    return device_id
                # Hardware hash changed (e.g. NIC swap) or was random UUID — update
                logging.info(f"Device ID updated (was {cached[:12]}...)")
        except Exception as e:
            logging.error(f"Error reading device ID file: {str(e)}")

    # Write / update cache
    try:
        os.makedirs(os.path.dirname(args.device_id_file), exist_ok=True)
        with open(args.device_id_file, 'w') as f:
            json.dump({'device_id': device_id}, f)
        logging.info(f"Device ID: {device_id[:12]}...")
    except Exception as e:
        logging.error(f"Error saving device ID: {str(e)}")

    return device_id


def call_stop_api():
    """
    Call the handle_stop_request API endpoint using HTTP
    """
    try:
        logger.info("Initiating stop request via API")

        # Try to get user data from storage
        try:
            stop_payload = {}

            if os.path.exists(DEFAULT_USER_DATA_FILE):
                try:
                    with open(DEFAULT_USER_DATA_FILE) as f:
                        user_data = json.load(f)
                        user_id = user_data.get('user_id')

                        if user_id:
                            # Add the user_id to payload regardless if we've prompt_id or not
                            stop_payload['user_id'] = user_id

                            # if we've prompt_id, include it too
                            prompt_id = user_data.get('prompt_id')
                            if prompt_id:
                                stop_payload['prompt_id'] = prompt_id
                                logger.info(f"Using speific stop for user_id={user_id}, prompt_id={prompt_id}")
                            else:
                                logger.info(f"Using user-specific stop for user_id={user_id}")

                except Exception as e:
                    logger.error(f"Error reading user data: {str(e)}")
            else:
                logger.info("No user data file found, using global stop")
        except Exception as e:
                logger.error(f"Error preparing stop payload: {str(e)}")
                stop_payload = {}


        # Make the API Call
        logger.info(f"Calling the stop API at {args.stop_api_url} with payload: {stop_payload}")

        response = requests.post(
            args.stop_api_url,
            json=stop_payload,
            headers={"Content-Type": "application/json"},
            timeout=10.0
        )

        # Log Response
        if response.status_code == 200:
            result = response.json()
            logger.info(f"Stop request result: {result}")

            # Check for succes in the response
            if isinstance(result, dict) and result.get('status') in ('success', 'warning'):
                logger.info("Stop request successfully send and acknowledged")
                return True
            else:
                logger.warning(f"Stop request returned unexpected result: {result}")
                return False
        else:
            logger.error(f'Stop request failed with status code: {response.status_code}')
            logger.error(f'Response: {response.text}')
            return False
    except Exception as e:
        logger.error(f"Error calling stop API: {str(e)}")
        logger.error(traceback.format_exc())
        return False

# Get or generate device ID at startup
DEVICE_ID = get_device_id()
logging.info(f"Device ID: {DEVICE_ID}")

# Bootstrap the hardware-derived stable guest_id BEFORE any request
# comes in so /api/guest-id and the /local index.html injection both
# see the same cached id.  The file lives under get_data_dir() so it
# survives uninstall/reinstall — WebView2 localStorage wipes don't
# reach it.  See desktop/guest_identity.py for the derivation
# contract and J201/J206/J207 for the behavioural guards.
try:
    from desktop.guest_identity import get_guest_id as _get_guest_id
    GUEST_ID = _get_guest_id()
    logging.info(f"Guest ID (hardware-derived): {GUEST_ID}")
except Exception as _gie:
    # Never crash Flask boot because of guest-id derivation — degrade
    # gracefully so the frontend's chain still works (it falls through
    # to 'guest' if window.__NUNBA_GUEST_ID__ is null).
    logging.warning(f"guest_id bootstrap failed: {_gie}")
    GUEST_ID = None

@app.route('/probe', methods=['GET'])
def probe_endpoint():
    return jsonify({"status": "Probe successful", "message": "Service is operational"}), 200


@app.route('/api/guest-id', methods=['GET'])
def api_guest_id():
    """Return the hardware-derived stable guest_id for the frontend.

    Contract (J207):
      * 200 + {"guest_id": "g_<16 hex>"} on success
      * 503 + {"error": "unavailable"} if derivation failed at boot
      * Two calls in the same process MUST return the same value
    The frontend reads this in its fallback chain so guest identity
    survives a WebView2 cache wipe (uninstall/reinstall cycle).
    """
    if not GUEST_ID:
        return jsonify({'error': 'unavailable'}), 503
    return jsonify({'guest_id': GUEST_ID}), 200


@app.route('/api/guest-id', methods=['DELETE'])
def api_guest_id_delete():
    """Wipe local guest identity + per-bucket history.

    Admin-driven destructive action: surface only behind the
    "Clear all guest history now" button in admin/config/chat.
    Body: ``{"confirm": true}`` (belt-and-suspenders against
    accidental no-body DELETEs).

    What gets wiped:
      * ``guest_id.json`` under ~/Documents/Nunba/data/
      * The module cache in ``desktop.guest_identity`` so the next
        ``GET /api/guest-id`` re-derives a fresh id (same hardware
        means same id — so this is more "rotate the cached file"
        than "rotate the identity").
    What does NOT get wiped (intentionally):
      * SQLite ``conversation_history`` rows. The browser's local
        per-bucket history is the user-facing surface; the SQLite
        rows are agent-side memory and are governed by a separate
        admin path (``/api/admin/clear-conversations``, J162).

    Returns: ``{"deleted": true, "previous_guest_id": "g_..."}``
    """
    body = request.get_json(silent=True) or {}
    if not body.get('confirm'):
        return jsonify({
            'error': 'confirm_required',
            'message': 'Body must include {"confirm": true} to wipe guest identity.',
        }), 400

    prev = GUEST_ID
    try:
        from desktop.guest_identity import (
            get_guest_id_file_path,
        )
        from desktop.guest_identity import (
            reset_cache_for_tests as _reset_guest_cache,
        )
        gid_path = get_guest_id_file_path()
        if os.path.isfile(gid_path):
            os.remove(gid_path)
        _reset_guest_cache()
    except Exception as e:  # noqa: BLE001 — never 5xx the admin
        logging.warning("guest-id delete failed: %s", e)
        return jsonify({'error': 'delete_failed', 'message': str(e)}), 500
    return jsonify({'deleted': True, 'previous_guest_id': prev}), 200


@app.route('/api/admin/config/chat', methods=['GET'])
def api_admin_chat_config_get():
    """Return the current admin-controlled chat-restore settings.

    Schema:
      ``restore_policy``   one of ("always","prompt","never","session")
      ``restore_scope``    one of ("all_agents","active_only","manual")
      ``cloud_sync_enabled`` bool — opt-in cross-device guest sync
                          (Track 3 wires the export/import endpoints;
                          the toggle is here so the UI is forward-
                          compatible).

    The frontend (NunbaChatProvider) fetches this on mount and uses
    it to gate the auto-restore + auto-scroll behaviour. See
    desktop/chat_settings.py for the canonical schema + writer.
    """
    try:
        from desktop.chat_settings import get_chat_settings
        return jsonify(get_chat_settings().to_dict()), 200
    except Exception as e:  # noqa: BLE001
        logging.warning("chat-config GET failed: %s", e)
        # Defensive default — frontend treats this as 'always' so the
        # user still gets restore behaviour even if the settings file
        # is unreachable.
        return jsonify({
            'restore_policy': 'always',
            'restore_scope': 'all_agents',
            'cloud_sync_enabled': False,
            'fallback': True,
        }), 200


@app.route('/api/admin/config/chat', methods=['PUT'])
def api_admin_chat_config_put():
    """Update the admin-controlled chat-restore settings.

    Body: any subset of ``{restore_policy, restore_scope,
    cloud_sync_enabled}``. Unknown keys are ignored (forward
    compat for older clients), invalid enum values 400.

    Auth: this endpoint is local-only by virtue of Nunba's flask
    binding to 127.0.0.1; admin gating in the broader sense is
    out-of-scope for the MVP per CLAUDE.md (single-user desktop).
    """
    try:
        from desktop.chat_settings import update_chat_settings
        payload = request.get_json(silent=True) or {}
        new_settings = update_chat_settings(payload)
        return jsonify(new_settings.to_dict()), 200
    except ValueError as ve:
        return jsonify({'error': 'invalid_payload', 'message': str(ve)}), 400
    except Exception as e:  # noqa: BLE001
        logging.error("chat-config PUT failed: %s", e)
        return jsonify({'error': 'update_failed', 'message': str(e)}), 500


# ─── Chat-Sync (Track C: cross-device restore, opt-in) ──────────────
# Requires: (a) signed-in JWT and (b) cloud_sync_enabled=true in the
# admin chat settings. Both gates MUST pass; a stray JWT alone isn't
# enough. See desktop/chat_sync.py for the persistence contract.

def _chat_sync_resolve_uid():
    """Return (uid, err_response_or_None).

    Extracts the user id from Bearer token, gates on
    cloud_sync_enabled, and uniformly returns a 401/403 tuple on
    failure. Call sites only need to check the error slot:

        uid, err = _chat_sync_resolve_uid()
        if err: return err
    """
    # Gate 1: cloud_sync_enabled
    try:
        from desktop.chat_settings import get_chat_settings
        if not get_chat_settings().cloud_sync_enabled:
            return None, (jsonify({
                'error': 'sync_disabled',
                'message': 'Enable cloud sync in admin settings first.',
            }), 403)
    except Exception as e:  # noqa: BLE001
        logging.warning("chat-sync cloud_sync_enabled probe failed: %s", e)
        # Fail-closed: if we can't confirm the toggle is on, don't sync
        return None, (jsonify({'error': 'sync_probe_failed'}), 500)

    # Gate 2: JWT → user_id
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer '):
        return None, (jsonify({'error': 'unauthorized'}), 401)
    token = auth[7:].strip()
    try:
        from integrations.social.auth import decode_jwt
        payload = decode_jwt(token)
        uid = payload.get('user_id') if isinstance(payload, dict) else None
    except Exception:
        return None, (jsonify({'error': 'unauthorized'}), 401)
    if not uid:
        return None, (jsonify({'error': 'unauthorized'}), 401)
    return str(uid), None


@app.route('/api/chat-sync/push', methods=['POST'])
def api_chat_sync_push():
    """Merge the caller's chat-bucket into the server-side store.

    Body: ``{"buckets": {agent_key: {"messages":[...],
    "updated_at": ms_epoch}}, "updated_at": ms_epoch}``.

    Returns the merged blob so the client can update its local
    ``updated_at`` after the round-trip.
    """
    uid, err = _chat_sync_resolve_uid()
    if err:
        return err
    try:
        from desktop.chat_sync import push as _push
        body = request.get_json(silent=True) or {}
        merged = _push(uid, body)
        return jsonify(merged), 200
    except ValueError as ve:
        return jsonify({'error': 'invalid_payload', 'message': str(ve)}), 400
    except Exception as e:  # noqa: BLE001
        logging.error("chat-sync push failed for %s: %s", uid, e)
        return jsonify({'error': 'push_failed'}), 500


@app.route('/api/chat-sync/pull', methods=['GET'])
def api_chat_sync_pull():
    """Return the stored chat-bucket for the authenticated user.

    Shape: same as push-merge output. An empty dict (``{"buckets":
    {}, "updated_at": 0}``) is returned when the user has never
    pushed — the frontend should treat that as "no cloud copy".
    """
    uid, err = _chat_sync_resolve_uid()
    if err:
        return err
    try:
        from desktop.chat_sync import pull as _pull
        return jsonify(_pull(uid)), 200
    except Exception as e:  # noqa: BLE001
        logging.error("chat-sync pull failed for %s: %s", uid, e)
        return jsonify({'error': 'pull_failed'}), 500


@app.route('/api/chat-sync/forget', methods=['DELETE'])
def api_chat_sync_forget():
    """Delete the server-side chat-bucket for the authenticated
    user. Intended for 'Forget me on all devices' flows.

    Belt-and-suspenders: requires ``{"confirm": true}`` just like
    DELETE /api/guest-id does.
    """
    uid, err = _chat_sync_resolve_uid()
    if err:
        return err
    body = request.get_json(silent=True) or {}
    if not body.get('confirm'):
        return jsonify({
            'error': 'confirm_required',
            'message': 'Body must include {"confirm": true}.',
        }), 400
    try:
        from desktop.chat_sync import forget as _forget
        deleted = _forget(uid)
        return jsonify({'deleted': bool(deleted)}), 200
    except Exception as e:  # noqa: BLE001
        logging.error("chat-sync forget failed for %s: %s", uid, e)
        return jsonify({'error': 'forget_failed'}), 500


def get_embedded_python_path():
    """Get the path to the embedded Python executable"""
    if getattr(sys, 'frozen', False):
        # Running as frozen executable
        base_dir = os.path.dirname(sys.executable)
    else:
        # Running as script
        base_dir = os.path.dirname(os.path.abspath(__file__))

    # Check if embedded Python exists (cross-platform)
    if sys.platform == 'win32':
        embedded_python = os.path.join(base_dir, "python-embed", "python.exe")
    else:
        # macOS/Linux
        embedded_python = os.path.join(base_dir, "python-embed", "bin", "python3")

    if os.path.exists(embedded_python):
        logging.info(f"Found embedded Python at: {embedded_python}")
        return embedded_python

    logging.warning("Embedded Python not found, will use system Python")
    return None

@app.route('/execute', methods=['POST'])
@require_local_or_token
def execute_command():
    # Only execute one command at a time
    with computer_control_lock:
        global llm_control_active, last_activity_time

        # set control as active and update timestamp
        llm_control_active = True
        last_activity_time = time.time()

        # Show the indicator window
        toggle_indicator(True)

        # Start a timeout thread to automatically reset status after inactivity
        def reset_after_timeout():
            global llm_control_active, last_activity_time
            time.sleep(ACTIVITY_TIMEOUT + 0.1)  # Add small buffer
            if (time.time() - last_activity_time) > ACTIVITY_TIMEOUT:
                llm_control_active = False
                toggle_indicator(False)

        timeout_thread = threading.Thread(target=reset_after_timeout, daemon=True)
        timeout_thread.start()

        data = request.json
        # The 'command' key in the JSON request should contain the command to be executed.
        shell = data.get('shell', False)
        command = data.get('command', "" if shell else [])
        hide_window = data.get('hide_window', True) # To hide the cmd pop up

        if isinstance(command, str) and not shell:
            command = shlex.split(command)

        # Log the command being executed
        logging.info(f"Executing command: {command}")

        # Check if this is a Python command that we should intercept
        if (not shell and len(command) >= 2 and
            (command[0] == "python" or command[0] == "python3") and
            ("-c" in command or "-m" in command)):
            # Try to use embedded Python
            embedded_python = get_embedded_python_path()
            if embedded_python:
                # Replace the python command with embedded Python
                logging.info(f"Replacing system Python with embedded Python: {embedded_python}")
                command[0] = embedded_python

        # Expand user directory
        for i, arg in enumerate(command):
            if isinstance(arg, str) and arg.startswith("~/"):
                command[i] = os.path.expanduser(arg)

        # Execute the command without any safety checks.
        try:
            # Set up process creation flags for Windows to hide window
            startupinfo = None
            creation_flags = 0

            if sys.platform == "win32" and hide_window:
                # Import the necessary modules ofr windows
                import subprocess

                # CREATE_NO_WINDOW flag (0x08000000) to prevent window from showing
                creation_flags = 0x08000000

                # Also set up STARTUPINFO to hide the window
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = 0 # SW_HIDE

            # Add environment variables
            env = os.environ.copy()
            result = subprocess.run(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                shell=shell,
                text=True,
                timeout=120,
                env=env,
                startupinfo=startupinfo,
                creationflags=creation_flags)
            logging.info(f"Command executed with return code: {result.returncode}")

            # After executing the command, update the timestamp again to extend the indicator display
            last_activity_time = time.time()

            return jsonify({
                'status': 'success',
                'output': result.stdout,
                'error': result.stderr,
                'returncode': result.returncode
            })
        except Exception as e:
            logger.error("Command execution error: "+ traceback.format_exc())
            return jsonify({
                'status': 'error',
                'message': str(e)
            }), 500

@app.route('/screenshot', methods=['GET'])
@require_local_or_token
def capture_screen_with_cursor():
    try:
        if not PYAUTOGUI_AVAILABLE:
            return jsonify({'status': 'error', 'message': 'pyautogui not available'}), 503

        cursor_path = os.path.join(os.path.dirname(__file__), "cursor.png")

        # Check if cursor.png exists
        if not os.path.exists(cursor_path):
            logging.warning(f"Cursor image not found at {cursor_path}")
            screenshot = pyautogui.screenshot()
        else:
            # Take screenshot and overlay cursor
            screenshot = pyautogui.screenshot()
            cursor_x, cursor_y = pyautogui.position()

            try:
                cursor = Image.open(cursor_path)
                # make the cursor smaller
                cursor = cursor.resize((int(cursor.width / 1.5), int(cursor.height / 1.5)))
                screenshot.paste(cursor, (cursor_x, cursor_y), cursor)
            except Exception as e:
                logging.error(f"Failed to process cursor image: {str(e)}")


        # Convert PIL Image to bytes and send
        img_io = BytesIO()
        screenshot.save(img_io, 'PNG')
        img_io.seek(0)
        return send_file(img_io, mimetype='image/png')
    except Exception as e:
        logging.error("Screenshot error: "+ traceback.format_exc())
        return jsonify({
            'status': 'error',
            'message': 'Failed to capture screenshot: ' + str(e)
        }), 500

@app.route('/indicator/stop', methods=["GET"])
def stop_ai_control_endpoint():
    """Stop AI Control and hide the indicator"""
    global llm_control_active

    try:
        logger.info("Stop AI Control request received")

        # Just hide the indicator
        llm_control_active = False
        toggle_indicator(False)

        # call the stop API
        success = call_stop_api()

        if success:
            return jsonify({
                "success": True,
                "status": "Stopped and hidden",
                "message": "Stop request sent successfully"
            })
        else:
            return jsonify({
                "success": False,
                "status": "indicator hidden but stop request failed",
                "error": "Failed to send stop request to server"
            })

    except Exception as e:
        logger.error(f"Error stopping AI Control: {str(e)}")
        logger.error(traceback.format_exc())

        # Even if we fail, try to hide the indicator
        try:
            toggle_indicator(False)
        except Exception:
            pass

        return jsonify({"success": False, "error": str(e)})

@app.route('/llm_control_status', methods=["GET"])
def llm_control_status():
    """Return the current status of LLM Control"""
    global llm_control_active, last_activity_time
    # Check if activity has timed out
    if llm_control_active and (time.time() - last_activity_time) > ACTIVITY_TIMEOUT:
        llm_control_active = False
        toggle_indicator(False)

    return jsonify({
        'active': llm_control_active,
        'last_activity': last_activity_time,
        'indicator_status': get_status()
    })

@app.route('/api/llm/status', methods=["GET"])
def llm_status():
    """Check if any LLM is available (local or cloud) and return full diagnostic state.

    Returns diagnosis covering: GPU state, binary state, model state, mmproj state,
    and the specific action the frontend should take (start, download, upgrade, etc.).
    """
    try:
        from llama.llama_config import MODEL_PRESETS, LlamaConfig
        config = LlamaConfig()
        available = config.is_llm_available()
        preset = config.get_selected_model_preset()

        # Full hardware + software diagnosis
        diag = config.diagnose()

        best_idx = diag['best_model_index']
        best = MODEL_PRESETS[best_idx]

        return jsonify({
            "available": available,
            "llm_mode": config.get_llm_mode(),
            "cloud_configured": config.is_cloud_configured(),
            "first_run": config.is_first_run(),
            "model_name": preset.display_name if preset else None,
            "model_count": len(MODEL_PRESETS),
            "gpu_detected": diag['gpu_detected'],
            "setup_needed": not available and not config.is_cloud_configured(),
            "recommended": {
                "model_name": best.display_name,
                "model_index": best_idx,
                "size_mb": best.size_mb,
                "gpu_mode": 'GPU' if diag['run_mode'] == 'gpu' else 'CPU',
                "description": best.description,
                "has_vision": best.has_vision,
                "downloaded": diag['best_model_downloaded'],
            },
            "diagnosis": {
                "action": diag['action'],
                "actions": diag['actions'],
                "run_mode": diag['run_mode'],
                "message": diag['message'],
                "gpu_type": diag['gpu_type'],
                "gpu_name": diag['gpu_name'],
                "gpu_total_gb": diag['gpu_total_gb'],
                "gpu_free_gb": diag['gpu_free_gb'],
                "gpu_occupied": diag['gpu_occupied'],
                "binary_found": diag['binary_found'],
                "binary_supports_gpu": diag['binary_supports_gpu'],
                "binary_mismatch": diag['binary_mismatch'],
                "mmproj_available": diag['mmproj_available'],
                "mmproj_needed": diag['mmproj_needed'],
                "compute_budget_mb": diag['compute_budget_mb'],
                "compute_source": diag['compute_source'],
                "current_model_too_big": diag['current_model_too_big'],
            },
        })
    except Exception as e:
        return jsonify({"available": False, "setup_needed": True, "error": str(e)})


@app.route('/api/llm/auto-setup', methods=["POST"])
def llm_auto_setup():
    """Auto-detect hardware, download best model, start llama.cpp. Non-blocking."""
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        from llama.llama_config import MODEL_PRESETS, LlamaConfig
        config = LlamaConfig()
        data = request.get_json(silent=True) or {}
        model_index = data.get('model_index')
        result = config.auto_setup(model_index=model_index)
        # Sync catalog state so dashboard reflects the loaded model
        if result.get('success'):
            try:
                from models.catalog import ModelType
                from models.orchestrator import get_orchestrator
                orch = get_orchestrator()
                idx = config.config.get('selected_model_index', 0)
                preset = MODEL_PRESETS[idx] if idx < len(MODEL_PRESETS) else None
                if preset:
                    device = 'gpu' if config.config.get('use_gpu') else 'cpu'
                    orch.notify_loaded(ModelType.LLM, preset.display_name, device=device,
                                       vram_gb=preset.size_mb / 1024.0)
            except Exception:
                pass
        return jsonify(result)
    except Exception as e:
        logging.error(f"Auto-setup failed: {e}")
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/llm/configure', methods=["POST"])
def llm_launch_configure():
    """Launch the AI setup wizard (--setup-ai) so user can wire Ollama, Jan, APIs, etc."""
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        import subprocess
        import sys
        # Launch a new process with --setup-ai flag (non-blocking)
        exe = sys.executable
        # In frozen builds, use the app executable itself
        if getattr(sys, 'frozen', False):
            exe = sys.argv[0]
        subprocess.Popen(
            [exe, '--setup-ai'],
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0,
        )
        return jsonify({"success": True, "message": "AI configuration wizard launched"})
    except Exception as e:
        logging.error(f"Failed to launch configure wizard: {e}")
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/llm/switch', methods=["POST"])
def llm_switch_model():
    """Switch the local LLM model at runtime. Stops server, restarts with new model."""
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        data = request.get_json()
        model_index = data.get('model_index', 0)
        from llama.llama_config import MODEL_PRESETS, LlamaConfig
        config = LlamaConfig()
        if model_index < 0 or model_index >= len(MODEL_PRESETS):
            return jsonify({"error": f"Invalid index. Valid: 0-{len(MODEL_PRESETS)-1}"}), 400
        # Notify catalog of old model unload before switching
        old_idx = config.config.get('selected_model_index', 0)
        old_preset = MODEL_PRESETS[old_idx] if old_idx < len(MODEL_PRESETS) else None
        success = config.switch_model(model_index)
        preset = MODEL_PRESETS[model_index]
        # Sync catalog: unload old, load new
        try:
            from models.catalog import ModelType
            from models.orchestrator import get_orchestrator
            orch = get_orchestrator()
            if old_preset:
                orch.notify_unloaded(ModelType.LLM, old_preset.display_name)
            if success:
                device = 'gpu' if config.config.get('use_gpu') else 'cpu'
                orch.notify_loaded(ModelType.LLM, preset.display_name, device=device,
                                   vram_gb=preset.size_mb / 1024.0)
        except Exception:
            pass
        return jsonify({
            "success": success,
            "model_index": model_index,
            "model_name": preset.display_name,
            "has_vision": preset.has_vision,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Unified Model Management API ─────────────────────────────────
# Central CRUD for ALL model types (LLM, TTS, STT, VLM, image_gen, etc.)
# Uses ModelCatalog (JSON-backed registry) + ModelOrchestrator (compute-aware loader).

@app.route('/api/harthash', methods=["GET"])
def harthash():
    """@HARTHASH — returns git commit hashes of all repos at build time.

    Used to verify which version is installed. Reads from build_hashes.json
    (generated by build.py) or falls back to live git if in dev mode.
    """
    import json as _json
    # Try build-time hashes first (frozen build)
    _hash_file = os.path.join(os.path.dirname(os.path.abspath(
        sys.executable if getattr(sys, 'frozen', False) else __file__)), 'build_hashes.json')
    if os.path.isfile(_hash_file):
        with open(_hash_file) as f:
            return jsonify(_json.load(f))
    # Dev mode — read live git hashes
    import subprocess
    hashes = {}
    repos = {
        'nunba': os.path.dirname(os.path.abspath(__file__)),
        'hartos': os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'HARTOS'),
        'hevolve_database': os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'Hevolve_Database'),
        'hevolveai': os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'hevolveai'),
    }
    for name, path in repos.items():
        try:
            r = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'],
                               capture_output=True, text=True, cwd=path, timeout=5)
            hashes[name] = r.stdout.strip() if r.returncode == 0 else 'unknown'
        except Exception:
            hashes[name] = 'unknown'
    hashes['build_time'] = 'dev-mode'
    return jsonify(hashes)


@app.route('/api/admin/models', methods=["GET"])
def admin_models_list():
    """List all models in the catalog with compute state and runtime status."""
    try:
        from models.orchestrator import get_orchestrator
        orch = get_orchestrator()
        status = orch.get_status()
        return jsonify(status)
    except Exception as e:
        logging.error(f"Model catalog error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/models', methods=["POST"])
def admin_models_register():
    """Register a new model entry (any type). Persists to catalog JSON."""
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        from models.catalog import ModelEntry, get_catalog
        data = request.get_json()
        if not data or not data.get('id') or not data.get('model_type'):
            return jsonify({"error": "id and model_type are required"}), 400
        entry = ModelEntry.from_dict(data)
        catalog = get_catalog()
        catalog.register(entry)
        return jsonify({"success": True, "model": entry.to_dict()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/models/<model_id>', methods=["GET"])
def admin_models_get(model_id):
    """Get a single model entry by ID."""
    try:
        from models.catalog import get_catalog
        catalog = get_catalog()
        entry = catalog.get(model_id)
        if not entry:
            return jsonify({"error": "not found"}), 404
        d = entry.to_dict()
        d['downloaded'] = entry.downloaded
        d['loaded'] = entry.loaded
        d['device'] = entry.device
        d['error'] = entry.error
        return jsonify(d)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/models/<model_id>', methods=["PUT"])
def admin_models_update(model_id):
    """Update an existing model entry."""
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        from models.catalog import ModelEntry, get_catalog
        catalog = get_catalog()
        existing = catalog.get(model_id)
        if not existing:
            return jsonify({"error": "not found"}), 404
        data = request.get_json()
        # Merge updates into existing entry
        merged = existing.to_dict()
        merged.update(data)
        merged['id'] = model_id  # ID cannot change
        updated = ModelEntry.from_dict(merged)
        catalog.register(updated)
        return jsonify({"success": True, "model": updated.to_dict()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/models/<model_id>', methods=["DELETE"])
def admin_models_delete(model_id):
    """Remove a model from the catalog.

    If the model is currently loaded, unload it first so the worker
    subprocess stops and VRAM is released. Otherwise deleting the
    catalog entry would orphan a running worker.
    """
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        from models.catalog import get_catalog
        from models.orchestrator import get_orchestrator
        catalog = get_catalog()
        entry = catalog.get(model_id)
        if entry is None:
            return jsonify({"success": False, "error": "not found"}), 404
        # Unload before delete so the worker subprocess stops
        # and VRAM/process resources are released.
        if entry.loaded:
            try:
                get_orchestrator().unload(model_id)
            except Exception as e:
                logging.warning(f"Unload before delete failed for {model_id}: {e}")
        removed = catalog.unregister(model_id)
        return jsonify({"success": removed})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/models/<model_id>/set-purpose', methods=["POST"])
def admin_models_set_purpose(model_id):
    """Toggle a purpose on/off for a model.

    Body: {"purpose": "draft", "enabled": true}
    A model can have multiple purposes (e.g. same LLM as draft + main).
    Each purpose is globally unique — enabling it here clears it from
    any other model regardless of type.
    """
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        from models.catalog import get_catalog
        catalog = get_catalog()
        entry = catalog.get(model_id)
        if not entry:
            return jsonify({"error": "not found"}), 404
        data = request.get_json(silent=True) or {}
        purpose = data.get('purpose')
        if not purpose:
            return jsonify({"error": "purpose is required"}), 400
        enabled = data.get('enabled', True)
        ok = catalog.set_purpose(model_id, purpose, enabled=enabled)
        if not ok:
            return jsonify({
                "error": f"Invalid purpose. Valid: {catalog.ALL_PURPOSES}",
            }), 400
        entry = catalog.get(model_id)
        return jsonify({
            "success": True, "model_id": model_id,
            "purposes": entry.purposes,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/models/<model_id>/load', methods=["POST"])
def admin_models_load(model_id):
    """Load a specific model (downloads if needed)."""
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        from models.orchestrator import get_orchestrator
        orch = get_orchestrator()
        entry = orch.load(model_id)
        if entry:
            return jsonify({
                "success": True, "model_id": model_id,
                "device": entry.device, "name": entry.name,
            })
        return jsonify({"success": False, "error": "Load failed"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/models/<model_id>/unload', methods=["POST"])
def admin_models_unload(model_id):
    """Unload a model and free its resources."""
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        from models.orchestrator import get_orchestrator
        orch = get_orchestrator()
        success = orch.unload(model_id)
        return jsonify({"success": success})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Track active downloads for progress reporting
_download_progress = {}  # model_id → {status, percent, message, started_at}

@app.route('/api/admin/models/<model_id>/download', methods=["POST"])
def admin_models_download(model_id):
    """Download a model in background. Poll /download/status for progress."""
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        import threading
        import time

        from models.orchestrator import get_orchestrator
        orch = get_orchestrator()

        _download_progress[model_id] = {
            'status': 'downloading', 'percent': 0,
            'message': 'Starting download...', 'started_at': time.time(),
        }

        def _bg_download():
            try:
                success = orch.download(model_id)
                _download_progress[model_id] = {
                    'status': 'complete' if success else 'error',
                    'percent': 100 if success else 0,
                    'message': 'Download complete' if success else 'Download failed',
                }
            except Exception as e:
                _download_progress[model_id] = {
                    'status': 'error', 'percent': 0, 'message': str(e),
                }

        threading.Thread(target=_bg_download, daemon=True).start()
        return jsonify({"success": True, "status": "downloading"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/models/<model_id>/download/status', methods=["GET"])
def admin_models_download_status(model_id):
    """Poll download progress for a model."""
    progress = _download_progress.get(model_id)
    if not progress:
        return jsonify({"status": "idle"})
    return jsonify(progress)


@app.route('/api/admin/models/auto-select', methods=["POST"])
def admin_models_auto_select():
    """Auto-select the best model for a given type + optional language.

    Body: {"model_type": "tts", "language": "en"}
    Returns the selected model entry without loading it.
    """
    try:
        from models.orchestrator import get_orchestrator
        data = request.get_json(silent=True) or {}
        model_type = data.get('model_type')
        if not model_type:
            return jsonify({"error": "model_type required"}), 400
        orch = get_orchestrator()
        entry = orch.select_best(model_type, language=data.get('language'))
        if entry:
            d = entry.to_dict()
            d['downloaded'] = entry.downloaded
            d['loaded'] = entry.loaded
            d['device'] = entry.device
            return jsonify({"success": True, "selected": d})
        return jsonify({"success": False, "message": f"No {model_type} model fits current compute"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/models/health', methods=["GET"])
def admin_models_health():
    """Full lifecycle health dashboard: process health, crash state, swap queue, pressure.

    Cross-checks the catalog flags against live loader.is_loaded() probes
    so idle auto-stops, subprocess crashes, and out-of-band process kills
    show up as drift warnings instead of stale loaded:True entries.
    """
    try:
        from integrations.service_tools.model_lifecycle import get_model_lifecycle_manager

        from models.orchestrator import get_orchestrator
        mlm = get_model_lifecycle_manager()

        # Sync catalog flags with live loader state BEFORE building the
        # response so the UI always sees reality.
        drift = []
        try:
            orch = get_orchestrator()
            # Build drift list before reconciling so we can report
            # the entries whose state was stale.
            for entry in orch._catalog.list_all():
                loader = orch._loaders.get(entry.model_type)
                if loader is None:
                    continue
                try:
                    live = bool(loader.is_loaded(entry))
                except Exception:
                    continue
                if live != bool(entry.loaded):
                    drift.append({
                        'model_id': entry.id,
                        'catalog_loaded': bool(entry.loaded),
                        'live_loaded': live,
                    })
            orch.reconcile_live_state()
        except Exception as e:
            logging.warning(f"Health: reconcile failed: {e}")

        status = mlm.get_status()
        if isinstance(status, dict):
            status['drift_detected'] = drift
            status['drift_count'] = len(drift)
        return jsonify(status)
    except ImportError:
        return jsonify({"error": "Lifecycle manager not available"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/models/swap', methods=["POST"])
def admin_models_swap():
    """Atomically swap models: evict an existing GPU model and load a new one.

    Body: {"needed_model": "model_id", "evict_target": "optional_target_id"}

    Coordinates both halves of the swap via the orchestrator:
      1. Request eviction of the current GPU model (or explicit evict_target)
         through ModelLifecycleManager — this stops its worker subprocess
         and releases VRAM.
      2. Load the new model via ModelOrchestrator.load(), which goes through
         the matching loader (TTSLoader/STTLoader/VLMLoader/LlamaLoader)
         and eagerly spawns the new worker subprocess.
      3. On load failure, report the error so the caller can decide whether
         to retry or manually restore the evicted model.
    """
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        from integrations.service_tools.model_lifecycle import get_model_lifecycle_manager

        from models.orchestrator import get_orchestrator
        data = request.get_json(silent=True) or {}
        needed = data.get('needed_model')
        if not needed:
            return jsonify({"error": "needed_model required"}), 400

        mlm = get_model_lifecycle_manager()
        orch = get_orchestrator()

        # 1. Evict old model to free VRAM (its worker subprocess stops here)
        evict_ok = mlm.request_swap(
            needed_model=needed,
            evict_target=data.get('evict_target'),
        )
        if not evict_ok:
            return jsonify({
                "success": False,
                "needed_model": needed,
                "error": "no evictable model found",
            }), 409

        # 2. Load new model (eagerly spawns the new worker subprocess)
        new_entry = orch.load(needed)
        if new_entry is None:
            return jsonify({
                "success": False,
                "needed_model": needed,
                "evicted": True,
                "error": "eviction succeeded but new model load failed",
            }), 500

        return jsonify({
            "success": True,
            "needed_model": needed,
            "device": new_entry.device,
            "evicted": True,
        })
    except ImportError:
        return jsonify({"error": "Lifecycle manager not available"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ═══════════════════════════════════════════════════════════════════════
# HuggingFace Hub discovery  (/api/admin/models/hub/*)
# Browse trending/top-downloaded models by category + install into catalog
# ═══════════════════════════════════════════════════════════════════════

# Map Nunba purpose → (HF pipeline_tag, library filters).  Drives what
# shows up when user picks a category in the "Browse HuggingFace" UI tab.
_HUB_CATEGORY_FILTERS = {
    'llm':         {'pipeline_tag': 'text-generation', 'library': 'transformers'},
    'draft':       {'pipeline_tag': 'text-generation', 'library': 'transformers'},
    'vision':      {'pipeline_tag': 'image-text-to-text'},
    'caption':     {'pipeline_tag': 'image-to-text'},
    'tts':         {'pipeline_tag': 'text-to-speech'},
    'stt':         {'pipeline_tag': 'automatic-speech-recognition'},
    'diarization': {'pipeline_tag': 'voice-activity-detection'},  # pyannote tag
    'vad':         {'pipeline_tag': 'voice-activity-detection'},
    'embedding':   {'pipeline_tag': 'sentence-similarity'},
    'rerank':      {'pipeline_tag': 'text-ranking'},
    'ocr':         {'pipeline_tag': 'image-to-text'},  # OCR shows under image-to-text
    'music':       {'pipeline_tag': 'text-to-audio'},
    'image-gen':   {'pipeline_tag': 'text-to-image'},
    'video-gen':   {'pipeline_tag': 'text-to-video'},
    'translate':   {'pipeline_tag': 'translation'},
}


# Trusted-publisher list moved to runtime config (`~/.nunba/hub_allowlist.json`)
# managed by `core.hub_allowlist`.  Operators can add/remove via the admin
# CRUD endpoints below WITHOUT a release.  The legacy frozenset literal that
# lived here was the friction point that pushed the field team to recommend
# `confirm_unverified=True` instead of expanding the list — defeating the
# entire safety gate.  Seeded defaults preserve the previous 27 entries.
#
# Kept as a module-level alias for backward compat with any test that
# imports `_TRUSTED_HF_ORGS` directly.  New code MUST go through the
# allowlist API (`get_allowlist().is_trusted(org)`) so audit + persistence
# stay coherent.
def _get_trusted_orgs_legacy_view():
    """Backward-compat shim — returns the current trusted-org names as a
    frozenset.  Snapshots the live allowlist; do NOT cache the result."""
    from core.hub_allowlist import get_allowlist
    return frozenset(e['org'] for e in get_allowlist().list())


_TRUSTED_HF_ORGS = _get_trusted_orgs_legacy_view  # callable, not a set


# Category → default capabilities mapping for HF-installed models.
# Today hub-install writes `capabilities={}` — which makes
# `ModelCatalog.select_best(require_capability=…)` silently reject the
# newly-installed model for every capability-driven route.  Seeding a
# small, well-known capability set from the user-selected category
# unblocks capability-based routing without introducing any new enum
# or taxonomy — the keys below are the ones already used by seeded
# populators (`'image_input'`, `'tts'`, `'stt'`, `'music_gen'`, etc.).
_CATEGORY_CAPABILITIES: dict[str, dict[str, bool]] = {
    'llm':         {'text_gen': True, 'reason': True},
    'draft':       {'text_gen': True, 'reason': True, 'draft': True},
    'translate':   {'text_gen': True, 'translate': True},
    'vision':      {'image_input': True, 'text_gen': True},
    'caption':     {'image_input': True, 'caption': True},
    'grounding':   {'image_input': True, 'grounding': True},
    'ocr':         {'image_input': True, 'ocr': True},
    'tts':         {'audio_gen': True, 'tts': True},
    'stt':         {'audio_input': True, 'stt': True},
    'diarization': {'audio_input': True, 'diarization': True},
    'vad':         {'audio_input': True, 'vad': True},
    'embedding':   {'embedding': True},
    'rerank':      {'rerank': True},
    'music':       {'audio_gen': True, 'music_gen': True},
    'image-gen':   {'image_gen': True},
    'video-gen':   {'video_gen': True},
}


def _normalize_hf_id(raw: str) -> str:
    """NFKC-normalize + reject non-ASCII hf_ids to defeat Unicode
    homoglyph attacks.  `aí4bharat/indic-parler-tts` (Latin Small I
    With Acute, U+00ED) looks identical to `ai4bharat/...` but resolves
    to an attacker-controlled repo."""
    import unicodedata
    cleaned = unicodedata.normalize('NFKC', raw).strip()
    if any(ord(c) > 0x7F for c in cleaned):
        raise ValueError(
            f"hf_id must be ASCII only (non-ASCII char detected — "
            f"possible homoglyph attack): {cleaned!r}",
        )
    return cleaned


@app.route('/api/admin/models/hub/search', methods=['GET'])
def admin_models_hub_search():
    """Search HuggingFace Hub by Nunba task category.

    Query params:
      category:   llm|draft|vision|caption|tts|stt|diarization|vad|embedding|...
      lang:       (optional) ISO code to filter — e.g. 'ta', 'hi', 'zh'
      sort:       downloads (default) | trending-score | likes
      limit:      (default 20, max 50)
      search:     (optional) substring to match in model id

    Returns top N models from HF Hub matching the filter.
    """
    # Local-only — avoid letting remote callers enumerate/recon via this
    # endpoint (same policy as /hub/install).  Previously unauthenticated.
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        from huggingface_hub import list_models
    except ImportError:
        return jsonify({"error": "huggingface_hub not installed"}), 503
    try:
        category = (request.args.get('category') or 'llm').lower()
        filt = _HUB_CATEGORY_FILTERS.get(category)
        if not filt:
            return jsonify({
                "error": "unknown category",
                "valid": sorted(_HUB_CATEGORY_FILTERS.keys()),
            }), 400
        lang = request.args.get('lang')
        sort_by = request.args.get('sort', 'downloads')
        if sort_by not in ('downloads', 'trending-score', 'likes'):
            sort_by = 'downloads'
        try:
            limit = max(1, min(50, int(request.args.get('limit', 20))))
        except ValueError:
            limit = 20
        search = request.args.get('search')

        kwargs = {
            'sort': sort_by,
            'direction': -1,  # descending
            'limit': limit,
            'full': False,
        }
        if filt.get('pipeline_tag'):
            kwargs['pipeline_tag'] = filt['pipeline_tag']
        if filt.get('library'):
            kwargs['library'] = filt['library']
        if lang:
            kwargs['language'] = lang
        if search:
            kwargs['search'] = search

        models = list(list_models(**kwargs))
        # Build minimal payload — don't leak full HF metadata blobs
        results = []
        for m in models:
            results.append({
                'id': m.id,
                'author': getattr(m, 'author', None),
                'downloads': getattr(m, 'downloads', 0) or 0,
                'likes': getattr(m, 'likes', 0) or 0,
                'pipeline_tag': getattr(m, 'pipeline_tag', None),
                'library_name': getattr(m, 'library_name', None),
                'tags': list(getattr(m, 'tags', []) or [])[:10],
                'created_at': getattr(m, 'created_at', None).isoformat()
                    if getattr(m, 'created_at', None) else None,
                'last_modified': getattr(m, 'last_modified', None).isoformat()
                    if getattr(m, 'last_modified', None) else None,
            })
        return jsonify({
            'category': category,
            'lang': lang,
            'count': len(results),
            'results': results,
        })
    except Exception as e:
        logging.warning(f"HF Hub search failed: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/models/hub/install', methods=['POST'])
def admin_models_hub_install():
    """Register a HuggingFace model into the Nunba catalog + download.

    Body: {
      hf_id: 'org/model-name',         # required
      category: 'tts',                 # required — drives model_type mapping
      purposes: ['tts', 'main'],       # optional — auto-assign in catalog
      name: 'Friendly display name',   # optional — defaults to hf_id tail
      languages: ['en', 'ta'],         # optional — lang_priority hint
    }
    """
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        from models.catalog import ModelEntry, get_catalog
        from models.orchestrator import get_orchestrator
        data = request.get_json(silent=True) or {}
        raw_hf_id = (data.get('hf_id') or '').strip()
        category = (data.get('category') or '').lower().strip()
        confirm_unverified = bool(data.get('confirm_unverified'))
        if not raw_hf_id or '/' not in raw_hf_id:
            return jsonify({"error": "hf_id must be 'org/name'"}), 400
        # ── Homoglyph / Unicode defense ──
        try:
            hf_id = _normalize_hf_id(raw_hf_id)
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        if category not in _HUB_CATEGORY_FILTERS:
            return jsonify({
                "error": "unknown category",
                "valid": sorted(_HUB_CATEGORY_FILTERS.keys()),
            }), 400

        # ── Trusted-org gate ──
        # Unknown orgs are allowed ONLY if the user explicitly confirms
        # they understand the supply-chain risk.  Frontend shows a red
        # "unverified publisher" banner and collects the checkbox.
        # Allowlist is now runtime-editable via /api/admin/hub/allowlist
        # so enterprise tenants can add internal orgs without a release.
        from core.hub_allowlist import get_allowlist
        _allowlist = get_allowlist()
        org = hf_id.split('/', 1)[0]
        if not _allowlist.is_trusted(org) and not confirm_unverified:
            return jsonify({
                "error": "unverified_org",
                "message": (
                    f"'{org}' is not in the trusted-publisher list. "
                    f"If you've verified the author and repo are legitimate, "
                    f"resubmit with confirm_unverified=true."
                ),
                "trusted_orgs": sorted(e['org'] for e in _allowlist.list()),
            }), 403

        # ── Safetensors-only gate ──
        # Reject repos whose weights are ONLY in pickle/.bin format —
        # `torch.load()` on a malicious pickle achieves arbitrary code
        # execution in the Nunba process (full user token).  If a repo
        # has both .safetensors and .bin, safetensors is preferred and
        # we accept.  If only .bin/.pt/.pkl, refuse.
        #
        # `list_repo_files` is a blocking HTTPS call with NO explicit
        # timeout in huggingface_hub (defaults to ~10s connect + TCP
        # stall up to 75s).  Running it directly on the Flask thread
        # can hang an admin worker for up to a minute on a network
        # blip.  Wrap in a 5s future.result(timeout=5) and fail the
        # admin request with 504 instead of stalling.
        try:
            from concurrent.futures import ThreadPoolExecutor
            from concurrent.futures import TimeoutError as _FT

            from huggingface_hub import list_repo_files
            with ThreadPoolExecutor(max_workers=1) as _ex:
                _fut = _ex.submit(list_repo_files, hf_id)
                try:
                    _files = set(_fut.result(timeout=5.0))
                except _FT:
                    return jsonify({
                        "error": "hf_timeout",
                        "message": "HuggingFace Hub file listing timed out "
                                   "after 5s — retry when network is stable",
                    }), 504
            _has_safetensors = any(
                f.endswith('.safetensors') for f in _files
            )
            _risky = {
                f for f in _files
                if f.endswith(('.bin', '.pt', '.pkl', '.pickle', '.ckpt'))
            }
            if _risky and not _has_safetensors:
                return jsonify({
                    "error": "unsafe_weights_format",
                    "message": (
                        "This repo ships weights only in pickle format "
                        "(.bin/.pt/.pkl/.ckpt).  Loading these executes "
                        "arbitrary code.  Nunba requires a .safetensors "
                        "variant."
                    ),
                    "found_files": sorted(_risky)[:10],
                }), 415
        except Exception as _fe:
            # If list_repo_files fails (private repo, network), fail
            # closed — do not silently bypass the gate.
            return jsonify({
                "error": "file_probe_failed",
                "message": f"could not verify repo contents: {_fe}",
            }), 502

        # Category → model_type mapping for catalog registration
        type_map = {
            'llm': 'llm', 'draft': 'llm',
            'vision': 'mllm', 'caption': 'vlm', 'grounding': 'vlm', 'ocr': 'vlm',
            'tts': 'tts', 'stt': 'stt',
            'diarization': 'audio', 'vad': 'audio',
            'embedding': 'embedding', 'rerank': 'embedding',
            'music': 'audio-gen', 'image-gen': 'image-gen',
            'video-gen': 'video-gen', 'translate': 'llm',
        }
        model_type = type_map.get(category, 'llm')

        # Synthesize catalog entry.  Use a safe id: strip org prefix + sanitize.
        safe_id = f"{category}-" + hf_id.split('/', 1)[1].lower().replace('_', '-').replace('.', '-')
        catalog = get_catalog()
        if catalog.get(safe_id):
            return jsonify({"error": f"already registered as '{safe_id}'"}), 409

        # Seed capability dict from the user-chosen category so
        # capability-gated routing (`select_best(require_capability=…)`)
        # can actually pick this HF install.  Without this the entry
        # would register with `capabilities={}` and be invisible to
        # every capability-specific task.
        _seeded_caps = dict(_CATEGORY_CAPABILITIES.get(category, {}))
        # Source-tag marks the entry as "not yet runtime-proven"; the
        # background validate probe will flip `install_validated` to
        # True once `loader.load()` succeeds.  Until then, the
        # dispatcher capability gate treats the entry with caution.
        _seeded_caps['install_validated'] = False

        entry_dict = {
            'id': safe_id,
            'name': data.get('name') or hf_id.rsplit('/', 1)[-1],
            'model_type': model_type,
            'provider': 'huggingface',
            'hf_repo': hf_id,
            'enabled': True,
            'purposes': [p for p in (data.get('purposes') or []) if p in catalog.ALL_PURPOSES],
            'lang_priority': data.get('languages') or [],
            'capabilities': _seeded_caps,
            'source': 'hub-install',
        }
        entry = ModelEntry.from_dict(entry_dict)
        catalog.register(entry)

        # Trigger background download so user sees progress in UI.
        import threading
        import time
        _download_progress[safe_id] = {
            'status': 'downloading', 'percent': 0,
            'message': f'Downloading {hf_id}...', 'started_at': time.time(),
        }
        def _bg():
            try:
                get_orchestrator().download(safe_id)
                # ── Runtime validation probe ────────────────────────
                # Until this point the install is merely "bytes landed
                # on disk".  Actually load() the model so we can prove
                # it works *before* a real user-facing request depends
                # on it.  Success flips capabilities['install_validated']
                # so the dispatcher capability gate will start routing
                # to it.  Failure leaves install_validated=False and
                # records the reason — the model stays in the catalog
                # but dispatch refuses it.
                validated = False
                validate_reason = ''
                try:
                    _entry = get_orchestrator().load(safe_id)
                    if _entry is not None:
                        # ── Capability probe ────────────────────────
                        # Beyond "subprocess started", actually send a
                        # canned modality-specific input and require a
                        # plausible response before claiming validated.
                        # VLMLoader.validate → 32×32 JPEG caption,
                        # TTSLoader.validate → synth a fixed phrase,
                        # STTLoader.validate → transcribe TTS output,
                        # LlamaLoader.validate → canned prompt complete.
                        # Default base returns (True, 'no probe defined')
                        # so loaders without an override don't gate.
                        _cap_ok, _cap_reason = True, 'no probe'
                        try:
                            _orch = get_orchestrator()
                            _loader = _orch._loaders.get(_entry.model_type)
                            if _loader is not None:
                                _cap_ok, _cap_reason = _loader.validate(_entry)
                        except Exception as _ve:
                            _cap_ok = False
                            _cap_reason = f'validate() raised: {_ve}'

                        if _cap_ok:
                            validated = True
                            validate_reason = _cap_reason
                            try:
                                from models.catalog import get_catalog as _get_cat
                                _e = _get_cat().get(safe_id)
                                if _e is not None:
                                    _e.capabilities['install_validated'] = True
                            except Exception as _ce:
                                logging.debug(
                                    f"[hub-install] capability flip skipped: {_ce}")
                        else:
                            validate_reason = f'capability probe failed: {_cap_reason}'
                            logging.info(
                                f"[hub-install] {safe_id} loaded but "
                                f"capability probe failed: {_cap_reason}")
                    else:
                        validate_reason = 'loader returned None'
                except Exception as _le:
                    validate_reason = str(_le)
                    logging.info(
                        f"[hub-install] runtime validation failed "
                        f"for {safe_id}: {_le}")

                # ── Optional hive benchmark challenge ───────────────
                # If the HiveBenchmarkProver knows a baseline for this
                # model family, fire a CHALLENGE run in the background.
                # The prover compares hive output against KNOWN_BASELINES
                # and publishes results on 'hive.benchmark.challenge'.
                # Best-effort, non-blocking — most HF models won't have
                # a baseline and that's fine (the install is still
                # validated by the load probe above).
                if validated:
                    try:
                        from integrations.agent_engine.hive_benchmark_prover import (
                            KNOWN_BASELINES,
                            get_benchmark_prover,
                        )
                        _baselines = KNOWN_BASELINES.get(safe_id) or {}
                        if _baselines:
                            _bench = next(iter(_baselines.keys()))
                            _p = get_benchmark_prover()
                            threading.Thread(
                                target=lambda: _p.challenge(safe_id, _bench),
                                name=f'hub-challenge-{safe_id}',
                                daemon=True,
                            ).start()
                    except Exception as _pe:
                        logging.debug(
                            f"[hub-install] prover challenge skipped: {_pe}")

                _download_progress[safe_id] = {
                    'status': 'complete', 'percent': 100,
                    'message': 'Downloaded + validated' if validated
                               else f'Downloaded (unvalidated: {validate_reason})',
                    'validated': validated,
                    'validate_reason': validate_reason,
                    'started_at': _download_progress[safe_id]['started_at'],
                }
            except Exception as e:
                _download_progress[safe_id] = {
                    'status': 'error', 'percent': 0,
                    'message': str(e), 'started_at': _download_progress[safe_id]['started_at'],
                }
        threading.Thread(target=_bg, name=f'hub-dl-{safe_id}', daemon=True).start()

        return jsonify({
            'success': True,
            'model_id': safe_id,
            'hf_repo': hf_id,
            'download_started': True,
        })
    except Exception as e:
        logging.warning(f"HF Hub install failed: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/models/manifest/export', methods=['GET'])
def admin_models_manifest_export():
    """Export the user's hub-installed model set as a portable manifest.

    Today each user manually installs models one-by-one via the HF hub
    UI — there's no way to reproduce "my working model set" on another
    machine.  This endpoint serialises every catalog entry whose
    `source == 'hub-install'` into a JSON blob that admin_models_manifest_import
    can replay.  Seeded presets and manually-registered entries are
    intentionally excluded (they reproduce via the app version, not
    via a manifest).

    Response shape:
        {
          "manifest_version": 1,
          "exported_at": "<iso>",
          "entries": [
            {"hf_id": "...", "category": "...", "purposes": [...],
             "languages": [...], "name": "..."},
            ...
          ]
        }
    """
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        from datetime import datetime as _dt

        from models.catalog import get_catalog
        catalog = get_catalog()
        entries = []
        for entry in catalog.list_all():
            if getattr(entry, 'source', '') != 'hub-install':
                continue
            entries.append({
                'hf_id': getattr(entry, 'hf_repo', '') or '',
                # Derive category back from safe_id prefix (e.g. 'tts-…')
                # or fall back to model_type.
                'category': (entry.id.split('-', 1)[0]
                             if '-' in entry.id
                             else entry.model_type),
                'name': entry.name,
                'purposes': list(entry.purposes or []),
                'languages': list(entry.languages or []),
            })
        return jsonify({
            'manifest_version': 1,
            'exported_at': _dt.utcnow().isoformat() + 'Z',
            'entries': entries,
        })
    except Exception as e:
        logging.warning(f"manifest export failed: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/models/manifest/import', methods=['POST'])
def admin_models_manifest_import():
    """Replay a manifest produced by /manifest/export on this machine.

    For each entry, re-run the existing admin_models_hub_install flow
    so every one of the 4 supply-chain gates is applied fresh (trusted
    org / safetensors / homoglyph / file-probe) — there is NO bypass.
    This guarantees that a manifest from a malicious peer cannot
    smuggle in an unverified repo just because it's in "import" mode.

    Body: {"manifest": {manifest_version, entries: [...]},
           "confirm_unverified": bool  # passed through to each install}

    Response:
        {success, attempted: N, succeeded: [...], failed: [{hf_id, reason}, ...]}
    """
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        body = request.get_json(silent=True) or {}
        manifest = body.get('manifest') or {}
        entries = manifest.get('entries') or []
        confirm_unverified = bool(body.get('confirm_unverified'))
        if not isinstance(entries, list) or not entries:
            return jsonify({"error": "manifest.entries must be a non-empty list"}), 400

        # Re-dispatch each entry through admin_models_hub_install via
        # Flask's test_client so all gates fire identically — no
        # duplicated gate logic, no parallel code path.
        succeeded = []
        failed = []
        with app.test_client() as client:
            for e in entries:
                hf_id = (e.get('hf_id') or '').strip()
                category = (e.get('category') or '').lower().strip()
                if not hf_id or not category:
                    failed.append({'hf_id': hf_id, 'reason': 'missing hf_id/category'})
                    continue
                payload = {
                    'hf_id': hf_id,
                    'category': category,
                    'name': e.get('name'),
                    'purposes': e.get('purposes') or [],
                    'languages': e.get('languages') or [],
                    'confirm_unverified': confirm_unverified,
                }
                # test_client hits the live route — preserves every
                # gate (trusted-org, safetensors, homoglyph, file-probe,
                # capability seeding, load probe, optional challenge).
                r = client.post(
                    '/api/admin/models/hub/install',
                    json=payload,
                    headers={
                        # Preserve the local-only gate by forwarding
                        # the requesting client's remote addr context.
                        'X-Forwarded-For': request.remote_addr or '127.0.0.1',
                    },
                )
                if r.status_code == 200:
                    succeeded.append(hf_id)
                else:
                    try:
                        err = r.get_json() or {}
                    except Exception:
                        err = {}
                    failed.append({
                        'hf_id': hf_id,
                        'status': r.status_code,
                        'reason': err.get('error') or err.get('message') or 'install failed',
                    })
        return jsonify({
            'success': True,
            'attempted': len(entries),
            'succeeded': succeeded,
            'failed': failed,
        })
    except Exception as e:
        logging.warning(f"manifest import failed: {e}")
        return jsonify({"error": str(e)}), 500


# ═══════════════════════════════════════════════════════════════════════
# Provider Management Admin API  (/api/admin/providers/*)
# Exposes HARTOS ProviderRegistry + Gateway + EfficiencyMatrix
#
# Every endpoint below routes the "is the provider integration actually
# loaded?" check through core.optional_import so silent failures (missing
# openai / anthropic wheel, bad import chain, stale python-embed snapshot)
# land in /api/admin/diag/degradations.  Previously each endpoint had an
# inline `except ImportError: return 503` that swallowed the reason —
# operators had no way to tell "is my OpenAI key wrong" apart from "did
# the openai wheel fail to install in the frozen build".  The helpers
# below return (module, None) on success or (None, 503_response) on
# failure; caller unpacks and either short-circuits or proceeds.
# ═══════════════════════════════════════════════════════════════════════

def _providers_registry():
    """Resolve integrations.providers.registry via optional_import.

    Returns:
        (module, None) on success so caller can call mod.get_registry().
        (None, (jsonify(...), 503)) on import failure — caller returns
        the tuple directly so Flask emits the 503 and the degradation is
        recorded in /api/admin/diag/degradations.
    """
    from core.optional_import import optional_import
    mod = optional_import(
        'integrations.providers.registry',
        reason='Provider admin API — registry CRUD',
    )
    if mod is None:
        return None, (jsonify({'error': 'Provider gateway not available'}), 503)
    return mod, None


def _providers_gateway():
    """Resolve integrations.providers.gateway via optional_import (same
    contract as _providers_registry — see its docstring)."""
    from core.optional_import import optional_import
    mod = optional_import(
        'integrations.providers.gateway',
        reason='Provider admin API — runtime dispatch / stats',
    )
    if mod is None:
        return None, (jsonify({'error': 'Provider gateway not available'}), 503)
    return mod, None


def _providers_matrix():
    """Resolve integrations.providers.efficiency_matrix via optional_import
    (same contract as _providers_registry)."""
    from core.optional_import import optional_import
    mod = optional_import(
        'integrations.providers.efficiency_matrix',
        reason='Provider admin API — efficiency leaderboard',
    )
    if mod is None:
        return None, (jsonify({'error': 'Efficiency matrix not available'}), 503)
    return mod, None


def _wamp_mod():
    """Resolve the embedded wamp_router module via optional_import.

    Same (module, None) / (None, error_response) contract as the provider
    helpers.  Routes a failed wamp_router import (missing file, port-
    conflict during module-init, circular import) into the degradations
    registry — previously every WAMP HTTP bridge / status / ticket call
    would silently 503 with no operator signal.
    """
    from core.optional_import import optional_import
    mod = optional_import(
        'wamp_router',
        reason='Embedded WAMP v2 router (realtime push bridge)',
    )
    if mod is None:
        return None, (jsonify({'error': 'WAMP router not available'}), 503)
    return mod, None


@app.route('/api/admin/providers', methods=['GET'])
def admin_providers_list():
    """List all providers with status, model count, and capabilities."""
    mod, err = _providers_registry()
    if err:
        return err
    try:
        reg = mod.get_registry()
        category = request.args.get('category', '')
        ptype = request.args.get('type', '')  # api, affiliate, local

        providers = reg.list_all()
        if category:
            providers = [p for p in providers if category in p.categories]
        if ptype:
            providers = [p for p in providers if p.provider_type == ptype]

        result = []
        for p in providers:
            result.append({
                'id': p.id,
                'name': p.name,
                'provider_type': p.provider_type,
                'url': p.url,
                'categories': p.categories,
                'tags': p.tags,
                'model_count': len(p.models),
                'api_key_set': p.has_api_key(),
                'enabled': p.enabled,
                'healthy': p.healthy,
                'commission_pct': p.commission_pct,
                'commission_type': p.commission_type,
                'avg_latency_ms': p.avg_latency_ms,
            })
        return jsonify({'success': True, 'providers': result})
    except Exception as e:
        logging.warning(f"admin_providers_list runtime error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/providers/<provider_id>', methods=['GET'])
def admin_providers_get(provider_id):
    """Get full provider details including all models and pricing."""
    mod, err = _providers_registry()
    if err:
        return err
    try:
        reg = mod.get_registry()
        p = reg.get(provider_id)
        if not p:
            return jsonify({'error': 'Provider not found'}), 404
        data = p.to_dict()
        data['api_key_set'] = p.has_api_key()
        return jsonify({'success': True, 'provider': data})
    except Exception as e:
        logging.warning(f"admin_providers_get runtime error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/providers/<provider_id>/api-key', methods=['POST'])
def admin_providers_set_key(provider_id):
    """Set or update API key for a provider."""
    mod, err = _providers_registry()
    if err:
        return err
    try:
        data = request.get_json(force=True)
        api_key = data.get('api_key', '')
        if not api_key:
            return jsonify({'error': 'api_key required'}), 400
        reg = mod.get_registry()
        success = reg.set_api_key(provider_id, api_key)
        if not success:
            return jsonify({'error': 'Provider not found or no env_key configured'}), 404
        return jsonify({'success': True})
    except Exception as e:
        logging.warning(f"admin_providers_set_key runtime error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/providers/<provider_id>/api-key', methods=['DELETE'])
def admin_providers_remove_key(provider_id):
    """Remove API key for a provider."""
    mod, err = _providers_registry()
    if err:
        return err
    try:
        reg = mod.get_registry()
        p = reg.get(provider_id)
        if not p or not p.env_key:
            return jsonify({'error': 'Provider not found'}), 404
        os.environ.pop(p.env_key, None)
        p.api_key_set = False
        reg.save()
        return jsonify({'success': True})
    except Exception as e:
        logging.warning(f"admin_providers_remove_key runtime error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/providers/<provider_id>/test', methods=['POST'])
def admin_providers_test(provider_id):
    """Test provider connection with a simple request."""
    mod, err = _providers_gateway()
    if err:
        return err
    try:
        gw = mod.get_gateway()
        result = gw.generate(
            'Say "hello" in one word.',
            model_type='llm',
            provider_id=provider_id,
            max_tokens=10,
            temperature=0,
        )
        return jsonify({
            'success': result.success,
            'content': result.content[:200] if result.content else '',
            'latency_ms': round(result.latency_ms, 1),
            'cost_usd': result.cost_usd,
            'error': result.error,
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/admin/providers/<provider_id>/enable', methods=['POST'])
def admin_providers_enable(provider_id):
    """Enable or disable a provider."""
    mod, err = _providers_registry()
    if err:
        return err
    try:
        data = request.get_json(force=True)
        enabled = data.get('enabled', True)
        reg = mod.get_registry()
        p = reg.get(provider_id)
        if not p:
            return jsonify({'error': 'Provider not found'}), 404
        p.enabled = enabled
        reg.save()
        return jsonify({'success': True, 'enabled': p.enabled})
    except Exception as e:
        logging.warning(f"admin_providers_enable runtime error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/providers/gateway/stats', methods=['GET'])
def admin_providers_gateway_stats():
    """Get gateway usage stats: total cost, requests, recent activity."""
    mod, err = _providers_gateway()
    if err:
        return err
    try:
        return jsonify({'success': True, **mod.get_gateway().get_stats()})
    except Exception as e:
        logging.warning(f"admin_providers_gateway_stats runtime error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/providers/efficiency/leaderboard', methods=['GET'])
def admin_providers_leaderboard():
    """Get efficiency leaderboard — ranked by speed, quality, cost."""
    mod, err = _providers_matrix()
    if err:
        return err
    try:
        model_type = request.args.get('model_type', 'llm')
        sort_by = request.args.get('sort_by', 'efficiency')
        matrix = mod.get_matrix()
        entries = matrix.get_leaderboard(model_type, sort_by)
        from dataclasses import asdict
        return jsonify({
            'success': True,
            'leaderboard': [asdict(e) for e in entries[:20]],
            'summary': matrix.get_matrix_summary(),
        })
    except Exception as e:
        logging.warning(f"admin_providers_leaderboard runtime error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/providers/capabilities', methods=['GET'])
def admin_providers_capabilities():
    """Get capabilities summary: what model types Nunba can serve right now."""
    mod, err = _providers_registry()
    if err:
        return err
    try:
        return jsonify({
            'success': True,
            'capabilities': mod.get_registry().get_capabilities_summary(),
        })
    except Exception as e:
        logging.warning(f"admin_providers_capabilities runtime error: {e}")
        return jsonify({'error': str(e)}), 500


# ═══════════════════════════════════════════════════════════════════════
# Resource Monitor Admin API  (/api/admin/resources/*)
# ═══════════════════════════════════════════════════════════════════════

@app.route('/api/admin/resources/stats', methods=['GET'])
def admin_resources_stats():
    """Get current resource usage: CPU, RAM, GPU, throttle, mode."""
    from core.optional_import import optional_import
    _gov_mod = optional_import(
        'core.resource_governor',
        reason='Resource governor (CPU/RAM throttle, mode controller)',
    )
    if _gov_mod is None:
        return jsonify({'error': 'Resource governor not available'}), 503
    try:
        gov = _gov_mod.get_governor()
        stats = gov.get_stats()
        # Add live system metrics — both psutil (host process metrics) and
        # vram_manager (GPU telemetry) are optional, logged once via the
        # same registry that powers /api/admin/diag/degradations.
        _psutil = optional_import(
            'psutil', reason='Host CPU/RAM live metrics',
        )
        if _psutil is not None:
            stats['cpu_percent'] = _psutil.cpu_percent(interval=None)
            mem = _psutil.virtual_memory()
            stats['ram_used_gb'] = round(mem.used / (1024**3), 1)
            stats['ram_total_gb'] = round(mem.total / (1024**3), 1)
            stats['ram_percent'] = mem.percent
        _vram_mod = optional_import(
            'integrations.service_tools.vram_manager',
            reason='GPU VRAM telemetry (HARTOS service tool)',
        )
        if _vram_mod is not None:
            try:
                stats['gpu'] = _vram_mod.vram_manager.detect_gpu()
            except Exception as ge:
                # The MODULE imported but the live probe failed (driver
                # crash, no CUDA at runtime).  Surface as a soft warning
                # in the response, not a 503 — base stats are still useful.
                stats['gpu_error'] = str(ge)
        return jsonify({'success': True, **stats})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/status', methods=["GET"])
def status():
    response = {
        'status': 'operational',
    }
    # Only expose device_id and log_file to localhost requests (D5 fix)
    if _is_local_request():
        response['device_id'] = DEVICE_ID
        response['log_file'] = args.log_file
    return jsonify(response), 200


# ────────────────────────────────────────────────────────────────
# Coverage helper endpoints (loopback-only, coverage-run only).
#
# These are registered ONLY when the process was launched with
# `coverage run …` (which sets up a Coverage instance as the
# current tracer).  Windows `taskkill /F` bypasses atexit, so the
# only reliable way to collect a `.coverage.*` fragment is an HTTP
# call that flushes + exits in the middle of a Python instruction.
#
# Gated by `NUNBA_COVERAGE_ENABLED=1` in the env AND by
# `_is_local_request()` (loopback only) so these cannot be hit
# from a network peer.
# ────────────────────────────────────────────────────────────────
if os.environ.get('NUNBA_COVERAGE_ENABLED') == '1':
    @app.route('/_debug/coverage/flush', methods=['GET', 'POST'])
    def _cov_flush():  # pragma: no cover — loopback helper
        if not _is_local_request():
            return jsonify({'error': 'loopback only'}), 403
        try:
            import coverage
            cov = coverage.Coverage.current()
            if cov is not None:
                cov.save()
                return jsonify({'ok': True, 'flushed': True})
            return jsonify({'ok': False, 'error': 'no active Coverage instance'}), 500
        except Exception as e:
            return jsonify({'ok': False, 'error': str(e)}), 500

    @app.route('/_debug/coverage/shutdown', methods=['GET', 'POST'])
    def _cov_shutdown():  # pragma: no cover — loopback helper
        if not _is_local_request():
            return jsonify({'error': 'loopback only'}), 403
        try:
            import coverage
            cov = coverage.Coverage.current()
            if cov is not None:
                cov.save()
        except Exception:
            pass
        # Schedule process exit AFTER the HTTP response has flushed.
        # A short Timer avoids killing mid-response and losing the
        # 200 that the client needs to confirm shutdown.
        import threading as _t
        _t.Timer(0.25, lambda: os._exit(0)).start()
        return jsonify({'ok': True, 'shutdown': True})


@app.route('/backend/watchdog', methods=["GET"])
def watchdog_status():
    """Return the LangChain watchdog status."""
    langchain_port = 6777
    process_alive = (
        _langchain_process is not None
        and _langchain_process.poll() is None
    )
    return jsonify({
        'watchdog_active': _watchdog_restart_count < _WATCHDOG_MAX_RESTARTS,
        'restart_count': _watchdog_restart_count,
        'max_restarts': _WATCHDOG_MAX_RESTARTS,
        'langchain_process_alive': process_alive,
        'langchain_process_pid': _langchain_process.pid if process_alive else None,
        'langchain_port': langchain_port,
        'port_in_use': _is_port_in_use(langchain_port),
    })


@app.route('/backend/health', methods=["GET"])
def backend_health():
    """Return backend + GPU tier diagnostics for the chat UI badge.

    Surfaces the speculation-capability boundary so 8GB-GPU laptops can SEE
    why chat is ~1.3-2.0s slower per reply (commit 2acf21a raised the
    draft-boot threshold from >=8GB to >=10GB VRAM to leave room for TTS).

    Tier ladder (matches LlamaConfig.should_boot_draft + VRAMManager budget):
      ultra    >= 24 GB total VRAM  (70B-class models viable)
      full     >= 10 GB total VRAM  (draft + main speculative decoding)
      standard  4-10 GB total VRAM  (main-only, no speculation)
      none     no CUDA / < 4 GB     (CPU or tiny integrated GPU)
    """
    gpu_name = None
    vram_total = 0.0
    vram_free = 0.0
    cuda_available = False
    speculation_enabled = False

    # VRAMManager is the single source of truth for GPU state (shared with
    # TTS, vision, llama). Fall back to 'none' tier if import fails.
    try:
        from integrations.service_tools.vram_manager import vram_manager
        gpu_info = vram_manager.detect_gpu() or {}
        gpu_name = gpu_info.get('name')
        cuda_available = bool(gpu_info.get('cuda_available'))
        vram_total = float(vram_manager.get_total_vram() or 0.0)
        vram_free = float(vram_manager.get_free_vram() or 0.0)
    except Exception as e:
        logging.debug(f"/backend/health: VRAM detection unavailable: {e}")

    try:
        from llama.llama_config import LlamaConfig
        speculation_enabled = bool(LlamaConfig.should_boot_draft())
    except Exception as e:
        logging.debug(f"/backend/health: should_boot_draft unavailable: {e}")
        # Fall back to raw threshold if the helper errors.
        speculation_enabled = cuda_available and vram_total >= 10.0

    # Tier classification — single source of truth in core.gpu_tier.
    # Removed the inline 24/10/4 threshold ladder that used to live here
    # (drifted from the frontend GpuTierBadge.jsx hard-coded copy).  Any
    # future threshold change happens ONCE in core.gpu_tier and the
    # frontend re-fetches via /api/v1/system/tiers.
    from core.gpu_tier import classify as _classify_tier
    gpu_tier = _classify_tier(vram_total, cuda_available).value

    return jsonify({
        'status': 'operational',
        'gpu_tier': gpu_tier,
        'gpu_name': gpu_name,
        'cuda_available': cuda_available,
        'vram_total_gb': round(vram_total, 2),
        'vram_free_gb': round(vram_free, 2),
        'speculation_enabled': speculation_enabled,
    }), 200


@app.route('/api/v1/system/tiers', methods=['GET'])
def system_tiers():
    """Return the canonical GPU tier table.

    Frontend consumers (GpuTierBadge.jsx) MUST fetch this on mount instead
    of hard-coding thresholds — that's the whole point of the refactor.
    Public endpoint (no auth gate) because the table contains no
    secrets and the chat UI needs it on the first render path.

    Cached aggressively at the CDN/proxy via Cache-Control because the
    table only changes when we ship a release.
    """
    from core.gpu_tier import tier_table
    response = jsonify({
        'tiers': tier_table(),
    })
    response.headers['Cache-Control'] = 'public, max-age=3600'
    return response, 200

def _is_private_ip(hostname):
    """Block SSRF by checking if resolved IP is private/internal."""
    try:
        ip = ipaddress.ip_address(socket.gethostbyname(hostname))
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
    except (socket.gaierror, ValueError):
        return True  # Block if can't resolve

# Image proxy endpoint to fetch external images (avoids CORS issues)
@app.route('/api/image-proxy')
def image_proxy():
    """Proxy external images to avoid CORS issues and provide fallback"""
    import urllib.parse

    from flask import send_from_directory

    image_url = request.args.get('url', '')
    if not image_url:
        # Return fallback image — but tolerate a missing static_dir
        # (dev worktree without a built React bundle, or a frozen
        # install where the media directory layout differs).  Without
        # this guard `os.listdir(missing)` raises FileNotFoundError
        # which bubbles up as 500 and fails J98 "never 500 on bad
        # input" contract.
        static_dir = os.path.join(LANDING_PAGE_BUILD_DIR, 'static', 'media')
        try:
            fallback_files = [f for f in os.listdir(static_dir) if f.startswith('AgentPoster')]
        except OSError:
            fallback_files = []
        if fallback_files:
            return send_from_directory(static_dir, fallback_files[0])
        return jsonify({'error': 'No image URL provided'}), 400

    # Scheme + SSRF validation MUST fail hard before we fall into the
    # network-error fallback path below — otherwise `file:///etc/passwd`
    # produces a 200 with a decoy image, masking the SSRF attempt
    # entirely (J98 red-product).  Validate up-front, outside the
    # try/except that handles transient network failures.
    parsed = urllib.parse.urlparse(image_url)
    if parsed.scheme not in ('http', 'https'):
        return jsonify({
            'error': 'Only http/https URLs are allowed',
            'scheme': parsed.scheme or '(empty)',
        }), 400

    hostname = parsed.hostname
    if not hostname or _is_private_ip(hostname):
        return jsonify({'error': 'Access to internal networks is not allowed'}), 403

    try:
        # Fetch the image
        response = requests.get(image_url, timeout=10, stream=True)
        response.raise_for_status()

        # Get content type
        content_type = response.headers.get('Content-Type', 'image/png')

        # Return the image
        return response.content, 200, {'Content-Type': content_type}
    except Exception as e:
        logging.warning(f"Image proxy failed for {image_url}: {e}")
        # Return fallback image ONLY on transient network / server errors
        # (the scheme + SSRF gates above have already rejected malicious
        # inputs, so anything landing here is a remote-host issue).
        static_dir = os.path.join(LANDING_PAGE_BUILD_DIR, 'static', 'media')
        try:
            fallback_files = [f for f in os.listdir(static_dir) if f.startswith('AgentPoster')]
            if fallback_files:
                return send_from_directory(static_dir, fallback_files[0])
        except OSError:
            pass
        return jsonify({'error': 'Failed to fetch image'}), 502

# ============== Register API routes BEFORE catch-all ==============
# Register chatbot routes (includes /chat, /prompts, /tts, /custom_gpt)
_splash('Registering routes...')
logging.info("Registering chatbot routes...")
chatbot_routes.register_routes(app)

# Debug route to list all registered routes
@app.route('/debug/routes')
@require_local_or_token
def debug_routes():
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            'endpoint': rule.endpoint,
            'methods': list(rule.methods - {'OPTIONS', 'HEAD'}),
            'rule': rule.rule
        })
    return jsonify(sorted(routes, key=lambda x: x['rule']))

# Simple test route
@app.route('/test-api')
def test_api():
    return jsonify({'status': 'API routes working', 'message': 'This is a test endpoint'})

# API endpoints that should NOT be caught by the landing page handler
API_ENDPOINTS = {
    'api', 'probe', 'execute', 'screenshot', 'indicator', 'llm_control_status',
    'status', 'logs', 'custom_gpt', 'tts', 'crash-report', 'llama',
    'ai', 'health', 'prompts', 'agents', 'chat', 'backend', 'media'
}

# Landing-Page routes - redirect to hevolve.ai when online, /local when offline
@app.route('/')
def serve_landing_page_root():
    """
    Serve the main page:
    - Online: Redirect to hevolve.ai for full cloud experience
    - Offline: Redirect to /local so React SPA activates guest login flow
    """
    from flask import redirect

    # Check if user wants local mode (via query param or setting)
    force_local = request.args.get('local', '').lower() in ('1', 'true', 'yes')

    if not force_local:
        try:
            import requests as req
            req.head('https://hevolve.ai', timeout=2)
            return redirect('https://hevolve.ai', code=302)
        except Exception:
            pass

    # Offline: redirect to /local so the React SPA sees the /local path
    # and activates guest login mode + local-only assets
    return redirect('/local', code=302)


def _inject_guest_id_into_html(html_text: str) -> str:
    """Inject `window.__NUNBA_GUEST_ID__` into an index.html at request
    time so the React SPA can read the hardware-derived guest id
    synchronously (no API round-trip, no race with first-paint).

    The frontend fallback chain uses this AFTER localStorage (so it
    only kicks in when localStorage was wiped — exactly the WebView2
    UserDataFolder-wipe scenario we're protecting against).

    Idempotent: if __NUNBA_GUEST_ID__ is already present (e.g. the
    builder pre-injected it) we skip.  Never crashes the response —
    worst case the frontend sees no global and falls through to
    /api/guest-id or plain 'guest'.
    """
    if not GUEST_ID:
        return html_text
    try:
        if 'window.__NUNBA_GUEST_ID__' in html_text:
            return html_text
        # JSON-encode the id so a malicious override can't break out
        # of the string literal (defence-in-depth; derivation is SHA
        # truncation so characters are always [0-9a-f_]).
        import json as _json
        safe_id = _json.dumps(GUEST_ID)
        snippet = (
            f"<script>window.__NUNBA_GUEST_ID__={safe_id};</script>"
        )
        # Inject just before </head>; fall back to prepending if
        # </head> isn't present for any reason.
        idx = html_text.lower().find('</head>')
        if idx == -1:
            return snippet + html_text
        return html_text[:idx] + snippet + html_text[idx:]
    except Exception as _ie:  # noqa: BLE001 — never let injection break render
        logging.debug(f"guest-id injection skipped: {_ie}")
        return html_text


def _render_spa_index(build_dir: str):
    """Render the SPA index.html with guest-id injection.

    Used by every route that serves index.html (`/local`, the `/` SPA
    fallback, and the 404 handler) so the injected global is present
    regardless of which path the webview hit first.

    Returns `None` if the SPA bundle is missing or unreadable.  When
    returning None, logs a structured diagnostic so a failing frozen
    install (e.g. LANDING_PAGE_BUILD_DIR resolved to the wrong path on
    Program Files x86) is visible in `gui_app.log` / `server.log`
    instead of silently falling back to a boot-stub page.
    """
    from flask import Response
    index_path = os.path.join(build_dir, 'index.html')
    if not os.path.exists(index_path):
        # Diagnose: which build_dir was tried, what's in its parent, and
        # whether the parent exists at all.  Don't spam on every request —
        # use a module-level sentinel so we only log once per missing path.
        try:
            _miss_key = '_render_spa_index_missed_paths'
            _missed = globals().setdefault(_miss_key, set())
            if index_path not in _missed:
                _missed.add(index_path)
                _parent = os.path.dirname(index_path)
                _exists_parent = os.path.isdir(_parent)
                try:
                    _contents = (os.listdir(_parent)[:20]
                                 if _exists_parent else [])
                except OSError:
                    _contents = ['<listdir-failed>']
                logging.warning(
                    f"_render_spa_index: index.html NOT FOUND at {index_path} "
                    f"(parent_exists={_exists_parent}, "
                    f"parent_contents={_contents}). "
                    f"Caller will fall back to placeholder HTML.",
                )
        except Exception:
            pass
        return None
    try:
        with open(index_path, encoding='utf-8') as fh:
            html_text = fh.read()
    except Exception as e:
        logging.warning(
            f"_render_spa_index: read failed for {index_path}: "
            f"{type(e).__name__}: {e}",
        )
        return None
    html_text = _inject_guest_id_into_html(html_text)
    return Response(html_text, 200, content_type='text/html; charset=utf-8')


@app.route('/local')
def serve_local_page():
    """Always serve local page (for offline use or testing)"""
    from flask import Response
    rendered = _render_spa_index(LANDING_PAGE_BUILD_DIR)
    if rendered is not None:
        return rendered
    return Response(
        '<html><body style="background:#0F0E17;color:#fff;font-family:sans-serif;display:flex;'
        'align-items:center;justify-content:center;height:100vh;margin:0">'
        '<div style="text-align:center"><h1>Nunba</h1><p>React app not built yet.</p>'
        '<p>Run <code style="background:#333;padding:4px 8px;border-radius:4px">'
        'cd landing-page &amp;&amp; npm run build</code></p>'
        '<p>Or use <a href="http://localhost:3000" style="color:#6C63FF">'
        'localhost:3000</a> (dev server)</p></div></body></html>',
        200, content_type='text/html'
    )


@app.route('/api/connectivity')
def connectivity_check():
    """Fast connectivity check for the webview JS monitor.

    Returns JSON with online status. Uses the cached check_internet_connection()
    from chatbot_routes to avoid repeated timeouts.
    """
    try:
        from routes.chatbot_routes import check_internet_connection
        online = check_internet_connection()
    except ImportError:
        online = False
    return jsonify({'online': online})



# ─── Local SSE Event Bus ───────────────────────────────────────────────
# In-process push transport for flat/desktop topology where the central
# Crossbar router (aws_rasa.hertzai.com) is unreachable.
# Cloud/regional deployments use Crossbar WAMP as the primary transport;
# this SSE endpoint is the LOCAL FALLBACK only.
import queue as _queue
import threading as _threading

_sse_clients = {}   # {user_id: [(Queue, connect_time), ...]}
_sse_lock = _threading.Lock()
_SSE_CLIENT_TTL = 3600  # 1 hour max connection lifetime


def _cleanup_dead_sse_clients():
    """Remove SSE client queues that have exceeded the max connection TTL."""
    now = time.time()
    with _sse_lock:
        for uid in list(_sse_clients.keys()):
            clients = _sse_clients.get(uid, [])
            _sse_clients[uid] = [
                (q, ts) for q, ts in clients
                if now - ts < _SSE_CLIENT_TTL
            ]
            if not _sse_clients[uid]:
                del _sse_clients[uid]


def broadcast_sse_event(event_type, data, user_id=None):
    """Broadcast an SSE event to locally connected clients.

    Used by realtime.py as a local fallback when Crossbar WAMP is unavailable.
    If *user_id* is provided, only sends to that user's queues.
    If *user_id* is None, broadcasts to ALL connected clients.

    Also publishes into the embedded WAMP router (if running) so
    crossbarWorker.js subscribers receive the event in real time.
    """
    # Mirror to embedded WAMP router for crossbarWorker.js subscribers
    try:
        from wamp_router import is_running, publish_local
        if is_running() and user_id:
            # Map event types to the WAMP topics crossbarWorker.js subscribes to
            wamp_data = dict(data) if isinstance(data, dict) else {'raw': data}
            wamp_data['type'] = event_type
            if event_type == 'tts' or (isinstance(data, dict) and data.get('action') == 'TTS'):
                publish_local(f'com.hertzai.pupit.{user_id}', wamp_data)
            elif event_type == 'notification':
                publish_local(f'com.hertzai.hevolve.social.{user_id}', wamp_data)
            else:
                publish_local(f'com.hertzai.hevolve.chat.{user_id}', wamp_data)
    except Exception:
        pass  # WAMP router not available — SSE is the primary transport

    import json
    msg = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
    now = time.time()
    logging.info(f"broadcast_sse_event: type={event_type}, user_id={user_id}, "
                 f"clients={list(_sse_clients.keys())}, "
                 f"client_count={sum(len(v) for v in _sse_clients.values())}")
    with _sse_lock:
        if user_id is not None:
            clients = _sse_clients.get(user_id, [])
            alive = []
            for q, ts in clients:
                if now - ts >= _SSE_CLIENT_TTL:
                    continue
                try:
                    q.put_nowait(msg)
                    alive.append((q, ts))
                except _queue.Full:
                    pass
            if alive:
                _sse_clients[user_id] = alive
            else:
                _sse_clients.pop(user_id, None)
        else:
            empty_users = []
            for uid, clients in _sse_clients.items():
                alive = []
                for q, ts in clients:
                    if now - ts >= _SSE_CLIENT_TTL:
                        continue
                    try:
                        q.put_nowait(msg)
                        alive.append((q, ts))
                    except _queue.Full:
                        pass
                if alive:
                    _sse_clients[uid] = alive
                else:
                    empty_users.append(uid)
            for uid in empty_users:
                _sse_clients.pop(uid, None)


# Expose on __main__ so HARTOS can find it via `import __main__`.
# In frozen builds, __main__ is app.py (Nunba.exe). main.py is loaded as
# a module by _import_main_app(). Without this, HARTOS's
# `__main__.broadcast_sse_event` is undefined and SSE events are silently dropped.
try:
    import __main__ as _main_ref
    if not hasattr(_main_ref, 'broadcast_sse_event'):
        _main_ref.broadcast_sse_event = broadcast_sse_event
except Exception:
    pass


@app.route('/publish', methods=['POST'])
def wamp_http_bridge():
    """HTTP bridge for WAMP publish — compatible with crossbarhttp3 protocol.

    Accepts POST with JSON body: {topic: str, args: list, kwargs: dict}
    Publishes into the embedded WAMP router so all WebSocket subscribers receive it.
    This replaces the Crossbar.io HTTP Bridge Service for local/bundled mode.

    Import failures land in /api/admin/diag/degradations via _wamp_mod —
    previously a missing wamp_router.py (bundle drift, port-conflict
    during module import) would silently 503 every realtime publish with
    no hint to the operator.
    """
    wmod, err = _wamp_mod()
    if err:
        return err
    try:
        if not wmod.is_running():
            return jsonify({'error': 'WAMP router not running'}), 503
        data = request.get_json(silent=True) or {}
        topic = data.get('topic', '')
        args = data.get('args', [])
        kwargs = data.get('kwargs', {})
        if not topic:
            return jsonify({'error': 'Missing topic'}), 400
        # crossbarhttp3 sends args as a single JSON string; unwrap it
        if isinstance(args, str):
            try:
                args = [json.loads(args)]
            except (json.JSONDecodeError, TypeError):
                args = [args]
        wmod.publish_local(topic, args, kwargs)
        return jsonify({'id': None}), 200
    except Exception as e:
        logging.warning(f"WAMP HTTP bridge error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/wamp/status')
@require_local_or_token
def wamp_router_status():
    """Return embedded WAMP router health and statistics."""
    wmod, err = _wamp_mod()
    if err:
        # Preserve prior response shape for the /api/wamp/status endpoint
        # (frontend expects {running, error} not {error}).
        return jsonify({'running': False, 'error': 'module not available'}), 503
    try:
        return jsonify(wmod.get_stats())
    except Exception as e:
        return jsonify({'running': False, 'error': str(e)}), 500


@app.route('/api/wamp/ticket')
@require_local_or_token
def wamp_ticket():
    """Return WAMP ticket for authenticated clients (LAN mode).

    Protected by require_local_or_token — only local requests or
    requests with a valid API token can get the WAMP ticket.
    Returns empty ticket when auth is not required (localhost mode).
    """
    wmod, _err = _wamp_mod()
    if wmod is None:
        # Preserve prior contract: empty ticket on unavailability (frontend
        # falls back to LAN mode w/o auth). Degradation already recorded.
        return jsonify({'ticket': ''})
    try:
        return jsonify({'ticket': wmod.get_wamp_ticket()})
    except Exception:
        return jsonify({'ticket': ''})


@app.route('/api/jslog', methods=['POST'])
def jslog():
    """Receive console.log from WebView2 and write to frozen_debug.log."""
    data = request.get_json(silent=True) or {}
    msg = data.get('msg', '')
    level = data.get('level', 'log')
    logging.info(f"[JS:{level}] {msg}")
    return '', 204


@app.route('/api/social/events/stream')
def sse_event_stream():
    """Local SSE endpoint — fallback transport for flat/desktop topology.

    Frontend connects here only when the Crossbar worker reports disconnected.
    Requires a valid JWT token as ``?token=`` query parameter.
    """
    logging.info(f"SSE: client connecting (args={dict(request.args)})")
    from flask import Response
    from flask import jsonify as _jsonify
    from flask import request as flask_request

    token = flask_request.args.get('token', '').strip()

    # Bundled/local mode: allow SSE without JWT (same machine, no auth needed for TTS push)
    _is_local = bool(os.environ.get('NUNBA_BUNDLED') or getattr(sys, 'frozen', False))
    if not token and not _is_local:
        return _jsonify({"error": "Missing token query parameter"}), 401

    uid = None
    if token:
        try:
            from integrations.social.auth import decode_jwt
            payload = decode_jwt(token)
            uid = payload.get('user_id')
        except Exception:
            if not _is_local:
                return _jsonify({"error": "Invalid or expired token"}), 401
    if not uid:
        uid = flask_request.args.get('user_id', 'guest') if _is_local else None
    if not uid:
        return _jsonify({"error": "Invalid or expired token"}), 401

    _cleanup_dead_sse_clients()

    client_queue = _queue.Queue(maxsize=50)
    connect_time = time.time()
    with _sse_lock:
        _sse_clients.setdefault(uid, []).append((client_queue, connect_time))

    def generate():
        yield "data: {\"type\": \"connected\"}\n\n"
        try:
            while True:
                try:
                    msg = client_queue.get(timeout=30)
                    yield msg
                except _queue.Empty:
                    yield ": heartbeat\n\n"
        except GeneratorExit:
            pass
        finally:
            with _sse_lock:
                user_queues = _sse_clients.get(uid, [])
                _sse_clients[uid] = [
                    (q, ts) for q, ts in user_queues if q is not client_queue
                ]
                if not _sse_clients.get(uid):
                    _sse_clients.pop(uid, None)

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            # NOTE: Do NOT set 'Connection: keep-alive' — it's a hop-by-hop header
            # forbidden by PEP 3333 and crashes Waitress on every request.
        }
    )


@app.route('/s/<token>')
def share_redirect(token):
    """Serve OG-tagged HTML for social crawlers, redirect browsers to SPA."""
    import requests as req
    from flask import redirect, render_template

    # Resolve share token via social API (local)
    try:
        resp = req.get(f'http://localhost:5000/api/social/share/{token}', timeout=3)
        data = resp.json()
        if data.get('success') and data.get('data'):
            link_data = data['data']
            og = link_data.get('og', {})
            redirect_url = link_data.get('redirect_url', '/social')

            # Fire view count (async, don't block)
            try:
                req.post(f'http://localhost:5000/api/social/share/{token}/view', timeout=1)
            except Exception:
                pass

            base_url = request.host_url.rstrip('/')
            og_image = og.get('image', '')
            if og_image and not og_image.startswith('http'):
                og_image = f'{base_url}{og_image}'

            return render_template('share_og.html',
                og_title=og.get('title', 'Nunba'),
                og_description=og.get('description', ''),
                og_image=og_image or f'{base_url}/static/og-default.png',
                og_type=og.get('type', 'website'),
                og_url=f'{base_url}/s/{token}',
                redirect_url=redirect_url,
            )
    except Exception as e:
        logging.debug(f"Share redirect failed for {token}: {e}")

    # Fallback: redirect to SPA which handles /s/:token client-side
    return redirect(f'/social?share={token}', code=302)


def serve_static_file(path):
    """Serve static files from the Hevolve build directory"""
    from flask import send_from_directory
    file_path = os.path.join(LANDING_PAGE_BUILD_DIR, path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return send_from_directory(LANDING_PAGE_BUILD_DIR, path)
    # For client-side routing, serve index.html with guest-id injected.
    rendered = _render_spa_index(LANDING_PAGE_BUILD_DIR)
    if rendered is not None:
        return rendered
    return send_from_directory(LANDING_PAGE_BUILD_DIR, 'index.html')

# Static file routes (must be explicit to not conflict with API routes)
@app.route('/static/<path:path>')
def serve_static(path):
    """Serve static assets (JS, CSS, images)"""
    from flask import send_from_directory
    static_dir = os.path.join(LANDING_PAGE_BUILD_DIR, 'static')
    return send_from_directory(static_dir, path)

@app.route('/fonts/<path:path>')
def serve_fonts(path):
    """Serve font files"""
    from flask import send_from_directory
    fonts_dir = os.path.join(LANDING_PAGE_BUILD_DIR, 'fonts')
    return send_from_directory(fonts_dir, path)

# 404 handler - serve static files or index.html for client-side routing (SPA)
@app.errorhandler(404)
def handle_404(e):
    """Handle 404 errors by serving static files or React app for client-side routing"""
    from flask import send_from_directory
    path = request.path
    first_segment = path.split('/')[1] if len(path.split('/')) > 1 else ''

    # Return 404 for API routes
    if first_segment in API_ENDPOINTS:
        return jsonify({'error': 'API endpoint not found', 'path': path}), 404

    # Check if the file exists in the build directory (for root-level files like hevolve-widget.js)
    # Remove leading slash for file path
    file_path = path.lstrip('/')
    full_path = os.path.join(LANDING_PAGE_BUILD_DIR, file_path)

    if os.path.exists(full_path) and os.path.isfile(full_path):
        return send_from_directory(LANDING_PAGE_BUILD_DIR, file_path)

    # Serve React app for client-side routing (with guest-id injection)
    rendered = _render_spa_index(LANDING_PAGE_BUILD_DIR)
    if rendered is not None:
        return rendered
    return jsonify({'error': 'Not found', 'hint': 'React app not built. Run: cd landing-page && npm run build'}), 404

# Initialize crash reporting
if CRASH_REPORTER_AVAILABLE:
    try:
        init_crash_reporting(
            environment='development' if os.environ.get('FLASK_ENV') == 'development' else 'production',
            release="Nunba@1.0.0"
        )
        # Register crash reporter blueprint
        app.register_blueprint(create_crash_reporter_blueprint())
        logging.info("Crash reporting initialized")
    except Exception as e:
        logging.warning(f"Failed to initialize crash reporting: {e}")

_splash('Initializing services...')
# ============== Initialize hart-backend (Local SQLite Database) ==============
# Deferred to background thread — chat routes are already registered above,
# so the user can start chatting immediately. Social, agents, peer discovery
# initialize in the background while the user is already interacting.
#
# ── CRITICAL: `init_social(app)` is NOT synchronous-safe (2026-04-19) ──
# The HARTOS `init_social` implementation at integrations/social/__init__.py:329
# calls `init_agent_engine(app)` unconditionally, which transitively pulls
# autogen → openai → langchain → transformers → sympy.  In the frozen build
# this import chain can take 4+ minutes due to import-lock contention with the
# parallel `hartos-init` thread in `routes/hartos_backend_adapter.py`.
# Symptom: `_bg_import` (the thread that calls `exec_module(main.py)`) stalls
# for 240s+, `flask_app` never gets set, `_dynamic_wsgi_app` permanently
# dispatches to the boot stub `gui_app`, and the user sees "Server is running.
# App may have encountered an error" with 404s on the React bundle.
#
# Mitigation: ALL HARTOS blueprint registration (init_social, distributed
# agent, kids routes, etc.) is now deferred to `_deferred_social_init()` below
# so main.py's module-load finishes fast (<2s instead of 240s).  Frontend
# endpoints that fire on first boot (/chat, /backend/health, /api/admin/config/chat,
# /api/guest-id) are all defined directly on `app` above, so they work during
# the deferred-init window.
#
# This is a functional change but NOT user-visible — the social UI was always
# expected to lag behind chat-ready (see _deferred_social_init comment).


def _has_bp(name: str) -> bool:
    """Idempotency helper — True if a blueprint with this name is already
    registered on `app`.  Used to guard against double-registration when the
    deferred init path runs after any eager path that slipped through."""
    try:
        return name in getattr(app, 'blueprints', {})
    except Exception:
        return False


def _safe_register_bp(bp, *, name_hint: str = '') -> bool:
    """Idempotent wrapper for `app.register_blueprint`.  Returns True if
    the blueprint was registered this call, False if it was already present
    (or registration raised)."""
    try:
        bp_name = getattr(bp, 'name', None) or name_hint
        if bp_name and _has_bp(bp_name):
            return False
        app.register_blueprint(bp)
        return True
    except Exception as _bp_e:
        logging.debug(f"blueprint {name_hint or getattr(bp, 'name', '?')} register failed: {_bp_e}")
        return False


def _deferred_social_init():
    """Heavy social init in background — blueprint registration, DB,
    migrations, channels, agents.

    Blueprint registration (init_social + social_bp + distributed_agent +
    kids_media + upload + db + blueprint_registry) was moved here on
    2026-04-19 after the HARTOS `init_social` was found to transitively pull
    autogen/openai/langchain/transformers/sympy during its unconditional
    `init_agent_engine(app)` call (HARTOS integrations/social/__init__.py:329).
    Keeping those calls synchronous in main.py's module-load path stalled
    `_bg_import` for 240s+ and never let `flask_app` reach the dispatcher.

    Frontend boot-critical endpoints (/chat, /backend/health, /api/guest-id,
    /api/admin/config/chat) are defined directly on `app` above main.py's
    deferred-init block, so they answer correctly during this init window.
    HARTOS social endpoints (/api/social/*) return 404 until this function
    finishes — expected (frontend already silent-fails those calls)."""
    if not HARTOS_BACKEND_DIRECT:
        return
    try:
        # ── 1) Blueprint registration (moved from module-load path) ──
        # Each `if not _has_bp(...)` is an idempotency guard — if anything
        # ever registers a blueprint eagerly in the future, we won't crash
        # with "A blueprint named X is already registered".
        try:
            if init_social is not None:
                init_social(app)  # registers gamification_bp, mcp_bp, sharing_bp,
                                  # games_bp, discovery_bp, admin_bp, channel_user_bp,
                                  # dashboard_bp, tracker_bp, fleet_update_bp,
                                  # regional_host_bp, sync_bp, audit_bp, content_gen_bp,
                                  # learning_bp, theme_bp, thought_experiments_bp,
                                  # and (behind HEVOLVE_CODING_AGENT_ENABLED) the
                                  # coding_agent.  ALSO pulls autogen+langchain via
                                  # init_agent_engine — this is THE heavy call.
            from integrations.social.api import social_bp as _social_core_bp
            _safe_register_bp(_social_core_bp, name_hint='social')  # auth, users, posts, feed
            logging.info("Social blueprints registered (deferred — routes available after this log line)")
        except Exception as _bp_err:
            logging.warning(f"Social blueprint registration failed: {_bp_err}")

        try:
            from integrations.distributed_agent import distributed_agent_bp
            _safe_register_bp(distributed_agent_bp, name_hint='distributed_agent')
        except Exception:
            pass

        try:
            from routes import kids_media_routes
            kids_media_routes.register_routes(app)
        except Exception:
            pass

        try:
            from routes.kids_game_recommendation import kids_recommendation_bp
            _safe_register_bp(kids_recommendation_bp, name_hint='kids_recommendation')
        except Exception:
            pass

        try:
            from routes.upload_routes import register_upload_routes
            register_upload_routes(app)
        except Exception:
            pass

        try:
            from routes.db_routes import register_db_routes
            register_db_routes(app)
        except Exception:
            pass

        # ── Register ALL HARTOS hive blueprints (marketplace, benchmarks, robotics, etc.) ──
        try:
            from integrations.blueprint_registry import register_all_blueprints
            result = register_all_blueprints(app)
            logging.info(f"HARTOS blueprints: {len(result['registered'])} registered, "
                         f"{len(result['skipped'])} skipped: {result['registered']}")
        except Exception as e:
            logging.warning(f"HARTOS blueprint registry failed: {e}")

        # ── 2) DB + migrations (heavy I/O, safe to defer) ──
        init_db()
        try:
            from integrations.social.migrations import run_migrations
            run_migrations()
        except Exception as mig_err:
            logging.warning(f"hart-backend migrations: {mig_err}")
        logging.info(f"hart-backend DB initialized: {NUNBA_DB_PATH}")

        # Channel adapters — auto-activate from saved admin config + env vars
        try:
            from core.port_registry import get_port
            from integrations.channels.flask_integration import init_channels
            channels = init_channels(app, {
                'agent_api_url': f'http://localhost:{get_port("backend")}/chat',
                'default_user_id': 10077,
                'default_prompt_id': 8888,
                'device_id': DEVICE_ID,
            })
            # Auto-activate channels saved in admin config
            _activated = 0
            try:
                from integrations.channels.admin.api import get_api
                for _ch_type, _ch_cfg in get_api()._channels.items():
                    if _ch_cfg.get('enabled', True):
                        _tok = _ch_cfg.get('token') or _ch_cfg.get('api_key')
                        if channels.register_channel(_ch_type, token=_tok):
                            _activated += 1
            except Exception:
                pass
            # Env-var channels: ONLY register adapters that actually have
            # credentials.  Previously we registered all 6 (telegram,
            # discord, whatsapp, slack, signal, web) unconditionally,
            # which imported ~250MB of heavy SDK modules even when the
            # user had no tokens.  `web` stays unconditional because it's
            # the local HTTP adapter — no external creds, already cheap.
            _env_creds = {
                'telegram': os.environ.get('TELEGRAM_BOT_TOKEN'),
                'discord':  os.environ.get('DISCORD_BOT_TOKEN'),
                'whatsapp': os.environ.get('WHATSAPP_ACCESS_TOKEN'),
                'slack':    os.environ.get('SLACK_BOT_TOKEN'),
                'signal':   os.environ.get('SIGNAL_SERVICE_URL'),
            }
            for _ch_type, _tok in _env_creds.items():
                if _tok and _ch_type not in (channels.registry._adapters or {}):
                    channels.register_channel(_ch_type, token=_tok)
            # `web` adapter is in-process, cheap, always register
            if 'web' not in (channels.registry._adapters or {}):
                channels.register_channel('web')
            channels.start()
            logging.info(
                f"Channel adapters initialized "
                f"({_activated} from config, {sum(1 for t in _env_creds.values() if t)} from env, web)",
            )
        except Exception as ch_err:
            logging.debug(f"Channel adapters skipped: {ch_err}")

        # Agent engine (daemon, goal seeding — only if explicitly enabled)
        if os.environ.get('HEVOLVE_AGENT_ENGINE_ENABLED', '').lower() == 'true':
            try:
                from integrations.agent_engine import init_agent_engine
                init_agent_engine(app)
            except Exception as ae_err:
                logging.warning(f"Agent engine init failed: {ae_err}")

        # Route registrations (upload, db, kids media) are done synchronously
        # above — only heavy init (DB, migrations, channels, agents) is deferred

    except Exception as e:
        logging.warning(f"hart-backend direct init failed: {e}")

    # ── Kick off HARTOS hart_intelligence import (Tier-1 direct dispatch) ──
    # Previously this fired at module-load time of `routes/hartos_backend_adapter`
    # (see that file's `start_hartos_init_background` docstring) and raced
    # with `_bg_import` on langchain/transformers/torch import locks.  Now
    # we spawn it HERE — after main.py is fully imported, blueprints are
    # registered, and the Flask app is ready to answer requests.  This
    # guarantees `flask_app` is set in app.py before the heavy import chain
    # begins.  The user can already chat via fallback (Tier-3 local llama);
    # Tier-1 comes online a few seconds later.
    try:
        from routes.hartos_backend_adapter import start_hartos_init_background
        start_hartos_init_background()
        logging.info("hartos-init background thread kicked off (deferred)")
    except Exception as _hi_err:
        logging.debug(f"start_hartos_init_background skipped: {_hi_err}")

    logging.info("Social subsystem initialized (background)")


# Launch deferred social init in background thread
threading.Thread(target=_deferred_social_init, daemon=True,
                 name='social-init').start()

if not HARTOS_BACKEND_DIRECT and HARTOS_BACKEND_AVAILABLE:
    # Use adapter/proxy mode
    try:
        proxy_bp = create_proxy_blueprint()
        app.register_blueprint(proxy_bp)
        logging.info("hart-backend adapter registered (proxy mode)")
    except Exception as e:
        logging.warning(f"hart-backend adapter failed: {e}")

# ============== HARTOS MCP over HTTP (lifecycle-bound to Nunba) ==============
# The HTTP MCP blueprint at /api/mcp/local replaces the standalone stdio
# python subprocess that Claude Code would otherwise spawn (see
# HARTOS/integrations/mcp/mcp_server.py). When Claude Code's MCP config
# points at http://localhost:5000/api/mcp/local, the MCP lifecycle is the
# same as Nunba's — stop Nunba → /mcp/local 404s → Claude auto-disconnects.
# No orphan python.exe, no DB lock contention, no extra ~200MB RAM.
try:
    from integrations.mcp import auto_register_local_mcp, mcp_local_bp
    app.register_blueprint(mcp_local_bp)
    auto_register_local_mcp()
    logging.info(
        "HARTOS MCP mounted at /api/mcp/local — "
        "set Claude Code mcpServers.hartos = {type:'http', "
        "url:'http://localhost:5000/api/mcp/local'} to drop the stdio subprocess",
    )
except Exception as e:
    logging.warning(f"HARTOS MCP HTTP blueprint not registered: {e}")

# ============== Fleet Command Watcher (auto-restart on tier change) ==============
def _fleet_restart_watcher():
    """Background thread: checks for HEVOLVE_RESTART_REQUESTED and triggers reload.

    Fleet commands (tier_promote, tier_demote) set this env var when central
    pushes a tier change. The node must restart for the new tier to take effect.
    """
    while True:
        time.sleep(10)
        restart_target = os.environ.pop('HEVOLVE_RESTART_REQUESTED', '')
        if restart_target:
            reason = os.environ.pop('HEVOLVE_RESTART_REASON', 'Fleet command')
            logging.warning(f"Fleet restart requested: {restart_target} — {reason}")
            # Graceful restart: re-exec the current process
            try:
                if getattr(sys, 'frozen', False):
                    # Frozen build: restart the executable
                    os.execv(sys.executable, [sys.executable] + sys.argv)
                else:
                    # Dev mode: restart python with same args
                    os.execv(sys.executable, [sys.executable] + sys.argv)
            except Exception as e:
                logging.error(f"Fleet restart failed: {e}. Manual restart required.")

if HARTOS_BACKEND_DIRECT:
    _restart_thread = threading.Thread(
        target=_fleet_restart_watcher, daemon=True, name='fleet-restart-watcher')
    _restart_thread.start()

# Log database configuration
logging.info(f"Nunba database path: {NUNBA_DB_PATH}")
logging.info(f"hart-backend direct: {HARTOS_BACKEND_DIRECT}, adapter: {HARTOS_BACKEND_AVAILABLE}")

# ============== Logs Viewer Endpoints ==============

@app.route('/logs', methods=['GET'])
@require_local_or_token
def list_logs():
    """List available log files"""
    log_files = []

    # Collect log files from various locations
    log_dirs = [
        DEFAULT_LOG_DIR,
        os.path.join(os.path.expanduser('~'), 'Documents', 'HevolveAi Agent Companion', 'logs'),
    ]

    for log_dir in log_dirs:
        if os.path.exists(log_dir):
            for f in os.listdir(log_dir):
                if f.endswith('.log'):
                    full_path = os.path.join(log_dir, f)
                    try:
                        stat = os.stat(full_path)
                        log_files.append({
                            'name': f,
                            'path': full_path,
                            'size': stat.st_size,
                            'modified': stat.st_mtime,
                            'dir': log_dir
                        })
                    except Exception:
                        pass

    # Sort by modified time (newest first)
    log_files.sort(key=lambda x: x['modified'], reverse=True)

    return jsonify({
        'logs': log_files,
        'log_dir': DEFAULT_LOG_DIR,
        'crash_reporting': get_crash_status() if CRASH_REPORTER_AVAILABLE else {'enabled': False}
    })


@app.route('/logs/view', methods=['GET'])
@require_local_or_token
def view_log():
    """View a specific log file"""
    log_file = request.args.get('file')
    lines = int(request.args.get('lines', 200))
    offset = int(request.args.get('offset', 0))

    if not log_file:
        return jsonify({'error': 'file parameter required'}), 400

    # Security: Only allow reading from known log directories
    allowed_dirs = [
        DEFAULT_LOG_DIR,
        os.path.join(os.path.expanduser('~'), 'Documents', 'HevolveAi Agent Companion', 'logs'),
        os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba', 'logs'),
    ]

    # Resolve the full path
    log_path = os.path.realpath(log_file)  # realpath resolves symlinks to prevent traversal

    # Check if file is in an allowed directory
    is_allowed = any(log_path.startswith(os.path.realpath(d)) for d in allowed_dirs)

    if not is_allowed:
        return jsonify({'error': 'Access denied'}), 403

    if not os.path.exists(log_path):
        return jsonify({'error': 'Log file not found'}), 404

    try:
        with open(log_path, encoding='utf-8', errors='replace') as f:
            all_lines = f.readlines()

        total_lines = len(all_lines)

        # Get lines from the end (most recent)
        start = max(0, total_lines - lines - offset)
        end = total_lines - offset
        selected_lines = all_lines[start:end]

        return jsonify({
            'file': log_file,
            'content': ''.join(selected_lines),
            'lines': selected_lines,
            'total_lines': total_lines,
            'showing': f"{start+1}-{end} of {total_lines}",
            'has_more': start > 0
        })
    except Exception as e:
        logging.error(f"Error reading log file: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/diag/thread-dump', methods=['POST'])
@require_local_or_token
def admin_diag_thread_dump():
    """On-demand thread-stack dump for diagnosing a live hang.

    Calls `_dump_all_thread_stacks()` (app.py) which writes to BOTH
    the logger AND ~/Documents/Nunba/logs/startup_trace.log (the
    trace channel flushes immediately and survives GIL-held hangs).
    Returns the number of threads dumped + path to the trace file.

    Guards: local-or-token gate (no remote callers); on `central`
    topology this endpoint is DISABLED outright (TPO finding) because
    dumping all Python thread stacks from a multi-tenant cloud process
    leaks cross-tenant source-line info (filename:lineno of handlers
    currently executing other tenants' requests, plus partial locals
    visible in frame-bound generators).  On `regional` and `flat`
    topologies the local-or-token gate is sufficient — a single
    operator owns the box.

    Topology is read from the env var ``HEVOLVE_TOPOLOGY`` (values:
    ``flat`` | ``regional`` | ``central``; default ``flat``) since
    Nunba has no ``core.platform_paths.get_topology`` helper today.
    """
    # TPO finding: on central (multi-tenant cloud) deployments, thread
    # stacks leak cross-tenant frame-source info.  Disable outright.
    _topology = os.environ.get('HEVOLVE_TOPOLOGY', 'flat').strip().lower()
    if _topology == 'central':
        return jsonify({
            'error': 'disabled_on_central',
            'message': 'Thread dump disabled for tenant isolation',
        }), 403
    try:
        # Single canonical dumper lives in `core.diag` (refactor: 3 parallel
        # implementations across app.py + node_watchdog.py + this endpoint
        # collapsed into one).  Direct import — no module-lookup chain.
        from core.diag import dump_all_thread_stacks
        reason = (request.get_json(silent=True) or {}).get(
            'reason', 'admin-requested'
        )
        dump_all_thread_stacks(f"admin diag: {reason}")
        import threading as _t
        return jsonify({
            'success': True,
            'threads_dumped': _t.active_count(),
            'trace_file': os.path.join(
                os.path.expanduser('~'), 'Documents', 'Nunba',
                'logs', 'startup_trace.log',
            ),
            'reason': reason,
        })
    except Exception as e:
        logging.error(f"thread-dump admin endpoint failed: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/diag/degradations', methods=['GET'])
@require_local_or_token
def admin_diag_degradations():
    """List every optional dependency that failed to import.

    Powered by `core.optional_import` — every `try: import X; except: pass`
    block in main.py was refactored to register failures here so operators
    can DIAGNOSE silent feature degradation without re-bundling with print
    statements.  The legacy pattern silently swallowed ImportError and the
    affected feature simply never worked, with no logged signal.

    Response:
      {
        success: True,
        count: 3,
        degradations: [
          {module, reason, error, first_failed_at, attempts},
          ...
        ]
      }

    Guards: local-or-token gate.  On central tier this list could leak
    paid-tier integration absence (info disclosure) — the SAME gate
    protecting /api/admin/diag/thread-dump is sufficient because the
    central-tier check there is policy-equivalent.
    """
    try:
        from core.optional_import import list_degradations
        items = list_degradations()
        return jsonify({
            'success': True,
            'count': len(items),
            'degradations': items,
        })
    except Exception as e:
        logging.error(f"degradations admin endpoint failed: {e}")
        return jsonify({'error': str(e)}), 500


# ── Trusted-publisher allowlist CRUD ─────────────────────────────────────
# Enterprise tenants can add their internal HF org to the trusted list
# WITHOUT a release.  Pre-refactor the list was a frozenset literal in
# this file, which made the field team route around it (told customers
# to pass `confirm_unverified=true` instead).  All three endpoints are
# local-or-token gated — same gate that protects the install flow.

@app.route('/api/admin/hub/allowlist', methods=['GET'])
@require_local_or_token
def admin_hub_allowlist_list():
    """Return the current trusted HF org allowlist."""
    try:
        from core.hub_allowlist import get_allowlist
        return jsonify({
            'success': True,
            'orgs': get_allowlist().list(),
        })
    except Exception as e:
        logging.error(f"hub allowlist list failed: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/hub/allowlist', methods=['POST'])
@require_local_or_token
def admin_hub_allowlist_add():
    """Add an HF org to the trusted-publisher allowlist.

    Body: {org: 'acme-corp', reason: 'internal model registry'}
    """
    try:
        from core.hub_allowlist import get_allowlist
        data = request.get_json(silent=True) or {}
        org = data.get('org', '')
        reason = data.get('reason', '')
        get_allowlist().add(org, reason)
        return jsonify({'success': True, 'org': org, 'reason': reason})
    except ValueError as ve:
        # Validation failures land here — surface the message verbatim
        # so the operator UI can render it.
        return jsonify({'error': str(ve)}), 400
    except Exception as e:
        logging.error(f"hub allowlist add failed: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/hub/allowlist/<path:org>', methods=['DELETE'])
@require_local_or_token
def admin_hub_allowlist_remove(org):
    """Remove an HF org from the trusted-publisher allowlist.

    Idempotent — returns 200 with `removed: false` if the org wasn't
    present, so the operator UI can call this safely on a stale list.
    """
    try:
        from core.hub_allowlist import get_allowlist
        removed = get_allowlist().remove(org)
        return jsonify({'success': True, 'removed': removed, 'org': org})
    except Exception as e:
        logging.error(f"hub allowlist remove failed: {e}")
        return jsonify({'error': str(e)}), 500


# ── MCP bearer-token surface for Claude Code setup UX ─────────────────────
# Background: commit f5b99d8 added `/api/mcp/local` bearer-token auth gate
# in HARTOS/integrations/mcp/mcp_http_bridge.py.  Pre-existing Claude Code
# installs use the old stdio-spawn `.claude/settings.local.json` config
# and have NO way to discover (a) the token value, (b) the new HTTP URL,
# or (c) the JSON snippet they need to paste.  Silent 403s ensue.
#
# These two endpoints power the Admin → Integrations → Claude Code card
# that shows + rotates the token.  Gated by `require_local_or_token` so
# only the local desktop user (or a caller with the Nunba admin token)
# can read/rotate — this is the same gate protecting `/thread-dump`.
#
# NOTE: token I/O lives in HARTOS — Nunba uses the PUBLIC contract
# `from integrations.mcp import get_mcp_token, rotate_mcp_token`.  The
# previous implementation reached into the private `_ensure_mcp_token`
# + `_MCP_TOKEN_CACHE` poke + `_mcp_token_path()` direct-file-write,
# which silently broke any time HARTOS renamed an internal symbol.
# rotate_mcp_token() handles HARTOS_MCP_TOKEN env-pinning gracefully.
_MCP_CONFIG_URL = 'http://localhost:5000/api/mcp/local'


def _mcp_config_snippet(token: str) -> str:
    """Return the JSON blob users paste into `.claude/settings.local.json`.

    Kept in sync with Claude Code's http-type MCP server schema
    (type:'http' + url + headers).  The bearer header is the SAME
    token file Claude Code would otherwise read on its own — we
    expose it here so non-technical users don't have to `cat` the
    file out of `%LOCALAPPDATA%/Nunba/mcp.token`.
    """
    return json.dumps({
        'mcpServers': {
            'hartos': {
                'type': 'http',
                'url': _MCP_CONFIG_URL,
                'headers': {
                    'Authorization': f'Bearer {token}',
                },
            },
        },
    }, indent=2)


@app.route('/api/admin/mcp/token', methods=['GET'])
@require_local_or_token
def admin_mcp_token_get():
    """Return the current MCP bearer token + ready-to-paste client config.

    Response:
      {
        token: '<bearer token from %LOCALAPPDATA%/Nunba/mcp.token>',
        url: 'http://localhost:5000/api/mcp/local',
        config_snippet: '<JSON blob for .claude/settings.local.json>'
      }
    """
    try:
        # Use the PUBLIC HARTOS API — was reaching into the private
        # underscore-prefix `_ensure_mcp_token` which coupled Nunba's
        # release cadence to HARTOS internal naming.
        from integrations.mcp import get_mcp_token
        token = get_mcp_token()
        return jsonify({
            'token': token,
            'url': _MCP_CONFIG_URL,
            'config_snippet': _mcp_config_snippet(token),
        })
    except Exception as e:
        logging.error(f"mcp token admin endpoint failed: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/admin/mcp/token/rotate', methods=['POST'])
@require_local_or_token
def admin_mcp_token_rotate():
    """Regenerate the MCP bearer token.

    Overwrites `%LOCALAPPDATA%/Nunba/mcp.token` (or `~/.nunba/mcp.token`
    on Unix) with a fresh `secrets.token_urlsafe(32)` and invalidates
    the in-process cache on the HARTOS module so the next
    `/api/mcp/local` before_request hook picks the new value.

    Any live Claude Code clients using the old token will start
    getting 403s immediately — operator must re-paste the new
    `config_snippet` into `.claude/settings.local.json`.
    """
    try:
        # PUBLIC HARTOS API — replaces the previous reach into private
        # `_mcp_token_path()` + direct file write + private cache poke
        # (`_MCP_TOKEN_CACHE = new_token`).  HARTOS now owns the rotation
        # mechanism end-to-end; Nunba just calls the contract.
        # rotate_mcp_token() also handles HARTOS_MCP_TOKEN env-var pinning
        # gracefully (no-ops with a warning instead of overwriting an
        # operator-controlled secret).
        from integrations.mcp import rotate_mcp_token
        new_token = rotate_mcp_token()
        return jsonify({
            'token': new_token,
            'url': _MCP_CONFIG_URL,
            'config_snippet': _mcp_config_snippet(new_token),
            'rotated': True,
        })
    except Exception as e:
        logging.error(f"mcp token rotate endpoint failed: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/logs/download', methods=['GET'])
@require_local_or_token
def download_log():
    """Download a log file"""
    log_file = request.args.get('file')

    if not log_file:
        return jsonify({'error': 'file parameter required'}), 400

    # Security check (same as view_log)
    allowed_dirs = [
        DEFAULT_LOG_DIR,
        os.path.join(os.path.expanduser('~'), 'Documents', 'HevolveAi Agent Companion', 'logs'),
        os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba', 'logs'),
    ]

    log_path = os.path.realpath(log_file)  # realpath resolves symlinks to prevent traversal
    is_allowed = any(log_path.startswith(os.path.realpath(d)) for d in allowed_dirs)

    if not is_allowed:
        return jsonify({'error': 'Access denied'}), 403

    if not os.path.exists(log_path):
        return jsonify({'error': 'Log file not found'}), 404

    return send_file(log_path, as_attachment=True, download_name=os.path.basename(log_path))


@app.route('/logs/clear', methods=['POST'])
@require_local_or_token
def clear_log():
    """Clear a log file (truncate to empty)"""
    data = request.get_json() or {}
    log_file = data.get('file')

    if not log_file:
        return jsonify({'error': 'file parameter required'}), 400

    # Security check
    allowed_dirs = [
        DEFAULT_LOG_DIR,
        os.path.join(os.path.expanduser('~'), 'Documents', 'HevolveAi Agent Companion', 'logs'),
        os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba', 'logs'),
    ]

    log_path = os.path.realpath(log_file)  # realpath resolves symlinks to prevent traversal
    is_allowed = any(log_path.startswith(os.path.realpath(d)) for d in allowed_dirs)

    if not is_allowed:
        return jsonify({'error': 'Access denied'}), 403

    if not os.path.exists(log_path):
        return jsonify({'error': 'Log file not found'}), 404

    try:
        with open(log_path, 'w') as f:
            f.write('')  # Truncate
        logging.info(f"Log file cleared: {log_path}")
        return jsonify({'success': True, 'message': f'Log file cleared: {os.path.basename(log_path)}'})
    except Exception as e:
        logging.error(f"Error clearing log file: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/logs/open-folder', methods=['GET'])
@require_local_or_token
def open_logs_folder():
    """Open the logs folder in file explorer"""
    try:
        from desktop.platform_utils import open_file_browser
        open_file_browser(DEFAULT_LOG_DIR)
        return jsonify({'success': True, 'path': DEFAULT_LOG_DIR})
    except Exception as e:
        logging.error(f"Error opening logs folder: {e}")
        return jsonify({'error': str(e)}), 500


initialize_indicator_window()

# ============== LangChain Service Auto-Start ==============

_langchain_process = None

def _is_port_in_use(port):
    """Check if a port is already in use"""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0


def start_langchain_service():
    """Start hart_intelligence (hart_intelligence_entry.py) as a background subprocess on port 6777.

    Skips subprocess if hart-backend is available in-process (pip-installed),
    since the adapter will use direct test_client calls instead.
    """
    global _langchain_process
    import atexit

    # In bundled mode, never launch LangChain as a subprocess.
    # Tier-1 is import-only; Tier-2 is llama.cpp. No ports needed.
    if os.environ.get('NUNBA_BUNDLED') or getattr(sys, 'frozen', False):
        # `_hartos_backend_available` is set by a background thread that
        # imports `hart_intelligence` (takes 15-30s on first boot because
        # LangChain + hevolveai pulls are heavy).  Checking synchronously
        # the moment the main boot thread reaches here gives a FALSE-
        # NEGATIVE warning — the thread hasn't finished yet, but Tier-1
        # will be active shortly.  Wait briefly for a definitive answer
        # before emitting status, and if still pending, log as INFO (not
        # WARNING) so it isn't mistaken for a hard failure.
        def _report_tier_status():
            from routes.hartos_backend_adapter import (
                _hartos_backend_available as _avail,
            )
            from routes.hartos_backend_adapter import (
                _hartos_initialized as _done,
            )
            if _avail:
                logging.info("hart-backend available in-process (bundled), no subprocess needed")
            elif _done:
                # Init finished AND failed — this is a real failure
                logging.warning(
                    "hart-backend import failed in bundled mode — chat will use llama.cpp fallback",
                )
            else:
                # Still in flight — schedule a retry log shortly
                logging.info(
                    "hart-backend Tier-1 init in progress (background thread); "
                    "the adapter will log 'Tier-1 ACTIVE' when ready.",
                )

        try:
            _report_tier_status()
        except Exception as ex:
            logging.error(f"hartos_backend_adapter import failed in bundled mode: {ex}")
        return

    # Standalone mode: skip subprocess if hart-backend is directly available
    try:
        from routes.hartos_backend_adapter import _hartos_backend_available
        if _hartos_backend_available:
            logging.info("hart-backend available in-process, skipping LangChain subprocess on port 6777")
            return
    except Exception as ex:
        logging.error(f"hartos_backend_adapter import failed in main2: {ex}")

    langchain_port = 6777
    langchain_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                 '..', 'HARTOS')
    # Prefer hart_intelligence_entry.py (actual implementation) with fallback to hart_intelligence.py (alias)
    langchain_script = os.path.join(langchain_dir, 'hart_intelligence_entry.py')
    if not os.path.isfile(langchain_script):
        langchain_script = os.path.join(langchain_dir, 'hart_intelligence.py')

    if not os.path.isfile(langchain_script):
        logging.warning(f"hart_intelligence service script not found in {langchain_dir}")
        return

    if _is_port_in_use(langchain_port):
        logging.info(f"LangChain service already running on port {langchain_port}")
        return

    try:
        creation_flags = 0
        if sys.platform == 'win32':
            creation_flags = subprocess.CREATE_NO_WINDOW

        _langchain_process = subprocess.Popen(
            [sys.executable, langchain_script],
            cwd=os.path.abspath(langchain_dir),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creation_flags,
        )
        logging.info(f"LangChain service starting (PID {_langchain_process.pid}) on port {langchain_port}")

        # Poll for readiness (up to 10 seconds)
        for i in range(20):
            time.sleep(0.5)
            if _is_port_in_use(langchain_port):
                logging.info(f"LangChain service ready on port {langchain_port}")
                break
        else:
            logging.warning("LangChain service did not become ready within 10 seconds")

        def _cleanup_langchain():
            if _langchain_process and _langchain_process.poll() is None:
                logging.info("Shutting down LangChain service")
                _langchain_process.terminate()
                try:
                    _langchain_process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    _langchain_process.kill()

        atexit.register(_cleanup_langchain)

    except Exception as e:
        logging.error(f"Failed to start LangChain service: {e}")


# ============== LangChain Service Watchdog ==============

_WATCHDOG_POLL_INTERVAL = 30    # seconds between health checks
_WATCHDOG_FAIL_THRESHOLD = 3    # consecutive failures before restart
_WATCHDOG_RESTART_COOLDOWN = 30 # seconds to wait after restart before checking again
_WATCHDOG_MAX_RESTARTS = 5      # max restarts before giving up (prevents restart loops)
_watchdog_restart_count = 0


def _langchain_health_check(port):
    """Check if the LangChain service on the given port is healthy.

    Tries GET /status first (hart_intelligence Flask app), then falls back
    to a simple TCP connect check. Returns True if the service responds.
    """
    try:
        resp = requests.get(f'http://localhost:{port}/status', timeout=5)
        return resp.status_code == 200
    except Exception:
        pass

    # Fallback: raw TCP connect (service is up but might not have /status)
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(3)
            return s.connect_ex(('localhost', port)) == 0
    except Exception:
        return False


def _langchain_watchdog():
    """Daemon thread that monitors the LangChain subprocess and restarts it on failure.

    Only runs when a subprocess was launched by start_langchain_service().
    Skipped entirely in bundled mode or when hart-backend is available in-process.

    Behaviour:
        1. Polls the LangChain health endpoint every _WATCHDOG_POLL_INTERVAL seconds.
        2. On 3 consecutive failures, kills the existing process and restarts it.
        3. After restart, waits _WATCHDOG_RESTART_COOLDOWN seconds before checking again.
        4. Stops retrying after _WATCHDOG_MAX_RESTARTS to avoid infinite loops.
    """
    global _langchain_process, _watchdog_restart_count

    wdlog = logging.getLogger('LangChainWatchdog')
    wdlog.info("[WATCHDOG] LangChain watchdog started")

    # Wait for initial startup to complete (give the service time to boot)
    time.sleep(_WATCHDOG_RESTART_COOLDOWN)

    langchain_port = 6777
    langchain_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                 '..', 'HARTOS')
    # Prefer hart_intelligence_entry.py (actual implementation) with fallback to hart_intelligence.py (alias)
    langchain_script = os.path.join(langchain_dir, 'hart_intelligence_entry.py')
    if not os.path.isfile(langchain_script):
        langchain_script = os.path.join(langchain_dir, 'hart_intelligence.py')

    consecutive_failures = 0

    while True:
        try:
            # If we have exhausted max restarts, stop monitoring
            if _watchdog_restart_count >= _WATCHDOG_MAX_RESTARTS:
                wdlog.error(
                    f"[WATCHDOG] Max restarts reached ({_WATCHDOG_MAX_RESTARTS}). "
                    "Stopping watchdog. Chat will fall back to llama.cpp."
                )
                return

            # Health check
            healthy = _langchain_health_check(langchain_port)

            if healthy:
                if consecutive_failures > 0:
                    wdlog.info(
                        f"[WATCHDOG] LangChain recovered after {consecutive_failures} "
                        f"failure(s) (port {langchain_port})"
                    )
                consecutive_failures = 0
                time.sleep(_WATCHDOG_POLL_INTERVAL)
                continue

            # Service is not healthy
            consecutive_failures += 1
            wdlog.warning(
                f"[WATCHDOG] LangChain health check failed "
                f"({consecutive_failures}/{_WATCHDOG_FAIL_THRESHOLD}) "
                f"on port {langchain_port}"
            )

            if consecutive_failures < _WATCHDOG_FAIL_THRESHOLD:
                time.sleep(_WATCHDOG_POLL_INTERVAL)
                continue

            # --- Threshold reached: restart the service ---
            wdlog.warning(
                f"[WATCHDOG] {_WATCHDOG_FAIL_THRESHOLD} consecutive failures. "
                "Attempting restart..."
            )

            # Kill existing process if it exists
            if _langchain_process is not None:
                try:
                    if _langchain_process.poll() is None:
                        wdlog.info(
                            f"[WATCHDOG] Terminating stale LangChain process "
                            f"(PID {_langchain_process.pid})"
                        )
                        _langchain_process.terminate()
                        try:
                            _langchain_process.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            wdlog.warning("[WATCHDOG] Graceful terminate timed out, killing process")
                            _langchain_process.kill()
                            _langchain_process.wait(timeout=3)
                    else:
                        wdlog.info(
                            f"[WATCHDOG] LangChain process already exited "
                            f"(returncode={_langchain_process.returncode})"
                        )
                except Exception as kill_err:
                    wdlog.error(f"[WATCHDOG] Error killing LangChain process: {kill_err}")
                _langchain_process = None

            # Verify the script still exists
            if not os.path.isfile(langchain_script):
                wdlog.error(
                    f"[WATCHDOG] LangChain script not found: {langchain_script}. "
                    "Cannot restart."
                )
                return

            # Start the service again
            try:
                creation_flags = 0
                if sys.platform == 'win32':
                    creation_flags = subprocess.CREATE_NO_WINDOW

                _langchain_process = subprocess.Popen(
                    [sys.executable, langchain_script],
                    cwd=os.path.abspath(langchain_dir),
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=creation_flags,
                )
                _watchdog_restart_count += 1
                wdlog.info(
                    f"[WATCHDOG] LangChain service restarted "
                    f"(PID {_langchain_process.pid}, "
                    f"restart {_watchdog_restart_count}/{_WATCHDOG_MAX_RESTARTS})"
                )

                # Poll for readiness (up to 15 seconds)
                ready = False
                for _ in range(30):
                    time.sleep(0.5)
                    if _is_port_in_use(langchain_port):
                        ready = True
                        break

                if ready:
                    wdlog.info(
                        f"[WATCHDOG] LangChain service recovered on port {langchain_port}"
                    )
                else:
                    wdlog.warning(
                        "[WATCHDOG] LangChain service did not become ready "
                        "within 15 seconds after restart"
                    )

            except Exception as start_err:
                wdlog.error(f"[WATCHDOG] Failed to restart LangChain service: {start_err}")

            # Reset failure counter and apply cooldown
            consecutive_failures = 0
            time.sleep(_WATCHDOG_RESTART_COOLDOWN)

        except Exception as e:
            # Watchdog must never crash — catch everything and keep going
            wdlog.error(f"[WATCHDOG] Unexpected error in watchdog loop: {e}")
            time.sleep(_WATCHDOG_POLL_INTERVAL)


_vision_service = None  # Global VisionService instance (accessed by chatbot_routes)
_diarization_service = None  # Global DiarizationService instance


def _start_vision_service():
    """Start the VisionService in a daemon thread if GPU is available.

    Uses core.optional_import so a missing `integrations.vision` lands in
    /api/admin/diag/degradations (operator can see WHY visual context is
    silent) instead of the legacy `except ImportError: pass` pattern.
    """
    global _vision_service
    from core.optional_import import optional_import
    _vmod = optional_import(
        'integrations.vision',
        reason='HARTOS visual context (MiniCPM VLM sidecar)',
    )
    if _vmod is None:
        return
    try:
        _vision_service = _vmod.VisionService(
            ws_port=int(os.environ.get('VISION_WS_PORT', 5460)),
            minicpm_port=int(os.environ.get('HEVOLVE_MINICPM_PORT', 9891)),
        )
        _vision_service.start()
        logging.info("VisionService started (MiniCPM sidecar + frame receiver)")
    except Exception as e:
        logging.warning(f"VisionService failed to start: {e}")


def _start_diarization_service():
    """Start the DiarizationService in a daemon thread if whisperx available."""
    global _diarization_service
    from core.optional_import import optional_import
    _amod = optional_import(
        'integrations.audio',
        reason='HARTOS speaker diarization (whisperx sidecar)',
    )
    if _amod is None:
        return
    try:
        _diarization_service = _amod.DiarizationService(
            port=int(os.environ.get('HEVOLVE_DIARIZATION_PORT', 8004)),
        )
        _diarization_service.start()
        logging.info("DiarizationService starting (sidecar)")
    except Exception as e:
        logging.warning(f"DiarizationService failed to start: {e}")


_bg_services_started = False

def start_background_services():
    """Start all background services: LangChain, vision, diarization, TTS warm-up.

    Called from both `python main.py` (direct) and `app.py` (frozen exe import).
    Guarded — only runs once per process.
    """
    global _bg_services_started
    if _bg_services_started:
        logging.debug("Background services already started — skipping")
        return
    _bg_services_started = True

    # Start embedded WAMP router (port 8088) for realtime push — but ONLY
    # when we actually need cross-process messaging:
    #   (a) At least one non-web channel adapter is registered (Telegram,
    #       Discord, WhatsApp, Slack, etc. — these need WAMP for chat/agent
    #       push from Flask to the adapter thread), OR
    #   (b) At least one mobile peer is known via peer_link discovery.
    # On a fresh install with no channels or peers, the local SPA uses
    # SSE fallback for its realtime needs — saves ~80–120 MB resident memory
    # (Twisted reactor + Autobahn router + connection registry).
    #
    # When a channel is added later via admin UI or a peer joins via
    # peer_link, `ensure_wamp_running()` wakes the router on-demand.
    def _wamp_is_needed() -> tuple[bool, str]:
        try:
            _adapters = getattr(channels.registry, '_adapters', None) or {}
            _non_web = [ct for ct in _adapters if ct != 'web']
            if _non_web:
                return True, f"channels={_non_web}"
        except Exception:
            pass
        try:
            from hevolve.peer_link import get_peer_link_manager
            pm = get_peer_link_manager()
            if pm and getattr(pm, 'get_active_peers', lambda: [])():
                return True, "mobile peer discovered"
        except Exception:
            pass
        return False, ""

    _needed, _reason = _wamp_is_needed()
    if _needed:
        try:
            from wamp_router import start_wamp_router
            start_wamp_router()
            logging.info(
                "Embedded WAMP router starting on port %s (reason: %s)",
                os.environ.get('NUNBA_WAMP_PORT', '8088'), _reason,
            )
        except Exception as e:
            logging.warning(
                "WAMP router failed to start (realtime will use SSE fallback): %s", e,
            )
    else:
        logging.info(
            "WAMP router deferred — no non-web channels or mobile peers "
            "at boot (SSE handles local realtime, saves ~100MB; router "
            "will start on-demand when a channel/peer arrives)",
        )

    # Start LangChain service in background thread (non-blocking)
    langchain_thread = threading.Thread(target=start_langchain_service, daemon=True)
    langchain_thread.start()

    # Start LangChain watchdog (monitors subprocess health, auto-restarts on failure).
    # Only needed when LangChain runs as a subprocess (standalone, non-bundled mode).
    _should_watchdog = not (os.environ.get('NUNBA_BUNDLED') or getattr(sys, 'frozen', False))
    if _should_watchdog:
        try:
            from routes.hartos_backend_adapter import _hartos_backend_available
            if _hartos_backend_available:
                _should_watchdog = False  # in-process, no subprocess to watch
        except Exception:
            pass  # import failed, subprocess might be needed

    if _should_watchdog:
        watchdog_thread = threading.Thread(
            target=_langchain_watchdog, daemon=True, name='LangChainWatchdog'
        )
        watchdog_thread.start()
        logging.info("LangChain watchdog thread started")
    else:
        logging.info("LangChain watchdog skipped (in-process or bundled mode)")

    # Start VisionService (MiniCPM + frame receiver) in daemon thread
    vision_thread = threading.Thread(target=_start_vision_service, daemon=True)
    vision_thread.start()

    # Start streaming STT WebSocket server (faster-whisper, real-time mic input).
    # Whisper model loads lazily on first transcription — NOT at server start.
    # This prevents whisper from claiming 3GB GPU VRAM before F5-TTS needs it.
    try:
        from integrations.service_tools.whisper_tool import start_stt_stream_server
        stt_port = start_stt_stream_server()
        if stt_port:
            logging.info(f"Streaming STT WebSocket server started on port {stt_port}")
    except Exception as e:
        logging.debug(f"Streaming STT server skipped: {e}")

    # Start DiarizationService (speaker diarization sidecar) in daemon thread
    diarization_thread = threading.Thread(target=_start_diarization_service, daemon=True)
    diarization_thread.start()

    # Warm-up TTS engine in background with user's preferred language
    # so the correct GPU engine (Indic Parler, CosyVoice3, Chatterbox Turbo)
    # is loaded BEFORE the first TTS request — no cold-start delay.
    # Wall-clock deadline for the warmup thread (seconds). A stalled
    # probe or hung HF download would otherwise block first-message
    # synth indefinitely — see WARMUP_TIMEOUT watchdog below.
    WARMUP_TIMEOUT = 180

    def _warmup_tts():
        """TTS engine warmup. Bounded by WARMUP_TIMEOUT (seconds) via
        the watchdog thread created at the bottom of the outer scope —
        the watchdog calls tts_thread.join(timeout=WARMUP_TIMEOUT) and
        logs a clear 'warmup exceeded' message if the probe is stuck,
        then lets the foreground request carry the cold-start penalty.
        """
        try:
            if os.environ.get('NUNBA_DISABLE_TTS'):
                return

            # Pre-check CUDA torch via clean subprocess (avoids stub pollution).
            # Must run BEFORE importing tts_engine so the cache is primed.
            from tts._torch_probe import check_cuda_available
            _cuda_ok = check_cuda_available()

            # Read user's preferred language BEFORE probing backends — only probe
            # engines that appear in this language's ladder.  Avoids installing F5
            # (voice-cloning) for users who speak English/Tamil/Hindi and don't
            # need it.
            #
            # SINGLE source of truth: core.user_lang.get_preferred_lang().
            # The prior default-then-read pattern was responsible for the
            # "Chatterbox Turbo auto-installed for a Tamil user" bug — when
            # hart_language.json was 'ta' but warmup started before the file
            # existed (first boot) OR before set_language() had a chance to
            # flip, the 'en' default won and the English ladder installed.
            try:
                from core.user_lang import get_preferred_lang
                preferred_lang = get_preferred_lang() or 'en'
            except Exception:
                # Final fallback only if core.user_lang isn't importable
                # (e.g. standalone main.py harness). Keeps old behavior as
                # a backstop, never as the primary path.
                preferred_lang = 'en'
                try:
                    import json as _json
                    _hart_lang_file = os.path.join(
                        os.path.expanduser('~'), 'Documents', 'Nunba', 'data', 'hart_language.json')
                    if os.path.exists(_hart_lang_file):
                        with open(_hart_lang_file) as _f:
                            preferred_lang = _json.load(_f).get('language', 'en')
                except Exception:
                    pass

            # Import TTSEngine class first (just the class, not get_tts_engine singleton)
            # so we can prime its cache BEFORE it constructs the engine
            from tts.tts_engine import TTSEngine
            if _cuda_ok:
                TTSEngine._import_check_cache['_torch_cuda'] = True
                logging.info("TTS: CUDA torch verified via subprocess — GPU TTS enabled")
                # Filter backends to only those in this language's ladder.
                #
                # Empty-ladder fallback: an unknown `preferred_lang` (e.g.
                # user set 'xx' by mistake) would otherwise produce an
                # empty set → the _ladder_backends filter becomes a no-op
                # AND every backend gets probed/installed (the opposite of
                # the intended lang-scoped install).  Fallback to a
                # deterministic minimal set so the worst case is "piper
                # CPU only" rather than "install-everything".
                _ladder_engines = set()
                try:
                    from integrations.channels.media.tts_router import LANG_ENGINE_PREFERENCE
                    _ladder_engines = set(LANG_ENGINE_PREFERENCE.get(preferred_lang, []))
                except Exception:
                    pass
                if not _ladder_engines:
                    # Minimal fallback: Piper is bundled, always runnable.
                    logging.warning(
                        "TTS: no ladder for lang=%r — falling back to minimal "
                        "backend set ['piper'] instead of probing every backend",
                        preferred_lang,
                    )
                    _ladder_engines = {'piper'}
                # Map engine_id → backend name (same as in TTSEngine._BACKEND_TO_REGISTRY_KEY)
                _ladder_backends = set()
                try:
                    for _eid in _ladder_engines:
                        # engine_id like 'chatterbox_turbo' → backend 'chatterbox_turbo'
                        _ladder_backends.add(_eid)
                except Exception:
                    pass

                # Iterate backend → required-pip-package pairs.  The single
                # source of truth is `_BACKEND_TO_REGISTRY_KEY` defined at
                # module level in tts.tts_engine — there is no
                # `_BACKEND_REQUIRED_IMPORTS` class attribute (an old refactor
                # left this call site pointing at a dead name, which silently
                # crashed boot-time TTS warmup with `AttributeError`).
                from tts._torch_probe import check_backend_runnable
                from tts.tts_engine import _BACKEND_TO_REGISTRY_KEY as _BACKEND_IMPORTS
                for _be, _imp in _BACKEND_IMPORTS.items():
                    # Skip backends not in the user's language ladder
                    if _ladder_backends and _be not in _ladder_backends:
                        logging.debug(f"TTS: skipping probe of {_be} (not in {preferred_lang} ladder)")
                        continue
                    if check_backend_runnable(_be, _imp):
                        TTSEngine._import_check_cache[_imp] = True
                        logging.info(f"TTS: backend {_be} ({_imp}) verified runnable")
            # NOW create the engine — cache is primed, _can_run_backend will find entries
            from tts.tts_engine import get_tts_engine
            engine = get_tts_engine()

            # If GPU detected but CUDA torch not installed, install it NOW
            # (blocking) so GPU TTS works on first launch. Shows progress via
            # WAMP push so the UI can display download status.
            try:
                from tts.package_installer import has_nvidia_gpu, is_cuda_torch
                if has_nvidia_gpu() and not is_cuda_torch():
                    logging.info("TTS: GPU detected — installing CUDA PyTorch (first launch, ~2.5GB)...")
                    from tts.package_installer import install_gpu_torch
                    def _progress(msg):
                        logging.info(f"CUDA torch: {msg}")
                        try:
                            from integrations.social.realtime import publish_event
                            publish_event('setup_progress', {
                                'type': 'setup_progress',
                                'job_type': 'cuda_torch',
                                'status': 'loading',
                                'message': msg,
                            })
                        except Exception:
                            pass
                    ok, msg = install_gpu_torch(progress_cb=_progress)
                    if ok:
                        logging.info("CUDA torch installed — GPU TTS active on next restart")
                        # Notify user in their language that voice is upgrading
                        _voice_msgs = {
                            'en': "I'm upgrading my voice. Next time we talk, I'll sound much better.",
                            'ta': "என் குரலை மேம்படுத்திக்கொண்டிருக்கிறேன். அடுத்த முறை இன்னும் நன்றாக பேசுவேன்.",
                            'hi': "मैं अपनी आवाज़ बेहतर कर रहा हूँ. अगली बार और अच्छा लगेगा.",
                            'bn': "আমার গলা আপগ্রেড করছি। পরের বার আরও ভালো শোনাবে।",
                            'te': "నా గొంతు అప్‌గ్రేడ్ చేస్తున్నాను. తర్వాత మాట్లాడినప్పుడు బాగుంటుంది.",
                            'kn': "ನನ್ನ ಧ್ವನಿ ಅಪ್‌ಗ್ರೇಡ್ ಮಾಡ್ತಿದ್ದೀನಿ. ಮುಂದಿನ ಸಲ ಇನ್ನೂ ಚೆನ್ನಾಗಿ ಮಾತಾಡ್ತೀನಿ.",
                            'ml': "എന്റെ ശബ്ദം അപ്‌ഗ്രേഡ് ചെയ്യുന്നു. അടുത്ത തവണ കൂടുതല്‍ നന്നായി സംസാരിക്കാം.",
                            'gu': "મારો અવાજ સુધારી રહ્યો છું. આવતી વખતે વધુ સારું લાગશે.",
                            'mr': "माझा आवाज सुधारतोय. पुढच्या वेळी अजून छान वाटेल.",
                            'pa': "ਮੈਂ ਆਪਣੀ ਆਵਾਜ਼ ਬਿਹਤਰ ਕਰ ਰਿਹਾ ਹਾਂ. ਅਗਲੀ ਵਾਰ ਹੋਰ ਵਧੀਆ ਲੱਗੇਗਾ.",
                            'ur': "میں اپنی آواز بہتر کر رہا ہوں۔ اگلی بار اور اچھا لگے گا۔",
                            'ne': "मेरो आवाज सुधार्दैछु। अर्को पटक झन राम्रो सुनिनेछ।",
                            'or': "ମୋ ସ୍ବର ଉନ୍ନତ କରୁଛି। ପରବର୍ତ୍ତୀ ଥର ଆହୁରି ଭଲ ଲାଗିବ।",
                            'as': "মোৰ মাত উন্নত কৰি আছোঁ। পিছৰবাৰ আৰু ভাল লাগিব।",
                            'sa': "मम स्वरं सुधारयामि। अग्रिमे वारे श्रेष्ठतरं भविष्यति।",
                            'ja': "声をアップグレード中。次に話す時はもっと自然に聞こえるよ。",
                            'ko': "목소리를 업그레이드하고 있어요. 다음에 만나면 더 좋아질 거예요.",
                            'zh': "正在升级我的声音。下次聊天时会好听很多。",
                            'es': "Estoy mejorando mi voz. La próxima vez sonaré mucho mejor.",
                            'fr': "J'améliore ma voix. La prochaine fois, ce sera beaucoup mieux.",
                            'de': "Ich verbessere meine Stimme. Nächstes Mal klinge ich viel besser.",
                            'it': "Sto migliorando la mia voce. La prossima volta sarà molto meglio.",
                            'pt': "Estou melhorando minha voz. Na próxima vez vai soar muito melhor.",
                            'ar': "أحسّن صوتي. المرة القادمة سيكون أفضل بكثير.",
                            'ru': "Улучшаю свой голос. В следующий раз буду звучать намного лучше.",
                        }
                        _vmsg = _voice_msgs.get(preferred_lang, _voice_msgs['en'])
                        try:
                            from integrations.social.realtime import publish_event
                            publish_event('setup_progress', {
                                'type': 'setup_progress',
                                'job_type': 'cuda_torch',
                                'status': 'done',
                                'message': _vmsg,
                            })
                        except Exception:
                            pass
                    else:
                        logging.warning(f"CUDA torch install failed: {msg} — using CPU TTS")
            except Exception:
                pass

            # Trigger language-based engine selection (loads GPU model if CUDA torch available)
            logging.info(f"TTS warm-up: user prefers '{preferred_lang}', selecting GPU engine...")
            engine.set_language(preferred_lang)

            # Wait for backend switch to settle:
            for _wait in range(20):
                if not getattr(engine, '_pending_backend', None):
                    break
                time.sleep(0.5)

            # Pre-load F5 on GPU AFTER llama-server is ready.
            # Wait for llama-server to finish loading so VRAM settles.
            # Then force F5 model load via a test synthesis.
            # The _synth_lock serializes with chat threads (no race condition).
            # The 60s idle timer will unload F5 if no real TTS comes.
            logging.info("TTS warm-up: waiting for llama-server to settle before F5 pre-load...")
            for _llm_wait in range(30):  # up to 90s
                try:
                    import urllib.request as _ur
                    _h = _ur.urlopen('http://127.0.0.1:8080/health', timeout=2)
                    _status = _h.read()
                    _h.close()
                    if b'"ok"' in _status:
                        logging.info("TTS warm-up: llama-server ready, pre-loading F5...")
                        break
                except Exception:
                    pass
                time.sleep(3)

            # Pre-load F5 only if enough VRAM (model 1.3GB + buffers = need 2.5GB free).
            # If VRAM is too tight (llama took most of it), skip — first chat uses Piper.
            _can_preload = False
            try:
                from integrations.service_tools.vram_manager import vram_manager
                _free = vram_manager.get_free_vram()
                _can_preload = _free >= 3.0  # need headroom above 2.5 for model + inference
                if not _can_preload:
                    logging.info(f"TTS warm-up: only {_free:.1f}GB VRAM free — skipping F5 pre-load")
            except Exception:
                pass

            if _can_preload:
                import tempfile as _tf
                _test_path = os.path.join(_tf.gettempdir(), '_nunba_tts_warmup.wav')
                # Universal warmup: the `language=` parameter drives model
                # selection (engine picks the right phoneme set per that code).
                # The TEXT just needs to be tokenizer-safe across all languages.
                # "." is a single sentence-end token every TTS tokenizer accepts
                # — primes weights, produces ~200ms silence, works for every
                # language without a per-language phrase dict.
                try:
                    engine.synthesize(".", output_path=_test_path, language=preferred_lang)
                    if os.path.exists(_test_path):
                        os.unlink(_test_path)
                    logging.info(f"TTS warm-up: engine pre-loaded (lang={preferred_lang})")
                except Exception as _se:
                    logging.info(f"TTS warm-up: pre-load skipped ({_se}) — first response uses Piper")

            backend = engine.get_info().get('active_backend', 'unknown')
            logging.info(f"TTS engine warmed up: {backend} (language={preferred_lang})")
        except Exception as e:
            logging.warning(f"TTS warm-up failed (non-blocking): {e}")
    # WARMUP_TIMEOUT (seconds) is declared at the top of this scope,
    # just above `def _warmup_tts`. A watchdog thread joins the warmup
    # worker with that deadline; if it expires, we log and let the
    # foreground request path carry the cold-start penalty so the user
    # never sees an indefinite stall.
    tts_thread = threading.Thread(target=_warmup_tts, daemon=True, name='TTSWarmup')
    tts_thread.start()

    def _warmup_watchdog():
        tts_thread.join(timeout=WARMUP_TIMEOUT)
        if tts_thread.is_alive():
            logging.warning(
                f"TTS warmup exceeded {WARMUP_TIMEOUT}s — "
                f"continuing without blocking; first synth will run in the "
                f"foreground on the requesting thread"
            )
    threading.Thread(target=_warmup_watchdog, daemon=True, name='TTSWarmupWatchdog').start()


if __name__ == '__main__':
    try:
        # Log Python version and environment info
        logging.info(f"Python version: {sys.version}")
        logging.info(f"Running from: {os.path.abspath(__file__)}")
        logging.info(f"Hevolve build directory: {LANDING_PAGE_BUILD_DIR}")

        start_background_services()

        # Start the server via waitress (production WSGI)
        # Default to 127.0.0.1 (loopback only) for security; set NUNBA_BIND_HOST=0.0.0.0 to expose on all interfaces
        bind_host = os.environ.get('NUNBA_BIND_HOST', '127.0.0.1')
        try:
            from waitress import serve
            logging.info(f"Starting Waitress server on {bind_host}:{args.port}")
            serve(app, host=bind_host, port=args.port, threads=8)
        except ImportError:
            logging.warning("waitress not available, falling back to Flask dev server")
            app.run(debug=False, host=bind_host, port=args.port, use_reloader=False)
    except Exception as e:
        logging.critical(f"Failed to start server: {str(e)}")
        logging.critical(traceback.format_exc())
        sys.exit(1)
