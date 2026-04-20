/**
 * GpuTierBadge — surfaces the GPU speculation-capability boundary in the chat header.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Commit 2acf21a raised the draft-boot VRAM threshold from >=8GB to >=10GB so
 * the smallest TTS engine still fits alongside the main+draft LLM pair. On
 * 8GB-GPU laptops, chat now runs main-only (no speculative decoding) and is
 * silently ~1.3-2.0s slower per reply. Users blamed "the product". This badge
 * makes the root cause VISIBLE: it shows the GPU tier, explains the trade-off
 * in plain language, and points at the 10GB threshold as the unlock.
 *
 * SINGLE-SOURCE-OF-TRUTH REFACTOR
 * ───────────────────────────────
 * Tier thresholds + labels USED to be hard-coded in this file (24/10/4 GB).
 * They drifted from the backend `/backend/health` classifier silently for
 * months.  Now both come from `core.gpu_tier` (Python module) and the
 * frontend FETCHES the canonical table from `GET /api/v1/system/tiers` on
 * mount.  Future threshold tweaks happen in ONE place.
 *
 * A11Y CONTRACT
 * ─────────────
 * - Never color-alone: every tier pairs an icon + label + color.
 * - aria-label carries the full human description (not just the tier name).
 * - Tooltip respects `prefers-reduced-motion` (no enter/exit fade if set).
 * - Chip is keyboard-focusable via role="status" (ambient info, not a control).
 *
 * DATA SOURCE
 * ───────────
 * GET /backend/health   — dynamic (re-polled every 60s) for the GPU state itself.
 * GET /api/v1/system/tiers — static-ish (release-cadence) for the tier table.
 *   The tier table is fetched ONCE on mount; if it 404s we fall back to a
 *   minimal hard-coded table so the badge still renders something useful
 *   on cold installs where the endpoint isn't yet wired.
 */

import {API_BASE_URL} from '../../config/apiBase';

import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import {Zap, Gauge, Cpu, AlertTriangle} from 'lucide-react';
import React, {useEffect, useState, useMemo} from 'react';


const POLL_INTERVAL_MS = 60_000;

// Per-tier presentation metadata that the BACKEND can't reasonably ship —
// icon component + colors are pure UI concerns.  Keyed by tier name (matches
// `core.gpu_tier.GpuTier` values: 'ultra', 'full', 'standard', 'none').
const TIER_PRESENTATION = {
  ultra: {
    bg: 'rgba(155, 148, 255, 0.18)',
    fg: '#9B94FF',
    border: 'rgba(155, 148, 255, 0.45)',
    Icon: Zap,
  },
  full: {
    bg: 'rgba(46, 204, 113, 0.16)',
    fg: '#2ECC71',
    border: 'rgba(46, 204, 113, 0.45)',
    Icon: Zap,
  },
  standard: {
    bg: 'rgba(245, 166, 35, 0.16)',
    fg: '#F5A623',
    border: 'rgba(245, 166, 35, 0.45)',
    Icon: Gauge,
  },
  none: {
    bg: 'rgba(149, 165, 166, 0.16)',
    fg: '#95A5A6',
    border: 'rgba(149, 165, 166, 0.45)',
    Icon: Cpu,
  },
  unknown: {
    bg: 'rgba(149, 165, 166, 0.10)',
    fg: '#95A5A6',
    border: 'rgba(149, 165, 166, 0.30)',
    Icon: AlertTriangle,
  },
};

