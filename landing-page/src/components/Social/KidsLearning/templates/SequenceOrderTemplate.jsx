/**
 * SequenceOrderTemplate - Dynamic Liquid Agentic UI
 *
 * Reorder items into the correct sequence. Items shown as numbered cards
 * in shuffled order with drag-to-reorder and up/down buttons for accessibility.
 * Check button verifies order, highlighting correct (green) and wrong (red) positions.
 *
 * Props:
 *   config     - { content: { sequences: [{ items: string[], concept }] } }
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import {logger} from '../../../../utils/logger';
import {kidsColors, kidsAnimations} from '../kidsTheme';
import InlineCelebration from '../shared/InlineCelebration';
import ProgressStars from '../shared/ProgressStars';
import {GameSounds, GameCommentary} from '../shared/SoundManager';
import useCelebration from '../shared/useCelebration';

import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import {
  Box,
  Typography,
  Button,
  Card,
  LinearProgress,
  Fade,
  Grow,
  IconButton,
} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';

const FEEDBACK_DELAY = 2000;

const CARD_COLORS = [
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.purple,
  kidsColors.teal,
  kidsColors.secondary,
];

// Shuffle helper
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function SequenceOrderTemplate({config, onAnswer, onComplete}) {
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

  const sequences = config?.content?.sequences ?? [];
  const total = sequences.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  // Per-sequence state
  const [order, setOrder] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [positionStatus, setPositionStatus] = useState([]); // 'correct' | 'wrong' | null
  const [isAllCorrect, setIsAllCorrect] = useState(false);
  const [visible, setVisible] = useState(true);
  const [dragIdx, setDragIdx] = useState(null);

  const startTimeRef = useRef(Date.now());
  const hasSpokenIntro = useRef(false);

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

  const seq = sequences[currentIndex] ?? {items: []};
  const correctOrder = seq.items ?? [];

  // Shuffle on new sequence
  useEffect(() => {
    let shuffled = shuffle(
      correctOrder.map((item, idx) => ({item, origIdx: idx}))
    );
    // Ensure not already in correct order
    let tries = 0;
    while (
      shuffled.every((s, i) => s.origIdx === i) &&
      correctOrder.length > 1 &&
      tries < 10
    ) {
      shuffled = shuffle(
        correctOrder.map((item, idx) => ({item, origIdx: idx}))
      );
      tries++;
    }
    setOrder(shuffled);
    setShowFeedback(false);
    setPositionStatus([]);
    setIsAllCorrect(false);
    setVisible(true);
    startTimeRef.current = Date.now();
    // TTS: auto-read instruction
    const concept = sequences[currentIndex]?.concept;
    const text = concept
      ? `Put these in order: ${concept}`
      : 'Put these in the correct order';
    try {
      GameSounds.speakText(text);
    } catch (err) {
      logger.error(err); /* Game asset load — non-critical */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, correctOrder.length]);

  // ── move item up/down ──────────────────────────────────────────
  const moveItem = useCallback(
    (fromIdx, direction) => {
      if (showFeedback) return;
      try {
        GameSounds.tap();
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
      const toIdx = fromIdx + direction;
      if (toIdx < 0 || toIdx >= order.length) return;

      const newOrder = [...order];
      [newOrder[fromIdx], newOrder[toIdx]] = [
        newOrder[toIdx],
        newOrder[fromIdx],
      ];
      setOrder(newOrder);
      setPositionStatus([]);
    },
    [showFeedback, order]
  );

  // ── drag reorder ───────────────────────────────────────────────
  const handleDragStart = useCallback((e, idx) => {
    try {
      GameSounds.drag();
    } catch (err) {
      logger.error(err); /* Game asset load — non-critical */
    }
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e, dropIdx) => {
      e.preventDefault();
      if (showFeedback) return;
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (isNaN(fromIdx) || fromIdx === dropIdx) {
        setDragIdx(null);
        return;
      }

      try {
        GameSounds.drop();
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
      const newOrder = [...order];
      const [moved] = newOrder.splice(fromIdx, 1);
      newOrder.splice(dropIdx, 0, moved);
      setOrder(newOrder);
      setPositionStatus([]);
      setDragIdx(null);
    },
    [showFeedback, order]
  );

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
  }, []);

  // ── check order ────────────────────────────────────────────────
  const handleCheck = useCallback(() => {
    if (showFeedback) return;

    const elapsed = Date.now() - startTimeRef.current;
    const statuses = order.map((item, idx) =>
      item.origIdx === idx ? 'correct' : 'wrong'
    );
    const allCorrect = statuses.every((s) => s === 'correct');
    const correctCount = statuses.filter((s) => s === 'correct').length;

    setPositionStatus(statuses);
    setShowFeedback(true);
    setIsAllCorrect(allCorrect);

    try {
      if (allCorrect) {
        GameSounds.correct();
      } else {
        GameSounds.wrong();
      }
    } catch (err) {
      logger.error(err); /* Game asset load — non-critical */
    }

    if (allCorrect) {
      triggerCorrect();
      setTimeout(() => {
        try {
          GameCommentary.speakPraise();
        } catch (err) {
          logger.error(err); /* Game asset load — non-critical */
        }
      }, 400);
    } else {
      setTimeout(() => {
        try {
          GameCommentary.speakEncourage();
        } catch (err) {
          logger.error(err); /* Game asset load — non-critical */
        }
      }, 400);
    }

    const newScore = allCorrect ? score + 1 : score;
    const newStreak = allCorrect ? streak + 1 : 0;
    const newBest = Math.max(bestStreak, newStreak);

    if (newStreak === 3 || newStreak === 5 || newStreak === 10) {
      try {
        GameCommentary.speakStreak(newStreak);
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
      triggerStreak(newStreak);
    }

    setScore(newScore);
    setStreak(newStreak);
    setBestStreak(newBest);

    const result = {
      questionIndex: currentIndex,
      correctPositions: correctCount,
      totalPositions: order.length,
      isCorrect: allCorrect,
      concept: seq.concept ?? '',
      responseTimeMs: elapsed,
    };
    const newResults = [...results, result];
    setResults(newResults);

    if (onAnswer) onAnswer(allCorrect, seq.concept ?? '', elapsed);

    setTimeout(() => {
      setShowFeedback(false);

      if (allCorrect) {
        setVisible(false);
        setTimeout(() => {
          if (currentIndex + 1 < total) {
            setCurrentIndex((i) => i + 1);
          } else {
            try {
              GameCommentary.speakComplete(newScore, total);
            } catch (err) {
              logger.error(err); /* Game asset load — non-critical */
            }
            triggerComplete(newScore, total);
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
      } else {
        // Keep on same sequence to retry
        setPositionStatus([]);
      }
    }, FEEDBACK_DELAY);
  }, [
    showFeedback,
    order,
    score,
    streak,
    bestStreak,
    results,
    currentIndex,
    total,
    seq.concept,
    onAnswer,
    onComplete,
    triggerCorrect,
    triggerStreak,
    triggerComplete,
  ]);

  // ── guard ──────────────────────────────────────────────────────
  if (!sequences.length || !correctOrder.length) {
    return (
      <Box sx={{p: 4, textAlign: 'center'}}>
        <Typography color={kidsColors.textSecondary}>
          No sequences available.
        </Typography>
      </Box>
    );
  }

  const progress = (currentIndex / total) * 100;

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
            Sequence {currentIndex + 1} of {total}
          </Typography>
          <ProgressStars current={score} total={total} streak={streak} />
        </Box>
      </Box>

      {/* Instruction */}
      <Fade in={visible} timeout={350}>
        <Box sx={{textAlign: 'center', mb: 2.5}}>
          {seq.concept && (
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
              {seq.concept}
            </Typography>
          )}
          <Typography
            variant="body1"
            sx={{color: kidsColors.textSecondary, fontWeight: 500}}
          >
            Put these in the correct order
          </Typography>
        </Box>
      </Fade>

      {/* Sortable items */}
      <Box
        role="list"
        aria-label="Sequence items"
        sx={{display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3}}
      >
        {order.map((item, idx) => {
          const color = CARD_COLORS[idx % CARD_COLORS.length];
          const status = positionStatus[idx];
          const isDragging = dragIdx === idx;

          return (
            <Grow
              in={visible}
              key={`${currentIndex}-${item.origIdx}`}
              timeout={300 + idx * 80}
            >
              <Card
                role="listitem"
                aria-label={`Position ${idx + 1}: ${item.item}`}
                tabIndex={0}
                draggable={!showFeedback}
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    moveItem(idx, -1);
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    moveItem(idx, 1);
                  }
                }}
                elevation={0}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2,
                  py: {xs: 2, sm: 2.5},
                  borderRadius: '16px',
                  background:
                    status === 'correct'
                      ? kidsColors.correctBg
                      : status === 'wrong'
                        ? kidsColors.incorrectBg
                        : kidsColors.cardBg,
                  backdropFilter: 'blur(16px)',
                  border: `2px solid ${
                    status === 'correct'
                      ? kidsColors.correct
                      : status === 'wrong'
                        ? kidsColors.incorrect
                        : `${color}80`
                  }`,
                  boxShadow:
                    status === 'correct'
                      ? kidsColors.glowCorrect
                      : status === 'wrong'
                        ? kidsColors.glowIncorrect
                        : kidsColors.shadowCard,
                  cursor: showFeedback ? 'default' : 'grab',
                  opacity: isDragging ? 0.5 : 1,
                  transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                  animation:
                    status === 'wrong'
                      ? 'shakeRow 0.4s ease-in-out'
                      : status === 'correct'
                        ? 'pulseOnce 0.5s ease-out'
                        : 'none',
                  '@keyframes shakeRow': {
                    '0%, 100%': {transform: 'translateX(0)'},
                    '20%': {transform: 'translateX(-5px)'},
                    '40%': {transform: 'translateX(5px)'},
                    '60%': {transform: 'translateX(-3px)'},
                    '80%': {transform: 'translateX(3px)'},
                  },
                  '@keyframes pulseOnce': {
                    '0%': {transform: 'scale(1)'},
                    '50%': {transform: 'scale(1.03)'},
                    '100%': {transform: 'scale(1)'},
                  },
                  '&:hover': showFeedback
                    ? {}
                    : {
                        borderColor: color,
                        transform: 'translateX(4px)',
                      },
                  '&:active': {
                    cursor: 'grabbing',
                  },
                }}
              >
                {/* Position number */}
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background:
                      status === 'correct'
                        ? `${kidsColors.correct}25`
                        : status === 'wrong'
                          ? `${kidsColors.incorrect}25`
                          : `${color}20`,
                    color:
                      status === 'correct'
                        ? kidsColors.correct
                        : status === 'wrong'
                          ? kidsColors.incorrect
                          : color,
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </Box>

                {/* Item text */}
                <Typography
                  sx={{
                    flex: 1,
                    fontWeight: 600,
                    fontSize: {xs: '1.1rem', sm: '1.2rem'},
                    color:
                      status === 'correct'
                        ? kidsColors.correct
                        : status === 'wrong'
                          ? kidsColors.incorrect
                          : kidsColors.textPrimary,
                    transition: 'color 0.3s ease',
                  }}
                >
                  {item.item}
                </Typography>

                {/* Up/Down buttons */}
                {!showFeedback && (
                  <Box
                    sx={{display: 'flex', flexDirection: 'column', gap: 0.2}}
                  >
                    <IconButton
                      size="small"
                      onClick={() => moveItem(idx, -1)}
                      disabled={idx === 0}
                      sx={{
                        p: 0.3,
                        color: kidsColors.textSecondary,
                        '&:hover': {
                          color: kidsColors.primary,
                          background: `${kidsColors.primary}15`,
                        },
                        '&:disabled': {opacity: 0.2},
                      }}
                    >
                      <KeyboardArrowUpIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => moveItem(idx, 1)}
                      disabled={idx === order.length - 1}
                      sx={{
                        p: 0.3,
                        color: kidsColors.textSecondary,
                        '&:hover': {
                          color: kidsColors.primary,
                          background: `${kidsColors.primary}15`,
                        },
                        '&:disabled': {opacity: 0.2},
                      }}
                    >
                      <KeyboardArrowDownIcon fontSize="small" />
                    </IconButton>
                  </Box>
                )}
              </Card>
            </Grow>
          );
        })}
      </Box>

      {/* Check button */}
      {!showFeedback && (
        <Box sx={{textAlign: 'center', mb: 2}}>
          <Button
            variant="contained"
            onClick={handleCheck}
            sx={{
              px: 5,
              py: 1.5,
              borderRadius: '16px',
              fontWeight: 700,
              fontSize: '1rem',
              textTransform: 'none',
              background: kidsColors.gradientPrimary,
              color: '#fff',
              boxShadow: kidsColors.shadowPrimary,
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: kidsColors.shadowElevated,
              },
            }}
          >
            Check Order
          </Button>
        </Box>
      )}

      {/* Feedback */}
      <Fade in={showFeedback} timeout={300}>
        <Box sx={{textAlign: 'center', minHeight: 40}}>
          {isAllCorrect ? (
            <Typography
              variant="h5"
              sx={{
                color: kidsColors.correct,
                fontWeight: 800,
                animation: 'celebrate 0.7s ease-in-out',
                ...kidsAnimations.celebrate,
              }}
            >
              Perfect order!
            </Typography>
          ) : (
            <Typography
              variant="body1"
              sx={{color: kidsColors.incorrect, fontWeight: 700}}
            >
              Not quite right - green ones are correct, try moving the red ones!
            </Typography>
          )}
        </Box>
      </Fade>

      {/* Progress dots */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          gap: 0.8,
          mt: 2,
          flexWrap: 'wrap',
        }}
      >
        {sequences.map((_, idx) => {
          let dotColor = kidsColors.surfaceLight;
          const answered = results.find((r) => r.questionIndex === idx);
          if (answered) {
            dotColor = answered.isCorrect
              ? kidsColors.correct
              : kidsColors.incorrect;
          } else if (idx === currentIndex) {
            dotColor = kidsColors.primary;
          }
          return (
            <Box
              key={idx}
              sx={{
                width: idx === currentIndex ? 28 : 14,
                height: 14,
                borderRadius: '5px',
                bgcolor: dotColor,
                transition: 'all 0.4s ease',
                boxShadow:
                  idx === currentIndex ? kidsColors.glowPrimary : 'none',
              }}
            />
          );
        })}
      </Box>

      <InlineCelebration type={celebType} gameTemplate="sequence_order" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />
    </Box>
  );
}
