/**
 * LiquidUI - Shared Server-Driven UI renderer.
 *
 * Generalized from KidsLearning/ServerDrivenUI.jsx to accept a `themeTokens`
 * prop instead of importing from a specific theme file. This enables any
 * feature domain (Kids, Social, Admin, etc.) to reuse the same JSON-to-MUI
 * rendering engine with its own design tokens.
 *
 * themeTokens shape:
 * {
 *   colors:       { background, backgroundSecondary, card, border, textPrimary,
 *                   textSecondary, textMuted, textOnDark, accent, accentLight,
 *                   accentSecondary, correct, incorrect, hintBg, ... },
 *   spacing:      { xs, sm, md, lg, xl, xxl },
 *   borderRadius: { sm, md, lg, xl, xxl?, full },
 *   fontSizes:    { xs, sm, md, lg, xl, xxl, display },
 *   fontWeights:  { normal, medium, semibold, bold, extrabold },
 *   shadows:      { card, cardHover, button, buttonHover, fab, float, modal, none },
 * }
 *
 * Rendering Modes:
 * 1. Layout mode: Pure UI from JSON (headers, cards, grids, text, buttons)
 * 2. Template mode: Game template with data binding + action callbacks
 * 3. Screen mode: Full screen layouts (custom hub, progress, etc.)
 *
 * JSON Node Schema:
 * {
 *   type: 'box' | 'text' | 'button' | 'icon' | 'image' | 'input' |
 *         'scroll' | 'row' | 'column' | 'grid' | 'card' | 'spacer' |
 *         'chip' | 'divider' | 'progress' | 'list' |
 *         'animated' | 'conditional' | 'loop',
 *   props: { ... },
 *   style: { ... } | string,
 *   children: [ ... ],
 *   bind: string,
 *   action: string,
 *   visible: string | bool,
 *   animation: string,
 *   key: string,
 * }
 */

import * as MuiIcons from '@mui/icons-material';
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Chip,
  Divider,
  LinearProgress,
  CircularProgress,
  Card,
  CardContent,
  CardActionArea,
} from '@mui/material';
import React, {useEffect, createContext, useContext, useMemo} from 'react';

// ── LiquidUI Context: provides themeTokens to the render tree ────────────────

export const LiquidUIContext = createContext(null);

export const LiquidUIProvider = ({themeTokens, children}) => (
  <LiquidUIContext.Provider value={themeTokens}>
    {children}
  </LiquidUIContext.Provider>
);

// ── Security: Resolve a dot-path value from a data context ──────────────────

const FORBIDDEN_PATHS = new Set(['__proto__', 'constructor', 'prototype']);

const resolvePath = (obj, path) => {
  if (!path || !obj) return undefined;
  const parts = path.split('.');
  if (parts.length > 10) return undefined; // maxDepth guard
  let current = obj;
  for (const part of parts) {
    if (FORBIDDEN_PATHS.has(part)) return undefined;
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
};

// ── Template string interpolation: {{variable}} ────────────────────────────

const interpolateTemplate = (text, data) => {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
    const trimmed = path.trim();
    const value = resolvePath(data, trimmed);
    return value !== undefined && value !== null ? String(value) : '';
  });
};

// ── Build style presets from tokens ─────────────────────────────────────────

