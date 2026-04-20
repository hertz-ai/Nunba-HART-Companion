/**
 * SoundManager - Multimodal feedback abstraction for Kids Learning Zone (Web).
 *
 * Provides haptic (navigator.vibrate) + procedurally synthesized audio patterns
 * for game events using Web Audio API. No external audio files required.
 *
 * Public API matches the React Native version:
 *   import { GameSounds, HapticPatterns, SoundEvents } from './shared/SoundManager';
 *   GameSounds.correct();
 *   GameSounds.wrong();
 *   GameSounds.streak(5);
 *   GameSounds.complete(true);
 *   GameSounds.tap();
 *   GameSounds.startBackgroundMusic(url);
 *   await GameSounds.speakText('Hello!');
 */

import AudioChannelManager from './AudioChannelManager';
import MediaCacheManager from './MediaCacheManager';
import TTSManager from './TTSManager';

import {logger} from '../../../../utils/logger';

// ── Accessibility / Reduced Motion ───────────────────────────────────────────

let reducedMotion = false;

try {
  const mql = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (mql) {
    reducedMotion = mql.matches;
    mql.addEventListener?.('change', (e) => {
      reducedMotion = e.matches;
    });
  }
} catch (err) {
  logger.error(err);
}

// ── Haptic Feedback (navigator.vibrate) ──────────────────────────────────────

const vibrate = (pattern) => {
  if (reducedMotion) return;
  try {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.vibrate === 'function'
    ) {
      navigator.vibrate(pattern);
    }
  } catch (err) {
    logger.error(err);
    // Vibration API not available on desktop browsers
  }
};

/**
 * Haptic feedback patterns for game events.
 * These patterns work on mobile browsers with Vibration API support.
 * On desktop, vibrate() is a no-op.
 */
export const HapticPatterns = {
  tap: 30,
  correct: [0, 40, 50, 40],
  wrong: 80,
  streak3: [0, 30, 40, 30, 40, 30],
  streak5: [0, 30, 30, 30, 30, 50, 30, 50],
  streak10: [0, 30, 20, 30, 20, 30, 20, 60, 20, 60, 20, 60],
  complete: [0, 50, 60, 50, 60, 80],
  perfect: [0, 40, 40, 40, 40, 40, 40, 100, 80, 100],
};

// ── Sound Event Constants ────────────────────────────────────────────────────

export const SoundEvents = {
  TAP: 'tap',
  CORRECT: 'correct',
  WRONG: 'wrong',
  STREAK_3: 'streak_3',
  STREAK_5: 'streak_5',
  STREAK_10: 'streak_10',
  COMPLETE: 'complete',
  PERFECT: 'perfect',
  STAR_EARNED: 'star_earned',
  COUNTDOWN_TICK: 'countdown_tick',
  COUNTDOWN_END: 'countdown_end',
  DRAG_START: 'drag_start',
  DRAG_DROP: 'drag_drop',
  CARD_FLIP: 'card_flip',
  MATCH_FOUND: 'match_found',
  LEVEL_UP: 'level_up',
  INTRO: 'intro',
  // Canvas game sounds
  POP: 'pop',
  WHOOSH: 'whoosh',
  SPLASH: 'splash',
  EXPLOSION: 'explosion',
  GATE_PASS: 'gate_pass',
  ENEMY_DEFEAT: 'enemy_defeat',
  CASTLE_HIT: 'castle_hit',
  BLOCK_STACK: 'block_stack',
  BLOCK_FALL: 'block_fall',
  PAINT_FILL: 'paint_fill',
  POWER_UP: 'power_up',
  COIN_COLLECT: 'coin_collect',
};

// ── Procedural Sound Synthesis ───────────────────────────────────────────────
//
// Since we don't have bundled mp3 files on the web, we procedurally generate
// short AudioBuffers for each SFX event using Web Audio API oscillators and
// noise. These are synthesized once and cached as AudioBuffers.

