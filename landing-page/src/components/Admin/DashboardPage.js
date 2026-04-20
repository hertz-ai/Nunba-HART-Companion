import {adminApi} from '../../services/socialApi';

import ArticleIcon from '@mui/icons-material/Article';
import PeopleIcon from '@mui/icons-material/People';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SpeedIcon from '@mui/icons-material/Speed';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import {
  Typography,
  Grid,
  Card,
  CardContent,
  Box,
  LinearProgress,
  Skeleton,
  Fade,
  Grow,
} from '@mui/material';
import React, {useState, useEffect} from 'react';

// Reusable polished card styles
const cardStyle = {
  height: '100%',
  background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 26, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 3,
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  cursor: 'pointer',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: '0 20px 40px rgba(108, 99, 255, 0.1)',
    border: '1px solid rgba(108, 99, 255, 0.2)',
  },
};

const iconContainerStyle = {
  width: 56,
  height: 56,
  borderRadius: 3,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.15) 0%, rgba(155, 148, 255, 0.15) 100%)',
  boxShadow: '0 8px 24px rgba(108, 99, 255, 0.1)',
};

// Loading Skeleton for Stats
function StatSkeleton() {
  return (
    <Card sx={cardStyle}>
      <CardContent sx={{display: 'flex', alignItems: 'center', gap: 2.5, p: 3}}>
        <Skeleton variant="rounded" width={56} height={56} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
        <Box sx={{flex: 1}}>
          <Skeleton variant="text" width={80} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
          <Skeleton variant="text" width={120} height={40} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
        </Box>
      </CardContent>
    </Card>
  );
}

function StatCard({title, value, icon, loading, index = 0, trend}) {
  const [isHovered, setIsHovered] = useState(false);

  if (loading) return <StatSkeleton />;

  return (
    <Grow in={true} timeout={400 + index * 100}>
      <Card
        sx={cardStyle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <CardContent sx={{display: 'flex', alignItems: 'center', gap: 2.5, p: 3}}>
          <Box sx={{
            ...iconContainerStyle,
            transform: isHovered ? 'scale(1.1) rotate(5deg)' : 'scale(1)',
            transition: 'all 0.3s ease',
          }}>
            {React.cloneElement(icon, {
              sx: {
                fontSize: 28,
                background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }
            })}
          </Box>
          <Box>
            <Typography variant="body2" sx={{
              color: 'rgba(255,255,255,0.5)',
              fontWeight: 500,
              textTransform: 'uppercase',
              fontSize: '0.75rem',
              letterSpacing: '0.5px',
            }}>
              {title}
            </Typography>
            <Typography variant="h4" sx={{
              fontWeight: 700,
              color: '#fff',
              mt: 0.5,
              background: isHovered
                ? 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)'
                : 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.8) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              transition: 'all 0.3s ease',
            }}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </Typography>
            {trend && (
              <Typography variant="caption" sx={{
                color: trend > 0 ? '#6C63FF' : '#ff4444',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                mt: 0.5,
              }}>
                {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% vs last week
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>
    </Grow>
  );
}

function MetricBar({label, value, max, color = '#9B94FF', index = 0}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const [animatedPct, setAnimatedPct] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedPct(pct), 100 + index * 200);
    return () => clearTimeout(timer);
  }, [pct, index]);

  return (
    <Box sx={{mb: 3}}>
      <Box sx={{display: 'flex', justifyContent: 'space-between', mb: 1}}>
        <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.7)', fontWeight: 500}}>
          {label}
        </Typography>
        <Typography variant="body2" sx={{
          color: pct > 80 ? '#ff4444' : pct > 60 ? '#ffaa00' : '#6C63FF',
          fontWeight: 600,
        }}>
          {value}%
        </Typography>
      </Box>
      <Box sx={{
        height: 8,
        borderRadius: 4,
        background: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
      }}>
        <Box sx={{
          height: '100%',
          borderRadius: 4,
          background: `linear-gradient(90deg, ${color} 0%, ${color}88 100%)`,
          width: `${animatedPct}%`,
          transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: `0 0 20px ${color}44`,
        }} />
      </Box>
    </Box>
  );
}

