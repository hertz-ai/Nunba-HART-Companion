/**
 * SocialLiquidUI - Social-themed wrapper around the shared ServerDrivenUI.
 *
 * Builds themeTokens from the MUI theme (dark mode social platform) and
 * socialTokens design tokens, then delegates to the shared renderer.
 *
 * Usage:
 *   import { SocialLiquidUI } from '../../shared/LiquidUI';
 *   <SocialLiquidUI layout={serverLayout} data={state} onAction={handleAction} />
 */

import SharedServerDrivenUI from './ServerDrivenUI';

import {
  INTENT_COLORS,
  SHADOWS,
  SPACING,
  RADIUS,
} from '../../../theme/socialTokens';

import {useTheme} from '@mui/material';
import React, {useMemo} from 'react';

// Build social tokens from MUI theme + socialTokens
function buildSocialTokens(theme) {
  return {
    colors: {
      background: theme.palette.background.default,
      backgroundSecondary: theme.palette.background.paper,
      card: theme.custom.surface.elevated,
      border: theme.palette.divider,
      textPrimary: theme.palette.text.primary,
      textSecondary: theme.palette.text.secondary,
      textMuted: 'rgba(255,255,254,0.45)',
      textOnDark: '#FFFFFF',
      accent: theme.palette.primary.main,
      accentLight: theme.palette.primary.light,
      accentSecondary: theme.palette.secondary.main,
      correct: theme.palette.success.main,
      incorrect: theme.palette.error.main,
      hintBg: 'rgba(108, 99, 255, 0.08)',
      ...INTENT_COLORS, // community, environment, education, health, equity, technology
    },
    spacing: theme.custom.spacing || SPACING,
    borderRadius: theme.custom.radius || RADIUS,
    fontSizes: {xs: 12, sm: 14, md: 16, lg: 20, xl: 24, xxl: 32, display: 40},
    fontWeights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
    },
    shadows: theme.custom.shadows || SHADOWS,
  };
}

export {buildSocialTokens};

export default function SocialLiquidUI({layout, data, onAction, ...rest}) {
  const theme = useTheme();
  const tokens = useMemo(() => buildSocialTokens(theme), [theme]);
  return (
    <SharedServerDrivenUI
      themeTokens={tokens}
      layout={layout}
      data={data}
      onAction={onAction}
      {...rest}
    />
  );
}
