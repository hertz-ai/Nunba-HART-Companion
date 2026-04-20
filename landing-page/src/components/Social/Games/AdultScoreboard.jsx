import {RADIUS, GRADIENTS, socialTokens} from '../../../theme/socialTokens';
import {animFadeInScale, animFadeInUp} from '../../../utils/animations';

import {Box, Typography, Avatar, Button, useTheme} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(participant, index) {
  const name =
    participant.username || participant.name || `Player ${index + 1}`;
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getDisplayName(participant, index) {
  return participant.username || participant.name || `Player ${index + 1}`;
}

function getSortedParticipants(participants, scores) {
  if (!participants) return [];
  return [...participants].sort((a, b) => {
    const sa = scores?.[a.id] ?? 0;
    const sb = scores?.[b.id] ?? 0;
    return sb - sa;
  });
}

const RANK_MEDALS = ['\u{1F947}', '\u{1F948}', '\u{1F949}', '4\uFE0F\u20E3'];

// ── LiveScoreBar ──────────────────────────────────────────────────────────────

/**
 * Compact horizontal bar showing live player scores during gameplay.
 * Highlights the current user and shows a crown for 1st place.
 */
export function LiveScoreBar({participants, scores, currentUserId}) {
  const theme = useTheme();
  const sorted = getSortedParticipants(participants, scores);

  if (!sorted.length) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1,
        borderRadius: RADIUS.md,
        ...socialTokens.glass.subtle(theme),
        overflowX: 'auto',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': {display: 'none'},
      }}
    >
      {sorted.map((p, idx) => {
        const score = scores?.[p.id] ?? 0;
        const isFirst = idx === 0 && score > 0;
        const isCurrent = p.id === currentUserId;

        return (
          <Box
            key={p.id || idx}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.5,
              py: 0.5,
              borderRadius: RADIUS.sm,
              background: isCurrent
                ? alpha(theme.palette.primary.main, 0.15)
                : 'transparent',
              border: isCurrent
                ? `1px solid ${alpha(theme.palette.primary.main, 0.3)}`
                : '1px solid transparent',
              flexShrink: 0,
              transition: 'background 200ms ease',
            }}
          >
            {isFirst && (
              <Typography sx={{fontSize: 14, lineHeight: 1}}>
                {'\u{1F451}'}
              </Typography>
            )}
            <Avatar
              sx={{
                width: 28,
                height: 28,
                fontSize: 11,
                fontWeight: 700,
                background: isCurrent
                  ? GRADIENTS.primary
                  : alpha(theme.palette.text.primary, 0.12),
                color: isCurrent ? '#fff' : theme.palette.text.primary,
              }}
            >
              {getInitials(p, idx)}
            </Avatar>
            <Typography
              variant="body2"
              sx={{
                fontWeight: isCurrent ? 700 : 500,
                color: isCurrent
                  ? theme.palette.primary.main
                  : theme.palette.text.primary,
                whiteSpace: 'nowrap',
              }}
            >
              {score}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

// ── MultiplayerResults ────────────────────────────────────────────────────────

/**
 * Full results screen with winner celebration, rankings, and action buttons.
 */
export function MultiplayerResults({
  participants,
  scores,
  currentUserId,
  onRematch,
  onLeave,
}) {
  const theme = useTheme();
  const sorted = getSortedParticipants(participants, scores);

  const winner = sorted[0];
  const winnerName = winner ? getDisplayName(winner, 0) : 'Unknown';
  const winnerScore = winner ? (scores?.[winner.id] ?? 0) : 0;
  const isCurrentUserWinner = winner?.id === currentUserId;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        maxWidth: 480,
        mx: 'auto',
        gap: 3,
      }}
    >
      {/* Winner celebration */}
      <Box sx={{textAlign: 'center', ...animFadeInScale()}}>
        <Typography sx={{fontSize: 48, lineHeight: 1, mb: 1}}>
          {'\u{1F3C6}'}
        </Typography>
        <Typography variant="h4" sx={{fontWeight: 800, mb: 0.5}}>
          {isCurrentUserWinner ? 'You Win!' : `${winnerName} Wins!`}
        </Typography>
        <Typography
          variant="h6"
          sx={{color: theme.palette.primary.main, fontWeight: 600}}
        >
          {winnerScore} points
        </Typography>
      </Box>

      {/* Rankings list */}
      <Box
        sx={{
          width: '100%',
          ...socialTokens.glass.surface(theme),
          borderRadius: RADIUS.lg,
          overflow: 'hidden',
        }}
      >
        {sorted.map((p, idx) => {
          const score = scores?.[p.id] ?? 0;
          const isCurrent = p.id === currentUserId;
          const medal = RANK_MEDALS[idx] || `${idx + 1}`;

          return (
            <Box
              key={p.id || idx}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                px: 2.5,
                py: 1.5,
                background: isCurrent
                  ? alpha(theme.palette.primary.main, 0.08)
                  : 'transparent',
                borderBottom:
                  idx < sorted.length - 1
                    ? `1px solid ${alpha(theme.palette.divider, 0.12)}`
                    : 'none',
                ...animFadeInUp(idx * 100),
              }}
            >
              {/* Rank */}
              <Typography
                sx={{
                  fontSize: idx < 4 ? 22 : 16,
                  width: 36,
                  textAlign: 'center',
                  fontWeight: 700,
                  color: idx >= 4 ? theme.palette.text.secondary : undefined,
                }}
              >
                {medal}
              </Typography>

              {/* Avatar */}
              <Avatar
                sx={{
                  width: 40,
                  height: 40,
                  fontWeight: 700,
                  fontSize: 14,
                  background:
                    idx === 0
                      ? GRADIENTS.primary
                      : alpha(theme.palette.text.primary, 0.1),
                  color: idx === 0 ? '#fff' : theme.palette.text.primary,
                }}
              >
                {getInitials(p, idx)}
              </Avatar>

              {/* Name */}
              <Typography
                sx={{
                  flex: 1,
                  fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent
                    ? theme.palette.primary.main
                    : theme.palette.text.primary,
                }}
              >
                {getDisplayName(p, idx)}
                {isCurrent ? ' (You)' : ''}
              </Typography>

              {/* Score */}
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color:
                    idx === 0
                      ? theme.palette.primary.main
                      : theme.palette.text.secondary,
                }}
              >
                {score}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Action buttons */}
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          width: '100%',
          ...animFadeInUp(sorted.length * 100 + 200),
        }}
      >
        <Button
          variant="outlined"
          sx={{
            flex: 1,
            borderColor: alpha(theme.palette.divider, 0.3),
            color: theme.palette.text.secondary,
            fontWeight: 600,
            borderRadius: RADIUS.md,
            textTransform: 'none',
            py: 1.2,
            '&:hover': {
              borderColor: theme.palette.divider,
              background: alpha(theme.palette.common.white, 0.04),
            },
          }}
          onClick={onLeave}
        >
          Back
        </Button>
        <Button
          sx={{
            flex: 2,
            background: GRADIENTS.primary,
            color: '#fff',
            fontWeight: 600,
            borderRadius: RADIUS.md,
            textTransform: 'none',
            py: 1.2,
            '&:hover': {
              background: GRADIENTS.primaryHover,
            },
          }}
          onClick={onRematch}
        >
          Rematch
        </Button>
      </Box>
    </Box>
  );
}

// ── Default export ────────────────────────────────────────────────────────────

export default {LiveScoreBar, MultiplayerResults};
