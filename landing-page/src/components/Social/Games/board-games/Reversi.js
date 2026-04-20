import {Box, Typography} from '@mui/material';
import {INVALID_MOVE} from 'boardgame.io/core';
import React, {useMemo} from 'react';

const SIZE = 8;
const DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

function createInitialBoard() {
  const board = Array.from({length: SIZE}, () => Array(SIZE).fill(null));
  // Standard starting position
  board[3][3] = '1'; // white
  board[3][4] = '0'; // black
  board[4][3] = '0'; // black
  board[4][4] = '1'; // white
  return board;
}

function getFlips(board, r, c, playerID) {
  if (board[r][c] !== null) return [];
  const opponentID = playerID === '0' ? '1' : '0';
  const allFlips = [];

  for (const [dr, dc] of DIRECTIONS) {
    const flips = [];
    let cr = r + dr;
    let cc = c + dc;

    while (
      cr >= 0 &&
      cr < SIZE &&
      cc >= 0 &&
      cc < SIZE &&
      board[cr][cc] === opponentID
    ) {
      flips.push([cr, cc]);
      cr += dr;
      cc += dc;
    }

    // Valid only if we ended on a friendly piece and flipped at least one
    if (
      flips.length > 0 &&
      cr >= 0 &&
      cr < SIZE &&
      cc >= 0 &&
      cc < SIZE &&
      board[cr][cc] === playerID
    ) {
      allFlips.push(...flips);
    }
  }

  return allFlips;
}

function getValidMoves(board, playerID) {
  const moves = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === null) {
        const flips = getFlips(board, r, c, playerID);
        if (flips.length > 0) {
          moves.push({r, c, flips});
        }
      }
    }
  }
  return moves;
}

function countPieces(board) {
  let black = 0;
  let white = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === '0') black++;
      else if (board[r][c] === '1') white++;
    }
  }
  return {black, white};
}

const ReversiGame = {
  name: 'reversi',

  setup: () => ({
    board: createInitialBoard(),
    passCount: 0,
  }),

  moves: {
    placePiece: ({G, playerID}, r, c) => {
      const flips = getFlips(G.board, r, c, playerID);
      if (flips.length === 0) return INVALID_MOVE;

      G.board[r][c] = playerID;
      for (const [fr, fc] of flips) {
        G.board[fr][fc] = playerID;
      }
      G.passCount = 0;
    },

    pass: ({G, playerID}) => {
      // Only valid if player has no valid moves
      const moves = getValidMoves(G.board, playerID);
      if (moves.length > 0) return INVALID_MOVE;
      G.passCount++;
    },
  },

  endIf: ({G}) => {
    // Game ends when both players pass (no valid moves for either)
    if (G.passCount >= 2) {
      const {black, white} = countPieces(G.board);
      if (black > white) return {winner: '0'};
      if (white > black) return {winner: '1'};
      return {draw: true};
    }

    // Also check if board is full
    let emptyCells = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (G.board[r][c] === null) emptyCells++;
      }
    }
    if (emptyCells === 0) {
      const {black, white} = countPieces(G.board);
      if (black > white) return {winner: '0'};
      if (white > black) return {winner: '1'};
      return {draw: true};
    }
  },

  turn: {
    minMoves: 1,
    maxMoves: 1,
    onBegin: ({G, ctx, events}) => {
      // If current player has no valid moves, auto-pass
      const validMoves = getValidMoves(G.board, ctx.currentPlayer);
      if (validMoves.length === 0) {
        G.passCount++;
        events.endTurn();
      }
    },
  },

  // AI move enumeration — uses the same getValidMoves helper that
  // the UI and onBegin auto-pass use, so there's exactly one
  // source of truth for "what's a legal move". Empty list = pass.
  //
  // Defense in depth: the turn.onBegin above auto-passes when no
  // valid moves exist, so in normal play the bot is never asked to
  // enumerate in the no-moves state — onBegin fires first. But we
  // still emit the pass move here so the bot never sees an empty
  // enumeration (which would break MCTSBot's selection step). Do
  // NOT remove without also confirming onBegin stays authoritative.
  ai: {
    enumerate: (G, ctx) => {
      const validMoves = getValidMoves(G.board, ctx.currentPlayer);
      if (validMoves.length === 0) {
        return [{move: 'pass', args: []}];
      }
      return validMoves.map((m) => ({move: 'placePiece', args: [m.r, m.c]}));
    },
  },
};

