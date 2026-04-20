/**
 * TTSManager - Cache-first Text-to-Speech manager for Kids Learning Zone (Web).
 *
 * Resolution order:
 *   1. MediaCacheManager IndexedDB cache (Blob URL)
 *   2. localStorage inline cache for short clips (< 100 chars)
 *   3. Pocket TTS (browser-side ONNX inference — no server needed)
 *   4. Server API fallback (quickTTS for short text, submitTTS + poll for long text)
 *
 * Pocket TTS is preferred because it runs entirely in the browser with zero
 * server dependency, works offline after model download, and has lower latency
 * than a server round-trip.
 *
 * Results are cached for offline use. Never throws - returns boolean.
 *
 * Usage:
 *   import TTSManager from './shared/TTSManager';
 *   const spoke = await TTSManager.speak('Hello world', { voice: 'emma' });
 *   await TTSManager.preCache(['Line one', 'Line two'], { voice: 'emma' });
 *   TTSManager.stop();
 */

import AudioChannelManager from './AudioChannelManager';
import MediaCacheManager from './MediaCacheManager';

import {PocketTTSService} from '../../../../services/pocketTTS';
import {probeTTSCapability} from '../../../../services/ttsCapabilityProbe';
import {logger} from '../../../../utils/logger';
import {quickTTS, submitTTS, pollTTS, pollUntilDone} from '../kidsLearningApi';

// ── Cache Key Helpers ────────────────────────────────────────────────────────

const SHORT_TEXT_THRESHOLD = 100;
const INLINE_PREFIX = 'tts_inline_';

/** Build the params object used as MediaCacheManager key. */
const buildTTSParams = (text, voice, engine) => ({
  text,
  voice: voice || 'default',
  engine: engine || 'pocket_tts',
});

/** Build localStorage key for inline short-clip cache. */
const getInlineKey = (text, voice, engine) => {
  return (
    INLINE_PREFIX +
    MediaCacheManager.generateCacheKey(
      'tts',
      buildTTSParams(text, voice, engine)
    )
  );
};

// ── Internal State ───────────────────────────────────────────────────────────

let _speaking = false;
let _cancelled = false;

// ── Pocket TTS Singleton ─────────────────────────────────────────────────────

let _pocketTTS = null;
let _pocketTTSReady = false;
let _pocketTTSFailed = false;
let _pocketTTSInitPromise = null;

/**
 * Lazily initialize PocketTTSService (browser-side ONNX).
 * Returns the instance if ready, null if unavailable.
 */
const _ensurePocketTTS = async () => {
  if (_pocketTTSReady && _pocketTTS) return _pocketTTS;
  if (_pocketTTSFailed) return null;

  if (!_pocketTTSInitPromise) {
    _pocketTTSInitPromise = (async () => {
      try {
        // Single-path probe: pick best local engine ONCE
        const probe = await probeTTSCapability();
        if (probe.engine === 'server') {
          // No local TTS available — rely on server only
          _pocketTTSFailed = true;
          return null;
        }
        const svc = new PocketTTSService({
          sampleRate: probe.sampleRate,
          engine: probe.engine,
        });
        svc.onReady = () => {
          _pocketTTSReady = true;
        };
        svc.onError = (err) => {
          console.warn('PocketTTS error:', err);
        };
        await svc.init();
        _pocketTTS = svc;
        // Wait a bit for model loading (onReady callback)
        await new Promise((resolve) => {
          if (_pocketTTSReady) return resolve();
          const orig = svc.onReady;
          svc.onReady = () => {
            orig?.();
            _pocketTTSReady = true;
            resolve();
          };
          // Timeout: don't block forever if models are slow to load
          setTimeout(() => resolve(), 15000);
        });
        return _pocketTTS;
      } catch (err) {
        console.warn('PocketTTS init failed, will use server TTS:', err);
        _pocketTTSFailed = true;
        return null;
      }
    })();
  }

  return _pocketTTSInitPromise;
};

// ── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Convert a base64 audio string to a Blob URL and optionally store it in the
 * IndexedDB cache via MediaCacheManager.
 * @returns {Promise<string|null>} Blob URL or null
 */
