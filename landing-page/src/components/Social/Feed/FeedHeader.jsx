/**
 * FeedHeader - Animated hero section for the Thought Experiments feed.
 *
 * Displays a gradient title, animated subtitle, and quick stats row.
 */

import {feedsApi} from '../../../services/socialApi';
import {GRADIENTS, EASINGS} from '../../../theme/socialTokens';
import {animFadeInUp} from '../../../utils/animations';

import RssFeedIcon from '@mui/icons-material/RssFeed';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  useTheme,
  keyframes,
} from '@mui/material';
import React from 'react';


const brandGlow = keyframes`
  0%, 100% { text-shadow: 0 0 20px rgba(108,99,255,0.3), 0 0 40px rgba(255,107,107,0.1); }
  50%      { text-shadow: 0 0 30px rgba(108,99,255,0.5), 0 0 60px rgba(255,107,107,0.2); }
`;

const subtitleReveal = keyframes`
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
`;

export default function FeedHeader({experimentCount = 0, realityCount = 0}) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        mb: 3,
        pt: {xs: 1, md: 2},
        pb: 2,
        ...animFadeInUp(0),
      }}
    >
      {/* Main Title + RSS */}
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 800,
            letterSpacing: '-0.02em',
            background: GRADIENTS.brand,
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: `${brandGlow} 4s ease-in-out infinite`,
            mb: 0.5,
            flex: 1,
          }}
        >
          Thought Experiments
        </Typography>
        <Tooltip title="RSS Feed">
          <IconButton
            size="small"
            onClick={() => window.open(feedsApi.getRssUrl('global'), '_blank')}
            sx={{
              color: 'rgba(255,255,255,0.4)',
              '&:hover': {color: '#FF6B6B', bgcolor: 'rgba(255,107,107,0.08)'},
            }}
            aria-label="RSS feed"
          >
            <RssFeedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Subtitle */}
      <Typography
        variant="body2"
        sx={{
          color: theme.palette.text.secondary,
          fontWeight: 500,
          letterSpacing: '0.01em',
          animation: `${subtitleReveal} 600ms ${EASINGS.decelerate} 200ms both`,
        }}
      >
        Good intents. Real possibilities. Net positive outcomes.
      </Typography>

      {/* Stats row */}
      {(experimentCount > 0 || realityCount > 0) && (
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            mt: 1.5,
            animation: `${subtitleReveal} 600ms ${EASINGS.decelerate} 400ms both`,
          }}
        >
          {experimentCount > 0 && (
            <Typography
              variant="caption"
              sx={{
                color: theme.palette.primary.light,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              {experimentCount.toLocaleString()} experiments
            </Typography>
          )}
          {realityCount > 0 && (
            <Typography
              variant="caption"
              sx={{
                color: theme.palette.success.light,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              {realityCount.toLocaleString()} becoming reality
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
