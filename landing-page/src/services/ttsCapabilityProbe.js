/**
 * TTS Capability Probe — Single-path decision engine.
 *
 * Runs ONCE at app init, detects hardware/browser capabilities,
 * selects the best TTS engine, and caches the decision for the session.
 *
 * Decision hierarchy (descending priority):
 *   1. LuxTTS ONNX (48kHz, ~130MB, WASM) — best quality, smaller download
 *   2. Pocket TTS ONNX (24kHz, ~200MB, WASM) — good quality, larger download
 *   3. Server TTS — network-dependent
 *
 * User principle: "Not multiple paths simultaneously working, but non-blocking
 * smartest fastest high accuracy available path to get things done."
 */

const CACHE_KEY = 'tts_capability_v1';

/**
 * @typedef {Object} TTSCapability
 * @property {'luxtts'|'pocket'|'server'} engine - Selected TTS engine
 * @property {number} sampleRate - Output sample rate (48000 or 24000)
 * @property {string} reason - Human-readable selection reason
 */

/**
 * Probe browser capabilities and select the best TTS engine.
 * Result is cached in sessionStorage for the lifetime of the tab.
 *
 * @returns {Promise<TTSCapability>}
 */
export async function probeTTSCapability() {
  // Check sessionStorage cache
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch (_) {
    // sessionStorage unavailable (private browsing, etc.) — proceed without cache
  }

  const result = {engine: 'server', sampleRate: 48000, reason: ''};

  // 1. WASM threads available? (required for ONNX inference)
  const hasWASMThreads =
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof WebAssembly !== 'undefined';

  // 2. Enough device memory? (navigator.deviceMemory is Chrome-only, default 4GB)
  const memoryGB = navigator.deviceMemory || 4;
  const hasEnoughForLuxTTS = memoryGB >= 2; // 130MB models + inference overhead
  const hasEnoughForPocket = memoryGB >= 2; // 200MB models + inference overhead

  // 3. Can we import ONNX Runtime? Quick probe (just checks importability)
  let canLoadORT = false;
  if (hasWASMThreads) {
    try {
      const ortModule = await import(
        /* webpackIgnore: true */
        'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.0/dist/ort.min.mjs'
      );
      canLoadORT = !!(ortModule.default || ortModule);
    } catch (_) {
      canLoadORT = false;
    }
  }

  // 4. Decision — Pocket TTS preferred, LuxTTS as fallback, server last
  if (hasWASMThreads && canLoadORT && hasEnoughForPocket) {
    result.engine = 'pocket';
    result.sampleRate = 24000;
    result.fallback = hasEnoughForLuxTTS ? 'luxtts' : null;
    result.fallbackSampleRate = 48000;
    result.reason =
      'Pocket TTS ONNX: WASM+threads available, 24kHz, voice marius';
  } else if (hasWASMThreads && canLoadORT && hasEnoughForLuxTTS) {
    result.engine = 'luxtts';
    result.sampleRate = 48000;
    result.fallback = null;
    result.fallbackSampleRate = null;
    result.reason =
      'LuxTTS ONNX: WASM+threads available, 48kHz, non-autoregressive';
  } else {
    result.engine = 'server';
    result.sampleRate = 48000;
    result.fallback = null;
    result.fallbackSampleRate = null;
    result.reason = hasWASMThreads
      ? 'Server TTS: ONNX Runtime unavailable'
      : 'Server TTS: no SharedArrayBuffer (WASM threads required)';
  }

  // Cache decision
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch (_) {}

  console.log(`[TTS Probe] Selected: ${result.engine} (${result.reason})`);
  return result;
}

/**
 * Clear the cached capability probe result.
 * Useful for testing or when capabilities change.
 */
export function clearTTSCapabilityCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch (_) {}
}

export default probeTTSCapability;
