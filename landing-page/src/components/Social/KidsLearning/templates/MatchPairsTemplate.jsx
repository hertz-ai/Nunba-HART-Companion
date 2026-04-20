/**
 * MatchPairsTemplate - Dynamic Liquid Agentic UI
 *
 * Two columns of items to match. Click-to-select matching with
 * SVG connection lines, animated feedback for correct/incorrect pairs.
 *
 * Props:
 *   config     - { content: { questions: [{
 *                   pairs: [{ left: string, right: string }],
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

import {Box, Typography, Button, Card, Fade, Grow} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';

const PAIR_COLORS = [
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.secondary,
  kidsColors.purple,
  kidsColors.yellow,
  kidsColors.correct,
  kidsColors.primaryLight,
];

// Fisher-Yates shuffle
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MatchPairsTemplate({config, onAnswer, onComplete}) {
  // Normalize: accept both content.questions[].pairs AND flat content.pairs[]
  const questions = useMemo(() => {
    const raw = config?.content?.questions;
    if (Array.isArray(raw) && raw.length > 0) return raw;
    // Flat pairs[] → wrap in single question object
    const flatPairs = config?.content?.pairs;
    if (Array.isArray(flatPairs) && flatPairs.length > 0) {
      return [{pairs: flatPairs, concept: flatPairs[0]?.concept || 'match'}];
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
  const [selectedLeft, setSelectedLeft] = useState(null);
  const [selectedRight, setSelectedRight] = useState(null);
  const [matchedPairs, setMatchedPairs] = useState([]); // [{leftIdx, rightIdx, color}]
  const [wrongFlash, setWrongFlash] = useState(null); // {leftIdx, rightIdx}
  const [visible, setVisible] = useState(true);
  const [roundScore, setRoundScore] = useState(0);
  const [imageMap, setImageMap] = useState({});
  const [lives, setLives] = useState(3);
  const [charState, setCharState] = useState('idle');
  const [showVisualHint, setShowVisualHint] = useState(true);

  const startTimeRef = useRef(Date.now());
  const containerRef = useRef(null);
  const leftRefs = useRef([]);
  const rightRefs = useRef([]);
  const hasSpokenIntro = useRef(false);
  const [linePositions, setLinePositions] = useState([]);

  const q = questions[currentIndex] ?? {pairs: []};
  const pairs = q.pairs ?? [];

  // Shuffle right column once per question
  const shuffledRightIndices = useMemo(
    () => shuffle(pairs.map((_, i) => i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentIndex, pairs.length]
  );

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
    setSelectedLeft(null);
    setSelectedRight(null);
    setMatchedPairs([]);
    setWrongFlash(null);
    setRoundScore(0);
    // TTS: auto-read instruction
    const concept = questions[currentIndex]?.concept;
    const text = concept
      ? `Match the pairs: ${concept}`
      : 'Tap one item on each side to match them';
    try {
      GameSounds.speakText(text);
    } catch (err) {
      logger.error(err); /* Game asset load — non-critical */
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

  // Recalculate SVG line positions when matches change
  useEffect(() => {
    const updateLines = () => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newPositions = matchedPairs
        .map((m) => {
          const leftEl = leftRefs.current[m.leftIdx];
          const rightEl = rightRefs.current[m.rightIdx];
          if (!leftEl || !rightEl) return null;
          const lr = leftEl.getBoundingClientRect();
          const rr = rightEl.getBoundingClientRect();
          return {
            x1: lr.right - containerRect.left,
            y1: lr.top + lr.height / 2 - containerRect.top,
            x2: rr.left - containerRect.left,
            y2: rr.top + rr.height / 2 - containerRect.top,
            color: m.color,
          };
        })
        .filter(Boolean);
      setLinePositions(newPositions);
    };
    updateLines();
    window.addEventListener('resize', updateLines);
    return () => window.removeEventListener('resize', updateLines);
  }, [matchedPairs]);

  // ── handle selection logic ───────────────────────────────────
  const tryMatch = useCallback(
    (leftIdx, rightIdx) => {
      const elapsed = Date.now() - startTimeRef.current;
      const leftItem = pairs[leftIdx]?.left;
      const rightItem = pairs[shuffledRightIndices[rightIdx]]?.right ?? '';
      // The correct right for leftIdx is pairs[leftIdx].right
      const correctRight = pairs[leftIdx]?.right;
      const isCorrect = rightItem === correctRight;

      const concept = q.concept ?? '';

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
        triggerCorrect();
        setCharState('celebrate');
        setTimeout(() => setCharState('idle'), 1500);
        const color = PAIR_COLORS[matchedPairs.length % PAIR_COLORS.length];
        const newMatched = [...matchedPairs, {leftIdx, rightIdx, color}];
        setMatchedPairs(newMatched);

        const newRoundScore = roundScore + 1;
        setRoundScore(newRoundScore);
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

        // Check if all pairs matched
        if (newMatched.length === pairs.length) {
          const newScore = score + newRoundScore;
          setScore(newScore);

          const result = {
            questionIndex: currentIndex,
            pairsMatched: newRoundScore,
            totalPairs: pairs.length,
            isCorrect: true,
            concept,
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
                      (sum, qq) => sum + (qq.pairs?.length ?? 0),
                      0
                    )
                  );
                } catch (err) {
                  logger.error(err); /* Game asset load — non-critical */
                }
                triggerComplete(
                  newScore,
                  questions.reduce(
                    (sum, qq) => sum + (qq.pairs?.length ?? 0),
                    0
                  )
                );
                if (onComplete) {
                  onComplete({
                    score: newScore,
                    correct: newScore,
                    total: questions.reduce(
                      (sum, qq) => sum + (qq.pairs?.length ?? 0),
                      0
                    ),
                    results: newResults,
                    bestStreak: Math.max(bestStreak, newStreak),
                  });
                }
              }
            }, 250);
          }, 800);
        }
      } else {
        setStreak(0);
        setLives((l) => Math.max(0, l - 1));
        setCharState('encourage');
        setTimeout(() => setCharState('idle'), 1500);
        setWrongFlash({leftIdx, rightIdx});
        if (onAnswer) onAnswer(false, concept, elapsed);
        setTimeout(() => setWrongFlash(null), 700);
      }

      setSelectedLeft(null);
      setSelectedRight(null);
    },
    [
      pairs,
      shuffledRightIndices,
      matchedPairs,
      roundScore,
      streak,
      bestStreak,
      score,
      results,
      currentIndex,
      total,
      questions,
      q.concept,
      onAnswer,
      onComplete,
      triggerCorrect,
      triggerStreak,
      triggerComplete,
    ]
  );

  const handleLeftClick = useCallback(
    (idx) => {
      // Ignore if already matched
      if (matchedPairs.some((m) => m.leftIdx === idx)) return;
      try {
        GameSounds.tap();
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
      setSelectedLeft(idx);
      if (selectedRight !== null) {
        tryMatch(idx, selectedRight);
      }
    },
    [matchedPairs, selectedRight, tryMatch]
  );

  const handleRightClick = useCallback(
    (idx) => {
      if (matchedPairs.some((m) => m.rightIdx === idx)) return;
      try {
        GameSounds.tap();
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
      setSelectedRight(idx);
      if (selectedLeft !== null) {
        tryMatch(selectedLeft, idx);
      }
    },
    [matchedPairs, selectedLeft, tryMatch]
  );

  // ── guard ────────────────────────────────────────────────────
  if (!questions.length || !pairs.length) {
    return (
      <Box sx={{p: 4, textAlign: 'center'}}>
        <Typography color={kidsColors.textSecondary}>
          No matching pairs available.
        </Typography>
      </Box>
    );
  }

  const progress = (currentIndex / total) * 100;

  // ── item button sx helper ────────────────────────────────────
  const itemSx = (side, idx, originalPairIdx) => {
    const isLeft = side === 'left';
    const isSelected = isLeft ? selectedLeft === idx : selectedRight === idx;
    const matched = isLeft
      ? matchedPairs.find((m) => m.leftIdx === idx)
      : matchedPairs.find((m) => m.rightIdx === idx);
    const isWrong =
      wrongFlash &&
      (isLeft ? wrongFlash.leftIdx === idx : wrongFlash.rightIdx === idx);

    const baseColor = isLeft ? kidsColors.blue : kidsColors.pink;

    const base = {
      width: '100%',
      py: {xs: 2, sm: 2.5},
      px: 2.5,
      borderRadius: '14px',
      fontWeight: 600,
      fontSize: {xs: '1rem', sm: '1.1rem'},
      textTransform: 'none',
      border: '2px solid',
      borderColor: `${baseColor}80`,
      color: kidsColors.textPrimary,
      background: `${baseColor}25`,
      minHeight: 48,
      transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      lineHeight: 1.3,
      '&:hover': {
        background: `${baseColor}40`,
        borderColor: baseColor,
        transform: 'scale(1.03)',
      },
    };

    if (matched) {
      return {
        ...base,
        borderColor: matched.color,
        background: `${matched.color}20`,
        opacity: 0.7,
        pointerEvents: 'none',
        boxShadow: `0 0 12px ${matched.color}30`,
      };
    }

    if (isWrong) {
      return {
        ...base,
        borderColor: kidsColors.incorrect,
        background: kidsColors.incorrectBg,
        animation: 'shake 0.4s ease-in-out',
        '@keyframes shake': {
          '0%, 100%': {transform: 'translateX(0)'},
          '20%': {transform: 'translateX(-5px)'},
          '40%': {transform: 'translateX(5px)'},
          '60%': {transform: 'translateX(-3px)'},
          '80%': {transform: 'translateX(3px)'},
        },
      };
    }

    if (isSelected) {
      return {
        ...base,
        borderColor: kidsColors.primary,
        background: `${kidsColors.primary}25`,
        boxShadow: kidsColors.glowPrimary,
        transform: 'scale(1.04)',
      };
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
        score={score + matchedPairs.length}
        currentLevel={currentIndex + 1}
        totalLevels={total}
        streak={streak}
      />

      {/* Animated Character */}
      <Box sx={{position: 'relative'}}>
        <Box sx={{position: 'absolute', top: -10, right: 0, zIndex: 10}}>
          <KidsCharacter
            seed={`match-${currentIndex}`}
            state={charState}
            size={68}
          />
        </Box>
      </Box>

      {/* Visual Hint on first question */}
      <VisualHint
        type="tap"
        visible={showVisualHint && currentIndex === 0}
        onDismiss={() => setShowVisualHint(false)}
      />

      {/* Concept tag */}
      {q.concept && (
        <Fade in={visible} timeout={300}>
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
        </Fade>
      )}

      {/* Matching area */}
      <Box ref={containerRef} sx={{position: 'relative', mb: 3}}>
        {/* SVG overlay for connection lines */}
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <style>{`
            @keyframes drawLine {
              from { stroke-dashoffset: 500; }
              to { stroke-dashoffset: 0; }
            }
          `}</style>
          {linePositions.map((line, i) => (
            <line
              key={i}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={line.color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray="500"
              strokeDashoffset="0"
              opacity={0.7}
              style={{animation: 'drawLine 0.5s ease-out forwards'}}
            />
          ))}
        </svg>

        {/* Two columns */}
        <Box sx={{display: 'flex', gap: {xs: 2, sm: 4}}}>
          {/* Left column */}
          <Box
            sx={{flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5}}
          >
            {pairs.map((pair, idx) => (
              <Grow in={visible} key={`l-${idx}`} timeout={300 + idx * 80}>
                <Button
                  ref={(el) => (leftRefs.current[idx] = el)}
                  variant="outlined"
                  aria-label={pair.left}
                  tabIndex={0}
                  onClick={() => handleLeftClick(idx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleLeftClick(idx);
                    }
                  }}
                  sx={itemSx('left', idx, idx)}
                >
                  <Box
                    component="span"
                    sx={{fontSize: '2rem', display: 'block', mb: 0.5}}
                  >
                    {pair.leftEmoji ? (
                      <GameItemImage
                        blobUrl={imageMap['p' + idx + 'l']}
                        emoji={pair.leftEmoji}
                        size={48}
                      />
                    ) : (
                      getEmojiForText(pair.left) || '\uD83D\uDCDD'
                    )}
                  </Box>
                  {pair.left}
                </Button>
              </Grow>
            ))}
          </Box>

          {/* Right column (shuffled) */}
          <Box
            sx={{flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5}}
          >
            {shuffledRightIndices.map((origIdx, displayIdx) => (
              <Grow
                in={visible}
                key={`r-${displayIdx}`}
                timeout={300 + displayIdx * 80}
              >
                <Button
                  ref={(el) => (rightRefs.current[displayIdx] = el)}
                  variant="outlined"
                  aria-label={pairs[origIdx].right}
                  tabIndex={0}
                  onClick={() => handleRightClick(displayIdx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRightClick(displayIdx);
                    }
                  }}
                  sx={itemSx('right', displayIdx, origIdx)}
                >
                  <Box
                    component="span"
                    sx={{fontSize: '2rem', display: 'block', mb: 0.5}}
                  >
                    {pairs[origIdx].rightEmoji ? (
                      <GameItemImage
                        blobUrl={imageMap['p' + origIdx + 'r']}
                        emoji={pairs[origIdx].rightEmoji}
                        size={48}
                      />
                    ) : (
                      getEmojiForText(pairs[origIdx].right) || '\uD83D\uDCDD'
                    )}
                  </Box>
                  {pairs[origIdx].right}
                </Button>
              </Grow>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Completion celebration */}
      {matchedPairs.length === pairs.length && (
        <Fade in timeout={400}>
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
              }}
            >
              All matched!
            </Typography>
          </Box>
        </Fade>
      )}

      <InlineCelebration type={celebType} gameTemplate="match_pairs" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />
    </Box>
  );
}
