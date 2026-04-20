/**
 * ThoughtExperimentTracker - Tracker view showing agent progress,
 * conversations, dynamic UI, and HITL review panels per thought experiment.
 *
 * Aggregates data from Post, AgentGoal, DistributedTaskCoordinator,
 * MemoryGraph, and Agent Ledger via the /api/social/tracker/* endpoints.
 *
 * Enhanced with:
 *  - AgentProgressTimeline: animated draw line, pulse at current stage, checkmark animation
 *  - Detail panel entrance: slide-in-right (desktop) / slide-up (mobile)
 *  - Conversation bubbles: typing indicator, staggered message appearance
 */

import ExperimentInsightsPanel from './ExperimentInsightsPanel';

import { trackerApi } from '../../../services/socialApi';
import { socialTokens, RADIUS, EASINGS, DURATIONS } from '../../../theme/socialTokens';
import IntentBadge from '../Feed/IntentBadge';
import LiquidPostContent from '../Feed/LiquidPostContent';
import PledgeDialog from '../Feed/PledgeDialog';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import InsightsIcon from '@mui/icons-material/Insights';
import MemoryIcon from '@mui/icons-material/Memory';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScienceIcon from '@mui/icons-material/Science';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ThumbDownAltIcon from '@mui/icons-material/ThumbDownAlt';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import {
  Box, Typography, Paper, LinearProgress, Tabs, Tab, Chip, IconButton,
  Button, Tooltip, Divider, Avatar, Skeleton, useTheme, useMediaQuery,
  ButtonBase, Alert, keyframes,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

// ─── Keyframes ───────────────────────────────────────────────────────────────

const drawLine = keyframes`
  0%   { transform: scaleX(0); }
  100% { transform: scaleX(1); }
`;

const stagePulse = keyframes`
  0%   { box-shadow: 0 0 0px transparent; }
  50%  { box-shadow: 0 0 16px var(--pulse-color); }
  100% { box-shadow: 0 0 0px transparent; }
`;

const checkDraw = keyframes`
  0%   { stroke-dashoffset: 20; opacity: 0; }
  50%  { opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 1; }
`;

const stageAppear = keyframes`
  0%   { transform: scale(0.5); opacity: 0; }
  60%  { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
`;

const slideInRight = keyframes`
  0%   { opacity: 0; transform: translateX(40px); }
  100% { opacity: 1; transform: translateX(0); }
`;

const slideInUp = keyframes`
  0%   { opacity: 0; transform: translateY(40px); }
  100% { opacity: 1; transform: translateY(0); }
`;

const msgAppear = keyframes`
  0%   { opacity: 0; transform: translateY(12px) scale(0.95); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
`;

const dotBounce = keyframes`
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40%           { transform: scale(1);   opacity: 1; }
`;

// ─── Agent status to progress stage mapping ───

const AGENT_STAGES = [
  { key: 'creation', label: 'Creation', icon: '\u{1F331}', color: '#8BC34A' },
  { key: 'review', label: 'Review', icon: '\u{1F33F}', color: '#4CAF50' },
  { key: 'completed', label: 'Completed', icon: '\u{1FAB4}', color: '#00BCD4' },
  { key: 'evaluation', label: 'Evaluation', icon: '\u{1F333}', color: '#6C63FF' },
  { key: 'reuse', label: 'Reuse', icon: '\u{1F332}', color: '#7B1FA2' },
];

function getStageIndex(status) {
  if (!status) return 0;
  const s = status.toLowerCase();
  if (s.includes('creation')) return 0;
  if (s.includes('review')) return 1;
  if (s === 'completed' || s.includes('complete')) return 2;
  if (s.includes('evaluation')) return 3;
  if (s.includes('reuse')) return 4;
  return 0;
}

// ─── Agent avatar palette (deterministic from name) ───

const PALETTES = [
  { bg: '#8B5E3C', accent: '#FFD8B1' },
  { bg: '#6C63FF', accent: '#C5C1FF' },
  { bg: '#D4A373', accent: '#FEFAE0' },
  { bg: '#2D6A4F', accent: '#B7E4C7' },
  { bg: '#E76F51', accent: '#FFDDD2' },
  { bg: '#264653', accent: '#A8DADC' },
  { bg: '#7B2CBF', accent: '#E0AAFF' },
];
function getAgentColor(seed) {
  if (!seed) return PALETTES[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return PALETTES[Math.abs(hash) % PALETTES.length];
}


// ═══════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════

/** Compact experiment card for the list panel */
function ExperimentListItem({ experiment, isSelected, onClick }) {
  const theme = useTheme();
  const goal = experiment.goal;
  const intentColor = socialTokens.intentColor(experiment.intent_category || 'education');
  const progressPct = goal?.progress?.completed_pct ?? 0;

  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        display: 'block', width: '100%', textAlign: 'left',
        p: 1.5, mb: 1, borderRadius: RADIUS.md,
        ...socialTokens.glass.subtle(theme),
        borderLeft: `3px solid ${intentColor}`,
        transition: `all ${DURATIONS.fast}ms ${EASINGS.smooth}`,
        outline: isSelected ? `2px solid ${intentColor}` : 'none',
        outlineOffset: -2,
        '&:hover': {
          background: alpha(intentColor, 0.06),
          transform: 'translateX(2px)',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <IntentBadge category={experiment.intent_category} />
        {goal?.needs_review && (
          <Chip label="Review" size="small" color="warning"
            sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} />
        )}
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: theme.palette.text.primary }}>
        {experiment.title}
      </Typography>
      {goal && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LinearProgress variant="determinate" value={progressPct}
            sx={{
              flex: 1, height: 4, borderRadius: 2,
              bgcolor: alpha(intentColor, 0.1),
              '& .MuiLinearProgress-bar': {
                background: `linear-gradient(90deg, ${intentColor}, ${alpha(intentColor, 0.7)})`,
                borderRadius: 2,
              },
            }}
          />
          <Typography variant="caption" sx={{ color: theme.palette.text.secondary, minWidth: 32 }}>
            {Math.round(progressPct)}%
          </Typography>
        </Box>
      )}
      {!goal && (
        <Typography variant="caption" sx={{ color: theme.palette.text.disabled }}>
          No agent assigned
        </Typography>
      )}
      {/* Compact pledge summary */}
      {experiment.pledge_count > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
          <MemoryIcon sx={{ fontSize: 11, color: '#00BCD4' }} />
          <Typography variant="caption" sx={{
            fontSize: '0.62rem', color: theme.palette.text.disabled,
          }}>
            {experiment.pledge_count} pledge{experiment.pledge_count !== 1 ? 's' : ''}
            {experiment.gpu_hours_total ? `, ${experiment.gpu_hours_total} GPU-hrs` : ''}
          </Typography>
        </Box>
      )}
    </ButtonBase>
  );
}

