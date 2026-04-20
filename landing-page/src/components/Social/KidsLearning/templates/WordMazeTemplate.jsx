/**
 * WordMazeTemplate - Canvas-based Maze Navigation Educational Game
 *
 * Character navigates a maze, encountering junctions with questions.
 * Player swipes or taps adjacent cells to move. At junctions, player
 * answers a question correctly to proceed. Wrong answers mark the
 * junction answered and let the player continue. Reaching exit completes the game.
 *
 * Config shapes:
 *   Shape A: { content: { maze: { grid, start, end, junctions: [{ pos, question, options, correctIndex, concept }] } } }
 *   Shape B: { content: { questions: [{ question, options: string[], correctIndex: number, concept?: string }] } }
 *
 * Props:
 *   config     - see above
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

// ─── Constants ──────────────────────────────────────────────────────────────
const MAZE_ROWS = 7;
const MAZE_COLS = 7;
const WALL = 1;
const FLOOR = 0;
const BACKGROUND_COLOR = '#FFF9E6';
const WALL_COLOR = 'rgba(108, 92, 231, 0.85)';
const WALL_BORDER_COLOR = 'rgba(78, 62, 201, 0.95)';
const FLOOR_COLOR = '#FFFDF5';
const GRID_LINE_COLOR = 'rgba(200, 190, 170, 0.25)';
const TRAIL_COLOR = 'rgba(108, 92, 231, 0.25)';
const JUNCTION_PULSE_COLOR = 'rgba(108, 92, 231, 0.6)';
const HEADER_HEIGHT = 80;
const FOOTER_HEIGHT = 80;
const MAZE_PADDING = 12;
const LERP_DURATION = 0.2;
const PULSE_SPEED = 3.0;
const GLOW_SPEED = 2.0;
const OPTION_BTN_H = 36;
const OPTION_BTN_GAP = 8;
const OPTION_BTN_R = 10;
const SWIPE_THRESHOLD = 20;
const OPTION_COLORS = [
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.purple,
];
const CELEBRATION_DURATION = 2.0;

// ─── Maze Generation Helpers ────────────────────────────────────────────────
function createEmptyGrid(rows, cols) {
  const grid = [];
  for (let r = 0; r < rows; r++) grid.push(new Array(cols).fill(WALL));
  return grid;
}

/** Recursive backtracker on odd-indexed cells. */
function generateMaze(rows, cols) {
  const grid = createEmptyGrid(rows, cols);
  const vis = createEmptyGrid(rows, cols);
  grid[1][1] = FLOOR;
  vis[1][1] = 1;
  const stack = [[1, 1]];
  const dirs = [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
  ];
  while (stack.length > 0) {
    const [cr, cc] = stack[stack.length - 1];
    const nbrs = [];
    for (const [dr, dc] of dirs) {
      const nr = cr + dr,
        nc = cc + dc;
      if (
        nr >= 1 &&
        nr < rows - 1 &&
        nc >= 1 &&
        nc < cols - 1 &&
        !vis[nr][nc]
      ) {
        nbrs.push([nr, nc, dr, dc]);
      }
    }
    if (nbrs.length === 0) {
      stack.pop();
      continue;
    }
    const [nr, nc, dr, dc] = nbrs[Math.floor(Math.random() * nbrs.length)];
    grid[cr + dr / 2][cc + dc / 2] = FLOOR;
    grid[nr][nc] = FLOOR;
    vis[nr][nc] = 1;
    stack.push([nr, nc]);
  }
  return grid;
}

