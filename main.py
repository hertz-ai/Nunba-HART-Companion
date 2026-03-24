"""
main.py -- Nunba Server

A Friend, A Well Wisher, Your LocalMind
Connect to Hivemind to collaborate with your friends' agents.
"""
import argparse
import hmac
import logging
import os
import shlex
import subprocess
import tempfile
import threading
import traceback

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
# Try to import hart-backend directly (pip installed)
HARTOS_BACKEND_DIRECT = False
try:
    from integrations.social import init_social, social_bp
    from integrations.social.models import get_engine, init_db
    HARTOS_BACKEND_DIRECT = True
except ImportError:
    pass

# Import crash reporter
try:
    from desktop.crash_reporter import (
        add_breadcrumb,
        capture_exception,
        capture_message,
        create_crash_reporter_blueprint,
        init_crash_reporting,
        set_user,
    )
    from desktop.crash_reporter import get_status as get_crash_status
    CRASH_REPORTER_AVAILABLE = True
except ImportError:
    CRASH_REPORTER_AVAILABLE = False

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

threading.Thread(target=_deferred_platform_init, daemon=True,
                 name='platform-init').start()

# CORS is handled manually via the after_request handler and handle_preflight
# below. This avoids duplicate/conflicting headers from flask-cors CORS() init.

# =============================================================================
# Security: API Token Authentication for sensitive endpoints
# =============================================================================
from functools import wraps

# Get API token from environment (for sensitive endpoints)
API_TOKEN = os.environ.get('NUNBA_API_TOKEN', '')

def _is_local_request():
    """Check if request is truly local, accounting for proxies.

    When running behind a reverse proxy, *all* requests appear as 127.0.0.1
    because the proxy connects locally.  If the ``TRUSTED_PROXY`` env-var is
    set to the proxy's address we inspect ``X-Forwarded-For`` to determine the
    *real* client IP.  Without the env-var, only ``remote_addr`` is checked
    (safe default for direct connections).
    """
    trusted_proxy = os.environ.get('TRUSTED_PROXY', '')
    if trusted_proxy and request.remote_addr == trusted_proxy:
        forwarded_for = request.headers.get('X-Forwarded-For', '').split(',')[0].strip()
        return forwarded_for in ('127.0.0.1', '::1', 'localhost', '')
    # Direct connection - check remote_addr
    return request.remote_addr in ('127.0.0.1', '::1')


