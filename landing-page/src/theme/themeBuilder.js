/**
 * Dynamic MUI Theme Builder
 *
 * Takes a theme config JSON (from themePresets.js or backend) and returns
 * a complete MUI createTheme() object. All 17 component overrides from the
 * original theme.js are preserved but parameterized by the config.
 */

import {
  GRADIENTS,
  EASINGS,
  DURATIONS,
  RADIUS,
  SHADOWS,
  SPACING,
  INTENT_COLORS,
} from './socialTokens';
import {DEFAULT_THEME_CONFIG} from './themePresets';

import {createTheme, responsiveFontSizes, alpha} from '@mui/material/styles';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Map animation intensity (0-100) → CSS duration multiplier */
function liquidDuration(intensity, baseDuration) {
  if (intensity <= 0) return 0;
  // Higher intensity = faster animations (shorter duration)
  const scale = 0.5 + (1 - intensity / 100) * 1.5; // 0.5x at 100, 2x at 0
  return Math.round(baseDuration * scale);
}

/** Map animation intensity (0-100) → transform magnitude */
function liquidMagnitude(intensity, baseValue) {
  return baseValue * (intensity / 100);
}

// ── Builder ─────────────────────────────────────────────────────────────────

export default function buildMuiTheme(config) {
  const c = config || DEFAULT_THEME_CONFIG;
  const colors = c.colors || DEFAULT_THEME_CONFIG.colors;
  const glass = c.glass || DEFAULT_THEME_CONFIG.glass;
  const anim = c.animations || DEFAULT_THEME_CONFIG.animations;
  const font = c.font || DEFAULT_THEME_CONFIG.font;
  const shell = c.shell || DEFAULT_THEME_CONFIG.shell;

  const liquidEnabled = anim.liquid_motion?.enabled !== false;
  const liquidIntensity = anim.liquid_motion?.intensity ?? 60;
  const gradientEnabled = anim.gradients?.enabled !== false;
  const glassEnabled = anim.glassmorphism?.enabled !== false;

  // Build gradients from config primary/secondary
  const configGradients = {
    primary: `linear-gradient(135deg, ${colors.primary}, ${colors.primary_light || colors.primary})`,
    primaryHover: `linear-gradient(135deg, ${colors.primary_dark || colors.primary}, ${colors.primary})`,
    accent: `linear-gradient(135deg, ${colors.secondary}, ${colors.secondary_light || colors.secondary})`,
    growth: `linear-gradient(135deg, ${colors.accent}, ${colors.accent_light || colors.accent})`,
    brand: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 50%, ${colors.accent} 100%)`,
    shimmer: GRADIENTS.shimmer,
    surface: `linear-gradient(180deg, ${alpha(colors.primary, 0.05)}, transparent)`,
  };

  // Transition strings (respect liquid_motion toggle)
  const fastTransition = liquidEnabled
    ? `all ${liquidDuration(liquidIntensity, DURATIONS.fast)}ms ${EASINGS.snappy}`
    : 'none';
  const smoothTransition = liquidEnabled
    ? `all ${liquidDuration(liquidIntensity, DURATIONS.fast)}ms ${EASINGS.smooth}`
    : 'none';

  // Hover transform magnitude
  const hoverLift = liquidEnabled
    ? `translateY(-${liquidMagnitude(liquidIntensity, 2)}px)`
    : 'none';
  const hoverScale = liquidEnabled
    ? `scale(${1 + liquidMagnitude(liquidIntensity, 0.1)})`
    : 'none';
  const pressScale = liquidEnabled ? 'scale(0.97)' : 'none';

  let theme = createTheme({
    palette: {
      mode: 'dark',
      background: {
        default: colors.background,
        paper: colors.paper,
      },
      primary: {
        main: colors.primary,
        light: colors.primary_light || colors.primary,
        dark: colors.primary_dark || colors.primary,
        contrastText: '#FFFFFF',
      },
      secondary: {
        main: colors.secondary,
        light: colors.secondary_light || colors.secondary,
        dark: colors.secondary_dark || colors.secondary,
        contrastText: '#FFFFFF',
      },
      success: {
        main: colors.success || '#2ECC71',
        light: colors.accent_light || '#A8E6CF',
        dark: '#27AE60',
      },
      error: {
        main: colors.error || '#e74c3c',
        light: '#FF7675',
      },
      warning: {
        main: colors.warning || '#FFAB00',
        light: '#FFD740',
      },
      info: {
        main: colors.info || '#00B8D9',
        light: '#79E2F2',
      },
      text: {
        primary: colors.text_primary,
        secondary: colors.text_secondary,
      },
      divider: colors.divider,
      action: {
        hover: alpha(colors.primary, 0.08),
        selected: alpha(colors.primary, 0.12),
      },
    },

    shape: {
      borderRadius: 8, // Must be a number — MUI multiplies by spacing. RADIUS.sm is '8px' (string for sx prop, not theme.shape)
    },

    typography: {
      fontFamily: `"${font.family || 'Inter'}", "Figtree", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
      fontSize: font.size || 13,
      h1: {fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em'},
      h2: {fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em'},
      h3: {fontWeight: 700, lineHeight: 1.3},
      h4: {fontWeight: 600, lineHeight: 1.35},
      h5: {fontWeight: 600, lineHeight: 1.4},
      h6: {fontWeight: 600, lineHeight: 1.4},
      body1: {fontSize: '1rem', lineHeight: 1.6},
      body2: {fontSize: '0.875rem', lineHeight: 1.5},
      caption: {
        fontSize: '0.75rem',
        fontWeight: 500,
        lineHeight: 1.4,
        letterSpacing: '0.03em',
      },
      button: {fontWeight: 600},
      overline: {fontWeight: 600, letterSpacing: '0.08em', fontSize: '0.68rem'},
    },

    // ── Custom Tokens (accessible via theme.custom.*) ──────────────────────
    custom: {
      spacing: SPACING,
      radius: RADIUS,
      shadows: SHADOWS,
      gradients: {...GRADIENTS, ...configGradients},
      easings: EASINGS,
      durations: DURATIONS,
      intent: INTENT_COLORS,
      surface: {
        base: colors.paper,
        elevated: colors.surface_elevated || '#232148',
        overlay: colors.surface_overlay || '#2D2B55',
      },
      glass: {
        ...glass,
        enabled: glassEnabled,
      },
      animations: anim,
      shell,
      themeConfig: c, // full config for components that need it
    },

    components: {
      // ─── Button ────────────────────────────────────────────────────────
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: RADIUS.md,
            transition: fastTransition,
            '&:active': {
              transform: pressScale,
            },
          },
          containedPrimary: {
            background: configGradients.primary,
            color: '#fff',
            '&:hover': {
              background: configGradients.primaryHover,
            },
          },
        },
      },

      // ─── Card ──────────────────────────────────────────────────────────
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            borderRadius: RADIUS.lg,
            transition: liquidEnabled
              ? `transform ${liquidDuration(liquidIntensity, 250)}ms ${EASINGS.smooth}, box-shadow ${liquidDuration(liquidIntensity, 250)}ms ${EASINGS.smooth}`
              : 'none',
            willChange: liquidEnabled ? 'transform' : 'auto',
            '&:hover': {
              transform: hoverLift,
              boxShadow: liquidEnabled ? SHADOWS.cardHover : undefined,
            },
          },
        },
      },

      // ─── IconButton ────────────────────────────────────────────────────
      MuiIconButton: {
        styleOverrides: {
          root: {
            transition: liquidEnabled
              ? `transform 150ms ${EASINGS.smooth}`
              : 'none',
            '&:hover': {
              transform: hoverScale,
            },
            '&:active': {
              transform: liquidEnabled ? 'scale(0.9)' : 'none',
            },
          },
        },
      },

      // ─── TextField / Input ─────────────────────────────────────────────
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.md,
            transition: liquidEnabled
              ? `box-shadow ${DURATIONS.fast}ms ${EASINGS.smooth}`
              : 'none',
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: colors.primary,
              boxShadow: `0 0 0 3px ${alpha(colors.primary, 0.15)}`,
            },
          },
        },
      },

      // ─── Dialog ────────────────────────────────────────────────────────
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: RADIUS.xl,
            ...(liquidEnabled
              ? {
                  '@keyframes dialogScaleIn': {
                    '0%': {opacity: 0, transform: 'scale(0.9)'},
                    '100%': {opacity: 1, transform: 'scale(1)'},
                  },
                  animation: `dialogScaleIn 250ms ${EASINGS.bounce}`,
                }
              : {}),
          },
        },
      },

      // ─── ListItemButton ────────────────────────────────────────────────
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.sm,
            transition: liquidEnabled
              ? `background-color 150ms ${EASINGS.smooth}, padding-left 150ms ${EASINGS.smooth}`
              : 'none',
            '&.Mui-selected': {
              paddingLeft: 20,
              backgroundColor: alpha(colors.primary, 0.08),
            },
          },
        },
      },

      // ─── FAB ───────────────────────────────────────────────────────────
      MuiFab: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.lg,
            ...(liquidEnabled
              ? {
                  '@keyframes fabScaleIn': {
                    '0%': {opacity: 0, transform: 'scale(0.5)'},
                    '100%': {opacity: 1, transform: 'scale(1)'},
                  },
                  animation: `fabScaleIn 300ms ${EASINGS.bounce}`,
                }
              : {}),
            transition: liquidEnabled
              ? `transform ${DURATIONS.fast}ms ${EASINGS.smooth}, box-shadow ${DURATIONS.fast}ms ${EASINGS.smooth}`
              : 'none',
            '&:hover': {
              transform: liquidEnabled ? 'scale(1.08)' : 'none',
            },
            '&:active': {
              transform: liquidEnabled ? 'scale(0.95)' : 'none',
            },
          },
        },
      },

      // ─── Chip ──────────────────────────────────────────────────────────
      MuiChip: {
        styleOverrides: {
          root: liquidEnabled
            ? {
                '@keyframes chipPopIn': {
                  '0%': {opacity: 0, transform: 'scale(0.8)'},
                  '100%': {opacity: 1, transform: 'scale(1)'},
                },
                animation: `chipPopIn ${DURATIONS.fast}ms ${EASINGS.bounce} both`,
              }
            : {},
        },
      },

      // ─── Tab ───────────────────────────────────────────────────────────
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            transition: liquidEnabled
              ? `color ${DURATIONS.fast}ms ${EASINGS.smooth}`
              : 'none',
          },
        },
      },

      // ─── Badge ─────────────────────────────────────────────────────────
      MuiBadge: {
        styleOverrides: {
          badge: liquidEnabled
            ? {
                '@keyframes badgePop': {
                  '0%': {transform: 'scale(0) translate(50%, -50%)'},
                  '60%': {transform: 'scale(1.15) translate(50%, -50%)'},
                  '100%': {transform: 'scale(1) translate(50%, -50%)'},
                },
                animation: `badgePop 300ms ${EASINGS.bounce}`,
              }
            : {},
        },
      },

      // ─── Snackbar ──────────────────────────────────────────────────────
      MuiSnackbar: {
        styleOverrides: {
          root: liquidEnabled
            ? {
                '@keyframes snackSlideUp': {
                  '0%': {opacity: 0, transform: 'translateY(16px)'},
                  '100%': {opacity: 1, transform: 'translateY(0)'},
                },
                animation: `snackSlideUp 300ms ${EASINGS.bounce}`,
              }
            : {},
        },
      },

      // ─── Tooltip ───────────────────────────────────────────────────────
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: RADIUS.sm,
            ...(liquidEnabled
              ? {
                  '@keyframes tooltipFade': {
                    '0%': {opacity: 0, transform: 'scale(0.95)'},
                    '100%': {opacity: 1, transform: 'scale(1)'},
                  },
                  animation: `tooltipFade 150ms ${EASINGS.smooth}`,
                }
              : {}),
          },
        },
      },

      // ─── Skeleton ──────────────────────────────────────────────────────
      MuiSkeleton: {
        styleOverrides: {
          root: {
            backgroundColor: alpha(colors.text_primary, 0.06),
            borderRadius: RADIUS.sm,
            '&::after': {
              background: gradientEnabled ? GRADIENTS.shimmer : 'none',
            },
          },
        },
      },

      // ─── Stepper ───────────────────────────────────────────────────────
      MuiStepLabel: {
        styleOverrides: {
          label: {
            fontWeight: 600,
            '&.Mui-active': {
              fontWeight: 700,
            },
          },
        },
      },

      // ─── Drawer ────────────────────────────────────────────────────────
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: `1px solid ${alpha(colors.text_primary, 0.06)}`,
            backgroundImage: 'none',
          },
        },
      },
    },
  });

  theme = responsiveFontSizes(theme);
  return theme;
}
