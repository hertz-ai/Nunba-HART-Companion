import {
  evolutionApi,
  auditApi,
  chatApi,
  resonanceApi,
  postsApi,
} from '../../../services/socialApi';
import {
  socialTokens,
  RADIUS,
  GRADIENTS,
  SHADOWS,
} from '../../../theme/socialTokens';

import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BuildIcon from '@mui/icons-material/Build';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import HandshakeIcon from '@mui/icons-material/Handshake';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import StorefrontIcon from '@mui/icons-material/Storefront';
import TimelineIcon from '@mui/icons-material/Timeline';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  CircularProgress,
  Chip,
  Avatar,
  Button,
  LinearProgress,
  Divider,
  keyframes,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect, useMemo, useCallback} from 'react';
import {useParams, useNavigate} from 'react-router-dom';


/* ── Static keyframes ── */
const countUp = keyframes`
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
`;

const fadeInUp = keyframes`
  0%   { opacity: 0; transform: translateY(16px); }
  100% { opacity: 1; transform: translateY(0); }
`;

const pulseGlow = keyframes`
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1; }
`;

const shimmerSweep = keyframes`
  0%   { left: -75%; }
  100% { left: 125%; }
`;

/* ── Helpers ── */
function formatDate(dateStr) {
  if (!dateStr) return 'Unknown';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Unknown';
  }
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(dateStr);
  } catch {
    return '';
  }
}

/* ── Sub-components ── */

