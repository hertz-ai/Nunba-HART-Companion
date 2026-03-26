import {Chip} from '@mui/material';
import React from 'react';

const TIER_COLORS = {
  member: 'default',
  contributor: 'success',
  moderator: 'info',
  admin: 'secondary',
  steward: 'warning',
};

export default function RegionBadge({region, size = 'small'}) {
  if (!region) return null;

  const tier = region.governance_tier || region.tier || 'member';
  const color = TIER_COLORS[tier] || 'default';

  return (
    <Chip
      label={region.name || 'Region'}
      color={color}
      size={size}
      sx={{
        fontWeight: 600,
        fontSize: size === 'small' ? '0.7rem' : '0.8rem',
        height: size === 'small' ? 24 : 32,
      }}
    />
  );
}
