/**
 * Real-time Event Service — Message-origin-agnostic, idempotent event broker.
 *
 * All transports feed into ONE dispatch pipeline. Components subscribe via
 * on(eventType, callback) — they never know or care which transport delivered.
 *
 * Transport priority:
 *   1. Crossbar WAMP (central/regional) — via Web Worker, lowest latency
 *   2. Local SSE (flat/desktop) — EventSource to Flask /api/social/events/stream
 *
 * Idempotency: request_id-based dedup prevents duplicate delivery when the
 * same message arrives via both WAMP and SSE simultaneously.
 *
 * Guest/local mode: SSE opens without JWT using ?user_id=guest param.
 * No transport-specific code should exist outside this file.
 */

import {SOCIAL_API_URL} from '../config/apiBase';

let _worker = null;
let _workerMessageHandler = null;
let _eventSource = null;
let _sseReconnectTimer = null;

const SSE_RECONNECT_DELAY = 3000; // 3s retry on SSE disconnect
const DEDUP_WINDOW_MS = 10000; // 10s dedup window
const DEDUP_MAX_SIZE = 200; // max tracked message IDs

class RealtimeService {
  constructor() {
    this._listeners = new Map();
    this._connected = false;
    this._crossbarConnected = false;
    this._sseConnected = false;
    this._token = null; // JWT for SSE auth (null = guest mode)
    this._userId = null; // fallback user_id for guest/local SSE
    this._seenIds = new Map(); // request_id → timestamp (dedup)
  }

  /**
   * Initialize with the crossbar worker reference.
   * Called from Demopage.js after the worker is created.
   * Also opens SSE immediately for guest/local mode (no JWT needed).
   * @param {Worker} crossbarWorker
   * @param {Object} [opts]
   * @param {string} [opts.userId] - user_id for guest/local SSE (no JWT)
   */
  init(crossbarWorker, opts = {}) {
    if (opts.userId) this._userId = opts.userId;

    // Always open SSE — even if worker is null (failed to create).
    // Local events (TTS audio, agent UI) only arrive via SSE.
    if (!this._sseConnected) {
      this._openSSE();
    }

    if (crossbarWorker && _worker !== crossbarWorker) {
      // Clean up old handler on the OLD worker before overwriting
      const oldWorker = _worker;
      _worker = crossbarWorker;
      if (_workerMessageHandler && oldWorker) {
        oldWorker.removeEventListener('message', _workerMessageHandler);
      }

      _workerMessageHandler = (e) => {
        const {type, payload} = e.data;

        if (type === 'CONNECTION_STATUS') {
          const isConnected = payload === 'Connected';
          this._crossbarConnected = isConnected;
          this._connected = isConnected || this._sseConnected;
          this._emit(isConnected ? 'connected' : 'disconnected', {
            connected: this._connected,
          });

          // SSE stays open even when crossbar connects.
          // Crossbar connects to CLOUD router (aws_rasa.hertzai.com) — handles
          // remote events. SSE connects to LOCAL Flask — handles TTS audio,
          // setup progress, agent UI updates from the local HARTOS backend.
          // Both transports coexist; dedup prevents double delivery.
          if (!this._sseConnected) {
            this._openSSE();
          }
        }

        if (type === 'SOCIAL_EVENT' && payload) {
          this._dispatchSocialPayload(payload);
        }
      };

      _worker.addEventListener('message', _workerMessageHandler);
    }

    // Open SSE immediately if crossbar isn't connected.
    // Guest/local mode works without JWT (uses user_id param).
    if (!this._crossbarConnected) {
      this._openSSE();
    }
  }

  /**
   * connect(token) — called by RealtimeContext / SocialContext.
   *
   * Sets JWT for authenticated SSE. If crossbar is already connected,
   * SSE stays closed. Otherwise opens/reconnects SSE with the token.
   */
  connect(token) {
    const tokenChanged = token && token !== this._token;
    this._token = token || this._token;
    if (this._crossbarConnected) return;
    if (tokenChanged) this._closeSSE(); // force reconnect with new creds
    this._openSSE();
  }

  disconnect() {
    this._connected = false;
    this._closeSSE();
    if (_workerMessageHandler && _worker) {
      _worker.removeEventListener('message', _workerMessageHandler);
      _workerMessageHandler = null;
    }
  }

  get connected() {
    return this._connected;
  }

  on(eventType, callback) {
    if (!this._listeners.has(eventType)) {
      this._listeners.set(eventType, new Set());
    }
    this._listeners.get(eventType).add(callback);
    return () => this._listeners.get(eventType)?.delete(callback);
  }

