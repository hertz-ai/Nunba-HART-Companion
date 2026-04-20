/**
 * KidsCharacter — Parameterized animated SVG character system.
 *
 * Generates thousands of unique characters from combinations of:
 *   - 10 species (owl, bunny, bear, cat, fox, robot, star, penguin, monkey, frog)
 *   - 12 color palettes
 *   - 6 expressions (happy, sad, thinking, excited, surprised, neutral)
 *   - 5 accessories (none, hat, glasses, bowtie, crown)
 *   - 6 animation states (idle, talk, celebrate, think, encourage, sleep)
 *
 * Usage:
 *   <KidsCharacter species="owl" color="purple" expression="happy" state="idle" size={120} />
 *   <KidsCharacter species="bunny" color="pink" accessory="crown" state="celebrate" />
 *   <KidsCharacter /> // random character
 *
 * Props:
 *   species:    string  (default: random)
 *   color:      string  (palette name or hex, default: random)
 *   expression: string  (default: 'happy')
 *   accessory:  string  (default: 'none')
 *   state:      string  (animation state, default: 'idle')
 *   size:       number  (px, default: 96)
 *   talking:    boolean (mouth animates open/close, default: false)
 *   onClick:    func
 */

import {Box} from '@mui/material';
import React, {useMemo} from 'react';

// ── Color palettes ──────────────────────────────────────────────
const PALETTES = {
  purple: {
    body: '#6C63FF',
    belly: '#A29BFE',
    accent: '#4834D4',
    cheek: '#FFB8C6',
  },
  pink: {
    body: '#FF6B81',
    belly: '#FFB8C6',
    accent: '#E84393',
    cheek: '#FFC9DE',
  },
  blue: {
    body: '#54A0FF',
    belly: '#A3D8F4',
    accent: '#2E86DE',
    cheek: '#FFD1DC',
  },
  green: {
    body: '#00B894',
    belly: '#81ECEC',
    accent: '#00A086',
    cheek: '#FFD1DC',
  },
  orange: {
    body: '#FF9F43',
    belly: '#FECA57',
    accent: '#EE5A24',
    cheek: '#FFD1DC',
  },
  red: {body: '#FF6B6B', belly: '#FFA3A3', accent: '#D63031', cheek: '#FFD1DC'},
  teal: {
    body: '#4ECDC4',
    belly: '#88E8DF',
    accent: '#16A085',
    cheek: '#FFD1DC',
  },
  yellow: {
    body: '#FECA57',
    belly: '#FFF3B0',
    accent: '#F39C12',
    cheek: '#FFD1DC',
  },
  coral: {
    body: '#FD79A8',
    belly: '#FFC3D8',
    accent: '#E84393',
    cheek: '#FFE8F0',
  },
  mint: {
    body: '#55EFC4',
    belly: '#B8F0DD',
    accent: '#00B894',
    cheek: '#FFD1DC',
  },
  slate: {
    body: '#636E72',
    belly: '#B2BEC3',
    accent: '#2D3436',
    cheek: '#FFC3C3',
  },
  gold: {
    body: '#FDCB6E',
    belly: '#FFF3B0',
    accent: '#F0932B',
    cheek: '#FFD1DC',
  },
};

const PALETTE_NAMES = Object.keys(PALETTES);

// ── Species list ────────────────────────────────────────────────
const SPECIES = [
  'owl',
  'bunny',
  'bear',
  'cat',
  'fox',
  'robot',
  'star',
  'penguin',
  'monkey',
  'frog',
];
const ACCESSORIES = ['none', 'hat', 'glasses', 'bowtie', 'crown'];
const EXPRESSIONS = [
  'happy',
  'sad',
  'thinking',
  'excited',
  'surprised',
  'neutral',
];
const STATES = ['idle', 'talk', 'celebrate', 'think', 'encourage', 'sleep'];

// ── Deterministic pseudo-random from string seed ────────────────
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── Eye shapes by expression ────────────────────────────────────
function renderEyes(expression, bodyColor, cx, cy, scale) {
  const s = scale;
  const eyeW = 8 * s;
  const eyeH = expression === 'surprised' ? 10 * s : 8 * s;
  const pupilR = expression === 'excited' ? 3.5 * s : 3 * s;
  const sparkleR = 1.2 * s;

  // Eye positions (left and right)
  const lx = cx - 10 * s;
  const rx = cx + 10 * s;

  const closedEye = (x) => (
    <path
      key={`eye-${x}`}
      d={`M${x - eyeW / 2},${cy} Q${x},${cy - 4 * s} ${x + eyeW / 2},${cy}`}
      stroke="#2D3436"
      strokeWidth={2 * s}
      strokeLinecap="round"
      fill="none"
    />
  );

  if (expression === 'sad') {
    return [closedEye(lx), closedEye(rx)];
  }

  if (expression === 'thinking') {
    return [
      closedEye(lx),
      // Right eye open, looking up
      <ellipse
        key="eye-r"
        cx={rx}
        cy={cy}
        rx={eyeW / 2}
        ry={eyeH / 2}
        fill="white"
        stroke="#2D3436"
        strokeWidth={1.5 * s}
      />,
      <circle
        key="pupil-r"
        cx={rx + 1.5 * s}
        cy={cy - 1.5 * s}
        r={pupilR}
        fill="#2D3436"
      />,
      <circle
        key="sparkle-r"
        cx={rx + 3 * s}
        cy={cy - 3 * s}
        r={sparkleR}
        fill="white"
      />,
    ];
  }

  return [lx, rx].flatMap((x, i) => [
    <ellipse
      key={`eye-${i}`}
      cx={x}
      cy={cy}
      rx={eyeW / 2}
      ry={eyeH / 2}
      fill="white"
      stroke="#2D3436"
      strokeWidth={1.5 * s}
    />,
    <circle key={`pupil-${i}`} cx={x} cy={cy} r={pupilR} fill="#2D3436" />,
    <circle
      key={`sparkle-${i}`}
      cx={x + 2 * s}
      cy={cy - 2 * s}
      r={sparkleR}
      fill="white"
    />,
  ]);
}

