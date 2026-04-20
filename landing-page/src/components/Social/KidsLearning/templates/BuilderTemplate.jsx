/**
 * BuilderTemplate - Canvas-based Kids Block Stacking Game
 *
 * Tower-building educational game: option blocks in a row near the top,
 * child taps the correct answer to drop a block onto a growing tower.
 * Wrong answers crack, shake, and tumble off screen. Tower wobbles on
 * each landing with a damped sine wave; blocks squash/stretch on impact.
 *
 * Config: { content: { questions: [{ question, options: string[],
 *           correctIndex: number, concept?: string }] } }
 *
 * Props: config, onAnswer(isCorrect, concept, responseTimeMs),
 *        onComplete({ score, correct, total, results, bestStreak })
 */

import {kidsColors} from '../kidsTheme';
import CanvasGameBridge from '../shared/CanvasGameBridge';
import ParticlePool from '../shared/CanvasParticles';
import {drawRoundedRect, drawText, hitTestRect} from '../shared/CanvasSprites';
import {GameSounds} from '../shared/SoundManager';

import React from 'react';

// ─── Constants ──────────────────────────────────────────────────────────────

const BLOCK_COLORS = [
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.purple,
  kidsColors.green,
];
const BG_COLOR = '#FFF9E6';
const OPTION_AREA_TOP = 90;
const OPT_H = 48,
  OPT_R = 12,
  OPT_GAP = 10,
  OPT_MIN_W = 80,
  OPT_MAX_W = 140;
const TB_H = 60,
  TB_BASE_W = 120,
  TB_W_VAR = 20,
  TB_R = 8;
const GRAVITY = 800;
const SQUASH_DUR = 0.3,
  SQUASH_SY = 0.7,
  SQUASH_SX = 1.3;
const WOBBLE_DUR = 1.0,
  WOBBLE_FREQ = 8,
  WOBBLE_AMP = 6;
const CRACK_DUR = 0.4,
  CRACK_MAG = 10,
  CRACK_SPEED = 300,
  CRACK_G = 600,
  CRACK_ROT = 4;
const ADVANCE_DELAY = 1.2;

