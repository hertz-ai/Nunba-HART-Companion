/**
 * DynamicGameRenderer - Renders server-generated HTML5 games in a sandboxed iframe (Web version).
 *
 * The server (LLM agent) creates complete single-page HTML5 games with:
 * - Full HTML/CSS/JS in a single string
 * - Standardized postMessage API for score/answer reporting
 * - Self-contained (no external dependencies or inline from CDN)
 * - Responsive design that fills the iframe
 *
 * Communication protocol (game -> app via postMessage):
 * - { type: 'answer', correct: bool, concept: string, responseTimeMs: number }
 * - { type: 'complete', score: number, correct: number, total: number }
 * - { type: 'ready' } - game loaded and ready
 * - { type: 'error', message: string }
 * - { type: 'playSound', event: string }
 * - { type: 'speakText', text: string, voice: string }
 * - { type: 'playMusic', url: string }
 * - { type: 'stopMusic' }
 * - { type: 'onScore', score: number }
 * - { type: 'onProgress', step: number, total: number }
 * - { type: 'onComplete', result: object }
 * - { type: 'onError', message: string }
 * - { type: 'onReady' }
 *
 * Communication protocol (app -> game via postMessage):
 * - { type: 'config', difficulty: number, ageGroup: string }
 * - { type: 'threeR', conceptData: object }
 * - { type: 'evolve', evolutionType: string }
 * - { type: 'theme', colors: object }
 *
 * Bridge API injected into iframe: window.KidsGameBridge with methods:
 *   playSound(eventName), speakText(text, voice), playMusic(url), stopMusic(),
 *   reportScore(score), reportProgress(step, total), reportComplete(result),
 *   reportAnswer(correct, concept, responseTimeMs), reportReady(), reportError(message),
 *   getTheme() -> kidsColors
 *
 * Ported from React Native DynamicGameRenderer.js (WebView -> sandboxed iframe).
 */

import {kidsColors, kidsSpacing, kidsFontSizes} from './kidsTheme';
import TTSManager from './shared/TTSManager';

import {useGameCompleteObserver} from '../../../hooks/useAgentObserver';
import {getRelatedGames} from '../../../hooks/useGameCatalog';
import {logger} from '../../../utils/logger';

import {Box, Typography, CircularProgress, Button, Fade} from '@mui/material';
import React, {useRef, useCallback, useEffect, useState, useMemo} from 'react';
import {useNavigate} from 'react-router-dom';


// ── Allowed sound events that can be triggered from the iframe bridge ────────

const ALLOWED_SOUND_EVENTS = new Set([
  'tap',
  'correct',
  'wrong',
  'streak',
  'complete',
  'starEarned',
  'cardFlip',
  'matchFound',
  'dragStart',
  'dragDrop',
  'countdownTick',
  'countdownEnd',
  'intro',
]);

// ── Web Audio sound manager (lightweight inline replacement) ────────────────
//
// SoundManager is not yet available in the web project's shared/ folder.
// This inline implementation uses the Web Audio API for basic sound effects
// and the SpeechSynthesis API for text-to-speech. When a proper SoundManager
// is created in shared/SoundManager.js, this can be replaced with an import.

