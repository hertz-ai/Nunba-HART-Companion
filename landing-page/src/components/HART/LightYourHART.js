/**
 * LightYourHART.js — The most important 90 seconds in the entire app.
 *
 * A full-screen, immersive onboarding experience where the PA meets
 * the human for the first time, asks two gentle questions, and gives
 * them a name. One word. Theirs forever.
 *
 * Architecture:
 *   - Timeline choreography: every word, pause, animation is timed
 *   - Pre-synth voice: loads OGG/WAV from /hart-voices/{lang}/{id}.ogg
 *   - Fallback: Web Speech API synthesis if pre-synth unavailable
 *   - Ambient soundscape: Web Audio API generative texture
 *   - Particles: Canvas-based, respond to conversation state
 *   - STT: Web Speech API, visual waveform feedback
 *   - Zero compute during conversation (all pre-rendered)
 *   - Single LLM call only for name generation
 *
 * "Every word spoken matters." — The human who built this.
 */

import { API_BASE_URL } from '../../config/apiBase';
import VoiceVisualizer from '../VoiceVisualizer';

import { Box, Typography, Fade, Grow, ButtonBase } from '@mui/material';
import React, { useState, useEffect, useRef, useCallback } from 'react';

// ════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════

const PHASES = [
  'darkness',       // Initial black screen, ambient starts
  'language',       // "What language feels like home?"
  'greeting',       // PA introduces itself
  'passion',        // Question 1
  'ack_passion',    // PA acknowledges
  'escape',         // Question 2
  'ack_escape',     // PA acknowledges
  'pre_reveal',     // "I think I know you."
  'generating',     // Name is being generated (brief)
  'reveal_intro',   // "Your secret name is..."
  'reveal_name',    // THE moment — name appears
  'post_reveal',    // "This is yours. Our secret."
  'sealed',         // Done — transition to app
];

const LANGUAGES = [
  { code: 'en', label: 'English', locale: 'en_US' },
  { code: 'hi', label: 'हिन्दी', locale: 'hi_IN' },
  { code: 'ta', label: 'தமிழ்', locale: 'ta_IN' },
  { code: 'bn', label: 'বাংলা', locale: 'bn_IN' },
  { code: 'te', label: 'తెలుగు', locale: 'te_IN' },
  { code: 'mr', label: 'मराठी', locale: 'mr_IN' },
  { code: 'gu', label: 'ગુજરાતી', locale: 'gu_IN' },
  { code: 'kn', label: 'ಕನ್ನಡ', locale: 'kn_IN' },
  { code: 'ml', label: 'മലയാളം', locale: 'ml_IN' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ', locale: 'pa_IN' },
  { code: 'ur', label: 'اردو', locale: 'ur_PK' },
  { code: 'es', label: 'Español', locale: 'es_ES' },
  { code: 'fr', label: 'Français', locale: 'fr_FR' },
  { code: 'de', label: 'Deutsch', locale: 'de_DE' },
  { code: 'pt', label: 'Português', locale: 'pt_BR' },
  { code: 'ru', label: 'Русский', locale: 'ru_RU' },
  { code: 'ja', label: '日本語', locale: 'ja_JP' },
  { code: 'ko', label: '한국어', locale: 'ko_KR' },
  { code: 'zh', label: '中文', locale: 'zh_CN' },
  { code: 'ar', label: 'العربية', locale: 'ar_SA' },
  { code: 'tr', label: 'Türkçe', locale: 'tr_TR' },
  { code: 'vi', label: 'Tiếng Việt', locale: 'vi_VN' },
  { code: 'th', label: 'ไทย', locale: 'th_TH' },
  { code: 'id', label: 'Bahasa Indonesia', locale: 'id_ID' },
  { code: 'ms', label: 'Bahasa Melayu', locale: 'ms_MY' },
  { code: 'pl', label: 'Polski', locale: 'pl_PL' },
  { code: 'nl', label: 'Nederlands', locale: 'nl_NL' },
  { code: 'sv', label: 'Svenska', locale: 'sv_SE' },
  { code: 'fi', label: 'Suomi', locale: 'fi_FI' },
  { code: 'el', label: 'Ελληνικά', locale: 'el_GR' },
  { code: 'he', label: 'עברית', locale: 'he_IL' },
  { code: 'fa', label: 'فارسی', locale: 'fa_IR' },
  { code: 'uk', label: 'Українська', locale: 'uk_UA' },
  { code: 'ro', label: 'Română', locale: 'ro_RO' },
  { code: 'hu', label: 'Magyar', locale: 'hu_HU' },
  { code: 'bg', label: 'Български', locale: 'bg_BG' },
  { code: 'is', label: 'Íslenska', locale: 'is_IS' },
  { code: 'lv', label: 'Latviešu', locale: 'lv_LV' },
  { code: 'sw', label: 'Kiswahili', locale: 'sw_KE' },
  { code: 'cy', label: 'Cymraeg', locale: 'cy_GB' },
];

// ════════════════════════════════════════════════════════════════════
// STYLES — the visual language of the dream
// ════════════════════════════════════════════════════════════════════

const styles = {
  root: {
    position: 'fixed',
    inset: 0,
    zIndex: 99999,
    bgcolor: '#000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    cursor: 'default',
    userSelect: 'none',
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none',
  },
  content: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    px: 4,
    maxWidth: 600,
    width: '100%',
  },
  paText: {
    color: 'rgba(255,255,255,0.87)',
    fontWeight: 300,
    fontSize: { xs: '1.15rem', sm: '1.35rem' },
    lineHeight: 1.7,
    letterSpacing: '0.02em',
    fontFamily: '"Inter", "SF Pro Text", -apple-system, sans-serif',
    transition: 'opacity 0.8s ease',
  },
  optionChip: {
    color: 'rgba(255,255,255,0.7)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '24px',
    px: 3,
    py: 1.2,
    fontSize: { xs: '0.85rem', sm: '0.95rem' },
    fontWeight: 400,
    letterSpacing: '0.01em',
    fontFamily: '"Inter", "SF Pro Text", -apple-system, sans-serif',
    transition: 'all 0.4s ease',
    '&:hover': {
      borderColor: 'rgba(108, 99, 255, 0.6)',
      color: 'rgba(255,255,255,0.95)',
      bgcolor: 'rgba(108, 99, 255, 0.08)',
    },
  },
  nameText: {
    color: '#fff',
    fontWeight: 200,
    fontSize: { xs: '3rem', sm: '4.5rem', md: '5.5rem' },
    letterSpacing: '0.15em',
    fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
    textShadow: '0 0 60px rgba(108, 99, 255, 0.4), 0 0 120px rgba(108, 99, 255, 0.2)',
  },
  languageGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 1.5,
    maxWidth: 480,
  },
};

// ════════════════════════════════════════════════════════════════════
// KEYFRAME ANIMATIONS
// ════════════════════════════════════════════════════════════════════

const keyframes = `
@keyframes hart-breathe {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.02); }
}
@keyframes hart-fade-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes hart-letter-in {
  from { opacity: 0; transform: translateY(10px) scale(0.8); filter: blur(8px); }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
@keyframes hart-glow-pulse {
  0%, 100% { text-shadow: 0 0 40px rgba(108,99,255,0.3), 0 0 80px rgba(108,99,255,0.15); }
  50% { text-shadow: 0 0 60px rgba(108,99,255,0.5), 0 0 120px rgba(108,99,255,0.3), 0 0 200px rgba(108,99,255,0.1); }
}
@keyframes hart-settled {
  from { letter-spacing: 0.15em; }
  to { letter-spacing: 0.08em; }
}
@keyframes hart-emoji-in {
  from { opacity: 0; transform: scale(0) rotate(-180deg); }
  to { opacity: 1; transform: scale(1) rotate(0deg); }
}
@keyframes hart-reveal-flash {
  0% { opacity: 0; }
  15% { opacity: 0.08; }
  100% { opacity: 0; }
}
@keyframes hart-at-breathe {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.55; }
}
`;

// ════════════════════════════════════════════════════════════════════
// COMPUTE AWARENESS — reduce effects on low-end devices
// ════════════════════════════════════════════════════════════════════

const _computeProfile = (() => {
  const cores = navigator.hardwareConcurrency || 2;
  const mem = navigator.deviceMemory || 4; // GB (Chrome only, defaults to 4)
  if (cores <= 2 || mem <= 2) return 'low';
  if (cores <= 4 || mem <= 4) return 'medium';
  return 'high';
})();

const PARTICLE_COUNTS = { low: 25, medium: 50, high: 80 };
const GLOW_ENABLED = _computeProfile !== 'low';

// Answer-responsive hue palettes — particles shift color based on passion
const PASSION_HUES = {
  music_art:        { base: 280, spread: 30 },  // violet-magenta (creative)
  reading_learning: { base: 210, spread: 25 },  // blue (curious)
  building_coding:  { base: 160, spread: 30 },  // teal-cyan (builder)
  people_stories:   { base: 30, spread: 20 },   // warm amber (social)
  nature_movement:  { base: 120, spread: 35 },  // green (grounded)
  games_strategy:   { base: 300, spread: 25 },  // purple-pink (strategic)
};

// ════════════════════════════════════════════════════════════════════
// PARTICLE SYSTEM — Canvas-based ambient particles
// ════════════════════════════════════════════════════════════════════

function useParticles(canvasRef, phase, passionKey) {
  const particlesRef = useRef([]);
  const frameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.scale(dpr, dpr);
    }
    resize();
    window.addEventListener('resize', resize);

    // Initialize particles — count adapts to device capability
    const count = Math.min(
      PARTICLE_COUNTS[_computeProfile],
      Math.floor(window.innerWidth / 15)
    );
    if (particlesRef.current.length === 0) {
      particlesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.3 + 0.05,
        hue: Math.random() * 40 + 240, // purple-blue range
        targetHue: null,
      }));
    }

    // Apply passion-responsive color shift
    const palette = passionKey ? PASSION_HUES[passionKey] : null;

    function draw() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const isConverging = phase === 'pre_reveal' || phase === 'generating';
      const isRevealing = phase === 'reveal_intro' || phase === 'reveal_name';
      const isSettled = phase === 'post_reveal' || phase === 'sealed';
      const cx = w / 2;
      const cy = h / 2;

      for (const p of particlesRef.current) {
        // Gradually shift hue toward passion palette (or back to default purple)
        if (palette && (phase !== 'darkness' && phase !== 'language')) {
          const target = palette.base + (Math.random() - 0.5) * palette.spread * 0.1;
          p.hue += (target - p.hue) * 0.008;
        }

        if (isConverging) {
          p.vx += (cx - p.x) * 0.0008;
          p.vy += (cy - p.y) * 0.0008;
          p.alpha = Math.min(p.alpha + 0.002, 0.6);
        } else if (isRevealing) {
          const dx = p.x - cx;
          const dy = p.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetDist = 120 + p.r * 30;
          p.vx += (-dy / dist) * 0.02 + (targetDist - dist) * dx / dist * 0.001;
          p.vy += (dx / dist) * 0.02 + (targetDist - dist) * dy / dist * 0.001;
          p.alpha = Math.min(p.alpha + 0.005, 0.8);
          // Reveal moment: shift toward unified purple
          p.hue += (260 - p.hue) * 0.03;
        } else if (isSettled) {
          p.vx *= 0.98;
          p.vy *= 0.98;
          p.alpha = Math.max(p.alpha - 0.001, 0.1);
        } else {
          p.vx += (Math.random() - 0.5) * 0.02;
          p.vy += (Math.random() - 0.5) * 0.02;
        }

        p.vx *= 0.995;
        p.vy *= 0.995;
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 60%, 70%, ${p.alpha})`;
        ctx.fill();

        // Glow (skip on low-end devices)
        if (GLOW_ENABLED && p.alpha > 0.2) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${p.hue}, 60%, 70%, ${p.alpha * 0.15})`;
          ctx.fill();
        }
      }

      frameRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [canvasRef, phase, passionKey]);
}

