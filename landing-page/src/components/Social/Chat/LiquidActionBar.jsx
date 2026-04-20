/**
 * LiquidActionBar — floating action chips surfacing cross-page destinations.
 *
 * Lives on the agent chat screen and renders ui_action chips the user can
 * click to navigate elsewhere in the app. Populated from two sources:
 *
 *   1. The page registry (pageRegistry.js) — seed chips shown on mount so
 *      the bar is never empty. Role-filtered.
 *   2. ui_actions the backend attaches to /chat responses — when the user
 *      says "take me to social" the Navigate_App tool resolves the page
 *      and the bar instantly reshuffles to surface that destination first.
 *
 * Decoupled from the chat component via a `nunba:ui_actions` CustomEvent,
 * so there is zero prop drilling between Demopage.js (which handles the
 * chat response) and this bar (which renders the chips).
 *
 * Visual language matches NunbaChatPill: glass morphism, rounded corners,
 * purple (#6C63FF) accent.
 */
import {listPages, iconFor} from '../../../config/pageRegistry';

import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {Box, Chip, Tooltip, IconButton, Collapse} from '@mui/material';
import React, {useEffect, useMemo, useState, useCallback} from 'react';
import {useNavigate} from 'react-router-dom';


export const UI_ACTIONS_EVENT = 'nunba:ui_actions';

/** Dispatch a ui_actions update. Call this from Demopage.js when a chat
 *  response comes back with a `ui_actions` field. Any LiquidActionBar
 *  mounted on the page will pick it up synchronously. */
export function publishUiActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return;
  window.dispatchEvent(new CustomEvent(UI_ACTIONS_EVENT, {detail: actions}));
}

/**
 * Convert a pageRegistry entry to the same shape the backend emits so the
 * chip renderer treats seed + chat-driven actions identically.
 */
function pageToSeed(page) {
  return {
    id: page.id,
    type: 'navigate',
    label: page.label,
    route: page.route,
    icon: page.icon,
    category: page.category,
    description: page.label,
    __seed: true,
  };
}

/**
 * Merge fresh ui_actions in front of existing ones, de-duping by id. The
 * freshest action for each id wins, preserving order of first occurrence.
 */
function mergeActions(previous, incoming) {
  const seen = new Set();
  const out = [];
  for (const a of [...(incoming || []), ...(previous || [])]) {
    if (!a || !a.id) continue;
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

export default function LiquidActionBar({userRole = 'flat', maxVisible = 6}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [actions, setActions] = useState(() => listPages(userRole).map(pageToSeed));

  // Refresh seed list if the role changes (login/logout).
  useEffect(() => {
    setActions((prev) => {
      const seeds = listPages(userRole).map(pageToSeed);
      // Keep any non-seed (chat-emitted) actions on top.
      const fresh = prev.filter((a) => !a.__seed);
      return mergeActions(seeds, fresh);
    });
  }, [userRole]);

  // Listen for chat-driven ui_actions updates.
  useEffect(() => {
    const handler = (ev) => {
      const incoming = ev?.detail || [];
      if (!Array.isArray(incoming) || incoming.length === 0) return;
      setActions((prev) => mergeActions(prev, incoming));
      // Auto-expand so the user notices the fresh suggestion.
      setExpanded(true);
    };
    window.addEventListener(UI_ACTIONS_EVENT, handler);
    return () => window.removeEventListener(UI_ACTIONS_EVENT, handler);
  }, []);

  const visible = useMemo(
    () => (expanded ? actions : actions.slice(0, maxVisible)),
    [actions, expanded, maxVisible],
  );

  const handleClick = useCallback(
    (action) => {
      if (!action || action.type !== 'navigate' || !action.route) return;
      navigate(action.route);
    },
    [navigate],
  );

  if (actions.length === 0) return null;

  const hasMore = actions.length > maxVisible;

  return (
    <Box
      data-testid="liquid-action-bar"
      sx={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 10,
        maxWidth: 'calc(100% - 24px)',
        background: 'rgba(15,14,23,0.78)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(108,99,255,0.28)',
        borderRadius: '14px',
        padding: '6px 10px',
        boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
      }}
    >
      <Collapse in orientation="horizontal" collapsedSize="auto">
        <Box sx={{display: 'flex', gap: 0.75, flexWrap: 'wrap'}}>
          {visible.map((action) => {
            const Icon = iconFor(action.icon);
            const isFresh = !action.__seed;
            return (
              <Tooltip
                key={action.id}
                title={action.description || action.label}
                placement="bottom"
              >
                <Chip
                  icon={<Icon style={{fontSize: 16}} />}
                  label={action.label}
                  size="small"
                  clickable
                  onClick={() => handleClick(action)}
                  sx={{
                    color: isFresh ? '#fff' : 'rgba(255,255,255,0.82)',
                    background: isFresh
                      ? 'rgba(108,99,255,0.34)'
                      : 'rgba(255,255,255,0.06)',
                    border: isFresh
                      ? '1px solid rgba(108,99,255,0.6)'
                      : '1px solid rgba(255,255,255,0.1)',
                    fontWeight: isFresh ? 600 : 400,
                    transition: 'all 120ms ease',
                    '&:hover': {
                      background: 'rgba(108,99,255,0.5)',
                      transform: 'translateY(-1px)',
                    },
                    '& .MuiChip-icon': {
                      color: isFresh ? '#fff' : 'rgba(255,255,255,0.7)',
                    },
                  }}
                />
              </Tooltip>
            );
          })}
        </Box>
      </Collapse>
      {hasMore && (
        <IconButton
          size="small"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Show fewer actions' : 'Show more actions'}
          sx={{color: 'rgba(255,255,255,0.6)', padding: '2px'}}
        >
          {expanded ? (
            <ExpandLessIcon fontSize="small" />
          ) : (
            <ExpandMoreIcon fontSize="small" />
          )}
        </IconButton>
      )}
    </Box>
  );
}