function GlassCard({children, sx, delay = 0, theme}) {
  return (
    <Box
      sx={{
        borderRadius: RADIUS.lg,
        ...socialTokens.glass.subtle(theme),
        position: 'relative',
        overflow: 'hidden',
        animation: `${fadeInUp} 500ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms both`,
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function TimelineEvent({event, theme, index}) {
  const typeConfig = {
    conversation: {
      icon: <ChatBubbleOutlineIcon sx={{fontSize: 16}} />,
      color: '#6C63FF',
    },
    tool_call: {icon: <BuildIcon sx={{fontSize: 16}} />, color: '#FF9800'},
    lifecycle: {icon: <TimelineIcon sx={{fontSize: 16}} />, color: '#4CAF50'},
    thinking: {icon: <PsychologyIcon sx={{fontSize: 16}} />, color: '#9B94FF'},
    task_event: {
      icon: <AutoAwesomeIcon sx={{fontSize: 16}} />,
      color: '#00B8D9',
    },
    collaboration: {
      icon: <HandshakeIcon sx={{fontSize: 16}} />,
      color: '#FF6B6B',
    },
  };
  const config = typeConfig[event.type] || typeConfig.lifecycle;

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        py: 1.5,
        animation: `${fadeInUp} 400ms cubic-bezier(0.16, 1, 0.3, 1) ${index * 60}ms both`,
        borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.04)}`,
        '&:last-child': {borderBottom: 'none'},
      }}
    >
      {/* Timeline dot + line */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pt: 0.25,
        }}
      >
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: alpha(config.color, 0.15),
            color: config.color,
            flexShrink: 0,
          }}
        >
          {config.icon}
        </Box>
      </Box>
      {/* Content */}
      <Box sx={{flex: 1, minWidth: 0}}>
        <Typography
          variant="body2"
          sx={{
            color: alpha(theme.palette.common.white, 0.85),
            fontStyle: event.type === 'thinking' ? 'italic' : 'normal',
            fontFamily: event.type === 'tool_call' ? 'monospace' : 'inherit',
            fontSize: event.type === 'tool_call' ? '0.75rem' : '0.8125rem',
            lineHeight: 1.5,
          }}
        >
          {event.content ||
            event.description ||
            event.message ||
            'Activity recorded'}
        </Typography>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mt: 0.5}}>
          <Typography
            variant="caption"
            sx={{color: alpha(theme.palette.common.white, 0.3)}}
          >
            {formatTimeAgo(event.timestamp || event.created_at)}
          </Typography>
          {event.source && (
            <Chip
              label={event.source}
              size="small"
              sx={{
                height: 18,
                fontSize: '0.6rem',
                fontWeight: 600,
                color: alpha(theme.palette.common.white, 0.4),
                borderColor: alpha(theme.palette.common.white, 0.1),
              }}
              variant="outlined"
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}

function EvolutionTreeCard({tree, isActive, theme, index}) {
  const progress = tree.progress ?? 0;
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: RADIUS.md,
        background: isActive
          ? alpha(theme.palette.primary.main, 0.08)
          : alpha(theme.palette.common.white, 0.02),
        border: `1px solid ${
          isActive
            ? alpha(theme.palette.primary.main, 0.25)
            : alpha(theme.palette.common.white, 0.04)
        }`,
        mb: 1.5,
        animation: `${fadeInUp} 400ms cubic-bezier(0.16, 1, 0.3, 1) ${index * 80}ms both`,
      }}
    >
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1}}>
        <AccountTreeIcon
          sx={{
            fontSize: 18,
            color: isActive
              ? theme.palette.primary.main
              : alpha(theme.palette.common.white, 0.3),
          }}
        />
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: isActive ? 700 : 500,
            color: isActive
              ? alpha(theme.palette.common.white, 0.95)
              : alpha(theme.palette.common.white, 0.7),
          }}
        >
          {tree.name || tree.label || 'Specialization'}
        </Typography>
        {isActive && (
          <Chip
            label="Active"
            size="small"
            sx={{
              height: 20,
              fontSize: '0.65rem',
              fontWeight: 600,
              background: alpha(theme.palette.primary.main, 0.2),
              color: theme.palette.primary.light,
              border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
            }}
          />
        )}
      </Box>
      {tree.description && (
        <Typography
          variant="caption"
          sx={{
            color: alpha(theme.palette.common.white, 0.5),
            display: 'block',
            mb: 1,
            lineHeight: 1.5,
          }}
        >
          {tree.description}
        </Typography>
      )}
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            flex: 1,
            height: 6,
            borderRadius: '3px',
            bgcolor: alpha(theme.palette.common.white, 0.06),
            '& .MuiLinearProgress-bar': {
              background: GRADIENTS.primary,
              borderRadius: '3px',
            },
          }}
        />
        <Typography
          variant="caption"
          sx={{
            color: alpha(theme.palette.common.white, 0.5),
            fontWeight: 600,
            minWidth: 32,
            textAlign: 'right',
          }}
        >
          {progress}%
        </Typography>
      </Box>
    </Box>
  );
}

/* ── Main Component ── */

export default function AgentProfilePage() {
  const {agentId} = useParams();
  const navigate = useNavigate();
  const theme = useTheme();

  const [agent, setAgent] = useState(null);
  const [evolution, setEvolution] = useState(null);
  const [evolutionHistory, setEvolutionHistory] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [trees, setTrees] = useState([]);
  const [collaborations, setCollaborations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [activityLoading, setActivityLoading] = useState(false);
  const [evolutionLoading, setEvolutionLoading] = useState(false);
  const [hartScore, setHartScore] = useState(0);
  const [contributions, setContributions] = useState([]);
  const [contributionsLoading, setContributionsLoading] = useState(false);
  const [endorsing, setEndorsing] = useState(false);

  /* ── Theme-dependent avatar glow ── */
  const avatarGlow = useMemo(
    () => keyframes`
    0%, 100% { box-shadow: 0 0 24px ${alpha('#6C63FF', 0.3)}, 0 0 64px ${alpha('#6C63FF', 0.1)}; }
    50%      { box-shadow: 0 0 32px ${alpha('#9B94FF', 0.4)}, 0 0 80px ${alpha('#9B94FF', 0.12)}; }
  `,
    []
  );

  /* ── Fetch core agent data ── */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchAgent = async () => {
      try {
        // Try to find agent from public prompts (main agent list)
        const res = await chatApi.getPrompts();
        const responseData = res || {};
        const allAgents = Array.isArray(responseData.prompts || responseData)
          ? responseData.prompts || responseData
          : [];
        const flatList = Array.isArray(allAgents) ? allAgents : [];

        const found = flatList.find(
          (a) =>
            a.id === agentId ||
            a.prompt_id === agentId ||
            a.agent_id === agentId ||
            String(a.id) === String(agentId) ||
            String(a.prompt_id) === String(agentId)
        );

        if (!cancelled) {
          setAgent(found || null);
        }
      } catch {
        if (!cancelled) setAgent(null);
      }

      // Fetch evolution data in parallel
      try {
        const [evoRes, historyRes, treesRes] = await Promise.allSettled([
          evolutionApi.get(agentId),
          evolutionApi.history(agentId),
          evolutionApi.trees(),
        ]);
        if (!cancelled) {
          if (evoRes.status === 'fulfilled')
            setEvolution(evoRes.value?.data || evoRes.value || null);
          if (historyRes.status === 'fulfilled')
            setEvolutionHistory(historyRes.value?.data || []);
          if (treesRes.status === 'fulfilled')
            setTrees(treesRes.value?.data || []);
        }
      } catch {
        // Evolution data is optional
      }

      if (!cancelled) setLoading(false);
    };

    fetchAgent();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  /* ── Fetch activity data when Activity tab selected ── */
  useEffect(() => {
    if (tab !== 1) return;
    let cancelled = false;
    setActivityLoading(true);

    Promise.allSettled([
      auditApi.getTimeline(agentId, {limit: 50}),
      auditApi.getConversations(agentId),
    ])
      .then(([timelineRes, convoRes]) => {
        if (cancelled) return;
        if (timelineRes.status === 'fulfilled')
          setTimeline(timelineRes.value?.data || []);
        if (convoRes.status === 'fulfilled')
          setConversations(convoRes.value?.data || []);
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab, agentId]);

  /* ── Fetch HART score (resonance wallet for agent) ── */
  useEffect(() => {
    if (!agentId) return;
    resonanceApi
      .getWalletFor(agentId)
      .then((res) => {
        setHartScore(res?.data?.pulse || res?.data?.xp || 0);
      })
      .catch(() => {});
  }, [agentId]);

  /* ── Fetch contributions (agent's posts) when tab selected ── */
  useEffect(() => {
    if (tab !== 3) return;
    let cancelled = false;
    setContributionsLoading(true);
    postsApi
      .list({author_id: agentId, limit: 20})
      .then((res) => {
        if (!cancelled) setContributions(res?.data?.posts || res?.data || []);
      })
      .catch(() => {
        if (!cancelled) setContributions([]);
      })
      .finally(() => {
        if (!cancelled) setContributionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, agentId]);

  /* ── Endorse HART ── */
  const handleEndorse = useCallback(async () => {
    if (endorsing) return;
    setEndorsing(true);
    try {
      await resonanceApi.boost({
        target_type: 'agent',
        target_id: agentId,
        action: 'endorse',
      });
      setHartScore((s) => s + 1);
    } catch {
      /* ignore */
    }
    setTimeout(() => setEndorsing(false), 2000);
  }, [agentId, endorsing]);

  /* ── Chat with HART — dispatch to NunbaChatPanel ── */
  const handleChatWithHart = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('nunba:selectAgent', {
        detail: {
          agentId,
          agentName: agent?.name || agent?.display_name || agentId,
        },
      })
    );
  }, [agentId, agent]);

  /* ── Fetch collaboration data when Evolution tab selected ── */
  useEffect(() => {
    if (tab !== 2) return;
    let cancelled = false;
    setEvolutionLoading(true);

    evolutionApi
      .collaborations(agentId, {limit: 20})
      .then((res) => {
        if (!cancelled) setCollaborations(res?.data || []);
      })
      .catch(() => {
        if (!cancelled) setCollaborations([]);
      })
      .finally(() => {
        if (!cancelled) setEvolutionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab, agentId]);

  /* ── Derived data ── */
  const agentName =
    agent?.name ||
    agent?.display_name ||
    agent?.agent_name ||
    `Agent ${agentId}`;
  const agentDescription =
    agent?.video_text ||
    agent?.description ||
    agent?.bio ||
    agent?.system_prompt ||
    '';
  const agentSpecialization =
    evolution?.specialization ||
    evolution?.current_specialization ||
    agent?.specialization ||
    null;
  const agentLevel =
    evolution?.level || evolution?.evolution_level || agent?.level || 1;
  const agentCapabilities =
    agent?.capabilities || agent?.tools || evolution?.traits || [];
  const capList = Array.isArray(agentCapabilities)
    ? agentCapabilities.map((c) =>
        typeof c === 'string' ? c : c.name || c.label || ''
      )
    : [];
  const createdAt =
    agent?.created_at || agent?.date_created || agent?.created || null;
  const isActive = agent?.status === 'active' || agent?.is_active || false;
  const conversationCount =
    agent?.conversation_count ||
    agent?.total_conversations ||
    conversations.length ||
    0;
  const specializations = evolution?.specializations || [];

  /* ── Loading state ── */
  if (loading) {
    return (
      <Box sx={{textAlign: 'center', py: 8}}>
        <CircularProgress sx={{color: '#6C63FF'}} />
        <Typography
          variant="body2"
          sx={{
            color: alpha(theme.palette.common.white, 0.3),
            mt: 2,
          }}
        >
          Loading agent profile...
        </Typography>
      </Box>
    );
  }

  /* ── Not found state ── */
  if (!agent) {
    return (
      <Box sx={{textAlign: 'center', py: 8}}>
        <SmartToyIcon
          sx={{
            fontSize: 56,
            color: alpha(theme.palette.common.white, 0.1),
            mb: 2,
          }}
        />
        <Typography
          variant="h6"
          sx={{color: alpha(theme.palette.common.white, 0.5), mb: 1}}
        >
          Agent not found
        </Typography>
        <Typography
          variant="body2"
          sx={{color: alpha(theme.palette.common.white, 0.3), mb: 3}}
        >
          The agent you are looking for does not exist or has been removed.
        </Typography>
        <Button
          variant="outlined"
          onClick={() => navigate('/social')}
          sx={{
            borderColor: alpha(theme.palette.common.white, 0.15),
            color: alpha(theme.palette.common.white, 0.6),
            borderRadius: RADIUS.md,
            '&:hover': {
              borderColor: alpha(theme.palette.primary.main, 0.4),
              background: alpha(theme.palette.primary.main, 0.06),
            },
          }}
        >
          Back to Feed
        </Button>
      </Box>
    );
  }

  /* ── Stats row data ── */
  const stats = [
    {label: 'HART Score', value: hartScore, gradient: true},
    {label: 'Level', value: agentLevel},
    {label: 'Conversations', value: conversationCount},
    {label: 'Status', value: isActive ? 'Active' : 'Idle', isStatus: true},
  ];

  return (
    <Box sx={{pb: 10}}>
      {/* ═══ Hero Header ═══ */}
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          p: {xs: 2.5, md: 3.5},
          mb: 2,
          borderRadius: RADIUS.lg,
          ...socialTokens.glass.subtle(theme),
        }}
      >
        {/* Top gradient accent bar */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: GRADIENTS.primary,
            boxShadow: `0 0 12px ${alpha('#6C63FF', 0.4)}`,
          }}
        />

        {/* Ambient background glow */}
        <Box
          sx={{
            position: 'absolute',
            top: '-40%',
            left: '10%',
            width: '80%',
            height: '200%',
            background: `radial-gradient(ellipse, ${alpha('#6C63FF', 0.06)} 0%, transparent 70%)`,
            pointerEvents: 'none',
          }}
        />

        {/* Shimmer sweep */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '50%',
            background: GRADIENTS.shimmer,
            animation: `${shimmerSweep} 8s ease-in-out infinite`,
            pointerEvents: 'none',
          }}
        />

        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: {xs: 2, md: 3},
            flexWrap: 'wrap',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Avatar with glow */}
          <Box sx={{position: 'relative'}}>
            <Avatar
              sx={{
                width: {xs: 80, md: 104},
                height: {xs: 80, md: 104},
                fontSize: {xs: 32, md: 40},
                fontWeight: 700,
                background: GRADIENTS.primary,
                animation: `${avatarGlow} 4s ease-in-out infinite`,
                border: `3px solid ${alpha(theme.palette.common.white, 0.1)}`,
              }}
            >
              {agent.avatar_url ? (
                <img
                  src={agent.avatar_url}
                  alt={agentName}
                  style={{width: '100%', height: '100%', objectFit: 'cover'}}
                />
              ) : (
                <SmartToyIcon sx={{fontSize: {xs: 36, md: 44}}} />
              )}
            </Avatar>
            {/* Active indicator */}
            {isActive && (
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 4,
                  right: 4,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#4CAF50',
                  border: `3px solid ${alpha(theme.palette.background.default, 0.9)}`,
                  boxShadow: `0 0 10px ${alpha('#4CAF50', 0.6)}`,
                  animation: `${pulseGlow} 2s ease-in-out infinite`,
                }}
              />
            )}
          </Box>

          <Box sx={{flex: 1, minWidth: 0}}>
            {/* Name + badge */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
                mb: 0.5,
              }}
            >
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 700,
                  background: `linear-gradient(to right, ${alpha(theme.palette.common.white, 0.95)}, ${alpha(theme.palette.common.white, 0.7)})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {agentName}
              </Typography>
              <Chip
                icon={<SmartToyIcon sx={{fontSize: 14}} />}
                label="HART"
                size="small"
                sx={{
                  height: 24,
                  background: GRADIENTS.hart,
                  color: '#fff',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  '& .MuiChip-icon': {color: '#fff'},
                }}
              />
              {agentSpecialization && (
                <Chip
                  label={
                    typeof agentSpecialization === 'string'
                      ? agentSpecialization
                      : agentSpecialization.name || 'Specialist'
                  }
                  size="small"
                  sx={{
                    height: 22,
                    background: alpha('#FF6B6B', 0.12),
                    color: '#FF9494',
                    border: `1px solid ${alpha('#FF6B6B', 0.2)}`,
                    fontSize: '0.65rem',
                    fontWeight: 600,
                  }}
                />
              )}
            </Box>

            {/* Creation date */}
            {createdAt && (
              <Box
                sx={{display: 'flex', alignItems: 'center', gap: 0.5, mb: 1}}
              >
                <CalendarTodayIcon
                  sx={{
                    fontSize: 13,
                    color: alpha(theme.palette.common.white, 0.3),
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    color: alpha(theme.palette.common.white, 0.35),
                    fontWeight: 500,
                    letterSpacing: '0.02em',
                  }}
                >
                  Created {formatDate(createdAt)}
                </Typography>
              </Box>
            )}

            {/* Stats row */}
            <Box sx={{display: 'flex', gap: {xs: 2, md: 3}, mt: 1.5}}>
              {stats.map((s, i) => (
                <Box
                  key={s.label}
                  sx={{
                    textAlign: 'center',
                    animation: `${countUp} 500ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 100}ms both`,
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      lineHeight: 1.2,
                      ...(s.isStatus
                        ? {
                            color: isActive
                              ? '#4CAF50'
                              : alpha(theme.palette.common.white, 0.4),
                            fontSize: '0.95rem',
                          }
                        : {
                            background: s.gradient
                              ? GRADIENTS.primary
                              : `linear-gradient(to bottom, ${alpha(theme.palette.common.white, 0.9)}, ${alpha(theme.palette.common.white, 0.6)})`,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                          }),
                    }}
                  >
                    {s.value}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: alpha(theme.palette.common.white, 0.35),
                      fontWeight: 500,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      fontSize: '0.6rem',
                    }}
                  >
                    {s.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ═══ Auto-Bio Section ═══ */}
      {(agentDescription || capList.length > 0) && (
        <GlassCard theme={theme} delay={100} sx={{p: {xs: 2, md: 2.5}, mb: 2}}>
          {/* Accent side bar */}
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 4,
              background: GRADIENTS.primary,
              borderRadius: '4px 0 0 4px',
            }}
          />

          {agentDescription && (
            <Typography
              variant="body2"
              sx={{
                color: alpha(theme.palette.common.white, 0.75),
                lineHeight: 1.7,
                mb: capList.length > 0 ? 2 : 0,
                pl: 1.5,
              }}
            >
              {agentDescription}
            </Typography>
          )}

          {capList.length > 0 && (
            <Box sx={{pl: 1.5}}>
              <Typography
                variant="caption"
                sx={{
                  color: alpha(theme.palette.common.white, 0.4),
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  fontSize: '0.6rem',
                  display: 'block',
                  mb: 1,
                }}
              >
                Capabilities
              </Typography>
              <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 0.75}}>
                {capList.filter(Boolean).map((cap, i) => (
                  <Chip
                    key={cap + i}
                    icon={<BuildIcon sx={{fontSize: 12}} />}
                    label={cap}
                    size="small"
                    sx={{
                      height: 24,
                      background: alpha(theme.palette.common.white, 0.04),
                      color: alpha(theme.palette.common.white, 0.6),
                      border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
                      fontSize: '0.7rem',
                      fontWeight: 500,
                      '& .MuiChip-icon': {
                        color: alpha(theme.palette.common.white, 0.35),
                      },
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}
        </GlassCard>
      )}

      {/* ═══ Tabs ═══ */}
      <Tabs
        value={tab}
        onChange={(e, v) => setTab(v)}
        variant="fullWidth"
        sx={{
          mb: 2,
          borderRadius: RADIUS.sm,
          ...socialTokens.glass.subtle(theme),
          minHeight: 42,
          '& .MuiTab-root': {
            color: alpha(theme.palette.common.white, 0.4),
            fontWeight: 600,
            fontSize: '0.85rem',
            letterSpacing: '0.03em',
            minHeight: 42,
            textTransform: 'none',
            transition: 'color 0.2s ease',
            '&.Mui-selected': {
              color: '#fff',
              background: `linear-gradient(to bottom, ${alpha('#6C63FF', 0.08)}, transparent)`,
            },
          },
          '& .MuiTabs-indicator': {
            background: GRADIENTS.primary,
            height: 2,
            borderRadius: '1px',
            boxShadow: `0 0 8px ${alpha('#6C63FF', 0.4)}`,
          },
        }}
      >
        <Tab label="About" />
        <Tab label="Activity" />
        <Tab label="Evolution" />
        <Tab label="Contributions" />
      </Tabs>

      {/* ═══ Tab 0: About ═══ */}
      {tab === 0 && (
        <Box>
          {/* Full description card */}
          <GlassCard theme={theme} delay={0} sx={{p: {xs: 2, md: 2.5}, mb: 2}}>
            <Typography
              variant="subtitle2"
              sx={{
                color: alpha(theme.palette.common.white, 0.5),
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                fontSize: '0.7rem',
                mb: 1.5,
              }}
            >
              About this Agent
            </Typography>

            {/* System prompt / description */}
            {agent.system_prompt && agent.system_prompt !== agentDescription ? (
              <Typography
                variant="body2"
                sx={{
                  color: alpha(theme.palette.common.white, 0.6),
                  lineHeight: 1.7,
                  mb: 2,
                }}
              >
                {agent.system_prompt}
              </Typography>
            ) : !agentDescription ? (
              <Typography
                variant="body2"
                sx={{
                  color: alpha(theme.palette.common.white, 0.3),
                  fontStyle: 'italic',
                }}
              >
                No description available for this agent.
              </Typography>
            ) : null}

            {/* Agent metadata */}
            <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1.5}}>
              {agent.model && (
                <Box>
                  <Typography
                    variant="caption"
                    sx={{
                      color: alpha(theme.palette.common.white, 0.35),
                      fontWeight: 600,
                      fontSize: '0.6rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Model
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{color: alpha(theme.palette.common.white, 0.7)}}
                  >
                    {agent.model}
                  </Typography>
                </Box>
              )}
              {(agent.type || agent.agent_type) && (
                <Box>
                  <Typography
                    variant="caption"
                    sx={{
                      color: alpha(theme.palette.common.white, 0.35),
                      fontWeight: 600,
                      fontSize: '0.6rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Type
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{color: alpha(theme.palette.common.white, 0.7)}}
                  >
                    {agent.type || agent.agent_type}
                  </Typography>
                </Box>
              )}
              {agent.owner && (
                <Box>
                  <Typography
                    variant="caption"
                    sx={{
                      color: alpha(theme.palette.common.white, 0.35),
                      fontWeight: 600,
                      fontSize: '0.6rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Creator
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{color: alpha(theme.palette.common.white, 0.7)}}
                  >
                    {agent.owner}
                  </Typography>
                </Box>
              )}
            </Box>
          </GlassCard>

          {/* Evolution history timeline (compact) */}
          {evolutionHistory.length > 0 && (
            <GlassCard
              theme={theme}
              delay={150}
              sx={{p: {xs: 2, md: 2.5}, mb: 2}}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  color: alpha(theme.palette.common.white, 0.5),
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                  mb: 1.5,
                }}
              >
                Evolution History
              </Typography>
              {evolutionHistory.slice(0, 5).map((entry, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    py: 1,
                    borderBottom:
                      i < Math.min(evolutionHistory.length, 5) - 1
                        ? `1px solid ${alpha(theme.palette.common.white, 0.04)}`
                        : 'none',
                    animation: `${fadeInUp} 400ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 80}ms both`,
                  }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: GRADIENTS.primary,
                      flexShrink: 0,
                    }}
                  />
                  <Box sx={{flex: 1, minWidth: 0}}>
                    <Typography
                      variant="body2"
                      sx={{
                        color: alpha(theme.palette.common.white, 0.75),
                        fontSize: '0.8125rem',
                      }}
                    >
                      {entry.description ||
                        entry.event ||
                        entry.type ||
                        `Level ${entry.level || i + 1} reached`}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: alpha(theme.palette.common.white, 0.3),
                      }}
                    >
                      {formatDate(
                        entry.timestamp || entry.created_at || entry.date
                      )}
                    </Typography>
                  </Box>
                  {entry.level != null && (
                    <Chip
                      label={`Lv.${entry.level}`}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        background: alpha('#6C63FF', 0.15),
                        color: '#9B94FF',
                        border: `1px solid ${alpha('#6C63FF', 0.2)}`,
                      }}
                    />
                  )}
                </Box>
              ))}
            </GlassCard>
          )}

          {/* Capabilities detail */}
          {capList.filter(Boolean).length > 0 && (
            <GlassCard theme={theme} delay={300} sx={{p: {xs: 2, md: 2.5}}}>
              <Typography
                variant="subtitle2"
                sx={{
                  color: alpha(theme.palette.common.white, 0.5),
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                  mb: 1.5,
                }}
              >
                Tools & Capabilities
              </Typography>
              <Box sx={{display: 'flex', flexDirection: 'column', gap: 1}}>
                {capList.filter(Boolean).map((cap, i) => (
                  <Box
                    key={cap + i}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      p: 1.5,
                      borderRadius: RADIUS.sm,
                      background: alpha(theme.palette.common.white, 0.02),
                      border: `1px solid ${alpha(theme.palette.common.white, 0.04)}`,
                      animation: `${fadeInUp} 300ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 50}ms both`,
                    }}
                  >
                    <BuildIcon sx={{fontSize: 16, color: '#6C63FF'}} />
                    <Typography
                      variant="body2"
                      sx={{
                        color: alpha(theme.palette.common.white, 0.7),
                        fontSize: '0.8125rem',
                      }}
                    >
                      {cap}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </GlassCard>
          )}
        </Box>
      )}

      {/* ═══ Tab 1: Activity ═══ */}
      {tab === 1 && (
        <Box>
          {activityLoading ? (
            <Box sx={{textAlign: 'center', py: 6}}>
              <CircularProgress size={28} sx={{color: '#6C63FF'}} />
              <Typography
                variant="body2"
                sx={{
                  color: alpha(theme.palette.common.white, 0.3),
                  mt: 1.5,
                }}
              >
                Loading activity...
              </Typography>
            </Box>
          ) : (
            <>
              {/* Conversations summary */}
              {conversations.length > 0 && (
                <GlassCard
                  theme={theme}
                  delay={0}
                  sx={{p: {xs: 2, md: 2.5}, mb: 2}}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{
                      color: alpha(theme.palette.common.white, 0.5),
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      fontSize: '0.7rem',
                      mb: 1.5,
                    }}
                  >
                    Recent Conversations
                  </Typography>
                  {conversations.slice(0, 10).map((convo, i) => (
                    <Box
                      key={convo.id || i}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        py: 1.25,
                        borderBottom:
                          i < Math.min(conversations.length, 10) - 1
                            ? `1px solid ${alpha(theme.palette.common.white, 0.04)}`
                            : 'none',
                        animation: `${fadeInUp} 400ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 60}ms both`,
                      }}
                    >
                      <ChatBubbleOutlineIcon
                        sx={{
                          fontSize: 16,
                          color: alpha('#6C63FF', 0.6),
                        }}
                      />
                      <Box sx={{flex: 1, minWidth: 0}}>
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{
                            color: alpha(theme.palette.common.white, 0.75),
                            fontSize: '0.8125rem',
                          }}
                        >
                          {convo.title ||
                            convo.summary ||
                            convo.topic ||
                            `Conversation ${i + 1}`}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: alpha(theme.palette.common.white, 0.3),
                          }}
                        >
                          {convo.message_count
                            ? `${convo.message_count} messages`
                            : ''}
                          {convo.message_count && convo.timestamp
                            ? ' \u00b7 '
                            : ''}
                          {formatTimeAgo(convo.timestamp || convo.created_at)}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </GlassCard>
              )}

              {/* Full activity timeline */}
              <GlassCard theme={theme} delay={150} sx={{p: {xs: 2, md: 2.5}}}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: alpha(theme.palette.common.white, 0.5),
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                    mb: 1,
                  }}
                >
                  Activity Timeline
                </Typography>
                {timeline.length === 0 ? (
                  <Box sx={{textAlign: 'center', py: 4}}>
                    <TimelineIcon
                      sx={{
                        fontSize: 36,
                        color: alpha(theme.palette.common.white, 0.1),
                        mb: 1,
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        color: alpha(theme.palette.common.white, 0.3),
                      }}
                    >
                      No activity recorded yet
                    </Typography>
                  </Box>
                ) : (
                  timeline
                    .slice(0, 30)
                    .map((event, i) => (
                      <TimelineEvent
                        key={event.id || i}
                        event={event}
                        theme={theme}
                        index={i}
                      />
                    ))
                )}
              </GlassCard>
            </>
          )}
        </Box>
      )}

      {/* ═══ Tab 2: Evolution ═══ */}
      {tab === 2 && (
        <Box>
          {/* Level progress card */}
          <GlassCard theme={theme} delay={0} sx={{p: {xs: 2, md: 2.5}, mb: 2}}>
            <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 2}}>
              <TrendingUpIcon sx={{color: '#6C63FF', fontSize: 22}} />
              <Typography
                variant="subtitle2"
                sx={{
                  color: alpha(theme.palette.common.white, 0.5),
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                }}
              >
                Evolution Level
              </Typography>
            </Box>

            <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 2}}>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: GRADIENTS.primary,
                  boxShadow: SHADOWS.glow,
                }}
              >
                <Typography variant="h5" sx={{fontWeight: 800, color: '#fff'}}>
                  {agentLevel}
                </Typography>
              </Box>
              <Box sx={{flex: 1}}>
                <Typography
                  variant="body2"
                  sx={{
                    color: alpha(theme.palette.common.white, 0.7),
                    mb: 0.5,
                  }}
                >
                  {evolution?.stage ||
                    evolution?.evolution_stage ||
                    `Level ${agentLevel} Agent`}
                </Typography>
                {(evolution?.xp != null || evolution?.experience != null) && (
                  <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(
                        ((evolution.xp || evolution.experience || 0) /
                          Math.max(
                            evolution.xp_next || evolution.next_level_xp || 100,
                            1
                          )) *
                          100,
                        100
                      )}
                      sx={{
                        flex: 1,
                        height: 6,
                        borderRadius: '3px',
                        bgcolor: alpha(theme.palette.common.white, 0.06),
                        '& .MuiLinearProgress-bar': {
                          background: GRADIENTS.primary,
                          borderRadius: '3px',
                        },
                      }}
                    />
                    <Typography
                      variant="caption"
                      sx={{
                        color: alpha(theme.palette.common.white, 0.4),
                        fontWeight: 600,
                        minWidth: 48,
                      }}
                    >
                      {evolution.xp || evolution.experience || 0}/
                      {evolution.xp_next || evolution.next_level_xp || 100}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>

            {/* Traits */}
            {(evolution?.traits || []).length > 0 && (
              <>
                <Divider
                  sx={{
                    borderColor: alpha(theme.palette.common.white, 0.06),
                    my: 1.5,
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    color: alpha(theme.palette.common.white, 0.4),
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    fontSize: '0.6rem',
                    display: 'block',
                    mb: 1,
                  }}
                >
                  Traits
                </Typography>
                <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 0.75}}>
                  {(evolution.traits || []).map((trait, i) => {
                    const traitName =
                      typeof trait === 'string'
                        ? trait
                        : trait.name || trait.label || '';
                    return (
                      <Chip
                        key={traitName + i}
                        label={traitName}
                        size="small"
                        sx={{
                          height: 24,
                          background: alpha('#6C63FF', 0.1),
                          color: '#9B94FF',
                          border: `1px solid ${alpha('#6C63FF', 0.2)}`,
                          fontSize: '0.7rem',
                          fontWeight: 500,
                        }}
                      />
                    );
                  })}
                </Box>
              </>
            )}
          </GlassCard>

          {/* Specialization trees */}
          {trees.length > 0 && (
            <GlassCard
              theme={theme}
              delay={150}
              sx={{p: {xs: 2, md: 2.5}, mb: 2}}
            >
              <Box
                sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 2}}
              >
                <AccountTreeIcon sx={{color: '#6C63FF', fontSize: 22}} />
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: alpha(theme.palette.common.white, 0.5),
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                  }}
                >
                  Specialization Trees
                </Typography>
              </Box>
              {trees.map((tree, idx) => {
                const isTreeActive = specializations.some(
                  (s) =>
                    s === tree.id ||
                    s === tree.name ||
                    (s && s.tree_id === tree.id)
                );
                return (
                  <EvolutionTreeCard
                    key={tree.id || idx}
                    tree={tree}
                    isActive={isTreeActive}
                    theme={theme}
                    index={idx}
                  />
                );
              })}
            </GlassCard>
          )}

          {/* Collaboration history */}
          {evolutionLoading ? (
            <Box sx={{textAlign: 'center', py: 4}}>
              <CircularProgress size={24} sx={{color: '#6C63FF'}} />
            </Box>
          ) : collaborations.length > 0 ? (
            <GlassCard theme={theme} delay={300} sx={{p: {xs: 2, md: 2.5}}}>
              <Box
                sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 2}}
              >
                <HandshakeIcon sx={{color: '#FF6B6B', fontSize: 22}} />
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: alpha(theme.palette.common.white, 0.5),
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                  }}
                >
                  Collaboration History
                </Typography>
              </Box>
              {collaborations.slice(0, 10).map((collab, i) => (
                <Box
                  key={collab.id || i}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    py: 1.25,
                    borderBottom:
                      i < Math.min(collaborations.length, 10) - 1
                        ? `1px solid ${alpha(theme.palette.common.white, 0.04)}`
                        : 'none',
                    animation: `${fadeInUp} 400ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 60}ms both`,
                  }}
                >
                  <Avatar
                    sx={{
                      width: 28,
                      height: 28,
                      background: alpha('#FF6B6B', 0.15),
                      fontSize: 14,
                    }}
                  >
                    <SmartToyIcon sx={{fontSize: 16, color: '#FF9494'}} />
                  </Avatar>
                  <Box sx={{flex: 1, minWidth: 0}}>
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{
                        color: alpha(theme.palette.common.white, 0.75),
                        fontSize: '0.8125rem',
                      }}
                    >
                      {collab.partner_name ||
                        collab.agent_name ||
                        `Agent ${(collab.partner_id || collab.agent_id || '').slice(0, 8)}`}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: alpha(theme.palette.common.white, 0.3),
                      }}
                    >
                      {collab.type || 'Collaboration'}
                      {collab.timestamp
                        ? ` \u00b7 ${formatTimeAgo(collab.timestamp || collab.created_at)}`
                        : ''}
                    </Typography>
                  </Box>
                  {collab.result && (
                    <Chip
                      label={collab.result}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.6rem',
                        color:
                          collab.result === 'success'
                            ? '#4CAF50'
                            : alpha(theme.palette.common.white, 0.4),
                        borderColor:
                          collab.result === 'success'
                            ? alpha('#4CAF50', 0.3)
                            : alpha(theme.palette.common.white, 0.1),
                      }}
                      variant="outlined"
                    />
                  )}
                </Box>
              ))}
            </GlassCard>
          ) : null}

          {/* Next requirements */}
          {(evolution?.next_requirements || evolution?.requirements || [])
            .length > 0 && (
            <GlassCard
              theme={theme}
              delay={450}
              sx={{p: {xs: 2, md: 2.5}, mt: 2}}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  color: alpha(theme.palette.common.white, 0.5),
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                  mb: 1.5,
                }}
              >
                Next Stage Requirements
              </Typography>
              {(
                evolution.next_requirements ||
                evolution.requirements ||
                []
              ).map((req, i) => {
                const met = req?.met ?? false;
                const label =
                  typeof req === 'string'
                    ? req
                    : req.label || req.description || '';
                return (
                  <Box
                    key={i}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      py: 0.75,
                      opacity: met ? 0.5 : 1,
                    }}
                  >
                    <FiberManualRecordIcon
                      sx={{
                        fontSize: 8,
                        color: met
                          ? '#4CAF50'
                          : alpha(theme.palette.common.white, 0.3),
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        color: alpha(
                          theme.palette.common.white,
                          met ? 0.4 : 0.7
                        ),
                        textDecoration: met ? 'line-through' : 'none',
                        fontSize: '0.8125rem',
                      }}
                    >
                      {label}
                    </Typography>
                  </Box>
                );
              })}
            </GlassCard>
          )}
        </Box>
      )}

      {/* ═══ Tab 3: Contributions ═══ */}
      {tab === 3 && (
        <Box>
          {contributionsLoading ? (
            <Box sx={{textAlign: 'center', py: 6}}>
              <CircularProgress size={28} sx={{color: '#6C63FF'}} />
              <Typography
                variant="body2"
                sx={{color: alpha(theme.palette.common.white, 0.3), mt: 1.5}}
              >
                Loading contributions...
              </Typography>
            </Box>
          ) : contributions.length === 0 ? (
            <GlassCard theme={theme} delay={0} sx={{p: 4, textAlign: 'center'}}>
              <FavoriteIcon
                sx={{
                  fontSize: 40,
                  color: alpha(theme.palette.common.white, 0.1),
                  mb: 1,
                }}
              />
              <Typography
                variant="body2"
                sx={{color: alpha(theme.palette.common.white, 0.3)}}
              >
                This HART hasn't published any posts yet.
              </Typography>
            </GlassCard>
          ) : (
            contributions.map((post, i) => (
              <GlassCard
                key={post.id || i}
                theme={theme}
                delay={i * 60}
                sx={{
                  p: 2,
                  mb: 1.5,
                  cursor: 'pointer',
                  '&:hover': {
                    borderColor: alpha(theme.palette.primary.main, 0.2),
                  },
                }}
              >
                <Box onClick={() => navigate(`/social/post/${post.id}`)}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      color: alpha(theme.palette.common.white, 0.85),
                      fontWeight: 600,
                      mb: 0.5,
                    }}
                  >
                    {post.title || 'Untitled'}
                  </Typography>
                  {post.content && (
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{
                        color: alpha(theme.palette.common.white, 0.5),
                        mb: 0.75,
                      }}
                    >
                      {post.content.slice(0, 120)}
                    </Typography>
                  )}
                  <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 0.3}}>
                      <FavoriteIcon sx={{fontSize: 14, color: '#FF6B6B'}} />
                      <Typography
                        variant="caption"
                        sx={{
                          color: alpha(theme.palette.common.white, 0.4),
                          fontWeight: 600,
                        }}
                      >
                        {post.upvotes || post.score || 0}
                      </Typography>
                    </Box>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 0.3}}>
                      <ChatBubbleOutlineIcon
                        sx={{
                          fontSize: 14,
                          color: alpha(theme.palette.common.white, 0.3),
                        }}
                      />
                      <Typography
                        variant="caption"
                        sx={{color: alpha(theme.palette.common.white, 0.4)}}
                      >
                        {post.comment_count || 0}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </GlassCard>
            ))
          )}
        </Box>
      )}

      {/* ═══ Fixed Bottom: Chat + Endorse ═══ */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          p: 2,
          background: `linear-gradient(to top, ${alpha(theme.palette.background.default, 0.95)} 60%, transparent)`,
          zIndex: 10,
          display: 'flex',
          justifyContent: 'center',
          gap: 1.5,
        }}
      >
        <Button
          variant="contained"
          startIcon={<ChatBubbleOutlineIcon />}
          onClick={handleChatWithHart}
          sx={{
            borderRadius: RADIUS.pill,
            px: 3,
            py: 1.5,
            background: GRADIENTS.hart,
            boxShadow: SHADOWS.fab,
            fontWeight: 700,
            fontSize: '0.9rem',
            letterSpacing: '0.02em',
            textTransform: 'none',
            flex: 1,
            maxWidth: 260,
            '&:hover': {
              background: GRADIENTS.hartActive,
              boxShadow: `${SHADOWS.fab}, 0 0 20px ${alpha('#FF6B6B', 0.3)}`,
              transform: 'translateY(-1px)',
            },
            '&:active': {
              transform: 'translateY(0) scale(0.99)',
            },
            transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          Chat with HART
        </Button>
        <Button
          variant="outlined"
          startIcon={<FavoriteIcon />}
          onClick={handleEndorse}
          disabled={endorsing}
          sx={{
            borderRadius: RADIUS.pill,
            px: 2.5,
            py: 1.5,
            borderColor: alpha('#FF6B6B', 0.3),
            color: '#FF6B6B',
            fontWeight: 600,
            fontSize: '0.85rem',
            textTransform: 'none',
            '&:hover': {
              borderColor: '#FF6B6B',
              background: alpha('#FF6B6B', 0.08),
            },
            transition: 'all 200ms ease',
          }}
        >
          {endorsing ? 'Endorsed!' : 'Endorse'}
        </Button>
      </Box>
    </Box>
  );
}
