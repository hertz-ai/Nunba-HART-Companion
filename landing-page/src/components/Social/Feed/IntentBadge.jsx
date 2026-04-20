/**
 * IntentBadge - Displays a thought experiment's intent category as a gradient chip.
 *
 * Usage:
 *   <IntentBadge category="education" />
 *   <IntentBadge category="community" size="large" />
 */

import {
  INTENT_COLORS,
  INTENT_LABELS,
  INTENT_GRADIENT_MAP,
  RADIUS,
} from '../../../theme/socialTokens';

import BalanceIcon from '@mui/icons-material/Balance';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import MemoryIcon from '@mui/icons-material/Memory';
import ParkIcon from '@mui/icons-material/Park';
import PeopleIcon from '@mui/icons-material/People';
import SchoolIcon from '@mui/icons-material/School';
import {Chip, Box} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React from 'react';


const ICON_MAP = {
  community: PeopleIcon,
  environment: ParkIcon,
  education: SchoolIcon,
  health: FavoriteBorderIcon,
  equity: BalanceIcon,
  technology: MemoryIcon,
};

export default function IntentBadge({
  category,
  size = 'small',
  sx: sxOverride,
}) {
  if (!category || !INTENT_COLORS[category]) return null;

  const Icon = ICON_MAP[category] || SchoolIcon;
  const label = INTENT_LABELS[category] || category;
  const color = INTENT_COLORS[category];
  const gradient = INTENT_GRADIENT_MAP[category];
  const isLarge = size === 'large';

  return (
    <Chip
      icon={<Icon sx={{fontSize: isLarge ? 18 : 14, color: '#fff'}} />}
      label={label}
      size={isLarge ? 'medium' : 'small'}
      sx={{
        background: gradient,
        color: '#fff',
        fontWeight: 600,
        fontSize: isLarge ? '0.85rem' : '0.72rem',
        letterSpacing: '0.02em',
        borderRadius: RADIUS.pill,
        border: 'none',
        px: isLarge ? 1 : 0.5,
        height: isLarge ? 32 : 24,
        boxShadow: `0 2px 8px ${alpha(color, 0.25)}`,
        transition: 'transform 150ms ease, box-shadow 150ms ease',
        '&:hover': {
          transform: 'scale(1.05)',
          boxShadow: `0 4px 16px ${alpha(color, 0.38)}`,
        },
        ...sxOverride,
      }}
    />
  );
}

/** All intent categories for selection grids */
export const ALL_INTENTS = Object.keys(INTENT_COLORS);
