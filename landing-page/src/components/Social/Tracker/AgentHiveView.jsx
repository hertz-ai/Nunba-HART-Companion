/**
 * AgentHiveView - God's-eye view of all agents across experiments.
 *
 * Three zoom levels: grid (card layout), swarm (canvas particles), tree (per-experiment).
 * Data from dashboardApi.agents() + trackerApi.listExperiments() + trackerApi.encounters().
 * Polling at 5s, WAMP fallback when available.
 */

import AgentInterviewPanel from './AgentInterviewPanel';
import SwarmCanvas from './SwarmCanvas';
import VariableInjectionDialog from './VariableInjectionDialog';

import { trackerApi, dashboardApi } from '../../../services/socialApi';
import { socialTokens, RADIUS, EASINGS, DURATIONS, SHADOWS } from '../../../theme/socialTokens';

import AccountTreeIcon from '@mui/icons-material/AccountTree';
import BubbleChartIcon from '@mui/icons-material/BubbleChart';
import ChatIcon from '@mui/icons-material/Chat';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterListIcon from '@mui/icons-material/FilterList';
import GridViewIcon from '@mui/icons-material/GridView';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScienceIcon from '@mui/icons-material/Science';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import TuneIcon from '@mui/icons-material/Tune';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Box, Typography, Paper, Chip, IconButton, Button, Tooltip, Divider,
  Avatar, Skeleton, useTheme, useMediaQuery, Grid, Menu, MenuItem,
  ListItemIcon, ListItemText, Snackbar, Alert, CircularProgress, keyframes,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';



// ---- Keyframes ----

const fadeInUp = keyframes`
  0%   { opacity: 0; transform: translateY(16px); }
  100% { opacity: 1; transform: translateY(0); }
`;

const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 0px transparent; }
  50%      { box-shadow: 0 0 12px rgba(108,99,255,0.3); }
