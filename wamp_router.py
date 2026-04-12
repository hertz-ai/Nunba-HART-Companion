"""
Embedded WAMP Router — Lightweight pub/sub + RPC router for local/bundled mode.

The Nunba desktop app needs a WAMP router on port 8088 so that:
  - The React frontend (crossbarWorker.js) can subscribe to topics
  - The backend can publish events (chat, TTS, game state, social)
  - React Native clients on the same LAN can connect

In cloud/regional deployments, the Crossbar.io router at aws_rasa.hertzai.com
handles this. In bundled/local mode, that cloud router is unreachable.
This module provides a zero-dependency embedded replacement using only the
autobahn WebSocket server layer + manual WAMP v2 message routing.

Usage:
    from wamp_router import start_wamp_router, publish_local
    start_wamp_router()  # Non-blocking, runs in daemon thread
    publish_local('com.hertzai.hevolve.chat.user123', {'text': ['Hello']})

Protocol: WAMP v2 over WebSocket (JSON serialization only).
Supports: SUBSCRIBE, UNSUBSCRIBE, PUBLISH, REGISTER, UNREGISTER, CALL, YIELD.
"""

import asyncio
import json
import logging
import os
import threading
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger('nunba.wamp_router')

# ── WAMP Message Type IDs (RFC 6455 / WAMP v2 spec) ─────────────────────
HELLO = 1
WELCOME = 2
ABORT = 3
CHALLENGE = 4
AUTHENTICATE = 5
GOODBYE = 6
ERROR = 8
PUBLISH = 16
PUBLISHED = 17
SUBSCRIBE = 32
SUBSCRIBED = 33
UNSUBSCRIBE = 34
UNSUBSCRIBED = 35
EVENT = 36
CALL = 48
RESULT = 50
REGISTER = 64
REGISTERED = 65
UNREGISTER = 66
UNREGISTERED = 67
INVOCATION = 68
YIELD_MSG = 70

# ── Auth Token ──────────────────────────────────────────────────────────
# When NUNBA_WAMP_TICKET is set (or auto-generated for LAN mode),
# the router requires ticket auth.  When empty, anonymous is allowed.
import secrets
_wamp_ticket: Optional[str] = os.environ.get('NUNBA_WAMP_TICKET', '')


def _require_auth() -> bool:
    """True when the router requires ticket authentication."""
    return bool(_wamp_ticket)


def get_wamp_ticket() -> str:
    """Return the current WAMP ticket (for Flask API to serve to clients)."""
    return _wamp_ticket


def _enable_auth_for_lan():
    """Auto-generate a ticket when binding to non-localhost (LAN mode)."""
    global _wamp_ticket
    if not _wamp_ticket:
        _wamp_ticket = secrets.token_urlsafe(32)
        logger.info("WAMP auth enabled (auto-generated ticket for LAN mode)")

# ── Router State ─────────────────────────────────────────────────────────

_next_id = 0
_id_lock = threading.Lock()


def _gen_id() -> int:
    global _next_id
    with _id_lock:
        _next_id += 1
        return _next_id


class WampRealm:
    """Single WAMP realm with subscription and registration tracking."""

    def __init__(self, name: str = 'realm1'):
        self.name = name
        # topic -> set of (session_id, subscription_id)
        self.subscriptions: Dict[str, Set[Tuple[int, int]]] = defaultdict(set)
        # subscription_id -> (session_id, topic)
        self.sub_index: Dict[int, Tuple[int, str]] = {}
        # uri -> (session_id, registration_id)
        self.registrations: Dict[str, Tuple[int, int]] = {}
        # registration_id -> (session_id, uri)
        self.reg_index: Dict[int, Tuple[int, str]] = {}
        # invocation_id -> (caller_session_id, call_request_id)
        self.pending_calls: Dict[int, Tuple[int, int]] = {}
        self.lock = threading.Lock()


