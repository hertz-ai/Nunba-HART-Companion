/**
 * CatcherTemplate - Dynamic Liquid Agentic UI
 *
 * Canvas-based catcher game. A basket at the bottom of the screen catches
 * falling items. Catch correct items to score, avoid wrong ones to keep lives.
 *
 * Props:
 *   config     - { content: { questions: [{
 *                   question: string,
 *                   options: string[],
 *                   correctIndex: number,
 *                   concept?: string
 *                 }] } }
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

// ─── Constants ────────────────────────────────────────────────────────────────

const BASKET_WIDTH = 80;
const BASKET_HEIGHT = 40;
const BASKET_RADIUS = 14;
const BASKET_Y_OFFSET = 50; // pixels from bottom

const ITEM_RADIUS = 26;
const ITEM_FONT_SIZE = 13;

const BASE_FALL_SPEED_MIN = 80;
const BASE_FALL_SPEED_MAX = 120;
const SPEED_RAMP_PER_QUESTION = 8; // extra px/s per completed question

const MAX_LIVES = 3;

const SPAWN_INTERVAL_BASE = 1.2; // seconds between spawns
const SPAWN_INTERVAL_MIN = 0.5;
const SPAWN_INTERVAL_RAMP = 0.08; // reduce interval per question

const ITEM_COLORS = [
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.purple,
  kidsColors.teal,
  kidsColors.green,
  kidsColors.red,
  kidsColors.yellow,
];

const HEART_COLOR = kidsColors.red;
const HEART_EMPTY_COLOR = kidsColors.starEmpty;

const BASKET_COLOR = kidsColors.primary;
const BASKET_HIGHLIGHT = kidsColors.primaryLight;
const BASKET_STROKE = kidsColors.primaryDark;

const QUESTION_BG = 'rgba(255, 255, 255, 0.92)';
const QUESTION_BORDER = kidsColors.primaryLight;

const SHAKE_DURATION = 0.35; // seconds
const SHAKE_MAGNITUDE = 6; // pixels

// ─── Helper ───────────────────────────────────────────────────────────────────

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Wrap text to fit a given max width, returning an array of lines.
 */
