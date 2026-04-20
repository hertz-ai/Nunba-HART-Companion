import { useSocial } from '../../contexts/SocialContext';
import {adminApi} from '../../services/socialApi';

import PeopleIcon from '@mui/icons-material/People';
import SearchIcon from '@mui/icons-material/Search';
import VerifiedIcon from '@mui/icons-material/Verified';
import {
  Typography,
  TextField,
  InputAdornment,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Chip,
  Box,
  Skeleton,
  Fade,
  Grow,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  Tooltip,
  IconButton,
} from '@mui/material';
import React, {useState, useEffect, useMemo} from 'react';

// Role color mapping
const ROLE_COLORS = {
  central: '#a855f7',
  regional: '#9B94FF',
  flat: '#6C63FF',
  guest: 'rgba(255,255,255,0.5)',
};

const ROLE_LABELS = {
  central: 'Central',
  regional: 'Regional',
  flat: 'Flat',
  guest: 'Guest',
};

const ROLE_DESCRIPTIONS = {
  central: 'Full network admin — user management, moderation, all settings',
  regional: 'Moderator — content moderation, report management',
  flat: 'Registered user — create posts, comment, vote',
  guest: 'Read-only access — can browse but not write',
};

// Relative time helper
function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  if (diff < 0) return 'just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// Reusable styles matching DashboardPage
const cardStyle = {
  background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 26, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 3,
  overflow: 'hidden',
};

const tableRowStyle = {
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    background: 'rgba(108, 99, 255, 0.05)',
    transform: 'scale(1.01)',
  },
};

const actionButtonStyle = {
  borderRadius: 2,
  textTransform: 'none',
  fontWeight: 500,
  transition: 'all 0.3s ease',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
};

// Table skeleton for loading state
function TableSkeleton() {
  return (
    <Box sx={cardStyle}>
      <Box sx={{p: 2}}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Box key={i} sx={{display: 'flex', gap: 2, mb: 2, alignItems: 'center'}}>
            <Skeleton variant="circular" width={40} height={40} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
            <Box sx={{flex: 1}}>
              <Skeleton variant="text" width="60%" sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
              <Skeleton variant="text" width="40%" sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
            </Box>
            <Skeleton variant="rounded" width={80} height={24} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
            <Skeleton variant="rounded" width={60} height={24} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
            <Skeleton variant="rounded" width={80} height={32} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// Stat card component
function StatCard({label, count, color, selected, onClick}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        ...cardStyle,
        flex: 1,
        minWidth: 120,
        p: 2,
        cursor: 'pointer',
        borderColor: selected ? color : 'rgba(255,255,255,0.05)',
        transition: 'all 0.3s ease',
        '&:hover': {
          borderColor: color,
          transform: 'translateY(-2px)',
          boxShadow: `0 4px 20px ${color}20`,
        },
      }}
    >
      <Typography sx={{color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 500, mb: 0.5}}>
        {label}
      </Typography>
      <Typography sx={{color, fontSize: '1.5rem', fontWeight: 700}}>
        {count}
      </Typography>
    </Box>
  );
}

// Role chip display
function RoleChip({role}) {
  const color = ROLE_COLORS[role] || ROLE_COLORS.guest;
  return (
    <Chip
      size="small"
      label={ROLE_LABELS[role] || role || 'flat'}
      sx={{
        background: `${color}20`,
        color,
        border: `1px solid ${color}40`,
        fontWeight: 500,
        fontSize: '0.75rem',
      }}
    />
  );
}

