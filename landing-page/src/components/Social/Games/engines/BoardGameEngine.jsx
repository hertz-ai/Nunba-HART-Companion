import {RADIUS} from '../../../../theme/socialTokens';
import {buildSoloBotsMap, DIFFICULTY} from '../../../../utils/gameAI';
import CheckersGame, {CheckersBoard} from '../board-games/Checkers';
import ConnectFourGame, {ConnectFourBoard} from '../board-games/ConnectFour';
import MancalaGame, {MancalaBoard} from '../board-games/Mancala';
import ReversiGame, {ReversiBoard} from '../board-games/Reversi';
import TicTacToeGame, {TicTacToeBoard} from '../board-games/TicTacToe';

import {Box, Typography, Button} from '@mui/material';
import {Local} from 'boardgame.io/multiplayer';
import {Client} from 'boardgame.io/react';
import React, {useState, useMemo, useEffect, useCallback} from 'react';

const BOARD_REGISTRY = {
  tictactoe: {game: TicTacToeGame, board: TicTacToeBoard},
  connect4: {game: ConnectFourGame, board: ConnectFourBoard},
  checkers: {game: CheckersGame, board: CheckersBoard},
  reversi: {game: ReversiGame, board: ReversiBoard},
  mancala: {game: MancalaGame, board: MancalaBoard},
};

function BoardGameWrapper({children, onComplete, boardType}) {
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState(null);

  const handleGameOver = useCallback(
    (ctx) => {
      if (ctx.gameover && !gameOver) {
        setGameOver(true);
        setResult(ctx.gameover);
      }
    },
    [gameOver]
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        p: 2,
        width: '100%',
        maxWidth: 600,
        mx: 'auto',
      }}
    >
      <Typography
        variant="h5"
        sx={{color: '#fff', fontWeight: 700, textTransform: 'capitalize'}}
      >
        {boardType.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
      </Typography>

      <Box sx={{width: '100%'}}>
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(child, {onGameOver: handleGameOver})
            : child
        )}
      </Box>

      {gameOver && (
        <Box
          sx={{
            mt: 2,
            p: 3,
            borderRadius: RADIUS.lg,
            background: 'rgba(15, 14, 23, 0.95)',
            border: '1px solid rgba(108, 99, 255, 0.4)',
            textAlign: 'center',
            width: '100%',
          }}
        >
          <Typography variant="h6" sx={{color: '#fff', mb: 1}}>
            {result?.draw
              ? "It's a draw!"
              : result?.winner === '0'
                ? 'Player 1 wins!'
                : 'Player 2 wins!'}
          </Typography>
          <Button
            variant="contained"
            onClick={onComplete}
            sx={{
              mt: 1,
              bgcolor: '#6C63FF',
              borderRadius: RADIUS.md,
              '&:hover': {bgcolor: '#5A52E0'},
            }}
          >
            Back to Games
          </Button>
        </Box>
      )}
    </Box>
  );
}

function GameBoardWithEndDetection({
  board: BoardComponent,
  onGameOver,
  ...props
}) {
  const {ctx} = props;

  useEffect(() => {
    if (ctx?.gameover && onGameOver) {
      onGameOver(ctx);
    }
  }, [ctx?.gameover, onGameOver, ctx]);

  return <BoardComponent {...props} />;
}

export default function BoardGameEngine({
  multiplayer,
  catalogEntry,
  onComplete,
  difficulty = DIFFICULTY.MEDIUM,
  soloMode = 'ai',  // 'ai' | 'hotseat' — how solo play is handled
}) {
  const boardType = catalogEntry?.engine_config?.board_type || 'tictactoe';

  // Solo mode = no server-backed multiplayer session.
  // - multiplayer hook null/absent → solo
  // - multiplayer.isMultiplayer false → hook started but no peers → solo
  //
  // `soloMode` picks between two solo experiences:
  //   'ai'      — player '1' is AI-controlled via boardgame.io/ai bots.
  //               This is the default so a lone user gets an opponent
  //               out of the box.
  //   'hotseat' — both players are human on the same device (the
  //               previous default). Preserved so two people sharing
  //               a laptop/tablet can still play without a new lobby
  //               flow. Phase 2 lobby work will expose this as a
  //               visible toggle.
  const isSolo = !multiplayer || !multiplayer.isMultiplayer;

  // Lock difficulty at mount — prevents mid-game reset if the lobby
  // Phase 2 work starts feeding a changing prop. The underlying
  // useMemo would otherwise rebuild the GameClient and blow away
  // board state.
  const [lockedDifficulty] = useState(difficulty);

  const GameClient = useMemo(() => {
    const entry = BOARD_REGISTRY[boardType];
    if (!entry) return null;

    const WrappedBoard = (props) => (
      <GameBoardWithEndDetection board={entry.board} {...props} />
    );

    // In solo mode with soloMode='ai', attach a bot for player '1'.
    // If the board type doesn't have ai.enumerate yet, buildSoloBotsMap
    // returns null and we fall back to Local() hotseat (same as when
    // soloMode='hotseat' was explicitly requested).
    const bots =
      isSolo && soloMode === 'ai'
        ? buildSoloBotsMap(boardType, lockedDifficulty)
        : null;

    return Client({
      game: entry.game,
      board: WrappedBoard,
      multiplayer: bots ? Local({bots}) : Local(),
      numPlayers: 2,
    });
  }, [boardType, isSolo, soloMode, lockedDifficulty]);

  if (!BOARD_REGISTRY[boardType]) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 300,
          gap: 2,
        }}
      >
        <Typography variant="h5" sx={{color: '#fff'}}>
          Coming Soon
        </Typography>
        <Typography sx={{color: 'rgba(255,255,255,0.5)'}}>
          The board game "{boardType}" is not yet available.
        </Typography>
        <Button
          variant="outlined"
          onClick={onComplete}
          sx={{
            color: '#6C63FF',
            borderColor: '#6C63FF',
            borderRadius: RADIUS.md,
            '&:hover': {
              borderColor: '#5A52E0',
              bgcolor: 'rgba(108,99,255,0.08)',
            },
          }}
        >
          Go Back
        </Button>
      </Box>
    );
  }

  return (
    <BoardGameWrapper onComplete={onComplete} boardType={boardType}>
      <GameClient playerID="0" />
    </BoardGameWrapper>
  );
}