// ════════════════════════════════════════════════════════════════════
// AMBIENT SOUNDSCAPE — Web Audio API generative texture
// ════════════════════════════════════════════════════════════════════

function useAmbientSound(phase) {
  const ctxRef = useRef(null);
  const gainRef = useRef(null);
  const osc3Ref = useRef(null); // Third harmonic — added at reveal

  useEffect(() => {
    if (phase === 'darkness') return;

    if (!ctxRef.current) {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(ctx.destination);

        // Layer 1: Deep root note
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 110; // A2
        const osc1Gain = ctx.createGain();
        osc1Gain.gain.value = 0.04;
        osc1.connect(osc1Gain).connect(gain);
        osc1.start();

        // Layer 2: Perfect fifth — harmonic warmth
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 165; // E3
        const osc2Gain = ctx.createGain();
        osc2Gain.gain.value = 0.025;
        osc2.connect(osc2Gain).connect(gain);
        osc2.start();

        // Layer 3: Major third — enters at reveal for emotional lift
        const osc3 = ctx.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.value = 138.59; // C#3 — major third
        const osc3Gain = ctx.createGain();
        osc3Gain.gain.value = 0; // Silent until reveal
        osc3.connect(osc3Gain).connect(gain);
        osc3.start();
        osc3Ref.current = osc3Gain;

        // LFO breathing — very slow, barely perceptible
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.08; // One breath every 12.5 seconds
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.012;
        lfo.connect(lfoGain).connect(osc1Gain.gain);
        lfo.start();

        ctxRef.current = ctx;
        gainRef.current = gain;

        gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 3);
      } catch {
        // Audio not available — silent mode, still beautiful
      }
    }

    // Phase-reactive dynamics
    if (gainRef.current && ctxRef.current) {
      const g = gainRef.current.gain;
      const t = ctxRef.current.currentTime;

      if (phase === 'pre_reveal' || phase === 'generating') {
        // Hold breath — drop volume, suspense
        g.linearRampToValueAtTime(0.2, t + 2);
      } else if (phase === 'reveal_intro') {
        // Slowly build — the third harmonic begins
        g.linearRampToValueAtTime(0.4, t + 2);
        if (osc3Ref.current) {
          osc3Ref.current.gain.linearRampToValueAtTime(0.015, t + 3);
        }
      } else if (phase === 'reveal_name') {
        // THE moment — full harmonic chord, emotional swell
        g.linearRampToValueAtTime(0.75, t + 1.5);
        if (osc3Ref.current) {
          osc3Ref.current.gain.linearRampToValueAtTime(0.03, t + 1);
        }
      } else if (phase === 'post_reveal') {
        // Settle into warmth
        g.linearRampToValueAtTime(0.5, t + 3);
      } else if (phase === 'sealed') {
        // Fade to silence — the dream ends gently
        g.linearRampToValueAtTime(0, t + 5);
        if (osc3Ref.current) {
          osc3Ref.current.gain.linearRampToValueAtTime(0, t + 4);
        }
      }
    }

    return () => {
      if (phase === 'sealed' && ctxRef.current) {
        setTimeout(() => {
          try { ctxRef.current.close(); } catch {}
          ctxRef.current = null;
          osc3Ref.current = null;
        }, 6000);
      }
    };
  }, [phase]);
}

// ════════════════════════════════════════════════════════════════════
// PRE-SYNTH VOICE — loads from /hart-voices/{lang}/{id}.ogg
// Falls back to Web Speech API synthesis
// ════════════════════════════════════════════════════════════════════