export function buildStylePresets(tokens) {
  const {colors, spacing, borderRadius, fontSizes, fontWeights, shadows} =
    tokens;

  return {
    // Text styles
    title: {
      fontSize: fontSizes.xl,
      fontWeight: fontWeights.extrabold,
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.bold,
      color: colors.textPrimary,
    },
    body: {fontSize: fontSizes.md, color: colors.textPrimary},
    caption: {fontSize: fontSizes.sm, color: colors.textSecondary},
    muted: {fontSize: fontSizes.xs, color: colors.textMuted},
    instruction: {
      fontSize: fontSizes.md,
      fontWeight: fontWeights.medium,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    display: {
      fontSize: fontSizes.display,
      fontWeight: fontWeights.extrabold,
      color: colors.accent,
      textAlign: 'center',
    },
    correct: {
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.bold,
      color: colors.correct,
    },
    incorrect: {
      fontSize: fontSizes.lg,
      fontWeight: fontWeights.bold,
      color: colors.incorrect,
    },
    hero: {
      fontSize: fontSizes.xxl,
      fontWeight: fontWeights.extrabold,
      color: colors.textPrimary,
      textAlign: 'center',
      lineHeight: 1.2,
    },

    // Layout styles
    centered: {display: 'flex', justifyContent: 'center', alignItems: 'center'},
    padded: {p: `${spacing.md}px`},
    paddedLg: {p: `${spacing.lg}px`},
    row: {display: 'flex', flexDirection: 'row', alignItems: 'center'},
    rowSpaced: {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    column: {display: 'flex', flexDirection: 'column'},
    wrap: {display: 'flex', flexDirection: 'row', flexWrap: 'wrap'},
    flex1: {flex: 1},
    gap: {gap: `${spacing.md}px`},
    gapSm: {gap: `${spacing.sm}px`},
    gapLg: {gap: `${spacing.lg}px`},

    // Card / surface styles
    card: {
      backgroundColor: colors.card,
      borderRadius: `${borderRadius.lg}px`,
      p: `${spacing.md}px`,
      boxShadow: shadows.card,
    },
    cardAccent: {
      backgroundColor: colors.card,
      borderRadius: `${borderRadius.lg}px`,
      p: `${spacing.md}px`,
      border: `2px solid ${colors.accent}`,
      boxShadow: shadows.card,
    },
    chip: {
      backgroundColor: colors.card,
      borderRadius: `${borderRadius.full}px`,
      px: `${spacing.md}px`,
      py: `${spacing.sm}px`,
      border: `1px solid ${colors.border}`,
    },
    banner: {
      backgroundColor: colors.hintBg,
      borderRadius: `${borderRadius.md}px`,
      p: `${spacing.md}px`,
    },

    // Button styles
    primaryBtn: {
      backgroundColor: colors.accent,
      borderRadius: `${borderRadius.lg}px`,
      px: `${spacing.lg}px`,
      py: `${spacing.md}px`,
      boxShadow: shadows.button,
      color: colors.textOnDark,
      '&:hover': {
        backgroundColor: colors.accentLight,
        boxShadow: shadows.buttonHover,
      },
    },
    secondaryBtn: {
      backgroundColor: colors.accentSecondary,
      borderRadius: `${borderRadius.lg}px`,
      px: `${spacing.lg}px`,
      py: `${spacing.md}px`,
      color: colors.textOnDark,
    },
    outlineBtn: {
      border: `2px solid ${colors.accent}`,
      borderRadius: `${borderRadius.lg}px`,
      px: `${spacing.lg}px`,
      py: `${spacing.md}px`,
      color: colors.accent,
      backgroundColor: 'transparent',
    },
    dangerBtn: {
      backgroundColor: colors.incorrect,
      borderRadius: `${borderRadius.lg}px`,
      px: `${spacing.lg}px`,
      py: `${spacing.md}px`,
      color: colors.textOnDark,
    },
    btnText: {
      fontSize: fontSizes.md,
      fontWeight: fontWeights.bold,
      color: colors.textOnDark,
      textAlign: 'center',
    },
    btnTextDark: {
      fontSize: fontSizes.md,
      fontWeight: fontWeights.bold,
      color: colors.accent,
      textAlign: 'center',
    },

    // Game-specific
    questionCard: {
      backgroundColor: colors.card,
      borderRadius: `${borderRadius.xl}px`,
      p: `${spacing.lg}px`,
      mx: `${spacing.md}px`,
      boxShadow: shadows.float,
    },
    optionGrid: {
      display: 'flex',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: `${spacing.md}px`,
      justifyContent: 'center',
      px: `${spacing.md}px`,
    },
    hintBanner: {
      backgroundColor: colors.hintBg,
      borderRadius: `${borderRadius.md}px`,
      p: `${spacing.sm}px`,
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: `${spacing.xs}px`,
    },

    // Full background
    screenBg: {flex: 1, backgroundColor: colors.background, minHeight: '100%'},
    screenBgSecondary: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
      minHeight: '100%',
    },
  };
}

// ── Build default styles from tokens ────────────────────────────────────────

function buildDefaultStyles(tokens) {
  const {colors, spacing, borderRadius, fontSizes, fontWeights, shadows} =
    tokens;

  return {
    container: {
      width: '100%',
      minHeight: '100%',
    },
    defaultText: {
      fontSize: fontSizes.md,
      color: colors.textPrimary,
      fontFamily: '"Nunito", "Roboto", "Helvetica", "Arial", sans-serif',
    },
    defaultButton: {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: `${spacing.sm}px`,
      backgroundColor: colors.accent,
      px: `${spacing.lg}px`,
      py: `${spacing.md}px`,
      borderRadius: `${borderRadius.lg}px`,
      boxShadow: shadows.button,
      color: colors.textOnDark,
      textTransform: 'none',
      fontWeight: fontWeights.bold,
      fontSize: fontSizes.md,
      cursor: 'pointer',
      border: 'none',
      transition: 'all 0.2s ease',
      '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: shadows.buttonHover,
      },
      '&:active': {
        transform: 'translateY(0)',
      },
    },
    defaultButtonText: {
      fontSize: fontSizes.md,
      fontWeight: fontWeights.bold,
      color: colors.textOnDark,
    },
    defaultInput: {
      fontSize: fontSizes.md,
      '& .MuiInputBase-input': {
        fontSize: fontSizes.md,
        color: colors.textPrimary,
      },
      '& .MuiOutlinedInput-root': {
        borderRadius: `${borderRadius.md}px`,
        backgroundColor: colors.card,
      },
    },
    defaultCard: {
      backgroundColor: colors.card,
      borderRadius: `${borderRadius.lg}px`,
      p: `${spacing.md}px`,
      boxShadow: shadows.card,
      cursor: 'default',
      transition: 'all 0.2s ease',
    },
  };
}

