/**
 * InvitesPage — Nunba web parity for the RN InvitesScreen.
 *
 * Plan reference: sunny-gliding-eich.md, Part D.10 + Part E.9.
 *
 * Two surfaces in one page:
 *   1. Incoming list — invites where I'm the invitee.  Accept / Reject.
 *   2. Compose dialog — opened by the FAB.  Pick invitees via
 *      mentionsApi.autocomplete (200ms debounce), pick role, optionally
 *      flip to "anyone with link" mode (shareable invite_code).
 *
 * Server flag-gated by `invites_v2`; off → list returns [], page
 * renders empty-state cleanly.
 *
 * Route params (when navigated to from a community/conversation):
 *   parent_kind, parent_id, parent_name, open_compose
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Avatar, Button,
  Stack, Chip, CircularProgress, Snackbar, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, ToggleButton, ToggleButtonGroup,
  FormHelperText,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import PeopleIcon from '@mui/icons-material/People';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';

import { invitesApi, mentionsApi } from '../../../services/socialApi';
import EmptyState from '../shared/EmptyState';

const ROLES = [
  { key: 'member', label: 'Member' },
  { key: 'moderator', label: 'Moderator' },
  { key: 'admin', label: 'Admin' },
];

const initialsFor = (u) => {
  const name = u?.display_name || u?.username || '?';
  return name.trim().slice(0, 2).toUpperCase();
};

export default function InvitesPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const params = (location.state || {});
  const {
    parent_kind: routeParentKind,
    parent_id: routeParentId,
    parent_name: routeParentName,
    open_compose: openComposeOnMount = false,
  } = params;

  const [incoming, setIncoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  const [composeOpen, setComposeOpen] = useState(Boolean(openComposeOnMount));
  const [selectedInvitees, setSelectedInvitees] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [role, setRole] = useState('member');
  const [shareableLink, setShareableLink] = useState(false);
  const [sending, setSending] = useState(false);

  const searchTimer = useRef(null);

  // ── Incoming list ────────────────────────────────────────────────

  const fetchIncoming = useCallback(async () => {
    try {
      const r = await invitesApi.listIncoming();
      setIncoming(r?.data?.data || r?.data || []);
    } catch (_) {
      // flag-off / network — empty state renders.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIncoming(); }, [fetchIncoming]);

  const showError = (message) =>
    setToast({ message, severity: 'error' });
  const showSuccess = (message) =>
    setToast({ message, severity: 'success' });

  const handleAccept = (id) => async () => {
    setBusyId(id);
    try {
      await invitesApi.accept(id);
      showSuccess('Invite accepted');
      await fetchIncoming();
    } catch (e) {
      showError(e?.response?.data?.error || 'Could not accept');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = (id) => async () => {
    setBusyId(id);
    try {
      await invitesApi.reject(id);
      showSuccess('Invite declined');
      await fetchIncoming();
    } catch (e) {
      showError(e?.response?.data?.error || 'Could not decline');
    } finally {
      setBusyId(null);
    }
  };

  // ── Compose: invitee search via mentionsApi.autocomplete ─────────

  useEffect(() => {
    if (!searchQuery.trim() || shareableLink) {
      setSearchResults([]);
      return undefined;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await mentionsApi.autocomplete(searchQuery.trim(), {
          kind: 'human',
          limit: 8,
        });
        const got = (r?.data?.data || r?.data || []).filter(
          (u) => !selectedInvitees.find((s) => s.id === u.id),
        );
        setSearchResults(got);
      } catch (_) {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => searchTimer.current && clearTimeout(searchTimer.current);
  }, [searchQuery, selectedInvitees, shareableLink]);

  const addInvitee = (u) => {
    setSelectedInvitees((prev) =>
      prev.find((s) => s.id === u.id) ? prev : [...prev, u]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeInvitee = (uid) => {
    setSelectedInvitees((prev) => prev.filter((s) => s.id !== uid));
  };

  const closeCompose = () => {
    setComposeOpen(false);
    setSelectedInvitees([]);
    setSearchQuery('');
    setSearchResults([]);
    setShareableLink(false);
    setRole('member');
  };

  const handleSend = async () => {
    if (!routeParentKind || !routeParentId) {
      showError('Open this page from a community or conversation first.');
      return;
    }
    if (!shareableLink && selectedInvitees.length === 0) {
      showError('Pick at least one person, or switch to "Anyone with link".');
      return;
    }
    setSending(true);
    try {
      if (shareableLink) {
        const r = await invitesApi.send({
          parent_kind: routeParentKind,
          parent_id: routeParentId,
          role_offered: role,
          expires_in_days: 7,
        });
        const code = r?.data?.data?.invite_code || r?.data?.invite_code;
        if (code) {
          const url = `https://hevolve.ai/i/${code}`;
          if (navigator.share) {
            try { await navigator.share({ url, title: 'Invite link' }); }
            catch (_) { /* user cancelled */ }
          } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(url);
            showSuccess(`Link copied: ${url}`);
          }
        }
      } else {
        const results = await Promise.allSettled(
          selectedInvitees.map((u) => invitesApi.send({
            parent_kind: routeParentKind,
            parent_id: routeParentId,
            invitee_id: u.id,
            role_offered: role,
          })),
        );
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          showError(
            `${selectedInvitees.length - failed} sent, ${failed} failed.`);
        } else {
          showSuccess(`${selectedInvitees.length} invite(s) sent`);
        }
      }
      closeCompose();
      await fetchIncoming();
    } catch (e) {
      showError(e?.response?.data?.error || 'Could not send');
    } finally {
      setSending(false);
    }
  };

  // ── Renderers ────────────────────────────────────────────────────

  const renderIncoming = (item) => {
    const inviter = item.invited_by_user || {};
    const target =
      item.parent_name ||
      (item.parent_kind === 'community' ? 'a community' : 'a conversation');
    return (
      <Card
        key={item.id}
        variant="outlined"
        sx={{
          mb: 1.25,
          borderColor: alpha(theme.palette.divider, 0.4),
          transition: 'all .18s ease',
          '&:hover': { borderColor: theme.palette.primary.main },
        }}
      >
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar
            sx={{
              width: 48, height: 48,
              bgcolor: alpha(theme.palette.primary.main, 0.15),
              color: theme.palette.primary.main,
              fontWeight: 700,
            }}
          >
            {initialsFor(inviter)}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {inviter.display_name || inviter.username || 'Someone'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              invited you to {target}
              {item.role_offered ? ` as ${item.role_offered}` : ''}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <Button
              size="small"
              variant="contained"
              color="success"
              startIcon={<CheckIcon />}
              onClick={handleAccept(item.id)}
              disabled={busyId === item.id}
            >
              Accept
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<CloseIcon />}
              onClick={handleReject(item.id)}
              disabled={busyId === item.id}
            >
              Decline
            </Button>
          </Stack>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        mb: 2,
      }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Invites
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setComposeOpen(true)}
        >
          New invite
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : incoming.length === 0 ? (
        <EmptyState
          icon={EmailOutlinedIcon}
          message="No incoming invites — tap New invite to send one."
        />
      ) : (
        <Box>{incoming.map(renderIncoming)}</Box>
      )}

      {/* Compose dialog */}
      <Dialog
        open={composeOpen}
        onClose={closeCompose}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ pb: 1 }}>
          Invite to {routeParentName ? `#${routeParentName}` : 'community'}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {!routeParentKind && (
            <FormHelperText error sx={{ mb: 2 }}>
              Open this dialog from a community or conversation page.
            </FormHelperText>
          )}

          <ToggleButtonGroup
            value={shareableLink ? 'link' : 'targeted'}
            exclusive
            onChange={(_, v) => v && setShareableLink(v === 'link')}
            sx={{ mb: 2 }}
            fullWidth
          >
            <ToggleButton value="targeted">
              <PeopleIcon fontSize="small" sx={{ mr: 1 }} />
              Specific people
            </ToggleButton>
            <ToggleButton value="link">
              <LinkIcon fontSize="small" sx={{ mr: 1 }} />
              Anyone with link
            </ToggleButton>
          </ToggleButtonGroup>

          {!shareableLink && (
            <>
              {selectedInvitees.length > 0 && (
                <Stack
                  direction="row"
                  spacing={1}
                  flexWrap="wrap"
                  sx={{ mb: 2, gap: 1 }}
                >
                  {selectedInvitees.map((u) => (
                    <Chip
                      key={u.id}
                      label={u.display_name || u.username || 'User'}
                      onDelete={() => removeInvitee(u.id)}
                      size="small"
                    />
                  ))}
                </Stack>
              )}
              <TextField
                label="Search by username"
                size="small"
                fullWidth
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  endAdornment: searching ? (
                    <CircularProgress size={16} />
                  ) : null,
                }}
                sx={{ mb: 1.5 }}
              />
              {searchResults.length > 0 && (
                <Box sx={{
                  border: `1px solid ${alpha(theme.palette.divider, 0.4)}`,
                  borderRadius: 1, mb: 2, maxHeight: 240, overflow: 'auto',
                }}>
                  {searchResults.map((u) => (
                    <Box
                      key={u.id}
                      onClick={() => addInvitee(u)}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1.5,
                        px: 1.5, py: 1, cursor: 'pointer',
                        '&:hover': {
                          backgroundColor:
                            alpha(theme.palette.action.hover, 0.4),
                        },
                      }}
                    >
                      <Avatar
                        sx={{
                          width: 32, height: 32,
                          bgcolor: alpha(theme.palette.primary.main, 0.15),
                          color: theme.palette.primary.main,
                          fontSize: 13, fontWeight: 700,
                        }}
                      >
                        {initialsFor(u)}
                      </Avatar>
                      <Box>
                        <Typography variant="body2">
                          {u.display_name || u.username}
                        </Typography>
                        {u.username && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            @{u.username}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </>
          )}

          <Typography variant="overline" color="text.secondary">
            Role
          </Typography>
          <ToggleButtonGroup
            value={role}
            exclusive
            onChange={(_, v) => v && setRole(v)}
            size="small"
            sx={{ mt: 0.5, display: 'flex' }}
            fullWidth
          >
            {ROLES.map((r) => (
              <ToggleButton key={r.key} value={r.key} sx={{ flex: 1 }}>
                {r.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {shareableLink && (
            <FormHelperText sx={{ mt: 1.5 }}>
              A 7-day shareable link will be generated.  Anyone with the
              link can join with the role above (subject to community
              privacy).
            </FormHelperText>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCompose}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSend}
            disabled={sending || !routeParentKind}
          >
            {sending ? <CircularProgress size={18} /> : 'Send'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3500}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert
            severity={toast.severity}
            onClose={() => setToast(null)}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {toast.message}
          </Alert>
        ) : null}
      </Snackbar>
    </Box>
  );
}
