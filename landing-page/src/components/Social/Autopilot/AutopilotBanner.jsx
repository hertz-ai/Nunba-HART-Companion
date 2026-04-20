import {getTimeSuggestions, getDailyContent} from './autopilotStore';

import {
  GRADIENTS,
  EASINGS,
  RADIUS,
  socialTokens,
} from '../../../theme/socialTokens';

import AutoModeIcon from '@mui/icons-material/AutoMode';
import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  Typography,
  IconButton,
  Fade,
  keyframes,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useMemo} from 'react';
import {useNavigate} from 'react-router-dom';



const DISMISS_KEY = 'nunba_autopilot_banner_dismissed';

const slideIn = keyframes`
  0%   { opacity: 0; transform: translateY(-12px); }
  100% { opacity: 1; transform: translateY(0); }
`;

const shimmer = keyframes`
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
`;

export function AutopilotBanner() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === 'true'
  );

  const suggestion = useMemo(() => {
    const suggestions = getTimeSuggestions();
    return suggestions.length > 0 ? suggestions[0] : null;
  }, []);

  const dailyTip = useMemo(() => getDailyContent(), []);

  const handleDismiss = (e) => {
    e.stopPropagation();
    sessionStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  };

  if (dismissed || !suggestion) return null;

  return (
    <Fade in timeout={400}>
      <Box
        onClick={() => navigate('/social/autopilot')}
        sx={{
          mb: 2,
          borderRadius: RADIUS.lg,
          overflow: 'hidden',
          cursor: 'pointer',
          position: 'relative',
          ...socialTokens.glass.surface(theme),
          borderLeft: `3px solid transparent`,
          borderImage: `${GRADIENTS.primary} 1`,
          animation: `${slideIn} 0.4s ${EASINGS.decelerate}`,
          transition: `transform 0.2s ${EASINGS.smooth}, box-shadow 0.2s ${EASINGS.smooth}`,
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: `0 8px 24px ${alpha(theme.palette.primary.main, 0.15)}`,
          },
        }}
      >
        {/* Shimmer overlay */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(90deg, transparent 30%, rgba(255,255,255,0.03) 50%, transparent 70%)',
            backgroundSize: '200% 100%',
            animation: `${shimmer} 4s linear infinite`,
            pointerEvents: 'none',
          }}
        />

        <Box
          sx={{
            position: 'relative',
            p: 2,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1.5,
          }}
        >
          {/* Icon */}
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: RADIUS.sm,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: alpha(theme.palette.primary.main, 0.12),
              flexShrink: 0,
            }}
          >
            <AutoModeIcon
              sx={{fontSize: 20, color: theme.palette.primary.main}}
            />
          </Box>

          {/* Content */}
          <Box sx={{flex: 1, minWidth: 0}}>
            {/* Label */}
            <Typography
              sx={{
                fontSize: '0.65rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: theme.palette.primary.main,
                mb: 0.3,
              }}
            >
              Nunba Autopilot
            </Typography>

            {/* Suggestion */}
            <Typography
              sx={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: theme.palette.text.primary,
                lineHeight: 1.4,
              }}
            >
              {suggestion.icon} {suggestion.text}
            </Typography>

            {/* Daily tip */}
            <Typography
              sx={{
                fontSize: '0.75rem',
                color: theme.palette.text.secondary,
                mt: 0.5,
                lineHeight: 1.4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {dailyTip.emoji} {dailyTip.title}: {dailyTip.content}
            </Typography>
          </Box>

          {/* Dismiss */}
          <IconButton
            size="small"
            onClick={handleDismiss}
            sx={{
              color: theme.palette.text.secondary,
              opacity: 0.6,
              flexShrink: 0,
              '&:hover': {opacity: 1, color: theme.palette.text.primary},
            }}
          >
            <CloseIcon sx={{fontSize: 16}} />
          </IconButton>
        </Box>
      </Box>
    </Fade>
  );
}

export default AutopilotBanner;
