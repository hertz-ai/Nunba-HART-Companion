/**
 * WordBuildTemplate - Dynamic Liquid Agentic UI
 *
 * Spell words from scrambled letters. Shows a hint, scrambled letter tiles
 * below, blank slots above that fill as letters are tapped.
 * Correct word triggers green glow celebration. Wrong attempts cause
 * shake + first-letter hint.
 *
 * Props:
 *   config     - { content: { words: [{ word, hint, concept, extraLetters }] } }
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

const FEEDBACK_DELAY = 1600;

const TILE_COLORS = [
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

export default function WordBuildTemplate({config, onAnswer, onComplete}) {
  const words = config?.content?.words ?? [];
  const total = words.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  // Per-word state
  const [selectedIndices, setSelectedIndices] = useState([]); // indices into scrambledLetters
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [wrongShake, setWrongShake] = useState(false);
  const [showFirstHint, setShowFirstHint] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [visible, setVisible] = useState(true);
  const [emojiCelebrate, setEmojiCelebrate] = useState(false);
  const [imageMap, setImageMap] = useState({});

  // ── Hint scaffold state (psychology-based) ──
  const [hintLetterIdx, setHintLetterIdx] = useState(null); // highlights correct next letter tile
  const [correctPositions, setCorrectPositions] = useState([]); // tracks which positions were correct for progress circles

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

  const w = words[currentIndex] ?? {
    word: '',
    hint: '',
    concept: '',
    extraLetters: '',
  };
  const targetWord = w.word.toUpperCase();
  const rawExtra = w.extraLetters;
  let extra = '';
  if (Array.isArray(rawExtra)) {
    extra = rawExtra.join('');
  } else if (typeof rawExtra === 'string') {
    extra = rawExtra;
  } else if (typeof rawExtra === 'number' && rawExtra > 0) {
    // Number means "generate N random distractor letters"
    const used = new Set(targetWord.split(''));
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const pool = alphabet.split('').filter((c) => !used.has(c));
    extra = shuffle(pool).slice(0, rawExtra).join('');
  }
  const allLetters = targetWord + extra.toUpperCase();

  // Scramble letters once per word
  const scrambledLetters = useMemo(() => {
    return shuffle(allLetters.split(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, allLetters]);

  useEffect(() => {
    startTimeRef.current = Date.now();
    setSelectedIndices([]);
    setShowFeedback(false);
    setIsCorrect(false);
    setWrongShake(false);
    setShowFirstHint(false);
    setAttempts(0);
    setVisible(true);
    setEmojiCelebrate(false);
    setHintLetterIdx(null);
    setCorrectPositions([]);
    // TTS: "Spell the word ..."
    const curWord = words[currentIndex]?.word;
    if (curWord) {
      try {
        GameSounds.speakText('Spell the word ' + curWord);
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

  const builtWord = selectedIndices.map((i) => scrambledLetters[i]).join('');

  // ── handle letter tap ──────────────────────────────────────────
  const handleLetterTap = useCallback(
    (letterIdx) => {
      if (showFeedback) return;
      if (selectedIndices.includes(letterIdx)) return;
      if (selectedIndices.length >= targetWord.length) return;
      try {
        GameSounds.tap();
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }

      const newSelected = [...selectedIndices, letterIdx];
      setSelectedIndices(newSelected);

      // ── Progressive letter hint scaffold ──
      // Clear any existing hint when a new letter is tapped
      setHintLetterIdx(null);

      const placedPosition = newSelected.length - 1;
      const placedLetter = scrambledLetters[letterIdx];
      const expectedLetter = targetWord[placedPosition];

      if (placedLetter === expectedLetter) {
        // Correct letter in correct position — update progress circles
        setCorrectPositions((prev) => [...prev, placedPosition]);
      } else {
        // Wrong letter — after 1s, briefly highlight the correct next letter tile
        const correctNextLetter = targetWord[placedPosition];
        setTimeout(() => {
          // Find a scrambled tile index that has the correct letter and isn't already used
          const hintTileIdx = scrambledLetters.findIndex(
            (l, i) => l === correctNextLetter && !newSelected.includes(i)
          );
          if (hintTileIdx !== -1) {
            setHintLetterIdx(hintTileIdx);
            setTimeout(() => setHintLetterIdx(null), 2000);
          }
        }, 1000);
      }

      // Auto-check if word is complete
      if (newSelected.length === targetWord.length) {
        const built = newSelected.map((i) => scrambledLetters[i]).join('');
        const correct = built === targetWord;
        const elapsed = Date.now() - startTimeRef.current;

        setIsCorrect(correct);
        setShowFeedback(true);

        try {
          if (correct) {
            GameSounds.correct();
            setEmojiCelebrate(true);
            setTimeout(() => {
              try {
                GameSounds.speakText('Great spelling!');
              } catch (err) {
                logger.error(err); /* Game asset load — non-critical */
              }
            }, 400);
            triggerCorrect();
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

        if (correct) {
          // Mark all positions as correctly placed for progress circles
          setCorrectPositions(
            Array.from({length: targetWord.length}, (_, i) => i)
          );
        }

        if (!correct) {
          setWrongShake(true);
          setAttempts((a) => a + 1);
          if (attempts >= 0) setShowFirstHint(true);
          setTimeout(() => setWrongShake(false), 500);
          // Reset progress circles on wrong submission
          setCorrectPositions([]);
        }

        const newScore = correct ? score + 1 : score;
        const newStreak = correct ? streak + 1 : 0;
        const newBest = Math.max(bestStreak, newStreak);

        setScore(newScore);
        setStreak(newStreak);
        setBestStreak(newBest);

        if (
          correct &&
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
          targetWord: w.word,
          builtWord: built,
          isCorrect: correct,
          concept: w.concept ?? '',
          responseTimeMs: elapsed,
        };
        const newResults = [...results, result];
        setResults(newResults);

        if (onAnswer) onAnswer(correct, w.concept ?? '', elapsed);

        setTimeout(() => {
          setShowFeedback(false);

          if (correct) {
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
            // Reset for retry
            setSelectedIndices([]);
            setCorrectPositions([]);
            setHintLetterIdx(null);
          }
        }, FEEDBACK_DELAY);
      }
    },
    [
      showFeedback,
      selectedIndices,
      targetWord,
      scrambledLetters,
      score,
      streak,
      bestStreak,
      results,
      currentIndex,
      total,
      w,
      attempts,
      onAnswer,
      onComplete,
    ]
  );

  // ── remove letter from blanks ──────────────────────────────────
  const handleBlankTap = useCallback(
    (position) => {
      if (showFeedback) return;
      if (position >= selectedIndices.length) return;
      try {
        GameSounds.tap();
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
      const newSelected = [...selectedIndices];
      newSelected.splice(position, 1);
      setSelectedIndices(newSelected);
      // Clear hint and remove positions >= removed position from progress
      setHintLetterIdx(null);
      setCorrectPositions((prev) => prev.filter((p) => p < position));
    },
    [showFeedback, selectedIndices]
  );

  // ── guard ──────────────────────────────────────────────────────
  if (!words.length) {
    return (
      <Box sx={{p: 4, textAlign: 'center'}}>
        <Typography color={kidsColors.textSecondary}>
          No words available.
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
            Word {currentIndex + 1} of {total}
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

      {/* Hint card */}
      <Fade in={visible} timeout={400}>
        <Card
          elevation={0}
          sx={{
            background: kidsColors.cardBg,
            backdropFilter: 'blur(16px)',
            border: `1px solid ${kidsColors.cardBorder}`,
            borderRadius: '20px',
            boxShadow: kidsColors.shadowCard,
            p: {xs: 2.5, sm: 3},
            mb: 3,
            textAlign: 'center',
          }}
        >
          {/* Large word emoji / image */}
          {w.emoji && (
            <Box
              sx={{
                textAlign: 'center',
                mb: 1.5,
                transition:
                  'transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                transform: emojiCelebrate ? 'scale(1.3)' : 'scale(1)',
                animation: emojiCelebrate
                  ? 'emojiBounce 0.6s ease-in-out'
                  : 'none',
                '@keyframes emojiBounce': {
                  '0%': {transform: 'scale(1)'},
                  '40%': {transform: 'scale(1.4)'},
                  '70%': {transform: 'scale(0.9)'},
                  '100%': {transform: 'scale(1.2)'},
                },
              }}
            >
              <GameItemImage
                blobUrl={imageMap['w' + currentIndex]}
                emoji={w.emoji}
                size={120}
              />
            </Box>
          )}

          {w.concept && (
            <Typography
              variant="overline"
              sx={{
                color: kidsColors.primaryLight,
                letterSpacing: 1.5,
                fontSize: '0.9rem',
                mb: 1,
                display: 'block',
              }}
            >
              {w.concept}
            </Typography>
          )}
          <Typography
            variant="h6"
            sx={{
              color: kidsColors.textPrimary,
              fontWeight: 700,
              lineHeight: 1.5,
            }}
          >
            {w.hint}
          </Typography>

          {/* First letter hint after wrong attempt */}
          {showFirstHint && (
            <Fade in timeout={400}>
              <Typography
                variant="body2"
                sx={{
                  mt: 1,
                  color: kidsColors.yellow,
                  fontWeight: 600,
                  background: `${kidsColors.yellow}12`,
                  borderRadius: '8px',
                  px: 2,
                  py: 0.5,
                  display: 'inline-block',
                }}
              >
                Starts with: {targetWord[0]}
              </Typography>
            </Fade>
          )}
        </Card>
      </Fade>

      {/* Blank slots */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          gap: {xs: 0.8, sm: 1},
          mb: 3,
          flexWrap: 'wrap',
          animation: wrongShake ? 'wordShake 0.4s ease-in-out' : 'none',
          '@keyframes wordShake': {
            '0%, 100%': {transform: 'translateX(0)'},
            '20%': {transform: 'translateX(-8px)'},
            '40%': {transform: 'translateX(8px)'},
            '60%': {transform: 'translateX(-5px)'},
            '80%': {transform: 'translateX(5px)'},
          },
        }}
      >
        {Array.from({length: targetWord.length}).map((_, idx) => {
          const hasFilled = idx < selectedIndices.length;
          const letter = hasFilled
            ? scrambledLetters[selectedIndices[idx]]
            : '';
          const slotCorrect = showFeedback && isCorrect;
          const slotWrong = showFeedback && !isCorrect;

          return (
            <Box
              key={idx}
              onClick={() => handleBlankTap(idx)}
              sx={{
                width: {xs: 52, sm: 64},
                height: {xs: 52, sm: 64},
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '12px',
                border: `2.5px solid ${
                  slotCorrect
                    ? kidsColors.correct
                    : slotWrong
                      ? kidsColors.incorrect
                      : hasFilled
                        ? kidsColors.primary
                        : `${kidsColors.primaryLight}50`
                }`,
                background: slotCorrect
                  ? kidsColors.correctBg
                  : slotWrong
                    ? kidsColors.incorrectBg
                    : hasFilled
                      ? `${kidsColors.primary}25`
                      : kidsColors.surfaceLight,
                boxShadow: slotCorrect
                  ? kidsColors.glowCorrect
                  : slotWrong
                    ? kidsColors.glowIncorrect
                    : 'none',
                cursor: hasFilled && !showFeedback ? 'pointer' : 'default',
                transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                animation:
                  hasFilled && !showFeedback
                    ? `slotFill 0.3s ease-out`
                    : slotCorrect
                      ? 'correctGlow 0.6s ease-in-out'
                      : 'none',
                '@keyframes slotFill': {
                  '0%': {transform: 'scale(0.7)'},
                  '60%': {transform: 'scale(1.1)'},
                  '100%': {transform: 'scale(1)'},
                },
                '@keyframes correctGlow': {
                  '0%': {boxShadow: 'none'},
                  '50%': {boxShadow: `0 0 20px ${kidsColors.correct}60`},
                  '100%': {boxShadow: kidsColors.glowCorrect},
                },
              }}
            >
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: {xs: '1.3rem', sm: '1.6rem'},
                  color: slotCorrect
                    ? kidsColors.correct
                    : slotWrong
                      ? kidsColors.incorrect
                      : kidsColors.textPrimary,
                  transition: 'color 0.3s ease',
                }}
              >
                {letter}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Word completion progress circles */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          gap: 1,
          mb: 2.5,
        }}
      >
        {Array.from({length: targetWord.length}).map((_, idx) => {
          const isFilled = correctPositions.includes(idx);
          return (
            <Box
              key={`progress-${idx}`}
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: `2px solid ${isFilled ? kidsColors.correct : `${kidsColors.primaryLight}40`}`,
                background: isFilled ? kidsColors.correct : 'transparent',
                transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                transform: isFilled ? 'scale(1)' : 'scale(0.7)',
                animation: isFilled ? 'circlePopIn 0.4s ease-out' : 'none',
                '@keyframes circlePopIn': {
                  '0%': {transform: 'scale(0)', opacity: 0},
                  '60%': {transform: 'scale(1.3)', opacity: 1},
                  '100%': {transform: 'scale(1)', opacity: 1},
                },
              }}
            />
          );
        })}
      </Box>

      {/* Scrambled letter tiles */}
      <Box
        role="listbox"
        aria-label="Available letters"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: {xs: 0.8, sm: 1},
          mb: 3,
        }}
      >
        {scrambledLetters.map((letter, idx) => {
          const isUsed = selectedIndices.includes(idx);
          const color = TILE_COLORS[idx % TILE_COLORS.length];
          const isHinted = hintLetterIdx === idx;

          return (
            <Grow
              in={visible}
              key={`${currentIndex}-${idx}`}
              timeout={250 + idx * 60}
            >
              <Button
                role="option"
                aria-selected={isUsed}
                aria-label={`Letter ${letter}`}
                tabIndex={0}
                onClick={() => handleLetterTap(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleLetterTap(idx);
                  }
                }}
                disabled={isUsed || showFeedback}
                sx={{
                  minWidth: {xs: 52, sm: 64},
                  width: {xs: 52, sm: 64},
                  height: {xs: 52, sm: 64},
                  p: 0,
                  borderRadius: '14px',
                  fontWeight: 800,
                  fontSize: {xs: '1.3rem', sm: '1.6rem'},
                  color: isUsed ? kidsColors.textMuted : kidsColors.textPrimary,
                  background: isHinted
                    ? `${kidsColors.correct}20`
                    : isUsed
                      ? `${kidsColors.surfaceLight}`
                      : `${color}25`,
                  border: `2px solid ${
                    isHinted
                      ? kidsColors.correct
                      : isUsed
                        ? kidsColors.border
                        : `${color}80`
                  }`,
                  boxShadow: isHinted
                    ? '0 0 12px rgba(46,204,113,0.5)'
                    : 'none',
                  opacity: isUsed ? 0.3 : 1,
                  textTransform: 'none',
                  transition:
                    'all 0.25s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                  animation: isHinted
                    ? 'letterHintPulse 0.7s ease-in-out infinite'
                    : 'none',
                  '@keyframes letterHintPulse': {
                    '0%, 100%': {
                      transform: 'scale(1)',
                      boxShadow: '0 0 8px rgba(46,204,113,0.3)',
                    },
                    '50%': {
                      transform: 'scale(1.08)',
                      boxShadow: '0 0 16px rgba(46,204,113,0.6)',
                    },
                  },
                  '&:hover': isUsed
                    ? {}
                    : {
                        background: `${color}40`,
                        borderColor: color,
                        transform: 'scale(1.12) translateY(-3px)',
                        boxShadow: `0 6px 16px ${color}30`,
                      },
                  '&:active': {
                    transform: 'scale(0.92)',
                  },
                }}
              >
                {letter}
              </Button>
            </Grow>
          );
        })}
      </Box>

      {/* Feedback */}
      <Fade in={showFeedback} timeout={300}>
        <Box sx={{textAlign: 'center', minHeight: 40}}>
          {isCorrect ? (
            <Typography
              variant="h5"
              sx={{
                color: kidsColors.correct,
                fontWeight: 800,
                animation: 'celebrate 0.7s ease-in-out',
                ...kidsAnimations.celebrate,
              }}
            >
              Great spelling!
            </Typography>
          ) : (
            <Typography
              variant="body1"
              sx={{color: kidsColors.incorrect, fontWeight: 700}}
            >
              Not quite - try again!
            </Typography>
          )}
        </Box>
      </Fade>

      {/* Streak */}
      {streak >= 2 && !showFeedback && (
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

      <InlineCelebration type={celebType} gameTemplate="word_build" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />
    </Box>
  );
}