/** Typing indicator dots */
function TypingIndicator({ color }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', px: 1.5, py: 1 }}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: 6, height: 6,
            borderRadius: '50%',
            bgcolor: color || '#6C63FF',
            animation: `${dotBounce} 1.2s ease-in-out infinite`,
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </Box>
  );
}

/** Agent progress timeline — animated draw line, pulse at current, checkmark on completed */
function AgentProgressTimeline({ goalStatus, tasks = [] }) {
  const theme = useTheme();
  const currentIdx = getStageIndex(goalStatus);
  const [visible, setVisible] = useState(false);
  const timelineRef = useRef(null);

  // IntersectionObserver to trigger draw animation
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const fallback = setTimeout(() => setVisible(true), 500);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          clearTimeout(fallback);
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => { observer.disconnect(); clearTimeout(fallback); };
  }, []);

  return (
    <Box ref={timelineRef} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 1 }}>
      {AGENT_STAGES.map((s, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent = i === currentIdx;
        const stageDelay = i * 150;

        return (
          <Box key={s.key} sx={{ display: 'flex', alignItems: 'center' }}>
            <Tooltip title={s.label}>
              <Box sx={{
                '--pulse-color': `${s.color}50`,
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16,
                bgcolor: i <= currentIdx ? s.color : 'action.disabledBackground',
                opacity: visible ? (i <= currentIdx ? 1 : 0.4) : 0,
                border: isCurrent ? `2px solid ${s.color}` : 'none',
                boxShadow: isCurrent ? `0 0 12px ${s.color}40` : 'none',
                position: 'relative',
                transition: 'all 0.3s',
                animation: visible
                  ? `${isCurrent ? stagePulse : stageAppear} ${isCurrent ? '2s ease-in-out infinite' : `400ms ${EASINGS.spring} ${stageDelay}ms both`}`
                  : 'none',
              }}>
                {/* Show checkmark SVG for completed stages */}
                {isCompleted && visible ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" style={{ position: 'absolute' }}>
                    <path
                      d="M3 8 L6.5 11.5 L13 4.5"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        strokeDasharray: 20,
                        strokeDashoffset: 0,
                        animation: `${checkDraw} 500ms ${EASINGS.decelerate} ${stageDelay + 200}ms both`,
                      }}
                    />
                  </svg>
                ) : (
                  s.icon
                )}
              </Box>
            </Tooltip>
            {i < AGENT_STAGES.length - 1 && (
              <Box sx={{
                width: { xs: 12, md: 24 }, height: 2, mx: 0.25,
                bgcolor: 'action.disabledBackground',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 1,
              }}>
                {/* Animated fill line */}
                <Box sx={{
                  position: 'absolute',
                  top: 0, left: 0, bottom: 0,
                  width: '100%',
                  bgcolor: i < currentIdx ? AGENT_STAGES[i + 1].color : 'transparent',
                  transformOrigin: 'left center',
                  animation: visible && i < currentIdx
                    ? `${drawLine} 500ms ${EASINGS.decelerate} ${stageDelay + 100}ms both`
                    : 'none',
                  transform: visible && i < currentIdx ? 'scaleX(1)' : 'scaleX(0)',
                }} />
              </Box>
            )}
          </Box>
        );
      })}
      {tasks.length > 0 && (
        <Typography variant="caption" sx={{ ml: 1, color: theme.palette.text.secondary }}>
          {tasks.filter(t => t.status === 'COMPLETED').length}/{tasks.length} tasks
        </Typography>
      )}
    </Box>
  );
}

