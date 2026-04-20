import {Box, Typography} from '@mui/material';
import {INVALID_MOVE} from 'boardgame.io/core';
import React, {useState, useMemo, useCallback} from 'react';

const SIZE = 8;

// Piece constants
const EMPTY = null;
const RED = 'red'; // player 0
const BLACK = 'black'; // player 1
const RED_KING = 'redK';
const BLACK_KING = 'blackK';

function isRed(piece) {
  return piece === RED || piece === RED_KING;
}

function isBlack(piece) {
  return piece === BLACK || piece === BLACK_KING;
}

function isKing(piece) {
  return piece === RED_KING || piece === BLACK_KING;
}

function belongsTo(piece, playerID) {
  if (playerID === '0') return isRed(piece);
  return isBlack(piece);
}

function opponent(playerID) {
  return playerID === '0' ? '1' : '0';
}

function createInitialBoard() {
  const board = Array.from({length: SIZE}, () => Array(SIZE).fill(EMPTY));
  // Black pieces (player 1) on top 3 rows
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 1) board[r][c] = BLACK;
    }
  }
  // Red pieces (player 0) on bottom 3 rows
  for (let r = 5; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if ((r + c) % 2 === 1) board[r][c] = RED;
    }
  }
  return board;
}

function getValidMoves(board, r, c, playerID) {
  const piece = board[r][c];
  if (!piece || !belongsTo(piece, playerID)) return [];

  const moves = [];
  const directions = [];

  // Red moves up (decreasing row), Black moves down (increasing row)
  if (isRed(piece) || isKing(piece)) directions.push(-1);
  if (isBlack(piece) || isKing(piece)) directions.push(1);

  for (const dr of directions) {
    for (const dc of [-1, 1]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
        if (board[nr][nc] === EMPTY) {
          moves.push({toR: nr, toC: nc, capture: false});
        } else if (!belongsTo(board[nr][nc], playerID)) {
          // Check jump
          const jr = nr + dr;
          const jc = nc + dc;
          if (
            jr >= 0 &&
            jr < SIZE &&
            jc >= 0 &&
            jc < SIZE &&
            board[jr][jc] === EMPTY
          ) {
            moves.push({
              toR: jr,
              toC: jc,
              capture: true,
              capturedR: nr,
              capturedC: nc,
            });
          }
        }
      }
    }
  }

  return moves;
}

function getAllCaptures(board, playerID) {
  const captures = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] && belongsTo(board[r][c], playerID)) {
        const movesForPiece = getValidMoves(board, r, c, playerID);
        const captureMoves = movesForPiece.filter((m) => m.capture);
        if (captureMoves.length > 0) {
          captures.push({fromR: r, fromC: c, moves: captureMoves});
        }
      }
    }
  }
  return captures;
}

function getAllNonCaptures(board, playerID) {
  const nonCaptures = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] && belongsTo(board[r][c], playerID)) {
        const movesForPiece = getValidMoves(board, r, c, playerID);
        const regularMoves = movesForPiece.filter((m) => !m.capture);
        if (regularMoves.length > 0) {
          nonCaptures.push({fromR: r, fromC: c, moves: regularMoves});
        }
      }
    }
  }
  return nonCaptures;
}

function countPieces(board, playerID) {
  let count = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] && belongsTo(board[r][c], playerID)) count++;
    }
  }
  return count;
}

function maybePromote(board, r, c) {
  const piece = board[r][c];
  if (piece === RED && r === 0) board[r][c] = RED_KING;
  if (piece === BLACK && r === SIZE - 1) board[r][c] = BLACK_KING;
}

const CheckersGame = {
  name: 'checkers',

  setup: () => ({
    board: createInitialBoard(),
  }),

  moves: {
    movePiece: ({G, playerID}, fromR, fromC, toR, toC) => {
      const piece = G.board[fromR][fromC];
      if (!piece || !belongsTo(piece, playerID)) return INVALID_MOVE;

      const validMoves = getValidMoves(G.board, fromR, fromC, playerID);
      const move = validMoves.find((m) => m.toR === toR && m.toC === toC);
      if (!move) return INVALID_MOVE;

      // If captures are available, must capture (forced capture rule)
      const allCaptures = getAllCaptures(G.board, playerID);
      if (allCaptures.length > 0 && !move.capture) return INVALID_MOVE;

      // Execute move
      G.board[toR][toC] = G.board[fromR][fromC];
      G.board[fromR][fromC] = EMPTY;

      if (move.capture) {
        G.board[move.capturedR][move.capturedC] = EMPTY;
      }

      // Promote to king
      maybePromote(G.board, toR, toC);
    },
  },

  endIf: ({G, ctx}) => {
    const opp = opponent(ctx.currentPlayer);
    const oppPieces = countPieces(G.board, opp);
    if (oppPieces === 0) {
      return {winner: ctx.currentPlayer};
    }
    // Check if current player has no moves (they lose)
    const captures = getAllCaptures(G.board, ctx.currentPlayer);
    const nonCaptures = getAllNonCaptures(G.board, ctx.currentPlayer);
    if (captures.length === 0 && nonCaptures.length === 0) {
      return {winner: opp};
    }
  },

  turn: {minMoves: 1, maxMoves: 1},

  // AI move enumeration — respects the forced-capture rule: if any
  // capture is available anywhere on the board, the AI MUST choose
  // from captures only (matching moves.movePiece's INVALID_MOVE
  // return when a non-capture is attempted while captures exist).
  // Uses getAllCaptures + getAllNonCaptures so the rules stay in
  // one place.
  ai: {
    enumerate: (G, ctx) => {
      const playerID = ctx.currentPlayer;
      const captures = getAllCaptures(G.board, playerID);

      if (captures.length > 0) {
        const out = [];
        for (const {fromR, fromC, moves: captureMoves} of captures) {
          for (const m of captureMoves) {
            out.push({move: 'movePiece', args: [fromR, fromC, m.toR, m.toC]});
          }
        }
        return out;
      }

      const nonCaptures = getAllNonCaptures(G.board, playerID);
      const out = [];
      for (const {fromR, fromC, moves: regularMoves} of nonCaptures) {
        for (const m of regularMoves) {
          out.push({move: 'movePiece', args: [fromR, fromC, m.toR, m.toC]});
        }
      }
      return out;
    },
  },
};

