import {RADIUS} from '../../../theme/socialTokens';

import CloseIcon from '@mui/icons-material/Close';
import FavoriteIcon from '@mui/icons-material/Favorite';
import {Box, Typography, Fade, IconButton, useTheme} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React from 'react';


/**
 * HealthNudge — Guardrail-respecting gentle suggestion.
 * Never blocks the user. Dismissible. Friendly tone.
 *
 * Props:
 *   message: string — The nudge text
 *   onDismiss: () => void — Called when user dismisses
 *   visible: boolean — Controls visibility
 */
export default function HealthNudge({message, onDismiss, visible = true}) {
  const theme = useTheme();

  if (!message || !visible) return null;

  return (
    <Fade in timeout={600}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
          p: 2,
          mx: 2,
          mb: 2,
          borderRadius: RADIUS.md,
          bgcolor: alpha(theme.palette.info.main, 0.08),
          border: `1px solid ${alpha(theme.palette.info.main, 0.15)}`,
        }}
      >
        <FavoriteIcon
          sx={{color: theme.palette.info.main, fontSize: 20, mt: 0.3}}
        />
        <Typography
          variant="body2"
          sx={{flex: 1, color: theme.palette.text.secondary}}
        >
          {message}
        </Typography>
        {onDismiss && (
          <IconButton size="small" onClick={onDismiss} sx={{opacity: 0.5}}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Fade>
  );
}
