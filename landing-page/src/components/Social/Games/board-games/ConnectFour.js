import {Box, Typography} from '@mui/material';
import {INVALID_MOVE} from 'boardgame.io/core';
import React, {useMemo} from 'react';

const ROWS = 6;
const COLS = 7;

function createEmptyBoard() {
  return Array.from({length: ROWS}, () => Array(COLS).fill(null));
}

function checkWin(board) {
  // Horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const v = board[r][c];
      if (
        v !== null &&
        v === board[r][c + 1] &&
        v === board[r][c + 2] &&
        v === board[r][c + 3]
      ) {
        return {
          winner: v,
          cells: [
            [r, c],
            [r, c + 1],
            [r, c + 2],
            [r, c + 3],
          ],
        };
      }
    }
  }
  // Vertical
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c];
      if (
        v !== null &&
        v === board[r + 1][c] &&
        v === board[r + 2][c] &&
        v === board[r + 3][c]
      ) {
        return {
          winner: v,
          cells: [
            [r, c],
            [r + 1, c],
            [r + 2, c],
            [r + 3, c],
          ],
        };
      }
    }
  }
  // Diagonal down-right
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const v = board[r][c];
      if (
        v !== null &&
        v === board[r + 1][c + 1] &&
        v === board[r + 2][c + 2] &&
        v === board[r + 3][c + 3]
      ) {
        return {
          winner: v,
          cells: [
            [r, c],
            [r + 1, c + 1],
            [r + 2, c + 2],
            [r + 3, c + 3],
          ],
        };
      }
    }
  }
  // Diagonal down-left
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 3; c < COLS; c++) {
      const v = board[r][c];
      if (
        v !== null &&
        v === board[r + 1][c - 1] &&
        v === board[r + 2][c - 2] &&
        v === board[r + 3][c - 3]
      ) {
        return {
          winner: v,
          cells: [
            [r, c],
            [r + 1, c - 1],
            [r + 2, c - 2],
            [r + 3, c - 3],
          ],
        };
      }
    }
  }
  return null;
}

function isBoardFull(board) {
  return board[0].every((cell) => cell !== null);
}

const ConnectFourGame = {
  name: 'connect-four',

  setup: () => ({
    board: createEmptyBoard(),
    lastDrop: null,
  }),

  moves: {
    dropPiece: ({G, playerID}, col) => {
      if (col < 0 || col >= COLS) return INVALID_MOVE;
      // Find lowest empty row in column
      let targetRow = -1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (G.board[r][col] === null) {
          targetRow = r;
          break;
        }
      }
      if (targetRow === -1) return INVALID_MOVE;
      G.board[targetRow][col] = playerID;
      G.lastDrop = {row: targetRow, col};
    },
  },

  endIf: ({G}) => {
    const result = checkWin(G.board);
    if (result) {
      return {winner: result.winner, winCells: result.cells};
    }
    if (isBoardFull(G.board)) {
      return {draw: true};
    }
  },

  turn: {minMoves: 1, maxMoves: 1},

  // AI move enumeration — see TicTacToe.ai.enumerate for rationale.
  // A column is playable iff its topmost cell (row 0) is empty.
  ai: {
    enumerate: (G) => {
      const moves = [];
      for (let col = 0; col < COLS; col++) {
        if (G.board[0][col] === null) {
          moves.push({move: 'dropPiece', args: [col]});
        }
      }
      return moves;
    },
  },
};

const PLAYER_COLORS = {
  0: '#FF6B6B',
  1: '#FFAB00',
};

function ConnectFourBoard({G, ctx, moves, playerID, isActive}) {
  const winCells = useMemo(() => {
    if (!ctx.gameover?.winCells) return new Set();
    return new Set(ctx.gameover.winCells.map(([r, c]) => `${r},${c}`));
  }, [ctx.gameover]);

  const isWinCell = (r, c) => winCells.has(`${r},${c}`);

  const handleColumnClick = (col) => {
    if (!isActive) return;
    if (G.board[0][col] !== null) return;
    moves.dropPiece(col);
  };

  const currentTurnLabel =
    ctx.currentPlayer === playerID ? 'Your turn' : "Opponent's turn";

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
              bgcolor: PLAYER_COLORS[playerID],
              verticalAlign: 'middle',
              ml: 0.5,
            }}
          />
        </Typography>
      )}

      {/* Column drop buttons */}
      <Box sx={{display: 'flex', gap: '4px', mb: -1}}>
        {Array.from({length: COLS}, (_, col) => (
          <Box
            key={col}
            onClick={() => handleColumnClick(col)}
            sx={{
              width: 56,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor:
                isActive && G.board[0][col] === null ? 'pointer' : 'default',
              borderRadius: '8px 8px 0 0',
              background:
                isActive && G.board[0][col] === null
                  ? 'rgba(108, 99, 255, 0.2)'
                  : 'transparent',
              transition: 'background 0.2s',
              '&:hover':
                isActive && G.board[0][col] === null
                  ? {background: 'rgba(108, 99, 255, 0.4)'}
                  : {},
            }}
          >
            {isActive && G.board[0][col] === null && (
              <Typography sx={{color: 'rgba(255,255,255,0.4)', fontSize: 18}}>
                &#9660;
              </Typography>
            )}
          </Box>
        ))}
      </Box>

      {/* Board grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, 56px)`,
          gridTemplateRows: `repeat(${ROWS}, 56px)`,
          gap: '4px',
          background: '#0D47A1',
          borderRadius: '12px',
          p: '8px',
        }}
      >
        {G.board.map((row, r) =>
          row.map((cell, c) => (
            <Box
              key={`${r}-${c}`}
              onClick={() => handleColumnClick(c)}
              sx={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: cell === null ? '#e8e8e8' : PLAYER_COLORS[cell],
                border: isWinCell(r, c)
                  ? '3px solid #fff'
                  : '2px solid rgba(0,0,0,0.2)',
                boxShadow:
                  cell !== null
                    ? `inset 0 -3px 6px rgba(0,0,0,0.25)${isWinCell(r, c) ? `, 0 0 16px ${PLAYER_COLORS[cell]}` : ''}`
                    : 'inset 0 3px 6px rgba(0,0,0,0.1)',
                cursor:
                  isActive && G.board[0][c] === null ? 'pointer' : 'default',
                transition: 'all 0.3s ease',
                ...(G.lastDrop && G.lastDrop.row === r && G.lastDrop.col === c
                  ? {
                      animation: 'dropIn 0.3s ease-out',
                      '@keyframes dropIn': {
                        '0%': {transform: 'translateY(-200px)', opacity: 0.5},
                        '100%': {transform: 'translateY(0)', opacity: 1},
                      },
                    }
                  : {}),
              }}
            />
          ))
        )}
      </Box>

      {ctx.gameover && (
        <Typography
          sx={{
            color: ctx.gameover.draw
              ? 'rgba(255,255,255,0.7)'
              : PLAYER_COLORS[ctx.gameover.winner],
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          {ctx.gameover.draw
            ? "It's a draw!"
            : ctx.gameover.winner === playerID
              ? 'You win!'
              : 'You lose!'}
        </Typography>
      )}
    </Box>
  );
}

export default ConnectFourGame;
export {ConnectFourBoard};
