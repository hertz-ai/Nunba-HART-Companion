/**
 * ServerDrivenUI - Kids Learning Zone wrapper.
 *
 * Thin adapter that imports the shared LiquidUI renderer and passes
 * kidsTheme tokens. All existing imports (default + named) remain
 * backward-compatible.
 *
 * The shared core lives at:
 *   components/shared/LiquidUI/ServerDrivenUI.jsx
 */

import {
  kidsColors,
  kidsSpacing,
  kidsBorderRadius,
  kidsFontSizes,
  kidsFontWeights,
  kidsShadows,
} from './kidsTheme';

import SharedServerDrivenUI, {
  RenderNode as SharedRenderNode,
  resolvePath,
  makeResolveStyle,
  interpolateTemplate,
  getMuiIcon,
  buildStylePresets,
} from '../../shared/LiquidUI/ServerDrivenUI';

import React from 'react';

// ── Build kids tokens matching the themeTokens shape ────────────────────────

const kidsTokens = {
  colors: kidsColors,
  spacing: kidsSpacing,
  borderRadius: kidsBorderRadius,
  fontSizes: kidsFontSizes,
  fontWeights: kidsFontWeights,
  shadows: kidsShadows,
};

// ── Pre-compute kids-specific style presets and resolveStyle ─────────────────
// These are static (kidsTheme never changes at runtime), so compute once.

const STYLE_PRESETS = buildStylePresets(kidsTokens);
const resolveStyle = makeResolveStyle(STYLE_PRESETS, kidsColors);

// ── Re-export RenderNode wired to kids tokens ───────────────────────────────

const RenderNode = (props) => (
  <SharedRenderNode
    {...props}
    resolveStyle={resolveStyle}
    defaultStyles={null}
    tokens={kidsTokens}
  />
);

// ── Main component: same signature as the original ──────────────────────────

/**
 * ServerDrivenUI - Main component for rendering server-defined layouts.
 *
 * Props:
 * - layout: JSON layout tree from server
 * - data: Data context for bindings (state, config, etc.)
 * - onAction: Callback when user interacts (action name, payload)
 * - sx: Additional container sx styles
 * - style: Additional inline styles (for backward compat)
 */
const ServerDrivenUI = ({layout, data = {}, onAction, sx, style}) => {
  return (
    <SharedServerDrivenUI
      themeTokens={kidsTokens}
      layout={layout}
      data={data}
      onAction={onAction}
      sx={sx}
      style={style}
    />
  );
};

// Export both the main component and utilities for flexibility
export {
  RenderNode,
  resolvePath,
  resolveStyle,
  interpolateTemplate,
  STYLE_PRESETS,
  getMuiIcon,
};

export default ServerDrivenUI;
