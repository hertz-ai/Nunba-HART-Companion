import {Box, Typography, Rating} from '@mui/material';
import React from 'react';

const DIMENSIONS = [
  {key: 'skill', label: 'Skill'},
  {key: 'usefulness', label: 'Usefulness'},
  {key: 'reliability', label: 'Reliability'},
  {key: 'creativity', label: 'Creativity'},
];

export default function StarRating({values = {}, onChange, readOnly = false}) {
  return (
    <Box sx={{display: 'flex', flexDirection: 'column', gap: 1}}>
      {DIMENSIONS.map((d) => (
        <Box key={d.key} sx={{display: 'flex', alignItems: 'center', gap: 1}}>
          <Typography
            variant="body2"
            sx={{minWidth: 90, color: 'text.secondary', fontWeight: 500}}
          >
            {d.label}
          </Typography>
          <Rating
            name={`rating-${d.key}`}
            value={values[d.key] || 0}
            precision={0.5}
            readOnly={readOnly}
            onChange={
              readOnly
                ? undefined
                : (e, newVal) => {
                    if (onChange) onChange({...values, [d.key]: newVal});
                  }
            }
            size="small"
            sx={{
              '& .MuiRating-iconFilled': {color: '#0078ff'},
              '& .MuiRating-iconHover': {color: '#00e89d'},
            }}
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{minWidth: 28}}
          >
            {(values[d.key] || 0).toFixed(1)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