class WampSession:
    """Tracks one connected WAMP client."""

    def __init__(self, session_id: int, protocol):
        self.session_id = session_id
        self.protocol = protocol  # WebSocket protocol instance
        self.realm: Optional[str] = None
        self.authenticated: bool = False  # True after successful auth or when auth not required

    def send(self, msg: list):
        """Send a WAMP message (JSON-encoded list) to this client."""
        try:
            payload = json.dumps(msg, separators=(',', ':'))
            self.protocol.sendMessage(payload.encode('utf-8'), isBinary=False)
        except Exception as e:
            logger.debug("Send failed for session %d: %s", self.session_id, e)


# ── Global router state ──────────────────────────────────────────────────

_realms: Dict[str, WampRealm] = {}
_sessions: Dict[int, WampSession] = {}
_protocol_to_session: Dict[int, int] = {}  # id(protocol) -> session_id
_state_lock = threading.Lock()
_event_loop: Optional[asyncio.AbstractEventLoop] = None
_router_thread: Optional[threading.Thread] = None
_started = False


def _get_realm(name: str = 'realm1') -> WampRealm:
    if name not in _realms:
        _realms[name] = WampRealm(name)
    return _realms[name]


# ── WAMP Message Handlers ────────────────────────────────────────────────

def _send_welcome(session: WampSession, authid: str = 'anonymous',
                   authrole: str = 'anonymous', authmethod: str = 'anonymous'):
    """Send WELCOME message after successful auth (or when auth not required)."""
    session.authenticated = True
    welcome = [WELCOME, session.session_id, {
        'roles': {
            'broker': {
                'features': {
                    'publisher_identification': True,
                    'subscriber_blackwhite_listing': True,
                }
            },
            'dealer': {
                'features': {
                    'caller_identification': True,
                }
            },
        },
        'authid': authid,
        'authrole': authrole,
        'authmethod': authmethod,
    }]
    session.send(welcome)


def _handle_hello(session: WampSession, msg: list):
    """HELLO [realm, details] -> WELCOME or CHALLENGE"""
    realm_name = msg[1] if len(msg) > 1 else 'realm1'
    details = msg[2] if len(msg) > 2 else {}
    session.realm = realm_name
    _get_realm(realm_name)

    if _require_auth():
        # Check if client supports ticket auth
        client_methods = details.get('authmethods', [])
        if 'ticket' in client_methods:
            # Send CHALLENGE for ticket auth
            session.send([CHALLENGE, 'ticket', {}])
            logger.debug("Session %d: sent ticket CHALLENGE", session.session_id)
            return
        else:
            # Client doesn't support ticket auth — reject
            session.send([ABORT, {}, 'wamp.error.no_auth_method'])
            logger.warning("Session %d: rejected (no ticket auth support)",
                           session.session_id)
            return

    # No auth required — welcome immediately
    _send_welcome(session)
    logger.debug("Session %d joined realm '%s'", session.session_id, realm_name)


def _handle_authenticate(session: WampSession, msg: list):
    """AUTHENTICATE [signature, extra] -> WELCOME or ABORT"""
    import hmac as _hmac
    signature = msg[1] if len(msg) > 1 else ''

    if _require_auth() and _hmac.compare_digest(str(signature), _wamp_ticket):
        _send_welcome(session, authid='client', authrole='trusted',
                      authmethod='ticket')
        logger.debug("Session %d authenticated via ticket", session.session_id)
    else:
        session.send([ABORT, {}, 'wamp.error.not_authorized'])
        logger.warning("Session %d: ticket auth FAILED", session.session_id)


def _handle_goodbye(session: WampSession, msg: list):
    """GOODBYE [details, reason] -> GOODBYE"""
    session.send([GOODBYE, {}, 'wamp.close.goodbye_and_out'])


def _handle_subscribe(session: WampSession, msg: list):
    """SUBSCRIBE [request_id, options, topic] -> SUBSCRIBED"""
    request_id = msg[1]
    topic = msg[3] if len(msg) > 3 else ''

    if not topic:
        session.send([ERROR, SUBSCRIBE, request_id, {}, 'wamp.error.invalid_uri'])
        return

    realm = _get_realm(session.realm or 'realm1')
    sub_id = _gen_id()

    with realm.lock:
        realm.subscriptions[topic].add((session.session_id, sub_id))
        realm.sub_index[sub_id] = (session.session_id, topic)

    session.send([SUBSCRIBED, request_id, sub_id])
    logger.debug("Session %d subscribed to '%s' (sub_id=%d)",
                 session.session_id, topic, sub_id)


