/**
 * NunbaChatPanel - Expanded chat interface.
 *
 * Desktop (md+): Fixed 400x520 panel, bottom-right.
 * Mobile (xs):   SwipeableDrawer anchor="bottom", 70vh.
 *
 * Wires to existing chatApi.chat() — does NOT load Demopage.
 * Agents get diverse seeded avatars. "Create your HART" welcome CTA.
 */

import {
  Box,
  Typography,
  IconButton,
  Chip,
  TextField,
  SwipeableDrawer,
  Grow,
  Fade,
  keyframes,
  useTheme,
  useMediaQuery,
  Tooltip,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useRef, useEffect, useCallback} from 'react';
import {useNavigate} from 'react-router-dom';

// Ported from Hevolve.ai ConversationHistoryPanel.js
function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
}
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RateReviewIcon from '@mui/icons-material/RateReview';
import SmartToyIcon from '@mui/icons-material/SmartToy';

import {useNunbaChat, getAgentPalette} from './NunbaChatProvider';

import {
  GRADIENTS,
  EASINGS,
  RADIUS,
  SHADOWS,
  socialTokens,
} from '../../../../theme/socialTokens';

/* ── Keyframes ── */
const panelEnter = keyframes`
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

const dotPulse = keyframes`
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1.2); }
`;

const checkPop = keyframes`
  0% { opacity: 0; transform: scale(0.5); }
  60% { opacity: 1; transform: scale(1.15); }
  100% { opacity: 1; transform: scale(1); }
`;

const shimmerSlide = keyframes`
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
`;

const spinnerRotate = keyframes`
  to { transform: rotate(360deg); }