const _synthCache = new Map();

/**
 * Get the AudioContext from AudioChannelManager (lazy init).
 */
const getCtx = () => AudioChannelManager.getAudioContext();

/**
 * Render an offline AudioBuffer by running a graph-building function.
 * @param {number} duration - seconds
 * @param {number} [sampleRate=44100]
 * @param {Function} buildGraph - (offlineCtx) => void
 * @returns {Promise<AudioBuffer>}
 */
const renderBuffer = async (duration, sampleRate, buildGraph) => {
  const offCtx = new OfflineAudioContext(
    1,
    Math.ceil(sampleRate * duration),
    sampleRate
  );
  buildGraph(offCtx);
  return await offCtx.startRendering();
};

/**
 * Create a simple tone envelope: attack -> sustain -> release.
 */
const toneEnvelope = (
  ctx,
  gainNode,
  startTime,
  attack,
  sustain,
  release,
  peakGain = 0.5
) => {
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(peakGain, startTime + attack);
  gainNode.gain.setValueAtTime(peakGain, startTime + attack + sustain);
  gainNode.gain.linearRampToValueAtTime(
    0,
    startTime + attack + sustain + release
  );
};

/**
 * Synthesize all sound effects and cache them as AudioBuffers.
 * Called lazily on first use.
 */