/** BFS path from start to end. Returns [[r,c],...] or []. */
function findPath(grid, start, end) {
  const rows = grid.length,
    cols = grid[0].length;
  const vis = createEmptyGrid(rows, cols);
  const parent = {};
  const k = (r, c) => `${r},${c}`;
  const queue = [[start[0], start[1]]];
  vis[start[0]][start[1]] = 1;
  parent[k(start[0], start[1])] = null;
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  while (queue.length > 0) {
    const [cr, cc] = queue.shift();
    if (cr === end[0] && cc === end[1]) {
      const path = [];
      let cur = k(cr, cc);
      while (cur !== null) {
        path.unshift(cur.split(',').map(Number));
        cur = parent[cur];
      }
      return path;
    }
    for (const [dr, dc] of dirs) {
      const nr = cr + dr,
        nc = cc + dc;
      if (
        nr >= 0 &&
        nr < rows &&
        nc >= 0 &&
        nc < cols &&
        !vis[nr][nc] &&
        grid[nr][nc] === FLOOR
      ) {
        vis[nr][nc] = 1;
        parent[k(nr, nc)] = k(cr, cc);
        queue.push([nr, nc]);
      }
    }
  }
  return [];
}

function countAdjacentOpen(grid, r, c) {
  let count = 0;
  for (const [dr, dc] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const nr = r + dr,
      nc = c + dc;
    if (
      nr >= 0 &&
      nr < grid.length &&
      nc >= 0 &&
      nc < grid[0].length &&
      grid[nr][nc] === FLOOR
    )
      count++;
  }
  return count;
}

/** Auto-generate maze with junctions from questions array. */
function autoGenerateMaze(questions) {
  const grid = generateMaze(MAZE_ROWS, MAZE_COLS);
  const start = [1, 1],
    end = [MAZE_ROWS - 2, MAZE_COLS - 2];
  grid[start[0]][start[1]] = FLOOR;
  grid[end[0]][end[1]] = FLOOR;

  let path = findPath(grid, start, end);
  if (path.length === 0) {
    for (let r = 1; r < MAZE_ROWS - 1; r++) grid[r][1] = FLOOR;
    for (let c = 1; c < MAZE_COLS - 1; c++) grid[MAZE_ROWS - 2][c] = FLOOR;
    path = findPath(grid, start, end);
  }

  // Find junction candidates (3+ open neighbors on the solution path)
  const candidates = [];
  for (let i = 1; i < path.length - 1; i++) {
    const [r, c] = path[i];
    if (countAdjacentOpen(grid, r, c) >= 3)
      candidates.push({pos: [r, c], idx: i});
  }

  const junctions = [];
  const toPlace = questions.slice(0, Math.min(questions.length, 8));

  if (candidates.length >= toPlace.length) {
    const step = candidates.length / toPlace.length;
    for (let i = 0; i < toPlace.length; i++) {
      const ci = Math.min(Math.floor(i * step), candidates.length - 1);
      junctions.push({
        pos: candidates[ci].pos,
        question: toPlace[i].question,
        options: toPlace[i].options,
        correctIndex: toPlace[i].correctIndex,
        concept: toPlace[i].concept || '',
      });
    }
  } else {
    const step = Math.max(
      1,
      Math.floor((path.length - 2) / (toPlace.length + 1))
    );
    for (let i = 0; i < toPlace.length; i++) {
      const pi = Math.min(step * (i + 1), path.length - 2);
      junctions.push({
        pos: path[pi],
        question: toPlace[i].question,
        options: toPlace[i].options,
        correctIndex: toPlace[i].correctIndex,
        concept: toPlace[i].concept || '',
      });
    }
  }
  return {grid, start, end, junctions};
}

