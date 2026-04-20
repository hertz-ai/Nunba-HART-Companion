/**
 * PledgeSummaryBar - Compact bar showing pledge status on ThoughtExperimentCard.
 *
 * Shows 3 mini progress bars (GPU, Credits, Money) with animated fill,
 * pledger avatar stack, and a Pledge button that opens PledgeDialog.
 * If user has already pledged, shows a green checkmark badge.
 *
 * Fits in ~48px height below the hypothesis box.
 */

import PledgeDialog from './PledgeDialog';

import { trackerApi } from '../../../services/socialApi';
import { RADIUS, EASINGS, DURATIONS } from '../../../theme/socialTokens';
import { useRoleAccess } from '../../RoleGuard';

import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudIcon from '@mui/icons-material/Cloud';
import MemoryIcon from '@mui/icons-material/Memory';
import PaymentIcon from '@mui/icons-material/Payment';
import {
  Box, Typography, Avatar, AvatarGroup, ButtonBase, Tooltip, keyframes, useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useState, useEffect, useRef, useCallback } from 'react';



// ---- Keyframes ----

const fillBar = keyframes`
  0%   { width: 0%; }
  100% { width: var(--fill-pct); }
`;

const countUp = keyframes`
  0%   { opacity: 0; transform: translateY(4px); }
  100% { opacity: 1; transform: translateY(0); }
`;

const badgePop = keyframes`
  0%   { transform: scale(0); }
  50%  { transform: scale(1.2); }
  100% { transform: scale(1); }
`;

// ---- Pledge type config ----

const TYPE_CONFIG = {
  gpu_hours: { icon: MemoryIcon, color: '#00BCD4', label: 'GPU' },
  cloud_credits: { icon: CloudIcon, color: '#6C63FF', label: 'Credits' },
  money: { icon: PaymentIcon, color: '#4CAF50', label: 'Funds' },
};

// ---- Mini progress bar ----

function MiniProgressBar({ type, pledged, consumed, inView }) {
  const config = TYPE_CONFIG[type];
  if (!config || !pledged) return null;

  const Icon = config.icon;
  const pct = Math.min(100, Math.round((consumed / pledged) * 100));

  return (
    <Tooltip title={`${type.replace('_', ' ')}: ${consumed}/${pledged} (${pct}%)`}>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 0.5,
        minWidth: 0, flex: 1,
      }}>
        <Icon sx={{ fontSize: 12, color: config.color, flexShrink: 0 }} />
        <Box sx={{
          flex: 1, height: 4, borderRadius: 2,
          bgcolor: alpha(config.color, 0.12),
          position: 'relative',
          overflow: 'hidden',
          minWidth: 24,
        }}>
          <Box sx={{
            '--fill-pct': `${pct}%`,
            position: 'absolute',
            top: 0, left: 0, bottom: 0,
            borderRadius: 2,
            background: `linear-gradient(90deg, ${config.color}, ${alpha(config.color, 0.6)})`,
            animation: inView ? `${fillBar} 800ms ${EASINGS.decelerate} both` : 'none',
            width: inView ? `${pct}%` : '0%',
          }} />
        </Box>
        <Typography variant="caption" sx={{
          fontSize: '0.62rem',
          color: 'rgba(255,255,255,0.45)',
          fontWeight: 600,
          lineHeight: 1,
          flexShrink: 0,
          animation: inView ? `${countUp} 500ms ${EASINGS.decelerate} 300ms both` : 'none',
        }}>
          {pct}%
        </Typography>
      </Box>
    </Tooltip>
  );
}

// ---- Component ----