`;

const msgAppear = keyframes`
  0%   { opacity: 0; transform: translateY(12px) scale(0.95); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
`;

// ---- Constants ----

const AGENT_STAGES = [
  { key: 'creation', label: 'Creation', color: '#8BC34A' },
  { key: 'review', label: 'Review', color: '#4CAF50' },
  { key: 'completed', label: 'Completed', color: '#00BCD4' },
  { key: 'evaluation', label: 'Evaluation', color: '#6C63FF' },
  { key: 'reuse', label: 'Reuse', color: '#7B1FA2' },
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

function getStageColor(status) {
  return AGENT_STAGES[getStageIndex(status)]?.color || '#6C63FF';
}

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

const POLL_INTERVAL = 5000;

// ---- Sub-components ----

/** Summary bar at top with status counts and spark totals */
function HiveSummaryBar({ summary, theme }) {
  const statusCounts = summary?.status_counts || {};
  const totalActive = summary?.total_active || 0;
  const totalSpark = summary?.total_spark_used || 0;
  const totalBudget = summary?.total_spark_budget || 1;
  const sparkPct = Math.min(100, (totalSpark / totalBudget) * 100);

  return (
    <Paper sx={{
      ...socialTokens.glass.surface(theme),
      borderRadius: RADIUS.lg,
      p: 2, mb: 2,
      animation: `${fadeInUp} ${DURATIONS.normal}ms ${EASINGS.decelerate}`,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 2 }}>
          <SmartToyIcon sx={{ color: '#6C63FF', fontSize: 28 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, color: theme.palette.text.primary }}>
            {totalActive}
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
            active agents
          </Typography>
        </Box>

        {AGENT_STAGES.map((stage) => {
          const count = statusCounts[stage.key] || 0;
          if (count === 0) return null;
          return (
            <Chip
              key={stage.key}
              label={`${stage.label}: ${count}`}
              size="small"
              sx={{
                bgcolor: alpha(stage.color, 0.15),
                color: stage.color,
                fontWeight: 600,
                fontSize: '0.7rem',
                border: `1px solid ${alpha(stage.color, 0.3)}`,
              }}
            />
          );
        })}

        <Box sx={{ flex: 1 }} />

        {/* Spark meter */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 140 }}>
          <Typography variant="caption" sx={{ color: theme.palette.text.secondary, whiteSpace: 'nowrap' }}>
            Spark
          </Typography>
          <Box sx={{
            flex: 1, height: 6, borderRadius: '3px',
            bgcolor: alpha('#6C63FF', 0.1),
            overflow: 'hidden',
          }}>
            <Box sx={{
              height: '100%',
              width: `${sparkPct}%`,
              background: 'linear-gradient(90deg, #6C63FF, #00e89d)',
              borderRadius: '3px',
              transition: `width ${DURATIONS.slow}ms ${EASINGS.smooth}`,
            }} />
          </Box>
          <Typography variant="caption" sx={{ color: theme.palette.text.secondary, minWidth: 28 }}>
            {Math.round(sparkPct)}%
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}

/** Small SVG progress ring */
function ProgressRing({ percent, color, size = 32 }) {
  const r = (size - 4) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={3} />
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={3}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: `stroke-dashoffset ${DURATIONS.slow}ms ${EASINGS.smooth}` }} />
    </svg>
  );
}

/** Single agent card for grid view */
function AgentCard({ agent, index, onClick, onContextMenu }) {
  const theme = useTheme();
  const stageColor = getStageColor(agent.agent_status);
  const palette = getAgentColor(agent.title);
  const progressPct = agent.progress ?? 0;
  const sparkPct = agent.spark_budget > 0
    ? Math.min(100, (agent.spark_used / agent.spark_budget) * 100)
    : 0;

  return (
    <Paper
      onClick={() => onClick(agent)}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, agent); }}
      sx={{
        ...socialTokens.glass.subtle(theme),
        borderRadius: RADIUS.lg,
        p: 2, cursor: 'pointer',
        position: 'relative', overflow: 'hidden',
        animation: `${fadeInUp} ${DURATIONS.normal}ms ${EASINGS.decelerate}`,
        animationDelay: `${Math.min(index * 40, 400)}ms`,
        animationFillMode: 'backwards',
        transition: `all ${DURATIONS.fast}ms ${EASINGS.smooth}`,
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: SHADOWS.cardHover,
          borderColor: alpha(stageColor, 0.4),
        },
      }}
    >
      {/* Status accent bar */}
      <Box sx={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        bgcolor: stageColor, borderRadius: '3px 0 0 3px',
      }} />

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1 }}>
        <Avatar sx={{
          bgcolor: palette.bg, color: palette.accent,
          width: 36, height: 36, fontSize: '0.85rem', fontWeight: 700,
        }}>
          {(agent.title || 'A').charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{
            fontWeight: 600, color: theme.palette.text.primary,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {agent.title || 'Unnamed Agent'}
          </Typography>
          <Typography variant="caption" sx={{
            color: theme.palette.text.secondary,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            display: 'block',
          }}>
            {agent.experiment_title || 'No experiment'}
          </Typography>
        </Box>
        <ProgressRing percent={progressPct} color={stageColor} size={32} />
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Chip
          label={AGENT_STAGES[getStageIndex(agent.agent_status)]?.label || 'Unknown'}
          size="small"
          sx={{
            bgcolor: alpha(stageColor, 0.15),
            color: stageColor,
            fontWeight: 600,
            fontSize: '0.65rem',
            height: 20,
            border: `1px solid ${alpha(stageColor, 0.3)}`,
          }}
        />
        {agent.goal_type && (
          <Typography variant="caption" sx={{ color: theme.palette.text.disabled, fontSize: '0.6rem' }}>
            {agent.goal_type}
          </Typography>
        )}
      </Box>

      {/* Spark bar */}
      <Box sx={{
        height: 3, borderRadius: '2px',
        bgcolor: alpha('#6C63FF', 0.08),
        overflow: 'hidden',
      }}>
        <Box sx={{
          height: '100%',
          width: `${sparkPct}%`,
          bgcolor: sparkPct > 80 ? '#FF6B6B' : '#6C63FF',
          borderRadius: '2px',
          transition: `width ${DURATIONS.slow}ms ${EASINGS.smooth}`,
        }} />
      </Box>
    </Paper>
  );
}

/** Tree view — collapsible per-experiment groups */
function TreeView({ agents, experiments, onAgentClick, theme }) {
  const [expanded, setExpanded] = useState({});

  const grouped = useMemo(() => {
    const map = {};
    agents.forEach((a) => {
      const key = a.experiment_post_id || 'unassigned';
      if (!map[key]) map[key] = { experiment: null, agents: [] };
      map[key].agents.push(a);
    });
    // Attach experiment metadata
    experiments.forEach((exp) => {
      if (map[exp.post_id]) map[exp.post_id].experiment = exp;
    });
    return map;
  }, [agents, experiments]);

  const toggleExpand = (key) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Box>
      {Object.entries(grouped).map(([key, group]) => {
        const isOpen = expanded[key] !== false; // default open
        const exp = group.experiment;
        return (
          <Paper key={key} sx={{
            ...socialTokens.glass.subtle(theme),
            borderRadius: RADIUS.md,
            mb: 1.5, overflow: 'hidden',
          }}>
            <Box
              onClick={() => toggleExpand(key)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5,
                cursor: 'pointer',
                '&:hover': { bgcolor: alpha('#6C63FF', 0.04) },
              }}
            >
              <ScienceIcon sx={{ color: '#6C63FF', fontSize: 20 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
                  {exp?.title || `Experiment ${key}`}
                </Typography>
                <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                  {group.agents.length} agent{group.agents.length !== 1 ? 's' : ''}
                </Typography>
              </Box>
              <IconButton size="small">
                {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Box>

            {isOpen && (
              <Box sx={{ px: 1.5, pb: 1.5 }}>
                {group.agents.map((agent) => {
                  const stageColor = getStageColor(agent.agent_status);
                  const palette = getAgentColor(agent.title);
                  return (
                    <Box
                      key={agent.id || agent.title}
                      onClick={() => onAgentClick(agent)}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1, p: 1,
                        borderRadius: RADIUS.sm, cursor: 'pointer',
                        transition: `background ${DURATIONS.fast}ms ${EASINGS.smooth}`,
                        '&:hover': { bgcolor: alpha(stageColor, 0.06) },
                      }}
                    >
                      <Avatar sx={{
                        bgcolor: palette.bg, color: palette.accent,
                        width: 28, height: 28, fontSize: '0.7rem', fontWeight: 700,
                      }}>
                        {(agent.title || 'A').charAt(0).toUpperCase()}
                      </Avatar>
                      <Typography variant="body2" sx={{
                        flex: 1, fontWeight: 500,
                        color: theme.palette.text.primary,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {agent.title || 'Unnamed'}
                      </Typography>
                      <Chip
                        label={AGENT_STAGES[getStageIndex(agent.agent_status)]?.label || '?'}
                        size="small"
                        sx={{
                          bgcolor: alpha(stageColor, 0.15),
                          color: stageColor,
                          fontWeight: 600,
                          fontSize: '0.6rem',
                          height: 18,
                        }}
                      />
                    </Box>
                  );
                })}
              </Box>
            )}
          </Paper>
        );
      })}
    </Box>
  );
}

// ===================================================================
// Main Component
// ===================================================================

export default function AgentHiveView() {
  const theme = useTheme();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // ---- State ----
  const [view, setView] = useState('grid');
  const [agents, setAgents] = useState([]);
  const [experiments, setExperiments] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedAgent, setSelectedAgent] = useState(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState(null);
  const [contextAgent, setContextAgent] = useState(null);

  // Dialogs
  const [injectOpen, setInjectOpen] = useState(false);
  const [injectPostId, setInjectPostId] = useState(null);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [interviewAgent, setInterviewAgent] = useState(null);

  // Snackbar
  const [snack, setSnack] = useState(null);

  // Polling ref
  const pollRef = useRef(null);

  // ---- Data fetching ----

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, trackRes, encRes] = await Promise.allSettled([
        dashboardApi.agents(),
        trackerApi.listExperiments({ filter: 'all', limit: 100 }),
        trackerApi.encounters(),
      ]);

      // Parse dashboard agents
      const dashData = dashRes.status === 'fulfilled' ? dashRes.value?.data : null;
      const rawAgents = dashData?.agents || dashData?.data?.agents || [];
      const rawSummary = dashData?.summary || dashData?.data?.summary || {};

      // Parse tracker experiments
      const trackData = trackRes.status === 'fulfilled' ? trackRes.value?.data : null;
      const rawExperiments = trackData?.experiments || trackData?.data?.experiments || [];

      // Parse encounters
      const encData = encRes.status === 'fulfilled' ? encRes.value?.data : null;
      const rawEncounters = encData?.encounters || encData?.data?.encounters || [];

      // Merge experiment data into agents
      const experimentMap = {};
      rawExperiments.forEach((exp) => {
        experimentMap[exp.post_id] = exp;
      });

      const merged = rawAgents.map((agent) => {
        const exp = experimentMap[agent.experiment_post_id || agent.post_id];
        return {
          ...agent,
          experiment_title: exp?.title || agent.experiment_title || '',
          experiment_post_id: agent.experiment_post_id || agent.post_id,
          progress: agent.progress ?? exp?.goal?.progress?.completed_pct ?? 0,
          spark_used: agent.spark_used ?? 0,
          spark_budget: agent.spark_budget ?? 0,
          goal_type: agent.goal_type || exp?.goal?.goal_type || '',
        };
      });

      // Build summary with status counts
      const statusCounts = {};
      merged.forEach((a) => {
        const key = AGENT_STAGES[getStageIndex(a.agent_status)]?.key || 'creation';
        statusCounts[key] = (statusCounts[key] || 0) + 1;
      });

      setAgents(merged);
      setExperiments(rawExperiments);
      setEncounters(rawEncounters);
      setSummary({
        ...rawSummary,
        total_active: merged.length,
        status_counts: statusCounts,
        total_spark_used: merged.reduce((s, a) => s + (a.spark_used || 0), 0),
        total_spark_budget: merged.reduce((s, a) => s + (a.spark_budget || 0), 0) || 1,
      });
    } catch (err) {
      console.error('[AgentHiveView] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial + polling
  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, POLL_INTERVAL);
    return () => { clearInterval(pollRef.current); };
  }, [fetchData]);

  // ---- Filtered agents ----

  const filteredAgents = useMemo(() => {
    if (filter === 'all') return agents;
    if (filter === 'active') return agents.filter((a) => {
      const idx = getStageIndex(a.agent_status);
      return idx < 2; // creation or review
    });
    if (filter === 'needs_review') return agents.filter((a) =>
      a.agent_status?.toLowerCase().includes('review'));
    // by goal_type
    return agents.filter((a) => a.goal_type === filter);
  }, [agents, filter]);

  // Unique goal types for filter
  const goalTypes = useMemo(() => {
    const types = new Set();
    agents.forEach((a) => { if (a.goal_type) types.add(a.goal_type); });
    return Array.from(types);
  }, [agents]);

  // ---- Handlers ----

  const handleAgentClick = useCallback((agent) => {
    setSelectedAgent(agent);
    if (agent.experiment_post_id) {
      navigate(`/social/tracker?experiment=${agent.experiment_post_id}`);
    }
  }, [navigate]);

  const handleContextMenu = useCallback((event, agent) => {
    setContextMenu({ mouseX: event.clientX, mouseY: event.clientY });
    setContextAgent(agent);
  }, []);

  const handleContextClose = () => {
    setContextMenu(null);
    setContextAgent(null);
  };

  const handleInject = () => {
    if (contextAgent?.experiment_post_id) {
      setInjectPostId(contextAgent.experiment_post_id);
      setInjectOpen(true);
    }
    handleContextClose();
  };

  const handleInterview = () => {
    if (contextAgent) {
      setInterviewAgent(contextAgent);
      setInterviewOpen(true);
    }
    handleContextClose();
  };

  const handleViewInTracker = () => {
    if (contextAgent?.experiment_post_id) {
      navigate(`/social/tracker?experiment=${contextAgent.experiment_post_id}`);
    }
    handleContextClose();
  };

  // ---- Render ----

  if (loading) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
        <Skeleton variant="rounded" height={72} sx={{ borderRadius: RADIUS.lg, mb: 2 }} />
        <Grid container spacing={2}>
          {[...Array(8)].map((_, i) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={i}>
              <Skeleton variant="rounded" height={140} sx={{ borderRadius: RADIUS.lg }} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      {/* Summary bar */}
      <HiveSummaryBar summary={summary} theme={theme} />

      {/* Controls row */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap',
      }}>
        {/* View switcher */}
        <Box sx={{
          display: 'flex', borderRadius: RADIUS.md, overflow: 'hidden',
          border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
        }}>
          {[
            { key: 'grid', icon: <GridViewIcon fontSize="small" />, tip: 'Grid view' },
            { key: 'swarm', icon: <BubbleChartIcon fontSize="small" />, tip: 'Swarm view' },
            { key: 'tree', icon: <AccountTreeIcon fontSize="small" />, tip: 'Tree view' },
          ].map((v) => (
            <Tooltip key={v.key} title={v.tip}>
              <IconButton
                size="small"
                onClick={() => setView(v.key)}
                sx={{
                  borderRadius: 0,
                  px: 1.5,
                  bgcolor: view === v.key ? alpha('#6C63FF', 0.2) : 'transparent',
                  color: view === v.key ? '#6C63FF' : theme.palette.text.secondary,
                  '&:hover': { bgcolor: alpha('#6C63FF', 0.1) },
                }}
              >
                {v.icon}
              </IconButton>
            </Tooltip>
          ))}
        </Box>

        {/* Filter chips */}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flex: 1 }}>
          {['all', 'active', 'needs_review'].map((f) => (
            <Chip
              key={f}
              label={f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Needs Review'}
              size="small"
              onClick={() => setFilter(f)}
              sx={{
                bgcolor: filter === f ? alpha('#6C63FF', 0.2) : 'transparent',
                color: filter === f ? '#6C63FF' : theme.palette.text.secondary,
                border: `1px solid ${alpha('#6C63FF', filter === f ? 0.4 : 0.1)}`,
                fontWeight: filter === f ? 600 : 400,
                fontSize: '0.7rem',
                cursor: 'pointer',
              }}
            />
          ))}
          {goalTypes.map((gt) => (
            <Chip
              key={gt}
              label={gt}
              size="small"
              onClick={() => setFilter(filter === gt ? 'all' : gt)}
              sx={{
                bgcolor: filter === gt ? alpha('#00e89d', 0.2) : 'transparent',
                color: filter === gt ? '#00e89d' : theme.palette.text.disabled,
                border: `1px solid ${alpha('#00e89d', filter === gt ? 0.4 : 0.08)}`,
                fontWeight: filter === gt ? 600 : 400,
                fontSize: '0.65rem',
                cursor: 'pointer',
              }}
            />
          ))}
        </Box>

        {/* Refresh */}
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={fetchData}
            sx={{ color: theme.palette.text.secondary }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {/* Agent count */}
        <Typography variant="caption" sx={{ color: theme.palette.text.disabled }}>
          {filteredAgents.length} agent{filteredAgents.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {/* Main content */}
      {filteredAgents.length === 0 && !loading ? (
        <Paper sx={{
          ...socialTokens.glass.subtle(theme),
          borderRadius: RADIUS.lg,
          p: 6, textAlign: 'center',
        }}>
          <SmartToyIcon sx={{ fontSize: 48, color: alpha('#6C63FF', 0.3), mb: 2 }} />
          <Typography variant="h6" sx={{ color: theme.palette.text.secondary, mb: 1 }}>
            No agents found
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.disabled }}>
            Create a thought experiment to spawn your first agent.
          </Typography>
        </Paper>
      ) : view === 'grid' ? (
        <Grid container spacing={2}>
          {filteredAgents.map((agent, i) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={agent.id || agent.title || i}>
              <AgentCard
                agent={agent}
                index={i}
                onClick={handleAgentClick}
                onContextMenu={handleContextMenu}
              />
            </Grid>
          ))}
        </Grid>
      ) : view === 'swarm' ? (
        <Paper sx={{
          ...socialTokens.glass.subtle(theme),
          borderRadius: RADIUS.lg,
          overflow: 'hidden',
          height: isMobile ? 400 : 560,
        }}>
          <SwarmCanvas
            agents={filteredAgents}
            encounters={encounters}
            onAgentSelect={handleAgentClick}
          />
        </Paper>
      ) : (
        <TreeView
          agents={filteredAgents}
          experiments={experiments}
          onAgentClick={handleAgentClick}
          theme={theme}
        />
      )}

      {/* Context menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleContextClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined
        }
        PaperProps={{
          sx: {
            ...socialTokens.glass.elevated(theme),
            borderRadius: RADIUS.md,
            minWidth: 180,
          },
        }}
      >
        <MenuItem onClick={handleInject}>
          <ListItemIcon><TuneIcon fontSize="small" sx={{ color: '#6C63FF' }} /></ListItemIcon>
          <ListItemText>Inject Variable</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleInterview}>
          <ListItemIcon><ChatIcon fontSize="small" sx={{ color: '#00e89d' }} /></ListItemIcon>
          <ListItemText>Interview Agent</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleViewInTracker}>
          <ListItemIcon><VisibilityIcon fontSize="small" sx={{ color: '#00BCD4' }} /></ListItemIcon>
          <ListItemText>View in Tracker</ListItemText>
        </MenuItem>
      </Menu>

      {/* Variable Injection Dialog */}
      <VariableInjectionDialog
        open={injectOpen}
        onClose={() => setInjectOpen(false)}
        postId={injectPostId}
        onSuccess={() => {
          setSnack({ severity: 'success', message: 'Variable injected successfully' });
          fetchData();
        }}
      />

      {/* Agent Interview Panel */}
      {interviewOpen && interviewAgent && (
        <AgentInterviewPanel
          postId={interviewAgent.experiment_post_id}
          agentTitle={interviewAgent.title}
          onClose={() => { setInterviewOpen(false); setInterviewAgent(null); }}
        />
      )}

      {/* Snackbar */}
      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snack && (
          <Alert severity={snack.severity} onClose={() => setSnack(null)}
            sx={{ borderRadius: RADIUS.md }}>
            {snack.message}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
}
