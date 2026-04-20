/**
 * RunnerDodgeTemplate - Canvas-Based 3-Lane Auto-Runner Game
 *
 * Character auto-runs forward while items scroll from top to bottom.
 * Player swipes/taps to change lane. Collect correct answers,
 * dodge wrong obstacles. Speed increases per question.
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
  drawRoundedRect,
  drawText,
  drawCircle,
  hitTestRect,
} from '../shared/CanvasSprites';
import {GameSounds} from '../shared/SoundManager';

import React from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const LANE_COUNT = 3;
const CHARACTER_RADIUS = 25;
const ITEM_WIDTH = 80;
const ITEM_HEIGHT = 50;
const ITEM_RADIUS = 12;
const BASE_SPEED = 150; // px/s, items scroll downward
const SPEED_INCREMENT = 12; // per question
const LANE_SWITCH_DURATION = 0.2; // seconds
const MAX_LIVES = 3;
const ROAD_LINE_HEIGHT = 30;
const ROAD_LINE_GAP = 40;
const ROAD_LINE_WIDTH = 4;
const POINTS_PER_CORRECT = 10;
const SPAWN_Y_OFFSET = -60; // items spawn above visible area
const QUESTION_DISPLAY_Y = 10; // top of screen

// Lane indices
const LANE_LEFT = 0;
const LANE_CENTER = 1;
const LANE_RIGHT = 2;

// Game states
const STATE_PLAYING = 'playing';
const STATE_BETWEEN = 'between'; // brief pause between questions
const STATE_COMPLETE = 'complete';

// ─── RunnerGame Class ─────────────────────────────────────────────────────────

class RunnerGame {
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

    this.questions = config?.content?.questions ?? [];
    this.totalQuestions = this.questions.length;

    // Canvas dimensions (CSS pixels, updated in resize)
    this.width = 0;
    this.height = 0;

    // Particles
    this.particles = new ParticlePool();

    // Game state
    this.state = STATE_PLAYING;
    this.questionIndex = 0;
    this.score = 0;
    this.correctCount = 0;
    this.lives = MAX_LIVES;
    this.streak = 0;
    this.bestStreak = 0;
    this.results = [];

    // Character
    this.currentLane = LANE_CENTER;
    this.targetLane = LANE_CENTER;
    this.charX = 0; // set in resize
    this.charY = 0; // set in resize
    this.laneSlideTimer = 0;
    this.laneSlideFrom = LANE_CENTER;

    // Items for current question
    this.items = []; // { lane, x, y, text, isCorrect, collected, missed }
    this.itemSpeed = BASE_SPEED;

    // Road lines for motion effect
    this.roadLineOffset = 0;

    // Shake effect
    this.shakeTimer = 0;
    this.shakeIntensity = 0;

    // Between-question timer
    this.betweenTimer = 0;
    this.betweenDuration = 0.8; // seconds between questions

    // Question start time for response tracking
    this.questionStartTime = 0;

    // Track whether question was answered this round
    this.questionAnswered = false;

    // Completion delay
    this.completeDelay = 0;
    this.completeCalled = false;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this._computeLanePositions();
    this._spawnQuestion();
    this.questionStartTime = performance.now();
    GameSounds.intro();
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this._computeLanePositions();
  }

  destroy() {
    this.particles.reset();
  }

  // ── Geometry helpers ──────────────────────────────────────────────────────

  _computeLanePositions() {
    this.laneWidth = this.width / LANE_COUNT;
    // Lane center X positions
    this.laneCenters = [];
    for (let i = 0; i < LANE_COUNT; i++) {
      this.laneCenters[i] = this.laneWidth * i + this.laneWidth / 2;
    }
    // Character Y: bottom third
    this.charY = this.height * 0.78;
    // Update charX to current lane
    this.charX = this.laneCenters[this.currentLane] ?? this.width / 2;
  }

  _getLaneCenterX(lane) {
    return this.laneCenters[lane] ?? this.width / 2;
  }

  // ── Spawn items for current question ──────────────────────────────────────

  _spawnQuestion() {
    if (this.questionIndex >= this.totalQuestions) {
      this.state = STATE_COMPLETE;
      this.completeDelay = 1.0;
      return;
    }

    const q = this.questions[this.questionIndex];
    const options = q.options ?? [];
    const correctIdx = q.correctIndex ?? 0;

    // Assign one option per lane. If fewer than 3 options, duplicate wrongs.
    // Shuffle lane assignments so correct answer is randomly placed.
    const laneAssignments = [0, 1, 2];
    // Fisher-Yates shuffle
    for (let i = laneAssignments.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [laneAssignments[i], laneAssignments[j]] = [
        laneAssignments[j],
        laneAssignments[i],
      ];
    }

    this.items = [];

    // Place correct answer in first shuffled lane
    const correctLane = laneAssignments[0];
    this.items.push({
      lane: correctLane,
      x: this._getLaneCenterX(correctLane) - ITEM_WIDTH / 2,
      y: SPAWN_Y_OFFSET,
      text: options[correctIdx] ?? 'Correct',
      isCorrect: true,
      collected: false,
      missed: false,
    });

    // Place wrong answers in remaining lanes
    const wrongOptions = options.filter((_, idx) => idx !== correctIdx);
    for (let i = 1; i < LANE_COUNT; i++) {
      const lane = laneAssignments[i];
      const wrongText =
        wrongOptions.length > 0
          ? wrongOptions.splice(
              Math.floor(Math.random() * wrongOptions.length),
              1
            )[0]
          : 'Wrong';
      this.items.push({
        lane,
        x: this._getLaneCenterX(lane) - ITEM_WIDTH / 2,
        y: SPAWN_Y_OFFSET,
        text: wrongText,
        isCorrect: false,
        collected: false,
        missed: false,
      });
    }

    this.itemSpeed = BASE_SPEED + this.questionIndex * SPEED_INCREMENT;
    this.questionAnswered = false;
    this.questionStartTime = performance.now();
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt) {
    // Particles always update
    this.particles.update(dt);

    // Shake decay
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      if (this.shakeTimer <= 0) {
        this.shakeTimer = 0;
        this.shakeIntensity = 0;
      }
    }

    if (this.state === STATE_COMPLETE) {
      this.completeDelay -= dt;
      if (this.completeDelay <= 0 && !this.completeCalled) {
        this.completeCalled = true;
        this._fireComplete();
      }
      return;
    }

    if (this.state === STATE_BETWEEN) {
      this.betweenTimer -= dt;
      if (this.betweenTimer <= 0) {
        this.state = STATE_PLAYING;
        this._spawnQuestion();
      }
      return;
    }

    // ── Lane sliding animation ──
    if (this.laneSlideTimer > 0) {
      this.laneSlideTimer -= dt;
      if (this.laneSlideTimer <= 0) {
        this.laneSlideTimer = 0;
        this.currentLane = this.targetLane;
        this.charX = this._getLaneCenterX(this.currentLane);
      } else {
        const progress = 1 - this.laneSlideTimer / LANE_SWITCH_DURATION;
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const fromX = this._getLaneCenterX(this.laneSlideFrom);
        const toX = this._getLaneCenterX(this.targetLane);
        this.charX = fromX + (toX - fromX) * eased;
      }
    }

    // ── Road lines scroll ──
    this.roadLineOffset += this.itemSpeed * dt;
    const linePeriod = ROAD_LINE_HEIGHT + ROAD_LINE_GAP;
    if (this.roadLineOffset >= linePeriod) {
      this.roadLineOffset -= linePeriod;
    }

    // ── Move items down ──
    let allPassed = true;
    let anyCollided = false;

    for (const item of this.items) {
      if (item.collected || item.missed) continue;

      item.y += this.itemSpeed * dt;

      // Update x in case of resize
      item.x = this._getLaneCenterX(item.lane) - ITEM_WIDTH / 2;

      // Collision with character
      const charLeft = this.charX - CHARACTER_RADIUS;
      const charRight = this.charX + CHARACTER_RADIUS;
      const charTop = this.charY - CHARACTER_RADIUS;
      const charBottom = this.charY + CHARACTER_RADIUS;

      const itemLeft = item.x;
      const itemRight = item.x + ITEM_WIDTH;
      const itemTop = item.y;
      const itemBottom = item.y + ITEM_HEIGHT;

      const collides =
        charRight > itemLeft &&
        charLeft < itemRight &&
        charBottom > itemTop &&
        charTop < itemBottom;

      if (collides) {
        item.collected = true;
        anyCollided = true;
        this._handleCollision(item);
      }

      // Check if item passed below screen
      if (item.y > this.height + ITEM_HEIGHT) {
        item.missed = true;
      }

      if (!item.collected && !item.missed) {
        allPassed = false;
      }
    }

    // All items passed or collected -> next question
    if (allPassed && this.items.length > 0) {
      if (!this.questionAnswered) {
        // Player missed everything - treat as missed (no penalty, just move on)
        this._recordResult(false, performance.now() - this.questionStartTime);
      }
      this._advanceQuestion();
    }
  }

  // ── Collision handling ────────────────────────────────────────────────────

  _handleCollision(item) {
    const responseMs = performance.now() - this.questionStartTime;
    this.questionAnswered = true;

    if (item.isCorrect) {
      // Correct answer collected
      this.score += POINTS_PER_CORRECT;
      this.correctCount++;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);

      GameSounds.coinCollect();

      // Sparkle particles at collection point
      if (!this.reducedMotion) {
        const preset = ParticlePool.sparkleBurst(
          item.x + ITEM_WIDTH / 2,
          item.y + ITEM_HEIGHT / 2,
          15
        );
        this.particles.emitPreset(preset);
      }

      this._recordResult(true, responseMs);

      if (this.streak >= 3) {
        GameSounds.streak(this.streak);
      }
    } else {
      // Wrong answer hit
      this.lives--;
      this.streak = 0;

      GameSounds.wrong();

      // Shake effect
      this.shakeTimer = 0.3;
      this.shakeIntensity = 6;

      // Red burst particles
      if (!this.reducedMotion) {
        const preset = ParticlePool.popExplosion(
          item.x + ITEM_WIDTH / 2,
          item.y + ITEM_HEIGHT / 2,
          10
        );
        this.particles.emitPreset(preset);
      }

      this._recordResult(false, responseMs);

      // Check game over
      if (this.lives <= 0) {
        this.state = STATE_COMPLETE;
        this.completeDelay = 1.2;
        return;
      }
    }

    // Mark remaining items as missed so the round ends
    for (const otherItem of this.items) {
      if (!otherItem.collected) {
        otherItem.missed = true;
      }
    }

    this._advanceQuestion();
  }

  _recordResult(isCorrect, responseMs) {
    const q = this.questions[this.questionIndex];
    const result = {
      questionIndex: this.questionIndex,
      question: q?.question ?? '',
      isCorrect,
      concept: q?.concept ?? '',
      responseTimeMs: responseMs,
    };
    this.results.push(result);

    if (this.onAnswer) {
      this.onAnswer(isCorrect, q?.concept ?? '', responseMs);
    }
  }

  _advanceQuestion() {
    this.questionIndex++;

    if (this.questionIndex >= this.totalQuestions || this.lives <= 0) {
      this.state = STATE_COMPLETE;
      this.completeDelay = 1.0;
    } else {
      this.state = STATE_BETWEEN;
      this.betweenTimer = this.betweenDuration;
    }
  }

  _fireComplete() {
    const isPerfect =
      this.correctCount === this.totalQuestions && this.lives === MAX_LIVES;

    if (isPerfect) {
      GameSounds.perfect();
    } else {
      GameSounds.complete(false);
    }

    if (this.onComplete) {
      this.onComplete({
        score: this.score,
        correct: this.correctCount,
        total: this.totalQuestions,
        results: this.results,
        bestStreak: this.bestStreak,
      });
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  onPointerDown(x, _y) {
    if (this.state !== STATE_PLAYING) return;

    // Determine target lane based on tap position
    const thirdWidth = this.width / 3;
    let newLane;
    if (x < thirdWidth) {
      newLane = LANE_LEFT;
    } else if (x > thirdWidth * 2) {
      newLane = LANE_RIGHT;
    } else {
      newLane = LANE_CENTER;
    }

    if (newLane !== this.currentLane && newLane !== this.targetLane) {
      this.laneSlideFrom = this.currentLane;
      this.targetLane = newLane;
      this.laneSlideTimer = LANE_SWITCH_DURATION;
      GameSounds.tap();
    }
  }

  onPointerMove(_x, _y) {
    // Not used for this game
  }

  onPointerUp(_x, _y) {
    // Not used for this game
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    if (w === 0 || h === 0) return;

    ctx.save();

    // Apply shake offset
    if (this.shakeTimer > 0) {
      const intensity = this.shakeIntensity * (this.shakeTimer / 0.3);
      const sx = (Math.random() - 0.5) * 2 * intensity;
      const sy = (Math.random() - 0.5) * 2 * intensity;
      ctx.translate(sx, sy);
    }

    // ── Background ──
    this._drawBackground(ctx, w, h);

    // ── Road lines ──
    this._drawRoadLines(ctx, w, h);

    // ── Lane dividers ──
    this._drawLaneDividers(ctx, w, h);

    // ── Items ──
    this._drawItems(ctx);

    // ── Character ──
    this._drawCharacter(ctx);

    // ── Particles ──
    this.particles.render(ctx);

    // ── HUD: Question text ──
    this._drawHUD(ctx, w, h);

    // ── Complete overlay ──
    if (this.state === STATE_COMPLETE) {
      this._drawCompleteOverlay(ctx, w, h);
    }

    ctx.restore();
  }

  _drawBackground(ctx, w, h) {
    // Road gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#3d3d5c');
    gradient.addColorStop(0.3, '#4a4a6a');
    gradient.addColorStop(1, '#2d2d44');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Subtle road surface
    ctx.fillStyle = 'rgba(80, 80, 120, 0.3)';
    const roadMargin = w * 0.05;
    drawRoundedRect(
      ctx,
      roadMargin,
      0,
      w - roadMargin * 2,
      h,
      0,
      'rgba(80, 80, 120, 0.3)'
    );
  }

  _drawRoadLines(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = ROAD_LINE_WIDTH;
    ctx.setLineDash([ROAD_LINE_HEIGHT, ROAD_LINE_GAP]);

    const linePeriod = ROAD_LINE_HEIGHT + ROAD_LINE_GAP;

    // Draw dashed center lines between lanes
    for (let i = 1; i < LANE_COUNT; i++) {
      const lx = this.laneWidth * i;
      ctx.beginPath();
      ctx.moveTo(lx, -linePeriod + this.roadLineOffset);
      ctx.lineTo(lx, h + linePeriod);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawLaneDividers(ctx, w, _h) {
    // Solid lane edge lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 2;

    // Left edge
    ctx.beginPath();
    ctx.moveTo(w * 0.05, 0);
    ctx.lineTo(w * 0.05, this.height);
    ctx.stroke();

    // Right edge
    ctx.beginPath();
    ctx.moveTo(w * 0.95, 0);
    ctx.lineTo(w * 0.95, this.height);
    ctx.stroke();
  }

  _drawItems(ctx) {
    for (const item of this.items) {
      if (item.collected || item.missed) continue;
      // Only draw if on screen
      if (item.y + ITEM_HEIGHT < 0 || item.y > this.height) continue;

      const bgColor = item.isCorrect
        ? 'rgba(46, 204, 113, 0.85)'
        : 'rgba(231, 76, 60, 0.85)';
      const borderColor = item.isCorrect
        ? this.colors.correct || '#2ECC71'
        : this.colors.incorrect || '#E74C3C';

      // Item block
      drawRoundedRect(
        ctx,
        item.x,
        item.y,
        ITEM_WIDTH,
        ITEM_HEIGHT,
        ITEM_RADIUS,
        bgColor,
        borderColor,
        2
      );

      // Item text
      const fontSize = Math.min(13, ITEM_WIDTH / (item.text.length * 0.55 + 1));
      drawText(
        ctx,
        item.text,
        item.x + ITEM_WIDTH / 2,
        item.y + ITEM_HEIGHT / 2,
        {
          fontSize,
          fontWeight: 'bold',
          color: '#FFFFFF',
          align: 'center',
          baseline: 'middle',
        }
      );
    }
  }

  _drawCharacter(ctx) {
    const cx = this.charX;
    const cy = this.charY;
    const r = CHARACTER_RADIUS;

    // Glow
    ctx.save();
    ctx.shadowColor = this.colors.primary || '#6C5CE7';
    ctx.shadowBlur = 18;
    drawCircle(ctx, cx, cy, r, this.colors.primary || '#6C5CE7', '#FFFFFF', 3);
    ctx.restore();

    // Face (simple eyes + smile)
    ctx.fillStyle = '#FFFFFF';
    // Left eye
    drawCircle(ctx, cx - 8, cy - 6, 3.5, '#FFFFFF');
    // Right eye
    drawCircle(ctx, cx + 8, cy - 6, 3.5, '#FFFFFF');
    // Pupils
    drawCircle(ctx, cx - 8, cy - 6, 1.8, '#2C3E50');
    drawCircle(ctx, cx + 8, cy - 6, 1.8, '#2C3E50');
    // Smile
    ctx.beginPath();
    ctx.arc(cx, cy + 2, 9, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  _drawHUD(ctx, w, _h) {
    // ── Question text at top ──
    if (this.questionIndex < this.totalQuestions) {
      const q = this.questions[this.questionIndex];
      const questionText = q?.question ?? '';

      // Question background
      drawRoundedRect(
        ctx,
        10,
        QUESTION_DISPLAY_Y,
        w - 20,
        40,
        10,
        'rgba(0, 0, 0, 0.55)'
      );

      // Question text (truncate if too long)
      const maxLen = Math.floor(w / 9);
      const displayText =
        questionText.length > maxLen
          ? questionText.substring(0, maxLen - 2) + '..'
          : questionText;

      drawText(ctx, displayText, w / 2, QUESTION_DISPLAY_Y + 20, {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#FFFFFF',
        align: 'center',
        baseline: 'middle',
      });
    }

    // ── Score (top-left) ──
    drawText(ctx, `Score: ${this.score}`, 16, QUESTION_DISPLAY_Y + 56, {
      fontSize: 15,
      fontWeight: 'bold',
      color: this.colors.star || '#FFD700',
      align: 'left',
      baseline: 'middle',
    });

    // ── Question progress ──
    const progressText = `${Math.min(this.questionIndex + 1, this.totalQuestions)}/${this.totalQuestions}`;
    drawText(ctx, progressText, w / 2, QUESTION_DISPLAY_Y + 56, {
      fontSize: 13,
      fontWeight: 'bold',
      color: 'rgba(255, 255, 255, 0.7)',
      align: 'center',
      baseline: 'middle',
    });

    // ── Hearts (top-right) ──
    const heartSize = 16;
    const heartSpacing = 24;
    const heartsStartX = w - 16 - (MAX_LIVES - 1) * heartSpacing;
    for (let i = 0; i < MAX_LIVES; i++) {
      const hx = heartsStartX + i * heartSpacing;
      const hy = QUESTION_DISPLAY_Y + 56;
      this._drawHeart(ctx, hx, hy, heartSize, i < this.lives);
    }

    // ── Streak indicator ──
    if (this.streak >= 2) {
      drawText(ctx, `${this.streak}x Streak!`, w / 2, QUESTION_DISPLAY_Y + 78, {
        fontSize: 13,
        fontWeight: 'bold',
        color: this.colors.streak || '#E17055',
        align: 'center',
        baseline: 'middle',
      });
    }
  }

  _drawHeart(ctx, cx, cy, size, filled) {
    const s = size / 2;
    ctx.save();
    ctx.translate(cx, cy);

    ctx.beginPath();
    ctx.moveTo(0, s * 0.4);
    ctx.bezierCurveTo(-s, -s * 0.2, -s, -s * 0.9, 0, -s * 0.5);
    ctx.bezierCurveTo(s, -s * 0.9, s, -s * 0.2, 0, s * 0.4);
    ctx.closePath();

    if (filled) {
      ctx.fillStyle = this.colors.incorrect || '#E74C3C';
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawCompleteOverlay(ctx, w, h) {
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, w, h);

    const centerY = h * 0.4;

    // Result card background
    drawRoundedRect(
      ctx,
      w * 0.1,
      centerY - 70,
      w * 0.8,
      160,
      16,
      'rgba(255, 255, 255, 0.95)'
    );

    // Title
    const allDead = this.lives <= 0;
    const isPerfect =
      this.correctCount === this.totalQuestions && this.lives === MAX_LIVES;
    let title = 'Run Complete!';
    if (allDead) title = 'Game Over!';
    if (isPerfect) title = 'Perfect Run!';

    drawText(ctx, title, w / 2, centerY - 40, {
      fontSize: 22,
      fontWeight: 'bold',
      color: isPerfect
        ? this.colors.star || '#FFD700'
        : this.colors.textPrimary || '#2C3E50',
      align: 'center',
      baseline: 'middle',
    });

    // Score
    drawText(ctx, `Score: ${this.score}`, w / 2, centerY, {
      fontSize: 18,
      fontWeight: 'bold',
      color: this.colors.primary || '#6C5CE7',
      align: 'center',
      baseline: 'middle',
    });

    // Correct / Total
    drawText(
      ctx,
      `${this.correctCount} / ${this.totalQuestions} Correct`,
      w / 2,
      centerY + 32,
      {
        fontSize: 15,
        fontWeight: 'bold',
        color: this.colors.correct || '#2ECC71',
        align: 'center',
        baseline: 'middle',
      }
    );

    // Best streak
    if (this.bestStreak >= 2) {
      drawText(ctx, `Best Streak: ${this.bestStreak}`, w / 2, centerY + 58, {
        fontSize: 13,
        fontWeight: 'bold',
        color: this.colors.streak || '#E17055',
        align: 'center',
        baseline: 'middle',
      });
    }
  }
}

// ─── React Wrapper ────────────────────────────────────────────────────────────

export default function RunnerDodgeTemplate({config, onAnswer, onComplete}) {
  return (
    <CanvasGameBridge
      GameClass={RunnerGame}
      config={config}
      onAnswer={onAnswer}
      onComplete={onComplete}
      aspectRatio={3 / 4}
    />
  );
}