`;

/* ── Typewriter for assistant responses ── */
function TypewriterText({text, onComplete}) {
  const [displayed, setDisplayed] = useState('');
  const idx = useRef(0);

  useEffect(() => {
    idx.current = 0;
    setDisplayed('');
    const timer = setInterval(() => {
      idx.current++;
      if (idx.current >= text.length) {
        setDisplayed(text);
        clearInterval(timer);
        onComplete?.();
      } else {
        setDisplayed(text.slice(0, idx.current));
      }
    }, 18);
    return () => clearInterval(timer);
  }, [text, onComplete]);

  return <>{displayed}</>;
}

/* ── Thinking dots ── */
function ThinkingDots() {
  return (
    <Box
      sx={{display: 'flex', alignItems: 'center', gap: 0.75, py: 0.75, px: 0.5}}
    >
      <Box sx={{display: 'flex', gap: '4px'}}>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6C63FF, #9B94FF)',
              animation: `${dotPulse} 1.2s ease-in-out infinite`,
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </Box>
      <Typography
        variant="caption"
        sx={{
          fontSize: '0.62rem',
          color: 'text.secondary',
          letterSpacing: '0.03em',
        }}
      >
        Thinking
      </Typography>
    </Box>
  );
}

/* ── Agent chip with diverse avatar ── */
function AgentChip({agent, isActive, onClick}) {
  const theme = useTheme();
  const palette = getAgentPalette(
    agent?.name || agent?.prompt_id?.toString() || 'default'
  );
  const initial = (agent?.name || 'A')[0].toUpperCase();

  return (
    <Chip
      label={agent?.name || `Agent ${agent?.prompt_id}`}
      size="small"
      onClick={onClick}
      avatar={
        <Box
          sx={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: palette.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.6rem',
            fontWeight: 700,
            color: palette.accent,
          }}
        >
          {initial}
        </Box>
      }
      sx={{
        flexShrink: 0,
        fontWeight: 600,
        fontSize: '0.72rem',
        background: isActive
          ? alpha(palette.bg, 0.15)
          : alpha(theme.palette.common.white, 0.04),
        color: isActive ? palette.accent : theme.palette.text.secondary,
        border: `1px solid ${isActive ? alpha(palette.bg, 0.3) : 'transparent'}`,
        borderRadius: RADIUS.pill,
        transition: `all 150ms ${EASINGS.smooth}`,
        '&:hover': {
          background: alpha(palette.bg, 0.12),
          color: palette.accent,
        },
      }}
    />
  );
}

/* ── Welcome empty state ── */
function WelcomeState({onStart}) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        p: 3,
        textAlign: 'center',
      }}
    >
      {/* Nunba emblem */}
      <Box
        sx={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: GRADIENTS.primary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 30px ${alpha(theme.palette.primary.main, 0.4)}`,
        }}
      >
        <AutoAwesomeIcon sx={{fontSize: 28, color: '#fff'}} />
      </Box>

      <Typography
        variant="h6"
        sx={{
          fontWeight: 800,
          background: GRADIENTS.brand,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Create your HART
      </Typography>

      <Typography
        variant="body2"
        sx={{
          color: theme.palette.text.secondary,
          lineHeight: 1.6,
          maxWidth: 260,
        }}
      >
        Nunba is your guardian angel &mdash; here to help you explore, learn,
        and build positive change.
      </Typography>

      {/* Security trust indicator — tap for full privacy disclosure */}
      <Tooltip
        arrow
        enterTouchDelay={0}
        leaveTouchDelay={5000}
        title={
          <Box
            sx={{p: 0.5, maxWidth: 260, fontSize: '0.72rem', lineHeight: 1.5}}
          >
            <strong>How Nunba handles your data:</strong>
            <Box component="ul" sx={{m: 0, pl: 2, mt: 0.5}}>
              <li>Conversations improve your AI locally on this device</li>
              <li>No single entity owns or controls the intelligence</li>
              <li>
                You decide what is shared &mdash; with everything, not just
                everyone
              </li>
              <li>End-to-end encrypted, local-first architecture</li>
            </Box>
            <Box sx={{mt: 0.5, opacity: 0.8, fontStyle: 'italic'}}>
              Per HARTOS constitutional rules: privacy first, humans always in
              control.
            </Box>
          </Box>
        }
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            mt: 0.5,
            opacity: 0.65,
            cursor: 'pointer',
          }}
        >
          <Box
            component="span"
            sx={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #2ECC71, #A8E6CF)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.55rem',
              color: '#fff',
              fontWeight: 900,
            }}
          >
            {'\u2713'}
          </Box>
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.65rem',
              color: theme.palette.text.secondary,
              letterSpacing: '0.01em',
            }}
          >
            End-to-end encrypted &middot; Learns locally, no central control
          </Typography>
        </Box>
      </Tooltip>

      <Box
        component="button"
        onClick={onStart}
        sx={{
          mt: 1,
          px: 3,
          py: 1,
          background: GRADIENTS.primary,
          border: 'none',
          borderRadius: RADIUS.pill,
          color: '#fff',
          fontWeight: 700,
          fontSize: '0.85rem',
          cursor: 'pointer',
          boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.4)}`,
          transition: `all 200ms ${EASINGS.smooth}`,
          '&:hover': {
            transform: 'scale(1.05)',
            boxShadow: `0 6px 24px ${alpha(theme.palette.primary.main, 0.5)}`,
          },
          '&:active': {transform: 'scale(0.97)'},
        }}
      >
        Start a conversation
      </Box>
    </Box>
  );
}

/* ── HITL inline card — surfaces when agent_status is blocked/approval ── */
function HITLInlineCard({agentStatus, postId}) {
  const theme = useTheme();
  const navigate = useNavigate();
  const needsReview =
    agentStatus &&
    (agentStatus.toLowerCase().includes('blocked') ||
      agentStatus.toLowerCase().includes('approval'));

  if (!needsReview) return null;

  return (
    <Box
      sx={{
        mx: 1,
        my: 0.5,
        p: 1.5,
        borderRadius: RADIUS.md,
        background: alpha(theme.palette.warning.main, 0.08),
        border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <RateReviewIcon sx={{color: theme.palette.warning.main, fontSize: 20}} />
      <Box sx={{flex: 1}}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            display: 'block',
            color: theme.palette.warning.main,
          }}
        >
          Agent needs your review
        </Typography>
        <Typography
          variant="caption"
          sx={{color: theme.palette.text.secondary}}
        >
          An architectural decision requires human approval
        </Typography>
      </Box>
      <Box
        component="button"
        onClick={() => {
          navigate(
            postId ? `/social/tracker?highlight=${postId}` : '/social/tracker'
          );
        }}
        sx={{
          px: 1.5,
          py: 0.5,
          background: alpha(theme.palette.warning.main, 0.15),
          border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
          borderRadius: RADIUS.pill,
          color: theme.palette.warning.main,
          fontWeight: 700,
          fontSize: '0.72rem',
          cursor: 'pointer',
          '&:hover': {background: alpha(theme.palette.warning.main, 0.25)},
        }}
      >
        Review
      </Box>
    </Box>
  );
}

/* ── Main panel content (shared between desktop & mobile) ── */
function PanelContent() {
  const theme = useTheme();
  const {
    setIsExpanded,
    messages,
    isLoading,
    isTyping,
    currentAgent,
    availableAgents,
    sendMessage,
    switchAgent,
    clearMessages,
    retryMessage,
    deleteMessage,
    ttsEnabled,
    setTtsEnabled,
  } = useNunbaChat();

  const [input, setInput] = useState('');
  const [latestIdx, setLatestIdx] = useState(-1);
  const [mentionQuery, setMentionQuery] = useState(null); // null = no @mention active
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    setLatestIdx(messages.length - 1);
  }, [messages.length, isTyping]);

  // @mention detection in input
  const handleInputChange = useCallback((e) => {
    const val = e.target.value;
    setInput(val);
    // Check if user is typing an @mention
    const cursorPos = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\S*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1].toLowerCase());
    } else {
      setMentionQuery(null);
    }
  }, []);

  const mentionSuggestions =
    mentionQuery !== null
      ? availableAgents
          .filter((a) => {
            const name = (a.name || '').toLowerCase();
            return name.includes(mentionQuery);
          })
          .slice(0, 5)
      : [];

  const insertMention = useCallback(
    (agent) => {
      const cursorPos = inputRef.current?.selectionStart || input.length;
      const textBefore = input.slice(0, cursorPos);
      const textAfter = input.slice(cursorPos);
      const atIdx = textBefore.lastIndexOf('@');
      const newText =
        textBefore.slice(0, atIdx) +
        `@${(agent.name || agent.prompt_id).replace(/\s+/g, '.')} ` +
        textAfter;
      setInput(newText);
      setMentionQuery(null);
      inputRef.current?.focus();
    },
    [input]
  );

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
    setMentionQuery(null);
    inputRef.current?.focus();
  }, [input, sendMessage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape' && mentionQuery !== null) {
      setMentionQuery(null);
    }
  };

  const agentName = currentAgent?.name || 'Nunba';
  const agentPalette = getAgentPalette(agentName);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: theme.palette.background.default,
      }}
    >
      {/* ── Header ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2.5,
          py: 1.5,
          borderBottom: `1px solid ${theme.palette.divider}`,
          ...socialTokens.glass.subtle(theme),
          flexShrink: 0,
          borderRadius: `${RADIUS.lg} ${RADIUS.lg} 0 0`,
        }}
      >
        {/* Agent avatar */}
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: currentAgent ? agentPalette.bg : GRADIENTS.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '0.8rem',
            color: currentAgent ? agentPalette.accent : '#fff',
            flexShrink: 0,
          }}
        >
          {agentName[0].toUpperCase()}
        </Box>

        <Box sx={{flex: 1, minWidth: 0}}>
          <Typography
            variant="body2"
            sx={{fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.2}}
          >
            {agentName}
          </Typography>
          <Typography
            variant="caption"
            sx={{color: theme.palette.text.secondary, fontSize: '0.68rem'}}
          >
            Your guardian angel
          </Typography>
        </Box>

        {/* TTS toggle */}
        <IconButton
          size="small"
          onClick={() => setTtsEnabled(!ttsEnabled)}
          sx={{
            color: ttsEnabled
              ? theme.palette.primary.main
              : theme.palette.text.secondary,
          }}
          aria-label={ttsEnabled ? 'Disable voice' : 'Enable voice'}
        >
          {ttsEnabled ? (
            <VolumeUpIcon sx={{fontSize: 18}} />
          ) : (
            <VolumeOffIcon sx={{fontSize: 18}} />
          )}
        </IconButton>

        {/* Clear */}
        <IconButton
          size="small"
          onClick={clearMessages}
          sx={{color: theme.palette.text.secondary}}
          aria-label="Clear messages"
        >
          <DeleteOutlineIcon sx={{fontSize: 18}} />
        </IconButton>

        {/* Close */}
        <IconButton
          size="small"
          onClick={() => setIsExpanded(false)}
          sx={{color: theme.palette.text.secondary}}
          aria-label="Close chat"
        >
          <CloseIcon sx={{fontSize: 18}} />
        </IconButton>
      </Box>

      {/* ── Agent chips ── */}
      {availableAgents.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            gap: 0.75,
            px: 2,
            py: 1,
            overflowX: 'auto',
            flexShrink: 0,
            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
            '&::-webkit-scrollbar': {display: 'none'},
            scrollbarWidth: 'none',
          }}
        >
          <Chip
            label="Nunba"
            size="small"
            onClick={() => switchAgent(null)}
            sx={{
              flexShrink: 0,
              fontWeight: 700,
              fontSize: '0.72rem',
              background: !currentAgent
                ? GRADIENTS.primary
                : alpha(theme.palette.common.white, 0.04),
              color: !currentAgent ? '#fff' : theme.palette.text.secondary,
              borderRadius: RADIUS.pill,
            }}
          />
          {availableAgents.map((agent) => (
            <AgentChip
              key={agent.prompt_id}
              agent={agent}
              isActive={currentAgent?.prompt_id === agent.prompt_id}
              onClick={() => switchAgent(agent)}
            />
          ))}
        </Box>
      )}

      {/* ── Messages ── */}
      {messages.length === 0 && !isLoading ? (
        <WelcomeState onStart={() => inputRef.current?.focus()} />
      ) : (
        <Box
          ref={scrollRef}
          sx={{
            flex: 1,
            overflowY: 'auto',
            px: 2,
            py: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            '&::-webkit-scrollbar': {width: 4},
            '&::-webkit-scrollbar-thumb': {
              bgcolor: alpha(theme.palette.common.white, 0.08),
              borderRadius: 2,
            },
          }}
        >
          {messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            const isLatestAssistant = !isUser && i === latestIdx;

            return (
              <Fade in key={`${msg.ts}-${i}`} timeout={200}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <Box
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderRadius: isUser
                        ? '14px 14px 4px 14px'
                        : '14px 14px 14px 4px',
                      background: isUser
                        ? GRADIENTS.primary
                        : msg.error
                          ? alpha(theme.palette.error.main, 0.1)
                          : alpha(theme.palette.common.white, 0.05),
                      border: isUser
                        ? 'none'
                        : `1px solid ${alpha(theme.palette.common.white, 0.06)}`,
                      color: isUser
                        ? '#fff'
                        : msg.error
                          ? theme.palette.error.light
                          : theme.palette.text.primary,
                    }}
                  >
                    {/* Agent name badge for multi-HART responses */}
                    {!isUser && msg.agentName && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          mb: 0.5,
                        }}
                      >
                        <SmartToyIcon
                          sx={{
                            fontSize: 12,
                            color: getAgentPalette(msg.agentName).accent,
                          }}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            color: getAgentPalette(msg.agentName).accent,
                          }}
                        >
                          {msg.agentName}
                        </Typography>
                      </Box>
                    )}
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: '0.82rem',
                        lineHeight: 1.55,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {isLatestAssistant && !msg.error ? (
                        <TypewriterText text={msg.text} />
                      ) : (
                        msg.text
                      )}
                    </Typography>

                    {/* Timestamp — same format as Hevolve.ai chat */}
                    {msg.ts && (
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          fontSize: '0.6rem',
                          color: isUser
                            ? 'rgba(255,255,255,0.5)'
                            : alpha(theme.palette.text.secondary, 0.5),
                          mt: 0.3,
                          textAlign: isUser ? 'right' : 'left',
                        }}
                      >
                        {formatTimestamp(msg.ts)}
                      </Typography>
                    )}

                    {isUser && msg.status === 'sent' && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          mt: 0.5,
                        }}
                      >
                        <Box
                          component="svg"
                          viewBox="0 0 14 14"
                          sx={{
                            width: 12,
                            height: 12,
                            color: '#2ECC71',
                            animation: `${checkPop} 0.35s ease-out`,
                          }}
                        >
                          <path
                            d="M2 7.5L5.5 11L12 3"
                            stroke="currentColor"
                            strokeWidth="2"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </Box>
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.58rem',
                            color: alpha('#2ECC71', 0.7),
                          }}
                        >
                          Delivered
                        </Typography>
                      </Box>
                    )}
                    {isUser && msg.status === 'retrying' && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.75,
                          mt: 0.75,
                          px: 1,
                          py: 0.5,
                          borderRadius: '8px',
                          background: alpha(theme.palette.warning.main, 0.08),
                          border: `1px solid ${alpha(theme.palette.warning.main, 0.15)}`,
                        }}
                      >
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            border: `2px solid ${theme.palette.warning.main}`,
                            borderTopColor: 'transparent',
                            animation: `${spinnerRotate} 0.8s linear infinite`,
                            flexShrink: 0,
                          }}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.62rem',
                            color: theme.palette.warning.light,
                            flex: 1,
                          }}
                        >
                          {msg.error}
                        </Typography>
                        <Box
                          component="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMessage(msg.messageId);
                          }}
                          sx={{
                            ml: 'auto',
                            background: 'none',
                            border: 'none',
                            color: alpha('#fff', 0.45),
                            cursor: 'pointer',
                            fontSize: '0.6rem',
                            fontWeight: 600,
                            transition: 'color 150ms ease',
                            '&:hover': {color: theme.palette.error.light},
                          }}
                        >
                          Cancel
                        </Box>
                      </Box>
                    )}
                    {isUser && msg.status === 'failed' && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.75,
                          mt: 0.75,
                          px: 1,
                          py: 0.5,
                          borderRadius: '8px',
                          background: alpha(theme.palette.error.main, 0.08),
                          border: `1px solid ${alpha(theme.palette.error.main, 0.15)}`,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Box
                          component="svg"
                          viewBox="0 0 14 14"
                          sx={{
                            width: 13,
                            height: 13,
                            color: theme.palette.error.light,
                            flexShrink: 0,
                          }}
                        >
                          <circle
                            cx="7"
                            cy="7"
                            r="6"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            fill="none"
                          />
                          <path
                            d="M7 4v3.5M7 9.5v.01"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </Box>
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.62rem',
                            color: theme.palette.error.light,
                            flex: 1,
                          }}
                        >
                          {msg.error}
                        </Typography>
                        <Box
                          component="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            retryMessage(msg.messageId);
                          }}
                          sx={{
                            background: alpha(theme.palette.error.main, 0.2),
                            border: 'none',
                            borderRadius: '8px',
                            px: 1,
                            py: 0.25,
                            cursor: 'pointer',
                            color: theme.palette.error.light,
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            transition: 'all 150ms ease',
                            '&:hover': {
                              background: alpha(theme.palette.error.main, 0.35),
                            },
                          }}
                        >
                          Retry
                        </Box>
                        <Box
                          component="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMessage(msg.messageId);
                          }}
                          sx={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: alpha('#fff', 0.35),
                            fontSize: '0.6rem',
                            transition: 'color 150ms ease',
                            '&:hover': {color: theme.palette.error.light},
                          }}
                        >
                          Delete
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Box>
              </Fade>
            );
          })}

          {/* HITL card for messages with blocked agent status */}
          {messages.some((m) => m.agentStatus) &&
            (() => {
              const last = [...messages].reverse().find((m) => m.agentStatus);
              return last ? (
                <HITLInlineCard
                  agentStatus={last.agentStatus}
                  postId={last.postId}
                />
              ) : null;
            })()}

          {/* Thinking dots */}
          {isTyping && messages[messages.length - 1]?.role === 'user' && (
            <Box
              sx={{
                alignSelf: 'flex-start',
                px: 1.5,
                py: 0.5,
                borderRadius: '14px 14px 14px 4px',
                background: alpha(theme.palette.common.white, 0.05),
                border: `1px solid ${alpha(theme.palette.common.white, 0.06)}`,
              }}
            >
              <ThinkingDots />
            </Box>
          )}
        </Box>
      )}

      {/* ── @Mention autocomplete dropdown ── */}
      {mentionSuggestions.length > 0 && (
        <Box
          sx={{
            px: 2,
            pb: 0.5,
            flexShrink: 0,
            borderTop: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.6rem',
              color: theme.palette.text.secondary,
              pl: 0.5,
            }}
          >
            Mention a HART
          </Typography>
          <Box
            sx={{display: 'flex', flexDirection: 'column', gap: 0.25, mt: 0.25}}
          >
            {mentionSuggestions.map((agent) => {
              const p = getAgentPalette(
                agent.name || agent.prompt_id?.toString()
              );
              return (
                <Box
                  key={agent.prompt_id}
                  onClick={() => insertMention(agent)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1,
                    py: 0.5,
                    borderRadius: RADIUS.sm,
                    cursor: 'pointer',
                    transition: `all 0.12s ${EASINGS.smooth}`,
                    '&:hover': {
                      bgcolor: alpha(theme.palette.common.white, 0.06),
                    },
                  }}
                >
                  <SmartToyIcon sx={{fontSize: 16, color: p.accent}} />
                  <Typography
                    variant="body2"
                    sx={{fontSize: '0.8rem', fontWeight: 600, color: p.accent}}
                  >
                    {agent.name || `Agent ${agent.prompt_id}`}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* ── Input bar ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1,
          px: 2.5,
          py: 1.5,
          borderTop: `1px solid ${theme.palette.divider}`,
          ...socialTokens.glass.subtle(theme),
          flexShrink: 0,
          paddingBottom: {
            xs: 'calc(12px + env(safe-area-inset-bottom, 0px))',
            md: '12px',
          },
        }}
      >
        <TextField
          inputRef={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Message Nunba..."
          multiline
          maxRows={3}
          size="small"
          fullWidth
          disabled={isLoading}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: RADIUS.pill,
              fontSize: '0.85rem',
              background: alpha(theme.palette.common.white, 0.04),
              '& fieldset': {
                borderColor: alpha(theme.palette.common.white, 0.08),
              },
              '&:hover fieldset': {
                borderColor: alpha(theme.palette.common.white, 0.15),
              },
              '&.Mui-focused fieldset': {
                borderColor: theme.palette.primary.main,
                boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.15)}`,
              },
            },
          }}
        />
        <IconButton
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          sx={{
            background: GRADIENTS.primary,
            color: '#fff',
            width: 36,
            height: 36,
            flexShrink: 0,
            overflow: 'hidden',
            position: 'relative',
            transition: `all 200ms ${EASINGS.smooth}`,
            boxShadow: input.trim()
              ? `0 2px 12px ${alpha(theme.palette.primary.main, 0.4)}`
              : 'none',
            '&:hover': {
              transform: 'scale(1.08)',
              boxShadow: `0 4px 20px ${alpha(theme.palette.primary.main, 0.5)}`,
            },
            '&:active': {transform: 'scale(0.92)'},
            '&.Mui-disabled': {
              background: alpha(theme.palette.common.white, 0.06),
              color: alpha(theme.palette.common.white, 0.2),
              boxShadow: 'none',
            },
            // Shimmer overlay when ready to send
            ...(!isLoading && input.trim()
              ? {
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background:
                      'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                    animation: `${shimmerSlide} 2s ease-in-out infinite`,
                  },
                }
              : {}),
          }}
          aria-label="Send message"
        >
          <SendIcon sx={{fontSize: 18, position: 'relative', zIndex: 1}} />
        </IconButton>
      </Box>

      {/* Security footer */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 0.5,
          py: 0.75,
          px: 2.5,
          borderTop: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
          borderRadius: `0 0 ${RADIUS.lg} ${RADIUS.lg}`,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontSize: '0.58rem',
            color: alpha(theme.palette.text.secondary, 0.5),
            letterSpacing: '0.02em',
          }}
        >
          Encrypted &middot; Private &middot; AI learns on-device only
        </Typography>
      </Box>
    </Box>
  );
}

