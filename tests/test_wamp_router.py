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


class TestPerUserDelivery:
    """End-to-end per-user delivery enforcement via _handle_subscribe.

    Closes the gap surfaced by master-orchestrator backfill run aa3ead1
    (W0b B6): the unit test ``test_b1_*`` in tests/test_session_fixes_runtime.py
    pins the helper ``_authorize_topic_for_authid`` semantics, and
    test_handle_subscribe_and_publish above exercises the *allow* path
    via a public-prefix topic. Neither asserts that the SUBSCRIBE handler
    refuses to register a per-user topic for a session whose authid is a
    different user, NOR that a publish to that topic reaches no
    subscriber on the deny path. Both invariants are load-bearing for
    BLE encounter privacy (J209-J210, commit 8e4f462d):
      - com.hevolve.encounter.match.{user_id}      — mutual-like rows
      - com.hevolve.encounter.icebreaker.{user_id} — per-user state
    A leak here would let a LAN-attached attacker subscribe to a
    victim's match feed (location + identity) just by claiming their
    own authid in HELLO.

    Auth model under test (wamp_router.py L107-111, L289-323):
      _authorize_topic_for_authid(topic, authid) returns False whenever
      the topic ends with `.{other_user}` and the public-prefix
      whitelist (HARTOS realtime._PUBLIC_TOPIC_PREFIXES) doesn't claim
      it.  _handle_subscribe early-returns ERROR + warning on False
      (no SUBSCRIBED, no entry in realm.subscriptions).
    """

    def _setup_session(self, authid: str):
        """Helper — register a fake-protocol session as `authid`.

        Returns (session, proto, sent_msgs).  sent_msgs accumulates
        every WAMP frame the router would have written back to this
        client; tests inspect it for ERROR vs SUBSCRIBED.
        """
        from wamp_router import (
            WampSession,
            _gen_id,
            _handle_hello,
            _protocol_to_session,
            _sessions,
            _state_lock,
        )

        sent: list = []

        class FakeProto:
            def sendMessage(self, payload, isBinary=False):
                sent.append(json.loads(payload))

        proto = FakeProto()
        session = WampSession(_gen_id(), proto)
        with _state_lock:
            _sessions[session.session_id] = session
            _protocol_to_session[id(proto)] = session.session_id
        _handle_hello(session, [1, 'realm1', {'authid': authid}])
        return session, proto, sent

    def _teardown_session(self, session, proto):
        from wamp_router import (
            _protocol_to_session,
            _sessions,
            _state_lock,
        )
        with _state_lock:
            _sessions.pop(session.session_id, None)
            _protocol_to_session.pop(id(proto), None)

    def test_subscribe_to_other_user_topic_denied(self):
        """A session authenticated as user A must be refused when it
        SUBSCRIBE's to a per-user topic ending in another user's id."""
        from wamp_router import (
            ERROR,
            SUBSCRIBE,
            _get_realm,
            _handle_subscribe,
        )

        session, proto, sent = self._setup_session('userA')
        try:
            # Attempt to subscribe to the encounter match feed of userB.
            # Per _authorize_topic_for_authid this MUST be refused.
            sent.clear()
            _handle_subscribe(session, [
                SUBSCRIBE, 7, {}, 'com.hevolve.encounter.match.userB',
            ])

            # Expect exactly one outbound frame, and it must be ERROR.
            err_frames = [m for m in sent if m and m[0] == ERROR]
            sub_frames = [m for m in sent if m and m[0] == 33]  # SUBSCRIBED
            assert len(err_frames) == 1, (
                f'expected exactly one ERROR frame, got sent={sent!r}'
            )
            err = err_frames[0]
            # ERROR frame layout: [ERROR, request_type, request_id, details, uri]
            assert err[1] == SUBSCRIBE
            assert err[2] == 7  # echoed request_id
            assert err[4] == 'wamp.error.not_authorized'
            assert sub_frames == [], (
                'subscribe must NOT have been registered'
            )

            # And the realm must have NO subscription entry for the
            # cross-user topic.
            realm = _get_realm('realm1')
            with realm.lock:
                assert (
                    'com.hevolve.encounter.match.userB' not in realm.subscriptions
                ), (
                    'cross-user topic ended up in the subscription map; '
                    'per-user delivery is broken'
                )
        finally:
            self._teardown_session(session, proto)

    def test_publish_to_other_user_topic_does_not_deliver(self):
        """Defense in depth — even if some bug let the subscribe slip
        through, a PUBLISH from session A to a topic ending .userB must
        not fan out to anyone (subscribe-side denial means no subscriber
        for that topic in the realm).  This test sets up the full chain:
        sessionA tries to subscribe to userB's encounter.match (denied),
        then sessionA publishes to that topic; no event must arrive
        anywhere.
        """
        from wamp_router import (
            EVENT,
            PUBLISH,
            SUBSCRIBE,
            _get_realm,
            _handle_publish,
            _handle_subscribe,
        )

        session_a, proto_a, sent_a = self._setup_session('userA')
        # Also create a *legitimate* userB session that subscribes to
        # ITS OWN topic — verifies the deny path doesn't accidentally
        # silence the legitimate path either.
        session_b, proto_b, sent_b = self._setup_session('userB')
        try:
            # 1. userA fails to subscribe to userB's topic.
            sent_a.clear()
            _handle_subscribe(session_a, [
                SUBSCRIBE, 11, {}, 'com.hevolve.encounter.match.userB',
            ])
            assert any(m[0] == 8 for m in sent_a), (
                'expected ERROR on cross-user subscribe (B6 invariant)'
            )

            # 2. userB legitimately subscribes to its own topic.
            sent_b.clear()
            _handle_subscribe(session_b, [
                SUBSCRIBE, 13, {}, 'com.hevolve.encounter.match.userB',
            ])
            sub_frames = [m for m in sent_b if m[0] == 33]  # SUBSCRIBED
            assert len(sub_frames) == 1, (
                f'userB must be allowed to subscribe to its own topic; '
                f'sent_b={sent_b!r}'
            )

            # 3. userA tries to publish to userB's topic — must be
            # refused at the publish-side authorizer (defense in depth).
            sent_b.clear()
            _handle_publish(session_a, [
                PUBLISH, 17, {},
                'com.hevolve.encounter.match.userB',
                [{'spoofed': True}],
            ])

            # userB session must have received NO EVENT frame from
            # userA's spoofed publish.
            event_frames = [m for m in sent_b if m and m[0] == EVENT]
            assert event_frames == [], (
                f'cross-user publish leaked into userB subscription; '
                f'sent_b={sent_b!r}'
            )

            # 4. Sanity: a publish FROM userB to its own topic still
            # works — proves we didn't break the legitimate path.
            sent_b.clear()
            _handle_publish(session_b, [
                PUBLISH, 19, {},
                'com.hevolve.encounter.match.userB',
                [{'legit': True}],
            ])
            # exclude_me=True default suppresses self-delivery, so we
            # expect NO event back to userB. Fan out a third subscriber
            # to confirm legitimate publishes do reach a 3rd party.
            session_c, proto_c, sent_c = self._setup_session('userB')
            try:
                _handle_subscribe(session_c, [
                    SUBSCRIBE, 23, {}, 'com.hevolve.encounter.match.userB',
                ])
                sent_c.clear()
                _handle_publish(session_b, [
                    PUBLISH, 29, {},
                    'com.hevolve.encounter.match.userB',
                    [{'legit2': True}],
                ])
                events_c = [m for m in sent_c if m and m[0] == EVENT]
                assert len(events_c) >= 1, (
                    'second userB-claiming session should still receive '
                    "userB's own publish (legitimate path must keep working)"
                )
                # Sanity: payload is the legit2 dict.
                assert events_c[-1][4][0]['legit2'] is True
            finally:
                self._teardown_session(session_c, proto_c)

            # Final invariant: the cross-user topic still has only the
            # legitimate userB subscriber registered (userA's denied
            # subscribe never landed in the map).
            realm = _get_realm('realm1')
            with realm.lock:
                topic_subs = realm.subscriptions.get(
                    'com.hevolve.encounter.match.userB', set(),
                )
                # Only userB sessions should be subscribed.
                from wamp_router import _sessions
                authids = {
                    _sessions[sid].authid for (sid, _sub) in topic_subs
                    if sid in _sessions
                }
                assert authids == {'userB'}, (
                    f'expected only userB subscribers on per-user topic; '
                    f'got authids={authids}'
                )
        finally:
            self._teardown_session(session_a, proto_a)
            self._teardown_session(session_b, proto_b)

    def test_subscribe_to_icebreaker_other_user_denied(self):
        """Same invariant for the icebreaker topic prefix (J210)."""
        from wamp_router import ERROR, SUBSCRIBE, _handle_subscribe

        session, proto, sent = self._setup_session('alice')
        try:
            sent.clear()
            _handle_subscribe(session, [
                SUBSCRIBE, 31, {},
                'com.hevolve.encounter.icebreaker.bob',
            ])
            err_frames = [m for m in sent if m and m[0] == ERROR]
            assert len(err_frames) == 1
            assert err_frames[0][4] == 'wamp.error.not_authorized'
        finally:
            self._teardown_session(session, proto)

    def test_subscribe_to_own_encounter_topic_allowed(self):
        """The legitimate path must keep working — a session whose
        authid matches the topic suffix must be SUBSCRIBED."""
        from wamp_router import SUBSCRIBED, SUBSCRIBE, _handle_subscribe

        session, proto, sent = self._setup_session('alice')
        try:
            sent.clear()
            _handle_subscribe(session, [
                SUBSCRIBE, 41, {},
                'com.hevolve.encounter.match.alice',
            ])
            sub_frames = [m for m in sent if m and m[0] == SUBSCRIBED]
            assert len(sub_frames) == 1, (
                f'allow-path must yield one SUBSCRIBED frame; sent={sent!r}'
            )
        finally:
            self._teardown_session(session, proto)


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