// ── Resolve style: supports string preset names, arrays, and inline objects ─

function makeResolveStyle(stylePresets, colors) {
  const resolveStyle = (style, data) => {
    if (!style) return undefined;

    if (typeof style === 'string') {
      // Space-separated preset names
      const presets = style.split(' ').filter(Boolean);
      const merged = {};
      for (const name of presets) {
        const preset = stylePresets[name];
        if (preset) Object.assign(merged, preset);
      }
      return Object.keys(merged).length > 0 ? merged : undefined;
    }

    if (Array.isArray(style)) {
      const merged = {};
      for (const s of style) {
        const resolved = resolveStyle(s, data);
        if (resolved) Object.assign(merged, resolved);
      }
      return Object.keys(merged).length > 0 ? merged : undefined;
    }

    // Map $token color references in inline style objects
    if (typeof style === 'object' && style !== null) {
      const mapped = {...style};
      for (const key of Object.keys(mapped)) {
        if (typeof mapped[key] === 'string') {
          // $colorToken -> colors[colorToken]
          if (mapped[key].startsWith('$')) {
            const token = mapped[key].slice(1);
            if (
              !FORBIDDEN_PATHS.has(token) &&
              Object.prototype.hasOwnProperty.call(colors, token)
            ) {
              mapped[key] = colors[token];
            }
          }
          // {{binding}} interpolation in style values
          if (data && mapped[key].includes('{{')) {
            mapped[key] = interpolateTemplate(mapped[key], data);
          }
        }
      }
      return mapped;
    }

    return style;
  };

  return resolveStyle;
}

// ── Get a MUI icon component by name ────────────────────────────────────────

const getMuiIcon = (name) => {
  if (!name || typeof name !== 'string') return null;
  // Try exact name, then PascalCase variations
  const candidates = [
    name,
    name.charAt(0).toUpperCase() + name.slice(1),
    name
      .replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      .replace(/^./, (c) => c.toUpperCase()),
  ];
  for (const candidate of candidates) {
    if (MuiIcons[candidate]) return MuiIcons[candidate];
  }
  // Fallback
  return MuiIcons.HelpOutline || null;
};

// ── CSS animation mapping ───────────────────────────────────────────────────

const ANIMATION_MAP = {
  fadeIn: 'fadeIn 0.5s ease-out forwards',
  fadeInUp: 'fadeInUp 0.5s ease-out forwards',
  fadeInDown: 'fadeInDown 0.5s ease-out forwards',
  fadeInScale: 'fadeInScale 0.4s ease-out forwards',
  bounceIn: 'bounceIn 0.6s ease-out forwards',
  pulse: 'pulse 1.5s ease-in-out infinite',
  wiggle: 'wiggle 0.6s ease-in-out',
  float: 'float 3s ease-in-out infinite',
  slideInLeft: 'slideInLeft 0.4s ease-out forwards',
  slideInRight: 'slideInRight 0.4s ease-out forwards',
};