function MetricsSkeleton() {
  return (
    <Card sx={cardStyle}>
      <CardContent sx={{p: 3}}>
        <Skeleton variant="text" width={140} height={32} sx={{bgcolor: 'rgba(255,255,255,0.05)', mb: 3}} />
        {[1, 2, 3].map((i) => (
          <Box key={i} sx={{mb: 3}}>
            <Skeleton variant="text" width="100%" sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
            <Skeleton variant="rounded" height={8} sx={{bgcolor: 'rgba(255,255,255,0.05)', mt: 1}} />
          </Box>
        ))}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [latency, setLatency] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [s, m, l] = await Promise.all([
          adminApi.stats(),
          adminApi.metrics().catch(() => null),
          adminApi.latency().catch(() => null),
        ]);
        setStats(s.data || s);
        setMetrics(m?.data || m);
        setLatency(l?.data || l);
      } catch (err) {
        /* ignore */
      }
      setLoading(false);
    };
    load();
  }, []);

  return (
    <Fade in={true} timeout={300}>
      <Box>
        {/* Page Header */}
        <Box sx={{mb: 4}}>
          <Typography variant="h4" sx={{
            fontWeight: 700,
            background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mb: 1,
          }}>
            Dashboard
          </Typography>
          <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
            Overview of your platform metrics and performance
          </Typography>
        </Box>

        {/* Stats Grid */}
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Total Users"
              value={stats?.total_users || 0}
              icon={<PeopleIcon />}
              loading={loading}
              index={0}
              trend={12.5}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Posts Today"
              value={stats?.posts_today || 0}
              icon={<ArticleIcon />}
              loading={loading}
              index={1}
              trend={8.2}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Active Agents"
              value={stats?.active_agents || 0}
              icon={<SmartToyIcon />}
              loading={loading}
              index={2}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              title="Growth (7d)"
              value={stats?.growth_7d ? `${stats.growth_7d}%` : '0%'}
              icon={<TrendingUpIcon />}
              loading={loading}
              index={3}
            />
          </Grid>

          {/* System Metrics */}
          <Grid item xs={12} md={6}>
            {loading ? (
              <MetricsSkeleton />
            ) : metrics ? (
              <Grow in={true} timeout={800}>
                <Card sx={cardStyle}>
                  <CardContent sx={{p: 3}}>
                    <Typography variant="h6" sx={{
                      color: '#fff',
                      fontWeight: 600,
                      mb: 3,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}>
                      <Box sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#6C63FF',
                        boxShadow: '0 0 10px #6C63FF',
                      }} />
                      System Metrics
                    </Typography>
                    <MetricBar label="CPU Usage" value={metrics.cpu || 0} max={100} color="#9B94FF" index={0} />
                    <MetricBar label="Memory" value={metrics.memory || 0} max={100} color="#6C63FF" index={1} />
                    <MetricBar label="Disk" value={metrics.disk || 0} max={100} color="#ff9800" index={2} />
                  </CardContent>
                </Card>
              </Grow>
            ) : null}
          </Grid>

          {/* Latency */}
          <Grid item xs={12} md={6}>
            {loading ? (
              <MetricsSkeleton />
            ) : latency ? (
              <Grow in={true} timeout={900}>
                <Card sx={cardStyle}>
                  <CardContent sx={{p: 3}}>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 3}}>
                      <Box sx={iconContainerStyle}>
                        <SpeedIcon sx={{
                          fontSize: 24,
                          background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        }} />
                      </Box>
                      <Typography variant="h6" sx={{color: '#fff', fontWeight: 600}}>
                        Response Latency
                      </Typography>
                    </Box>
                    <Grid container spacing={3}>
                      {[
                        {label: 'API', value: latency.api, color: '#9B94FF'},
                        {label: 'Database', value: latency.db, color: '#6C63FF'},
                        {label: 'LLM', value: latency.llm, color: '#ff9800'},
                      ].map((item, index) => (
                        <Grid item xs={4} key={item.label}>
                          <Fade in={true} timeout={600 + index * 200}>
                            <Box sx={{
                              textAlign: 'center',
                              p: 2,
                              borderRadius: 2,
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.05)',
                              transition: 'all 0.3s ease',
                              '&:hover': {
                                background: 'rgba(255,255,255,0.05)',
                                transform: 'scale(1.02)',
                              },
                            }}>
                              <Typography variant="body2" sx={{
                                color: 'rgba(255,255,255,0.5)',
                                fontWeight: 500,
                                mb: 1,
                              }}>
                                {item.label}
                              </Typography>
                              <Typography variant="h5" sx={{
                                fontWeight: 700,
                                color: item.color,
                              }}>
                                {item.value || 0}
                                <Typography component="span" variant="body2" sx={{color: 'rgba(255,255,255,0.5)', ml: 0.5}}>
                                  ms
                                </Typography>
                              </Typography>
                            </Box>
                          </Fade>
                        </Grid>
                      ))}
                    </Grid>
                  </CardContent>
                </Card>
              </Grow>
            ) : null}
          </Grid>
        </Grid>
      </Box>
    </Fade>
  );
}
