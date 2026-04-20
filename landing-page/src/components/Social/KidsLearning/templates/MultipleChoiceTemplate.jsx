/**
 * MultipleChoiceTemplate - Dynamic Liquid Agentic UI
 *
 * A fluid, animated multiple-choice quiz with 2x2 option grid,
 * color feedback flashes, progress dots, and auto-advance.
 *
 * Props:
 *   config     - { content: { questions: [{ question, options: [string], correctIndex, concept }] } }
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import {logger} from '../../../../utils/logger';
import {kidsColors, kidsAnimations} from '../kidsTheme';
import {getEmojiForText} from '../shared/emojiMap';
import GameAssetService from '../shared/GameAssetService';
import GameItemImage from '../shared/GameItemImage';
import GameLivesBar from '../shared/GameLivesBar';
import InlineCelebration from '../shared/InlineCelebration';
import KidsCharacter from '../shared/KidsCharacter';
import {GameSounds, GameCommentary} from '../shared/SoundManager';
import useCelebration from '../shared/useCelebration';
import VisualHint from '../shared/VisualHint';

import {Box, Typography, Button, Card, Fade, Grow} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback} from 'react';

// ── constants ──────────────────────────────────────────────────
const FEEDBACK_DELAY = 1400;
const OPTION_COLORS = [
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.secondary,
];

// ── component ──────────────────────────────────────────────────
export default function MultipleChoiceTemplate({config, onAnswer, onComplete}) {
  const questions = config?.content?.questions ?? [];
  const total = questions.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [questionVisible, setQuestionVisible] = useState(true);
  const [imageMap, setImageMap] = useState({});
  const [lives, setLives] = useState(3);
  const [charState, setCharState] = useState('idle');
  const [showVisualHint, setShowVisualHint] = useState(true);

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

  // ── Hint scaffold state (psychology-based) ──
  const [hintIndex, setHintIndex] = useState(null); // ZPD: glow correct option after wrong
  const [encourageVisible, setEncourageVisible] = useState(false); // Growth mindset message
  const [preScaffold, setPreScaffold] = useState(false); // Auto-hint after 3 consecutive wrongs
  const consecutiveWrongRef = useRef(0); // Track consecutive wrong answers

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

  // Reset timer when question changes + TTS auto-read
  useEffect(() => {
    startTimeRef.current = Date.now();
    setQuestionVisible(true);
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

  // ── handle option selection ──────────────────────────────────
  const handleSelect = useCallback(
    (optIndex) => {
      if (showFeedback) return;
      try {
        GameSounds.tap();
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }

      const elapsed = Date.now() - startTimeRef.current;
      const q = questions[currentIndex];
      const isCorrect = optIndex === q.correctIndex;

      setSelectedIndex(optIndex);
      setShowFeedback(true);

      // Sound feedback + TTS commentary + character animation
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

      const newScore = isCorrect ? score + 1 : score;
      const newStreak = isCorrect ? streak + 1 : 0;
      const newBest = Math.max(bestStreak, newStreak);

      setScore(newScore);
      setStreak(newStreak);
      setBestStreak(newBest);

      // ── Hint scaffold logic ──
      if (isCorrect) {
        consecutiveWrongRef.current = 0;
        setPreScaffold(false);
      } else {
        consecutiveWrongRef.current += 1;

        // ZPD: briefly highlight correct option after 0.8s
        setTimeout(() => {
          setHintIndex(q.correctIndex);
          setTimeout(() => setHintIndex(null), 1200);
        }, 800);

        // Growth mindset: show encouragement after 2 wrongs in a row
        if (consecutiveWrongRef.current >= 2) {
          setEncourageVisible(true);
          setTimeout(() => setEncourageVisible(false), 1500);
        }

        // Pre-scaffold: after 3 consecutive wrongs, flag next question for auto-hint
        if (consecutiveWrongRef.current >= 3) {
          setPreScaffold(true);
        }
      }

      // Streak TTS
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
        question: q.question,
        selected: optIndex,
        correct: q.correctIndex,
        isCorrect,
        concept: q.concept ?? '',
        responseTimeMs: elapsed,
      };
      const newResults = [...results, result];
      setResults(newResults);

      if (onAnswer) onAnswer(isCorrect, q.concept ?? '', elapsed);

      // Auto-advance after feedback
      setTimeout(() => {
        setShowFeedback(false);
        setSelectedIndex(null);
        setHintIndex(null);
        setEncourageVisible(false);
        setQuestionVisible(false);

        setTimeout(() => {
          if (currentIndex + 1 < total) {
            setCurrentIndex((i) => i + 1);
          } else {
            // Quiz complete
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
          No questions available.
        </Typography>
      </Box>
    );
  }

  const q = questions[currentIndex];
  const progress = ((currentIndex + (showFeedback ? 1 : 0)) / total) * 100;

  // ── option button style helper ───────────────────────────────
  const getOptionSx = (idx) => {
    const base = {
      borderRadius: '16px',
      fontWeight: 700,
      fontSize: {xs: '1.1rem', sm: '1.25rem'},
      textTransform: 'none',
      py: {xs: 2.5, sm: 3},
      px: 2.5,
      border: '2px solid',
      borderColor: `${OPTION_COLORS[idx]}80`,
      color: kidsColors.textPrimary,
      background: `${OPTION_COLORS[idx]}25`,
      transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
      position: 'relative',
      overflow: 'hidden',
      justifyContent: 'flex-start',
      textAlign: 'left',
      lineHeight: 1.4,
      minHeight: 48,
      '&:hover': {
        background: `${OPTION_COLORS[idx]}40`,
        borderColor: OPTION_COLORS[idx],
        transform: 'translateY(-2px)',
        boxShadow: `0 6px 20px ${OPTION_COLORS[idx]}33`,
      },
    };

    if (showFeedback && selectedIndex === idx) {
      const isCorrect = idx === q.correctIndex;
      // "Close answer" detection: neighboring index = amber glow instead of red
      const isClose = !isCorrect && Math.abs(idx - q.correctIndex) === 1;
      const wrongColor = isClose ? '#F59E0B' : kidsColors.incorrect; // amber vs red
      const wrongBg = isClose ? '#F59E0B18' : kidsColors.incorrectBg;
      const wrongGlow = isClose
        ? '0 0 14px rgba(245,158,11,0.5)'
        : kidsColors.glowIncorrect;
      return {
        ...base,
        borderColor: isCorrect ? kidsColors.correct : wrongColor,
        background: isCorrect ? kidsColors.correctBg : wrongBg,
        boxShadow: isCorrect ? kidsColors.glowCorrect : wrongGlow,
        transform: isCorrect ? 'scale(1.03)' : 'translateX(4px)',
        animation: isCorrect ? undefined : 'shake 0.4s ease-in-out',
        ...kidsAnimations.pulse,
        '@keyframes shake': {
          '0%, 100%': {transform: 'translateX(0)'},
          '20%': {transform: 'translateX(-6px)'},
          '40%': {transform: 'translateX(6px)'},
          '60%': {transform: 'translateX(-4px)'},
          '80%': {transform: 'translateX(4px)'},
        },
      };
    }

    // ZPD hint: gentle green glow pulse on the correct option after wrong answer
    if (hintIndex === idx) {
      return {
        ...base,
        borderColor: kidsColors.correct,
        background: kidsColors.correctBg,
        boxShadow: '0 0 12px rgba(46,204,113,0.6)',
        animation: 'hintPulse 0.6s ease-in-out 2',
        '@keyframes hintPulse': {
          '0%, 100%': {
            transform: 'scale(1)',
            boxShadow: '0 0 8px rgba(46,204,113,0.3)',
          },
          '50%': {
            transform: 'scale(1.04)',
            boxShadow: '0 0 16px rgba(46,204,113,0.7)',
          },
        },
      };
    }

    // Pre-scaffold: if 3+ consecutive wrongs, gently glow correct option BEFORE they answer
    if (preScaffold && !showFeedback && idx === q.correctIndex) {
      return {
        ...base,
        boxShadow: '0 0 10px rgba(46,204,113,0.35)',
        borderColor: `${kidsColors.correct}80`,
        animation: 'preHintBreath 2s ease-in-out infinite',
        '@keyframes preHintBreath': {
          '0%, 100%': {boxShadow: '0 0 6px rgba(46,204,113,0.2)'},
          '50%': {boxShadow: '0 0 14px rgba(46,204,113,0.45)'},
        },
      };
    }

    // Highlight correct answer when wrong selected
    if (showFeedback && idx === q.correctIndex && selectedIndex !== idx) {
      return {
        ...base,
        borderColor: kidsColors.correct,
        background: kidsColors.correctBg,
        opacity: 0.7,
      };
    }

    // Dim non-selected during feedback
    if (showFeedback && selectedIndex !== idx) {
      return {...base, opacity: 0.4, pointerEvents: 'none'};
    }

    return base;
  };

  // ── render ───────────────────────────────────────────────────
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: {xs: '100%', sm: 640},
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
            seed={`mc-${currentIndex}`}
            state={charState}
            size={68}
            expression={
              showFeedback && selectedIndex === q.correctIndex
                ? 'happy'
                : showFeedback
                  ? 'sad'
                  : 'happy'
            }
          />
        </Box>
      </Box>

      {/* Visual Hint on first question */}
      <VisualHint
        type="tap"
        visible={showVisualHint && currentIndex === 0}
        onDismiss={() => setShowVisualHint(false)}
      />

      {/* Growth mindset encouragement after 2+ consecutive wrongs */}
      <Fade in={encourageVisible} timeout={400}>
        <Box
          sx={{
            textAlign: 'center',
            mb: 1.5,
            animation: encourageVisible
              ? 'encourageFadeIn 0.5s ease-out'
              : 'none',
            '@keyframes encourageFadeIn': {
              '0%': {opacity: 0, transform: 'translateY(8px) scale(0.9)'},
              '100%': {opacity: 1, transform: 'translateY(0) scale(1)'},
            },
          }}
        >
          <Typography
            sx={{
              fontSize: '1.1rem',
              fontWeight: 700,
              color: kidsColors.primaryLight,
              background: `${kidsColors.primary}15`,
              borderRadius: '12px',
              px: 2.5,
              py: 1,
              display: 'inline-block',
            }}
          >
            {consecutiveWrongRef.current >= 3
              ? "\u{1F31F} Keep going, you're learning!"
              : "\u{1F4AA} You're learning!"}
          </Typography>
        </Box>
      </Fade>

      {/* Question card */}
      <Fade in={questionVisible} timeout={400}>
        <Card
          elevation={0}
          sx={{
            background: kidsColors.cardBg,
            backdropFilter: 'blur(16px)',
            border: `1px solid ${kidsColors.cardBorder}`,
            borderRadius: '20px',
            boxShadow: kidsColors.shadowCard,
            p: {xs: 2.5, sm: 3.5},
            mb: 3,
            animation: 'fadeInUp 0.5s ease-out',
            ...kidsAnimations.fadeInUp,
          }}
        >
          {/* Large hero visual — always show, fallback to emoji from question text */}
          <Box sx={{textAlign: 'center', mb: 1.5}}>
            <GameItemImage
              blobUrl={imageMap['q' + currentIndex]}
              emoji={q.emoji || getEmojiForText(q.question) || '❓'}
              size={96}
            />
          </Box>

          {/* Concept tag */}
          {q.concept && (
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
              {q.concept}
            </Typography>
          )}

          <Typography
            variant="h6"
            sx={{
              color: kidsColors.textPrimary,
              fontWeight: 700,
              lineHeight: 1.5,
              fontSize: {xs: '1.2rem', sm: '1.5rem'},
            }}
          >
            {q.question}
          </Typography>
        </Card>
      </Fade>

      {/* Options 2x2 grid */}
      <Box
        role="radiogroup"
        aria-label="Answer choices"
        sx={{
          display: 'grid',
          gridTemplateColumns: {xs: '1fr', sm: '1fr 1fr'},
          gap: 1.5,
        }}
      >
        {(q.options ?? []).map((opt, idx) => (
          <Grow in={questionVisible} key={idx} timeout={400 + idx * 120}>
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
              {/* Visual emoji circle */}
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: `${OPTION_COLORS[idx]}20`,
                  mr: 1.5,
                  flexShrink: 0,
                  fontSize: '1.5rem',
                }}
              >
                {imageMap['q' + currentIndex + 'o' + idx] ? (
                  <GameItemImage
                    blobUrl={imageMap['q' + currentIndex + 'o' + idx]}
                    emoji={typeof opt === 'object' ? opt.emoji : null}
                    size={36}
                  />
                ) : (
                  getEmojiForText(
                    typeof opt === 'string' ? opt : opt?.text || ''
                  ) || (
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: OPTION_COLORS[idx],
                      }}
                    />
                  )
                )}
              </Box>
              <Box
                component="span"
                sx={{fontSize: {xs: '1rem', sm: '1.15rem'}}}
              >
                {typeof opt === 'string' ? opt : opt?.text || ''}
              </Box>
            </Button>
          </Grow>
        ))}
      </Box>

      {/* Visual Feedback — large emoji */}
      <Fade in={showFeedback} timeout={300}>
        <Box
          sx={{
            textAlign: 'center',
            mt: 2,
            animation: showFeedback ? 'fadeInScale 0.3s ease-out' : undefined,
            ...kidsAnimations.fadeInScale,
          }}
        >
          {selectedIndex !== null && selectedIndex === q.correctIndex ? (
            <Box>
              <Box sx={{fontSize: '3rem'}}>🎉⭐</Box>
            </Box>
          ) : (
            <Box>
              <Box sx={{fontSize: '2.5rem'}}>
                {selectedIndex !== null &&
                Math.abs(selectedIndex - q.correctIndex) === 1
                  ? '🤏'
                  : '💪'}
              </Box>
            </Box>
          )}
        </Box>
      </Fade>

      <InlineCelebration type={celebType} gameTemplate="multiple_choice" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />
    </Box>
  );
}
