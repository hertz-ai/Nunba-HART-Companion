/**
 * SpotDifferenceTemplate - Dynamic Liquid Agentic UI
 *
 * Two side-by-side panels showing concept cards. Tap/click to find
 * differences between them. Clickable spots with expanding circle animation
 * on discovery. Progress counter and optional timer.
 *
 * Props:
 *   config     - { content: { differences: [{ id, label, concept }], timeLimit?: number } }
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import {logger} from '../../../../utils/logger';
import {kidsColors, kidsAnimations} from '../kidsTheme';
import InlineCelebration from '../shared/InlineCelebration';
import ProgressStars from '../shared/ProgressStars';
import {GameSounds, GameCommentary} from '../shared/SoundManager';
import useCelebration from '../shared/useCelebration';

import {Box, Typography, Card, LinearProgress, Fade, Grow} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';

const SPOT_COLORS = [
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.purple,
  kidsColors.teal,
  kidsColors.secondary,
  kidsColors.correct,
  kidsColors.yellow,
];

export default function SpotDifferenceTemplate({config, onAnswer, onComplete}) {
  // Normalize: accept content.differences[] AND content.rounds[{title, differences[], concept}]
  const differences = useMemo(() => {
    const raw = config?.content?.differences;
    if (Array.isArray(raw) && raw.length > 0) return raw;
    const rounds = config?.content?.rounds;
    if (Array.isArray(rounds) && rounds.length > 0) {
      // Flatten: each round's differences get the round's concept and title
      return rounds.flatMap((round, ri) =>
        (round.differences || []).map((d, di) => ({
          ...d,
          id: d.id || `r${ri}_d${di}`,
          label: d.label || round.title || '',
          concept: d.concept || round.concept || '',
        }))
      );
    }
    return [];
  }, [config]);
  const timeLimit = config?.content?.timeLimit ?? 60;
  const total = differences.length;

  const [foundIds, setFoundIds] = useState(new Set());
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [timer, setTimer] = useState(timeLimit);
  const [wrongTap, setWrongTap] = useState(null); // { x, y, panel }
  const [rippleSpot, setRippleSpot] = useState(null); // { id, x, y }
  const [completed, setCompleted] = useState(false);

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

  const completedRef = useRef(false);
  const startTimeRef = useRef(Date.now());
  const hasSpokenIntro = useRef(false);
  const timerRef = useRef(null);
  const leftPanelRef = useRef(null);
  const rightPanelRef = useRef(null);

  // Reset completedRef when config changes
  useEffect(() => {
    completedRef.current = false;
  }, [config]);

  // Timer countdown + TTS auto-read
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    // TTS: speak intro + instruction
    if (!hasSpokenIntro.current && config?.title) {
      hasSpokenIntro.current = true;
      try {
        GameCommentary.speakIntro(config.title);
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
    } else {
      try {
        GameSounds.speakText('Tap the items you spot as differences!');
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
    }
    return () => clearInterval(timerRef.current);
  }, []);

  // Time-up auto-complete
  useEffect(() => {
    if (timer === 0 && !completed && !completedRef.current) {
      completedRef.current = true;
      setCompleted(true);
      triggerComplete(score, total);
      if (onComplete) {
        onComplete({
          score,
          correct: score,
          total,
          results,
          bestStreak,
        });
      }
    }
  }, [timer, completed, score, total, results, bestStreak, onComplete]);

  // Stop timer when all found
  useEffect(() => {
    if (
      foundIds.size === total &&
      total > 0 &&
      !completed &&
      !completedRef.current
    ) {
      completedRef.current = true;
      clearInterval(timerRef.current);
      setCompleted(true);
      try {
        GameCommentary.speakComplete(score, total);
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
      triggerComplete(score, total);
      setTimeout(() => {
        if (onComplete) {
          onComplete({
            score,
            correct: score,
            total,
            results,
            bestStreak,
          });
        }
      }, 1200);
    }
  }, [foundIds.size, total, completed, score, results, bestStreak, onComplete]);

  // ── handle spot click ──────────────────────────────────────────
  const handleSpotClick = useCallback(
    (diffId) => {
      if (completed) return;
      if (foundIds.has(diffId)) return;
      try {
        GameSounds.tap();
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }

      const elapsed = Date.now() - startTimeRef.current;
      const diff = differences.find((d) => d.id === diffId);
      if (!diff) return;

      const newFound = new Set(foundIds);
      newFound.add(diffId);
      setFoundIds(newFound);

      // Ripple effect
      setRippleSpot({id: diffId});
      setTimeout(() => setRippleSpot(null), 800);

      const newScore = score + 1;
      const newStreak = streak + 1;
      const newBest = Math.max(bestStreak, newStreak);

      setScore(newScore);
      setStreak(newStreak);
      setBestStreak(newBest);

      // Celebration triggers
      triggerCorrect();
      setTimeout(() => {
        try {
          GameCommentary.speakPraise();
        } catch (err) {
          logger.error(err); /* Game asset load — non-critical */
        }
      }, 400);
      if (newStreak === 3 || newStreak === 5 || newStreak === 10) {
        try {
          GameCommentary.speakStreak(newStreak);
        } catch (err) {
          logger.error(err); /* Game asset load — non-critical */
        }
        triggerStreak(newStreak);
      }

      const result = {
        diffId,
        label: diff.label,
        isCorrect: true,
        concept: diff.concept ?? '',
        responseTimeMs: elapsed,
      };
      const newResults = [...results, result];
      setResults(newResults);

      try {
        GameSounds.correct();
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }

      if (onAnswer) onAnswer(true, diff.concept ?? '', elapsed);
    },
    [
      completed,
      foundIds,
      differences,
      score,
      streak,
      bestStreak,
      results,
      onAnswer,
    ]
  );

  // Handle wrong tap on panel
  const handlePanelClick = useCallback(
    (e, panel) => {
      if (completed) return;
      // Only show wrong tap feedback if clicking the panel background
      if (e.target === e.currentTarget) {
        setWrongTap({panel});
        setStreak(0);
        try {
          GameSounds.wrong();
        } catch (err) {
          logger.error(err); /* Game asset load — non-critical */
        }
        setTimeout(() => setWrongTap(null), 500);
      }
    },
    [completed]
  );

  // ── guard ──────────────────────────────────────────────────────
  if (!differences.length) {
    return (
      <Box sx={{p: 4, textAlign: 'center'}}>
        <Typography color={kidsColors.textSecondary}>
          No differences to find.
        </Typography>
      </Box>
    );
  }

  const progress = total > 0 ? (foundIds.size / total) * 100 : 0;
  const timerPercent = (timer / timeLimit) * 100;
  const timerColor =
    timerPercent > 50
      ? kidsColors.correct
      : timerPercent > 25
        ? kidsColors.yellow
        : kidsColors.incorrect;
  const allFound = foundIds.size === total;

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Split differences for two panels display
  const halfIdx = Math.ceil(differences.length / 2);
  const leftDiffs = differences.slice(0, halfIdx);
  const rightDiffs = differences.slice(halfIdx);

  // ── render ─────────────────────────────────────────────────────
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 700,
        mx: 'auto',
        p: {xs: 2, sm: 3},
        ...kidsAnimations.fadeInUp,
      }}
    >
      {/* Header stats */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <ProgressStars
          current={score}
          total={total}
          streak={streak}
          totalQuestions={total}
          answeredCount={foundIds.size}
        />
        <Typography
          variant="body2"
          sx={{
            color: timerColor,
            fontWeight: 700,
            transition: 'color 0.3s ease',
          }}
        >
          {formatTime(timer)}
        </Typography>
      </Box>

      {/* Timer bar */}
      <LinearProgress
        variant="determinate"
        value={timerPercent}
        sx={{
          height: 8,
          borderRadius: '4px',
          mb: 1,
          bgcolor: kidsColors.surfaceLight,
          '& .MuiLinearProgress-bar': {
            borderRadius: '4px',
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

      {/* Found progress */}
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          height: 6,
          borderRadius: '3px',
          mb: 2.5,
          bgcolor: kidsColors.surfaceLight,
          '& .MuiLinearProgress-bar': {
            borderRadius: '3px',
            background: kidsColors.gradientPrimary,
            transition: 'transform 0.5s ease',
          },
        }}
      />

      {/* Instruction */}
      <Typography
        variant="body2"
        sx={{
          color: kidsColors.textSecondary,
          textAlign: 'center',
          mb: 2,
          fontWeight: 500,
        }}
      >
        Tap the items you spot as differences!
      </Typography>

      {/* Two panels */}
      <Box
        role="group"
        aria-label="Find the differences"
        sx={{
          display: 'grid',
          gridTemplateColumns: {xs: '1fr', sm: '1fr 1fr'},
          gap: 2,
          mb: 3,
        }}
      >
        {/* Left panel */}
        <Card
          ref={leftPanelRef}
          elevation={0}
          onClick={(e) => handlePanelClick(e, 'left')}
          sx={{
            background: kidsColors.cardBg,
            backdropFilter: 'blur(16px)',
            border: `1px solid ${wrongTap?.panel === 'left' ? kidsColors.incorrect : kidsColors.cardBorder}`,
            borderRadius: '20px',
            boxShadow: kidsColors.shadowCard,
            p: 2,
            minHeight: 200,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1.5,
            alignContent: 'flex-start',
            transition: 'border-color 0.3s ease',
            animation:
              wrongTap?.panel === 'left' ? 'panelShake 0.3s ease' : 'none',
            '@keyframes panelShake': {
              '0%, 100%': {transform: 'translateX(0)'},
              '25%': {transform: 'translateX(-3px)'},
              '75%': {transform: 'translateX(3px)'},
            },
          }}
        >
          <Typography
            variant="overline"
            sx={{
              color: kidsColors.primaryLight,
              letterSpacing: 1.5,
              fontSize: '0.9rem',
              width: '100%',
              textAlign: 'center',
              mb: 0.5,
            }}
          >
            Panel A
          </Typography>
          {leftDiffs.map((diff, idx) => {
            const isFound = foundIds.has(diff.id);
            const isRippling = rippleSpot?.id === diff.id;
            const color = SPOT_COLORS[idx % SPOT_COLORS.length];

            return (
              <Grow in key={diff.id} timeout={300 + idx * 100}>
                <Box
                  aria-label={`Difference: ${diff.label}${isFound ? ' (found)' : ''}`}
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSpotClick(diff.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSpotClick(diff.id);
                    }
                  }}
                  sx={{
                    position: 'relative',
                    px: 2.5,
                    py: 1.5,
                    borderRadius: '12px',
                    background: isFound
                      ? `${kidsColors.correct}25`
                      : `${color}25`,
                    border: `2px solid ${isFound ? kidsColors.correct : `${color}70`}`,
                    cursor: isFound ? 'default' : 'pointer',
                    fontWeight: 600,
                    fontSize: '1rem',
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    color: isFound
                      ? kidsColors.correct
                      : kidsColors.textPrimary,
                    transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                    overflow: 'hidden',
                    boxShadow: isFound ? kidsColors.glowCorrect : 'none',
                    '&:hover': isFound
                      ? {}
                      : {
                          background: `${color}40`,
                          borderColor: color,
                          transform: 'scale(1.05)',
                        },
                  }}
                >
                  {diff.label}
                  {/* Ripple circle */}
                  {isRippling && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: `${kidsColors.correct}40`,
                        animation: 'ripple 0.7s ease-out forwards',
                        transform: 'translate(-50%, -50%)',
                        ...kidsAnimations.ripple,
                      }}
                    />
                  )}
                  {isFound && (
                    <Box
                      component="span"
                      sx={{
                        ml: 1,
                        fontSize: '1rem',
                      }}
                    >
                      &#10003;
                    </Box>
                  )}
                </Box>
              </Grow>
            );
          })}
        </Card>

        {/* Right panel */}
        <Card
          ref={rightPanelRef}
          elevation={0}
          onClick={(e) => handlePanelClick(e, 'right')}
          sx={{
            background: kidsColors.cardBg,
            backdropFilter: 'blur(16px)',
            border: `1px solid ${wrongTap?.panel === 'right' ? kidsColors.incorrect : kidsColors.cardBorder}`,
            borderRadius: '20px',
            boxShadow: kidsColors.shadowCard,
            p: 2,
            minHeight: 200,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1.5,
            alignContent: 'flex-start',
            transition: 'border-color 0.3s ease',
            animation:
              wrongTap?.panel === 'right' ? 'panelShake 0.3s ease' : 'none',
            '@keyframes panelShake': {
              '0%, 100%': {transform: 'translateX(0)'},
              '25%': {transform: 'translateX(-3px)'},
              '75%': {transform: 'translateX(3px)'},
            },
          }}
        >
          <Typography
            variant="overline"
            sx={{
              color: kidsColors.primaryLight,
              letterSpacing: 1.5,
              fontSize: '0.9rem',
              width: '100%',
              textAlign: 'center',
              mb: 0.5,
            }}
          >
            Panel B
          </Typography>
          {rightDiffs.map((diff, idx) => {
            const isFound = foundIds.has(diff.id);
            const isRippling = rippleSpot?.id === diff.id;
            const color = SPOT_COLORS[(idx + halfIdx) % SPOT_COLORS.length];

            return (
              <Grow in key={diff.id} timeout={300 + idx * 100}>
                <Box
                  aria-label={`Difference: ${diff.label}${isFound ? ' (found)' : ''}`}
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSpotClick(diff.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSpotClick(diff.id);
                    }
                  }}
                  sx={{
                    position: 'relative',
                    px: 2.5,
                    py: 1.5,
                    borderRadius: '12px',
                    background: isFound
                      ? `${kidsColors.correct}25`
                      : `${color}25`,
                    border: `2px solid ${isFound ? kidsColors.correct : `${color}70`}`,
                    cursor: isFound ? 'default' : 'pointer',
                    fontWeight: 600,
                    fontSize: '1rem',
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    color: isFound
                      ? kidsColors.correct
                      : kidsColors.textPrimary,
                    transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                    overflow: 'hidden',
                    boxShadow: isFound ? kidsColors.glowCorrect : 'none',
                    '&:hover': isFound
                      ? {}
                      : {
                          background: `${color}40`,
                          borderColor: color,
                          transform: 'scale(1.05)',
                        },
                  }}
                >
                  {diff.label}
                  {isRippling && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: `${kidsColors.correct}40`,
                        animation: 'ripple 0.7s ease-out forwards',
                        transform: 'translate(-50%, -50%)',
                        ...kidsAnimations.ripple,
                      }}
                    />
                  )}
                  {isFound && (
                    <Box
                      component="span"
                      sx={{
                        ml: 1,
                        fontSize: '1rem',
                      }}
                    >
                      &#10003;
                    </Box>
                  )}
                </Box>
              </Grow>
            );
          })}
        </Card>
      </Box>

      {/* Completion celebration */}
      {allFound && (
        <Fade in timeout={500}>
          <Box
            sx={{
              textAlign: 'center',
              animation: 'celebrate 0.8s ease-in-out',
              ...kidsAnimations.celebrate,
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                background: kidsColors.gradientCelebration,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                mb: 0.5,
              }}
            >
              All differences found!
            </Typography>
            <Typography variant="body2" sx={{color: kidsColors.textSecondary}}>
              Found {total} differences with {formatTime(timer)} remaining
            </Typography>
          </Box>
        </Fade>
      )}

      {/* Time-up message */}
      {timer === 0 && !allFound && (
        <Fade in timeout={400}>
          <Box sx={{textAlign: 'center'}}>
            <Typography
              variant="h6"
              sx={{color: kidsColors.incorrect, fontWeight: 700}}
            >
              Time is up!
            </Typography>
            <Typography variant="body2" sx={{color: kidsColors.textSecondary}}>
              You found {foundIds.size} out of {total} differences
            </Typography>
          </Box>
        </Fade>
      )}

      {/* Celebration overlay */}
      <InlineCelebration type={celebType} gameTemplate="spot_difference" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />
    </Box>
  );
}