// ── Mouth by expression + talking ───────────────────────────────
function renderMouth(expression, talking, cx, cy, scale) {
  const s = scale;

  if (talking) {
    return (
      <ellipse
        cx={cx}
        cy={cy + 2 * s}
        rx={5 * s}
        ry={4 * s}
        fill="#2D3436"
        className="kids-char-mouth-talk"
      />
    );
  }

  switch (expression) {
    case 'happy':
    case 'excited':
      return (
        <path
          d={`M${cx - 7 * s},${cy} Q${cx},${cy + 8 * s} ${cx + 7 * s},${cy}`}
          stroke="#2D3436"
          strokeWidth={2 * s}
          strokeLinecap="round"
          fill="none"
        />
      );
    case 'sad':
      return (
        <path
          d={`M${cx - 6 * s},${cy + 4 * s} Q${cx},${cy - 2 * s} ${cx + 6 * s},${cy + 4 * s}`}
          stroke="#2D3436"
          strokeWidth={2 * s}
          strokeLinecap="round"
          fill="none"
        />
      );
    case 'surprised':
      return (
        <ellipse cx={cx} cy={cy + 2 * s} rx={4 * s} ry={5 * s} fill="#2D3436" />
      );
    case 'thinking':
      return (
        <path
          d={`M${cx - 5 * s},${cy + 2 * s} L${cx + 5 * s},${cy + 2 * s}`}
          stroke="#2D3436"
          strokeWidth={2 * s}
          strokeLinecap="round"
        />
      );
    default: // neutral
      return (
        <path
          d={`M${cx - 5 * s},${cy + 2 * s} Q${cx},${cy + 4 * s} ${cx + 5 * s},${cy + 2 * s}`}
          stroke="#2D3436"
          strokeWidth={2 * s}
          strokeLinecap="round"
          fill="none"
        />
      );
  }
}

// ── Cheeks ──────────────────────────────────────────────────────
function renderCheeks(expression, cheekColor, cx, cy, scale) {
  const s = scale;
  if (expression === 'sad' || expression === 'neutral') return null;
  return (
    <>
      <ellipse
        cx={cx - 16 * s}
        cy={cy + 4 * s}
        rx={4 * s}
        ry={3 * s}
        fill={cheekColor}
        opacity={0.6}
      />
      <ellipse
        cx={cx + 16 * s}
        cy={cy + 4 * s}
        rx={4 * s}
        ry={3 * s}
        fill={cheekColor}
        opacity={0.6}
      />
    </>
  );
}

// ── Accessory rendering ─────────────────────────────────────────
function renderAccessory(accessory, cx, topY, scale, accentColor) {
  const s = scale;

  switch (accessory) {
    case 'hat':
      return (
        <g key="hat">
          <rect
            x={cx - 14 * s}
            y={topY - 6 * s}
            width={28 * s}
            height={4 * s}
            rx={2 * s}
            fill={accentColor}
          />
          <rect
            x={cx - 9 * s}
            y={topY - 18 * s}
            width={18 * s}
            height={14 * s}
            rx={4 * s}
            fill={accentColor}
          />
          <circle cx={cx} cy={topY - 19 * s} r={3 * s} fill="#FECA57" />
        </g>
      );
    case 'crown':
      return (
        <g key="crown">
          <path
            d={`M${cx - 12 * s},${topY - 2 * s} L${cx - 14 * s},${topY - 14 * s} L${cx - 6 * s},${topY - 8 * s} L${cx},${topY - 16 * s} L${cx + 6 * s},${topY - 8 * s} L${cx + 14 * s},${topY - 14 * s} L${cx + 12 * s},${topY - 2 * s} Z`}
            fill="#FDCB6E"
            stroke="#F0932B"
            strokeWidth={1.5 * s}
          />
          <circle cx={cx} cy={topY - 12 * s} r={2 * s} fill="#E17055" />
          <circle
            cx={cx - 8 * s}
            cy={topY - 9 * s}
            r={1.5 * s}
            fill="#00B894"
          />
          <circle
            cx={cx + 8 * s}
            cy={topY - 9 * s}
            r={1.5 * s}
            fill="#6C63FF"
          />
        </g>
      );
    case 'glasses':
      return (
        <g key="glasses">
          <circle
            cx={cx - 10 * s}
            cy={topY + 22 * s}
            r={7 * s}
            fill="none"
            stroke="#2D3436"
            strokeWidth={2 * s}
          />
          <circle
            cx={cx + 10 * s}
            cy={topY + 22 * s}
            r={7 * s}
            fill="none"
            stroke="#2D3436"
            strokeWidth={2 * s}
          />
          <line
            x1={cx - 3 * s}
            y1={topY + 22 * s}
            x2={cx + 3 * s}
            y2={topY + 22 * s}
            stroke="#2D3436"
            strokeWidth={2 * s}
          />
          <line
            x1={cx - 17 * s}
            y1={topY + 22 * s}
            x2={cx - 20 * s}
            y2={topY + 20 * s}
            stroke="#2D3436"
            strokeWidth={2 * s}
          />
          <line
            x1={cx + 17 * s}
            y1={topY + 22 * s}
            x2={cx + 20 * s}
            y2={topY + 20 * s}
            stroke="#2D3436"
            strokeWidth={2 * s}
          />
        </g>
      );
    case 'bowtie':
      return (
        <g key="bowtie">
          <path
            d={`M${cx},${topY + 42 * s} L${cx - 10 * s},${topY + 36 * s} L${cx - 10 * s},${topY + 48 * s} Z`}
            fill={accentColor}
          />
          <path
            d={`M${cx},${topY + 42 * s} L${cx + 10 * s},${topY + 36 * s} L${cx + 10 * s},${topY + 48 * s} Z`}
            fill={accentColor}
          />
          <circle cx={cx} cy={topY + 42 * s} r={2.5 * s} fill="#FECA57" />
        </g>
      );
    default:
      return null;
  }
}

