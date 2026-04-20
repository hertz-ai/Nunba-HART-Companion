/**
 * Admin → Integrations → Claude Code
 *
 * Closes the setup UX gap introduced by commit f5b99d8 (bearer-token auth
 * on /api/mcp/local).  Existing Claude Code users who wired up the old
 * stdio-spawn MCP config now see silent 403s because:
 *   1. their .claude/settings.local.json has no Authorization header
 *   2. the bearer token lives in %LOCALAPPDATA%/Nunba/mcp.token (Windows)
 *      or ~/.nunba/mcp.token (Unix) — not obvious where to find it
 *   3. the new transport is http (not stdio) so the config shape changed
 *
 * This card:
 *   - shows the MCP HTTP endpoint
 *   - shows the bearer token (masked by default, reveal toggle)
 *   - one-click copy of the full JSON snippet users paste into their
 *     .claude/settings.local.json (mcpServers.hartos block)
 *   - rotate button to regenerate the token (invalidates live clients —
 *     confirmation required so operators don't accidentally boot themselves)
 *
 * All styling uses MUI `sx` prop — makeStyles is broken in this project
 * (theme.spacing is not a function under MUI v5 ThemeProvider).
 */
import {ADMIN_API_URL} from '../../config/apiBase';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import TerminalIcon from '@mui/icons-material/Terminal';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  IconButton,
  TextField,
  Stack,
  Chip,
  Divider,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Snackbar,
} from '@mui/material';
import React, {useState, useEffect, useCallback} from 'react';


const PURPLE = '#6C63FF';
const PURPLE_SOFT = 'rgba(108, 99, 255, 0.1)';
const PURPLE_BORDER = 'rgba(108, 99, 255, 0.3)';
const CARD_BG = 'rgba(255, 255, 255, 0.03)';
const CARD_BORDER = 'rgba(255, 255, 255, 0.08)';

