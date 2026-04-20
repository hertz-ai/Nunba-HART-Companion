import AdultGameShell from './AdultGameShell';
import AdultLobby from './AdultLobby';
import {LiveScoreBar, MultiplayerResults} from './AdultScoreboard';
import BoardGameEngine from './engines/BoardGameEngine';
import PhaserGameBridge from './engines/PhaserGameBridge';
import SudokuEngine from './engines/SudokuEngine';
import TriviaEngine from './engines/TriviaEngine';
import WordScrambleEngine from './engines/WordScrambleEngine';
import WordSearchEngine from './engines/WordSearchEngine';

import {LOCAL_CATALOG} from '../../../hooks/useGameCatalog';
import {gamesApi} from '../../../services/socialApi';
import {RADIUS} from '../../../theme/socialTokens';
import {animFadeInUp} from '../../../utils/animations';
import useMultiplayerSync from '../KidsLearning/shared/useMultiplayerSync';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {Box, Typography, CircularProgress, Button} from '@mui/material';
import React, {useState, useEffect, useMemo} from 'react';
import {useParams, useNavigate} from 'react-router-dom';

// ─── Engine placeholder for engines not yet implemented ───
function EnginePlaceholder({label}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 300,
        borderRadius: RADIUS.lg,
        bgcolor: 'rgba(108,99,255,0.08)',
        border: '1px dashed rgba(108,99,255,0.3)',
        p: 4,
      }}
    >
      <Typography variant="h6" sx={{color: '#aaa'}}>
        {label}
      </Typography>
    </Box>
  );
}

// ─── Resolve catalog engine string to the correct renderer ───
function renderEngine(engine, props) {
  switch (engine) {
    case 'opentdb_trivia':
    case 'trivia':
      return <TriviaEngine {...props} />;
    case 'boardgame':
      return <BoardGameEngine {...props} />;
    case 'phaser':
      return (
        <PhaserGameBridge
          sceneId={props.catalogEntry?.engine_config?.scene_id || 'snake'}
          config={props.catalogEntry?.engine_config || {}}
          multiplayer={props.multiplayer}
          onScoreUpdate={(score) =>
            props.multiplayer?.submitMove?.({action: 'score_update', score})
          }
          onGameComplete={(finalScore) => {
            props.multiplayer?.submitFinalScore?.({
              correct: finalScore,
              total: finalScore,
            });
            props.onComplete?.();
          }}
        />
      );
    case 'word_scramble':
      return <WordScrambleEngine {...props} />;
    case 'word_search':
      return <WordSearchEngine {...props} />;
    case 'sudoku':
      return <SudokuEngine {...props} />;
    default:
      return <EnginePlaceholder label={`Unknown engine: ${engine}`} />;
  }
}