def require_local_or_token(f):
    """
    Decorator to protect sensitive endpoints.
    Allows access if:
    1. Request comes from localhost (127.0.0.1 or ::1), accounting for proxies
    2. Valid API token is provided in Authorization header
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if _is_local_request():
            return f(*args, **kwargs)

        # Check for API token if not local
        if API_TOKEN:
            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                token = auth_header[7:]
                if hmac.compare_digest(token, API_TOKEN):
                    return f(*args, **kwargs)

        # Unauthorized
        return jsonify({
            'error': 'Unauthorized',
            'message': 'This endpoint requires local access or valid API token'
        }), 401

    return decorated_function

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

# Additional CORS headers for all routes
@app.after_request
def after_request(response):
    # Log response status for static files
    path = request.path
    if path.startswith('/static/') or path.endswith(('.png', '.gif', '.svg', '.jpg', '.jpeg')):
        logging.debug(f"Static response: {path} -> {response.status_code}")

    # Get the origin from the request
    origin = request.headers.get('Origin')

    # List of allowed origins
    allowed_origins = [
        'https://hevolve.ai',
        'https://www.hevolve.ai',
        'https://hertzai.com',
        'https://www.hertzai.com',
        'https://hevolve.hertzai.com',
        'https://www.hevolve.hertzai.com'
    ]

    # Check if origin is in allowed list or is a local dev origin
    def _is_allowed_origin(origin):
        if origin in allowed_origins:
            return True
        if origin.startswith('http://localhost:') or origin == 'http://localhost':
            return True
        if origin.startswith('http://127.0.0.1:') or origin == 'http://127.0.0.1':
            return True
        return False

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

    return response

# Add CORS preflight handler for all routes
@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = jsonify({"status": "ok"})
        origin = request.headers.get('Origin')

        # Allow requests from hevolve domains and localhost
        allowed_origins = [
            'https://hevolve.ai',
            'https://www.hevolve.ai',
            'https://hevolve.hertzai.com',
            'https://www.hevolve.hertzai.com'
        ]

        def _is_allowed_origin(origin):
            if origin in allowed_origins:
                return True
            if origin.startswith('http://localhost:') or origin == 'http://localhost':
                return True
            if origin.startswith('http://127.0.0.1:') or origin == 'http://127.0.0.1':
                return True
            return False

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

@app.route('/probe', methods=['GET'])
def probe_endpoint():
    return jsonify({"status": "Probe successful", "message": "Service is operational"}), 200

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
    """Remove a model from the catalog."""
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        from models.catalog import get_catalog
        catalog = get_catalog()
        removed = catalog.unregister(model_id)
        return jsonify({"success": removed})
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


@app.route('/api/admin/models/<model_id>/download', methods=["POST"])
def admin_models_download(model_id):
    """Download a model without loading it."""
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        from models.orchestrator import get_orchestrator
        orch = get_orchestrator()
        success = orch.download(model_id)
        return jsonify({"success": success})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
    """Full lifecycle health dashboard: process health, crash state, swap queue, pressure."""
    try:
        from integrations.service_tools.model_lifecycle import get_model_lifecycle_manager
        mlm = get_model_lifecycle_manager()
        return jsonify(mlm.get_status())
    except ImportError:
        return jsonify({"error": "Lifecycle manager not available"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/models/swap', methods=["POST"])
def admin_models_swap():
    """Request a model swap: evict a GPU model to make room for another.

    Body: {"needed_model": "model_id", "evict_target": "optional_target_id"}
    """
    if not _is_local_request():
        return jsonify({"error": "local only"}), 403
    try:
        from integrations.service_tools.model_lifecycle import get_model_lifecycle_manager
        data = request.get_json(silent=True) or {}
        needed = data.get('needed_model')
        if not needed:
            return jsonify({"error": "needed_model required"}), 400
        mlm = get_model_lifecycle_manager()
        success = mlm.request_swap(
            needed_model=needed,
            evict_target=data.get('evict_target'),
        )
        return jsonify({"success": success, "needed_model": needed})
    except ImportError:
        return jsonify({"error": "Lifecycle manager not available"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
        # Return fallback image
        static_dir = os.path.join(LANDING_PAGE_BUILD_DIR, 'static', 'media')
        fallback_files = [f for f in os.listdir(static_dir) if f.startswith('AgentPoster')]
        if fallback_files:
            return send_from_directory(static_dir, fallback_files[0])
        return jsonify({'error': 'No image URL provided'}), 400

    try:
        # Validate URL
        parsed = urllib.parse.urlparse(image_url)
        if parsed.scheme not in ('http', 'https'):
            raise ValueError('Invalid URL scheme')

        # SSRF protection: block requests to private/internal networks
        hostname = parsed.hostname
        if not hostname or _is_private_ip(hostname):
            return jsonify({'error': 'Access to internal networks is not allowed'}), 403

        # Fetch the image
        response = requests.get(image_url, timeout=10, stream=True)
        response.raise_for_status()

        # Get content type
        content_type = response.headers.get('Content-Type', 'image/png')

        # Return the image
        return response.content, 200, {'Content-Type': content_type}
    except Exception as e:
        logging.warning(f"Image proxy failed for {image_url}: {e}")
        # Return fallback image on any error
        static_dir = os.path.join(LANDING_PAGE_BUILD_DIR, 'static', 'media')
        try:
            fallback_files = [f for f in os.listdir(static_dir) if f.startswith('AgentPoster')]
            if fallback_files:
                return send_from_directory(static_dir, fallback_files[0])
        except OSError:
            pass
        return jsonify({'error': 'Failed to fetch image'}), 500

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


@app.route('/local')
def serve_local_page():
    """Always serve local page (for offline use or testing)"""
    from flask import Response, send_from_directory
    index_path = os.path.join(LANDING_PAGE_BUILD_DIR, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(LANDING_PAGE_BUILD_DIR, 'index.html')
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
    """
    import json
    msg = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
    now = time.time()
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


