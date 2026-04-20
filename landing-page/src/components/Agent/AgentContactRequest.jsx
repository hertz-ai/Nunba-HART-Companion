/**
 * AgentContactRequest - Instagram-style "AgentX wants to talk to you" overlay.
 *
 * Shows when a non-owned agent proactively reaches out. User can Accept or Deny.
 * Owned agent messages bypass this and go directly to chat.
 *
 * Props:
 *   request    - { request_id, agent_id, agent_name, reason, requires_consent }
 *   onAccept   - (request) => void
 *   onDeny     - (request) => void
 */
import CallIcon from '@mui/icons-material/Call';
import CallEndIcon from '@mui/icons-material/CallEnd';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { Box, Typography, Button, Avatar, Slide, Paper } from '@mui/material';
import React, { useState } from 'react';

const AgentContactRequest = ({ request, onAccept, onDeny }) => {
  const [responding, setResponding] = useState(false);

  if (!request) return null;

  const handleAccept = () => {
    setResponding(true);
    onAccept?.(request);
  };

  const handleDeny = () => {
    setResponding(true);
    onDeny?.(request);
  };

  return (
    <Slide direction="down" in={!!request} mountOnEnter unmountOnExit>
      <Paper
        elevation={24}
        sx={{
          position: 'fixed',
          top: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: 'linear-gradient(135deg, #1A1730 0%, #0F0E17 100%)',
          border: '1px solid rgba(108, 99, 255, 0.3)',
          borderRadius: '20px',
          padding: '20px 24px',
          minWidth: 340,
          maxWidth: 420,
          backdropFilter: 'blur(20px)',
          animation: 'contactPulse 2s ease-in-out infinite',
          '@keyframes contactPulse': {
            '0%, 100%': { boxShadow: '0 8px 32px rgba(108, 99, 255, 0.2)' },
            '50%': { boxShadow: '0 8px 48px rgba(108, 99, 255, 0.4)' },
          },
        }}
      >
        {/* Agent avatar + name */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Avatar
            sx={{
              width: 44, height: 44,
              background: 'linear-gradient(135deg, #6C63FF, #9B94FF)',
            }}
          >
            <SmartToyIcon sx={{ fontSize: 24 }} />
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography
              sx={{
                color: '#E8E6F0',
                fontWeight: 700,
                fontSize: 15,
                lineHeight: 1.2,
              }}
            >
              {request.agent_name}
            </Typography>
            <Typography
              sx={{
                color: 'rgba(255,255,255,0.4)',
                fontSize: 12,
                mt: 0.25,
              }}
            >
              wants to talk to you
            </Typography>
          </Box>
        </Box>

        {/* Reason */}
        <Typography
          sx={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: 13,
            mb: 2.5,
            lineHeight: 1.4,
            px: 0.5,
          }}
        >
          {request.reason}
        </Typography>

        {/* Accept / Deny buttons */}
        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
          <Button
            onClick={handleDeny}
            disabled={responding}
            startIcon={<CallEndIcon />}
            sx={{
              flex: 1,
              borderRadius: '12px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 14,
              py: 1.2,
              color: '#FF6B6B',
              background: 'rgba(255, 107, 107, 0.1)',
              border: '1px solid rgba(255, 107, 107, 0.2)',
              '&:hover': {
                background: 'rgba(255, 107, 107, 0.2)',
              },
            }}
          >
            Deny
          </Button>
          <Button
            onClick={handleAccept}
            disabled={responding}
            startIcon={<CallIcon />}
            sx={{
              flex: 1,
              borderRadius: '12px',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 14,
              py: 1.2,
              color: '#fff',
              background: 'linear-gradient(135deg, #6C63FF, #9B94FF)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5650CC, #8B84FF)',
              },
            }}
          >
            Accept
          </Button>
        </Box>
      </Paper>
    </Slide>
  );
};

export default AgentContactRequest;
