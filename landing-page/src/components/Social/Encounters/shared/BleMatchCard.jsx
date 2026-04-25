/**
 * BleMatchCard.jsx — Render a single BLE mutual-encounter match.
 *
 * Consumes the row shape returned by HARTOS encounter_api._match_to_dict
 * (integrations/social/encounter_api.py:540-557):
 *   { id, user_a, user_b, lat, lng, matched_at,
 *     icebreaker_a_status, icebreaker_b_status, map_pin_visible }
 *
 * Mission anchors honored:
 *  - NO photo capture, NO user-uploaded image — Studio-Ghibli-style avatar
 *    placeholder only (initial fallback).  Encounter design constraint:
 *    avatar-only (project_encounter_icebreaker.md).
 *  - "Send icebreaker" is a USER ACTION button.  This component only
 *    *triggers* the parent callback; it never auto-fires the icebreaker
 *    flow.  IcebreakerDraftSheet (Forward Plan F2) will mount on the
 *    parent in response to the callback.
 *  - Copy avoids surveillance framing.  We label the surface
 *    "Mutual encounter" / "Both said yes" — not "tracked" / "matched".
 */
import {RADIUS, SHADOWS, EASINGS, DURATIONS} from '../../../../theme/socialTokens';
import {pressDown} from '../../../../utils/animations';

import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import {
  Card,
  CardContent,
  Avatar,
  Typography,
  Box,
  Chip,
  Button,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React from 'react';

function formatMatchedAt(ts) {
  // matched_at is a unix timestamp (seconds) per _match_to_dict.
  if (!ts) return '';
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diffSec = Math.floor((now - d.getTime()) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return d.toLocaleDateString();
}

export default function BleMatchCard({
  match,
  currentUserId,
  onIcebreaker,
  onHide,
}) {
  const theme = useTheme();

  // Determine "the other party" — never show the viewer's own avatar.
  // user_a / user_b are user-id strings per HARTOS _match_to_dict.
  const otherUserId =
    match.user_a === currentUserId ? match.user_b : match.user_a;

  // Initial fallback for Studio-Ghibli-style avatar (no photo per
  // encounter design constraint).  We hash the user-id deterministically
  // so the same user shows the same initial placeholder across renders.
  const initial = (otherUserId || '?').slice(0, 1).toUpperCase();

  // Per-side icebreaker status — show a soft chip if either side has
  // already acted, so the user isn't confused about why the button is
  // disabled below.
  const viewerSide = match.user_a === currentUserId ? 'a' : 'b';
  const viewerStatus =
    viewerSide === 'a'
      ? match.icebreaker_a_status
      : match.icebreaker_b_status;
  const otherStatus =
    viewerSide === 'a'
      ? match.icebreaker_b_status
      : match.icebreaker_a_status;

  const viewerHasSent = viewerStatus === 'sent';
  const viewerHasDeclined = viewerStatus === 'declined';
  const buttonDisabled = viewerHasSent || viewerHasDeclined;

  return (
    <Card
      data-testid={`ble-match-${match.id}`}
      sx={{
        borderRadius: RADIUS.lg,
        overflow: 'visible',
        transition: `transform ${DURATIONS.fast}ms ${EASINGS.smooth}, box-shadow ${DURATIONS.fast}ms ${EASINGS.smooth}, border-color ${DURATIONS.fast}ms ease`,
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: SHADOWS.cardHover,
          borderColor: alpha(theme.palette.primary.main, 0.2),
        },
        mb: 2,
      }}
    >
      <CardContent sx={{p: {xs: 1.5, md: 2}}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
          <Avatar
            // No `src` — avatar-only by design (no photos).
            sx={{
              width: {xs: 48, md: 56},
              height: {xs: 48, md: 56},
              background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              fontSize: {xs: 18, md: 22},
              fontWeight: 600,
            }}
          >
            {initial}
          </Avatar>

          <Box sx={{flex: 1, minWidth: 0}}>
            <Typography variant="subtitle1" sx={{fontWeight: 600}} noWrap>
              Mutual encounter
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{display: 'block'}}
            >
              Both said yes
              {match.matched_at
                ? ` · ${formatMatchedAt(match.matched_at)}`
                : ''}
            </Typography>
          </Box>

          {viewerHasSent && (
            <Chip
              label="Icebreaker sent"
              size="small"
              color="success"
              sx={{borderRadius: RADIUS.sm}}
            />
          )}
          {viewerHasDeclined && (
            <Chip
              label="Declined"
              size="small"
              variant="outlined"
              sx={{borderRadius: RADIUS.sm}}
            />
          )}
          {otherStatus === 'sent' && !viewerHasSent && (
            <Chip
              label="They said hi"
              size="small"
              color="primary"
              sx={{borderRadius: RADIUS.sm}}
            />
          )}
        </Box>

        <Box
          sx={{
            display: 'flex',
            gap: 1,
            justifyContent: 'flex-end',
            mt: 1.5,
          }}
        >
          {onHide && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<VisibilityOffIcon />}
              onClick={() => onHide(match)}
              sx={{borderRadius: RADIUS.sm, ...pressDown}}
              data-testid={`ble-match-${match.id}-hide`}
            >
              Hide from map
            </Button>
          )}
          {onIcebreaker && (
            <Button
              variant="contained"
              size="small"
              startIcon={<ChatBubbleOutlineIcon />}
              disabled={buttonDisabled}
              onClick={() => onIcebreaker(match)}
              sx={{
                borderRadius: RADIUS.sm,
                ...pressDown,
                background: `linear-gradient(to right, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                '&:hover': {
                  background: `linear-gradient(to right, ${theme.palette.primary.dark}, ${theme.palette.secondary.dark})`,
                },
              }}
              data-testid={`ble-match-${match.id}-icebreaker`}
            >
              Send icebreaker
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