const _base64ToBlobUrl = async (base64Data, mediaType, params, format) => {
  try {
    const blobUrl = await MediaCacheManager.storeBase64(
      mediaType,
      params,
      base64Data,
      format ? `.${format}` : '.mp3'
    );
    return blobUrl;
  } catch (err) {
    logger.error(err);
    // If IDB store fails, create a transient Blob URL directly
    try {
      const binaryStr = atob(base64Data);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], {type: 'audio/mpeg'});
      return URL.createObjectURL(blob);
    } catch (err2) {
      logger.error(err2);
      return null;
    }
  }
};

/**
 * Play audio through AudioChannelManager and manage speaking state.
 * @returns {Promise<boolean>} true if playback completed, false otherwise.
 */
const _playAudio = async (blobUrlOrBuffer, {onStart, onEnd, onError} = {}) => {
  try {
    _speaking = true;

    const success = await AudioChannelManager.playTTS(blobUrlOrBuffer, {
      onStart: () => {
        if (onStart) onStart();
      },
      onEnd: () => {
        _speaking = false;
        if (onEnd) onEnd();
      },
    });

    if (!success) _speaking = false;
    return success;
  } catch (err) {
    _speaking = false;
    if (onError) onError(err);
    return false;
  }
};

/**
 * Speak using PocketTTS (browser ONNX inference).
 * Returns a Promise<boolean> — true if playback completed.
 */
const _speakWithPocketTTS = (
  svc,
  text,
  {voice, onStart, onEnd, onError} = {}
) => {
  return new Promise((resolve) => {
    const prevOnFirst = svc.onFirstAudio;
    const prevOnComplete = svc.onComplete;
    const prevOnError = svc.onError;

    svc.onFirstAudio = () => {
      _speaking = true;
      if (onStart) onStart();
    };
    svc.onComplete = () => {
      _speaking = false;
      svc.onFirstAudio = prevOnFirst;
      svc.onComplete = prevOnComplete;
      svc.onError = prevOnError;
      if (onEnd) onEnd();
      resolve(true);
    };
    svc.onError = (err) => {
      _speaking = false;
      svc.onFirstAudio = prevOnFirst;
      svc.onComplete = prevOnComplete;
      svc.onError = prevOnError;
      if (onError) onError(typeof err === 'string' ? new Error(err) : err);
      resolve(false);
    };

    svc.speak(text, voice || undefined);
  });
};

// ── TTSManager ───────────────────────────────────────────────────────────────

