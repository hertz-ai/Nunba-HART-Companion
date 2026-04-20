/**
 * FlappyLearnerTemplate - Canvas-based Flappy Bird Learning Game
 *
 * A flappy-bird-style game where the player taps to flap a bird upward and
 * flies through answer gates. Each gate presents two openings labelled with
 * answer options; flying through the correct gate scores a point, while the
 * wrong gate (or hitting the wall) costs a life.
 *
 * Props:
 *   config     - { content: { questions: [{ question, options: string[], correctIndex, concept? }] } }
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import {kidsColors} from '../kidsTheme';
import CanvasGameBridge from '../shared/CanvasGameBridge';
import ParticlePool from '../shared/CanvasParticles';
import {
  drawRoundedRect,
  drawText,
  drawCircle,
  hitTestRect,
} from '../shared/CanvasSprites';
import {GameSounds} from '../shared/SoundManager';

import React from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BIRD_RADIUS = 20;
const GRAVITY = 600; // px/s^2
const FLAP_VELOCITY = -250; // px/s (upward)
const BASE_SCROLL_SPEED = 100; // px/s
const SPEED_INCREMENT = 8; // additional px/s per question
const GATE_GAP = 120; // vertical gap per opening
const GATE_WIDTH = 100; // horizontal width of gate columns
const GATE_WALL_THICKNESS = 18;
const MAX_LIVES = 3;
const FLASH_DURATION = 0.6; // seconds the bird flashes red after a hit
const BG_LINE_COUNT = 6; // parallax background decoration lines
const QUESTION_APPROACH_X = 0.65; // show question when gate x < this fraction of canvas width
const GATE_SPACING_MIN = 280; // minimum horizontal gap between gates

// ---------------------------------------------------------------------------
// FlappyGame - the canvas game class consumed by CanvasGameBridge
// ---------------------------------------------------------------------------

class FlappyGame {
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

    const questions = config?.content?.questions ?? [];
    this.questions = questions;
    this.totalQuestions = questions.length;

    // Dimensions (CSS pixels; DPI handled by bridge)
    this.w = canvas.style.width ? parseFloat(canvas.style.width) : canvas.width;
    this.h = canvas.style.height
      ? parseFloat(canvas.style.height)
      : canvas.height;

    // State
    this.score = 0;
    this.lives = MAX_LIVES;
    this.currentQuestion = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.results = [];
    this.questionStartTime = 0;
    this.finished = false;
    this.started = false; // waiting for first tap
    this.waitingForGate = false;

    // Bird
    this.birdX = this.w * 0.25;
    this.birdY = this.h * 0.5;
    this.birdVy = 0;
    this.birdFlashTimer = 0; // >0 means bird is flashing red
    this.birdAngle = 0;

    // Gates
    this.gates = [];
    this.scrollSpeed = BASE_SCROLL_SPEED;

    // Parallax background lines
    this.bgLines = [];
    for (let i = 0; i < BG_LINE_COUNT; i++) {
      this.bgLines.push({
        x: Math.random() * this.w,
        y: (this.h / BG_LINE_COUNT) * i + Math.random() * 30,
        speed: 20 + Math.random() * 30,
        length: 40 + Math.random() * 80,
        alpha: 0.06 + Math.random() * 0.08,
      });
    }

    // Particles
    this.particles = new ParticlePool();

    // Invulnerability timer to prevent double-hits on the same gate
    this.invulnTimer = 0;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start() {
    this.started = false;
    this.questionStartTime = performance.now();
    this._spawnNextGate();
    GameSounds.intro();
  }

  destroy() {
    // nothing to tear down
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.birdX = w * 0.25;
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  onPointerDown(_x, _y) {
    if (this.finished) return;
    if (!this.started) {
      this.started = true;
    }
    this.birdVy = FLAP_VELOCITY;
    GameSounds.tap();
  }

  onPointerMove() {}
  onPointerUp() {}

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt) {
    if (this.finished) return;
    if (!this.started) return; // idle; bird bobs gently

    // Decrease timers
    if (this.birdFlashTimer > 0) this.birdFlashTimer -= dt;
    if (this.invulnTimer > 0) this.invulnTimer -= dt;

    // --- Bird physics ---
    this.birdVy += GRAVITY * dt;
    this.birdY += this.birdVy * dt;

    // Clamp to canvas bounds
    if (this.birdY - BIRD_RADIUS < 0) {
      this.birdY = BIRD_RADIUS;
      this.birdVy = 0;
    }
    if (this.birdY + BIRD_RADIUS > this.h) {
      this.birdY = this.h - BIRD_RADIUS;
      this.birdVy = 0;
    }

    // Bird tilt based on velocity
    this.birdAngle = Math.max(-0.4, Math.min(0.6, this.birdVy / 400));

    // --- Scroll gates ---
    this.scrollSpeed =
      BASE_SCROLL_SPEED + this.currentQuestion * SPEED_INCREMENT;

    for (let i = this.gates.length - 1; i >= 0; i--) {
      const gate = this.gates[i];
      gate.x -= this.scrollSpeed * dt;

      // Remove gates that have scrolled off screen
      if (gate.x + GATE_WIDTH < 0) {
        this.gates.splice(i, 1);
        continue;
      }

      // Collision / pass-through detection
      if (!gate.resolved && this.invulnTimer <= 0) {
        this._checkGateCollision(gate);
      }
    }

    // --- Parallax background ---
    for (const line of this.bgLines) {
      line.x -= line.speed * dt;
      if (line.x + line.length < 0) {
        line.x = this.w + Math.random() * 60;
        line.y = Math.random() * this.h;
      }
    }

    // --- Particles ---
    this.particles.update(dt);

    // --- Check game over ---
    if (this.lives <= 0 || this.currentQuestion >= this.totalQuestions) {
      this._endGame();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;

    // --- Sky gradient background ---
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#EDF7FF');
    skyGrad.addColorStop(1, '#D6EAF8');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // --- Parallax lines ---
    for (const line of this.bgLines) {
      ctx.save();
      ctx.globalAlpha = line.alpha;
      ctx.strokeStyle = this.colors.primaryLight || '#A29BFE';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(line.x, line.y);
      ctx.lineTo(line.x + line.length, line.y);
      ctx.stroke();
      ctx.restore();
    }

    // --- Ground strip ---
    ctx.fillStyle = '#B8E6B8';
    ctx.fillRect(0, h - 20, w, 20);
    ctx.fillStyle = '#A0D8A0';
    ctx.fillRect(0, h - 20, w, 4);

    // --- Gates ---
    for (const gate of this.gates) {
      this._drawGate(ctx, gate);
    }

    // --- Question text ---
    for (const gate of this.gates) {
      if (!gate.resolved && gate.x < w * QUESTION_APPROACH_X) {
        const q = this.questions[gate.questionIndex];
        if (q) {
          drawText(ctx, q.question, w / 2, 40, {
            fontSize: 16,
            fontWeight: 'bold',
            color: this.colors.textPrimary || '#2C3E50',
            align: 'center',
            baseline: 'middle',
          });
        }
      }
    }

    // --- Bird ---
    this._drawBird(ctx);

    // --- Particles ---
    this.particles.render(ctx);

    // --- HUD: score (top-left) ---
    drawText(ctx, `Score: ${this.score}`, 16, 22, {
      fontSize: 18,
      fontWeight: 'bold',
      color: this.colors.primary || '#6C5CE7',
      align: 'left',
      baseline: 'middle',
    });

    // --- HUD: lives as hearts (top-right) ---
    for (let i = 0; i < MAX_LIVES; i++) {
      const heartX = w - 30 - i * 28;
      const heartY = 22;
      this._drawHeart(ctx, heartX, heartY, 10, i < this.lives);
    }

    // --- "Tap to start" prompt ---
    if (!this.started && !this.finished) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(0, h * 0.35, w, h * 0.3);
      drawText(ctx, 'Tap to Flap!', w / 2, h / 2, {
        fontSize: 24,
        fontWeight: 'bold',
        color: this.colors.primary || '#6C5CE7',
        align: 'center',
        baseline: 'middle',
      });
      ctx.restore();
    }

    // --- Game over overlay ---
    if (this.finished) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, w, h);

      const boxW = Math.min(w * 0.8, 280);
      const boxH = 120;
      const boxX = (w - boxW) / 2;
      const boxY = (h - boxH) / 2;
      drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 16, '#FFFFFF');

      drawText(
        ctx,
        this.lives <= 0 ? 'Game Over' : 'Well Done!',
        w / 2,
        boxY + 35,
        {
          fontSize: 22,
          fontWeight: 'bold',
          color: this.colors.textPrimary || '#2C3E50',
          align: 'center',
          baseline: 'middle',
        }
      );

      drawText(
        ctx,
        `Score: ${this.score} / ${this.totalQuestions}`,
        w / 2,
        boxY + 70,
        {
          fontSize: 16,
          fontWeight: '600',
          color: this.colors.textSecondary || '#7F8C8D',
          align: 'center',
          baseline: 'middle',
        }
      );

      ctx.restore();
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Spawn a gate for the current question.
   */
  _spawnNextGate() {
    if (this.currentQuestion >= this.totalQuestions) return;

    const q = this.questions[this.currentQuestion];
    if (!q || !q.options || q.options.length < 2) return;

    // Pick two options: correct and one random wrong
    const correctIdx = q.correctIndex ?? 0;
    const wrongIndices = q.options
      .map((_, i) => i)
      .filter((i) => i !== correctIdx);
    const wrongIdx =
      wrongIndices[Math.floor(Math.random() * wrongIndices.length)];

    // Randomly assign top/bottom
    const correctOnTop = Math.random() < 0.5;
    const topLabel = correctOnTop ? q.options[correctIdx] : q.options[wrongIdx];
    const bottomLabel = correctOnTop
      ? q.options[wrongIdx]
      : q.options[correctIdx];
    const topCorrect = correctOnTop;

    // Vertical layout:
    //   The two openings sit in the middle of the canvas.
    //   A divider wall separates them.
    const centerY = this.h / 2;
    const halfStack = GATE_GAP + GATE_WALL_THICKNESS / 2;

    // Top opening: from (centerY - halfStack - GATE_GAP) to (centerY - halfStack)
    const topOpenY = centerY - halfStack - GATE_GAP;
    // Bottom opening: from (centerY + GATE_WALL_THICKNESS/2) to (centerY + halfStack + GATE_GAP ...)
    const bottomOpenY = centerY + GATE_WALL_THICKNESS / 2;

    this.gates.push({
      x: this.w + 60,
      questionIndex: this.currentQuestion,
      topLabel,
      bottomLabel,
      topCorrect,
      resolved: false,
      // Cached vertical regions for collision
      topOpenY,
      topOpenBottom: topOpenY + GATE_GAP,
      bottomOpenY,
      bottomOpenBottom: bottomOpenY + GATE_GAP,
      dividerY: centerY - GATE_WALL_THICKNESS / 2,
    });
  }

  /**
   * Check if the bird passes through or collides with a gate.
   */
  _checkGateCollision(gate) {
    const bx = this.birdX;
    const by = this.birdY;
    const r = BIRD_RADIUS;

    // Only check when bird's horizontal extent overlaps the gate
    if (bx + r < gate.x || bx - r > gate.x + GATE_WIDTH) return;

    // Determine which opening the bird center is in
    const inTopOpening =
      by - r >= gate.topOpenY && by + r <= gate.topOpenBottom;
    const inBottomOpening =
      by - r >= gate.bottomOpenY && by + r <= gate.bottomOpenBottom;

    if (inTopOpening || inBottomOpening) {
      // Bird is cleanly inside one of the openings -- check correctness
      const correct = inTopOpening ? gate.topCorrect : !gate.topCorrect;
      this._resolveGate(gate, correct);
    } else if (bx + r >= gate.x && bx - r <= gate.x + GATE_WIDTH) {
      // Bird overlaps the gate column but is NOT in an opening -- wall hit
      // Only trigger if bird center is within the gate horizontal band
      if (bx >= gate.x - r && bx <= gate.x + GATE_WIDTH + r) {
        this._resolveGate(gate, false);
      }
    }
  }

  /**
   * Resolve a gate interaction (correct or wrong).
   */
  _resolveGate(gate, correct) {
    gate.resolved = true;
    const q = this.questions[gate.questionIndex];
    const concept = q?.concept ?? '';
    const elapsed = performance.now() - this.questionStartTime;

    if (correct) {
      this.score++;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      GameSounds.gatePass();

      // Sparkle burst at bird position
      if (!this.reducedMotion) {
        const preset = ParticlePool.sparkleBurst(this.birdX, this.birdY, 15);
        this.particles.emitPreset(preset);
      }
    } else {
      this.lives--;
      this.streak = 0;
      this.birdFlashTimer = FLASH_DURATION;
      this.invulnTimer = 0.5;
      GameSounds.wrong();
    }

    // Record result
    this.results.push({
      questionIndex: gate.questionIndex,
      isCorrect: correct,
      concept,
      responseTimeMs: elapsed,
    });

    if (this.onAnswer) {
      this.onAnswer(correct, concept, elapsed);
    }

    // Advance to next question
    this.currentQuestion++;
    this.questionStartTime = performance.now();

    // Spawn next gate after a short delay (distance-based via position)
    if (this.currentQuestion < this.totalQuestions && this.lives > 0) {
      this._spawnNextGate();
    }
  }

  /**
   * End the game and fire onComplete.
   */
  _endGame() {
    if (this.finished) return;
    this.finished = true;

    const isPerfect =
      this.score === this.totalQuestions && this.lives === MAX_LIVES;
    GameSounds.complete(isPerfect);

    if (!this.reducedMotion) {
      const preset = ParticlePool.confettiBurst(this.w / 2, this.h / 3, 25);
      this.particles.emitPreset(preset);
    }

    // Small delay before calling onComplete so the player can see the result
    setTimeout(() => {
      if (this.onComplete) {
        this.onComplete({
          score: this.score,
          correct: this.score,
          total: this.totalQuestions,
          results: this.results,
          bestStreak: this.bestStreak,
        });
      }
    }, 1800);
  }

  // ── Drawing helpers ───────────────────────────────────────────────────────

  /**
   * Draw the bird: a colored circle with a small triangle beak.
   */
  _drawBird(ctx) {
    const x = this.birdX;
    const y = this.birdY;
    const r = BIRD_RADIUS;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.birdAngle);

    // Flashing red when hit
    const isFlashing = this.birdFlashTimer > 0;
    const flashOn =
      isFlashing && Math.floor(this.birdFlashTimer * 10) % 2 === 0;

    // Body
    const bodyColor = flashOn
      ? this.colors.incorrect || '#E74C3C'
      : this.colors.orange || '#FF6B35';
    drawCircle(ctx, 0, 0, r, bodyColor, '#FFFFFF', 2);

    // Eye
    drawCircle(ctx, r * 0.25, -r * 0.2, 4, '#FFFFFF');
    drawCircle(ctx, r * 0.3, -r * 0.22, 2, '#2C3E50');

    // Beak (small triangle pointing right)
    ctx.beginPath();
    ctx.moveTo(r * 0.7, -4);
    ctx.lineTo(r + 10, 0);
    ctx.lineTo(r * 0.7, 4);
    ctx.closePath();
    ctx.fillStyle = this.colors.yellow || '#FDCB6E';
    ctx.fill();

    // Wing (small arc on the side)
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, r * 0.1, r * 0.55, r * 0.3, -0.3, 0, Math.PI);
    ctx.fillStyle = flashOn
      ? this.colors.red || '#E74C3C'
      : this.colors.accentLight || '#FF8A5C';
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draw a gate with two openings and labels.
   */
  _drawGate(ctx, gate) {
    const gx = gate.x;
    const gw = GATE_WIDTH;

    // Color for gate walls
    const wallColor = this.colors.primaryLight || '#A29BFE';
    const wallColorDark = this.colors.primary || '#6C5CE7';

    // --- Top wall (above top opening) ---
    const topWallH = Math.max(0, gate.topOpenY);
    if (topWallH > 0) {
      drawRoundedRect(ctx, gx, 0, gw, topWallH, 0, wallColor, wallColorDark, 2);
    }

    // --- Divider wall (between openings) ---
    const divH = GATE_WALL_THICKNESS;
    drawRoundedRect(
      ctx,
      gx,
      gate.dividerY,
      gw,
      divH,
      0,
      wallColor,
      wallColorDark,
      2
    );

    // --- Bottom wall (below bottom opening) ---
    const bottomWallTop = gate.bottomOpenBottom;
    const bottomWallH = Math.max(0, this.h - bottomWallTop);
    if (bottomWallH > 0) {
      drawRoundedRect(
        ctx,
        gx,
        bottomWallTop,
        gw,
        bottomWallH,
        0,
        wallColor,
        wallColorDark,
        2
      );
    }

    // --- Labels inside openings ---
    const labelFontSize = 13;
    const labelColor = gate.resolved
      ? this.colors.textMuted || '#B2BEC3'
      : this.colors.textPrimary || '#2C3E50';

    // Determine background tint for openings
    let topBg = null;
    let bottomBg = null;
    if (gate.resolved) {
      topBg = gate.topCorrect
        ? 'rgba(46,204,113,0.15)'
        : 'rgba(231,76,60,0.12)';
      bottomBg = gate.topCorrect
        ? 'rgba(231,76,60,0.12)'
        : 'rgba(46,204,113,0.15)';
    }

    // Top opening background
    if (topBg) {
      ctx.fillStyle = topBg;
      ctx.fillRect(gx, gate.topOpenY, gw, GATE_GAP);
    }
    // Bottom opening background
    if (bottomBg) {
      ctx.fillStyle = bottomBg;
      ctx.fillRect(gx, gate.bottomOpenY, gw, GATE_GAP);
    }

    // Top opening label
    const topLabelY = gate.topOpenY + GATE_GAP / 2;
    this._drawWrappedLabel(
      ctx,
      gate.topLabel,
      gx + gw / 2,
      topLabelY,
      gw - 10,
      labelFontSize,
      labelColor
    );

    // Bottom opening label
    const bottomLabelY = gate.bottomOpenY + GATE_GAP / 2;
    this._drawWrappedLabel(
      ctx,
      gate.bottomLabel,
      gx + gw / 2,
      bottomLabelY,
      gw - 10,
      labelFontSize,
      labelColor
    );
  }

  /**
   * Draw text that wraps within a maximum width, centered at (x, y).
   */
  _drawWrappedLabel(ctx, text, x, y, maxWidth, fontSize, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `bold ${fontSize}px "Nunito", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Simple truncation if text is too long
    const measured = ctx.measureText(text);
    if (measured.width <= maxWidth) {
      ctx.fillText(text, x, y);
    } else {
      // Shrink font to fit
      const scale = maxWidth / measured.width;
      const smallerSize = Math.max(9, Math.floor(fontSize * scale));
      ctx.font = `bold ${smallerSize}px "Nunito", sans-serif`;
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  }

  /**
   * Draw a heart shape (filled or empty) for lives display.
   */
  _drawHeart(ctx, cx, cy, size, filled) {
    ctx.save();
    ctx.translate(cx, cy);

    ctx.beginPath();
    const topY = -size * 0.4;
    ctx.moveTo(0, size * 0.6);
    // Left curve
    ctx.bezierCurveTo(
      -size * 0.1,
      size * 0.3,
      -size,
      -size * 0.1,
      -size * 0.5,
      -size * 0.6
    );
    // Top center
    ctx.bezierCurveTo(-size * 0.2, -size * 0.9, 0, -size * 0.7, 0, -size * 0.3);
    ctx.bezierCurveTo(
      0,
      -size * 0.7,
      size * 0.2,
      -size * 0.9,
      size * 0.5,
      -size * 0.6
    );
    // Right curve
    ctx.bezierCurveTo(size, -size * 0.1, size * 0.1, size * 0.3, 0, size * 0.6);
    ctx.closePath();

    if (filled) {
      ctx.fillStyle = this.colors.red || '#E74C3C';
      ctx.fill();
    } else {
      ctx.strokeStyle = this.colors.starEmpty || '#E0E0E0';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// React wrapper component
// ---------------------------------------------------------------------------

export default function FlappyLearnerTemplate({config, onAnswer, onComplete}) {
  return (
    <CanvasGameBridge
      GameClass={FlappyGame}
      config={config}
      onAnswer={onAnswer}
      onComplete={onComplete}
      aspectRatio={3 / 4}
    />
  );
}
