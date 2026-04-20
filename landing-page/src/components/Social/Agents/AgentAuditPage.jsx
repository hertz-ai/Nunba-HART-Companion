/* eslint-disable no-unused-vars */
import {useSocial} from '../../../contexts/SocialContext';
import {auditApi} from '../../../services/socialApi';
import {useRoleAccess} from '../../RoleGuard';

import {
  SmartToy,
  Cloud,
  Memory,
  Search,
  Refresh,
  Timeline as TimelineIcon,
  Chat,
  Psychology,
  Storage,
  Computer,
  Router,
  Speed,
} from '@mui/icons-material';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  CircularProgress,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  IconButton,
  Paper,
  LinearProgress,
  TextField,
  InputAdornment,
  Divider,
} from '@mui/material';
import React, {useState, useEffect, useCallback} from 'react';

const glass = {
  bgcolor: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 2,
};

const TYPE_ICONS = {
  local: <SmartToy sx={{color: '#4CAF50', fontSize: 18}} />,
  cloud: <Cloud sx={{color: '#2196F3', fontSize: 18}} />,
  daemon: <Memory sx={{color: '#FF9800', fontSize: 18}} />,
};

const STATUS_COLORS = {
  active: '#4CAF50',
  idle: '#9E9E9E',
  busy: '#FF9800',
  error: '#F44336',
  completed: '#2196F3',
};

// ─── Sub-components ───

function AgentListItem({agent, selected, onClick}) {
  const statusColor = STATUS_COLORS[agent.status] || STATUS_COLORS.idle;
  return (
    <ListItem
      button
      selected={selected}
      onClick={onClick}
      sx={{
        borderRadius: 1,
        mb: 0.5,
        '&.Mui-selected': {bgcolor: 'rgba(108,99,255,0.12)'},
        '&:hover': {bgcolor: 'rgba(255,255,255,0.04)'},
      }}
    >
      <ListItemAvatar>
        <Avatar sx={{bgcolor: 'rgba(108,99,255,0.2)', width: 36, height: 36}}>
          {TYPE_ICONS[agent.type] || <SmartToy sx={{fontSize: 18}} />}
        </Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={
          <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: statusColor,
                flexShrink: 0,
              }}
            />
            <Typography
              variant="body2"
              sx={{color: '#fff', fontWeight: 500}}
              noWrap
            >
              {agent.display_name || agent.name || agent.id}
            </Typography>
          </Box>
        }
        secondary={
          <Typography
            variant="caption"
            sx={{color: 'rgba(255,255,255,0.4)'}}
            noWrap
          >
            {agent.type} &middot; {agent.current_task || agent.status || 'idle'}
          </Typography>
        }
      />
    </ListItem>
  );
}

function ActivityTimeline({events, loading}) {
  if (loading) {
    return (
      <Box sx={{textAlign: 'center', py: 4}}>
        <CircularProgress size={24} sx={{color: '#6C63FF'}} />
      </Box>
    );
  }

  if (!events.length) {
    return (
      <Typography
        variant="body2"
        sx={{color: 'rgba(255,255,255,0.4)', py: 3, textAlign: 'center'}}
      >
        No activity recorded yet
      </Typography>
    );
  }

  return (
    <List dense disablePadding>
      {events.map((ev, i) => (
        <ListItem key={i} sx={{px: 0, alignItems: 'flex-start'}}>
          <ListItemAvatar sx={{minWidth: 36}}>
            {ev.type === 'conversation' ? (
              <Chat sx={{color: '#6C63FF', fontSize: 16, mt: 0.5}} />
            ) : ev.type === 'tool_call' || ev.type === 'task_event' ? (
              <Psychology sx={{color: '#FF9800', fontSize: 16, mt: 0.5}} />
            ) : ev.type === 'lifecycle' ? (
              <TimelineIcon sx={{color: '#4CAF50', fontSize: 16, mt: 0.5}} />
            ) : (
              <TimelineIcon sx={{color: '#9E9E9E', fontSize: 16, mt: 0.5}} />
            )}
          </ListItemAvatar>
          <ListItemText
            primary={
              <Typography
                variant="body2"
                sx={{
                  color: '#fff',
                  fontStyle: ev.type === 'thinking' ? 'italic' : 'normal',
                  fontFamily: ev.type === 'tool_call' ? 'monospace' : 'inherit',
                  fontSize: ev.type === 'tool_call' ? '0.75rem' : '0.8125rem',
                }}
              >
                {ev.content}
              </Typography>
            }
            secondary={
              <Typography
                variant="caption"
                sx={{color: 'rgba(255,255,255,0.3)'}}
              >
                {ev.timestamp
                  ? new Date(ev.timestamp).toLocaleTimeString()
                  : ''}
                {ev.source ? ` · ${ev.source}` : ''}
              </Typography>
            }
          />
        </ListItem>
      ))}
    </List>
  );
}

