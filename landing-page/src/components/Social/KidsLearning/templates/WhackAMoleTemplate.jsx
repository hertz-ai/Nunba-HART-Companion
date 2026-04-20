/**
 * WhackAMoleTemplate - Canvas-based Whack-a-Mole Kids Game
 *
 * Characters pop up from holes with answer labels; tap the correct one.
 * 3x3 grid of holes, pop-up animations, bonk/squish feedback, combo multiplier,
 * and streak-based speed ramping.
 *
 * Props:
 *   config     - { content: { questions: [{ question, options: string[], correctIndex: number, concept?: string }] } }
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import {kidsColors} from '../kidsTheme';
import CanvasGameBridge from '../shared/CanvasGameBridge';
import ParticlePool from '../shared/CanvasParticles';
import {
  drawHole,
  drawText,
  drawRoundedRect,
  hitTestCircle,
} from '../shared/CanvasSprites';
import {GameSounds} from '../shared/SoundManager';

import React from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────

const GRID_COLS = 3;
const GRID_ROWS = 3;
const HOLE_COUNT = GRID_COLS * GRID_ROWS;

/** Character colors for the pop-up moles (cycles through). */
const CHARACTER_COLORS = [
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.green,
  kidsColors.purple,
  kidsColors.teal,
  kidsColors.red,
  kidsColors.yellow,
];

/** Faces drawn on characters. */
const FACES = ['^^', ':)', ':D', 'oO', ':P', '>v<', 'UwU', ':3'];

// Pop-up timing
const EMERGE_DURATION = 0.3; // seconds to rise from hole
const SINK_DURATION = 0.3; // seconds to sink back
const BASE_STAY_TIME = 3.0; // starting stay duration
const MIN_STAY_TIME = 1.5; // fastest stay duration at high streak
const STAY_RAMP_PER_STREAK = 0.15; // seconds shaved per streak

// Feedback animation durations
const BONK_DURATION = 0.35;
const SHAKE_DURATION = 0.3;
const NEXT_CYCLE_DELAY = 0.8; // pause between pop cycles

// Scoring
const BASE_POINTS = 100;

// ─── Character (Mole) State Machine ─────────────────────────────────────────

/** Possible states for a pop-up character. */
const CHAR_STATE = {
  HIDDEN: 0,
  EMERGING: 1,
  VISIBLE: 2,
  SINKING: 3,
  BONKED: 4, // correct tap squish
  SHAKING: 5, // wrong tap shake
};

/**
 * Creates a fresh character data object.
 */
function createCharacter() {
  return {
    state: CHAR_STATE.HIDDEN,
    holeIndex: -1,
    label: '',
    optionIndex: -1,
    color: CHARACTER_COLORS[0],
    face: FACES[0],
    timer: 0,
    popProgress: 0, // 0 = fully hidden, 1 = fully popped
    shakeOffset: 0,
    squishY: 1,
  };
}

// ─── WhackAMoleGame Class ────────────────────────────────────────────────────

class WhackAMoleGame {
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

    // Questions
    this.questions = config?.content?.questions ?? [];
    this.total = this.questions.length;
    this.currentIndex = 0;

    // Scoring / tracking
    this.score = 0;
    this.correct = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.results = [];

    // Canvas dimensions (set in resize, initialised via start)
    this.w = 0;
    this.h = 0;

    // Hole positions (computed in _layoutHoles)
    this.holes = []; // [{ cx, cy, radius }]

    // Active pop-up characters (up to 4 at a time)
    this.characters = [];
    for (let i = 0; i < 4; i++) {
      this.characters.push(createCharacter());
    }

    // Game phase
    this.phase = 'idle'; // 'idle' | 'popping' | 'waiting' | 'complete'
    this.cycleTimer = 0;
    this.questionStartTime = 0;
    this.answeredThisCycle = false;

    // Combo display
    this.comboText = '';
    this.comboTimer = 0;

    // Score flash
    this.scoreFlash = 0;

