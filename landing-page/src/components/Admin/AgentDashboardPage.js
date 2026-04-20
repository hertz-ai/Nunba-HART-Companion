import { dashboardApi } from '../../services/socialApi';

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


const POLL_INTERVAL = 5000;

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
  const intervalRef = useRef(null);

  const fetchDashboard = async () => {
    try {
      const res = await dashboardApi.agents();
      setData(res.data || res);
      setLastUpdated(new Date());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchDashboard();
    intervalRef.current = setInterval(fetchDashboard, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
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
              Truth-grounded live view — auto-refreshes every 5s
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