/* ── Main export: desktop panel vs mobile drawer ── */
export default function NunbaChatPanel() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const {isExpanded, setIsExpanded} = useNunbaChat();

  if (!isExpanded) return null;

  /* ── Mobile: SwipeableDrawer ── */
  if (isMobile) {
    return (
      <SwipeableDrawer
        anchor="bottom"
        open={isExpanded}
        onClose={() => setIsExpanded(false)}
        onOpen={() => setIsExpanded(true)}
        disableSwipeToOpen
        ModalProps={{keepMounted: false}}
        PaperProps={{
          sx: {
            height: '70vh',
            borderRadius: '20px 20px 0 0',
            background: theme.palette.background.default,
            overflow: 'clip',
          },
        }}
        sx={{zIndex: 1250}}
      >
        {/* Swipe indicator */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            py: 1,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 4,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.common.white, 0.15),
            }}
          />
        </Box>
        <PanelContent />
      </SwipeableDrawer>
    );
  }

  /* ── Desktop: fixed panel with click-outside-to-close ── */
  return (
    <>
      {/* Transparent backdrop — click to close */}
      <Box
        onClick={() => setIsExpanded(false)}
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 1249,
          cursor: 'default',
        }}
      />
      <Grow in={isExpanded} style={{transformOrigin: 'bottom right'}}>
        <Box
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 400,
            height: 540,
            zIndex: 1250,
            borderRadius: RADIUS.lg,
            overflow: 'clip',
            ...socialTokens.glass.elevated(theme),
            boxShadow: SHADOWS.float,
            animation: `${panelEnter} 300ms ${EASINGS.smooth}`,
          }}
        >
          <PanelContent />
        </Box>
      </Grow>
    </>
  );
}