def _handle_unsubscribe(session: WampSession, msg: list):
    """UNSUBSCRIBE [request_id, subscription_id] -> UNSUBSCRIBED"""
    request_id = msg[1]
    sub_id = msg[2] if len(msg) > 2 else 0

    realm = _get_realm(session.realm or 'realm1')

    with realm.lock:
        if sub_id in realm.sub_index:
            sid, topic = realm.sub_index.pop(sub_id)
            realm.subscriptions[topic].discard((sid, sub_id))
            if not realm.subscriptions[topic]:
                del realm.subscriptions[topic]

    session.send([UNSUBSCRIBED, request_id])


def _handle_publish(session: WampSession, msg: list):
    """PUBLISH [request_id, options, topic, args?, kwargs?] -> EVENT to subscribers"""
    request_id = msg[1]
    options = msg[2] if len(msg) > 2 else {}
    topic = msg[3] if len(msg) > 3 else ''
    args = msg[4] if len(msg) > 4 else []
    kwargs = msg[5] if len(msg) > 5 else {}

    if not topic:
        return

    realm = _get_realm(session.realm or 'realm1')
    acknowledge = options.get('acknowledge', False)
    exclude_me = options.get('exclude_me', True)

    pub_id = _gen_id()

    if acknowledge:
        session.send([PUBLISHED, request_id, pub_id])

    # Deliver EVENT to all subscribers
    _deliver_event(realm, topic, args, kwargs, pub_id,
                   exclude_session=session.session_id if exclude_me else None)


def _deliver_event(realm: WampRealm, topic: str, args: list, kwargs: dict,
                   pub_id: int, exclude_session: Optional[int] = None):
    """Deliver an EVENT message to all subscribers of a topic."""
    with realm.lock:
        subscribers = list(realm.subscriptions.get(topic, set()))

    for (sid, sub_id) in subscribers:
        if exclude_session is not None and sid == exclude_session:
            continue
        with _state_lock:
            target = _sessions.get(sid)
        if target:
            event = [EVENT, sub_id, pub_id, {}]
            if args:
                event.append(args)
            if kwargs:
                if len(event) == 4:
                    event.append([])
                event.append(kwargs)
            target.send(event)


def _handle_register(session: WampSession, msg: list):
    """REGISTER [request_id, options, procedure] -> REGISTERED"""
    request_id = msg[1]
    procedure = msg[3] if len(msg) > 3 else ''

    if not procedure:
        session.send([ERROR, REGISTER, request_id, {}, 'wamp.error.invalid_uri'])
        return

    realm = _get_realm(session.realm or 'realm1')
    reg_id = _gen_id()

    with realm.lock:
        if procedure in realm.registrations:
            session.send([ERROR, REGISTER, request_id, {},
                          'wamp.error.procedure_already_exists'])
            return
        realm.registrations[procedure] = (session.session_id, reg_id)
        realm.reg_index[reg_id] = (session.session_id, procedure)

    session.send([REGISTERED, request_id, reg_id])
    logger.debug("Session %d registered '%s' (reg_id=%d)",
                 session.session_id, procedure, reg_id)


def _handle_unregister(session: WampSession, msg: list):
    """UNREGISTER [request_id, registration_id] -> UNREGISTERED"""
    request_id = msg[1]
    reg_id = msg[2] if len(msg) > 2 else 0

    realm = _get_realm(session.realm or 'realm1')

    with realm.lock:
        if reg_id in realm.reg_index:
            sid, procedure = realm.reg_index.pop(reg_id)
            if procedure in realm.registrations:
                del realm.registrations[procedure]

    session.send([UNREGISTERED, request_id])


