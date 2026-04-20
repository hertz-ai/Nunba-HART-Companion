/**
 * ExperimentInsightsPanel - Deep insights view for experiment contributors.
 *
 * Self-contained: fetches data via trackerApi.insights(postId).
 * Shows consumption timeline, resource health bar, agent activity feed,
 * and personal impact metrics. Non-contributors see blurred agent activity.
 *
 * Props:
 *   postId      - Post ID for the thought experiment
 *   userPledge  - User's pledge object (null if not a pledger)
 *
 * Role-based:
 *   - Central role gets full override access (sees everything regardless of pledge)
 *   - Pledgers see full details
 *   - Non-pledgers see resource summary + blurred agent activity
 */

import { trackerApi } from '../../../services/socialApi';
import { socialTokens, RADIUS, EASINGS } from '../../../theme/socialTokens';
import { useRoleAccess } from '../../RoleGuard';

import BoltIcon from '@mui/icons-material/Bolt';
import CloudIcon from '@mui/icons-material/Cloud';
import LockIcon from '@mui/icons-material/Lock';
import MemoryIcon from '@mui/icons-material/Memory';
import PaymentIcon from '@mui/icons-material/Payment';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import TimelineIcon from '@mui/icons-material/Timeline';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Box, Typography, Paper, Skeleton,
  Divider, Tooltip, Chip, useTheme, keyframes,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useState, useEffect, useCallback } from 'react';

// ---- Keyframes ----

const fadeSlideIn = keyframes`
  0%   { opacity: 0; transform: translateY(16px); }
  100% { opacity: 1; transform: translateY(0); }
`;

const healthPulse = keyframes`
  0%   { opacity: 0.7; }
  50%  { opacity: 1; }
  100% { opacity: 0.7; }
`;

const barFill = keyframes`
  0%   { transform: scaleX(0); }
  100% { transform: scaleX(1); }
`;

// ---- Pledge type config ----

const TYPE_CONFIG = {
  gpu_hours: { icon: MemoryIcon, color: '#00BCD4', label: 'GPU Hours' },
  cloud_credits: { icon: CloudIcon, color: '#6C63FF', label: 'Cloud Credits' },
  money: { icon: PaymentIcon, color: '#4CAF50', label: 'Funds' },
};

// ---- Health status helpers ----

function getHealthColor(pct) {
  if (pct >= 60) return '#4CAF50';
  if (pct >= 30) return '#FFAB00';
  return '#FF6B6B';
}

// ---- Sub-components ----

