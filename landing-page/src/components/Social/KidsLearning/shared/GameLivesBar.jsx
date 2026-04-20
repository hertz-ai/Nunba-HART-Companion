/**
 * GameLivesBar — Game-like progress header replacing text-based "Question X of Y".
 *
 * Renders hearts (lives), star counter, level label, and streak indicator.
 * Visual-only — no text that requires reading English.
 *
 * Props:
 *   lives:       number (remaining, max 3)
 *   score:       number (current correct count)
 *   currentLevel: number (current question index + 1)
 *   totalLevels:  number
 *   streak:      number
 */

import {kidsColors} from '../kidsTheme';

import {Box, Typography} from '@mui/material';
import React from 'react';

// SVG Heart icon
function HeartIcon({filled = true, cracking = false, size = 20}) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        width: size,
        height: size,
        transition: 'all 0.4s ease',
        opacity: filled ? 1 : 0.2,
        transform: cracking ? 'scale(1.3)' : 'scale(1)',
        animation: cracking ? 'heartCrack 0.6s ease-out forwards' : 'none',
        '@keyframes heartCrack': {
          '0%': {transform: 'scale(1.3)', opacity: 1, filter: 'none'},
          '50%': {
            transform: 'scale(1.4) rotate(5deg)',
            filter: 'brightness(1.3)',
          },
          '100%': {
            transform: 'scale(0.9)',
            opacity: 0.2,
            filter: 'grayscale(1)',
          },
        },
      }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size}>
        <path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill={filled ? '#FF6B6B' : '#DFE6E9'}
          stroke={filled ? '#D63031' : '#B2BEC3'}
          strokeWidth={0.8}
        />
        {/* Shine highlight */}
        {filled && (
          <ellipse
            cx={8.5}
            cy={7}
            rx={2.5}
            ry={1.8}
            fill="rgba(255,255,255,0.4)"
            transform="rotate(-20 8.5 7)"
          />
        )}
      </svg>
    </Box>
  );
}

// SVG Star icon
function StarIcon({size = 18}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"
        fill="#FDCB6E"
        stroke="#F0932B"
        strokeWidth={0.8}
      />
      <ellipse
        cx={10}
        cy={9}
        rx={2}
        ry={1.5}
        fill="rgba(255,255,255,0.3)"
        transform="rotate(-15 10 9)"
      />
    </svg>
  );
}

// Fire icon for streaks
function FireIcon({size = 16}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path
        d="M12 23c-4.97 0-9-3.58-9-8 0-2.52 1.17-5.56 3.47-9.02a.96.96 0 011.63.11L10 9l2.6-5.2a.96.96 0 011.72 0L17 9l1.9-2.91a.96.96 0 011.63-.11C22.83 9.44 24 12.48 24 15c0 4.42-4.03 8-9 8z"
        fill="#FF4500"
        opacity={0.9}
      />
      <path
        d="M12 23c-2.76 0-5-2.24-5-5 0-1.44.68-3.11 2-5l3 4 3-4c1.32 1.89 2 3.56 2 5 0 2.76-2.24 5-5 5z"
        fill="#FECA57"
      />
    </svg>
  );
}

export default function GameLivesBar({
  lives = 3,
  score = 0,
  currentLevel = 1,
  totalLevels = 10,
  streak = 0,
}) {
  const maxLives = 3;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: {xs: 1, sm: 2},
        py: 1,
        mb: 2,
        borderRadius: '16px',
        background: kidsColors.surfaceLight,
        border: `1px solid ${kidsColors.cardBorder}`,
      }}
    >
      {/* Hearts */}
      <Box sx={{display: 'flex', gap: 0.5, alignItems: 'center'}}>
        {[...Array(maxLives)].map((_, i) => (
          <HeartIcon key={i} filled={i < lives} size={22} />
        ))}
      </Box>

      {/* Level indicator */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1.5,
          py: 0.5,
          borderRadius: '12px',
          background: kidsColors.gradientPrimary,
          boxShadow: '0 2px 8px rgba(108,92,231,0.3)',
        }}
      >
        <Typography
          sx={{
            color: '#fff',
            fontWeight: 800,
            fontSize: '0.85rem',
            lineHeight: 1,
          }}
        >
          {currentLevel}
        </Typography>
        <Typography
          sx={{
            color: 'rgba(255,255,255,0.6)',
            fontWeight: 600,
            fontSize: '0.7rem',
            lineHeight: 1,
          }}
        >
          /{totalLevels}
        </Typography>
      </Box>

      {/* Score + streak */}
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
        {/* Star score */}
        <Box sx={{display: 'flex', alignItems: 'center', gap: 0.3}}>
          <StarIcon size={20} />
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: '1rem',
              color: kidsColors.star,
              textShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            {score}
          </Typography>
        </Box>

        {/* Streak fire */}
        {streak >= 2 && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.3,
              animation: 'pulse 1.5s infinite',
              '@keyframes pulse': {
                '0%, 100%': {transform: 'scale(1)'},
                '50%': {transform: 'scale(1.1)'},
              },
            }}
          >
            <FireIcon size={18} />
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: '0.85rem',
                color: kidsColors.streakFire,
              }}
            >
              {streak}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