const SoundEffects = {
  _ctx: null,

  _getCtx() {
    if (!this._ctx) {
      try {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (err) {
        logger.error(err);
        return null;
      }
    }
    return this._ctx;
  },

  _playTone(freq, type = 'sine', duration = 0.15, volume = 0.25) {
    const ctx = this._getCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (err) {
      logger.error(err);
    }
  },

  // Sound event handlers
  tap() {
    SoundEffects._playTone(600, 'sine', 0.08);
  },
  correct() {
    SoundEffects._playTone(880, 'sine', 0.2);
    setTimeout(() => SoundEffects._playTone(1100, 'sine', 0.15), 120);
  },
  wrong() {
    SoundEffects._playTone(220, 'square', 0.25);
  },
  streak() {
    SoundEffects._playTone(1000, 'sine', 0.1);
    setTimeout(() => SoundEffects._playTone(1200, 'sine', 0.1), 80);
    setTimeout(() => SoundEffects._playTone(1400, 'sine', 0.15), 160);
  },
  complete() {
    SoundEffects._playTone(660, 'sine', 0.15);
    setTimeout(() => SoundEffects._playTone(880, 'sine', 0.15), 100);
    setTimeout(() => SoundEffects._playTone(1100, 'sine', 0.2), 200);
  },
  starEarned() {
    SoundEffects._playTone(1200, 'sine', 0.2);
  },
  cardFlip() {
    SoundEffects._playTone(800, 'sine', 0.06);
  },
  matchFound() {
    SoundEffects._playTone(1000, 'sine', 0.15);
    setTimeout(() => SoundEffects._playTone(1300, 'sine', 0.15), 100);
  },
  dragStart() {
    SoundEffects._playTone(400, 'sine', 0.05);
  },
  dragDrop() {
    SoundEffects._playTone(500, 'sine', 0.08);
  },
  countdownTick() {
    SoundEffects._playTone(700, 'triangle', 0.05);
  },
  countdownEnd() {
    SoundEffects._playTone(300, 'square', 0.3);
  },
  intro() {
    SoundEffects._playTone(500, 'sine', 0.1);
    setTimeout(() => SoundEffects._playTone(700, 'sine', 0.1), 100);
    setTimeout(() => SoundEffects._playTone(900, 'sine', 0.15), 200);
  },

  // Background music (simplified - uses Audio element)
  _bgMusic: null,

  startBackgroundMusic(url, options = {}) {
    this.stopBackgroundMusic();
    try {
      this._bgMusic = new Audio(url);
      this._bgMusic.loop = options.loop !== false;
      this._bgMusic.volume = options.volume || 0.3;
      this._bgMusic.play().catch(() => {});
    } catch (err) {
      logger.error(err);
    }
  },

  stopBackgroundMusic(options = {}) {
    if (!this._bgMusic) return;
    const audio = this._bgMusic;
    const fadeMs = options.fadeOutMs || 0;

    if (fadeMs > 0) {
      const steps = 20;
      const interval = fadeMs / steps;
      const volumeStep = audio.volume / steps;
      let step = 0;
      const fadeInterval = setInterval(() => {
        step++;
        audio.volume = Math.max(0, audio.volume - volumeStep);
        if (step >= steps) {
          clearInterval(fadeInterval);
          audio.pause();
          audio.currentTime = 0;
        }
      }, interval);
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
    this._bgMusic = null;
  },
};

// ── Theme subset for iframe injection ───────────────────────────────────────

const THEME_FOR_IFRAME = {
  background: kidsColors.background,
  card: kidsColors.card,
  accent: kidsColors.accent,
  correct: kidsColors.correct,
  incorrect: kidsColors.incorrect,
  star: kidsColors.star,
  textPrimary: kidsColors.textPrimary,
  textSecondary: kidsColors.textSecondary,
  textOnDark: kidsColors.textOnDark,
  border: kidsColors.border,
  primary: kidsColors.primary,
  secondary: kidsColors.secondary,
  success: kidsColors.success,
  warning: kidsColors.warning,
  error: kidsColors.error,
};

// ── Build CSS variables string from theme ───────────────────────────────────

const buildCssVariables = (theme) => {
  return Object.entries(theme)
    .map(
      ([key, value]) =>
        `--kids-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value};`
    )
    .join('\n      ');
};

// ── Main Component ──────────────────────────────────────────────────────────

const DynamicGameRenderer = ({
  htmlContent,
  gameUrl,
  gameConfig,
  onAnswer,
  onComplete,
  onReady,
  onError,
  gameBasePath = '/social/games',
}) => {
  const navigate = useNavigate();
  const iframeRef = useRef(null);
  const mountedRef = useRef(true);
  const startTime = useRef(Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [portalGames, setPortalGames] = useState([]);
  const reportGameComplete = useGameCompleteObserver();

  // ── Game State Persistence: check for saved state on mount ────────────
  const gameId = gameConfig?.id || gameConfig?.gameId;
  const category = gameConfig?.category || 'general';

  const savedState = useMemo(() => {
    if (!gameId) return null;
    try {
      const raw = localStorage.getItem(`gameState:${gameId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const isStale =
        parsed && Date.now() - parsed.timestamp > 7 * 24 * 60 * 60 * 1000; // 7 day TTL
      return isStale ? null : parsed;
    } catch {
      return null;
    }
  }, [gameId]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      SoundEffects.stopBackgroundMusic({fadeOutMs: 300});
    };
  }, []);

  // ── Build the wrapped HTML with bridge injection ──────────────────────

  const wrappedHtml = useMemo(() => {
    if (!htmlContent) return null;

    const themeJson = JSON.stringify(THEME_FOR_IFRAME);
    const cssVars = buildCssVariables(THEME_FOR_IFRAME);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    :root {
      ${cssVars}
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    html, body { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <script>
    // ── KidsGameBridge: Communication API between iframe game and parent app ──
    window.KidsGameBridge = {
      // Report an answer to the parent app
      reportAnswer: function(correct, concept, responseTimeMs) {
        window.parent.postMessage(JSON.stringify({
          type: 'answer', correct: correct, concept: concept, responseTimeMs: responseTimeMs || 0
        }), '*');
      },

      // Report game completion
      reportComplete: function(result) {
        var payload = typeof result === 'object' ? result : { score: result };
        window.parent.postMessage(JSON.stringify({
          type: 'complete',
          score: payload.score || 0,
          correct: payload.correct || 0,
          total: payload.total || 0
        }), '*');
      },

      // Report that the game is ready
      reportReady: function() {
        window.parent.postMessage(JSON.stringify({ type: 'ready' }), '*');
      },

      // Report an error
      reportError: function(message) {
        window.parent.postMessage(JSON.stringify({ type: 'error', message: message }), '*');
      },

      // Request a sound effect from the parent app
      playSound: function(eventName) {
        window.parent.postMessage(JSON.stringify({
          type: 'playSound', event: eventName
        }), '*');
      },

      // Request text-to-speech from the parent app
      speakText: function(text, voice) {
        window.parent.postMessage(JSON.stringify({
          type: 'speakText', text: text, voice: voice || ''
        }), '*');
      },

      // Request background music from the parent app
      playMusic: function(url) {
        window.parent.postMessage(JSON.stringify({
          type: 'playMusic', url: url
        }), '*');
      },

      // Request stopping background music
      stopMusic: function() {
        window.parent.postMessage(JSON.stringify({
          type: 'stopMusic'
        }), '*');
      },

      // Report score update (non-final)
      reportScore: function(score) {
        window.parent.postMessage(JSON.stringify({
          type: 'onScore', score: score
        }), '*');
      },

      // Report progress update
      reportProgress: function(step, total) {
        window.parent.postMessage(JSON.stringify({
          type: 'onProgress', step: step, total: total
        }), '*');
      },

      // Get the theme colors object
      getTheme: function() {
        return ${themeJson};
      },

      // Theme colors accessible as a property
      theme: ${themeJson}
    };

    // ── Listen for messages from the parent app ──
    window.addEventListener('message', function(event) {
      try {
        var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (window.onGameConfig && data.type === 'config') window.onGameConfig(data);
        if (window.onThreeRData && data.type === 'threeR') window.onThreeRData(data.conceptData);
        if (window.onEvolve && data.type === 'evolve') window.onEvolve(data.evolutionType);
        if (window.onThemeUpdate && data.type === 'theme') window.onThemeUpdate(data.colors);
      } catch(e) {}
    });

    // Auto-report ready after a short delay if the game doesn't call reportReady
    setTimeout(function() {
      if (!window._gameReported) {
        window.KidsGameBridge.reportReady();
      }
    }, 2000);
  </script>
  ${htmlContent}
</body>
</html>`;
  }, [htmlContent]);

  // ── Handle postMessage from iframe ────────────────────────────────────

  const handleMessage = useCallback(
    (event) => {
      if (!mountedRef.current) return;

      // Origin validation — only accept messages from same origin or our iframe
      if (event.origin !== window.location.origin && event.origin !== 'null')
        return;

      // Parse message data
      let data;
      try {
        data =
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch (err) {
        logger.error(err);
        return; // Non-JSON message, ignore
      }

      if (!data || typeof data !== 'object' || !data.type) return;

      switch (data.type) {
        case 'answer':
          if (!mountedRef.current) return;
          startTime.current = Date.now();
          if (onAnswer) onAnswer(data);
          break;

        case 'complete':
          if (!mountedRef.current) return;
          // Populate portal with related game suggestions
          if (gameId && category) {
            const related = getRelatedGames(gameId, category);
            setPortalGames(related);
          }
          // Report to agent observer for self-critique
          reportGameComplete(
            gameId,
            category,
            data?.score || 0,
            data?.total || 0
          );
          // Clear saved progress on completion
          if (gameId) {
            try {
              localStorage.removeItem(`gameState:${gameId}`);
            } catch {
              /* ignore */
            }
          }
          if (onComplete) onComplete(data);
          break;

        case 'ready':
        case 'onReady':
          if (!mountedRef.current) return;
          setIsLoading(false);
          // Send config to the game
          if (iframeRef.current?.contentWindow) {
            try {
              iframeRef.current.contentWindow.postMessage(
                JSON.stringify({
                  type: 'config',
                  difficulty: gameConfig?.difficulty || 1,
                  ageGroup: gameConfig?.ageGroup ||
                    gameConfig?.ageRange || [5, 12],
                  category: gameConfig?.category || 'general',
                }),
                '*'
              );
            } catch (err) {
              logger.error(err);
            }
          }
          if (onReady) onReady();
          break;

        case 'playSound':
          if (
            data.event &&
            ALLOWED_SOUND_EVENTS.has(data.event) &&
            SoundEffects[data.event]
          ) {
            SoundEffects[data.event]();
          }
          break;

        case 'speakText':
          if (data.text) {
            TTSManager.speak(data.text, {voice: data.voice}).catch(() => {});
          }
          break;

        case 'playMusic':
          if (data.url) {
            SoundEffects.startBackgroundMusic(data.url, {
              loop: true,
              volume: 0.3,
            });
          }
          break;

        case 'stopMusic':
          SoundEffects.stopBackgroundMusic({fadeOutMs: 500});
          break;

        case 'onScore':
          // Score update - can be used for live score display
          break;

        case 'onProgress':
          // Progress update - persist to localStorage for resume capability
          if (gameId && data.step != null && data.total != null) {
            try {
              localStorage.setItem(
                `gameState:${gameId}`,
                JSON.stringify({
                  step: data.step,
                  total: data.total,
                  timestamp: Date.now(),
                })
              );
            } catch {
              // localStorage full or unavailable — ignore
            }
          }
          break;

        case 'onComplete':
          if (!mountedRef.current) return;
          // Populate portal with related game suggestions
          if (gameId && category) {
            const related = getRelatedGames(gameId, category);
            setPortalGames(related);
          }
          // Report to agent observer for self-critique
          reportGameComplete(
            gameId,
            category,
            data?.score || data?.result?.score || 0,
            data?.total || data?.result?.total || 0
          );
          // Clear saved progress on completion
          if (gameId) {
            try {
              localStorage.removeItem(`gameState:${gameId}`);
            } catch {
              /* ignore */
            }
          }
          if (onComplete) onComplete(data.result || data);
          break;

        case 'onError':
        case 'error':
          if (!mountedRef.current) return;
          console.warn('[DynamicGameRenderer] Game error:', data.message);
          if (onError) onError(data.message);
          break;

        default:
          // Unknown message type - ignore
          break;
      }
    },
    [
      gameConfig,
      gameId,
      category,
      onAnswer,
      onComplete,
      onReady,
      onError,
      reportGameComplete,
    ]
  );

  // ── Attach/detach message listener ────────────────────────────────────

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleMessage]);

  // ── Handle iframe load event ──────────────────────────────────────────

  const handleIframeLoad = useCallback(() => {
    if (!mountedRef.current) return;
    // Give the game a moment to initialize and call reportReady
    setTimeout(() => {
      if (mountedRef.current && isLoading) {
        setIsLoading(false);
      }
    }, 3000);
  }, [isLoading]);

  // ── Handle iframe error ───────────────────────────────────────────────

  const handleIframeError = useCallback(() => {
    if (!mountedRef.current) return;
    setIsLoading(false);
    setLoadError('Failed to load game content');
    if (onError) onError('Failed to load game content');
  }, [onError]);

  // ── Loading spinner ───────────────────────────────────────────────────

  const renderLoading = () => (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: kidsColors.background,
        zIndex: 10,
        transition: 'opacity 0.3s ease',
        opacity: isLoading ? 1 : 0,
        pointerEvents: isLoading ? 'auto' : 'none',
      }}
    >
      <CircularProgress size={48} sx={{color: kidsColors.accent, mb: 2}} />
      <Typography
        sx={{
          fontSize: kidsFontSizes.md,
          color: kidsColors.textSecondary,
        }}
      >
        Loading game...
      </Typography>
    </Box>
  );

  // ── Portal navigation handler ──────────────────────────────────────
  const handlePortalNavigate = useCallback(
    (game) => {
      navigate(`${gameBasePath}/${game.id}`);
    },
    [navigate, gameBasePath]
  );

  // ── Game Portal: related game suggestions after completion ────────────
  const renderPortal = () => {
    if (portalGames.length === 0) return null;
    return (
      <Fade in timeout={600}>
        <Box
          sx={{
            mt: 3,
            p: 2,
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '16px',
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{color: 'rgba(255,255,255,0.7)', mb: 1.5, fontWeight: 600}}
          >
            Continue your journey
          </Typography>
          <Box sx={{display: 'flex', gap: 1.5, flexWrap: 'wrap'}}>
            {portalGames.map((game) => (
              <Button
                key={game.id}
                onClick={() => handlePortalNavigate(game)}
                sx={{
                  flex: '1 1 auto',
                  minWidth: 120,
                  p: 1.5,
                  background: 'rgba(108,99,255,0.08)',
                  border: '1px solid rgba(108,99,255,0.2)',
                  borderRadius: '12px',
                  textTransform: 'none',
                  color: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.5,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    background: 'rgba(108,99,255,0.15)',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 20px rgba(108,99,255,0.3)',
                  },
                }}
              >
                <Typography variant="h5">{game.emoji}</Typography>
                <Typography variant="caption" sx={{fontWeight: 600}}>
                  {game.name}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem'}}
                >
                  {game.category}
                </Typography>
              </Button>
            ))}
          </Box>
        </Box>
      </Fade>
    );
  };

  // ── Sandbox attribute for security ────────────────────────────────────
  //
  // allow-scripts: needed for game JS
  // allow-same-origin: needed for postMessage origin matching
  // allow-forms: some games may use forms
  // allow-popups: blocked by omission for security
  // allow-modals: blocked by omission

  const sandboxAttr = 'allow-scripts allow-same-origin allow-forms';

  // ── Render: URL-based game ────────────────────────────────────────────

  if (gameUrl) {
    return (
      <>
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: '100%',
            minHeight: 300,
            backgroundColor: kidsColors.background,
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          {renderLoading()}
          <iframe
            ref={iframeRef}
            src={gameUrl}
            sandbox={sandboxAttr}
            title="Kids Learning Game"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
              backgroundColor: 'transparent',
            }}
            allow="autoplay"
          />
        </Box>
        {renderPortal()}
      </>
    );
  }

  // ── Render: HTML content game (blob URL) ──────────────────────────────

  if (wrappedHtml) {
    return (
      <>
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: '100%',
            minHeight: 300,
            backgroundColor: kidsColors.background,
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          {renderLoading()}
          <IframeHtmlRenderer
            ref={iframeRef}
            html={wrappedHtml}
            sandboxAttr={sandboxAttr}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        </Box>
        {renderPortal()}
      </>
    );
  }

  // ── Render: No content ────────────────────────────────────────────────

  if (loadError) {
    return (
      <Box
        sx={{
          display: 'flex',
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          p: `${kidsSpacing.lg}px`,
        }}
      >
        <Typography
          sx={{
            fontSize: kidsFontSizes.md,
            color: kidsColors.incorrect,
            textAlign: 'center',
          }}
        >
          {loadError}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Typography
        sx={{
          fontSize: kidsFontSizes.md,
          color: kidsColors.textSecondary,
        }}
      >
        No game content available
      </Typography>
    </Box>
  );
};

// ── IframeHtmlRenderer: renders HTML content via srcdoc or blob URL ──────────
//
// Uses srcdoc when available (most modern browsers), falls back to blob URL.
// This avoids data: URI issues with CSP and gives better cross-origin isolation.

const IframeHtmlRenderer = React.forwardRef(
  ({html, sandboxAttr, onLoad, onError}, ref) => {
    const [blobUrl, setBlobUrl] = useState(null);
    const useSrcdoc =
      typeof document !== 'undefined' &&
      'srcdoc' in document.createElement('iframe');

    useEffect(() => {
      if (useSrcdoc || !html) return;

      // Fallback: create blob URL for older browsers
      const blob = new Blob([html], {type: 'text/html'});
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);

      return () => {
        URL.revokeObjectURL(url);
      };
    }, [html, useSrcdoc]);

    if (useSrcdoc) {
      return (
        <iframe
          ref={ref}
          srcDoc={html}
          sandbox={sandboxAttr}
          title="Kids Learning Game"
          onLoad={onLoad}
          onError={onError}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            backgroundColor: 'transparent',
          }}
          allow="autoplay"
        />
      );
    }

    if (blobUrl) {
      return (
        <iframe
          ref={ref}
          src={blobUrl}
          sandbox={sandboxAttr}
          title="Kids Learning Game"
          onLoad={onLoad}
          onError={onError}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            backgroundColor: 'transparent',
          }}
          allow="autoplay"
        />
      );
    }

    return null;
  }
);

IframeHtmlRenderer.displayName = 'IframeHtmlRenderer';

export default DynamicGameRenderer;