def _handle_call(session: WampSession, msg: list):
    """CALL [request_id, options, procedure, args?, kwargs?] -> INVOCATION to callee"""
    request_id = msg[1]
    procedure = msg[3] if len(msg) > 3 else ''
    args = msg[4] if len(msg) > 4 else []
    kwargs = msg[5] if len(msg) > 5 else {}

    realm = _get_realm(session.realm or 'realm1')

    with realm.lock:
        reg = realm.registrations.get(procedure)

    if not reg:
        session.send([ERROR, CALL, request_id, {},
                      'wamp.error.no_such_procedure'])
        return

    callee_sid, reg_id = reg
    inv_id = _gen_id()

    with realm.lock:
        realm.pending_calls[inv_id] = (session.session_id, request_id)

    with _state_lock:
        callee = _sessions.get(callee_sid)

    if callee:
        invocation = [INVOCATION, inv_id, reg_id, {}]
        if args:
            invocation.append(args)
        if kwargs:
            if len(invocation) == 4:
                invocation.append([])
            invocation.append(kwargs)
        callee.send(invocation)
    else:
        session.send([ERROR, CALL, request_id, {},
                      'wamp.error.no_such_procedure'])


def _handle_yield(session: WampSession, msg: list):
    """YIELD [request_id, options, args?, kwargs?] -> RESULT to caller"""
    inv_id = msg[1]
    args = msg[3] if len(msg) > 3 else []
    kwargs = msg[4] if len(msg) > 4 else {}

    realm = _get_realm(session.realm or 'realm1')

    with realm.lock:
        call_info = realm.pending_calls.pop(inv_id, None)

    if not call_info:
        return

    caller_sid, call_request_id = call_info
    with _state_lock:
        caller = _sessions.get(caller_sid)

    if caller:
        result = [RESULT, call_request_id, {}]
        if args:
            result.append(args)
        if kwargs:
            if len(result) == 3:
                result.append([])
            result.append(kwargs)
        caller.send(result)


# ── Message Dispatch ─────────────────────────────────────────────────────

# Handlers that don't require authentication (pre-auth phase)
_PRE_AUTH_HANDLERS = {
    HELLO: _handle_hello,
    AUTHENTICATE: _handle_authenticate,
    GOODBYE: _handle_goodbye,
}

# Handlers that require authentication
_AUTH_HANDLERS = {
    SUBSCRIBE: _handle_subscribe,
    UNSUBSCRIBE: _handle_unsubscribe,
    PUBLISH: _handle_publish,
    REGISTER: _handle_register,
    UNREGISTER: _handle_unregister,
    CALL: _handle_call,
    YIELD_MSG: _handle_yield,
}


def _dispatch_message(session: WampSession, raw: str):
    """Parse and dispatch a WAMP message from a client."""
    try:
        msg = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        logger.debug("Invalid JSON from session %d", session.session_id)
        return

    if not isinstance(msg, list) or len(msg) < 1:
        return

    msg_type = msg[0]

    # Pre-auth handlers (HELLO, AUTHENTICATE, GOODBYE) always allowed
    handler = _PRE_AUTH_HANDLERS.get(msg_type)
    if handler:
        try:
            handler(session, msg)
        except Exception as e:
            logger.warning("Handler error for msg_type %d: %s", msg_type, e)
        return

    # Auth-required handlers — reject if session not authenticated
    handler = _AUTH_HANDLERS.get(msg_type)
    if handler:
        if not session.authenticated:
            logger.warning("Session %d: msg_type %d rejected (not authenticated)",
                           session.session_id, msg_type)
            return
        try:
            handler(session, msg)
        except Exception as e:
            logger.warning("Handler error for msg_type %d: %s", msg_type, e)
    else:
        logger.debug("Unhandled WAMP message type: %d", msg_type)


# ── Session Lifecycle ────────────────────────────────────────────────────

def _on_session_open(protocol):
    """Called when a new WebSocket connection opens."""
    session_id = _gen_id()
    session = WampSession(session_id, protocol)
    with _state_lock:
        _sessions[session_id] = session
        _protocol_to_session[id(protocol)] = session_id
    logger.debug("WebSocket connected -> session %d", session_id)
    return session


