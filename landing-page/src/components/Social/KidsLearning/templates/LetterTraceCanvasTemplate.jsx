/**
 * LetterTraceCanvasTemplate - Canvas-based letter tracing with sparkle particles
 *
 * Enhanced version of TracingTemplate using HTML5 Canvas instead of SVG,
 * with particle trail effects via CanvasGameBridge / ParticlePool.
 *
 * Props:
 *   config     - { content: { traces: [{
 *                   letter?: string,
 *                   waypoints?: [{ x, y }],
 *                   concept?: string,
 *                   word?: string
 *                 }] } }
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import {logger} from '../../../../utils/logger';
import {kidsColors} from '../kidsTheme';
import CanvasGameBridge from '../shared/CanvasGameBridge';
import ParticlePool from '../shared/CanvasParticles';
import {drawCircle, drawText, drawRoundedRect} from '../shared/CanvasSprites';
import {GameSounds, GameCommentary} from '../shared/SoundManager';

import React from 'react';

// ─── Constants ──────────────────────────────────────────────────────────────

const GRID = 300; // logical coordinate space
const HIT_RADIUS = 30; // proximity threshold for waypoint hit
const PASS_THRESHOLD = 0.8; // 80% waypoints hit = correct
const LINE_WIDTH = 8;
const GUIDE_INACTIVE_R = 12;
const GUIDE_ACTIVE_R = 14;
const GUIDE_NEXT_R = 16;
const SPARKLE_INTERVAL = 0.02; // seconds between trail particles
const TWO_PI = Math.PI * 2;

// Letter-to-emoji and letter-to-word mappings for visual association
const LETTER_EMOJIS = {
  A: '\uD83C\uDF4E',
  B: '\uD83E\uDD8B',
  C: '\uD83D\uDC31',
  D: '\uD83D\uDC36',
  E: '\uD83D\uDC18',
  F: '\uD83D\uDC38',
  G: '\uD83E\uDD92',
  H: '\uD83C\uDFE0',
  I: '\uD83C\uDF68',
  J: '\uD83E\uDE85',
  K: '\uD83E\uDD85',
  L: '\uD83E\uDD81',
  M: '\uD83C\uDF19',
  N: '\uD83C\uDF33',
  O: '\uD83D\uDC19',
  P: '\uD83D\uDC27',
  Q: '\uD83D\uDC51',
  R: '\uD83C\uDF08',
  S: '\u2B50',
  T: '\uD83C\uDF33',
  U: '\u2602\uFE0F',
  V: '\uD83C\uDFBB',
  W: '\uD83D\uDC33',
  X: '\u274C',
  Y: '\uD83C\uDF1F',
  Z: '\u26A1',
};

const LETTER_WORDS = {
  A: 'Apple',
  B: 'Butterfly',
  C: 'Cat',
  D: 'Dog',
  E: 'Elephant',
  F: 'Frog',
  G: 'Giraffe',
  H: 'House',
  I: 'Ice Cream',
  J: 'Jellyfish',
  K: 'Kite',
  L: 'Lion',
  M: 'Moon',
  N: 'Nature',
  O: 'Octopus',
  P: 'Penguin',
  Q: 'Queen',
  R: 'Rainbow',
  S: 'Star',
  T: 'Tree',
  U: 'Umbrella',
  V: 'Violin',
  W: 'Whale',
  X: 'X-mark',
  Y: 'Yellow Star',
  Z: 'Zap',
};

// ─── Waypoint data for A-Z and 0-9 (polyline coords in 300x300 grid) ────────

const LETTER_WAYPOINTS = {
  A: [
    {x: 50, y: 250},
    {x: 80, y: 170},
    {x: 110, y: 100},
    {x: 150, y: 50},
    {x: 190, y: 100},
    {x: 220, y: 170},
    {x: 250, y: 250},
    {x: 90, y: 170},
    {x: 150, y: 170},
    {x: 210, y: 170},
  ],
  B: [
    {x: 70, y: 50},
    {x: 70, y: 100},
    {x: 70, y: 150},
    {x: 70, y: 200},
    {x: 70, y: 250},
    {x: 130, y: 250},
    {x: 190, y: 240},
    {x: 220, y: 210},
    {x: 220, y: 180},
    {x: 190, y: 155},
    {x: 130, y: 150},
    {x: 70, y: 150},
    {x: 130, y: 150},
    {x: 190, y: 140},
    {x: 210, y: 110},
    {x: 210, y: 80},
    {x: 190, y: 55},
    {x: 130, y: 50},
    {x: 70, y: 50},
  ],
  C: [
    {x: 230, y: 80},
    {x: 190, y: 50},
    {x: 150, y: 40},
    {x: 100, y: 50},
    {x: 60, y: 90},
    {x: 45, y: 150},
    {x: 60, y: 210},
    {x: 100, y: 250},
    {x: 150, y: 260},
    {x: 190, y: 250},
    {x: 230, y: 220},
  ],
  D: [
    {x: 70, y: 50},
    {x: 70, y: 100},
    {x: 70, y: 150},
    {x: 70, y: 200},
    {x: 70, y: 250},
    {x: 130, y: 250},
    {x: 200, y: 230},
    {x: 240, y: 190},
    {x: 250, y: 150},
    {x: 240, y: 110},
    {x: 200, y: 70},
    {x: 130, y: 50},
    {x: 70, y: 50},
  ],
  E: [
    {x: 210, y: 50},
    {x: 140, y: 50},
    {x: 70, y: 50},
    {x: 70, y: 100},
    {x: 70, y: 150},
    {x: 120, y: 150},
    {x: 190, y: 150},
    {x: 70, y: 150},
    {x: 70, y: 200},
    {x: 70, y: 250},
    {x: 140, y: 250},
    {x: 210, y: 250},
  ],
  F: [
    {x: 210, y: 50},
    {x: 140, y: 50},
    {x: 70, y: 50},
    {x: 70, y: 100},
    {x: 70, y: 150},
    {x: 120, y: 150},
    {x: 180, y: 150},
    {x: 70, y: 150},
    {x: 70, y: 200},
    {x: 70, y: 250},
  ],
  G: [
    {x: 230, y: 80},
    {x: 190, y: 50},
    {x: 150, y: 40},
    {x: 100, y: 50},
    {x: 60, y: 90},
    {x: 45, y: 150},
    {x: 60, y: 210},
    {x: 100, y: 250},
    {x: 150, y: 260},
    {x: 200, y: 250},
    {x: 230, y: 220},
    {x: 230, y: 180},
    {x: 230, y: 150},
    {x: 190, y: 150},
    {x: 170, y: 150},
  ],
  H: [
    {x: 70, y: 50},
    {x: 70, y: 100},
    {x: 70, y: 150},
    {x: 70, y: 200},
    {x: 70, y: 250},
    {x: 70, y: 150},
    {x: 120, y: 150},
    {x: 180, y: 150},
    {x: 230, y: 150},
    {x: 230, y: 50},
    {x: 230, y: 100},
    {x: 230, y: 200},
    {x: 230, y: 250},
  ],
  I: [
    {x: 100, y: 50},
    {x: 150, y: 50},
    {x: 200, y: 50},
    {x: 150, y: 50},
    {x: 150, y: 100},
    {x: 150, y: 150},
    {x: 150, y: 200},
    {x: 150, y: 250},
    {x: 100, y: 250},
    {x: 200, y: 250},
  ],
  J: [
    {x: 120, y: 50},
    {x: 170, y: 50},
    {x: 220, y: 50},
    {x: 190, y: 50},
    {x: 190, y: 100},
    {x: 190, y: 150},
    {x: 190, y: 200},
    {x: 180, y: 240},
    {x: 150, y: 260},
    {x: 120, y: 250},
    {x: 80, y: 220},
  ],
  K: [
    {x: 70, y: 50},
    {x: 70, y: 100},
    {x: 70, y: 150},
    {x: 70, y: 200},
    {x: 70, y: 250},
    {x: 70, y: 150},
    {x: 110, y: 120},
    {x: 150, y: 85},
    {x: 220, y: 50},
    {x: 70, y: 150},
    {x: 110, y: 180},
    {x: 150, y: 215},
    {x: 220, y: 250},
  ],
  L: [
    {x: 70, y: 50},
    {x: 70, y: 100},
    {x: 70, y: 150},
    {x: 70, y: 200},
    {x: 70, y: 250},
    {x: 120, y: 250},
    {x: 170, y: 250},
    {x: 220, y: 250},
  ],
  M: [
    {x: 50, y: 250},
    {x: 50, y: 180},
    {x: 50, y: 110},
    {x: 50, y: 50},
    {x: 80, y: 90},
    {x: 110, y: 130},
    {x: 150, y: 170},
    {x: 190, y: 130},
    {x: 220, y: 90},
    {x: 250, y: 50},
    {x: 250, y: 110},
    {x: 250, y: 180},
    {x: 250, y: 250},
  ],
  N: [
    {x: 70, y: 250},
    {x: 70, y: 180},
    {x: 70, y: 110},
    {x: 70, y: 50},
    {x: 110, y: 100},
    {x: 150, y: 150},
    {x: 190, y: 200},
    {x: 230, y: 250},
    {x: 230, y: 180},
    {x: 230, y: 110},
    {x: 230, y: 50},
  ],
  O: [
    {x: 150, y: 40},
    {x: 100, y: 50},
    {x: 60, y: 90},
    {x: 45, y: 150},
    {x: 60, y: 210},
    {x: 100, y: 250},
    {x: 150, y: 260},
    {x: 200, y: 250},
    {x: 240, y: 210},
    {x: 255, y: 150},
    {x: 240, y: 90},
    {x: 200, y: 50},
    {x: 150, y: 40},
  ],
  P: [
    {x: 70, y: 250},
    {x: 70, y: 200},
    {x: 70, y: 150},
    {x: 70, y: 100},
    {x: 70, y: 50},
    {x: 130, y: 50},
    {x: 190, y: 55},
    {x: 230, y: 80},
    {x: 240, y: 110},
    {x: 230, y: 140},
    {x: 190, y: 155},
    {x: 130, y: 155},
    {x: 70, y: 155},
  ],
  Q: [
    {x: 150, y: 40},
    {x: 100, y: 50},
    {x: 60, y: 90},
    {x: 45, y: 150},
    {x: 60, y: 210},
    {x: 100, y: 250},
    {x: 150, y: 260},
    {x: 200, y: 250},
    {x: 240, y: 210},
    {x: 255, y: 150},
    {x: 240, y: 90},
    {x: 200, y: 50},
    {x: 150, y: 40},
    {x: 200, y: 220},
    {x: 230, y: 250},
    {x: 260, y: 275},
  ],
  R: [
    {x: 70, y: 250},
    {x: 70, y: 200},
    {x: 70, y: 150},
    {x: 70, y: 100},
    {x: 70, y: 50},
    {x: 130, y: 50},
    {x: 190, y: 55},
    {x: 230, y: 80},
    {x: 240, y: 110},
    {x: 230, y: 140},
    {x: 190, y: 155},
    {x: 130, y: 155},
    {x: 70, y: 155},
    {x: 130, y: 155},
    {x: 170, y: 190},
    {x: 210, y: 220},
    {x: 240, y: 250},
  ],
  S: [
    {x: 220, y: 80},
    {x: 200, y: 50},
    {x: 150, y: 35},
    {x: 100, y: 50},
    {x: 80, y: 80},
    {x: 90, y: 120},
    {x: 130, y: 145},
    {x: 170, y: 155},
    {x: 210, y: 180},
    {x: 220, y: 215},
    {x: 200, y: 250},
    {x: 150, y: 265},
    {x: 100, y: 250},
    {x: 80, y: 220},
  ],
  T: [
    {x: 50, y: 50},
    {x: 100, y: 50},
    {x: 150, y: 50},
    {x: 200, y: 50},
    {x: 250, y: 50},
    {x: 150, y: 50},
    {x: 150, y: 100},
    {x: 150, y: 150},
    {x: 150, y: 200},
    {x: 150, y: 250},
  ],
  U: [
    {x: 70, y: 50},
    {x: 70, y: 100},
    {x: 70, y: 150},
    {x: 70, y: 200},
    {x: 85, y: 240},
    {x: 120, y: 260},
    {x: 150, y: 265},
    {x: 180, y: 260},
    {x: 215, y: 240},
    {x: 230, y: 200},
    {x: 230, y: 150},
    {x: 230, y: 100},
    {x: 230, y: 50},
  ],
  V: [
    {x: 50, y: 50},
    {x: 80, y: 110},
    {x: 110, y: 170},
    {x: 150, y: 250},
    {x: 190, y: 170},
    {x: 220, y: 110},
    {x: 250, y: 50},
  ],
  W: [
    {x: 30, y: 50},
    {x: 50, y: 120},
    {x: 70, y: 190},
    {x: 100, y: 250},
    {x: 120, y: 180},
    {x: 150, y: 120},
    {x: 180, y: 180},
    {x: 200, y: 250},
    {x: 230, y: 190},
    {x: 250, y: 120},
    {x: 270, y: 50},
  ],
  X: [
    {x: 60, y: 50},
    {x: 100, y: 100},
    {x: 150, y: 150},
    {x: 200, y: 200},
    {x: 240, y: 250},
    {x: 240, y: 50},
    {x: 200, y: 100},
    {x: 150, y: 150},
    {x: 100, y: 200},
    {x: 60, y: 250},
  ],
  Y: [
    {x: 60, y: 50},
    {x: 90, y: 90},
    {x: 120, y: 120},
    {x: 150, y: 150},
    {x: 180, y: 120},
    {x: 210, y: 90},
    {x: 240, y: 50},
    {x: 150, y: 150},
    {x: 150, y: 200},
    {x: 150, y: 250},
  ],
  Z: [
    {x: 60, y: 50},
    {x: 120, y: 50},
    {x: 180, y: 50},
    {x: 240, y: 50},
    {x: 200, y: 100},
    {x: 150, y: 150},
    {x: 100, y: 200},
    {x: 60, y: 250},
    {x: 120, y: 250},
    {x: 180, y: 250},
    {x: 240, y: 250},
  ],
  0: [
    {x: 150, y: 40},
    {x: 100, y: 55},
    {x: 65, y: 100},
    {x: 55, y: 150},
    {x: 65, y: 200},
    {x: 100, y: 245},
    {x: 150, y: 260},
    {x: 200, y: 245},
    {x: 235, y: 200},
    {x: 245, y: 150},
    {x: 235, y: 100},
    {x: 200, y: 55},
    {x: 150, y: 40},
  ],
  1: [
    {x: 100, y: 90},
    {x: 130, y: 70},
    {x: 160, y: 50},
    {x: 160, y: 100},
    {x: 160, y: 150},
    {x: 160, y: 200},
    {x: 160, y: 250},
    {x: 100, y: 250},
    {x: 160, y: 250},
    {x: 220, y: 250},
  ],
  2: [
    {x: 70, y: 90},
    {x: 90, y: 55},
    {x: 130, y: 40},
    {x: 170, y: 40},
    {x: 210, y: 55},
    {x: 230, y: 90},
    {x: 220, y: 130},
    {x: 180, y: 170},
    {x: 130, y: 210},
    {x: 80, y: 250},
    {x: 130, y: 250},
    {x: 180, y: 250},
    {x: 230, y: 250},
  ],
  3: [
    {x: 70, y: 60},
    {x: 110, y: 40},
    {x: 160, y: 35},
    {x: 200, y: 50},
    {x: 220, y: 80},
    {x: 210, y: 115},
    {x: 180, y: 140},
    {x: 150, y: 150},
    {x: 180, y: 160},
    {x: 210, y: 185},
    {x: 220, y: 220},
    {x: 200, y: 250},
    {x: 160, y: 265},
    {x: 110, y: 260},
    {x: 70, y: 240},
  ],
  4: [
    {x: 190, y: 250},
    {x: 190, y: 200},
    {x: 190, y: 150},
    {x: 190, y: 100},
    {x: 190, y: 50},
    {x: 160, y: 90},
    {x: 120, y: 130},
    {x: 80, y: 170},
    {x: 50, y: 180},
    {x: 100, y: 180},
    {x: 150, y: 180},
    {x: 200, y: 180},
    {x: 250, y: 180},
  ],
  5: [
    {x: 220, y: 50},
    {x: 170, y: 50},
    {x: 120, y: 50},
    {x: 80, y: 50},
    {x: 75, y: 90},
    {x: 70, y: 130},
    {x: 110, y: 120},
    {x: 160, y: 120},
    {x: 200, y: 135},
    {x: 225, y: 165},
    {x: 230, y: 200},
    {x: 215, y: 235},
    {x: 180, y: 255},
    {x: 140, y: 260},
    {x: 100, y: 250},
    {x: 70, y: 230},
  ],
  6: [
    {x: 210, y: 60},
    {x: 170, y: 40},
    {x: 120, y: 50},
    {x: 80, y: 80},
    {x: 60, y: 130},
    {x: 55, y: 180},
    {x: 65, y: 220},
    {x: 95, y: 255},
    {x: 140, y: 265},
    {x: 190, y: 255},
    {x: 220, y: 225},
    {x: 230, y: 190},
    {x: 220, y: 155},
    {x: 190, y: 135},
    {x: 140, y: 130},
    {x: 95, y: 145},
    {x: 65, y: 175},
  ],
  7: [
    {x: 60, y: 50},
    {x: 120, y: 50},
    {x: 180, y: 50},
    {x: 240, y: 50},
    {x: 210, y: 100},
    {x: 180, y: 150},
    {x: 160, y: 200},
    {x: 150, y: 250},
  ],
  8: [
    {x: 150, y: 40},
    {x: 110, y: 50},
    {x: 85, y: 75},
    {x: 85, y: 105},
    {x: 105, y: 130},
    {x: 150, y: 150},
    {x: 195, y: 130},
    {x: 215, y: 105},
    {x: 215, y: 75},
    {x: 195, y: 50},
    {x: 150, y: 40},
    {x: 105, y: 170},
    {x: 80, y: 200},
    {x: 80, y: 235},
    {x: 105, y: 258},
    {x: 150, y: 268},
    {x: 195, y: 258},
    {x: 220, y: 235},
    {x: 220, y: 200},
    {x: 195, y: 170},
    {x: 150, y: 150},
  ],
  9: [
    {x: 230, y: 130},
    {x: 215, y: 90},
    {x: 180, y: 55},
    {x: 140, y: 45},
    {x: 100, y: 55},
    {x: 80, y: 85},
    {x: 75, y: 115},
    {x: 85, y: 145},
    {x: 115, y: 165},
    {x: 155, y: 170},
    {x: 200, y: 155},
    {x: 230, y: 130},
    {x: 235, y: 175},
    {x: 230, y: 220},
    {x: 210, y: 255},
    {x: 170, y: 270},
    {x: 120, y: 260},
    {x: 90, y: 240},
  ],
};

// ─── LetterTraceGame (canvas game class) ────────────────────────────────────

class LetterTraceGame {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ config, onAnswer, onComplete, reducedMotion, colors }} opts
   */
  constructor(canvas, {config, onAnswer, onComplete, reducedMotion, colors}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.config = config;
    this.onAnswer = onAnswer;
    this.onComplete = onComplete;
    this.reducedMotion = reducedMotion;
    this.colors = colors || kidsColors;

    this.traces = config?.content?.traces ?? [];
    this.total = this.traces.length;

    // Game-level state
    this.currentIndex = 0;
    this.score = 0;
    this.results = [];
    this.streak = 0;
    this.bestStreak = 0;

    // Current trace state
    this.waypoints = [];
    this.waypointHit = []; // boolean[]
    this.nextWaypointIdx = 0;
    this.drawPath = []; // [{x,y}]
    this.isDrawing = false;
    this.submitted = false;
    this.feedbackTimer = 0;
    this.feedbackCorrect = false;
    this.startTime = 0;

    // Visual
    this.pulseTime = 0;
    this.sparkleTimer = 0;
    this.particles = new ParticlePool();
    this.celebrationFired = false;

    // Dimensions (will be set by resize)
    this.w = 0;
    this.h = 0;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  start() {
    // Speak game intro
    if (this.config?.title) {
      try {
        GameCommentary.speakIntro(this.config.title);
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
    }
    this._loadTrace(0);
  }

  destroy() {
    this.particles.reset();
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    // Calculate scale and offset to center the 300x300 grid inside the canvas,
    // leaving room for UI at top (70px logical for emoji + label).
    const usableH = h - 70;
    const s = Math.min(w / GRID, usableH / GRID);
    this.scale = s;
    this.offsetX = (w - GRID * s) / 2;
    this.offsetY = 70 + (usableH - GRID * s) / 2;
  }

  // ── Helpers ────────────────────────────────────────────────────

  /** Convert canvas CSS coords to grid coords. */
  _toGrid(cx, cy) {
    return {
      x: (cx - this.offsetX) / this.scale,
      y: (cy - this.offsetY) / this.scale,
    };
  }

  /** Convert grid coords to canvas CSS coords. */
  _toCanvas(gx, gy) {
    return {
      x: gx * this.scale + this.offsetX,
      y: gy * this.scale + this.offsetY,
    };
  }

  _loadTrace(index) {
    const trace = this.traces[index];
    if (!trace) return;

    const letter = (trace.letter || '').toUpperCase();

    if (trace.waypoints && trace.waypoints.length > 0) {
      this.waypoints = trace.waypoints.map((wp) => ({x: wp.x, y: wp.y}));
    } else if (LETTER_WAYPOINTS[letter]) {
      this.waypoints = LETTER_WAYPOINTS[letter].map((wp) => ({
        x: wp.x,
        y: wp.y,
      }));
    } else {
      // Fallback: generate a simple cross pattern
      this.waypoints = [
        {x: 150, y: 50},
        {x: 150, y: 150},
        {x: 150, y: 250},
        {x: 50, y: 150},
        {x: 150, y: 150},
        {x: 250, y: 150},
      ];
    }

    this.waypointHit = new Array(this.waypoints.length).fill(false);
    this.nextWaypointIdx = 0;
    this.drawPath = [];
    this.isDrawing = false;
    this.submitted = false;
    this.feedbackTimer = 0;
    this.feedbackCorrect = false;
    this.celebrationFired = false;
    this.startTime = performance.now();
    this.particles.reset();

    // TTS: "This is the letter X! Trace it with your finger!"
    if (letter) {
      const word = LETTER_WORDS[letter] || '';
      const text = word
        ? `This is the letter ${letter}! ${letter} for ${word}! Trace it with your finger!`
        : `This is the letter ${letter}! Trace it with your finger!`;
      try {
        GameSounds.speakText(text);
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
    }
  }

  // ── Update ─────────────────────────────────────────────────────

  update(dt) {
    this.pulseTime += dt;
    this.particles.update(dt);

    // Feedback timer
    if (this.submitted && this.feedbackTimer > 0) {
      this.feedbackTimer -= dt;
      if (this.feedbackTimer <= 0) {
        this.feedbackTimer = 0;
        this._advanceOrFinish();
      }
    }

    // Check auto-submit while drawing
    if (this.isDrawing && !this.submitted) {
      const hitCount = this.waypointHit.filter(Boolean).length;
      const hitRatio = hitCount / this.waypoints.length;
      if (hitRatio >= PASS_THRESHOLD) {
        this._submit();
      }
    }
  }

  // ── Pointer events ─────────────────────────────────────────────

  onPointerDown(cx, cy) {
    if (this.submitted) return;
    this.isDrawing = true;
    const gp = this._toGrid(cx, cy);
    this.drawPath = [gp];
    this._checkWaypointHits(gp);
  }

  onPointerMove(cx, cy) {
    if (!this.isDrawing || this.submitted) return;
    const gp = this._toGrid(cx, cy);
    this.drawPath.push(gp);
    this._checkWaypointHits(gp);

    // Sparkle trail
    if (!this.reducedMotion) {
      this.sparkleTimer += 0.016; // approximate dt
      if (this.sparkleTimer >= SPARKLE_INTERVAL) {
        this.sparkleTimer = 0;
        const cp = this._toCanvas(gp.x, gp.y);
        const preset = ParticlePool.sparkleBurst(cp.x, cp.y, 2);
        preset.options.sizeMin = 1;
        preset.options.sizeMax = 3;
        preset.options.lifeMin = 0.2;
        preset.options.lifeMax = 0.5;
        preset.options.speedMin = 15;
        preset.options.speedMax = 50;
        this.particles.emitPreset(preset);
      }
    }
  }

  onPointerUp(_cx, _cy) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
  }

  // ── Internal ───────────────────────────────────────────────────

  _checkWaypointHits(gp) {
    for (let i = 0; i < this.waypoints.length; i++) {
      if (this.waypointHit[i]) continue;
      const wp = this.waypoints[i];
      const dx = gp.x - wp.x;
      const dy = gp.y - wp.y;
      if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
        this.waypointHit[i] = true;
        // Advance next target pointer
        while (
          this.nextWaypointIdx < this.waypoints.length &&
          this.waypointHit[this.nextWaypointIdx]
        ) {
          this.nextWaypointIdx++;
        }
        // Small hit sparkle
        if (!this.reducedMotion) {
          const cp = this._toCanvas(wp.x, wp.y);
          const preset = ParticlePool.sparkleBurst(cp.x, cp.y, 6);
          preset.options.sizeMin = 1.5;
          preset.options.sizeMax = 4;
          this.particles.emitPreset(preset);
        }
      }
    }
  }

  _submit() {
    if (this.submitted) return;
    this.submitted = true;

    const hitCount = this.waypointHit.filter(Boolean).length;
    const accuracyPct = Math.round((hitCount / this.waypoints.length) * 100);
    const isCorrect = hitCount / this.waypoints.length >= PASS_THRESHOLD;
    const elapsed = Math.round(performance.now() - this.startTime);
    const trace = this.traces[this.currentIndex] || {};

    this.feedbackCorrect = isCorrect;
    this.feedbackTimer = 2.0; // 2 seconds of feedback

    if (isCorrect) {
      this.score++;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      GameSounds.correct();
      setTimeout(() => {
        try {
          GameCommentary.speakPraise();
        } catch (err) {
          logger.error(err); /* Game asset load — non-critical */
        }
      }, 400);
      if (this.streak === 3 || this.streak === 5 || this.streak === 10) {
        try {
          GameCommentary.speakStreak(this.streak);
        } catch (err) {
          logger.error(err); /* Game asset load — non-critical */
        }
      }
    } else {
      this.streak = 0;
      GameSounds.wrong();
      setTimeout(() => {
        try {
          GameCommentary.speakEncourage();
        } catch (err) {
          logger.error(err); /* Game asset load — non-critical */
        }
      }, 400);
    }

    const result = {
      questionIndex: this.currentIndex,
      letter: trace.letter || '',
      word: trace.word || '',
      accuracy: accuracyPct,
      isCorrect,
      concept: trace.concept || '',
      responseTimeMs: elapsed,
    };
    this.results.push(result);

    if (this.onAnswer) {
      this.onAnswer(isCorrect, trace.concept || '', elapsed);
    }

    // Celebration particles for correct
    if (isCorrect && !this.reducedMotion) {
      const cx = this.w / 2;
      const cy = this.h / 2;
      const confetti = ParticlePool.confettiBurst(cx, cy, 35);
      this.particles.emitPreset(confetti);
      const sparkle = ParticlePool.sparkleBurst(cx, cy, 25);
      this.particles.emitPreset(sparkle);
    }
  }

  _advanceOrFinish() {
    if (this.currentIndex + 1 < this.total) {
      this.currentIndex++;
      this._loadTrace(this.currentIndex);
    } else {
      // Game complete
      if (this.onComplete) {
        const isPerfect = this.score === this.total;
        GameSounds.complete(isPerfect);
        try {
          GameCommentary.speakComplete(this.score, this.total);
        } catch (err) {
          logger.error(err); /* Game asset load — non-critical */
        }
        this.onComplete({
          score: this.score,
          correct: this.score,
          total: this.total,
          results: this.results,
          bestStreak: this.bestStreak,
        });
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────

  render() {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    if (!w || !h) return;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid inside the trace area
    this._renderGrid(ctx);

    // ── Header: progress + score ──
    const trace = this.traces[this.currentIndex] || {};
    const letter = (trace.letter || '').toUpperCase();
    const label =
      trace.word || trace.concept || (letter ? `Letter ${letter}` : '');

    drawText(ctx, `Letter ${this.currentIndex + 1}/${this.total}`, 10, 16, {
      fontSize: 13,
      fontWeight: '600',
      color: this.colors.textSecondary,
      align: 'left',
      baseline: 'middle',
    });

    drawText(ctx, `Score: ${this.score}`, w - 10, 16, {
      fontSize: 13,
      fontWeight: 'bold',
      color: this.colors.primaryLight,
      align: 'right',
      baseline: 'middle',
    });

    // Letter emoji
    const emoji = trace.emoji || LETTER_EMOJIS[letter] || '';
    const wordAssoc = LETTER_WORDS[letter] || '';
    if (emoji) {
      drawText(ctx, emoji, w / 2, 36, {
        fontSize: 28,
        align: 'center',
        baseline: 'middle',
      });
    }

    // Label with word association
    const displayLabel =
      label +
      (wordAssoc && !label.includes(wordAssoc) ? ` for ${wordAssoc}` : '');
    if (displayLabel) {
      drawText(ctx, displayLabel, w / 2, emoji ? 58 : 36, {
        fontSize: 16,
        fontWeight: 'bold',
        color: this.colors.textPrimary,
        align: 'center',
        baseline: 'middle',
      });
    }

    // ── Guide dots (waypoints) ──
    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      const cp = this._toCanvas(wp.x, wp.y);
      const isHit = this.waypointHit[i];
      const isNext = i === this.nextWaypointIdx && !this.submitted;

      if (isHit) {
        // Active/hit: filled green
        drawCircle(
          ctx,
          cp.x,
          cp.y,
          ((GUIDE_ACTIVE_R * this.scale) / (GRID / 100)) * 0.3,
          this.colors.correct,
          null,
          0
        );
      } else if (isNext) {
        // Next target: pulsing yellow
        const pulse = 1 + 0.15 * Math.sin(this.pulseTime * 4);
        const r = ((GUIDE_NEXT_R * this.scale) / (GRID / 100)) * 0.3 * pulse;
        ctx.save();
        ctx.globalAlpha = 0.6 + 0.3 * Math.sin(this.pulseTime * 4);
        drawCircle(ctx, cp.x, cp.y, r, this.colors.yellow, null, 0);
        ctx.restore();
      } else {
        // Inactive: gray outline
        const r = ((GUIDE_INACTIVE_R * this.scale) / (GRID / 100)) * 0.3;
        drawCircle(ctx, cp.x, cp.y, r, null, this.colors.textMuted, 2);
      }
    }

    // ── Draw connecting dashed lines between consecutive waypoints (guide) ──
    if (this.waypoints.length > 1) {
      ctx.save();
      ctx.setLineDash([4 * (this.scale * 0.4), 4 * (this.scale * 0.4)]);
      ctx.strokeStyle = this.colors.primaryLight + '30';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < this.waypoints.length; i++) {
        const cp = this._toCanvas(this.waypoints[i].x, this.waypoints[i].y);
        if (i === 0) ctx.moveTo(cp.x, cp.y);
        else ctx.lineTo(cp.x, cp.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ── User drawing path ──
    if (this.drawPath.length > 1) {
      ctx.save();
      ctx.lineWidth = LINE_WIDTH * (this.scale * 0.3);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (this.submitted) {
        if (this.feedbackCorrect) {
          // Green glow on path
          ctx.shadowColor = this.colors.correct;
          ctx.shadowBlur = 12;
          ctx.strokeStyle = this.colors.correct;
        } else {
          ctx.strokeStyle = this.colors.incorrect;
        }
      } else {
        ctx.strokeStyle = this.colors.primary;
      }

      ctx.beginPath();
      for (let i = 0; i < this.drawPath.length; i++) {
        const cp = this._toCanvas(this.drawPath[i].x, this.drawPath[i].y);
        if (i === 0) ctx.moveTo(cp.x, cp.y);
        else ctx.lineTo(cp.x, cp.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // ── Feedback overlay ──
    if (this.submitted && this.feedbackTimer > 0) {
      const alpha = Math.min(1, this.feedbackTimer / 0.3); // fade in first 300ms
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;

      const hitCount = this.waypointHit.filter(Boolean).length;
      const accuracyPct = Math.round((hitCount / this.waypoints.length) * 100);

      if (this.feedbackCorrect) {
        // Green banner
        const bw = Math.min(280, w * 0.7);
        const bh = 60;
        const bx = (w - bw) / 2;
        const by = h / 2 - bh / 2;
        drawRoundedRect(ctx, bx, by, bw, bh, 16, this.colors.correct);
        ctx.globalAlpha = 1;
        drawText(ctx, `Great! ${accuracyPct}% accuracy`, w / 2, h / 2, {
          fontSize: 20,
          fontWeight: 'bold',
          color: '#FFFFFF',
          align: 'center',
          baseline: 'middle',
        });
      } else {
        const bw = Math.min(280, w * 0.7);
        const bh = 60;
        const bx = (w - bw) / 2;
        const by = h / 2 - bh / 2;
        drawRoundedRect(ctx, bx, by, bw, bh, 16, this.colors.incorrect);
        ctx.globalAlpha = 1;
        drawText(ctx, `Try harder! ${accuracyPct}%`, w / 2, h / 2, {
          fontSize: 20,
          fontWeight: 'bold',
          color: '#FFFFFF',
          align: 'center',
          baseline: 'middle',
        });
      }
      ctx.restore();
    }

    // ── Particles on top ──
    this.particles.render(ctx);

    // ── Progress dots at bottom ──
    this._renderProgressDots(ctx);
  }

  _renderGrid(ctx) {
    const step = 30; // grid spacing in grid-coords
    ctx.save();
    ctx.strokeStyle = this.colors.primaryLight + '12';
    ctx.lineWidth = 0.5;
    for (let gx = 0; gx <= GRID; gx += step) {
      const p1 = this._toCanvas(gx, 0);
      const p2 = this._toCanvas(gx, GRID);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let gy = 0; gy <= GRID; gy += step) {
      const p1 = this._toCanvas(0, gy);
      const p2 = this._toCanvas(GRID, gy);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  _renderProgressDots(ctx) {
    const dotR = 5;
    const gap = 14;
    const totalWidth = this.total * (dotR * 2) + (this.total - 1) * gap;
    const startX = (this.w - totalWidth) / 2 + dotR;
    const y = this.h - 14;

    for (let i = 0; i < this.total; i++) {
      const x = startX + i * (dotR * 2 + gap);
      let color = this.colors.surfaceLight || '#E0E0E0';
      const answered = this.results.find((r) => r.questionIndex === i);
      if (answered) {
        color = answered.isCorrect
          ? this.colors.correct
          : this.colors.incorrect;
      } else if (i === this.currentIndex) {
        color = this.colors.primary;
      }
      drawCircle(ctx, x, y, i === this.currentIndex ? dotR + 2 : dotR, color);
    }
  }
}

// ─── React Wrapper ──────────────────────────────────────────────────────────

export default function LetterTraceCanvasTemplate({
  config,
  onAnswer,
  onComplete,
}) {
  const firstTrace = config?.content?.traces?.[0];
  const letter = (firstTrace?.letter || '').toUpperCase();
  const traceLabel = letter
    ? `Tracing canvas for letter ${letter}`
    : 'Letter tracing canvas';

  return (
    <CanvasGameBridge
      GameClass={LetterTraceGame}
      config={config}
      onAnswer={onAnswer}
      onComplete={onComplete}
      aspectRatio={1}
      ariaLabel={traceLabel}
    />
  );
}