// ── Species body templates ──────────────────────────────────────
// Each returns SVG elements for head + body + features.
// Center: (cx, cy). Scale factor: s.

function renderOwl(p, cx, cy, s) {
  const eyeY = cy - 4 * s;
  const mouthY = cy + 8 * s;
  return (
    <g>
      {/* Body */}
      <ellipse cx={cx} cy={cy + 20 * s} rx={20 * s} ry={22 * s} fill={p.body} />
      {/* Belly */}
      <ellipse
        cx={cx}
        cy={cy + 24 * s}
        rx={13 * s}
        ry={14 * s}
        fill={p.belly}
      />
      {/* Head */}
      <circle cx={cx} cy={cy - 6 * s} r={22 * s} fill={p.body} />
      {/* Ear tufts */}
      <path
        d={`M${cx - 16 * s},${cy - 22 * s} L${cx - 22 * s},${cy - 38 * s} L${cx - 8 * s},${cy - 24 * s}`}
        fill={p.accent}
      />
      <path
        d={`M${cx + 16 * s},${cy - 22 * s} L${cx + 22 * s},${cy - 38 * s} L${cx + 8 * s},${cy - 24 * s}`}
        fill={p.accent}
      />
      {/* Face disc */}
      <ellipse
        cx={cx}
        cy={cy - 2 * s}
        rx={18 * s}
        ry={16 * s}
        fill={p.belly}
        opacity={0.5}
      />
      {/* Beak */}
      <path
        d={`M${cx},${mouthY - 4 * s} L${cx - 3 * s},${mouthY + 2 * s} L${cx + 3 * s},${mouthY + 2 * s} Z`}
        fill="#F0932B"
      />
      {/* Wings */}
      <ellipse
        cx={cx - 24 * s}
        cy={cy + 16 * s}
        rx={8 * s}
        ry={16 * s}
        fill={p.accent}
        className="kids-char-wing-left"
      />
      <ellipse
        cx={cx + 24 * s}
        cy={cy + 16 * s}
        rx={8 * s}
        ry={16 * s}
        fill={p.accent}
        className="kids-char-wing-right"
      />
      {/* Feet */}
      <ellipse
        cx={cx - 8 * s}
        cy={cy + 42 * s}
        rx={6 * s}
        ry={3 * s}
        fill="#F0932B"
      />
      <ellipse
        cx={cx + 8 * s}
        cy={cy + 42 * s}
        rx={6 * s}
        ry={3 * s}
        fill="#F0932B"
      />
    </g>
  );
}

function renderBunny(p, cx, cy, s) {
  return (
    <g>
      {/* Ears */}
      <ellipse
        cx={cx - 8 * s}
        cy={cy - 34 * s}
        rx={6 * s}
        ry={18 * s}
        fill={p.body}
      />
      <ellipse
        cx={cx - 8 * s}
        cy={cy - 34 * s}
        rx={3.5 * s}
        ry={14 * s}
        fill={p.belly}
      />
      <ellipse
        cx={cx + 8 * s}
        cy={cy - 34 * s}
        rx={6 * s}
        ry={18 * s}
        fill={p.body}
      />
      <ellipse
        cx={cx + 8 * s}
        cy={cy - 34 * s}
        rx={3.5 * s}
        ry={14 * s}
        fill={p.belly}
      />
      {/* Body */}
      <ellipse cx={cx} cy={cy + 18 * s} rx={18 * s} ry={22 * s} fill={p.body} />
      <ellipse
        cx={cx}
        cy={cy + 22 * s}
        rx={12 * s}
        ry={14 * s}
        fill={p.belly}
      />
      {/* Head */}
      <circle cx={cx} cy={cy - 4 * s} r={20 * s} fill={p.body} />
      {/* Nose */}
      <ellipse cx={cx} cy={cy + 2 * s} rx={3 * s} ry={2 * s} fill={p.accent} />
      {/* Whiskers */}
      <line
        x1={cx - 18 * s}
        y1={cy + 1 * s}
        x2={cx - 6 * s}
        y2={cy + 3 * s}
        stroke={p.accent}
        strokeWidth={1 * s}
        opacity={0.5}
      />
      <line
        x1={cx - 17 * s}
        y1={cy + 5 * s}
        x2={cx - 6 * s}
        y2={cy + 4 * s}
        stroke={p.accent}
        strokeWidth={1 * s}
        opacity={0.5}
      />
      <line
        x1={cx + 18 * s}
        y1={cy + 1 * s}
        x2={cx + 6 * s}
        y2={cy + 3 * s}
        stroke={p.accent}
        strokeWidth={1 * s}
        opacity={0.5}
      />
      <line
        x1={cx + 17 * s}
        y1={cy + 5 * s}
        x2={cx + 6 * s}
        y2={cy + 4 * s}
        stroke={p.accent}
        strokeWidth={1 * s}
        opacity={0.5}
      />
      {/* Paws */}
      <ellipse
        cx={cx - 10 * s}
        cy={cy + 38 * s}
        rx={6 * s}
        ry={4 * s}
        fill={p.belly}
      />
      <ellipse
        cx={cx + 10 * s}
        cy={cy + 38 * s}
        rx={6 * s}
        ry={4 * s}
        fill={p.belly}
      />
      {/* Tail */}
      <circle cx={cx} cy={cy + 38 * s} r={5 * s} fill={p.belly} />
    </g>
  );
}

