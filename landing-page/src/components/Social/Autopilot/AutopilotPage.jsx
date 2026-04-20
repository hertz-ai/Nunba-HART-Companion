import {
  getAutopilotConfig,
  saveAutopilotConfig,
  detectPatterns,
  getTimeSuggestions,
  getDailyContent,
  ACTION_ROUTES,
  dispatchAgent,
} from './autopilotStore';

import {
  GRADIENTS,
  EASINGS,
  RADIUS,
  SHADOWS,
  socialTokens,
} from '../../../theme/socialTokens';

import ArticleIcon from '@mui/icons-material/Article';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import GroupIcon from '@mui/icons-material/Group';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import PaletteIcon from '@mui/icons-material/Palette';
import SchoolIcon from '@mui/icons-material/School';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import TimelineIcon from '@mui/icons-material/Timeline';
import TuneIcon from '@mui/icons-material/Tune';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Box,
  Typography,
  Switch,
  Chip,
  Paper,
  IconButton,
  Fade,
  keyframes,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect, useMemo} from 'react';
import {useNavigate} from 'react-router-dom';


/* ── Keyframes ── */
const shimmer = keyframes`
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
`;

const fadeSlideUp = keyframes`
  0%   { opacity: 0; transform: translateY(16px); }
  100% { opacity: 1; transform: translateY(0); }
`;

const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 20px rgba(108,99,255,0.15); }
  50%      { box-shadow: 0 0 32px rgba(108,99,255,0.3); }
