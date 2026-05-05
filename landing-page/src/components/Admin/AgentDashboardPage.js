import { SOCIAL_API_URL } from '../../config/apiBase';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import {
  Typography,
  Grid,
  Card,
  CardContent,
  Box,
  Chip,
  LinearProgress,
  Skeleton,
  Fade,
  Grow,
  IconButton,
  Tooltip,
} from '@mui/material';
import React, { useState, useEffect, useRef } from 'react';


// SSE-driven refresh + heartbeat fallback.
//
// HEARTBEAT_INTERVAL is the safety-net poll cadence for when SSE is
// disconnected (browser tab backgrounded, server restart) or when a
// state change happens without a corresponding `dashboard.invalidate`
// emit (e.g. expert-agent registry mutation we haven't wired yet).
// 30s is intentional — long enough to not stack on the waitress queue
// even under throttle, short enough that a missed event surfaces in
// at most half a minute.  Fast updates land via SSE in real time.
const HEARTBEAT_INTERVAL = 30000;
const REFETCH_DEBOUNCE_MS = 250;

const cardStyle = {
  background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 26, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 3,
  transition: 'all 0.3s ease',
};

const STATUS_CONFIG = {
  active:    { color: '#6C63FF', label: 'Active' },
  executing: { color: '#9B94FF', label: 'Executing' },
  healthy:   { color: '#6C63FF', label: 'Healthy' },
  stalled:   { color: '#ff9800', label: 'Stalled' },
  frozen:    { color: '#ff4444', label: 'Frozen' },
  idle:      { color: '#888',    label: 'Idle' },
  completed: { color: '#666',    label: 'Completed' },
  dead:      { color: '#ff0000', label: 'Dead' },
  unknown:   { color: '#555',    label: 'Unknown' },
};

function StatusChip({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  return (
    <Chip
      label={cfg.label}
      size="small"
      sx={{
        bgcolor: `${cfg.color}18`,
        color: cfg.color,
        border: `1px solid ${cfg.color}33`,
        fontWeight: 600,
        fontSize: '0.7rem',
      }}
    />
  );
}

function SparkProgress({ spent, budget }) {
  if (!budget) return null;
  const pct = Math.min((spent / budget) * 100, 100);
  return (
    <Box sx={{ mt: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Spark</Typography>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
          {spent}/{budget}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.05)',
          '& .MuiLinearProgress-bar': {
            borderRadius: 3,
            background: pct > 80
              ? 'linear-gradient(90deg, #ff9800, #ff4444)'
              : 'linear-gradient(90deg, #6C63FF, #9B94FF)',
          },
        }}
      />
    </Box>
  );
}

function AgentCard({ agent, index }) {
  const m = agent.metrics || {};
  return (
    <Grow in timeout={300 + index * 50}>
      <Card sx={{ ...cardStyle, '&:hover': { border: '1px solid rgba(108,99,255,0.15)' } }}>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <SmartToyIcon sx={{ fontSize: 20, color: 'rgba(255,255,255,0.4)' }} />
              <Box>
                <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600, lineHeight: 1.2 }}>
                  {agent.name}
                </Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                  {agent.type.replace(/_/g, ' ')}
                </Typography>
              </Box>
            </Box>
            <StatusChip status={agent.status} />
          </Box>
          {agent.current_task && (
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mt: 0.5 }}>
              {agent.current_task}
            </Typography>
          )}
          <SparkProgress spent={m.spark_spent} budget={m.spark_budget} />
          {agent.last_active && (
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', display: 'block', mt: 1 }}>
              Last active: {new Date(agent.last_active).toLocaleTimeString()}
            </Typography>
          )}
        </CardContent>
      </Card>
    </Grow>
  );
}

