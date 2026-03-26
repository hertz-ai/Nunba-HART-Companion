import {Box, Skeleton} from '@mui/material';
import React from 'react';

const darkSkel = {bgcolor: 'rgba(255,255,255,0.06)'};

// Matches the root gradient in index.html — seamless preload-to-render transition
const darkBg = {
  background:
    'linear-gradient(135deg, #0F0E17 0%, #1A1A2E 40%, #16213E 70%, #0F0E17 100%)',
  minHeight: '100vh',
};

export default function PageSkeleton({variant = 'default', dark = false}) {
  const cardBg = dark ? 'rgba(255,255,255,0.04)' : 'background.paper';
  const skelSx = dark ? darkSkel : undefined;

  if (variant === 'feed') {
    return (
      <Box
        sx={{maxWidth: 800, mx: 'auto', p: {xs: 2, md: 3}, ...(dark && darkBg)}}
        aria-busy="true"
      >
        {[0, 1, 2, 3].map((i) => (
          <Box key={i} sx={{mb: 2, p: 2, borderRadius: 2, bgcolor: cardBg}}>
            <Box sx={{display: 'flex', gap: 1, mb: 1.5}}>
              <Skeleton
                variant="circular"
                width={32}
                height={32}
                animation="wave"
                sx={skelSx}
              />
              <Box sx={{flex: 1}}>
                <Skeleton
                  variant="text"
                  width="30%"
                  height={20}
                  animation="wave"
                  sx={skelSx}
                />
                <Skeleton
                  variant="text"
                  width="15%"
                  height={16}
                  animation="wave"
                  sx={skelSx}
                />
              </Box>
            </Box>
            <Skeleton
              variant="text"
              width="80%"
              height={24}
              animation="wave"
              sx={skelSx}
            />
            <Skeleton
              variant="text"
              width="100%"
              height={18}
              animation="wave"
              sx={skelSx}
            />
            <Skeleton
              variant="text"
              width="65%"
              height={18}
              animation="wave"
              sx={skelSx}
            />
            <Box sx={{display: 'flex', gap: 2, mt: 1.5}}>
              <Skeleton
                variant="rounded"
                width={60}
                height={24}
                animation="wave"
                sx={skelSx}
              />
              <Skeleton
                variant="rounded"
                width={60}
                height={24}
                animation="wave"
                sx={skelSx}
              />
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  if (variant === 'chat') {
    return (
      <Box
        sx={{maxWidth: 800, mx: 'auto', p: 4, ...(dark && darkBg)}}
        aria-busy="true"
      >
        <Box sx={{textAlign: 'center', mb: 6}}>
          <Skeleton
            variant="text"
            width="40%"
            height={48}
            sx={{mx: 'auto', ...skelSx}}
            animation="wave"
          />
          <Skeleton
            variant="text"
            width="60%"
            height={28}
            sx={{mx: 'auto', mt: 1, ...skelSx}}
            animation="wave"
          />
        </Box>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              mb: 2,
              p: 2,
              borderRadius: 2,
              bgcolor: cardBg,
              ml: i % 2 === 0 ? 0 : 'auto',
              mr: i % 2 === 0 ? 'auto' : 0,
              maxWidth: '70%',
            }}
          >
            <Skeleton variant="text" width="90%" animation="wave" sx={skelSx} />
            <Skeleton variant="text" width="60%" animation="wave" sx={skelSx} />
          </Box>
        ))}
      </Box>
    );
  }

  // Default skeleton
  return (
    <Box
      sx={{maxWidth: 800, mx: 'auto', p: {xs: 2, md: 3}, ...(dark && darkBg)}}
      aria-busy="true"
    >
      <Skeleton
        variant="text"
        width="40%"
        height={36}
        animation="wave"
        sx={{mb: 2, ...skelSx}}
      />
      <Skeleton
        variant="rounded"
        height={200}
        animation="wave"
        sx={{mb: 2, borderRadius: 2, ...skelSx}}
      />
      <Skeleton variant="text" width="100%" animation="wave" sx={skelSx} />
      <Skeleton variant="text" width="80%" animation="wave" sx={skelSx} />
      <Skeleton variant="text" width="60%" animation="wave" sx={skelSx} />
      <Box sx={{display: 'flex', gap: 2, mt: 3}}>
        <Skeleton
          variant="rounded"
          width={120}
          height={40}
          animation="wave"
          sx={skelSx}
        />
        <Skeleton
          variant="rounded"
          width={120}
          height={40}
          animation="wave"
          sx={skelSx}
        />
      </Box>
    </Box>
  );
}
