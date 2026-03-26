import LocationOnIcon from '@mui/icons-material/LocationOn';
import {Box, Typography, Chip} from '@mui/material';
import React from 'react';

export default function ProximityBanner({nearbyCount, isTracking}) {
  if (!isTracking) return null;

  return (
    <Box
      sx={{
        background:
          'linear-gradient(135deg, rgba(0,232,157,0.1), rgba(0,120,255,0.1))',
        borderRadius: 3,
        p: 2,
        mb: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        flexDirection: {xs: 'column', sm: 'row'},
        textAlign: {xs: 'center', sm: 'left'},
      }}
    >
      <Box
        sx={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          bgcolor: '#00e89d',
          '@keyframes pulse': {
            '0%': {boxShadow: '0 0 0 0 rgba(0,232,157,0.4)'},
            '70%': {boxShadow: '0 0 0 10px rgba(0,232,157,0)'},
            '100%': {boxShadow: '0 0 0 0 rgba(0,232,157,0)'},
          },
          animation: 'pulse 2s infinite',
        }}
      />
      <LocationOnIcon color="primary" />
      <Box sx={{flex: 1}}>
        <Typography variant="subtitle2" sx={{fontWeight: 600}}>
          {nearbyCount > 0
            ? `${nearbyCount} ${nearbyCount === 1 ? 'person' : 'people'} nearby`
            : 'Scanning for nearby people...'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {nearbyCount > 0
            ? 'Check your matches below'
            : 'Keep the app open to discover people around you'}
        </Typography>
      </Box>
      <Chip
        label="Live"
        size="small"
        sx={{bgcolor: '#00e89d', color: '#fff'}}
      />
    </Box>
  );
}
