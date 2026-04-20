import {RADIUS} from '../../../theme/socialTokens';
import {animFadeInUp} from '../../../utils/animations';
import PupitCardContainer from '../../PupitCardContainer';

import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import {Box, Typography} from '@mui/material';
import React from 'react';

/**
 * MindstoryPage — Social-integrated wrapper around existing PupitCardContainer.
 * Reuses the existing PupitCard + VIDEO_GEN_URL video generation pipeline.
 * No new backend needed — PupitCard calls the cloud API directly.
 */
export default function MindstoryPage() {
  return (
    <Box sx={{...animFadeInUp(), pb: 4}}>
      {/* Header */}
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 2, px: 1}}>
        <VideoLibraryIcon sx={{color: '#6C63FF'}} />
        <Typography variant="h6" sx={{fontWeight: 700}}>
          Mindstory
        </Typography>
        <Typography variant="body2" sx={{color: 'text.secondary', ml: 1}}>
          Create AI videos from any character
        </Typography>
      </Box>

      {/* Existing PupitCardContainer — override the 120px top margin */}
      <Box
        sx={{
          '& .Container': {marginTop: '0 !important'},
          '& .PupitCardContainer': {justifyContent: 'flex-start', gap: 2},
          '& .card': {borderRadius: RADIUS.lg, overflow: 'hidden'},
          '& .input_Search': {
            borderRadius: RADIUS.md,
            bgcolor: 'rgba(108,99,255,0.08)',
            border: '1px solid rgba(108,99,255,0.2)',
            color: '#fff',
            px: 2,
            py: 1,
          },
        }}
      >
        <PupitCardContainer />
      </Box>
    </Box>
  );
}
