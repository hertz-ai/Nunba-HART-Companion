/* eslint-disable */
/**
 * useTTS.js — Unified TTS hook: browser-first (Pocket TTS ONNX) + server fallback
 *
 * Priority logic (choose-one-upfront, no race, no redundant compute):
 *   1. If browser ready + English text → use Pocket TTS (zero server load)
 *   2. If non-English OR browser not ready → use server TTS
 *   3. If chosen engine FAILS → fall back to the other sequentially
 *   4. NEVER start both simultaneously (avoids wasting server GPU)
 *
 * Voice cloning: each avatar has a voice sample URL retrieved from central instance
 * by teacher_avatar_id. Encoded once and cached for the session.
 *
 * Avatar images: retrieved from central instance by teacher_avatar_id.
 */

import {useState, useCallback, useRef, useEffect} from 'react';
import {PocketTTSService} from '../services/pocketTTS';
import {probeTTSCapability} from '../services/ttsCapabilityProbe';
import {TTS_API_URL} from '../config/apiBase';

const TTS_API_BASE = TTS_API_URL;

// Central instance for avatar resources
const CENTRAL_BASE = 'https://azurekong.hertzai.com';

// If server TTS doesn't respond within this many ms, cancel it and use browser TTS
const SERVER_TTS_TIMEOUT = 3000;

/**
 * Lightweight language detection — returns true if text is predominantly English/Latin.
 * Pocket TTS (Kyutai CSM) only supports English. Non-English text must use server TTS.
 */
function _isLikelyEnglish(text) {
  if (!text) return true;
  // Count non-ASCII-Latin characters (CJK, Arabic, Devanagari, Cyrillic, Thai, Korean, etc.)
  const nonLatin = text
    .replace(/[\s\d\p{P}\p{S}]/gu, '')
    .replace(/[\u0000-\u024F]/g, '');
  const total = text.replace(/[\s\d\p{P}\p{S}]/gu, '').length;
  if (total === 0) return true;
  // If more than 20% of letter chars are non-Latin → treat as non-English
  return nonLatin.length / total < 0.2;
}

/**
 * Custom hook for unified Text-to-Speech
 *
 * @param {Object} options
 * @param {boolean} options.enabled - Whether TTS is enabled (default: true)
 * @param {string}  options.voiceId - Server voice preset ID (default: 'en_US-amy-medium')
 * @param {number}  options.speed   - Server speech speed (default: 1.0)
 * @param {boolean} options.autoSpeak - Auto-speak new messages (default: true)
 * @returns {Object} TTS controls and state
 */
