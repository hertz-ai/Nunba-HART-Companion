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

// ── Direction vectors for word extraction ──
const DIRECTIONS = [
  {dr: 0, dc: 1}, // right
  {dr: 0, dc: -1}, // left
  {dr: 1, dc: 0}, // down
  {dr: -1, dc: 0}, // up
  {dr: 1, dc: 1}, // down-right
  {dr: -1, dc: -1}, // up-left
  {dr: 1, dc: -1}, // down-left
  {dr: -1, dc: 1}, // up-right
];

// ── Helpers ──
function getCellsBetween(startRow, startCol, endRow, endCol) {
  const cells = [];
  const dr = endRow === startRow ? 0 : endRow > startRow ? 1 : -1;
  const dc = endCol === startCol ? 0 : endCol > startCol ? 1 : -1;

  // Must be a straight line (horizontal, vertical, or diagonal)
  const rowDist = Math.abs(endRow - startRow);
  const colDist = Math.abs(endCol - startCol);
  if (rowDist !== colDist && rowDist !== 0 && colDist !== 0) {
    return []; // not a valid straight line
  }

  const steps = Math.max(rowDist, colDist);
  let r = startRow;
  let c = startCol;
  for (let i = 0; i <= steps; i++) {
    cells.push({row: r, col: c});
    r += dr;
    c += dc;
  }
  return cells;
}

function extractWordFromCells(grid, cells) {
  return cells
    .map(({row, col}) => {
      if (
        row >= 0 &&
        row < grid.length &&
        col >= 0 &&
        col < (grid[0]?.length || 0)
      ) {
        return grid[row][col];
      }
      return '';
    })
    .join('');
}

function cellKey(row, col) {
  return `${row},${col}`;
}

// ── Default grid generator for local play ──
const SAMPLE_WORDS = [
  'REACT',
  'NUNBA',
  'GAME',
  'CODE',
  'PLAY',
  'WORD',
  'FIND',
  'GRID',
];

function generateLocalGrid(size = 10, words = SAMPLE_WORDS) {
  const grid = Array.from({length: size}, () =>
    Array.from({length: size}, () => '')
  );

  const placedWords = [];
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  for (const word of words) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 100) {
      attempts++;
      const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      const maxR = size - 1 - (dir.dr > 0 ? word.length - 1 : 0);
      const minR = dir.dr < 0 ? word.length - 1 : 0;
      const maxC = size - 1 - (dir.dc > 0 ? word.length - 1 : 0);
      const minC = dir.dc < 0 ? word.length - 1 : 0;

      if (minR > maxR || minC > maxC) continue;

      const startR = minR + Math.floor(Math.random() * (maxR - minR + 1));
      const startC = minC + Math.floor(Math.random() * (maxC - minC + 1));

      let canPlace = true;
      for (let i = 0; i < word.length; i++) {
        const r = startR + dir.dr * i;
        const c = startC + dir.dc * i;
        if (grid[r][c] !== '' && grid[r][c] !== word[i]) {
          canPlace = false;
          break;
        }
      }

      if (canPlace) {
        for (let i = 0; i < word.length; i++) {
          const r = startR + dir.dr * i;
          const c = startC + dir.dc * i;
          grid[r][c] = word[i];
        }
        placedWords.push(word);
        placed = true;
      }
    }
  }

  // Fill empty cells with random letters
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === '') {
        grid[r][c] = alphabet[Math.floor(Math.random() * 26)];
      }
    }
  }

  return {grid, words: placedWords};
}