function darkenHex(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (n >> 16) - amt);
  const g = Math.max(0, ((n >> 8) & 0xff) - amt);
  const b = Math.max(0, (n & 0xff) - amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function lightenHex(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (n >> 16) + amt);
  const g = Math.min(255, ((n >> 8) & 0xff) + amt);
  const b = Math.min(255, (n & 0xff) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ─── BuilderGame ────────────────────────────────────────────────────────────

class BuilderGame {
  constructor(canvas, {config, onAnswer, onComplete, reducedMotion, colors}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onAnswer = onAnswer;
    this.onComplete = onComplete;
    this.reducedMotion = reducedMotion;
    this.colors = colors || kidsColors;

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

    this.width = canvas.style.width
      ? parseFloat(canvas.style.width)
      : canvas.width;
    this.height = canvas.style.height
      ? parseFloat(canvas.style.height)
      : canvas.height;

    this.questionIndex = 0;
    this.score = 0;
    this.correct = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.results = [];
    this.finished = false;

    this.optionBlocks = [];
    this.questionStartTime = 0;
    this.towerBlocks = [];
    this.towerBaseY = 0;
    this.fallingBlock = null;
    this.landingTarget = 0;

    this.squashTimer = 0;
    this.squashing = false;
    this.wobbleTimer = 0;
    this.wobbleAmplitude = 0;
    this.wobbling = false;
    this.crackBlock = null;

    this.transitioning = false;
    this.transitionTimer = 0;
    this.particles = new ParticlePool();
    this.celebrationTimer = 0;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start() {
    if (this.questions.length === 0) {
      this.finished = true;
      if (this.onComplete)
        this.onComplete({
          score: 0,
          correct: 0,
          total: 0,
          results: [],
          bestStreak: 0,
        });
      return;
    }
    this.towerBaseY = this.height - 30;
    this._setupQuestion();
  }

  destroy() {
    this.particles.reset();
    this.optionBlocks = [];
    this.towerBlocks = [];
    this.fallingBlock = null;
    this.crackBlock = null;
  }

  resize(w, h) {
    const delta = h - this.height;
    this.width = w;
    this.height = h;
    this.towerBaseY += delta;
    for (const tb of this.towerBlocks) tb.y += delta;
    this._layoutOptionBlocks();
  }

  // ── Question Setup ────────────────────────────────────────────────────────

  _setupQuestion() {
    const q = this.questions[this.questionIndex];
    if (!q) return;

    this.fallingBlock = null;
    this.crackBlock = null;
    this.squashing = false;
    this.squashTimer = 0;
    this.transitioning = false;
    this.transitionTimer = 0;
    this.questionStartTime = performance.now();

    this.optionBlocks = q.options.map((label, i) => ({
      id: i,
      label,
      isCorrect: i === q.correctIndex,
      color: BLOCK_COLORS[i % BLOCK_COLORS.length],
      x: 0,
      y: 0,
      width: 0,
      height: OPT_H,
      visible: true,
      shakeTimer: 0,
      shakeOffsetX: 0,
    }));
    this._layoutOptionBlocks();
  }

  _layoutOptionBlocks() {
    if (this.optionBlocks.length === 0) return;
    const count = this.optionBlocks.length;
    const ctx = this.ctx;

    ctx.save();
    ctx.font = 'bold 15px "Nunito", sans-serif';
    const widths = this.optionBlocks.map((ob) => {
      const tw = ctx.measureText(ob.label).width;
      return Math.max(OPT_MIN_W, Math.min(OPT_MAX_W, tw + 30));
    });
    ctx.restore();

    const totalW = widths.reduce((s, w) => s + w, 0) + (count - 1) * OPT_GAP;
    const avail = this.width - 20;
    const scale = totalW > avail ? avail / totalW : 1;
    const sw = widths.map((w) => w * scale);
    const sg = OPT_GAP * scale;
    const stw = sw.reduce((s, w) => s + w, 0) + (count - 1) * sg;
    let sx = (this.width - stw) / 2;

    for (let i = 0; i < count; i++) {
      this.optionBlocks[i].x = sx;
      this.optionBlocks[i].y = OPTION_AREA_TOP;
      this.optionBlocks[i].width = sw[i];
      this.optionBlocks[i].height = OPT_H * Math.min(scale, 1);
      sx += sw[i] + sg;
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt) {
    if (this.finished) {
      this.particles.update(dt);
      this.celebrationTimer += dt;
      return;
    }
    this.particles.update(dt);

    // Falling block gravity
    if (this.fallingBlock && !this.fallingBlock.landed) {
      this.fallingBlock.vy += GRAVITY * dt;
      this.fallingBlock.y += this.fallingBlock.vy * dt;
      if (this.fallingBlock.y >= this.landingTarget) {
        this.fallingBlock.y = this.landingTarget;
        this.fallingBlock.landed = true;
        this.fallingBlock.vy = 0;
        this.squashing = true;
        this.squashTimer = 0;
        this.wobbling = true;
        this.wobbleTimer = WOBBLE_DUR;
        this.wobbleAmplitude = WOBBLE_AMP;
        GameSounds.blockStack();
        this._emitDust(
          this.fallingBlock.x + this.fallingBlock.width / 2,
          this.fallingBlock.y + TB_H
        );
        this.towerBlocks.push({
          x: this.fallingBlock.x,
          y: this.fallingBlock.y,
          width: this.fallingBlock.width,
          height: TB_H,
          color: this.fallingBlock.color,
          label: this.fallingBlock.label,
        });
        this.transitioning = true;
        this.transitionTimer = 0;
      }
    }

    // Squash spring-back
    if (this.squashing) {
      this.squashTimer += dt;
      if (this.squashTimer >= SQUASH_DUR) {
        this.squashing = false;
        this.squashTimer = SQUASH_DUR;
      }
    }

    // Tower wobble dampen
    if (this.wobbling) {
      this.wobbleTimer -= dt;
      if (this.wobbleTimer <= 0) {
        this.wobbleTimer = 0;
        this.wobbling = false;
        this.wobbleAmplitude = 0;
      }
    }

    // Crack block (wrong answer) animation
    if (this.crackBlock) {
      this.crackBlock.timer -= dt;
      if (this.crackBlock.timer > CRACK_DUR * 0.5) {
        const p = (this.crackBlock.timer - CRACK_DUR * 0.5) / (CRACK_DUR * 0.5);
        this.crackBlock.shakeOffsetX =
          Math.sin(this.crackBlock.timer * 50) * CRACK_MAG * p;
      } else if (this.crackBlock.timer > 0) {
        this.crackBlock.shakeOffsetX = 0;
        if (!this.crackBlock.falling) {
          this.crackBlock.falling = true;
          const cx = this.crackBlock.x + this.crackBlock.width / 2;
          const dir = cx < this.width / 2 ? -1 : 1;
          this.crackBlock.vx = dir * CRACK_SPEED;
          this.crackBlock.vy = -100;
          this.crackBlock.rotSpeed = dir * CRACK_ROT;
          GameSounds.blockFall();
        }
      }
      if (this.crackBlock.falling) {
        this.crackBlock.vy += CRACK_G * dt;
        this.crackBlock.x += this.crackBlock.vx * dt;
        this.crackBlock.y += this.crackBlock.vy * dt;
        this.crackBlock.rotation += this.crackBlock.rotSpeed * dt;
        this.crackBlock.alpha = Math.max(0, this.crackBlock.alpha - dt * 1.5);
      }
      if (this.crackBlock.y > this.height + 100 || this.crackBlock.alpha <= 0)
        this.crackBlock = null;
    }

    // Option block shake
    for (const ob of this.optionBlocks) {
      if (ob.shakeTimer > 0) {
        ob.shakeTimer -= dt;
        if (ob.shakeTimer <= 0) {
          ob.shakeTimer = 0;
          ob.shakeOffsetX = 0;
        } else {
          ob.shakeOffsetX =
            Math.sin(ob.shakeTimer * 40) *
            CRACK_MAG *
            (ob.shakeTimer / CRACK_DUR);
        }
      }
    }

    // Transition delay
    if (this.transitioning) {
      this.transitionTimer += dt;
      if (this.transitionTimer >= ADVANCE_DELAY) {
        this.transitioning = false;
        this._advanceQuestion();
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    const ctx = this.ctx,
      w = this.width,
      h = this.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, h * 0.6, 0, h);
    grad.addColorStop(0, 'rgba(255, 249, 230, 0)');
    grad.addColorStop(1, 'rgba(253, 203, 110, 0.18)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, h * 0.6, w, h * 0.4);

    this._drawGround(ctx, w, h);

    // HUD
    const q = this.questions[this.questionIndex];
    const total = this.questions.length;
    drawText(ctx, `${this.questionIndex + 1}/${total}`, 14, 22, {
      fontSize: 14,
      fontWeight: 'bold',
      color: kidsColors.textSecondary,
      align: 'left',
      baseline: 'middle',
    });
    drawText(ctx, `${this.correct}/${total}`, w - 14, 22, {
      fontSize: 14,
      fontWeight: 'bold',
      color: kidsColors.primary,
      align: 'right',
      baseline: 'middle',
    });
    if (this.streak >= 2) {
      drawText(ctx, `${this.streak} streak!`, w / 2, 22, {
        fontSize: 13,
        fontWeight: 'bold',
        color: kidsColors.streakFire,
        align: 'center',
        baseline: 'middle',
      });
    }
    if (q && !this.finished)
      this._drawWrappedQuestion(ctx, q.question, w / 2, 42, w - 40, 18);

    // Option blocks
    if (!this.finished) {
      for (const ob of this.optionBlocks) {
        if (!ob.visible) continue;
        ctx.save();
        const dx = ob.x + ob.shakeOffsetX,
          dy = ob.y;
        ctx.shadowColor = 'rgba(0,0,0,0.12)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
        drawRoundedRect(ctx, dx, dy, ob.width, ob.height, OPT_R, ob.color);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        // Highlight top half
        ctx.save();
        ctx.beginPath();
        ctx.rect(dx, dy, ob.width, ob.height / 2);
        ctx.clip();
        drawRoundedRect(
          ctx,
          dx,
          dy,
          ob.width,
          ob.height,
          OPT_R,
          'rgba(255,255,255,0.2)'
        );
        ctx.restore();
        const fs = this._labelFontSize(ob.label, ob.width - 10, 15);
        drawText(ctx, ob.label, dx + ob.width / 2, dy + ob.height / 2, {
          fontSize: fs,
          fontWeight: 'bold',
          color: '#FFF',
          align: 'center',
          baseline: 'middle',
        });
        ctx.restore();
      }
    }

    this._drawTower(ctx);
    if (this.fallingBlock && !this.fallingBlock.landed)
      this._drawFalling(ctx, this.fallingBlock);
    if (this.crackBlock) this._drawCrack(ctx, this.crackBlock);
    this.particles.render(ctx);
    if (this.finished) this._drawFinished(ctx, w, h);
  }

  // ── Drawing Helpers ───────────────────────────────────────────────────────

  _drawGround(ctx, w, h) {
    const gy = this.towerBaseY;
    ctx.fillStyle = '#E8D5B7';
    ctx.fillRect(0, gy, w, h - gy);
    ctx.strokeStyle = '#D4B896';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
    ctx.fillStyle = '#A8D8A0';
    for (let gx = 10; gx < w; gx += 30) {
      const th = 4 + Math.sin(gx * 0.7) * 2;
      ctx.beginPath();
      ctx.ellipse(gx, gy - 1, 6, th, 0, 0, Math.PI, true);
      ctx.fill();
    }
  }

  _drawTower(ctx) {
    const n = this.towerBlocks.length;
    if (n === 0) return;

    for (let i = 0; i < n; i++) {
      const tb = this.towerBlocks[i];
      let ox = 0;
      // Wobble — more for higher blocks
      if (this.wobbling && !this.reducedMotion) {
        const damp = this.wobbleTimer / WOBBLE_DUR;
        const hf = n > 1 ? (i + 1) / n : 1;
        ox =
          Math.sin(this.wobbleTimer * WOBBLE_FREQ * Math.PI * 2) *
          this.wobbleAmplitude *
          damp *
          hf;
      }
      const isTop = i === n - 1;
      let scX = 1,
        scY = 1;
      if (isTop && this.squashing) {
        const t = this.squashTimer / SQUASH_DUR;
        const spring = 1 - Math.exp(-t * 6) * Math.cos(t * Math.PI * 4);
        scX = SQUASH_SX + (1 - SQUASH_SX) * spring;
        scY = SQUASH_SY + (1 - SQUASH_SY) * spring;
      }
      ctx.save();
      const bx = tb.x + ox,
        by = tb.y,
        bw = tb.width,
        bh = tb.height;
      if (isTop && this.squashing) {
        const cx = bx + bw / 2,
          bot = by + bh;
        ctx.translate(cx, bot);
        ctx.scale(scX, scY);
        ctx.translate(-cx, -bot);
      }
      this._drawBlock3D(ctx, bx, by, bw, bh, tb.color);
      const fs = this._labelFontSize(tb.label, bw - 10, 14);
      drawText(ctx, tb.label, bx + bw / 2, by + bh / 2, {
        fontSize: fs,
        fontWeight: 'bold',
        color: '#FFF',
        align: 'center',
        baseline: 'middle',
      });
      ctx.restore();
    }
  }

  _drawBlock3D(ctx, x, y, w, h, color) {
    drawRoundedRect(ctx, x, y, w, h, TB_R, color);
    // Top highlight
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h * 0.35);
    ctx.clip();
    drawRoundedRect(ctx, x, y, w, h, TB_R, lightenHex(color, 30));
    ctx.restore();
    // Bottom shadow
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y + h * 0.75, w, h * 0.25);
    ctx.clip();
    drawRoundedRect(ctx, x, y, w, h, TB_R, darkenHex(color, 25));
    ctx.restore();
    // Border
    ctx.save();
    ctx.strokeStyle = darkenHex(color, 40);
    ctx.lineWidth = 1.5;
    const r = TB_R;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  _drawFalling(ctx, fb) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;
    this._drawBlock3D(ctx, fb.x, fb.y, fb.width, TB_H, fb.color);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    const fs = this._labelFontSize(fb.label, fb.width - 10, 14);
    drawText(ctx, fb.label, fb.x + fb.width / 2, fb.y + TB_H / 2, {
      fontSize: fs,
      fontWeight: 'bold',
      color: '#FFF',
      align: 'center',
      baseline: 'middle',
    });
    ctx.restore();
  }

  _drawCrack(ctx, cb) {
    ctx.save();
    ctx.globalAlpha = cb.alpha;
    const cx = cb.x + cb.width / 2,
      cy = cb.y + cb.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(cb.rotation);
    ctx.translate(-cx, -cy);
    drawRoundedRect(ctx, cb.x, cb.y, cb.width, cb.height, OPT_R, cb.color);
    // Crack lines
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 3, cb.y + 4);
    ctx.lineTo(cx + 8, cy - 4);
    ctx.lineTo(cx + 3, cy + 2);
    ctx.lineTo(cx + 14, cb.y + cb.height - 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy - 6);
    ctx.lineTo(cx - 10, cy + 4);
    ctx.lineTo(cx - 6, cb.y + cb.height - 8);
    ctx.stroke();
    // X mark
    ctx.strokeStyle = 'rgba(231,76,60,0.8)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const xs = Math.min(cb.width, cb.height) * 0.25;
    ctx.beginPath();
    ctx.moveTo(cx - xs, cy - xs);
    ctx.lineTo(cx + xs, cy + xs);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + xs, cy - xs);
    ctx.lineTo(cx - xs, cy + xs);
    ctx.stroke();
    // Dimmed label
    const fs = this._labelFontSize(cb.label, cb.width - 10, 14);
    drawText(ctx, cb.label, cx, cy, {
      fontSize: fs,
      fontWeight: 'bold',
      color: 'rgba(255,255,255,0.5)',
      align: 'center',
      baseline: 'middle',
    });
    ctx.restore();
  }

  _drawFinished(ctx, w, h) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(0, 0, w, h);
    const total = this.questions.length;
    drawText(ctx, 'Great Job!', w / 2, h / 2 - 40, {
      fontSize: 28,
      fontWeight: 'bold',
      color: kidsColors.primary,
      align: 'center',
      baseline: 'middle',
    });
    drawText(ctx, `Score: ${this.correct} / ${total}`, w / 2, h / 2, {
      fontSize: 18,
      fontWeight: '600',
      color: kidsColors.textPrimary,
      align: 'center',
      baseline: 'middle',
    });
    drawText(ctx, `Tower: ${this.correct} blocks tall!`, w / 2, h / 2 + 30, {
      fontSize: 15,
      fontWeight: '600',
      color: kidsColors.orange,
      align: 'center',
      baseline: 'middle',
    });
    if (this.bestStreak >= 2) {
      drawText(ctx, `Best streak: ${this.bestStreak}`, w / 2, h / 2 + 56, {
        fontSize: 14,
        fontWeight: '600',
        color: kidsColors.streakFire,
        align: 'center',
        baseline: 'middle',
      });
    }
  }

  // ── Pointer Events ────────────────────────────────────────────────────────

  onPointerDown(x, y) {
    if (
      this.finished ||
      this.transitioning ||
      this.fallingBlock ||
      this.crackBlock
    )
      return;
    for (let i = this.optionBlocks.length - 1; i >= 0; i--) {
      const ob = this.optionBlocks[i];
      if (!ob.visible) continue;
      if (
        hitTestRect(x, y, ob.x + ob.shakeOffsetX, ob.y, ob.width, ob.height)
      ) {
        this._handleTap(ob);
        return;
      }
    }
  }

  onPointerMove(_x, _y) {
    /* no-op */
  }
  onPointerUp(_x, _y) {
    /* no-op */
  }

  // ── Game Logic ────────────────────────────────────────────────────────────

  _handleTap(block) {
    const q = this.questions[this.questionIndex];
    if (!q) return;
    const responseTimeMs = performance.now() - this.questionStartTime;

    if (block.isCorrect) {
      GameSounds.correct();
      this.correct++;
      this.score++;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      if (this.streak === 3 || this.streak === 5 || this.streak === 10)
        GameSounds.streak(this.streak);

      this.results.push({
        questionIndex: this.questionIndex,
        question: q.question,
        selectedOption: block.label,
        isCorrect: true,
        concept: q.concept || '',
        responseTimeMs,
      });
      if (this.onAnswer) this.onAnswer(true, q.concept || '', responseTimeMs);

      for (const ob of this.optionBlocks) ob.visible = false;

      const stackH = this.towerBlocks.length * TB_H;
      this.landingTarget = this.towerBaseY - stackH - TB_H;
      const bw = TB_BASE_W + (Math.random() * 2 - 1) * TB_W_VAR;
      this.fallingBlock = {
        x: this.width / 2 - bw / 2,
        y: block.y,
        width: bw,
        height: TB_H,
        vy: 0,
        color: block.color,
        label: block.label,
        landed: false,
      };
    } else {
      GameSounds.wrong();
      this.streak = 0;
      this.results.push({
        questionIndex: this.questionIndex,
        question: q.question,
        selectedOption: block.label,
        isCorrect: false,
        concept: q.concept || '',
        responseTimeMs,
      });
      if (this.onAnswer) this.onAnswer(false, q.concept || '', responseTimeMs);

      this.crackBlock = {
        x: block.x,
        y: block.y,
        width: block.width,
        height: block.height,
        color: block.color,
        label: block.label,
        vx: 0,
        vy: 0,
        rotation: 0,
        rotSpeed: 0,
        alpha: 1,
        timer: CRACK_DUR,
        shakeOffsetX: 0,
        falling: false,
      };
      block.visible = false;
      for (const ob of this.optionBlocks) {
        if (ob.visible && ob.id !== block.id) ob.shakeTimer = 0.15;
      }
    }
  }

  _advanceQuestion() {
    this.questionIndex++;
    this.fallingBlock = null;
    if (this.questionIndex >= this.questions.length) {
      this.finished = true;
      GameSounds.complete(this.correct === this.questions.length);
      this._emitCelebration();
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

  // ── Particles ─────────────────────────────────────────────────────────────

  _emitDust(x, y) {
    if (this.reducedMotion) return;
    this.particles.emit(x, y, 10, {
      colorArray: ['#D4B896', '#E8D5B7', '#C4A882', '#B8A070'],
      shape: 'circle',
      sizeMin: 2,
      sizeMax: 5,
      speedMin: 40,
      speedMax: 120,
      angleMin: -Math.PI * 0.9,
      angleMax: -Math.PI * 0.1,
      lifeMin: 0.3,
      lifeMax: 0.8,
      gravity: 80,
      friction: 0.92,
    });
  }

  _emitCelebration() {
    if (this.reducedMotion) return;
    const cx = this.width / 2,
      cy = this.height / 2;
    this.particles.emitPreset(ParticlePool.confettiBurst(cx, cy - 30, 30));
    this.particles.emitPreset(ParticlePool.sparkleBurst(cx, cy - 30, 15));
    if (this.towerBlocks.length > 0) {
      const top = this.towerBlocks[this.towerBlocks.length - 1];
      this.particles.emitPreset(
        ParticlePool.popExplosion(top.x + top.width / 2, top.y, 12)
      );
    }
  }

  // ── Text Utilities ────────────────────────────────────────────────────────

  _labelFontSize(label, maxW, base) {
    if (!label) return base;
    const desired = label.length * 0.55 * base;
    if (desired <= maxW) return base;
    return Math.max(Math.floor(base * (maxW / desired)), 9);
  }

  _drawWrappedQuestion(ctx, text, cx, startY, maxWidth, fontSize) {
    ctx.save();
    ctx.font = `bold ${fontSize}px "Nunito", sans-serif`;
    ctx.fillStyle = kidsColors.textPrimary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const words = text.split(' ');
    let line = '',
      y = startY;
    const lh = fontSize * 1.3;
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, cx, y);
        line = words[i];
        y += lh;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, cx, y);
    ctx.restore();
  }
}

// ─── React Wrapper ──────────────────────────────────────────────────────────

export default function BuilderTemplate({config, onAnswer, onComplete}) {
  return (
    <CanvasGameBridge
      GameClass={BuilderGame}
      config={config}
      onAnswer={onAnswer}
      onComplete={onComplete}
      aspectRatio={3 / 4}
    />
  );
}
