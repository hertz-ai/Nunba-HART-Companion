import LocationOnIcon from '@mui/icons-material/LocationOn';
import PeopleIcon from '@mui/icons-material/People';
import {Box, Typography, Chip} from '@mui/material';
import React from 'react';

export default function MissedConnectionCard({missed, onClick}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        bgcolor: 'background.paper',
        borderRadius: 3,
        p: 2,
        mb: 1.5,
        cursor: 'pointer',
        transition: 'box-shadow 0.2s',
        '&:hover': {boxShadow: 4},
      }}
    >
      <Box sx={{display: 'flex', alignItems: 'flex-start', gap: 1.5}}>
        <LocationOnIcon sx={{color: '#0078ff', mt: 0.25}} />
        <Box sx={{flex: 1, minWidth: 0}}>
          <Typography variant="subtitle2" sx={{fontWeight: 600}}>
            {missed.location_name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {missed.was_at && new Date(missed.was_at).toLocaleDateString()}
            {missed.distance_label && ` • ${missed.distance_label}`}
          </Typography>
          {missed.description && (
            <Typography variant="body2" noWrap sx={{mt: 0.5}}>
              {missed.description}
            </Typography>
          )}
        </Box>
        {missed.response_count > 0 && (
          <Chip
            icon={<PeopleIcon sx={{fontSize: 16}} />}
            label={`${missed.response_count} were there`}
            size="small"
            variant="outlined"
            color="primary"
          />
        )}
      </Box>
    </Box>
  );
}