`;

/* ── Interest options ── */
const INTEREST_OPTIONS = [
  'Technology',
  'Health',
  'Education',
  'Environment',
  'Community',
  'Creativity',
];

/* ── Agent config for UI ── */
const AGENT_OPTIONS = [
  {
    key: 'games',
    label: 'Games Agent',
    desc: 'Suggest games based on your activity',
    icon: <SportsEsportsIcon sx={{fontSize: 18}} />,
  },
  {
    key: 'learning',
    label: 'Learning Agent',
    desc: 'Track learning progress and suggest content',
    icon: <SchoolIcon sx={{fontSize: 18}} />,
  },
  {
    key: 'content',
    label: 'Content Agent',
    desc: 'Curate feed based on your interests',
    icon: <ArticleIcon sx={{fontSize: 18}} />,
  },
  {
    key: 'wellness',
    label: 'Wellness Agent',
    desc: 'Break reminders and health nudges',
    icon: <FavoriteBorderIcon sx={{fontSize: 18}} />,
  },
  {
    key: 'social',
    label: 'Social Agent',
    desc: 'Community engagement prompts',
    icon: <GroupIcon sx={{fontSize: 18}} />,
  },
  {
    key: 'creative',
    label: 'Creative Agent',
    desc: 'Creative challenges and prompts',
    icon: <PaletteIcon sx={{fontSize: 18}} />,
  },
];

const AGENT_MODE_OPTIONS = [
  {
    key: 'suggest',
    label: 'Suggest',
    desc: 'Agents suggest actions, you decide',
  },
  {key: 'auto', label: 'Auto', desc: 'Agents act and chain automatically'},
  {key: 'off', label: 'Off', desc: 'No agent activity'},
];

/* ── Glass card helper ── */
function GlassCard({children, sx = {}, delay = 0, ...props}) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        ...socialTokens.glass.surface(theme),
        borderRadius: RADIUS.lg,
        p: 2.5,
        animation: `${fadeSlideUp} 0.5s ${EASINGS.decelerate} ${delay}ms both`,
        transition: `transform 0.25s ${EASINGS.smooth}, box-shadow 0.25s ${EASINGS.smooth}`,
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: SHADOWS.cardHover,
        },
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
}

export default function AutopilotPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [config, setConfig] = useState(getAutopilotConfig);
  const patterns = useMemo(() => detectPatterns(), []);
  const timeSuggestions = useMemo(() => getTimeSuggestions(), []);
  const dailyContent = useMemo(() => getDailyContent(), []);

  // Persist config changes
  useEffect(() => {
    saveAutopilotConfig(config);
  }, [config]);

  const toggleFeature = (key) => {
    setConfig((prev) => {
      const next = {...prev, [key]: !prev[key]};
      // Sync observer consent to localStorage for useAgentObserver privacy gate
      if (key === 'agentObservation') {
        if (next.agentObservation) {
          localStorage.setItem('observer_consent', 'true');
        } else {
          localStorage.removeItem('observer_consent');
        }
      }
      return next;
    });
  };

  const toggleAgentEnabled = (agentKey) => {
    setConfig((prev) => {
      const agents = {...(prev.agents || {})};
      agents[agentKey] = !agents[agentKey];
      return {...prev, agents};
    });
  };

  const setAgentMode = (mode) => {
    setConfig((prev) => ({...prev, agentMode: mode}));
  };

  const toggleInterest = (interest) => {
    const lower = interest.toLowerCase();
    setConfig((prev) => {
      const interests = prev.interests || [];
      const next = interests.includes(lower)
        ? interests.filter((i) => i !== lower)
        : [...interests, lower];
      return {...prev, interests: next};
    });
  };

  const handleSuggestionClick = (action) => {
    const route = ACTION_ROUTES[action];
    if (route) navigate(route);
  };

  const handlePatternEnable = (pattern) => {
    if (pattern.dispatchAgent) {
      // Enable the agent and dispatch it
      if (!config.agents?.[pattern.dispatchAgent]) {
        toggleAgentEnabled(pattern.dispatchAgent);
      }
      dispatchAgent(
        pattern.dispatchAgent,
        'suggest_from_pattern',
        {
          patternType: pattern.type,
          action: pattern.action,
        },
        {chain: true}
      );
    } else if (pattern.action) {
      // Navigate to the relevant action route
      const route = ACTION_ROUTES[pattern.action];
      if (route) navigate(route);
    }
    // Enable relevant automation based on pattern type
    if (pattern.type === 'peak_activity' && !config.smartReminders) {
      toggleFeature('smartReminders');
    } else if (pattern.type === 'repeated_search' && !config.contentCuration) {
      toggleFeature('contentCuration');
    } else if (pattern.type === 'daily_routine' && !config.smartReminders) {
      toggleFeature('smartReminders');
    } else if (pattern.type === 'game_affinity' && !config.gameSuggestions) {
      toggleFeature('gameSuggestions');
    }
  };

  /* ── Automation toggles config ── */
  const automations = [
    {
      key: 'dailyDigest',
      label: 'Daily Digest',
      desc: 'Morning news and content summary',
      icon: '\u{1F4F0}',
    },
    {
      key: 'smartReminders',
      label: 'Smart Reminders',
      desc: 'Time-based activity suggestions',
      icon: '\u{23F0}',
    },
    {
      key: 'healthNudges',
      label: 'Health Nudges',
      desc: 'Break reminders and activity tracking',
      icon: '\u{1F49A}',
    },
    {
      key: 'contentCuration',
      label: 'Content Curation',
      desc: 'Interest-based feed filtering',
      icon: '\u{2728}',
    },
    {
      key: 'gameSuggestions',
      label: 'Game Suggestions',
      desc: 'Game recommendations based on activity',
      icon: '\u{1F3AE}',
    },
    {
      key: 'agentObservation',
      label: 'Agent Learning',
      desc: 'Let Nunba observe your usage to improve suggestions (privacy-safe)',
      icon: '\u{1F9E0}',
    },
  ];

  return (
    <Box sx={{pb: 4}}>
      {/* ── Header ── */}
      <Box
        sx={{
          position: 'relative',
          borderRadius: RADIUS.xl,
          overflow: 'hidden',
          mb: 3,
          p: {xs: 3, sm: 4},
          background: GRADIENTS.primary,
          animation: `${pulseGlow} 4s ease-in-out infinite`,
        }}
      >
        {/* Shimmer overlay */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(90deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%)',
            backgroundSize: '200% 100%',
            animation: `${shimmer} 3s linear infinite`,
            pointerEvents: 'none',
          }}
        />
        <Box sx={{position: 'relative', zIndex: 1}}>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 1}}>
            <AutoModeIcon sx={{fontSize: 32, color: '#fff'}} />
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                color: '#fff',
                letterSpacing: '-0.02em',
                fontSize: {xs: '1.5rem', sm: '2rem'},
              }}
            >
              Nunba Autopilot
            </Typography>
          </Box>
          <Typography
            sx={{
              color: 'rgba(255,255,255,0.85)',
              fontSize: '0.95rem',
              fontWeight: 500,
              maxWidth: 420,
            }}
          >
            Your intelligent life assistant. Nunba learns your patterns and
            helps you stay on track.
          </Typography>
        </Box>
      </Box>

      {/* ── Your Day Timeline ── */}
      <Box sx={{mb: 3}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1.5}}>
          <TimelineIcon
            sx={{fontSize: 20, color: theme.palette.primary.main}}
          />
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              fontSize: '1rem',
              color: theme.palette.text.primary,
            }}
          >
            Your Day
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            position: 'relative',
            pl: 3,
          }}
        >
          {/* Vertical timeline line */}
          <Box
            sx={{
              position: 'absolute',
              left: 10,
              top: 8,
              bottom: 8,
              width: 2,
              background: `linear-gradient(180deg, ${theme.palette.primary.main}, ${alpha(theme.palette.primary.main, 0.15)})`,
              borderRadius: '1px',
            }}
          />

          {timeSuggestions.map((suggestion, idx) => (
            <GlassCard
              key={idx}
              delay={idx * 100}
              sx={{
                cursor: 'pointer',
                position: 'relative',
                p: 2,
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  left: -21,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: GRADIENTS.primary,
                  boxShadow: `0 0 8px ${theme.palette.primary.main}60`,
                },
              }}
              onClick={() => handleSuggestionClick(suggestion.action)}
            >
              <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
                <Typography sx={{fontSize: '1.4rem', lineHeight: 1}}>
                  {suggestion.icon}
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.88rem',
                    fontWeight: 500,
                    color: theme.palette.text.primary,
                    flex: 1,
                  }}
                >
                  {suggestion.text}
                </Typography>
              </Box>
            </GlassCard>
          ))}
        </Box>
      </Box>

      {/* ── Nunba Noticed (Patterns) ── */}
      {patterns.length > 0 && (
        <Box sx={{mb: 3}}>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1.5}}>
            <VisibilityIcon sx={{fontSize: 20, color: '#FF6B6B'}} />
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontSize: '1rem',
                color: theme.palette.text.primary,
              }}
            >
              Nunba Noticed
            </Typography>
          </Box>

          <Box sx={{display: 'flex', flexDirection: 'column', gap: 1.5}}>
            {patterns.map((pattern, idx) => (
              <GlassCard
                key={idx}
                delay={200 + idx * 100}
                sx={{position: 'relative', overflow: 'hidden'}}
              >
                {/* Accent bar */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    borderRadius: '3px 0 0 3px',
                    background: GRADIENTS.accent,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    color: theme.palette.text.primary,
                    mb: 0.5,
                  }}
                >
                  {pattern.message}
                </Typography>
                {pattern.suggestion && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      mt: 1,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: '0.8rem',
                        color: theme.palette.text.secondary,
                        fontStyle: 'italic',
                        flex: 1,
                      }}
                    >
                      {pattern.suggestion}
                    </Typography>
                    <Chip
                      label="Enable"
                      size="small"
                      onClick={() => handlePatternEnable(pattern)}
                      sx={{
                        ml: 1.5,
                        fontWeight: 600,
                        fontSize: '0.72rem',
                        background: GRADIENTS.primary,
                        color: '#fff',
                        borderRadius: RADIUS.pill,
                        cursor: 'pointer',
                        transition: `transform 0.15s ${EASINGS.smooth}`,
                        '&:hover': {transform: 'scale(1.05)'},
                      }}
                    />
                  </Box>
                )}
              </GlassCard>
            ))}
          </Box>
        </Box>
      )}

      {/* ── Active Automations ── */}
      <Box sx={{mb: 3}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1.5}}>
          <TuneIcon sx={{fontSize: 20, color: '#2ECC71'}} />
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              fontSize: '1rem',
              color: theme.palette.text.primary,
            }}
          >
            Active Automations
          </Typography>
        </Box>

        <GlassCard delay={300} sx={{p: 0, overflow: 'hidden'}}>
          {automations.map((auto, idx) => (
            <Box
              key={auto.key}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                px: 2.5,
                py: 2,
                borderBottom:
                  idx < automations.length - 1
                    ? `1px solid ${alpha(theme.palette.divider, 0.5)}`
                    : 'none',
                transition: `background 0.2s ${EASINGS.smooth}`,
                '&:hover': {
                  background: alpha(theme.palette.common.white, 0.02),
                },
              }}
            >
              <Typography sx={{fontSize: '1.3rem', lineHeight: 1}}>
                {auto.icon}
              </Typography>
              <Box sx={{flex: 1, minWidth: 0}}>
                <Typography
                  sx={{
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    color: theme.palette.text.primary,
                  }}
                >
                  {auto.label}
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.75rem',
                    color: theme.palette.text.secondary,
                  }}
                >
                  {auto.desc}
                </Typography>
              </Box>
              <Switch
                checked={!!config[auto.key]}
                onChange={() => toggleFeature(auto.key)}
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': {
                    color: '#6C63FF',
                  },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: '#6C63FF',
                  },
                }}
              />
            </Box>
          ))}
        </GlassCard>
      </Box>

      {/* ── Your Interests ── */}
      <Box sx={{mb: 3}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1.5}}>
          <LightbulbIcon sx={{fontSize: 20, color: '#FFAB00'}} />
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              fontSize: '1rem',
              color: theme.palette.text.primary,
            }}
          >
            Your Interests
          </Typography>
        </Box>

        <GlassCard delay={400}>
          <Typography
            sx={{
              fontSize: '0.8rem',
              color: theme.palette.text.secondary,
              mb: 1.5,
            }}
          >
            Select topics to personalize your content and suggestions.
          </Typography>
          <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 1}}>
            {INTEREST_OPTIONS.map((interest) => {
              const isActive = (config.interests || []).includes(
                interest.toLowerCase()
              );
              return (
                <Chip
                  key={interest}
                  label={interest}
                  onClick={() => toggleInterest(interest)}
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    borderRadius: RADIUS.pill,
                    cursor: 'pointer',
                    background: isActive ? GRADIENTS.primary : 'transparent',
                    color: isActive ? '#fff' : theme.palette.text.secondary,
                    border: isActive
                      ? 'none'
                      : `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                    transition: `all 0.2s ${EASINGS.smooth}`,
                    '&:hover': {
                      transform: 'scale(1.05)',
                      boxShadow: isActive ? SHADOWS.glow : 'none',
                    },
                  }}
                />
              );
            })}
          </Box>
        </GlassCard>
      </Box>

      {/* ── Daily Insight ── */}
      <Box sx={{mb: 3}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1.5}}>
          <CheckCircleOutlineIcon
            sx={{fontSize: 20, color: theme.palette.primary.main}}
          />
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              fontSize: '1rem',
              color: theme.palette.text.primary,
            }}
          >
            Daily Insight
          </Typography>
        </Box>

        <GlassCard
          delay={500}
          sx={{
            position: 'relative',
            overflow: 'hidden',
            animation: `${fadeSlideUp} 0.5s ${EASINGS.decelerate} 500ms both, ${pulseGlow} 6s ease-in-out 1s infinite`,
          }}
        >
          {/* Gradient accent top */}
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              background: GRADIENTS.brand,
            }}
          />
          <Box sx={{display: 'flex', alignItems: 'flex-start', gap: 2}}>
            <Typography sx={{fontSize: '2rem', lineHeight: 1}}>
              {dailyContent.emoji}
            </Typography>
            <Box sx={{flex: 1, minWidth: 0}}>
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  color: theme.palette.text.primary,
                  mb: 0.5,
                }}
              >
                {dailyContent.title}
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.85rem',
                  color: theme.palette.text.secondary,
                  lineHeight: 1.6,
                }}
              >
                {dailyContent.content}
              </Typography>
            </Box>
          </Box>
        </GlassCard>
      </Box>

      {/* ── Agent Orchestration ── */}
      <Box sx={{mb: 3}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1.5}}>
          <SmartToyIcon sx={{fontSize: 20, color: '#7C4DFF'}} />
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              fontSize: '1rem',
              color: theme.palette.text.primary,
            }}
          >
            Agent Orchestration
          </Typography>
        </Box>

        {/* Agent mode selector */}
        <GlassCard delay={600} sx={{mb: 1.5}}>
          <Typography
            sx={{
              fontSize: '0.8rem',
              color: theme.palette.text.secondary,
              mb: 1.5,
            }}
          >
            How should agents interact with you?
          </Typography>
          <Box sx={{display: 'flex', gap: 1}}>
            {AGENT_MODE_OPTIONS.map((mode) => (
              <Chip
                key={mode.key}
                label={mode.label}
                size="small"
                onClick={() => setAgentMode(mode.key)}
                sx={{
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  background:
                    config.agentMode === mode.key
                      ? GRADIENTS.primary
                      : 'transparent',
                  color:
                    config.agentMode === mode.key
                      ? '#fff'
                      : theme.palette.text.secondary,
                  border:
                    config.agentMode === mode.key
                      ? 'none'
                      : `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                  borderRadius: RADIUS.pill,
                  cursor: 'pointer',
                  transition: `all 0.2s ${EASINGS.smooth}`,
                  '&:hover': {transform: 'scale(1.05)'},
                }}
              />
            ))}
          </Box>
          {config.agentMode === 'auto' && (
            <Typography
              sx={{
                fontSize: '0.72rem',
                color: '#FFAB00',
                mt: 1,
                fontStyle: 'italic',
              }}
            >
              Auto mode: agents will chain to each other (games -&gt; learning
              -&gt; content)
            </Typography>
          )}
        </GlassCard>

        {/* Per-agent toggles */}
        <GlassCard delay={700} sx={{p: 0, overflow: 'hidden'}}>
          {AGENT_OPTIONS.map((agent, idx) => (
            <Box
              key={agent.key}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                px: 2.5,
                py: 1.5,
                borderBottom:
                  idx < AGENT_OPTIONS.length - 1
                    ? `1px solid ${alpha(theme.palette.divider, 0.5)}`
                    : 'none',
                transition: `background 0.2s ${EASINGS.smooth}`,
                opacity: config.agentMode === 'off' ? 0.4 : 1,
                '&:hover': {
                  background: alpha(theme.palette.common.white, 0.02),
                },
              }}
            >
              <Box sx={{color: theme.palette.primary.main}}>{agent.icon}</Box>
              <Box sx={{flex: 1, minWidth: 0}}>
                <Typography
                  sx={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: theme.palette.text.primary,
                  }}
                >
                  {agent.label}
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.72rem',
                    color: theme.palette.text.secondary,
                  }}
                >
                  {agent.desc}
                </Typography>
              </Box>
              <Switch
                checked={!!(config.agents || {})[agent.key]}
                onChange={() => toggleAgentEnabled(agent.key)}
                disabled={config.agentMode === 'off'}
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': {color: '#7C4DFF'},
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: '#7C4DFF',
                  },
                }}
              />
            </Box>
          ))}
        </GlassCard>
      </Box>
    </Box>
  );
}