// Inject animation keyframes once
const ANIM_STYLE_ID = 'sdui-keyframes';
function ensureAnimationKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(ANIM_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = ANIM_STYLE_ID;
  style.textContent = `
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fadeInDown { from { opacity: 0; transform: translateY(-24px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fadeInScale { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
    @keyframes bounceIn { 0% { opacity: 0; transform: scale(0.3); } 50% { opacity: 1; transform: scale(1.05); } 70% { transform: scale(0.9); } 100% { transform: scale(1); } }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
    @keyframes wiggle { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(-3deg); } 75% { transform: rotate(3deg); } }
    @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    @keyframes slideInLeft { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes slideInRight { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
  `;
  document.head.appendChild(style);
}

// ── Maximum loop items (safety limit) ───────────────────────────────────────

const MAX_LOOP_ITEMS = 100;

// ── RenderNode: Recursively renders a JSON UI node to MUI components ────────

const RenderNode = ({
  node,
  data,
  onAction,
  depth = 0,
  resolveStyle,
  defaultStyles,
  tokens,
}) => {
  if (!node || depth > 20) return null;

  // Validate node structure
  if (typeof node !== 'object' || (node.type && typeof node.type !== 'string'))
    return null;

  const colors = tokens.colors;
  const spacing = tokens.spacing;
  const borderRadius = tokens.borderRadius;
  const fontSizes = tokens.fontSizes;
  const shadows = tokens.shadows;

  // Handle conditional visibility
  if (node.visible !== undefined) {
    const isVisible =
      typeof node.visible === 'string'
        ? !!resolvePath(data, node.visible)
        : node.visible;
    if (!isVisible) return null;
  }

  // Handle "show" conditional (alias for visible)
  if (node.show !== undefined) {
    const isVisible =
      typeof node.show === 'string'
        ? !!resolvePath(data, node.show)
        : node.show;
    if (!isVisible) return null;
  }

  // Handle "if" conditional
  if (node.if !== undefined) {
    const condition =
      typeof node.if === 'string' ? !!resolvePath(data, node.if) : node.if;
    if (!condition) return null;
  }

  // ── Loop: repeat children for each item in a bound array ──────────────
  if (node.type === 'loop' || node.type === 'repeat') {
    const rawItems = resolvePath(data, node.bind) || [];
    if (!Array.isArray(rawItems)) return null;
    const items =
      rawItems.length > MAX_LOOP_ITEMS
        ? rawItems.slice(0, MAX_LOOP_ITEMS)
        : rawItems;
    const template = node.children?.[0];
    if (!template) return null;
    return (
      <>
        {items.map((item, index) => (
          <RenderNode
            key={node.key ? `${node.key}-${index}` : `loop-${index}`}
            node={{...template, key: `loop-${index}`}}
            data={{...data, item, index}}
            onAction={onAction}
            depth={depth + 1}
            resolveStyle={resolveStyle}
            defaultStyles={defaultStyles}
            tokens={tokens}
          />
        ))}
      </>
    );
  }

  // ── Conditional: render one of two branches based on a bound value ────
  if (node.type === 'conditional') {
    const condition = resolvePath(data, node.bind);
    const branch = condition ? node.children?.[0] : node.children?.[1];
    if (!branch) return null;
    return (
      <RenderNode
        node={branch}
        data={data}
        onAction={onAction}
        depth={depth + 1}
        resolveStyle={resolveStyle}
        defaultStyles={defaultStyles}
        tokens={tokens}
      />
    );
  }

  // Resolve data binding for text content
  const boundValue = node.bind ? resolvePath(data, node.bind) : undefined;
  const style = resolveStyle(node.style, data);
  const nodeProps = node.props || {};

  // Render children recursively
  const renderChildren = (children) => {
    if (!children || !Array.isArray(children)) return null;
    return children.map((child, i) => (
      <RenderNode
        key={child.key || `child-${i}`}
        node={child}
        data={data}
        onAction={onAction}
        depth={depth + 1}
        resolveStyle={resolveStyle}
        defaultStyles={defaultStyles}
        tokens={tokens}
      />
    ));
  };

  // Action handler (onClick / onPress)
  const handleClick = () => {
    if (node.action && onAction) {
      onAction(node.action, {node, boundValue, ...nodeProps});
    }
  };

  // Navigate action
  const handleNavigate = () => {
    if (nodeProps.navigate && onAction) {
      onAction('navigate', {path: nodeProps.navigate, ...nodeProps});
    }
  };

  // SetState action
  const handleSetState = () => {
    if (nodeProps.setState && onAction) {
      onAction('setState', nodeProps.setState);
    }
  };

  const combinedClick = () => {
    handleClick();
    if (nodeProps.navigate) handleNavigate();
    if (nodeProps.setState) handleSetState();
  };

  // Resolve text with template interpolation
  const resolveText = (text) => {
    if (text === undefined || text === null) return '';
    return interpolateTemplate(String(text), data);
  };

  // Animation sx
  const animationSx = node.animation
    ? {
        animation:
          ANIMATION_MAP[node.animation] ||
          `${node.animation} 0.5s ease-out forwards`,
      }
    : {};

  switch (node.type) {
    // ── Box / View / Column ─────────────────────────────────────────────
    case 'view':
    case 'box':
    case 'column':
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            ...style,
            ...animationSx,
          }}
        >
          {renderChildren(node.children)}
        </Box>
      );

    // ── Row ──────────────────────────────────────────────────────────────
    case 'row':
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            ...style,
            ...animationSx,
          }}
        >
          {renderChildren(node.children)}
        </Box>
      );

    // ── Grid ─────────────────────────────────────────────────────────────
    case 'grid': {
      const columns = nodeProps.columns || 2;
      return (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: `${spacing.sm}px`,
            ...style,
            ...animationSx,
          }}
        >
          {renderChildren(node.children)}
        </Box>
      );
    }

    // ── Scroll container ─────────────────────────────────────────────────
    case 'scroll':
      return (
        <Box
          sx={{
            overflowY: 'auto',
            overflowX: 'hidden',
            maxHeight: nodeProps.maxHeight || '100%',
            WebkitOverflowScrolling: 'touch',
            '&::-webkit-scrollbar': {width: 6},
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: colors.border,
              borderRadius: 3,
            },
            ...style,
            ...animationSx,
          }}
        >
          {renderChildren(node.children)}
        </Box>
      );

    // ── List ─────────────────────────────────────────────────────────────
    case 'list':
      return (
        <Box
          component="ul"
          sx={{
            listStyle: nodeProps.listStyle || 'none',
            m: 0,
            p: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: `${spacing.sm}px`,
            ...style,
            ...animationSx,
          }}
        >
          {(node.children || []).map((child, i) => (
            <Box
              component="li"
              key={child.key || `list-${i}`}
              sx={{listStyle: 'inherit'}}
            >
              <RenderNode
                node={child}
                data={data}
                onAction={onAction}
                depth={depth + 1}
                resolveStyle={resolveStyle}
                defaultStyles={defaultStyles}
                tokens={tokens}
              />
            </Box>
          ))}
        </Box>
      );

    // ── Text ─────────────────────────────────────────────────────────────
    case 'text':
      return (
        <Typography
          sx={{
            ...defaultStyles.defaultText,
            ...style,
            ...animationSx,
          }}
          variant={nodeProps.variant || 'body1'}
          component={nodeProps.component || 'span'}
          noWrap={nodeProps.noWrap || false}
        >
          {boundValue !== undefined
            ? resolveText(String(boundValue))
            : resolveText(nodeProps.text || '')}
        </Typography>
      );

    // ── Button ───────────────────────────────────────────────────────────
    case 'button':
      return (
        <Button
          onClick={combinedClick}
          disabled={nodeProps.disabled}
          variant={nodeProps.variant || 'contained'}
          size={nodeProps.size || 'medium'}
          sx={{
            ...defaultStyles.defaultButton,
            ...style,
            ...animationSx,
          }}
          startIcon={
            nodeProps.icon
              ? (() => {
                  const IconComp = getMuiIcon(nodeProps.icon);
                  return IconComp ? (
                    <IconComp
                      sx={{
                        fontSize: nodeProps.iconSize || 20,
                        color: nodeProps.iconColor || 'inherit',
                      }}
                    />
                  ) : null;
                })()
              : undefined
          }
        >
          {nodeProps.text ? resolveText(nodeProps.text) : null}
          {renderChildren(node.children)}
        </Button>
      );

    // ── Icon ─────────────────────────────────────────────────────────────
    case 'icon': {
      const iconName = boundValue || nodeProps.name || 'HelpOutline';
      const IconComponent = getMuiIcon(iconName);
      if (!IconComponent) return null;
      const iconColor = nodeProps.color
        ? nodeProps.color.startsWith('$')
          ? colors[nodeProps.color.slice(1)]
          : nodeProps.color
        : colors.accent;
      if (node.action) {
        return (
          <IconButton onClick={combinedClick} sx={{...style, ...animationSx}}>
            <IconComponent
              sx={{fontSize: nodeProps.size || 24, color: iconColor}}
            />
          </IconButton>
        );
      }
      return (
        <IconComponent
          sx={{
            fontSize: nodeProps.size || 24,
            color: iconColor,
            ...style,
            ...animationSx,
          }}
        />
      );
    }

    // ── Image ────────────────────────────────────────────────────────────
    case 'image': {
      const src = boundValue || nodeProps.uri || nodeProps.src || '';
      return (
        <Box
          component="img"
          src={src}
          alt={nodeProps.alt || ''}
          loading="lazy"
          draggable={false}
          sx={{
            width: nodeProps.width || 100,
            height: nodeProps.height || 100,
            borderRadius:
              nodeProps.borderRadius != null
                ? `${nodeProps.borderRadius}px`
                : 0,
            objectFit: nodeProps.resizeMode || nodeProps.objectFit || 'contain',
            display: 'block',
            ...style,
            ...animationSx,
          }}
        />
      );
    }

    // ── Input (TextField) ────────────────────────────────────────────────
    case 'input':
      return (
        <TextField
          sx={{
            ...defaultStyles.defaultInput,
            ...style,
            ...animationSx,
          }}
          placeholder={nodeProps.placeholder || ''}
          value={boundValue !== undefined ? String(boundValue) : undefined}
          onChange={(e) =>
            onAction &&
            onAction(node.action || 'inputChange', {
              text: e.target.value,
              field: node.bind,
            })
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter' && node.action) {
              onAction && onAction(node.action, {field: node.bind});
            }
          }}
          type={nodeProps.type || 'text'}
          multiline={nodeProps.multiline || false}
          rows={nodeProps.rows || (nodeProps.multiline ? 3 : undefined)}
          variant={nodeProps.variant || 'outlined'}
          size="small"
          fullWidth={nodeProps.fullWidth !== false}
        />
      );

    // ── Spacer ───────────────────────────────────────────────────────────
    case 'spacer':
      return (
        <Box
          sx={{
            height: nodeProps.size || spacing.md,
            width: nodeProps.horizontal ? nodeProps.size || spacing.md : 'auto',
            flexShrink: 0,
            ...style,
          }}
        />
      );

    // ── Divider ──────────────────────────────────────────────────────────
    case 'divider':
      return (
        <Divider
          sx={{
            my: `${spacing.sm}px`,
            borderColor: colors.border,
            ...style,
          }}
          orientation={nodeProps.orientation || 'horizontal'}
        />
      );

    // ── Card ─────────────────────────────────────────────────────────────
    case 'card':
      if (node.action) {
        return (
          <Card
            sx={{
              ...defaultStyles.defaultCard,
              cursor: 'pointer',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: shadows.cardHover,
              },
              ...style,
              ...animationSx,
            }}
          >
            <CardActionArea onClick={combinedClick} sx={{p: `${spacing.md}px`}}>
              {renderChildren(node.children)}
            </CardActionArea>
          </Card>
        );
      }
      return (
        <Card
          sx={{
            ...defaultStyles.defaultCard,
            ...style,
            ...animationSx,
          }}
          elevation={0}
        >
          <CardContent
            sx={{p: `${spacing.md}px`, '&:last-child': {pb: `${spacing.md}px`}}}
          >
            {renderChildren(node.children)}
          </CardContent>
        </Card>
      );

    // ── Chip ─────────────────────────────────────────────────────────────
    case 'chip':
      return (
        <Chip
          label={
            boundValue !== undefined
              ? resolveText(String(boundValue))
              : resolveText(nodeProps.label || '')
          }
          icon={
            nodeProps.icon
              ? (() => {
                  const IconComp = getMuiIcon(nodeProps.icon);
                  return IconComp ? <IconComp /> : undefined;
                })()
              : undefined
          }
          color={nodeProps.color || 'default'}
          variant={nodeProps.variant || 'filled'}
          size={nodeProps.size || 'medium'}
          onClick={node.action ? combinedClick : undefined}
          onDelete={
            nodeProps.onDelete
              ? () => onAction && onAction('chipDelete', nodeProps)
              : undefined
          }
          sx={{
            ...style,
            ...animationSx,
          }}
        />
      );

    // ── Progress ─────────────────────────────────────────────────────────
    case 'progress': {
      const progressValue =
        boundValue !== undefined ? Number(boundValue) : nodeProps.value || 0;
      if (nodeProps.circular) {
        return (
          <CircularProgress
            variant={nodeProps.indeterminate ? 'indeterminate' : 'determinate'}
            value={progressValue}
            size={nodeProps.size || 40}
            thickness={nodeProps.thickness || 4}
            sx={{
              color: nodeProps.color || colors.accent,
              ...style,
              ...animationSx,
            }}
          />
        );
      }
      return (
        <LinearProgress
          variant={nodeProps.indeterminate ? 'indeterminate' : 'determinate'}
          value={progressValue}
          sx={{
            height: nodeProps.height || 8,
            borderRadius: `${borderRadius.full}px`,
            backgroundColor: colors.border,
            '& .MuiLinearProgress-bar': {
              backgroundColor: nodeProps.color || colors.accent,
              borderRadius: `${borderRadius.full}px`,
            },
            ...style,
            ...animationSx,
          }}
        />
      );
    }

    // ── Animated wrapper ─────────────────────────────────────────────────
    case 'animated': {
      const animName = nodeProps.animation || 'fadeIn';
      const animDuration = nodeProps.duration || 500;
      const animDelay = nodeProps.delay || 0;
      const animIteration = nodeProps.loop ? 'infinite' : 1;

      return (
        <Box
          sx={{
            animation: `${animName} ${animDuration}ms ease-out ${animDelay}ms ${animIteration} forwards`,
            ...style,
          }}
        >
          {renderChildren(node.children)}
        </Box>
      );
    }

    // ── Default: unknown type renders as Box container ───────────────────
    default:
      return (
        <Box sx={{...style, ...animationSx}}>
          {renderChildren(node.children)}
        </Box>
      );
  }
};