export default function PledgeSummaryBar({ postId, experimentTitle, pledgeData: externalData, compact = false }) {
  const theme = useTheme();
  const { canWrite, isAuthenticated } = useRoleAccess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [summary, setSummary] = useState(externalData || null);
  const [inView, setInView] = useState(false);
  const barRef = useRef(null);

  // IntersectionObserver for viewport-triggered animations
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const fallback = setTimeout(() => setInView(true), 500);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          clearTimeout(fallback);
          setInView(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => { observer.disconnect(); clearTimeout(fallback); };
  }, []);

  // Fetch pledge summary on mount
  const fetchSummary = useCallback(async () => {
    if (!postId) return;
    try {
      const res = await trackerApi.pledgeSummary(postId);
      if (res.data?.data) setSummary(res.data.data);
      else if (res.data) setSummary(res.data);
    } catch {
      // silent — pledge data is optional
    }
  }, [postId]);

  useEffect(() => {
    if (!externalData) fetchSummary();
  }, [externalData, fetchSummary]);

  // Refresh after dialog closes (in case user pledged)
  const handleDialogClose = () => {
    setDialogOpen(false);
    fetchSummary();
  };

  // Extract summary data
  const pledges = summary?.pledges || {};
  const pledgers = summary?.pledgers || [];
  const pledgerCount = summary?.pledger_count || pledgers.length || 0;
  const userPledge = summary?.user_pledge || null;

  const gpuData = pledges.gpu_hours || {};
  const creditsData = pledges.cloud_credits || {};
  const moneyData = pledges.money || {};

  const hasAnyPledges = (gpuData.total > 0) || (creditsData.total > 0) || (moneyData.total > 0);

  return (
    <>
      <Box
        ref={barRef}
        onClick={(e) => e.stopPropagation()}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: compact ? { xs: 0.5, sm: 1 } : { xs: 0.75, sm: 1.5 },
          px: compact ? 1 : 1.5,
          py: compact ? 0.5 : 0.75,
          mt: compact ? 0.5 : 1,
          borderRadius: RADIUS.sm,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.04)',
          minHeight: compact ? 28 : 36,
          flexWrap: { xs: 'wrap', sm: 'nowrap' },
        }}
      >
        {/* Progress bars */}
        {hasAnyPledges ? (
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            flex: 1, minWidth: 0,
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
          }}>
            {gpuData.total > 0 && (
              <MiniProgressBar
                type="gpu_hours"
                pledged={gpuData.total}
                consumed={gpuData.consumed || 0}
                inView={inView}
              />
            )}
            {creditsData.total > 0 && (
              <MiniProgressBar
                type="cloud_credits"
                pledged={creditsData.total}
                consumed={creditsData.consumed || 0}
                inView={inView}
              />
            )}
            {moneyData.total > 0 && (
              <MiniProgressBar
                type="money"
                pledged={moneyData.total}
                consumed={moneyData.consumed || 0}
                inView={inView}
              />
            )}
          </Box>
        ) : (
          <Typography variant="caption" sx={{
            color: 'rgba(255,255,255,0.25)',
            flex: 1,
            fontSize: '0.72rem',
          }}>
            No pledges yet
          </Typography>
        )}

        {/* Pledger avatars */}
        {pledgerCount > 0 && (
          <Tooltip title={`${pledgerCount} pledger${pledgerCount > 1 ? 's' : ''}`}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
              <AvatarGroup
                max={compact ? 2 : 3}
                sx={{
                  '& .MuiAvatar-root': {
                    width: compact ? 16 : 20, height: compact ? 16 : 20, fontSize: compact ? '0.5rem' : '0.6rem',
                    border: '1px solid #0F0E17',
                    bgcolor: alpha('#6C63FF', 0.3),
                  },
                }}
              >
                {pledgers.slice(0, 3).map((p, i) => (
                  <Avatar key={p.id || i} alt={p.username} src={p.avatar_url}>
                    {(p.username || '?')[0].toUpperCase()}
                  </Avatar>
                ))}
                {pledgerCount > 3 && <Avatar>+{pledgerCount - 3}</Avatar>}
              </AvatarGroup>
            </Box>
          </Tooltip>
        )}

        {/* User pledge badge OR Pledge button */}
        {userPledge ? (
          <Tooltip title={`You pledged ${userPledge.amount} ${userPledge.unit || ''}`}>
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 0.25,
              px: 1, py: 0.25,
              borderRadius: RADIUS.pill,
              background: alpha('#4CAF50', 0.1),
              border: `1px solid ${alpha('#4CAF50', 0.2)}`,
              flexShrink: 0,
              animation: `${badgePop} 400ms ${EASINGS.spring} both`,
            }}>
              <CheckCircleIcon sx={{ fontSize: 12, color: '#4CAF50' }} />
              <Typography variant="caption" sx={{
                fontSize: '0.65rem', color: '#4CAF50', fontWeight: 700,
                whiteSpace: 'nowrap',
              }}>
                Pledged
              </Typography>
            </Box>
          </Tooltip>
        ) : (
          <Tooltip title={isAuthenticated ? 'Pledge compute resources' : 'Sign in to pledge'}>
            <ButtonBase
              onClick={(e) => { e.stopPropagation(); setDialogOpen(true); }}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.25,
                px: 1, py: 0.25,
                borderRadius: RADIUS.pill,
                background: alpha('#6C63FF', 0.08),
                border: `1px solid ${alpha('#6C63FF', 0.15)}`,
                transition: `all ${DURATIONS.fast}ms ${EASINGS.smooth}`,
                flexShrink: 0,
                '&:hover': {
                  background: alpha('#6C63FF', 0.15),
                  borderColor: alpha('#6C63FF', 0.3),
                  transform: 'scale(1.03)',
                },
              }}
            >
              <AddIcon sx={{ fontSize: 12, color: '#6C63FF' }} />
              <Typography variant="caption" sx={{
                fontSize: '0.65rem', color: '#6C63FF', fontWeight: 700,
                whiteSpace: 'nowrap',
              }}>
                Pledge
              </Typography>
            </ButtonBase>
          </Tooltip>
        )}
      </Box>

      {/* Pledge dialog */}
      <PledgeDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        postId={postId}
        experimentTitle={experimentTitle}
      />
    </>
  );
}