export function useTTS(options = {}) {
  const {
    enabled = true,
    voiceId = 'en_US-amy-medium',
    speed = 1.0,
    autoSpeak = true,
  } = options;

  // --- State ---
  // Server TTS is always available on Nunba (Piper CPU on localhost).
  // Start as true so Demopage's tts.isAvailable check passes immediately.
  const [isAvailable, setIsAvailable] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [voices, setVoices] = useState({});
  const [currentVoice, setCurrentVoice] = useState(voiceId);
  const [installedVoices, setInstalledVoices] = useState([]);

  // Server backend info
  const [backend, setBackend] = useState(null);
  const [backendName, setBackendName] = useState('');
  const [hasGpu, setHasGpu] = useState(false);
  const [gpuName, setGpuName] = useState(null);
  const [features, setFeatures] = useState([]);

  // Browser TTS state
  const [browserTTSReady, setBrowserTTSReady] = useState(false);
  const [browserTTSLoading, setBrowserTTSLoading] = useState(false);
  const [browserVoices, setBrowserVoices] = useState([]);

  // Refs
  const audioRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isProcessingRef = useRef(false);
  const pocketTTSRef = useRef(null);
  const voiceCacheRef = useRef(new Map()); // avatarId → encoded voice
  // Server TTS is ALWAYS available on Nunba (Piper CPU runs on any machine).
  // Don't wait for async CDN probe — it hangs in pywebview (no internet).
  const serverAvailableRef = useRef(true);
  const probeRef = useRef(null); // cached capability probe result

  // --- Helper: wire callbacks and init a browser TTS engine instance ---
  const _wireAndInit = useCallback(async (engine, sampleRate) => {
    const svc = new PocketTTSService({ sampleRate, engine });
    svc.onReady = () => {
      setBrowserTTSReady(true);
      setBrowserTTSLoading(false);
      setIsAvailable(true);
    };
    svc.onStatus = (status) => {
      if (status.includes('Downloading')) setBrowserTTSLoading(true);
    };
    svc.onVoicesLoaded = (voices) => setBrowserVoices(voices);
    svc.onComplete = () => setIsSpeaking(false);
    svc.onError = (err) => {
      console.warn(`[TTS] ${engine} error:`, err);
      const probe = probeRef.current;
      // If init failed (not yet ready) and fallback available, try it
      if (!svc.isReady && probe?.fallback && engine !== probe.fallback) {
        console.log(`[TTS] ${engine} failed during init, falling back to ${probe.fallback}`);
        svc.destroy();
        pocketTTSRef.current = null;
        _wireAndInit(probe.fallback, probe.fallbackSampleRate).catch(() => {
          setBrowserTTSLoading(false);
        });
        return;
      }
      setError(err);
      setIsSpeaking(false);
    };
    pocketTTSRef.current = svc;
    await svc.init();
  }, []);

  // --- Initialize browser TTS (lazy — starts on first user interaction) ---
  const initBrowserTTS = useCallback(async () => {
    if (pocketTTSRef.current || browserTTSLoading) return;
    setBrowserTTSLoading(true);
    try {
      // Single-path probe: pick best engine ONCE, use only that
      const probe = await probeTTSCapability();
      probeRef.current = probe;
      if (probe.engine === 'server') {
        // No local TTS — rely on server only
        setBrowserTTSLoading(false);
        serverAvailableRef.current = true;
        setIsAvailable(true);
        return;
      }
      await _wireAndInit(probe.engine, probe.sampleRate);
    } catch (err) {
      console.warn(`[TTS] ${probeRef.current?.engine} init threw:`, err);
      // Try fallback engine before giving up
      const probe = probeRef.current;
      if (probe?.fallback && probe.fallback !== 'server') {
        try {
          console.log(`[TTS] Trying fallback: ${probe.fallback}`);
          await _wireAndInit(probe.fallback, probe.fallbackSampleRate);
          return;
        } catch (fallbackErr) {
          console.warn(`[TTS] Fallback ${probe.fallback} also failed:`, fallbackErr);
        }
      }
      // Browser TTS failed but server TTS is always available
      // (Piper CPU runs on any machine, no internet needed)
      serverAvailableRef.current = true;
      setIsAvailable(true);
      setBrowserTTSLoading(false);
    }
  }, [browserTTSLoading, _wireAndInit]);

  // --- Check server TTS status on mount ---
  useEffect(() => {
    checkStatus();
  }, []);

  // --- Eagerly init browser TTS when enabled (don't wait for first speak) ---
  useEffect(() => {
    if (enabled && !pocketTTSRef.current && !browserTTSLoading) {
      initBrowserTTS();
    }
  }, [enabled]);

  // --- Audio element for server TTS playback ---
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.onended = () => {
        setIsSpeaking(false);
        processQueue();
      };
      audioRef.current.onerror = () => {
        setIsSpeaking(false);
        processQueue();
      };
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // --- Cleanup browser TTS on unmount ---
  useEffect(() => {
    return () => {
      pocketTTSRef.current?.destroy();
    };
  }, []);

  // --- Server TTS status check ---
  const checkStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${TTS_API_BASE}/status`);
      const data = await resp.json();
      serverAvailableRef.current = data.available || false;
      setIsAvailable(data.available || browserTTSReady);
      setInstalledVoices(data.installed_voices || []);
      setCurrentVoice(data.current_voice || voiceId);
      setBackend(data.backend || null);
      setBackendName(data.backend_name || '');
      setHasGpu(data.has_gpu || false);
      setGpuName(data.gpu_name || null);
      setFeatures(data.features || []);
      return data;
    } catch {
      serverAvailableRef.current = false;
      setIsAvailable(browserTTSReady);
      return null;
    }
  }, [voiceId, browserTTSReady]);

  const fetchVoices = useCallback(async () => {
    try {
      const resp = await fetch(`${TTS_API_BASE}/voices`);
      const data = await resp.json();
      setVoices(data.voices || {});
      setInstalledVoices(
        Object.keys(data.voices || {}).filter((v) => data.voices[v].installed)
      );
      return data.voices;
    } catch {
      return {};
    }
  }, []);

  const installVoice = useCallback(async (id) => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${TTS_API_BASE}/install`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({voice_id: id}),
      });
      const data = await resp.json();
      if (data.success) {
        setInstalledVoices((prev) => [...new Set([...prev, id])]);
        return true;
      }
      setError(data.error || 'Install failed');
      return false;
    } catch (err) {
      setError('Install failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // --- Non-blocking browser speak: fire off generation, manage state via callbacks ---
  const _speakBrowserNonBlocking = useCallback((text, voiceName) => {
    const svc = pocketTTSRef.current;
    if (!svc?.isReady) return false;

    setIsLoading(false);
    setIsSpeaking(true);

    // Save previous callbacks and restore after completion
    const prevComplete = svc.onComplete;
    const prevError = svc.onError;

    svc.onComplete = () => {
      setIsSpeaking(false);
      svc.onComplete = prevComplete;
      svc.onError = prevError;
    };
    svc.onError = (err) => {
      setIsSpeaking(false);
      setError(typeof err === 'string' ? err : err?.message || 'TTS error');
      svc.onComplete = prevComplete;
      svc.onError = prevError;
      // Fall back to server if available
      if (serverAvailableRef.current) {
        _speakServer(text, {});
      }
    };

    // Fire-and-forget — does NOT block the main thread
    svc.speak(text, voiceName);
    return true;
  }, []);

  // --- Core speak: choose-one-upfront, non-blocking browser TTS ---
  const speak = useCallback(
    async (text, speakOpts = {}) => {
      if (!enabled || !text?.trim()) return null;
      const trimmed = text.trim();

      // Lazy-init browser TTS on first speak (satisfies AudioContext autoplay policy)
      // MUST await — otherwise serverAvailableRef is still false when we check it
      if (!pocketTTSRef.current && !serverAvailableRef.current) {
        await initBrowserTTS();
      }

      setIsLoading(true);
      setError(null);

      const serverOk = serverAvailableRef.current;
      const browserOk = pocketTTSRef.current?.isReady;

      // Prefer server GPU engine when available — superior quality
      // (Chatterbox Turbo for English, Indic Parler for Tamil, CosyVoice3 for CJK)
      // Browser Pocket TTS is only used when server is unavailable
      if (serverOk) {
        return _speakServer(trimmed, speakOpts);
      }

      // Fallback: browser Pocket TTS (English only, no server needed)
      const preferredLang = localStorage.getItem('hart_language') || 'en';
      const isEnglish = _isLikelyEnglish(trimmed) && preferredLang === 'en';
      if (browserOk && isEnglish) {
        _speakBrowserNonBlocking(trimmed, speakOpts.browserVoice);
        return null;
      }

      // Neither available
      setIsLoading(false);
      setError('No TTS available');
      return null;
    },
    [enabled, speed, currentVoice, initBrowserTTS, _speakBrowserNonBlocking]
  );

  // Server-only speak
  const _speakServer = useCallback(
    async (text, opts) => {
      setIsLoading(true);
      try {
        // Send preferred language so server routes to correct GPU engine
        // (Tamil→Indic Parler, Japanese→CosyVoice3, English→Chatterbox Turbo)
        const lang = opts.language || localStorage.getItem('hart_language') || 'en';
        const resp = await fetch(`${TTS_API_BASE}/synthesize`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            text,
            voice_id: opts.voiceId || currentVoice,
            speed: opts.speed || speed,
            language: lang,
          }),
        });
        if (!resp.ok) throw new Error('Server TTS failed');
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.play();
          setIsSpeaking(true);
        }
        return url;
      } catch (err) {
        // Server TTS failed — fall back to browser Web Speech API
        // (works for most languages, lower quality but better than silence)
        try {
          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = lang;
          utter.rate = 0.9;
          utter.onend = () => setIsSpeaking(false);
          utter.onerror = () => setIsSpeaking(false);
          window.speechSynthesis.speak(utter);
          setIsSpeaking(true);
          return 'webspeech';
        } catch {
          setError(err.message);
          return null;
        }
      } finally {
        setIsLoading(false);
      }
    },
    [currentVoice, speed]
  );

  // _raceServerBrowser removed — replaced by choose-one-upfront logic in speak().
  // Browser PocketTTS preferred for English (zero server load), server for non-English.
  // Sequential fallback on failure only. No concurrent generation = no wasted GPU compute.

  // stop must be defined BEFORE speakWithSync/queueSpeak (they reference it)
  const stop = useCallback(() => {
    // Stop server TTS
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    // Stop browser TTS
    pocketTTSRef.current?.stop();
    // No pending race to cancel (choose-one-upfront logic)
    audioQueueRef.current = [];
    isProcessingRef.current = false;
    setIsSpeaking(false);
  }, []);

  /**
   * Speak text with synchronization callbacks for coordinating typewriter/subtitle timing.
   * Returns estimated duration and sets up position callbacks.
   *
   * @param {string} text — text to speak
   * @param {Object} opts
   * @param {Function} opts.onPosition — (positionMs, totalMs) called every ~50ms during playback
   * @param {string} opts.browserVoice — optional voice name
   * @returns {{ estimatedDurationMs: number, cancel: () => void }}
   */
  const speakWithSync = useCallback(
    (text, opts = {}) => {
      if (!enabled || !text?.trim())
        return {estimatedDurationMs: 0, cancel: () => {}};
      const trimmed = text.trim();

      // Estimate duration: ~150 words per minute average speaking rate
      const wordCount = trimmed.split(/\s+/).length;
      const estimatedDurationMs = Math.max((wordCount / 150) * 60000, 500);

      const svc = pocketTTSRef.current;
      if (svc?.isReady && _isLikelyEnglish(trimmed)) {
        // Wire position callback
        const prevPosition = svc.onPlaybackPosition;
        const prevComplete = svc.onComplete;
        const prevError = svc.onError;

        svc.onPlaybackPosition = (posMs, totalMs) => {
          opts.onPosition?.(posMs, totalMs || estimatedDurationMs);
        };
        svc.onComplete = () => {
          setIsSpeaking(false);
          opts.onPosition?.(estimatedDurationMs, estimatedDurationMs); // final position = done
          svc.onPlaybackPosition = prevPosition;
          svc.onComplete = prevComplete;
          svc.onError = prevError;
        };
        svc.onError = (err) => {
          setIsSpeaking(false);
          svc.onPlaybackPosition = prevPosition;
          svc.onComplete = prevComplete;
          svc.onError = prevError;
        };

        setIsSpeaking(true);
        svc.speak(trimmed, opts.browserVoice);
      } else {
        // Server TTS — no position tracking, just estimate-based timing
        // Pass language so server routes to correct GPU engine
        speak(trimmed, { ...opts, language: localStorage.getItem('hart_language') || 'en' });
      }

      return {
        estimatedDurationMs,
        cancel: () => stop(),
      };
    },
    [enabled, speak, stop]
  );

  const processQueue = useCallback(async () => {
    if (!audioQueueRef.current.length) {
      isProcessingRef.current = false;
      return;
    }
    isProcessingRef.current = true;
    const {text, options} = audioQueueRef.current.shift();
    await speak(text, options);
    processQueue();
  }, [speak]);

  const queueSpeak = useCallback(
    (text, opts = {}) => {
      if (!enabled || !text?.trim()) return;
      audioQueueRef.current.push({text, options: opts});
      if (!isProcessingRef.current) processQueue();
    },
    [enabled, processQueue]
  );

  const pause = useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
    setIsSpeaking(false);
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current?.src) {
      audioRef.current.play();
      setIsSpeaking(true);
    }
  }, []);

  const setVoice = useCallback(
    (id) => {
      if (voices[id] || installedVoices.includes(id)) {
        setCurrentVoice(id);
        return true;
      }
      return false;
    },
    [voices, installedVoices]
  );

  // --- Avatar voice cloning ---
  /**
   * Load and cache a voice clone for an avatar.
   * Fetches the voice sample audio from central instance by avatar ID,
   * encodes it in the browser TTS, and caches it for the session.
   *
   * @param {string|number} avatarId — teacher_avatar_id
   * @returns {Promise<boolean>} true if voice was loaded
   */
  const loadAvatarVoice = useCallback(
    async (avatarId) => {
      if (!avatarId) return false;
      if (voiceCacheRef.current.has(avatarId)) return true;

      // Lazy init browser TTS if not yet started
      if (!pocketTTSRef.current) await initBrowserTTS();
      const svc = pocketTTSRef.current;
      if (!svc?.isReady) return false;

      try {
        // Fetch voice sample URL from Hevolve Database API
        const resp = await fetch(
          `${CENTRAL_BASE}/get_voice_sample/${avatarId}`
        );
        if (!resp.ok) return false;
        const data = await resp.json();
        const voiceUrl =
          data.voice_sample_url || data.voiceSampleResponse?.voice_sample_url;
        if (!voiceUrl) return false;

        // Encode the voice audio in the browser TTS worker
        await svc.encodeVoiceFromURL(voiceUrl);
        voiceCacheRef.current.set(avatarId, 'custom');
        return true;
      } catch (err) {
        console.warn('Avatar voice load failed:', err);
        return false;
      }
    },
    [initBrowserTTS]
  );

  /**
   * Get avatar image URL from central instance.
   * @param {string|number} avatarId — teacher_avatar_id
   * @returns {string} image URL
   */
  const getAvatarImageUrl = useCallback((avatarId) => {
    if (!avatarId) return null;
    return `${CENTRAL_BASE}/get_teacher_avatar/${avatarId}`;
  }, []);

  return {
    // State
    isAvailable,
    isSpeaking,
    isLoading,
    error,
    voices,
    currentVoice,
    installedVoices,

    // Server backend info
    backend,
    backendName,
    hasGpu,
    gpuName,
    features,

    // Browser TTS state
    browserTTSReady,
    browserTTSLoading,
    browserVoices,

    // Actions
    speak,
    speakWithSync,
    queueSpeak,
    stop,
    pause,
    resume,
    setVoice,
    installVoice,
    fetchVoices,
    checkStatus,
    initBrowserTTS,

    // Avatar voice/image
    loadAvatarVoice,
    getAvatarImageUrl,

    // Config
    enabled,
    autoSpeak,
  };
}

export default useTTS;
