"""
test_wamp_router.py - Tests for the embedded WAMP router.

Validates:
- Module imports and state initialization
- WAMP message dispatch (HELLO, SUBSCRIBE, PUBLISH, EVENT delivery)
- Session lifecycle (connect, disconnect, cleanup)
- Backend publish_local() API
- Thread safety of shared state
"""
import json
import os
import sys
import threading
import time

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


class TestWampRouterImport:
    """Basic import and API surface tests."""

    def test_import_module(self):
        import wamp_router
        assert hasattr(wamp_router, 'start_wamp_router')
        assert hasattr(wamp_router, 'publish_local')
        assert hasattr(wamp_router, 'is_running')
        assert hasattr(wamp_router, 'get_stats')
        assert hasattr(wamp_router, 'stop_wamp_router')

    def test_initial_state(self):
        from wamp_router import get_stats, is_running
        # Before starting, router should report not running
        # (may be running from other tests, so just check structure)
        stats = get_stats()
        assert 'running' in stats
        assert 'sessions' in stats
        assert 'subscriptions' in stats
        assert 'topics' in stats
        assert 'registrations' in stats

    def test_publish_local_noop_when_not_started(self):
        """publish_local should silently no-op when router isn't running."""
        # Save and temporarily clear
        import wamp_router as wr
        from wamp_router import _started, publish_local
        old = wr._started
        wr._started = False
        try:
            # Should not raise
            publish_local('com.test.topic', {'msg': 'hello'})
        finally:
            wr._started = old


class TestWampMessageHandlers:
    """Unit tests for WAMP message handlers (no network)."""

    def test_handle_hello_welcome(self):
        from wamp_router import WampSession, _gen_id, _get_realm, _handle_hello

        sent = []
        class FakeProto:
            def sendMessage(self, payload, isBinary=False):
                sent.append(json.loads(payload))

        session = WampSession(_gen_id(), FakeProto())
        _handle_hello(session, [1, 'realm1', {}])

        assert session.realm == 'realm1'
        assert len(sent) == 1
        msg = sent[0]
        assert msg[0] == 2  # WELCOME
        assert 'broker' in msg[2]['roles']
        assert 'dealer' in msg[2]['roles']

    def test_handle_subscribe_and_publish(self):
        from wamp_router import (
            WampSession,
            _gen_id,
            _get_realm,
            _handle_hello,
            _handle_publish,
            _handle_subscribe,
            _protocol_to_session,
            _sessions,
            _state_lock,
        )

        events_received = []

        class FakeProto:
            def sendMessage(self, payload, isBinary=False):
                msg = json.loads(payload)
                if msg[0] == 36:  # EVENT
                    events_received.append(msg)

        # Create subscriber session
        sub_proto = FakeProto()
        sub_session = WampSession(_gen_id(), sub_proto)
        with _state_lock:
            _sessions[sub_session.session_id] = sub_session
            _protocol_to_session[id(sub_proto)] = sub_session.session_id

        # Use a public-prefix topic — per-topic authorization (Task #300/#301)
        # requires either a public prefix OR per-user segment match. Plain
        # 'com.test.events' would be refused. 'chat.social' is in the
        # canonical HARTOS public whitelist.
        _handle_hello(sub_session, [1, 'realm1', {}])
        _handle_subscribe(sub_session, [32, 1, {}, 'chat.social'])

        # Create publisher session
        pub_sent = []
        class PubProto:
            def sendMessage(self, payload, isBinary=False):
                pub_sent.append(json.loads(payload))

        pub_proto = PubProto()
        pub_session = WampSession(_gen_id(), pub_proto)
        with _state_lock:
            _sessions[pub_session.session_id] = pub_session
            _protocol_to_session[id(pub_proto)] = pub_session.session_id

        _handle_hello(pub_session, [1, 'realm1', {}])
        _handle_publish(pub_session, [16, 2, {}, 'chat.social', ['hello']])

        # Subscriber should have received the event
        assert len(events_received) >= 1
        event = events_received[-1]
        assert event[0] == 36  # EVENT
        assert event[3] == {}  # details
        assert 'hello' in event[4]  # args

        # Cleanup
        with _state_lock:
            _sessions.pop(sub_session.session_id, None)
            _sessions.pop(pub_session.session_id, None)
            _protocol_to_session.pop(id(sub_proto), None)
            _protocol_to_session.pop(id(pub_proto), None)

    def test_handle_goodbye(self):
        from wamp_router import WampSession, _gen_id, _handle_goodbye

        sent = []
        class FakeProto:
            def sendMessage(self, payload, isBinary=False):
                sent.append(json.loads(payload))

        session = WampSession(_gen_id(), FakeProto())
        _handle_goodbye(session, [6, {}, 'wamp.close.normal'])

        assert len(sent) == 1
        assert sent[0][0] == 6  # GOODBYE
        assert sent[0][2] == 'wamp.close.goodbye_and_out'

    def test_session_cleanup_removes_subscriptions(self):
        from wamp_router import (
            WampSession,
            _gen_id,
            _get_realm,
            _handle_hello,
            _handle_subscribe,
            _on_session_close,
            _protocol_to_session,
            _sessions,
            _state_lock,
        )

        class FakeProto:
            def sendMessage(self, payload, isBinary=False):
                pass

        proto = FakeProto()
        session = WampSession(_gen_id(), proto)
        with _state_lock:
            _sessions[session.session_id] = session
            _protocol_to_session[id(proto)] = session.session_id

        # Use a public-prefix topic distinct from other tests so the
        # shared module-level realm state doesn't collide (the other
        # test uses 'chat.social'; both are in _PUBLIC_TOPIC_PREFIXES).
        _handle_hello(session, [1, 'realm1', {}])
        _handle_subscribe(session, [32, 1, {}, 'community.feed'])

        realm = _get_realm('realm1')
        with realm.lock:
            assert 'community.feed' in realm.subscriptions

        # Disconnect
        _on_session_close(proto)

        with realm.lock:
            # Topic should be gone (no subscribers left)
            assert 'community.feed' not in realm.subscriptions


