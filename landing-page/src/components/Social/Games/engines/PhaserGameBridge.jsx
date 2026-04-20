import {Box, Typography, CircularProgress} from '@mui/material';
import React, {useEffect, useRef, useState} from 'react';

// Scene registry — lazy imports
const SCENE_REGISTRY = {
  snake: () => import('../phaser-games/SnakeScene'),
  breakout: () => import('../phaser-games/BreakoutScene'),
  pong: () => import('../phaser-games/PongScene'),
  bubble_shooter: () => import('../phaser-games/BubbleShooterScene'),
  runner: () => import('../phaser-games/RunnerScene'),
  match3: () => import('../phaser-games/Match3Scene'),
  flappy: () => import('../phaser-games/FlappyScene'),
};

export default function PhaserGameBridge({
  sceneId,
  config,
  multiplayer,
  onScoreUpdate,
  onGameComplete,
}) {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Keep callback refs stable so the bridge always uses the latest props
  const onScoreUpdateRef = useRef(onScoreUpdate);
  const onGameCompleteRef = useRef(onGameComplete);
  const configRef = useRef(config);
  const multiplayerRef = useRef(multiplayer);

  useEffect(() => {
    onScoreUpdateRef.current = onScoreUpdate;
  }, [onScoreUpdate]);
  useEffect(() => {
    onGameCompleteRef.current = onGameComplete;
  }, [onGameComplete]);
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  useEffect(() => {
    multiplayerRef.current = multiplayer;
  }, [multiplayer]);

  useEffect(() => {
    let destroyed = false;

    const boot = async () => {
      try {
        // Validate scene
        const sceneLoader = SCENE_REGISTRY[sceneId];
        if (!sceneLoader) {
          setError(`Unknown scene: "${sceneId}"`);
          setLoading(false);
          return;
        }

        // Dynamically import Phaser and the requested scene in parallel
        const [PhaserModule, sceneModule] = await Promise.all([
          import('phaser'),
          sceneLoader(),
        ]);

        if (destroyed) return;

        const Phaser = PhaserModule.default || PhaserModule;
        const SceneClass = sceneModule.default || sceneModule;

        // Measure container dimensions
        const container = containerRef.current;
        if (!container) return;
        const containerWidth = container.clientWidth || 800;
        const containerHeight = container.clientHeight || 600;

        // Create Phaser game instance
        const game = new Phaser.Game({
          type: Phaser.AUTO,
          width: containerWidth,
          height: containerHeight,
          parent: container,
          backgroundColor: '#0F0E17',
          physics: {
            default: 'arcade',
            arcade: {gravity: {y: 0}, debug: false},
          },
          scene: [SceneClass],
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
        });

        // Inject the Nunba bridge into the Phaser registry so scenes can access it
        game.registry.set('nunbaBridge', {
          onScoreUpdate: (score) => onScoreUpdateRef.current?.(score),
          onGameComplete: (finalScore) =>
            onGameCompleteRef.current?.(finalScore),
          getConfig: () => configRef.current,
          getOpponentState: () => multiplayerRef.current?.scores,
        });

        gameRef.current = game;
        setLoading(false);
      } catch (err) {
        if (!destroyed) {
          console.error('[PhaserGameBridge] Failed to initialize:', err);
          setError(err.message || 'Failed to load game engine');
          setLoading(false);
        }
      }
    };

    boot();

    return () => {
      destroyed = true;
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [sceneId]);

  if (error) {
    return (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          minHeight: 400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          bgcolor: '#0F0E17',
        }}
      >
        <Typography color="error" variant="h6">
          Failed to load game
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{mt: 1}}>
          {error}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{width: '100%', height: '100%', minHeight: 400, position: 'relative'}}
    >
      {loading && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            bgcolor: '#0F0E17',
            zIndex: 10,
          }}
        >
          <CircularProgress sx={{color: '#6C63FF', mb: 2}} />
          <Typography color="text.secondary" variant="body2">
            Loading game engine...
          </Typography>
        </Box>
      )}
      <Box
        ref={containerRef}
        sx={{width: '100%', height: '100%', minHeight: 400}}
      />
    </Box>
  );
}