    // Particles
    this.particles = new ParticlePool();

    // Completed flag
    this.completed = false;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this._layoutHoles();
    this._startCycle();
  }

  destroy() {
    this.particles.reset();
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this._layoutHoles();
  }

  // ── Layout ───────────────────────────────────────────────────────────────

  _layoutHoles() {
    this.holes = [];
    if (this.w === 0 || this.h === 0) return;

    // Reserve top area for question text (~18% of height)
    const topMargin = this.h * 0.18;
    const bottomMargin = this.h * 0.04;
    const gridH = this.h - topMargin - bottomMargin;
    const gridW = this.w;

    const cellW = gridW / GRID_COLS;
    const cellH = gridH / GRID_ROWS;
    const radius = Math.min(cellW, cellH) * 0.28;

    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const cx = cellW * (col + 0.5);
        const cy = topMargin + cellH * (row + 0.5);
        this.holes.push({cx, cy, radius});
      }
    }
  }

  // ── Cycle Management ─────────────────────────────────────────────────────

  _getStayTime() {
    const reduction = this.streak * STAY_RAMP_PER_STREAK;
    return Math.max(MIN_STAY_TIME, BASE_STAY_TIME - reduction);
  }

  _startCycle() {
    if (this.currentIndex >= this.total) {
      this._finishGame();
      return;
    }

    const q = this.questions[this.currentIndex];
    const options = q.options ?? [];
    const numChars = Math.min(options.length, 4);

    // Pick random unique hole indices for characters
    const usedHoles = new Set();
    const holeIndices = [];
    while (holeIndices.length < numChars && holeIndices.length < HOLE_COUNT) {
      const idx = Math.floor(Math.random() * HOLE_COUNT);
      if (!usedHoles.has(idx)) {
        usedHoles.add(idx);
        holeIndices.push(idx);
      }
    }

    // Assign characters
    for (let i = 0; i < this.characters.length; i++) {
      const ch = this.characters[i];
      if (i < numChars) {
        ch.state = CHAR_STATE.EMERGING;
        ch.holeIndex = holeIndices[i];
        ch.label = options[i];
        ch.optionIndex = i;
        ch.color = CHARACTER_COLORS[i % CHARACTER_COLORS.length];
        ch.face = FACES[i % FACES.length];
        ch.timer = 0;
        ch.popProgress = 0;
        ch.shakeOffset = 0;
        ch.squishY = 1;
      } else {
        ch.state = CHAR_STATE.HIDDEN;
        ch.holeIndex = -1;
      }
    }

    this.phase = 'popping';
    this.answeredThisCycle = false;
    this.questionStartTime = performance.now();
  }

  _finishGame() {
    if (this.completed) return;
    this.completed = true;
    this.phase = 'complete';

    const isPerfect = this.correct === this.total;
    GameSounds.complete(isPerfect);

    if (this.onComplete) {
      this.onComplete({
        score: this.score,
        correct: this.correct,
        total: this.total,
        results: this.results,
        bestStreak: this.bestStreak,
      });
    }
  }

  // ── Update ───────────────────────────────────────────────────────────────

  update(dt) {
    if (this.phase === 'complete') {
      this.particles.update(dt);
      return;
    }

    // Update particles
    this.particles.update(dt);

    // Update combo timer
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer < 0) this.comboTimer = 0;
    }

    // Update score flash
    if (this.scoreFlash > 0) {
      this.scoreFlash -= dt;
      if (this.scoreFlash < 0) this.scoreFlash = 0;
    }

    // Waiting phase delay between cycles
    if (this.phase === 'waiting') {
      this.cycleTimer -= dt;
      if (this.cycleTimer <= 0) {
        this._startCycle();
      }
      return;
    }

    if (this.phase !== 'popping') return;

    const stayTime = this._getStayTime();
    let allDone = true;

    for (let i = 0; i < this.characters.length; i++) {
      const ch = this.characters[i];

      switch (ch.state) {
        case CHAR_STATE.EMERGING:
          ch.timer += dt;
          ch.popProgress = Math.min(1, ch.timer / EMERGE_DURATION);
          if (ch.popProgress >= 1) {
            ch.state = CHAR_STATE.VISIBLE;
            ch.timer = 0;
          }
          allDone = false;
          break;

        case CHAR_STATE.VISIBLE:
          ch.timer += dt;
          if (ch.timer >= stayTime) {
            ch.state = CHAR_STATE.SINKING;
            ch.timer = 0;
          }
          allDone = false;
          break;

        case CHAR_STATE.SINKING:
          ch.timer += dt;
          ch.popProgress = Math.max(0, 1 - ch.timer / SINK_DURATION);
          if (ch.popProgress <= 0) {
            ch.state = CHAR_STATE.HIDDEN;
          }
          allDone = false;
          break;

        case CHAR_STATE.BONKED:
          ch.timer += dt;
          // Squish animation: quick compress then bounce back
          const bonkT = ch.timer / BONK_DURATION;
          if (bonkT < 0.3) {
            ch.squishY = 1 - 0.4 * (bonkT / 0.3);
          } else if (bonkT < 0.6) {
            ch.squishY = 0.6 + 0.5 * ((bonkT - 0.3) / 0.3);
          } else {
            ch.squishY = 1.1 - 0.1 * ((bonkT - 0.6) / 0.4);
          }
          if (ch.timer >= BONK_DURATION) {
            ch.state = CHAR_STATE.SINKING;
            ch.timer = 0;
            ch.squishY = 1;
          }
          allDone = false;
          break;

        case CHAR_STATE.SHAKING:
          ch.timer += dt;
          ch.shakeOffset =
            Math.sin(ch.timer * 40) * 4 * (1 - ch.timer / SHAKE_DURATION);
          if (ch.timer >= SHAKE_DURATION) {
            ch.shakeOffset = 0;
            ch.state = CHAR_STATE.VISIBLE;
            ch.timer = 0;
          }
          allDone = false;
          break;

        case CHAR_STATE.HIDDEN:
          // do nothing
          break;

        default:
          break;
      }
    }

    // If all characters are now hidden, advance to next question
    if (allDone && this.phase === 'popping') {
      if (!this.answeredThisCycle) {
        // Missed -- no tap happened; reset streak
        this.streak = 0;
      }
      this.currentIndex++;
      this.phase = 'waiting';
      this.cycleTimer = NEXT_CYCLE_DELAY;
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  render() {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;

    if (w === 0 || h === 0) return;

    // --- Background ---
    ctx.save();
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#F0F7FF');
    bgGrad.addColorStop(0.5, '#FFF9E6');
    bgGrad.addColorStop(1, '#FFF0F3');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // --- Draw grass-like ground stripe behind holes ---
    const topMargin = h * 0.18;
    ctx.fillStyle = '#E8F5E9';
    drawRoundedRect(ctx, 0, topMargin - 4, w, h - topMargin + 4, 0, '#E8F5E9');

    // --- Question text area ---
    this._renderQuestionBar(ctx, w, h);

    // --- Score (top-right) ---
    this._renderScore(ctx, w);

    // --- Question counter (top-left) ---
    this._renderCounter(ctx);

    // --- Draw holes ---
    for (let i = 0; i < this.holes.length; i++) {
      const hole = this.holes[i];
      drawHole(ctx, hole.cx, hole.cy, hole.radius);
    }

    // --- Draw characters ---
    for (let i = 0; i < this.characters.length; i++) {
      const ch = this.characters[i];
      if (ch.state === CHAR_STATE.HIDDEN || ch.holeIndex < 0) continue;
      this._renderCharacter(ctx, ch);
    }

    // --- Combo multiplier ---
    if (this.comboTimer > 0 && this.streak >= 2) {
      this._renderCombo(ctx, w, h);
    }

    // --- Particles ---
    this.particles.render(ctx);

    // --- Completion overlay ---
    if (this.phase === 'complete') {
      this._renderComplete(ctx, w, h);
    }

    ctx.restore();
  }

  _renderQuestionBar(ctx, w, h) {
    const barH = h * 0.14;
    const barY = h * 0.02;

    // Semi-transparent bar
    drawRoundedRect(
      ctx,
      w * 0.05,
      barY,
      w * 0.9,
      barH,
      14,
      'rgba(255,255,255,0.85)'
    );

    // Question text
    if (this.currentIndex < this.total) {
      const q = this.questions[this.currentIndex];
      const fontSize = Math.min(18, w * 0.04);
      drawText(ctx, q.question, w / 2, barY + barH / 2, {
        fontSize,
        fontWeight: 'bold',
        color: this.colors.textPrimary || kidsColors.textPrimary,
        align: 'center',
        baseline: 'middle',
      });
    } else if (this.phase === 'complete') {
      const fontSize = Math.min(20, w * 0.045);
      drawText(ctx, 'Great job!', w / 2, barY + barH / 2, {
        fontSize,
        fontWeight: 'bold',
        color: kidsColors.correct,
        align: 'center',
        baseline: 'middle',
      });
    }
  }

  _renderScore(ctx, w) {
    const fontSize = Math.min(16, w * 0.035);
    const flashScale =
      this.scoreFlash > 0 ? 1 + 0.2 * (this.scoreFlash / 0.4) : 1;

    ctx.save();
    const sx = w - w * 0.06;
    const sy = w * 0.02 + fontSize * 0.5;
    ctx.translate(sx, sy);
    ctx.scale(flashScale, flashScale);
    drawText(ctx, `${this.score}`, 0, 0, {
      fontSize,
      fontWeight: 'bold',
      color: kidsColors.star,
      align: 'right',
      baseline: 'middle',
    });
    ctx.restore();

    // Star icon next to score
    drawText(
      ctx,
      '\u2605',
      w - w * 0.065 - fontSize * 1.2,
      w * 0.02 + fontSize * 0.5,
      {
        fontSize: fontSize * 0.9,
        fontWeight: 'normal',
        color: kidsColors.star,
        align: 'center',
        baseline: 'middle',
      }
    );
  }

  _renderCounter(ctx) {
    const fontSize = Math.min(14, this.w * 0.03);
    const display = `${Math.min(this.currentIndex + 1, this.total)}/${this.total}`;
    drawText(ctx, display, this.w * 0.06, this.w * 0.02 + fontSize * 0.5, {
      fontSize,
      fontWeight: '600',
      color: kidsColors.textSecondary,
      align: 'left',
      baseline: 'middle',
    });
  }

  _renderCharacter(ctx, ch) {
    const hole = this.holes[ch.holeIndex];
    if (!hole) return;

    const {cx, cy, radius} = hole;
    const popOffset = (1 - ch.popProgress) * radius * 2;

    // Character body: a colored circle that rises from the hole
    const charRadius = radius * 0.85;
    const charCy = cy - charRadius * 0.5 - popOffset * 0.5;

    ctx.save();

    // Clip to a region above the hole so the character appears to emerge
    ctx.beginPath();
    ctx.rect(cx - radius * 1.6, cy - radius * 4, radius * 3.2, radius * 4);
    ctx.clip();

    // Apply shake offset
    const shakeX = ch.shakeOffset || 0;

    // Apply squish for bonk animation
    const squishY = ch.squishY || 1;

    ctx.translate(cx + shakeX, charCy);
    ctx.scale(1, squishY);

    // Body circle
    ctx.beginPath();
    ctx.arc(0, 0, charRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = ch.color;
    ctx.fill();

    // Darker outline
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Highlight / shine
    ctx.beginPath();
    ctx.arc(
      -charRadius * 0.25,
      -charRadius * 0.3,
      charRadius * 0.25,
      0,
      Math.PI * 2
    );
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();

    // Face
    const faceSize = Math.min(14, charRadius * 0.55);
    drawText(ctx, ch.face, 0, -charRadius * 0.05, {
      fontSize: faceSize,
      fontWeight: 'bold',
      color: '#FFFFFF',
      align: 'center',
      baseline: 'middle',
    });

    // Label below the character body
    const labelSize = Math.min(13, charRadius * 0.5);
    const labelY = charRadius + labelSize * 0.6;

    // Label background pill
    ctx.save();
    ctx.scale(1, 1 / squishY); // counter-scale so text is not squished
    const labelW = Math.max(
      charRadius * 1.8,
      ctx.measureText(ch.label).width + 12
    );
    const labelH = labelSize + 8;
    drawRoundedRect(
      ctx,
      -labelW / 2,
      labelY - labelH / 2,
      labelW,
      labelH,
      labelH / 2,
      'rgba(255,255,255,0.92)',
      null,
      0
    );
    drawText(ctx, ch.label, 0, labelY, {
      fontSize: labelSize,
      fontWeight: 'bold',
      color: kidsColors.textPrimary,
      align: 'center',
      baseline: 'middle',
    });
    ctx.restore();

    ctx.restore();
  }

  _renderCombo(ctx, w, h) {
    const alpha = Math.min(1, this.comboTimer / 0.3);
    const fontSize = Math.min(24, w * 0.055);
    const text = `${this.streak}x Combo!`;

    ctx.save();
    ctx.globalAlpha = alpha;

    const comboY = h * 0.92;
    // Glow background
    drawRoundedRect(
      ctx,
      w * 0.25,
      comboY - fontSize * 0.8,
      w * 0.5,
      fontSize * 1.8,
      fontSize,
      'rgba(255, 165, 0, 0.18)'
    );
    drawText(ctx, text, w / 2, comboY, {
      fontSize,
      fontWeight: 'bold',
      color: kidsColors.streak,
      align: 'center',
      baseline: 'middle',
    });
    ctx.restore();
  }

  _renderComplete(ctx, w, h) {
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillRect(0, 0, w, h);

    const centerY = h * 0.4;
    const titleSize = Math.min(28, w * 0.06);
    const subtitleSize = Math.min(18, w * 0.04);
    const detailSize = Math.min(15, w * 0.033);

    drawText(ctx, 'Well Done!', w / 2, centerY, {
      fontSize: titleSize,
      fontWeight: 'bold',
      color: kidsColors.primary,
      align: 'center',
      baseline: 'middle',
    });

    drawText(ctx, `Score: ${this.score}`, w / 2, centerY + titleSize * 1.6, {
      fontSize: subtitleSize,
      fontWeight: 'bold',
      color: kidsColors.star,
      align: 'center',
      baseline: 'middle',
    });

    drawText(
      ctx,
      `${this.correct} / ${this.total} correct`,
      w / 2,
      centerY + titleSize * 1.6 + subtitleSize * 1.8,
      {
        fontSize: detailSize,
        fontWeight: '600',
        color: kidsColors.textSecondary,
        align: 'center',
        baseline: 'middle',
      }
    );

    if (this.bestStreak >= 2) {
      drawText(
        ctx,
        `Best streak: ${this.bestStreak}`,
        w / 2,
        centerY + titleSize * 1.6 + subtitleSize * 1.8 + detailSize * 1.8,
        {
          fontSize: detailSize,
          fontWeight: '600',
          color: kidsColors.streak,
          align: 'center',
          baseline: 'middle',
        }
      );
    }
  }

  // ── Pointer Events ───────────────────────────────────────────────────────

  onPointerDown(x, y) {
    if (this.phase !== 'popping') return;
    if (this.answeredThisCycle) return;

    // Check each visible character for a hit
    for (let i = 0; i < this.characters.length; i++) {
      const ch = this.characters[i];
      if (ch.state !== CHAR_STATE.VISIBLE && ch.state !== CHAR_STATE.EMERGING) {
        continue;
      }
      if (ch.holeIndex < 0) continue;

      const hole = this.holes[ch.holeIndex];
      if (!hole) continue;

      // Hit test: check against the character's visible position
      const popOffset = (1 - ch.popProgress) * hole.radius * 2;
      const charCy = hole.cy - hole.radius * 0.85 * 0.5 - popOffset * 0.5;
      const charRadius = hole.radius * 0.85;

      // Generous hit radius for kids
      const hitRadius = charRadius * 1.3;

      if (hitTestCircle(x, y, hole.cx, charCy, hitRadius)) {
        this._handleTap(ch, i);
        return;
      }
    }
  }

  onPointerMove() {
    // Not used for whack-a-mole
  }

  onPointerUp() {
    // Not used for whack-a-mole
  }

  // ── Tap Handling ─────────────────────────────────────────────────────────

  _handleTap(ch, charIndex) {
    const q = this.questions[this.currentIndex];
    if (!q) return;

    const isCorrect = ch.optionIndex === q.correctIndex;
    const responseTimeMs = performance.now() - this.questionStartTime;
    const concept = q.concept || '';

    if (isCorrect) {
      // --- Correct answer ---
      this.answeredThisCycle = true;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.correct++;

      // Combo-based scoring
      const multiplier = Math.min(this.streak, 5);
      const points = BASE_POINTS * multiplier;
      this.score += points;
      this.scoreFlash = 0.4;

      // Combo display
      if (this.streak >= 2) {
        this.comboText = `${this.streak}x Combo!`;
        this.comboTimer = 1.5;
      }

      // Bonk animation
      ch.state = CHAR_STATE.BONKED;
      ch.timer = 0;
      ch.squishY = 1;

      // Sound & particles
      GameSounds.enemyDefeat();

      const hole = this.holes[ch.holeIndex];
      if (hole) {
        const popOffset = (1 - ch.popProgress) * hole.radius * 2;
        const charCy = hole.cy - hole.radius * 0.85 * 0.5 - popOffset * 0.5;
        const preset = ParticlePool.sparkleBurst(hole.cx, charCy, 18);
        this.particles.emitPreset(preset);
      }

      // Streak sound milestones
      if (this.streak === 3 || this.streak === 5 || this.streak === 10) {
        GameSounds.streak(this.streak);
      }

      // Start sinking other characters immediately
      for (let j = 0; j < this.characters.length; j++) {
        if (j === charIndex) continue;
        const other = this.characters[j];
        if (
          other.state === CHAR_STATE.VISIBLE ||
          other.state === CHAR_STATE.EMERGING
        ) {
          other.state = CHAR_STATE.SINKING;
          other.timer = 0;
        }
      }

      // Record result
      this.results.push({
        question: q.question,
        answered: ch.label,
        correct: q.options[q.correctIndex],
        isCorrect: true,
        concept,
        responseTimeMs,
      });

      if (this.onAnswer) {
        this.onAnswer(true, concept, responseTimeMs);
      }
    } else {
      // --- Wrong answer ---
      this.streak = 0;

      // Shake animation
      ch.state = CHAR_STATE.SHAKING;
      ch.timer = 0;
      ch.shakeOffset = 0;

      GameSounds.wrong();

      // Record result
      this.results.push({
        question: q.question,
        answered: ch.label,
        correct: q.options[q.correctIndex],
        isCorrect: false,
        concept,
        responseTimeMs,
      });

      if (this.onAnswer) {
        this.onAnswer(false, concept, responseTimeMs);
      }
    }
  }
}

// ─── React Wrapper ───────────────────────────────────────────────────────────

export default function WhackAMoleTemplate({config, onAnswer, onComplete}) {
  return (
    <CanvasGameBridge
      GameClass={WhackAMoleGame}
      config={config}
      onAnswer={onAnswer}
      onComplete={onComplete}
      aspectRatio={1}
    />
  );
}
