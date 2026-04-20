/**
 * VisualHint — Language-independent gesture tutorial overlay.
 *
 * Shows an animated hand icon demonstrating HOW to interact with the game.
 * Auto-dismisses after 2.5 seconds or on any click/tap.
 * No text — purely visual instruction for kids who can't read.
 *
 * Props:
 *   type:      'tap' | 'drag' | 'flip' | 'count' | 'match'
 *   visible:   boolean
 *   onDismiss: () => void
 */

import {Box, Fade} from '@mui/material';
import React, {useEffect} from 'react';

const HINT_CONFIGS = {
  tap: {
    label: 'Tap',
    animation: 'hintTap 1.2s ease-in-out infinite',
    keyframes: {
      '0%, 100%': {transform: 'translateY(0) scale(1)', opacity: 1},
      '30%': {transform: 'translateY(8px) scale(0.9)', opacity: 0.9},
      '50%': {transform: 'translateY(0) scale(1.1)', opacity: 1},
    },
  },
  drag: {
    label: 'Drag',
    animation: 'hintDrag 2s ease-in-out infinite',
    keyframes: {
      '0%, 100%': {transform: 'translateX(-20px) translateY(0)', opacity: 0.8},
      '30%': {
        transform: 'translateX(-20px) translateY(6px) scale(0.95)',
        opacity: 1,
      },
      '70%': {
        transform: 'translateX(20px) translateY(6px) scale(0.95)',
        opacity: 1,
      },
      '90%': {transform: 'translateX(20px) translateY(0)', opacity: 0.8},
    },
  },
  flip: {
    label: 'Flip',
    animation: 'hintFlip 1.6s ease-in-out infinite',
    keyframes: {
      '0%, 100%': {transform: 'translateY(0) rotateZ(0deg)', opacity: 1},
      '25%': {
        transform: 'translateY(8px) rotateZ(0deg) scale(0.9)',
        opacity: 0.9,
      },
      '50%': {transform: 'translateY(0) rotateZ(15deg)', opacity: 1},
      '75%': {transform: 'translateY(-4px) rotateZ(0deg)', opacity: 1},
    },
  },
  count: {
    label: 'Count',
    animation: 'hintCount 2.4s ease-in-out infinite',
    keyframes: {
      '0%': {transform: 'translate(-16px, -8px)', opacity: 0.6},
      '25%': {transform: 'translate(0px, 4px)', opacity: 1},
      '50%': {transform: 'translate(16px, -4px)', opacity: 1},
      '75%': {transform: 'translate(8px, 8px)', opacity: 1},
      '100%': {transform: 'translate(-16px, -8px)', opacity: 0.6},
    },
  },
  match: {
    label: 'Match',
    animation: 'hintMatch 2s ease-in-out infinite',
    keyframes: {
      '0%, 100%': {transform: 'translateX(-24px) scale(1)', opacity: 1},
      '30%': {transform: 'translateX(-24px) scale(0.9)', opacity: 0.9},
      '50%': {transform: 'translateX(0px) scale(1)', opacity: 1},
      '70%': {transform: 'translateX(24px) scale(0.9)', opacity: 0.9},
      '80%': {transform: 'translateX(24px) scale(1.1)', opacity: 1},
    },
  },
};

// SVG Hand pointer
function HandPointer({size = 48}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      style={{filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))'}}
    >
      {/* Hand shape */}
      <path
        d="M32 8c-1.5 0-3 1.2-3 3v22l-5.5-5.5c-1.2-1.2-3.2-1.2-4.4 0s-1.2 3.2 0 4.4L32 44.8l12.9-12.9c1.2-1.2 1.2-3.2 0-4.4s-3.2-1.2-4.4 0L35 33V11c0-1.8-1.5-3-3-3z"
        fill="#FECA57"
        stroke="#F0932B"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {/* Finger */}
      <ellipse
        cx={32}
        cy={10}
        rx={4}
        ry={6}
        fill="#FECA57"
        stroke="#F0932B"
        strokeWidth={1.5}
      />
      {/* Wrist */}
      <rect
        x={27}
        y={42}
        width={10}
        height={14}
        rx={5}
        fill="#FECA57"
        stroke="#F0932B"
        strokeWidth={1.5}
      />
      {/* Shine */}
      <ellipse cx={30} cy={14} rx={1.5} ry={3} fill="rgba(255,255,255,0.4)" />
    </svg>
  );
}

export default function VisualHint({type = 'tap', visible = true, onDismiss}) {
  const config = HINT_CONFIGS[type] || HINT_CONFIGS.tap;

  // Auto-dismiss after 2.5s
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      if (onDismiss) onDismiss();
    }, 2500);
    return () => clearTimeout(timer);
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <Fade in={visible} timeout={300}>
      <Box
        onClick={onDismiss}
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.15)',
          borderRadius: '20px',
          cursor: 'pointer',
          backdropFilter: 'blur(2px)',
        }}
      >
        <Box
          sx={{
            animation: config.animation,
            [`@keyframes hint${type.charAt(0).toUpperCase() + type.slice(1)}`]:
              config.keyframes,
          }}
        >
          <HandPointer size={56} />
        </Box>
      </Box>
    </Fade>
  );
}
