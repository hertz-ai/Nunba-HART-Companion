/**
 * FriendsPage — Nunba web parity for the RN FriendsScreen + iOS friend
 * surface.  Phase 7c.1 + Plan D.9 + Plan F.14.
 *
 * Three tabs, mirrors the RN dark-card vocabulary inside MUI:
 *   - Friends   — active two-way friendships.  Actions: Message, Unfriend, Block.
 *   - Pending   — incoming requests (Accept/Reject) and outgoing (Cancel).
 *   - Blocked   — users this account has blocked.  Action: Unblock.
 *
 * Backend: friendsApi from services/socialApi.  Server flag-gated by
 * `friends_v2`; off → list endpoints return [], page renders empty
 * states cleanly.
 *
 * Style: matches CommunityListPage.js — MUI Cards, gradient avatar
 * surfaces, optimistic UI updates, EmptyState component for the
 * zero-data path.  Stays inside the existing socialTokens palette.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Tabs, Tab, Avatar, Button,
  Stack, Chip, IconButton, CircularProgress, Snackbar, Alert,
  Tooltip,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import PeopleIcon from '@mui/icons-material/People';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import BlockIcon from '@mui/icons-material/Block';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';

import { friendsApi } from '../../../services/socialApi';
import EmptyState from '../shared/EmptyState';

const TABS = [
  { key: 'friends', label: 'Friends',  icon: <PeopleIcon fontSize="small" /> },
  { key: 'pending', label: 'Pending',  icon: <HourglassEmptyIcon fontSize="small" /> },
  { key: 'blocked', label: 'Blocked',  icon: <BlockIcon fontSize="small" /> },
];

const initialsFor = (u) => {
  const name = u?.display_name || u?.username || '?';
  return name.trim().slice(0, 2).toUpperCase();
};

export default function FriendsPage() {
  const theme = useTheme();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('friends');
  const [friends, setFriends] = useState([]);
  const [pending, setPending] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);  // {message, severity}

  const fetchAll = useCallback(async () => {
    try {
      const [f, p, b] = await Promise.all([
        friendsApi.list('active').catch(() => ({ data: [] })),
        friendsApi.listPending().catch(() => ({ data: [] })),
        friendsApi.listBlocks().catch(() => ({ data: [] })),
      ]);
      setFriends(f?.data?.data || f?.data || []);
      setPending(p?.data?.data || p?.data || []);
      setBlocked(b?.data?.data || b?.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const showError = (message) =>
    setToast({ message, severity: 'error' });
  const showSuccess = (message) =>
    setToast({ message, severity: 'success' });

  const withBusy = async (id, fn, successMsg) => {
    setBusyId(id);
    try {
      await fn();
      if (successMsg) showSuccess(successMsg);
      await fetchAll();
    } catch (e) {
      showError(e?.response?.data?.error || e?.message || 'Try again later.');
    } finally {
      setBusyId(null);
    }
  };

  // ── Mutations ─────────────────────────────────────────────────────

  const handleAccept = (id) =>
    withBusy(id, () => friendsApi.accept(id), 'Friend request accepted');
  const handleReject = (id) =>
    withBusy(id, () => friendsApi.reject(id), 'Friend request declined');
  const handleCancel = (id) =>
    withBusy(id, () => friendsApi.cancel(id), 'Request canceled');
  const handleUnfriend = (uid) =>
    withBusy(uid, () => friendsApi.unfriend(uid), 'Unfriended');
  const handleBlock = (uid) =>
    withBusy(uid, () => friendsApi.block(uid), 'Blocked');
  const handleUnblock = (uid) =>
    withBusy(uid, () => friendsApi.unblock(uid), 'Unblocked');
  const handleMessage = (uid) => navigate(`/conversations/dm/${uid}`);

  // ── Tab content renderers ─────────────────────────────────────────

  const renderRow = (item, kind) => {
    const isFriendsTab = kind === 'friends';
    const isPendingTab = kind === 'pending';
    const isBlockedTab = kind === 'blocked';

    const other = isBlockedTab
      ? (item.blocked_user || {})
      : (item.other_user || {});
    const id = other.id || item.id;
    const name = other.display_name || other.username || 'User';
    const handle = other.username ? `@${other.username}` : '';

    return (
      <Card
        key={item.id || id}
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
            {initialsFor(other)}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {name}
            </Typography>
            {isPendingTab && (
              <Typography variant="caption" color="text.secondary">
                {item.direction === 'incoming'
                  ? 'wants to be friends'
                  : 'request sent'}
              </Typography>
            )}
            {!isPendingTab && handle && (
              <Typography variant="caption" color="text.secondary">
                {handle}
              </Typography>
            )}
            {isBlockedTab && item.reason && (
              <Typography
                variant="caption"
                sx={{ display: 'block', fontStyle: 'italic', color: 'text.disabled' }}
                noWrap
              >
                Reason: {item.reason}
              </Typography>
            )}
          </Box>

          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            {isFriendsTab && (
              <>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<ChatBubbleOutlineIcon />}
                  onClick={() => handleMessage(id)}
                  disabled={busyId === id}
                >
                  Message
                </Button>
                <Tooltip title="Unfriend">
                  <IconButton
                    size="small"
                    onClick={() => handleUnfriend(id)}
                    disabled={busyId === id}
                  >
                    <PersonRemoveIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Block">
                  <IconButton
                    size="small"
                    onClick={() => handleBlock(id)}
                    disabled={busyId === id}
                  >
                    <BlockIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </>
            )}
            {isPendingTab && item.direction === 'incoming' && (
              <>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={<CheckIcon />}
                  onClick={() => handleAccept(item.id)}
                  disabled={busyId === item.id}
                >
                  Accept
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<CloseIcon />}
                  onClick={() => handleReject(item.id)}
                  disabled={busyId === item.id}
                >
                  Reject
                </Button>
              </>
            )}
            {isPendingTab && item.direction !== 'incoming' && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleCancel(item.id)}
                disabled={busyId === item.id}
              >
                Cancel
              </Button>
            )}
            {isBlockedTab && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleUnblock(id)}
                disabled={busyId === id}
              >
                Unblock
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>
    );
  };

  // ── Tab dispatch ──────────────────────────────────────────────────

  const dataForTab =
    activeTab === 'friends' ? friends :
    activeTab === 'pending' ? pending :
    blocked;

  // EmptyState contract: { message, icon, action } — no separate title
  // field, so we collapse title + hint into the message string.
  const emptyForTab = {
    friends: {
      icon: PeopleIcon,
      message: 'No friends yet — accept a pending request or send one from a profile.',
    },
    pending: {
      icon: HourglassEmptyIcon,
      message: 'No pending requests right now.',
    },
    blocked: {
      icon: BlockIcon,
      message: "You haven't blocked anyone.",
    },
  }[activeTab];

  const countFor = (k) =>
    k === 'friends' ? friends.length :
    k === 'pending' ? pending.length :
    blocked.length;

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}>
      <Typography
        variant="h4"
        sx={{ fontWeight: 700, mb: 2 }}
      >
        Friends
      </Typography>

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        variant="fullWidth"
        textColor="primary"
        indicatorColor="primary"
        sx={{
          mb: 2.5,
          borderRadius: 2,
          backgroundColor: alpha(theme.palette.background.paper, 0.6),
          border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
          minHeight: 44,
        }}
      >
        {TABS.map(t => (
          <Tab
            key={t.key}
            value={t.key}
            iconPosition="start"
            icon={t.icon}
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <span>{t.label}</span>
                {countFor(t.key) > 0 && (
                  <Chip
                    label={countFor(t.key)}
                    size="small"
                    sx={{ height: 18, fontSize: 11, fontWeight: 700 }}
                  />
                )}
              </Stack>
            }
            sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
          />
        ))}
      </Tabs>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : dataForTab.length === 0 ? (
        <EmptyState
          icon={emptyForTab.icon}
          message={emptyForTab.message}
        />
      ) : (
        <Box>
          {dataForTab.map((item) => renderRow(item, activeTab))}
        </Box>
      )}

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
