/**
 * realtimeService.encounter.test.js — Unit tests for
 * subscribeEncounterMatch + subscribeEncounterIcebreaker (added in
 * Nunba-HART-Companion commit 8e4f462d, which mirrors HARTOS-side
 * publishers in HARTOS commit 208e2a3 — encounter_api._publish_match
 * and _publish_icebreaker).
 *
 * Backfill mandate: master-orchestrator backfill run aa3ead1 flagged
 * commit 8e4f462d as missing tests. This file is the W0b B6 REWORK.
 *
 * Subject under test (file:line):
 *   landing-page/src/services/realtimeService.js
 *     - subscribeEncounterMatch       L527-531
 *     - subscribeEncounterIcebreaker  L570-574
 *   Both follow the same DATA_RECEIVED filter pattern as
 *   subscribeChatNew (L478-482, U5 cross-device sync path).
 *
 * Wire contract under test:
 *   crossbarWorker.js posts {type: 'DATA_RECEIVED', payload:
 *     {sourceTopic, data}} for every subscribed WAMP topic
 *     (crossbarWorker.js L806-807 lists the encounter topics).
 *   realtimeService filters by sourceTopic prefix:
 *     - 'com.hevolve.encounter.match.'       → encounterMatch listeners
 *     - 'com.hevolve.encounter.icebreaker.'  → encounterIcebreaker listeners
 *
 * Test strategy:
 *   - Build a FakeWorker exposing addEventListener('message', fn).
 *   - Stub global EventSource (realtimeService.init opens SSE
 *     unconditionally on the first call — we don't care about SSE
 *     here; we only need the service to wire its internal _worker
 *     reference so the encounter handlers can attach).
 *   - realtimeService.init(fakeWorker) wires the worker.
 *   - Subscribe via the function under test, dispatch a synthetic
 *     'message' event on the FakeWorker, assert callback fires (or
 *     does NOT fire) per case.
 *
 * Cases covered (per orchestrator brief):
 *   subscribeEncounterMatch:
 *     a) DATA_RECEIVED with sourceTopic com.hevolve.encounter.match.{uid}
 *        → callback fires with payload.data
 *     b) DATA_RECEIVED with mismatched sourceTopic (chat.new)
 *        → callback must NOT fire
 *     c) unsubscribe() returned by subscribe removes the callback
 *        → subsequent matching events do not fire it
 *   subscribeEncounterIcebreaker:
 *     d) same 3 cases for the icebreaker topic prefix
 */

// Stub EventSource BEFORE the service is required — init() opens SSE
// and that's not the subject under test.  The mock instances are kept
// minimal: only the surface init() touches.
class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onerror = null;
    this.onmessage = null;
    this._listeners = {};
  }

  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }

  removeEventListener() {}

  close() {
    this.readyState = 2;
  }
}
global.EventSource = FakeEventSource;

// FakeWorker — same surface that realtimeService uses on the real
// crossbar Worker: addEventListener('message', fn) + postMessage.
// Tests dispatch synthetic events via _emit().
class FakeWorker {
  constructor() {
    this._messageListeners = new Set();
    this.postMessage = jest.fn();
  }

  addEventListener(type, fn) {
    if (type === 'message') {
      this._messageListeners.add(fn);
    }
  }

  removeEventListener(type, fn) {
    if (type === 'message') {
      this._messageListeners.delete(fn);
    }
  }

  // Test helper — fan out a synthetic worker postMessage event to every
  // listener.  Mirrors the browser's MessageEvent.data shape that the
  // real crossbarWorker.js produces.
  _emit(data) {
    this._messageListeners.forEach((fn) => fn({data}));
  }
}