def _on_session_close(protocol):
    """Called when a WebSocket connection closes. Cleans up subscriptions & registrations."""
    with _state_lock:
        session_id = _protocol_to_session.pop(id(protocol), None)
        session = _sessions.pop(session_id, None) if session_id else None

    if not session:
        return

    realm_name = session.realm or 'realm1'
    realm = _get_realm(realm_name)

    # Clean up subscriptions
    with realm.lock:
        dead_subs = [sub_id for sub_id, (sid, _) in realm.sub_index.items()
                     if sid == session.session_id]
        for sub_id in dead_subs:
            sid, topic = realm.sub_index.pop(sub_id)
            realm.subscriptions[topic].discard((sid, sub_id))
            if not realm.subscriptions[topic]:
                del realm.subscriptions[topic]

        # Clean up registrations
        dead_regs = [reg_id for reg_id, (sid, _) in realm.reg_index.items()
                     if sid == session.session_id]
        for reg_id in dead_regs:
            sid, uri = realm.reg_index.pop(reg_id)
            if uri in realm.registrations:
                del realm.registrations[uri]

        # Clean up pending calls
        dead_calls = [inv_id for inv_id, (caller_sid, _) in realm.pending_calls.items()
                      if caller_sid == session.session_id]
        for inv_id in dead_calls:
            del realm.pending_calls[inv_id]

    logger.debug("Session %d disconnected, cleaned up", session.session_id)


def _on_message(protocol, payload: bytes, is_binary: bool):
    """Called when a WebSocket message is received."""
    with _state_lock:
        session_id = _protocol_to_session.get(id(protocol))
        session = _sessions.get(session_id) if session_id else None

    if not session:
        return

    if is_binary:
        # WAMP JSON serialization uses text frames
        return

    raw = payload.decode('utf-8', errors='replace')
    _dispatch_message(session, raw)


# ── Public API: Publish from Backend ─────────────────────────────────────

def publish_local(topic: str, args: Any = None, kwargs: dict = None,
                  realm_name: str = 'realm1'):
    """Publish an event from the backend into the WAMP router.

    Called by chatbot_routes, TTS engine, realtime.py to push events
    to all subscribed frontends.

    Args:
        topic: WAMP topic URI (e.g., 'com.hertzai.hevolve.chat.user123')
        args: Positional arguments (will be wrapped in a list)
        kwargs: Keyword arguments
        realm_name: WAMP realm (default 'realm1')
    """
    if not _started:
        return

    if args is None:
        args = []
    elif not isinstance(args, list):
        args = [args]

    if kwargs is None:
        kwargs = {}

    realm = _get_realm(realm_name)
    pub_id = _gen_id()
    _deliver_event(realm, topic, args, kwargs, pub_id)


def is_running() -> bool:
    """Check if the embedded WAMP router is running."""
    return _started


def get_stats() -> dict:
    """Return router statistics."""
    with _state_lock:
        session_count = len(_sessions)

    realm = _get_realm('realm1')
    with realm.lock:
        sub_count = sum(len(subs) for subs in realm.subscriptions.values())
        topic_count = len(realm.subscriptions)
        reg_count = len(realm.registrations)

    return {
        'running': _started,
        'sessions': session_count,
        'subscriptions': sub_count,
        'topics': topic_count,
        'registrations': reg_count,
    }


# ── Server Startup ───────────────────────────────────────────────────────

