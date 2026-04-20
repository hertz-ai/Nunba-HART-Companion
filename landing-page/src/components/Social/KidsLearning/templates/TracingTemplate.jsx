/**
 * TracingTemplate - Dynamic Liquid Agentic UI
 *
 * SVG canvas tracing/drawing activity. Shows a target letter or shape as a
 * dotted outline, user draws over it with mouse/touch. Score based on
 * proximity to target path. Kid-friendly with large stroke width.
 *
 * Props:
 *   config     - { content: { traces: [{
 *                   letter?: string,           // e.g. "A"
 *                   label?: string,            // e.g. "Trace the letter A"
 *                   path?: string,             // SVG path data (optional, auto-generated for letters)
 *                   concept?: string
 *                 }] } }
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import {logger} from '../../../../utils/logger';
import {kidsColors, kidsAnimations} from '../kidsTheme';
import InlineCelebration from '../shared/InlineCelebration';
import ProgressStars from '../shared/ProgressStars';
import {GameSounds, GameCommentary} from '../shared/SoundManager';
import useCelebration from '../shared/useCelebration';

import {
  Box,
  Typography,
  Button,
  Card,
  LinearProgress,
  Fade,
  Grow,
} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback} from 'react';

const STROKE_WIDTH = 8;
const TARGET_STROKE_WIDTH = 12;
const CANVAS_SIZE = 300;
const ACCURACY_THRESHOLD = 0.4; // 40% proximity = pass

// Simple letter path data for common letters (MVP subset)
const LETTER_PATHS = {
  A: 'M 50 250 L 150 50 L 250 250 M 90 170 L 210 170',
  B: 'M 70 50 L 70 250 L 180 250 Q 240 250 240 200 Q 240 155 180 150 L 70 150 L 180 150 Q 230 150 230 105 Q 230 50 180 50 L 70 50',
  C: 'M 230 80 Q 150 20 80 80 Q 20 150 80 220 Q 150 280 230 220',
  D: 'M 70 50 L 70 250 L 160 250 Q 250 250 250 150 Q 250 50 160 50 L 70 50',
  E: 'M 210 50 L 70 50 L 70 150 L 190 150 M 70 150 L 70 250 L 210 250',
  F: 'M 210 50 L 70 50 L 70 150 L 180 150 M 70 150 L 70 250',
  G: 'M 230 80 Q 150 20 80 80 Q 20 150 80 220 Q 150 280 230 220 L 230 150 L 170 150',
  H: 'M 70 50 L 70 250 M 230 50 L 230 250 M 70 150 L 230 150',
  I: 'M 100 50 L 200 50 M 150 50 L 150 250 M 100 250 L 200 250',
  J: 'M 120 50 L 220 50 M 190 50 L 190 200 Q 190 260 130 260 Q 70 260 70 210',
  K: 'M 70 50 L 70 250 M 220 50 L 70 150 L 220 250',
  L: 'M 70 50 L 70 250 L 220 250',
  M: 'M 50 250 L 50 50 L 150 170 L 250 50 L 250 250',
  N: 'M 70 250 L 70 50 L 230 250 L 230 50',
  O: 'M 150 50 Q 50 50 50 150 Q 50 250 150 250 Q 250 250 250 150 Q 250 50 150 50',
  P: 'M 70 250 L 70 50 L 180 50 Q 240 50 240 105 Q 240 155 180 155 L 70 155',
  Q: 'M 150 50 Q 50 50 50 150 Q 50 250 150 250 Q 250 250 250 150 Q 250 50 150 50 M 190 210 L 250 270',
  R: 'M 70 250 L 70 50 L 180 50 Q 240 50 240 105 Q 240 155 180 155 L 70 155 M 160 155 L 240 250',
  S: 'M 220 80 Q 220 30 150 30 Q 80 30 80 85 Q 80 150 150 150 Q 220 150 220 215 Q 220 270 150 270 Q 80 270 80 220',
  T: 'M 50 50 L 250 50 M 150 50 L 150 250',
  U: 'M 70 50 L 70 200 Q 70 260 150 260 Q 230 260 230 200 L 230 50',
  V: 'M 50 50 L 150 250 L 250 50',
  W: 'M 30 50 L 100 250 L 150 120 L 200 250 L 270 50',
  X: 'M 60 50 L 240 250 M 240 50 L 60 250',
  Y: 'M 60 50 L 150 150 L 240 50 M 150 150 L 150 250',
  Z: 'M 60 50 L 240 50 L 60 250 L 240 250',
  // Numbers
  0: 'M 150 50 Q 60 50 60 150 Q 60 250 150 250 Q 240 250 240 150 Q 240 50 150 50',
  1: 'M 100 90 L 160 50 L 160 250 M 100 250 L 220 250',
  2: 'M 70 90 Q 70 40 150 40 Q 230 40 230 100 Q 230 150 70 250 L 230 250',
  3: 'M 70 60 Q 150 20 220 70 Q 260 120 150 150 Q 260 180 220 230 Q 150 280 70 240',
  4: 'M 190 250 L 190 50 L 50 180 L 250 180',
  5: 'M 220 50 L 80 50 L 70 140 Q 150 110 220 150 Q 260 200 200 250 Q 140 280 70 240',
  6: 'M 55 25 C 45 25, 25 35, 25 55 C 25 75, 45 85, 55 75 C 65 65, 65 55, 55 50 C 45 45, 30 50, 30 60',
  7: 'M 25 25 L 75 25 L 45 85',
  8: 'M 50 50 C 35 50, 25 40, 35 30 C 45 20, 55 20, 65 30 C 75 40, 65 50, 50 50 C 35 50, 25 60, 35 70 C 45 80, 55 80, 65 70 C 75 60, 65 50, 50 50',
  9: 'M 55 50 C 45 55, 35 50, 35 40 C 35 25, 55 20, 65 30 C 75 40, 70 55, 60 75 L 50 85',
};

// Letter-to-emoji and letter-to-word mappings for visual association
const LETTER_EMOJIS = {
  A: '\uD83C\uDF4E',
  B: '\uD83E\uDD8B',
  C: '\uD83D\uDC31',
  D: '\uD83D\uDC36',
  E: '\uD83D\uDC18',
  F: '\uD83D\uDC38',
  G: '\uD83E\uDD92',
  H: '\uD83C\uDFE0',
  I: '\uD83C\uDF68',
  J: '\uD83E\uDE85',
  K: '\uD83E\uDD85',
  L: '\uD83E\uDD81',
  M: '\uD83C\uDF19',
  N: '\uD83C\uDF33',
  O: '\uD83D\uDC19',
  P: '\uD83D\uDC27',
  Q: '\uD83D\uDC51',
  R: '\uD83C\uDF08',
  S: '\u2B50',
  T: '\uD83C\uDF33',
  U: '\u2602\uFE0F',
  V: '\uD83C\uDFBB',
  W: '\uD83D\uDC33',
  X: '\u274C',
  Y: '\uD83C\uDF1F',
  Z: '\u26A1',
  0: '\uD83D\uDD35',
  1: '\u261D\uFE0F',
  2: '\u270C\uFE0F',
  3: '\uD83E\uDD1E',
  4: '\uD83C\uDF40',
  5: '\u2B50',
  6: '\uD83C\uDFB2',
  7: '\uD83C\uDF08',
  8: '\uD83D\uDC19',
  9: '\uD83C\uDF88',
};

const LETTER_WORDS = {
  A: 'Apple',
  B: 'Butterfly',
  C: 'Cat',
  D: 'Dog',
  E: 'Elephant',
  F: 'Frog',
  G: 'Giraffe',
  H: 'House',
  I: 'Ice Cream',
  J: 'Jellyfish',
  K: 'Kite',
  L: 'Lion',
  M: 'Moon',
  N: 'Nature',
  O: 'Octopus',
  P: 'Penguin',
  Q: 'Queen',
  R: 'Rainbow',
  S: 'Star',
  T: 'Tree',
  U: 'Umbrella',
  V: 'Violin',
  W: 'Whale',
  X: 'X-mark',
  Y: 'Yellow Star',
  Z: 'Zap',
};

// Sample points from SVG path for proximity calculation
function samplePathPoints(pathStr, numSamples = 50) {
  const points = [];
  // Parse simple path commands
  const commands = pathStr.match(/[MLQCZ][^MLQCZ]*/gi) || [];
  let cx = 0,
    cy = 0;

  for (const cmd of commands) {
    const type = cmd[0].toUpperCase();
    const nums = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => !isNaN(n));

    if (type === 'M' && nums.length >= 2) {
      cx = nums[0];
      cy = nums[1];
      points.push({x: cx, y: cy});
    } else if (type === 'L' && nums.length >= 2) {
      const steps = 5;
      const sx = cx,
        sy = cy;
      cx = nums[0];
      cy = nums[1];
      for (let t = 0; t <= steps; t++) {
        points.push({
          x: sx + (cx - sx) * (t / steps),
          y: sy + (cy - sy) * (t / steps),
        });
      }
    } else if (type === 'Q' && nums.length >= 4) {
      const steps = 8;
      const sx = cx,
        sy = cy;
      const cpx = nums[0],
        cpy = nums[1];
      cx = nums[2];
      cy = nums[3];
      for (let t = 0; t <= steps; t++) {
        const tt = t / steps;
        const x =
          (1 - tt) * (1 - tt) * sx + 2 * (1 - tt) * tt * cpx + tt * tt * cx;
        const y =
          (1 - tt) * (1 - tt) * sy + 2 * (1 - tt) * tt * cpy + tt * tt * cy;
        points.push({x, y});
      }
    }
  }
  return points;
}