// Last-resort fallback if /api/v1/system/tiers is unreachable (e.g.,
// pre-refactor backend running against a post-refactor frontend during
// rollout).  Deliberately MINIMAL — operators should see the placeholder
// labels and know the canonical endpoint is missing.
const FALLBACK_TIER_TABLE = [
  {name: 'ultra', label: 'Ultra GPU', short: 'Ultra',
    description: 'GPU tier (label table not yet loaded from server).'},
  {name: 'full', label: 'Full GPU', short: 'Full',
    description: 'GPU tier (label table not yet loaded from server).'},
  {name: 'standard', label: 'Standard GPU', short: 'Standard',
    description: 'GPU tier (label table not yet loaded from server).'},
  {name: 'none', label: 'CPU', short: 'CPU',
    description: 'GPU tier (label table not yet loaded from server).'},
  {name: 'unknown', label: 'GPU: checking', short: '...',
    description: 'Detecting GPU tier…'},
];

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export default function GpuTierBadge({className = '', style = {}}) {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(false);
  const [tierTable, setTierTable] = useState(FALLBACK_TIER_TABLE);
  const reducedMotion = useMemo(prefersReducedMotion, []);

  // ── One-shot fetch of the canonical tier table on mount ──
  // The thresholds + labels used to be hard-coded in this file; now they
  // come from the backend so a single edit to core.gpu_tier ships
  // everywhere consistently.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/system/tiers`, {
          method: 'GET',
          headers: {Accept: 'application/json'},
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.tiers)) {
          // Append the 'unknown' presentation entry (UI-only, server doesn't ship it)
          const withUnknown = [
            ...data.tiers,
            {
              name: 'unknown',
              label: 'GPU: checking',
              short: '...',
              description: 'Detecting GPU tier…',
            },
          ];
          setTierTable(withUnknown);
        }
      } catch (_) {
        // Keep the fallback table — log only once.
        // eslint-disable-next-line no-console
        console.warn(
          'GpuTierBadge: /api/v1/system/tiers unavailable, using fallback labels'
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const fetchHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/backend/health`, {
          method: 'GET',
          headers: {Accept: 'application/json'},
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setHealth(data);
          setError(false);
        }
      } catch (e) {
        if (!cancelled) setError(true);
      }
    };

    fetchHealth();
    timer = setInterval(fetchHealth, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const tierKey = error || !health ? 'unknown' : (health.gpu_tier || 'unknown');
  const tierMeta = tierTable.find((t) => t.name === tierKey)
    || tierTable.find((t) => t.name === 'unknown')
    || FALLBACK_TIER_TABLE[FALLBACK_TIER_TABLE.length - 1];
  const presentation = TIER_PRESENTATION[tierKey] || TIER_PRESENTATION.unknown;
  const {Icon} = presentation;

  // Build the human tooltip + aria-label. Includes concrete numbers when
  // we have them so the user can see "why" at a glance.
  const detailLine = (() => {
    if (!health || error) return '';
    const parts = [];
    if (health.gpu_name) parts.push(health.gpu_name);
    if (typeof health.vram_total_gb === 'number' && health.vram_total_gb > 0) {
      parts.push(`${health.vram_total_gb.toFixed(1)}GB VRAM`);
    }
    if (typeof health.vram_free_gb === 'number' && health.vram_total_gb > 0) {
      parts.push(`${health.vram_free_gb.toFixed(1)}GB free`);
    }
    parts.push(
      health.speculation_enabled
        ? 'speculative decoding: on'
        : 'speculative decoding: off'
    );
    return parts.join(' · ');
  })();

  // Cohort-aware description: if speculation IS running on a standard-
  // tier GPU, the default "upgrade to 10GB for speculation" tooltip is
  // wrong — the cohort fast-path (English + Kokoro/Piper, commit
  // 12c9304) already unlocked it.  Replace with the correct rationale.
  const effectiveDescription = (() => {
    if (!health || error) return tierMeta.description;
    if (tierKey === 'standard' && health.speculation_enabled) {
      return (
        'Standard GPU with speculative decoding active via the '
        + 'cohort fast-path (English + Kokoro/Piper TTS fit in 8GB). '
        + 'Upgrading to 10GB+ VRAM unlocks speculation for any '
        + 'language / voice combination.'
      );
    }
    return tierMeta.description;
  })();

  const fullDescription = detailLine
    ? `${effectiveDescription} Current: ${detailLine}.`
    : effectiveDescription;

  const chip = (
    <Chip
      role="status"
      aria-label={fullDescription}
      icon={
        <Icon
          size={14}
          aria-hidden="true"
          style={{color: presentation.fg, marginLeft: 4}}
        />
      }
      label={tierMeta.short}
      size="small"
      className={className}
      sx={{
        minHeight: 20,
        height: 24,
        borderRadius: '9999px', // pill — literal px to dodge MUI's 8px multiplier
        backgroundColor: presentation.bg,
        color: presentation.fg,
        border: `1px solid ${presentation.border}`,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.2,
        px: 0.5,
        '& .MuiChip-label': {
          px: 0.75,
          color: presentation.fg,
        },
        '& .MuiChip-icon': {
          color: presentation.fg,
          marginRight: '-2px',
        },
        ...style,
      }}
    />
  );

  return (
    <Tooltip
      title={fullDescription}
      arrow
      placement="bottom"
      // prefers-reduced-motion: skip the fade animation.
      TransitionProps={reducedMotion ? {timeout: 0} : undefined}
      enterDelay={reducedMotion ? 0 : 200}
      leaveDelay={0}
    >
      {chip}
    </Tooltip>
  );
}