const ensureSynthBuffers = async () => {
  if (_synthCache.size > 0) return;

  const sr = 44100;

  // ── TAP: short click/tick ──
  _synthCache.set(
    SoundEvents.TAP,
    await renderBuffer(0.06, sr, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 800;
      const gain = ctx.createGain();
      toneEnvelope(ctx, gain, 0, 0.005, 0.01, 0.04, 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.06);
    })
  );

  // ── CORRECT: ascending two-note chime (C5 -> E5) ──
  _synthCache.set(
    SoundEvents.CORRECT,
    await renderBuffer(0.35, sr, (ctx) => {
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 523.25; // C5
      const gain1 = ctx.createGain();
      toneEnvelope(ctx, gain1, 0, 0.01, 0.08, 0.1, 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(0);
      osc1.stop(0.2);

      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 659.25; // E5
      const gain2 = ctx.createGain();
      toneEnvelope(ctx, gain2, 0.1, 0.01, 0.1, 0.14, 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(0.1);
      osc2.stop(0.35);
    })
  );

  // ── WRONG: descending buzz (E4 -> C4) ──
  _synthCache.set(
    SoundEvents.WRONG,
    await renderBuffer(0.3, sr, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(329.63, 0); // E4
      osc.frequency.linearRampToValueAtTime(261.63, 0.2); // C4
      const gain = ctx.createGain();
      toneEnvelope(ctx, gain, 0, 0.01, 0.15, 0.13, 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.3);
    })
  );

  // ── STREAK_3: 3-note ascending arpeggio (C5 -> E5 -> G5) ──
  _synthCache.set(
    SoundEvents.STREAK_3,
    await renderBuffer(0.45, sr, (ctx) => {
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        const t = i * 0.12;
        toneEnvelope(ctx, gain, t, 0.01, 0.06, 0.08, 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.15);
      });
    })
  );

  // ── STREAK_5: 4-note arpeggio with octave (C5 -> E5 -> G5 -> C6) ──
  _synthCache.set(
    SoundEvents.STREAK_5,
    await renderBuffer(0.6, sr, (ctx) => {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        const t = i * 0.11;
        toneEnvelope(ctx, gain, t, 0.01, 0.08, 0.1, 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.2);
      });
    })
  );

  // ── STREAK_10: triumphant 5-note fanfare ──
  _synthCache.set(
    SoundEvents.STREAK_10,
    await renderBuffer(0.8, sr, (ctx) => {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        const t = i * 0.12;
        toneEnvelope(ctx, gain, t, 0.01, 0.08, 0.12, 0.4 + i * 0.02);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.22);
      });
    })
  );

  // ── COMPLETE: celebration chord (C major triad sustained) ──
  _synthCache.set(
    SoundEvents.COMPLETE,
    await renderBuffer(0.8, sr, (ctx) => {
      const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
      freqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        toneEnvelope(ctx, gain, 0, 0.02, 0.3, 0.45, 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(0);
        osc.stop(0.8);
      });
      // Add a bright overtone
      const osc4 = ctx.createOscillator();
      osc4.type = 'sine';
      osc4.frequency.value = 1046.5; // C6
      const gain4 = ctx.createGain();
      toneEnvelope(ctx, gain4, 0.1, 0.02, 0.2, 0.4, 0.15);
      osc4.connect(gain4);
      gain4.connect(ctx.destination);
      osc4.start(0.1);
      osc4.stop(0.75);
    })
  );

  // ── PERFECT: grand celebration - major 7th chord with sparkle ──
  _synthCache.set(
    SoundEvents.PERFECT,
    await renderBuffer(1.2, sr, (ctx) => {
      // Arpeggiated intro
      const arpNotes = [523.25, 659.25, 783.99, 987.77, 1046.5];
      arpNotes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        const t = i * 0.08;
        toneEnvelope(ctx, gain, t, 0.01, 0.06, 0.08, 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.16);
      });
      // Sustained chord
      const chordFreqs = [523.25, 659.25, 783.99, 1046.5];
      chordFreqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        toneEnvelope(ctx, gain, 0.4, 0.03, 0.3, 0.45, 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(0.4);
        osc.stop(1.2);
      });
    })
  );

  // ── STAR_EARNED: sparkle chime (high-pitch ping) ──
  _synthCache.set(
    SoundEvents.STAR_EARNED,
    await renderBuffer(0.5, sr, (ctx) => {
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 1318.51; // E6
      const gain1 = ctx.createGain();
      toneEnvelope(ctx, gain1, 0, 0.005, 0.05, 0.15, 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(0);
      osc1.stop(0.22);

      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 1567.98; // G6
      const gain2 = ctx.createGain();
      toneEnvelope(ctx, gain2, 0.08, 0.005, 0.08, 0.25, 0.3);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(0.08);
      osc2.stop(0.42);

      const osc3 = ctx.createOscillator();
      osc3.type = 'sine';
      osc3.frequency.value = 2093.0; // C7
      const gain3 = ctx.createGain();
      toneEnvelope(ctx, gain3, 0.16, 0.005, 0.06, 0.25, 0.2);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(0.16);
      osc3.stop(0.48);
    })
  );

  // ── COUNTDOWN_TICK: metronome tick ──
  _synthCache.set(
    SoundEvents.COUNTDOWN_TICK,
    await renderBuffer(0.05, sr, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 1000;
      const gain = ctx.createGain();
      toneEnvelope(ctx, gain, 0, 0.002, 0.01, 0.035, 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.05);
    })
  );

  // ── COUNTDOWN_END: alarm-like double beep ──
  _synthCache.set(
    SoundEvents.COUNTDOWN_END,
    await renderBuffer(0.4, sr, (ctx) => {
      [0, 0.15].forEach((t) => {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 880;
        const gain = ctx.createGain();
        toneEnvelope(ctx, gain, t, 0.005, 0.06, 0.06, 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.13);
      });
    })
  );

  // ── DRAG_START: soft pop ──
  _synthCache.set(
    SoundEvents.DRAG_START,
    await renderBuffer(0.08, sr, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, 0);
      osc.frequency.exponentialRampToValueAtTime(300, 0.06);
      const gain = ctx.createGain();
      toneEnvelope(ctx, gain, 0, 0.005, 0.02, 0.05, 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.08);
    })
  );

  // ── DRAG_DROP: thud/plop ──
  _synthCache.set(
    SoundEvents.DRAG_DROP,
    await renderBuffer(0.12, sr, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, 0);
      osc.frequency.exponentialRampToValueAtTime(150, 0.1);
      const gain = ctx.createGain();
      toneEnvelope(ctx, gain, 0, 0.005, 0.03, 0.08, 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.12);
    })
  );

  // ── CARD_FLIP: whoosh/swipe ──
  _synthCache.set(
    SoundEvents.CARD_FLIP,
    await renderBuffer(0.15, sr, (ctx) => {
      // Use noise-like oscillator sweep
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, 0);
      osc.frequency.exponentialRampToValueAtTime(2000, 0.08);
      osc.frequency.exponentialRampToValueAtTime(400, 0.15);
      const gain = ctx.createGain();
      toneEnvelope(ctx, gain, 0, 0.01, 0.04, 0.1, 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.15);
    })
  );

  // ── MATCH_FOUND: bright double chime ──
  _synthCache.set(
    SoundEvents.MATCH_FOUND,
    await renderBuffer(0.4, sr, (ctx) => {
      const pairs = [
        [783.99, 0],
        [1046.5, 0.1],
      ]; // G5, C6
      pairs.forEach(([freq, t]) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        toneEnvelope(ctx, gain, t, 0.01, 0.08, 0.15, 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    })
  );

  // ── LEVEL_UP: ascending fanfare with harmony ──
  _synthCache.set(
    SoundEvents.LEVEL_UP,
    await renderBuffer(0.7, sr, (ctx) => {
      const notes = [
        {freq: 523.25, t: 0, dur: 0.15}, // C5
        {freq: 659.25, t: 0.1, dur: 0.15}, // E5
        {freq: 783.99, t: 0.2, dur: 0.15}, // G5
        {freq: 1046.5, t: 0.3, dur: 0.35}, // C6 (held)
      ];
      notes.forEach(({freq, t, dur}) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        toneEnvelope(ctx, gain, t, 0.01, dur * 0.5, dur * 0.5, 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      });
    })
  );

  // ── INTRO: warm welcome jingle ──
  _synthCache.set(
    SoundEvents.INTRO,
    await renderBuffer(0.9, sr, (ctx) => {
      const melody = [
        {freq: 392.0, t: 0, dur: 0.12}, // G4
        {freq: 523.25, t: 0.1, dur: 0.12}, // C5
        {freq: 659.25, t: 0.2, dur: 0.12}, // E5
        {freq: 783.99, t: 0.3, dur: 0.12}, // G5
        {freq: 1046.5, t: 0.45, dur: 0.4}, // C6 (held)
      ];
      melody.forEach(({freq, t, dur}) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        toneEnvelope(ctx, gain, t, 0.01, dur * 0.6, dur * 0.4, 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      });
    })
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Canvas Game Sounds (12 new)
  // ══════════════════════════════════════════════════════════════════════════

  // ── POP: quick balloon-pop burst (20ms) ──
  _synthCache.set(
    SoundEvents.POP,
    await renderBuffer(0.06, sr, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, 0);
      osc.frequency.exponentialRampToValueAtTime(200, 0.04);
      const gain = ctx.createGain();
      toneEnvelope(ctx, gain, 0, 0.002, 0.01, 0.04, 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.06);
    })
  );

  // ── WHOOSH: sweeping wind sound (150ms) ──
  _synthCache.set(
    SoundEvents.WHOOSH,
    await renderBuffer(0.2, sr, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, 0);
      osc.frequency.exponentialRampToValueAtTime(3000, 0.08);
      osc.frequency.exponentialRampToValueAtTime(200, 0.18);
      const gain = ctx.createGain();
      toneEnvelope(ctx, gain, 0, 0.02, 0.06, 0.12, 0.12);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1500;
      filter.Q.value = 0.5;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.2);
    })
  );

  // ── SPLASH: water splash effect (100ms) ──
  _synthCache.set(
    SoundEvents.SPLASH,
    await renderBuffer(0.2, sr, (ctx) => {
      // Noise burst via detuned oscillators
      [800, 1200, 1600, 2000].forEach((freq) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, 0);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.3, 0.15);
        const gain = ctx.createGain();
        toneEnvelope(ctx, gain, 0, 0.005, 0.03, 0.15, 0.08);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(0);
        osc.stop(0.2);
      });
    })
  );

  // ── EXPLOSION: bass boom (200ms) ──
  _synthCache.set(
    SoundEvents.EXPLOSION,
    await renderBuffer(0.3, sr, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, 0);
      osc.frequency.exponentialRampToValueAtTime(40, 0.25);
      const gain = ctx.createGain();
      toneEnvelope(ctx, gain, 0, 0.005, 0.05, 0.24, 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.3);
      // Add high-freq crackle
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(2000, 0);
      osc2.frequency.exponentialRampToValueAtTime(100, 0.15);
      const gain2 = ctx.createGain();
      toneEnvelope(ctx, gain2, 0, 0.002, 0.02, 0.1, 0.15);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(0);
      osc2.stop(0.15);
    })
  );

  // ── GATE_PASS: ascending whoosh through gate (150ms) ──
  _synthCache.set(
    SoundEvents.GATE_PASS,
    await renderBuffer(0.2, sr, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, 0);
      osc.frequency.exponentialRampToValueAtTime(1200, 0.1);
      osc.frequency.exponentialRampToValueAtTime(800, 0.18);
      const gain = ctx.createGain();
      toneEnvelope(ctx, gain, 0, 0.01, 0.08, 0.1, 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.2);
    })
  );

  // ── ENEMY_DEFEAT: satisfying bonk + sparkle (100ms) ──
  _synthCache.set(
    SoundEvents.ENEMY_DEFEAT,
    await renderBuffer(0.2, sr, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, 0);
      osc.frequency.exponentialRampToValueAtTime(1200, 0.05);
      const gain = ctx.createGain();
      toneEnvelope(ctx, gain, 0, 0.005, 0.03, 0.1, 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.15);
      // Sparkle overtone
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 2000;
      const gain2 = ctx.createGain();
      toneEnvelope(ctx, gain2, 0.05, 0.005, 0.03, 0.1, 0.15);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(0.05);
      osc2.stop(0.2);
    })
  );

  // ── CASTLE_HIT: heavy impact thud (150ms) ──
  _synthCache.set(
    SoundEvents.CASTLE_HIT,
    await renderBuffer(0.2, sr, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, 0);
      osc.frequency.exponentialRampToValueAtTime(50, 0.15);
      const gain = ctx.createGain();
      toneEnvelope(ctx, gain, 0, 0.005, 0.04, 0.15, 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.2);
    })
  );

  // ── BLOCK_STACK: solid thunk of block landing (80ms) ──
  _synthCache.set(
    SoundEvents.BLOCK_STACK,
    await renderBuffer(0.12, sr, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(500, 0);
      osc.frequency.exponentialRampToValueAtTime(200, 0.08);
      const gain = ctx.createGain();
      toneEnvelope(ctx, gain, 0, 0.003, 0.02, 0.08, 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.12);
    })
  );

  // ── BLOCK_FALL: tumbling crash (300ms) ──
  _synthCache.set(
    SoundEvents.BLOCK_FALL,
    await renderBuffer(0.4, sr, (ctx) => {
      [0, 0.08, 0.16, 0.24].forEach((t, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400 - i * 60, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.1);
        const gain = ctx.createGain();
        toneEnvelope(ctx, gain, t, 0.003, 0.02, 0.06, 0.3 - i * 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.1);
      });
    })
  );

  // ── PAINT_FILL: satisfying pour/fill (200ms) ──
  _synthCache.set(
    SoundEvents.PAINT_FILL,
    await renderBuffer(0.25, sr, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, 0);
      osc.frequency.linearRampToValueAtTime(800, 0.15);
      osc.frequency.linearRampToValueAtTime(600, 0.22);
      const gain = ctx.createGain();
      toneEnvelope(ctx, gain, 0, 0.02, 0.1, 0.12, 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.25);
    })
  );

  // ── POWER_UP: ascending shimmer (200ms) ──
  _synthCache.set(
    SoundEvents.POWER_UP,
    await renderBuffer(0.3, sr, (ctx) => {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        const t = i * 0.04;
        toneEnvelope(ctx, gain, t, 0.005, 0.04, 0.06, 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.1);
      });
    })
  );

  // ── COIN_COLLECT: bright ping (80ms) ──
  _synthCache.set(
    SoundEvents.COIN_COLLECT,
    await renderBuffer(0.12, sr, (ctx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 1568; // G6
      const gain = ctx.createGain();
      toneEnvelope(ctx, gain, 0, 0.003, 0.03, 0.08, 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.12);
      // Harmonic
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 2349; // D7
      const gain2 = ctx.createGain();
      toneEnvelope(ctx, gain2, 0.02, 0.003, 0.03, 0.06, 0.2);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(0.02);
      osc2.stop(0.12);
    })
  );
};