function renderBear(p, cx, cy, s) {
  return (
    <g>
      {/* Ears */}
      <circle cx={cx - 16 * s} cy={cy - 20 * s} r={8 * s} fill={p.body} />
      <circle cx={cx - 16 * s} cy={cy - 20 * s} r={4.5 * s} fill={p.belly} />
      <circle cx={cx + 16 * s} cy={cy - 20 * s} r={8 * s} fill={p.body} />
      <circle cx={cx + 16 * s} cy={cy - 20 * s} r={4.5 * s} fill={p.belly} />
      {/* Body */}
      <ellipse cx={cx} cy={cy + 18 * s} rx={20 * s} ry={24 * s} fill={p.body} />
      <ellipse
        cx={cx}
        cy={cy + 22 * s}
        rx={14 * s}
        ry={16 * s}
        fill={p.belly}
      />
      {/* Head */}
      <circle cx={cx} cy={cy - 4 * s} r={22 * s} fill={p.body} />
      {/* Snout */}
      <ellipse cx={cx} cy={cy + 4 * s} rx={10 * s} ry={7 * s} fill={p.belly} />
      {/* Nose */}
      <ellipse cx={cx} cy={cy + 1 * s} rx={4 * s} ry={3 * s} fill="#2D3436" />
      {/* Arms */}
      <ellipse
        cx={cx - 22 * s}
        cy={cy + 14 * s}
        rx={7 * s}
        ry={14 * s}
        fill={p.body}
        className="kids-char-wing-left"
      />
      <ellipse
        cx={cx + 22 * s}
        cy={cy + 14 * s}
        rx={7 * s}
        ry={14 * s}
        fill={p.body}
        className="kids-char-wing-right"
      />
      {/* Feet */}
      <ellipse
        cx={cx - 10 * s}
        cy={cy + 40 * s}
        rx={7 * s}
        ry={4 * s}
        fill={p.accent}
      />
      <ellipse
        cx={cx + 10 * s}
        cy={cy + 40 * s}
        rx={7 * s}
        ry={4 * s}
        fill={p.accent}
      />
    </g>
  );
}

function renderCat(p, cx, cy, s) {
  return (
    <g>
      {/* Ears */}
      <path
        d={`M${cx - 16 * s},${cy - 14 * s} L${cx - 22 * s},${cy - 34 * s} L${cx - 4 * s},${cy - 20 * s} Z`}
        fill={p.body}
      />
      <path
        d={`M${cx - 16 * s},${cy - 16 * s} L${cx - 19 * s},${cy - 30 * s} L${cx - 7 * s},${cy - 20 * s} Z`}
        fill={p.belly}
      />
      <path
        d={`M${cx + 16 * s},${cy - 14 * s} L${cx + 22 * s},${cy - 34 * s} L${cx + 4 * s},${cy - 20 * s} Z`}
        fill={p.body}
      />
      <path
        d={`M${cx + 16 * s},${cy - 16 * s} L${cx + 19 * s},${cy - 30 * s} L${cx + 7 * s},${cy - 20 * s} Z`}
        fill={p.belly}
      />
      {/* Body */}
      <ellipse cx={cx} cy={cy + 18 * s} rx={16 * s} ry={22 * s} fill={p.body} />
      <ellipse
        cx={cx}
        cy={cy + 22 * s}
        rx={10 * s}
        ry={14 * s}
        fill={p.belly}
      />
      {/* Head */}
      <circle cx={cx} cy={cy - 4 * s} r={20 * s} fill={p.body} />
      {/* Nose */}
      <path
        d={`M${cx},${cy + 1 * s} L${cx - 2.5 * s},${cy + 4 * s} L${cx + 2.5 * s},${cy + 4 * s} Z`}
        fill={p.accent}
      />
      {/* Whiskers */}
      <line
        x1={cx - 20 * s}
        y1={cy + 2 * s}
        x2={cx - 6 * s}
        y2={cy + 4 * s}
        stroke="#636E72"
        strokeWidth={1 * s}
      />
      <line
        x1={cx - 19 * s}
        y1={cy + 6 * s}
        x2={cx - 6 * s}
        y2={cy + 5 * s}
        stroke="#636E72"
        strokeWidth={1 * s}
      />
      <line
        x1={cx + 20 * s}
        y1={cy + 2 * s}
        x2={cx + 6 * s}
        y2={cy + 4 * s}
        stroke="#636E72"
        strokeWidth={1 * s}
      />
      <line
        x1={cx + 19 * s}
        y1={cy + 6 * s}
        x2={cx + 6 * s}
        y2={cy + 5 * s}
        stroke="#636E72"
        strokeWidth={1 * s}
      />
      {/* Tail */}
      <path
        d={`M${cx + 14 * s},${cy + 34 * s} Q${cx + 28 * s},${cy + 20 * s} ${cx + 22 * s},${cy + 10 * s}`}
        stroke={p.body}
        strokeWidth={5 * s}
        strokeLinecap="round"
        fill="none"
        className="kids-char-tail"
      />
      {/* Paws */}
      <ellipse
        cx={cx - 8 * s}
        cy={cy + 38 * s}
        rx={5 * s}
        ry={3 * s}
        fill={p.belly}
      />
      <ellipse
        cx={cx + 8 * s}
        cy={cy + 38 * s}
        rx={5 * s}
        ry={3 * s}
        fill={p.belly}
      />
    </g>
  );
}

