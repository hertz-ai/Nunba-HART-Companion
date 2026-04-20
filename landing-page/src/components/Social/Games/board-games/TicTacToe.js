import {Box, Typography} from '@mui/material';
import {INVALID_MOVE} from 'boardgame.io/core';
import React, {useMemo} from 'react';

const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const TicTacToeGame = {
  name: 'tic-tac-toe',

  setup: () => ({cells: Array(9).fill(null)}),

  moves: {
    clickCell: ({G, playerID}, id) => {
      if (G.cells[id] !== null) return INVALID_MOVE;
      G.cells[id] = playerID;
    },
  },

  endIf: ({G}) => {
    for (const [a, b, c] of WINNING_LINES) {
      if (
        G.cells[a] !== null &&
        G.cells[a] === G.cells[b] &&
        G.cells[a] === G.cells[c]
      ) {
        return {winner: G.cells[a], winLine: [a, b, c]};
      }
    }
    if (G.cells.every((c) => c !== null)) {
      return {draw: true};
    }
  },

  turn: {minMoves: 1, maxMoves: 1},

  // AI move enumeration — boardgame.io/ai bots (MCTSBot, RandomBot)
  // call this to discover all legal moves for the current player.
  // Source-of-truth: a cell is playable iff it's null (moves.clickCell
  // returns INVALID_MOVE otherwise). Enumerate returns {move, args}
  // objects matching the `moves` definition.
  ai: {
    enumerate: (G) => {
      const moves = [];
      for (let i = 0; i < G.cells.length; i++) {
        if (G.cells[i] === null) {
          moves.push({move: 'clickCell', args: [i]});
        }
      }
      return moves;
    },
  },
};

function TicTacToeBoard({G, ctx, moves, playerID, isActive}) {
  const winLine = useMemo(() => {
    if (!ctx.gameover?.winLine) return [];
    return ctx.gameover.winLine;
  }, [ctx.gameover]);

  const getSymbol = (cellValue) => {
    if (cellValue === '0') return 'X';
    if (cellValue === '1') return 'O';
    return '';
  };

  const getColor = (cellValue) => {
    if (cellValue === '0') return '#6C63FF';
    if (cellValue === '1') return '#FF6B6B';
    return 'transparent';
  };

  const isWinCell = (index) => winLine.includes(index);

  const handleClick = (id) => {
    if (!isActive) return;
    if (G.cells[id] !== null) return;
    moves.clickCell(id);
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
            sx={{color: getColor(playerID), fontWeight: 700}}
          >
            {getSymbol(playerID)}
          </Box>
        </Typography>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '4px',
          background: '#333',
          borderRadius: '12px',
          p: '4px',
          width: 'fit-content',
        }}
      >
        {G.cells.map((cell, i) => (
          <Box
            key={i}
            onClick={() => handleClick(i)}
            sx={{
              width: 90,
              height: 90,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isWinCell(i) ? 'rgba(108, 99, 255, 0.2)' : '#1a1a2e',
              borderRadius: '8px',
              cursor: cell === null && isActive ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              '&:hover':
                cell === null && isActive
                  ? {
                      background: '#252540',
                      boxShadow: '0 0 12px rgba(108, 99, 255, 0.3)',
                    }
                  : {},
            }}
          >
            {cell !== null && (
              <Typography
                sx={{
                  fontSize: 40,
                  fontWeight: 700,
                  color: getColor(cell),
                  lineHeight: 1,
                  userSelect: 'none',
                  textShadow: isWinCell(i)
                    ? `0 0 16px ${getColor(cell)}`
                    : 'none',
                }}
              >
                {getSymbol(cell)}
              </Typography>
            )}
          </Box>
        ))}
      </Box>

      {ctx.gameover && (
        <Typography
          sx={{
            color: ctx.gameover.draw
              ? 'rgba(255,255,255,0.7)'
              : getColor(ctx.gameover.winner),
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

export default TicTacToeGame;
export {TicTacToeBoard};