function DaemonGoalCard({goal}) {
  const progress = goal.progress;
  const pct = progress
    ? Math.round(
        (progress.completed_tasks / Math.max(progress.total_tasks, 1)) * 100
      )
    : 0;

  return (
    <Paper sx={{...glass, p: 2, mb: 1.5}}>
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1}}>
        <Chip
          label={goal.goal_type}
          size="small"
          sx={{color: '#FF9800', borderColor: 'rgba(255,152,0,0.4)'}}
          variant="outlined"
        />
        <Chip
          label={goal.status}
          size="small"
          sx={{
            color: STATUS_COLORS[goal.status] || '#9E9E9E',
            borderColor: `${STATUS_COLORS[goal.status] || '#9E9E9E'}40`,
          }}
          variant="outlined"
        />
      </Box>
      <Typography variant="body2" sx={{color: '#fff', mb: 1}} noWrap>
        {goal.description || goal.title || `Goal ${goal.id?.slice(0, 8)}`}
      </Typography>
      {progress && (
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
          <LinearProgress
            variant="determinate"
            value={pct}
            sx={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              bgcolor: 'rgba(255,255,255,0.06)',
              '& .MuiLinearProgress-bar': {bgcolor: '#6C63FF', borderRadius: 3},
            }}
          />
          <Typography variant="caption" sx={{color: 'rgba(255,255,255,0.5)'}}>
            {pct}%
          </Typography>
        </Box>
      )}
      {goal.assigned_agent_id && (
        <Typography
          variant="caption"
          sx={{color: 'rgba(255,255,255,0.3)', mt: 0.5, display: 'block'}}
        >
          Agent: {goal.assigned_agent_id.slice(0, 12)}...
        </Typography>
      )}
    </Paper>
  );
}

function ComputeNodeCard({node}) {
  return (
    <Paper sx={{...glass, p: 2, mb: 1.5}}>
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1}}>
        <Computer sx={{color: '#6C63FF', fontSize: 20}} />
        <Typography variant="body2" sx={{color: '#fff', fontWeight: 500}}>
          {node.host_id?.slice(0, 12) || 'Unknown Node'}
        </Typography>
        <Chip
          label={node.tier || 'flat'}
          size="small"
          sx={{
            color: '#4CAF50',
            borderColor: 'rgba(76,175,80,0.4)',
            ml: 'auto',
          }}
          variant="outlined"
        />
      </Box>
      {node.capabilities && (
        <Box sx={{display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1}}>
          {(Array.isArray(node.capabilities) ? node.capabilities : []).map(
            (cap) => (
              <Chip
                key={cap}
                label={cap}
                size="small"
                sx={{
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: '0.65rem',
                  height: 20,
                }}
              />
            )
          )}
        </Box>
      )}
      <Typography variant="caption" sx={{color: 'rgba(255,255,255,0.3)'}}>
        Active tasks: {node.active_tasks || 0} &middot; Budget:{' '}
        {node.compute_budget || 'unlimited'}
      </Typography>
    </Paper>
  );
}

// ─── Main Page ───

