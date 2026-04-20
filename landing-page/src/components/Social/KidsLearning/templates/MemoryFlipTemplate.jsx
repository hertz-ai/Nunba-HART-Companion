/**
 * MemoryFlipTemplate - Dynamic Liquid Agentic UI
 *
 * Grid of face-down cards to flip and find matching pairs.
 * CSS 3D flip animation, match counter, timer.
 *
 * Props:
 *   config     - { content: { questions: [{
 *                   cards: [{ id, label, emoji? }],  // even count, each id appears exactly twice
 *                   gridCols?: number,               // optional, auto-calculated if omitted
 *                   concept?: string
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

import {Box, Typography, Card, Fade, Grow} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';

const FLIP_DURATION = 500; // ms
const MISMATCH_DELAY = 900;
const CARD_BACK_COLORS = [
  kidsColors.primary,
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.secondary,
  kidsColors.purple,
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

// Convert flat pairs [{id, front, match}] to memory cards [{id, label}] (duplicated for matching)
function pairsToCards(pairs) {
  const cards = [];
  pairs.forEach((p) => {
    const id = p.id || p.front || p.left;
    cards.push({id, label: p.front || p.left || '', emoji: p.emoji});
    cards.push({id, label: p.match || p.right || '', emoji: p.matchEmoji});
  });
  return cards;
}

export default function MemoryFlipTemplate({config, onAnswer, onComplete}) {
  // Normalize: accept content.questions[].cards AND flat content.pairs[]
  const questions = useMemo(() => {
    const raw = config?.content?.questions;
    if (Array.isArray(raw) && raw.length > 0) return raw;
    // Flat pairs[] → convert to memory card format
    const flatPairs = config?.content?.pairs;
    if (Array.isArray(flatPairs) && flatPairs.length > 0) {
      return [
        {
          cards: pairsToCards(flatPairs),
          concept: flatPairs[0]?.concept || 'memory',
        },
      ];
    }
    return [];
  }, [config]);
  const total = questions.length;

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

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  // Per-round state
  const [flippedIndices, setFlippedIndices] = useState([]); // currently revealed (max 2)
  const [matchedIds, setMatchedIds] = useState(new Set());
  const [moves, setMoves] = useState(0);
  const [timer, setTimer] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [visible, setVisible] = useState(true);
  const [imageMap, setImageMap] = useState({});
  const [lives, setLives] = useState(3);
  const [charState, setCharState] = useState('idle');
  const [showVisualHint, setShowVisualHint] = useState(true);

  const timerRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const hasSpokenIntro = useRef(false);

  const q = questions[currentIndex] ?? {cards: []};
  const rawCards = q.cards ?? [];

  // Shuffle cards once per question
  const shuffledCards = useMemo(
    () => shuffle(rawCards),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentIndex, rawCards.length]
  );

  const totalPairs = shuffledCards.length / 2;

  // Auto-calculate grid columns
  const gridCols =
    q.gridCols ??
    (shuffledCards.length <= 8 ? 4 : shuffledCards.length <= 12 ? 4 : 5);

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

  // Timer
  useEffect(() => {
    startTimeRef.current = Date.now();
    setTimer(0);
    setFlippedIndices([]);
    setMatchedIds(new Set());
    setMoves(0);
    setIsLocked(false);
    setVisible(true);

    timerRef.current = setInterval(() => {
      setTimer((t) => t + 1);
    }, 1000);

    // TTS: auto-read instruction
    const concept = questions[currentIndex]?.concept;
    const text = concept
      ? `Find the matching pairs: ${concept}`
      : 'Flip cards to find matching pairs';
    try {
      GameSounds.speakText(text);
    } catch (err) {
      logger.error(err); /* Game asset load — non-critical */
    }

    return () => clearInterval(timerRef.current);
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

  // Stop timer when all matched
  useEffect(() => {
    if (matchedIds.size === totalPairs && totalPairs > 0) {
      clearInterval(timerRef.current);
    }
  }, [matchedIds, totalPairs]);

  // ── handle card click ────────────────────────────────────────
  const handleCardClick = useCallback(
    (cardIdx) => {
      if (isLocked) return;
      if (flippedIndices.includes(cardIdx)) return;
      if (matchedIds.has(shuffledCards[cardIdx]?.id)) return;

      try {
        GameSounds.cardFlip();
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
      const newFlipped = [...flippedIndices, cardIdx];
      setFlippedIndices(newFlipped);

      if (newFlipped.length === 2) {
        setMoves((m) => m + 1);
        setIsLocked(true);

        const card1 = shuffledCards[newFlipped[0]];
        const card2 = shuffledCards[newFlipped[1]];
        const isMatch = card1.id === card2.id;
        const elapsed = Date.now() - startTimeRef.current;
        const concept = q.concept ?? '';

        try {
          if (isMatch) {
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
          }
        } catch (err) {
          logger.error(err); /* Game asset load — non-critical */
        }

        if (isMatch) {
          setCharState('celebrate');
          setTimeout(() => setCharState('idle'), 1500);
          triggerCorrect();
          const newMatchedIds = new Set(matchedIds);
          newMatchedIds.add(card1.id);
          setMatchedIds(newMatchedIds);

          const newStreak = streak + 1;
          setStreak(newStreak);
          setBestStreak((b) => Math.max(b, newStreak));

          if (newStreak === 3 || newStreak === 5 || newStreak === 10) {
            try {
              GameCommentary.speakStreak(newStreak);
            } catch (err) {
              logger.error(err); /* Game asset load — non-critical */
            }
            triggerStreak(newStreak);
          }

          if (onAnswer) onAnswer(true, concept, elapsed);

          setTimeout(() => {
            setFlippedIndices([]);
            setIsLocked(false);

            // Check completion
            if (newMatchedIds.size === totalPairs) {
              const roundScore = totalPairs;
              const newScore = score + roundScore;
              setScore(newScore);

              const result = {
                questionIndex: currentIndex,
                pairsFound: totalPairs,
                moves: moves + 1,
                timeSeconds: timer,
                concept,
                isCorrect: true,
                responseTimeMs: elapsed,
              };
              const newResults = [...results, result];
              setResults(newResults);

              setTimeout(() => {
                setVisible(false);
                setTimeout(() => {
                  if (currentIndex + 1 < total) {
                    setCurrentIndex((i) => i + 1);
                  } else {
                    try {
                      GameCommentary.speakComplete(
                        newScore,
                        questions.reduce(
                          (s, qq) => s + (qq.cards?.length ?? 0) / 2,
                          0
                        )
                      );
                    } catch (err) {
                      logger.error(err); /* Game asset load — non-critical */
                    }
                    triggerComplete(
                      newScore,
                      questions.reduce(
                        (s, qq) => s + (qq.cards?.length ?? 0) / 2,
                        0
                      )
                    );
                    if (onComplete) {
                      onComplete({
                        score: newScore,
                        correct: newScore,
                        total: questions.reduce(
                          (s, qq) => s + (qq.cards?.length ?? 0) / 2,
                          0
                        ),
                        results: newResults,
                        bestStreak: Math.max(bestStreak, newStreak),
                      });
                    }
                  }
                }, 250);
              }, 600);
            }
          }, 400);
        } else {
          setCharState('encourage');
          setTimeout(() => setCharState('idle'), 1500);
          setStreak(0);
          if (onAnswer) onAnswer(false, concept, elapsed);

          setTimeout(() => {
            setFlippedIndices([]);
            setIsLocked(false);
          }, MISMATCH_DELAY);
        }
      }
    },
    [
      isLocked,
      flippedIndices,
      matchedIds,
      shuffledCards,
      streak,
      bestStreak,
      score,
      results,
      currentIndex,
      total,
      totalPairs,
      moves,
      timer,
      questions,
      q.concept,
      onAnswer,
      onComplete,
      triggerCorrect,
      triggerStreak,
      triggerComplete,
    ]
  );

  // ── guard ────────────────────────────────────────────────────
  if (!questions.length || !shuffledCards.length) {
    return (
      <Box sx={{p: 4, textAlign: 'center'}}>
        <Typography color={kidsColors.textSecondary}>
          No cards available.
        </Typography>
      </Box>
    );
  }

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = (matchedIds.size / totalPairs) * 100;
  const allMatched = matchedIds.size === totalPairs;

  // ── render ───────────────────────────────────────────────────
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: {xs: '100%', sm: 600},
        mx: 'auto',
        p: {xs: 2, sm: 3},
        ...kidsAnimations.fadeInUp,
      }}
    >
      <GameLivesBar
        lives={lives}
        score={matchedIds.size}
        currentLevel={currentIndex + 1}
        totalLevels={total}
        streak={streak}
      />
      <Box
        sx={{display: 'flex', justifyContent: 'space-between', mb: 1.5, px: 1}}
      >
        <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
          <Box component="span" sx={{fontSize: '1.2rem'}}>
            🧩
          </Box>
          <Typography
            variant="body2"
            sx={{color: kidsColors.textSecondary, fontWeight: 600}}
          >
            {moves}
          </Typography>
        </Box>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
          <Box component="span" sx={{fontSize: '1.2rem'}}>
            ⏱️
          </Box>
          <Typography
            variant="body2"
            sx={{color: kidsColors.textSecondary, fontWeight: 600}}
          >
            {formatTime(timer)}
          </Typography>
        </Box>
      </Box>
      <Box sx={{position: 'relative'}}>
        <Box sx={{position: 'absolute', top: -10, right: 0, zIndex: 10}}>
          <KidsCharacter
            seed={`memory-${currentIndex}`}
            state={charState}
            size={68}
          />
        </Box>
      </Box>
      <VisualHint
        type="flip"
        visible={showVisualHint && currentIndex === 0}
        onDismiss={() => setShowVisualHint(false)}
      />

      {q.concept && (
        <Typography
          variant="overline"
          sx={{
            color: kidsColors.primaryLight,
            letterSpacing: 1.5,
            fontSize: '0.9rem',
            mb: 1.5,
            display: 'block',
            textAlign: 'center',
          }}
        >
          {q.concept}
        </Typography>
      )}

      {/* Card grid */}
      <Box
        sx={{
          border: `3px dashed ${kidsColors.primaryLight}40`,
          borderRadius: '20px',
          p: 1.5,
        }}
      >
        <Box
          role="grid"
          aria-label="Memory cards"
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gap: {xs: 1, sm: 1.5},
            perspective: '1000px',
            mb: 3,
          }}
        >
          {shuffledCards.map((card, idx) => {
            const isFlipped = flippedIndices.includes(idx);
            const isMatched = matchedIds.has(card.id);
            const showFace = isFlipped || isMatched;
            const cardColorIdx = typeof card.id === 'number' ? card.id : idx;
            const cardColor =
              CARD_BACK_COLORS[cardColorIdx % CARD_BACK_COLORS.length];

            return (
              <Grow in={visible} key={idx} timeout={200 + idx * 50}>
                <Box
                  role="gridcell"
                  aria-label={
                    showFace ? `Card: ${card.label}` : `Hidden card ${idx + 1}`
                  }
                  tabIndex={0}
                  onClick={() => handleCardClick(idx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCardClick(idx);
                    }
                  }}
                  sx={{
                    position: 'relative',
                    width: '100%',
                    paddingTop: '100%', // square
                    cursor: showFace && !isFlipped ? 'default' : 'pointer',
                    transformStyle: 'preserve-3d',
                    transition: `transform ${FLIP_DURATION}ms cubic-bezier(0.4,0,0.2,1)`,
                    transform: showFace ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  }}
                >
                  {/* Card back */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      backfaceVisibility: 'hidden',
                      borderRadius: '14px',
                      background: `linear-gradient(135deg, ${cardColor}40 0%, ${cardColor}20 50%, ${cardColor}40 100%)`,
                      border: `2px solid ${cardColor}50`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'box-shadow 0.3s ease',
                      '&:hover': {
                        boxShadow: `0 0 16px ${cardColor}50`,
                        border: `2px solid ${cardColor}80`,
                      },
                    }}
                  >
                    <Box sx={{textAlign: 'center'}}>
                      <Box sx={{fontSize: '1.2rem', opacity: 0.4, mb: 0.3}}>
                        ✨
                      </Box>
                      <Typography
                        sx={{
                          fontSize: {xs: '1.5rem', sm: '2rem'},
                          opacity: 0.5,
                          color: cardColor,
                        }}
                      >
                        ?
                      </Typography>
                    </Box>
                  </Box>

                  {/* Card face */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      backfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                      borderRadius: '14px',
                      background: isMatched
                        ? `${cardColor}25`
                        : `linear-gradient(135deg, ${cardColor}30 0%, ${cardColor}15 100%)`,
                      border: `2px solid ${isMatched ? cardColor : `${cardColor}60`}`,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: isMatched ? `0 0 16px ${cardColor}40` : 'none',
                      p: 0.5,
                      ...(isMatched && {
                        animation: 'sparkle 1s ease-out',
                        '@keyframes sparkle': {
                          '0%': {boxShadow: `0 0 0px ${cardColor}00`},
                          '50%': {boxShadow: `0 0 24px ${cardColor}80`},
                          '100%': {boxShadow: `0 0 16px ${cardColor}40`},
                        },
                      }),
                    }}
                  >
                    <Box
                      sx={{display: 'flex', justifyContent: 'center', mb: 0.3}}
                    >
                      <GameItemImage
                        blobUrl={imageMap['c' + currentIndex + '_' + idx]}
                        emoji={
                          card.emoji || getEmojiForText(card.label) || '❓'
                        }
                        size={56}
                      />
                    </Box>
                    <Typography
                      sx={{
                        color: kidsColors.textPrimary,
                        fontWeight: 700,
                        fontSize: {xs: '0.9rem', sm: '1.1rem'},
                        textAlign: 'center',
                        lineHeight: 1.2,
                        mt: 0.3,
                      }}
                    >
                      {card.label}
                    </Typography>
                  </Box>
                </Box>
              </Grow>
            );
          })}
        </Box>
      </Box>

      {/* Completion celebration */}
      {allMatched && (
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
              All pairs found!
            </Typography>
            <Typography variant="body2" sx={{color: kidsColors.textSecondary}}>
              {moves} moves in {formatTime(timer)}
            </Typography>
          </Box>
        </Fade>
      )}

      <InlineCelebration type={celebType} gameTemplate="memory_flip" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />
    </Box>
  );
}
