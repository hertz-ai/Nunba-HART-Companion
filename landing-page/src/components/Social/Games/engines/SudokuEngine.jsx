import {RADIUS, GRADIENTS} from '../../../../theme/socialTokens';
import {animFadeInUp, animFadeInScale} from '../../../../utils/animations';

import {
  Box,
  Typography,
  Button,
  Grid,
  TextField,
  LinearProgress,
  Fade,
  Grow,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect, useCallback, useRef} from 'react';

// ── Colors ──
const COLOR_BG = '#0F0E17';
const COLOR_PRIMARY = '#6C63FF';
const COLOR_CORRECT = '#2ECC71';
const COLOR_INCORRECT = '#FF6B6B';
const COLOR_WARNING = '#FFAB00';
const COLOR_CELL_BG = '#1a1a2e';
const COLOR_GIVEN_TEXT = '#E0E0E0';
const COLOR_USER_TEXT = '#6C63FF';
const COLOR_OTHER_TEXT = '#2ECC71';

// ── Flash animation ──
const flashRedKeyframes = {
  '@keyframes flashRed': {
    '0%': {bgcolor: alpha(COLOR_INCORRECT, 0.4)},
    '50%': {bgcolor: alpha(COLOR_INCORRECT, 0.15)},
    '100%': {bgcolor: 'transparent'},
  },
};

// ── Default puzzle for local play ──
const DEFAULT_PUZZLE = [
  [5, 3, 0, 0, 7, 0, 0, 0, 0],
  [6, 0, 0, 1, 9, 5, 0, 0, 0],
  [0, 9, 8, 0, 0, 0, 0, 6, 0],
  [8, 0, 0, 0, 6, 0, 0, 0, 3],
  [4, 0, 0, 8, 0, 3, 0, 0, 1],
  [7, 0, 0, 0, 2, 0, 0, 0, 6],
  [0, 6, 0, 0, 0, 0, 2, 8, 0],
  [0, 0, 0, 4, 1, 9, 0, 0, 5],
  [0, 0, 0, 0, 8, 0, 0, 7, 9],
];

const DEFAULT_SOLUTION = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2],
  [6, 7, 2, 1, 9, 5, 3, 4, 8],
  [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3],
  [4, 2, 6, 8, 5, 3, 7, 9, 1],
  [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4],
  [2, 8, 7, 4, 1, 9, 6, 3, 5],
  [3, 4, 5, 2, 8, 6, 1, 7, 9],
];

// ── Helpers ──
function deepCopy2D(arr) {
  return arr.map((row) => [...row]);
}

function countFilledCells(puzzle, original) {
  let filled = 0;
  let total = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (original[r][c] === 0) {
        total++;
        if (puzzle[r][c] !== 0) filled++;
      }
    }
  }
  return {filled, total};
}

function getDifficultyColor(difficulty) {
  switch (difficulty?.toLowerCase()) {
    case 'easy':
      return COLOR_CORRECT;
    case 'medium':
      return COLOR_WARNING;
    case 'hard':
      return COLOR_INCORRECT;
    default:
      return COLOR_PRIMARY;
  }
}

