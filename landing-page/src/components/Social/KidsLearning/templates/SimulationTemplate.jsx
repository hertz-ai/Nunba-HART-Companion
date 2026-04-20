/**
 * SimulationTemplate - Dynamic Liquid Agentic UI
 *
 * Scenario-based decision making. Presents a scenario (e.g. shopping, safety)
 * with interactive item cards. Click to choose good items, avoid bad ones.
 * Each choice shows feedback toast. Completes when all good items are chosen.
 *
 * Props:
 *   config     - { content: { scenario: {
 *                   title: string,
 *                   concept: string,
 *                   description?: string,
 *                   startingMoney?: number,
 *                   items: [{ name, price?, icon, isGood, feedback }],
 *                   goal: string
 *                 } } }
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import {logger} from '../../../../utils/logger';
import {kidsColors, kidsAnimations} from '../kidsTheme';
import InlineCelebration from '../shared/InlineCelebration';
import ProgressStars from '../shared/ProgressStars';
import {GameSounds} from '../shared/SoundManager';
import useCelebration from '../shared/useCelebration';

import {Box, Typography, Card, LinearProgress, Fade, Grow} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback} from 'react';

const FEEDBACK_DURATION = 1500;

const CARD_COLORS = [
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.purple,
  kidsColors.teal,
  kidsColors.secondary,
  kidsColors.yellow,
  kidsColors.correct,
];

export default function SimulationTemplate({config, onAnswer, onComplete}) {
  const scenario = config?.content?.scenario ?? {};
  const items = scenario.items ?? [];
  const goodItems = items.filter((i) => i.isGood);
  const totalGood = goodItems.length;
  const totalItems = items.length;

  const [chosenIds, setChosenIds] = useState(new Set());
  const [money, setMoney] = useState(scenario.startingMoney ?? null);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [feedbackToast, setFeedbackToast] = useState(null); // { text, isGood }
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

  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    startTimeRef.current = Date.now();
    setChosenIds(new Set());
    setMoney(scenario.startingMoney ?? null);
    setScore(0);
    setResults([]);
    setStreak(0);
    setBestStreak(0);
    setFeedbackToast(null);
    setCompleted(false);
    // TTS: auto-read scenario title and goal
    const text = scenario.title
      ? `${scenario.title}. ${scenario.goal || 'Choose the best items!'}`
      : '';
    if (text) {
      try {
        GameSounds.speakText(text);
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario.title]);

  // Count good items chosen
  const goodChosen = items.filter(
    (item, idx) => chosenIds.has(idx) && item.isGood
  ).length;
  const progress = totalGood > 0 ? (goodChosen / totalGood) * 100 : 0;

  // ── handle item choice ─────────────────────────────────────────
  const handleChooseItem = useCallback(
    (itemIdx) => {
      if (completed) return;
      if (chosenIds.has(itemIdx)) return;

      const item = items[itemIdx];
      if (!item) return;

      const elapsed = Date.now() - startTimeRef.current;

      // Check money
      if (money !== null && item.price && money < item.price) {
        setFeedbackToast({text: 'Not enough money for that!', isGood: false});
        setTimeout(() => setFeedbackToast(null), FEEDBACK_DURATION);
        return;
      }

      const newChosen = new Set(chosenIds);
      newChosen.add(itemIdx);
      setChosenIds(newChosen);

      // Deduct money
      if (money !== null && item.price) {
        setMoney((m) => m - item.price);
      }

      // Show feedback toast
      setFeedbackToast({
        text:
          item.feedback ||
          (item.isGood ? 'Good choice!' : 'Not the best choice...'),
        isGood: item.isGood,
      });

      try {
        if (item.isGood) {
          GameSounds.correct();
        } else {
          GameSounds.wrong();
        }
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
      setTimeout(() => setFeedbackToast(null), FEEDBACK_DURATION);

      const newScore = item.isGood ? score + 1 : score;
      const newStreak = item.isGood ? streak + 1 : 0;
      const newBest = Math.max(bestStreak, newStreak);

      setScore(newScore);
      setStreak(newStreak);
      setBestStreak(newBest);

      // Celebration triggers
      if (item.isGood) {
        triggerCorrect();
        if (newStreak === 3 || newStreak === 5 || newStreak === 10) {
          triggerStreak(newStreak);
        }
      }

      const result = {
        itemName: item.name,
        isCorrect: item.isGood,
        concept: scenario.concept ?? '',
        responseTimeMs: elapsed,
      };
      const newResults = [...results, result];
      setResults(newResults);

      if (onAnswer) onAnswer(item.isGood, scenario.concept ?? '', elapsed);

      // Check if all good items chosen
      const newGoodChosen = items.filter(
        (it, idx) => newChosen.has(idx) && it.isGood
      ).length;

      if (newGoodChosen >= totalGood) {
        setCompleted(true);
        triggerComplete(newScore, totalGood);
        setTimeout(() => {
          if (onComplete) {
            onComplete({
              score: newScore,
              correct: newScore,
              total: totalGood,
              results: newResults,
              bestStreak: newBest,
            });
          }
        }, 2000);
      }
    },
    [
      completed,
      chosenIds,
      items,
      money,
      score,
      streak,
      bestStreak,
      results,
      totalGood,
      scenario.concept,
      onAnswer,
      onComplete,
    ]
  );

  // ── guard ──────────────────────────────────────────────────────
  if (!items.length) {
    return (
      <Box sx={{p: 4, textAlign: 'center'}}>
        <Typography color={kidsColors.textSecondary}>
          No scenario available.
        </Typography>
      </Box>
    );
  }

  // ── render ─────────────────────────────────────────────────────
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 650,
        mx: 'auto',
        p: {xs: 2, sm: 3},
        ...kidsAnimations.fadeInUp,
      }}
    >
      {/* Progress */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <ProgressStars
          current={score}
          total={totalGood}
          streak={streak}
          totalQuestions={totalGood}
          answeredCount={goodChosen}
        />
        {money !== null && (
          <Typography
            variant="caption"
            sx={{color: kidsColors.yellow, fontWeight: 700}}
          >
            Budget: ${money}
          </Typography>
        )}
      </Box>

      {/* Scenario description card */}
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
        }}
      >
        {scenario.concept && (
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
            {scenario.concept}
          </Typography>
        )}
        <Typography
          variant="h6"
          sx={{
            color: kidsColors.textPrimary,
            fontWeight: 700,
            mb: 1,
            lineHeight: 1.4,
          }}
        >
          {scenario.title}
        </Typography>
        {scenario.description && (
          <Typography
            variant="body2"
            sx={{color: kidsColors.textSecondary, mb: 1.5, lineHeight: 1.6}}
          >
            {scenario.description}
          </Typography>
        )}
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 0.8,
            borderRadius: '10px',
            background: `${kidsColors.primary}12`,
            border: `1px solid ${kidsColors.primary}30`,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: kidsColors.primary,
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            Goal: {scenario.goal || 'Choose the best items!'}
          </Typography>
        </Box>
      </Card>

      {/* Item grid */}
      <Box
        role="grid"
        aria-label="Scenario items"
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            sm: items.length <= 4 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
          },
          gap: 1.5,
          mb: 3,
        }}
      >
        {items.map((item, idx) => {
          const color = CARD_COLORS[idx % CARD_COLORS.length];
          const isChosen = chosenIds.has(idx);
          const canAfford =
            money === null || !item.price || money >= item.price;

          return (
            <Grow in key={idx} timeout={300 + idx * 80}>
              <Card
                elevation={0}
                role="gridcell"
                aria-label={item.name}
                tabIndex={0}
                onClick={() => handleChooseItem(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleChooseItem(idx);
                  }
                }}
                sx={{
                  background: isChosen
                    ? item.isGood
                      ? `${kidsColors.correct}20`
                      : `${kidsColors.incorrect}20`
                    : `${color}25`,
                  border: `2px solid ${
                    isChosen
                      ? item.isGood
                        ? kidsColors.correct
                        : kidsColors.incorrect
                      : `${color}70`
                  }`,
                  borderRadius: '16px',
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.8,
                  cursor:
                    isChosen || completed
                      ? 'default'
                      : canAfford
                        ? 'pointer'
                        : 'not-allowed',
                  opacity: isChosen ? 0.65 : canAfford ? 1 : 0.5,
                  transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                  boxShadow: isChosen
                    ? item.isGood
                      ? kidsColors.glowCorrect
                      : kidsColors.glowIncorrect
                    : 'none',
                  animation: isChosen
                    ? item.isGood
                      ? 'goodPop 0.5s ease-out'
                      : 'badShake 0.4s ease-in-out'
                    : 'none',
                  '@keyframes goodPop': {
                    '0%': {transform: 'scale(1)'},
                    '50%': {transform: 'scale(1.08)'},
                    '100%': {transform: 'scale(1)'},
                  },
                  '@keyframes badShake': {
                    '0%, 100%': {transform: 'translateX(0)'},
                    '20%': {transform: 'translateX(-4px)'},
                    '40%': {transform: 'translateX(4px)'},
                    '60%': {transform: 'translateX(-3px)'},
                    '80%': {transform: 'translateX(3px)'},
                  },
                  '&:hover':
                    isChosen || completed
                      ? {}
                      : {
                          background: `${color}40`,
                          borderColor: color,
                          transform: 'translateY(-3px) scale(1.02)',
                          boxShadow: `0 6px 20px ${color}30`,
                        },
                }}
              >
                {/* Icon */}
                {item.icon && (
                  <Typography sx={{fontSize: '2rem', lineHeight: 1}}>
                    {item.icon}
                  </Typography>
                )}

                {/* Name */}
                <Typography
                  sx={{
                    fontWeight: 700,
                    fontSize: {xs: '1rem', sm: '1.1rem'},
                    color: isChosen
                      ? item.isGood
                        ? kidsColors.correct
                        : kidsColors.incorrect
                      : kidsColors.textPrimary,
                    textAlign: 'center',
                    lineHeight: 1.3,
                    transition: 'color 0.3s ease',
                  }}
                >
                  {item.name}
                </Typography>

                {/* Price */}
                {item.price !== undefined && item.price !== null && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: kidsColors.textMuted,
                      fontWeight: 600,
                    }}
                  >
                    ${item.price}
                  </Typography>
                )}

                {/* Chosen indicator */}
                {isChosen && (
                  <Box
                    sx={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: item.isGood
                        ? kidsColors.correct
                        : kidsColors.incorrect,
                      color: '#fff',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      mt: 0.3,
                    }}
                  >
                    {item.isGood ? '\u2713' : '\u2717'}
                  </Box>
                )}
              </Card>
            </Grow>
          );
        })}
      </Box>

      {/* Feedback toast */}
      <Fade in={feedbackToast !== null} timeout={250}>
        <Box
          sx={{
            position: 'fixed',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            px: 3,
            py: 1.5,
            borderRadius: '16px',
            background: feedbackToast?.isGood
              ? kidsColors.correct
              : kidsColors.incorrect,
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.95rem',
            boxShadow: feedbackToast?.isGood
              ? `0 6px 24px ${kidsColors.correct}50`
              : `0 6px 24px ${kidsColors.incorrect}50`,
            zIndex: 1000,
            maxWidth: '85vw',
            textAlign: 'center',
            animation: feedbackToast ? 'toastSlideUp 0.3s ease-out' : 'none',
            '@keyframes toastSlideUp': {
              '0%': {
                opacity: 0,
                transform: 'translateX(-50%) translateY(20px)',
              },
              '100%': {opacity: 1, transform: 'translateX(-50%) translateY(0)'},
            },
          }}
        >
          {feedbackToast?.text}
        </Box>
      </Fade>

      {/* Celebration overlay */}
      <InlineCelebration type={celebType} gameTemplate="simulation" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />
    </Box>
  );
}