// ─── WordMazeGame ───────────────────────────────────────────────────────────
class WordMazeGame {
  constructor(canvas, {config, onAnswer, onComplete, reducedMotion, colors}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onAnswer = onAnswer;
    this.onComplete = onComplete;
    this.reducedMotion = reducedMotion;
    this.colors = colors || kidsColors;

    // Parse config — Shape A (explicit maze) or Shape B (auto-generate)
    const content = config?.content || {};
    if (content.maze && content.maze.grid) {
      this.mazeData = {
        grid: content.maze.grid,
        start: content.maze.start || [1, 1],
        end: content.maze.end || [
          content.maze.grid.length - 2,
          content.maze.grid[0].length - 2,
        ],
        junctions: Array.isArray(content.maze.junctions)
          ? content.maze.junctions
          : [],
      };
    } else {
      const raw = content.questions;
      const qs = Array.isArray(raw)
        ? raw.filter(
            (q) =>
              q &&
              typeof q.question === 'string' &&
              Array.isArray(q.options) &&
              q.options.length > 0
          )
        : [];
      this.mazeData = autoGenerateMaze(qs);
    }

    this.width = canvas.style.width
      ? parseFloat(canvas.style.width)
      : canvas.width;
    this.height = canvas.style.height
      ? parseFloat(canvas.style.height)
      : canvas.height;
    this.grid = this.mazeData.grid;
    this.mazeRows = this.grid.length;
    this.mazeCols = this.grid[0].length;
    this.startPos = this.mazeData.start;
    this.endPos = this.mazeData.end;

    // Junction map: "r,c" -> junction data with answered flag
    this.junctionMap = {};
    this.totalQuestions = this.mazeData.junctions.length;
    for (const j of this.mazeData.junctions) {
      this.junctionMap[`${j.pos[0]},${j.pos[1]}`] = {
        ...j,
        answered: false,
        answeredCorrectly: false,
      };
    }

    // Character state
    this.charRow = this.startPos[0];
    this.charCol = this.startPos[1];
    this.charPixelX = 0;
    this.charPixelY = 0;
    this.targetPixelX = 0;
    this.targetPixelY = 0;
    this.isMoving = false;
    this.moveTimer = 0;
    this.moveFromX = 0;
    this.moveFromY = 0;

    // Breadcrumb trail
    this.visited = new Set([`${this.charRow},${this.charCol}`]);

    // Question state
    this.activeJunction = null;
    this.questionStartTime = 0;
    this.showingQuestion = false;
    this.blockedDirections = new Set();

    // Scoring
    this.score = 0;
    this.correct = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.results = [];
    this.questionsAnswered = 0;

    // Game state
    this.finished = false;
    this.elapsedTime = 0;
    this.celebrating = false;
    this.celebrationTimer = 0;

    // Pointer tracking
    this.pointerDownPos = null;
    this.pointerIsDown = false;
    this.optionButtons = [];

    // Particles & layout
    this.particles = new ParticlePool();
    this.cellSize = 0;
    this.mazeOffsetX = 0;
    this.mazeOffsetY = 0;
    this._computeLayout();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────
  start() {
    if (this.mazeRows === 0 || this.mazeCols === 0) {
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
    this._computeLayout();
    const c = this._cellCenter(this.charRow, this.charCol);
    this.charPixelX = c.x;
    this.charPixelY = c.y;
    this.targetPixelX = c.x;
    this.targetPixelY = c.y;
    this._checkJunction();
  }

  destroy() {
    this.particles.reset();
    this.optionButtons = [];
    this.activeJunction = null;
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this._computeLayout();
    const c = this._cellCenter(this.charRow, this.charCol);
    if (!this.isMoving) {
      this.charPixelX = c.x;
      this.charPixelY = c.y;
    }
    this.targetPixelX = c.x;
    this.targetPixelY = c.y;
  }

  // ── Layout ─────────────────────────────────────────────────────────────
  _computeLayout() {
    const aw = this.width - MAZE_PADDING * 2;
    const ah = this.height - HEADER_HEIGHT - FOOTER_HEIGHT - MAZE_PADDING * 2;
    this.cellSize = Math.min(aw / this.mazeCols, ah / this.mazeRows);
    const mw = this.cellSize * this.mazeCols;
    const mh = this.cellSize * this.mazeRows;
    this.mazeOffsetX = (this.width - mw) / 2;
    this.mazeOffsetY = HEADER_HEIGHT + (ah - mh) / 2 + MAZE_PADDING;
  }

  _cellCenter(row, col) {
    return {
      x: this.mazeOffsetX + col * this.cellSize + this.cellSize / 2,
      y: this.mazeOffsetY + row * this.cellSize + this.cellSize / 2,
    };
  }

  _pixelToCell(px, py) {
    const col = Math.floor((px - this.mazeOffsetX) / this.cellSize);
    const row = Math.floor((py - this.mazeOffsetY) / this.cellSize);
    if (row >= 0 && row < this.mazeRows && col >= 0 && col < this.mazeCols)
      return [row, col];
    return null;
  }

  // ── Update ─────────────────────────────────────────────────────────────
  update(dt) {
    this.elapsedTime += dt;
    this.particles.update(dt);
    if (this.finished) return;

    // Celebration sequence
    if (this.celebrating) {
      this.celebrationTimer += dt;
      if (this.celebrationTimer >= CELEBRATION_DURATION) {
        this.celebrating = false;
        this.finished = true;
        const isPerfect = this.correct === this.totalQuestions;
        GameSounds.complete(isPerfect);
        if (this.onComplete) {
          this.onComplete({
            score: this.score,
            correct: this.correct,
            total: this.totalQuestions,
            results: this.results,
            bestStreak: this.bestStreak,
          });
        }
      }
      return;
    }

    // Character lerp
    if (this.isMoving) {
      this.moveTimer += dt;
      const t = Math.min(this.moveTimer / LERP_DURATION, 1);
      const e = 1 - (1 - t) * (1 - t); // ease-out quad
      this.charPixelX =
        this.moveFromX + (this.targetPixelX - this.moveFromX) * e;
      this.charPixelY =
        this.moveFromY + (this.targetPixelY - this.moveFromY) * e;
      if (t >= 1) {
        this.isMoving = false;
        this.charPixelX = this.targetPixelX;
        this.charPixelY = this.targetPixelY;
        this.visited.add(`${this.charRow},${this.charCol}`);
        if (
          this.charRow === this.endPos[0] &&
          this.charCol === this.endPos[1]
        ) {
          this._startCelebration();
          return;
        }
        this._checkJunction();
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  render() {
    const ctx = this.ctx,
      w = this.width,
      h = this.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, w, h);

    // HUD
    const prog =
      this.totalQuestions > 0
        ? `${this.questionsAnswered}/${this.totalQuestions} answered`
        : 'Explore the maze!';
    drawText(ctx, prog, 14, 18, {
      fontSize: 13,
      fontWeight: 'bold',
      color: kidsColors.textSecondary,
      align: 'left',
      baseline: 'middle',
    });
    drawText(ctx, `Score: ${this.score}`, w - 14, 18, {
      fontSize: 13,
      fontWeight: 'bold',
      color: kidsColors.primary,
      align: 'right',
      baseline: 'middle',
    });
    if (this.streak >= 2) {
      drawText(ctx, `${this.streak} streak!`, w / 2, 18, {
        fontSize: 13,
        fontWeight: 'bold',
        color: kidsColors.streakFire,
        align: 'center',
        baseline: 'middle',
      });
    }
    if (this.showingQuestion && this.activeJunction) {
      this._drawWrappedQuestion(
        ctx,
        this.activeJunction.question,
        w / 2,
        38,
        w - 30,
        16
      );
    }

    this._renderMaze(ctx);
    this._renderTrail(ctx);
    this._renderExitGlow(ctx);
    this._renderJunctionHighlights(ctx);
    this._renderCharacter(ctx);
    if (this.showingQuestion && this.activeJunction)
      this._renderOptionButtons(ctx);
    this.particles.render(ctx);

    // Game complete overlay
    if (this.finished) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.fillRect(0, 0, w, h);
      drawText(ctx, 'Maze Complete!', w / 2, h / 2 - 20, {
        fontSize: 28,
        fontWeight: 'bold',
        color: kidsColors.primary,
        align: 'center',
        baseline: 'middle',
      });
      const lbl =
        this.totalQuestions > 0
          ? `${this.correct} / ${this.totalQuestions}`
          : 'Done!';
      drawText(ctx, `Score: ${lbl}`, w / 2, h / 2 + 18, {
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

  // ── Maze Rendering ────────────────────────────────────────────────────
  _renderMaze(ctx) {
    const cs = this.cellSize,
      ox = this.mazeOffsetX,
      oy = this.mazeOffsetY;
    const wr = Math.max(2, cs * 0.15);
    for (let r = 0; r < this.mazeRows; r++) {
      for (let c = 0; c < this.mazeCols; c++) {
        const x = ox + c * cs,
          y = oy + r * cs;
        if (this.grid[r][c] === WALL) {
          drawRoundedRect(
            ctx,
            x + 1,
            y + 1,
            cs - 2,
            cs - 2,
            wr,
            WALL_COLOR,
            WALL_BORDER_COLOR,
            1
          );
        } else {
          ctx.fillStyle = FLOOR_COLOR;
          ctx.fillRect(x, y, cs, cs);
          ctx.strokeStyle = GRID_LINE_COLOR;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x, y, cs, cs);
        }
      }
    }
  }

  _renderTrail(ctx) {
    const dr = Math.max(2, this.cellSize * 0.1);
    for (const key of this.visited) {
      const [r, c] = key.split(',').map(Number);
      if (r === this.charRow && c === this.charCol) continue;
      const ctr = this._cellCenter(r, c);
      ctx.beginPath();
      ctx.arc(ctr.x, ctr.y, dr, 0, Math.PI * 2);
      ctx.fillStyle = TRAIL_COLOR;
      ctx.fill();
    }
  }

  _renderExitGlow(ctx) {
    const ctr = this._cellCenter(this.endPos[0], this.endPos[1]);
    const cs = this.cellSize;
    const pulse = this.reducedMotion
      ? 0.5
      : 0.3 + 0.2 * Math.sin(this.elapsedTime * GLOW_SPEED);
    const gr = cs * 0.6;
    ctx.save();
    ctx.globalAlpha = pulse;
    const grad = ctx.createRadialGradient(ctr.x, ctr.y, 0, ctr.x, ctr.y, gr);
    grad.addColorStop(0, 'rgba(255, 215, 0, 0.8)');
    grad.addColorStop(0.6, 'rgba(255, 215, 0, 0.3)');
    grad.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ctr.x, ctr.y, gr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Star emoji
    const ss = Math.max(14, cs * 0.5);
    ctx.save();
    ctx.font = `${ss}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u2B50', ctr.x, ctr.y);
    ctx.restore();
  }

  _renderJunctionHighlights(ctx) {
    const cs = this.cellSize;
    for (const key in this.junctionMap) {
      const jn = this.junctionMap[key];
      if (jn.answered) continue;
      const [r, c] = jn.pos;
      const ctr = this._cellCenter(r, c);
      const pulse = this.reducedMotion
        ? 1
        : 0.5 + 0.5 * Math.sin(this.elapsedTime * PULSE_SPEED);
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.3 * pulse;
      ctx.strokeStyle = JUNCTION_PULSE_COLOR;
      ctx.lineWidth = 2 + pulse;
      ctx.strokeRect(ctr.x - cs / 2 + 2, ctr.y - cs / 2 + 2, cs - 4, cs - 4);
      ctx.restore();
      drawText(ctx, '?', ctr.x, ctr.y, {
        fontSize: Math.max(10, cs * 0.3),
        fontWeight: 'bold',
        color: 'rgba(108, 92, 231, 0.4)',
        align: 'center',
        baseline: 'middle',
      });
    }
  }

  _renderCharacter(ctx) {
    const cs = this.cellSize,
      rad = Math.max(8, cs * 0.35);
    const cx = this.charPixelX,
      cy = this.charPixelY;
    drawCircle(ctx, cx, cy, rad, kidsColors.orange, kidsColors.accent, 2);
    // Eyes
    const ex = rad * 0.25,
      ey = -rad * 0.15,
      er = Math.max(1.5, rad * 0.1);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx - ex, cy + ey, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + ex, cy + ey, er, 0, Math.PI * 2);
    ctx.fill();
    // Pupils
    const pr = er * 0.6;
    ctx.fillStyle = '#2C3E50';
    ctx.beginPath();
    ctx.arc(cx - ex, cy + ey, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + ex, cy + ey, pr, 0, Math.PI * 2);
    ctx.fill();
    // Smile
    ctx.beginPath();
    ctx.arc(cx, cy + rad * 0.2, rad * 0.3, 0.1, Math.PI - 0.1);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1, rad * 0.08);
    ctx.stroke();
  }

  _renderOptionButtons(ctx) {
    if (!this.activeJunction) return;
    const opts = this.activeJunction.options,
      count = opts.length,
      w = this.width;
    const footerY = this.height - FOOTER_HEIGHT;
    const totalH = count * OPTION_BTN_H + (count - 1) * OPTION_BTN_GAP;
    const sy = footerY + (FOOTER_HEIGHT - totalH) / 2;
    const bw = Math.min(w - 40, 300),
      bx = (w - bw) / 2;
    this.optionButtons = [];
    for (let i = 0; i < count; i++) {
      const y = sy + i * (OPTION_BTN_H + OPTION_BTN_GAP);
      const clr = OPTION_COLORS[i % OPTION_COLORS.length];
      this.optionButtons.push({
        x: bx,
        y,
        w: bw,
        h: OPTION_BTN_H,
        index: i,
        label: opts[i],
      });
      drawRoundedRect(ctx, bx, y, bw, OPTION_BTN_H, OPTION_BTN_R, clr);
      const fs = this._btnFontSize(opts[i], bw - 20);
      drawText(ctx, opts[i], bx + bw / 2, y + OPTION_BTN_H / 2, {
        fontSize: fs,
        fontWeight: 'bold',
        color: '#FFFFFF',
        align: 'center',
        baseline: 'middle',
      });
    }
  }

  // ── Pointer Events ────────────────────────────────────────────────────
  onPointerDown(x, y) {
    if (this.finished || this.celebrating) return;
    this.pointerDownPos = {x, y};
    this.pointerIsDown = true;
    if (this.showingQuestion && this.activeJunction) {
      for (const btn of this.optionButtons) {
        if (hitTestRect(x, y, btn.x, btn.y, btn.w, btn.h)) {
          this._handleOptionTap(btn.index);
          this.pointerIsDown = false;
          this.pointerDownPos = null;
          return;
        }
      }
    }
  }

  onPointerMove(_x, _y) {
    /* swipe handled on pointer up */
  }

  onPointerUp(x, y) {
    if (this.finished || this.celebrating || !this.pointerIsDown) {
      this.pointerIsDown = false;
      this.pointerDownPos = null;
      return;
    }
    if (this.showingQuestion) {
      if (this.activeJunction) {
        for (const btn of this.optionButtons) {
          if (hitTestRect(x, y, btn.x, btn.y, btn.w, btn.h)) {
            this._handleOptionTap(btn.index);
            break;
          }
        }
      }
      this.pointerIsDown = false;
      this.pointerDownPos = null;
      return;
    }
    if (this.isMoving) {
      this.pointerIsDown = false;
      this.pointerDownPos = null;
      return;
    }

    const dp = this.pointerDownPos;
    this.pointerIsDown = false;
    this.pointerDownPos = null;
    if (!dp) return;

    const dx = x - dp.x,
      dy = y - dp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= SWIPE_THRESHOLD) {
      // Swipe
      let dr = 0,
        dc = 0;
      if (Math.abs(dx) > Math.abs(dy)) {
        dc = dx > 0 ? 1 : -1;
      } else {
        dr = dy > 0 ? 1 : -1;
      }
      this._tryMove(dr, dc);
    } else {
      // Tap adjacent cell
      const cell = this._pixelToCell(x, y);
      if (cell) {
        const dr = cell[0] - this.charRow,
          dc = cell[1] - this.charCol;
        if (
          (Math.abs(dr) === 1 && dc === 0) ||
          (dr === 0 && Math.abs(dc) === 1)
        ) {
          this._tryMove(dr, dc);
        }
      }
    }
  }

  // ── Movement ──────────────────────────────────────────────────────────
  _tryMove(dr, dc) {
    if (this.isMoving || this.showingQuestion) return;
    const nr = this.charRow + dr,
      nc = this.charCol + dc;
    if (nr < 0 || nr >= this.mazeRows || nc < 0 || nc >= this.mazeCols) return;
    if (this.grid[nr][nc] === WALL) return;
    if (this.blockedDirections.has(`${dr},${dc}`)) return;

    this.charRow = nr;
    this.charCol = nc;
    const c = this._cellCenter(nr, nc);
    this.moveFromX = this.charPixelX;
    this.moveFromY = this.charPixelY;
    this.targetPixelX = c.x;
    this.targetPixelY = c.y;
    this.isMoving = true;
    this.moveTimer = 0;
    GameSounds.tap();
  }

  _checkJunction() {
    const jn = this.junctionMap[`${this.charRow},${this.charCol}`];
    if (jn && !jn.answered) {
      this.activeJunction = jn;
      this.showingQuestion = true;
      this.questionStartTime = performance.now();
      this.blockedDirections.clear();
    }
  }

  // ── Option Handling ───────────────────────────────────────────────────
  _handleOptionTap(idx) {
    if (!this.activeJunction || !this.showingQuestion) return;
    const jn = this.activeJunction;
    const rt = performance.now() - this.questionStartTime;
    const ok = idx === jn.correctIndex;

    this.questionsAnswered++;
    this.results.push({
      questionIndex: this.questionsAnswered - 1,
      question: jn.question,
      selectedOption: jn.options[idx],
      isCorrect: ok,
      concept: jn.concept || '',
      responseTimeMs: rt,
    });
    if (this.onAnswer) this.onAnswer(ok, jn.concept || '', rt);

    if (ok) {
      GameSounds.correct();
      jn.answered = true;
      jn.answeredCorrectly = true;
      this.correct++;
      this.score++;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      if (this.streak === 3 || this.streak === 5 || this.streak === 10)
        GameSounds.streak(this.streak);
      // Sparkle particles
      const c = this._cellCenter(jn.pos[0], jn.pos[1]);
      this.particles.emitPreset(ParticlePool.sparkleBurst(c.x, c.y, 15));
    } else {
      GameSounds.wrong();
      this.streak = 0;
      jn.answered = true;
      jn.answeredCorrectly = false;
    }

    this.showingQuestion = false;
    this.activeJunction = null;
    this.blockedDirections.clear();
  }

  // ── Celebration ───────────────────────────────────────────────────────
  _startCelebration() {
    this.celebrating = true;
    this.celebrationTimer = 0;
    const c = this._cellCenter(this.endPos[0], this.endPos[1]);
    this.particles.emitPreset(ParticlePool.confettiBurst(c.x, c.y, 30));
    this.particles.emitPreset(ParticlePool.sparkleBurst(c.x, c.y, 20));
    this.particles.emitPreset(ParticlePool.popExplosion(c.x, c.y, 15));
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  _btnFontSize(label, maxW) {
    const base = 14;
    if (!label) return base;
    const dw = label.length * 0.55 * base;
    if (dw <= maxW) return base;
    return Math.max(Math.floor(base * (maxW / dw)), 10);
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
export default function WordMazeTemplate({config, onAnswer, onComplete}) {
  return (
    <CanvasGameBridge
      GameClass={WordMazeGame}
      config={config}
      onAnswer={onAnswer}
      onComplete={onComplete}
      aspectRatio={3 / 4}
    />
  );
}
