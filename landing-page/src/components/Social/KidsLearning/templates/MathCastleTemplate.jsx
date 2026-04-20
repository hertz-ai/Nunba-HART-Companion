/**
 * MathCastleTemplate - Canvas Tower Defense Math Game
 *
 * Castle on the right side defends against enemies marching from the left.
 * Each enemy carries a math question. Answer correctly to fire a projectile
 * that destroys the enemy. Wrong answers damage the castle and speed up the
 * enemy. If an enemy reaches the castle, it takes heavy damage.
 *
 * Rendered entirely on an HTML5 canvas via CanvasGameBridge.
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
  drawHealthBar,
  hitTestRect,
} from '../shared/CanvasSprites';
import {GameSounds} from '../shared/SoundManager';

import React from 'react';

// ─── Constants ──────────────────────────────────────────────────────────────

const ENEMY_SPEED = 40; // px/s base speed
const ENEMY_RADIUS = 30;
const PROJECTILE_SPEED = 400; // px/s
const PROJECTILE_RADIUS = 6;
const CASTLE_WIDTH = 60;
const CASTLE_DAMAGE_WRONG = 10; // % damage on wrong answer
const CASTLE_DAMAGE_REACH = 20; // % damage when enemy reaches castle
const ENEMY_SPEED_BUMP = 8; // extra px/s per wrong answer on current enemy

const ENEMY_COLORS = [
  kidsColors.red,
  kidsColors.purple,
  kidsColors.orange,
  kidsColors.pink,
  kidsColors.blue,
  kidsColors.teal,
];

const OPTION_COLORS = [
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.purple,
];

// ─── Game States ────────────────────────────────────────────────────────────

const STATE_PLAYING = 'playing';
const STATE_PROJECTILE = 'projectile';
const STATE_GAME_OVER = 'game_over';

// ─── MathCastleGame (canvas game class) ─────────────────────────────────────

class MathCastleGame {
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
    this.totalQuestions = this.questions.length;

    // Dimensions (set properly in resize / start)
    this.w = 0;
    this.h = 0;

    // Game state
    this.state = STATE_PLAYING;
    this.currentIndex = 0;
    this.score = 0;
    this.correctCount = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.results = [];
    this.questionStartTime = 0;

    // Castle
    this.castleHealth = 100;
    this.castleX = 0; // set in resize
    this.castleShake = 0;

    // Enemy
    this.enemy = null; // { x, y, speed, color, alive }
    this.wrongCountThisEnemy = 0;

    // Projectile
    this.projectile = null; // { x, y, targetX, targetY, alive }

    // Particles
    this.particles = new ParticlePool();

    // Answer buttons (computed on resize / per question)
    this.buttons = []; // [{ x, y, w, h, label, index }]

    // Feedback flash
    this.feedbackTimer = 0; // seconds remaining for feedback display
    this.feedbackCorrect = false;

    // Completed flag
    this.completed = false;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  start() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this._computeCastle();
    this._spawnEnemy();
    this._buildButtons();
    this.questionStartTime = performance.now();
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this._computeCastle();
    this._buildButtons();
  }

  destroy() {
    this.particles.reset();
  }

  // ── Layout helpers ─────────────────────────────────────────────────────

  _computeCastle() {
    // Castle lives at right edge with some padding
    this.castleX = this.w - CASTLE_WIDTH - 16;
  }

  /** Build tappable answer button rects for the current question. */
  _buildButtons() {
    const q = this.questions[this.currentIndex];
    if (!q) {
      this.buttons = [];
      return;
    }

    const options = q.options ?? [];
    const count = options.length;
    if (count === 0) {
      this.buttons = [];
      return;
    }

    const padding = 10;
    const gap = 8;
    const btnHeight = 42;
    // Area for buttons: bottom of canvas
    const areaTop = this.h - padding - btnHeight;
    const totalGap = gap * (count - 1);
    const availableWidth = this.w - padding * 2 - totalGap;
    const btnWidth = Math.min(availableWidth / count, 160);
    const totalBtnWidth = btnWidth * count + totalGap;
    const startX = (this.w - totalBtnWidth) / 2;

    this.buttons = options.map((label, i) => ({
      x: startX + i * (btnWidth + gap),
      y: areaTop,
      w: btnWidth,
      h: btnHeight,
      label,
      index: i,
    }));
  }

  // ── Spawning ──────────────────────────────────────────────────────────

  _spawnEnemy() {
    if (this.currentIndex >= this.totalQuestions) return;
    const color = ENEMY_COLORS[this.currentIndex % ENEMY_COLORS.length];
    this.enemy = {
      x: -ENEMY_RADIUS,
      y: this._enemyLaneY(),
      speed: ENEMY_SPEED,
      color,
      alive: true,
    };
    this.wrongCountThisEnemy = 0;
  }

  _enemyLaneY() {
    // Enemies march in the upper-middle portion of the canvas
    return this.h * 0.38;
  }

  // ── Update ────────────────────────────────────────────────────────────

  update(dt) {
    // Particles always update
    this.particles.update(dt);

    // Castle shake decay
    if (this.castleShake > 0) {
      this.castleShake = Math.max(0, this.castleShake - dt * 12);
    }

    // Feedback timer decay
    if (this.feedbackTimer > 0) {
      this.feedbackTimer = Math.max(0, this.feedbackTimer - dt);
    }

    if (this.state === STATE_GAME_OVER) return;

    // ── Projectile phase ────────────────────────────────────────────
    if (this.state === STATE_PROJECTILE && this.projectile) {
      const p = this.projectile;
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 8) {
        // Hit!
        this._onProjectileHit();
      } else {
        const step = PROJECTILE_SPEED * dt;
        const ratio = step / dist;
        p.x += dx * ratio;
        p.y += dy * ratio;
      }
      return;
    }

    // ── Playing phase: move enemy ───────────────────────────────────
    if (this.state === STATE_PLAYING && this.enemy && this.enemy.alive) {
      this.enemy.x += this.enemy.speed * dt;

      // Check if enemy reached castle
      if (this.enemy.x + ENEMY_RADIUS >= this.castleX) {
        this._onEnemyReachesCastle();
      }
    }
  }

  // ── Collision / Event handlers ────────────────────────────────────────

  _onProjectileHit() {
    const ex = this.enemy ? this.enemy.x : this.projectile.targetX;
    const ey = this.enemy ? this.enemy.y : this.projectile.targetY;

    // Explosion particles
    const preset = ParticlePool.popExplosion(ex, ey, 20);
    this.particles.emitPreset(preset);
    GameSounds.explosion();

    // Remove enemy
    if (this.enemy) this.enemy.alive = false;
    this.projectile = null;

    // Advance to next question
    this._advanceQuestion();
  }

  _onEnemyReachesCastle() {
    this.castleHealth = Math.max(0, this.castleHealth - CASTLE_DAMAGE_REACH);
    this.castleShake = 1.0;
    GameSounds.castleHit();

    // Remove enemy
    if (this.enemy) this.enemy.alive = false;

    // Record as wrong for this question (enemy wasn't defeated by correct answer)
    // Only record if we haven't already recorded a result for this question
    const alreadyRecorded = this.results.some(
      (r) => r.questionIndex === this.currentIndex
    );
    if (!alreadyRecorded) {
      const q = this.questions[this.currentIndex];
      this.results.push({
        questionIndex: this.currentIndex,
        question: q?.question ?? '',
        isCorrect: false,
        concept: q?.concept ?? '',
        responseTimeMs: performance.now() - this.questionStartTime,
      });
      this.streak = 0;
      if (this.onAnswer) {
        this.onAnswer(
          false,
          q?.concept ?? '',
          performance.now() - this.questionStartTime
        );
      }
    }

    // Check game over
    if (this.castleHealth <= 0) {
      this._endGame();
      return;
    }

    this._advanceQuestion();
  }

  _advanceQuestion() {
    this.currentIndex++;
    if (this.currentIndex >= this.totalQuestions || this.castleHealth <= 0) {
      this._endGame();
      return;
    }
    this.state = STATE_PLAYING;
    this._spawnEnemy();
    this._buildButtons();
    this.questionStartTime = performance.now();
  }

  _endGame() {
    this.state = STATE_GAME_OVER;
    this.enemy = null;
    this.projectile = null;

    if (!this.completed) {
      this.completed = true;

      // Celebration particles if good score
      if (this.correctCount > this.totalQuestions / 2) {
        const preset = ParticlePool.confettiBurst(this.w / 2, this.h * 0.3, 30);
        this.particles.emitPreset(preset);
        GameSounds.complete(this.correctCount === this.totalQuestions);
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
  }

  // ── Answer handling ───────────────────────────────────────────────────

  _handleAnswer(optionIndex) {
    if (this.state !== STATE_PLAYING) return;
    if (!this.enemy || !this.enemy.alive) return;

    const q = this.questions[this.currentIndex];
    if (!q) return;

    const elapsed = performance.now() - this.questionStartTime;
    const isCorrect = optionIndex === q.correctIndex;

    if (isCorrect) {
      // ── Correct answer ────────────────────────────────────────
      GameSounds.correct();
      this.correctCount++;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.score += 10 + Math.floor(this.streak * 2);

      // Streak sound milestones
      if (this.streak === 3 || this.streak === 5 || this.streak === 10) {
        GameSounds.streak(this.streak);
      }

      // Record result
      this.results.push({
        questionIndex: this.currentIndex,
        question: q.question,
        isCorrect: true,
        concept: q.concept ?? '',
        responseTimeMs: elapsed,
      });

      if (this.onAnswer) this.onAnswer(true, q.concept ?? '', elapsed);

      // Fire projectile from castle to enemy
      this.state = STATE_PROJECTILE;
      this.projectile = {
        x: this.castleX,
        y: this._castleMidY(),
        targetX: this.enemy.x,
        targetY: this.enemy.y,
        alive: true,
      };

      // Show feedback
      this.feedbackTimer = 0.5;
      this.feedbackCorrect = true;
    } else {
      // ── Wrong answer ──────────────────────────────────────────
      GameSounds.wrong();
      this.streak = 0;
      this.wrongCountThisEnemy++;

      // Castle takes damage
      this.castleHealth = Math.max(0, this.castleHealth - CASTLE_DAMAGE_WRONG);
      this.castleShake = 0.6;

      // Enemy speeds up
      if (this.enemy) {
        this.enemy.speed += ENEMY_SPEED_BUMP;
      }

      // Show feedback
      this.feedbackTimer = 0.5;
      this.feedbackCorrect = false;

      // Check game over
      if (this.castleHealth <= 0) {
        // Record as wrong
        this.results.push({
          questionIndex: this.currentIndex,
          question: q.question,
          isCorrect: false,
          concept: q.concept ?? '',
          responseTimeMs: elapsed,
        });
        if (this.onAnswer) this.onAnswer(false, q.concept ?? '', elapsed);
        this._endGame();
      }
    }
  }

  _castleMidY() {
    // Castle body center
    return this.h * 0.35;
  }

  // ── Pointer Events ────────────────────────────────────────────────────

  onPointerDown(x, y) {
    if (this.state !== STATE_PLAYING) return;

    // Check button taps
    for (const btn of this.buttons) {
      if (hitTestRect(x, y, btn.x, btn.y, btn.w, btn.h)) {
        GameSounds.tap();
        this._handleAnswer(btn.index);
        return;
      }
    }
  }

  onPointerMove(_x, _y) {
    // No drag interactions needed
  }

  onPointerUp(_x, _y) {
    // No-op
  }

  // ── Render ────────────────────────────────────────────────────────────

  render() {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;

    if (w === 0 || h === 0) return;

    // ── Clear / background ──────────────────────────────────────
    ctx.save();
    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    skyGrad.addColorStop(0, '#87CEEB');
    skyGrad.addColorStop(1, '#E0F7FA');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Ground
    const groundY = h * 0.58;
    const groundGrad = ctx.createLinearGradient(0, groundY, 0, h);
    groundGrad.addColorStop(0, '#7CB342');
    groundGrad.addColorStop(0.3, '#689F38');
    groundGrad.addColorStop(1, '#558B2F');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, groundY, w, h - groundY);

    // Ground line
    ctx.strokeStyle = '#8BC34A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(w, groundY);
    ctx.stroke();

    // ── HUD: Wave counter (top center) ──────────────────────────
    const waveText = `Wave ${Math.min(this.currentIndex + 1, this.totalQuestions)}/${this.totalQuestions}`;
    drawText(ctx, waveText, w / 2, 20, {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#FFFFFF',
      align: 'center',
      baseline: 'middle',
    });

    // ── HUD: Castle health (top left) ───────────────────────────
    drawText(ctx, 'Castle', 12, 14, {
      fontSize: 11,
      fontWeight: '600',
      color: '#FFFFFF',
      align: 'left',
      baseline: 'middle',
    });
    const healthColor =
      this.castleHealth > 60
        ? kidsColors.correct
        : this.castleHealth > 30
          ? kidsColors.yellow
          : kidsColors.red;
    drawHealthBar(
      ctx,
      12,
      22,
      80,
      8,
      this.castleHealth,
      '#FFFFFF40',
      healthColor
    );

    // ── HUD: Score (top right) ──────────────────────────────────
    drawText(ctx, `Score: ${this.score}`, w - 12, 20, {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#FFFFFF',
      align: 'right',
      baseline: 'middle',
    });

    // ── Castle ──────────────────────────────────────────────────
    ctx.save();
    const shakeX =
      this.castleShake > 0
        ? Math.sin(this.castleShake * 30) * this.castleShake * 4
        : 0;
    ctx.translate(shakeX, 0);
    this._drawCastle(ctx);
    ctx.restore();

    // ── Enemy ───────────────────────────────────────────────────
    if (this.enemy && this.enemy.alive) {
      this._drawEnemy(ctx, this.enemy);
    }

    // ── Projectile ──────────────────────────────────────────────
    if (this.projectile && this.projectile.alive) {
      drawCircle(
        ctx,
        this.projectile.x,
        this.projectile.y,
        PROJECTILE_RADIUS,
        '#FFD700',
        '#FF8F00',
        2
      );
      // Glow trail
      ctx.save();
      ctx.globalAlpha = 0.3;
      drawCircle(
        ctx,
        this.projectile.x,
        this.projectile.y,
        PROJECTILE_RADIUS * 2.5,
        '#FFD700'
      );
      ctx.restore();
    }

    // ── Question text (above buttons) ───────────────────────────
    if (this.state === STATE_PLAYING || this.state === STATE_PROJECTILE) {
      const q = this.questions[this.currentIndex];
      if (q) {
        // Question background bar
        const qBarY = this.h - 100;
        const qBarH = 36;
        drawRoundedRect(
          ctx,
          8,
          qBarY,
          w - 16,
          qBarH,
          10,
          'rgba(255,255,255,0.92)',
          kidsColors.primary,
          1.5
        );
        drawText(ctx, q.question, w / 2, qBarY + qBarH / 2, {
          fontSize: 15,
          fontWeight: 'bold',
          color: kidsColors.textPrimary,
          align: 'center',
          baseline: 'middle',
        });
      }
    }

    // ── Answer buttons ──────────────────────────────────────────
    if (this.state === STATE_PLAYING) {
      for (const btn of this.buttons) {
        const color = OPTION_COLORS[btn.index % OPTION_COLORS.length];
        // Button shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.15)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        drawRoundedRect(ctx, btn.x, btn.y, btn.w, btn.h, 10, color);
        ctx.restore();

        // Button label
        drawText(ctx, btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2, {
          fontSize: 14,
          fontWeight: 'bold',
          color: '#FFFFFF',
          align: 'center',
          baseline: 'middle',
        });
      }
    }

    // ── Feedback flash ──────────────────────────────────────────
    if (this.feedbackTimer > 0) {
      const alpha = Math.min(1, this.feedbackTimer * 3);
      ctx.save();
      ctx.globalAlpha = alpha * 0.25;
      ctx.fillStyle = this.feedbackCorrect
        ? kidsColors.correct
        : kidsColors.red;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // Feedback text
      const fbText = this.feedbackCorrect ? 'Correct!' : 'Wrong!';
      const fbColor = this.feedbackCorrect
        ? kidsColors.correct
        : kidsColors.red;
      ctx.save();
      ctx.globalAlpha = alpha;
      drawText(ctx, fbText, w / 2, h * 0.18, {
        fontSize: 28,
        fontWeight: 'bold',
        color: fbColor,
        align: 'center',
        baseline: 'middle',
      });
      ctx.restore();
    }

    // ── Particles ───────────────────────────────────────────────
    this.particles.render(ctx);

    // ── Game Over overlay ───────────────────────────────────────
    if (this.state === STATE_GAME_OVER) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, w, h);

      const centerY = h * 0.35;

      // Title
      const titleText = this.castleHealth <= 0 ? 'Castle Fallen!' : 'Victory!';
      const titleColor =
        this.castleHealth <= 0 ? kidsColors.red : kidsColors.star;
      drawText(ctx, titleText, w / 2, centerY - 30, {
        fontSize: 30,
        fontWeight: 'bold',
        color: titleColor,
        align: 'center',
        baseline: 'middle',
      });

      // Score
      drawText(ctx, `Score: ${this.score}`, w / 2, centerY + 10, {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF',
        align: 'center',
        baseline: 'middle',
      });

      // Correct count
      drawText(
        ctx,
        `${this.correctCount} / ${this.totalQuestions} correct`,
        w / 2,
        centerY + 40,
        {
          fontSize: 16,
          fontWeight: '600',
          color: '#FFFFFFCC',
          align: 'center',
          baseline: 'middle',
        }
      );

      // Best streak
      if (this.bestStreak >= 2) {
        drawText(ctx, `Best streak: ${this.bestStreak}`, w / 2, centerY + 65, {
          fontSize: 14,
          fontWeight: '600',
          color: kidsColors.yellow,
          align: 'center',
          baseline: 'middle',
        });
      }

      ctx.restore();
    }

    ctx.restore();
  }

  // ── Drawing helpers ───────────────────────────────────────────────────

  _drawCastle(ctx) {
    const cx = this.castleX;
    const groundY = this.h * 0.58;
    const castleH = 100;
    const castleTop = groundY - castleH;
    const towerW = CASTLE_WIDTH;

    // Main tower body
    drawRoundedRect(
      ctx,
      cx,
      castleTop,
      towerW,
      castleH,
      4,
      '#8D6E63',
      '#5D4037',
      2
    );

    // Battlements (crenellations) on top
    const crenW = 12;
    const crenH = 10;
    const crenGap = 4;
    const numCrens = Math.floor(towerW / (crenW + crenGap));
    const crenStartX =
      cx + (towerW - numCrens * (crenW + crenGap) + crenGap) / 2;
    for (let i = 0; i < numCrens; i++) {
      const bx = crenStartX + i * (crenW + crenGap);
      ctx.fillStyle = '#8D6E63';
      ctx.strokeStyle = '#5D4037';
      ctx.lineWidth = 1.5;
      ctx.fillRect(bx, castleTop - crenH, crenW, crenH);
      ctx.strokeRect(bx, castleTop - crenH, crenW, crenH);
    }

    // Door
    const doorW = 18;
    const doorH = 26;
    const doorX = cx + (towerW - doorW) / 2;
    const doorY = groundY - doorH;
    drawRoundedRect(ctx, doorX, doorY, doorW, doorH, 4, '#4E342E');

    // Window (arrow slit)
    const windowY = castleTop + 22;
    const windowW = 6;
    const windowH = 16;
    const windowX = cx + (towerW - windowW) / 2;
    drawRoundedRect(ctx, windowX, windowY, windowW, windowH, 2, '#3E2723');

    // Flag pole
    const poleX = cx + towerW / 2;
    const poleTop = castleTop - crenH - 20;
    ctx.strokeStyle = '#5D4037';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(poleX, castleTop - crenH);
    ctx.lineTo(poleX, poleTop);
    ctx.stroke();

    // Flag
    ctx.fillStyle = kidsColors.red;
    ctx.beginPath();
    ctx.moveTo(poleX, poleTop);
    ctx.lineTo(poleX + 14, poleTop + 6);
    ctx.lineTo(poleX, poleTop + 12);
    ctx.closePath();
    ctx.fill();

    // Health bar above castle
    const hbWidth = towerW + 10;
    const hbX = cx - 5;
    const hbY = castleTop - crenH - 30;
    const hbColor =
      this.castleHealth > 60
        ? kidsColors.correct
        : this.castleHealth > 30
          ? kidsColors.yellow
          : kidsColors.red;
    drawHealthBar(
      ctx,
      hbX,
      hbY,
      hbWidth,
      7,
      this.castleHealth,
      'rgba(255,255,255,0.5)',
      hbColor
    );
  }

  _drawEnemy(ctx, enemy) {
    const {x, y, color} = enemy;

    // Shadow
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.ellipse(
      x,
      this.h * 0.58,
      ENEMY_RADIUS * 0.8,
      ENEMY_RADIUS * 0.25,
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();

    // Body circle
    drawCircle(ctx, x, y, ENEMY_RADIUS, color, '#FFFFFF', 2.5);

    // Inner lighter circle
    ctx.save();
    ctx.globalAlpha = 0.3;
    drawCircle(ctx, x - 5, y - 5, ENEMY_RADIUS * 0.35, '#FFFFFF');
    ctx.restore();

    // Question mark
    drawText(ctx, '?', x, y, {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#FFFFFF',
      align: 'center',
      baseline: 'middle',
    });
  }
}

// ─── React Wrapper ──────────────────────────────────────────────────────────

export default function MathCastleTemplate({config, onAnswer, onComplete}) {
  return (
    <CanvasGameBridge
      GameClass={MathCastleGame}
      config={config}
      onAnswer={onAnswer}
      onComplete={onComplete}
      aspectRatio={4 / 3}
    />
  );
}