const TTSManager = {
  /**
   * Speak text using TTS with cache-first resolution.
   * Never throws - returns true if audio was played, false otherwise.
   *
   * @param {string} text - The text to speak.
   * @param {Object} [options]
   * @param {string} [options.voice] - Voice identifier.
   * @param {string} [options.engine] - TTS engine (default: 'pocket_tts').
   * @param {Function} [options.onStart] - Called when playback starts.
   * @param {Function} [options.onEnd] - Called when playback ends.
   * @param {Function} [options.onError] - Called on error (informational only).
   * @returns {Promise<boolean>} true if audio was spoken, false otherwise.
   */
  speak: async (text, {voice, engine, onStart, onEnd, onError} = {}) => {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return false;
    }

    _cancelled = false;

    const params = buildTTSParams(text, voice, engine);
    const inlineKey = getInlineKey(text, voice, engine);
    const isShort = text.length < SHORT_TEXT_THRESHOLD;

    try {
      // ── Step 1: Check MediaCacheManager IndexedDB cache ──
      let blobUrl = null;
      try {
        blobUrl = await MediaCacheManager.getAsync('tts', params);
      } catch (err) {
        logger.error(err);
        // Cache miss or unavailable - continue
      }

      if (blobUrl && !_cancelled) {
        return await _playAudio(blobUrl, {onStart, onEnd, onError});
      }

      // ── Step 2: Check localStorage inline cache (short clips only) ──
      if (isShort && !_cancelled) {
        try {
          const cachedBase64 = localStorage.getItem(inlineKey);
          if (cachedBase64) {
            // Store to IndexedDB for faster future access and get Blob URL
            const diskUrl = await _base64ToBlobUrl(cachedBase64, 'tts', params);
            if (diskUrl && !_cancelled) {
              return await _playAudio(diskUrl, {onStart, onEnd, onError});
            }
          }
        } catch (err) {
          logger.error(err);
          // localStorage unavailable - continue
        }
      }

      if (_cancelled) return false;

      // ── Step 3: Pocket TTS (browser ONNX) vs Server API (race) ──
      //
      // If PocketTTS is ready, use it directly (zero latency, no server).
      // If PocketTTS is still loading, race it against the server:
      //   - Server responds within 3s → use server audio
      //   - Server slow/down → PocketTTS takes over once ready
      //
      const svc = await _ensurePocketTTS().catch(() => null);
      const pocketReady = svc && svc.isReady;

      if (pocketReady && !_cancelled) {
        const spoke = await _speakWithPocketTTS(svc, text, {
          voice,
          onStart,
          onEnd,
          onError,
        });
        if (spoke) return true;
        // PocketTTS failed — fall through to server
      }

      if (_cancelled) return false;

      // ── Step 4: Server API fallback (with timeout → PocketTTS rescue) ──
      const SERVER_TIMEOUT = 3000;
      let audioData = null;

      try {
        const serverPromise = (async () => {
          if (isShort) {
            const response = await quickTTS(text, {voice, engine});
            return response?.data || response;
          } else {
            const submitResult = await submitTTS(text, {voice, engine});
            const taskId = submitResult?.data?.taskId || submitResult?.taskId;
            if (!taskId) return null;
            const result = await pollUntilDone(() => pollTTS(taskId), {
              intervalMs: 2000,
              maxAttempts: 30,
            });
            return result?.data || result;
          }
        })();

        // If PocketTTS just wasn't ready before but may be now, race against server
        if (!pocketReady) {
          const timeoutRace = Promise.race([
            serverPromise.then((d) => ({source: 'server', data: d})),
            new Promise((resolve) =>
              setTimeout(() => resolve({source: 'timeout'}), SERVER_TIMEOUT)
            ),
          ]);

          const winner = await timeoutRace;
          if (winner.source === 'timeout') {
            // Server too slow — try PocketTTS one more time (may have loaded by now)
            const retrySvc = await _ensurePocketTTS().catch(() => null);
            if (retrySvc && retrySvc.isReady && !_cancelled) {
              const spoke = await _speakWithPocketTTS(retrySvc, text, {
                voice,
                onStart,
                onEnd,
                onError,
              });
              if (spoke) return true;
            }
            // Still waiting on server, let it finish
            audioData = await serverPromise;
          } else {
            audioData = winner.data;
          }
        } else {
          // PocketTTS was ready but failed — just wait for server
          audioData = await serverPromise;
        }
      } catch (_serverErr) {
        // Server API unavailable
        if (onError) onError(_serverErr);
        return false;
      }

      if (_cancelled || !audioData) return false;

      // ── Cache the result for offline use ──
      let playableUrl =
        audioData.audioUrl || audioData.url || audioData.uri || null;

      if (audioData.base64) {
        // Cache inline base64 to localStorage for short clips
        if (isShort) {
          try {
            localStorage.setItem(inlineKey, audioData.base64);
          } catch (err) {
            logger.error(err);
            // Non-critical - continue without inline caching
          }
        }

        // Store to IndexedDB via MediaCacheManager
        const diskUrl = await _base64ToBlobUrl(
          audioData.base64,
          'tts',
          params,
          audioData.format
        );
        if (diskUrl) playableUrl = diskUrl;
      } else if (playableUrl) {
        // Cache remote URL to IndexedDB
        try {
          const downloadedUrl = await MediaCacheManager.download(
            'tts',
            params,
            playableUrl
          );
          if (downloadedUrl) playableUrl = downloadedUrl;
        } catch (err) {
          logger.error(err);
          // Cache failed - use remote URL directly
        }
      }

      if (!playableUrl || _cancelled) {
        if (onError) onError(new Error('No playable audio URI available'));
        return false;
      }

      return await _playAudio(playableUrl, {onStart, onEnd, onError});
    } catch (err) {
      if (onError) onError(err);
      return false;
    }
  },

  /**
   * Pre-cache TTS audio for multiple texts in parallel.
   * With Pocket TTS as primary, pre-caching just ensures the model is loaded.
   * Server pre-caching is still done for offline base64 blobs.
   *
   * @param {string[]} texts - Array of texts to pre-cache.
   * @param {Object} [options]
   * @param {string} [options.voice] - Voice identifier.
   * @param {string} [options.engine] - TTS engine.
   * @returns {Promise<void>}
   */
  preCache: async (texts, {voice, engine} = {}) => {
    if (!Array.isArray(texts) || texts.length === 0) return;

    // Warm up PocketTTS in the background (model download + init)
    _ensurePocketTTS().catch(() => {});

    const tasks = texts.map(async (text) => {
      if (!text || typeof text !== 'string' || text.trim().length === 0) return;

      const params = buildTTSParams(text, voice, engine);
      const inlineKey = getInlineKey(text, voice, engine);

      // Skip if already cached in IndexedDB
      try {
        if (MediaCacheManager.has('tts', params)) return;
      } catch (err) {
        logger.error(err);
        // Continue to fetch
      }

      const isShort = text.length < SHORT_TEXT_THRESHOLD;

      // Also skip if already in localStorage (short clips)
      if (isShort) {
        try {
          const cached = localStorage.getItem(inlineKey);
          if (cached) return;
        } catch (err) {
          logger.error(err);
          // Continue to fetch
        }
      }

      // Pre-cache from server (Pocket TTS generates on-the-fly so no pre-cache needed)
      try {
        let audioData = null;

        if (isShort) {
          const response = await quickTTS(text, {voice, engine});
          audioData = response?.data || response;
        } else {
          const submitResult = await submitTTS(text, {voice, engine});
          const taskId = submitResult?.data?.taskId || submitResult?.taskId;
          if (!taskId) return;

          const pollResult = await pollUntilDone(() => pollTTS(taskId), {
            intervalMs: 2000,
            maxAttempts: 30,
          });
          audioData = pollResult?.data || pollResult;
        }

        if (!audioData) return;

        // Cache base64 data
        if (audioData.base64) {
          if (isShort) {
            try {
              localStorage.setItem(inlineKey, audioData.base64);
            } catch (err) {
              logger.error(err);
            }
          }
          try {
            await MediaCacheManager.storeBase64(
              'tts',
              params,
              audioData.base64,
              audioData.format ? `.${audioData.format}` : '.mp3'
            );
          } catch (err) {
            logger.error(err);
          }
        } else if (audioData.audioUrl || audioData.url || audioData.uri) {
          try {
            await MediaCacheManager.download(
              'tts',
              params,
              audioData.audioUrl || audioData.url || audioData.uri
            );
          } catch (err) {
            logger.error(err);
          }
        }
      } catch (err) {
        logger.error(err);
        // Silently skip failed pre-cache items
      }
    });

    await Promise.allSettled(tasks);
  },

  /**
   * Stop current TTS playback.
   */
  stop: () => {
    _cancelled = true;
    _speaking = false;
    try {
      AudioChannelManager.stopTTS();
    } catch (err) {
      logger.error(err);
      // AudioChannelManager may not be initialized
    }
    try {
      if (_pocketTTS) _pocketTTS.stop();
    } catch (err) {
      logger.error(err);
      // PocketTTS may not be initialized
    }
  },

  /**
   * Check if TTS is currently speaking.
   * @returns {boolean}
   */
  isSpeaking: () => {
    return _speaking;
  },

  /**
   * Load a cloned voice from an audio URL (WAV/MP3/OGG).
   * Pocket TTS encodes the voice sample in the browser worker and uses it
   * for all subsequent speak() calls until a different voice is set.
   *
   * @param {string} audioUrl - URL to the voice sample audio file.
   * @returns {Promise<boolean>} true if voice was loaded successfully.
   */
  loadVoiceFromURL: async (audioUrl) => {
    try {
      const svc = await _ensurePocketTTS();
      if (!svc || !svc.isReady) return false;
      await svc.encodeVoiceFromURL(audioUrl);
      return true;
    } catch (err) {
      console.warn('TTSManager voice clone failed:', err);
      return false;
    }
  },

  /**
   * Load a cloned voice from raw PCM audio data.
   * @param {Float32Array} audioData - Mono 24kHz PCM samples (max 10s).
   * @returns {Promise<boolean>} true if voice was encoded.
   */
  loadVoiceFromPCM: async (audioData) => {
    try {
      const svc = await _ensurePocketTTS();
      if (!svc || !svc.isReady) return false;
      await svc.encodeVoice(audioData);
      return true;
    } catch (err) {
      console.warn('TTSManager voice encode failed:', err);
      return false;
    }
  },

  /**
   * Switch to a predefined voice by name.
   * @param {string} voiceName - One of the available Pocket TTS voices.
   */
  setVoice: (voiceName) => {
    if (_pocketTTS && _pocketTTS.isReady) {
      _pocketTTS.setVoice(voiceName);
    }
  },

  /**
   * Get available Pocket TTS voices.
   * @returns {string[]} list of voice names.
   */
  getVoices: () => {
    return _pocketTTS?.availableVoices || [];
  },
};

export default TTSManager;
