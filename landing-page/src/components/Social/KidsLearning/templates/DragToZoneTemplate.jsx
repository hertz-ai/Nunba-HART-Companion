/**
 * DragToZoneTemplate - Dynamic Liquid Agentic UI
 *
 * Drag-and-drop sorting into colored zones. Items are shown as colorful cards
 * and zones as large drop areas with glowing borders. Visual feedback on drag,
 * drop, correct/incorrect placement.
 *
 * Props:
 *   config     - { content: { zones: [{ id, label, color }], items: [{ id, label, zone, concept }] } }
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import {logger} from '../../../../utils/logger';
import {kidsColors, kidsAnimations} from '../kidsTheme';
import {getEmojiForText} from '../shared/emojiMap';
import GameLivesBar from '../shared/GameLivesBar';
import InlineCelebration from '../shared/InlineCelebration';
import KidsCharacter from '../shared/KidsCharacter';
import {GameSounds, GameCommentary} from '../shared/SoundManager';
import useCelebration from '../shared/useCelebration';
import VisualHint from '../shared/VisualHint';

import {Box, Typography, Card, Fade, Grow} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';

// Shuffle helper
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ITEM_COLORS = [
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.purple,
  kidsColors.teal,
  kidsColors.secondary,
];

export default function DragToZoneTemplate({config, onAnswer, onComplete}) {
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

  const zones = config?.content?.zones ?? [];
  const rawItems = config?.content?.items ?? [];
  const total = rawItems.length;

  const [items, setItems] = useState([]);
  const [placedItems, setPlacedItems] = useState({}); // { zoneId: [itemId, ...] }
  const [draggingId, setDraggingId] = useState(null);
  const [hoveredZone, setHoveredZone] = useState(null);
  const [feedbackItem, setFeedbackItem] = useState(null); // { id, correct }
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [lives, setLives] = useState(3);
  const [charState, setCharState] = useState('idle');
  const [showVisualHint, setShowVisualHint] = useState(true);

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

  // Use a content-based key so the reset triggers on any config change,
  // not just when the number of items changes.
  const configKey = useMemo(
    () => JSON.stringify(config?.content),
    [config?.content]
  );

  // Initialize shuffled items
  useEffect(() => {
    setItems(shuffle(rawItems));
    setPlacedItems({});
    setScore(0);
    setResults([]);
    setStreak(0);
    setBestStreak(0);
    setCompleted(false);
    setSelectedItemId(null);
    startTimeRef.current = Date.now();
    // TTS: auto-read instruction
    const text = 'Drag each item to the correct zone';
    try {
      GameSounds.speakText(text);
    } catch (err) {
      logger.error(err); /* Game asset load — non-critical */
    }
  }, [configKey]);

  const remainingItems = items.filter(
    (item) => !Object.values(placedItems).flat().includes(item.id)
  );

  const progress =
    total > 0 ? ((total - remainingItems.length) / total) * 100 : 0;

  // ── drag handlers ──────────────────────────────────────────────
  const handleDragStart = useCallback((e, itemId) => {
    try {
      GameSounds.drag();
    } catch (err) {
      logger.error(err); /* Game asset load — non-critical */
    }
    setDraggingId(itemId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId);
  }, []);

  const handleDragOver = useCallback((e, zoneId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setHoveredZone(zoneId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setHoveredZone(null);
  }, []);

  const handleDrop = useCallback(
    (e, zoneId) => {
      e.preventDefault();
      setHoveredZone(null);
      setDraggingId(null);

      const itemId = e.dataTransfer.getData('text/plain');
      const item = rawItems.find((i) => String(i.id) === String(itemId));
      if (!item) return;

      // Prevent placing an item that's already in any zone
      const alreadyPlaced = Object.values(placedItems).flat().includes(item.id);
      if (alreadyPlaced) return;

      const elapsed = Date.now() - startTimeRef.current;
      const isCorrect = String(item.zone) === String(zoneId);

      // Place item in zone
      const newPlaced = {...placedItems};
      if (!newPlaced[zoneId]) newPlaced[zoneId] = [];
      newPlaced[zoneId] = [...newPlaced[zoneId], item.id];
      setPlacedItems(newPlaced);

      // Feedback flash
      setFeedbackItem({id: item.id, correct: isCorrect});
      setTimeout(() => setFeedbackItem(null), 900);

      try {
        GameSounds.drop();
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
      try {
        if (isCorrect) {
          GameSounds.correct();
        } else {
          GameSounds.wrong();
        }
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }

      if (isCorrect) {
        triggerCorrect();
        setCharState('celebrate');
        setTimeout(() => setCharState('idle'), 1500);
        setTimeout(() => {
          try {
            GameCommentary.speakPraise();
          } catch (err) {
            logger.error(err); /* Game asset load — non-critical */
          }
        }, 400);
      } else {
        setLives((l) => Math.max(0, l - 1));
        setCharState('encourage');
        setTimeout(() => setCharState('idle'), 1500);
        setTimeout(() => {
          try {
            GameCommentary.speakEncourage();
          } catch (err) {
            logger.error(err); /* Game asset load — non-critical */
          }
        }, 400);
      }

      const newScore = isCorrect ? score + 1 : score;
      const newStreak = isCorrect ? streak + 1 : 0;
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
        itemId: item.id,
        itemLabel: item.label,
        placedZone: zoneId,
        correctZone: item.zone,
        isCorrect,
        concept: item.concept ?? '',
        responseTimeMs: elapsed,
      };
      const newResults = [...results, result];
      setResults(newResults);

      if (onAnswer) onAnswer(isCorrect, item.concept ?? '', elapsed);

      // Check completion
      const totalPlaced = Object.values(newPlaced).flat().length;
      if (totalPlaced >= total) {
        setCompleted(true);
        try {
          GameCommentary.speakComplete(newScore, total);
        } catch (err) {
          logger.error(err); /* Game asset load — non-critical */
        }
        triggerComplete(newScore, total);
        setTimeout(() => {
          if (onComplete) {
            onComplete({
              score: newScore,
              correct: newScore,
              total,
              results: newResults,
              bestStreak: newBest,
            });
          }
        }, 1200);
      }
    },
    [
      placedItems,
      rawItems,
      score,
      streak,
      bestStreak,
      results,
      total,
      onAnswer,
      onComplete,
      triggerCorrect,
      triggerStreak,
      triggerComplete,
    ]
  );

  // ── touch support: tap to select, then tap zone ────────────────
  const handleItemTap = useCallback((itemId) => {
    try {
      GameSounds.tap();
    } catch (err) {
      logger.error(err); /* Game asset load — non-critical */
    }
    setSelectedItemId((prev) => (prev === itemId ? null : itemId));
  }, []);

  const handleZoneTap = useCallback(
    (zoneId) => {
      if (!selectedItemId) return;
      // Simulate drop
      const fakeEvent = {
        preventDefault: () => {},
        dataTransfer: {getData: () => String(selectedItemId)},
      };
      handleDrop(fakeEvent, zoneId);
      setSelectedItemId(null);
    },
    [selectedItemId, handleDrop]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setHoveredZone(null);
  }, []);

  // ── guard ──────────────────────────────────────────────────────
  if (!zones.length || !rawItems.length) {
    return (
      <Box sx={{p: 4, textAlign: 'center'}}>
        <Typography color={kidsColors.textSecondary}>
          No sorting activity available.
        </Typography>
      </Box>
    );
  }

  // ── render ─────────────────────────────────────────────────────
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: {xs: '100%', sm: 700},
        mx: 'auto',
        p: {xs: 2, sm: 3},
        ...kidsAnimations.fadeInUp,
      }}
    >
      <GameLivesBar
        lives={lives}
        score={score}
        currentLevel={total - remainingItems.length + 1}
        totalLevels={total}
        streak={streak}
      />
      <Box sx={{position: 'relative'}}>
        <Box sx={{position: 'absolute', top: -10, right: 0, zIndex: 10}}>
          <KidsCharacter seed="drag-zone" state={charState} size={68} />
        </Box>
      </Box>
      <VisualHint
        type="drag"
        visible={showVisualHint}
        onDismiss={() => setShowVisualHint(false)}
      />

      {/* Draggable items */}
      <Box
        role="group"
        aria-label="Draggable items"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          justifyContent: 'center',
          mb: 3,
          minHeight: 60,
        }}
      >
        {remainingItems.map((item, idx) => {
          const color = ITEM_COLORS[idx % ITEM_COLORS.length];
          const isDragging = draggingId === String(item.id);
          const isSelected = selectedItemId === item.id;

          return (
            <Grow in key={item.id} timeout={300 + idx * 80}>
              <Box
                draggable
                aria-label={`Item: ${item.label}`}
                tabIndex={0}
                onDragStart={(e) => handleDragStart(e, String(item.id))}
                onDragEnd={handleDragEnd}
                onClick={() => handleItemTap(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleItemTap(item.id);
                  }
                }}
                sx={{
                  px: 4,
                  py: 2.5,
                  borderRadius: '18px',
                  fontWeight: 700,
                  fontSize: {xs: '1rem', sm: '1.1rem'},
                  color: kidsColors.textPrimary,
                  background: `${color}25`,
                  border: `2px solid ${isSelected ? color : `${color}80`}`,
                  minHeight: 48,
                  cursor: 'grab',
                  userSelect: 'none',
                  transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                  transform: isDragging
                    ? 'scale(1.1) rotate(2deg)'
                    : isSelected
                      ? 'scale(1.06)'
                      : 'scale(1)',
                  opacity: isDragging ? 0.6 : 1,
                  boxShadow: isSelected
                    ? `0 4px 16px ${color}40`
                    : `0 2px 8px ${color}20`,
                  '&:hover': {
                    background: `${color}40`,
                    borderColor: color,
                    transform: 'scale(1.06)',
                    boxShadow: `0 6px 20px ${color}33`,
                  },
                  '&:active': {
                    cursor: 'grabbing',
                  },
                }}
              >
                <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                  <Box sx={{fontSize: '1.8rem'}}>
                    {getEmojiForText(item.label) || '📦'}
                  </Box>
                  <Typography
                    sx={{
                      fontWeight: 700,
                      fontSize: {xs: '1rem', sm: '1.1rem'},
                      color: kidsColors.textPrimary,
                    }}
                  >
                    {item.label}
                  </Typography>
                </Box>
              </Box>
            </Grow>
          );
        })}
        {remainingItems.length === 0 && !completed && (
          <Typography
            variant="body2"
            sx={{color: kidsColors.textMuted, fontStyle: 'italic'}}
          >
            All items sorted!
          </Typography>
        )}
      </Box>

      {/* Drop zones */}
      <Box
        role="group"
        aria-label="Drop zones"
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm:
              zones.length <= 2
                ? 'repeat(2, 1fr)'
                : `repeat(${Math.min(zones.length, 3)}, 1fr)`,
          },
          gap: 2,
          mb: 3,
        }}
      >
        {zones.map((zone) => {
          const zoneColor = zone.color || kidsColors.primary;
          const isHovered = hoveredZone === zone.id;
          const zoneItems = (placedItems[zone.id] || [])
            .map((id) => rawItems.find((i) => i.id === id))
            .filter(Boolean);

          return (
            <Card
              key={zone.id}
              elevation={0}
              aria-label={`Drop zone: ${zone.label}`}
              tabIndex={0}
              onDragOver={(e) => handleDragOver(e, zone.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, zone.id)}
              onClick={() => handleZoneTap(zone.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleZoneTap(zone.id);
                }
              }}
              sx={{
                background: kidsColors.cardBg,
                backdropFilter: 'blur(16px)',
                border: `2.5px dashed ${isHovered ? zoneColor : `${zoneColor}50`}`,
                borderRadius: '20px',
                boxShadow: isHovered
                  ? `0 0 24px ${zoneColor}40`
                  : kidsColors.shadowCard,
                p: 2,
                minHeight: 120,
                transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                transform: isHovered ? 'scale(1.03)' : 'scale(1)',
                cursor: selectedItemId ? 'pointer' : 'default',
              }}
            >
              {/* Zone header */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 1.5,
                  pb: 1,
                  borderBottom: `1px solid ${zoneColor}30`,
                }}
              >
                <Box sx={{fontSize: '1.8rem', mr: 1}}>
                  {getEmojiForText(zone.label) || '📁'}
                </Box>
                <Typography
                  sx={{
                    fontWeight: 700,
                    fontSize: '1rem',
                    color: kidsColors.textPrimary,
                  }}
                >
                  {zone.label}
                </Typography>
              </Box>

              {/* Placed items */}
              <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 1}}>
                {zoneItems.map((item) => {
                  const isCorrect = String(item.zone) === String(zone.id);
                  const isFeedback =
                    feedbackItem && feedbackItem.id === item.id;

                  return (
                    <Fade in key={item.id} timeout={400}>
                      <Box
                        sx={{
                          px: 1.5,
                          py: 0.8,
                          borderRadius: '10px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          background: isCorrect
                            ? kidsColors.correctBg
                            : kidsColors.incorrectBg,
                          border: `1.5px solid ${isCorrect ? kidsColors.correct : kidsColors.incorrect}`,
                          color: isCorrect
                            ? kidsColors.correct
                            : kidsColors.incorrect,
                          boxShadow: isFeedback
                            ? isCorrect
                              ? kidsColors.glowCorrect
                              : kidsColors.glowIncorrect
                            : 'none',
                          animation: isFeedback
                            ? isCorrect
                              ? 'dropPop 0.5s ease-out'
                              : 'shake 0.4s ease-in-out'
                            : 'none',
                          '@keyframes dropPop': {
                            '0%': {transform: 'scale(1.3)'},
                            '50%': {transform: 'scale(0.9)'},
                            '100%': {transform: 'scale(1)'},
                          },
                          '@keyframes shake': {
                            '0%, 100%': {transform: 'translateX(0)'},
                            '20%': {transform: 'translateX(-5px)'},
                            '40%': {transform: 'translateX(5px)'},
                            '60%': {transform: 'translateX(-3px)'},
                            '80%': {transform: 'translateX(3px)'},
                          },
                          transition: 'all 0.3s ease',
                        }}
                      >
                        {item.label}
                      </Box>
                    </Fade>
                  );
                })}
                {zoneItems.length === 0 && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: kidsColors.textMuted,
                      fontStyle: 'italic',
                      py: 1,
                      width: '100%',
                      textAlign: 'center',
                    }}
                  >
                    Drop items here
                  </Typography>
                )}
              </Box>
            </Card>
          );
        })}
      </Box>

      {/* Completion celebration */}
      {completed && (
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
              All sorted!
            </Typography>
            <Typography variant="body2" sx={{color: kidsColors.textSecondary}}>
              {score} out of {total} correct
            </Typography>
          </Box>
        </Fade>
      )}

      {/* Streak indicator */}
      {streak >= 2 && !completed && (
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

      <InlineCelebration type={celebType} gameTemplate="drag_to_zone" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />
    </Box>
  );
}