const BOARD_GREEN = '#2E7D32';
const BLACK_PIECE = '#333';
const WHITE_PIECE = '#fff';

function ReversiBoard({G, ctx, moves, playerID, isActive}) {
  const validMoves = useMemo(() => {
    if (!isActive) return new Set();
    const movesArr = getValidMoves(G.board, playerID);
    return new Set(movesArr.map((m) => `${m.r},${m.c}`));
  }, [G.board, playerID, isActive]);

  const {black, white} = useMemo(() => countPieces(G.board), [G.board]);

  const handleCellClick = (r, c) => {
    if (!isActive) return;
    if (!validMoves.has(`${r},${c}`)) return;
    moves.placePiece(r, c);
  };

  const currentTurnLabel =
    ctx.currentPlayer === playerID ? 'Your turn' : "Opponent's turn";
  const playerLabel = playerID === '0' ? 'Black' : 'White';

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
              display: 'inline-block',
              width: 14,
              height: 14,
              borderRadius: '50%',
              bgcolor: playerID === '0' ? BLACK_PIECE : WHITE_PIECE,
              border: '1px solid rgba(255,255,255,0.3)',
              verticalAlign: 'middle',
              ml: 0.5,
            }}
          />
          <Box component="span" sx={{ml: 0.5}}>
            {playerLabel}
          </Box>
        </Typography>
      )}

      {/* Score */}
      <Box sx={{display: 'flex', gap: 3, alignItems: 'center'}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
          <Box
            sx={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              bgcolor: BLACK_PIECE,
              border: '1px solid rgba(255,255,255,0.3)',
            }}
          />
          <Typography sx={{color: '#fff', fontWeight: 700}}>{black}</Typography>
        </Box>
        <Typography sx={{color: 'rgba(255,255,255,0.4)'}}>vs</Typography>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
          <Box
            sx={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              bgcolor: WHITE_PIECE,
            }}
          />
          <Typography sx={{color: '#fff', fontWeight: 700}}>{white}</Typography>
        </Box>
      </Box>

      {/* Board */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${SIZE}, 52px)`,
          gridTemplateRows: `repeat(${SIZE}, 52px)`,
          gap: '2px',
          background: '#1B5E20',
          borderRadius: '8px',
          p: '4px',
          border: '3px solid #1B5E20',
        }}
      >
        {G.board.map((row, r) =>
          row.map((cell, c) => {
            const isValid = validMoves.has(`${r},${c}`);

            return (
              <Box
                key={`${r}-${c}`}
                onClick={() => handleCellClick(r, c)}
                sx={{
                  width: 50,
                  height: 50,
                  background: BOARD_GREEN,
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isValid ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                  '&:hover': isValid ? {background: '#388E3C'} : {},
                }}
              >
                {cell !== null ? (
                  <Box
                    sx={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: cell === '0' ? BLACK_PIECE : WHITE_PIECE,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                      border:
                        cell === '1' ? '1px solid rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.3s ease',
                    }}
                  />
                ) : isValid ? (
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.3)',
                    }}
                  />
                ) : null}
              </Box>
            );
          })
        )}
      </Box>

      {ctx.gameover && (
        <Box sx={{textAlign: 'center'}}>
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: 18,
              color: ctx.gameover.draw
                ? 'rgba(255,255,255,0.7)'
                : ctx.gameover.winner === playerID
                  ? '#4CAF50'
                  : '#FF6B6B',
            }}
          >
            {ctx.gameover.draw
              ? "It's a draw!"
              : ctx.gameover.winner === playerID
                ? 'You win!'
                : 'You lose!'}
          </Typography>
          <Typography
            sx={{color: 'rgba(255,255,255,0.5)', fontSize: 14, mt: 0.5}}
          >
            Final score: Black {black} &mdash; White {white}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default ReversiGame;
export {ReversiBoard};
