import { API_BASE_URL } from '../../config/apiBase';

import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import BlockIcon from '@mui/icons-material/Block';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ComputerIcon from '@mui/icons-material/Computer';
import DnsIcon from '@mui/icons-material/Dns';
import HubIcon from '@mui/icons-material/Hub';
import MemoryIcon from '@mui/icons-material/Memory';
import PeopleIcon from '@mui/icons-material/People';
import RefreshIcon from '@mui/icons-material/Refresh';
import SecurityIcon from '@mui/icons-material/Security';
import StorageIcon from '@mui/icons-material/Storage';
import UpgradeIcon from '@mui/icons-material/Upgrade';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import {
  Typography,
  Box,
  Tabs,
  Tab,
  Chip,
  Button,
  Skeleton,
  Fade,
  Grow,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip,
  IconButton,
  Grid,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import nacl from 'tweetnacl';


// ── Tier colors & labels ──────────────────────────────────────────────
const TIER_COLORS = {
  central: '#FFD700',
  regional: '#6C63FF',
  flat: '#72757E',
};

const TIER_LABELS = {
  central: 'Central',
  regional: 'Regional',
  flat: 'Flat',
};

const STATUS_COLORS = {
  active: '#00BFA5',
  online: '#00BFA5',
  stale: '#FFD700',
  dead: '#FF6B6B',
  offline: '#FF6B6B',
};

// ── Reusable card style (matches DashboardPage / UsersManagementPage) ─
const cardStyle = {
  background: 'linear-gradient(135deg, rgba(26, 23, 48, 0.9) 0%, rgba(15, 14, 23, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 3,
  overflow: 'hidden',
};

const actionButtonStyle = {
  borderRadius: 2,
  textTransform: 'none',
  fontWeight: 500,
  fontSize: '0.8rem',
  transition: 'all 0.3s ease',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
};

const tableRowStyle = {
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    background: 'rgba(108, 99, 255, 0.05)',
    transform: 'scale(1.005)',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────
function getAuthHeaders() {
  const jwt = localStorage.getItem('social_jwt');
  return {
    'Content-Type': 'application/json',
    ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
  };
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: getAuthHeaders(),
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

// ── Stat summary card ─────────────────────────────────────────────────
function StatCard({ label, count, color, icon }) {
  return (
    <Box sx={{
      ...cardStyle,
      flex: 1,
      minWidth: 130,
      p: 2.5,
      display: 'flex',
      alignItems: 'center',
      gap: 2,
    }}>
      <Box sx={{
        width: 44,
        height: 44,
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `${color}18`,
      }}>
        {React.cloneElement(icon, { sx: { fontSize: 22, color } })}
      </Box>
      <Box>
        <Typography sx={{ color: '#72757E', fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </Typography>
        <Typography sx={{ color: '#E8E6F0', fontSize: '1.4rem', fontWeight: 700 }}>
          {count}
        </Typography>
      </Box>
    </Box>
  );
}

// ── Tier badge ────────────────────────────────────────────────────────
function TierBadge({ tier }) {
  const color = TIER_COLORS[tier] || TIER_COLORS.flat;
  return (
    <Chip
      size="small"
      label={TIER_LABELS[tier] || tier || 'flat'}
      sx={{
        background: `${color}20`,
        color,
        border: `1px solid ${color}40`,
        fontWeight: 600,
        fontSize: '0.72rem',
        letterSpacing: '0.3px',
      }}
    />
  );
}

// ── Status dot ────────────────────────────────────────────────────────
function StatusDot({ status }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.dead;
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  return (
    <Tooltip title={label} arrow>
      <Box sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.8,
      }}>
        <Box sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 8px ${color}80`,
        }} />
        <Typography sx={{ color, fontSize: '0.8rem', fontWeight: 500 }}>
          {label}
        </Typography>
      </Box>
    </Tooltip>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────
function TableSkeleton({ rows = 5 }) {
  return (
    <Box sx={cardStyle}>
      <Box sx={{ p: 2 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
            <Skeleton variant="circular" width={36} height={36} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width="55%" sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
              <Skeleton variant="text" width="35%" sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
            </Box>
            <Skeleton variant="rounded" width={72} height={24} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
            <Skeleton variant="rounded" width={60} height={24} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
            <Skeleton variant="rounded" width={80} height={32} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ── Confirmation dialog (demote / revoke) ─────────────────────────────
function ConfirmActionDialog({ open, onClose, onConfirm, title, message, loading }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, #1A1730 0%, #0F0E17 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 3,
          minWidth: 400,
        },
      }}
    >
      <DialogTitle sx={{ color: '#E8E6F0', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {title}
      </DialogTitle>
      <DialogContent sx={{ pt: 3 }}>
        <Typography sx={{ color: '#72757E', fontSize: '0.95rem' }}>
          {message}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <Button onClick={onClose} sx={{ color: '#72757E', textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          sx={{
            ...actionButtonStyle,
            background: 'linear-gradient(135deg, rgba(255, 107, 107, 0.2) 0%, rgba(255, 68, 68, 0.2) 100%)',
            color: '#FF6B6B',
            border: '1px solid rgba(255, 107, 107, 0.3)',
          }}
        >
          {loading ? 'Processing...' : 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Approve dialog (region name input) ────────────────────────────────
function ApproveDialog({ open, onClose, onConfirm, request, loading }) {
  const [regionName, setRegionName] = useState('');

  useEffect(() => {
    if (open) setRegionName('');
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, #1A1730 0%, #0F0E17 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 3,
          minWidth: 420,
        },
      }}
    >
      <DialogTitle sx={{ color: '#E8E6F0', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        Approve Regional Host Request
      </DialogTitle>
      <DialogContent sx={{ pt: 3 }}>
        <Typography sx={{ color: '#72757E', fontSize: '0.9rem', mb: 2 }}>
          Approving <strong style={{ color: '#E8E6F0' }}>{request?.user_name || request?.username || 'this node'}</strong> as
          a regional host. Assign a region name for DNS and certificate generation.
        </Typography>
        <TextField
          fullWidth
          size="small"
          label="Region Name"
          placeholder="e.g. us-west-2, eu-central, asia-south"
          value={regionName}
          onChange={(e) => setRegionName(e.target.value)}
          sx={{
            '& .MuiOutlinedInput-root': {
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 2,
              '& fieldset': { borderColor: 'rgba(108, 99, 255, 0.3)' },
              '&.Mui-focused fieldset': { borderColor: '#6C63FF' },
            },
            '& .MuiInputBase-input': { color: '#E8E6F0' },
            '& .MuiInputLabel-root': { color: '#72757E' },
            '& .MuiInputLabel-root.Mui-focused': { color: '#6C63FF' },
          }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <Button onClick={onClose} sx={{ color: '#72757E', textTransform: 'none' }}>Cancel</Button>
        <Button
          onClick={() => onConfirm(regionName)}
          disabled={loading || !regionName.trim()}
          sx={{
            ...actionButtonStyle,
            background: 'linear-gradient(135deg, rgba(0, 191, 165, 0.2) 0%, rgba(0, 150, 130, 0.2) 100%)',
            color: '#00BFA5',
            border: '1px solid rgba(0, 191, 165, 0.3)',
            '&.Mui-disabled': { color: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.05)' },
          }}
        >
          {loading ? 'Approving...' : 'Approve'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Reject dialog (reason input) ──────────────────────────────────────
function RejectDialog({ open, onClose, onConfirm, request, loading }) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, #1A1730 0%, #0F0E17 100%)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 3,
          minWidth: 420,
        },
      }}
    >
      <DialogTitle sx={{ color: '#E8E6F0', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        Reject Regional Host Request
      </DialogTitle>
      <DialogContent sx={{ pt: 3 }}>
        <Typography sx={{ color: '#72757E', fontSize: '0.9rem', mb: 2 }}>
          Rejecting request from <strong style={{ color: '#E8E6F0' }}>{request?.user_name || request?.username || 'this node'}</strong>.
          Provide a reason (optional but recommended).
        </Typography>
        <TextField
          fullWidth
          size="small"
          label="Rejection Reason"
          placeholder="e.g. Insufficient compute resources"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          multiline
          rows={2}
          sx={{
            '& .MuiOutlinedInput-root': {
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 2,
              '& fieldset': { borderColor: 'rgba(255, 107, 107, 0.3)' },
              '&.Mui-focused fieldset': { borderColor: '#FF6B6B' },
            },
            '& .MuiInputBase-input': { color: '#E8E6F0' },
            '& .MuiInputLabel-root': { color: '#72757E' },
            '& .MuiInputLabel-root.Mui-focused': { color: '#FF6B6B' },
          }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <Button onClick={onClose} sx={{ color: '#72757E', textTransform: 'none' }}>Cancel</Button>
        <Button
          onClick={() => onConfirm(reason)}
          disabled={loading}
          sx={{
            ...actionButtonStyle,
            background: 'linear-gradient(135deg, rgba(255, 107, 107, 0.2) 0%, rgba(255, 68, 68, 0.2) 100%)',
            color: '#FF6B6B',
            border: '1px solid rgba(255, 107, 107, 0.3)',
          }}
        >
          {loading ? 'Rejecting...' : 'Reject'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════
export default function NetworkNodesPage() {
  const [tab, setTab] = useState(0);
  const [nodes, setNodes] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loadingNodes, setLoadingNodes] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Dialogs
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const [approveDialog, setApproveDialog] = useState({ open: false, request: null });
  const [rejectDialog, setRejectDialog] = useState({ open: false, request: null });

  // Tier upgrade
  const [tierInfo, setTierInfo] = useState(null);
  const [masterKeyInput, setMasterKeyInput] = useState('');
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // Elastic capacity
  const [regionCapacities, setRegionCapacities] = useState([]);
  const [loadingCapacity, setLoadingCapacity] = useState(true);

  const showSnackbar = useCallback((message, severity = 'success') => {
    setSnackbar({ open: true, message, severity });
  }, []);

  // ── Fetch nodes ──
  const fetchNodes = useCallback(async () => {
    try {
      const data = await apiFetch('/api/social/peers');
      setNodes(data.peers || []);
    } catch (err) {
      showSnackbar(`Failed to load nodes: ${err.message}`, 'error');
    }
    setLoadingNodes(false);
  }, [showSnackbar]);

  // ── Fetch requests ──
  const fetchRequests = useCallback(async () => {
    try {
      const data = await apiFetch('/api/social/regional-host/requests');
      setRequests(data.requests || []);
    } catch (err) {
      showSnackbar(`Failed to load requests: ${err.message}`, 'error');
    }
    setLoadingRequests(false);
  }, [showSnackbar]);

  // ── Fetch tier info ──
  const fetchTierInfo = useCallback(async () => {
    try {
      const data = await apiFetch('/api/social/hierarchy/tier-info');
      setTierInfo(data);
    } catch { /* non-critical */ }
  }, []);

  // ── Fetch region capacities ──
  const fetchCapacities = useCallback(async () => {
    try {
      const data = await apiFetch('/api/social/regional-host/capacity');
      setRegionCapacities(data.regions || []);
    } catch { /* non-critical */ }
    setLoadingCapacity(false);
  }, []);

  // ── Upgrade to central (challenge-response — private key NEVER sent over HTTP) ──
  const handleUpgrade = async () => {
    const keyHex = masterKeyInput.trim();
    if (!keyHex) return;
    setUpgradeLoading(true);
    try {
      // 1. Get challenge nonce from backend
      const challengeData = await apiFetch('/api/social/hierarchy/upgrade-challenge');
      const challengeHex = challengeData.challenge;

      // 2. Parse the private key locally and sign the challenge
      // Ed25519 seed is 32 bytes (64 hex chars). tweetnacl expects seed → keypair.
      const seedBytes = new Uint8Array(keyHex.match(/.{1,2}/g).slice(0, 32).map((b) => parseInt(b, 16)));
      if (seedBytes.length !== 32) {
        throw new Error('Key must be 64 hex characters (32 bytes Ed25519 seed)');
      }
      const keyPair = nacl.sign.keyPair.fromSeed(seedBytes);
      const challengeBytes = new Uint8Array(challengeHex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
      const signature = nacl.sign.detached(challengeBytes, keyPair.secretKey);

      // 3. Derive public key hex
      const pubHex = Array.from(keyPair.publicKey).map((b) => b.toString(16).padStart(2, '0')).join('');
      const sigHex = Array.from(signature).map((b) => b.toString(16).padStart(2, '0')).join('');

      // 4. Send ONLY signature + public key (private key stays in browser memory)
      const result = await apiFetch('/api/social/hierarchy/verify-upgrade', {
        method: 'POST',
        body: JSON.stringify({
          challenge: challengeHex,
          signature: sigHex,
          public_key_hex: pubHex,
        }),
      });

      // 5. Clear the key from state immediately
      setMasterKeyInput('');
      showSnackbar(result.message || 'Upgrading to central...');

      setTimeout(() => {
        showSnackbar('Node is restarting as central. Page will reload shortly.', 'info');
        setTimeout(() => window.location.reload(), 5000);
      }, 2000);
    } catch (err) {
      showSnackbar(`Upgrade failed: ${err.message}`, 'error');
    }
    setUpgradeLoading(false);
  };

  // Initial load
  useEffect(() => {
    fetchNodes();
    fetchRequests();
    fetchTierInfo();
    fetchCapacities();
  }, [fetchNodes, fetchRequests, fetchTierInfo, fetchCapacities]);

  // Auto-refresh peers every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchNodes, 30000);
    return () => clearInterval(interval);
  }, [fetchNodes]);

  // ── Actions ──
  const handlePromote = async (nodeId) => {
    setActionLoading(nodeId);
    try {
      await apiFetch('/api/social/hierarchy/promote', {
        method: 'POST',
        body: JSON.stringify({ node_id: nodeId }),
      });
      showSnackbar('Node promoted to regional');
      fetchNodes();
    } catch (err) {
      showSnackbar(`Promote failed: ${err.message}`, 'error');
    }
    setActionLoading(null);
  };

  const handleDemote = (nodeId, nodeName) => {
    setConfirmDialog({
      open: true,
      title: 'Demote Regional Node',
      message: `Are you sure you want to demote "${nodeName || nodeId}" back to flat? This will notify the node to reload.`,
      onConfirm: async () => {
        setActionLoading(nodeId);
        setConfirmDialog((d) => ({ ...d, open: false }));
        try {
          await apiFetch('/api/social/hierarchy/demote', {
            method: 'POST',
            body: JSON.stringify({ node_id: nodeId }),
          });
          showSnackbar('Node demoted to flat');
          fetchNodes();
        } catch (err) {
          showSnackbar(`Demote failed: ${err.message}`, 'error');
        }
        setActionLoading(null);
      },
    });
  };

  const handleRevoke = (requestId, nodeName) => {
    setConfirmDialog({
      open: true,
      title: 'Revoke Regional Certificate',
      message: `Are you sure you want to revoke the regional certificate for "${nodeName || requestId}"? This will notify the node to reload.`,
      onConfirm: async () => {
        setActionLoading(requestId);
        setConfirmDialog((d) => ({ ...d, open: false }));
        try {
          await apiFetch('/api/social/regional-host/revoke', {
            method: 'POST',
            body: JSON.stringify({ request_id: requestId }),
          });
          showSnackbar('Certificate revoked');
          fetchNodes();
          fetchRequests();
        } catch (err) {
          showSnackbar(`Revoke failed: ${err.message}`, 'error');
        }
        setActionLoading(null);
      },
    });
  };

  const handleApprove = async (regionName) => {
    const req = approveDialog.request;
    if (!req) return;
    setActionLoading(req.id || req.request_id);
    try {
      await apiFetch('/api/social/regional-host/approve', {
        method: 'POST',
        body: JSON.stringify({ request_id: req.id || req.request_id, region_name: regionName }),
      });
      showSnackbar('Request approved — certificate issued');
      setApproveDialog({ open: false, request: null });
      fetchRequests();
      fetchNodes();
    } catch (err) {
      showSnackbar(`Approve failed: ${err.message}`, 'error');
    }
    setActionLoading(null);
  };

  const handleReject = async (reason) => {
    const req = rejectDialog.request;
    if (!req) return;
    setActionLoading(req.id || req.request_id);
    try {
      await apiFetch('/api/social/regional-host/reject', {
        method: 'POST',
        body: JSON.stringify({ request_id: req.id || req.request_id, reason }),
      });
      showSnackbar('Request rejected');
      setRejectDialog({ open: false, request: null });
      fetchRequests();
    } catch (err) {
      showSnackbar(`Reject failed: ${err.message}`, 'error');
    }
    setActionLoading(null);
  };

  // ── Computed stats ──
  const nodeStats = useMemo(() => {
    const stats = { total: nodes.length, central: 0, regional: 0, flat: 0, online: 0, stale: 0, dead: 0 };
    nodes.forEach((n) => {
      const tier = (n.tier || 'flat').toLowerCase();
      if (stats[tier] !== undefined) stats[tier]++;
      const status = (n.status || 'dead').toLowerCase();
      if (status === 'active' || status === 'online') stats.online++;
      else if (status === 'stale') stats.stale++;
      else stats.dead++;
    });
    return stats;
  }, [nodes]);

  const pendingRequests = useMemo(() => {
    return requests.filter((r) => r.status === 'pending' || !r.status);
  }, [requests]);

  // ── Render ──
  return (
    <Fade in timeout={300}>
      <Box>
        {/* Page Header */}
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            <Box sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.15) 0%, rgba(155, 148, 255, 0.15) 100%)',
            }}>
              <HubIcon sx={{
                fontSize: 24,
                background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h4" sx={{
                fontWeight: 700,
                background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Network Nodes
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                Manage regional hosts, flat nodes, and host requests
              </Typography>
            </Box>
            <Tooltip title="Refresh now" arrow>
              <IconButton
                onClick={() => { setLoadingNodes(true); setLoadingRequests(true); fetchNodes(); fetchRequests(); }}
                sx={{ color: '#6C63FF', '&:hover': { background: 'rgba(108, 99, 255, 0.1)' } }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Stat Cards */}
        <Grow in={!loadingNodes} timeout={400}>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} sm={4} md={2}>
              <StatCard label="Total Nodes" count={nodeStats.total} color="#6C63FF" icon={<DnsIcon />} />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatCard label="Regional" count={nodeStats.regional} color={TIER_COLORS.regional} icon={<HubIcon />} />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatCard label="Flat" count={nodeStats.flat} color="#72757E" icon={<ComputerIcon />} />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatCard label="Online" count={nodeStats.online} color="#00BFA5" icon={<CheckCircleIcon />} />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatCard label="Stale" count={nodeStats.stale} color="#FFD700" icon={<StorageIcon />} />
            </Grid>
            <Grid item xs={6} sm={4} md={2}>
              <StatCard label="Pending" count={pendingRequests.length} color="#FF6B6B" icon={<PeopleIcon />} />
            </Grid>
          </Grid>
        </Grow>

        {/* ── Tier Upgrade Card ── */}
        <Grow in timeout={500}>
          <Box sx={{
            ...cardStyle,
            mb: 3,
            p: 0,
            overflow: 'hidden',
          }}>
            {/* Header bar */}
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 3,
              py: 2,
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              background: 'rgba(108, 99, 255, 0.04)',
            }}>
              <SecurityIcon sx={{ fontSize: 20, color: '#FFD700' }} />
              <Typography sx={{ color: '#E8E6F0', fontWeight: 600, fontSize: '0.95rem', flex: 1 }}>
                Node Tier Configuration
              </Typography>
              {tierInfo && (
                <Chip
                  size="small"
                  label={`Current: ${(tierInfo.tier || 'flat').charAt(0).toUpperCase() + (tierInfo.tier || 'flat').slice(1)}`}
                  sx={{
                    background: `${TIER_COLORS[tierInfo.tier] || TIER_COLORS.flat}18`,
                    color: TIER_COLORS[tierInfo.tier] || TIER_COLORS.flat,
                    border: `1px solid ${TIER_COLORS[tierInfo.tier] || TIER_COLORS.flat}40`,
                    fontWeight: 600,
                    fontSize: '0.72rem',
                  }}
                />
              )}
            </Box>

            <Box sx={{ px: 3, py: 2.5 }}>
              {tierInfo?.tier === 'central' ? (
                /* Already central — show confirmation */
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <CheckCircleIcon sx={{ color: '#FFD700', fontSize: 28 }} />
                  <Box>
                    <Typography sx={{ color: '#E8E6F0', fontWeight: 600, fontSize: '0.95rem' }}>
                      This node is operating as Central
                    </Typography>
                    <Typography sx={{ color: '#72757E', fontSize: '0.82rem', mt: 0.3 }}>
                      Full network authority active. HART tag: {tierInfo.hart_tag || '--'}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                /* Not central — show upgrade form */
                <Box>
                  <Typography sx={{ color: '#72757E', fontSize: '0.85rem', mb: 2, lineHeight: 1.6 }}>
                    Paste a master private key to upgrade this node to Central tier.
                    The key is signed locally using Ed25519 challenge-response —
                    only the cryptographic signature is sent, never the key itself.
                    Safe from MITM, proxy interception, and source code inspection.
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <TextField
                      fullWidth
                      size="small"
                      type={showKey ? 'text' : 'password'}
                      placeholder="Ed25519 private key (hex)"
                      value={masterKeyInput}
                      onChange={(e) => setMasterKeyInput(e.target.value)}
                      autoComplete="off"
                      inputProps={{ spellCheck: false, autoComplete: 'off', 'data-lpignore': 'true' }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <VpnKeyIcon sx={{ fontSize: 18, color: '#72757E' }} />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              size="small"
                              onClick={() => setShowKey((s) => !s)}
                              sx={{ color: '#72757E' }}
                            >
                              {showKey ? <VisibilityOffIcon sx={{ fontSize: 18 }} /> : <VisibilityIcon sx={{ fontSize: 18 }} />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 2,
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          '& fieldset': { borderColor: 'rgba(108, 99, 255, 0.2)' },
                          '&:hover fieldset': { borderColor: 'rgba(108, 99, 255, 0.4)' },
                          '&.Mui-focused fieldset': { borderColor: '#6C63FF' },
                        },
                        '& .MuiInputBase-input': { color: '#E8E6F0' },
                      }}
                    />
                    <Button
                      onClick={handleUpgrade}
                      disabled={upgradeLoading || !masterKeyInput.trim()}
                      startIcon={upgradeLoading
                        ? <CircularProgress size={16} sx={{ color: 'inherit' }} />
                        : <UpgradeIcon sx={{ fontSize: 18 }} />
                      }
                      sx={{
                        ...actionButtonStyle,
                        minWidth: 140,
                        height: 40,
                        background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 180, 0, 0.15) 100%)',
                        color: '#FFD700',
                        border: '1px solid rgba(255, 215, 0, 0.3)',
                        '&.Mui-disabled': { color: 'rgba(255,255,255,0.2)', borderColor: 'rgba(255,255,255,0.05)' },
                      }}
                    >
                      {upgradeLoading ? 'Validating...' : 'Upgrade'}
                    </Button>
                  </Box>
                  <Typography sx={{ color: 'rgba(255, 107, 107, 0.7)', fontSize: '0.72rem', mt: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <SecurityIcon sx={{ fontSize: 12 }} />
                    Challenge-response protocol: key signs a one-time nonce locally, only the signature crosses the wire. Even with Burp Suite, MITM, or public source code, the private key cannot be extracted.
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Grow>

        {/* Tabs */}
        <Box sx={{
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          mb: 3,
        }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{
              '& .MuiTab-root': {
                color: '#72757E',
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.95rem',
                transition: 'color 0.3s ease',
                '&:hover': { color: '#E8E6F0' },
                '&.Mui-selected': { color: '#6C63FF', fontWeight: 600 },
              },
              '& .MuiTabs-indicator': {
                background: 'linear-gradient(90deg, #6C63FF, #9B94FF)',
                height: 3,
                borderRadius: '3px 3px 0 0',
              },
            }}
          >
            <Tab label={`Nodes (${nodes.length})`} />
            <Tab label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Requests
                {pendingRequests.length > 0 && (
                  <Chip
                    size="small"
                    label={pendingRequests.length}
                    sx={{
                      height: 20,
                      minWidth: 20,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      background: '#FF6B6B',
                      color: '#fff',
                    }}
                  />
                )}
              </Box>
            } />
            <Tab label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Capacity
                {regionCapacities.some((r) => r.needs_scaling) && (
                  <Chip
                    size="small"
                    label="!"
                    sx={{
                      height: 20,
                      minWidth: 20,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      background: '#FFD700',
                      color: '#0F0E17',
                    }}
                  />
                )}
              </Box>
            } />
          </Tabs>
        </Box>

        {/* ── Nodes Tab ── */}
        {tab === 0 && (
          loadingNodes ? <TableSkeleton rows={6} /> : (
            <Grow in timeout={500}>
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
                        whiteSpace: 'nowrap',
                      },
                    }}>
                      <TableCell>Node</TableCell>
                      <TableCell>Tier</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Region</TableCell>
                      <TableCell>Compute</TableCell>
                      <TableCell>Users</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {nodes.map((node, index) => {
                      const tier = (node.tier || 'flat').toLowerCase();
                      const status = (node.status || 'dead').toLowerCase();
                      const hartTag = node.hart_tag || node.name || node.node_id;
                      const isFlat = tier === 'flat';
                      const isRegional = tier === 'regional';
                      const isCentral = tier === 'central';

                      return (
                        <Fade in timeout={300 + index * 40} key={node.node_id || index}>
                          <TableRow sx={{
                            ...tableRowStyle,
                            '& td': {
                              color: '#E8E6F0',
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              py: 1.5,
                            },
                          }}>
                            {/* Node identity */}
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Box sx={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: '50%',
                                  background: `linear-gradient(135deg, ${TIER_COLORS[tier] || '#72757E'} 0%, ${TIER_COLORS[tier] || '#72757E'}80 100%)`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.85rem',
                                  fontWeight: 600,
                                  color: '#fff',
                                }}>
                                  {(hartTag || 'N')[0].toUpperCase()}
                                </Box>
                                <Box>
                                  <Typography sx={{ fontWeight: 500, lineHeight: 1.2, fontSize: '0.9rem' }}>
                                    {hartTag.startsWith('@') ? hartTag : `@${hartTag}`}
                                  </Typography>
                                  {node.url && (
                                    <Typography sx={{ color: '#72757E', fontSize: '0.72rem', mt: 0.2 }}>
                                      {node.url}
                                    </Typography>
                                  )}
                                </Box>
                              </Box>
                            </TableCell>

                            {/* Tier */}
                            <TableCell><TierBadge tier={tier} /></TableCell>

                            {/* Status */}
                            <TableCell><StatusDot status={status} /></TableCell>

                            {/* Region */}
                            <TableCell>
                              <Typography sx={{ color: node.dns_region ? '#E8E6F0' : '#72757E', fontSize: '0.85rem' }}>
                                {node.dns_region || '--'}
                              </Typography>
                            </TableCell>

                            {/* Compute */}
                            <TableCell>
                              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                                <Tooltip title="CPU cores" arrow>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                                    <MemoryIcon sx={{ fontSize: 14, color: '#72757E' }} />
                                    <Typography sx={{ fontSize: '0.8rem', color: '#E8E6F0' }}>
                                      {node.compute_cpu_cores ?? '--'}
                                    </Typography>
                                  </Box>
                                </Tooltip>
                                <Tooltip title="RAM (GB)" arrow>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                                    <StorageIcon sx={{ fontSize: 14, color: '#72757E' }} />
                                    <Typography sx={{ fontSize: '0.8rem', color: '#E8E6F0' }}>
                                      {node.compute_ram_gb != null ? `${node.compute_ram_gb}G` : '--'}
                                    </Typography>
                                  </Box>
                                </Tooltip>
                                {(node.compute_gpu_count != null && node.compute_gpu_count > 0) && (
                                  <Tooltip title="GPUs" arrow>
                                    <Chip
                                      size="small"
                                      label={`${node.compute_gpu_count} GPU`}
                                      sx={{
                                        height: 20,
                                        fontSize: '0.7rem',
                                        fontWeight: 600,
                                        background: 'rgba(0, 191, 165, 0.15)',
                                        color: '#00BFA5',
                                        border: '1px solid rgba(0, 191, 165, 0.3)',
                                      }}
                                    />
                                  </Tooltip>
                                )}
                              </Box>
                            </TableCell>

                            {/* Users */}
                            <TableCell>
                              <Typography sx={{ fontSize: '0.85rem' }}>
                                <Typography component="span" sx={{ fontWeight: 600, color: '#E8E6F0' }}>
                                  {node.active_user_count ?? 0}
                                </Typography>
                                <Typography component="span" sx={{ color: '#72757E' }}>
                                  {' / '}{node.max_user_capacity ?? '--'}
                                </Typography>
                              </Typography>
                            </TableCell>

                            {/* Actions */}
                            <TableCell>
                              <Box sx={{ display: 'flex', gap: 0.8 }}>
                                {isFlat && (
                                  <Tooltip title="Promote to Regional" arrow>
                                    <Button
                                      size="small"
                                      onClick={() => handlePromote(node.node_id)}
                                      disabled={actionLoading === node.node_id}
                                      startIcon={<ArrowUpwardIcon sx={{ fontSize: 16 }} />}
                                      sx={{
                                        ...actionButtonStyle,
                                        background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.15) 0%, rgba(155, 148, 255, 0.15) 100%)',
                                        color: '#6C63FF',
                                        border: '1px solid rgba(108, 99, 255, 0.25)',
                                      }}
                                    >
                                      {actionLoading === node.node_id ? '...' : 'Promote'}
                                    </Button>
                                  </Tooltip>
                                )}
                                {isRegional && (
                                  <>
                                    <Tooltip title="Demote to Flat" arrow>
                                      <Button
                                        size="small"
                                        onClick={() => handleDemote(node.node_id, hartTag)}
                                        disabled={actionLoading === node.node_id}
                                        startIcon={<ArrowDownwardIcon sx={{ fontSize: 16 }} />}
                                        sx={{
                                          ...actionButtonStyle,
                                          background: 'rgba(255, 215, 0, 0.1)',
                                          color: '#FFD700',
                                          border: '1px solid rgba(255, 215, 0, 0.25)',
                                        }}
                                      >
                                        Demote
                                      </Button>
                                    </Tooltip>
                                    <Tooltip title="Revoke Certificate" arrow>
                                      <IconButton
                                        size="small"
                                        onClick={() => handleRevoke(node.node_id, hartTag)}
                                        disabled={actionLoading === node.node_id}
                                        sx={{
                                          color: '#FF6B6B',
                                          '&:hover': { background: 'rgba(255, 107, 107, 0.1)' },
                                        }}
                                      >
                                        <BlockIcon sx={{ fontSize: 18 }} />
                                      </IconButton>
                                    </Tooltip>
                                  </>
                                )}
                                {isCentral && (
                                  <Chip
                                    size="small"
                                    label="Central"
                                    sx={{
                                      background: 'rgba(255, 215, 0, 0.1)',
                                      color: '#FFD700',
                                      border: '1px solid rgba(255, 215, 0, 0.25)',
                                      fontWeight: 500,
                                      fontSize: '0.72rem',
                                    }}
                                  />
                                )}
                              </Box>
                            </TableCell>
                          </TableRow>
                        </Fade>
                      );
                    })}
                    {nodes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                          <Box sx={{ textAlign: 'center' }}>
                            <DnsIcon sx={{ fontSize: 48, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
                            <Typography sx={{ color: '#72757E' }}>
                              No nodes discovered yet
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            </Grow>
          )
        )}

        {/* ── Requests Tab ── */}
        {tab === 1 && (
          loadingRequests ? <TableSkeleton rows={4} /> : (
            <Grow in timeout={500}>
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
                        whiteSpace: 'nowrap',
                      },
                    }}>
                      <TableCell>Requester</TableCell>
                      <TableCell>Compute Tier</TableCell>
                      <TableCell>Trust Score</TableCell>
                      <TableCell>GitHub</TableCell>
                      <TableCell>Qualified</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {requests.map((req, index) => {
                      const isPending = req.status === 'pending' || !req.status;
                      const reqId = req.id || req.request_id;

                      return (
                        <Fade in timeout={300 + index * 40} key={reqId || index}>
                          <TableRow sx={{
                            ...tableRowStyle,
                            '& td': {
                              color: '#E8E6F0',
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              py: 1.5,
                            },
                          }}>
                            {/* Requester */}
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Box sx={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: '50%',
                                  background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.85rem',
                                  fontWeight: 600,
                                  color: '#fff',
                                }}>
                                  {(req.user_name || req.username || 'U')[0].toUpperCase()}
                                </Box>
                                <Box>
                                  <Typography sx={{ fontWeight: 500, fontSize: '0.9rem' }}>
                                    {req.user_name || req.username || 'Unknown'}
                                  </Typography>
                                  {req.user_id && (
                                    <Typography sx={{ color: '#72757E', fontSize: '0.72rem' }}>
                                      ID: {req.user_id}
                                    </Typography>
                                  )}
                                </Box>
                              </Box>
                            </TableCell>

                            {/* Compute tier */}
                            <TableCell>
                              <Typography sx={{ fontSize: '0.85rem' }}>
                                {req.compute_tier || req.tier || '--'}
                              </Typography>
                            </TableCell>

                            {/* Trust score */}
                            <TableCell>
                              <Typography sx={{
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: (req.trust_score || 0) >= 80 ? '#00BFA5'
                                  : (req.trust_score || 0) >= 50 ? '#FFD700'
                                  : '#FF6B6B',
                              }}>
                                {req.trust_score != null ? req.trust_score : '--'}
                              </Typography>
                            </TableCell>

                            {/* GitHub */}
                            <TableCell>
                              <Typography sx={{ color: req.github_username ? '#E8E6F0' : '#72757E', fontSize: '0.85rem' }}>
                                {req.github_username ? `@${req.github_username}` : '--'}
                              </Typography>
                            </TableCell>

                            {/* Qualification */}
                            <TableCell>
                              {req.is_qualified || req.qualified ? (
                                <Chip
                                  size="small"
                                  icon={<CheckCircleIcon sx={{ fontSize: 14, color: '#00BFA5 !important' }} />}
                                  label="Qualified"
                                  sx={{
                                    background: 'rgba(0, 191, 165, 0.12)',
                                    color: '#00BFA5',
                                    border: '1px solid rgba(0, 191, 165, 0.25)',
                                    fontWeight: 500,
                                    fontSize: '0.72rem',
                                  }}
                                />
                              ) : (
                                <Chip
                                  size="small"
                                  icon={<CancelIcon sx={{ fontSize: 14, color: '#FF6B6B !important' }} />}
                                  label="Not Qualified"
                                  sx={{
                                    background: 'rgba(255, 107, 107, 0.1)',
                                    color: '#FF6B6B',
                                    border: '1px solid rgba(255, 107, 107, 0.25)',
                                    fontWeight: 500,
                                    fontSize: '0.72rem',
                                  }}
                                />
                              )}
                            </TableCell>

                            {/* Status */}
                            <TableCell>
                              <Chip
                                size="small"
                                label={req.status ? req.status.charAt(0).toUpperCase() + req.status.slice(1) : 'Pending'}
                                sx={{
                                  background: isPending
                                    ? 'rgba(255, 215, 0, 0.12)'
                                    : req.status === 'approved'
                                    ? 'rgba(0, 191, 165, 0.12)'
                                    : 'rgba(255, 107, 107, 0.12)',
                                  color: isPending ? '#FFD700' : req.status === 'approved' ? '#00BFA5' : '#FF6B6B',
                                  border: `1px solid ${isPending ? 'rgba(255, 215, 0, 0.3)' : req.status === 'approved' ? 'rgba(0, 191, 165, 0.3)' : 'rgba(255, 107, 107, 0.3)'}`,
                                  fontWeight: 500,
                                  fontSize: '0.72rem',
                                }}
                              />
                            </TableCell>

                            {/* Actions */}
                            <TableCell>
                              {isPending ? (
                                <Box sx={{ display: 'flex', gap: 0.8 }}>
                                  <Button
                                    size="small"
                                    onClick={() => setApproveDialog({ open: true, request: req })}
                                    disabled={actionLoading === reqId}
                                    startIcon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                                    sx={{
                                      ...actionButtonStyle,
                                      background: 'linear-gradient(135deg, rgba(0, 191, 165, 0.15) 0%, rgba(0, 150, 130, 0.15) 100%)',
                                      color: '#00BFA5',
                                      border: '1px solid rgba(0, 191, 165, 0.25)',
                                    }}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="small"
                                    onClick={() => setRejectDialog({ open: true, request: req })}
                                    disabled={actionLoading === reqId}
                                    startIcon={<CancelIcon sx={{ fontSize: 16 }} />}
                                    sx={{
                                      ...actionButtonStyle,
                                      background: 'rgba(255, 107, 107, 0.1)',
                                      color: '#FF6B6B',
                                      border: '1px solid rgba(255, 107, 107, 0.25)',
                                    }}
                                  >
                                    Reject
                                  </Button>
                                </Box>
                              ) : (
                                <Typography sx={{ color: '#72757E', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                  {req.status === 'approved' ? 'Approved' : 'Rejected'}
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        </Fade>
                      );
                    })}
                    {requests.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                          <Box sx={{ textAlign: 'center' }}>
                            <PeopleIcon sx={{ fontSize: 48, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
                            <Typography sx={{ color: '#72757E' }}>
                              No regional host requests
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            </Grow>
          )
        )}

        {/* ── Capacity Tab ── */}
        {tab === 2 && (
          loadingCapacity ? <TableSkeleton rows={4} /> : (
            <Grow in timeout={500}>
              <Box>
                {regionCapacities.length === 0 ? (
                  <Box sx={{ ...cardStyle, py: 6, textAlign: 'center' }}>
                    <HubIcon sx={{ fontSize: 48, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
                    <Typography sx={{ color: '#72757E' }}>
                      No regions configured yet
                    </Typography>
                  </Box>
                ) : (
                  <Grid container spacing={2}>
                    {regionCapacities.map((region) => {
                      const statusColor = region.status === 'critical' ? '#FF6B6B'
                        : region.status === 'high' ? '#FFD700'
                        : region.status === 'healthy' ? '#00BFA5'
                        : '#72757E';
                      return (
                        <Grid item xs={12} sm={6} md={4} key={region.region_name}>
                          <Box sx={{
                            ...cardStyle,
                            p: 2.5,
                            border: region.needs_scaling
                              ? '1px solid rgba(255, 215, 0, 0.3)'
                              : '1px solid rgba(255,255,255,0.05)',
                          }}>
                            {/* Region header */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                              <Box sx={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: statusColor,
                                boxShadow: `0 0 8px ${statusColor}80`,
                              }} />
                              <Typography sx={{ color: '#E8E6F0', fontWeight: 600, fontSize: '1rem', flex: 1 }}>
                                {region.region_name}
                              </Typography>
                              <Chip
                                size="small"
                                label={region.status.charAt(0).toUpperCase() + region.status.slice(1)}
                                sx={{
                                  background: `${statusColor}15`,
                                  color: statusColor,
                                  border: `1px solid ${statusColor}40`,
                                  fontWeight: 600,
                                  fontSize: '0.7rem',
                                }}
                              />
                            </Box>

                            {/* Utilization bar */}
                            <Box sx={{ mb: 2 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography sx={{ color: '#72757E', fontSize: '0.75rem' }}>
                                  Utilization
                                </Typography>
                                <Typography sx={{ color: statusColor, fontSize: '0.8rem', fontWeight: 700 }}>
                                  {region.utilization_percent}%
                                </Typography>
                              </Box>
                              <Box sx={{
                                height: 6, borderRadius: '3px',
                                background: 'rgba(255,255,255,0.05)',
                                overflow: 'hidden',
                              }}>
                                <Box sx={{
                                  width: `${Math.min(region.utilization_percent, 100)}%`,
                                  height: '100%',
                                  borderRadius: '3px',
                                  background: `linear-gradient(90deg, ${statusColor}, ${statusColor}CC)`,
                                  transition: 'width 0.8s ease',
                                }} />
                              </Box>
                            </Box>

                            {/* Stats grid */}
                            <Grid container spacing={1}>
                              <Grid item xs={6}>
                                <Box sx={{ background: 'rgba(255,255,255,0.02)', borderRadius: 1.5, p: 1 }}>
                                  <Typography sx={{ color: '#72757E', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                    Load
                                  </Typography>
                                  <Typography sx={{ color: '#E8E6F0', fontSize: '1rem', fontWeight: 600 }}>
                                    {region.current_load} <Typography component="span" sx={{ color: '#72757E', fontSize: '0.75rem' }}>/ {region.total_capacity}</Typography>
                                  </Typography>
                                </Box>
                              </Grid>
                              <Grid item xs={6}>
                                <Box sx={{ background: 'rgba(255,255,255,0.02)', borderRadius: 1.5, p: 1 }}>
                                  <Typography sx={{ color: '#72757E', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                    Hosts
                                  </Typography>
                                  <Typography sx={{ color: '#E8E6F0', fontSize: '1rem', fontWeight: 600 }}>
                                    {region.host_count} <Typography component="span" sx={{ color: '#72757E', fontSize: '0.75rem' }}>({region.active_node_count} active)</Typography>
                                  </Typography>
                                </Box>
                              </Grid>
                              <Grid item xs={4}>
                                <Box sx={{ background: 'rgba(255,255,255,0.02)', borderRadius: 1.5, p: 1 }}>
                                  <Typography sx={{ color: '#72757E', fontSize: '0.68rem' }}>Cores</Typography>
                                  <Typography sx={{ color: '#E8E6F0', fontSize: '0.9rem', fontWeight: 600 }}>{region.compute_cores}</Typography>
                                </Box>
                              </Grid>
                              <Grid item xs={4}>
                                <Box sx={{ background: 'rgba(255,255,255,0.02)', borderRadius: 1.5, p: 1 }}>
                                  <Typography sx={{ color: '#72757E', fontSize: '0.68rem' }}>RAM</Typography>
                                  <Typography sx={{ color: '#E8E6F0', fontSize: '0.9rem', fontWeight: 600 }}>{region.compute_ram_gb}G</Typography>
                                </Box>
                              </Grid>
                              <Grid item xs={4}>
                                <Box sx={{ background: 'rgba(255,255,255,0.02)', borderRadius: 1.5, p: 1 }}>
                                  <Typography sx={{ color: '#72757E', fontSize: '0.68rem' }}>GPU</Typography>
                                  <Typography sx={{ color: '#E8E6F0', fontSize: '0.9rem', fontWeight: 600 }}>{region.gpu_count}</Typography>
                                </Box>
                              </Grid>
                            </Grid>

                            {/* Scaling alert */}
                            {region.needs_scaling && (
                              <Box sx={{
                                mt: 1.5, p: 1, borderRadius: 1.5,
                                background: 'rgba(255, 215, 0, 0.06)',
                                border: '1px solid rgba(255, 215, 0, 0.15)',
                                display: 'flex', alignItems: 'center', gap: 1,
                              }}>
                                <ArrowUpwardIcon sx={{ fontSize: 14, color: '#FFD700' }} />
                                <Typography sx={{ color: '#FFD700', fontSize: '0.75rem', fontWeight: 500 }}>
                                  Scaling recommended — utilization above 80%
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        </Grid>
                      );
                    })}
                  </Grid>
                )}
              </Box>
            </Grow>
          )
        )}

        {/* ── Dialogs ── */}
        <ConfirmActionDialog
          open={confirmDialog.open}
          onClose={() => setConfirmDialog((d) => ({ ...d, open: false }))}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          loading={actionLoading != null}
        />

        <ApproveDialog
          open={approveDialog.open}
          onClose={() => setApproveDialog({ open: false, request: null })}
          onConfirm={handleApprove}
          request={approveDialog.request}
          loading={actionLoading != null}
        />

        <RejectDialog
          open={rejectDialog.open}
          onClose={() => setRejectDialog({ open: false, request: null })}
          onConfirm={handleReject}
          request={rejectDialog.request}
          loading={actionLoading != null}
        />

        {/* ── Snackbar ── */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
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