// ── Lazy-init flag ───────────────────────────────────────────────────────────

let _synthReady = false;
let _synthInitPromise = null;

const ensureSynth = () => {
  if (_synthReady) return Promise.resolve();
  if (_synthInitPromise) return _synthInitPromise;
  _synthInitPromise = ensureSynthBuffers()
    .then(() => {
      _synthReady = true;
    })
    .catch(() => {
      // Synthesis failed - sounds will be silent
      _synthReady = true;
    });
  return _synthInitPromise;
};

// ── Play Synthesized Audio ───────────────────────────────────────────────────

const playAudio = (soundEvent) => {
  if (AudioChannelManager.isMuted()) return;
  ensureSynth().then(() => {
    const buffer = _synthCache.get(soundEvent);
    if (!buffer) return;
    AudioChannelManager.playSFX(buffer);
  });
};

// ── GameSounds Public API ────────────────────────────────────────────────────

export const GameSounds = {
  /** Light tap feedback for button press */
  tap: () => {
    vibrate(HapticPatterns.tap);
    playAudio(SoundEvents.TAP);
  },

  /** Celebratory feedback for correct answer */
  correct: () => {
    vibrate(HapticPatterns.correct);
    playAudio(SoundEvents.CORRECT);
  },

  /** Gentle thud for wrong answer */
  wrong: () => {
    vibrate(HapticPatterns.wrong);
    playAudio(SoundEvents.WRONG);
  },

  /** Escalating feedback for streak milestones */
  streak: (count) => {
    if (count >= 10) {
      vibrate(HapticPatterns.streak10);
      playAudio(SoundEvents.STREAK_10);
    } else if (count >= 5) {
      vibrate(HapticPatterns.streak5);
      playAudio(SoundEvents.STREAK_5);
    } else if (count >= 3) {
      vibrate(HapticPatterns.streak3);
      playAudio(SoundEvents.STREAK_3);
    }
  },

  /** Game completion celebration */
  complete: (isPerfect = false) => {
    if (isPerfect) {
      vibrate(HapticPatterns.perfect);
      playAudio(SoundEvents.PERFECT);
    } else {
      vibrate(HapticPatterns.complete);
      playAudio(SoundEvents.COMPLETE);
    }
  },

  /** Perfect score shortcut */
  perfect: () => {
    vibrate(HapticPatterns.perfect);
    playAudio(SoundEvents.PERFECT);
  },

  /** Star earned feedback */
  starEarned: () => {
    vibrate(HapticPatterns.correct);
    playAudio(SoundEvents.STAR_EARNED);
  },

  /** Card flip for memory games */
  cardFlip: () => {
    vibrate(HapticPatterns.tap);
    playAudio(SoundEvents.CARD_FLIP);
  },

  /** Match found in pair-matching games */
  matchFound: () => {
    vibrate(HapticPatterns.correct);
    playAudio(SoundEvents.MATCH_FOUND);
  },

  /** Drag start for drag-drop games */
  dragStart: () => {
    vibrate(HapticPatterns.tap);
    playAudio(SoundEvents.DRAG_START);
  },

  /** Drop complete for drag-drop games */
  dragDrop: () => {
    vibrate(HapticPatterns.tap);
    playAudio(SoundEvents.DRAG_DROP);
  },

  /** Alias: drag() calls dragStart(), drop() calls dragDrop() */
  drag: () => {
    vibrate(HapticPatterns.tap);
    playAudio(SoundEvents.DRAG_START);
  },
  drop: () => {
    vibrate(HapticPatterns.tap);
    playAudio(SoundEvents.DRAG_DROP);
  },

  /** Alias: flip() calls cardFlip(), match() calls matchFound() */
  flip: () => {
    vibrate(HapticPatterns.tap);
    playAudio(SoundEvents.CARD_FLIP);
  },
  match: () => {
    vibrate(HapticPatterns.correct);
    playAudio(SoundEvents.MATCH_FOUND);
  },

  /** Timer tick for timed games */
  timerTick: () => {
    playAudio(SoundEvents.COUNTDOWN_TICK);
  },

  /** Timer end warning */
  timerEnd: () => {
    vibrate(HapticPatterns.wrong);
    playAudio(SoundEvents.COUNTDOWN_END);
  },

  /** Countdown tick (alias) */
  countdownTick: () => {
    playAudio(SoundEvents.COUNTDOWN_TICK);
  },

  /** Countdown end (alias) */
  countdownEnd: () => {
    vibrate(HapticPatterns.wrong);
    playAudio(SoundEvents.COUNTDOWN_END);
  },

  /** Level up fanfare */
  levelUp: () => {
    vibrate(HapticPatterns.correct);
    playAudio(SoundEvents.LEVEL_UP);
  },

  /** Level up / intro */
  intro: () => {
    vibrate(HapticPatterns.correct);
    playAudio(SoundEvents.INTRO);
  },

  // ── Canvas Game Sounds ─────────────────────────────────────────────────

  /** Balloon pop burst */
  pop: () => {
    vibrate(20);
    playAudio(SoundEvents.POP);
  },

  /** Whoosh / swoosh */
  whoosh: () => {
    playAudio(SoundEvents.WHOOSH);
  },

  /** Water splash */
  splash: () => {
    vibrate(30);
    playAudio(SoundEvents.SPLASH);
  },

  /** Explosion / boom */
  explosion: () => {
    vibrate([0, 40, 30, 40]);
    playAudio(SoundEvents.EXPLOSION);
  },

  /** Flying through correct gate */
  gatePass: () => {
    vibrate(25);
    playAudio(SoundEvents.GATE_PASS);
  },

  /** Enemy defeated / bonk */
  enemyDefeat: () => {
    vibrate(30);
    playAudio(SoundEvents.ENEMY_DEFEAT);
  },

  /** Castle/tower taking damage */
  castleHit: () => {
    vibrate(50);
    playAudio(SoundEvents.CASTLE_HIT);
  },

  /** Block stacking thunk */
  blockStack: () => {
    vibrate(20);
    playAudio(SoundEvents.BLOCK_STACK);
  },

  /** Block tower falling */
  blockFall: () => {
    vibrate([0, 30, 20, 30, 20, 30]);
    playAudio(SoundEvents.BLOCK_FALL);
  },

  /** Paint fill pour */
  paintFill: () => {
    vibrate(25);
    playAudio(SoundEvents.PAINT_FILL);
  },

  /** Power-up shimmer */
  powerUp: () => {
    vibrate([0, 20, 15, 20, 15, 30]);
    playAudio(SoundEvents.POWER_UP);
  },

  /** Coin / item collect */
  coinCollect: () => {
    vibrate(15);
    playAudio(SoundEvents.COIN_COLLECT);
  },

  // ── Background Music ────────────────────────────────────────────────────

  /** Start background music from URL, Blob URL, or AudioBuffer */
  startBackgroundMusic: (source, options) => {
    AudioChannelManager.startBGM(source, options);
  },

  /** Stop background music with optional fade out */
  stopBackgroundMusic: (options) => {
    AudioChannelManager.stopBGM(options);
  },

  /** Pause background music (used when app goes to background) */
  pauseBackgroundMusic: () => {
    AudioChannelManager.pauseBGM();
  },

  /** Resume background music */
  resumeBackgroundMusic: () => {
    AudioChannelManager.resumeBGM();
  },

  // ── TTS ─────────────────────────────────────────────────────────────────

  /** Speak text using backend TTS with cache-first resolution */
  speakText: async (text, options) => {
    return TTSManager.speak(text, options || {});
  },

  /** Pre-cache TTS for multiple texts */
  preCacheTTS: async (texts, options) => {
    return TTSManager.preCache(texts, options || {});
  },

  /** Stop current TTS playback */
  stopTTS: () => {
    TTSManager.stop();
  },

  // ── Generated Music ─────────────────────────────────────────────────────

  /** Play generated music from cache (pass mediaType + params used during caching) */
  playGeneratedMusic: async (mediaType, params, options) => {
    const blobUrl = await MediaCacheManager.getAsync(
      mediaType || 'music',
      params || {}
    );
    if (blobUrl) {
      AudioChannelManager.startBGM(blobUrl, options);
      return true;
    }
    return false;
  },

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /** Stop all audio and release resources */
  cleanup: () => {
    AudioChannelManager.stopAll();
  },

  /** Set muted state for all audio */
  setMuted: (muted) => {
    AudioChannelManager.setMuted(muted);
  },

  /** Check if audio is muted */
  isMuted: () => {
    return AudioChannelManager.isMuted();
  },

  /** Set master volume (0-1) */
  setMasterVolume: (volume) => {
    AudioChannelManager.setMasterVolume(volume);
  },

  /**
   * Pre-warm synthesized SFX buffers.
   * Call this early (e.g. on user gesture) to avoid delay on first sound.
   */
  warmUp: () => {
    return ensureSynth();
  },
};

