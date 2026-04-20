/**
 * PaintByConceptTemplate - Canvas-based Paint-by-Number Educational Game
 *
 * A coloring-book style game where the canvas shows a grid of numbered zones.
 * Tapping a zone presents a question; answering correctly fills that zone with
 * its designated color via an expanding circle fill animation. Wrong answers
 * produce a red flash + shake. The game completes when all zones are painted.
 *
 * Config shape:
 *   {
 *     content: {
 *       zones: [{
 *         id: number,
 *         label: string,
 *         color: string,          // hex fill color for the zone
 *         question: string,
 *         options: string[],
 *         correctIndex: number,
 *         concept?: string,
 *       }]
 *       // OR standard questions format (adapted into zones automatically)
 *       questions: [{ question, options, correctIndex, concept }]
 *     }
 *   }
 *
 * Props:
 *   config     - see above
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import {kidsColors} from '../kidsTheme';
import CanvasGameBridge from '../shared/CanvasGameBridge';
import ParticlePool from '../shared/CanvasParticles';
import {drawRoundedRect, drawText, hitTestRect} from '../shared/CanvasSprites';
import {GameSounds} from '../shared/SoundManager';

import React from 'react';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Palette used when auto-generating zones from questions. */
const ZONE_PALETTE = [
  '#87CEEB',
  '#FFB6C1',
  '#98FB98',
  '#FFDAB9',
  '#DDA0DD',
  '#F0E68C',
  '#ADD8E6',
  '#FFA07A',
  '#90EE90',
  '#FFE4E1',
  '#B0C4DE',
  '#F5DEB3',
  '#E6E6FA',
  '#AFEEEE',
  '#D8BFD8',
  '#FFFACD',
];

const BACKGROUND_COLOR = '#FFF9E6';
const HEADER_HEIGHT = 80; // reserved for HUD + question text
const ZONE_PADDING = 8; // gap between zones
const ZONE_BORDER_RADIUS = 14; // rounded corners for each zone
const ZONE_BORDER_WIDTH = 2.5; // border stroke width
const DASH_PATTERN = [8, 5]; // dashed border for unpainted zones

// Fill animation
const FILL_DURATION = 0.5; // seconds for the expanding circle fill
const FILL_SETTLE_DELAY = 0.25; // extra time before zone is fully settled

// Feedback animations
const FLASH_DURATION = 0.4; // red flash on wrong answer
const SHAKE_DURATION = 0.35; // shake animation duration
const SHAKE_MAGNITUDE = 6; // px shake offset
const SELECT_BORDER_WIDTH = 3.5; // highlighted border for selected zone
const SELECT_PULSE_SPEED = 4; // border pulse frequency (Hz)

// Completion
const COMPLETION_DELAY = 0.8; // delay before calling onComplete after last fill
const CELEBRATION_PARTICLE_COUNT = 40;

// Scoring
const BASE_POINTS = 100;
const STREAK_BONUS = 25; // extra points per streak level

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Ease-out cubic for smooth deceleration.
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Compute a grid layout (cols x rows) for `count` items.
 */
function computeGrid(count) {
  if (count <= 1) return {cols: 1, rows: 1};
  if (count <= 2) return {cols: 2, rows: 1};
  if (count <= 4) return {cols: 2, rows: 2};
  if (count <= 6) return {cols: 3, rows: 2};
  if (count <= 9) return {cols: 3, rows: 3};
  if (count <= 12) return {cols: 4, rows: 3};
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return {cols, rows};
}

/**
 * Parse config into a normalized array of zone objects.
 */
function parseZones(config) {
  const content = config?.content;
  if (!content) return [];

  // Prefer explicit zones
  if (Array.isArray(content.zones) && content.zones.length > 0) {
    return content.zones
      .filter(
        (z) =>
          z &&
          typeof z.question === 'string' &&
          Array.isArray(z.options) &&
          z.options.length > 0
      )
      .map((z, i) => ({
        id: z.id ?? i + 1,
        label: z.label || `Zone ${i + 1}`,
        color: z.color || ZONE_PALETTE[i % ZONE_PALETTE.length],
        question: z.question,
        options: z.options,
        correctIndex: z.correctIndex ?? 0,
        concept: z.concept || '',
      }));
  }

  // Fallback: adapt from standard questions format
  if (Array.isArray(content.questions) && content.questions.length > 0) {
    return content.questions
      .filter(
        (q) =>
          q &&
          typeof q.question === 'string' &&
          Array.isArray(q.options) &&
          q.options.length > 0
      )
      .map((q, i) => ({
        id: i + 1,
        label: `${i + 1}`,
        color: ZONE_PALETTE[i % ZONE_PALETTE.length],
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex ?? 0,
        concept: q.concept || '',
      }));
  }

  return [];
}

