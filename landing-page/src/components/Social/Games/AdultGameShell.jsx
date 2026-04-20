import {
  RADIUS,
  GRADIENTS,
  socialTokens,
  SHADOWS,
} from '../../../theme/socialTokens';
import {animFadeInUp} from '../../../utils/animations';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {Box, Typography, IconButton, useTheme} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React from 'react';

/**
 * AdultGameShell — Game chrome wrapper providing header, timer bar,
 * multiplayer score slot, and footer score display.
 *
 * Layout:
 *   [Header: Back button | Game Title | Round X/Y]
 *   [Timer bar (animated width, if timeRemaining provided)]
 *   [multiplayerBar slot (if provided)]
 *   [children — flex: 1, game content area]
 *   [Footer: Score display]
 */
function AdultGameShell({
  gameTitle,
  category,
  currentRound,
  totalRounds,
  timeRemaining,
  score,
  children,
  onExit,
  multiplayerBar,
}) {
  const theme = useTheme();

  // Derive accent color from category (falls back to primary)
  const accentColor = socialTokens.intentColor(category);

  // Timer percentage (0 to 100). null timeRemaining = hidden.
  const timerPct =
    timeRemaining != null && totalRounds
      ? Math.max(0, Math.min(100, (timeRemaining / 60) * 100)) // assume 60s max if unknown
      : null;

  // If we have a known max, just use a raw percentage of 60s per round as a
  // reasonable default — consumers can pass any remaining seconds.
  const timerWidth =
    timeRemaining != null
      ? `${Math.max(0, Math.min(100, (timeRemaining / 60) * 100))}%`
      : '0%';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 1.5,
          ...socialTokens.glass.surface(theme),
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
          flexShrink: 0,
          ...animFadeInUp(),
        }}
      >
        {/* Back button */}
        <IconButton
          size="small"
          onClick={onExit}
          sx={{
            mr: 1.5,
            color: theme.palette.text.secondary,
            '&:hover': {color: theme.palette.text.primary},
          }}
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>

        {/* Game title */}
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 700,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {gameTitle}
        </Typography>

        {/* Round indicator */}
        {currentRound != null && totalRounds != null && (
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color: theme.palette.text.secondary,
              fontVariantNumeric: 'tabular-nums',
              ml: 1,
            }}
          >
            Round {currentRound}/{totalRounds}
          </Typography>
        )}
      </Box>

      {/* ── Timer Bar ─────────────────────────────────────────────────────────── */}
      {timeRemaining != null && (
        <Box
          sx={{
            height: 4,
            flexShrink: 0,
            background: alpha(theme.palette.divider, 0.1),
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: timerWidth,
              background:
                timeRemaining <= 10
                  ? theme.palette.error.main
                  : accentColor || theme.palette.primary.main,
              borderRadius: '0 2px 2px 0',
              transition: 'width 1s linear, background 300ms ease',
            }}
          />
        </Box>
      )}

      {/* ── Multiplayer Bar Slot ──────────────────────────────────────────────── */}
      {multiplayerBar && (
        <Box sx={{px: 2, py: 1, flexShrink: 0}}>{multiplayerBar}</Box>
      )}

      {/* ── Game Content Area ─────────────────────────────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </Box>

      {/* ── Footer: Score ─────────────────────────────────────────────────────── */}
      {score != null && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            px: 2,
            py: 1.5,
            flexShrink: 0,
            ...socialTokens.glass.surface(theme),
            borderTop: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
          }}
        >
          <Typography
            variant="body2"
            sx={{color: theme.palette.text.secondary, mr: 1, fontWeight: 500}}
          >
            Score
          </Typography>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              background: GRADIENTS.primary,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {score}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default AdultGameShell;