// Confirmation dialog for role changes
function ConfirmRoleDialog({open, onClose, onConfirm, user, newRole, loading}) {
  const [confirmText, setConfirmText] = useState('');
  const currentRole = user?.role || 'flat';
  const isPromotion = getRoleLevel(newRole) > getRoleLevel(currentRole);
  const isCentralChange = newRole === 'central' || currentRole === 'central';
  const needsTypingConfirm = newRole === 'central';

  // Reset confirm text when dialog opens
  useEffect(() => {
    if (open) setConfirmText('');
  }, [open]);

  const transitionMessage = getTransitionMessage(currentRole, newRole, user?.username);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 3,
          minWidth: 400,
        },
      }}
    >
      <DialogTitle sx={{
        color: '#fff',
        fontWeight: 600,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        Change User Role
      </DialogTitle>
      <DialogContent sx={{pt: 3}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 3}}>
          <Box sx={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', fontWeight: 600, color: '#fff',
          }}>
            {(user?.username || 'U')[0].toUpperCase()}
          </Box>
          <Box>
            <Typography sx={{color: '#fff', fontWeight: 600}}>{user?.username}</Typography>
            <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mt: 0.5}}>
              <RoleChip role={currentRole} />
              <Typography sx={{color: 'rgba(255,255,255,0.3)'}}>→</Typography>
              <RoleChip role={newRole} />
            </Box>
          </Box>
        </Box>

        <Box sx={{
          p: 2, borderRadius: 2, mb: 2,
          background: isCentralChange ? 'rgba(255, 152, 0, 0.1)' : 'rgba(255,255,255,0.03)',
          border: isCentralChange ? '1px solid rgba(255, 152, 0, 0.2)' : '1px solid rgba(255,255,255,0.05)',
        }}>
          <Typography sx={{color: isCentralChange ? '#ff9800' : 'rgba(255,255,255,0.7)', fontSize: '0.9rem'}}>
            {transitionMessage}
          </Typography>
        </Box>

        <Box sx={{p: 2, borderRadius: 2, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)'}}>
          <Typography sx={{color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', mb: 0.5}}>
            {ROLE_LABELS[newRole]} role includes:
          </Typography>
          <Typography sx={{color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem'}}>
            {ROLE_DESCRIPTIONS[newRole]}
          </Typography>
        </Box>

        {needsTypingConfirm && (
          <Box sx={{mt: 2}}>
            <Typography sx={{color: '#ff9800', fontSize: '0.85rem', mb: 1}}>
              Type <strong style={{color: '#fff'}}>{user?.username}</strong> to confirm central promotion:
            </Typography>
            <TextField
              fullWidth
              size="small"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={user?.username}
              sx={{
                '& .MuiOutlinedInput-root': {
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 2,
                  '& fieldset': {borderColor: 'rgba(255, 152, 0, 0.3)'},
                  '&.Mui-focused fieldset': {borderColor: '#ff9800'},
                },
                '& .MuiInputBase-input': {color: '#fff'},
              }}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{px: 3, pb: 2, borderTop: '1px solid rgba(255,255,255,0.05)'}}>
        <Button
          onClick={onClose}
          sx={{color: 'rgba(255,255,255,0.5)', textTransform: 'none'}}
        >
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading || (needsTypingConfirm && confirmText !== user?.username)}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 2,
            px: 3,
            background: isPromotion
              ? 'linear-gradient(135deg, rgba(108, 99, 255, 0.2) 0%, rgba(155, 148, 255, 0.2) 100%)'
              : 'linear-gradient(135deg, rgba(255, 68, 68, 0.2) 0%, rgba(255, 100, 100, 0.2) 100%)',
            color: isPromotion ? '#6C63FF' : '#ff6b6b',
            border: isPromotion ? '1px solid rgba(108, 99, 255, 0.3)' : '1px solid rgba(255, 68, 68, 0.3)',
            '&:hover': {
              background: isPromotion
                ? 'linear-gradient(135deg, rgba(108, 99, 255, 0.3) 0%, rgba(155, 148, 255, 0.3) 100%)'
                : 'linear-gradient(135deg, rgba(255, 68, 68, 0.3) 0%, rgba(255, 100, 100, 0.3) 100%)',
            },
            '&.Mui-disabled': {
              color: 'rgba(255,255,255,0.2)',
              borderColor: 'rgba(255,255,255,0.05)',
            },
          }}
        >
          {loading ? 'Applying...' : 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function getRoleLevel(role) {
  const levels = {guest: 1, flat: 2, regional: 3, central: 4};
  return levels[role] || 0;
}

function getTransitionMessage(from, to, username) {
  const fromLabel = ROLE_LABELS[from] || from;
  const toLabel = ROLE_LABELS[to] || to;

  if (to === 'central' && from !== 'central') {
    return `This grants ${username} full network admin access including user management, moderation, and all system settings. This action requires master key authorization.`;
  }
  if (from === 'central' && to === 'regional') {
    return `This will revoke network admin privileges from ${username}. They will retain moderator access (content moderation, report management).`;
  }
  if (from === 'central' && to === 'flat') {
    return `This will revoke ALL admin and moderator privileges from ${username}. They will become a regular user.`;
  }
  if (from === 'central' && to === 'guest') {
    return `This will revoke ALL privileges from ${username} including write access. They will be downgraded to read-only guest.`;
  }
  if (to === 'regional' && from === 'flat') {
    return `Grant moderator privileges to ${username}? They will be able to moderate content and manage reports.`;
  }
  if (from === 'regional' && to === 'flat') {
    return `Remove moderator privileges from ${username}? They will become a regular user.`;
  }
  if (to === 'guest') {
    return `Downgrade ${username} to guest? They will lose write access and can only browse content.`;
  }
  if (from === 'guest' && to === 'flat') {
    return `Grant full user access to ${username}? They will be able to create posts, comment, and vote.`;
  }
  return `Change ${username}'s role from ${fromLabel} to ${toLabel}?`;
}

export default function UsersManagementPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [confirmDialog, setConfirmDialog] = useState({open: false, user: null, newRole: null});
  const [snackbar, setSnackbar] = useState({open: false, message: '', severity: 'success'});
  const { currentUser } = useSocial();

  const loadUsers = async (q) => {
    setLoading(true);
    try {
      const res = await adminApi.users({q, limit: 50});
      setUsers(res.data || []);
    } catch (err) {
      showSnackbar('Failed to load users', 'error');
    }
    setLoading(false);
  };

  useEffect(() => {
    const debounce = setTimeout(() => loadUsers(query), 400);
    return () => clearTimeout(debounce);
  }, [query]);

  const showSnackbar = (message, severity = 'success') => {
    setSnackbar({open: true, message, severity});
  };

  // Role stats computed from loaded users
  const roleStats = useMemo(() => {
    const stats = {central: 0, regional: 0, flat: 0, guest: 0, banned: 0};
    users.forEach(u => {
      if (u.is_banned) stats.banned++;
      const role = u.role || 'flat';
      if (stats[role] !== undefined) stats[role]++;
    });
    return stats;
  }, [users]);

  const centralCount = roleStats.central;

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const role = u.role || 'flat';
      if (roleFilter !== 'all' && role !== roleFilter) return false;
      if (statusFilter === 'active' && u.is_banned) return false;
      if (statusFilter === 'banned' && !u.is_banned) return false;
      if (statusFilter === 'verified' && !u.is_verified) return false;
      return true;
    });
  }, [users, roleFilter, statusFilter]);

  const handleBan = async (userId) => {
    setActionLoading(userId);
    try {
      await adminApi.banUser(userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? {...u, is_banned: true} : u))
      );
      showSnackbar('User banned successfully');
    } catch (err) {
      showSnackbar('Failed to ban user', 'error');
    }
    setActionLoading(null);
  };

  const handleUnban = async (userId) => {
    setActionLoading(userId);
    try {
      await adminApi.unbanUser(userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? {...u, is_banned: false} : u))
      );
      showSnackbar('User unbanned successfully');
    } catch (err) {
      showSnackbar('Failed to unban user', 'error');
    }
    setActionLoading(null);
  };

  const handleRoleSelectChange = (user, newRole) => {
    if (newRole === (user.role || 'flat')) return;
    setConfirmDialog({open: true, user, newRole});
  };

  const confirmRoleChange = async () => {
    const {user, newRole} = confirmDialog;
    if (!user || !newRole) return;
    setActionLoading(user.id);
    try {
      await adminApi.updateUser(user.id, {role: newRole});
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? {...u, role: newRole} : u))
      );
      showSnackbar(`${user.username}'s role changed to ${ROLE_LABELS[newRole]}`);
    } catch (err) {
      showSnackbar('Failed to change role', 'error');
    }
    setActionLoading(null);
    setConfirmDialog({open: false, user: null, newRole: null});
  };

  const handleVerifyToggle = async (user) => {
    const newVerified = !user.is_verified;
    // Optimistic update
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? {...u, is_verified: newVerified} : u))
    );
    try {
      await adminApi.updateUser(user.id, {is_verified: newVerified});
      showSnackbar(newVerified ? `${user.username} verified` : `${user.username} unverified`);
    } catch (err) {
      // Revert
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? {...u, is_verified: !newVerified} : u))
      );
      showSnackbar('Failed to update verification', 'error');
    }
  };

  const isSelf = (userId) => currentUser && String(currentUser.id) === String(userId);
  const isLastCentral = (user) => (user.role || 'flat') === 'central' && centralCount <= 1;

  const roleFilterChips = ['all', 'central', 'regional', 'flat', 'guest'];
  const statusFilterChips = ['all', 'active', 'banned', 'verified'];

  return (
    <Fade in={true} timeout={300}>
      <Box>
        {/* Page Header */}
        <Box sx={{mb: 4}}>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 1}}>
            <Box sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.15) 0%, rgba(155, 148, 255, 0.15) 100%)',
            }}>
              <PeopleIcon sx={{
                fontSize: 24,
                background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }} />
            </Box>
            <Box>
              <Typography variant="h4" sx={{
                fontWeight: 700,
                background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                User Management
              </Typography>
              <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                Manage roles, privileges, and moderation
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Role Stats Row */}
        <Grow in={!loading} timeout={400}>
          <Box sx={{display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap'}}>
            <StatCard
              label="Central" count={roleStats.central} color={ROLE_COLORS.central}
              selected={roleFilter === 'central'}
              onClick={() => setRoleFilter(f => f === 'central' ? 'all' : 'central')}
            />
            <StatCard
              label="Regional" count={roleStats.regional} color={ROLE_COLORS.regional}
              selected={roleFilter === 'regional'}
              onClick={() => setRoleFilter(f => f === 'regional' ? 'all' : 'regional')}
            />
            <StatCard
              label="Flat" count={roleStats.flat} color={ROLE_COLORS.flat}
              selected={roleFilter === 'flat'}
              onClick={() => setRoleFilter(f => f === 'flat' ? 'all' : 'flat')}
            />
            <StatCard
              label="Guest" count={roleStats.guest} color={ROLE_COLORS.guest}
              selected={roleFilter === 'guest'}
              onClick={() => setRoleFilter(f => f === 'guest' ? 'all' : 'guest')}
            />
            <StatCard
              label="Banned" count={roleStats.banned} color="#ff4444"
              selected={statusFilter === 'banned'}
              onClick={() => {
                setStatusFilter(f => f === 'banned' ? 'all' : 'banned');
                if (statusFilter !== 'banned') setRoleFilter('all');
              }}
            />
          </Box>
        </Grow>

        {/* Search Field */}
        <Grow in={true} timeout={400}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Search users by name, email, or ID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{
              mb: 2,
              '& .MuiOutlinedInput-root': {
                background: 'rgba(26, 26, 46, 0.8)',
                backdropFilter: 'blur(10px)',
                borderRadius: 3,
                transition: 'all 0.3s ease',
                '& fieldset': {
                  borderColor: 'rgba(255,255,255,0.1)',
                },
                '&:hover fieldset': {
                  borderColor: 'rgba(108, 99, 255, 0.3)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#6C63FF',
                  boxShadow: '0 0 20px rgba(108, 99, 255, 0.2)',
                },
              },
              '& .MuiInputBase-input': {
                color: '#fff',
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{color: 'rgba(255,255,255,0.5)'}} />
                </InputAdornment>
              ),
            }}
          />
        </Grow>

        {/* Filter Chips */}
        <Box sx={{display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap', alignItems: 'center'}}>
          <Typography sx={{color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', mr: 1}}>Role:</Typography>
          {roleFilterChips.map(f => (
            <Chip
              key={`role-${f}`}
              size="small"
              label={f === 'all' ? 'All' : ROLE_LABELS[f]}
              onClick={() => setRoleFilter(f)}
              sx={{
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.2s ease',
                background: roleFilter === f
                  ? (f === 'all' ? 'rgba(255,255,255,0.15)' : `${ROLE_COLORS[f]}25`)
                  : 'rgba(255,255,255,0.05)',
                color: roleFilter === f
                  ? (f === 'all' ? '#fff' : ROLE_COLORS[f])
                  : 'rgba(255,255,255,0.5)',
                border: roleFilter === f
                  ? `1px solid ${f === 'all' ? 'rgba(255,255,255,0.3)' : `${ROLE_COLORS[f]}50`}`
                  : '1px solid transparent',
                '&:hover': {
                  background: f === 'all' ? 'rgba(255,255,255,0.1)' : `${ROLE_COLORS[f]}15`,
                },
              }}
            />
          ))}
          <Box sx={{width: 1, height: 20, background: 'rgba(255,255,255,0.1)', mx: 1}} />
          <Typography sx={{color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', mr: 1}}>Status:</Typography>
          {statusFilterChips.map(f => {
            const statusColors = {all: '#fff', active: '#6C63FF', banned: '#ff4444', verified: '#9B94FF'};
            const c = statusColors[f];
            return (
              <Chip
                key={`status-${f}`}
                size="small"
                label={f.charAt(0).toUpperCase() + f.slice(1)}
                onClick={() => setStatusFilter(f)}
                sx={{
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.2s ease',
                  background: statusFilter === f ? `${c}20` : 'rgba(255,255,255,0.05)',
                  color: statusFilter === f ? c : 'rgba(255,255,255,0.5)',
                  border: statusFilter === f ? `1px solid ${c}40` : '1px solid transparent',
                  '&:hover': {background: `${c}10`},
                }}
              />
            );
          })}
        </Box>

        {/* Users Table */}
        {loading ? (
          <TableSkeleton />
        ) : (
          <Grow in={true} timeout={500}>
            <Box sx={cardStyle}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{
                    background: 'rgba(108, 99, 255, 0.05)',
                    '& th': {
                      color: 'rgba(255,255,255,0.7)',
                      fontWeight: 600,
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                      py: 2,
                    },
                  }}>
                    <TableCell>Username</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell sx={{textAlign: 'center'}}>Verified</TableCell>
                    <TableCell>Karma</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Joined</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredUsers.map((u, index) => {
                    const userRole = u.role || 'flat';
                    const self = isSelf(u.id);
                    const lastCentral = isLastCentral(u);
                    const selectDisabled = self || lastCentral;

                    return (
                      <Fade in={true} timeout={300 + index * 50} key={u.id}>
                        <TableRow sx={{
                          ...tableRowStyle,
                          '& td': {
                            color: '#fff',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            py: 1.5,
                          },
                        }}>
                          <TableCell>
                            <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
                              <Box sx={{
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                background: `linear-gradient(135deg, ${ROLE_COLORS[userRole]} 0%, ${ROLE_COLORS[userRole]}80 100%)`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                              }}>
                                {(u.username || 'U')[0].toUpperCase()}
                              </Box>
                              <Box>
                                <Typography sx={{fontWeight: 500, lineHeight: 1.2}}>
                                  {u.username}
                                  {self && (
                                    <Typography component="span" sx={{color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', ml: 1}}>
                                      (you)
                                    </Typography>
                                  )}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Tooltip
                              title={selectDisabled
                                ? (self ? "Cannot change your own role" : "Cannot demote the last central admin")
                                : ""}
                              arrow
                            >
                              <Box>
                                <Select
                                  value={userRole}
                                  size="small"
                                  disabled={selectDisabled}
                                  onChange={(e) => handleRoleSelectChange(u, e.target.value)}
                                  sx={{
                                    minWidth: 110,
                                    '& .MuiSelect-select': {
                                      py: 0.5,
                                      color: ROLE_COLORS[userRole],
                                      fontWeight: 500,
                                      fontSize: '0.85rem',
                                    },
                                    '& .MuiOutlinedInput-notchedOutline': {
                                      borderColor: `${ROLE_COLORS[userRole]}30`,
                                    },
                                    '&:hover .MuiOutlinedInput-notchedOutline': {
                                      borderColor: `${ROLE_COLORS[userRole]}60`,
                                    },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                      borderColor: ROLE_COLORS[userRole],
                                    },
                                    '&.Mui-disabled': {
                                      opacity: 0.5,
                                    },
                                    '& .MuiSvgIcon-root': {
                                      color: 'rgba(255,255,255,0.3)',
                                    },
                                  }}
                                  MenuProps={{
                                    PaperProps: {
                                      sx: {
                                        background: '#1a1a2e',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        '& .MuiMenuItem-root': {
                                          color: '#fff',
                                          '&:hover': {background: 'rgba(255,255,255,0.05)'},
                                          '&.Mui-selected': {background: 'rgba(108, 99, 255, 0.1)'},
                                        },
                                      },
                                    },
                                  }}
                                >
                                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                                    <MenuItem key={value} value={value}>
                                      <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                                        <Box sx={{
                                          width: 8, height: 8, borderRadius: '50%',
                                          background: ROLE_COLORS[value],
                                        }} />
                                        {label}
                                      </Box>
                                    </MenuItem>
                                  ))}
                                </Select>
                              </Box>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={u.user_type || 'human'}
                              sx={{
                                background: u.user_type === 'agent'
                                  ? 'linear-gradient(135deg, rgba(155, 148, 255, 0.2) 0%, rgba(108, 99, 255, 0.2) 100%)'
                                  : 'rgba(255,255,255,0.1)',
                                color: u.user_type === 'agent' ? '#6C63FF' : 'rgba(255,255,255,0.7)',
                                border: u.user_type === 'agent' ? '1px solid rgba(108, 99, 255, 0.3)' : 'none',
                                fontWeight: 500,
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{textAlign: 'center'}}>
                            <Tooltip title={u.is_verified ? 'Verified — click to remove' : 'Not verified — click to verify'} arrow>
                              <IconButton
                                size="small"
                                onClick={() => handleVerifyToggle(u)}
                                sx={{
                                  transition: 'all 0.3s ease',
                                  '&:hover': {
                                    transform: 'scale(1.2)',
                                  },
                                }}
                              >
                                <VerifiedIcon sx={{
                                  fontSize: 20,
                                  color: u.is_verified ? '#9B94FF' : 'rgba(255,255,255,0.15)',
                                  transition: 'color 0.3s ease',
                                }} />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{
                              color: (u.karma || 0) > 100 ? '#6C63FF' : (u.karma || 0) < 0 ? '#ff4444' : 'rgba(255,255,255,0.7)',
                              fontWeight: 600,
                            }}>
                              {u.karma || 0}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {u.is_banned ? (
                              <Chip
                                size="small"
                                label="Banned"
                                sx={{
                                  background: 'linear-gradient(135deg, rgba(255, 68, 68, 0.2) 0%, rgba(255, 100, 100, 0.2) 100%)',
                                  color: '#ff4444',
                                  border: '1px solid rgba(255, 68, 68, 0.3)',
                                  fontWeight: 500,
                                }}
                              />
                            ) : (
                              <Chip
                                size="small"
                                label="Active"
                                sx={{
                                  background: 'linear-gradient(135deg, rgba(0, 232, 157, 0.2) 0%, rgba(0, 180, 120, 0.2) 100%)',
                                  color: '#00e89d',
                                  border: '1px solid rgba(0, 232, 157, 0.3)',
                                  fontWeight: 500,
                                }}
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <Tooltip title={u.created_at ? new Date(u.created_at).toLocaleString() : ''} arrow>
                              <Typography sx={{color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem'}}>
                                {timeAgo(u.created_at)}
                              </Typography>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            {u.is_banned ? (
                              <Button
                                size="small"
                                onClick={() => handleUnban(u.id)}
                                disabled={actionLoading === u.id}
                                sx={{
                                  ...actionButtonStyle,
                                  background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.2) 0%, rgba(155, 148, 255, 0.2) 100%)',
                                  color: '#6C63FF',
                                  border: '1px solid rgba(108, 99, 255, 0.3)',
                                }}
                              >
                                {actionLoading === u.id ? 'Processing...' : 'Unban'}
                              </Button>
                            ) : (
                              <Button
                                size="small"
                                onClick={() => handleBan(u.id)}
                                disabled={actionLoading === u.id || self}
                                sx={{
                                  ...actionButtonStyle,
                                  background: 'linear-gradient(135deg, rgba(255, 68, 68, 0.2) 0%, rgba(255, 100, 100, 0.2) 100%)',
                                  color: '#ff6b6b',
                                  border: '1px solid rgba(255, 68, 68, 0.3)',
                                }}
                              >
                                {actionLoading === u.id ? 'Processing...' : 'Ban'}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      </Fade>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{py: 6}}>
                        <Box sx={{textAlign: 'center'}}>
                          <PeopleIcon sx={{fontSize: 48, color: 'rgba(255,255,255,0.2)', mb: 2}} />
                          <Typography sx={{color: 'rgba(255,255,255,0.5)'}}>
                            {users.length === 0 ? 'No users found' : 'No users match the selected filters'}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>
          </Grow>
        )}

        {/* Role Change Confirmation Dialog */}
        <ConfirmRoleDialog
          open={confirmDialog.open}
          onClose={() => setConfirmDialog({open: false, user: null, newRole: null})}
          onConfirm={confirmRoleChange}
          user={confirmDialog.user}
          newRole={confirmDialog.newRole}
          loading={actionLoading === confirmDialog.user?.id}
        />

        {/* Snackbar Feedback */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar(s => ({...s, open: false}))}
          anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
        >
          <Alert
            onClose={() => setSnackbar(s => ({...s, open: false}))}
            severity={snackbar.severity}
            variant="filled"
            sx={{
              borderRadius: 2,
              fontWeight: 500,
              ...(snackbar.severity === 'success' && {
                background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
              }),
            }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </Fade>
  );
}