// Calculate accuracy: proportion of user points near target path
function calculateAccuracy(userPoints, targetPoints, threshold = 30) {
  if (userPoints.length === 0 || targetPoints.length === 0) return 0;

  let closePoints = 0;
  for (const up of userPoints) {
    let minDist = Infinity;
    for (const tp of targetPoints) {
      const d = Math.sqrt((up.x - tp.x) ** 2 + (up.y - tp.y) ** 2);
      if (d < minDist) minDist = d;
    }
    if (minDist <= threshold) closePoints++;
  }
  return closePoints / userPoints.length;
}

export default function TracingTemplate({config, onAnswer, onComplete}) {
  const traces = config?.content?.traces ?? [];
  const total = traces.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  const {
    celebType,
    celebVisible,
    celebStreak,
    celebScore,
    starsEarned,
    triggerCorrect,
    triggerStreak,
    triggerComplete,
    handleCelebDone,
  } = useCelebration();

  // Per-trace state
  const [isDrawing, setIsDrawing] = useState(false);
  const [userPoints, setUserPoints] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [accuracy, setAccuracy] = useState(0);
  const [visible, setVisible] = useState(true);

  const svgRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const hasSpokenIntro = useRef(false);

  const trace = traces[currentIndex] ?? {};
  const letter = (trace.letter || '').toUpperCase();
  const targetPath = trace.path || LETTER_PATHS[letter] || '';
  const targetPoints = useRef([]);

  // Speak game intro on mount
  useEffect(() => {
    if (!hasSpokenIntro.current && config?.title) {
      hasSpokenIntro.current = true;
      try {
        GameCommentary.speakIntro(config.title);
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    startTimeRef.current = Date.now();
    setUserPoints([]);
    setShowFeedback(false);
    setAccuracy(0);
    setIsDrawing(false);
    setVisible(true);
    targetPoints.current = samplePathPoints(targetPath);
    // TTS: "This is the letter X! Trace it with your finger!"
    const t = traces[currentIndex];
    const l = (t?.letter || '').toUpperCase();
    const text =
      t?.label ||
      (l
        ? `This is the letter ${l}! Trace it with your finger!`
        : 'Trace the shape!');
    if (text) {
      try {
        GameSounds.speakText(text);
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, targetPath]);

  // ── get SVG-local coords ───────────────────────────────────────
  const getLocalCoords = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return {x: 0, y: 0};
    const rect = svg.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((clientY - rect.top) / rect.height) * CANVAS_SIZE,
    };
  }, []);

  // ── drawing handlers ───────────────────────────────────────────
  const handlePointerDown = useCallback(
    (e) => {
      if (showFeedback) return;
      e.preventDefault();
      setIsDrawing(true);
      const pt = getLocalCoords(e);
      setUserPoints([pt]);
    },
    [showFeedback, getLocalCoords]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!isDrawing || showFeedback) return;
      e.preventDefault();
      const pt = getLocalCoords(e);
      setUserPoints((prev) => [...prev, pt]);
    },
    [isDrawing, showFeedback, getLocalCoords]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
  }, [isDrawing]);

  // ── submit trace ───────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (showFeedback || userPoints.length < 5) return;

    const elapsed = Date.now() - startTimeRef.current;
    const acc = calculateAccuracy(userPoints, targetPoints.current);
    const isCorrect = acc >= ACCURACY_THRESHOLD;

    setAccuracy(acc);
    setShowFeedback(true);

    try {
      if (isCorrect) {
        GameSounds.correct();
        setTimeout(() => {
          try {
            GameCommentary.speakPraise();
          } catch (err) {
            logger.error(err); /* Game asset load — non-critical */
          }
        }, 400);
      } else {
        GameSounds.wrong();
        setTimeout(() => {
          try {
            GameCommentary.speakEncourage();
          } catch (err) {
            logger.error(err); /* Game asset load — non-critical */
          }
        }, 400);
      }
    } catch (err) {
      logger.error(err); /* Game asset load — non-critical */
    }

    const newScore = isCorrect ? score + 1 : score;
    const newStreak = isCorrect ? streak + 1 : 0;
    const newBest = Math.max(bestStreak, newStreak);

    setScore(newScore);
    setStreak(newStreak);
    setBestStreak(newBest);

    if (isCorrect) triggerCorrect();
    if (isCorrect && (newStreak === 3 || newStreak === 5 || newStreak === 10)) {
      triggerStreak(newStreak);
      try {
        GameCommentary.speakStreak(newStreak);
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
    }

    const result = {
      questionIndex: currentIndex,
      letter: trace.letter ?? '',
      accuracy: Math.round(acc * 100),
      isCorrect,
      concept: trace.concept ?? '',
      responseTimeMs: elapsed,
    };
    const newResults = [...results, result];
    setResults(newResults);

    if (onAnswer) onAnswer(isCorrect, trace.concept ?? '', elapsed);

    setTimeout(() => {
      setShowFeedback(false);
      setVisible(false);

      setTimeout(() => {
        if (currentIndex + 1 < total) {
          setCurrentIndex((i) => i + 1);
        } else {
          triggerComplete(newScore, total);
          try {
            GameCommentary.speakComplete(newScore, total);
          } catch (err) {
            logger.error(err); /* Game asset load — non-critical */
          }
          if (onComplete) {
            onComplete({
              score: newScore,
              correct: newScore,
              total,
              results: newResults,
              bestStreak: newBest,
            });
          }
        }
      }, 250);
    }, 2000);
  }, [
    showFeedback,
    userPoints,
    score,
    streak,
    bestStreak,
    results,
    currentIndex,
    total,
    trace,
    onAnswer,
    onComplete,
    triggerCorrect,
    triggerStreak,
    triggerComplete,
  ]);

  // ── clear drawing ──────────────────────────────────────────────
  const handleClear = useCallback(() => {
    if (showFeedback) return;
    setUserPoints([]);
  }, [showFeedback]);

  // Convert user points to SVG path string
  const userPathD =
    userPoints.length > 1
      ? 'M ' + userPoints.map((p) => `${p.x} ${p.y}`).join(' L ')
      : '';

  // ── guard ──────────────────────────────────────────────────────
  if (!traces.length) {
    return (
      <Box sx={{p: 4, textAlign: 'center'}}>
        <Typography color={kidsColors.textSecondary}>
          No tracing activities available.
        </Typography>
      </Box>
    );
  }

  const progress = (currentIndex / total) * 100;
  const accuracyPercent = Math.round(accuracy * 100);
  const isGood = accuracy >= ACCURACY_THRESHOLD;

  // ── render ─────────────────────────────────────────────────────
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 500,
        mx: 'auto',
        p: {xs: 2, sm: 3},
        ...kidsAnimations.fadeInUp,
      }}
    >
      {/* Progress */}
      <Box sx={{mb: 2}}>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 8,
            borderRadius: '4px',
            bgcolor: kidsColors.surfaceLight,
            '& .MuiLinearProgress-bar': {
              borderRadius: '4px',
              background: kidsColors.gradientPrimary,
              transition: 'transform 0.6s cubic-bezier(0.4,0,0.2,1)',
            },
          }}
        />
        <Box sx={{display: 'flex', justifyContent: 'space-between', mt: 0.5}}>
          <Typography variant="caption" sx={{color: kidsColors.textMuted}}>
            {currentIndex + 1} / {total}
          </Typography>
          <ProgressStars current={score} total={total} streak={streak} />
        </Box>
      </Box>

      {/* Instruction */}
      <Fade in={visible} timeout={350}>
        <Box sx={{textAlign: 'center', mb: 2}}>
          {trace.concept && (
            <Typography
              variant="overline"
              sx={{
                color: kidsColors.primaryLight,
                letterSpacing: 1.5,
                fontSize: '0.9rem',
                mb: 0.5,
                display: 'block',
              }}
            >
              {trace.concept}
            </Typography>
          )}
          {/* Letter emoji association */}
          {(trace.emoji || LETTER_EMOJIS[letter]) && (
            <Box sx={{fontSize: 56, lineHeight: 1, mb: 0.5}}>
              {trace.emoji || LETTER_EMOJIS[letter]}
            </Box>
          )}
          <Typography
            variant="h6"
            sx={{color: kidsColors.textPrimary, fontWeight: 700}}
          >
            {trace.label || `Trace the letter ${letter}`}
            {LETTER_WORDS[letter] && (
              <Box component="span" sx={{ml: 1, fontSize: '1.2rem'}}>
                for {LETTER_WORDS[letter]}
              </Box>
            )}
          </Typography>
        </Box>
      </Fade>

      {/* SVG canvas */}
      <Fade in={visible} timeout={400}>
        <Card
          elevation={0}
          sx={{
            background: kidsColors.cardBg,
            backdropFilter: 'blur(16px)',
            border: `2px solid ${
              showFeedback
                ? isGood
                  ? kidsColors.correct
                  : kidsColors.incorrect
                : kidsColors.cardBorder
            }`,
            borderRadius: '24px',
            boxShadow: showFeedback
              ? isGood
                ? kidsColors.glowCorrect
                : kidsColors.glowIncorrect
              : kidsColors.shadowCard,
            p: 0,
            mb: 2,
            overflow: 'hidden',
            transition: 'all 0.4s ease',
          }}
        >
          <svg
            ref={svgRef}
            role="img"
            aria-label={`Tracing canvas for ${letter || 'shape'}`}
            viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
            style={{
              width: '100%',
              height: 'auto',
              aspectRatio: '1',
              cursor: showFeedback ? 'default' : 'crosshair',
              touchAction: 'none',
            }}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          >
            {/* Background grid (subtle) */}
            <defs>
              <pattern
                id="grid"
                width="30"
                height="30"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 30 0 L 0 0 0 30"
                  fill="none"
                  stroke={`${kidsColors.primaryLight}15`}
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect width={CANVAS_SIZE} height={CANVAS_SIZE} fill="url(#grid)" />

            {/* Target path (dotted outline) */}
            {targetPath && (
              <path
                d={targetPath}
                fill="none"
                stroke={`${kidsColors.primaryLight}40`}
                strokeWidth={TARGET_STROKE_WIDTH}
                strokeDasharray="8 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* User drawing path */}
            {userPathD && (
              <path
                d={userPathD}
                fill="none"
                stroke={
                  showFeedback
                    ? isGood
                      ? kidsColors.correct
                      : kidsColors.incorrect
                    : kidsColors.primary
                }
                strokeWidth={STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.85}
              />
            )}

            {/* Starting dot */}
            {targetPoints.current.length > 0 &&
              !showFeedback &&
              userPoints.length === 0 && (
                <circle
                  cx={targetPoints.current[0].x}
                  cy={targetPoints.current[0].y}
                  r={10}
                  fill={kidsColors.correct}
                  opacity={0.6}
                >
                  <animate
                    attributeName="r"
                    values="8;12;8"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.4;0.8;0.4"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
          </svg>
        </Card>
      </Fade>

      {/* Action buttons */}
      <Box sx={{display: 'flex', justifyContent: 'center', gap: 2, mb: 2}}>
        <Button
          variant="outlined"
          onClick={handleClear}
          disabled={showFeedback || userPoints.length === 0}
          sx={{
            borderRadius: '14px',
            fontWeight: 600,
            textTransform: 'none',
            borderColor: kidsColors.cardBorder,
            color: kidsColors.textSecondary,
            px: 3,
            transition: 'all 0.3s ease',
            '&:hover': {
              borderColor: kidsColors.incorrect,
              color: kidsColors.incorrect,
              background: kidsColors.incorrectBg,
            },
          }}
        >
          Clear
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={showFeedback || userPoints.length < 5}
          sx={{
            borderRadius: '14px',
            fontWeight: 700,
            textTransform: 'none',
            background: kidsColors.gradientPrimary,
            color: '#fff',
            px: 4,
            boxShadow: kidsColors.shadowPrimary,
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: kidsColors.shadowElevated,
            },
            '&:disabled': {
              background: kidsColors.surfaceLight,
              color: kidsColors.textMuted,
            },
          }}
        >
          Check
        </Button>
      </Box>

      {/* Feedback */}
      <Fade in={showFeedback} timeout={400}>
        <Box sx={{textAlign: 'center', minHeight: 60}}>
          {isGood ? (
            <>
              <Typography
                variant="h5"
                sx={{
                  color: kidsColors.correct,
                  fontWeight: 800,
                  animation: 'celebrate 0.7s ease-in-out',
                  ...kidsAnimations.celebrate,
                }}
              >
                Great tracing!
              </Typography>
              <Typography
                variant="body2"
                sx={{color: kidsColors.textSecondary, mt: 0.5}}
              >
                {accuracyPercent}% accuracy
              </Typography>
            </>
          ) : (
            <>
              <Typography
                variant="h6"
                sx={{color: kidsColors.incorrect, fontWeight: 700}}
              >
                Nice try! Follow the dotted lines more closely.
              </Typography>
              <Typography
                variant="body2"
                sx={{color: kidsColors.textSecondary, mt: 0.5}}
              >
                {accuracyPercent}% accuracy (need{' '}
                {Math.round(ACCURACY_THRESHOLD * 100)}%)
              </Typography>
            </>
          )}
        </Box>
      </Fade>

      <InlineCelebration type={celebType} gameTemplate="tracing" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />
    </Box>
  );
}
