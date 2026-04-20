import {
  GRADIENTS,
  EASINGS,
  DURATIONS,
  RADIUS,
  SHADOWS,
  SPACING,
  INTENT_COLORS,
} from './theme/socialTokens';

import {createTheme, responsiveFontSizes, alpha} from '@mui/material/styles';

// ── Easing Curves (exported for direct use in components) ─────────────────────

export const EASE_SNAPPY = EASINGS.snappy;
export const EASE_BOUNCE = EASINGS.bounce;
export const EASE_SMOOTH = EASINGS.smooth;

// ── Base Theme ────────────────────────────────────────────────────────────────

let theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0F0E17', // Deep navy-charcoal
      paper: '#1A1932', // Warm dark indigo
    },
    primary: {
      main: '#6C63FF', // Aspiration violet
      light: '#9B94FF',
      dark: '#4A42CC',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#FF6B6B', // Coral energy
      light: '#FF9494',
      dark: '#CC5555',
      contrastText: '#FFFFFF',
    },
    success: {
      main: '#2ECC71', // Growth green
      light: '#A8E6CF',
      dark: '#27AE60',
    },
    error: {
      main: '#e74c3c',
      light: '#FF7675',
    },
    warning: {
      main: '#FFAB00',
      light: '#FFD740',
    },
    info: {
      main: '#00B8D9',
      light: '#79E2F2',
    },
    text: {
      primary: '#FFFFFE',
      secondary: 'rgba(255,255,254,0.72)',
    },
    divider: 'rgba(255,255,255,0.12)',
    action: {
      hover: 'rgba(108, 99, 255, 0.08)',
      selected: 'rgba(108, 99, 255, 0.12)',
    },
  },

  shape: {
    borderRadius: 8, // MUI theme.shape.borderRadius must be a number (not RADIUS.sm which is '8px')
  },

  typography: {
    fontFamily:
      '"Inter", "Figtree", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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

  // ── Custom Tokens (accessible via theme.custom.*) ──────────────────────────

  custom: {
    spacing: SPACING,
    radius: RADIUS,
    shadows: SHADOWS,
    gradients: GRADIENTS,
    easings: EASINGS,
    durations: DURATIONS,
    intent: INTENT_COLORS,
    // Surface colors for elevated containers
    surface: {
      base: '#1A1932',
      elevated: '#232148',
      overlay: '#2D2B55',
    },
  },

  components: {
    // ─── Button ────────────────────────────────────────────────────────
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: RADIUS.md,
          transition: `all ${DURATIONS.fast}ms ${EASINGS.snappy}`,
          '&:active': {
            transform: 'scale(0.97)',
          },
        },
        containedPrimary: {
          background: GRADIENTS.primary,
          color: '#fff',
          '&:hover': {
            background: GRADIENTS.primaryHover,
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
          transition: `transform 250ms ${EASINGS.smooth}, box-shadow 250ms ${EASINGS.smooth}`,
          willChange: 'transform',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: SHADOWS.cardHover,
          },
        },
      },
    },

    // ─── IconButton ────────────────────────────────────────────────────
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: `transform 150ms ${EASINGS.smooth}`,
          '&:hover': {
            transform: 'scale(1.1)',
          },
          '&:active': {
            transform: 'scale(0.9)',
          },
        },
      },
    },

    // ─── TextField / Input ─────────────────────────────────────────────
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.md,
          transition: `box-shadow ${DURATIONS.fast}ms ${EASINGS.smooth}`,
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#6C63FF',
            boxShadow: '0 0 0 3px rgba(108, 99, 255, 0.15)',
          },
        },
      },
    },

    // ─── Dialog ────────────────────────────────────────────────────────
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: RADIUS.xl,
          '@keyframes dialogScaleIn': {
            '0%': {opacity: 0, transform: 'scale(0.9)'},
            '100%': {opacity: 1, transform: 'scale(1)'},
          },
          animation: `dialogScaleIn 250ms ${EASINGS.bounce}`,
        },
      },
    },

    // ─── ListItemButton ────────────────────────────────────────────────
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.sm,
          transition: `background-color 150ms ${EASINGS.smooth}, padding-left 150ms ${EASINGS.smooth}`,
          '&.Mui-selected': {
            paddingLeft: 20,
            backgroundColor: 'rgba(108, 99, 255, 0.08)',
          },
        },
      },
    },

    // ─── FAB ───────────────────────────────────────────────────────────
    MuiFab: {
      styleOverrides: {
        root: {
          borderRadius: RADIUS.lg,
          '@keyframes fabScaleIn': {
            '0%': {opacity: 0, transform: 'scale(0.5)'},
            '100%': {opacity: 1, transform: 'scale(1)'},
          },
          animation: `fabScaleIn 300ms ${EASINGS.bounce}`,
          transition: `transform ${DURATIONS.fast}ms ${EASINGS.smooth}, box-shadow ${DURATIONS.fast}ms ${EASINGS.smooth}`,
          '&:hover': {
            transform: 'scale(1.08)',
          },
          '&:active': {
            transform: 'scale(0.95)',
          },
        },
      },
    },

    // ─── Chip ──────────────────────────────────────────────────────────
    MuiChip: {
      styleOverrides: {
        root: {
          '@keyframes chipPopIn': {
            '0%': {opacity: 0, transform: 'scale(0.8)'},
            '100%': {opacity: 1, transform: 'scale(1)'},
          },
          animation: `chipPopIn ${DURATIONS.fast}ms ${EASINGS.bounce} both`,
        },
      },
    },

    // ─── Tab ───────────────────────────────────────────────────────────
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          transition: `color ${DURATIONS.fast}ms ${EASINGS.smooth}`,
        },
      },
    },

    // ─── Badge ─────────────────────────────────────────────────────────
    MuiBadge: {
      styleOverrides: {
        badge: {
          '@keyframes badgePop': {
            '0%': {transform: 'scale(0) translate(50%, -50%)'},
            '60%': {transform: 'scale(1.15) translate(50%, -50%)'},
            '100%': {transform: 'scale(1) translate(50%, -50%)'},
          },
          animation: `badgePop 300ms ${EASINGS.bounce}`,
        },
      },
    },

    // ─── Snackbar ──────────────────────────────────────────────────────
    MuiSnackbar: {
      styleOverrides: {
        root: {
          '@keyframes snackSlideUp': {
            '0%': {opacity: 0, transform: 'translateY(16px)'},
            '100%': {opacity: 1, transform: 'translateY(0)'},
          },
          animation: `snackSlideUp 300ms ${EASINGS.bounce}`,
        },
      },
    },

    // ─── Tooltip ───────────────────────────────────────────────────────
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: RADIUS.sm,
          '@keyframes tooltipFade': {
            '0%': {opacity: 0, transform: 'scale(0.95)'},
            '100%': {opacity: 1, transform: 'scale(1)'},
          },
          animation: `tooltipFade 150ms ${EASINGS.smooth}`,
        },
      },
    },

    // ─── Skeleton ──────────────────────────────────────────────────────
    MuiSkeleton: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255,255,255,0.06)',
          borderRadius: RADIUS.sm,
          '&::after': {
            background: GRADIENTS.shimmer,
          },
        },
      },
    },

    // ─── Stepper (for creation wizard) ─────────────────────────────────
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
          borderRight: '1px solid rgba(255,255,255,0.06)',
          backgroundImage: 'none',
        },
      },
    },
  },
});

// Apply responsive font sizes
theme = responsiveFontSizes(theme);

export default theme;
