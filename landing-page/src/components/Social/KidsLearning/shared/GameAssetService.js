/**
 * GameAssetService - Three-tier asset resolution for Kids Learning Zone media.
 *
 * Resolution order:
 *   1. MediaCacheManager (IndexedDB)  - instant, offline-capable
 *   2. Backend /api/media/asset       - server-generated or proxied media
 *   3. null                           - caller falls back to emoji
 *
 * Features:
 *   - In-flight request deduplication (same prompt never fetched twice concurrently)
 *   - Batch preloading with progress callback for game configs
 *   - Image, music, and video asset types
 *   - All public methods return null on error (never throw)
 *
 * Usage:
 *   import GameAssetService from './GameAssetService';
 *   const url = await GameAssetService.getImage('a happy cartoon cat');
 *   // url is a Blob URL string, or null if unavailable
 */

import MediaCacheManager from './MediaCacheManager';

import {API_BASE_URL} from '../../../../config/apiBase';

// ── Base URL ─────────────────────────────────────────────────────────────────
// Imported from the centralized config (src/config/apiBase.js).
// Honors REACT_APP_API_BASE_URL env var; defaults to http://localhost:5000.

const BASE_URL = API_BASE_URL;

// ── Auth helper ─────────────────────────────────────────────────────────────
// Reads the JWT from localStorage (same key used by SocialContext / socialApi)
// and returns headers with Authorization: Bearer <token> when available.

