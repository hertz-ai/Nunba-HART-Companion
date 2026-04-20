import { API_BASE_URL } from '../../../config/apiBase';

import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DnsIcon from '@mui/icons-material/Dns';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import HubIcon from '@mui/icons-material/Hub';
import MemoryIcon from '@mui/icons-material/Memory';
import SecurityIcon from '@mui/icons-material/Security';
import StarIcon from '@mui/icons-material/Star';
import {
  Box, Typography, Button, Chip, Tooltip, CircularProgress,
  LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Alert,
} from '@mui/material';
import React, { useState, useEffect, useCallback } from 'react';


const cardStyle = {
  background: 'linear-gradient(135deg, rgba(26, 23, 48, 0.9) 0%, rgba(15, 14, 23, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: '12px',
  overflow: 'hidden',
};

function getAuthHeaders() {
  const jwt = localStorage.getItem('social_jwt');
  return {
    'Content-Type': 'application/json',
    ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
  };
}

export default function RequestRegionalHostCard({ userId }) {
  const [eligibility, setEligibility] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [githubUsername, setGithubUsername] = useState('');
  const [result, setResult] = useState(null);

  const fetchEligibility = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/social/regional-host/eligibility`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setEligibility(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEligibility(); }, [fetchEligibility]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/social/regional-host/request`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          compute_info: eligibility?.compute_info || {},
          github_username: githubUsername.trim(),
        }),
      });
      const data = await res.json();
      setResult(data);
      setDialogOpen(false);
      fetchEligibility(); // Refresh status
    } catch (err) {
      setResult({ error: err.message });
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <Box sx={{ ...cardStyle, p: 3, textAlign: 'center' }}>
        <CircularProgress size={24} sx={{ color: '#6C63FF' }} />
      </Box>
    );
  }

  if (!eligibility) return null;

  const { eligible, compute_tier, trust_score, meets_compute, meets_trust, requirements, existing_request } = eligibility;

  // Already has an active request
  const hasActiveRequest = existing_request && ['pending', 'pending_steward', 'approved'].includes(existing_request.status);
  const isApproved = existing_request?.status === 'approved';
  const isPending = existing_request && ['pending', 'pending_steward'].includes(existing_request.status);
  const isRejected = existing_request?.status === 'rejected';

  const tierColors = {
    OBSERVER: '#72757E', BASIC: '#72757E', UNKNOWN: '#72757E',
    STANDARD: '#00BFA5', ADVANCED: '#6C63FF', COMPUTE_HOST: '#FFD700',
  };

  return (
    <Box sx={cardStyle}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        px: 2.5, py: 2,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(108, 99, 255, 0.04)',
      }}>
        <HubIcon sx={{ fontSize: 20, color: '#6C63FF' }} />
        <Typography sx={{ color: '#E8E6F0', fontWeight: 600, fontSize: '0.95rem', flex: 1 }}>
          Become a Regional Host
        </Typography>
        {isApproved && (
          <Chip size="small" label="Active Regional Host" sx={{
            background: 'rgba(0, 191, 165, 0.15)', color: '#00BFA5',
            border: '1px solid rgba(0, 191, 165, 0.3)', fontWeight: 600, fontSize: '0.72rem',
          }} />
        )}
        {isPending && (
          <Chip size="small" label="Request Pending" sx={{
            background: 'rgba(255, 215, 0, 0.12)', color: '#FFD700',
            border: '1px solid rgba(255, 215, 0, 0.3)', fontWeight: 600, fontSize: '0.72rem',
          }} />
        )}
      </Box>

      <Box sx={{ px: 2.5, py: 2 }}>
        {/* Incentives banner */}
        {!isApproved && (
          <Box sx={{
            display: 'flex', gap: 2, mb: 2, p: 1.5,
            background: 'rgba(108, 99, 255, 0.06)',
            borderRadius: '8px', border: '1px solid rgba(108, 99, 255, 0.1)',
          }}>
            <EmojiEventsIcon sx={{ fontSize: 18, color: '#FFD700', mt: 0.2 }} />
            <Box>
              <Typography sx={{ color: '#E8E6F0', fontSize: '0.82rem', fontWeight: 600, mb: 0.3 }}>
                Regional Host Incentives
              </Typography>
              <Typography sx={{ color: '#72757E', fontSize: '0.75rem', lineHeight: 1.5 }}>
                2x karma multiplier &bull; Priority hive compute allocation &bull; Steward recognition badge &bull; Regional DNS namespace &bull; Certificate authority for your region
              </Typography>
            </Box>
          </Box>
        )}

        {/* Requirements checklist */}
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ color: '#72757E', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1.2 }}>
            Requirements
          </Typography>

          {/* Compute tier */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.2 }}>
            {meets_compute
              ? <CheckCircleIcon sx={{ fontSize: 18, color: '#00BFA5' }} />
              : <CancelIcon sx={{ fontSize: 18, color: '#FF6B6B' }} />
            }
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MemoryIcon sx={{ fontSize: 14, color: '#72757E' }} />
                <Typography sx={{ color: '#E8E6F0', fontSize: '0.85rem', fontWeight: 500 }}>
                  Compute Tier
                </Typography>
              </Box>
              <Typography sx={{ color: '#72757E', fontSize: '0.75rem', mt: 0.2 }}>
                Current: <span style={{ color: tierColors[compute_tier] || '#72757E', fontWeight: 600 }}>{compute_tier}</span>
                {' '}&mdash; Minimum: <span style={{ color: '#00BFA5', fontWeight: 600 }}>STANDARD</span>
                {' '}({requirements?.compute_description?.STANDARD || '4+ cores, 8+ GB RAM'})
              </Typography>
            </Box>
          </Box>

          {/* Trust score */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.2 }}>
            {meets_trust
              ? <CheckCircleIcon sx={{ fontSize: 18, color: '#00BFA5' }} />
              : <CancelIcon sx={{ fontSize: 18, color: '#FF6B6B' }} />
            }
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SecurityIcon sx={{ fontSize: 14, color: '#72757E' }} />
                <Typography sx={{ color: '#E8E6F0', fontSize: '0.85rem', fontWeight: 500 }}>
                  Trust Score
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.3 }}>
                <LinearProgress
                  variant="determinate"
                  value={Math.min((trust_score / 2.5) * 100, 100)}
                  sx={{
                    flex: 1, height: 6, borderRadius: '3px',
                    bgcolor: 'rgba(255,255,255,0.05)',
                    '& .MuiLinearProgress-bar': {
                      background: meets_trust
                        ? 'linear-gradient(90deg, #00BFA5, #00E5CC)'
                        : 'linear-gradient(90deg, #FF6B6B, #FF9B9B)',
                      borderRadius: '3px',
                    },
                  }}
                />
                <Typography sx={{
                  color: meets_trust ? '#00BFA5' : '#FF6B6B',
                  fontSize: '0.8rem', fontWeight: 600, minWidth: 55, textAlign: 'right',
                }}>
                  {trust_score} / 2.5
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Status or action */}
        {isApproved ? (
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5,
            background: 'rgba(0, 191, 165, 0.08)', borderRadius: '8px',
          }}>
            <StarIcon sx={{ color: '#FFD700', fontSize: 20 }} />
            <Typography sx={{ color: '#E8E6F0', fontSize: '0.85rem' }}>
              You are an active regional host for <strong style={{ color: '#6C63FF' }}>{existing_request?.region_name || 'your region'}</strong>
            </Typography>
          </Box>
        ) : isPending ? (
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5,
            background: 'rgba(255, 215, 0, 0.06)', borderRadius: '8px',
          }}>
            <DnsIcon sx={{ color: '#FFD700', fontSize: 20 }} />
            <Typography sx={{ color: '#E8E6F0', fontSize: '0.85rem' }}>
              Your request is awaiting steward approval. You'll be notified when reviewed.
            </Typography>
          </Box>
        ) : (
          <>
            {isRejected && existing_request?.rejected_reason && (
              <Alert severity="warning" sx={{
                mb: 1.5, bgcolor: 'rgba(255, 107, 107, 0.08)',
                color: '#FF6B6B', border: '1px solid rgba(255, 107, 107, 0.2)',
                '& .MuiAlert-icon': { color: '#FF6B6B' },
                borderRadius: '8px', fontSize: '0.82rem',
              }}>
                Previous request rejected: {existing_request.rejected_reason}
              </Alert>
            )}

            {result?.error && (
              <Alert severity="error" sx={{ mb: 1.5, borderRadius: '8px', fontSize: '0.82rem' }}>
                {result.error}
              </Alert>
            )}

            <Tooltip
              title={!eligible ? (
                <Box sx={{ p: 0.5 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.8rem', mb: 0.5 }}>
                    Requirements not met:
                  </Typography>
                  {!meets_compute && (
                    <Typography sx={{ fontSize: '0.75rem' }}>
                      - Compute tier must be STANDARD or higher (current: {compute_tier})
                    </Typography>
                  )}
                  {!meets_trust && (
                    <Typography sx={{ fontSize: '0.75rem' }}>
                      - Trust score must be at least 2.5 (current: {trust_score})
                    </Typography>
                  )}
                </Box>
              ) : ''}
              arrow
              disableHoverListener={eligible}
            >
              <span>
                <Button
                  fullWidth
                  disabled={!eligible}
                  onClick={() => setDialogOpen(true)}
                  sx={{
                    py: 1.2,
                    borderRadius: '8px',
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    background: eligible
                      ? 'linear-gradient(135deg, rgba(108, 99, 255, 0.2) 0%, rgba(155, 148, 255, 0.2) 100%)'
                      : 'rgba(255,255,255,0.03)',
                    color: eligible ? '#6C63FF' : 'rgba(255,255,255,0.25)',
                    border: `1px solid ${eligible ? 'rgba(108, 99, 255, 0.3)' : 'rgba(255,255,255,0.05)'}`,
                    transition: 'all 0.3s ease',
                    '&:hover': eligible ? {
                      background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.3) 0%, rgba(155, 148, 255, 0.3) 100%)',
                      transform: 'translateY(-1px)',
                      boxShadow: '0 4px 16px rgba(108, 99, 255, 0.2)',
                    } : {},
                    '&.Mui-disabled': {
                      color: 'rgba(255,255,255,0.25)',
                    },
                  }}
                >
                  {eligible ? 'Request Regional Host Status' : 'Requirements Not Met'}
                </Button>
              </span>
            </Tooltip>
          </>
        )}
      </Box>

      {/* Submit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        PaperProps={{
          sx: {
            background: 'linear-gradient(135deg, #1A1730 0%, #0F0E17 100%)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            minWidth: 400,
          },
        }}
      >
        <DialogTitle sx={{ color: '#E8E6F0', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          Request Regional Host
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography sx={{ color: '#72757E', fontSize: '0.9rem', mb: 2 }}>
            Your request will be reviewed by a network steward. Upon approval, you'll receive a regional certificate and DNS namespace.
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="GitHub Username (optional)"
            placeholder="For repo access invite upon approval"
            value={githubUsername}
            onChange={(e) => setGithubUsername(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': {
                background: 'rgba(0,0,0,0.3)', borderRadius: '8px',
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
          <Button onClick={() => setDialogOpen(false)} sx={{ color: '#72757E', textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            sx={{
              textTransform: 'none', fontWeight: 600,
              background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.2) 0%, rgba(155, 148, 255, 0.2) 100%)',
              color: '#6C63FF',
              border: '1px solid rgba(108, 99, 255, 0.3)',
              borderRadius: '8px',
              '&:hover': {
                background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.3) 0%, rgba(155, 148, 255, 0.3) 100%)',
              },
            }}
          >
            {submitting ? <CircularProgress size={18} sx={{ color: '#6C63FF' }} /> : 'Submit Request'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