def _run_router(port: int, host: str):
    """Run the WAMP router (called in a daemon thread)."""
    global _event_loop, _started

    try:
        from autobahn.asyncio.websocket import (
            WebSocketServerProtocol,
            WebSocketServerFactory,
        )
    except ImportError:
        logger.error("autobahn not available — WAMP router cannot start")
        return

    class WampRouterProtocol(WebSocketServerProtocol):
        """WebSocket protocol that routes WAMP messages."""

        def onConnect(self, request):
            """Handle WebSocket handshake — negotiate WAMP subprotocol.

            Autobahn clients request 'wamp.2.json' (and optionally 'wamp.2.cbor').
            We only support JSON serialization, so we accept 'wamp.2.json'.
            If no recognized subprotocol is requested, accept anyway (plain WS).
            """
            for protocol in request.protocols:
                if protocol == 'wamp.2.json':
                    return protocol
            # Accept connection even without subprotocol (for raw WebSocket clients)
            return None

        def onOpen(self):
            _on_session_open(self)

        def onClose(self, wasClean, code, reason):
            _on_session_close(self)

        def onMessage(self, payload, isBinary):
            _on_message(self, payload, isBinary)

    _event_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_event_loop)

    factory = WebSocketServerFactory(f'ws://{host}:{port}')
    factory.protocol = WampRouterProtocol

    try:
        coro = _event_loop.create_server(factory, host, port)
        server = _event_loop.run_until_complete(coro)
        _started = True
        logger.info("WAMP router listening on ws://%s:%d/ws", host, port)
        _event_loop.run_forever()
    except OSError as e:
        if 'address already in use' in str(e).lower() or getattr(e, 'errno', 0) == 10048:
            logger.info("WAMP router port %d already in use — assuming external router", port)
            _started = True  # External router is fine
        else:
            logger.error("WAMP router failed to start: %s", e)
    except Exception as e:
        logger.error("WAMP router failed to start: %s", e)
    finally:
        if not _started:
            logger.warning("WAMP router did not start — realtime features will use SSE fallback")


def start_wamp_router(port: int = 8088, host: str = '127.0.0.1') -> bool:
    """Start the embedded WAMP router in a daemon thread.

    Non-blocking. Returns True if startup was initiated.
    Safe to call multiple times (idempotent).

    Security: defaults to 127.0.0.1 (localhost only). Set host='0.0.0.0'
    explicitly for regional/LAN deployments where React Native clients
    connect from other devices. Ticket auth is auto-enabled for LAN mode.

    Args:
        port: WebSocket port (default 8088, matching crossbarWorker.js expectation)
        host: Bind address (default 127.0.0.1 — localhost only for security)
    """
    global _router_thread, _started

    if _started or (_router_thread and _router_thread.is_alive()):
        return True

    # Allow port override via environment variable
    port = int(os.environ.get('NUNBA_WAMP_PORT', port))

    # Auto-enable ticket auth when binding to LAN (non-localhost)
    if host != '127.0.0.1':
        _enable_auth_for_lan()

    _router_thread = threading.Thread(
        target=_run_router, args=(port, host),
        daemon=True, name='WampRouter',
    )
    _router_thread.start()

    # Register with watchdog so silent crashes are detected and auto-restarted
    _register_with_watchdog(port, host)

    return True


def _register_with_watchdog(port: int, host: str):
    """Register WAMP router with the node watchdog for crash detection."""
    try:
        from security.node_watchdog import get_watchdog
        wd = get_watchdog()
        if wd and not wd.is_registered('wamp_router'):
            wd.register(
                name='wamp_router',
                expected_interval=60,
                restart_fn=lambda: start_wamp_router(port, host),
                stop_fn=stop_wamp_router,
            )
            # Start a heartbeat thread that pulses while the router is alive
            _start_heartbeat_thread()
    except ImportError:
        pass  # watchdog not available (standalone mode)


_heartbeat_thread: Optional[threading.Thread] = None


def _start_heartbeat_thread():
    """Pulse a watchdog heartbeat every 30s while the router is alive."""
    global _heartbeat_thread
    if _heartbeat_thread and _heartbeat_thread.is_alive():
        return

    def _pulse():
        try:
            from security.node_watchdog import get_watchdog
        except ImportError:
            return
        while _started:
            wd = get_watchdog()
            if wd:
                wd.heartbeat('wamp_router')
            import time
            time.sleep(30)

    _heartbeat_thread = threading.Thread(target=_pulse, daemon=True,
                                         name='WampRouterHeartbeat')
    _heartbeat_thread.start()


def stop_wamp_router():
    """Stop the embedded WAMP router (for clean shutdown)."""
    global _started, _event_loop
    _started = False
    if _event_loop and _event_loop.is_running():
        _event_loop.call_soon_threadsafe(_event_loop.stop)

    # Unregister from watchdog
    try:
        from security.node_watchdog import get_watchdog
        wd = get_watchdog()
        if wd:
            wd.unregister('wamp_router')
    except ImportError:
        pass