// ─── UUID v4 pattern for distinguishing session IDs from catalog slugs ───
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function UnifiedGameScreen() {
  const {gameId} = useParams();
  const navigate = useNavigate();

  // ── State ──
  const [phase, setPhase] = useState('loading'); // loading | lobby | playing | complete
  const [catalogEntry, setCatalogEntry] = useState(null);
  const [error, setError] = useState(null);

  // ── Multiplayer hook ──
  const multiplayer = useMultiplayerSync({
    gameConfigId: catalogEntry?.id || gameId,
    gameTitle: catalogEntry?.title || 'Game',
    gameType: catalogEntry?.engine || 'trivia',
    enabled: true,
  });

  // ── Resolve gameId into a catalog entry ──
  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      setPhase('loading');
      setError(null);
      setCatalogEntry(null);

      try {
        if (UUID_RE.test(gameId)) {
          // It looks like a session UUID — fetch the session directly
          const sessionRes = await gamesApi.get(gameId);
          const session = sessionRes?.data?.data || sessionRes?.data;
          if (!session) throw new Error('Session not found');

          // The session should carry catalog metadata (engine, title, etc.)
          setCatalogEntry({
            id: session.catalog_id || session.game_config_id || gameId,
            engine: session.engine || session.game_type || 'trivia',
            engine_config: session.engine_config || session.config || {},
            title: session.title || session.game_title || 'Game',
            ...session,
          });
        } else {
          // Treat as catalog slug — try API first, fall back to local catalog
          let resolved = null;
          try {
            const catRes = await gamesApi.catalog({id: gameId});
            const entry = catRes?.data?.data || catRes?.data;
            if (entry) {
              resolved = Array.isArray(entry)
                ? entry.find((e) => e.id === gameId || e.slug === gameId) ||
                  entry[0]
                : entry;
            }
          } catch {
            // API unavailable (401, network error, etc.) — fall through to local catalog
          }

          // Fall back to client-side LOCAL_CATALOG (same source GameHub uses)
          if (!resolved) {
            const CATEGORY_TO_ENGINE = {
              board: 'boardgame',
              arcade: 'phaser',
              trivia: 'trivia',
              word: 'word_scramble',
              puzzle: 'sudoku',
              party: 'trivia',
            };
            const local = LOCAL_CATALOG.find((g) => g.id === gameId);
            if (local) {
              resolved = {
                ...local,
                title: local.name,
                engine: CATEGORY_TO_ENGINE[local.category] || local.category,
                engine_config:
                  local.category === 'arcade' ? {scene_id: local.id} : {},
              };
            }
          }

          if (!resolved) throw new Error('Game not found in catalog');
          setCatalogEntry(resolved);
        }

        if (!cancelled) setPhase('lobby');
      } catch (err) {
        if (!cancelled) {
          console.error('[UnifiedGameScreen] resolve error:', err);
          setError(
            err?.response?.data?.message || err.message || 'Failed to load game'
          );
          setPhase('loading'); // stay on loading screen with error
        }
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  // ── React to multiplayer status changes ──
  useEffect(() => {
    if (!multiplayer) return;

    const {status} = multiplayer;
    if (status === 'playing' && phase === 'lobby') {
      setPhase('playing');
    } else if (status === 'complete' && phase === 'playing') {
      setPhase('complete');
    }
  }, [multiplayer?.status, phase]);

  // ── Handlers ──
  const handleGameStart = () => setPhase('playing');
  const handleGameComplete = () => setPhase('complete');
  const handleBack = () => navigate('/social/games');
  const handlePlayAgain = () => setPhase('lobby');

  // ── Engine props (memoized) ──
  const engineProps = useMemo(
    () => ({
      multiplayer,
      catalogEntry,
      onComplete: handleGameComplete,
    }),
    [multiplayer, catalogEntry]
  );

  // ── Loading state ──
  if (phase === 'loading') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          gap: 2,
          ...animFadeInUp(),
        }}
      >
        {error ? (
          <>
            <Typography variant="h6" color="error">
              {error}
            </Typography>
            <Button
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={handleBack}
              sx={{mt: 2, borderRadius: RADIUS.md}}
            >
              Back to Games
            </Button>
          </>
        ) : (
          <>
            <CircularProgress sx={{color: '#6C63FF'}} />
            <Typography variant="body2" sx={{color: '#aaa'}}>
              Loading game...
            </Typography>
          </>
        )}
      </Box>
    );
  }

  // ── Lobby phase ──
  if (phase === 'lobby') {
    return (
      <Box sx={{...animFadeInUp()}}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={handleBack}
          sx={{mb: 2, color: '#aaa', textTransform: 'none'}}
        >
          Back to Games
        </Button>

        <AdultLobby
          multiplayer={multiplayer}
          onStartSolo={handleGameStart}
          onGameStart={handleGameStart}
          gameTitle={catalogEntry?.title || 'Game'}
        />
      </Box>
    );
  }

  // ── Playing phase ──
  if (phase === 'playing') {
    return (
      <Box sx={{...animFadeInUp()}}>
        <AdultGameShell
          title={catalogEntry?.title || 'Game'}
          onBack={handleBack}
          multiplayerBar={
            multiplayer?.isMultiplayer ? (
              <LiveScoreBar multiplayer={multiplayer} />
            ) : null
          }
        >
          {renderEngine(catalogEntry?.engine, engineProps)}
        </AdultGameShell>
      </Box>
    );
  }

  // ── Complete phase ──
  if (phase === 'complete') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          py: 4,
          ...animFadeInUp(),
        }}
      >
        <MultiplayerResults multiplayer={multiplayer} />

        <Box sx={{display: 'flex', gap: 2, mt: 2}}>
          <Button
            variant="outlined"
            onClick={handlePlayAgain}
            sx={{borderRadius: RADIUS.md, textTransform: 'none'}}
          >
            Play Again
          </Button>
          <Button
            variant="contained"
            onClick={handleBack}
            sx={{
              borderRadius: RADIUS.md,
              textTransform: 'none',
              bgcolor: '#6C63FF',
              '&:hover': {bgcolor: '#5A52E0'},
            }}
          >
            Back to Games
          </Button>
        </Box>
      </Box>
    );
  }

  return null;
}