/** Chat-bubble conversation view — with typing indicator + staggered appearance */
function AgentConversationView({ conversations, agents }) {
  const theme = useTheme();
  const [visibleCount, setVisibleCount] = useState(0);
  const [showTyping, setShowTyping] = useState(false);
  const containerRef = useRef(null);

  // Stagger message appearance
  useEffect(() => {
    if (!conversations || conversations.length === 0) return;
    setVisibleCount(0);
    setShowTyping(true);

    let count = 0;
    const interval = setInterval(() => {
      count++;
      if (count <= conversations.length) {
        // Show typing indicator briefly before each agent message
        const msg = conversations[count - 1];
        const isAgent = msg?.role === 'assistant' || msg?.role === 'system';
        if (isAgent && count > 1) {
          setShowTyping(true);
          setTimeout(() => {
            setShowTyping(false);
            setVisibleCount(count);
          }, 400);
        } else {
          setShowTyping(false);
          setVisibleCount(count);
        }
      } else {
        setShowTyping(false);
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [conversations]);

  if (!conversations || conversations.length === 0) {
    return (
      <Box sx={{ py: 3, textAlign: 'center' }}>
        <ChatBubbleOutlineIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
        <Typography variant="body2" color="text.secondary">
          No agent conversations yet
        </Typography>
      </Box>
    );
  }

  const visibleMessages = conversations.slice(0, visibleCount);
  // Determine the last visible agent message's palette for typing indicator
  const lastAgentMsg = [...visibleMessages].reverse().find(m => m.role === 'assistant' || m.role === 'system');
  const typingPalette = getAgentColor(lastAgentMsg?.session_key || 'default');

  return (
    <Box ref={containerRef} sx={{ maxHeight: 400, overflowY: 'auto', py: 1 }}>
      {visibleMessages.map((msg, i) => {
        const isAgent = msg.role === 'assistant' || msg.role === 'system';
        const palette = getAgentColor(msg.session_key || 'default');
        return (
          <Box key={msg.id || i} sx={{
            display: 'flex',
            flexDirection: isAgent ? 'row' : 'row-reverse',
            gap: 1, mb: 1.5, px: 1,
            animation: `${msgAppear} 350ms ${EASINGS.decelerate} both`,
          }}>
            <Avatar sx={{
              width: 28, height: 28, fontSize: 14,
              bgcolor: isAgent ? palette.bg : theme.palette.primary.main,
            }}>
              {isAgent ? <SmartToyIcon sx={{ fontSize: 16 }} /> : 'H'}
            </Avatar>
            <Paper elevation={0} sx={{
              maxWidth: '75%', p: 1.5, borderRadius: RADIUS.md,
              bgcolor: isAgent
                ? alpha(palette.bg, 0.1)
                : alpha(theme.palette.primary.main, 0.08),
              border: `1px solid ${alpha(isAgent ? palette.bg : theme.palette.primary.main, 0.12)}`,
            }}>
              <Typography variant="body2" sx={{ fontSize: '0.82rem', lineHeight: 1.5,
                color: theme.palette.text.primary, whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </Typography>
              {msg.timestamp && (
                <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5, display: 'block' }}>
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </Typography>
              )}
            </Paper>
          </Box>
        );
      })}
      {/* Typing indicator for agent messages */}
      {showTyping && visibleCount < conversations.length && (
        <Box sx={{
          display: 'flex', gap: 1, px: 1, mb: 1.5,
          animation: `${msgAppear} 200ms ${EASINGS.decelerate} both`,
        }}>
          <Avatar sx={{
            width: 28, height: 28, fontSize: 14,
            bgcolor: typingPalette.bg,
          }}>
            <SmartToyIcon sx={{ fontSize: 16 }} />
          </Avatar>
          <Paper elevation={0} sx={{
            p: 0.5, borderRadius: RADIUS.md,
            bgcolor: alpha(typingPalette.bg, 0.1),
            border: `1px solid ${alpha(typingPalette.bg, 0.12)}`,
          }}>
            <TypingIndicator color={typingPalette.bg} />
          </Paper>
        </Box>
      )}
    </Box>
  );
}

/** HITL review panel */
function HITLReviewPanel({ experiment, tasks, onApprove, onReject }) {
  const blockedTasks = (tasks || []).filter(t => t.blocked_reason === 'APPROVAL_REQUIRED');

  if (blockedTasks.length === 0) return null;

  return (
    <Alert
      severity="warning"
      sx={{
        borderRadius: RADIUS.md,
        '& .MuiAlert-icon': { alignItems: 'center' },
      }}
      action={
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" variant="contained" color="success"
            startIcon={<ThumbUpAltIcon />}
            onClick={() => onApprove(experiment.id)}
            sx={{ borderRadius: RADIUS.pill, textTransform: 'none', fontWeight: 600 }}>
            Approve
          </Button>
          <Button size="small" variant="outlined" color="error"
            startIcon={<ThumbDownAltIcon />}
            onClick={() => onReject(experiment.id)}
            sx={{ borderRadius: RADIUS.pill, textTransform: 'none', fontWeight: 600 }}>
            Reject
          </Button>
        </Box>
      }
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
        Agent needs your review
      </Typography>
      {blockedTasks.map((t) => (
        <Typography key={t.id} variant="body2" sx={{ fontSize: '0.82rem' }}>
          {t.description || 'Architectural decision requires human approval'}
        </Typography>
      ))}
    </Alert>
  );
}


// ═══════════════════════════════════════════════════════════════════
// Main Tracker Page
// ═══════════════════════════════════════════════════════════════════

export default function ThoughtExperimentTracker() {
  const theme = useTheme();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  // State
  const [experiments, setExperiments] = useState([]);
  const [selectedId, setSelectedId] = useState(highlightId || null);
  const [detail, setDetail] = useState(null);
  const [conversations, setConversations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filterTab, setFilterTab] = useState(0); // 0=all, 1=mine, 2=needs_review
  const [error, setError] = useState(null);
  // Track previous selectedId to trigger entrance animation
  const [detailKey, setDetailKey] = useState(0);
  const [detailTab, setDetailTab] = useState(0); // 0=overview, 1=insights
  const [pledgeDialogOpen, setPledgeDialogOpen] = useState(false);

  const filterMap = useMemo(() => ['all', 'mine', 'needs_review'], []);

  // ── Fetch experiment list ──
  const fetchExperiments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await trackerApi.listExperiments({ filter: filterMap[filterTab], limit: 50 });
      setExperiments(res.data || []);
    } catch (e) {
      setError('Failed to load experiments');
      setExperiments([]);
    } finally {
      setLoading(false);
    }
  }, [filterTab, filterMap]);

  useEffect(() => { fetchExperiments(); }, [fetchExperiments]);

  // ── Fetch detail + conversations when selected ──
  const fetchDetail = useCallback(async (postId) => {
    if (!postId) { setDetail(null); setConversations(null); return; }
    setDetailLoading(true);
    try {
      const [detailRes, convRes] = await Promise.all([
        trackerApi.getExperiment(postId),
        trackerApi.getConversations(postId),
      ]);
      setDetail(detailRes.data || null);
      setConversations(convRes.data || null);
    } catch {
      setDetail(null);
      setConversations(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { fetchDetail(selectedId); }, [selectedId, fetchDetail]);

  // Increment key on selectedId change to re-trigger entrance animation
  useEffect(() => {
    setDetailKey(k => k + 1);
  }, [selectedId]);

  // ── Auto-select first experiment or highlighted ──
  useEffect(() => {
    if (experiments.length > 0 && !selectedId) {
      setSelectedId(highlightId || experiments[0].id);
    }
  }, [experiments, selectedId, highlightId]);

  // ── HITL actions ──
  const handleApprove = async (postId) => {
    try {
      await trackerApi.approve(postId, {});
      fetchDetail(postId);
      fetchExperiments();
    } catch { /* silent */ }
  };
  const handleReject = async (postId) => {
    try {
      await trackerApi.reject(postId, { reason: 'Rejected by reviewer' });
      fetchDetail(postId);
      fetchExperiments();
    } catch { /* silent */ }
  };

  // ── Detail panel content ──
  const renderDetail = () => {
    if (!selectedId) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', py: 8 }}>
          <ScienceIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="body1" color="text.secondary">
            Select a thought experiment to view details
          </Typography>
        </Box>
      );
    }

    if (detailLoading) {
      return (
        <Box sx={{ p: 2 }}>
          <Skeleton variant="rounded" height={40} sx={{ mb: 2 }} />
          <Skeleton variant="rounded" height={60} sx={{ mb: 2 }} />
          <Skeleton variant="rounded" height={200} />
        </Box>
      );
    }

    if (!detail) return null;

    const goal = detail.goal;
    const tasks = goal?.tasks || [];
    const intentColor = socialTokens.intentColor(detail.intent_category || 'education');

    return (
      <Box
        key={detailKey}
        sx={{
          p: { xs: 1.5, md: 2 }, overflowY: 'auto', height: '100%',
          animation: `${isMobile ? slideInUp : slideInRight} 400ms ${EASINGS.decelerate} both`,
        }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          {isMobile && (
            <IconButton size="small" onClick={() => setSelectedId(null)}>
              <ArrowBackIcon />
            </IconButton>
          )}
          <IntentBadge category={detail.intent_category} size="large" />
          <Typography variant="h6" sx={{ fontWeight: 700, flex: 1 }}>
            {detail.title}
          </Typography>
          {goal?.needs_review && (
            <Chip label="Needs Review" color="warning" size="small"
              sx={{ fontWeight: 700 }} />
          )}
        </Box>

        {/* Hypothesis */}
        {detail.hypothesis && (
          <Box sx={{
            mb: 2, p: 1.5, borderRadius: RADIUS.md,
            background: `${intentColor}08`,
            borderLeft: `3px solid ${intentColor}40`,
          }}>
            <Typography variant="overline" sx={{ color: intentColor }}>
              Hypothesis
            </Typography>
            <Typography variant="body2" sx={{
              color: theme.palette.text.secondary, fontStyle: 'italic' }}>
              {detail.hypothesis}
            </Typography>
          </Box>
        )}

        {/* Detail Tabs: Overview | Insights */}
        <Tabs
          value={detailTab}
          onChange={(_, v) => setDetailTab(v)}
          sx={{
            mb: 1.5, minHeight: 32,
            '& .MuiTab-root': {
              minHeight: 32, textTransform: 'none', fontWeight: 600,
              fontSize: '0.82rem', px: 1.5,
            },
            '& .MuiTabs-indicator': { height: 2, borderRadius: 1 },
          }}
        >
          <Tab label="Overview" />
          <Tab
            label="Insights"
            icon={<InsightsIcon sx={{ fontSize: 14 }} />}
            iconPosition="start"
          />
        </Tabs>

        {detailTab === 0 && (
          <>
            {/* Agent Progress Timeline */}
            {goal && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Agent Progress
                </Typography>
                <AgentProgressTimeline goalStatus={goal.status} tasks={tasks} />
                <Divider sx={{ my: 1.5 }} />
              </>
            )}

            {/* HITL Review Panel */}
            <HITLReviewPanel
              experiment={detail}
              tasks={tasks}
              onApprove={handleApprove}
              onReject={handleReject}
            />

            {/* Dynamic UI (Liquid Layout) */}
            {detail.dynamic_layout && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 2, mb: 1 }}>
                  Agent Output
                </Typography>
                <Paper elevation={0} sx={{
                  p: 1.5, borderRadius: RADIUS.md,
                  ...socialTokens.glass.subtle(theme),
                  mb: 2,
                }}>
                  <LiquidPostContent post={detail} />
                </Paper>
              </>
            )}

            {/* Agent Conversations */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 2, mb: 1 }}>
              Agent Conversations
            </Typography>
            <Paper elevation={0} sx={{
              borderRadius: RADIUS.md,
              ...socialTokens.glass.subtle(theme),
              mb: 2,
            }}>
              <AgentConversationView
                conversations={conversations?.conversations || []}
                agents={conversations?.agents || []}
              />
            </Paper>

            {/* Task Details */}
            {tasks.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 2, mb: 1 }}>
                  Task Breakdown
                </Typography>
                {tasks.map((t) => (
                  <Box key={t.id} sx={{
                    display: 'flex', alignItems: 'center', gap: 1,
                    p: 1, mb: 0.5, borderRadius: RADIUS.sm,
                    bgcolor: alpha(theme.palette.common.white, 0.02),
                  }}>
                    {t.status === 'COMPLETED' ? (
                      <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main' }} />
                    ) : t.blocked_reason ? (
                      <ErrorOutlineIcon sx={{ fontSize: 18, color: 'warning.main' }} />
                    ) : (
                      <HourglassEmptyIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                    )}
                    <Typography variant="body2" sx={{ flex: 1, fontSize: '0.82rem' }}>
                      {t.description || t.id}
                    </Typography>
                    {t.progress_pct > 0 && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {t.progress_pct}%
                      </Typography>
                    )}
                  </Box>
                ))}
              </>
            )}
          </>
        )}

        {detailTab === 1 && (
          <ExperimentInsightsPanel
            postId={detail.id}
            onPledgeClick={() => setPledgeDialogOpen(true)}
          />
        )}

        {/* Navigate to full post */}
        <Button
          variant="text"
          size="small"
          onClick={() => navigate(`/social/post/${detail.id}`)}
          sx={{ mt: 2, textTransform: 'none', fontWeight: 600 }}
        >
          View full post
        </Button>

        {/* Pledge dialog (triggered from insights locked state) */}
        <PledgeDialog
          open={pledgeDialogOpen}
          onClose={() => setPledgeDialogOpen(false)}
          postId={detail.id}
          experimentTitle={detail.title}
        />
      </Box>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════

  return (
    <Box sx={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 2, py: 1.5,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ScienceIcon sx={{ color: theme.palette.primary.main }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Thought Experiment Tracker
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={fetchExperiments}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Filter tabs */}
      <Tabs value={filterTab} onChange={(_, v) => { setFilterTab(v); setSelectedId(null); }}
        sx={{
          px: 2, minHeight: 36,
          '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontWeight: 600, fontSize: '0.82rem' },
          '& .MuiTabs-indicator': { height: 2, borderRadius: 1 },
        }}
      >
        <Tab label="All" />
        <Tab label="My Experiments" />
        <Tab label="Needs Review" />
      </Tabs>

      {error && (
        <Alert severity="error" sx={{ mx: 2, mt: 1, borderRadius: RADIUS.md }}>
          {error}
        </Alert>
      )}

      {/* Main content: list + detail */}
      <Box sx={{
        flex: 1, display: 'flex', overflow: 'hidden', mt: 1,
        flexDirection: isMobile ? 'column' : 'row',
      }}>
        {/* List panel (hidden on mobile when detail is shown) */}
        {(!isMobile || !selectedId) && (
          <Box sx={{
            width: isMobile ? '100%' : 320,
            minWidth: isMobile ? '100%' : 280,
            borderRight: isMobile ? 'none' : `1px solid ${alpha(theme.palette.divider, 0.08)}`,
            overflowY: 'auto', px: 1.5, py: 1,
          }}>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rounded" height={80} sx={{ mb: 1 }} />
              ))
            ) : experiments.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <ScienceIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  No thought experiments found
                </Typography>
              </Box>
            ) : (
              experiments.map((exp) => (
                <ExperimentListItem
                  key={exp.id}
                  experiment={exp}
                  isSelected={exp.id === selectedId}
                  onClick={() => setSelectedId(exp.id)}
                />
              ))
            )}
          </Box>
        )}

        {/* Detail panel */}
        {(!isMobile || selectedId) && (
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {renderDetail()}
          </Box>
        )}
      </Box>
    </Box>
  );
}