function renderFox(p, cx, cy, s) {
  return (
    <g>
      {/* Ears */}
      <path
        d={`M${cx - 14 * s},${cy - 14 * s} L${cx - 20 * s},${cy - 36 * s} L${cx - 2 * s},${cy - 18 * s} Z`}
        fill={p.body}
      />
      <path
        d={`M${cx - 13 * s},${cy - 18 * s} L${cx - 17 * s},${cy - 30 * s} L${cx - 5 * s},${cy - 20 * s} Z`}
        fill={p.belly}
      />
      <path
        d={`M${cx + 14 * s},${cy - 14 * s} L${cx + 20 * s},${cy - 36 * s} L${cx + 2 * s},${cy - 18 * s} Z`}
        fill={p.body}
      />
      <path
        d={`M${cx + 13 * s},${cy - 18 * s} L${cx + 17 * s},${cy - 30 * s} L${cx + 5 * s},${cy - 20 * s} Z`}
        fill={p.belly}
      />
      {/* Body */}
      <ellipse cx={cx} cy={cy + 18 * s} rx={17 * s} ry={22 * s} fill={p.body} />
      <ellipse
        cx={cx}
        cy={cy + 24 * s}
        rx={11 * s}
        ry={12 * s}
        fill={p.belly}
      />
      {/* Head */}
      <ellipse cx={cx} cy={cy - 2 * s} rx={20 * s} ry={18 * s} fill={p.body} />
      {/* White face mask */}
      <ellipse cx={cx} cy={cy + 4 * s} rx={12 * s} ry={10 * s} fill={p.belly} />
      {/* Nose */}
      <ellipse cx={cx} cy={cy + 1 * s} rx={3 * s} ry={2.5 * s} fill="#2D3436" />
      {/* Tail */}
      <path
        d={`M${cx + 14 * s},${cy + 30 * s} Q${cx + 30 * s},${cy + 14 * s} ${cx + 24 * s},${cy + 4 * s}`}
        stroke={p.body}
        strokeWidth={7 * s}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx={cx + 24 * s} cy={cy + 4 * s} r={4 * s} fill={p.belly} />
      {/* Paws */}
      <ellipse
        cx={cx - 8 * s}
        cy={cy + 38 * s}
        rx={5 * s}
        ry={3 * s}
        fill="#2D3436"
      />
      <ellipse
        cx={cx + 8 * s}
        cy={cy + 38 * s}
        rx={5 * s}
        ry={3 * s}
        fill="#2D3436"
      />
    </g>
  );
}

function renderRobot(p, cx, cy, s) {
  return (
    <g>
      {/* Antenna */}
      <line
        x1={cx}
        y1={cy - 28 * s}
        x2={cx}
        y2={cy - 38 * s}
        stroke={p.accent}
        strokeWidth={2.5 * s}
      />
      <circle
        cx={cx}
        cy={cy - 40 * s}
        r={4 * s}
        fill="#FECA57"
        className="kids-char-antenna"
      />
      {/* Head */}
      <rect
        x={cx - 20 * s}
        y={cy - 26 * s}
        width={40 * s}
        height={32 * s}
        rx={8 * s}
        fill={p.body}
      />
      {/* Face screen */}
      <rect
        x={cx - 16 * s}
        y={cy - 22 * s}
        width={32 * s}
        height={24 * s}
        rx={4 * s}
        fill={p.belly}
      />
      {/* Body */}
      <rect
        x={cx - 18 * s}
        y={cy + 8 * s}
        width={36 * s}
        height={28 * s}
        rx={6 * s}
        fill={p.body}
      />
      {/* Belly panel */}
      <rect
        x={cx - 10 * s}
        y={cy + 14 * s}
        width={20 * s}
        height={16 * s}
        rx={3 * s}
        fill={p.belly}
      />
      {/* Belly buttons */}
      <circle cx={cx - 4 * s} cy={cy + 20 * s} r={2 * s} fill={p.accent} />
      <circle cx={cx + 4 * s} cy={cy + 20 * s} r={2 * s} fill="#FECA57" />
      <circle cx={cx} cy={cy + 26 * s} r={2 * s} fill="#FF6B6B" />
      {/* Arms */}
      <rect
        x={cx - 26 * s}
        y={cy + 10 * s}
        width={6 * s}
        height={20 * s}
        rx={3 * s}
        fill={p.accent}
        className="kids-char-wing-left"
      />
      <rect
        x={cx + 20 * s}
        y={cy + 10 * s}
        width={6 * s}
        height={20 * s}
        rx={3 * s}
        fill={p.accent}
        className="kids-char-wing-right"
      />
      {/* Legs */}
      <rect
        x={cx - 10 * s}
        y={cy + 36 * s}
        width={7 * s}
        height={8 * s}
        rx={3 * s}
        fill={p.accent}
      />
      <rect
        x={cx + 3 * s}
        y={cy + 36 * s}
        width={7 * s}
        height={8 * s}
        rx={3 * s}
        fill={p.accent}
      />
    </g>
  );
}

