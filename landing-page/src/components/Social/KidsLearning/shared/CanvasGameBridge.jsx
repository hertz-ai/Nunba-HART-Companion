import {useReducedMotion} from '../../../../hooks/useAnimations';
import {kidsColors} from '../kidsTheme';

import Box from '@mui/material/Box';
import React, {useRef, useEffect, useCallback} from 'react';

/**
 * CanvasGameBridge
 *
 * A generic React wrapper that manages an HTML5 canvas for any game class
 * conforming to the following contract:
 *
 *   constructor(canvas, { config, onAnswer, onComplete, reducedMotion, colors })
 *   start()
 *   update(dt)   -- dt in seconds
 *   render()
 *   resize(w, h) -- CSS pixel dimensions
 *   onPointerDown(x, y)
 *   onPointerMove(x, y)
 *   onPointerUp(x, y)
 *   destroy()
 */
export default function CanvasGameBridge({
  GameClass,
  config,
  onAnswer,
  onComplete,
  aspectRatio = 4 / 3,
  ariaLabel,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const reducedMotion = useReducedMotion();

  // ---------- helpers ----------

  /** Convert a pointer event to canvas-local CSS coordinates. */
  const toCanvasCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return {x: 0, y: 0};
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  /** Apply DPI scaling so the canvas is crisp on high-density screens. */
  const applyDpiScaling = useCallback((canvas, width, height) => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  // ---------- lifecycle ----------

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // --- Initial sizing (deferred to ensure container has laid out) ---
    const initSize = () => {
      let w = container.clientWidth;
      if (w <= 0) w = 300; // Fallback minimum width
      const h = w / aspectRatio;
      applyDpiScaling(canvas, w, h);
      return {w, h};
    };

    // Defer one frame so the browser has completed layout
    const {w: initW, h: initH} = initSize();

    // --- Instantiate game ---
    const game = new GameClass(canvas, {
      config,
      onAnswer,
      onComplete,
      reducedMotion,
      colors: kidsColors,
    });
    gameRef.current = game;
    game.start();

    // Re-size after a microtask in case container width was 0 on first try
    if (initW <= 0 || container.clientWidth <= 0) {
      requestAnimationFrame(() => {
        const realW = container.clientWidth || 300;
        const realH = realW / aspectRatio;
        applyDpiScaling(canvas, realW, realH);
        game.resize(realW, realH);
      });
    }

    // --- RAF game loop ---
    lastTimeRef.current = performance.now();

    const loop = (timestamp) => {
      let dt = (timestamp - lastTimeRef.current) / 1000; // seconds
      lastTimeRef.current = timestamp;

      // Cap deltaTime at 50 ms (0.05 s) to avoid spiral-of-death when the
      // tab is backgrounded or the frame rate drops significantly.
      if (dt > 0.05) dt = 0.05;

      game.update(dt);
      game.render();

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    // --- Pointer events ---
    const handlePointerDown = (e) => {
      const {x, y} = toCanvasCoords(e);
      game.onPointerDown(x, y);
    };
    const handlePointerMove = (e) => {
      const {x, y} = toCanvasCoords(e);
      game.onPointerMove(x, y);
    };
    const handlePointerUp = (e) => {
      const {x, y} = toCanvasCoords(e);
      game.onPointerUp(x, y);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);

    // --- ResizeObserver ---
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        const height = width / aspectRatio;
        applyDpiScaling(canvas, width, height);
        game.resize(width, height);
      }
    });
    resizeObserver.observe(container);

    // --- Cleanup ---
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);

      resizeObserver.disconnect();

      game.destroy();
      gameRef.current = null;
    };
    // We intentionally depend on the GameClass identity and serialisable
    // props so the game is rebuilt when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [GameClass, config, onAnswer, onComplete, aspectRatio, reducedMotion]);

  // ---------- render ----------

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        maxWidth: 600,
        mx: 'auto',
        borderRadius: '20px',
        overflow: 'hidden',
        touchAction: 'none',
        position: 'relative',
        background: '#fff',
      }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel || 'Game canvas'}
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
        }}
      />
    </Box>
  );
}
