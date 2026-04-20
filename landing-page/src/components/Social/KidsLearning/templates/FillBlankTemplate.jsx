/**
 * FillBlankTemplate - Dynamic Liquid Agentic UI
 *
 * Sentence with a blank (underlined space), letter/word tile selection,
 * hint system after wrong attempts, and animated transitions.
 *
 * Props:
 *   config     - { content: { questions: [{
 *                   sentence: "The ___ is big.",       // blank marked with ___
 *                   answer: "elephant",                // correct answer
 *                   choices: ["elephant","ant","car","table"],
 *                   concept: "Animals",
 *                   hint?: "It has a trunk."
 *                 }] } }
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

import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import {Box, Typography, Card, Chip, Fade, Grow, Button} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback} from 'react';

const FEEDBACK_DELAY = 1600;
const WRONG_ATTEMPTS_FOR_HINT = 1;

export default function FillBlankTemplate({config, onAnswer, onComplete}) {
  const questions = config?.content?.questions ?? [];
  const total = questions.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [visible, setVisible] = useState(true);
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
    setWrongAttempts(0);
    setShowHint(false);
    // TTS: auto-read sentence
    const q = questions[currentIndex];
    if (q?.sentence) {
      try {
        GameSounds.speakText(q.sentence.replace('___', 'blank'));
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

  // ── handle choice selection ──────────────────────────────────
  const handleChoice = useCallback(
    (choice) => {
      if (showFeedback) return;
      try {
        GameSounds.tap();
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }

      const elapsed = Date.now() - startTimeRef.current;
      const q = questions[currentIndex];
      const isCorrect = choice.toLowerCase() === q.answer.toLowerCase();

      setSelectedChoice(choice);
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

      if (isCorrect) {
        setCharState('celebrate');
        setTimeout(() => setCharState('idle'), 1500);
      } else {
        setLives((l) => Math.max(0, l - 1));
        setCharState('encourage');
        setTimeout(() => setCharState('idle'), 1500);
      }

      if (!isCorrect) {
        const newWrong = wrongAttempts + 1;
        setWrongAttempts(newWrong);
        if (newWrong >= WRONG_ATTEMPTS_FOR_HINT && q.hint) {
          setShowHint(true);
        }
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
        sentence: q.sentence,
        selected: choice,
        correct: q.answer,
        isCorrect,
        concept: q.concept ?? '',
        responseTimeMs: elapsed,
      };
      const newResults = [...results, result];
      setResults(newResults);

      if (onAnswer) onAnswer(isCorrect, q.concept ?? '', elapsed);

      setTimeout(() => {
        setShowFeedback(false);
        setSelectedChoice(null);

        if (isCorrect) {
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
        }
        // If wrong, stay on same question so they can try again
      }, FEEDBACK_DELAY);
    },
    [
      showFeedback,
      currentIndex,
      questions,
      score,
      streak,
      bestStreak,
      wrongAttempts,
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
  const progress = total > 0 ? (score / total) * 100 : 0;

  // ── build sentence display with blank ────────────────────────
  const renderSentence = () => {
    const parts = q.sentence.split('___');
    const filled = showFeedback && selectedChoice;
    const isCorrect = selectedChoice?.toLowerCase() === q.answer.toLowerCase();

    return (
      <Typography
        variant="h5"
        sx={{
          color: kidsColors.textPrimary,
          fontWeight: 600,
          lineHeight: 2,
          fontSize: {xs: '1.2rem', sm: '1.5rem'},
          textAlign: 'center',
        }}
      >
        {parts[0]}
        <Box
          component="span"
          sx={{
            display: 'inline-block',
            animation: 'bouncingArrow 1s infinite',
            '@keyframes bouncingArrow': {
              '0%, 100%': {transform: 'translateY(0)'},
              '50%': {transform: 'translateY(6px)'},
            },
            fontSize: '1.2rem',
          }}
        >
          👇
        </Box>
        <Box
          component="span"
          sx={{
            display: 'inline-block',
            minWidth: filled ? 'auto' : 80,
            borderBottom: filled
              ? 'none'
              : `3px dashed ${kidsColors.primaryLight}`,
            px: 1.5,
            py: 0.3,
            mx: 0.5,
            borderRadius: filled ? '8px' : 0,
            background: filled
              ? isCorrect
                ? kidsColors.correctBg
                : kidsColors.incorrectBg
              : 'transparent',
            color: filled
              ? isCorrect
                ? kidsColors.correct
                : kidsColors.incorrect
              : 'transparent',
            fontWeight: 800,
            transition: 'all 0.3s ease',
            ...(filled && isCorrect ? {boxShadow: kidsColors.glowCorrect} : {}),
          }}
        >
          {filled ? selectedChoice : '\u00A0\u00A0\u00A0'}
        </Box>
        {parts[1] || ''}
      </Typography>
    );
  };

  // ── chip color helper ────────────────────────────────────────
  const chipColors = [
    kidsColors.blue,
    kidsColors.pink,
    kidsColors.orange,
    kidsColors.secondary,
    kidsColors.purple,
    kidsColors.yellow,
  ];

  const getChipSx = (choice, idx) => {
    const color = chipColors[idx % chipColors.length];

    const base = {
      py: 4,
      px: 2.5,
      fontSize: {xs: '1.05rem', sm: '1.2rem'},
      fontWeight: 700,
      borderRadius: '14px',
      border: '2px solid',
      borderColor: `${color}80`,
      background: `${color}25`,
      minHeight: 56,
      color: kidsColors.textPrimary,
      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
      height: 'auto',
      '& .MuiChip-label': {px: 1.5},
      '&:hover': {
        background: `${color}40`,
        borderColor: color,
        transform: 'translateY(-3px) scale(1.04)',
        boxShadow: `0 6px 20px ${color}33`,
      },
    };

    if (showFeedback && selectedChoice === choice) {
      const isCorrect = choice.toLowerCase() === q.answer.toLowerCase();
      return {
        ...base,
        borderColor: isCorrect ? kidsColors.correct : kidsColors.incorrect,
        background: isCorrect ? kidsColors.correctBg : kidsColors.incorrectBg,
        boxShadow: isCorrect
          ? kidsColors.glowCorrect
          : kidsColors.glowIncorrect,
        transform: isCorrect ? 'scale(1.08)' : 'scale(0.95)',
      };
    }

    if (showFeedback) {
      return {...base, opacity: 0.35, pointerEvents: 'none'};
    }

    return base;
  };

  // ── render ───────────────────────────────────────────────────
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: {xs: '100%', sm: 620},
        mx: 'auto',
        p: {xs: 2, sm: 3},
        ...kidsAnimations.fadeInUp,
      }}
    >
      <GameLivesBar
        lives={lives}
        score={score}
        currentLevel={currentIndex + 1}
        totalLevels={total}
        streak={streak}
      />
      <Box sx={{position: 'relative'}}>
        <Box sx={{position: 'absolute', top: -10, right: 0, zIndex: 10}}>
          <KidsCharacter
            seed={`fill-${currentIndex}`}
            state={charState}
            size={68}
          />
        </Box>
      </Box>
      <VisualHint
        type="tap"
        visible={showVisualHint && currentIndex === 0}
        onDismiss={() => setShowVisualHint(false)}
      />

      {/* Sentence card */}
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
            minHeight: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box sx={{textAlign: 'center', mb: 1.5}}>
            <GameItemImage
              blobUrl={imageMap['q' + currentIndex]}
              emoji={q.emoji || getEmojiForText(q.answer) || '📝'}
              size={72}
            />
          </Box>
          {q.concept && (
            <Typography
              variant="overline"
              sx={{
                color: kidsColors.primaryLight,
                letterSpacing: 1.5,
                fontSize: '0.9rem',
                mb: 1.5,
              }}
            >
              {q.concept}
            </Typography>
          )}
          {renderSentence()}
        </Card>
      </Fade>

      {/* Hint */}
      <Fade in={showHint} timeout={500}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 2,
            px: 2,
            py: 1.2,
            borderRadius: '14px',
            background: `${kidsColors.yellow}15`,
            border: `1px solid ${kidsColors.yellow}40`,
          }}
        >
          <LightbulbOutlinedIcon
            sx={{color: kidsColors.yellow, fontSize: 22}}
          />
          <Typography
            variant="body2"
            sx={{color: kidsColors.yellow, fontWeight: 600}}
          >
            Hint: {q.hint || 'Think carefully!'}
          </Typography>
        </Box>
      </Fade>

      {/* Choice tiles */}
      <Box
        role="group"
        aria-label="Word choices"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          justifyContent: 'center',
          mb: 3,
        }}
      >
        {(q.choices ?? []).map((choice, idx) => (
          <Grow
            in={visible}
            key={`${currentIndex}-${idx}`}
            timeout={350 + idx * 100}
          >
            <Chip
              label={`${getEmojiForText(choice) || '▪️'} ${choice}`}
              clickable
              onClick={() => handleChoice(choice)}
              disabled={showFeedback}
              aria-label={`Choice: ${choice}`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleChoice(choice);
                }
              }}
              sx={getChipSx(choice, idx)}
            />
          </Grow>
        ))}
      </Box>

      {/* Feedback text */}
      <Fade in={showFeedback} timeout={300}>
        <Box sx={{textAlign: 'center', minHeight: 36}}>
          {selectedChoice?.toLowerCase() === q.answer.toLowerCase() ? (
            <Box
              sx={{
                animation: 'celebrate 0.6s ease-in-out',
                ...kidsAnimations.celebrate,
              }}
            >
              <Box sx={{fontSize: '3rem'}}>🎉</Box>
            </Box>
          ) : (
            <Box>
              <Box sx={{fontSize: '2.5rem'}}>💪</Box>
            </Box>
          )}
        </Box>
      </Fade>

      <InlineCelebration type={celebType} gameTemplate="fill_blank" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />
    </Box>
  );
}
