import {Box, Typography} from '@mui/material';
import {INVALID_MOVE} from 'boardgame.io/core';
import React from 'react';

const PITS_PER_SIDE = 6;
const INITIAL_STONES = 4;

// Board layout:
//   [Store1] [5][4][3][2][1][0]   <- Player 1's side (indices 7-12, store=13)
//            [0][1][2][3][4][5]   <- Player 0's side (indices 0-5, store=6)
//                          [Store0]
//
// Internal representation:
//   pits: [0..5] = player 0's pits
//   pits: [7..12] = player 1's pits
//   pits: [6] = player 0's store
//   pits: [13] = player 1's store

const STORE_0 = 6;
const STORE_1 = 13;
const TOTAL_PITS = 14;

function createInitialPits() {
  const pits = Array(TOTAL_PITS).fill(INITIAL_STONES);
  pits[STORE_0] = 0;
  pits[STORE_1] = 0;
  return pits;
}

function getPlayerPitRange(playerID) {
  if (playerID === '0') return {start: 0, end: 5, store: STORE_0};
  return {start: 7, end: 12, store: STORE_1};
}

function getOppositeIndex(index) {
  // Pits 0-5 are opposite to 12-7
  return 12 - index;
}

function playerSideEmpty(pits, playerID) {
  const {start, end} = getPlayerPitRange(playerID);
  for (let i = start; i <= end; i++) {
    if (pits[i] > 0) return false;
  }
  return true;
}

const MancalaGame = {
  name: 'mancala',

  setup: () => ({
    pits: createInitialPits(),
    lastLandedInStore: false,
  }),

  moves: {
    sowStones: ({G, playerID, events}, pitIndex) => {
      const {start, end, store} = getPlayerPitRange(playerID);
      const opponentStore = playerID === '0' ? STORE_1 : STORE_0;

      // Validate: must be on player's side and have stones
      if (pitIndex < start || pitIndex > end) return INVALID_MOVE;
      if (G.pits[pitIndex] === 0) return INVALID_MOVE;

      let stones = G.pits[pitIndex];
      G.pits[pitIndex] = 0;

      let current = pitIndex;
      while (stones > 0) {
        current = (current + 1) % TOTAL_PITS;
        // Skip opponent's store
        if (current === opponentStore) continue;
        G.pits[current]++;
        stones--;
      }

      // Rule: last stone lands in your store = extra turn
      if (current === store) {
        G.lastLandedInStore = true;
        // Don't end turn -- player gets another move
        return;
      }

      // Rule: last stone in empty pit on your side = capture
      if (current >= start && current <= end && G.pits[current] === 1) {
        const oppositeIdx = getOppositeIndex(current);
        if (G.pits[oppositeIdx] > 0) {
          G.pits[store] += G.pits[oppositeIdx] + 1;
          G.pits[oppositeIdx] = 0;
          G.pits[current] = 0;
        }
      }

      G.lastLandedInStore = false;
      events.endTurn();
    },
  },

  endIf: ({G}) => {
    const side0Empty = playerSideEmpty(G.pits, '0');
    const side1Empty = playerSideEmpty(G.pits, '1');

    if (side0Empty || side1Empty) {
      // Sweep remaining stones into respective stores
      const finalPits = [...G.pits];
      for (let i = 0; i <= 5; i++) {
        finalPits[STORE_0] += finalPits[i];
        finalPits[i] = 0;
      }
      for (let i = 7; i <= 12; i++) {
        finalPits[STORE_1] += finalPits[i];
        finalPits[i] = 0;
      }

      if (finalPits[STORE_0] > finalPits[STORE_1]) return {winner: '0'};
      if (finalPits[STORE_1] > finalPits[STORE_0]) return {winner: '1'};
      return {draw: true};
    }
  },

  turn: {minMoves: 1, maxMoves: 1},

  // AI move enumeration — a pit is playable iff it's on the current
  // player's side and has stones (moves.sowStones validates the same
  // invariants). The boardgame.io AI framework passes the current
  // player via ctx.currentPlayer.
  ai: {
    enumerate: (G, ctx) => {
      const {start, end} = getPlayerPitRange(ctx.currentPlayer);
      const moves = [];
      for (let pit = start; pit <= end; pit++) {
        if (G.pits[pit] > 0) {
          moves.push({move: 'sowStones', args: [pit]});
        }
      }
      return moves;
    },
  },
};

const WOOD_BG = '#8B6914';
const WOOD_DARK = '#6B4F10';
const PIT_BG = '#5C3A0A';
const STONE_COLORS = [
  '#E57373',
  '#64B5F6',
  '#81C784',
  '#FFD54F',
  '#CE93D8',
  '#4DD0E1',
];

function StoneCircle({count, size = 'normal'}) {
  if (count === 0) return null;

  const maxDisplay = size === 'large' ? 20 : 8;
  const displayCount = Math.min(count, maxDisplay);
  const stoneSize = size === 'large' ? 10 : 8;

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '2px',
        p: 0.5,
      }}
    >
      {Array.from({length: displayCount}, (_, i) => (
        <Box
          key={i}
          sx={{
            width: stoneSize,
            height: stoneSize,
            borderRadius: '50%',
            background: STONE_COLORS[i % STONE_COLORS.length],
            boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
          }}
        />
      ))}
      {count > maxDisplay && (
        <Typography sx={{fontSize: 9, color: 'rgba(255,255,255,0.6)'}}>
          +{count - maxDisplay}
        </Typography>
      )}
    </Box>
  );
}