class TestBackendPublish:
    """Test publish_local() delivers events to subscribers."""

    def test_publish_local_delivers_to_subscriber(self):
        import wamp_router as wr
        from wamp_router import (
            WampSession,
            _gen_id,
            _handle_hello,
            _handle_subscribe,
            _protocol_to_session,
            _sessions,
            _state_lock,
            publish_local,
        )
        old_started = wr._started
        wr._started = True

        events = []
        class FakeProto:
            def sendMessage(self, payload, isBinary=False):
                msg = json.loads(payload)
                if msg[0] == 36:  # EVENT
                    events.append(msg)

        proto = FakeProto()
        session = WampSession(_gen_id(), proto)
        with _state_lock:
            _sessions[session.session_id] = session
            _protocol_to_session[id(proto)] = session.session_id

        # Subscribe as user99 — the topic is per-user scoped (last segment
        # must match authid for auth to pass, per tasks #300/#301).
        _handle_hello(session, [1, 'realm1', {'authid': 'user99'}])
        _handle_subscribe(session, [32, 1, {}, 'com.hertzai.hevolve.chat.user99'])

        publish_local('com.hertzai.hevolve.chat.user99',
                      {'text': ['Backend says hello']})

        assert len(events) >= 1
        event = events[-1]
        assert event[4][0]['text'] == ['Backend says hello']

        # Cleanup
        wr._started = old_started
        with _state_lock:
            _sessions.pop(session.session_id, None)
            _protocol_to_session.pop(id(proto), None)


class TestWampRouterConstants:
    """Verify WAMP message type constants match the spec."""

    def test_message_type_ids(self):
        from wamp_router import (
            ABORT,
            CALL,
            ERROR,
            EVENT,
            GOODBYE,
            HELLO,
            INVOCATION,
            PUBLISH,
            PUBLISHED,
            REGISTER,
            REGISTERED,
            RESULT,
            SUBSCRIBE,
            SUBSCRIBED,
            UNREGISTER,
            UNREGISTERED,
            UNSUBSCRIBE,
            UNSUBSCRIBED,
            WELCOME,
            YIELD_MSG,
        )
        assert HELLO == 1
        assert WELCOME == 2
        assert ABORT == 3
        assert GOODBYE == 6
        assert ERROR == 8
        assert PUBLISH == 16
        assert PUBLISHED == 17
        assert SUBSCRIBE == 32
        assert SUBSCRIBED == 33
        assert UNSUBSCRIBE == 34
        assert UNSUBSCRIBED == 35
        assert EVENT == 36
        assert CALL == 48
        assert RESULT == 50
        assert REGISTER == 64
        assert REGISTERED == 65
        assert UNREGISTER == 66
        assert UNREGISTERED == 67
        assert INVOCATION == 68
        assert YIELD_MSG == 70