// ─── Zone State Constants ───────────────────────────────────────────────────

const ZONE_STATE = {
  UNPAINTED: 0,
  SELECTED: 1,
  FILLING: 2,
  PAINTED: 3,
  FLASHING: 4, // wrong-answer flash
};

// ─── PaintByConceptGame (Canvas game class) ─────────────────────────────────

class PaintByConceptGame {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ config, onAnswer, onComplete, reducedMotion, colors }} opts
   */
  constructor(canvas, {config, onAnswer, onComplete, reducedMotion, colors}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onAnswer = onAnswer;
    this.onComplete = onComplete;
    this.reducedMotion = reducedMotion;
    this.colors = colors || kidsColors;

    // Parse zones from config
    this.zones = parseZones(config);

    // Dimensions (CSS pixels; DPI handled by bridge)
    this.width = canvas.style.width
      ? parseFloat(canvas.style.width)
      : canvas.width;
    this.height = canvas.style.height
      ? parseFloat(canvas.style.height)
      : canvas.height;

    // Grid layout
    const {cols, rows} = computeGrid(this.zones.length);
    this.gridCols = cols;
    this.gridRows = rows;

    // Game state
    this.score = 0;
    this.correct = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.results = [];
    this.finished = false;
    this.paintedCount = 0;

    // Per-zone runtime state
    this.zoneStates = this.zones.map(() => ({
      state: ZONE_STATE.UNPAINTED,
      fillProgress: 0, // 0..1 expanding circle animation
      flashTimer: 0, // countdown for red flash
      shakeTimer: 0, // countdown for shake animation
      shakeOffsetX: 0,
      shakeOffsetY: 0,
      settleTimer: 0, // brief pause after fill completes
    }));

    // Currently selected zone index (-1 = none)
    this.selectedZone = -1;

    // Question start time (for response time tracking)
    this.questionStartTime = 0;

    // Elapsed time for pulsing effects
    this.elapsed = 0;

    // Layout cache (computed in _layoutZones)
    this.zoneRects = []; // [{ x, y, w, h }]

    // Option button layout (when a zone is selected)
    this.optionRects = []; // [{ x, y, w, h, label, index }]

    // Completion timer
    this.completionTimer = -1; // -1 = not triggered yet

    // Particles
    this.particles = new ParticlePool();

    // Current question text to display
    this.currentQuestion = '';
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  start() {
    if (this.zones.length === 0) {
      this.finished = true;
      if (this.onComplete) {
        this.onComplete({
          score: 0,
          correct: 0,
          total: 0,
          results: [],
          bestStreak: 0,
        });
      }
      return;
    }
    this._layoutZones();
  }

  destroy() {
    this.particles.reset();
    this.zoneRects = [];
    this.optionRects = [];
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this._layoutZones();
    if (this.selectedZone >= 0) {
      this._layoutOptions();
    }
  }

  // ── Zone Layout ────────────────────────────────────────────────────────────

  _layoutZones() {
    this.zoneRects = [];
    const w = this.width;
    const h = this.height;
    const count = this.zones.length;
    if (count === 0 || w === 0 || h === 0) return;

    // Usable area below header and above option buttons area
    const topY = HEADER_HEIGHT;
    const bottomReserve = this.selectedZone >= 0 ? h * 0.28 : h * 0.05;
    const gridH = h - topY - bottomReserve;
    const gridW = w - ZONE_PADDING * 2;

    const cellW = (gridW - ZONE_PADDING * (this.gridCols - 1)) / this.gridCols;
    const cellH = (gridH - ZONE_PADDING * (this.gridRows - 1)) / this.gridRows;

    for (let i = 0; i < count; i++) {
      const col = i % this.gridCols;
      const row = Math.floor(i / this.gridCols);

      const x = ZONE_PADDING + col * (cellW + ZONE_PADDING);
      const y = topY + row * (cellH + ZONE_PADDING);

      this.zoneRects.push({x, y, w: cellW, h: cellH});
    }
  }

  // ── Option Buttons Layout ──────────────────────────────────────────────────

  _layoutOptions() {
    this.optionRects = [];
    if (this.selectedZone < 0) return;

    const zone = this.zones[this.selectedZone];
    if (!zone) return;

    const options = zone.options;
    const count = options.length;
    const w = this.width;
    const h = this.height;

    // Option buttons arranged in a horizontal row at the bottom
    const optionAreaH = h * 0.2;
    const optionAreaY = h - optionAreaH - h * 0.03;
    const optionGap = 8;
    const maxOptW = (w - ZONE_PADDING * 2 - optionGap * (count - 1)) / count;
    const optW = Math.min(maxOptW, 140);
    const optH = Math.min(optionAreaH * 0.75, 50);

    const totalW = optW * count + optionGap * (count - 1);
    const startX = (w - totalW) / 2;
    const optY = optionAreaY + (optionAreaH - optH) / 2;

    for (let i = 0; i < count; i++) {
      this.optionRects.push({
        x: startX + i * (optW + optionGap),
        y: optY,
        w: optW,
        h: optH,
        label: options[i],
        index: i,
      });
    }
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  update(dt) {
    this.elapsed += dt;
    this.particles.update(dt);

    if (this.finished) return;

    // Update per-zone animations
    for (let i = 0; i < this.zoneStates.length; i++) {
      const zs = this.zoneStates[i];

      // Fill animation
      if (zs.state === ZONE_STATE.FILLING) {
        zs.fillProgress += dt / FILL_DURATION;
        if (zs.fillProgress >= 1) {
          zs.fillProgress = 1;
          zs.state = ZONE_STATE.PAINTED;
          zs.settleTimer = FILL_SETTLE_DELAY;
        }
      }

      // Settle timer after painting
      if (zs.state === ZONE_STATE.PAINTED && zs.settleTimer > 0) {
        zs.settleTimer -= dt;
      }

      // Wrong-answer flash
      if (zs.state === ZONE_STATE.FLASHING) {
        zs.flashTimer -= dt;
        if (zs.flashTimer <= 0) {
          zs.flashTimer = 0;
          zs.state = ZONE_STATE.SELECTED;
        }
      }

      // Shake animation (runs concurrently with flash)
      if (zs.shakeTimer > 0) {
        zs.shakeTimer -= dt;
        if (zs.shakeTimer <= 0) {
          zs.shakeTimer = 0;
          zs.shakeOffsetX = 0;
          zs.shakeOffsetY = 0;
        } else {
          const progress = zs.shakeTimer / SHAKE_DURATION;
          zs.shakeOffsetX =
            Math.sin(zs.shakeTimer * 40) * SHAKE_MAGNITUDE * progress;
          zs.shakeOffsetY =
            Math.cos(zs.shakeTimer * 30) * (SHAKE_MAGNITUDE * 0.5) * progress;
        }
      }
    }

    // Completion timer
    if (this.completionTimer > 0) {
      this.completionTimer -= dt;
      if (this.completionTimer <= 0) {
        this._finishGame();
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Subtle gradient at top
    const grad = ctx.createLinearGradient(0, 0, 0, HEADER_HEIGHT);
    grad.addColorStop(0, 'rgba(108, 92, 231, 0.06)');
    grad.addColorStop(1, 'rgba(108, 92, 231, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, HEADER_HEIGHT);

    // ── HUD ──────────────────────────────────────────────────────────────

    this._renderHUD(ctx, w, h);

    // ── Zones ────────────────────────────────────────────────────────────

    for (let i = 0; i < this.zones.length; i++) {
      this._renderZone(ctx, i);
    }

    // ── Option Buttons ───────────────────────────────────────────────────

    if (this.selectedZone >= 0 && !this.finished) {
      this._renderOptions(ctx);
    }

    // ── Particles ────────────────────────────────────────────────────────

    this.particles.render(ctx);

    // ── Completion Overlay ───────────────────────────────────────────────

    if (this.finished) {
      this._renderComplete(ctx, w, h);
    }
  }

  // ── HUD Rendering ──────────────────────────────────────────────────────────

  _renderHUD(ctx, w, h) {
    // Progress counter (top-left)
    drawText(ctx, `${this.paintedCount} / ${this.zones.length}`, 14, 20, {
      fontSize: 14,
      fontWeight: 'bold',
      color: kidsColors.textSecondary,
      align: 'left',
      baseline: 'middle',
    });

    // Paint palette emoji
    drawText(
      ctx,
      '\uD83C\uDFA8',
      14 +
        ctx.measureText(`${this.paintedCount} / ${this.zones.length}`).width *
          0.7 +
        18,
      20,
      {
        fontSize: 14,
        fontWeight: 'normal',
        color: kidsColors.textSecondary,
        align: 'left',
        baseline: 'middle',
      }
    );

    // Score (top-right)
    drawText(ctx, `Score: ${this.score}`, w - 14, 20, {
      fontSize: 14,
      fontWeight: 'bold',
      color: kidsColors.primary,
      align: 'right',
      baseline: 'middle',
    });

    // Streak indicator
    if (this.streak >= 2) {
      drawText(ctx, `${this.streak} streak!`, w / 2, 20, {
        fontSize: 13,
        fontWeight: 'bold',
        color: kidsColors.streakFire,
        align: 'center',
        baseline: 'middle',
      });
    }

    // Question text (when a zone is selected)
    if (this.currentQuestion && this.selectedZone >= 0) {
      this._drawWrappedQuestion(
        ctx,
        this.currentQuestion,
        w / 2,
        42,
        w - 40,
        17
      );
    } else if (this.paintedCount < this.zones.length) {
      // Instruction text when no zone selected
      drawText(ctx, 'Tap a zone to answer its question!', w / 2, 50, {
        fontSize: 15,
        fontWeight: '600',
        color: kidsColors.textSecondary,
        align: 'center',
        baseline: 'middle',
      });
    }
  }

  // ── Zone Rendering ─────────────────────────────────────────────────────────

  _renderZone(ctx, index) {
    const zone = this.zones[index];
    const zs = this.zoneStates[index];
    const rect = this.zoneRects[index];
    if (!zone || !rect) return;

    const {x, y, w: zw, h: zh} = rect;
    const ox = zs.shakeOffsetX;
    const oy = zs.shakeOffsetY;
    const dx = x + ox;
    const dy = y + oy;

    ctx.save();

    switch (zs.state) {
      case ZONE_STATE.UNPAINTED: {
        // Light gray fill with dashed border
        drawRoundedRect(ctx, dx, dy, zw, zh, ZONE_BORDER_RADIUS, '#F5F5F5');

        // Dashed border
        ctx.save();
        ctx.setLineDash(DASH_PATTERN);
        ctx.strokeStyle = kidsColors.border;
        ctx.lineWidth = ZONE_BORDER_WIDTH;
        this._strokeRoundedRect(ctx, dx, dy, zw, zh, ZONE_BORDER_RADIUS);
        ctx.restore();

        // Zone number in center
        const numSize = Math.min(28, zw * 0.35, zh * 0.35);
        drawText(ctx, `${zone.id}`, dx + zw / 2, dy + zh / 2 - 4, {
          fontSize: numSize,
          fontWeight: 'bold',
          color: kidsColors.textMuted,
          align: 'center',
          baseline: 'middle',
        });

        // Label below the number
        const labelSize = Math.min(12, zw * 0.14, zh * 0.12);
        drawText(ctx, zone.label, dx + zw / 2, dy + zh / 2 + numSize * 0.6, {
          fontSize: labelSize,
          fontWeight: '600',
          color: kidsColors.textMuted,
          align: 'center',
          baseline: 'middle',
        });
        break;
      }

      case ZONE_STATE.SELECTED: {
        // Light gray base
        drawRoundedRect(ctx, dx, dy, zw, zh, ZONE_BORDER_RADIUS, '#F5F5F5');

        // Pulsing highlight border
        const pulse =
          0.5 + 0.5 * Math.sin(this.elapsed * SELECT_PULSE_SPEED * Math.PI * 2);
        const borderAlpha = 0.6 + 0.4 * pulse;

        ctx.save();
        ctx.strokeStyle = `rgba(108, 92, 231, ${borderAlpha})`;
        ctx.lineWidth = SELECT_BORDER_WIDTH;
        ctx.setLineDash([]);
        this._strokeRoundedRect(ctx, dx, dy, zw, zh, ZONE_BORDER_RADIUS);
        ctx.restore();

        // Zone number (slightly brighter)
        const numSize2 = Math.min(28, zw * 0.35, zh * 0.35);
        drawText(ctx, `${zone.id}`, dx + zw / 2, dy + zh / 2 - 4, {
          fontSize: numSize2,
          fontWeight: 'bold',
          color: kidsColors.primary,
          align: 'center',
          baseline: 'middle',
        });

        // Label
        const labelSize2 = Math.min(12, zw * 0.14, zh * 0.12);
        drawText(ctx, zone.label, dx + zw / 2, dy + zh / 2 + numSize2 * 0.6, {
          fontSize: labelSize2,
          fontWeight: '600',
          color: kidsColors.primary,
          align: 'center',
          baseline: 'middle',
        });

        // Subtle inner glow
        const glowGrad = ctx.createRadialGradient(
          dx + zw / 2,
          dy + zh / 2,
          0,
          dx + zw / 2,
          dy + zh / 2,
          Math.max(zw, zh) * 0.6
        );
        glowGrad.addColorStop(0, 'rgba(108, 92, 231, 0.08)');
        glowGrad.addColorStop(1, 'rgba(108, 92, 231, 0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(dx, dy, zw, zh);
        break;
      }

      case ZONE_STATE.FILLING: {
        // Base gray
        drawRoundedRect(ctx, dx, dy, zw, zh, ZONE_BORDER_RADIUS, '#F5F5F5');

        // Expanding circle clip fill
        const progress = easeOutCubic(zs.fillProgress);
        const maxRadius = Math.sqrt(zw * zw + zh * zh) / 2;
        const fillRadius = maxRadius * progress;
        const cx = dx + zw / 2;
        const cy = dy + zh / 2;

        ctx.save();
        // Clip to zone shape
        ctx.beginPath();
        this._roundedRectPath(ctx, dx, dy, zw, zh, ZONE_BORDER_RADIUS);
        ctx.clip();

        // Draw expanding circle with zone color
        ctx.beginPath();
        ctx.arc(cx, cy, fillRadius, 0, Math.PI * 2);
        ctx.fillStyle = zone.color;
        ctx.fill();
        ctx.restore();

        // Border
        ctx.strokeStyle = zone.color;
        ctx.lineWidth = ZONE_BORDER_WIDTH;
        this._strokeRoundedRect(ctx, dx, dy, zw, zh, ZONE_BORDER_RADIUS);

        // Zone number fading out
        const numAlpha = Math.max(0, 1 - progress * 2);
        if (numAlpha > 0) {
          ctx.globalAlpha = numAlpha;
          const numSize3 = Math.min(28, zw * 0.35, zh * 0.35);
          drawText(ctx, `${zone.id}`, cx, cy, {
            fontSize: numSize3,
            fontWeight: 'bold',
            color: '#FFFFFF',
            align: 'center',
            baseline: 'middle',
          });
          ctx.globalAlpha = 1;
        }

        // Checkmark fading in
        if (progress > 0.6) {
          const checkAlpha = (progress - 0.6) / 0.4;
          ctx.globalAlpha = checkAlpha;
          drawText(ctx, '\u2713', cx, cy, {
            fontSize: Math.min(24, zw * 0.3, zh * 0.3),
            fontWeight: 'bold',
            color: '#FFFFFF',
            align: 'center',
            baseline: 'middle',
          });
          ctx.globalAlpha = 1;
        }
        break;
      }

      case ZONE_STATE.PAINTED: {
        // Fully painted zone
        drawRoundedRect(ctx, dx, dy, zw, zh, ZONE_BORDER_RADIUS, zone.color);

        // Solid border matching zone color (slightly darker)
        ctx.strokeStyle = this._darkenColor(zone.color, 0.15);
        ctx.lineWidth = ZONE_BORDER_WIDTH;
        this._strokeRoundedRect(ctx, dx, dy, zw, zh, ZONE_BORDER_RADIUS);

        // Checkmark
        drawText(ctx, '\u2713', dx + zw / 2, dy + zh / 2 - 2, {
          fontSize: Math.min(22, zw * 0.28, zh * 0.28),
          fontWeight: 'bold',
          color: '#FFFFFF',
          align: 'center',
          baseline: 'middle',
        });

        // Label below checkmark
        const labelSize3 = Math.min(11, zw * 0.13, zh * 0.11);
        drawText(
          ctx,
          zone.label,
          dx + zw / 2,
          dy + zh / 2 + Math.min(18, zw * 0.2),
          {
            fontSize: labelSize3,
            fontWeight: '600',
            color: 'rgba(255,255,255,0.85)',
            align: 'center',
            baseline: 'middle',
          }
        );

        // Subtle shine highlight
        ctx.save();
        ctx.beginPath();
        this._roundedRectPath(ctx, dx, dy, zw, zh, ZONE_BORDER_RADIUS);
        ctx.clip();
        const shineGrad = ctx.createLinearGradient(dx, dy, dx, dy + zh * 0.4);
        shineGrad.addColorStop(0, 'rgba(255,255,255,0.2)');
        shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shineGrad;
        ctx.fillRect(dx, dy, zw, zh * 0.4);
        ctx.restore();
        break;
      }

      case ZONE_STATE.FLASHING: {
        // Red flash overlay
        const flashProgress = zs.flashTimer / FLASH_DURATION;

        // Base gray
        drawRoundedRect(ctx, dx, dy, zw, zh, ZONE_BORDER_RADIUS, '#F5F5F5');

        // Red overlay with fading alpha
        ctx.save();
        ctx.beginPath();
        this._roundedRectPath(ctx, dx, dy, zw, zh, ZONE_BORDER_RADIUS);
        ctx.clip();
        ctx.fillStyle = `rgba(231, 76, 60, ${0.3 * flashProgress})`;
        ctx.fillRect(dx, dy, zw, zh);
        ctx.restore();

        // Red border
        ctx.strokeStyle = `rgba(231, 76, 60, ${0.8 * flashProgress})`;
        ctx.lineWidth = SELECT_BORDER_WIDTH;
        this._strokeRoundedRect(ctx, dx, dy, zw, zh, ZONE_BORDER_RADIUS);

        // Zone number
        const numSize4 = Math.min(28, zw * 0.35, zh * 0.35);
        drawText(ctx, `${zone.id}`, dx + zw / 2, dy + zh / 2 - 4, {
          fontSize: numSize4,
          fontWeight: 'bold',
          color: kidsColors.incorrect,
          align: 'center',
          baseline: 'middle',
        });

        // X mark
        const xAlpha = Math.min(1, flashProgress * 2);
        ctx.globalAlpha = xAlpha;
        drawText(ctx, '\u2717', dx + zw / 2, dy + zh / 2 + numSize4 * 0.55, {
          fontSize: Math.min(16, zw * 0.2),
          fontWeight: 'bold',
          color: kidsColors.incorrect,
          align: 'center',
          baseline: 'middle',
        });
        ctx.globalAlpha = 1;
        break;
      }

      default:
        break;
    }

    ctx.restore();
  }

  // ── Option Buttons Rendering ───────────────────────────────────────────────

  _renderOptions(ctx) {
    const zone = this.zones[this.selectedZone];
    const zs = this.zoneStates[this.selectedZone];
    if (
      !zone ||
      zs.state === ZONE_STATE.FILLING ||
      zs.state === ZONE_STATE.PAINTED
    )
      return;

    for (let i = 0; i < this.optionRects.length; i++) {
      const opt = this.optionRects[i];

      // Button background
      const isHovered = false; // no hover state in canvas
      const bgColor = '#FFFFFF';
      const borderColor = kidsColors.primary;

      ctx.save();

      // Shadow
      ctx.shadowColor = 'rgba(108, 92, 231, 0.15)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;

      drawRoundedRect(
        ctx,
        opt.x,
        opt.y,
        opt.w,
        opt.h,
        12,
        bgColor,
        borderColor,
        2
      );

      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Label text
      const fontSize = this._computeOptionFontSize(opt.label, opt.w - 16);
      drawText(ctx, opt.label, opt.x + opt.w / 2, opt.y + opt.h / 2, {
        fontSize,
        fontWeight: 'bold',
        color: kidsColors.textPrimary,
        align: 'center',
        baseline: 'middle',
      });

      ctx.restore();
    }
  }

  // ── Completion Overlay ─────────────────────────────────────────────────────

  _renderComplete(ctx, w, h) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.fillRect(0, 0, w, h);

    const centerY = h * 0.4;

    drawText(ctx, 'Masterpiece!', w / 2, centerY - 10, {
      fontSize: 28,
      fontWeight: 'bold',
      color: kidsColors.primary,
      align: 'center',
      baseline: 'middle',
    });

    drawText(
      ctx,
      `Score: ${this.score} / ${this.zones.length * BASE_POINTS}`,
      w / 2,
      centerY + 26,
      {
        fontSize: 18,
        fontWeight: '600',
        color: kidsColors.textPrimary,
        align: 'center',
        baseline: 'middle',
      }
    );

    drawText(
      ctx,
      `${this.correct} / ${this.zones.length} correct`,
      w / 2,
      centerY + 52,
      {
        fontSize: 15,
        fontWeight: '600',
        color: kidsColors.textSecondary,
        align: 'center',
        baseline: 'middle',
      }
    );

    if (this.bestStreak >= 2) {
      drawText(ctx, `Best streak: ${this.bestStreak}`, w / 2, centerY + 76, {
        fontSize: 14,
        fontWeight: '600',
        color: kidsColors.streakFire,
        align: 'center',
        baseline: 'middle',
      });
    }
  }

  // ── Pointer Events ─────────────────────────────────────────────────────────

  onPointerDown(x, y) {
    if (this.finished) return;

    // Check option buttons first (if a zone is selected)
    if (this.selectedZone >= 0) {
      const zs = this.zoneStates[this.selectedZone];
      if (
        zs.state === ZONE_STATE.SELECTED ||
        zs.state === ZONE_STATE.FLASHING
      ) {
        for (let i = 0; i < this.optionRects.length; i++) {
          const opt = this.optionRects[i];
          if (hitTestRect(x, y, opt.x, opt.y, opt.w, opt.h)) {
            this._handleOptionTap(opt.index);
            return;
          }
        }
      }
    }

    // Check zones for tap (only unpainted zones)
    for (let i = 0; i < this.zoneRects.length; i++) {
      const rect = this.zoneRects[i];
      const zs = this.zoneStates[i];
      if (zs.state !== ZONE_STATE.UNPAINTED && zs.state !== ZONE_STATE.SELECTED)
        continue;

      if (hitTestRect(x, y, rect.x, rect.y, rect.w, rect.h)) {
        this._selectZone(i);
        return;
      }
    }

    // Tap on empty area deselects
    if (this.selectedZone >= 0) {
      const zs = this.zoneStates[this.selectedZone];
      if (zs.state === ZONE_STATE.SELECTED) {
        zs.state = ZONE_STATE.UNPAINTED;
        this.selectedZone = -1;
        this.currentQuestion = '';
        this.optionRects = [];
        this._layoutZones();
      }
    }
  }

  onPointerMove(_x, _y) {
    // no-op for this game
  }

  onPointerUp(_x, _y) {
    // no-op for this game
  }

  // ── Zone Selection ─────────────────────────────────────────────────────────

  _selectZone(index) {
    // Deselect previous zone
    if (this.selectedZone >= 0 && this.selectedZone !== index) {
      const prevZs = this.zoneStates[this.selectedZone];
      if (
        prevZs.state === ZONE_STATE.SELECTED ||
        prevZs.state === ZONE_STATE.FLASHING
      ) {
        prevZs.state = ZONE_STATE.UNPAINTED;
        prevZs.flashTimer = 0;
        prevZs.shakeTimer = 0;
        prevZs.shakeOffsetX = 0;
        prevZs.shakeOffsetY = 0;
      }
    }

    this.selectedZone = index;
    this.zoneStates[index].state = ZONE_STATE.SELECTED;
    this.currentQuestion = this.zones[index].question;
    this.questionStartTime = performance.now();

    GameSounds.tap();

    // Re-layout to make room for options
    this._layoutZones();
    this._layoutOptions();
  }

  // ── Answer Handling ────────────────────────────────────────────────────────

  _handleOptionTap(optionIndex) {
    if (this.selectedZone < 0) return;

    const zone = this.zones[this.selectedZone];
    const zs = this.zoneStates[this.selectedZone];
    if (!zone) return;

    // Ignore taps during filling animation
    if (zs.state === ZONE_STATE.FILLING || zs.state === ZONE_STATE.PAINTED)
      return;

    const responseTimeMs = performance.now() - this.questionStartTime;
    const isCorrect = optionIndex === zone.correctIndex;

    if (isCorrect) {
      // ── Correct Answer ──
      this.correct++;
      this.streak++;
      if (this.streak > this.bestStreak) {
        this.bestStreak = this.streak;
      }

      // Score with streak bonus
      const points = BASE_POINTS + Math.max(0, this.streak - 1) * STREAK_BONUS;
      this.score += points;

      // Begin fill animation
      zs.state = ZONE_STATE.FILLING;
      zs.fillProgress = 0;

      // Sound effects
      GameSounds.paintFill();
      if (this.streak === 3 || this.streak === 5 || this.streak === 10) {
        GameSounds.streak(this.streak);
      }

      // Confetti burst at zone center
      const rect = this.zoneRects[this.selectedZone];
      if (rect) {
        const confetti = ParticlePool.confettiBurst(
          rect.x + rect.w / 2,
          rect.y + rect.h / 2,
          20
        );
        this.particles.emitPreset(confetti);

        const sparkle = ParticlePool.sparkleBurst(
          rect.x + rect.w / 2,
          rect.y + rect.h / 2,
          10
        );
        this.particles.emitPreset(sparkle);
      }

      // Record result
      this.results.push({
        zoneId: zone.id,
        zoneLabel: zone.label,
        question: zone.question,
        selectedOption: zone.options[optionIndex],
        isCorrect: true,
        concept: zone.concept,
        responseTimeMs,
      });

      // Notify parent
      if (this.onAnswer) {
        this.onAnswer(true, zone.concept, responseTimeMs);
      }

      // Update painted count
      this.paintedCount++;

      // Clear selection state
      this.currentQuestion = '';
      this.optionRects = [];
      this.selectedZone = -1;

      // Re-layout zones (remove option area space)
      this._layoutZones();

      // Check for completion
      if (this.paintedCount >= this.zones.length) {
        this.completionTimer = COMPLETION_DELAY;

        // Big celebration particles
        const cx = this.width / 2;
        const cy = this.height / 2;
        this.particles.emitPreset(
          ParticlePool.confettiBurst(cx, cy, CELEBRATION_PARTICLE_COUNT)
        );
        this.particles.emitPreset(ParticlePool.sparkleBurst(cx, cy, 20));
        this.particles.emitPreset(ParticlePool.popExplosion(cx, cy, 15));
      }
    } else {
      // ── Wrong Answer ──
      this.streak = 0;

      zs.state = ZONE_STATE.FLASHING;
      zs.flashTimer = FLASH_DURATION;
      zs.shakeTimer = SHAKE_DURATION;

      GameSounds.wrong();

      // Record result
      this.results.push({
        zoneId: zone.id,
        zoneLabel: zone.label,
        question: zone.question,
        selectedOption: zone.options[optionIndex],
        isCorrect: false,
        concept: zone.concept,
        responseTimeMs,
      });

      // Notify parent
      if (this.onAnswer) {
        this.onAnswer(false, zone.concept, responseTimeMs);
      }
    }
  }

  // ── Game Completion ────────────────────────────────────────────────────────

  _finishGame() {
    if (this.finished) return;
    this.finished = true;

    const isPerfect = this.correct === this.zones.length;
    GameSounds.complete(isPerfect);

    if (this.onComplete) {
      this.onComplete({
        score: this.score,
        correct: this.correct,
        total: this.zones.length,
        results: this.results,
        bestStreak: this.bestStreak,
      });
    }
  }

  // ── Drawing Helpers ────────────────────────────────────────────────────────

  /**
   * Create a rounded rectangle path without filling/stroking.
   */
  _roundedRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }

  /**
   * Stroke a rounded rectangle (path only, no fill).
   */
  _strokeRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    this._roundedRectPath(ctx, x, y, w, h, r);
    ctx.stroke();
  }

  /**
   * Darken a hex color by a factor (0..1).
   */
  _darkenColor(hex, factor) {
    // Parse hex
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);

    r = Math.round(r * (1 - factor));
    g = Math.round(g * (1 - factor));
    b = Math.round(b * (1 - factor));

    return `rgb(${r}, ${g}, ${b})`;
  }

  /**
   * Compute font size that fits text within maxWidth.
   */
  _computeOptionFontSize(label, maxWidth) {
    const baseSize = 15;
    if (!label) return baseSize;

    const charFactor = 0.55;
    const desiredWidth = label.length * charFactor * baseSize;

    if (desiredWidth <= maxWidth) return baseSize;

    const scaled = Math.floor(baseSize * (maxWidth / desiredWidth));
    return Math.max(scaled, 10);
  }

  /**
   * Draw question text centered, wrapping to multiple lines if needed.
   */
  _drawWrappedQuestion(ctx, text, cx, startY, maxWidth, fontSize) {
    ctx.save();
    ctx.font = `bold ${fontSize}px "Nunito", sans-serif`;
    ctx.fillStyle = kidsColors.textPrimary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const words = text.split(' ');
    let line = '';
    let y = startY;
    const lineHeight = fontSize * 1.3;

    for (let i = 0; i < words.length; i++) {
      const testLine = line ? line + ' ' + words[i] : words[i];
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && line) {
        ctx.fillText(line, cx, y);
        line = words[i];
        y += lineHeight;
      } else {
        line = testLine;
      }
    }

    if (line) {
      ctx.fillText(line, cx, y);
    }

    ctx.restore();
  }
}

// ─── React Wrapper ──────────────────────────────────────────────────────────

export default function PaintByConceptTemplate({config, onAnswer, onComplete}) {
  return (
    <CanvasGameBridge
      GameClass={PaintByConceptGame}
      config={config}
      onAnswer={onAnswer}
      onComplete={onComplete}
      aspectRatio={3 / 4}
    />
  );
}