function renderStar(p, cx, cy, s) {
  const points = 5;
  const outerR = 28 * s;
  const innerR = 14 * s;
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + r * Math.cos(angle);
    const y = cy + 4 * s + r * Math.sin(angle);
    d += (i === 0 ? 'M' : 'L') + `${x},${y}`;
  }
  d += 'Z';
  return (
    <g>
      <path d={d} fill={p.body} stroke={p.accent} strokeWidth={2 * s} />
      {/* Inner glow */}
      <circle cx={cx} cy={cy + 4 * s} r={10 * s} fill={p.belly} opacity={0.5} />
      {/* Arms (small rays) */}
      <ellipse
        cx={cx - 22 * s}
        cy={cy + 6 * s}
        rx={4 * s}
        ry={2 * s}
        fill={p.accent}
        className="kids-char-wing-left"
      />
      <ellipse
        cx={cx + 22 * s}
        cy={cy + 6 * s}
        rx={4 * s}
        ry={2 * s}
        fill={p.accent}
        className="kids-char-wing-right"
      />
    </g>
  );
}

function renderPenguin(p, cx, cy, s) {
  return (
    <g>
      {/* Body */}
      <ellipse cx={cx} cy={cy + 14 * s} rx={20 * s} ry={28 * s} fill={p.body} />
      {/* Belly */}
      <ellipse
        cx={cx}
        cy={cy + 18 * s}
        rx={14 * s}
        ry={20 * s}
        fill={p.belly}
      />
      {/* Head */}
      <circle cx={cx} cy={cy - 10 * s} r={18 * s} fill={p.body} />
      {/* Face */}
      <ellipse cx={cx} cy={cy - 6 * s} rx={13 * s} ry={10 * s} fill={p.belly} />
      {/* Beak */}
      <path
        d={`M${cx - 4 * s},${cy + 2 * s} L${cx},${cy + 7 * s} L${cx + 4 * s},${cy + 2 * s}`}
        fill="#F0932B"
      />
      {/* Wings */}
      <ellipse
        cx={cx - 22 * s}
        cy={cy + 10 * s}
        rx={6 * s}
        ry={16 * s}
        fill={p.accent}
        transform={`rotate(-10 ${cx - 22 * s} ${cy + 10 * s})`}
        className="kids-char-wing-left"
      />
      <ellipse
        cx={cx + 22 * s}
        cy={cy + 10 * s}
        rx={6 * s}
        ry={16 * s}
        fill={p.accent}
        transform={`rotate(10 ${cx + 22 * s} ${cy + 10 * s})`}
        className="kids-char-wing-right"
      />
      {/* Feet */}
      <ellipse
        cx={cx - 8 * s}
        cy={cy + 40 * s}
        rx={7 * s}
        ry={3 * s}
        fill="#F0932B"
      />
      <ellipse
        cx={cx + 8 * s}
        cy={cy + 40 * s}
        rx={7 * s}
        ry={3 * s}
        fill="#F0932B"
      />
    </g>
  );
}

function renderMonkey(p, cx, cy, s) {
  return (
    <g>
      {/* Ears */}
      <circle cx={cx - 22 * s} cy={cy - 4 * s} r={8 * s} fill={p.body} />
      <circle cx={cx - 22 * s} cy={cy - 4 * s} r={5 * s} fill={p.belly} />
      <circle cx={cx + 22 * s} cy={cy - 4 * s} r={8 * s} fill={p.body} />
      <circle cx={cx + 22 * s} cy={cy - 4 * s} r={5 * s} fill={p.belly} />
      {/* Body */}
      <ellipse cx={cx} cy={cy + 18 * s} rx={18 * s} ry={22 * s} fill={p.body} />
      <ellipse
        cx={cx}
        cy={cy + 22 * s}
        rx={12 * s}
        ry={14 * s}
        fill={p.belly}
      />
      {/* Head */}
      <circle cx={cx} cy={cy - 4 * s} r={20 * s} fill={p.body} />
      {/* Face */}
      <ellipse cx={cx} cy={cy + 2 * s} rx={14 * s} ry={11 * s} fill={p.belly} />
      {/* Nose */}
      <ellipse
        cx={cx - 3 * s}
        cy={cy + 2 * s}
        rx={2 * s}
        ry={1.5 * s}
        fill="#2D3436"
      />
      <ellipse
        cx={cx + 3 * s}
        cy={cy + 2 * s}
        rx={2 * s}
        ry={1.5 * s}
        fill="#2D3436"
      />
      {/* Arms */}
      <ellipse
        cx={cx - 22 * s}
        cy={cy + 14 * s}
        rx={6 * s}
        ry={16 * s}
        fill={p.body}
        className="kids-char-wing-left"
      />
      <ellipse
        cx={cx + 22 * s}
        cy={cy + 14 * s}
        rx={6 * s}
        ry={16 * s}
        fill={p.body}
        className="kids-char-wing-right"
      />
      {/* Tail */}
      <path
        d={`M${cx + 16 * s},${cy + 34 * s} Q${cx + 32 * s},${cy + 28 * s} ${cx + 28 * s},${cy + 12 * s} Q${cx + 26 * s},${cy + 6 * s} ${cx + 30 * s},${cy + 2 * s}`}
        stroke={p.body}
        strokeWidth={4 * s}
        strokeLinecap="round"
        fill="none"
        className="kids-char-tail"
      />
      {/* Feet */}
      <ellipse
        cx={cx - 8 * s}
        cy={cy + 38 * s}
        rx={6 * s}
        ry={4 * s}
        fill={p.accent}
      />
      <ellipse
        cx={cx + 8 * s}
        cy={cy + 38 * s}
        rx={6 * s}
        ry={4 * s}
        fill={p.accent}
      />
    </g>
  );
}

