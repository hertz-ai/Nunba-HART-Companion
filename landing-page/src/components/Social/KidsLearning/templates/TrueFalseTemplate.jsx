/**
 * TrueFalseTemplate - Dynamic Liquid Agentic UI
 *
 * Statement display with two large True/False buttons,
 * visual feedback (green check / red X), score tracking,
 * and MUI Fade/Grow transitions.
 *
 * Props:
 *   config     - { content: { questions: [{ statement, isTrue, concept }] } }
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import {logger} from '../../../../utils/logger';
import {kidsColors, kidsAnimations} from '../kidsTheme';
import GameAssetService from '../shared/GameAssetService';
import GameItemImage from '../shared/GameItemImage';
import InlineCelebration from '../shared/InlineCelebration';
import ProgressStars from '../shared/ProgressStars';
import {GameSounds, GameCommentary} from '../shared/SoundManager';
import useCelebration from '../shared/useCelebration';

import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import {
  Box,
  Typography,
  Button,
  Card,
  LinearProgress,
  Fade,
  Grow,
} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';

const FEEDBACK_DELAY = 1500;

export default function TrueFalseTemplate({config, onAnswer, onComplete}) {
  // Normalize: accept content.questions[{statement,isTrue}] AND content.statements[{text,answer}]
  const questions = useMemo(() => {
    const raw = config?.content?.questions;
    if (Array.isArray(raw) && raw.length > 0) return raw;
    const stmts = config?.content?.statements;
    if (Array.isArray(stmts) && stmts.length > 0) {
      return stmts.map((s) => ({
        ...s,
        statement: s.statement || s.text || '',
        isTrue: s.isTrue !== undefined ? s.isTrue : s.answer,
      }));
    }
    return [];
  }, [config]);
  const total = questions.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [selectedAnswer, setSelectedAnswer] = useState(null); // true | false | null
  const [showFeedback, setShowFeedback] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [visible, setVisible] = useState(true);
  const [imageMap, setImageMap] = useState({});

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

  useEffect(() => {
    startTimeRef.current = Date.now();
    setVisible(true);
    // TTS: auto-read statement text
    const q = questions[currentIndex];
    if (q?.statement) {
      try {
        GameSounds.speakText(q.statement);
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Preload real images (fire-and-forget, emoji fallback if unavailable)
  useEffect(() => {
    let cancelled = false;
    GameAssetService.preloadImages(config, 'cartoon', null)
      .then((map) => {
        if (!cancelled) {
          const plain = {};
          map.forEach((v, k) => {
            plain[k] = v;
          });
          setImageMap(plain);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [config]);

  // ── handle answer ────────────────────────────────────────────
  const handleAnswer = useCallback(
    (answer) => {
      if (showFeedback) return;
      try {
        GameSounds.tap();
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }

      const elapsed = Date.now() - startTimeRef.current;
      const q = questions[currentIndex];
      const isCorrect = answer === q.isTrue;

      setSelectedAnswer(answer);
      setShowFeedback(true);

      try {
        if (isCorrect) {
          GameSounds.correct();
          setTimeout(() => {
            try {
              GameSounds.speakText("That's right!");
            } catch (err) {
              logger.error(err); /* Game asset load — non-critical */
            }
          }, 400);
          triggerCorrect();
        } else {
          GameSounds.wrong();
          setTimeout(() => {
            try {
              GameSounds.speakText('Not quite!');
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

      if (
        isCorrect &&
        (newStreak === 3 || newStreak === 5 || newStreak === 10)
      ) {
        try {
          GameCommentary.speakStreak(newStreak);
        } catch (err) {
          logger.error(err); /* Game asset load — non-critical */
        }
        triggerStreak(newStreak);
      }

      const result = {
        questionIndex: currentIndex,
        statement: q.statement,
        selectedAnswer: answer,
        correctAnswer: q.isTrue,
        isCorrect,
        concept: q.concept ?? '',
        responseTimeMs: elapsed,
      };
      const newResults = [...results, result];
      setResults(newResults);

      if (onAnswer) onAnswer(isCorrect, q.concept ?? '', elapsed);

      setTimeout(() => {
        setShowFeedback(false);
        setSelectedAnswer(null);
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
        }, 200);
      }, FEEDBACK_DELAY);
    },
    [
      showFeedback,
      currentIndex,
      questions,
      score,
      streak,
      bestStreak,
      results,
      total,
      onAnswer,
      onComplete,
    ]
  );

  // ── guard ────────────────────────────────────────────────────
  if (!questions.length) {
    return (
      <Box sx={{p: 4, textAlign: 'center'}}>
        <Typography color={kidsColors.textSecondary}>
          No statements available.
        </Typography>
      </Box>
    );
  }

  const q = questions[currentIndex];
  const progress = ((currentIndex + (showFeedback ? 1 : 0)) / total) * 100;

  const feedbackCorrect = showFeedback && selectedAnswer === q.isTrue;
  const feedbackIncorrect = showFeedback && selectedAnswer !== q.isTrue;

  // ── button sx helper ─────────────────────────────────────────
  const btnSx = (isTrue) => {
    const color = isTrue ? kidsColors.correct : kidsColors.incorrect;
    const lightColor = isTrue
      ? kidsColors.correctLight
      : kidsColors.incorrectLight;

    const base = {
      flex: 1,
      py: {xs: 3, sm: 4},
      borderRadius: '20px',
      fontWeight: 800,
      fontSize: {xs: '1.3rem', sm: '1.6rem'},
      textTransform: 'none',
      border: '2px solid',
      borderColor: `${color}80`,
      color: kidsColors.textPrimary,
      background: `${color}25`,
      transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
      '&:hover': {
        background: `${color}25`,
        borderColor: color,
        transform: 'translateY(-4px) scale(1.02)',
        boxShadow: `0 8px 30px ${color}40`,
      },
      '&:active': {
        transform: 'scale(0.97)',
      },
    };

    if (showFeedback && selectedAnswer === isTrue) {
      const wasCorrect = isTrue === q.isTrue;
      return {
        ...base,
        borderColor: wasCorrect ? kidsColors.correct : kidsColors.incorrect,
        background: wasCorrect ? kidsColors.correctBg : kidsColors.incorrectBg,
        boxShadow: wasCorrect
          ? kidsColors.glowCorrect
          : kidsColors.glowIncorrect,
        transform: wasCorrect ? 'scale(1.05)' : 'scale(0.95)',
      };
    }

    if (showFeedback && selectedAnswer !== isTrue) {
      // Highlight the correct one subtly
      if (isTrue === q.isTrue) {
        return {
          ...base,
          borderColor: kidsColors.correct,
          background: kidsColors.correctBg,
          opacity: 0.6,
        };
      }
      return {...base, opacity: 0.3, pointerEvents: 'none'};
    }

    return base;
  };

  // ── render ───────────────────────────────────────────────────
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
            {currentIndex + 1} / {total}
          </Typography>
          <ProgressStars
            current={score}
            total={total}
            streak={streak}
            totalQuestions={total}
            answeredCount={currentIndex + (showFeedback ? 1 : 0)}
          />
        </Box>
      </Box>

      {/* Statement card */}
      <Fade in={visible} timeout={400}>
        <Card
          elevation={0}
          sx={{
            background: kidsColors.cardBg,
            backdropFilter: 'blur(16px)',
            border: `1px solid ${kidsColors.cardBorder}`,
            borderRadius: '24px',
            boxShadow: kidsColors.shadowCard,
            p: {xs: 3, sm: 4},
            mb: 3,
            textAlign: 'center',
            minHeight: {xs: 120, sm: 140},
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Statement emoji / image */}
          {q.emoji && (
            <Box sx={{textAlign: 'center', mb: 1}}>
              <GameItemImage
                blobUrl={imageMap['s' + currentIndex]}
                emoji={q.emoji}
                size={64}
              />
            </Box>
          )}

          {q.concept && (
            <Typography
              variant="overline"
              sx={{
                color: kidsColors.primaryLight,
                letterSpacing: 1.5,
                fontSize: '0.9rem',
                mb: 1,
              }}
            >
              {q.concept}
            </Typography>
          )}
          <Typography
            variant="h5"
            sx={{
              color: kidsColors.textPrimary,
              fontWeight: 700,
              lineHeight: 1.5,
              fontSize: {xs: '1.2rem', sm: '1.5rem'},
            }}
          >
            {q.statement}
          </Typography>

          {/* Feedback icon overlay */}
          <Fade in={showFeedback} timeout={300}>
            <Box
              sx={{
                position: 'absolute',
                top: 12,
                right: 12,
                animation: showFeedback
                  ? 'fadeInScale 0.3s ease-out'
                  : undefined,
                ...kidsAnimations.fadeInScale,
              }}
            >
              {feedbackCorrect && (
                <CheckCircleOutlineIcon
                  sx={{fontSize: 40, color: kidsColors.correct}}
                />
              )}
              {feedbackIncorrect && (
                <HighlightOffIcon
                  sx={{fontSize: 40, color: kidsColors.incorrect}}
                />
              )}
            </Box>
          </Fade>
        </Card>
      </Fade>

      {/* True / False buttons */}
      <Grow in={visible} timeout={500}>
        <Box
          role="radiogroup"
          aria-label="True or False"
          sx={{display: 'flex', gap: 2, mb: 3}}
        >
          <Button
            variant="outlined"
            role="radio"
            aria-checked={selectedAnswer === true}
            tabIndex={0}
            onClick={() => handleAnswer(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleAnswer(true);
              }
            }}
            disabled={showFeedback}
            sx={btnSx(true)}
          >
            <CheckCircleOutlineIcon sx={{fontSize: {xs: 36, sm: 44}}} />
            True
          </Button>

          <Button
            variant="outlined"
            role="radio"
            aria-checked={selectedAnswer === false}
            tabIndex={0}
            onClick={() => handleAnswer(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleAnswer(false);
              }
            }}
            disabled={showFeedback}
            sx={btnSx(false)}
          >
            <HighlightOffIcon sx={{fontSize: {xs: 36, sm: 44}}} />
            False
          </Button>
        </Box>
      </Grow>

      {/* Feedback text */}
      <Fade in={showFeedback} timeout={300}>
        <Box sx={{textAlign: 'center', minHeight: 32}}>
          {feedbackCorrect && (
            <Typography
              variant="h6"
              sx={{
                color: kidsColors.correct,
                fontWeight: 800,
                animation: 'celebrate 0.6s ease-in-out',
                ...kidsAnimations.celebrate,
              }}
            >
              Well done!
            </Typography>
          )}
          {feedbackIncorrect && (
            <Typography
              variant="body1"
              sx={{color: kidsColors.incorrect, fontWeight: 700}}
            >
              The answer was {q.isTrue ? 'True' : 'False'}
            </Typography>
          )}
        </Box>
      </Fade>

      {/* Streak indicator */}
      {streak >= 2 && (
        <Fade in timeout={400}>
          <Box
            sx={{
              textAlign: 'center',
              mt: 1,
              animation: 'pulse 1.5s infinite',
              ...kidsAnimations.pulse,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                background: kidsColors.gradientWarm,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontWeight: 800,
                fontSize: '0.85rem',
              }}
            >
              {streak} streak!
            </Typography>
          </Box>
        </Fade>
      )}

      <InlineCelebration type={celebType} gameTemplate="true_false" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />
    </Box>
  );
}
