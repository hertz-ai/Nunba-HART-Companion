"""Shared authentication decorators for Nunba Flask routes.

Single source of truth — used by main.py and chatbot_routes.py.
"""
import hmac
import os
from functools import wraps

from flask import jsonify, request

# Read once at import time (not per-request)
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
        return forwarded_for in ('127.0.0.1', '::1', 'localhost')
    # Direct connection - check remote_addr
    return request.remote_addr in ('127.0.0.1', '::1')


def require_local_or_token(f):
    """Decorator to protect sensitive endpoints.

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

        return jsonify({
            'error': 'Unauthorized',
            'message': 'This endpoint requires local access or valid API token'
        }), 401

    return decorated_function