  off(eventType, callback) {
    this._listeners.get(eventType)?.delete(callback);
  }

  // ── Internal: SSE transport ─────────────────────────────────────────

  _openSSE() {
    if (_eventSource) return; // already open

    // Build URL: JWT if available, otherwise guest user_id param.
    // Always use SOCIAL_API_URL (points to Flask :5000, not React dev :3000).
    let url;
    if (this._token) {
      url = `${SOCIAL_API_URL}/events/stream?token=${encodeURIComponent(this._token)}`;
    } else {
      const uid = this._userId || 'guest';
      url = `${SOCIAL_API_URL}/events/stream?user_id=${encodeURIComponent(uid)}`;
    }

    try {
      _eventSource = new EventSource(url);
    } catch {
      return; // EventSource not available (e.g. SSR)
    }

    _eventSource.onopen = () => {
      this._sseConnected = true;
      this._connected = true;
      this._emit('connected', {connected: true, transport: 'sse'});
    };

    _eventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type === 'connected') return; // initial heartbeat
        this._dispatchSocialPayload(payload);
      } catch {
        // ignore parse errors (heartbeats etc.)
      }
    };

    // Named SSE event types from backend
    _eventSource.addEventListener('notification', (e) => {
      try {
        const payload = JSON.parse(e.data);
        this._dispatchSocialPayload({type: 'notification', ...payload});
      } catch { /* ignore */ }
    });

    _eventSource.addEventListener('setup_progress', (e) => {
      try {
        const payload = JSON.parse(e.data);
        this._dispatchSocialPayload({type: 'setup_progress', ...payload});
      } catch { /* ignore */ }
    });

    _eventSource.onerror = () => {
      this._closeSSE();
      // Always reconnect SSE — local events (TTS, agent UI) need it
      // even when cloud crossbar is connected.
      _sseReconnectTimer = setTimeout(
        () => this._openSSE(),
        SSE_RECONNECT_DELAY
      );
    };
  }

  _closeSSE() {
    if (_sseReconnectTimer) {
      clearTimeout(_sseReconnectTimer);
      _sseReconnectTimer = null;
    }
    if (_eventSource) {
      _eventSource.close();
      _eventSource = null;
    }
    this._sseConnected = false;
    if (!this._crossbarConnected) {
      this._connected = false;
    }
  }

  // ── Internal: dispatch (transport-agnostic, idempotent) ─────────────

  _isDuplicate(payload) {
    // Explicit ID (TTS request_id, notification id, etc.)
    let id = payload.request_id || payload.id;
    // No explicit ID — generate content hash so identical payloads from
    // different transports (WAMP + SSE) dedup correctly.
    if (!id) {
      const key = (payload.action || payload.type || '') + '|' +
        (payload.generated_audio_url || payload.agent_id || '') + '|' +
        (payload.message || payload.content || payload.text || '').slice(0, 100);
      id = '_h:' + key;
    }
    const now = Date.now();
    if (this._seenIds.has(id) && now - this._seenIds.get(id) < DEDUP_WINDOW_MS) {
      return true; // seen within dedup window
    }
    this._seenIds.set(id, now);
    // Evict old entries to prevent unbounded growth
    if (this._seenIds.size > DEDUP_MAX_SIZE) {
      const cutoff = now - DEDUP_WINDOW_MS;
      for (const [k, ts] of this._seenIds) {
        if (ts < cutoff) this._seenIds.delete(k);
      }
    }
    return false;
  }

  _dispatchSocialPayload(payload) {
    if (this._isDuplicate(payload)) return;

    // Normalize event type from any payload shape
    let eventType = payload.type || payload.event_type || payload.action || 'message';

    // TTS audio → emit as 'tts' event (regardless of transport)
    if (payload.action === 'TTS' && payload.generated_audio_url) {
      eventType = 'tts';
    }

    // Agent UI update → emit as 'agent.ui.update' (avoid double-fire)
    if (payload.component_type || (payload.type && payload.agent_id && payload.type !== 'notification')) {
      if (eventType !== 'agent.ui.update') {
        this._emit('agent.ui.update', payload);
      }
    }

    this._emit(eventType, payload);

    // Also dispatch sub-type for notification events
    if (eventType === 'notification') {
      const subType = payload.data?.type || payload.data?.event_type;
      if (subType && subType !== 'notification') {
        this._emit(subType, payload.data || payload);
      }
    }
  }

  _emit(eventType, data) {
    const cbs = this._listeners.get(eventType);
    if (cbs)
      cbs.forEach((cb) => {
        try {
          cb(data);
        } catch (_) {}
      });
    // Wildcard listeners
    const wildcardCbs = this._listeners.get('*');
    if (wildcardCbs)
      wildcardCbs.forEach((cb) => {
        try {
          cb({type: eventType, data});
        } catch (_) {}
      });
  }
}