function MancalaBoard({G, ctx, moves, playerID, isActive}) {
  const {start, end} = getPlayerPitRange(playerID);

  const handlePitClick = (pitIndex) => {
    if (!isActive) return;
    if (G.pits[pitIndex] === 0) return;
    moves.sowStones(pitIndex);
  };

  const currentTurnLabel =
    ctx.currentPlayer === playerID ? 'Your turn' : "Opponent's turn";

  // Display: Player 0's pits on bottom, Player 1's pits on top (reversed)
  const topRow = [12, 11, 10, 9, 8, 7]; // Player 1's pits (displayed right-to-left)
  const bottomRow = [0, 1, 2, 3, 4, 5]; // Player 0's pits

  const isMyPit = (idx) => idx >= start && idx <= end;

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
          {currentTurnLabel}
          {G.lastLandedInStore && ctx.currentPlayer === playerID && (
            <Box component="span" sx={{color: '#4CAF50', ml: 1}}>
              Extra turn!
            </Box>
          )}
        </Typography>
      )}

      {/* Mancala board */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'stretch',
          background: `linear-gradient(135deg, ${WOOD_BG}, ${WOOD_DARK})`,
          borderRadius: '24px',
          p: 2,
          gap: 1.5,
          border: '3px solid #5C3A0A',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
      >
        {/* Player 1's store (left side) */}
        <Box
          sx={{
            width: 64,
            minHeight: 140,
            background: PIT_BG,
            borderRadius: '32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 1,
          }}
        >
          <Typography
            sx={{color: 'rgba(255,255,255,0.5)', fontSize: 10, mb: 0.5}}
          >
            P2
          </Typography>
          <Typography sx={{color: '#fff', fontWeight: 700, fontSize: 20}}>
            {G.pits[STORE_1]}
          </Typography>
          <StoneCircle count={G.pits[STORE_1]} size="large" />
        </Box>

        {/* Center pits */}
        <Box sx={{display: 'flex', flexDirection: 'column', gap: 1.5}}>
          {/* Top row: Player 1's pits */}
          <Box sx={{display: 'flex', gap: 1}}>
            {topRow.map((pitIdx) => (
              <Box
                key={pitIdx}
                onClick={() => isMyPit(pitIdx) && handlePitClick(pitIdx)}
                sx={{
                  width: 56,
                  height: 64,
                  background: PIT_BG,
                  borderRadius: '50%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor:
                    isActive && isMyPit(pitIdx) && G.pits[pitIdx] > 0
                      ? 'pointer'
                      : 'default',
                  transition: 'all 0.2s',
                  border:
                    isActive && isMyPit(pitIdx) && G.pits[pitIdx] > 0
                      ? '2px solid rgba(108, 99, 255, 0.4)'
                      : '2px solid transparent',
                  '&:hover':
                    isActive && isMyPit(pitIdx) && G.pits[pitIdx] > 0
                      ? {
                          background: '#7B4A1A',
                          border: '2px solid rgba(108, 99, 255, 0.8)',
                        }
                      : {},
                }}
              >
                <Typography sx={{color: '#fff', fontWeight: 700, fontSize: 16}}>
                  {G.pits[pitIdx]}
                </Typography>
                <StoneCircle count={G.pits[pitIdx]} />
              </Box>
            ))}
          </Box>

          {/* Bottom row: Player 0's pits */}
          <Box sx={{display: 'flex', gap: 1}}>
            {bottomRow.map((pitIdx) => (
              <Box
                key={pitIdx}
                onClick={() => isMyPit(pitIdx) && handlePitClick(pitIdx)}
                sx={{
                  width: 56,
                  height: 64,
                  background: PIT_BG,
                  borderRadius: '50%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor:
                    isActive && isMyPit(pitIdx) && G.pits[pitIdx] > 0
                      ? 'pointer'
                      : 'default',
                  transition: 'all 0.2s',
                  border:
                    isActive && isMyPit(pitIdx) && G.pits[pitIdx] > 0
                      ? '2px solid rgba(108, 99, 255, 0.4)'
                      : '2px solid transparent',
                  '&:hover':
                    isActive && isMyPit(pitIdx) && G.pits[pitIdx] > 0
                      ? {
                          background: '#7B4A1A',
                          border: '2px solid rgba(108, 99, 255, 0.8)',
                        }
                      : {},
                }}
              >
                <Typography sx={{color: '#fff', fontWeight: 700, fontSize: 16}}>
                  {G.pits[pitIdx]}
                </Typography>
                <StoneCircle count={G.pits[pitIdx]} />
              </Box>
            ))}
          </Box>
        </Box>

        {/* Player 0's store (right side) */}
        <Box
          sx={{
            width: 64,
            minHeight: 140,
            background: PIT_BG,
            borderRadius: '32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 1,
          }}
        >
          <Typography
            sx={{color: 'rgba(255,255,255,0.5)', fontSize: 10, mb: 0.5}}
          >
            P1
          </Typography>
          <Typography sx={{color: '#fff', fontWeight: 700, fontSize: 20}}>
            {G.pits[STORE_0]}
          </Typography>
          <StoneCircle count={G.pits[STORE_0]} size="large" />
        </Box>
      </Box>

      {/* Score summary */}
      <Box sx={{display: 'flex', gap: 3}}>
        <Typography sx={{color: '#64B5F6', fontSize: 14}}>
          Player 1 (You): {G.pits[STORE_0]}
        </Typography>
        <Typography sx={{color: '#FF8A65', fontSize: 14}}>
          Player 2: {G.pits[STORE_1]}
        </Typography>
      </Box>

      {ctx.gameover && (
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
      )}
    </Box>
  );
}

export default MancalaGame;
export {MancalaBoard};