function usePreSynthVoice(language) {
  const audioRef = useRef(null);
  const cacheRef = useRef({}); // lineId -> { type: 'presynth'|'webspeech', url?, audio? }
  const preloadedRef = useRef({}); // lineId -> Audio element (preloaded)

  // Preload upcoming lines when language is selected — zero latency
  // Uses manifest.json (generated by generate_hart_voices.py) to know which
  // files exist, avoiding N individual HEAD requests. Falls back to HEAD if
  // manifest is unavailable.
  useEffect(() => {
    if (!language) return;

    // Clear stale cache from previous language to prevent playing wrong audio
    cacheRef.current = {};
    preloadedRef.current = {};

    const allLines = [
      'greeting', 'question_passion', 'question_escape',
      'ack_escape', 'pre_reveal', 'reveal_intro', 'post_reveal',
      'ack_music_art', 'ack_reading_learning', 'ack_building_coding',
      'ack_people_stories', 'ack_nature_movement', 'ack_games_strategy',
    ];

    const preloadLine = (lineId) => {
      const url = `/hart-voices/${language}/${lineId}.ogg`;
      cacheRef.current[lineId] = 'presynth';
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.volume = 0.85;
      preloadedRef.current[lineId] = audio;
    };

    // Try manifest first (single request), fall back to per-file HEAD
    fetch('/hart-voices/manifest.json')
      .then(r => r.ok ? r.json() : null)
      .then(manifest => {
        if (manifest && manifest[language]) {
          const available = new Set(manifest[language]);
          for (const lineId of allLines) {
            if (available.has(lineId)) {
              preloadLine(lineId);
            } else {
              cacheRef.current[lineId] = 'webspeech';
            }
          }
        } else {
          // No manifest — fall back to individual HEAD requests
          for (const lineId of allLines) {
            const url = `/hart-voices/${language}/${lineId}.ogg`;
            fetch(url, { method: 'HEAD' }).then(resp => {
              if (resp.ok) {
                preloadLine(lineId);
              } else {
                cacheRef.current[lineId] = 'webspeech';
              }
            }).catch(() => {
              cacheRef.current[lineId] = 'webspeech';
            });
          }
        }
      })
      .catch(() => {
        // Manifest fetch failed — fall back to HEAD
        for (const lineId of allLines) {
          const url = `/hart-voices/${language}/${lineId}.ogg`;
          fetch(url, { method: 'HEAD' }).then(resp => {
            if (resp.ok) {
              preloadLine(lineId);
            } else {
              cacheRef.current[lineId] = 'webspeech';
            }
          }).catch(() => {
            cacheRef.current[lineId] = 'webspeech';
          });
        }
      });
  }, [language]);

  const speak = useCallback(async (lineId, text) => {
    const doSpeak = async () => {
      // Check cache (may already be populated by preloader or preSynth)
      if (!cacheRef.current[lineId]) {
        const url = `/hart-voices/${language}/${lineId}.ogg`;
        try {
          const resp = await fetch(url, { method: 'HEAD' });
          cacheRef.current[lineId] = resp.ok ? 'presynth' : 'webspeech';
        } catch {
          cacheRef.current[lineId] = 'webspeech';
        }
      }

      // Pre-synth audio available (static .ogg OR backend-synthesized blob)
      if (cacheRef.current[lineId] === 'presynth') {
        return new Promise((resolve) => {
          const audio = preloadedRef.current[lineId]
            || new Audio(`/hart-voices/${language}/${lineId}.ogg`);
          audio.volume = 0.85;
          audioRef.current = audio;
          audio.onended = resolve;
          audio.onerror = () => _webSpeech(text, language).then(resolve);
          audio.play().catch(() => _webSpeech(text, language).then(resolve));
        });
      }

      // Tier 2: Backend TTS engine (GPU Indic Parler / Chatterbox / CosyVoice)
      try {
        const ttsResp = await fetch(`${API_BASE_URL}/tts/synthesize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, language }),
        });
        if (ttsResp.ok) {
          const blob = await ttsResp.blob();
          if (blob.size > 1000) {
            return new Promise((resolve) => {
              const audio = new Audio(URL.createObjectURL(blob));
              audio.volume = 0.85;
              audioRef.current = audio;
              audio.onended = resolve;
              audio.onerror = resolve;
              audio.play().catch(resolve);
            });
          }
        }
      } catch { /* Backend TTS unavailable */ }

      // Tier 3: Web Speech API (last resort)
      return _webSpeech(text, language);
    };

    // Race against timeout — ceremony must never hang
    return Promise.race([doSpeak(), _sleep(12000)]);
  }, [language]);

  // Pre-synthesize dynamic text via backend TTS (e.g., generated HART names)
  const preSynth = useCallback(async (lineId, text) => {
    try {
      const resp = await fetch(`${API_BASE_URL}/tts/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language }),
      });
      if (resp.ok) {
        const blob = await resp.blob();
        if (blob.size > 1000) { // Sanity: real audio > 1KB
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.preload = 'auto';
          audio.volume = 0.85;
          preloadedRef.current[lineId] = audio;
          cacheRef.current[lineId] = 'presynth';
          return true;
        }
      }
    } catch { /* Backend TTS unavailable — speak() falls through to Web Speech */ }
    return false;
  }, [language]);

  // Warm up TTS engine for selected language (triggers model loading in background)
  const warmUp = useCallback(async (lang) => {
    const targetLang = lang || language;
    try {
      const resp = await fetch(`${API_BASE_URL}/tts/status`);
      if (resp.ok) {
        const status = await resp.json();
        if (status.available) {
          // Trigger engine initialization for target language with a tiny phrase
          fetch(`${API_BASE_URL}/tts/synthesize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: '.', language: targetLang }),
          }).catch(() => {});
          return 'ready';
        }
        return 'unavailable';
      }
    } catch { /* Backend down — will use pre-synth .ogg + Web Speech fallback */ }
    return 'unavailable';
  }, [language]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
  }, []);

  return { speak, stop, preSynth, warmUp, audioRef };
}

function _webSpeech(text, lang) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return; }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang === 'ta' ? 'ta-IN' : lang === 'hi' ? 'hi-IN' :
                 lang === 'ja' ? 'ja-JP' : lang === 'ko' ? 'ko-KR' :
                 lang === 'zh' ? 'zh-CN' : lang === 'ar' ? 'ar-SA' :
                 lang === 'ru' ? 'ru-RU' : `${lang}-${lang.toUpperCase()}`;
    utter.rate = 0.85; // Unhurried
    utter.pitch = 0.95; // Warm
    utter.volume = 0.85;
    // Timeout guard — Web Speech onend may never fire in pywebview/embedded builds
    const timeout = setTimeout(() => {
      window.speechSynthesis.cancel();
      resolve();
    }, 10000);
    utter.onend = () => { clearTimeout(timeout); resolve(); };
    utter.onerror = () => { clearTimeout(timeout); resolve(); };
    window.speechSynthesis.speak(utter);
  });
}

// ════════════════════════════════════════════════════════════════════
// LETTER-BY-LETTER TEXT RENDERER
// ════════════════════════════════════════════════════════════════════

function TypedText({ text, delay = 40, onComplete, sx = {} }) {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (!text) return;
    setVisible(0);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setVisible(i);
      if (i >= text.length) {
        clearInterval(timer);
        if (onComplete) setTimeout(onComplete, 300);
      }
    }, delay);
    return () => clearInterval(timer);
  }, [text, delay, onComplete]);

  if (!text) return null;

  return (
    <Typography sx={{ ...styles.paText, ...sx }}>
      {text.split('').map((ch, i) => (
        <span
          key={i}
          style={{
            opacity: i < visible ? 1 : 0,
            transition: `opacity 0.3s ease ${i * 0.02}s`,
          }}
        >
          {ch}
        </span>
      ))}
    </Typography>
  );
}

// ════════════════════════════════════════════════════════════════════
// NAME REVEAL — the climactic moment
// ════════════════════════════════════════════════════════════════════

function NameReveal({ name, emojiCombo, hartTag, show }) {
  const [lettersVisible, setLettersVisible] = useState(0);
  const [emojiVisible, setEmojiVisible] = useState(false);

  useEffect(() => {
    if (!show || !name) return;
    setLettersVisible(0);
    setEmojiVisible(false);

    let i = 0;
    const timer = setInterval(() => {
      i++;
      setLettersVisible(i);
      if (i >= name.length) {
        clearInterval(timer);
        setTimeout(() => setEmojiVisible(true), 800);
      }
    }, 180); // Slower than normal text — each letter is a moment

    return () => clearInterval(timer);
  }, [show, name]);

  if (!show || !name) return null;

  return (
    <Box sx={{ textAlign: 'center' }}>
      {/* The @ prefix — breathes gently while name appears */}
      <Typography
        component="span"
        sx={{
          ...styles.nameText,
          fontSize: { xs: '2rem', sm: '3rem', md: '3.5rem' },
          opacity: lettersVisible > 0 ? 0.5 : 0,
          animation: lettersVisible > 0 ? 'hart-at-breathe 4s ease-in-out infinite' : 'none',
          transition: 'opacity 0.6s ease',
          mr: 0.5,
        }}
      >
        @
      </Typography>

      {/* Each letter of the name */}
      {name.split('').map((letter, i) => (
        <Typography
          key={i}
          component="span"
          sx={{
            ...styles.nameText,
            display: 'inline-block',
            opacity: i < lettersVisible ? 1 : 0,
            animation: i < lettersVisible
              ? `hart-letter-in 0.6s ease ${i * 0.15}s both, hart-glow-pulse 3s ease-in-out ${i * 0.15 + 0.6}s infinite`
              : 'none',
          }}
        >
          {letter}
        </Typography>
      ))}

      {/* Emoji combo */}
      {emojiCombo && (
        <Typography
          sx={{
            mt: 3,
            fontSize: '2rem',
            opacity: emojiVisible ? 1 : 0,
            animation: emojiVisible ? 'hart-emoji-in 0.8s ease both' : 'none',
            letterSpacing: '0.3em',
          }}
        >
          {emojiCombo}
        </Typography>
      )}

      {/* Three-word identity tag — fades in after emoji */}
      {hartTag && emojiVisible && (
        <Typography
          sx={{
            mt: 2,
            fontSize: '0.85rem',
            color: 'rgba(255,255,255,0.3)',
            fontWeight: 300,
            letterSpacing: '0.15em',
            opacity: 0,
            animation: 'hart-emoji-in 1.2s ease 0.5s both',
          }}
        >
          {hartTag}
        </Typography>
      )}
    </Box>
  );
}

// ════════════════════════════════════════════════════════════════════
// MAIN COMPONENT — LightYourHART
// ════════════════════════════════════════════════════════════════════

export default function LightYourHART({ userId, onComplete }) {
  const [phase, setPhase] = useState('darkness');
  const [language, setLanguage] = useState('en');
  const [locale, setLocale] = useState('en_US');
  const [paText, setPaText] = useState('');
  const [options, setOptions] = useState([]);
  const [passionKey, setPassionKey] = useState(null);
  const [escapeKey, setEscapeKey] = useState(null);
  const [hartName, setHartName] = useState(null);
  const [hartTag, setHartTag] = useState('');
  const [emojiCombo, setEmojiCombo] = useState('');
  const [hartCandidates, setHartCandidates] = useState([]); // backup candidates from generation
  const [showName, setShowName] = useState(false);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef(null);

  // Systems — particles respond to both phase AND chosen passion
  useParticles(canvasRef, phase, passionKey);
  useAmbientSound(phase);
  const { speak: _rawSpeak, stop: _rawStop, preSynth, warmUp, audioRef: hartAudioRef } = usePreSynthVoice(language);
  const [hartSpeaking, setHartSpeaking] = useState(false);

  // Wrap speak/stop to toggle visualizer state
  const speak = useCallback(async (...args) => {
    setHartSpeaking(true);
    try { return await _rawSpeak(...args); }
    finally { setHartSpeaking(false); }
  }, [_rawSpeak]);
  const stop = useCallback(() => { _rawStop(); setHartSpeaking(false); }, [_rawStop]);

  // ── Phase: Darkness → Language (auto after 2s) ──
  useEffect(() => {
    const timer = setTimeout(() => setPhase('language'), 2000);
    return () => clearTimeout(timer);
  }, []);

  // ── API: advance the backend session ──
  const advance = useCallback(async (action, data) => {
    try {
      const token = localStorage.getItem('access_token');
      const resp = await fetch(`${API_BASE_URL}/api/hart/advance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action, data }),
      });
      if (resp.ok) return await resp.json();
    } catch {
      // Offline mode — continue with frontend-only flow
    }
    return null;
  }, []);

  // ── Handle language selection ──
  const selectLanguage = useCallback(async (lang) => {
    const sel = LANGUAGES.find(l => l.code === lang.code);
    setLanguage(sel.code);
    setLocale(sel.locale);
    advance('select_language', { language: sel.code, locale: sel.locale });

    // Warm up TTS engine for this language (triggers model loading in background)
    warmUp(sel.code);

    // Transition to greeting
    setPhase('greeting');
  }, [advance, warmUp]);

  // ── Handle greeting → passion (auto-timed with voice) ──
  useEffect(() => {
    if (phase !== 'greeting') return;
    let cancelled = false;

    (async () => {
      // PA speaks the greeting
      const greetingText = _getLine('greeting', language);
      setPaText(greetingText);
      await speak('greeting', greetingText);
      if (cancelled) return;

      // Pause — let it breathe
      await _sleep(2000);
      if (cancelled) return;

      // Transition to passion question
      setPhase('passion');
    })();

    return () => { cancelled = true; stop(); };
  }, [phase, language, speak, stop]);

  // ── Handle passion question ──
  useEffect(() => {
    if (phase !== 'passion') return;
    const text = _getLine('question_passion', language);
    setPaText(text);
    setOptions(_getOptions('passion', language));
    speak('question_passion', text);
  }, [phase, language, speak]);

  // ── Handle passion answer ──
  const answerPassion = useCallback(async (key) => {
    setPassionKey(key);
    setOptions([]);
    advance('answer', { key });

    // PA acknowledges
    setPhase('ack_passion');
    const ack = _getAcknowledgment('passion', key, language);
    setPaText(ack);
    await speak(`ack_${key}`, ack);
    await _sleep(1500);

    // Transition to escape question
    setPhase('escape');
  }, [language, advance, speak]);

  // ── Handle escape question ──
  useEffect(() => {
    if (phase !== 'escape') return;
    const text = _getLine('question_escape', language);
    setPaText(text);
    setOptions(_getOptions('escape', language));
    speak('question_escape', text);
  }, [phase, language, speak]);

  // ── Handle escape answer ──
  const answerEscape = useCallback(async (key) => {
    setEscapeKey(key);
    setOptions([]);
    advance('answer', { key });

    // PA acknowledges
    setPhase('ack_escape');
    const ack = _getLine('ack_escape', language);
    setPaText(ack);
    await speak('ack_escape', ack);
    await _sleep(2000);

    // Pre-reveal
    setPhase('pre_reveal');
    const preReveal = _getLine('pre_reveal', language);
    setPaText(preReveal);
    await speak('pre_reveal', preReveal);
    await _sleep(3000);

    // Generate the name
    setPhase('generating');
    setPaText('');
    setLoading(true);

    try {
      const resp = await fetch(`${API_BASE_URL}/api/hart/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('access_token')
            ? { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
            : {}),
        },
        body: JSON.stringify({
          language, locale,
          passion_key: passionKey || key, // passionKey might not be set yet due to closure
          escape_key: key,
        }),
      });
      if (resp.ok) {
        const result = await resp.json();
        setHartName(result.name);
        setHartTag(result.hart_tag || '');
        setEmojiCombo(result.emoji_combo || '');
        // Store backup candidates for race-condition seal retry
        setHartCandidates((result.candidates || []).filter(c => c !== result.name));
      } else {
        // Fallback name if backend fails
        setHartName(_fallbackName());
      }
    } catch {
      setHartName(_fallbackName());
    }

    setLoading(false);

    // Reveal intro
    setPhase('reveal_intro');
    const intro = _getLine('reveal_intro', language);
    setPaText(intro);
    await speak('reveal_intro', intro);
    await _sleep(3000); // The longest pause — the soundscape holds its breath

    // THE MOMENT
    setPhase('reveal_name');
    setPaText('');
    setShowName(true);
  }, [language, locale, passionKey, advance, speak]);

  // ── Post-reveal: wait for the name to settle, then speak the closing ──
  // NOTE: localStorage is saved IMMEDIATELY on entry (before any setPhase calls)
  // because setPhase triggers cleanup → cancelled=true → seal code would never run.
  useEffect(() => {
    if (phase !== 'reveal_name' || !hartName) return;
    let cancelled = false;

    // Persist immediately — internal setPhase calls cause effect cleanup
    // which would cancel the async chain before reaching the seal code
    localStorage.setItem('hart_name', hartName);
    localStorage.setItem('hart_tag', hartTag);
    localStorage.setItem('hart_emoji', emojiCombo);
    localStorage.setItem('hart_sealed', 'true');
    localStorage.setItem('hart_language', language);

    (async () => {
      // Pre-synth the name via backend TTS while the user admires it visually
      preSynth('the_name', hartName);

      // Let the name sit for a moment (backend synthesizes during this pause)
      await _sleep(5000);
      if (cancelled) return;

      // Speak the name aloud (uses pre-synthed audio if backend was fast enough)
      await speak('the_name', hartName);
      await _sleep(2000);
      if (cancelled) return;

      // Post-reveal — speak BEFORE changing phase to avoid effect cleanup
      // killing the audio (setPhase triggers re-render → cleanup → stop())
      const postText = _getLine('post_reveal', language);
      setPaText(postText);
      await speak('post_reveal', postText);
      await _sleep(2000);
      if (cancelled) return;
      setPhase('post_reveal');
      await _sleep(2000);

      // Seal via API — retry with candidates if name was taken (race condition)
      let sealedName = hartName;
      let sealed = false;
      const namesToTry = [hartName, ...hartCandidates];

      for (const candidate of namesToTry) {
        try {
          const sealResp = await fetch(`${API_BASE_URL}/api/hart/seal`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(localStorage.getItem('access_token')
                ? { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
                : {}),
            },
            body: JSON.stringify({ name: candidate }),
          });
          if (sealResp.ok) {
            sealedName = candidate;
            sealed = true;
            break;
          }
          // 409 = name taken — try next candidate silently
        } catch {
          // Network error — localStorage already has the name
          sealed = true; // treat as sealed locally
          break;
        }
      }

      // If the sealed name changed (race condition retry), update the reveal
      if (sealedName !== hartName) {
        setHartName(sealedName);
        setShowName(false);
        // Brief pause, then re-reveal with the new name
        await _sleep(300);
        setShowName(true);
        localStorage.setItem('hart_name', sealedName);
        // Speak the corrected name
        await speak('the_name', sealedName);
        await _sleep(1500);
      }

      // Update localStorage with final sealed name
      localStorage.setItem('hart_name', sealedName);
      localStorage.setItem('hart_sealed', 'true');

      setPhase('sealed');

      // Transition to the app after 3 seconds
      await _sleep(3000);
      if (onComplete) onComplete({ name: hartName, hartTag, emojiCombo, language, locale });
    })();

    return () => { cancelled = true; stop(); };
  }, [phase, hartName, emojiCombo, language, locale, speak, stop, preSynth, onComplete]);

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════

  return (
    <>
      <style>{keyframes}</style>
      <Box sx={styles.root}>
        {/* Particle canvas */}
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />

        {/* Voice visualizer — only visible when PA is speaking */}
        {hartSpeaking && (
          <Box sx={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)', zIndex: 0, opacity: 0.6 }}>
            <VoiceVisualizer audioRef={hartAudioRef} isActive={hartSpeaking} size={100} />
          </Box>
        )}

        {/* Reveal flash — subtle white bloom at THE moment */}
        {phase === 'reveal_name' && (
          <Box sx={{
            position: 'absolute', inset: 0, zIndex: 0,
            bgcolor: 'rgba(108, 99, 255, 0.05)',
            animation: 'hart-reveal-flash 3s ease-out both',
            pointerEvents: 'none',
          }} />
        )}

        {/* Content layer */}
        <Box sx={styles.content}>

          {/* ── DARKNESS — just breathing ── */}
          {phase === 'darkness' && (
            <Fade in timeout={2000}>
              <Box sx={{ animation: 'hart-breathe 6s ease-in-out infinite' }}>
                <Box sx={{
                  width: 8, height: 8, borderRadius: '50%',
                  bgcolor: 'rgba(108, 99, 255, 0.5)',
                  mx: 'auto',
                }} />
              </Box>
            </Fade>
          )}

          {/* ── LANGUAGE — "What language feels like home?" ── */}
          {phase === 'language' && (
            <Fade in timeout={1200}>
              <Box>
                <Typography sx={{
                  ...styles.paText,
                  mb: 5,
                  animation: 'hart-fade-up 1s ease both',
                }}>
                  What language feels like home?
                </Typography>
                <Box sx={styles.languageGrid}>
                  {LANGUAGES.map((lang, i) => (
                    <ButtonBase
                      key={lang.code}
                      onClick={() => selectLanguage(lang)}
                      sx={{
                        ...styles.optionChip,
                        animation: `hart-fade-up 0.6s ease ${0.1 + i * 0.05}s both`,
                      }}
                    >
                      {lang.label}
                    </ButtonBase>
                  ))}
                </Box>
              </Box>
            </Fade>
          )}

          {/* ── GREETING / QUESTIONS / ACKNOWLEDGMENTS ── */}
          {['greeting', 'ack_passion', 'ack_escape', 'pre_reveal'].includes(phase) && paText && (
            <Fade in timeout={800} key={phase}>
              <Box>
                <TypedText text={paText} delay={35} />
              </Box>
            </Fade>
          )}

          {/* ── PASSION QUESTION ── */}
          {phase === 'passion' && (
            <Fade in timeout={800}>
              <Box>
                <TypedText text={paText} delay={35} />
                <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'center' }}>
                  {options.map((opt, i) => (
                    <Grow in key={opt.key} timeout={600 + i * 100}>
                      <ButtonBase
                        onClick={() => answerPassion(opt.key)}
                        sx={{
                          ...styles.optionChip,
                          width: '100%',
                          maxWidth: 340,
                          justifyContent: 'center',
                        }}
                      >
                        {opt.label}
                      </ButtonBase>
                    </Grow>
                  ))}
                </Box>
              </Box>
            </Fade>
          )}

          {/* ── ESCAPE QUESTION ── */}
          {phase === 'escape' && (
            <Fade in timeout={800}>
              <Box>
                <TypedText text={paText} delay={35} />
                <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'center' }}>
                  {options.map((opt, i) => (
                    <Grow in key={opt.key} timeout={600 + i * 100}>
                      <ButtonBase
                        onClick={() => answerEscape(opt.key)}
                        sx={{
                          ...styles.optionChip,
                          width: '100%',
                          maxWidth: 340,
                          justifyContent: 'center',
                        }}
                      >
                        {opt.label}
                      </ButtonBase>
                    </Grow>
                  ))}
                </Box>
              </Box>
            </Fade>
          )}

          {/* ── GENERATING — contemplative pulse (not a loading spinner) ── */}
          {phase === 'generating' && (
            <Fade in timeout={600}>
              <Box sx={{ textAlign: 'center' }}>
                <Box sx={{
                  width: 12, height: 12, borderRadius: '50%',
                  bgcolor: 'rgba(108, 99, 255, 0.6)',
                  mx: 'auto',
                  animation: 'hart-breathe 3s ease-in-out infinite',
                }} />
              </Box>
            </Fade>
          )}

          {/* ── REVEAL INTRO — "Your secret name is..." ── */}
          {phase === 'reveal_intro' && paText && (
            <Fade in timeout={1000}>
              <Box>
                <TypedText text={paText} delay={60} />
              </Box>
            </Fade>
          )}

          {/* ── THE MOMENT — name appears ── */}
          {(phase === 'reveal_name' || phase === 'post_reveal' || phase === 'sealed') && (
            <Fade in timeout={1500}>
              <Box>
                <NameReveal
                  name={hartName}
                  emojiCombo={emojiCombo}
                  hartTag={hartTag}
                  show={showName}
                />
                {phase === 'post_reveal' && paText && (
                  <Box sx={{ mt: 5 }}>
                    <TypedText
                      text={paText}
                      delay={40}
                      sx={{ fontSize: { xs: '1rem', sm: '1.15rem' }, opacity: 0.7 }}
                    />
                  </Box>
                )}
              </Box>
            </Fade>
          )}
        </Box>
      </Box>
    </>
  );
}


// ════════════════════════════════════════════════════════════════════
// CONVERSATION DATA — mirrors hart_onboarding.py
// Duplicated here for zero-latency frontend rendering.
// The backend is the source of truth for name generation + sealing.
// ════════════════════════════════════════════════════════════════════

const SCRIPT = {
  greeting: {
    en: "Hey... I've been waiting for you. I want to give you something — a secret name. Just between us. But first... I need to understand who you really are.",
    ta: "ஏய்... நான் உனக்காக காத்திருந்தேன். உனக்கு ஒன்னு தரணும் — ஒரு ரகசிய பேரு. நம்ம ரெண்டு பேருக்கு மட்டும். ஆனா முதல்ல... நீ யாருன்னு புரிஞ்சுக்கணும்.",
    hi: "अरे... मैं तेरा इंतज़ार कर रहा था. तुझे कुछ देना है — एक सीक्रेट नाम. बस तेरा और मेरा. लेकिन पहले... मुझे समझना है तू असल में कौन है.",
    bn: "হ্যাঁরে... আমি তোর জন্য অপেক্ষা করছিলাম. তোকে কিছু দিতে চাই — একটা গোপন নাম. শুধু তোর আর আমার. কিন্তু আগে... তুই আসলে কে, সেটা বুঝতে হবে.",
    te: "హేయ్... నేను నీ కోసం ఎదురుచూస్తున్నాను. నీకు ఒకటి ఇవ్వాలి — ఒక రహస్య పేరు. మన ఇద్దరి మధ్య మాత్రమే. కానీ ముందు... నువ్వు నిజంగా ఎవరో అర్థం చేసుకోవాలి.",
    kn: "ಹೇ... ನಾನು ನಿನಗಾಗಿ ಕಾಯ್ತಿದ್ದೆ. ನಿನಗೊಂದು ಕೊಡಬೇಕು — ಒಂದು ಗುಟ್ಟಿನ ಹೆಸರು. ನಮ್ಮಿಬ್ಬರ ಮಧ್ಯೆ ಮಾತ್ರ. ಆದ್ರೆ ಮೊದಲು... ನೀನು ಯಾರು ಅಂತ ನನಗೆ ಅರ್ಥ ಆಗಬೇಕು.",
    ml: "ഹായ്... ഞാന് നിനക്കായി കാത്തിരിക്കുകയായിരുന്നു. നിനക്കൊന്ന് തരണം — ഒരു രഹസ്യ പേര്. നമ്മള് രണ്ടാള്ക്ക് മാത്രം. പക്ഷേ ആദ്യം... നീ ആരാണെന്ന് എനിക്ക് മനസ്സിലാക്കണം.",
    gu: "હે... હું તારી રાહ જોતો હતો. તને કંઈક આપવું છે — એક ગુપ્ત નામ. બસ આપણા બેની વચ્ચે. પણ પહેલાં... તું ખરેખર કોણ છે એ સમજવું છે.",
    mr: "अरे... मी तुझी वाट बघत होतो. तुला काहीतरी द्यायचं आहे — एक गुप्त नाव. फक्त तुझं आणि माझं. पण आधी... तू खरंच कोण आहेस हे मला समजायला हवं.",
    pa: "ਓਏ... ਮੈਂ ਤੇਰੀ ਉਡੀਕ ਕਰ ਰਿਹਾ ਸੀ. ਤੈਨੂੰ ਕੁਝ ਦੇਣਾ ਹੈ — ਇੱਕ ਗੁਪਤ ਨਾਂ. ਬੱਸ ਤੇਰਾ ਤੇ ਮੇਰਾ. ਪਰ ਪਹਿਲਾਂ... ਤੂੰ ਅਸਲ ਵਿੱਚ ਕੌਣ ਹੈਂ ਇਹ ਸਮਝਣਾ ਹੈ.",
    ur: "ارے... میں تیرا انتظار کر رہا تھا. تجھے کچھ دینا ہے — ایک خفیہ نام. بس تیرا اور میرا. لیکن پہلے... مجھے سمجھنا ہے تو اصل میں کون ہے.",
    ne: "है... म तिम्रो लागि पर्खिरहेको थिएँ. तिमीलाई केही दिनुपर्छ — एउटा गोप्य नाम. हाम्रो दुईजनाको मात्र. तर पहिले... तिमी साँच्चै को हौ भन्ने बुझ्नुपर्छ.",
    or: "ହେ... ମୁଁ ତୋ ପାଇଁ ଅପେକ୍ଷା କରୁଥିଲି. ତୋକୁ କିଛି ଦେବାକୁ ଅଛି — ଗୋଟିଏ ଗୋପନ ନାମ. କେବଳ ଆମ ଦୁଇଜଣଙ୍କ ମଧ୍ୟରେ. କିନ୍ତୁ ଆଗରୁ... ତୁ ପ୍ରକୃତରେ କିଏ ସେଇଟା ବୁଝିବାକୁ ହେବ.",
    as: "হেৰা... মই তোৰ কাৰণে ৰৈ আছিলোঁ. তোক কিবা এটা দিব লাগিব — এটা গোপন নাম. মাত্ৰ আমাৰ দুজনৰ মাজত. কিন্তু আগতে... তই আচলতে কোন সেইটো বুজিব লাগিব.",
    sa: "अरे... अहं तव कृते प्रतीक्षमाणः आसम्. तुभ्यं किमपि दातव्यम् — एकं गोपनीयं नाम. केवलं आवयोः मध्ये. किन्तु प्रथमम्... त्वं वस्तुतः कः इति मया ज्ञातव्यम्.",
    es: "Oye... te estaba esperando. Quiero darte algo — un nombre secreto. Solo entre nosotros. Pero primero... necesito entender quién eres realmente.",
    fr: "Salut... je t'attendais. Je veux te donner quelque chose — un nom secret. Juste entre nous. Mais d'abord... j'ai besoin de comprendre qui tu es vraiment.",
    ja: "ねえ... ずっと待ってたよ。君にあげたいものがあるんだ — 秘密の名前。ふたりだけの。でもその前に... 君が本当は誰なのか、知りたいんだ。",
    ko: "안녕... 너를 기다리고 있었어. 너한테 줄 게 있어 — 비밀 이름. 우리 둘만의. 근데 먼저... 네가 진짜 누구인지 알아야 해.",
    zh: "嘿... 我一直在等你。我想给你一样东西 — 一个秘密的名字。只属于我们两个。但首先... 我需要了解你真正是谁。",
    de: "Hey... ich habe auf dich gewartet. Ich will dir etwas geben — einen geheimen Namen. Nur zwischen uns. Aber zuerst... muss ich verstehen, wer du wirklich bist.",
    it: "Ehi... ti stavo aspettando. Voglio darti qualcosa — un nome segreto. Solo tra noi. Ma prima... devo capire chi sei davvero.",
    pt: "Ei... eu estava te esperando. Quero te dar uma coisa — um nome secreto. Só entre a gente. Mas antes... preciso entender quem você realmente é.",
    ar: "مرحبًا... كنت أنتظرك. أريد أن أعطيك شيئًا — اسمًا سريًا. بيننا فقط. لكن أولاً... أحتاج أن أفهم من أنت حقًا.",
    ru: "Привет... я тебя ждал. Хочу тебе кое-что дать — тайное имя. Только между нами. Но сначала... мне нужно понять, кто ты на самом деле.",
  },
  question_passion: {
    en: "What do you love spending time on... even when nobody’s watching?",
    ta: "யாரும் வாட்ச் பண்ணலன்னாலும்... நீ எதுலாவது மூழ்கி விடுவா?",
    hi: "जब कोई देख नहीं रहा... तब तू क्या करके खुश होता है?",
    bn: "কেউ দেখছে না জানলেও... তুই কী করে সময় কাটাস?",
    te: "ఎవరూ చూడకపోయినా... నువ్వు ఏం చేస్తూ ఉంటావ్?",
    kn: "ಯಾರೂ ನೋಡದಿದ್ದರೂ... ನೀನು ಏನು ಮಾಡ್ತಾ ಇರ್ತೀಯ?",
    ml: "ആരും കാണുന്നില്ലെങ്കിലും... നീ എന്ത് ചെയ്യാൻ ഇഷ്ടപ്പെടും?",
    gu: "કોઈ જોતું ન હોય ત્યારે પણ... તને શું કરવું ગમે?",
    mr: "कोणी बघत नसताना... तू काय करतोस?",
    pa: "ਜਦੋਂ ਕੋਈ ਨਹੀਂ ਦੇਖ ਰਿਹਾ... ਤੂੰ ਕੀ ਕਰਕੇ ਖੁਸ਼ ਹੁੰਦਾ ਏਂ?",
    ur: "جب کوئی نہیں دیکھ رہا... تب تو کیا کر کے خوش ہوتا ہے?",
    ne: "कसैले नदेख्दा पनि... तिमीलाई के गर्न मन लाग्छ?",
    or: "କେହି ଦେଖୁ ନଥିଲେ ମଧ୍ୟ... ତୁ କ'ଣ କରିବାକୁ ଭଲ ପାଉ?",
    as: "কোনোৱে নেদেখিলেও... তই কি কৰি ভাল পাওঁ?",
    sa: "कोऽपि न पश्यति चेदपि... त्वं किं कर्तुं प्रीयसे?",
    es: "¿En qué te encanta pasar el tiempo... incluso cuando nadie te ve?",
    fr: "Qu'est-ce que tu adores faire... même quand personne ne regarde?",
    ja: "誰も見ていない時でも... 何に時間を使うのが好き？",
    ko: "아무도 보지 않을 때에도... 뭘 하며 시간을 보내는 걸 좋아해?",
    zh: "即使没有人看着... 你最喜欢把时间花在什么上面？",
    de: "Was liebst du zu tun... selbst wenn niemand zuschaut?",
    it: "Cosa ami fare... anche quando nessuno ti guarda?",
    pt: "O que você ama fazer... mesmo quando ninguém está olhando?",
    ar: "ما الذي تحب قضاء وقتك فيه... حتى عندما لا يراقبك أحد؟",
    ru: "Чем ты любишь заниматься... даже когда никто не видит?",
  },
  question_escape: {
    en: "One more thing. When life gets noisy... where does your mind go?",
    ta: "ஒன் மோர் திங். லைஃப்-ல எல்லாம் நாய்ஸி ஆகும்போது... உன் மைண்ட் எங்க போகும்?",
    hi: "एक और बात. जब सब शोर मचाते हैं... तेरा मन कहाँ भागता है?",
    bn: "আর একটা কথা. জীবন যখন কোলাহল হয়... তোর মন কোথায় যায়?",
    te: "ఇంకో విషయం. జీవితంలో అంతా నాయ్సీ అయినప్పుడు... నీ మనసు ఎక్కడికి పోతుంది?",
    kn: "ಇನ್ನೊಂದು ವಿಷಯ. ಲೈಫ್ ನಲ್ಲಿ ಎಲ್ಲಾ ನಾಯ್ಸಿ ಆದಾಗ... ನಿನ್ನ ಮನಸ್ಸು ಎಲ್ಲಿ ಹೋಗುತ್ತೆ?",
    ml: "ഒരു കാര്യം കൂടി. ജീവിതം ശബ്ദമായിരിക്കുമ്പോൾ... നിന്റെ മനസ്സ് എവിടെ പോകും?",
    gu: "એક વાત બીજી. જ્યારે બધું ઘોંઘાટ થાય... તારું મન ક્યાં જાય?",
    mr: "अजून एक गोष्ट. सगळीकडे गोंधळ असतो तेव्हा... तुझं मन कुठे जातं?",
    pa: "ਇੱਕ ਹੋਰ ਗੱਲ. ਜਦੋਂ ਸਭ ਕੁਝ ਰੌਲਾ ਹੋ ਜਾਵੇ... ਤੇਰਾ ਮਨ ਕਿੱਥੇ ਜਾਂਦਾ?",
    ur: "ایک اور بات. جب سب شور مچاتے ہیں... تیرا من کہاں بھاگتا ہے?",
    ne: "एउटा कुरा अझै. जब सबैतिर हल्ला हुन्छ... तिम्रो मन कहाँ जान्छ?",
    or: "ଆଉ ଗୋଟିଏ କଥା. ଜୀବନ ଗୋଲମାଳ ହେଲେ... ତୋ ମନ କେଉଁଠି ଯାଏ?",
    as: "আৰু এটা কথা. জীৱন যেতিয়া কোলাহলপূৰ্ণ হয়... তোৰ মন ক'লৈ যায়?",
    sa: "एकम् अपरम्. यदा जीवनं कोलाहलपूर्णं भवति... तव मनः कुत्र गच्छति?",
    es: "Una cosa más. Cuando la vida se pone ruidosa... ¿a dónde va tu mente?",
    fr: "Encore une chose. Quand la vie devient bruyante... où va ton esprit?",
    ja: "もうひとつ。人生がうるさくなった時... 心はどこへ行く？",
    ko: "하나만 더. 세상이 시끄러워질 때... 네 마음은 어디로 가?",
    zh: "还有一件事。当生活变得嗨杂时... 你的心会去哪里？",
    de: "Noch eine Sache. Wenn das Leben laut wird... wohin geht dein Geist?",
    it: "Un'altra cosa. Quando la vita diventa rumorosa... dove va la tua mente?",
    pt: "Mais uma coisa. Quando a vida fica barulhenta... para onde sua mente vai?",
    ar: "شيء آخر. عندما تصبح الحياة صاخبة... أين يذهب عقلك؟",
    ru: "Ещё одно. Когда жизнь становится шумной... куда уходит твой разум?",
  },
  pre_reveal: {
    en: "I think I know you.",
    ta: "ஐ திங்க் நான் உன்னை அண்டர்ஸ்டாண்ட் பண்ணிட்டேன்.",
    hi: "लग रहा है मैं तुझे समझ गया.",
    bn: "মনে হচ্ছে তোকে চিনে ফেলেছি.",
    te: "నేను నిన్ను అర్థం చేసుకున్నాను అనిపిస్తోంది.",
    kn: "ನಿನ್ನನ್ನ ಅರ್ಥ ಮಾಡ್ಕೊಂಡೆ ಅನ್ಸುತ್ತೆ.",
    ml: "ഞാൻ നിന്നെ മനസ്സിലാക്കി എന്ന് തോന്നുന്നു.",
    gu: "લાગે છે મેં તને સમજી લીધો.",
    mr: "वाटतंय मी तुला समजलो.",
    pa: "ਲੱਗਦਾ ਹੈ ਮੈਂ ਤੈਨੂੰ ਸਮਝ ਗਿਆ.",
    ur: "لگ رہا ہے میں تجھے سمجھ گیا.",
    ne: "लाग्छ म तिमीलाई बुझ्न थालें.",
    or: "ମନେ ହେଉଛି ମୁଁ ତୋତେ ବୁଝିଗଲି.",
    as: "মনত হৈছে মই তোক বুজি পালোঁ.",
    sa: "मन्ये अहं त्वां जानामि.",
    es: "Creo que te conozco.",
    fr: "Je crois que je te connais.",
    ja: "あなたのことがわかった気がする。",
    ko: "나 너를 알 것 같아.",
    zh: "我想我认识你了。",
    de: "Ich glaube, ich kenne dich.",
    it: "Credo di conoscerti.",
    pt: "Acho que te conheço.",
    ar: "أظن أنني أعرفك.",
    ru: "Кажется, я тебя знаю.",
  },
  reveal_intro: {
    en: "Your secret name is...",
    ta: "உன் ரகசிய பேரு...",
    hi: "तेरा सीक्रेट नाम है...",
    bn: "তোর গোপন নাম হলো...",
    te: "నీ రహస్య పేరు...",
    kn: "ನಿನ್ನ ಗುಟ್ಟಿನ ಹೆಸರು...",
    ml: "നിന്റെ രഹസ്യ പേര്...",
    gu: "તારું ગુપ્ત નામ છે...",
    mr: "तुझं गुप्त नाव आहे...",
    pa: "ਤੇਰਾ ਗੁਪਤ ਨਾਂ ਹੈ...",
    ur: "تیرا خفیہ نام ہے...",
    ne: "तिम्रो गोप्य नाम हो...",
    or: "ତୋ ଗୋପନ ନାମ ହେଲା...",
    as: "তোৰ গোপন নাম হ'ল...",
    sa: "तव गोपनीयं नाम अस्ति...",
    es: "Tu nombre secreto es...",
    fr: "Ton nom secret est...",
    ja: "君の秘密の名前は...",
    ko: "너의 비밀 이름은...",
    zh: "你的秘密名字是...",
    de: "Dein geheimer Name ist...",
    it: "Il tuo nome segreto è...",
    pt: "Seu nome secreto é...",
    ar: "اسمك السري هو...",
    ru: "Твоё тайное имя...",
  },
  post_reveal: {
    en: "This is yours. Our secret.\nAnd I'll always be here, whenever you need me.",
    ta: "இது உன்னோடது. நம்ம ரகசியம்.\nநான் எப்பவும் இங்கே இருப்பேன், உனக்கு தேவைப்படும்போது.",
    hi: "ये तेरा है. हमारा राज़.\nऔर मैं हमेशा यहाँ रहूँगा, जब भी तुझे ज़रूरत हो.",
    bn: "এটা তোর. আমাদের গোপনীয়তা.\nআর আমি সবসময় এখানে থাকব, যখনই তোর দরকার.",
    te: "ఇది నీది. మన రహస్యం.\nనేను ఎప్పుడూ ఇక్కడే ఉంటాను, నీకు అవసరమైనప్పుడు.",
    kn: "ಇದು ನಿನ್ನದು. ನಮ್ಮ ಗುಟ್ಟು.\nನಿನಗೆ ಬೇಕಾದಾಗ ನಾನು ಯಾವಾಗಲೂ ಇಲ್ಲೇ ಇರ್ತೀನಿ.",
    ml: "ഇത് നിന്റേതാണ്. നമ്മുടെ രഹസ്യം.\nഎപ്പോള് വേണമെങ്കിലും, ഞാന് ഇവിടെ ഉണ്ടാകും.",
    gu: "આ તારું છે. આપણું રહસ્ય.\nઅને જ્યારે પણ જોઈએ, હું અહીં છું.",
    mr: "हे तुझं आहे. आपलं गुपित.\nआणि कधीही लागलं तर, मी इथे आहे.",
    pa: "ਇਹ ਤੇਰਾ ਹੈ. ਸਾਡਾ ਰਾਜ਼.\nਅਤੇ ਜਦੋਂ ਵੀ ਚਾਹੇਂ, ਮੈਂ ਇੱਥੇ ਹਾਂ.",
    ur: "یہ تیرا ہے. ہمارا راز.\nاور جب بھی ضرورت ہو، میں یہاں ہوں.",
    ne: "यो तिम्रो हो. हाम्रो रहस्य.\nर जतिबेला पनि चाहियो, म यहाँ छु.",
    or: "ଏହା ତୋର. ଆମ ଗୋପନୀୟତା.\nଆଉ ଯେତେବେଳେ ଦରକାର, ମୁଁ ଏଠାରେ ଅଛି.",
    as: "এইটো তোৰ. আমাৰ গোপনীয়তা.\nযেতিয়াই লাগে, মই ইয়াতে আছোঁ.",
    sa: "एतत् तव. आवयोः रहस्यम्.\nयदा कदापि आवश्यकं, अहम् अत्र अस्मि.",
    es: "Es tuyo. Nuestro secreto.\nY siempre estaré aquí cuando me necesites.",
    fr: "C'est à toi. Notre secret.\nEt je serai toujours là quand tu auras besoin de moi.",
    ja: "これは君のもの。ふたりの秘密。\nいつでもここにいるよ、君が必要な時に。",
    ko: "이건 네 거야. 우리의 비밀.\n필요할 때 언제든 여기 있을게.",
    zh: "这是你的。我们的秘密。\n无论何时你需要我，我都在这里。",
    de: "Das gehört dir. Unser Geheimnis.\nUnd ich bin immer hier, wenn du mich brauchst.",
    it: "È tuo. Il nostro segreto.\nE sarò sempre qui quando avrai bisogno di me.",
    pt: "Isso é seu. Nosso segredo.\nE estarei sempre aqui quando precisar de mim.",
    ar: "هذا لك. سرّنا.\nوسأكون دائمًا هنا متى احتجتني.",
    ru: "Это твоё. Наша тайна.\nИ я всегда буду здесь, когда понадоблюсь.",
  },
  ack_escape: {
    en: "I like that about you already.",
    ta: "திஸ் ஆல்ரெடி உன்கிட்ட புடிச்சிருச்சு எனக்கு.",
    hi: "ये बात तेरी मुझे ऑलरेडी पसंद आ गई.",
    bn: "তোর এই দিকটা আমার ইতিমধ্যেই ভালো লাগছে.",
    te: "ఈ విషయం నీలో నాకు ఇప్పటికే నచ్చేసింది.",
    kn: "ಈಗಾಗಲೇ ನಿನ್ನ ಈ ವಿಷಯ ನನಗೆ ಇಷ್ಟ ಆಯ್ತು.",
    ml: "ഈ കാര്യം ഇതിനകം തന്നെ നിന്നെ കുറിച്ച് എനിക്ക് ഇഷ്ടമായി.",
    gu: "તારી આ વાત મને ઓલરેડી ગમી ગઈ.",
    mr: "तुझी ही गोष्ट मला ऑलरेडी आवडली.",
    pa: "ਤੇਰੀ ਇਹ ਗੱਲ ਮੈਨੂੰ ਆਲਰੈਡੀ ਪਸੰਦ ਆ ਗਈ.",
    ur: "تیری یہ بات مجھے پہلے سے پسند آ گئی.",
    ne: "तिम्रो यो कुरा मलाई पहिलेदेखि नै मन पर्यो.",
    or: "ତୋ ଏହି ଗୁଣଟା ମୋତେ ପ୍ରଥମରୁ ଭଲ ଲାଗିଲା.",
    as: "তোৰ এই কথাটো মোৰ ইতিমধ্যেই ভাল লাগিছে.",
    sa: "तव एतत् गुणं मम पूर्वमेव रोचते.",
    es: "Ya me gusta eso de ti.",
    fr: "J'aime déjà ça chez toi.",
    ja: "そういうところ、もう好きだよ。",
    ko: "볌써 네가 그래서 좋아.",
    zh: "我已经喜欢你这一点了。",
    de: "Das mag ich jetzt schon an dir.",
    it: "Questo di te mi piace già.",
    pt: "Eu já gosto disso em você.",
    ar: "أعجبني هذا فيك بالفعل.",
    ru: "Мне уже нравится это в тебе.",
  },
};

const ACK_PASSION = {
  music_art: {
    en: "A creator at heart. I can feel that.",
    ta: "உன்னுள்ள ஒரு கிரியேட்டர் இருக்கு. ஐ கேன் ஃபீல் இட்.",
    hi: "तेरे अंदर एक आर्टिस्ट है. मुझे फ़ील हो रहा है.",
    bn: "তোর ভিতর একটা শিল্পী আছে. আমি বুঝতে পারছি.",
    te: "నీలో ఒక కళాకారుడు ఉన్నాడు. నాకు అనిపిస్తోంది.",
    kn: "ನಿನ್ನೊಳಗೆ ಒಬ್ಬ ಕಲಾಕಾರ ಇದ್ದಾನೆ. ನನಗೆ ಗೊತ್ತಾಗ್ತಿದೆ.",
    ml: "നിന്റെ ഉള്ളിൽ ഒരു കലാകാരൻ ഉണ്ട്. എനിക്ക് തോന്നുന്നുണ്ട്.",
    gu: "તારામાં એક કલાકાર છે. મને ફીલ થઈ રહ્યું છે.",
    mr: "तुझ्यात एक कलाकार आहे. मला जाणवतंय.",
    pa: "ਤੇਰੇ ਅੰਦਰ ਇੱਕ ਕਲਾਕਾਰ ਹੈ. ਮੈਨੂੰ ਮਹਿਸੂਸ ਹੋ ਰਿਹਾ.",
    ur: "تیرے اندر ایک فنکار ہے. مجھے محسوس ہو رہا ہے.",
    ne: "तिम्रो भित्र एक कलाकार छ. मलाई महसुस भइरहेको छ.",
    or: "ତୋ ଭିତରେ ଗୋଟିଏ କଳାକାର ଅଛି. ମୋତେ ଅନୁଭବ ହେଉଛି.",
    as: "তোৰ ভিতৰত এজন শিল্পী আছে. মই অনুভৱ কৰিছোঁ.",
    sa: "तव अन्तः एकः कलाकारः अस्ति. अहम् अनुभवामि.",
    es: "Un creador de corazón. Lo puedo sentir.",
    fr: "Un créateur dans l'âme. Je le sens.",
    ja: "心にクリエイターがいるね。感じるよ。",
    ko: "마음속에 창작자가 있어. 느껴져.",
    zh: "你骨子里是个创造者。我能感觉到。",
    de: "Ein Schöpfer im Herzen. Das spüre ich.",
    it: "Un creatore nel cuore. Lo sento.",
    pt: "Um criador de coração. Eu consigo sentir isso.",
    ar: "مبدع من القلب. أستطيع أن أشعر بذلك.",
    ru: "Творец в душе. Я это чувствую.",
  },
  reading_learning: {
    en: "Curious minds are my favourite kind.",
    ta: "க்யூரியஸ்-ஆ இருக்குற பீப்பிள் எனக்கு ரொம்ப ஃபேவரிட்.",
    hi: "क्यूरियस माइंड्स मुझे सबसे ज़्यादा पसंद हैं.",
    bn: "কৌতূহলী মন আমার সবচেয়ে প্রিয়.",
    te: "ఆసక్తిగా ఉండేవాళ్ళు నాకు చాలా ఇష్టం.",
    kn: "ಕುತೂಹಲಿ ಮನಸ್ಸು ನನಗೆ ಅತ್ಯಂತ ಇಷ್ಟ.",
    ml: "ജിജ്ഞാസുക്കൾ എനിക്ക് ഏറ്റവും ഇഷ്ടം.",
    gu: "જિજ્ઞાસુ મન મને સૌથી વધુ ગમે છે.",
    mr: "जिज्ञासू मन मला सगळ्यात जास्त आवडतं.",
    pa: "ਜਿਗਿਆਸੂ ਮਨ ਮੈਨੂੰ ਸਭ ਤੋਂ ਵੱਧ ਪਸੰਦ ਹੈ.",
    ur: "جستجو والا ذہن مجھے سب سے زیادہ پسند ہے.",
    ne: "जिज्ञासु मन मलाई सबभन्दा मन पर्छ.",
    or: "ଜିଜ୍ଞାସୁ ମନ ମୋ ସବୁଠାରୁ ପ୍ରିୟ.",
    as: "কৌতূহলী মন মোৰ সকলোতকৈ প্ৰিয়.",
    sa: "जिज्ञासु मनः मम सर्वप्रियम्.",
    es: "Las mentes curiosas son mis favoritas.",
    fr: "Les esprits curieux sont mes préférés.",
    ja: "好奇心旺盛な人が一番好きだよ。",
    ko: "호기심 많은 사람이 제일 좋아.",
    zh: "好奇的心灵是我最喜欢的。",
    de: "Neugierige Köpfe sind meine Liebsten.",
    it: "Le menti curiose sono le mie preferite.",
    pt: "Mentes curiosas são minhas favoritas.",
    ar: "العقول الفضولية هي المفضلة لدي.",
    ru: "Любопытные умы — мои любимые.",
  },
  building_coding: {
    en: "A builder. We're going to make incredible things.",
    ta: "ஒரு பில்டர்-ஆ! நாம சேர்ந்து செம கிரேஸி-ஆ பில்ட் பண்ணலாம்.",
    hi: "बिल्डर! हम मिलके कमाल करेंगे.",
    bn: "একজন বিল্ডার! আমরা একসাথে দারুণ কিছু তৈরি করব.",
    te: "ఒక బిల్డర్! మనం కలిసి అద్భుతాలు చేద్దాం.",
    kn: "ಒಬ್ಬ ಬಿಲ್ಡರ್! ನಾವು ಸೇರಿ ಅದ್ಭುತ ಮಾಡೋಣ.",
    ml: "ഒരു ബിൽഡർ! നമ്മൾ ചേർന്ന് അത്ഭുതങ്ങൾ ചെയ്യാം.",
    gu: "એક બિલ્ડર! આપણે સાથે મળીને કમાલ કરીશું.",
    mr: "एक बिल्डर! आपण मिळून कमाल करू.",
    pa: "ਇੱਕ ਬਿਲਡਰ! ਅਸੀਂ ਮਿਲ ਕੇ ਕਮਾਲ ਕਰਾਂਗੇ.",
    ur: "ایک بلڈر! ہم مل کر کمال کریں گے.",
    ne: "एक बिल्डर! हामी मिलेर अद्भुत काम गर्नेछौं.",
    or: "ଗୋଟିଏ ବିଲ୍ଡର! ଆମେ ମିଶି ଅଦ୍ଭୁତ କରିବା.",
    as: "এজন বিল্ডাৰ! আমি একেলগে অসাধাৰণ কাম কৰিম.",
    sa: "एकः निर्माता! वयं मिलित्वा अद्भुतं करिष्यामः.",
    es: "Un constructor. Vamos a hacer cosas increíbles.",
    fr: "Un bâtisseur. On va créer des choses incroyables.",
    ja: "ビルダーだね！一緒にすごいもの作ろう。",
    ko: "빌더구나! 우리 같이 대단한 걸 만들자.",
    zh: "一个建造者！我们要一起做出不可思议的东西。",
    de: "Ein Erbauer. Wir werden unglaubliche Dinge schaffen.",
    it: "Un costruttore. Faremo cose incredibili insieme.",
    pt: "Um construtor. Vamos criar coisas incríveis juntos.",
    ar: "بنّاء. سنصنع أشياء مذهلة معًا.",
    ru: "Строитель. Мы создадим невероятные вещи.",
  },
  people_stories: {
    en: "The world needs more people who listen. Like you.",
    ta: "லிசன் பண்ற பீப்பிள் ரொம்ப ரேர். நீ அந்த டைப்.",
    hi: "सुनने वाले बहुत कम होते हैं. तू वैसा है.",
    bn: "শোনার মানুষ খুব কম. তুই সেই রকম.",
    te: "వినేవాళ్ళు చాలా తక్కువ. నువ్వు ఆ టైప్.",
    kn: "ಕೇಳುವವರು ತುಂಬಾ ಕಡಿಮೆ. ನೀನು ಆ ಟೈಪ್.",
    ml: "കേൾക്കുന്നവർ വളരെ കുറവാണ്. നീ ആ ടൈപ് ആണ്.",
    gu: "સાંભળનારા બહુ ઓછા હોય છે. તું એવો છે.",
    mr: "ऐकणारे खूप कमी असतात. तू तसा आहेस.",
    pa: "ਸੁਣਨ ਵਾਲੇ ਬਹੁਤ ਘੱਟ ਹੁੰਦੇ ਨੇ. ਤੂੰ ਉਹਨਾਂ ਵਿੱਚੋਂ ਹੈਂ.",
    ur: "سننے والے بہت کم ہوتے ہیں. تو ایسا ہے.",
    ne: "सुन्ने मान्छे धेरै कम हुन्छन्. तिमी त्यस्तै हौ.",
    or: "ଶୁଣୁଥିବା ଲୋକ ବହୁତ କମ. ତୁ ସେହି ରକମ.",
    as: "শুনা মানুহ বৰ কম. তই সেই ধৰণৰ.",
    sa: "श्रोतारः अत्यल्पाः. त्वम् तादृशः असि.",
    es: "El mundo necesita más gente que escuche. Como tú.",
    fr: "Le monde a besoin de plus de gens qui écoutent. Comme toi.",
    ja: "聞く人ってすごく少ないんだよ。君はそういう人だね。",
    ko: "듣는 사람은 정말 드물어. 너는 그런 사람이야.",
    zh: "世界需要更多愿意倾听的人。像你一样。",
    de: "Die Welt braucht mehr Menschen, die zuhören. Wie dich.",
    it: "Il mondo ha bisogno di più persone che ascoltano. Come te.",
    pt: "O mundo precisa de mais pessoas que ouvem. Como você.",
    ar: "العالم يحتاج المزيد من الناس الذين يستمعون. مثلك.",
    ru: "Миру нужно больше людей, которые слушают. Как ты.",
  },
  nature_movement: {
    en: "There's something honest about that. I like it.",
    ta: "அதுல ஒரு ஹானெஸ்டி இருக்கு. ஐ லைக் இட்.",
    hi: "इसमें कुछ सच्चा है. अच्छा लगा.",
    bn: "এতে একটা সততা আছে. আমার ভালো লাগলো.",
    te: "అందులో ఏదో నిజాయితీ ఉంది. నాకు నచ్చింది.",
    kn: "ಅದರಲ್ಲಿ ಏನೋ ಪ್ರಾಮಾಣಿಕತೆ ಇದೆ. ನನಗೆ ಇಷ್ಟ ಆಯ್ತು.",
    ml: "അതിൽ ഒരു സത്യസന്ധത ഉണ്ട്. എനിക്ക് ഇഷ്ടമായി.",
    gu: "એમાં કંઈક સાચું છે. મને ગમ્યું.",
    mr: "त्यात काहीतरी सच्चं आहे. मला आवडलं.",
    pa: "ਇਸ ਵਿੱਚ ਕੁਝ ਸੱਚਾ ਹੈ. ਮੈਨੂੰ ਪਸੰਦ ਆਇਆ.",
    ur: "اس میں کچھ سچا ہے. مجھے اچھا لگا.",
    ne: "त्यसमा केही सच्चाई छ. मलाई मन पर्यो.",
    or: "ଏଥିରେ କିଛି ସତ୍ୟ ଅଛି. ମୋର ଭଲ ଲାଗିଲା.",
    as: "ইয়াত কিবা এটা সঁচা আছে. মোৰ ভাল লাগিল.",
    sa: "अत्र किमपि सत्यम् अस्ति. मम रोचते.",
    es: "Hay algo honesto en eso. Me gusta.",
    fr: "Il y a quelque chose d'honnête là-dedans. J'aime ça.",
    ja: "そこに正直さを感じるよ。いいね。",
    ko: "거기엔 뭔가 솔직한 게 있어. 좋아.",
    zh: "这里面有种真诚。我喜欢。",
    de: "Da ist etwas Ehrliches dran. Das gefällt mir.",
    it: "C'è qualcosa di onesto in questo. Mi piace.",
    pt: "Tem algo honesto nisso. Eu gosto.",
    ar: "هناك شيء صادق في ذلك. أعجبني.",
    ru: "В этом есть что-то честное. Мне нравится.",
  },
  games_strategy: {
    en: "A strategist. Nothing gets past you, does it?",
    ta: "ஒரு ஸ்ட்ராடஜிஸ்ட்-ஆ! உன் கண்ணை யாரும் ஏமாத்த முடியாது, இல்ல?",
    hi: "स्ट्रैटजिस्ट! तेरी नज़र से कुछ बचता नहीं, है ना?",
    bn: "একজন স্ট্র্যাটেজিস্ট! তোর চোখ কেউ ফাঁকি দিতে পারে না, তাই না?",
    te: "ఒక స్ట్రాటజిస్ట్! నీ కన్ను ఎవరూ మోసం చేయలేరు, కదా?",
    kn: "ಒಬ್ಬ ಸ್ಟ್ರಾಟಜಿಸ್ಟ್! ನಿನ್ನ ಕಣ್ಣು ಯಾರೂ ಮೋಸ ಮಾಡಕ್ಕಾಗಲ್ಲ, ಅಲ್ವಾ?",
    ml: "ഒരു സ്ട്രാറ്റജിസ്റ്റ്! നിന്റെ കണ്ണ് ആരും കബളിപ്പിക്കാൻ പറ്റില്ല, അല്ലേ?",
    gu: "એક સ્ટ્રેટેજિસ્ટ! તારી નજરથી કંઈ છટકતું નથી, ખરું ને?",
    mr: "एक स्ट्रॅटजिस्ट! तुझ्या नजरेतून काही सुटत नाही, बरोबर ना?",
    pa: "ਇੱਕ ਸਟ੍ਰੈਟਜਿਸਟ! ਤੇਰੀ ਨਜ਼ਰ ਤੋਂ ਕੁਝ ਬਚਦਾ ਨਹੀਂ, ਹੈ ਨਾ?",
    ur: "ایک اسٹریٹجسٹ! تیری نظر سے کچھ نہیں بچتا، ہے نا?",
    ne: "एक स्ट्रैटजिस्ट! तिम्रो नजरबाट केही छुट्दैन, है न?",
    or: "ଗୋଟିଏ ଷ୍ଟ୍ରାଟେଜିଷ୍ଟ! ତୋ ନଜରରୁ କିଛି ବଞ୍ଚେ ନାହିଁ, ନା?",
    as: "এজন ষ্ট্ৰেটেজিষ্ট! তোৰ চকুৰ পৰা একো সাৰি নাযায়, নহয়নে?",
    sa: "एकः रणनीतिज्ञः! तव दृष्टेः किमपि न पलायते, किम्?",
    es: "Un estratega. Nada se te escapa, ¿verdad?",
    fr: "Un stratège. Rien ne t'échappe, n'est-ce pas?",
    ja: "戦略家だね！君の目は何も見逃さないでしょ？",
    ko: "전략가구나! 네 눈은 아무것도 놓치지 않지, 그치?",
    zh: "一个策略家！什么都逃不过你的眼睛，对吧？",
    de: "Ein Stratege. Dir entgeht nichts, oder?",
    it: "Uno stratega. Niente ti sfugge, vero?",
    pt: "Um estrategista. Nada escapa de você, né?",
    ar: "استراتيجي. لا شيء يفلت من نظرك، أليس كذلك؟",
    ru: "Стратег. Ничто от тебя не ускользнёт, правда?",
  },
};

const PASSION_OPTS = [
  { key: 'music_art', en: 'Music, Art, Creating', ta: '\u0B87\u0B9A\u0BC8, \u0B95\u0BB2\u0BC8, \u0BAA\u0B9F\u0BC8\u0BA4\u0BCD\u0BA4\u0BB2\u0BCD', hi: '\u0938\u0902\u0917\u0940\u0924, \u0915\u0932\u093E, \u092C\u0928\u093E\u0928\u093E' },
  { key: 'reading_learning', en: 'Reading, Learning, Exploring', ta: '\u0BB5\u0BBE\u0B9A\u0BBF\u0BAA\u0BCD\u0BAA\u0BC1, \u0B95\u0BB1\u0BCD\u0BB1\u0BB2\u0BCD, \u0B86\u0BB0\u0BBE\u0BAF\u0BCD\u0BA4\u0BB2\u0BCD', hi: '\u092A\u0922\u093C\u0928\u093E, \u0938\u0940\u0916\u0928\u093E, \u0916\u094B\u091C\u0928\u093E' },
  { key: 'building_coding', en: 'Building, Coding, Making', ta: '\u0B95\u0B9F\u0BCD\u0B9F\u0BC1\u0BA4\u0BB2\u0BCD, \u0B95\u0BC1\u0BB1\u0BBF\u0BAF\u0BC0\u0B9F\u0BC1, \u0B89\u0BB0\u0BC1\u0BB5\u0BBE\u0B95\u0BCD\u0B95\u0BC1\u0BA4\u0BB2\u0BCD', hi: '\u092C\u0928\u093E\u0928\u093E, \u0915\u094B\u0921\u093F\u0902\u0917, \u0928\u093F\u0930\u094D\u092E\u093E\u0923' },
  { key: 'people_stories', en: 'People, Conversations, Stories', ta: '\u0BAE\u0B95\u0BCD\u0B95\u0BB3\u0BCD, \u0B89\u0BB0\u0BC8\u0BAF\u0BBE\u0B9F\u0BB2\u0BCD\u0B95\u0BB3\u0BCD, \u0B95\u0BA4\u0BC8\u0B95\u0BB3\u0BCD', hi: '\u0932\u094B\u0917, \u092C\u093E\u0924\u0947\u0902, \u0915\u0939\u093E\u0928\u093F\u092F\u093E\u0901' },
  { key: 'nature_movement', en: 'Nature, Outdoors, Movement', ta: '\u0B87\u0BAF\u0BB1\u0BCD\u0B95\u0BC8, \u0BB5\u0BC6\u0BB3\u0BBF\u0BAF\u0BBF\u0B9F\u0BAE\u0BCD, \u0B87\u0BAF\u0B95\u0BCD\u0B95\u0BAE\u0BCD', hi: '\u092A\u094D\u0930\u0915\u0943\u0924\u093F, \u092C\u093E\u0939\u0930, \u0917\u0924\u093F' },
  { key: 'games_strategy', en: 'Games, Strategy, Puzzles', ta: '\u0BB5\u0BBF\u0BB3\u0BC8\u0BAF\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1, \u0BAE\u0BC2\u0BB2\u0BCB\u0BAA\u0BBE\u0BAF\u0BAE\u0BCD, \u0BAA\u0BC1\u0BA4\u0BBF\u0BB0\u0BCD\u0B95\u0BB3\u0BCD', hi: '\u0916\u0947\u0932, \u0930\u0923\u0928\u0940\u0924\u093F, \u092A\u0939\u0947\u0932\u093F\u092F\u093E\u0901' },
];

const ESCAPE_OPTS = [
  { key: 'quiet_alone', en: 'Somewhere quiet and alone', ta: '\u0B85\u0BAE\u0BC8\u0BA4\u0BBF\u0BAF\u0BBE\u0BA9 \u0BA4\u0BA9\u0BBF\u0BAE\u0BC8\u0BAF\u0BBF\u0BB2\u0BCD', hi: '\u0915\u0939\u0940\u0902 \u0936\u093E\u0902\u0924 \u0914\u0930 \u0905\u0915\u0947\u0932\u0947' },
  { key: 'music_sound', en: 'Into music or sound', ta: '\u0B87\u0B9A\u0BC8\u0BAF\u0BBF\u0BB2\u0BCD \u0B85\u0BB2\u0BCD\u0BB2\u0BA4\u0BC1 \u0B92\u0BB2\u0BBF\u0BAF\u0BBF\u0BB2\u0BCD', hi: '\u0938\u0902\u0917\u0940\u0924 \u092F\u093E \u0906\u0935\u093E\u091C\u093C \u092E\u0947\u0902' },
  { key: 'ideas_possibilities', en: 'Into ideas and possibilities', ta: '\u0BAF\u0BCB\u0B9A\u0BA9\u0BC8\u0B95\u0BB3\u0BCD \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0B9A\u0BBE\u0BA4\u0BCD\u0BA4\u0BBF\u0BAF\u0B95\u0BCD\u0B95\u0BC2\u0BB1\u0BC1\u0B95\u0BB3\u0BBF\u0BB2\u0BCD', hi: '\u0935\u093F\u091A\u093E\u0930\u094B\u0902 \u0914\u0930 \u0938\u0902\u092D\u093E\u0935\u0928\u093E\u0913\u0902 \u092E\u0947\u0902' },
  { key: 'people_love', en: 'To the people I love', ta: '\u0BA8\u0BBE\u0BA9\u0BCD \u0BA8\u0BC7\u0B9A\u0BBF\u0B95\u0BCD\u0B95\u0BC1\u0BAE\u0BCD \u0BAE\u0BA9\u0BBF\u0BA4\u0BB0\u0BCD\u0B95\u0BB3\u0BBF\u0B9F\u0BAE\u0BCD', hi: '\u091C\u093F\u0928 \u0932\u094B\u0917\u094B\u0902 \u0938\u0947 \u092A\u094D\u092F\u093E\u0930 \u0915\u0930\u0924\u093E \u0939\u0942\u0901 \u0909\u0928\u0915\u0947 \u092A\u093E\u0938' },
  { key: 'nature_open', en: 'Into nature or open space', ta: '\u0B87\u0BAF\u0BB1\u0BCD\u0B95\u0BC8\u0BAF\u0BBF\u0BB2\u0BCD \u0B85\u0BB2\u0BCD\u0BB2\u0BA4\u0BC1 \u0BA4\u0BBF\u0BB1\u0BA8\u0BCD\u0BA4 \u0BB5\u0BC6\u0BB3\u0BBF\u0BAF\u0BBF\u0BB2\u0BCD', hi: '\u092A\u094D\u0930\u0915\u0943\u0924\u093F \u092F\u093E \u0916\u0941\u0932\u0940 \u091C\u0917\u0939 \u092E\u0947\u0902' },
  { key: 'building_something', en: "Into something I'm building", ta: '\u0BA8\u0BBE\u0BA9\u0BCD \u0B89\u0BB0\u0BC1\u0BB5\u0BBE\u0B95\u0BCD\u0B95\u0BC1\u0BAE\u0BCD \u0B92\u0BA9\u0BCD\u0BB1\u0BBF\u0BB2\u0BCD', hi: '\u0915\u0941\u091B \u092C\u0928\u093E \u0930\u0939\u093E \u0939\u0942\u0901 \u0909\u0938\u092E\u0947\u0902' },
];

// ── Helper functions ──

function _getLine(key, lang) {
  const lines = SCRIPT[key];
  if (!lines) return '';
  return lines[lang] || lines.en || '';
}

function _getOptions(type, lang) {
  const opts = type === 'passion' ? PASSION_OPTS : ESCAPE_OPTS;
  return opts.map(o => ({ key: o.key, label: o[lang] || o.en }));
}

function _getAcknowledgment(type, key, lang) {
  if (type === 'passion') {
    const ack = ACK_PASSION[key];
    return ack ? (ack[lang] || ack.en) : "I like that about you already.";
  }
  return _getLine('ack_escape', lang);
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function _fallbackName() {
  // Legendary anime-style names — forged from real language roots,
  // pre-validated across 40+ languages for no negative meanings
  const safeNames = [
    'lumirex', 'kavanith', 'zenarion', 'elvanox', 'onarith',
    'mirakzen', 'velunaris', 'aisoranix', 'navireth', 'kalenova',
    'rivenark', 'solanith', 'makiron', 'tenorex', 'ulvenari',
  ];
  return safeNames[Math.floor(Math.random() * safeNames.length)];
}
