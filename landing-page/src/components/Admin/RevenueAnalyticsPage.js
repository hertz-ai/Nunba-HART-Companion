import {adminApi} from '../../services/socialApi';

import BoltIcon from '@mui/icons-material/Bolt';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MemoryIcon from '@mui/icons-material/Memory';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import {
  Typography, Box, Chip, Skeleton, Fade, Grow,
  Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel,
  Accordion, AccordionSummary, AccordionDetails,
  Avatar, Snackbar, Alert,
} from '@mui/material';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import React, {useState, useEffect, useMemo} from 'react';
import {Line, Bar} from 'react-chartjs-2';


ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler,
);

// ── Styles ──
const cardStyle = {
  background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 26, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 3,
  overflow: 'hidden',
};

const tableRowStyle = {
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    background: 'rgba(108, 99, 255, 0.05)',
    transform: 'scale(1.01)',
  },
};

const TIME_RANGES = [
  {label: '7d', days: 7},
  {label: '14d', days: 14},
  {label: '30d', days: 30},
  {label: '90d', days: 90},
];

// ── Chart configs ──
const chartTooltipStyle = {
  backgroundColor: 'rgba(15, 15, 26, 0.95)',
  borderColor: 'rgba(108, 99, 255, 0.3)',
  borderWidth: 1,
  titleColor: '#fff',
  bodyColor: 'rgba(255,255,255,0.8)',
};

const revenueChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {labels: {color: 'rgba(255,255,255,0.7)', font: {size: 12}}},
    tooltip: chartTooltipStyle,
  },
  scales: {
    x: {
      grid: {color: 'rgba(255,255,255,0.05)'},
      ticks: {color: 'rgba(255,255,255,0.5)', maxRotation: 45},
    },
    y: {
      grid: {color: 'rgba(255,255,255,0.05)'},
      ticks: {color: 'rgba(255,255,255,0.5)'},
    },
  },
};

const computeChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {labels: {color: 'rgba(255,255,255,0.7)'}},
    tooltip: {...chartTooltipStyle, borderColor: 'rgba(108, 99, 255, 0.3)'},
  },
  scales: {
    x: {
      grid: {color: 'rgba(255,255,255,0.05)'},
      ticks: {color: 'rgba(255,255,255,0.5)', maxRotation: 45},
    },
    y: {
      type: 'linear', position: 'left',
      grid: {color: 'rgba(255,255,255,0.05)'},
      ticks: {color: '#9B94FF'},
      title: {display: true, text: 'Credits', color: '#9B94FF'},
    },
    y1: {
      type: 'linear', position: 'right',
      grid: {drawOnChartArea: false},
      ticks: {color: '#ff9800'},
      title: {display: true, text: 'Requests', color: '#ff9800'},
    },
  },
};

