import {socialTokens, RADIUS} from '../../../theme/socialTokens';

import {
  Card,
  CardContent,
  Box,
  Skeleton,
  keyframes,
  useTheme,
} from '@mui/material';
import React from 'react';

/* Premium shimmer — slightly slower and more elegant than default wave */
const premiumShimmer = keyframes`
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const skeletonSx = {
  bgcolor: 'rgba(255,255,255,0.04)',
  '&::after': {
    background:
      'linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent)',
    animation: `${premiumShimmer} 2s ease-in-out infinite`,
  },
};

export default function PostCardSkeleton({count = 1}) {
  const theme = useTheme();

  return Array.from({length: count}, (_, i) => (
    <Card
      key={i}
      sx={{
        mb: 2,
        display: 'flex',
        ...socialTokens.glass.subtle(theme),
        borderRadius: RADIUS.lg,
        opacity: 1 - i * 0.08,
      }}
      aria-busy="true"
    >
      {/* Intent accent bar placeholder */}
      <Box
        sx={{
          width: 4,
          flexShrink: 0,
          background: `${theme.palette.primary.main}15`,
          borderRadius: `${RADIUS.lg} 0 0 ${RADIUS.lg}`,
        }}
      />
      {/* Content column */}
      <CardContent sx={{flex: 1, minWidth: 0, p: {xs: 1.5, md: 2}}}>
        {/* Intent badge + Author row */}
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1}}>
          <Skeleton
            variant="rounded"
            width={80}
            height={22}
            animation="wave"
            sx={{...skeletonSx, borderRadius: RADIUS.pill / 4}}
          />
          <Skeleton
            variant="circular"
            width={24}
            height={24}
            animation="wave"
            sx={skeletonSx}
          />
          <Skeleton
            variant="text"
            width="20%"
            height={18}
            animation="wave"
            sx={skeletonSx}
          />
          <Skeleton
            variant="text"
            width="10%"
            height={14}
            animation="wave"
            sx={skeletonSx}
          />
        </Box>
        {/* Title */}
        <Skeleton
          variant="text"
          width="75%"
          height={28}
          animation="wave"
          sx={{...skeletonSx, mb: 0.5}}
        />
        {/* Hypothesis block placeholder */}
        <Box
          sx={{
            p: 1.5,
            borderRadius: RADIUS.md / 2,
            background: 'rgba(255,255,255,0.02)',
            borderLeft: `3px solid rgba(255,255,255,0.06)`,
            mb: 1,
          }}
        >
          <Skeleton
            variant="text"
            width="100%"
            height={18}
            animation="wave"
            sx={skeletonSx}
          />
          <Skeleton
            variant="text"
            width="85%"
            height={18}
            animation="wave"
            sx={skeletonSx}
          />
        </Box>
        {/* Expected outcome */}
        <Skeleton
          variant="text"
          width="60%"
          height={16}
          animation="wave"
          sx={{...skeletonSx, mb: 1}}
        />
        {/* Action row — Support, Evolve, Comment, Views */}
        <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mt: 1}}>
          <Skeleton
            variant="rounded"
            width={70}
            height={24}
            animation="wave"
            sx={{...skeletonSx, borderRadius: 1}}
          />
          <Skeleton
            variant="rounded"
            width={60}
            height={24}
            animation="wave"
            sx={{...skeletonSx, borderRadius: 1}}
          />
          <Skeleton
            variant="rounded"
            width={50}
            height={24}
            animation="wave"
            sx={{...skeletonSx, borderRadius: 1}}
          />
          <Skeleton
            variant="rounded"
            width={50}
            height={24}
            animation="wave"
            sx={{...skeletonSx, borderRadius: 1}}
          />
        </Box>
      </CardContent>
    </Card>
  ));
}
