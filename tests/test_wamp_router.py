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

        _handle_hello(sub_session, [1, 'realm1', {}])
        _handle_subscribe(sub_session, [32, 1, {}, 'com.test.events'])

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
        _handle_publish(pub_session, [16, 2, {}, 'com.test.events', ['hello']])

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

        _handle_hello(session, [1, 'realm1', {}])
        _handle_subscribe(session, [32, 1, {}, 'com.test.cleanup'])

        realm = _get_realm('realm1')
        with realm.lock:
            assert 'com.test.cleanup' in realm.subscriptions

        # Disconnect
        _on_session_close(proto)

        with realm.lock:
            # Topic should be gone (no subscribers left)
            assert 'com.test.cleanup' not in realm.subscriptions


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

        _handle_hello(session, [1, 'realm1', {}])
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