@app.route('/api/social/events/stream')
def sse_event_stream():
    """Local SSE endpoint — fallback transport for flat/desktop topology.

    Frontend connects here only when the Crossbar worker reports disconnected.
    Requires a valid JWT token as ``?token=`` query parameter.
    """
    from flask import Response
    from flask import jsonify as _jsonify
    from flask import request as flask_request

    token = flask_request.args.get('token', '').strip()
    if not token:
        return _jsonify({"error": "Missing token query parameter"}), 401

    try:
        from integrations.social.auth import decode_jwt
        payload = decode_jwt(token)
        uid = payload.get('user_id')
        if not uid:
            return _jsonify({"error": "Invalid or expired token"}), 401
    except Exception:
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
    # For client-side routing, serve index.html
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

    # Serve React app for client-side routing
    index_path = os.path.join(LANDING_PAGE_BUILD_DIR, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(LANDING_PAGE_BUILD_DIR, 'index.html')
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
# ── Register social blueprints synchronously (fast — just route registration) ──
# The heavy init (DB, migrations, expert agents) is deferred to background.
if HARTOS_BACKEND_DIRECT:
    try:
        init_social(app)  # registers gamification_bp, discovery_bp, admin_bp
        from integrations.social.api import social_bp as _social_core_bp
        app.register_blueprint(_social_core_bp)  # auth, users, posts, feed
        logging.info("Social blueprints registered (routes available immediately)")
    except Exception as _bp_err:
        logging.warning(f"Social blueprint registration failed: {_bp_err}")

    try:
        from integrations.distributed_agent import distributed_agent_bp
        app.register_blueprint(distributed_agent_bp)
    except Exception:
        pass

    try:
        from routes import kids_media_routes
        kids_media_routes.register_routes(app)
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


def _deferred_social_init():
    """Heavy social init in background — DB, migrations, channels, agents."""
    if not HARTOS_BACKEND_DIRECT:
        return
    try:
        # DB + migrations (heavy I/O, safe to defer)
        init_db()
        try:
            from integrations.social.migrations import run_migrations
            run_migrations()
        except Exception as mig_err:
            logging.warning(f"hart-backend migrations: {mig_err}")
        logging.info(f"hart-backend DB initialized: {NUNBA_DB_PATH}")

        # Channel adapters (Telegram, Discord — background daemon threads)
        try:
            from core.port_registry import get_port
            from integrations.channels.flask_integration import init_channels
            init_channels(app, {
                'agent_api_url': f'http://localhost:{get_port("backend")}/chat',
                'default_user_id': 10077,
                'default_prompt_id': 8888,
                'device_id': DEVICE_ID,
            })
            logging.info("Channel adapters initialized")
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
        try:
            from routes.hartos_backend_adapter import _hartos_backend_available
            if _hartos_backend_available:
                logging.info("hart-backend available in-process (bundled), no subprocess needed")
            else:
                logging.warning("hart-backend import failed in bundled mode — chat will use llama.cpp fallback")
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
    """Start the VisionService in a daemon thread if GPU is available."""
    global _vision_service
    try:
        # Import from hart-backend (installed as git dependency)
        from integrations.vision import VisionService
        _vision_service = VisionService(
            ws_port=int(os.environ.get('VISION_WS_PORT', 5460)),
            minicpm_port=int(os.environ.get('HEVOLVE_MINICPM_PORT', 9891)),
        )
        _vision_service.start()
        logging.info("VisionService started (MiniCPM sidecar + frame receiver)")
    except ImportError:
        logging.info("VisionService not available (hart-backend vision module not found)")
    except Exception as e:
        logging.warning(f"VisionService failed to start: {e}")


def _start_diarization_service():
    """Start the DiarizationService in a daemon thread if whisperx available."""
    global _diarization_service
    try:
        from integrations.audio import DiarizationService
        _diarization_service = DiarizationService(
            port=int(os.environ.get('HEVOLVE_DIARIZATION_PORT', 8004)),
        )
        _diarization_service.start()
        logging.info("DiarizationService starting (sidecar)")
    except ImportError:
        logging.info("DiarizationService not available (whisperx not installed)")
    except Exception as e:
        logging.warning(f"DiarizationService failed to start: {e}")


if __name__ == '__main__':
    try:
        # Log Python version and environment info
        logging.info(f"Python version: {sys.version}")
        logging.info(f"Running from: {os.path.abspath(__file__)}")
        logging.info(f"Hevolve build directory: {LANDING_PAGE_BUILD_DIR}")

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

        # Start DiarizationService (speaker diarization sidecar) in daemon thread
        diarization_thread = threading.Thread(target=_start_diarization_service, daemon=True)
        diarization_thread.start()

        # Warm-up TTS engine in background (pre-loads model so first TTS request is fast)
        def _warmup_tts():
            try:
                if os.environ.get('NUNBA_DISABLE_TTS'):
                    return
                from tts.tts_engine import get_tts_engine
                engine = get_tts_engine()
                logging.info(f"TTS engine warmed up: {engine.get_info().get('active_backend', 'unknown')}")
            except Exception as e:
                logging.warning(f"TTS warm-up failed (non-blocking): {e}")
        tts_thread = threading.Thread(target=_warmup_tts, daemon=True, name='TTSWarmup')
        tts_thread.start()

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