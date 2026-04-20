/**
 * PuzzleAssembleTemplate - Dynamic Liquid Agentic UI
 *
 * Drag puzzle pieces into a grid. Pieces are shown scrambled outside the grid
 * and snap to correct positions when dropped on the right slot. Works for
 * picture puzzles, word puzzles, or any grid-based assembly.
 *
 * Props:
 *   config     - { content: { puzzles: [{
 *                   gridCols: number,
 *                   gridRows: number,
 *                   pieces: [{ id, label, row, col, color?, icon? }],
 *                   concept?: string,
 *                   title?: string
 *                 }] } }
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

const PIECE_COLORS = [
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.purple,
  kidsColors.teal,
  kidsColors.secondary,
  kidsColors.yellow,
  kidsColors.correct,
  kidsColors.primaryLight,
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

export default function PuzzleAssembleTemplate({config, onAnswer, onComplete}) {
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

  const puzzles = config?.content?.puzzles ?? [];
  const total = puzzles.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  // Per-puzzle state
  const [placedPieces, setPlacedPieces] = useState({}); // { "row-col": pieceId }
  const [draggingPiece, setDraggingPiece] = useState(null);
  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [feedbackPiece, setFeedbackPiece] = useState(null); // { id, correct }
  const [completed, setCompleted] = useState(false);
  const [visible, setVisible] = useState(true);

  // Touch selection
  const [selectedPieceId, setSelectedPieceId] = useState(null);

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

  const puzzle = puzzles[currentIndex] ?? {
    gridCols: 3,
    gridRows: 3,
    pieces: [],
  };
  const {gridCols, gridRows, pieces} = puzzle;
  const totalPieces = pieces.length;

  // Scramble pieces once per puzzle
  const scrambledPieces = useMemo(
    () => shuffle(pieces),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentIndex, pieces.length]
  );

  useEffect(() => {
    startTimeRef.current = Date.now();
    setPlacedPieces({});
    setDraggingPiece(null);
    setHoveredSlot(null);
    setFeedbackPiece(null);
    setCompleted(false);
    setVisible(true);
    setSelectedPieceId(null);
    // TTS: auto-read instruction
    const p = puzzles[currentIndex];
    const text = p?.title || 'Place each piece in the right spot';
    try {
      GameSounds.speakText(text);
    } catch (err) {
      logger.error(err); /* Game asset load — non-critical */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Remaining unplaced pieces
  const placedIds = new Set(Object.values(placedPieces));
  const remainingPieces = scrambledPieces.filter((p) => !placedIds.has(p.id));

  const progress = totalPieces > 0 ? (placedIds.size / totalPieces) * 100 : 0;

  // ── drag handlers ──────────────────────────────────────────────
  const handleDragStart = useCallback((e, pieceId) => {
    try {
      GameSounds.drag();
    } catch (err) {
      logger.error(err); /* Game asset load — non-critical */
    }
    setDraggingPiece(pieceId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(pieceId));
  }, []);

  const handleDragOver = useCallback((e, row, col) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setHoveredSlot(`${row}-${col}`);
  }, []);

  const handleDragLeave = useCallback(() => {
    setHoveredSlot(null);
  }, []);

  const handleDrop = useCallback(
    (e, row, col) => {
      e.preventDefault();
      setHoveredSlot(null);
      setDraggingPiece(null);

      const slotKey = `${row}-${col}`;
      // Don't drop on already filled slot
      if (placedPieces[slotKey] !== undefined) return;

      const pieceId = e.dataTransfer.getData('text/plain');
      const piece = pieces.find((p) => String(p.id) === pieceId);
      if (!piece) return;

      const elapsed = Date.now() - startTimeRef.current;
      const isCorrect = piece.row === row && piece.col === col;

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
        setTimeout(() => {
          try {
            GameCommentary.speakPraise();
          } catch (err) {
            logger.error(err); /* Game asset load — non-critical */
          }
        }, 400);
        // Place correctly
        const newPlaced = {...placedPieces, [slotKey]: piece.id};
        setPlacedPieces(newPlaced);

        setFeedbackPiece({id: piece.id, correct: true});
        setTimeout(() => setFeedbackPiece(null), 700);

        const newStreak = streak + 1;
        const newBest = Math.max(bestStreak, newStreak);
        const newScore = score + 1;

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

        if (onAnswer) onAnswer(true, puzzle.concept ?? '', elapsed);

        // Check puzzle completion
        const newPlacedCount = Object.keys(newPlaced).length;
        if (newPlacedCount >= totalPieces) {
          setCompleted(true);

          const result = {
            questionIndex: currentIndex,
            piecesPlaced: newPlacedCount,
            totalPieces,
            isCorrect: true,
            concept: puzzle.concept ?? '',
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
                    puzzles.reduce((s, p) => s + (p.pieces?.length ?? 0), 0)
                  );
                } catch (err) {
                  logger.error(err); /* Game asset load — non-critical */
                }
                triggerComplete(
                  newScore,
                  puzzles.reduce((s, p) => s + (p.pieces?.length ?? 0), 0)
                );
                if (onComplete) {
                  onComplete({
                    score: newScore,
                    correct: newScore,
                    total: puzzles.reduce(
                      (s, p) => s + (p.pieces?.length ?? 0),
                      0
                    ),
                    results: newResults,
                    bestStreak: newBest,
                  });
                }
              }
            }, 300);
          }, 1200);
        }
      } else {
        // Wrong slot - bounce back
        setTimeout(() => {
          try {
            GameCommentary.speakEncourage();
          } catch (err) {
            logger.error(err); /* Game asset load — non-critical */
          }
        }, 400);
        setFeedbackPiece({id: piece.id, correct: false});
        setStreak(0);
        setTimeout(() => setFeedbackPiece(null), 600);
        if (onAnswer) onAnswer(false, puzzle.concept ?? '', elapsed);
      }
    },
    [
      placedPieces,
      pieces,
      score,
      streak,
      bestStreak,
      results,
      currentIndex,
      total,
      totalPieces,
      puzzle,
      puzzles,
      onAnswer,
      onComplete,
      triggerCorrect,
      triggerStreak,
      triggerComplete,
    ]
  );

  // ── touch support: tap to select, then tap slot ────────────────
  const handlePieceTap = useCallback((pieceId) => {
    try {
      GameSounds.tap();
    } catch (err) {
      logger.error(err); /* Game asset load — non-critical */
    }
    setSelectedPieceId((prev) => (prev === pieceId ? null : pieceId));
  }, []);

  const handleSlotTap = useCallback(
    (row, col) => {
      if (!selectedPieceId) return;
      const slotKey = `${row}-${col}`;
      if (placedPieces[slotKey] !== undefined) return;

      const fakeEvent = {
        preventDefault: () => {},
        dataTransfer: {getData: () => String(selectedPieceId)},
      };
      handleDrop(fakeEvent, row, col);
      setSelectedPieceId(null);
    },
    [selectedPieceId, placedPieces, handleDrop]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingPiece(null);
    setHoveredSlot(null);
  }, []);

  // ── guard ──────────────────────────────────────────────────────
  if (!puzzles.length || !pieces.length) {
    return (
      <Box sx={{p: 4, textAlign: 'center'}}>
        <Typography color={kidsColors.textSecondary}>
          No puzzle available.
        </Typography>
      </Box>
    );
  }

  // Generate grid slots
  const gridSlots = [];
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      gridSlots.push({row: r, col: c, key: `${r}-${c}`});
    }
  }

  // ── render ─────────────────────────────────────────────────────
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 640,
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
              transition: 'transform 0.5s ease',
            },
          }}
        />
        <Box sx={{display: 'flex', justifyContent: 'space-between', mt: 0.5}}>
          <Typography variant="caption" sx={{color: kidsColors.textMuted}}>
            {placedIds.size} / {totalPieces} placed
          </Typography>
          <ProgressStars
            current={score}
            total={puzzles.reduce((s, p) => s + (p.pieces?.length ?? 0), 0)}
            streak={streak}
          />
        </Box>
      </Box>

      {/* Title / concept */}
      <Fade in={visible} timeout={350}>
        <Box sx={{textAlign: 'center', mb: 2}}>
          {puzzle.concept && (
            <Typography
              variant="overline"
              sx={{
                color: kidsColors.primaryLight,
                letterSpacing: 1.5,
                fontSize: '0.9rem',
                display: 'block',
              }}
            >
              {puzzle.concept}
            </Typography>
          )}
          <Typography
            variant="body1"
            sx={{color: kidsColors.textSecondary, fontWeight: 500}}
          >
            {puzzle.title || 'Place each piece in the right spot'}
          </Typography>
        </Box>
      </Fade>

      {/* Puzzle grid */}
      <Card
        elevation={0}
        sx={{
          background: kidsColors.cardBg,
          backdropFilter: 'blur(16px)',
          border: `1px solid ${kidsColors.cardBorder}`,
          borderRadius: '20px',
          boxShadow: kidsColors.shadowCard,
          p: 2,
          mb: 3,
        }}
      >
        <Box
          role="grid"
          aria-label="Puzzle grid"
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gap: 1,
          }}
        >
          {gridSlots.map(({row, col, key}) => {
            const isPlaced = placedPieces[key] !== undefined;
            const placedPiece = isPlaced
              ? pieces.find((p) => p.id === placedPieces[key])
              : null;
            const isHovered = hoveredSlot === key;
            const pieceColor = placedPiece
              ? placedPiece.color ||
                PIECE_COLORS[placedPiece.id % PIECE_COLORS.length]
              : kidsColors.surfaceLight;

            return (
              <Box
                key={key}
                role="gridcell"
                aria-label={
                  isPlaced
                    ? `Slot ${row + 1},${col + 1}: ${placedPiece?.label}`
                    : `Empty slot ${row + 1},${col + 1}`
                }
                tabIndex={0}
                onDragOver={(e) => handleDragOver(e, row, col)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, row, col)}
                onClick={() => handleSlotTap(row, col)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSlotTap(row, col);
                  }
                }}
                sx={{
                  aspectRatio: '1',
                  borderRadius: '12px',
                  border: `2px dashed ${
                    isPlaced
                      ? `${pieceColor}60`
                      : isHovered
                        ? kidsColors.primary
                        : `${kidsColors.primaryLight}30`
                  }`,
                  background: isPlaced
                    ? `${pieceColor}20`
                    : isHovered
                      ? `${kidsColors.primary}15`
                      : `${kidsColors.surfaceLight}30`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                  transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                  boxShadow: isHovered
                    ? kidsColors.glowPrimary
                    : isPlaced
                      ? `0 0 12px ${pieceColor}25`
                      : 'none',
                  cursor: selectedPieceId && !isPlaced ? 'pointer' : 'default',
                  animation: isPlaced
                    ? 'snapIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                    : 'none',
                  '@keyframes snapIn': {
                    '0%': {transform: 'scale(0.5)', opacity: 0},
                    '70%': {transform: 'scale(1.1)'},
                    '100%': {transform: 'scale(1)', opacity: 1},
                  },
                }}
              >
                {isPlaced ? (
                  <>
                    {placedPiece?.icon && (
                      <Typography sx={{fontSize: '1.4rem', lineHeight: 1}}>
                        {placedPiece.icon}
                      </Typography>
                    )}
                    <Typography
                      sx={{
                        color: pieceColor,
                        fontWeight: 700,
                        fontSize: {xs: '0.9rem', sm: '1rem'},
                        textAlign: 'center',
                        lineHeight: 1.2,
                        mt: placedPiece?.icon ? 0.3 : 0,
                      }}
                    >
                      {placedPiece?.label}
                    </Typography>
                  </>
                ) : (
                  <Typography
                    sx={{
                      color: `${kidsColors.textMuted}60`,
                      fontSize: '0.7rem',
                      fontWeight: 500,
                    }}
                  >
                    {row + 1},{col + 1}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      </Card>

      {/* Scrambled pieces */}
      <Typography
        variant="caption"
        sx={{
          color: kidsColors.textMuted,
          display: 'block',
          textAlign: 'center',
          mb: 1,
        }}
      >
        {remainingPieces.length > 0
          ? 'Drag pieces to the grid (or tap to select, then tap a slot)'
          : ''}
      </Typography>
      <Box
        role="group"
        aria-label="Puzzle pieces"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.2,
          justifyContent: 'center',
          mb: 3,
          minHeight: 50,
        }}
      >
        {remainingPieces.map((piece, idx) => {
          const color =
            piece.color || PIECE_COLORS[piece.id % PIECE_COLORS.length];
          const isDragging = draggingPiece === String(piece.id);
          const isSelected = selectedPieceId === piece.id;
          const isFeedbackWrong =
            feedbackPiece &&
            feedbackPiece.id === piece.id &&
            !feedbackPiece.correct;

          return (
            <Grow in key={piece.id} timeout={200 + idx * 60}>
              <Box
                draggable
                aria-label={`Puzzle piece: ${piece.label}`}
                tabIndex={0}
                onDragStart={(e) => handleDragStart(e, String(piece.id))}
                onDragEnd={handleDragEnd}
                onClick={() => handlePieceTap(piece.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handlePieceTap(piece.id);
                  }
                }}
                sx={{
                  px: 2,
                  py: 1.2,
                  borderRadius: '12px',
                  background: `${color}25`,
                  border: `2px solid ${isSelected ? color : `${color}70`}`,
                  cursor: 'grab',
                  userSelect: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.3,
                  transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                  opacity: isDragging ? 0.5 : 1,
                  transform: isSelected
                    ? 'scale(1.08)'
                    : isDragging
                      ? 'scale(1.1) rotate(2deg)'
                      : 'scale(1)',
                  boxShadow: isSelected
                    ? `0 4px 16px ${color}40`
                    : `0 2px 8px ${color}15`,
                  animation: isFeedbackWrong
                    ? 'pieceShake 0.4s ease-in-out'
                    : 'none',
                  '@keyframes pieceShake': {
                    '0%, 100%': {transform: 'translateX(0)'},
                    '20%': {transform: 'translateX(-5px)'},
                    '40%': {transform: 'translateX(5px)'},
                    '60%': {transform: 'translateX(-3px)'},
                    '80%': {transform: 'translateX(3px)'},
                  },
                  '&:hover': {
                    background: `${color}40`,
                    borderColor: color,
                    transform: 'scale(1.08)',
                    boxShadow: `0 6px 20px ${color}35`,
                  },
                  '&:active': {
                    cursor: 'grabbing',
                  },
                }}
              >
                {piece.icon && (
                  <Typography sx={{fontSize: '1.2rem', lineHeight: 1}}>
                    {piece.icon}
                  </Typography>
                )}
                <Typography
                  sx={{
                    fontWeight: 700,
                    fontSize: {xs: '0.95rem', sm: '1.05rem'},
                    color: kidsColors.textPrimary,
                    textAlign: 'center',
                  }}
                >
                  {piece.label}
                </Typography>
              </Box>
            </Grow>
          );
        })}
      </Box>

      {/* Completion */}
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
              Puzzle Complete!
            </Typography>
            <Typography variant="body2" sx={{color: kidsColors.textSecondary}}>
              All {totalPieces} pieces in place
            </Typography>
          </Box>
        </Fade>
      )}

      {/* Streak */}
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

      <InlineCelebration type={celebType} gameTemplate="puzzle_assemble" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />
    </Box>
  );
}