export default function SudokuEngine({multiplayer, catalogEntry, onComplete}) {
  const engineConfig = catalogEntry?.engine_config || {};

  // ── State ──
  const [puzzle, setPuzzle] = useState([]);
  const [original, setOriginal] = useState([]);
  const [solution, setSolution] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null); // { row, col }
  const [mistakes, setMistakes] = useState(0);
  const [maxMistakes, setMaxMistakes] = useState(3);
  const [score, setScore] = useState(0);
  const [difficulty, setDifficulty] = useState('medium');
  const [cellOwners, setCellOwners] = useState({});
  const [flashCell, setFlashCell] = useState(null); // "r,c" for wrong answer flash
  const [gameFinished, setGameFinished] = useState(false);
  const [gameResult, setGameResult] = useState(null); // 'won' | 'lost'

  const flashTimeoutRef = useRef(null);

  // ── Load puzzle from multiplayer or use default ──
  useEffect(() => {
    const state = multiplayer?.gameState || multiplayer?.sessionState;
    if (state?.puzzle && state.puzzle.length === 9) {
      setPuzzle(deepCopy2D(state.puzzle));
      setOriginal(deepCopy2D(state.original || state.puzzle));
      if (state.solution) setSolution(state.solution);
      setDifficulty(state.difficulty || 'medium');
      setMaxMistakes(state.max_mistakes || 3);
      if (state.cell_owners) setCellOwners(state.cell_owners);
      if (state.mistakes) {
        const userId = multiplayer?.userId || 'local';
        setMistakes(state.mistakes[userId] || 0);
      }
    } else {
      setPuzzle(deepCopy2D(DEFAULT_PUZZLE));
      setOriginal(deepCopy2D(DEFAULT_PUZZLE));
      setSolution(DEFAULT_SOLUTION);
      setDifficulty(engineConfig.difficulty || 'medium');
      setMaxMistakes(engineConfig.max_mistakes || 3);
    }
  }, [
    multiplayer?.gameState,
    multiplayer?.sessionState,
    engineConfig.difficulty,
    engineConfig.max_mistakes,
    multiplayer?.userId,
  ]);

  // ── Sync cell owners from multiplayer ──
  useEffect(() => {
    const state = multiplayer?.gameState || multiplayer?.sessionState;
    if (state?.cell_owners) {
      setCellOwners(state.cell_owners);
    }
  }, [
    multiplayer?.gameState?.cell_owners,
    multiplayer?.sessionState?.cell_owners,
  ]);

  // ── Cleanup ──
  useEffect(() => {
    return () => clearTimeout(flashTimeoutRef.current);
  }, []);

  // ── Select cell ──
  const handleCellClick = useCallback(
    (row, col) => {
      if (gameFinished) return;
      // Only allow selecting empty cells (not given cells)
      if (original.length > 0 && original[row][col] !== 0) return;
      setSelectedCell({row, col});
    },
    [original, gameFinished]
  );

  // ── Place number ──
  const handleNumberInput = useCallback(
    (num) => {
      if (!selectedCell || gameFinished) return;
      const {row, col} = selectedCell;

      // Don't allow overwriting given cells
      if (original[row]?.[col] !== 0) return;

      if (num === 0) {
        // Erase
        const newPuzzle = deepCopy2D(puzzle);
        newPuzzle[row][col] = 0;
        setPuzzle(newPuzzle);
        return;
      }

      // Check correctness
      let isCorrect = false;
      if (solution) {
        isCorrect = solution[row][col] === num;
      } else {
        // Without solution, validate against sudoku rules
        isCorrect = isValidPlacement(puzzle, row, col, num);
      }

      if (isCorrect) {
        const newPuzzle = deepCopy2D(puzzle);
        newPuzzle[row][col] = num;
        setPuzzle(newPuzzle);
        setScore((prev) => prev + 5);

        const newOwners = {
          ...cellOwners,
          [`${row},${col}`]: multiplayer?.userId || 'local',
        };
        setCellOwners(newOwners);

        if (multiplayer?.submitMove) {
          multiplayer.submitMove({row, col, value: num});
        }

        // Check completion
        const {filled, total} = countFilledCells(newPuzzle, original);
        if (filled >= total) {
          setGameFinished(true);
          setGameResult('won');
          if (multiplayer?.submitFinalScore) {
            multiplayer.submitFinalScore({
              score: score + 5,
              mistakes,
              completed: true,
            });
          }
          if (onComplete) setTimeout(onComplete, 2000);
        }

        // Move selection to next empty cell
        const next = findNextEmptyCell(newPuzzle, original, row, col);
        if (next) setSelectedCell(next);
      } else {
        // Wrong answer
        const newMistakes = mistakes + 1;
        setMistakes(newMistakes);

        // Flash red
        setFlashCell(`${row},${col}`);
        flashTimeoutRef.current = setTimeout(() => setFlashCell(null), 600);

        if (multiplayer?.submitMove) {
          multiplayer.submitMove({row, col, value: num, incorrect: true});
        }

        // Check game over
        if (newMistakes >= maxMistakes) {
          setGameFinished(true);
          setGameResult('lost');
          if (multiplayer?.submitFinalScore) {
            multiplayer.submitFinalScore({
              score,
              mistakes: newMistakes,
              completed: false,
            });
          }
          if (onComplete) setTimeout(onComplete, 2000);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      selectedCell,
      puzzle,
      original,
      solution,
      gameFinished,
      mistakes,
      maxMistakes,
      score,
      cellOwners,
      multiplayer,
      onComplete,
    ]
  );

  // ── Keyboard input ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedCell || gameFinished) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9) {
        handleNumberInput(num);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        handleNumberInput(0);
      } else if (e.key === 'ArrowUp' && selectedCell.row > 0) {
        setSelectedCell((prev) => ({...prev, row: prev.row - 1}));
      } else if (e.key === 'ArrowDown' && selectedCell.row < 8) {
        setSelectedCell((prev) => ({...prev, row: prev.row + 1}));
      } else if (e.key === 'ArrowLeft' && selectedCell.col > 0) {
        setSelectedCell((prev) => ({...prev, col: prev.col - 1}));
      } else if (e.key === 'ArrowRight' && selectedCell.col < 8) {
        setSelectedCell((prev) => ({...prev, col: prev.col + 1}));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell, gameFinished, handleNumberInput]);

  // ── No puzzle loaded yet ──
  if (puzzle.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 300,
        }}
      >
        <Typography variant="body1" sx={{color: '#aaa'}}>
          Preparing puzzle...
        </Typography>
      </Box>
    );
  }

  const {filled, total} = countFilledCells(puzzle, original);
  const progressPercent = total > 0 ? (filled / total) * 100 : 0;
  const userId = multiplayer?.userId || 'local';

  // ── Game finished overlay ──
  if (gameFinished) {
    return (
      <Fade in timeout={500}>
        <Box
          sx={{
            maxWidth: 500,
            mx: 'auto',
            py: 4,
            textAlign: 'center',
            ...animFadeInScale(),
          }}
        >
          <Typography
            variant="h4"
            sx={{
              color: gameResult === 'won' ? COLOR_CORRECT : COLOR_INCORRECT,
              fontWeight: 700,
              mb: 2,
            }}
          >
            {gameResult === 'won' ? 'Puzzle Solved!' : 'Game Over'}
          </Typography>
          {gameResult === 'lost' && (
            <Typography variant="body1" sx={{color: alpha('#fff', 0.6), mb: 1}}>
              Too many mistakes ({mistakes}/{maxMistakes})
            </Typography>
          )}
          <Typography
            variant="h5"
            sx={{color: COLOR_PRIMARY, fontWeight: 700, mb: 3}}
          >
            Final Score: {score}
          </Typography>
          <Button
            variant="contained"
            onClick={onComplete}
            sx={{
              bgcolor: COLOR_PRIMARY,
              borderRadius: RADIUS.md,
              px: 4,
              py: 1.5,
              fontWeight: 700,
              '&:hover': {bgcolor: '#5A52E0'},
            }}
          >
            Back to Games
          </Button>
        </Box>
      </Fade>
    );
  }

  return (
    <Box sx={{maxWidth: 560, mx: 'auto', py: 2}}>
      {/* ── Header: difficulty + mistakes + score ── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        {/* Difficulty badge */}
        <Box
          sx={{
            px: 1.5,
            py: 0.5,
            borderRadius: RADIUS.pill,
            bgcolor: alpha(getDifficultyColor(difficulty), 0.15),
            border: `1px solid ${alpha(getDifficultyColor(difficulty), 0.4)}`,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: getDifficultyColor(difficulty),
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: '0.7rem',
            }}
          >
            {difficulty}
          </Typography>
        </Box>

        {/* Mistakes */}
        <Typography
          variant="body2"
          sx={{
            color:
              mistakes >= maxMistakes - 1
                ? COLOR_INCORRECT
                : alpha('#fff', 0.6),
            fontWeight: 600,
          }}
        >
          Mistakes:{' '}
          <Box component="span" sx={{color: COLOR_INCORRECT, fontWeight: 700}}>
            {mistakes}
          </Box>{' '}
          / {maxMistakes}
        </Typography>

        {/* Score */}
        <Typography
          variant="body1"
          sx={{color: COLOR_PRIMARY, fontWeight: 700}}
        >
          Score: {score}
        </Typography>
      </Box>

      {/* ── Progress bar ── */}
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 3}}>
        <LinearProgress
          variant="determinate"
          value={progressPercent}
          sx={{
            flex: 1,
            height: 6,
            borderRadius: '3px',
            bgcolor: 'rgba(255,255,255,0.08)',
            '& .MuiLinearProgress-bar': {
              bgcolor: COLOR_PRIMARY,
              transition: 'transform 0.5s ease',
            },
          }}
        />
        <Typography
          variant="caption"
          sx={{color: alpha('#fff', 0.5), minWidth: 50, textAlign: 'right'}}
        >
          {filled} / {total}
        </Typography>
      </Box>

      {/* ── 9x9 Sudoku Grid ── */}
      <Box
        sx={{
          display: 'inline-flex',
          flexDirection: 'column',
          borderRadius: RADIUS.md,
          border: `2px solid ${alpha(COLOR_PRIMARY, 0.4)}`,
          overflow: 'hidden',
          mx: 'auto',
          width: '100%',
          maxWidth: 450,
          ...flashRedKeyframes,
        }}
      >
        {puzzle.map((row, rIdx) => (
          <Box
            key={rIdx}
            sx={{
              display: 'flex',
              // Thicker border between 3x3 boxes
              borderBottom:
                rIdx === 2 || rIdx === 5
                  ? `2px solid ${alpha(COLOR_PRIMARY, 0.4)}`
                  : rIdx < 8
                    ? `1px solid ${alpha('#fff', 0.08)}`
                    : 'none',
            }}
          >
            {row.map((value, cIdx) => {
              const isGiven = original[rIdx]?.[cIdx] !== 0;
              const isSelected =
                selectedCell?.row === rIdx && selectedCell?.col === cIdx;
              const isSameRow = selectedCell?.row === rIdx;
              const isSameCol = selectedCell?.col === cIdx;
              const isSameBox =
                selectedCell &&
                Math.floor(selectedCell.row / 3) === Math.floor(rIdx / 3) &&
                Math.floor(selectedCell.col / 3) === Math.floor(cIdx / 3);
              const isHighlighted =
                (isSameRow || isSameCol || isSameBox) && !isSelected;
              const isSameNumber =
                selectedCell &&
                value !== 0 &&
                puzzle[selectedCell.row]?.[selectedCell.col] === value;
              const isFlashing = flashCell === `${rIdx},${cIdx}`;
              const ownerKey = `${rIdx},${cIdx}`;
              const cellOwner = cellOwners[ownerKey];
              const isOwnedByUser = cellOwner === userId;
              const isOwnedByOther = cellOwner && cellOwner !== userId;

              let textColor = COLOR_GIVEN_TEXT;
              if (!isGiven && value !== 0) {
                textColor = isOwnedByOther ? COLOR_OTHER_TEXT : COLOR_USER_TEXT;
              }

              return (
                <Box
                  key={cIdx}
                  onClick={() => handleCellClick(rIdx, cIdx)}
                  sx={{
                    flex: 1,
                    aspectRatio: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: isGiven ? 'default' : 'pointer',
                    transition: 'background-color 0.15s ease',
                    bgcolor: isFlashing
                      ? alpha(COLOR_INCORRECT, 0.35)
                      : isSelected
                        ? alpha(COLOR_PRIMARY, 0.25)
                        : isSameNumber
                          ? alpha(COLOR_PRIMARY, 0.12)
                          : isHighlighted
                            ? alpha(COLOR_PRIMARY, 0.06)
                            : isGiven
                              ? alpha('#fff', 0.03)
                              : 'transparent',
                    borderRight:
                      cIdx === 2 || cIdx === 5
                        ? `2px solid ${alpha(COLOR_PRIMARY, 0.4)}`
                        : cIdx < 8
                          ? `1px solid ${alpha('#fff', 0.08)}`
                          : 'none',
                    ...(isSelected
                      ? {
                          boxShadow: `inset 0 0 0 2px ${COLOR_PRIMARY}`,
                        }
                      : {}),
                    '&:hover': isGiven
                      ? {}
                      : {
                          bgcolor: isSelected
                            ? alpha(COLOR_PRIMARY, 0.25)
                            : alpha(COLOR_PRIMARY, 0.1),
                        },
                    minWidth: {xs: 32, sm: 40, md: 48},
                    minHeight: {xs: 32, sm: 40, md: 48},
                  }}
                >
                  {value !== 0 && (
                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: isGiven ? 800 : 600,
                        fontSize: {xs: '1rem', sm: '1.2rem', md: '1.4rem'},
                        color: textColor,
                        userSelect: 'none',
                        fontFamily: 'monospace',
                      }}
                    >
                      {value}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>

      {/* ── Number pad ── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 1,
          mt: 3,
          maxWidth: 450,
          mx: 'auto',
        }}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => {
          // Count how many of this number are placed
          let placedCount = 0;
          for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
              if (puzzle[r][c] === num) placedCount++;
            }
          }
          const isComplete = placedCount >= 9;

          return (
            <Button
              key={num}
              onClick={() => handleNumberInput(num)}
              disabled={isComplete || !selectedCell}
              sx={{
                minWidth: {xs: 40, sm: 48},
                height: {xs: 48, sm: 56},
                fontSize: {xs: '1.1rem', sm: '1.3rem'},
                fontWeight: 700,
                fontFamily: 'monospace',
                color: isComplete ? alpha('#fff', 0.2) : '#fff',
                bgcolor: isComplete
                  ? alpha('#fff', 0.03)
                  : alpha(COLOR_PRIMARY, 0.12),
                border: `1px solid ${
                  isComplete ? alpha('#fff', 0.05) : alpha(COLOR_PRIMARY, 0.3)
                }`,
                borderRadius: RADIUS.md,
                transition: 'all 0.15s ease',
                '&:hover': isComplete
                  ? {}
                  : {
                      bgcolor: alpha(COLOR_PRIMARY, 0.25),
                      borderColor: COLOR_PRIMARY,
                    },
                '&.Mui-disabled': {
                  color: alpha('#fff', 0.15),
                },
              }}
            >
              {num}
            </Button>
          );
        })}

        {/* Erase button */}
        <Button
          onClick={() => handleNumberInput(0)}
          disabled={!selectedCell}
          sx={{
            minWidth: {xs: 40, sm: 48},
            height: {xs: 48, sm: 56},
            fontSize: {xs: '0.75rem', sm: '0.85rem'},
            fontWeight: 700,
            color: alpha('#fff', 0.7),
            bgcolor: alpha(COLOR_INCORRECT, 0.1),
            border: `1px solid ${alpha(COLOR_INCORRECT, 0.25)}`,
            borderRadius: RADIUS.md,
            transition: 'all 0.15s ease',
            textTransform: 'none',
            '&:hover': {
              bgcolor: alpha(COLOR_INCORRECT, 0.2),
              borderColor: COLOR_INCORRECT,
            },
            '&.Mui-disabled': {
              color: alpha('#fff', 0.15),
            },
          }}
        >
          Erase
        </Button>
      </Box>

      {/* ── Instructions ── */}
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          textAlign: 'center',
          mt: 3,
          color: alpha('#fff', 0.3),
        }}
      >
        Click a cell then use number pad or keyboard. Arrow keys to navigate.
      </Typography>
    </Box>
  );
}

// ── Validate number placement against sudoku rules ──
function isValidPlacement(puzzle, row, col, num) {
  // Check row
  for (let c = 0; c < 9; c++) {
    if (c !== col && puzzle[row][c] === num) return false;
  }
  // Check column
  for (let r = 0; r < 9; r++) {
    if (r !== row && puzzle[r][col] === num) return false;
  }
  // Check 3x3 box
  const boxR = Math.floor(row / 3) * 3;
  const boxC = Math.floor(col / 3) * 3;
  for (let r = boxR; r < boxR + 3; r++) {
    for (let c = boxC; c < boxC + 3; c++) {
      if (r !== row && c !== col && puzzle[r][c] === num) return false;
    }
  }
  return true;
}

// ── Find next empty cell ──
function findNextEmptyCell(puzzle, original, currentRow, currentCol) {
  // Search forward from current position
  for (let r = currentRow; r < 9; r++) {
    const startCol = r === currentRow ? currentCol + 1 : 0;
    for (let c = startCol; c < 9; c++) {
      if (original[r][c] === 0 && puzzle[r][c] === 0) {
        return {row: r, col: c};
      }
    }
  }
  // Wrap around from beginning
  for (let r = 0; r <= currentRow; r++) {
    const endCol = r === currentRow ? currentCol : 9;
    for (let c = 0; c < endCol; c++) {
      if (original[r][c] === 0 && puzzle[r][c] === 0) {
        return {row: r, col: c};
      }
    }
  }
  return null;
}