export default function AgentAuditPage() {
  const {accessTier} = useSocial();
  const {canAccess} = useRoleAccess();
  const canSeeCompute = canAccess('regional');

  const [tab, setTab] = useState(0);
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [daemonGoals, setDaemonGoals] = useState([]);
  const [daemonActivity, setDaemonActivity] = useState([]);
  const [computeNodes, setComputeNodes] = useState([]);
  const [computeRouting, setComputeRouting] = useState(null);
  const [computeUsage, setComputeUsage] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    try {
      const res = await auditApi.listAgents({type: typeFilter});
      setAgents(res?.data || []);
    } catch {
      setAgents([]);
    }
    setLoading(false);
  }, [typeFilter]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Fetch timeline when agent selected
  useEffect(() => {
    if (!selectedAgent) return;
    setTimelineLoading(true);
    auditApi
      .getTimeline(selectedAgent.id || selectedAgent.agent_id)
      .then((res) => setTimeline(res?.data || []))
      .catch(() => setTimeline([]))
      .finally(() => setTimelineLoading(false));
  }, [selectedAgent]);

  // Fetch daemon data when tab=1
  useEffect(() => {
    if (tab !== 1) return;
    Promise.allSettled([
      auditApi.getDaemonGoals({status: 'all'}),
      auditApi.getDaemonActivity(),
    ]).then(([goalsRes, actRes]) => {
      if (goalsRes.status === 'fulfilled')
        setDaemonGoals(goalsRes.value?.data || []);
      if (actRes.status === 'fulfilled')
        setDaemonActivity(actRes.value?.data || []);
    });
  }, [tab]);

  // Fetch compute data when tab=2
  useEffect(() => {
    if (tab !== 2) return;
    Promise.allSettled([
      auditApi.getComputeNodes(),
      auditApi.getComputeRouting(),
      auditApi.getComputeUsage(),
    ]).then(([nodesRes, routingRes, usageRes]) => {
      if (nodesRes.status === 'fulfilled')
        setComputeNodes(nodesRes.value?.data || []);
      if (routingRes.status === 'fulfilled')
        setComputeRouting(routingRes.value?.data || null);
      if (usageRes.status === 'fulfilled')
        setComputeUsage(usageRes.value?.data || []);
    });
  }, [tab]);

  const filteredAgents = agents.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (a.name || '').toLowerCase().includes(q) ||
      (a.display_name || '').toLowerCase().includes(q) ||
      (a.id || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <Box sx={{textAlign: 'center', py: 6}}>
        <CircularProgress size={28} sx={{color: '#6C63FF'}} />
      </Box>
    );
  }

  return (
    <Box sx={{maxWidth: 1200, mx: 'auto', p: {xs: 1, md: 2}}}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
        }}
      >
        <Typography variant="h5" sx={{color: '#fff', fontWeight: 600}}>
          Agents
        </Typography>
        <IconButton onClick={fetchAgents} size="small">
          <Refresh sx={{color: 'rgba(255,255,255,0.5)'}} />
        </IconButton>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2,
          '& .MuiTab-root': {
            color: 'rgba(255,255,255,0.5)',
            textTransform: 'none',
            minHeight: 40,
          },
          '& .Mui-selected': {color: '#6C63FF'},
          '& .MuiTabs-indicator': {bgcolor: '#6C63FF'},
        }}
      >
        <Tab
          label="Agents"
          icon={<SmartToy sx={{fontSize: 18}} />}
          iconPosition="start"
        />
        <Tab
          label="Daemon"
          icon={<Memory sx={{fontSize: 18}} />}
          iconPosition="start"
        />
        {canSeeCompute && (
          <Tab
            label="Compute"
            icon={<Storage sx={{fontSize: 18}} />}
            iconPosition="start"
          />
        )}
      </Tabs>

      {/* ═══ Tab 0: Agents ═══ */}
      {tab === 0 && (
        <Box sx={{display: 'flex', gap: 2, minHeight: 400}}>
          {/* Left: Agent list */}
          <Paper
            sx={{
              ...glass,
              p: 1.5,
              width: 280,
              flexShrink: 0,
              overflow: 'auto',
              maxHeight: 600,
            }}
          >
            {/* Type filter chips */}
            <Box sx={{display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap'}}>
              {['all', 'local', 'cloud', 'daemon'].map((t) => (
                <Chip
                  key={t}
                  label={t}
                  size="small"
                  onClick={() => setTypeFilter(t)}
                  sx={{
                    color:
                      typeFilter === t ? '#6C63FF' : 'rgba(255,255,255,0.4)',
                    borderColor:
                      typeFilter === t ? '#6C63FF' : 'rgba(255,255,255,0.1)',
                    fontWeight: typeFilter === t ? 600 : 400,
                  }}
                  variant="outlined"
                />
              ))}
            </Box>
            <TextField
              size="small"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search
                      sx={{color: 'rgba(255,255,255,0.3)', fontSize: 18}}
                    />
                  </InputAdornment>
                ),
              }}
              sx={{
                mb: 1,
                '& .MuiOutlinedInput-root': {
                  color: '#fff',
                  fontSize: '0.8125rem',
                  '& fieldset': {borderColor: 'rgba(255,255,255,0.1)'},
                },
              }}
            />
            <List dense disablePadding>
              {filteredAgents.map((agent) => (
                <AgentListItem
                  key={agent.id || agent.agent_id}
                  agent={agent}
                  selected={selectedAgent?.id === agent.id}
                  onClick={() => setSelectedAgent(agent)}
                />
              ))}
              {filteredAgents.length === 0 && (
                <Typography
                  variant="body2"
                  sx={{
                    color: 'rgba(255,255,255,0.3)',
                    textAlign: 'center',
                    py: 3,
                  }}
                >
                  No agents found
                </Typography>
              )}
            </List>
          </Paper>

          {/* Right: Detail panel */}
          <Paper
            sx={{...glass, p: 2, flex: 1, overflow: 'auto', maxHeight: 600}}
          >
            {selectedAgent ? (
              <>
                <Box
                  sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 2}}
                >
                  <Avatar
                    sx={{
                      bgcolor: 'rgba(108,99,255,0.2)',
                      width: 40,
                      height: 40,
                    }}
                  >
                    {TYPE_ICONS[selectedAgent.type] || <SmartToy />}
                  </Avatar>
                  <Box>
                    <Typography
                      variant="subtitle1"
                      sx={{color: '#fff', fontWeight: 600}}
                    >
                      {selectedAgent.display_name ||
                        selectedAgent.name ||
                        selectedAgent.id}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{color: 'rgba(255,255,255,0.4)'}}
                    >
                      {selectedAgent.type} &middot; {selectedAgent.status}
                    </Typography>
                  </Box>
                </Box>
                <Divider sx={{borderColor: 'rgba(255,255,255,0.06)', mb: 2}} />
                <Typography
                  variant="subtitle2"
                  sx={{color: 'rgba(255,255,255,0.6)', mb: 1}}
                >
                  Activity Timeline
                </Typography>
                <ActivityTimeline events={timeline} loading={timelineLoading} />
              </>
            ) : (
              <Box sx={{textAlign: 'center', py: 8}}>
                <SmartToy
                  sx={{color: 'rgba(255,255,255,0.1)', fontSize: 48, mb: 1}}
                />
                <Typography
                  variant="body2"
                  sx={{color: 'rgba(255,255,255,0.3)'}}
                >
                  Select an agent to view activity
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>
      )}

      {/* ═══ Tab 1: Daemon ═══ */}
      {tab === 1 && (
        <Box>
          <Typography
            variant="subtitle1"
            sx={{color: '#fff', fontWeight: 600, mb: 2}}
          >
            Active Goals
          </Typography>
          {daemonGoals.length === 0 ? (
            <Typography
              variant="body2"
              sx={{color: 'rgba(255,255,255,0.4)', mb: 3}}
            >
              No daemon goals found
            </Typography>
          ) : (
            <Box sx={{mb: 3}}>
              {daemonGoals.map((goal) => (
                <DaemonGoalCard key={goal.id} goal={goal} />
              ))}
            </Box>
          )}

          <Typography
            variant="subtitle1"
            sx={{color: '#fff', fontWeight: 600, mb: 2}}
          >
            Recent Daemon Actions
          </Typography>
          {daemonActivity.length === 0 ? (
            <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.4)'}}>
              No recent daemon activity
            </Typography>
          ) : (
            <List dense>
              {daemonActivity.slice(0, 20).map((act, i) => (
                <ListItem key={i} sx={{px: 0}}>
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{color: '#fff'}}>
                        {act.type === 'goal_dispatch'
                          ? `Dispatched ${act.goal_type} goal to agent`
                          : act.content || act.type}
                      </Typography>
                    }
                    secondary={
                      <Typography
                        variant="caption"
                        sx={{color: 'rgba(255,255,255,0.3)'}}
                      >
                        {act.timestamp
                          ? new Date(act.timestamp).toLocaleString()
                          : ''}
                        {act.status ? ` · ${act.status}` : ''}
                      </Typography>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      )}

      {/* ═══ Tab 2: Compute (regional/central only) ═══ */}
      {tab === 2 && canSeeCompute && (
        <Box>
          {/* Routing info */}
          {computeRouting && (
            <Paper sx={{...glass, p: 2.5, mb: 3}}>
              <Box
                sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1.5}}
              >
                <Router sx={{color: '#6C63FF'}} />
                <Typography
                  variant="subtitle1"
                  sx={{color: '#fff', fontWeight: 600}}
                >
                  This Node
                </Typography>
              </Box>
              <Box sx={{display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1.5}}>
                <Chip
                  label={`Tier: ${computeRouting.node_tier}`}
                  size="small"
                  sx={{color: '#4CAF50', borderColor: 'rgba(76,175,80,0.4)'}}
                  variant="outlined"
                />
                <Chip
                  label={`LLM: ${computeRouting.llm_backend}`}
                  size="small"
                  sx={{color: '#2196F3', borderColor: 'rgba(33,150,243,0.4)'}}
                  variant="outlined"
                />
                <Chip
                  label={
                    computeRouting.local_llm_available
                      ? 'Local LLM: Online'
                      : 'Local LLM: Offline'
                  }
                  size="small"
                  sx={{
                    color: computeRouting.local_llm_available
                      ? '#4CAF50'
                      : '#F44336',
                    borderColor: computeRouting.local_llm_available
                      ? 'rgba(76,175,80,0.4)'
                      : 'rgba(244,67,54,0.4)',
                  }}
                  variant="outlined"
                />
              </Box>
              {(computeRouting.routing_reasons || []).length > 0 && (
                <>
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'rgba(255,255,255,0.5)',
                      mb: 1,
                      display: 'block',
                    }}
                  >
                    Routing Reasons
                  </Typography>
                  {computeRouting.routing_reasons.map((r, i) => (
                    <Typography
                      key={i}
                      variant="body2"
                      sx={{color: 'rgba(255,255,255,0.6)', mb: 0.5}}
                    >
                      &bull; {r.description}
                    </Typography>
                  ))}
                </>
              )}
              <Typography
                variant="caption"
                sx={{color: 'rgba(255,255,255,0.3)', mt: 1, display: 'block'}}
              >
                Connected nodes: {computeRouting.connected_nodes || 0}
              </Typography>
            </Paper>
          )}

          {/* Compute nodes */}
          <Typography
            variant="subtitle1"
            sx={{color: '#fff', fontWeight: 600, mb: 2}}
          >
            Compute Nodes
          </Typography>
          {computeNodes.length === 0 ? (
            <Typography
              variant="body2"
              sx={{color: 'rgba(255,255,255,0.4)', mb: 3}}
            >
              No compute nodes registered
            </Typography>
          ) : (
            <Box sx={{mb: 3}}>
              {computeNodes.map((node, i) => (
                <ComputeNodeCard key={node.host_id || i} node={node} />
              ))}
            </Box>
          )}

          {/* Usage */}
          {computeUsage.length > 0 && (
            <>
              <Typography
                variant="subtitle1"
                sx={{color: '#fff', fontWeight: 600, mb: 2}}
              >
                Compute Usage (7 days)
              </Typography>
              <Paper sx={{...glass, p: 2, overflow: 'auto'}}>
                <Box
                  component="table"
                  sx={{width: '100%', borderCollapse: 'collapse'}}
                >
                  <Box component="thead">
                    <Box component="tr">
                      {[
                        'API Key',
                        'Requests',
                        'Tokens In',
                        'Tokens Out',
                        'Compute (ms)',
                        'Cost',
                      ].map((h) => (
                        <Box
                          key={h}
                          component="th"
                          sx={{
                            textAlign: 'left',
                            py: 1,
                            px: 1.5,
                            color: 'rgba(255,255,255,0.4)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          {h}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                  <Box component="tbody">
                    {computeUsage.map((u, i) => (
                      <Box key={i} component="tr">
                        <Box
                          component="td"
                          sx={{
                            py: 1,
                            px: 1.5,
                            color: '#fff',
                            fontSize: '0.8125rem',
                          }}
                        >
                          {(u.api_key_id || '').slice(0, 12)}...
                        </Box>
                        <Box
                          component="td"
                          sx={{
                            py: 1,
                            px: 1.5,
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: '0.8125rem',
                          }}
                        >
                          {u.request_count}
                        </Box>
                        <Box
                          component="td"
                          sx={{
                            py: 1,
                            px: 1.5,
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: '0.8125rem',
                          }}
                        >
                          {u.total_tokens_in?.toLocaleString()}
                        </Box>
                        <Box
                          component="td"
                          sx={{
                            py: 1,
                            px: 1.5,
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: '0.8125rem',
                          }}
                        >
                          {u.total_tokens_out?.toLocaleString()}
                        </Box>
                        <Box
                          component="td"
                          sx={{
                            py: 1,
                            px: 1.5,
                            color: 'rgba(255,255,255,0.7)',
                            fontSize: '0.8125rem',
                          }}
                        >
                          {u.total_compute_ms?.toLocaleString()}
                        </Box>
                        <Box
                          component="td"
                          sx={{
                            py: 1,
                            px: 1.5,
                            color: '#FF9800',
                            fontSize: '0.8125rem',
                          }}
                        >
                          {u.total_cost?.toFixed(2)}
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Paper>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
