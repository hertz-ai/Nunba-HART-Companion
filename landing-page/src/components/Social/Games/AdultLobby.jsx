import {RADIUS, GRADIENTS, socialTokens} from '../../../theme/socialTokens';
import {animFadeInUp, animFadeInScale} from '../../../utils/animations';

import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import GroupIcon from '@mui/icons-material/Group';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import {
  Box,
  Typography,
  Button,
  Avatar,
  Chip,
  CircularProgress,
  TextField,
  IconButton,
  Fade,
  Grow,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState} from 'react';

/**
 * AdultLobby — Adult-themed multiplayer lobby with MUI dark styling.
 *
 * Status flow: 'idle' -> 'creating' -> 'waiting' -> 'playing' -> 'complete'
 *
 * Props:
 *   multiplayer  — return value of useMultiplayerSync hook
 *   onStartSolo  — callback for solo play
 *   onGameStart  — callback when game begins
 *   gameTitle    — display name for the game
 */
function AdultLobby({
  multiplayer,
  onStartSolo,
  onGameStart,
  gameTitle = 'Game',
}) {
  const theme = useTheme();
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);

  // useMultiplayerSync returns a flat object — destructure directly
  const {
    sessionId, participants, isHost, status, error,
    createSession, joinSession, quickMatch, markReady, startGame, leaveSession,
    participantCount, canStart,
  } = multiplayer || {};

  const handleCopyCode = () => {
    if (!sessionId) return;
    const code = sessionId.slice(0, 8).toUpperCase();
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleJoin = () => {
    if (joinCode.trim()) {
      joinSession(joinCode.trim());
      setJoinCode('');
    }
  };

  const handleStartGame = () => {
    startGame();
    if (onGameStart) onGameStart();
  };

  // ── Shared card sx ──────────────────────────────────────────────────────────

  const cardSx = {
    ...socialTokens.glass.surface(theme),
    borderRadius: RADIUS.lg,
    p: 3,
    width: '100%',
    maxWidth: 480,
    mx: 'auto',
  };

  // ── Shared gradient button sx ───────────────────────────────────────────────

  const gradientBtnSx = {
    background: GRADIENTS.primary,
    color: '#fff',
    fontWeight: 600,
    borderRadius: RADIUS.md,
    textTransform: 'none',
    px: 3,
    py: 1.2,
    '&:hover': {
      background: GRADIENTS.primaryHover,
    },
  };

  // ── Status: idle — mode selection ───────────────────────────────────────────

  if (status === 'idle') {
    return (
      <Fade in timeout={400}>
        <Box sx={{...cardSx, ...animFadeInScale()}}>
          <Typography
            variant="h5"
            sx={{fontWeight: 700, mb: 3, textAlign: 'center'}}
          >
            {gameTitle}
          </Typography>

          {/* Solo */}
          <Button
            fullWidth
            startIcon={<PlayArrowIcon />}
            sx={{...gradientBtnSx, mb: 1.5}}
            onClick={onStartSolo}
          >
            Play Solo
          </Button>

          {/* Quick Match */}
          <Button
            fullWidth
            startIcon={<GroupIcon />}
            sx={{
              ...gradientBtnSx,
              background: GRADIENTS.accent,
              mb: 1.5,
              '&:hover': {
                background: GRADIENTS.accent,
                filter: 'brightness(1.1)',
              },
            }}
            onClick={quickMatch}
          >
            Quick Match
          </Button>

          {/* Create Room */}
          <Button
            fullWidth
            variant="outlined"
            sx={{
              borderColor: alpha(theme.palette.primary.main, 0.5),
              color: theme.palette.primary.main,
              fontWeight: 600,
              borderRadius: RADIUS.md,
              textTransform: 'none',
              mb: 2,
              '&:hover': {
                borderColor: theme.palette.primary.main,
                background: alpha(theme.palette.primary.main, 0.08),
              },
            }}
            onClick={createSession}
          >
            Create Room
          </Button>

          {/* Join with Code */}
          <Box sx={{display: 'flex', gap: 1}}>
            <TextField
              size="small"
              placeholder="Enter room code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              inputProps={{
                maxLength: 8,
                style: {fontFamily: 'monospace', letterSpacing: 2},
              }}
              sx={{
                flex: 1,
                '& .MuiOutlinedInput-root': {
                  borderRadius: RADIUS.md,
                  '& fieldset': {
                    borderColor: alpha(theme.palette.divider, 0.3),
                  },
                },
              }}
            />
            <Button
              variant="contained"
              sx={{...gradientBtnSx, minWidth: 80}}
              disabled={!joinCode.trim()}
              onClick={handleJoin}
            >
              Join
            </Button>
          </Box>

          {error && (
            <Typography
              variant="body2"
              sx={{mt: 2, color: theme.palette.error.main, textAlign: 'center'}}
            >
              {error}
            </Typography>
          )}
        </Box>
      </Fade>
    );
  }

  // ── Status: creating — spinner ──────────────────────────────────────────────

  if (status === 'creating') {
    return (
      <Fade in timeout={300}>
        <Box
          sx={{
            ...cardSx,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            py: 6,
          }}
        >
          <CircularProgress
            size={48}
            sx={{color: theme.palette.primary.main}}
          />
          <Typography
            variant="body1"
            sx={{color: theme.palette.text.secondary}}
          >
            Setting up...
          </Typography>
        </Box>
      </Fade>
    );
  }

  // ── Status: waiting — lobby with participants ───────────────────────────────

  if (status === 'waiting') {
    const displayCode = sessionId ? sessionId.slice(0, 8).toUpperCase() : '';

    return (
      <Fade in timeout={400}>
        <Box sx={{...cardSx, ...animFadeInUp()}}>
          {/* Header */}
          <Typography
            variant="h6"
            sx={{fontWeight: 700, mb: 0.5, textAlign: 'center'}}
          >
            Waiting for Players
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: theme.palette.text.secondary,
              textAlign: 'center',
              mb: 3,
            }}
          >
            {participantCount} player{participantCount !== 1 ? 's' : ''} in
            lobby
          </Typography>

          {/* Session code */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              mb: 3,
              p: 1.5,
              borderRadius: RADIUS.md,
              background: alpha(theme.palette.common.white, 0.04),
              border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: 4,
                color: theme.palette.primary.main,
              }}
            >
              {displayCode}
            </Typography>
            <IconButton size="small" onClick={handleCopyCode}>
              <ContentCopyIcon
                fontSize="small"
                sx={{
                  color: copied
                    ? theme.palette.success.main
                    : theme.palette.text.secondary,
                }}
              />
            </IconButton>
            {copied && (
              <Typography
                variant="caption"
                sx={{color: theme.palette.success.main}}
              >
                Copied!
              </Typography>
            )}
          </Box>

          {/* Participant avatars */}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 1.5,
              mb: 3,
            }}
          >
            {(participants || []).map((p, idx) => {
              const name = p.username || p.name || `Player ${idx + 1}`;
              const initials = name
                .split(/\s+/)
                .map((w) => w[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              const isReady = p.ready || p.isReady;

              return (
                <Grow in key={p.id || idx} timeout={300 + idx * 100}>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 0.5,
                      ...animFadeInScale(idx * 80),
                    }}
                  >
                    <Avatar
                      sx={{
                        width: 48,
                        height: 48,
                        background: GRADIENTS.primary,
                        fontWeight: 700,
                        fontSize: 16,
                        border: isReady
                          ? `2px solid ${theme.palette.success.main}`
                          : `2px solid ${alpha(theme.palette.divider, 0.3)}`,
                      }}
                    >
                      {initials}
                    </Avatar>
                    <Typography
                      variant="caption"
                      sx={{
                        maxWidth: 64,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: theme.palette.text.secondary,
                      }}
                    >
                      {name}
                    </Typography>
                    {p.isHost && (
                      <Chip
                        label="Host"
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: 10,
                          fontWeight: 700,
                          background: alpha(theme.palette.primary.main, 0.15),
                          color: theme.palette.primary.main,
                        }}
                      />
                    )}
                  </Box>
                </Grow>
              );
            })}
          </Box>

          {/* Actions */}
          <Box sx={{display: 'flex', gap: 1.5}}>
            <Button
              variant="outlined"
              sx={{
                flex: 1,
                borderColor: alpha(theme.palette.error.main, 0.5),
                color: theme.palette.error.main,
                fontWeight: 600,
                borderRadius: RADIUS.md,
                textTransform: 'none',
                '&:hover': {
                  borderColor: theme.palette.error.main,
                  background: alpha(theme.palette.error.main, 0.08),
                },
              }}
              onClick={leaveSession}
            >
              Leave
            </Button>

            {isHost ? (
              <Button
                sx={{...gradientBtnSx, flex: 2}}
                disabled={!canStart}
                onClick={handleStartGame}
                startIcon={<PlayArrowIcon />}
              >
                Start Game
              </Button>
            ) : (
              <Button sx={{...gradientBtnSx, flex: 2}} onClick={markReady}>
                Ready
              </Button>
            )}
          </Box>

          {error && (
            <Typography
              variant="body2"
              sx={{mt: 2, color: theme.palette.error.main, textAlign: 'center'}}
            >
              {error}
            </Typography>
          )}
        </Box>
      </Fade>
    );
  }

  // ── Fallback for other statuses (playing, complete, etc.) ───────────────────

  return null;
}

export default AdultLobby;