export default function WordSearchEngine({
  multiplayer,
  catalogEntry,
  onComplete,
}) {
  const engineConfig = catalogEntry?.engine_config || {};

  // ── State ──
  const [grid, setGrid] = useState([]);
  const [gridSize, setGridSize] = useState(0);
  const [wordsToFind, setWordsToFind] = useState([]);
  const [foundWords, setFoundWords] = useState({});
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [highlightedCells, setHighlightedCells] = useState(new Set());
  const [foundCells, setFoundCells] = useState(new Set());
  const [score, setScore] = useState(0);
  const [lastFoundFeedback, setLastFoundFeedback] = useState(null);
  const [gameFinished, setGameFinished] = useState(false);

  const gridRef = useRef(null);
  const feedbackTimeoutRef = useRef(null);

  const totalWords = wordsToFind.length;
  const foundCount = Object.keys(foundWords).length;

  // ── Load grid from multiplayer or generate locally ──
  useEffect(() => {
    const state = multiplayer?.gameState || multiplayer?.sessionState;
    if (state?.grid && state.grid.length > 0) {
      setGrid(state.grid);
      setGridSize(state.grid_size || state.grid.length);
      setWordsToFind(state.words_to_find || []);
      if (state.found_words) {
        setFoundWords(state.found_words);
      }
    } else {
      const size = engineConfig.grid_size || 10;
      const words = engineConfig.words || SAMPLE_WORDS;
      const generated = generateLocalGrid(size, words);
      setGrid(generated.grid);
      setGridSize(size);
      setWordsToFind(generated.words);
    }
  }, [
    multiplayer?.gameState,
    multiplayer?.sessionState,
    engineConfig.grid_size,
    engineConfig.words,
  ]);

  // ── Sync found words from multiplayer state ──
  useEffect(() => {
    const state = multiplayer?.gameState || multiplayer?.sessionState;
    if (state?.found_words) {
      setFoundWords(state.found_words);
    }
  }, [
    multiplayer?.gameState?.found_words,
    multiplayer?.sessionState?.found_words,
  ]);

  // ── Cleanup ──
  useEffect(() => {
    return () => clearTimeout(feedbackTimeoutRef.current);
  }, []);

  // ── Update highlighted cells during selection ──
  useEffect(() => {
    if (selectionStart && selectionEnd) {
      const cells = getCellsBetween(
        selectionStart.row,
        selectionStart.col,
        selectionEnd.row,
        selectionEnd.col
      );
      setHighlightedCells(new Set(cells.map((c) => cellKey(c.row, c.col))));
    } else if (selectionStart) {
      setHighlightedCells(
        new Set([cellKey(selectionStart.row, selectionStart.col)])
      );
    } else {
      setHighlightedCells(new Set());
    }
  }, [selectionStart, selectionEnd]);

  // ── Mouse handlers ──
  const handleCellMouseDown = useCallback((row, col) => {
    setIsSelecting(true);
    setSelectionStart({row, col});
    setSelectionEnd(null);
  }, []);

  const handleCellMouseEnter = useCallback(
    (row, col) => {
      if (isSelecting && selectionStart) {
        setSelectionEnd({row, col});
      }
    },
    [isSelecting, selectionStart]
  );

  const handleCellMouseUp = useCallback(
    (row, col) => {
      if (!isSelecting || !selectionStart) {
        setIsSelecting(false);
        return;
      }

      setIsSelecting(false);
      const end = {row, col};
      setSelectionEnd(end);

      // Extract word
      const cells = getCellsBetween(
        selectionStart.row,
        selectionStart.col,
        end.row,
        end.col
      );

      if (cells.length < 2) {
        setSelectionStart(null);
        setSelectionEnd(null);
        return;
      }

      const selectedWord = extractWordFromCells(grid, cells);
      const reversedWord = selectedWord.split('').reverse().join('');

      // Check against unfound words
      const matchedWord = wordsToFind.find(
        (w) =>
          !foundWords[w] &&
          (w.toUpperCase() === selectedWord.toUpperCase() ||
            w.toUpperCase() === reversedWord.toUpperCase())
      );

      if (matchedWord) {
        // Mark as found
        const newFoundWords = {...foundWords, [matchedWord]: 'local'};
        setFoundWords(newFoundWords);
        setScore((prev) => prev + 10);

        // Add cells to found set
        const newFoundCells = new Set(foundCells);
        cells.forEach((c) => newFoundCells.add(cellKey(c.row, c.col)));
        setFoundCells(newFoundCells);

        // Feedback
        setLastFoundFeedback(matchedWord);
        feedbackTimeoutRef.current = setTimeout(() => {
          setLastFoundFeedback(null);
        }, 1500);

        // Submit move
        if (multiplayer?.submitMove) {
          multiplayer.submitMove({word: matchedWord});
        }

        // Check completion
        if (Object.keys(newFoundWords).length >= totalWords) {
          setTimeout(() => {
            setGameFinished(true);
            if (multiplayer?.submitFinalScore) {
              multiplayer.submitFinalScore({
                score: score + 10,
                words_found: Object.keys(newFoundWords).length,
                total_words: totalWords,
              });
            }
            if (onComplete) onComplete();
          }, 1000);
        }
      }

      // Clear selection
      setTimeout(() => {
        setSelectionStart(null);
        setSelectionEnd(null);
        setHighlightedCells(new Set());
      }, 300);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isSelecting,
      selectionStart,
      grid,
      wordsToFind,
      foundWords,
      foundCells,
      score,
      totalWords,
      multiplayer,
      onComplete,
    ]
  );

  // ── Touch handlers for mobile ──
  const handleTouchStart = useCallback(
    (row, col) => {
      handleCellMouseDown(row, col);
    },
    [handleCellMouseDown]
  );

  const handleTouchMove = useCallback(
    (e) => {
      if (!isSelecting || !gridRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      const element = document.elementFromPoint(touch.clientX, touch.clientY);
      if (element) {
        const row = parseInt(element.dataset?.row, 10);
        const col = parseInt(element.dataset?.col, 10);
        if (!isNaN(row) && !isNaN(col)) {
          setSelectionEnd({row, col});
        }
      }
    },
    [isSelecting]
  );

  // ── Get cell style ──
  const getCellSx = useCallback(
    (row, col) => {
      const key = cellKey(row, col);
      const isFound = foundCells.has(key);
      const isHighlighted = highlightedCells.has(key);

      const base = {
        width: {xs: 30, sm: 36, md: 40},
        height: {xs: 30, sm: 36, md: 40},
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'all 0.15s ease',
        borderRadius: '4px',
        border: `1px solid ${alpha('#fff', 0.06)}`,
      };

      if (isFound) {
        return {
          ...base,
          bgcolor: alpha(COLOR_CORRECT, 0.25),
          border: `1px solid ${alpha(COLOR_CORRECT, 0.4)}`,
        };
      }
      if (isHighlighted) {
        return {
          ...base,
          bgcolor: alpha(COLOR_PRIMARY, 0.35),
          border: `1px solid ${alpha(COLOR_PRIMARY, 0.6)}`,
          transform: 'scale(1.05)',
        };
      }
      return {
        ...base,
        bgcolor: alpha(COLOR_BG, 0.6),
        '&:hover': {
          bgcolor: alpha(COLOR_PRIMARY, 0.15),
        },
      };
    },
    [foundCells, highlightedCells]
  );

  // ── No grid loaded yet ──
  if (grid.length === 0) {
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
          Preparing word search...
        </Typography>
      </Box>
    );
  }

  // ── Game finished ──
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
          <Typography variant="h4" sx={{color: '#fff', fontWeight: 700, mb: 2}}>
            All Words Found!
          </Typography>
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
    <Box sx={{maxWidth: 800, mx: 'auto', py: 2}}>
      {/* ── Header: progress + score ── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Typography variant="body2" sx={{color: '#aaa'}}>
          {foundCount} / {totalWords} words found
        </Typography>
        <Typography
          variant="body1"
          sx={{color: COLOR_PRIMARY, fontWeight: 700}}
        >
          Score: {score}
        </Typography>
      </Box>

      {/* ── Progress bar ── */}
      <LinearProgress
        variant="determinate"
        value={totalWords > 0 ? (foundCount / totalWords) * 100 : 0}
        sx={{
          height: 6,
          borderRadius: '3px',
          mb: 3,
          bgcolor: 'rgba(255,255,255,0.08)',
          '& .MuiLinearProgress-bar': {
            bgcolor: COLOR_CORRECT,
            transition: 'transform 0.5s ease',
          },
        }}
      />

      {/* ── Found word feedback ── */}
      {lastFoundFeedback && (
        <Fade in timeout={300}>
          <Typography
            variant="h6"
            sx={{
              textAlign: 'center',
              mb: 2,
              color: COLOR_CORRECT,
              fontWeight: 700,
              ...animFadeInUp(),
            }}
          >
            Found "{lastFoundFeedback}"! +10 points
          </Typography>
        </Fade>
      )}

      {/* ── Main layout: grid + word list ── */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: {xs: 'column', md: 'row'},
          gap: 3,
          alignItems: {xs: 'center', md: 'flex-start'},
        }}
      >
        {/* ── Grid ── */}
        <Box
          ref={gridRef}
          onMouseLeave={() => {
            if (isSelecting) {
              setIsSelecting(false);
              setSelectionStart(null);
              setSelectionEnd(null);
            }
          }}
          onTouchMove={handleTouchMove}
          sx={{
            display: 'inline-flex',
            flexDirection: 'column',
            gap: '2px',
            p: 1.5,
            bgcolor: alpha(COLOR_CELL_BG, 0.5),
            borderRadius: RADIUS.lg,
            border: `1px solid ${alpha(COLOR_PRIMARY, 0.15)}`,
            touchAction: 'none',
          }}
        >
          {grid.map((row, rIdx) => (
            <Box key={rIdx} sx={{display: 'flex', gap: '2px'}}>
              {row.map((letter, cIdx) => (
                <Box
                  key={`${rIdx}-${cIdx}`}
                  data-row={rIdx}
                  data-col={cIdx}
                  onMouseDown={() => handleCellMouseDown(rIdx, cIdx)}
                  onMouseEnter={() => handleCellMouseEnter(rIdx, cIdx)}
                  onMouseUp={() => handleCellMouseUp(rIdx, cIdx)}
                  onTouchStart={() => handleTouchStart(rIdx, cIdx)}
                  onTouchEnd={() => handleCellMouseUp(rIdx, cIdx)}
                  sx={getCellSx(rIdx, cIdx)}
                >
                  <Typography
                    variant="body1"
                    sx={{
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: {xs: '0.85rem', sm: '1rem', md: '1.1rem'},
                      color: foundCells.has(cellKey(rIdx, cIdx))
                        ? COLOR_CORRECT
                        : highlightedCells.has(cellKey(rIdx, cIdx))
                          ? '#fff'
                          : alpha('#fff', 0.7),
                      userSelect: 'none',
                      pointerEvents: 'none',
                    }}
                  >
                    {letter}
                  </Typography>
                </Box>
              ))}
            </Box>
          ))}
        </Box>

        {/* ── Word list panel ── */}
        <Box
          sx={{
            minWidth: {md: 180},
            width: {xs: '100%', md: 'auto'},
            p: 2,
            bgcolor: alpha(COLOR_CELL_BG, 0.5),
            borderRadius: RADIUS.lg,
            border: `1px solid ${alpha(COLOR_PRIMARY, 0.15)}`,
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              color: COLOR_PRIMARY,
              fontWeight: 700,
              mb: 1.5,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: '0.75rem',
            }}
          >
            Words to Find
          </Typography>
          <Box
            sx={{
              display: 'flex',
              flexDirection: {xs: 'row', md: 'column'},
              flexWrap: {xs: 'wrap', md: 'nowrap'},
              gap: 1,
            }}
          >
            {wordsToFind.map((word) => {
              const isFound = !!foundWords[word];
              return (
                <Typography
                  key={word}
                  variant="body2"
                  sx={{
                    color: isFound ? COLOR_CORRECT : alpha('#fff', 0.7),
                    fontWeight: isFound ? 700 : 500,
                    fontFamily: 'monospace',
                    textDecoration: isFound ? 'line-through' : 'none',
                    opacity: isFound ? 0.7 : 1,
                    transition: 'all 0.3s ease',
                    px: {xs: 1, md: 0},
                  }}
                >
                  {word}
                </Typography>
              );
            })}
          </Box>
        </Box>
      </Box>

      {/* ── Instructions ── */}
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          textAlign: 'center',
          mt: 3,
          color: alpha('#fff', 0.35),
        }}
      >
        Click and drag across letters to select a word. Words can be horizontal,
        vertical, or diagonal.
      </Typography>
    </Box>
  );
}