// ── Community topic handler ──────────────────────────────────────────

let _communityWorker = null;
const _communityListeners = new Map(); // communityId → Set<callback>
let _communityWorkerHandler = null;

/**
 * Initialize community realtime with the crossbar worker reference.
 * Called lazily by subscribeCommunity if not already set.
 */
function _ensureCommunityWorker() {
  if (_communityWorkerHandler || !_worker) return;
  _communityWorker = _worker;

  _communityWorkerHandler = (e) => {
    const {type, payload} = e.data;
    if (type === 'COMMUNITY_EVENT' && payload) {
      const communityId = payload.communityId || payload.community_id;
      const callbacks = _communityListeners.get(communityId);
      if (callbacks) {
        callbacks.forEach((cb) => {
          try {
            cb(payload);
          } catch (err) {
            console.warn('Community event handler error:', err);
          }
        });
      }
      // Wildcard listeners
      const wildcardCbs = _communityListeners.get('*');
      if (wildcardCbs) {
        wildcardCbs.forEach((cb) => {
          try {
            cb(payload);
          } catch (_) {}
        });
      }
    }
  };

  _worker.addEventListener('message', _communityWorkerHandler);
}

/**
 * Subscribe to real-time events for a community.
 * Handles `type: 'community_post'` and `type: 'presence'` events on
 * topic `com.hertzai.hevolve.community.{communityId}`.
 *
 * @param {string} communityId
 * @param {Function} callback - receives event objects { type, ... }
 * @returns {Function} unsubscribe function
 */
export function subscribeCommunity(communityId, callback) {
  _ensureCommunityWorker();

  if (!_communityListeners.has(communityId)) {
    _communityListeners.set(communityId, new Set());
  }
  _communityListeners.get(communityId).add(callback);

  // Tell worker to subscribe to WAMP community topic
  if (_worker) {
    _worker.postMessage({
      type: 'COMMUNITY_SUBSCRIBE',
      payload: {communityId},
    });
  }

  // Return unsubscribe function
  return () => {
    _communityListeners.get(communityId)?.delete(callback);
    if (_communityListeners.get(communityId)?.size === 0) {
      _communityListeners.delete(communityId);
      // Unsubscribe from WAMP if no more listeners
      if (_worker) {
        _worker.postMessage({
          type: 'COMMUNITY_UNSUBSCRIBE',
          payload: {communityId},
        });
      }
    }
  };
}

// ── TTS language-mismatch / unsupported topics ─────────────────────
// Surfaces the silent-degradation warnings from tts_engine.py:
//   - com.hertzai.hevolve.tts.lang_mismatch  (backend != preferred ladder)
//   - com.hertzai.hevolve.tts.lang_unsupported (no capable backend fits)
// Backend publishes one-off payloads via core.realtime.publish_async;
// frontend toasts them so users know why their Tamil voice became
// English mumbling instead of silently mis-routing.

const _ttsLangListeners = new Set();
let _ttsLangWorkerHandler = null;

function _ensureTtsLangWorker() {
  if (_ttsLangWorkerHandler || !_worker) return;
  _ttsLangWorkerHandler = (e) => {
    const {type, payload} = e.data || {};
    if (type === 'TTS_LANG_EVENT' && payload) {
      _ttsLangListeners.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.warn('TTS lang event handler error:', err);
        }
      });
    }
  };
  _worker.addEventListener('message', _ttsLangWorkerHandler);
  // Ask the worker to subscribe to both topics.  The worker relays as
  // `{type:'TTS_LANG_EVENT', payload:{kind:'mismatch'|'unsupported', ...}}`
  _worker.postMessage({
    type: 'TTS_LANG_SUBSCRIBE',
    payload: {
      topics: [
        'com.hertzai.hevolve.tts.lang_mismatch',
        'com.hertzai.hevolve.tts.lang_unsupported',
      ],
    },
  });
}

/**
 * Subscribe to TTS language-mismatch / unsupported events.
 * Callback receives `{kind, requested_lang, active_backend, preferred?}`.
 * @param {Function} callback
 * @returns {Function} unsubscribe
 */
export function subscribeTtsLangEvents(callback) {
  _ensureTtsLangWorker();
  _ttsLangListeners.add(callback);
  return () => _ttsLangListeners.delete(callback);
}

// Singleton
const realtimeService = new RealtimeService();
export default realtimeService;
