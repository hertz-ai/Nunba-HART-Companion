/**
 * BalloonPopTemplate - Canvas-based Kids Balloon Pop Game
 *
 * Balloons float up from the bottom of the screen with sinusoidal horizontal
 * sway. Each balloon carries an answer label. The child taps the correct
 * balloon to pop it (particle burst + confetti), advancing to the next
 * question. Wrong taps trigger a shake + deflate animation.
 *
 * Config shape:
 *   {
 *     content: {
 *       questions: [{
 *         question: string,
 *         options: string[],
 *         correctIndex: number,
 *         concept?: string,
 *       }]
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
import {drawBalloon, drawText, hitTestCircle} from '../shared/CanvasSprites';
import {GameSounds} from '../shared/SoundManager';

import React from 'react';

// ─── Constants ──────────────────────────────────────────────────────────────

const BALLOON_COLORS = [
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.purple,
];
const BALLOON_RADIUS = 50;
const FLOAT_SPEED_MIN = 30; // px/s
const FLOAT_SPEED_MAX = 50;
const SWAY_AMPLITUDE = 20; // px horizontal sway
const SWAY_FREQUENCY = 1.5; // oscillations per second
const STRING_LENGTH = 40;

const POP_SCALE_DURATION = 0.15; // seconds to scale up before particle burst
const POP_MAX_SCALE = 1.4;
const SHAKE_DURATION = 0.35; // seconds for wrong-answer shake
const SHAKE_MAGNITUDE = 8; // px
const DEFLATE_AMOUNT = 0.15; // fraction radius shrinks on wrong tap

const QUESTION_ADVANCE_DELAY = 1.0; // seconds before next question after correct pop
const BACKGROUND_COLOR = '#FFF9E6';
const HEADER_HEIGHT = 70; // reserved for question text / HUD

// ─── BalloonPopGame (Canvas game class) ─────────────────────────────────────

class BalloonPopGame {
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

    // Parse questions, guarding against empty / malformed config
    const raw = config?.content?.questions;
    this.questions = Array.isArray(raw)
      ? raw.filter(
          (q) =>
            q &&
            typeof q.question === 'string' &&
            Array.isArray(q.options) &&
            q.options.length > 0
        )
      : [];

    // Dimensions (CSS pixels; DPI handled by bridge)
    this.width = canvas.style.width
      ? parseFloat(canvas.style.width)
      : canvas.width;
    this.height = canvas.style.height
      ? parseFloat(canvas.style.height)
      : canvas.height;

    // Game state
    this.questionIndex = 0;
    this.score = 0;
    this.correct = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.results = [];
    this.finished = false;

    // Per-question state
    this.balloons = [];
    this.questionStartTime = 0; // set in _setupQuestion
    this.elapsedSinceStart = 0; // global timer for sway

    // Transition state
    this.transitioning = false; // true while waiting after a correct pop
    this.transitionTimer = 0;

    // Particles
    this.particles = new ParticlePool();

    // Popping state (for the scale-up animation before burst)
    this.poppingBalloon = null; // reference to balloon being popped
    this.popTimer = 0;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  start() {
    if (this.questions.length === 0) {
      // Nothing to play -- complete immediately
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
    this._setupQuestion();
  }

  destroy() {
    this.particles.reset();
    this.balloons = [];
    this.poppingBalloon = null;
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    // Reposition balloons proportionally
    this.balloons.forEach((b) => {
      b.x = Math.min(Math.max(b.x, BALLOON_RADIUS), w - BALLOON_RADIUS);
    });
  }

  // ── Question Setup ────────────────────────────────────────────────────────

  _setupQuestion() {
    const q = this.questions[this.questionIndex];
    if (!q) return;

    this.balloons = [];
    this.poppingBalloon = null;
    this.popTimer = 0;
    this.transitioning = false;
    this.transitionTimer = 0;
    this.questionStartTime = performance.now();

    const count = q.options.length;
    const usableWidth = this.width - BALLOON_RADIUS * 2;
    const spacing = count > 1 ? usableWidth / (count - 1) : 0;
    const startX = count > 1 ? BALLOON_RADIUS : this.width / 2;

    for (let i = 0; i < count; i++) {
      const speed =
        FLOAT_SPEED_MIN + Math.random() * (FLOAT_SPEED_MAX - FLOAT_SPEED_MIN);
      const phaseOffset = Math.random() * Math.PI * 2;
      const baseX = startX + i * spacing;

      this.balloons.push({
        id: i,
        label: q.options[i],
        isCorrect: i === q.correctIndex,
        color: BALLOON_COLORS[i % BALLOON_COLORS.length],
        // Position
        baseX: baseX,
        x: baseX,
        y: this.height + BALLOON_RADIUS + STRING_LENGTH + Math.random() * 60,
        // Motion
        speed: speed,
        phaseOffset: phaseOffset,
        // Visual state
        scale: 1,
        shakeTimer: 0,
        shakeOffsetX: 0,
        popped: false,
        deflateAmount: 0, // accumulates on wrong taps
        alpha: 1,
      });
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt) {
    if (this.finished) {
      // Still update particles so remaining effects fade out
      this.particles.update(dt);
      return;
    }

    this.elapsedSinceStart += dt;

    // Update particles
    this.particles.update(dt);

    // Pop animation (scale-up before burst)
    if (this.poppingBalloon) {
      this.popTimer += dt;
      const t = Math.min(this.popTimer / POP_SCALE_DURATION, 1);
      this.poppingBalloon.scale = 1 + (POP_MAX_SCALE - 1) * t;

      if (t >= 1) {
        // Fire burst
        this._burstBalloon(this.poppingBalloon);
        this.poppingBalloon.popped = true;
        this.poppingBalloon.alpha = 0;
        this.poppingBalloon = null;
        this.popTimer = 0;

        // Start transition delay
        this.transitioning = true;
        this.transitionTimer = 0;
      }
    }

    // Transition timer (pause between questions)
    if (this.transitioning) {
      this.transitionTimer += dt;
      if (this.transitionTimer >= QUESTION_ADVANCE_DELAY) {
        this.transitioning = false;
        this._advanceQuestion();
      }
    }

    // Move balloons
    for (const b of this.balloons) {
      if (b.popped) continue;

      // Float upward
      b.y -= b.speed * dt;

      // Sinusoidal horizontal sway
      const sway = this.reducedMotion
        ? 0
        : Math.sin(
            this.elapsedSinceStart * SWAY_FREQUENCY * Math.PI * 2 +
              b.phaseOffset
          ) * SWAY_AMPLITUDE;
      b.x = b.baseX + sway;

      // Shake animation (wrong answer)
      if (b.shakeTimer > 0) {
        b.shakeTimer -= dt;
        if (b.shakeTimer <= 0) {
          b.shakeTimer = 0;
          b.shakeOffsetX = 0;
        } else {
          // Rapid oscillation that decays
          const progress = b.shakeTimer / SHAKE_DURATION;
          b.shakeOffsetX =
            Math.sin(b.shakeTimer * 40) * SHAKE_MAGNITUDE * progress;
        }
      }

      // Respawn if floated off top
      if (b.y < -BALLOON_RADIUS - STRING_LENGTH - 10) {
        b.y = this.height + BALLOON_RADIUS + STRING_LENGTH + Math.random() * 40;
        // Slightly randomize horizontal base
        b.baseX =
          BALLOON_RADIUS + Math.random() * (this.width - BALLOON_RADIUS * 2);
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Draw soft gradient at bottom for depth
    const grad = ctx.createLinearGradient(0, h * 0.7, 0, h);
    grad.addColorStop(0, 'rgba(255, 249, 230, 0)');
    grad.addColorStop(1, 'rgba(253, 203, 110, 0.15)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, h * 0.7, w, h * 0.3);

    // ── HUD ──────────────────────────────────────────────────────────────

    const q = this.questions[this.questionIndex];
    const total = this.questions.length;

    // Question number (top-left)
    drawText(ctx, `Q ${this.questionIndex + 1}/${total}`, 14, 22, {
      fontSize: 14,
      fontWeight: 'bold',
      color: kidsColors.textSecondary,
      align: 'left',
      baseline: 'middle',
    });

    // Score (top-right)
    drawText(ctx, `Score: ${this.score}`, w - 14, 22, {
      fontSize: 14,
      fontWeight: 'bold',
      color: kidsColors.primary,
      align: 'right',
      baseline: 'middle',
    });

    // Streak indicator
    if (this.streak >= 2) {
      drawText(ctx, `${this.streak} streak!`, w / 2, 22, {
        fontSize: 13,
        fontWeight: 'bold',
        color: kidsColors.streakFire,
        align: 'center',
        baseline: 'middle',
      });
    }

    // Question text
    if (q) {
      this._drawWrappedQuestion(ctx, q.question, w / 2, 50, w - 40, 20);
    }

    // ── Balloons ─────────────────────────────────────────────────────────

    for (const b of this.balloons) {
      if (b.popped || b.alpha <= 0) continue;

      ctx.save();

      const drawX = b.x + b.shakeOffsetX;
      const drawY = b.y;
      const effectiveRadius = BALLOON_RADIUS * b.scale * (1 - b.deflateAmount);

      if (b.alpha < 1) {
        ctx.globalAlpha = b.alpha;
      }

      // Draw balloon body via shared sprite
      drawBalloon(
        ctx,
        drawX,
        drawY,
        effectiveRadius,
        b.color,
        STRING_LENGTH * b.scale
      );

      // Draw label on balloon
      ctx.globalAlpha = b.alpha;
      const labelFontSize = this._computeLabelFontSize(
        b.label,
        effectiveRadius
      );
      drawText(ctx, b.label, drawX, drawY, {
        fontSize: labelFontSize,
        fontWeight: 'bold',
        color: '#FFFFFF',
        align: 'center',
        baseline: 'middle',
      });

      ctx.restore();
    }

    // ── Particles (on top) ───────────────────────────────────────────────

    this.particles.render(ctx);

    // ── Game Over overlay ────────────────────────────────────────────────

    if (this.finished) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fillRect(0, 0, w, h);

      drawText(ctx, 'Great Job!', w / 2, h / 2 - 20, {
        fontSize: 28,
        fontWeight: 'bold',
        color: kidsColors.primary,
        align: 'center',
        baseline: 'middle',
      });

      drawText(ctx, `Score: ${this.score} / ${total}`, w / 2, h / 2 + 18, {
        fontSize: 18,
        fontWeight: '600',
        color: kidsColors.textPrimary,
        align: 'center',
        baseline: 'middle',
      });

      if (this.bestStreak >= 2) {
        drawText(ctx, `Best streak: ${this.bestStreak}`, w / 2, h / 2 + 46, {
          fontSize: 14,
          fontWeight: '600',
          color: kidsColors.streakFire,
          align: 'center',
          baseline: 'middle',
        });
      }
    }
  }

  // ── Pointer Events ────────────────────────────────────────────────────────

  onPointerDown(x, y) {
    if (this.finished || this.transitioning || this.poppingBalloon) return;

    // Hit-test balloons in reverse draw order (top-most = last drawn)
    for (let i = this.balloons.length - 1; i >= 0; i--) {
      const b = this.balloons[i];
      if (b.popped) continue;

      const drawX = b.x + b.shakeOffsetX;
      const drawY = b.y;
      const effectiveRadius = BALLOON_RADIUS * b.scale * (1 - b.deflateAmount);

      if (hitTestCircle(x, y, drawX, drawY, effectiveRadius)) {
        this._handleBalloonTap(b);
        return; // only tap one balloon per pointer down
      }
    }
  }

  onPointerMove(_x, _y) {
    // no-op
  }

  onPointerUp(_x, _y) {
    // no-op
  }

  // ── Internal Logic ────────────────────────────────────────────────────────

  _handleBalloonTap(balloon) {
    const q = this.questions[this.questionIndex];
    if (!q) return;

    const responseTimeMs = performance.now() - this.questionStartTime;

    if (balloon.isCorrect) {
      // Begin pop animation
      this.poppingBalloon = balloon;
      this.popTimer = 0;
      GameSounds.pop();

      // Update score / streak
      this.correct++;
      this.score++;
      this.streak++;
      if (this.streak > this.bestStreak) {
        this.bestStreak = this.streak;
      }

      // Streak sound milestones
      if (this.streak === 3 || this.streak === 5 || this.streak === 10) {
        GameSounds.streak(this.streak);
      }

      // Record result
      this.results.push({
        questionIndex: this.questionIndex,
        question: q.question,
        selectedOption: balloon.label,
        isCorrect: true,
        concept: q.concept || '',
        responseTimeMs,
      });

      // Notify parent
      if (this.onAnswer) {
        this.onAnswer(true, q.concept || '', responseTimeMs);
      }
    } else {
      // Wrong answer
      GameSounds.wrong();
      balloon.shakeTimer = SHAKE_DURATION;
      balloon.deflateAmount = Math.min(
        balloon.deflateAmount + DEFLATE_AMOUNT,
        0.4
      );
      this.streak = 0;

      // Record result
      this.results.push({
        questionIndex: this.questionIndex,
        question: q.question,
        selectedOption: balloon.label,
        isCorrect: false,
        concept: q.concept || '',
        responseTimeMs,
      });

      if (this.onAnswer) {
        this.onAnswer(false, q.concept || '', responseTimeMs);
      }
    }
  }

  _burstBalloon(balloon) {
    const bx = balloon.x + balloon.shakeOffsetX;
    const by = balloon.y;

    // Pop explosion
    const popPreset = ParticlePool.popExplosion(bx, by, 18);
    this.particles.emitPreset(popPreset);

    // Confetti burst
    const confettiPreset = ParticlePool.confettiBurst(bx, by, 25);
    this.particles.emitPreset(confettiPreset);

    // Sparkle
    const sparklePreset = ParticlePool.sparkleBurst(bx, by, 12);
    this.particles.emitPreset(sparklePreset);
  }

  _advanceQuestion() {
    this.questionIndex++;

    if (this.questionIndex >= this.questions.length) {
      // Game over
      this.finished = true;
      const isPerfect = this.correct === this.questions.length;
      GameSounds.complete(isPerfect);

      if (this.onComplete) {
        this.onComplete({
          score: this.score,
          correct: this.correct,
          total: this.questions.length,
          results: this.results,
          bestStreak: this.bestStreak,
        });
      }
    } else {
      this._setupQuestion();
    }
  }

  /**
   * Compute a font size that fits the label text inside the balloon.
   * Shrinks for longer strings so text does not overflow.
   */
  _computeLabelFontSize(label, radius) {
    const maxWidth = radius * 1.4; // rough horizontal space
    const baseSize = 16;

    if (!label) return baseSize;

    // Approximate: assume average char width ~ 0.55 * fontSize
    const charFactor = 0.55;
    const desiredWidth = label.length * charFactor * baseSize;

    if (desiredWidth <= maxWidth) return baseSize;

    const scaled = Math.floor(baseSize * (maxWidth / desiredWidth));
    return Math.max(scaled, 10); // minimum 10px
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

export default function BalloonPopTemplate({config, onAnswer, onComplete}) {
  return (
    <CanvasGameBridge
      GameClass={BalloonPopGame}
      config={config}
      onAnswer={onAnswer}
      onComplete={onComplete}
      aspectRatio={3 / 4}
    />
  );
}