/** Resource health bar for a single pledge type */
function ResourceHealthBar({ type, remaining, total, animDelay = 0 }) {
  const config = TYPE_CONFIG[type];
  if (!config || total <= 0) return null;

  const pct = Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));
  const healthColor = getHealthColor(pct);
  const Icon = config.icon;

  return (
    <Box sx={{
      mb: 1.5,
      animation: `${fadeSlideIn} 400ms ${EASINGS.decelerate} ${animDelay}ms both`,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Icon sx={{ fontSize: 14, color: config.color }} />
          <Typography variant="caption" sx={{
            color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: '0.72rem',
          }}>
            {config.label}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {pct < 30 && (
            <WarningAmberIcon sx={{
              fontSize: 12, color: '#FF6B6B',
              animation: `${healthPulse} 1.5s ease-in-out infinite`,
            }} />
          )}
          <Typography variant="caption" sx={{
            color: healthColor, fontWeight: 700, fontSize: '0.7rem',
          }}>
            {remaining} / {total} remaining ({pct}%)
          </Typography>
        </Box>
      </Box>
      <Box sx={{
        height: 6, borderRadius: 3,
        bgcolor: alpha(config.color, 0.1),
        overflow: 'hidden',
        position: 'relative',
      }}>
        <Box sx={{
          position: 'absolute',
          top: 0, left: 0, bottom: 0,
          width: `${pct}%`,
          borderRadius: 3,
          background: `linear-gradient(90deg, ${healthColor}, ${alpha(healthColor, 0.6)})`,
          transformOrigin: 'left center',
          animation: `${barFill} 1000ms ${EASINGS.decelerate} ${animDelay + 200}ms both`,
        }} />
      </Box>
    </Box>
  );
}

/** Consumption timeline event */
function TimelineEvent({ event, index }) {
  const theme = useTheme();
  const config = TYPE_CONFIG[event.resource_type] || TYPE_CONFIG.gpu_hours;
  const Icon = config.icon;

  return (
    <Box sx={{
      display: 'flex', gap: 1.5, py: 1,
      animation: `${fadeSlideIn} 350ms ${EASINGS.decelerate} ${index * 80}ms both`,
    }}>
      {/* Timeline dot + connector */}
      <Box sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        pt: 0.25,
      }}>
        <Box sx={{
          width: 24, height: 24, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: alpha(config.color, 0.12),
          border: `1px solid ${alpha(config.color, 0.25)}`,
        }}>
          <Icon sx={{ fontSize: 12, color: config.color }} />
        </Box>
        <Box sx={{
          width: 1, flex: 1, mt: 0.5,
          bgcolor: alpha(theme.palette.divider, 0.15),
        }} />
      </Box>

      {/* Event content */}
      <Box sx={{ flex: 1, pb: 1 }}>
        <Typography variant="body2" sx={{
          fontSize: '0.8rem', fontWeight: 500,
          color: theme.palette.text.primary,
        }}>
          {event.description || `${event.amount} ${config.label.toLowerCase()} consumed`}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
          {event.agent_name && (
            <Chip
              icon={<SmartToyIcon sx={{ fontSize: 10 }} />}
              label={event.agent_name}
              size="small"
              sx={{
                height: 18, fontSize: '0.62rem', fontWeight: 600,
                bgcolor: alpha(config.color, 0.08),
                color: config.color,
                '& .MuiChip-icon': { color: config.color },
              }}
            />
          )}
          <Typography variant="caption" sx={{
            color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem',
          }}>
            {event.timestamp ? new Date(event.timestamp).toLocaleString() : ''}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

/** Agent activity item (blurred for non-contributors) */
function AgentActivityItem({ activity, blurred, index }) {
  const theme = useTheme();

  return (
    <Box sx={{
      display: 'flex', alignItems: 'flex-start', gap: 1,
      py: 0.75, px: 1,
      borderRadius: RADIUS.sm,
      bgcolor: alpha(theme.palette.common.white, 0.02),
      mb: 0.5,
      animation: `${fadeSlideIn} 300ms ${EASINGS.decelerate} ${index * 60}ms both`,
      filter: blurred ? 'blur(4px)' : 'none',
      userSelect: blurred ? 'none' : 'auto',
      pointerEvents: blurred ? 'none' : 'auto',
    }}>
      <SmartToyIcon sx={{
        fontSize: 16, mt: 0.25,
        color: alpha('#6C63FF', 0.7),
      }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{
          fontSize: '0.78rem', fontWeight: 500,
          color: theme.palette.text.primary,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {activity.description || 'Agent action'}
        </Typography>
        <Typography variant="caption" sx={{
          color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem',
        }}>
          {activity.agent_name || 'Agent'} {activity.timestamp ? `- ${new Date(activity.timestamp).toLocaleTimeString()}` : ''}
        </Typography>
      </Box>
      {activity.resource_cost && (
        <Chip
          label={activity.resource_cost}
          size="small"
          sx={{
            height: 18, fontSize: '0.58rem',
            bgcolor: alpha('#6C63FF', 0.08),
            color: '#6C63FF',
          }}
        />
      )}
    </Box>
  );
}


// ---- Main Component ----

export default function ExperimentInsightsPanel({ postId, onPledgeClick }) {
  const theme = useTheme();
  const { isCentral } = useRoleAccess();
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locked, setLocked] = useState(false);

  // Access is determined by the backend (403 = not a contributor)
  const hasAccess = !locked || isCentral;

  const fetchInsights = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    setLocked(false);
    try {
      const res = await trackerApi.insights(postId);
      setInsights(res.data?.data || res.data || null);
    } catch (err) {
      if (err?.response?.status === 403) {
        setLocked(true);
        setInsights(null);
      } else {
        setError(err?.response?.data?.error || 'Failed to load insights');
        setInsights(null);
      }
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  // Loading skeleton
  if (loading) {
    return (
      <Paper elevation={0} sx={{
        p: 2, borderRadius: RADIUS.md,
        ...socialTokens.glass.subtle(theme),
      }}>
        <Skeleton variant="text" width={180} height={24} sx={{ bgcolor: 'rgba(255,255,255,0.04)', mb: 1 }} />
        <Skeleton variant="rounded" height={60} sx={{ bgcolor: 'rgba(255,255,255,0.04)', mb: 1.5 }} />
        <Skeleton variant="rounded" height={40} sx={{ bgcolor: 'rgba(255,255,255,0.04)', mb: 1 }} />
        <Skeleton variant="rounded" height={40} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
      </Paper>
    );
  }

  // Error state
  if (error) {
    return (
      <Paper elevation={0} sx={{
        p: 2, borderRadius: RADIUS.md,
        ...socialTokens.glass.subtle(theme),
        textAlign: 'center',
      }}>
        <Typography variant="body2" sx={{ color: '#FF6B6B', fontSize: '0.82rem' }}>
          {error}
        </Typography>
      </Paper>
    );
  }

  // Locked state — user is not a contributor
  if (locked && !isCentral) {
    return (
      <Paper elevation={0} sx={{
        p: 3, borderRadius: RADIUS.md,
        ...socialTokens.glass.subtle(theme),
        textAlign: 'center',
      }}>
        <LockIcon sx={{ fontSize: 40, color: 'rgba(255,255,255,0.2)', mb: 1 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'rgba(255,255,255,0.6)', mb: 0.5 }}>
          Contributor Insights
        </Typography>
        <Typography variant="caption" sx={{
          color: 'rgba(255,255,255,0.3)', mb: 2, display: 'block',
        }}>
          Pledge compute to unlock deep insights into this experiment
        </Typography>
        {onPledgeClick && (
          <Box
            component="button"
            onClick={onPledgeClick}
            sx={{
              cursor: 'pointer', border: 'none',
              px: 3, py: 1, borderRadius: RADIUS.pill,
              bgcolor: '#6C63FF', color: '#fff',
              fontWeight: 700, fontSize: '0.82rem',
              '&:hover': { bgcolor: '#5A52E0' },
            }}
          >
            Pledge to unlock
          </Box>
        )}
      </Paper>
    );
  }

  if (!insights) return null;

  // Extract insights data
  const resources = insights.resources || {};
  const timeline = insights.consumption_timeline || [];
  const agentActivity = insights.agent_activity || [];
  const impact = insights.impact || {};

  return (
    <Paper elevation={0} sx={{
      borderRadius: RADIUS.md,
      ...socialTokens.glass.subtle(theme),
      overflow: 'hidden',
    }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        px: 2, pt: 2, pb: 1,
      }}>
        <TimelineIcon sx={{ fontSize: 18, color: '#6C63FF' }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
          Experiment Insights
        </Typography>
        {isCentral && !userPledge && (
          <Chip
            label="Admin override"
            size="small"
            sx={{
              height: 18, fontSize: '0.6rem', fontWeight: 600,
              bgcolor: alpha('#FFAB00', 0.1),
              color: '#FFAB00',
              ml: 'auto',
            }}
          />
        )}
      </Box>

      <Box sx={{ px: 2, pb: 2 }}>
        {/* ---- Resource Health ---- */}
        <Box sx={{
          mb: 2,
          animation: `${fadeSlideIn} 400ms ${EASINGS.decelerate} both`,
        }}>
          <Typography variant="overline" sx={{
            color: 'rgba(255,255,255,0.4)', display: 'block', mb: 1,
            fontSize: '0.65rem', letterSpacing: '0.08em',
          }}>
            Resource Budget
          </Typography>

          {resources.gpu_hours && (
            <ResourceHealthBar
              type="gpu_hours"
              remaining={resources.gpu_hours.remaining || 0}
              total={resources.gpu_hours.total || 0}
              animDelay={0}
            />
          )}
          {resources.cloud_credits && (
            <ResourceHealthBar
              type="cloud_credits"
              remaining={resources.cloud_credits.remaining || 0}
              total={resources.cloud_credits.total || 0}
              animDelay={100}
            />
          )}
          {resources.money && (
            <ResourceHealthBar
              type="money"
              remaining={resources.money.remaining || 0}
              total={resources.money.total || 0}
              animDelay={200}
            />
          )}

          {!resources.gpu_hours && !resources.cloud_credits && !resources.money && (
            <Typography variant="body2" sx={{
              color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', fontStyle: 'italic',
            }}>
              No resource data available yet
            </Typography>
          )}
        </Box>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', mb: 2 }} />

        {/* ---- Personal Impact (only for pledgers/central) ---- */}
        {hasAccess && (userPledge || impact.personal) && (
          <>
            <Box sx={{
              mb: 2,
              animation: `${fadeSlideIn} 400ms ${EASINGS.decelerate} 150ms both`,
            }}>
              <Typography variant="overline" sx={{
                color: 'rgba(255,255,255,0.4)', display: 'block', mb: 1,
                fontSize: '0.65rem', letterSpacing: '0.08em',
              }}>
                Your Impact
              </Typography>

              <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                gap: 1,
              }}>
                {/* Tasks powered */}
                {(impact.tasks_powered != null || impact.personal?.tasks_powered != null) && (
                  <Box sx={{
                    p: 1.5, borderRadius: RADIUS.sm,
                    background: alpha('#00BCD4', 0.06),
                    border: `1px solid ${alpha('#00BCD4', 0.1)}`,
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <BoltIcon sx={{ fontSize: 14, color: '#00BCD4' }} />
                      <Typography variant="caption" sx={{ color: '#00BCD4', fontWeight: 600 }}>
                        Tasks Powered
                      </Typography>
                    </Box>
                    <Typography variant="h6" sx={{
                      fontWeight: 800, color: '#00BCD4', lineHeight: 1,
                    }}>
                      {impact.tasks_powered ?? impact.personal?.tasks_powered ?? 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.62rem' }}>
                      Your GPU hours powered these agent tasks
                    </Typography>
                  </Box>
                )}

                {/* Compute hours used */}
                {(impact.hours_consumed != null || impact.personal?.hours_consumed != null) && (
                  <Box sx={{
                    p: 1.5, borderRadius: RADIUS.sm,
                    background: alpha('#6C63FF', 0.06),
                    border: `1px solid ${alpha('#6C63FF', 0.1)}`,
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <TrendingUpIcon sx={{ fontSize: 14, color: '#6C63FF' }} />
                      <Typography variant="caption" sx={{ color: '#6C63FF', fontWeight: 600 }}>
                        Hours Consumed
                      </Typography>
                    </Box>
                    <Typography variant="h6" sx={{
                      fontWeight: 800, color: '#6C63FF', lineHeight: 1,
                    }}>
                      {impact.hours_consumed ?? impact.personal?.hours_consumed ?? 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.62rem' }}>
                      From your pledged resources
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Additional impact message */}
              {(impact.message || impact.personal?.message) && (
                <Typography variant="body2" sx={{
                  color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem',
                  fontStyle: 'italic', mt: 1,
                }}>
                  {impact.message || impact.personal?.message}
                </Typography>
              )}
            </Box>

            <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', mb: 2 }} />
          </>
        )}

        {/* ---- Consumption Timeline ---- */}
        {timeline.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="overline" sx={{
              color: 'rgba(255,255,255,0.4)', display: 'block', mb: 1,
              fontSize: '0.65rem', letterSpacing: '0.08em',
            }}>
              Consumption Timeline
            </Typography>

            <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
              {timeline.map((event, i) => (
                <TimelineEvent key={event.id || i} event={event} index={i} />
              ))}
            </Box>
          </Box>
        )}

        {/* ---- Agent Activity Feed ---- */}
        {agentActivity.length > 0 && (
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="overline" sx={{
                color: 'rgba(255,255,255,0.4)',
                fontSize: '0.65rem', letterSpacing: '0.08em',
              }}>
                Agent Activity
              </Typography>
              {!hasAccess && (
                <Tooltip title="Pledge resources to see full agent activity">
                  <LockIcon sx={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }} />
                </Tooltip>
              )}
            </Box>

            {/* Blurred overlay message for non-contributors */}
            {!hasAccess && (
              <Box sx={{
                position: 'relative',
                mb: 1,
              }}>
                <Box sx={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 2,
                  borderRadius: RADIUS.sm,
                  background: alpha('#0F0E17', 0.5),
                  backdropFilter: 'blur(2px)',
                }}>
                  <Box sx={{ textAlign: 'center', px: 2 }}>
                    <LockIcon sx={{ fontSize: 20, color: 'rgba(255,255,255,0.3)', mb: 0.5 }} />
                    <Typography variant="caption" sx={{
                      color: 'rgba(255,255,255,0.5)', fontWeight: 600, display: 'block',
                    }}>
                      Pledge resources to unlock agent activity
                    </Typography>
                  </Box>
                </Box>
                {/* Show blurred preview of first few items */}
                {agentActivity.slice(0, 3).map((activity, i) => (
                  <AgentActivityItem
                    key={activity.id || i}
                    activity={activity}
                    blurred
                    index={i}
                  />
                ))}
              </Box>
            )}

            {/* Full activity list for contributors */}
            {hasAccess && (
              <Box sx={{ maxHeight: 250, overflowY: 'auto' }}>
                {agentActivity.map((activity, i) => (
                  <AgentActivityItem
                    key={activity.id || i}
                    activity={activity}
                    blurred={false}
                    index={i}
                  />
                ))}
              </Box>
            )}
          </Box>
        )}

        {/* Empty state */}
        {timeline.length === 0 && agentActivity.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <TimelineIcon sx={{ fontSize: 32, color: 'rgba(255,255,255,0.12)', mb: 0.5 }} />
            <Typography variant="body2" sx={{
              color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem',
            }}>
              No activity yet. Insights will appear as resources are consumed.
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
}