# ──────────────────────────────────────────────────────────────────────
# Task #325 / G5 — autobahn shutdown ordering regression guards.
#
# The race that motivated this:
#  - main.py imports HARTOS → integrations.service_tools.runtime_manager
#    registers runtime_tool_manager.stop_all via atexit at module load.
#  - main.py later calls start_wamp_router() which spawns an asyncio
#    loop with pending create_task()'s (chat publish fan-out, etc).
#  - On process exit (tray quit, SIGTERM), atexit LIFO runs
#    runtime_manager.stop_all FIRST — it tears down the ThreadPoolExecutor
#    that HARTOS tool calls share with the WAMP event handlers.
#  - Wamp tasks then try to schedule callbacks on the shut-down executor:
#    ``RuntimeError: cannot schedule new futures after shutdown``.
#
# The fix has two moving parts that both need regression tests:
#  1. start_wamp_router registers stop_wamp_router via atexit, AFTER
#     HARTOS has already registered (LIFO → ours runs first).
#  2. stop_wamp_router drains pending asyncio tasks with a bounded
#     timeout before stopping the loop, so nothing scheduled on the
#     HARTOS executor survives past our shutdown hook.
# ──────────────────────────────────────────────────────────────────────

class TestShutdownOrdering:

    def test_atexit_registered_only_once(self):
        """start_wamp_router idempotency must not stack atexit callbacks."""
        import atexit
        import wamp_router as wr

        # Reset the module-level guard so this test is deterministic
        # regardless of whether an earlier test already started the router.
        original_registered = wr._atexit_registered
        wr._atexit_registered = False

        registered: list = []

        def fake_register(fn, *args, **kwargs):
            registered.append(fn)
            return fn

        original_register = atexit.register
        atexit.register = fake_register  # type: ignore[assignment]
        try:
            # Simulate the tail of start_wamp_router: register once, then
            # a second caller comes in and must NOT re-register.
            if not wr._atexit_registered:
                atexit.register(wr.stop_wamp_router)
                wr._atexit_registered = True

            if not wr._atexit_registered:
                atexit.register(wr.stop_wamp_router)   # pragma: no cover
                wr._atexit_registered = True

            assert len(registered) == 1
            assert registered[0] is wr.stop_wamp_router
        finally:
            atexit.register = original_register  # type: ignore[assignment]
            wr._atexit_registered = original_registered

    def test_stop_without_running_loop_is_noop(self):
        """Calling stop when the router never started must not raise."""
        import wamp_router as wr

        original_loop = wr._event_loop
        original_started = wr._started
        wr._event_loop = None
        wr._started = False
        try:
            # Must not raise, must not hang.
            wr.stop_wamp_router(drain_timeout_s=0.1)
            assert wr._started is False
        finally:
            wr._event_loop = original_loop
            wr._started = original_started

    def test_stop_drains_pending_tasks_before_loop_stop(self):
        """Pending asyncio tasks must be cancelled+awaited before the
        loop stops — otherwise their done-callbacks can try to schedule
        new work on a shut-down HARTOS executor."""
        import asyncio
        import threading

        import wamp_router as wr

        loop_started = threading.Event()
        loop_done = threading.Event()
        cancelled_seen: list[bool] = []

        async def _long_task():
            try:
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                cancelled_seen.append(True)
                raise

        def _run_loop(loop):
            asyncio.set_event_loop(loop)
            loop.create_task(_long_task())
            loop_started.set()
            try:
                loop.run_forever()
            finally:
                loop.close()
                loop_done.set()

        test_loop = asyncio.new_event_loop()
        t = threading.Thread(target=_run_loop, args=(test_loop,), daemon=True)

        # Wire our loop into the wamp_router module so stop_wamp_router
        # drains THIS loop (and only THIS loop).
        original_loop = wr._event_loop
        original_started = wr._started
        wr._event_loop = test_loop
        wr._started = True

        try:
            t.start()
            assert loop_started.wait(timeout=2.0), "test loop never started"

            # Give the create_task'd coroutine a beat to actually start
            # awaiting asyncio.sleep(10) so all_tasks() can see it.
            time.sleep(0.05)

            wr.stop_wamp_router(drain_timeout_s=2.0)

            assert loop_done.wait(timeout=3.0), (
                "loop did not exit after stop_wamp_router"
            )
            assert cancelled_seen == [True], (
                "pending task was not cancelled before loop stopped"
            )
        finally:
            wr._event_loop = original_loop
            wr._started = original_started
            if t.is_alive():
                t.join(timeout=1.0)