// ── GameCommentary TTS System ──────────────────────────────────────────────

export const GameCommentary = {
  praise: [
    'Awesome!',
    "You're a star!",
    'Perfect!',
    'Amazing!',
    'Brilliant!',
    'Wonderful!',
    'Super!',
    'Fantastic!',
    'Well done!',
    'You rock!',
  ],
  encourage: [
    'Almost! Try again!',
    'Good try!',
    'So close!',
    'Keep going!',
    'You can do it!',
    'Nice effort!',
    "Don't give up!",
  ],
  streak: (n) => `Wow! ${n} in a row! Keep it up!`,
  intro: (title) => `Let's play ${title}! Are you ready?`,
  complete: (correct, total) =>
    `You did it! You got ${correct} out of ${total}! ${correct >= total * 0.8 ? 'Amazing job!' : 'Good effort! Try again to do even better!'}`,
  nextQuestion: 'Here comes the next one!',

  speakPraise() {
    GameSounds.speakText(
      this.praise[Math.floor(Math.random() * this.praise.length)]
    );
  },
  speakEncourage() {
    GameSounds.speakText(
      this.encourage[Math.floor(Math.random() * this.encourage.length)]
    );
  },
  speakStreak(n) {
    GameSounds.speakText(this.streak(n));
  },
  speakIntro(title) {
    GameSounds.speakText(this.intro(title));
  },
  speakComplete(correct, total) {
    GameSounds.speakText(this.complete(correct, total));
  },
};

export default GameSounds;
