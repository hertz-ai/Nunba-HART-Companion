import {Tooltip, Box, Skeleton, keyframes, useTheme} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState} from 'react';

const TITLES = {
  1: 'Newcomer',
  3: 'Contributor',
  5: 'Regular',
  8: 'Established',
  10: 'Veteran',
  15: 'Expert',
  20: 'Master',
  25: 'Luminary',
  30: 'Legend',
  40: 'Architect',
  50: 'Founding Pillar',
};

function titleFor(level) {
  let t = 'Newcomer';
  Object.entries(TITLES).forEach(([threshold, title]) => {
    if (level >= Number(threshold)) t = title;
  });
  return t;
}

function colorFor(level, theme) {
  if (level >= 26) return '#FFD700';
  if (level >= 11) return theme.palette.secondary.main;
  return theme.palette.primary.main;
}

function gradientFor(level, theme) {
  if (level >= 26) return 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)';
  if (level >= 11)
    return `linear-gradient(135deg, ${theme.palette.secondary.main} 0%, #6c3bff 100%)`;
  return `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`;
}

function glowFor(level, theme) {
  if (level >= 26) return 'rgba(255, 215, 0, 0.5)';
  if (level >= 11) return alpha(theme.palette.secondary.main, 0.5);
  return alpha(theme.palette.primary.main, 0.5);
}

// Shimmer animation for legendary levels
const shimmer = keyframes`
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
`;

// Skeleton loader for level badge
export function LevelBadgeSkeleton({size = 24}) {
  return (
    <Skeleton
      variant="circular"
      width={size}
      height={size}
      sx={{bgcolor: 'rgba(255,255,255,0.05)'}}
    />
  );
}

export default function LevelBadge({level = 1, size = 24, loading = false}) {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const isLegendary = level >= 26;

  if (loading) return <LevelBadgeSkeleton size={size} />;

  return (
    <Tooltip title={`Level ${level} - ${titleFor(level)}`} arrow>
      <Box
        component="span"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: '50%',
          background: gradientFor(level, theme),
          color: '#fff',
          fontSize: size * 0.45,
          fontWeight: 800,
          lineHeight: 1,
          flexShrink: 0,
          cursor: 'default',
          position: 'relative',
          transform: isHovered ? 'scale(1.15)' : 'scale(1)',
          boxShadow: isHovered
            ? `0 0 20px ${glowFor(level, theme)}, 0 4px 12px rgba(0,0,0,0.3)`
            : `0 2px 8px rgba(0,0,0,0.2)`,
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          // Shimmer effect for legendary levels
          ...(isLegendary && {
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: -2,
              borderRadius: '50%',
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
              backgroundSize: '200% 100%',
              animation: `${shimmer} 2s linear infinite`,
              zIndex: -1,
            },
          }),
        }}
      >
        {level}
      </Box>
    </Tooltip>
  );
}