function renderFrog(p, cx, cy, s) {
  return (
    <g>
      {/* Body */}
      <ellipse cx={cx} cy={cy + 16 * s} rx={22 * s} ry={20 * s} fill={p.body} />
      <ellipse
        cx={cx}
        cy={cy + 20 * s}
        rx={16 * s}
        ry={14 * s}
        fill={p.belly}
      />
      {/* Head */}
      <ellipse cx={cx} cy={cy - 4 * s} rx={22 * s} ry={16 * s} fill={p.body} />
      {/* Eye bumps */}
      <circle cx={cx - 12 * s} cy={cy - 16 * s} r={8 * s} fill={p.body} />
      <circle cx={cx + 12 * s} cy={cy - 16 * s} r={8 * s} fill={p.body} />
      {/* Wide mouth line */}
      <path
        d={`M${cx - 14 * s},${cy + 6 * s} Q${cx},${cy + 12 * s} ${cx + 14 * s},${cy + 6 * s}`}
        stroke={p.accent}
        strokeWidth={2 * s}
        strokeLinecap="round"
        fill="none"
      />
      {/* Front legs */}
      <ellipse
        cx={cx - 20 * s}
        cy={cy + 30 * s}
        rx={6 * s}
        ry={4 * s}
        fill={p.accent}
        transform={`rotate(-20 ${cx - 20 * s} ${cy + 30 * s})`}
        className="kids-char-wing-left"
      />
      <ellipse
        cx={cx + 20 * s}
        cy={cy + 30 * s}
        rx={6 * s}
        ry={4 * s}
        fill={p.accent}
        transform={`rotate(20 ${cx + 20 * s} ${cy + 30 * s})`}
        className="kids-char-wing-right"
      />
      {/* Back legs */}
      <ellipse
        cx={cx - 16 * s}
        cy={cy + 36 * s}
        rx={8 * s}
        ry={4 * s}
        fill={p.body}
      />
      <ellipse
        cx={cx + 16 * s}
        cy={cy + 36 * s}
        rx={8 * s}
        ry={4 * s}
        fill={p.body}
      />
    </g>
  );
}

const SPECIES_RENDERERS = {
  owl: renderOwl,
  bunny: renderBunny,
  bear: renderBear,
  cat: renderCat,
  fox: renderFox,
  robot: renderRobot,
  star: renderStar,
  penguin: renderPenguin,
  monkey: renderMonkey,
  frog: renderFrog,
};

// ── CSS keyframes (injected once) ────────────────────────────────
const CHAR_STYLES = `
  /* Idle bounce + blink */
  .kids-char-idle {
    animation: kidsCharBounce 2.5s ease-in-out infinite;
  }
  @keyframes kidsCharBounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }

  /* Wing/arm wave */
  .kids-char-wing-left { transform-origin: center top; }
  .kids-char-wing-right { transform-origin: center top; }
  .kids-char-idle .kids-char-wing-left,
  .kids-char-idle .kids-char-wing-right {
    animation: kidsCharWingIdle 3s ease-in-out infinite;
  }
  @keyframes kidsCharWingIdle {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(-5deg); }
  }

  /* Celebrate — jump + spin */
  .kids-char-celebrate {
    animation: kidsCharCelebrate 0.9s ease-in-out;
  }
  @keyframes kidsCharCelebrate {
    0% { transform: translateY(0) rotate(0deg) scale(1); }
    25% { transform: translateY(-20px) rotate(-8deg) scale(1.15); }
    50% { transform: translateY(-12px) rotate(8deg) scale(1.1); }
    75% { transform: translateY(-4px) rotate(-3deg) scale(1.05); }
    100% { transform: translateY(0) rotate(0deg) scale(1); }
  }
  .kids-char-celebrate .kids-char-wing-left,
  .kids-char-celebrate .kids-char-wing-right {
    animation: kidsCharWingFlap 0.3s ease-in-out 3;
  }
  @keyframes kidsCharWingFlap {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(-30deg); }
  }

  /* Encourage — gentle sway */
  .kids-char-encourage {
    animation: kidsCharEncourage 1.2s ease-in-out;
  }
  @keyframes kidsCharEncourage {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-8deg); }
    75% { transform: rotate(8deg); }
  }
  .kids-char-encourage .kids-char-wing-left {
    animation: kidsCharWaveLeft 0.8s ease-in-out 2;
  }
  @keyframes kidsCharWaveLeft {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(-25deg); }
  }

  /* Think — head tilt */
  .kids-char-think {
    animation: kidsCharThink 2s ease-in-out infinite;
  }
  @keyframes kidsCharThink {
    0%, 100% { transform: rotate(0deg) translateY(0); }
    50% { transform: rotate(5deg) translateY(-3px); }
  }

  /* Talk — mouth open/close */
  .kids-char-mouth-talk {
    animation: kidsCharTalk 0.4s ease-in-out infinite;
  }
  @keyframes kidsCharTalk {
    0%, 100% { ry: 2; }
    50% { ry: 5; }
  }

  /* Sleep */
  .kids-char-sleep {
    animation: kidsCharSleep 3s ease-in-out infinite;
  }
  @keyframes kidsCharSleep {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(2px) scale(0.98); }
  }

  /* Antenna glow (robot) */
  .kids-char-antenna {
    animation: kidsCharAntennaGlow 1.5s ease-in-out infinite;
  }
  @keyframes kidsCharAntennaGlow {
    0%, 100% { filter: drop-shadow(0 0 2px rgba(254,202,110,0.4)); }
    50% { filter: drop-shadow(0 0 8px rgba(254,202,110,0.9)); }
  }

  /* Tail sway */
  .kids-char-tail {
    animation: kidsCharTailSway 3s ease-in-out infinite;
    transform-origin: bottom center;
  }
  @keyframes kidsCharTailSway {
    0%, 100% { transform: rotate(0deg); }
    50% { transform: rotate(5deg); }
  }

  /* Blink (on eyes) */
  .kids-char-blink {
    animation: kidsCharBlink 4s ease-in-out infinite;
  }
  @keyframes kidsCharBlink {
    0%, 42%, 46%, 100% { transform: scaleY(1); }
    44% { transform: scaleY(0.1); }
  }
`;

