import {
  kidsColors,
  kidsRadius,
  kidsShadows,
  kidsTransitions,
} from '../data/kidsTheme';

import {Box, Typography} from '@mui/material';
import React, {useEffect, useRef} from 'react';

/**
 * MediaLoadingIndicator
 *
 * Fun, kid-friendly loading animation for media generation tasks.
 * Shows an animated emoji that bounces, pulsing dots, and a friendly message.
 *
 * Props:
 *  - type: 'music' | 'video' | 'tts' | 'game' (default 'game')
 *  - message: string (optional custom text)
 *  - progress: number 0-1 (optional progress bar)
 */

/* ---- CSS keyframes injected once ---- */
const ANIM_ID = 'kids-media-loading-keyframes';
function ensureKeyframes() {
  if (document.getElementById(ANIM_ID)) return;
  const style = document.createElement('style');
  style.id = ANIM_ID;
  style.textContent = `
    @keyframes kidsMediaBounce {
      0%, 100% { transform: translateY(0) scale(1); }
      30%      { transform: translateY(-18px) scale(1.08); }
      50%      { transform: translateY(-20px) scale(1.1); }
      70%      { transform: translateY(-18px) scale(1.08); }
    }
    @keyframes kidsMediaPulseDot {
      0%, 80%, 100% { transform: scale(0.4); opacity: 0.3; }
      40%           { transform: scale(1); opacity: 1; }
    }
    @keyframes kidsMediaShimmer {
      0%   { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes kidsMediaSpin {
      0%   { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes kidsMediaGlow {
      0%, 100% { box-shadow: 0 0 8px rgba(108, 92, 231, 0.2); }
      50%      { box-shadow: 0 0 24px rgba(108, 92, 231, 0.5); }
    }
  `;
  document.head.appendChild(style);
}

const TYPE_CONFIG = {
  music: {
    emoji: '\uD83C\uDFB5',
    label: 'Creating music...',
    color: kidsColors.purple,
  },
  video: {
    emoji: '\uD83C\uDFAC',
    label: 'Making a video...',
    color: kidsColors.blue,
  },
  tts: {
    emoji: '\uD83D\uDDE3\uFE0F',
    label: 'Getting voice ready...',
    color: kidsColors.teal,
  },
  game: {
    emoji: '\uD83C\uDFAE',
    label: 'Creating something special...',
    color: kidsColors.accent,
  },
};

export default function MediaLoadingIndicator({
  type = 'game',
  message,
  progress,
}) {
  const mountedRef = useRef(false);

  useEffect(() => {
    ensureKeyframes();
    mountedRef.current = true;
  }, []);

  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.game;
  const displayMessage = message || cfg.label;
  const hasProgress = typeof progress === 'number' && progress >= 0;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2.5,
        py: 5,
        px: 3,
      }}
    >
      {/* Bouncing emoji with glow ring */}
      <Box
        sx={{
          position: 'relative',
          width: 88,
          height: 88,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Glow ring */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: `3px solid ${cfg.color}33`,
            animation: 'kidsMediaGlow 2s ease-in-out infinite',
          }}
        />
        {/* Emoji */}
        <Box
          sx={{
            fontSize: 48,
            lineHeight: 1,
            animation: 'kidsMediaBounce 1.2s ease-in-out infinite',
            cursor: 'default',
            userSelect: 'none',
          }}
        >
          {cfg.emoji}
        </Box>
      </Box>

      {/* Message */}
      <Typography
        variant="h6"
        sx={{
          fontWeight: 700,
          color: kidsColors.textPrimary,
          textAlign: 'center',
          letterSpacing: 0.3,
        }}
      >
        {displayMessage}
      </Typography>

      {/* Pulsing dots */}
      <Box sx={{display: 'flex', gap: 1, alignItems: 'center'}}>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: cfg.color,
              animation: 'kidsMediaPulseDot 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </Box>

      {/* Optional progress bar */}
      {hasProgress && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            width: '80%',
            maxWidth: 280,
          }}
        >
          {/* Track */}
          <Box
            sx={{
              flex: 1,
              height: 10,
              borderRadius: kidsRadius.full,
              bgcolor: kidsColors.border,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Fill */}
            <Box
              sx={{
                height: '100%',
                width: `${Math.min(Math.round(progress * 100), 100)}%`,
                borderRadius: kidsRadius.full,
                background: `linear-gradient(90deg, ${cfg.color}, ${cfg.color}cc)`,
                transition: 'width 0.4s ease',
                position: 'relative',
                overflow: 'hidden',
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
                  backgroundSize: '200% 100%',
                  animation: 'kidsMediaShimmer 1.8s linear infinite',
                },
              }}
            />
          </Box>
          {/* Percentage text */}
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              color: kidsColors.textSecondary,
              minWidth: 40,
              textAlign: 'right',
              fontSize: 13,
            }}
          >
            {Math.round(progress * 100)}%
          </Typography>
        </Box>
      )}

      {/* Shimmer bar decoration when no explicit progress */}
      {!hasProgress && (
        <Box
          sx={{
            width: '60%',
            maxWidth: 200,
            height: 6,
            borderRadius: kidsRadius.full,
            background: `linear-gradient(90deg, ${kidsColors.border}, ${cfg.color}55, ${kidsColors.border})`,
            backgroundSize: '200% 100%',
            animation: 'kidsMediaShimmer 2s linear infinite',
          }}
        />
      )}
    </Box>
  );
}