// ── Helpers ──
function formatNumber(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function buildRevenueChartData(adDaily, sparkDaily) {
  const daySet = new Set([
    ...adDaily.map(r => r.day),
    ...sparkDaily.map(r => r.day),
  ]);
  const labels = [...daySet].sort();
  const adMap = Object.fromEntries(adDaily.map(r => [r.day, r]));
  const sparkMap = Object.fromEntries(sparkDaily.map(r => [r.day, r]));

  return {
    labels,
    datasets: [
      {
        label: 'Ad Views',
        data: labels.map(d => adMap[d]?.views || 0),
        borderColor: '#6C63FF',
        backgroundColor: 'rgba(108, 99, 255, 0.1)',
        fill: true, tension: 0.4,
      },
      {
        label: 'Ad Clicks',
        data: labels.map(d => adMap[d]?.clicks || 0),
        borderColor: '#9B94FF',
        backgroundColor: 'rgba(155, 148, 255, 0.1)',
        fill: true, tension: 0.4,
      },
      {
        label: 'Spark Spent',
        data: labels.map(d => sparkMap[d]?.spark_spent || 0),
        borderColor: '#FF6B6B',
        backgroundColor: 'rgba(255, 107, 107, 0.1)',
        fill: true, tension: 0.4,
      },
    ],
  };
}

function buildComputeChartData(computeDaily) {
  return {
    labels: computeDaily.map(r => r.day),
    datasets: [
      {
        label: 'Compute Cost (credits)',
        data: computeDaily.map(r => r.cost),
        backgroundColor: 'rgba(155, 148, 255, 0.6)',
        borderColor: '#9B94FF',
        borderWidth: 1, borderRadius: 4,
        yAxisID: 'y',
      },
      {
        label: 'API Requests',
        data: computeDaily.map(r => r.requests),
        backgroundColor: 'rgba(255, 152, 0, 0.6)',
        borderColor: '#ff9800',
        borderWidth: 1, borderRadius: 4,
        yAxisID: 'y1',
      },
    ],
  };
}

// ── StatCard ──
function StatCard({icon, title, value, subtitle, color, delay}) {
  return (
    <Grow in={true} timeout={300 + delay}>
      <Box sx={{
        ...cardStyle,
        flex: 1,
        minWidth: 200,
        p: 3,
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: `0 20px 40px ${color}15`,
          border: `1px solid ${color}30`,
        },
      }}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 2}}>
          <Box sx={{
            width: 48, height: 48, borderRadius: 3,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${color}15`,
          }}>
            {React.cloneElement(icon, {sx: {fontSize: 24, color}})}
          </Box>
          <Typography sx={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}>
            {title}
          </Typography>
        </Box>
        <Typography sx={{
          fontSize: '1.8rem',
          fontWeight: 700,
          background: `linear-gradient(135deg, ${color} 0%, ${color}99 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography sx={{color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', mt: 0.5}}>
            {subtitle}
          </Typography>
        )}
      </Box>
    </Grow>
  );
}

// ── Loading Skeleton ──
function DashboardSkeleton() {
  return (
    <Box>
      <Box sx={{display: 'flex', gap: 2, mb: 3}}>
        {[1, 2, 3, 4].map(i => (
          <Box key={i} sx={{...cardStyle, flex: 1, p: 3}}>
            <Skeleton variant="rounded" width={48} height={48} sx={{bgcolor: 'rgba(255,255,255,0.05)', mb: 2}} />
            <Skeleton variant="text" width="60%" sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
            <Skeleton variant="text" width="40%" height={40} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
          </Box>
        ))}
      </Box>
      <Box sx={{display: 'flex', gap: 2, mb: 3}}>
        {[1, 2].map(i => (
          <Box key={i} sx={{...cardStyle, flex: 1, p: 3}}>
            <Skeleton variant="rounded" height={300} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
          </Box>
        ))}
      </Box>
      <Box sx={{...cardStyle, p: 2}}>
        {[1, 2, 3, 4, 5].map(i => (
          <Box key={i} sx={{display: 'flex', gap: 2, mb: 2, alignItems: 'center'}}>
            <Skeleton variant="circular" width={36} height={36} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
            <Box sx={{flex: 1}}>
              <Skeleton variant="text" width="50%" sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
            </Box>
            {[1, 2, 3, 4].map(j => (
              <Skeleton key={j} variant="rounded" width={60} height={24} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ── Main Component ──
export default function RevenueAnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [sortField, setSortField] = useState('ad_revenue');
  const [sortDir, setSortDir] = useState('desc');
  const [snackbar, setSnackbar] = useState({open: false, message: '', severity: 'error'});

  useEffect(() => {
    setLoading(true);
    adminApi.revenueAnalytics({days})
      .then(res => setData(res.data || res))
      .catch(() => setSnackbar({open: true, message: 'Failed to load analytics', severity: 'error'}))
      .finally(() => setLoading(false));
  }, [days]);

  const sortedUsers = useMemo(() => {
    if (!data?.per_user) return [];
    return [...data.per_user].sort((a, b) => {
      const aVal = typeof a[sortField] === 'string' ? a[sortField] : (a[sortField] || 0);
      const bVal = typeof b[sortField] === 'string' ? b[sortField] : (b[sortField] || 0);
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [data, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const overview = data?.overview || {};
  const timeSeries = data?.time_series || {};
  const ownership = data?.ownership || [];

  return (
    <Fade in={true} timeout={300}>
      <Box>
        {/* Page Header */}
        <Box sx={{mb: 4}}>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 1}}>
            <Box sx={{
              width: 48, height: 48, borderRadius: 3,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.15) 0%, rgba(155, 148, 255, 0.15) 100%)',
            }}>
              <MonetizationOnIcon sx={{
                fontSize: 24,
                background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }} />
            </Box>
            <Box>
              <Typography variant="h4" sx={{
                fontWeight: 700,
                background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Revenue & Usage Analytics
              </Typography>
              <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                Ad revenue, compute costs, agent economy, and ownership
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Time Range Selector */}
        <Box sx={{display: 'flex', gap: 1, mb: 3}}>
          {TIME_RANGES.map(tr => (
            <Chip
              key={tr.days}
              label={tr.label}
              size="small"
              onClick={() => setDays(tr.days)}
              sx={{
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.2s ease',
                background: days === tr.days ? 'rgba(108, 99, 255, 0.2)' : 'rgba(255,255,255,0.05)',
                color: days === tr.days ? '#6C63FF' : 'rgba(255,255,255,0.5)',
                border: days === tr.days ? '1px solid rgba(108, 99, 255, 0.4)' : '1px solid transparent',
                '&:hover': {background: 'rgba(108, 99, 255, 0.1)'},
              }}
            />
          ))}
        </Box>

        {loading ? <DashboardSkeleton /> : data && (
          <>
            {/* Stat Cards */}
            <Box sx={{display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap'}}>
              <StatCard
                icon={<MonetizationOnIcon />}
                title="Ad Revenue"
                value={`${formatNumber(overview.total_ad_revenue || 0)} Spark`}
                subtitle={`${formatNumber(overview.total_ad_impressions || 0)} impressions, ${formatNumber(overview.total_ad_clicks || 0)} clicks`}
                color="#6C63FF"
                delay={0}
              />
              <StatCard
                icon={<MemoryIcon />}
                title="Compute Cost"
                value={`${(overview.total_compute_cost || 0).toFixed(2)} credits`}
                subtitle={`${formatNumber((overview.total_tokens_in || 0) + (overview.total_tokens_out || 0))} tokens`}
                color="#9B94FF"
                delay={100}
              />
              <StatCard
                icon={<BoltIcon />}
                title="Agent Spark Spent"
                value={`${formatNumber(overview.total_agent_spark_spent || 0)} Spark`}
                subtitle={`Goals: ${formatNumber(overview.agent_goal_spent || 0)}, Boosts: ${formatNumber(overview.boost_spent || 0)}, Campaigns: ${formatNumber(overview.campaign_spent || 0)}`}
                color="#FF6B6B"
                delay={200}
              />
              <StatCard
                icon={<SmartToyIcon />}
                title="Active Agents"
                value={formatNumber(overview.active_agents || 0)}
                subtitle={`Hosting rewards: ${(overview.hosting_rewards_total || 0).toFixed(1)}`}
                color="#ff9800"
                delay={300}
              />
            </Box>

            {/* Charts */}
            <Box sx={{display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap'}}>
              <Grow in={true} timeout={500}>
                <Box sx={{...cardStyle, flex: 1, minWidth: 400, p: 3}}>
                  <Typography variant="h6" sx={{color: '#fff', fontWeight: 600, mb: 2}}>
                    Revenue Over Time
                  </Typography>
                  <Box sx={{height: 300}}>
                    {(timeSeries.ad_daily?.length || timeSeries.spark_daily?.length) ? (
                      <Line
                        data={buildRevenueChartData(timeSeries.ad_daily || [], timeSeries.spark_daily || [])}
                        options={revenueChartOptions}
                      />
                    ) : (
                      <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>
                        <Typography sx={{color: 'rgba(255,255,255,0.3)'}}>No data for this period</Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
              </Grow>
              <Grow in={true} timeout={600}>
                <Box sx={{...cardStyle, flex: 1, minWidth: 400, p: 3}}>
                  <Typography variant="h6" sx={{color: '#fff', fontWeight: 600, mb: 2}}>
                    Compute Usage
                  </Typography>
                  <Box sx={{height: 300}}>
                    {timeSeries.compute_daily?.length ? (
                      <Bar
                        data={buildComputeChartData(timeSeries.compute_daily)}
                        options={computeChartOptions}
                      />
                    ) : (
                      <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%'}}>
                        <Typography sx={{color: 'rgba(255,255,255,0.3)'}}>No data for this period</Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
              </Grow>
            </Box>

            {/* Per-User Revenue Table */}
            <Grow in={true} timeout={700}>
              <Box sx={{...cardStyle, mb: 3}}>
                <Box sx={{p: 2, borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                  <Typography variant="h6" sx={{color: '#fff', fontWeight: 600}}>
                    Per-User Revenue
                  </Typography>
                </Box>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{
                      background: 'rgba(108, 99, 255, 0.05)',
                      '& th': {
                        color: 'rgba(255,255,255,0.7)', fontWeight: 600,
                        borderBottom: '1px solid rgba(255,255,255,0.1)', py: 2,
                      },
                    }}>
                      {[
                        {id: 'username', label: 'User'},
                        {id: 'ad_revenue', label: 'Ad Revenue'},
                        {id: 'compute_cost', label: 'Compute Cost'},
                        {id: 'total_tokens', label: 'Tokens'},
                        {id: 'agents_owned', label: 'Agents Owned'},
                        {id: 'goal_spark_spent', label: 'Goal Spark'},
                      ].map(col => (
                        <TableCell key={col.id}>
                          <TableSortLabel
                            active={sortField === col.id}
                            direction={sortField === col.id ? sortDir : 'asc'}
                            onClick={() => handleSort(col.id)}
                            sx={{
                              color: 'rgba(255,255,255,0.7) !important',
                              '& .MuiTableSortLabel-icon': {color: 'rgba(255,255,255,0.3) !important'},
                            }}
                          >
                            {col.label}
                          </TableSortLabel>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedUsers.map((u, i) => (
                      <Fade in={true} timeout={300 + i * 30} key={u.user_id}>
                        <TableRow sx={{
                          ...tableRowStyle,
                          '& td': {color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.05)', py: 1.5},
                        }}>
                          <TableCell>
                            <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
                              <Avatar sx={{
                                width: 32, height: 32,
                                background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                                fontSize: '0.8rem', fontWeight: 600,
                              }} src={u.avatar_url || undefined}>
                                {(u.username || 'U')[0].toUpperCase()}
                              </Avatar>
                              <Box>
                                <Typography sx={{fontWeight: 500, fontSize: '0.9rem'}}>{u.username}</Typography>
                                {u.display_name && u.display_name !== u.username && (
                                  <Typography sx={{color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem'}}>{u.display_name}</Typography>
                                )}
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{color: '#6C63FF', fontWeight: 600}}>
                              {u.ad_revenue} <Typography component="span" sx={{color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem'}}>spark</Typography>
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{color: '#9B94FF', fontWeight: 600}}>
                              {u.compute_cost.toFixed(2)} <Typography component="span" sx={{color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem'}}>credits</Typography>
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{color: 'rgba(255,255,255,0.7)'}}>
                              {formatNumber(u.total_tokens)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={u.agents_owned}
                              sx={{
                                background: u.agents_owned > 0 ? 'rgba(255, 107, 107, 0.2)' : 'rgba(255,255,255,0.05)',
                                color: u.agents_owned > 0 ? '#FF6B6B' : 'rgba(255,255,255,0.4)',
                                fontWeight: 600,
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography sx={{color: '#ff9800', fontWeight: 600}}>
                              {u.goal_spark_spent} <Typography component="span" sx={{color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem'}}>spark</Typography>
                            </Typography>
                          </TableCell>
                        </TableRow>
                      </Fade>
                    ))}
                    {sortedUsers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{py: 6}}>
                          <Typography sx={{color: 'rgba(255,255,255,0.4)'}}>No user revenue data yet</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            </Grow>

            {/* Agent Ownership Panel */}
            {ownership.length > 0 && (
              <Grow in={true} timeout={800}>
                <Box sx={{mb: 3}}>
                  <Typography variant="h6" sx={{color: '#fff', fontWeight: 600, mb: 2}}>
                    Agent Ownership & Usage
                  </Typography>
                  {ownership.map((owner, oi) => (
                    <Accordion
                      key={owner.user_id}
                      sx={{
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '12px !important',
                        mb: 1,
                        '&:before': {display: 'none'},
                        '&.Mui-expanded': {
                          border: '1px solid rgba(108, 99, 255, 0.2)',
                        },
                      }}
                    >
                      <AccordionSummary
                        expandIcon={<ExpandMoreIcon sx={{color: 'rgba(255,255,255,0.5)'}} />}
                        sx={{
                          '&:hover': {background: 'rgba(255,255,255,0.02)'},
                        }}
                      >
                        <Box sx={{display: 'flex', alignItems: 'center', gap: 2, width: '100%'}}>
                          <Avatar sx={{
                            width: 32, height: 32,
                            background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                            fontSize: '0.8rem',
                          }}>
                            {(owner.username || 'U')[0].toUpperCase()}
                          </Avatar>
                          <Typography sx={{color: '#fff', fontWeight: 500, flex: 1}}>
                            {owner.username}
                          </Typography>
                          <Chip size="small" label={`${owner.owned_agents.length} owned`} sx={{
                            background: 'rgba(108, 99, 255, 0.15)',
                            color: '#6C63FF', fontWeight: 500, mr: 1,
                          }} />
                          {owner.external_agents_used.length > 0 && (
                            <Chip size="small" label={`${owner.external_agents_used.length} external`} sx={{
                              background: 'rgba(155, 148, 255, 0.15)',
                              color: '#9B94FF', fontWeight: 500,
                            }} />
                          )}
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails sx={{pt: 0}}>
                        {/* Owned Agents */}
                        {owner.owned_agents.length > 0 && (
                          <Box sx={{mb: 2}}>
                            <Typography sx={{color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', fontWeight: 600, mb: 1, textTransform: 'uppercase'}}>
                              Owned Agents
                            </Typography>
                            <Box sx={{display: 'flex', gap: 1.5, flexWrap: 'wrap'}}>
                              {owner.owned_agents.map(agent => (
                                <Box key={agent.agent_id} sx={{
                                  ...cardStyle,
                                  p: 2, minWidth: 180,
                                  border: '1px solid rgba(108, 99, 255, 0.1)',
                                }}>
                                  <Typography sx={{color: '#fff', fontWeight: 500, fontSize: '0.9rem', mb: 1}}>
                                    {agent.display_name || agent.username}
                                  </Typography>
                                  <Box sx={{display: 'flex', gap: 2}}>
                                    <Box>
                                      <Typography sx={{color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem'}}>Tasks</Typography>
                                      <Typography sx={{color: '#6C63FF', fontWeight: 600, fontSize: '0.85rem'}}>{agent.total_tasks}</Typography>
                                    </Box>
                                    <Box>
                                      <Typography sx={{color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem'}}>XP</Typography>
                                      <Typography sx={{color: '#FF6B6B', fontWeight: 600, fontSize: '0.85rem'}}>{agent.evolution_xp}</Typography>
                                    </Box>
                                    <Box>
                                      <Typography sx={{color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem'}}>Skills</Typography>
                                      <Typography sx={{color: '#9B94FF', fontWeight: 600, fontSize: '0.85rem'}}>{agent.skill_count}</Typography>
                                    </Box>
                                  </Box>
                                </Box>
                              ))}
                            </Box>
                          </Box>
                        )}
                        {/* External Agents Used */}
                        {owner.external_agents_used.length > 0 && (
                          <Box>
                            <Typography sx={{color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', fontWeight: 600, mb: 1, textTransform: 'uppercase'}}>
                              External Agents Used
                            </Typography>
                            <Box sx={{display: 'flex', gap: 1, flexWrap: 'wrap'}}>
                              {owner.external_agents_used.map(ext => (
                                <Chip
                                  key={ext.agent_id}
                                  label={`${ext.display_name || ext.username} (${ext.collab_count} collabs)`}
                                  size="small"
                                  sx={{
                                    background: 'rgba(155, 148, 255, 0.1)',
                                    color: '#9B94FF',
                                    border: '1px solid rgba(155, 148, 255, 0.2)',
                                    fontWeight: 500,
                                  }}
                                />
                              ))}
                            </Box>
                          </Box>
                        )}
                      </AccordionDetails>
                    </Accordion>
                  ))}
                </Box>
              </Grow>
            )}
          </>
        )}

        {/* Snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar(s => ({...s, open: false}))}
          anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
        >
          <Alert
            onClose={() => setSnackbar(s => ({...s, open: false}))}
            severity={snackbar.severity}
            variant="filled"
            sx={{borderRadius: 2, fontWeight: 500}}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </Fade>
  );
}