let stylesInjected = false;

// ── Main Component ──────────────────────────────────────────────
export default function KidsCharacter({
  species,
  color,
  expression = 'happy',
  accessory = 'none',
  state = 'idle',
  size = 96,
  talking = false,
  onClick,
  seed,
  sx,
}) {
  // Deterministic random selection from seed (game id, question index, etc.)
  const resolved = useMemo(() => {
    const s = seed || `${species || ''}${color || ''}`;
    const h = hashSeed(s || String(Math.random()));
    return {
      species: species || SPECIES[h % SPECIES.length],
      color: color || PALETTE_NAMES[(h >> 4) % PALETTE_NAMES.length],
      accessory:
        accessory !== 'none'
          ? accessory
          : ACCESSORIES[(h >> 8) % ACCESSORIES.length],
    };
  }, [species, color, accessory, seed]);

  const palette = PALETTES[resolved.color] || PALETTES.purple;
  const scale = size / 96; // 96px = 1x scale
  const vbW = 80;
  const vbH = 100;
  const cx = vbW / 2;
  const cy = vbH / 2 - 4;
  const svgScale = 1; // already scaled via viewBox → width/height

  const renderSpecies = SPECIES_RENDERERS[resolved.species] || renderOwl;
  const stateClass = `kids-char-${state}`;

  // Inject styles once
  if (!stylesInjected && typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = CHAR_STYLES;
    document.head.appendChild(style);
    stylesInjected = true;
  }

  const eyeY =
    resolved.species === 'frog'
      ? cy - 16
      : resolved.species === 'robot'
        ? cy - 10
        : cy - 8;
  const mouthY = resolved.species === 'robot' ? cy + 0 : cy + 6;
  const accTopY = resolved.species === 'star' ? cy - 26 : cy - 26;

  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))',
        ...sx,
      }}
    >
      <svg
        width={size}
        height={size * (vbH / vbW)}
        viewBox={`0 0 ${vbW} ${vbH}`}
        className={stateClass}
        style={{overflow: 'visible'}}
      >
        {/* Species body */}
        {renderSpecies(palette, cx, cy, svgScale)}

        {/* Eyes with blink */}
        <g className="kids-char-blink">
          {renderEyes(expression, palette.body, cx, eyeY, svgScale)}
        </g>

        {/* Mouth */}
        {renderMouth(expression, talking, cx, mouthY, svgScale)}

        {/* Cheeks */}
        {renderCheeks(expression, palette.cheek, cx, eyeY, svgScale)}

        {/* Accessory */}
        {renderAccessory(
          resolved.accessory,
          cx,
          accTopY,
          svgScale,
          palette.accent
        )}

        {/* Celebrate sparkles */}
        {state === 'celebrate' && (
          <g>
            {[...Array(6)].map((_, i) => {
              const angle = ((Math.PI * 2) / 6) * i;
              const r = 32 * svgScale;
              const sx2 = cx + r * Math.cos(angle);
              const sy = cy + r * Math.sin(angle);
              return (
                <circle
                  key={i}
                  cx={sx2}
                  cy={sy}
                  r={2 * svgScale}
                  fill={
                    [
                      '#FECA57',
                      '#FF6B6B',
                      '#6C63FF',
                      '#00B894',
                      '#FD79A8',
                      '#54A0FF',
                    ][i]
                  }
                  style={{
                    animation: `kidsCharSparkle 0.8s ${i * 0.1}s ease-out both`,
                  }}
                />
              );
            })}
            <style>{`
              @keyframes kidsCharSparkle {
                0% { opacity: 1; transform: scale(1); }
                100% { opacity: 0; transform: scale(2) translateY(-10px); }
              }
            `}</style>
          </g>
        )}
      </svg>
    </Box>
  );
}

// ── Static helpers for external use ─────────────────────────────
KidsCharacter.SPECIES = SPECIES;
KidsCharacter.PALETTES = PALETTE_NAMES;
KidsCharacter.ACCESSORIES = ACCESSORIES;
KidsCharacter.EXPRESSIONS = EXPRESSIONS;
KidsCharacter.STATES = STATES;

/**
 * Get a deterministic unique character for a given seed string.
 * Returns { species, color, accessory } that can be spread as props.
 */
KidsCharacter.fromSeed = function fromSeed(seedStr) {
  const h = hashSeed(seedStr);
  return {
    species: SPECIES[h % SPECIES.length],
    color: PALETTE_NAMES[(h >> 4) % PALETTE_NAMES.length],
    accessory: ACCESSORIES[(h >> 8) % ACCESSORIES.length],
  };
};