function wrapText(ctx, text, maxWidth, fontSize) {
  ctx.font = `bold ${fontSize}px "Nunito", sans-serif`;
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

// ─── FallingItem ──────────────────────────────────────────────────────────────

class FallingItem {
  constructor(x, y, speed, optionIndex, label, color, isCorrect) {
    this.x = x;
    this.y = y;
    this.speed = speed;
    this.optionIndex = optionIndex;
    this.label = label;
    this.color = color;
    this.isCorrect = isCorrect;
    this.active = true;
    this.radius = ITEM_RADIUS;
    this.rotation = 0;
    this.rotationSpeed = randRange(-1.5, 1.5);
    // Slight horizontal drift for visual interest
    this.driftX = randRange(-15, 15);
  }
}

// ─── CatcherGame ──────────────────────────────────────────────────────────────

class CatcherGame {
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
    this.totalQuestions = this.questions.length;

    // Dimensions (will be set in resize / start)
    this.width = 0;
    this.height = 0;

    // Game state
    this.currentQuestionIndex = 0;
    this.score = 0;
    this.correctCount = 0;
    this.lives = MAX_LIVES;
    this.streak = 0;
    this.bestStreak = 0;
    this.results = [];
    this.gameOver = false;
    this.questionStartTime = 0;

    // Basket
    this.basketX = 0; // center x
    this.basketY = 0;
    this.basketW = BASKET_WIDTH;
    this.basketH = BASKET_HEIGHT;
    this.pointerDown = false;
    this.pointerX = 0;

    // Shake effect
    this.shakeTimer = 0;
    this.shakeOffsetX = 0;

    // Falling items
    this.items = [];
    this.spawnTimer = 0;
    this.spawnedForQuestion = false; // flag to ensure all options spawn at least once

    // Items management for current question
    this.optionsToSpawn = [];
    this.spawnIndex = 0;

    // Difficulty
    this.difficultyMultiplier = 1;

    // Particles
    this.particles = new ParticlePool();

    // Animation state
    this.completionTimer = 0;
    this.showCompletionDelay = 1.5; // seconds before calling onComplete

    // Score popup text
    this.scorePopups = []; // { text, x, y, timer, color }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    this.basketX = this.width / 2;
    this.basketY = this.height - BASKET_Y_OFFSET;

    this._setupQuestion();

    GameSounds.warmUp();
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.basketY = this.height - BASKET_Y_OFFSET;
    this.basketX = clamp(
      this.basketX,
      this.basketW / 2,
      this.width - this.basketW / 2
    );
  }

  destroy() {
    this.particles.reset();
    this.items = [];
    this.scorePopups = [];
  }

  // ── Question Setup ────────────────────────────────────────────────────────

  _setupQuestion() {
    if (this.currentQuestionIndex >= this.totalQuestions) return;

    const q = this.questions[this.currentQuestionIndex];
    const options = q.options || [];

    // Build the spawn queue: shuffle option indices
    this.optionsToSpawn = [];
    for (let i = 0; i < options.length; i++) {
      this.optionsToSpawn.push(i);
    }
    // Shuffle
    for (let i = this.optionsToSpawn.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.optionsToSpawn[i], this.optionsToSpawn[j]] = [
        this.optionsToSpawn[j],
        this.optionsToSpawn[i],
      ];
    }
    this.spawnIndex = 0;
    this.spawnedForQuestion = false;

    // Difficulty ramp
    this.difficultyMultiplier = 1 + this.currentQuestionIndex * 0.15;

    // Reset spawn timer to spawn first item quickly
    this.spawnTimer = 0.3;

    this.questionStartTime = performance.now();
  }

  // ── Item Spawning ─────────────────────────────────────────────────────────

  _spawnItem() {
    if (this.currentQuestionIndex >= this.totalQuestions) return;

    const q = this.questions[this.currentQuestionIndex];
    const options = q.options || [];
    if (options.length === 0) return;

    let optionIdx;

    // First cycle through: ensure all options are spawned at least once
    if (this.spawnIndex < this.optionsToSpawn.length) {
      optionIdx = this.optionsToSpawn[this.spawnIndex];
      this.spawnIndex++;
      if (this.spawnIndex >= this.optionsToSpawn.length) {
        this.spawnedForQuestion = true;
      }
    } else {
      // After all options spawned once, spawn random options
      optionIdx = Math.floor(Math.random() * options.length);
    }

    const label = options[optionIdx];
    const isCorrect = optionIdx === q.correctIndex;
    const color = ITEM_COLORS[optionIdx % ITEM_COLORS.length];

    // Calculate fall speed with difficulty ramp
    const speedMin =
      BASE_FALL_SPEED_MIN + this.currentQuestionIndex * SPEED_RAMP_PER_QUESTION;
    const speedMax =
      BASE_FALL_SPEED_MAX + this.currentQuestionIndex * SPEED_RAMP_PER_QUESTION;
    const speed = randRange(speedMin, speedMax);

    // Random x position, keeping items within bounds
    const margin = ITEM_RADIUS + 10;
    const x = randRange(margin, this.width - margin);

    const item = new FallingItem(
      x,
      -ITEM_RADIUS * 2,
      speed,
      optionIdx,
      label,
      color,
      isCorrect
    );
    this.items.push(item);
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt) {
    if (this.gameOver) {
      this.completionTimer += dt;
      this.particles.update(dt);
      this._updateScorePopups(dt);
      return;
    }

    // ── Shake ──
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      this.shakeOffsetX =
        Math.sin(this.shakeTimer * 40) *
        SHAKE_MAGNITUDE *
        (this.shakeTimer / SHAKE_DURATION);
      if (this.shakeTimer <= 0) {
        this.shakeTimer = 0;
        this.shakeOffsetX = 0;
      }
    }

    // ── Spawn timer ──
    const spawnInterval = Math.max(
      SPAWN_INTERVAL_MIN,
      SPAWN_INTERVAL_BASE - this.currentQuestionIndex * SPAWN_INTERVAL_RAMP
    );
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this._spawnItem();
      this.spawnTimer = spawnInterval;
    }

    // ── Update basket position if pointer is down ──
    if (this.pointerDown) {
      this.basketX = clamp(
        this.pointerX,
        this.basketW / 2,
        this.width - this.basketW / 2
      );
    }

    // ── Basket rect for collision ──
    const bx = this.basketX - this.basketW / 2 + this.shakeOffsetX;
    const by = this.basketY - this.basketH / 2;

    // ── Update falling items ──
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (!item.active) {
        this.items.splice(i, 1);
        continue;
      }

      item.y += item.speed * dt;
      item.x += item.driftX * dt;
      item.rotation += item.rotationSpeed * dt;

      // Clamp x to canvas bounds
      item.x = clamp(item.x, item.radius, this.width - item.radius);

      // ── Collision with basket ──
      if (
        item.y + item.radius >= by &&
        item.y - item.radius <= by + this.basketH &&
        item.x + item.radius >= bx &&
        item.x - item.radius <= bx + this.basketW
      ) {
        this._catchItem(item);
        item.active = false;
        continue;
      }

      // ── Missed (fell past bottom) ──
      if (item.y - item.radius > this.height + 20) {
        item.active = false;
        // No penalty; item will just be recycled by spawner
        continue;
      }
    }

    // ── Particles ──
    this.particles.update(dt);

    // ── Score popups ──
    this._updateScorePopups(dt);
  }

  _catchItem(item) {
    const q = this.questions[this.currentQuestionIndex];
    const elapsed = performance.now() - this.questionStartTime;

    if (item.isCorrect) {
      // Correct catch
      this.score += 10;
      this.correctCount++;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);

      GameSounds.coinCollect();

      // Sparkle burst
      if (!this.reducedMotion) {
        const preset = ParticlePool.sparkleBurst(item.x, item.y, 18);
        this.particles.emitPreset(preset);
      }

      // Score popup
      this.scorePopups.push({
        text: '+10',
        x: item.x,
        y: item.y,
        timer: 1.0,
        color: kidsColors.correct,
      });

      // Streak sound
      if (this.streak === 3 || this.streak === 5 || this.streak === 10) {
        GameSounds.streak(this.streak);
      }

      // Record result
      this.results.push({
        questionIndex: this.currentQuestionIndex,
        question: q.question,
        answer: item.label,
        isCorrect: true,
        concept: q.concept || '',
        responseTimeMs: elapsed,
      });

      if (this.onAnswer) {
        this.onAnswer(true, q.concept || '', elapsed);
      }

      // Move to next question
      this._advanceQuestion();
    } else {
      // Wrong catch
      this.streak = 0;
      this.lives--;

      GameSounds.splash();

      // Splash effect
      if (!this.reducedMotion) {
        const preset = ParticlePool.splashEffect(item.x, item.y, 14);
        this.particles.emitPreset(preset);
      }

      // Shake basket
      this.shakeTimer = SHAKE_DURATION;

      // Score popup
      this.scorePopups.push({
        text: 'Wrong!',
        x: item.x,
        y: item.y,
        timer: 1.0,
        color: kidsColors.incorrect,
      });

      // Record result
      this.results.push({
        questionIndex: this.currentQuestionIndex,
        question: q.question,
        answer: item.label,
        isCorrect: false,
        concept: q.concept || '',
        responseTimeMs: elapsed,
      });

      if (this.onAnswer) {
        this.onAnswer(false, q.concept || '', elapsed);
      }

      // Check game over
      if (this.lives <= 0) {
        this._endGame();
      }
    }
  }

  _advanceQuestion() {
    // Clear remaining items for this question
    for (const item of this.items) {
      item.active = false;
    }

    this.currentQuestionIndex++;

    if (this.currentQuestionIndex >= this.totalQuestions) {
      this._endGame();
    } else {
      this._setupQuestion();
    }
  }

  _endGame() {
    this.gameOver = true;
    this.completionTimer = 0;

    // Celebration particles
    if (!this.reducedMotion) {
      const preset = ParticlePool.confettiBurst(
        this.width / 2,
        this.height / 3,
        35
      );
      this.particles.emitPreset(preset);
    }

    const isPerfect =
      this.correctCount === this.totalQuestions && this.lives === MAX_LIVES;
    GameSounds.complete(isPerfect);

    // Delay onComplete call
    setTimeout(() => {
      if (this.onComplete) {
        this.onComplete({
          score: this.score,
          correct: this.correctCount,
          total: this.totalQuestions,
          results: this.results,
          bestStreak: this.bestStreak,
        });
      }
    }, this.showCompletionDelay * 1000);
  }

  _updateScorePopups(dt) {
    for (let i = this.scorePopups.length - 1; i >= 0; i--) {
      const popup = this.scorePopups[i];
      popup.timer -= dt;
      popup.y -= 40 * dt; // float upward
      if (popup.timer <= 0) {
        this.scorePopups.splice(i, 1);
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#E8F4FD');
    bgGrad.addColorStop(0.6, '#F7F5FF');
    bgGrad.addColorStop(1, '#FFF9E6');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // ── Question prompt ──
    this._renderQuestion(ctx, w);

    // ── HUD: lives and score ──
    this._renderHUD(ctx, w);

    // ── Falling items ──
    for (const item of this.items) {
      if (!item.active) continue;
      this._renderItem(ctx, item);
    }

    // ── Basket ──
    this._renderBasket(ctx);

    // ── Particles ──
    this.particles.render(ctx);

    // ── Score popups ──
    this._renderScorePopups(ctx);

    // ── Game Over overlay ──
    if (this.gameOver) {
      this._renderGameOver(ctx, w, h);
    }
  }

  _renderQuestion(ctx, w) {
    if (this.currentQuestionIndex >= this.totalQuestions) return;

    const q = this.questions[this.currentQuestionIndex];
    const questionText = q.question || '';

    const padding = 12;
    const maxTextWidth = Math.min(w - 40, 350);
    const fontSize = 15;
    const lines = wrapText(ctx, questionText, maxTextWidth, fontSize);
    const lineHeight = fontSize + 4;
    const boxHeight = lines.length * lineHeight + padding * 2;
    const boxWidth = maxTextWidth + padding * 2;
    const boxX = (w - boxWidth) / 2;
    const boxY = 8;

    // Background pill
    drawRoundedRect(
      ctx,
      boxX,
      boxY,
      boxWidth,
      boxHeight,
      14,
      QUESTION_BG,
      QUESTION_BORDER,
      2
    );

    // Draw each line
    for (let i = 0; i < lines.length; i++) {
      drawText(
        ctx,
        lines[i],
        w / 2,
        boxY + padding + i * lineHeight + lineHeight / 2,
        {
          fontSize,
          fontWeight: 'bold',
          color: kidsColors.textPrimary,
          align: 'center',
          baseline: 'middle',
        }
      );
    }
  }

  _renderHUD(ctx, w) {
    const hudY = 8;

    // ── Score (top left) ──
    drawText(ctx, `Score: ${this.score}`, 14, hudY + 14, {
      fontSize: 14,
      fontWeight: 'bold',
      color: kidsColors.primary,
      align: 'left',
      baseline: 'middle',
    });

    // ── Progress (below score) ──
    const progressText = `${Math.min(this.currentQuestionIndex + 1, this.totalQuestions)} / ${this.totalQuestions}`;
    drawText(ctx, progressText, 14, hudY + 32, {
      fontSize: 11,
      fontWeight: '600',
      color: kidsColors.textSecondary,
      align: 'left',
      baseline: 'middle',
    });

    // ── Lives (top right - hearts) ──
    const heartSize = 12;
    const heartSpacing = 28;
    const heartsStartX = w - 14 - (MAX_LIVES - 1) * heartSpacing;

    for (let i = 0; i < MAX_LIVES; i++) {
      const hx = heartsStartX + i * heartSpacing;
      const hy = hudY + 14;
      const color = i < this.lives ? HEART_COLOR : HEART_EMPTY_COLOR;
      this._drawHeart(ctx, hx, hy, heartSize, color);
    }
  }

  _drawHeart(ctx, cx, cy, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    const s = size;
    ctx.moveTo(cx, cy + s * 0.3);
    ctx.bezierCurveTo(
      cx,
      cy - s * 0.1,
      cx - s * 0.6,
      cy - s * 0.5,
      cx - s * 0.6,
      cy - s * 0.1
    );
    ctx.bezierCurveTo(
      cx - s * 0.6,
      cy + s * 0.2,
      cx,
      cy + s * 0.55,
      cx,
      cy + s * 0.7
    );
    ctx.bezierCurveTo(
      cx,
      cy + s * 0.55,
      cx + s * 0.6,
      cy + s * 0.2,
      cx + s * 0.6,
      cy - s * 0.1
    );
    ctx.bezierCurveTo(
      cx + s * 0.6,
      cy - s * 0.5,
      cx,
      cy - s * 0.1,
      cx,
      cy + s * 0.3
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _renderItem(ctx, item) {
    ctx.save();
    ctx.translate(item.x, item.y);

    if (!this.reducedMotion) {
      ctx.rotate(item.rotation);
    }

    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;

    // Outer circle
    drawCircle(ctx, 0, 0, item.radius, item.color, '#FFFFFF', 2);

    // Reset shadow for text
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Label text (truncated if too long)
    let displayLabel = item.label;
    ctx.font = `bold ${ITEM_FONT_SIZE}px "Nunito", sans-serif`;
    const textMetrics = ctx.measureText(displayLabel);
    const maxLabelWidth = item.radius * 1.6;
    if (textMetrics.width > maxLabelWidth) {
      // Truncate and add ellipsis
      while (
        displayLabel.length > 1 &&
        ctx.measureText(displayLabel + '...').width > maxLabelWidth
      ) {
        displayLabel = displayLabel.slice(0, -1);
      }
      displayLabel += '...';
    }

    drawText(ctx, displayLabel, 0, 0, {
      fontSize: ITEM_FONT_SIZE,
      fontWeight: 'bold',
      color: '#FFFFFF',
      align: 'center',
      baseline: 'middle',
    });

    ctx.restore();
  }

  _renderBasket(ctx) {
    const bx = this.basketX - this.basketW / 2 + this.shakeOffsetX;
    const by = this.basketY - this.basketH / 2;

    ctx.save();

    // Drop shadow
    ctx.shadowColor = 'rgba(108, 92, 231, 0.25)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;

    // Main basket body
    drawRoundedRect(
      ctx,
      bx,
      by,
      this.basketW,
      this.basketH,
      BASKET_RADIUS,
      BASKET_COLOR,
      BASKET_STROKE,
      2.5
    );

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Highlight stripe
    drawRoundedRect(
      ctx,
      bx + 4,
      by + 4,
      this.basketW - 8,
      this.basketH * 0.35,
      BASKET_RADIUS - 2,
      BASKET_HIGHLIGHT
    );

    // Basket rim (top edge highlight)
    ctx.beginPath();
    ctx.moveTo(bx + BASKET_RADIUS, by);
    ctx.lineTo(bx + this.basketW - BASKET_RADIUS, by);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  _renderScorePopups(ctx) {
    for (const popup of this.scorePopups) {
      const alpha = Math.max(0, popup.timer);
      drawText(ctx, popup.text, popup.x, popup.y, {
        fontSize: 18,
        fontWeight: 'bold',
        color: popup.color,
        align: 'center',
        baseline: 'middle',
      });
      // Apply fade manually through globalAlpha around the drawText
      // Since drawText uses save/restore, we draw a second pass with alpha
    }

    // Re-render with proper alpha (override the above)
    if (this.scorePopups.length > 0) {
      for (const popup of this.scorePopups) {
        const alpha = clamp(popup.timer, 0, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        drawText(ctx, popup.text, popup.x, popup.y, {
          fontSize: 18,
          fontWeight: 'bold',
          color: popup.color,
          align: 'center',
          baseline: 'middle',
        });
        ctx.restore();
      }
    }
  }

  _renderGameOver(ctx, w, h) {
    // Semi-transparent overlay
    ctx.save();
    const overlayAlpha = Math.min(this.completionTimer * 2, 0.6);
    ctx.fillStyle = `rgba(255, 255, 255, ${overlayAlpha})`;
    ctx.fillRect(0, 0, w, h);

    if (this.completionTimer > 0.3) {
      const textAlpha = Math.min((this.completionTimer - 0.3) * 3, 1);
      ctx.globalAlpha = textAlpha;

      const isPerfect =
        this.correctCount === this.totalQuestions && this.lives === MAX_LIVES;
      const allAnswered = this.currentQuestionIndex >= this.totalQuestions;

      // Title
      const title =
        this.lives <= 0
          ? 'Game Over!'
          : isPerfect
            ? 'Perfect!'
            : allAnswered
              ? 'Well Done!'
              : 'Game Over!';

      drawText(ctx, title, w / 2, h * 0.35, {
        fontSize: 32,
        fontWeight: 'bold',
        color: this.lives <= 0 ? kidsColors.incorrect : kidsColors.primary,
        align: 'center',
        baseline: 'middle',
      });

      // Score
      drawText(ctx, `Score: ${this.score}`, w / 2, h * 0.45, {
        fontSize: 22,
        fontWeight: 'bold',
        color: kidsColors.textPrimary,
        align: 'center',
        baseline: 'middle',
      });

      // Stats
      drawText(
        ctx,
        `${this.correctCount} / ${this.totalQuestions} correct`,
        w / 2,
        h * 0.53,
        {
          fontSize: 16,
          fontWeight: '600',
          color: kidsColors.textSecondary,
          align: 'center',
          baseline: 'middle',
        }
      );

      if (this.bestStreak > 1) {
        drawText(ctx, `Best streak: ${this.bestStreak}`, w / 2, h * 0.59, {
          fontSize: 14,
          fontWeight: '600',
          color: kidsColors.star,
          align: 'center',
          baseline: 'middle',
        });
      }
    }

    ctx.restore();
  }

  // ── Pointer Events ────────────────────────────────────────────────────────

  onPointerDown(x, _y) {
    this.pointerDown = true;
    this.pointerX = x;
    this.basketX = clamp(x, this.basketW / 2, this.width - this.basketW / 2);
  }

  onPointerMove(x, _y) {
    this.pointerX = x;
    if (this.pointerDown) {
      this.basketX = clamp(x, this.basketW / 2, this.width - this.basketW / 2);
    }
  }

  onPointerUp(_x, _y) {
    this.pointerDown = false;
  }
}

// ─── React Wrapper ────────────────────────────────────────────────────────────

export default function CatcherTemplate({config, onAnswer, onComplete}) {
  return (
    <CanvasGameBridge
      GameClass={CatcherGame}
      config={config}
      onAnswer={onAnswer}
      onComplete={onComplete}
      aspectRatio={3 / 4}
    />
  );
}