// Suppress console.warn from the service's defensive try/catch in the
// listener callback (we WANT throwing callbacks to be safe but tests
// shouldn't pollute stderr with the warning they trigger).
let warnSpy;
beforeEach(() => {
  jest.resetModules(); // give each describe-block a fresh module-level _worker
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

// ── subscribeEncounterMatch ─────────────────────────────────────────

describe('subscribeEncounterMatch', () => {
  it('fires the callback when sourceTopic matches com.hevolve.encounter.match.{userId}', () => {
    const {default: realtimeService, subscribeEncounterMatch} =
      require('../../services/realtimeService');
    const worker = new FakeWorker();
    realtimeService.init(worker);

    const cb = jest.fn();
    subscribeEncounterMatch(cb);

    const matchPayload = {
      id: 42,
      user_a: 'alice',
      user_b: 'bob',
      lat: 12.97,
      lng: 77.59,
      matched_at: '2026-04-25T09:00:00Z',
      icebreaker_a_status: 'pending',
      icebreaker_b_status: 'pending',
    };
    worker._emit({
      type: 'DATA_RECEIVED',
      payload: {
        sourceTopic: 'com.hevolve.encounter.match.alice',
        data: matchPayload,
      },
    });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(matchPayload);
  });

  it('does NOT fire on a mismatched sourceTopic (chat.new)', () => {
    const {default: realtimeService, subscribeEncounterMatch} =
      require('../../services/realtimeService');
    const worker = new FakeWorker();
    realtimeService.init(worker);

    const cb = jest.fn();
    subscribeEncounterMatch(cb);

    worker._emit({
      type: 'DATA_RECEIVED',
      payload: {
        sourceTopic: 'com.hertzai.hevolve.chat.new.alice',
        data: {msg_id: 'x', content: 'hi'},
      },
    });

    expect(cb).not.toHaveBeenCalled();
  });

  it('unsubscribe() prevents the callback from firing on subsequent matches', () => {
    const {default: realtimeService, subscribeEncounterMatch} =
      require('../../services/realtimeService');
    const worker = new FakeWorker();
    realtimeService.init(worker);

    const cb = jest.fn();
    const unsubscribe = subscribeEncounterMatch(cb);
    expect(typeof unsubscribe).toBe('function');

    // First event fires through.
    worker._emit({
      type: 'DATA_RECEIVED',
      payload: {
        sourceTopic: 'com.hevolve.encounter.match.alice',
        data: {id: 1},
      },
    });
    expect(cb).toHaveBeenCalledTimes(1);

    unsubscribe();

    // Second event must NOT fire the (now-unsubscribed) callback.
    worker._emit({
      type: 'DATA_RECEIVED',
      payload: {
        sourceTopic: 'com.hevolve.encounter.match.alice',
        data: {id: 2},
      },
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

// ── subscribeEncounterIcebreaker ────────────────────────────────────

describe('subscribeEncounterIcebreaker', () => {
  it('fires the callback when sourceTopic matches com.hevolve.encounter.icebreaker.{userId}', () => {
    const {default: realtimeService, subscribeEncounterIcebreaker} =
      require('../../services/realtimeService');
    const worker = new FakeWorker();
    realtimeService.init(worker);

    const cb = jest.fn();
    subscribeEncounterIcebreaker(cb);

    const icebreakerPayload = {
      match_id: 42,
      side: 'a',
      status: 'sent',
      icebreaker_a: 'Hi! That talk on jazz piano was incredible.',
      icebreaker_b: null,
    };
    worker._emit({
      type: 'DATA_RECEIVED',
      payload: {
        sourceTopic: 'com.hevolve.encounter.icebreaker.alice',
        data: icebreakerPayload,
      },
    });

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(icebreakerPayload);
  });

  it('does NOT fire on a mismatched sourceTopic (chat.new)', () => {
    const {default: realtimeService, subscribeEncounterIcebreaker} =
      require('../../services/realtimeService');
    const worker = new FakeWorker();
    realtimeService.init(worker);

    const cb = jest.fn();
    subscribeEncounterIcebreaker(cb);

    worker._emit({
      type: 'DATA_RECEIVED',
      payload: {
        sourceTopic: 'com.hertzai.hevolve.chat.new.alice',
        data: {msg_id: 'x', content: 'hi'},
      },
    });

    expect(cb).not.toHaveBeenCalled();
  });

  it('does NOT fire when sourceTopic is the encounter.match topic (sibling-prefix isolation)', () => {
    // The two encounter handlers attach to the SAME worker but filter
    // by distinct prefixes — make sure the icebreaker handler doesn't
    // leak into match topic events (and vice versa).
    const {default: realtimeService, subscribeEncounterIcebreaker} =
      require('../../services/realtimeService');
    const worker = new FakeWorker();
    realtimeService.init(worker);

    const cb = jest.fn();
    subscribeEncounterIcebreaker(cb);

    worker._emit({
      type: 'DATA_RECEIVED',
      payload: {
        sourceTopic: 'com.hevolve.encounter.match.alice',
        data: {id: 1},
      },
    });

    expect(cb).not.toHaveBeenCalled();
  });

  it('unsubscribe() prevents the callback from firing on subsequent matches', () => {
    const {default: realtimeService, subscribeEncounterIcebreaker} =
      require('../../services/realtimeService');
    const worker = new FakeWorker();
    realtimeService.init(worker);

    const cb = jest.fn();
    const unsubscribe = subscribeEncounterIcebreaker(cb);
    expect(typeof unsubscribe).toBe('function');

    worker._emit({
      type: 'DATA_RECEIVED',
      payload: {
        sourceTopic: 'com.hevolve.encounter.icebreaker.alice',
        data: {match_id: 1, side: 'a', status: 'sent'},
      },
    });
    expect(cb).toHaveBeenCalledTimes(1);

    unsubscribe();

    worker._emit({
      type: 'DATA_RECEIVED',
      payload: {
        sourceTopic: 'com.hevolve.encounter.icebreaker.alice',
        data: {match_id: 1, side: 'b', status: 'declined'},
      },
    });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

// ── Defensive: non-DATA_RECEIVED messages are ignored ───────────────

describe('encounter handlers ignore non-DATA_RECEIVED messages', () => {
  it('subscribeEncounterMatch does not fire on CONNECTION_STATUS', () => {
    const {default: realtimeService, subscribeEncounterMatch} =
      require('../../services/realtimeService');
    const worker = new FakeWorker();
    realtimeService.init(worker);

    const cb = jest.fn();
    subscribeEncounterMatch(cb);

    worker._emit({type: 'CONNECTION_STATUS', payload: 'Connected'});
    worker._emit({type: 'SOCIAL_EVENT', payload: {action: 'unrelated'}});

    expect(cb).not.toHaveBeenCalled();
  });

  it('subscribeEncounterIcebreaker does not fire on payload-less DATA_RECEIVED', () => {
    const {default: realtimeService, subscribeEncounterIcebreaker} =
      require('../../services/realtimeService');
    const worker = new FakeWorker();
    realtimeService.init(worker);

    const cb = jest.fn();
    subscribeEncounterIcebreaker(cb);

    worker._emit({type: 'DATA_RECEIVED'}); // missing payload
    worker._emit({type: 'DATA_RECEIVED', payload: null});

    expect(cb).not.toHaveBeenCalled();
  });
});