// ── Main Component ──────────────────────────────────────────────────────────

/**
 * ServerDrivenUI - Main component for rendering server-defined layouts.
 *
 * Props:
 * - themeTokens: { colors, spacing, borderRadius, fontSizes, fontWeights, shadows }
 * - layout: JSON layout tree from server
 * - data: Data context for bindings (state, config, etc.)
 * - onAction: Callback when user interacts (action name, payload)
 * - sx: Additional container sx styles
 * - style: Additional inline styles (for backward compat)
 */
const ServerDrivenUI = ({
  themeTokens,
  layout,
  data = {},
  onAction,
  sx,
  style,
}) => {
  // Fallback: try context if themeTokens prop not provided
  const contextTokens = useContext(LiquidUIContext);
  const tokens = themeTokens || contextTokens;

  // Memoize computed presets and styles from tokens
  const stylePresets = useMemo(
    () => (tokens ? buildStylePresets(tokens) : {}),
    [tokens]
  );
  const defaultStyles = useMemo(
    () => (tokens ? buildDefaultStyles(tokens) : {}),
    [tokens]
  );
  const resolveStyleFn = useMemo(
    () =>
      tokens ? makeResolveStyle(stylePresets, tokens.colors) : () => undefined,
    [stylePresets, tokens]
  );

  useEffect(() => {
    ensureAnimationKeyframes();
  }, []);

  if (!layout || !tokens) return null;

  return (
    <Box
      sx={{
        ...defaultStyles.container,
        ...sx,
      }}
      style={style}
    >
      <RenderNode
        node={layout}
        data={data}
        onAction={onAction}
        resolveStyle={resolveStyleFn}
        defaultStyles={defaultStyles}
        tokens={tokens}
      />
    </Box>
  );
};

// Export both the main component and utilities for flexibility
export {
  RenderNode,
  resolvePath,
  makeResolveStyle,
  interpolateTemplate,
  getMuiIcon,
  ANIMATION_MAP,
  ensureAnimationKeyframes,
};

export default ServerDrivenUI;
