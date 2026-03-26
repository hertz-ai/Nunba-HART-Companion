import {
  socialTokens,
  RADIUS,
  SHADOWS,
  EASINGS,
  DURATIONS,
} from '../../../theme/socialTokens';
import {pressDown} from '../../../utils/animations';

import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import {
  Card,
  CardContent,
  Avatar,
  Typography,
  Box,
  Chip,
  Button,
  LinearProgress,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React from 'react';

export default function EncounterCard({encounter, onAccept, onSkip}) {
  const theme = useTheme();
  const compatibility =
    encounter.compatibility_pct ?? encounter.compatibility ?? 0;
  const crossedPaths =
    encounter.crossed_paths ?? encounter.encounter_count ?? 0;

  return (
    <Card
      sx={{
        ...socialTokens.glass.subtle(theme),
        borderRadius: RADIUS.lg,
        overflow: 'visible',
        transition: `transform ${DURATIONS.fast}ms ${EASINGS.smooth}, box-shadow ${DURATIONS.fast}ms ${EASINGS.smooth}, border-color ${DURATIONS.fast}ms ease`,
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: SHADOWS.cardHover,
          borderColor: alpha(theme.palette.primary.main, 0.2),
        },
        mb: 2,
      }}
    >
      <CardContent sx={{p: {xs: 1.5, md: 2}}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
          <Avatar
            src={encounter.avatar_url}
            sx={{
              width: {xs: 48, md: 56},
              height: {xs: 48, md: 56},
              background: `linear-gradient(to right, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              fontSize: {xs: 18, md: 22},
            }}
          >
            {(encounter.display_name ||
              encounter.username ||
              '?')[0].toUpperCase()}
          </Avatar>

          <Box sx={{flex: 1, minWidth: 0}}>
            <Typography variant="subtitle1" sx={{fontWeight: 600}} noWrap>
              {encounter.display_name || encounter.username}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Crossed paths {crossedPaths} time{crossedPaths !== 1 ? 's' : ''}
            </Typography>
          </Box>

          <Box sx={{textAlign: 'center', minWidth: 56}}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                background: `linear-gradient(to right, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {compatibility}%
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Match
            </Typography>
          </Box>
        </Box>

        <LinearProgress
          variant="determinate"
          value={compatibility}
          sx={{
            mt: 1.5,
            mb: 1,
            height: 6,
            borderRadius: 3,
            bgcolor: 'action.hover',
            '& .MuiLinearProgress-bar': {
              background: `linear-gradient(to right, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              borderRadius: 3,
            },
          }}
        />

        {encounter.interests && encounter.interests.length > 0 && (
          <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5}}>
            {encounter.interests.map((interest) => (
              <Chip
                key={interest}
                label={interest}
                size="small"
                variant="outlined"
                sx={{
                  borderRadius: RADIUS.sm,
                  fontSize: '0.75rem',
                  background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.06)}, ${alpha(theme.palette.secondary.main, 0.06)})`,
                  borderColor: alpha(theme.palette.primary.main, 0.15),
                  transition: `background ${DURATIONS.fast}ms ease`,
                  '&:hover': {
                    background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)}, ${alpha(theme.palette.secondary.main, 0.12)})`,
                  },
                }}
              />
            ))}
          </Box>
        )}

        <Box sx={{display: 'flex', gap: 1, justifyContent: 'flex-end'}}>
          {onSkip && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<CloseIcon />}
              onClick={() => onSkip(encounter)}
              sx={{borderRadius: RADIUS.sm, ...pressDown}}
            >
              Skip
            </Button>
          )}
          {onAccept && (
            <Button
              variant="contained"
              size="small"
              startIcon={<CheckIcon />}
              onClick={() => onAccept(encounter)}
              sx={{
                borderRadius: RADIUS.sm,
                ...pressDown,
                background: `linear-gradient(to right, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                '&:hover': {
                  background: `linear-gradient(to right, ${theme.palette.primary.dark}, ${theme.palette.secondary.dark})`,
                },
              }}
            >
              Accept
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
