/**
 * useSpeechRecognition - Web Speech Recognition Hook
 *
 * Web equivalent of the React Native useSpeechRecognition hook.
 * Primary: WebSocket STT at ws://127.0.0.1:8005 (HARTOS streaming Whisper)
 * Fallback: Browser webkitSpeechRecognition / SpeechRecognition API
 *
 * API matches the RN hook exactly:
 *   { transcript, isListening, confidence, startListening, stopListening, resetTranscript, error }
 *
 * @param {Object} [config]
 * @param {string} [config.language='en'] - BCP-47 language code
 * @param {function} [config.onResult] - Callback with final transcript text
 * @param {function} [config.onPartialResult] - Callback with partial transcript text
 * @param {function} [config.onError] - Callback with error string
 */

import {useState, useEffect, useRef, useCallback} from 'react';

const WS_STT_URL = 'ws://127.0.0.1:8005';

// Check if browser SpeechRecognition is available
const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

export default function useSpeechRecognition(config = {}) {
  const {
    language: defaultLanguage = 'en',
    onResult,
    onPartialResult,
    onError: onErrorCallback,
  } = config;

  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [confidence, setConfidence] = useState(-1);
  const [error, setError] = useState(null);
  // Which STT path is active — exposed as a state so the UI can show a
  // local-vs-cloud privacy badge.  null = idle, 'ws' = local Whisper,
  // 'browser' = browser SpeechRecognition (cloud-backed in Chrome/Edge).
  const [activeMethod, setActiveMethod] = useState(null);

  const mountedRef = useRef(true);
  const wsRef = useRef(null);
  const recognitionRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const processorRef = useRef(null);
  const activeMethodRef = useRef(null); // 'ws' | 'browser'

  const onResultRef = useRef(onResult);
  const onPartialResultRef = useRef(onPartialResult);
  const onErrorRef = useRef(onErrorCallback);

  onResultRef.current = onResult;
  onPartialResultRef.current = onPartialResult;
  onErrorRef.current = onErrorCallback;

  // ── WebSocket STT ──────────────────────────────────────────────────────────

  const startWebSocketSTT = useCallback(async (lang) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      mediaStreamRef.current = stream;

      const ws = new WebSocket(WS_STT_URL);
      wsRef.current = ws;

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          ws.close();
          resolve(false);
        }, 3000);

        ws.onopen = () => {
          clearTimeout(timeout);
          // Send config message
          ws.send(JSON.stringify({type: 'config', language: lang}));

          // Set up audio streaming via AudioContext + ScriptProcessor
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 16000,
          });
          const source = audioCtx.createMediaStreamSource(stream);
          // ScriptProcessor is deprecated but widely supported; AudioWorklet
          // requires a separate file which complicates bundling
          const processor = audioCtx.createScriptProcessor(4096, 1, 1);

          processor.onaudioprocess = (e) => {
            if (ws.readyState === WebSocket.OPEN) {
              const inputData = e.inputBuffer.getChannelData(0);
              // Convert float32 to int16 PCM
              const pcm16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
              }
              ws.send(pcm16.buffer);
            }
          };

          source.connect(processor);
          processor.connect(audioCtx.destination);

          audioCtxRef.current = audioCtx;
          processorRef.current = processor;

          if (mountedRef.current) {
            activeMethodRef.current = 'ws';
            setActiveMethod('ws');
            setIsListening(true);
          }
          resolve(true);
        };

        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          try {
            const data = JSON.parse(event.data);
            const text = (data.text || data.transcript || '').trim();
            const conf = data.confidence ?? -1;

            if (text) {
              setTranscript(text);
              setConfidence(conf);

              if (data.is_final || data.isFinal) {
                if (onResultRef.current) onResultRef.current(text);
              } else {
                if (onPartialResultRef.current) onPartialResultRef.current(text);
              }
            }
          } catch (_) {}
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          resolve(false);
        };

        ws.onclose = () => {
          if (mountedRef.current && activeMethodRef.current === 'ws') {
            setIsListening(false);
          }
        };
      });
    } catch (err) {
      return false;
    }
  }, []);

  // ── Browser SpeechRecognition fallback ─────────────────────────────────────

  const startBrowserSTT = useCallback((lang) => {
    if (!SpeechRecognitionAPI) {
      const msg = 'Speech recognition not supported in this browser';
      if (mountedRef.current) setError(msg);
      if (onErrorRef.current) onErrorRef.current(msg);
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (!mountedRef.current) return;
      activeMethodRef.current = 'browser';
      setActiveMethod('browser');
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      if (!mountedRef.current) return;
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          final += text;
          setConfidence(result[0].confidence ?? -1);
        } else {
          interim += text;
        }
      }

      if (final) {
        setTranscript(final.trim());
        if (onResultRef.current) onResultRef.current(final.trim());
      } else if (interim) {
        setTranscript(interim.trim());
        if (onPartialResultRef.current) onPartialResultRef.current(interim.trim());
      }
    };

    recognition.onerror = (event) => {
      if (!mountedRef.current) return;
      // 'no-speech' is common and not a real error
      if (event.error === 'no-speech') return;
      const msg = event.error || 'Speech recognition error';
      setError(msg);
      if (onErrorRef.current) onErrorRef.current(msg);
    };

    recognition.onend = () => {
      if (!mountedRef.current) return;
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  // ── Public API ─────────────────────────────────────────────────────────────

  const startListening = useCallback(async (options = {}) => {
    if (!mountedRef.current) return;

    const lang = options.language || defaultLanguage;

    setError(null);
    setTranscript('');
    setConfidence(-1);

    // Try WebSocket STT first (local HARTOS Whisper)
    const wsOk = await startWebSocketSTT(lang);
    if (wsOk) return;

    // Fallback to browser SpeechRecognition
    startBrowserSTT(lang);
  }, [defaultLanguage, startWebSocketSTT, startBrowserSTT]);

  const stopListening = useCallback(() => {
    // Stop WebSocket STT
    if (wsRef.current) {
      try { wsRef.current.close(); } catch (_) {}
      wsRef.current = null;
    }
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch (_) {}
      processorRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (_) {}
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    // Stop browser SpeechRecognition
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }

    activeMethodRef.current = null;
    if (mountedRef.current) {
      setActiveMethod(null);
      setIsListening(false);
    }
  }, []);

  const resetTranscript = useCallback(() => {
    if (!mountedRef.current) return;
    setTranscript('');
    setConfidence(-1);
    setError(null);
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (wsRef.current) try { wsRef.current.close(); } catch (_) {}
      if (processorRef.current) try { processorRef.current.disconnect(); } catch (_) {}
      if (audioCtxRef.current) try { audioCtxRef.current.close(); } catch (_) {}
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      if (recognitionRef.current) try { recognitionRef.current.stop(); } catch (_) {}
    };
  }, []);

  return {
    transcript,
    isListening,
    confidence,
    startListening,
    stopListening,
    resetTranscript,
    error,
    // Path indicator: 'ws' when local HARTOS Whisper is connected,
    // 'browser' when falling back to the browser SpeechRecognition API
    // (cloud-backed in Chrome/Edge), null when idle.  UI uses this to
    // show users whether their audio stays local or is sent to the cloud.
    activeMethod,
    usingFallback: activeMethod === 'browser',
  };
}
