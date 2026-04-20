import PersonIcon from '@mui/icons-material/Person';
import {Box, Typography, Button, Avatar, Chip} from '@mui/material';
import React from 'react';

export default function ProximityMatchCard({match, onReveal, onChat}) {
  const {status, distance_bucket, you_revealed, other_revealed} = match;

  if (status === 'matched') {
    const other = match.user_a || match.user_b;
    return (
      <Box
        sx={{
          bgcolor: 'background.paper',
          borderRadius: 3,
          p: 2,
          mb: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexDirection: {xs: 'column', sm: 'row'},
          textAlign: {xs: 'center', sm: 'left'},
        }}
      >
        <Avatar
          sx={{
            width: 48,
            height: 48,
            background: 'linear-gradient(to right, #00e89d, #0078ff)',
          }}
        >
          {other?.display_name?.[0] || '?'}
        </Avatar>
        <Box sx={{flex: 1}}>
          <Typography variant="subtitle2" sx={{fontWeight: 600}}>
            {other?.display_name || 'Someone'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {distance_bucket}
          </Typography>
          <Chip
            label="Matched!"
            size="small"
            sx={{ml: 1, bgcolor: '#00e89d', color: '#fff'}}
          />
        </Box>
        <Button
          variant="contained"
          size="small"
          onClick={() => onChat?.(match)}
        >
          Start Chat
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        bgcolor: 'background.paper',
        borderRadius: 3,
        p: 2,
        mb: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flexDirection: {xs: 'column', sm: 'row'},
        textAlign: {xs: 'center', sm: 'left'},
      }}
    >
      <Avatar sx={{width: 48, height: 48, bgcolor: 'action.hover'}}>
        <PersonIcon />
      </Avatar>
      <Box sx={{flex: 1}}>
        <Typography variant="subtitle2" sx={{fontWeight: 600}}>
          Someone nearby
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {distance_bucket}
        </Typography>
        {you_revealed && !other_revealed && (
          <Typography
            variant="caption"
            sx={{display: 'block', color: '#0078ff', mt: 0.5}}
          >
            You revealed - Waiting for them...
          </Typography>
        )}
        {other_revealed && !you_revealed && (
          <Typography
            variant="caption"
            sx={{display: 'block', color: '#00e89d', mt: 0.5}}
          >
            They revealed! Reveal yourself to connect
          </Typography>
        )}
      </Box>
      {!you_revealed && (
        <Button
          variant="outlined"
          size="small"
          onClick={() => onReveal?.(match.id)}
        >
          Reveal
        </Button>
      )}
    </Box>
  );
}
