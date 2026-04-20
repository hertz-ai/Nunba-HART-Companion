/**
 * CountingTemplate - Dynamic Liquid Agentic UI
 *
 * Visual objects (emoji icons) to count, number pad or input for answer,
 * animated entrance for objects, celebration on correct answer.
 *
 * Props:
 *   config     - { content: { questions: [{
 *                   emoji: string,          // e.g. "🍎"
 *                   count: number,          // correct answer
 *                   concept?: string,
 *                   label?: string           // e.g. "How many apples?"
 *                 }] } }
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import {logger} from '../../../../utils/logger';
import {kidsColors, kidsAnimations, numPadColors} from '../kidsTheme';
import {getEmojiForText} from '../shared/emojiMap';
import GameAssetService from '../shared/GameAssetService';
import GameItemImage from '../shared/GameItemImage';
import GameLivesBar from '../shared/GameLivesBar';
import InlineCelebration from '../shared/InlineCelebration';
import KidsCharacter from '../shared/KidsCharacter';
import {GameSounds, GameCommentary} from '../shared/SoundManager';
import useCelebration from '../shared/useCelebration';
import VisualHint from '../shared/VisualHint';

import BackspaceOutlinedIcon from '@mui/icons-material/BackspaceOutlined';
import {
  Box,
  Typography,
  Button,
  Card,
  Fade,
  Grow,
  IconButton,
} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';

const FEEDBACK_DELAY = 1800;
const NUM_PAD = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

// Generate staggered random positions for emoji display
function getEmojiPositions(count) {
  const positions = [];
  const cols = Math.min(count, 5);
  const rows = Math.ceil(count / cols);
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    positions.push({
      x: (col / Math.max(cols - 1, 1)) * 80 + 10 + (Math.random() * 6 - 3),
      y: (row / Math.max(rows - 1, 1)) * 80 + 10 + (Math.random() * 6 - 3),
      delay: i * 120,
      rotation: Math.random() * 20 - 10,
    });
  }
  return positions;
}

export default function CountingTemplate({config, onAnswer, onComplete}) {
  // Normalize: accept content.questions[] AND content.rounds[] (with icon→emoji mapping)
  const questions = useMemo(() => {
    const raw = config?.content?.questions;
    if (Array.isArray(raw) && raw.length > 0) return raw;
    const rounds = config?.content?.rounds;
    if (Array.isArray(rounds) && rounds.length > 0) {
      return rounds.map((r) => ({
        ...r,
        emoji: r.emoji || r.icon || '?',
      }));
    }
    return [];
  }, [config]);
  const total = questions.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  // Per-question state
  const [inputValue, setInputValue] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [visible, setVisible] = useState(true);
  const [emojiPositions, setEmojiPositions] = useState([]);
  const [imageMap, setImageMap] = useState({});
  const [lives, setLives] = useState(3);
  const [charState, setCharState] = useState('idle');
  const [showHint, setShowHint] = useState(true);

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

  const q = questions[currentIndex] ?? {};

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
    setInputValue('');
    setShowFeedback(false);
    setIsCorrect(false);
    setShowCelebration(false);
    setEmojiPositions(getEmojiPositions(q.count ?? 0));
    // TTS: auto-read question label
    const label = q.label || `How many ${q.emoji || 'items'} can you count?`;
    if (label) {
      try {
        GameSounds.speakText(label);
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, q.count]);

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

  // ── handle number pad ────────────────────────────────────────
  const handleNumPress = useCallback(
    (num) => {
      if (showFeedback) return;
      try {
        GameSounds.tap();
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
      setInputValue((prev) => {
        if (prev.length >= 3) return prev; // max 3 digits
        return prev + String(num);
      });
    },
    [showFeedback]
  );

  const handleBackspace = useCallback(() => {
    if (showFeedback) return;
    setInputValue((prev) => prev.slice(0, -1));
  }, [showFeedback]);

  // ── submit answer ────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (showFeedback || !inputValue) return;

    const elapsed = Date.now() - startTimeRef.current;
    const userAnswer = parseInt(inputValue, 10);
    const correct = userAnswer === q.count;

    setIsCorrect(correct);
    setShowFeedback(true);
    if (correct) setShowCelebration(true);

    try {
      if (correct) {
        GameSounds.correct();
        setTimeout(() => {
          try {
            GameCommentary.speakPraise();
          } catch (err) {
            logger.error(err); /* Game asset load — non-critical */
          }
        }, 400);
        triggerCorrect();
        setCharState('celebrate');
        setTimeout(() => setCharState('idle'), 1500);
      } else {
        GameSounds.wrong();
        setTimeout(() => {
          try {
            GameCommentary.speakEncourage();
          } catch (err) {
            logger.error(err); /* Game asset load — non-critical */
          }
        }, 400);
        setLives((l) => Math.max(0, l - 1));
        setCharState('encourage');
        setTimeout(() => setCharState('idle'), 1500);
      }
    } catch (err) {
      logger.error(err); /* Game asset load — non-critical */
    }

    const newScore = correct ? score + 1 : score;
    const newStreak = correct ? streak + 1 : 0;
    const newBest = Math.max(bestStreak, newStreak);

    setScore(newScore);
    setStreak(newStreak);
    setBestStreak(newBest);

    if (correct && (newStreak === 3 || newStreak === 5 || newStreak === 10)) {
      try {
        GameCommentary.speakStreak(newStreak);
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
      triggerStreak(newStreak);
    }

    const result = {
      questionIndex: currentIndex,
      userAnswer,
      correctAnswer: q.count,
      isCorrect: correct,
      concept: q.concept ?? '',
      responseTimeMs: elapsed,
    };
    const newResults = [...results, result];
    setResults(newResults);

    if (onAnswer) onAnswer(correct, q.concept ?? '', elapsed);

    setTimeout(() => {
      setShowFeedback(false);
      setShowCelebration(false);
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
    }, FEEDBACK_DELAY);
  }, [
    showFeedback,
    inputValue,
    q.count,
    q.concept,
    score,
    streak,
    bestStreak,
    currentIndex,
    total,
    results,
    onAnswer,
    onComplete,
  ]);

  // ── guard ────────────────────────────────────────────────────
  if (!questions.length) {
    return (
      <Box sx={{p: 4, textAlign: 'center'}}>
        <Typography color={kidsColors.textSecondary}>
          No counting questions available.
        </Typography>
      </Box>
    );
  }

  const progress = ((currentIndex + (showFeedback ? 1 : 0)) / total) * 100;

  // ── render ───────────────────────────────────────────────────
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: {xs: '100%', sm: 560},
        mx: 'auto',
        p: {xs: 2, sm: 3},
        ...kidsAnimations.fadeInUp,
      }}
    >
      {/* Game Lives Bar */}
      <GameLivesBar
        lives={lives}
        score={score}
        currentLevel={currentIndex + 1}
        totalLevels={total}
        streak={streak}
      />

      {/* Animated Character Guide */}
      <Box sx={{position: 'relative'}}>
        <Box sx={{position: 'absolute', top: -10, right: 0, zIndex: 10}}>
          <KidsCharacter
            seed={`counting-${currentIndex}`}
            state={charState}
            size={72}
            expression={
              isCorrect && showFeedback
                ? 'happy'
                : !isCorrect && showFeedback
                  ? 'sad'
                  : 'happy'
            }
          />
        </Box>
      </Box>

      {/* Visual Question — large emoji + animated "?" for non-readers */}
      <Fade in={visible} timeout={350}>
        <Box sx={{textAlign: 'center', mb: 2}}>
          <Box
            sx={{
              fontSize: '3.5rem',
              mb: 0.5,
              animation: 'bounce 1.5s ease-in-out infinite',
              ...kidsAnimations.bounce,
            }}
          >
            {q.emoji || getEmojiForText(q.label || '') || '🔢'}
          </Box>
          <Typography
            sx={{
              color: kidsColors.textPrimary,
              fontWeight: 700,
              fontSize: {xs: '1.1rem', sm: '1.3rem'},
            }}
          >
            {q.label || `How many ${q.emoji || 'items'} can you count?`}
          </Typography>
        </Box>
      </Fade>

      {/* Visual Hint — shows animated hand on first question */}
      <VisualHint
        type="count"
        visible={showHint && currentIndex === 0}
        onDismiss={() => setShowHint(false)}
      />

      {/* Emoji display area */}
      <Fade in={visible} timeout={400}>
        <Card
          elevation={0}
          sx={{
            position: 'relative',
            background: kidsColors.cardBg,
            backdropFilter: 'blur(16px)',
            border: `1px solid ${kidsColors.cardBorder}`,
            borderRadius: '24px',
            boxShadow: kidsColors.shadowCard,
            minHeight: {xs: 160, sm: 200},
            aspectRatio: '16/9',
            mb: 3,
            overflow: 'hidden',
            // Celebration flash
            ...(showCelebration
              ? {
                  animation: 'celebrateFlash 0.8s ease-in-out',
                  '@keyframes celebrateFlash': {
                    '0%': {boxShadow: kidsColors.shadowCard},
                    '50%': {
                      boxShadow: `0 0 40px ${kidsColors.correct}50, ${kidsColors.glowCorrect}`,
                    },
                    '100%': {boxShadow: kidsColors.shadowCard},
                  },
                }
              : {}),
          }}
        >
          {emojiPositions.map((pos, idx) => (
            <Box
              key={`${currentIndex}-${idx}`}
              sx={{
                position: 'absolute',
                left: `${pos.x}%`,
                top: `${pos.y}%`,
                transform: `translate(-50%, -50%) rotate(${pos.rotation}deg)`,
                fontSize: {xs: '1.8rem', sm: '2.4rem'},
                animation: `emojiEntrance 0.5s ${pos.delay}ms ease-out both`,
                '@keyframes emojiEntrance': {
                  '0%': {
                    opacity: 0,
                    transform: `translate(-50%, -50%) rotate(${pos.rotation}deg) scale(0)`,
                  },
                  '60%': {
                    opacity: 1,
                    transform: `translate(-50%, -50%) rotate(${pos.rotation}deg) scale(1.2)`,
                  },
                  '100%': {
                    opacity: 1,
                    transform: `translate(-50%, -50%) rotate(${pos.rotation}deg) scale(1)`,
                  },
                },
                ...(showCelebration
                  ? {
                      animation: `float 1s ${idx * 80}ms infinite ease-in-out`,
                      ...kidsAnimations.float,
                    }
                  : {}),
              }}
            >
              <GameItemImage
                blobUrl={imageMap['cq' + currentIndex]}
                emoji={q.emoji || '?'}
                size={56}
              />
            </Box>
          ))}
        </Card>
      </Fade>

      {/* Answer display */}
      <Box sx={{textAlign: 'center', mb: 2}}>
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: 3,
            py: 1.5,
            borderRadius: '16px',
            background: kidsColors.surfaceLight,
            border: `2px solid ${
              showFeedback
                ? isCorrect
                  ? kidsColors.correct
                  : kidsColors.incorrect
                : inputValue
                  ? kidsColors.primary
                  : kidsColors.cardBorder
            }`,
            transition: 'all 0.3s ease',
            boxShadow: showFeedback
              ? isCorrect
                ? kidsColors.glowCorrect
                : kidsColors.glowIncorrect
              : 'none',
            minWidth: 120,
          }}
        >
          <Typography
            variant="h4"
            sx={{
              color: showFeedback
                ? isCorrect
                  ? kidsColors.correct
                  : kidsColors.incorrect
                : kidsColors.textPrimary,
              fontWeight: 800,
              minWidth: 60,
              textAlign: 'center',
              transition: 'color 0.3s ease',
            }}
          >
            {inputValue || (
              <Box
                component="span"
                sx={{color: kidsColors.textMuted, fontSize: '0.7em'}}
              >
                ...
              </Box>
            )}
          </Typography>
          <IconButton
            onClick={handleBackspace}
            disabled={showFeedback || !inputValue}
            size="small"
            sx={{color: kidsColors.textMuted}}
          >
            <BackspaceOutlinedIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Number pad */}
      <Grow in={visible} timeout={500}>
        <Box
          role="radiogroup"
          aria-label="Count options"
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 1,
            maxWidth: {xs: '100%', sm: 340},
            mx: 'auto',
            mb: 2,
          }}
        >
          {NUM_PAD.map((num) => {
            const padColor = numPadColors[num % numPadColors.length];
            return (
              <Button
                key={num}
                variant="contained"
                role="radio"
                aria-checked={inputValue === String(num)}
                aria-label={`Number ${num}`}
                tabIndex={0}
                onClick={() => handleNumPress(num)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNumPress(num);
                  }
                }}
                disabled={showFeedback}
                sx={{
                  borderRadius: '50%',
                  fontWeight: 800,
                  fontSize: '1.4rem',
                  width: {xs: 56, sm: 64},
                  height: {xs: 56, sm: 64},
                  minWidth: 0,
                  p: 0,
                  color: '#fff',
                  background: padColor,
                  border: 'none',
                  boxShadow: `0 4px 12px ${padColor}40`,
                  textTransform: 'none',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    background: padColor,
                    transform: 'scale(1.12)',
                    boxShadow: `0 6px 20px ${padColor}60`,
                  },
                  '&:active': {
                    transform: 'scale(0.92)',
                  },
                  '&.Mui-disabled': {
                    background: `${padColor}50`,
                    color: '#fff',
                  },
                }}
              >
                {num}
              </Button>
            );
          })}
        </Box>
      </Grow>

      {/* Submit button */}
      <Box sx={{textAlign: 'center', mb: 2}}>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={showFeedback || !inputValue}
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
            '&:disabled': {
              background: kidsColors.surfaceLight,
              color: kidsColors.textMuted,
            },
          }}
        >
          Check Answer
        </Button>
      </Box>

      {/* Visual Feedback — large emoji + correct number */}
      <Fade in={showFeedback} timeout={300}>
        <Box sx={{textAlign: 'center', minHeight: 60}}>
          {isCorrect ? (
            <Box
              sx={{
                animation: 'celebrate 0.7s ease-in-out',
                ...kidsAnimations.celebrate,
              }}
            >
              <Box sx={{fontSize: '3rem', mb: 0.5}}>🎉</Box>
              <Typography
                variant="h4"
                sx={{color: kidsColors.correct, fontWeight: 800}}
              >
                {q.count}
              </Typography>
            </Box>
          ) : (
            <Box>
              <Box sx={{fontSize: '2.5rem', mb: 0.5}}>🤔</Box>
              <Typography
                variant="h5"
                sx={{color: kidsColors.incorrect, fontWeight: 800}}
              >
                {q.count}
              </Typography>
            </Box>
          )}
        </Box>
      </Fade>

      <InlineCelebration type={celebType} gameTemplate="counting" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />
    </Box>
  );
}
