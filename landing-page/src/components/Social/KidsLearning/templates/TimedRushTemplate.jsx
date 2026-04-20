/**
 * TimedRushTemplate - Dynamic Liquid Agentic UI
 *
 * Fast-paced multiple choice with a countdown timer. Quick tap answers with
 * minimal feedback delay. Score multiplier for fast answers, combo counter,
 * and time bonus for remaining seconds.
 *
 * Props:
 *   config     - { content: { timeLimit: number, questions: [{ question, options, correctIndex, concept }] } }
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import {logger} from '../../../../utils/logger';
import {kidsColors, kidsAnimations} from '../kidsTheme';
import InlineCelebration from '../shared/InlineCelebration';
import ProgressStars from '../shared/ProgressStars';
import {GameSounds} from '../shared/SoundManager';
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

const FEEDBACK_DELAY = 800;
const OPTION_COLORS = [
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.purple,
];

export default function TimedRushTemplate({config, onAnswer, onComplete}) {
  const timeLimit = config?.content?.timeLimit ?? 60;
  const questions = config?.content?.questions ?? [];
  const total = questions.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [results, setResults] = useState([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [combo, setCombo] = useState(0);

  // Per-question state
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [visible, setVisible] = useState(true);

  // Timer
  const [timeLeft, setTimeLeft] = useState(timeLimit);
  const [gameOver, setGameOver] = useState(false);

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

  const startTimeRef = useRef(Date.now());
  const questionStartRef = useRef(Date.now());
  const timerRef = useRef(null);

  // Start countdown
  useEffect(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Reset question timer + TTS auto-read
  useEffect(() => {
    questionStartRef.current = Date.now();
    setVisible(true);
    // TTS: auto-read question text
    const q = questions[currentIndex];
    if (q?.question) {
      try {
        GameSounds.speakText(q.question);
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Handle time up
  useEffect(() => {
    if (timeLeft === 0 && !gameOver) {
      setGameOver(true);
      clearInterval(timerRef.current);

      if (onComplete) {
        onComplete({
          score,
          correct: correctCount,
          total: Math.min(currentIndex + (showFeedback ? 1 : 0), total),
          results,
          bestStreak,
        });
      }
    }
  }, [
    timeLeft,
    gameOver,
    score,
    correctCount,
    currentIndex,
    total,
    results,
    bestStreak,
    showFeedback,
    onComplete,
  ]);

  // ── calculate score multiplier ─────────────────────────────────
  const getMultiplier = (responseMs) => {
    if (responseMs < 1500) return 3;
    if (responseMs < 3000) return 2;
    return 1;
  };

  // ── handle option selection ────────────────────────────────────
  const handleSelect = useCallback(
    (optIndex) => {
      if (showFeedback || gameOver) return;

      const elapsed = Date.now() - questionStartRef.current;
      const q = questions[currentIndex];
      const isCorrect = optIndex === q.correctIndex;
      const multiplier = isCorrect ? getMultiplier(elapsed) : 0;

      setSelectedIndex(optIndex);
      setShowFeedback(true);

      try {
        if (isCorrect) {
          GameSounds.correct();
        } else {
          GameSounds.wrong();
        }
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }

      const pointsEarned = isCorrect ? multiplier : 0;
      const newScore = score + pointsEarned;
      const newCorrect = isCorrect ? correctCount + 1 : correctCount;
      const newStreak = isCorrect ? streak + 1 : 0;
      const newCombo = isCorrect ? combo + 1 : 0;
      const newBest = Math.max(bestStreak, newStreak);

      setScore(newScore);
      setCorrectCount(newCorrect);
      setStreak(newStreak);
      setCombo(newCombo);
      setBestStreak(newBest);

      const result = {
        questionIndex: currentIndex,
        question: q.question,
        selected: optIndex,
        correct: q.correctIndex,
        isCorrect,
        concept: q.concept ?? '',
        responseTimeMs: elapsed,
        pointsEarned,
        multiplier,
      };
      const newResults = [...results, result];
      setResults(newResults);

      if (isCorrect) triggerCorrect();
      if (isCorrect && (newStreak === 3 || newStreak === 5 || newStreak === 10))
        triggerStreak(newStreak);

      if (onAnswer) onAnswer(isCorrect, q.concept ?? '', elapsed);

      // Quick advance
      setTimeout(() => {
        setShowFeedback(false);
        setSelectedIndex(null);
        setVisible(false);

        setTimeout(() => {
          if (currentIndex + 1 < total) {
            setCurrentIndex((i) => i + 1);
          } else {
            // All questions done - add time bonus
            clearInterval(timerRef.current);
            const timeBonus = timeLeft;
            const finalScore = newScore + timeBonus;
            setScore(finalScore);
            setGameOver(true);

            triggerComplete(newCorrect, total);

            if (onComplete) {
              onComplete({
                score: finalScore,
                correct: newCorrect,
                total,
                results: newResults,
                bestStreak: newBest,
                timeBonus,
              });
            }
          }
        }, 150);
      }, FEEDBACK_DELAY);
    },
    [
      showFeedback,
      gameOver,
      currentIndex,
      questions,
      score,
      correctCount,
      streak,
      combo,
      bestStreak,
      results,
      total,
      timeLeft,
      onAnswer,
      onComplete,
      triggerCorrect,
      triggerStreak,
      triggerComplete,
    ]
  );

  // ── guard ──────────────────────────────────────────────────────
  if (!questions.length) {
    return (
      <Box sx={{p: 4, textAlign: 'center'}}>
        <Typography color={kidsColors.textSecondary}>
          No questions available.
        </Typography>
      </Box>
    );
  }

  if (gameOver) {
    const timeBonus = timeLeft;
    return (
      <Fade in timeout={500}>
        <Box
          sx={{
            width: '100%',
            maxWidth: 500,
            mx: 'auto',
            p: {xs: 3, sm: 4},
            textAlign: 'center',
            ...kidsAnimations.fadeInScale,
            animation: 'fadeInScale 0.5s ease-out',
          }}
        >
          <Card
            elevation={0}
            sx={{
              background: kidsColors.cardBg,
              backdropFilter: 'blur(16px)',
              border: `1px solid ${kidsColors.cardBorder}`,
              borderRadius: '24px',
              boxShadow: kidsColors.shadowCard,
              p: 4,
            }}
          >
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                background: kidsColors.gradientCelebration,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                mb: 2,
              }}
            >
              Rush Complete!
            </Typography>

            <Box
              sx={{display: 'flex', justifyContent: 'center', gap: 3, mb: 2.5}}
            >
              <Box>
                <Typography
                  variant="h3"
                  sx={{color: kidsColors.primary, fontWeight: 800}}
                >
                  {score}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{color: kidsColors.textMuted}}
                >
                  Total Score
                </Typography>
              </Box>
              <Box>
                <Typography
                  variant="h3"
                  sx={{color: kidsColors.correct, fontWeight: 800}}
                >
                  {correctCount}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{color: kidsColors.textMuted}}
                >
                  Correct
                </Typography>
              </Box>
            </Box>

            {timeBonus > 0 && (
              <Typography
                variant="body2"
                sx={{color: kidsColors.yellow, fontWeight: 600}}
              >
                +{timeBonus} time bonus!
              </Typography>
            )}
            {bestStreak >= 2 && (
              <Typography
                variant="body2"
                sx={{color: kidsColors.streak, fontWeight: 600, mt: 0.5}}
              >
                Best streak: {bestStreak}
              </Typography>
            )}
          </Card>
        </Box>
      </Fade>
    );
  }

  const q = questions[currentIndex];
  const timerPercent = (timeLeft / timeLimit) * 100;
  const timerColor =
    timerPercent > 50
      ? kidsColors.correct
      : timerPercent > 25
        ? kidsColors.yellow
        : kidsColors.incorrect;
  const questionProgress =
    ((currentIndex + (showFeedback ? 1 : 0)) / total) * 100;

  // ── option button sx ───────────────────────────────────────────
  const getOptionSx = (idx) => {
    const color = OPTION_COLORS[idx % OPTION_COLORS.length];
    const base = {
      borderRadius: '14px',
      fontWeight: 700,
      fontSize: {xs: '1.1rem', sm: '1.25rem'},
      textTransform: 'none',
      py: {xs: 2, sm: 2.5},
      px: 2.5,
      border: '2px solid',
      borderColor: `${color}80`,
      color: kidsColors.textPrimary,
      background: `${color}25`,
      minHeight: 48,
      transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
      justifyContent: 'flex-start',
      textAlign: 'left',
      lineHeight: 1.3,
      '&:hover': {
        background: `${color}40`,
        borderColor: color,
        transform: 'translateY(-2px)',
        boxShadow: `0 4px 16px ${color}30`,
      },
    };

    if (showFeedback && selectedIndex === idx) {
      const isCorrect = idx === q.correctIndex;
      return {
        ...base,
        borderColor: isCorrect ? kidsColors.correct : kidsColors.incorrect,
        background: isCorrect ? kidsColors.correctBg : kidsColors.incorrectBg,
        boxShadow: isCorrect
          ? kidsColors.glowCorrect
          : kidsColors.glowIncorrect,
        transform: isCorrect ? 'scale(1.02)' : 'none',
      };
    }

    if (showFeedback && idx === q.correctIndex && selectedIndex !== idx) {
      return {
        ...base,
        borderColor: kidsColors.correct,
        background: kidsColors.correctBg,
        opacity: 0.6,
      };
    }

    if (showFeedback) {
      return {...base, opacity: 0.3, pointerEvents: 'none'};
    }

    return base;
  };

  // ── render ─────────────────────────────────────────────────────
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 600,
        mx: 'auto',
        p: {xs: 2, sm: 3},
        ...kidsAnimations.fadeInUp,
      }}
    >
      {/* Timer bar */}
      <Box sx={{mb: 1}}>
        <LinearProgress
          variant="determinate"
          value={timerPercent}
          sx={{
            height: 10,
            borderRadius: '5px',
            bgcolor: kidsColors.surfaceLight,
            '& .MuiLinearProgress-bar': {
              borderRadius: '5px',
              background:
                timerPercent > 50
                  ? kidsColors.gradientCorrect
                  : timerPercent > 25
                    ? kidsColors.gradientWarm
                    : kidsColors.gradientIncorrect,
              transition: 'transform 1s linear',
            },
          }}
        />
        <Box sx={{display: 'flex', justifyContent: 'space-between', mt: 0.3}}>
          <Typography
            variant="caption"
            sx={{
              color: timerColor,
              fontWeight: 700,
              transition: 'color 0.3s ease',
              animation: timerPercent <= 25 ? 'pulse 0.8s infinite' : 'none',
              ...kidsAnimations.pulse,
            }}
          >
            {timeLeft}s
          </Typography>
          <Typography variant="caption" sx={{color: kidsColors.textMuted}}>
            {currentIndex + 1} / {total}
          </Typography>
        </Box>
      </Box>

      {/* Score and combo bar */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
          px: 1,
        }}
      >
        <ProgressStars current={correctCount} total={total} streak={streak} />
        {combo >= 2 && (
          <Fade in timeout={200}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1.5,
                py: 0.3,
                borderRadius: '10px',
                background: `${kidsColors.streak}18`,
                border: `1px solid ${kidsColors.streak}40`,
                animation: 'pulse 1s infinite',
                ...kidsAnimations.pulse,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: kidsColors.streak,
                  fontWeight: 800,
                  fontSize: '0.8rem',
                }}
              >
                {combo}x Combo!
              </Typography>
            </Box>
          </Fade>
        )}
      </Box>

      {/* Question progress */}
      <LinearProgress
        variant="determinate"
        value={questionProgress}
        sx={{
          height: 4,
          borderRadius: 2,
          mb: 2,
          bgcolor: kidsColors.surfaceLight,
          '& .MuiLinearProgress-bar': {
            borderRadius: 2,
            background: kidsColors.gradientPrimary,
          },
        }}
      />

      {/* Question */}
      <Fade in={visible} timeout={250}>
        <Card
          elevation={0}
          sx={{
            background: kidsColors.cardBg,
            backdropFilter: 'blur(16px)',
            border: `1px solid ${kidsColors.cardBorder}`,
            borderRadius: '18px',
            boxShadow: kidsColors.shadowCard,
            p: {xs: 2, sm: 2.5},
            mb: 2,
          }}
        >
          {q.concept && (
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
              {q.concept}
            </Typography>
          )}
          <Typography
            variant="h6"
            sx={{
              color: kidsColors.textPrimary,
              fontWeight: 700,
              lineHeight: 1.4,
              fontSize: {xs: '1.2rem', sm: '1.4rem'},
            }}
          >
            {q.question}
          </Typography>
        </Card>
      </Fade>

      {/* Options */}
      <Box
        role="radiogroup"
        aria-label="Answer choices"
        sx={{display: 'flex', flexDirection: 'column', gap: 1.2}}
      >
        {(q.options ?? []).map((opt, idx) => (
          <Grow
            in={visible}
            key={`${currentIndex}-${idx}`}
            timeout={200 + idx * 80}
          >
            <Button
              fullWidth
              variant="outlined"
              role="radio"
              aria-checked={selectedIndex === idx}
              tabIndex={0}
              onClick={() => handleSelect(idx)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSelect(idx);
                }
              }}
              disabled={showFeedback}
              sx={getOptionSx(idx)}
            >
              {opt}
            </Button>
          </Grow>
        ))}
      </Box>

      {/* Multiplier feedback */}
      {showFeedback && selectedIndex === q.correctIndex && (
        <Fade in timeout={200}>
          <Box sx={{textAlign: 'center', mt: 1.5}}>
            <Typography
              variant="body1"
              sx={{
                color: kidsColors.correct,
                fontWeight: 800,
                animation: 'fadeInScale 0.3s ease-out',
                ...kidsAnimations.fadeInScale,
              }}
            >
              +{results[results.length - 1]?.multiplier ?? 1}x Points!
            </Typography>
          </Box>
        </Fade>
      )}

      <InlineCelebration type={celebType} gameTemplate="timed_rush" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />
    </Box>
  );
}
