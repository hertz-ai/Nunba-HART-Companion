/**
 * AgentInterviewPanel - Inline chat panel for interviewing an agent.
 *
 * Slides in from right (desktop) / up (mobile). Shows conversation history
 * with the agent and allows sending new questions via trackerApi.interview().
 * Reuses msgAppear keyframe from ThoughtExperimentTracker.
 */

import { trackerApi } from '../../../services/socialApi';
import { socialTokens, RADIUS, EASINGS, DURATIONS, SHADOWS } from '../../../theme/socialTokens';

import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import {
  Box, Typography, Paper, TextField, IconButton, Avatar,
  useTheme, useMediaQuery, keyframes, CircularProgress,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useState, useRef, useEffect, useCallback } from 'react';

// ---- Keyframes ----

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

export default function AgentInterviewPanel({ postId, agentTitle, onClose }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const question = input.trim();
    if (!question || !postId || sending) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: question, ts: Date.now() }]);
    setSending(true);

    try {
      const res = await trackerApi.interview(postId, { question });
      const answer = res?.data?.answer || res?.data?.data?.answer || 'No response from agent.';
      setMessages((prev) => [...prev, { role: 'agent', text: answer, ts: Date.now() }]);
    } catch (err) {
      const errMsg = err?.response?.data?.error || err.message || 'Interview request failed';
      setMessages((prev) => [...prev, { role: 'agent', text: `Error: ${errMsg}`, ts: Date.now(), error: true }]);
    } finally {
      setSending(false);
    }
  }, [input, postId, sending]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const panelAnimation = isMobile ? slideInUp : slideInRight;

  return (
    <Paper sx={{
      position: 'fixed',
      right: isMobile ? 0 : 16,
      bottom: isMobile ? 0 : 16,
      top: isMobile ? 'auto' : 80,
      left: isMobile ? 0 : 'auto',
      width: isMobile ? '100%' : 380,
      height: isMobile ? '60vh' : 'auto',
      maxHeight: isMobile ? '60vh' : 'calc(100vh - 96px)',
      zIndex: 1200,
      display: 'flex',
      flexDirection: 'column',
      ...socialTokens.glass.elevated(theme),
      borderRadius: isMobile ? `${RADIUS.lg} ${RADIUS.lg} 0 0` : RADIUS.lg,
      bgcolor: '#0F0E17',
      animation: `${panelAnimation} ${DURATIONS.normal}ms ${EASINGS.decelerate}`,
      boxShadow: SHADOWS.float,
    }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1,
        p: 2, borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.06)}`,
      }}>
        <SmartToyIcon sx={{ color: '#6C63FF', fontSize: 22 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
            Interview: {agentTitle || 'Agent'}
          </Typography>
          <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
            Ask questions about its reasoning and goals
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ color: theme.palette.text.secondary }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Messages */}
      <Box ref={scrollRef} sx={{
        flex: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1.5,
        scrollbarWidth: 'thin',
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-thumb': { bgcolor: alpha('#6C63FF', 0.3), borderRadius: 2 },
      }}>
        {messages.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <SmartToyIcon sx={{ fontSize: 36, color: alpha('#6C63FF', 0.3), mb: 1 }} />
            <Typography variant="body2" sx={{ color: theme.palette.text.disabled }}>
              Ask this agent anything about its experiment, reasoning, or progress.
            </Typography>
          </Box>
        )}

        {messages.map((msg, i) => {
          const isUser = msg.role === 'user';
          return (
            <Box
              key={msg.ts + '-' + i}
              sx={{
                display: 'flex',
                flexDirection: isUser ? 'row-reverse' : 'row',
                gap: 1,
                animation: `${msgAppear} ${DURATIONS.normal}ms ${EASINGS.decelerate}`,
                animationDelay: `${Math.min(i * 50, 200)}ms`,
                animationFillMode: 'backwards',
              }}
            >
              <Avatar sx={{
                width: 28, height: 28,
                bgcolor: isUser ? alpha('#6C63FF', 0.2) : alpha('#00e89d', 0.2),
              }}>
                {isUser
                  ? <PersonIcon sx={{ fontSize: 16, color: '#6C63FF' }} />
                  : <SmartToyIcon sx={{ fontSize: 16, color: '#00e89d' }} />
                }
              </Avatar>
              <Box sx={{
                maxWidth: '75%',
                px: 1.5, py: 1,
                borderRadius: RADIUS.md,
                bgcolor: isUser
                  ? alpha('#6C63FF', 0.12)
                  : alpha(theme.palette.common.white, 0.04),
                border: `1px solid ${alpha(
                  isUser ? '#6C63FF' : (msg.error ? '#FF6B6B' : theme.palette.common.white),
                  0.1
                )}`,
              }}>
                <Typography variant="body2" sx={{
                  color: msg.error ? '#FF6B6B' : theme.palette.text.primary,
                  fontSize: '0.82rem', lineHeight: 1.5, whiteSpace: 'pre-wrap',
                }}>
                  {msg.text}
                </Typography>
              </Box>
            </Box>
          );
        })}

        {sending && (
          <Box sx={{ display: 'flex', gap: 1, animation: `${msgAppear} ${DURATIONS.fast}ms ${EASINGS.decelerate}` }}>
            <Avatar sx={{ width: 28, height: 28, bgcolor: alpha('#00e89d', 0.2) }}>
              <SmartToyIcon sx={{ fontSize: 16, color: '#00e89d' }} />
            </Avatar>
            <Box sx={{
              px: 1.5, py: 1, borderRadius: RADIUS.md,
              bgcolor: alpha(theme.palette.common.white, 0.04),
              display: 'flex', alignItems: 'center', gap: 0.5,
            }}>
              <CircularProgress size={14} sx={{ color: '#6C63FF' }} />
              <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                Thinking...
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {/* Input */}
      <Box sx={{
        p: 1.5, borderTop: `1px solid ${alpha(theme.palette.common.white, 0.06)}`,
        display: 'flex', gap: 1, alignItems: 'flex-end',
      }}>
        <TextField
          fullWidth
          size="small"
          multiline
          maxRows={3}
          placeholder="Ask the agent..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: RADIUS.md,
              fontSize: '0.85rem',
            },
          }}
        />
        <IconButton
          onClick={handleSend}
          disabled={!input.trim() || sending}
          sx={{
            bgcolor: alpha('#6C63FF', 0.15),
            color: '#6C63FF',
            '&:hover': { bgcolor: alpha('#6C63FF', 0.25) },
            '&.Mui-disabled': { color: alpha('#6C63FF', 0.3) },
          }}
        >
          <SendIcon fontSize="small" />
        </IconButton>
      </Box>
    </Paper>
  );
}