const LIGHT_SQUARE = '#D4A574';
const DARK_SQUARE = '#8B6914';
const PIECE_RED = '#E53935';
const PIECE_BLACK = '#333';

function CheckersBoard({G, ctx, moves, playerID, isActive}) {
  const [selected, setSelected] = useState(null);

  const validMovesForSelected = useMemo(() => {
    if (!selected) return [];
    const allCaptures = getAllCaptures(G.board, playerID);
    const pieceMoves = getValidMoves(G.board, selected.r, selected.c, playerID);

    // If any captures exist, only allow captures
    if (allCaptures.length > 0) {
      return pieceMoves.filter((m) => m.capture);
    }
    return pieceMoves;
  }, [selected, G.board, playerID]);

  const validDestinations = useMemo(() => {
    return new Set(validMovesForSelected.map((m) => `${m.toR},${m.toC}`));
  }, [validMovesForSelected]);

  const handleCellClick = useCallback(
    (r, c) => {
      if (!isActive) return;

      const piece = G.board[r][c];

      // If clicking a destination
      if (selected && validDestinations.has(`${r},${c}`)) {
        moves.movePiece(selected.r, selected.c, r, c);
        setSelected(null);
        return;
      }

      // If clicking own piece, select it
      if (piece && belongsTo(piece, playerID)) {
        setSelected({r, c});
        return;
      }

      setSelected(null);
    },
    [isActive, selected, validDestinations, G.board, playerID, moves]
  );

  const currentTurnLabel =
    ctx.currentPlayer === playerID ? 'Your turn' : "Opponent's turn";
  const playerColor = playerID === '0' ? 'Red' : 'Black';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      {!ctx.gameover && (
        <Typography sx={{color: 'rgba(255,255,255,0.7)', fontSize: 14}}>
          {currentTurnLabel} &mdash; You are{' '}
          <Box
            component="span"
            sx={{
              color: playerID === '0' ? PIECE_RED : '#999',
              fontWeight: 700,
            }}
          >
            {playerColor}
          </Box>
        </Typography>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${SIZE}, 56px)`,
          gridTemplateRows: `repeat(${SIZE}, 56px)`,
          borderRadius: '8px',
          overflow: 'hidden',
          border: '3px solid #5C3A0A',
        }}
      >
        {G.board.map((row, r) =>
          row.map((cell, c) => {
            const isDark = (r + c) % 2 === 1;
            const isSelected = selected && selected.r === r && selected.c === c;
            const isValidDest = validDestinations.has(`${r},${c}`);

            return (
              <Box
                key={`${r}-${c}`}
                onClick={() => handleCellClick(r, c)}
                sx={{
                  width: 56,
                  height: 56,
                  background: isDark ? DARK_SQUARE : LIGHT_SQUARE,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor:
                    isActive &&
                    (isValidDest || (cell && belongsTo(cell, playerID)))
                      ? 'pointer'
                      : 'default',
                  position: 'relative',
                  boxShadow: isSelected
                    ? 'inset 0 0 0 3px rgba(108, 99, 255, 0.8)'
                    : 'none',
                }}
              >
                {/* Valid move indicator */}
                {isValidDest && !cell && (
                  <Box
                    sx={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: 'rgba(108, 99, 255, 0.5)',
                    }}
                  />
                )}

                {/* Piece */}
                {cell && (
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: isRed(cell) ? PIECE_RED : PIECE_BLACK,
                      border: `3px solid ${isRed(cell) ? '#B71C1C' : '#111'}`,
                      boxShadow: isSelected
                        ? '0 0 12px rgba(108, 99, 255, 0.6)'
                        : '0 2px 4px rgba(0,0,0,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'box-shadow 0.2s',
                    }}
                  >
                    {isKing(cell) && (
                      <Typography
                        sx={{
                          fontSize: 18,
                          color: isRed(cell) ? '#FFD54F' : '#FFD54F',
                          fontWeight: 700,
                          lineHeight: 1,
                          userSelect: 'none',
                        }}
                      >
                        &#9813;
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            );
          })
        )}
      </Box>

      {/* Piece counts */}
      <Box sx={{display: 'flex', gap: 3}}>
        <Typography sx={{color: PIECE_RED, fontSize: 14}}>
          Red: {countPieces(G.board, '0')}
        </Typography>
        <Typography sx={{color: '#999', fontSize: 14}}>
          Black: {countPieces(G.board, '1')}
        </Typography>
      </Box>

      {ctx.gameover && (
        <Typography
          sx={{
            color: ctx.gameover.winner === playerID ? '#4CAF50' : '#FF6B6B',
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          {ctx.gameover.winner === playerID ? 'You win!' : 'You lose!'}
        </Typography>
      )}
    </Box>
  );
}

export default CheckersGame;
export {CheckersBoard};