export default function ClaudeCodeIntegrationPage() {
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [snackbar, setSnackbar] = useState({open: false, message: ''});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fetchToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Local desktop call — require_local_or_token gate passes on 127.0.0.1
      const res = await fetch(`${ADMIN_API_URL}/mcp/token`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  const handleCopy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setSnackbar({open: true, message: `${label} copied to clipboard`});
    } catch (e) {
      setSnackbar({open: true, message: `Copy failed: ${e.message || e}`});
    }
  };

  const handleRotate = async () => {
    setConfirmOpen(false);
    setRotating(true);
    setError(null);
    try {
      const res = await fetch(`${ADMIN_API_URL}/mcp/token/rotate`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const json = await res.json();
      setData(json);
      setTokenRevealed(true); // user just rotated — they need the new value
      setSnackbar({
        open: true,
        message: 'Token rotated — update .claude/settings.local.json',
      });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setRotating(false);
    }
  };

  const maskedToken = (t) =>
    t ? '•'.repeat(Math.min(32, t.length)) : '';

  if (loading) {
    return (
      <Box sx={{display: 'flex', justifyContent: 'center', mt: 8}}>
        <CircularProgress sx={{color: PURPLE}} />
      </Box>
    );
  }

  return (
    <Box sx={{maxWidth: 960, mx: 'auto', pb: 6}}>
      {/* Header */}
      <Box sx={{mb: 3}}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{mb: 1}}>
          <TerminalIcon sx={{color: PURPLE, fontSize: 32}} />
          <Typography variant="h4" sx={{color: '#fff', fontWeight: 700}}>
            Claude Code Integration
          </Typography>
        </Stack>
        <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.6)'}}>
          Connect Anthropic&apos;s Claude Code CLI to your local Nunba/HARTOS
          agent stack over MCP. Paste the snippet below into{' '}
          <Box
            component="code"
            sx={{
              px: 0.75,
              py: 0.25,
              borderRadius: 1,
              background: 'rgba(255,255,255,0.06)',
              fontSize: '0.85rem',
            }}
          >
            .claude/settings.local.json
          </Box>
          .
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{mb: 2}}>
          {error}
        </Alert>
      )}

      {/* MCP URL card */}
      <Card
        sx={{
          background: CARD_BG,
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 2,
          mb: 2,
        }}
      >
        <CardContent>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{mb: 1.5}}
          >
            <Typography variant="subtitle1" sx={{color: '#fff', fontWeight: 600}}>
              MCP Endpoint
            </Typography>
            <Chip
              label="HTTP"
              size="small"
              sx={{
                background: PURPLE_SOFT,
                color: PURPLE,
                border: `1px solid ${PURPLE_BORDER}`,
                fontWeight: 600,
              }}
            />
          </Stack>
          <TextField
            fullWidth
            value={data?.url || ''}
            InputProps={{
              readOnly: true,
              sx: {
                fontFamily: 'monospace',
                color: '#fff',
                background: 'rgba(0,0,0,0.3)',
              },
              endAdornment: (
                <Tooltip title="Copy URL" arrow>
                  <IconButton
                    onClick={() => handleCopy(data?.url || '', 'URL')}
                    size="small"
                    sx={{color: PURPLE}}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(255,255,255,0.1)',
              },
            }}
          />
        </CardContent>
      </Card>

      {/* Token card */}
      <Card
        sx={{
          background: CARD_BG,
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 2,
          mb: 2,
        }}
      >
        <CardContent>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{mb: 1.5}}
          >
            <Typography variant="subtitle1" sx={{color: '#fff', fontWeight: 600}}>
              Bearer Token
            </Typography>
            <Stack direction="row" spacing={1}>
              <Tooltip
                title={tokenRevealed ? 'Hide token' : 'Reveal token'}
                arrow
              >
                <IconButton
                  onClick={() => setTokenRevealed((v) => !v)}
                  size="small"
                  sx={{color: 'rgba(255,255,255,0.7)'}}
                  aria-label={tokenRevealed ? 'Hide token' : 'Reveal token'}
                >
                  {tokenRevealed ? (
                    <VisibilityOffIcon fontSize="small" />
                  ) : (
                    <VisibilityIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>
              <Tooltip title="Copy token" arrow>
                <IconButton
                  onClick={() => handleCopy(data?.token || '', 'Token')}
                  size="small"
                  sx={{color: PURPLE}}
                  aria-label="Copy token"
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
          <TextField
            fullWidth
            value={
              tokenRevealed ? data?.token || '' : maskedToken(data?.token)
            }
            InputProps={{
              readOnly: true,
              sx: {
                fontFamily: 'monospace',
                color: '#fff',
                background: 'rgba(0,0,0,0.3)',
                letterSpacing: tokenRevealed ? 'normal' : '2px',
              },
            }}
            sx={{
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(255,255,255,0.1)',
              },
            }}
          />
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 1,
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            Stored at{' '}
            <Box
              component="code"
              sx={{
                px: 0.5,
                borderRadius: 0.5,
                background: 'rgba(255,255,255,0.06)',
                fontSize: '0.8rem',
              }}
            >
              %LOCALAPPDATA%/Nunba/mcp.token
            </Box>{' '}
            (Windows) or{' '}
            <Box
              component="code"
              sx={{
                px: 0.5,
                borderRadius: 0.5,
                background: 'rgba(255,255,255,0.06)',
                fontSize: '0.8rem',
              }}
            >
              ~/.nunba/mcp.token
            </Box>{' '}
            (Unix).
          </Typography>
        </CardContent>
      </Card>

      {/* Config snippet card */}
      <Card
        sx={{
          background: CARD_BG,
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 2,
          mb: 2,
        }}
      >
        <CardContent>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{mb: 1.5}}
          >
            <Typography variant="subtitle1" sx={{color: '#fff', fontWeight: 600}}>
              MCP Config Snippet
            </Typography>
            <Button
              onClick={() =>
                handleCopy(data?.config_snippet || '', 'MCP config')
              }
              variant="contained"
              size="small"
              startIcon={<ContentCopyIcon />}
              sx={{
                background: PURPLE,
                textTransform: 'none',
                fontWeight: 600,
                '&:hover': {background: '#5A52E0'},
              }}
            >
              Copy MCP config
            </Button>
          </Stack>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              borderRadius: 1,
              background: 'rgba(0,0,0,0.4)',
              color: '#e0e0e0',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              overflowX: 'auto',
              border: '1px solid rgba(255,255,255,0.05)',
              maxHeight: 300,
            }}
          >
            {data?.config_snippet || ''}
          </Box>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 1.5,
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            Paste this into the{' '}
            <Box
              component="code"
              sx={{
                px: 0.5,
                borderRadius: 0.5,
                background: 'rgba(255,255,255,0.06)',
                fontSize: '0.8rem',
              }}
            >
              mcpServers
            </Box>{' '}
            section of{' '}
            <Box
              component="code"
              sx={{
                px: 0.5,
                borderRadius: 0.5,
                background: 'rgba(255,255,255,0.06)',
                fontSize: '0.8rem',
              }}
            >
              .claude/settings.local.json
            </Box>
            , then restart Claude Code.
          </Typography>
        </CardContent>
      </Card>

      <Divider sx={{my: 3, borderColor: 'rgba(255,255,255,0.08)'}} />

      {/* Rotate token */}
      <Card
        sx={{
          background: 'rgba(255, 107, 107, 0.05)',
          border: '1px solid rgba(255, 107, 107, 0.2)',
          borderRadius: 2,
        }}
      >
        <CardContent>
          <Typography
            variant="subtitle1"
            sx={{color: '#fff', fontWeight: 600, mb: 1}}
          >
            Rotate Token
          </Typography>
          <Typography
            variant="body2"
            sx={{color: 'rgba(255,255,255,0.65)', mb: 2}}
          >
            Regenerate the bearer token.{' '}
            <Box component="strong" sx={{color: '#FF6B6B'}}>
              This immediately invalidates every live client.
            </Box>{' '}
            You will need to re-copy the config snippet into every
            machine&apos;s .claude/settings.local.json afterwards.
          </Typography>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={rotating}
            variant="outlined"
            startIcon={
              rotating ? (
                <CircularProgress size={16} sx={{color: '#FF6B6B'}} />
              ) : (
                <RefreshIcon />
              )
            }
            sx={{
              borderColor: '#FF6B6B',
              color: '#FF6B6B',
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': {
                borderColor: '#FF6B6B',
                background: 'rgba(255, 107, 107, 0.1)',
              },
            }}
          >
            {rotating ? 'Rotating…' : 'Rotate token'}
          </Button>
        </CardContent>
      </Card>

      {/* Confirm rotate dialog */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        PaperProps={{
          sx: {
            background: '#1a1a2e',
            color: '#fff',
            border: `1px solid ${CARD_BORDER}`,
          },
        }}
      >
        <DialogTitle sx={{fontWeight: 700}}>Rotate MCP token?</DialogTitle>
        <DialogContent>
          <Typography sx={{color: 'rgba(255,255,255,0.75)'}}>
            All existing Claude Code clients using the current token will
            start receiving 403 responses immediately. You will see the new
            token once rotation completes.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmOpen(false)}
            sx={{color: 'rgba(255,255,255,0.7)', textTransform: 'none'}}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRotate}
            variant="contained"
            startIcon={<CheckCircleIcon />}
            sx={{
              background: '#FF6B6B',
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': {background: '#E55555'},
            }}
          >
            Rotate now
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({open: false, message: ''})}
        message={snackbar.message}
        anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
      />
    </Box>
  );
}