export default function AgentDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const refs = useRef({etag: null, abort: null, debounce: null, hb: null, es: null});

  // Native fetch with If-None-Match + AbortController.  Cancels prior
  // in-flight before issuing the next, so the waitress queue can't
  // stack our polls.  304 keeps the previous data on screen.
  const fetchDashboard = async () => {
    if (refs.current.abort) refs.current.abort.abort();
    const ctrl = new AbortController();
    refs.current.abort = ctrl;
    try {
      const headers = refs.current.etag ? {'If-None-Match': refs.current.etag} : {};
      const r = await fetch(`${SOCIAL_API_URL}/dashboard/agents`, {
        signal: ctrl.signal, headers, credentials: 'include',
      });
      const tag = r.headers.get('etag');
      if (tag) refs.current.etag = tag;
      if (r.status === 200) {
        const body = await r.json();
        setData(body.data || body);
      }
      // 304: keep current `data` as-is (server says nothing changed)
      setLastUpdated(new Date());
    } catch (err) {
      if (err?.name !== 'AbortError') { /* keep previous data on error */ }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();

    // SSE live channel.  HARTOS bootstrap.py bridges
    // agent_goal.changed / coding_goal.changed / action_state.changed
    // / daemon.status.changed → 'dashboard.invalidate'.  Coalesce
    // bursts via 250ms debounce so 5 goal updates in a tick = 1 fetch.
    const refetch = () => {
      if (refs.current.debounce) clearTimeout(refs.current.debounce);
      refs.current.debounce = setTimeout(fetchDashboard, REFETCH_DEBOUNCE_MS);
    };
    try {
      const es = new EventSource(`${SOCIAL_API_URL}/events/stream`);
      refs.current.es = es;
      es.addEventListener('dashboard.invalidate', refetch);
      es.onerror = () => { /* auto-reconnects; heartbeat is the safety net */ };
    } catch { /* SSE unsupported — heartbeat covers it */ }

    refs.current.hb = setInterval(fetchDashboard, HEARTBEAT_INTERVAL);
    return () => {
      const r = refs.current;
      if (r.hb) clearInterval(r.hb);
      if (r.debounce) clearTimeout(r.debounce);
      if (r.abort) r.abort.abort();
      if (r.es) r.es.close();
    };
  }, []);

  const agents = data?.agents || [];
  const summary = data?.summary || {};
  const health = data?.node_health || {};

  return (
    <Fade in timeout={300}>
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
          <Box>
            <Typography variant="h4" sx={{
              fontWeight: 700,
              background: 'linear-gradient(135deg, #fff, rgba(255,255,255,0.7))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', mb: 0.5,
            }}>
              Agent Dashboard
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
              Truth-grounded live view — pushed via SSE, heartbeat 30s
              {lastUpdated && ` | ${lastUpdated.toLocaleTimeString()}`}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              label={health.watchdog || 'unknown'}
              size="small"
              sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)' }}
            />
            <Tooltip title="Refresh now">
              <IconButton size="small" onClick={fetchDashboard} sx={{ color: 'rgba(255,255,255,0.5)' }}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Summary */}
        {!loading && summary.total != null && (
          <Grow in timeout={400}>
            <Card sx={{ ...cardStyle, mb: 3 }}>
              <CardContent sx={{ p: 2.5 }}>
                <Grid container spacing={2}>
                  <Grid item xs={3}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h5" sx={{ fontWeight: 700, color: '#9B94FF' }}>{summary.total}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Total</Typography>
                    </Box>
                  </Grid>
                  {summary.by_status && Object.entries(summary.by_status).map(([s, c]) => (
                    <Grid item xs key={s}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: (STATUS_CONFIG[s] || {}).color || '#888' }}>{c}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{s}</Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>
          </Grow>
        )}

        {/* Agent Grid */}
        {loading ? (
          <Grid container spacing={2}>
            {[1,2,3,4,5,6].map(i => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Card sx={cardStyle}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Skeleton variant="text" width="60%" sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
                    <Skeleton variant="text" width="40%" sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
                    <Skeleton variant="rounded" height={6} sx={{ bgcolor: 'rgba(255,255,255,0.05)', mt: 2 }} />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Grid container spacing={2}>
            {agents.map((agent, i) => (
              <Grid item xs={12} sm={6} md={4} key={agent.id || i}>
                <AgentCard agent={agent} index={i} />
              </Grid>
            ))}
            {agents.length === 0 && (
              <Grid item xs={12}>
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <SmartToyIcon sx={{ fontSize: 48, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
                  <Typography sx={{ color: 'rgba(255,255,255,0.4)' }}>
                    No agents running. Start a goal or daemon to see them here.
                  </Typography>
                </Box>
              </Grid>
            )}
          </Grid>
        )}
      </Box>
    </Fade>
  );
}