const _getAuthHeaders = () => {
  const headers = {};
  try {
    const token = localStorage.getItem('access_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (_) {
    // localStorage may be unavailable (private browsing)
  }
  return headers;
};

// ── In-flight deduplication ──────────────────────────────────────────────────
// Maps a dedup key to a pending Promise so that concurrent callers requesting
// the same asset share one HTTP round-trip instead of firing duplicates.

const _inFlight = new Map();

/**
 * Build a deterministic dedup key from arbitrary arguments.
 * @param  {...any} parts - Strings/numbers to join
 * @returns {string}
 */
const _dedup = (...parts) => parts.map(String).join('|');

/**
 * Wrap an async producer function with in-flight deduplication.
 * If a request for `key` is already in progress, the existing promise is
 * returned. Otherwise the producer is called, its promise cached, and the
 * cache entry cleaned up once settled (fulfilled or rejected).
 *
 * @param {string} key   - Deduplication key
 * @param {Function} fn  - Async producer () => Promise<T>
 * @returns {Promise<T>}
 */
const _dedupFetch = (key, fn) => {
  if (_inFlight.has(key)) {
    return _inFlight.get(key);
  }
  const promise = fn().finally(() => {
    _inFlight.delete(key);
  });
  _inFlight.set(key, promise);
  return promise;
};

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Ensure the MediaCacheManager is initialised before first use.
 * Uses a shared promise to prevent parallel initializations.
 */
let _cacheInitPromise = null;
const _ensureCache = async () => {
  if (!_cacheInitPromise) {
    _cacheInitPromise = MediaCacheManager.init().catch(() => {
      _cacheInitPromise = null; // Allow retry on failure
    });
  }
  await _cacheInitPromise;
};

/**
 * Attempt to fetch a media asset from the backend, cache it via
 * MediaCacheManager, and return the resulting Blob URL.
 *
 * The backend endpoint (GET /api/media/asset) reads query params, so we
 * encode them into the URL rather than POSTing JSON.
 *
 * @param {string} mediaType       - Cache media type ('image', 'music', 'video')
 * @param {Object} cacheParams     - Params object for cache key generation
 * @param {string} endpoint        - Relative API path (e.g. '/api/media/asset')
 * @param {Object} params          - Query params to append
 * @returns {Promise<string|null>} - Blob URL or null
 */
const _fetchAndCache = async (mediaType, cacheParams, endpoint, params) => {
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${BASE_URL}${endpoint}?${qs}`, {
      headers: _getAuthHeaders(),
    });

    if (!res.ok) return null;

    const contentType = res.headers.get('Content-Type') || '';

    // If the backend returns a binary blob directly (image/*, audio/*, video/*)
    if (
      contentType.startsWith('image/') ||
      contentType.startsWith('audio/') ||
      contentType.startsWith('video/')
    ) {
      const blob = await res.blob();
      return await MediaCacheManager.storeBlob(mediaType, cacheParams, blob);
    }

    // Otherwise expect JSON with a `url` field pointing at the actual file
    const data = await res.json();
    if (data && data.url) {
      return await MediaCacheManager.download(mediaType, cacheParams, data.url);
    }

    // For video generation the backend may return a job_id instead of a URL
    if (data && data.job_id) {
      return data; // special case: caller handles polling
    }

    return null;
  } catch (_) {
    return null;
  }
};

// ── Prompt extraction ────────────────────────────────────────────────────────

/**
 * Walk a game config object and extract all {key, prompt} pairs from every
 * content shape the Kids Learning Zone game types use.
 *
 * Supported shapes:
 *   - questions[]         → imagePrompt            → key "q{i}"
 *   - questions[].options → imagePrompt            → key "q{i}o{j}"
 *   - questions[].cards[] → imagePrompt            → key "c{qi}_{ci}"
 *   - words[]             → imagePrompt            → key "w{i}"
 *   - pairs[]             → leftImagePrompt / rightImagePrompt → key "p{i}l" / "p{i}r"
 *   - statements[]        → imagePrompt            → key "s{i}"
 *   - questions[]         → imagePrompt (counting) → key "cq{i}" (when type is 'counting')
 *
 * @param {Object} gameConfig - The full game configuration object
 * @returns {Array<{key: string, prompt: string}>}
 */
const _extractPrompts = (gameConfig) => {
  const prompts = [];
  if (!gameConfig) return prompts;

  // Helper: safely read an array from the config (check both top-level and nested content)
  const arr = (field) => {
    const direct = gameConfig[field];
    const nested = gameConfig?.content?.[field];
    const val = Array.isArray(direct)
      ? direct
      : Array.isArray(nested)
        ? nested
        : [];
    return val;
  };

  // ── questions[] ──────────────────────────────────────────────────────────
  arr('questions').forEach((q, qi) => {
    // Counting-type questions use a "cq" prefix to distinguish them
    if (q.type === 'counting' && q.imagePrompt) {
      prompts.push({key: `cq${qi}`, prompt: q.imagePrompt});
    } else if (q.imagePrompt) {
      prompts.push({key: `q${qi}`, prompt: q.imagePrompt});
    }

    // Nested options within a question
    if (Array.isArray(q.options)) {
      q.options.forEach((opt, oi) => {
        if (opt && opt.imagePrompt) {
          prompts.push({key: `q${qi}o${oi}`, prompt: opt.imagePrompt});
        }
      });
    }

    // Nested cards within a question (e.g. memory-match)
    if (Array.isArray(q.cards)) {
      q.cards.forEach((card, ci) => {
        if (card && card.imagePrompt) {
          prompts.push({key: `c${qi}_${ci}`, prompt: card.imagePrompt});
        }
      });
    }
  });

  // ── words[] ──────────────────────────────────────────────────────────────
  arr('words').forEach((w, wi) => {
    if (w && w.imagePrompt) {
      prompts.push({key: `w${wi}`, prompt: w.imagePrompt});
    }
  });

  // ── pairs[] ──────────────────────────────────────────────────────────────
  arr('pairs').forEach((p, pi) => {
    if (p && p.leftImagePrompt) {
      prompts.push({key: `p${pi}l`, prompt: p.leftImagePrompt});
    }
    if (p && p.rightImagePrompt) {
      prompts.push({key: `p${pi}r`, prompt: p.rightImagePrompt});
    }
  });

  // ── statements[] ─────────────────────────────────────────────────────────
  arr('statements').forEach((s, si) => {
    if (s && s.imagePrompt) {
      prompts.push({key: `s${si}`, prompt: s.imagePrompt});
    }
  });

  return prompts;
};

// ── GameAssetService ─────────────────────────────────────────────────────────

const GameAssetService = {
  /**
   * Resolve an image for a given text prompt.
   *
   * Resolution:
   *   1. Check MediaCacheManager (IndexedDB) for a cached blob
   *   2. POST to /api/media/asset with type 'image'
   *   3. Return null so the caller can render an emoji fallback
   *
   * Concurrent calls with the same prompt+style share one HTTP request via
   * in-flight deduplication.
   *
   * @param {string} prompt          - Descriptive text for the image
   * @param {string} [style='cartoon'] - Visual style hint
   * @param {string} [classification='public_educational'] - Content classification
   * @returns {Promise<string|null>}  Blob URL or null
   */
  getImage: async (
    prompt,
    style = 'cartoon',
    classification = 'public_educational'
  ) => {
    try {
      await _ensureCache();

      const cacheParams = {prompt, style, classification};

      // Tier 1: IndexedDB cache
      const cached = await MediaCacheManager.getAsync('image', cacheParams);
      if (cached) return cached;

      // Tier 2: Backend (deduplicated)
      const key = _dedup('image', prompt, style, classification);
      const result = await _dedupFetch(key, () =>
        _fetchAndCache('image', cacheParams, '/api/media/asset', {
          type: 'image',
          prompt,
          style,
          classification,
        })
      );
      return result || null;
    } catch (_) {
      // Tier 3: null — caller renders emoji fallback
      return null;
    }
  },

  /**
   * Batch pre-fetch all image prompts from a game configuration object.
   *
   * Walks the config to find every `imagePrompt`, `leftImagePrompt`, and
   * `rightImagePrompt` field, resolves them in parallel via `getImage()`,
   * and returns a Map keyed by a short identifier (see _extractPrompts docs).
   *
   * Uses Promise.allSettled so one failure does not block the rest.
   *
   * @param {Object} gameConfig          - The game configuration object
   * @param {string} [style='cartoon']   - Visual style hint
   * @param {Function} [onProgress]      - Called with (completed, total) after each resolve
   * @returns {Promise<Map<string, string|null>>} Map of key -> blobUrl or null
   */
  preloadImages: async (gameConfig, style = 'cartoon', onProgress) => {
    const results = new Map();

    try {
      const entries = _extractPrompts(gameConfig);
      if (entries.length === 0) return results;

      let completed = 0;
      const total = entries.length;

      const promises = entries.map(({key, prompt}) =>
        GameAssetService.getImage(prompt, style).then((blobUrl) => {
          results.set(key, blobUrl);
          completed++;
          if (typeof onProgress === 'function') {
            onProgress(completed, total);
          }
        })
      );

      await Promise.allSettled(promises);

      // Fill in any keys that may have rejected (allSettled doesn't throw)
      for (const {key} of entries) {
        if (!results.has(key)) {
          results.set(key, null);
        }
      }

      return results;
    } catch (_) {
      return results;
    }
  },

  /**
   * Resolve a music track for a given category and mood.
   *
   * @param {string} category       - Music category (e.g. 'background', 'victory')
   * @param {string} [mood='happy'] - Mood qualifier
   * @param {number} [duration=60]  - Desired duration in seconds
   * @returns {Promise<string|null>} Blob URL or null
   */
  getMusic: async (category, mood = 'happy', duration = 60) => {
    try {
      await _ensureCache();

      const cacheParams = {category, mood, duration};

      // Tier 1: IndexedDB cache
      const cached = await MediaCacheManager.getAsync('music', cacheParams);
      if (cached) return cached;

      // Tier 2: Backend (deduplicated)
      const key = _dedup('music', category, mood, duration);
      const result = await _dedupFetch(key, () =>
        _fetchAndCache('music', cacheParams, '/api/media/asset', {
          type: 'music',
          category,
          mood,
          duration,
        })
      );
      return result || null;
    } catch (_) {
      return null;
    }
  },

  /**
   * Request a short video clip from the backend.
   *
   * Video generation is typically asynchronous, so this method returns the
   * job metadata ({job_id}) rather than a Blob URL. The caller is expected
   * to poll for completion separately.
   *
   * @param {string} prompt        - Descriptive text for the video
   * @param {number} [duration=8]  - Desired clip length in seconds
   * @returns {Promise<{job_id: string}|null>} Job descriptor or null
   */
  requestVideo: async (prompt, duration = 8) => {
    try {
      const qs = new URLSearchParams({
        type: 'video',
        prompt,
        duration,
      }).toString();
      const res = await fetch(`${BASE_URL}/api/media/asset?${qs}`, {
        headers: _getAuthHeaders(),
      });

      if (!res.ok) return null;

      const data = await res.json();
      if (data && data.job_id) {
        return {job_id: data.job_id};
      }
      return null;
    } catch (_) {
      return null;
    }
  },

  // Expose for testing / advanced usage
  _extractPrompts,
};

export default GameAssetService;
