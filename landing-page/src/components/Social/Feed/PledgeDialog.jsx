/**
 * PledgeDialog - Dialog for pledging compute resources to a thought experiment.
 *
 * Supports 3 pledge types: GPU Hours, Cloud Credits, Money (USD).
 * Dark-themed glassmorphism card with animated type selection,
 * amount input, optional message, and confirmation summary.
 *
 * Role-based:
 *  - Guest/anonymous: blocked with "Sign in to pledge" message
 *  - Flat+: can pledge
 *  - Central: sees node capacity info
 */

import { trackerApi, computeApi } from '../../../services/socialApi';
import { socialTokens, RADIUS, EASINGS, DURATIONS } from '../../../theme/socialTokens';
import { useRoleAccess } from '../../RoleGuard';

import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import CloudIcon from '@mui/icons-material/Cloud';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MemoryIcon from '@mui/icons-material/Memory';
import PaymentIcon from '@mui/icons-material/Payment';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, TextField, IconButton,
  CircularProgress, Skeleton, useTheme, useMediaQuery, keyframes,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useState, useEffect, useMemo } from 'react';

// ---- Keyframes ----

const cardBounce = keyframes`
  0%   { transform: scale(1); }
  30%  { transform: scale(0.95); }
  60%  { transform: scale(1.05); }
  100% { transform: scale(1); }
`;

const submitPulse = keyframes`
  0%   { box-shadow: 0 0 0px rgba(108,99,255,0); }
  50%  { box-shadow: 0 0 20px rgba(108,99,255,0.4); }
  100% { box-shadow: 0 0 0px rgba(108,99,255,0); }
`;

const fadeSlideUp = keyframes`
  0%   { opacity: 0; transform: translateY(12px); }
  100% { opacity: 1; transform: translateY(0); }
`;

// ---- Config ----

const PLEDGE_TYPES = [
  {
    key: 'gpu_hours',
    label: 'GPU Hours',
    unit: 'hours',
    icon: MemoryIcon,
    color: '#00BCD4',
    description: 'Contribute compute time from your node',
  },
  {
    key: 'cloud_credits',
    label: 'Cloud Credits',
    unit: 'credits',
    icon: CloudIcon,
    color: '#6C63FF',
    description: 'Allocate cloud processing credits',
  },
  {
    key: 'money',
    label: 'Money',
    unit: 'USD',
    icon: PaymentIcon,
    color: '#4CAF50',
    description: 'Fund compute resources with currency',
  },
];

// ---- Component ----

export default function PledgeDialog({ open, onClose, postId, experimentTitle }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { canWrite, isAuthenticated, isCentral } = useRoleAccess();

  const [selectedType, setSelectedType] = useState(null);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const [bounceKey, setBounceKey] = useState(null);
  const [nodeInfo, setNodeInfo] = useState(null);
  const [nodeLoading, setNodeLoading] = useState(false);

  const selectedConfig = useMemo(
    () => PLEDGE_TYPES.find((t) => t.key === selectedType),
    [selectedType]
  );

  const amountNum = parseFloat(amount) || 0;
  const isValid = selectedType && amountNum > 0;

  // Fetch node info for GPU hour pledges
  useEffect(() => {
    if (open && selectedType === 'gpu_hours') {
      setNodeLoading(true);
      computeApi.status()
        .then((res) => setNodeInfo(res.data || null))
        .catch(() => setNodeInfo(null))
        .finally(() => setNodeLoading(false));
    }
  }, [open, selectedType]);

  const handleSelectType = (key) => {
    setSelectedType(key);
    setBounceKey(key);
    setTimeout(() => setBounceKey(null), 400);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    setError(null);
    try {
      await trackerApi.pledge(postId, {
        pledge_type: selectedType,
        spark_amount: amountNum,
        message: message.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to submit pledge. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset state on close
    setSelectedType(null);
    setAmount('');
    setMessage('');
    setSubmitted(false);
    setError(null);
    onClose();
  };

  // ---- Not authenticated ----
  if (!isAuthenticated) {
    return (
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#0F0E17',
            backgroundImage: 'none',
            borderRadius: RADIUS.lg,
            border: '1px solid rgba(255,255,255,0.06)',
          },
        }}
      >
        <DialogContent sx={{ textAlign: 'center', py: 4 }}>
          <InfoOutlinedIcon sx={{ fontSize: 48, color: '#6C63FF', mb: 2 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: '#fff' }}>
            Sign in to pledge
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
            You need to be signed in to pledge compute resources to thought experiments.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
          <Button onClick={handleClose} sx={{ textTransform: 'none', fontWeight: 600 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // ---- Success state ----
  if (submitted) {
    return (
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: '#0F0E17',
            backgroundImage: 'none',
            borderRadius: RADIUS.lg,
            border: '1px solid rgba(255,255,255,0.06)',
          },
        }}
      >
        <DialogContent sx={{
          textAlign: 'center', py: 4,
          animation: `${fadeSlideUp} 400ms ${EASINGS.decelerate} both`,
        }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 56, color: '#4CAF50', mb: 2 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 1, color: '#fff' }}>
            Pledge submitted
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 1 }}>
            You pledged {amountNum} {selectedConfig?.unit} to this experiment.
          </Typography>
          {message && (
            <Typography variant="caption" sx={{
              color: 'rgba(255,255,255,0.35)', fontStyle: 'italic', display: 'block', mt: 1,
            }}>
              "{message}"
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
          <Button onClick={handleClose} variant="contained" sx={{
            textTransform: 'none', fontWeight: 600, borderRadius: RADIUS.pill,
            bgcolor: '#6C63FF', '&:hover': { bgcolor: '#5A52E0' },
          }}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // ---- Main dialog ----
  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          bgcolor: '#0F0E17',
          backgroundImage: 'none',
          borderRadius: isMobile ? 0 : RADIUS.lg,
          border: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        },
      }}
    >
      <DialogTitle sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        pb: 0.5,
      }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
          Pledge Compute
        </Typography>
        <IconButton onClick={handleClose} size="small" sx={{ color: 'rgba(255,255,255,0.5)' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {/* Experiment title */}
        {experimentTitle && (
          <Typography variant="body2" sx={{
            color: 'rgba(255,255,255,0.4)', mb: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            Supporting: {experimentTitle}
          </Typography>
        )}

        {/* Pledge type selection */}
        <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mb: 1 }}>
          Choose pledge type
        </Typography>
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
          gap: 1.5,
          mb: 2.5,
        }}>
          {PLEDGE_TYPES.map((type) => {
            const Icon = type.icon;
            const isSelected = selectedType === type.key;
            const isBouncing = bounceKey === type.key;
            return (
              <Box
                key={type.key}
                onClick={() => handleSelectType(type.key)}
                sx={{
                  cursor: 'pointer',
                  p: 2,
                  borderRadius: RADIUS.md,
                  background: isSelected
                    ? alpha(type.color, 0.1)
                    : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isSelected ? alpha(type.color, 0.3) : 'rgba(255,255,255,0.06)'}`,
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  textAlign: 'center',
                  transition: `all ${DURATIONS.fast}ms ${EASINGS.smooth}`,
                  animation: isBouncing ? `${cardBounce} 400ms ${EASINGS.spring}` : 'none',
                  '&:hover': {
                    background: alpha(type.color, 0.06),
                    borderColor: alpha(type.color, 0.2),
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <Icon sx={{
                  fontSize: 32,
                  color: isSelected ? type.color : 'rgba(255,255,255,0.4)',
                  mb: 0.5,
                  transition: `color ${DURATIONS.fast}ms ease`,
                }} />
                <Typography variant="subtitle2" sx={{
                  fontWeight: 700,
                  color: isSelected ? type.color : 'rgba(255,255,255,0.7)',
                  transition: `color ${DURATIONS.fast}ms ease`,
                }}>
                  {type.label}
                </Typography>
                <Typography variant="caption" sx={{
                  color: 'rgba(255,255,255,0.3)',
                  display: 'block',
                  fontSize: '0.68rem',
                  lineHeight: 1.3,
                  mt: 0.25,
                }}>
                  {type.description}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* Amount input */}
        {selectedType && (
          <Box sx={{ animation: `${fadeSlideUp} 300ms ${EASINGS.decelerate} both`, mb: 2 }}>
            <TextField
              fullWidth
              type="number"
              label={`Amount (${selectedConfig?.unit})`}
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null); }}
              inputProps={{ min: 0, step: selectedType === 'money' ? 0.01 : 1 }}
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: '#fff',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
                  '&:hover fieldset': { borderColor: alpha(selectedConfig?.color || '#6C63FF', 0.4) },
                  '&.Mui-focused fieldset': { borderColor: selectedConfig?.color || '#6C63FF' },
                },
                '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' },
                '& .MuiInputLabel-root.Mui-focused': { color: selectedConfig?.color || '#6C63FF' },
              }}
            />
          </Box>
        )}

        {/* Node info for GPU hours */}
        {selectedType === 'gpu_hours' && (
          <Box sx={{
            p: 1.5, mb: 2, borderRadius: RADIUS.sm,
            background: alpha('#00BCD4', 0.06),
            border: `1px solid ${alpha('#00BCD4', 0.15)}`,
            animation: `${fadeSlideUp} 300ms ${EASINGS.decelerate} 100ms both`,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
              <InfoOutlinedIcon sx={{ fontSize: 14, color: '#00BCD4' }} />
              <Typography variant="caption" sx={{ color: '#00BCD4', fontWeight: 600 }}>
                Your Node
              </Typography>
            </Box>
            {nodeLoading ? (
              <Skeleton variant="text" width={180} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
            ) : nodeInfo ? (
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {nodeInfo.gpu_name && (
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    GPU: <Box component="span" sx={{ color: '#00BCD4', fontWeight: 600 }}>{nodeInfo.gpu_name}</Box>
                  </Typography>
                )}
                {nodeInfo.available_hours != null && (
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    Available: <Box component="span" sx={{ color: '#00BCD4', fontWeight: 600 }}>{nodeInfo.available_hours}h</Box>
                  </Typography>
                )}
                {nodeInfo.opted_in != null && (
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    Status: <Box component="span" sx={{ color: nodeInfo.opted_in ? '#4CAF50' : '#FF6B6B', fontWeight: 600 }}>
                      {nodeInfo.opted_in ? 'Opted in' : 'Not opted in'}
                    </Box>
                  </Typography>
                )}
              </Box>
            ) : (
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>
                {isCentral
                  ? 'GPU hours will be allocated from the network pool.'
                  : 'Could not detect node info. GPU hours will be pledged from available capacity.'}
              </Typography>
            )}
          </Box>
        )}

        {/* Optional message */}
        {selectedType && (
          <Box sx={{ animation: `${fadeSlideUp} 300ms ${EASINGS.decelerate} 150ms both` }}>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Why I'm supporting this (optional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              variant="outlined"
              inputProps={{ maxLength: 280 }}
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  color: '#fff',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
                  '&.Mui-focused fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                },
                '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.3)' },
              }}
            />
          </Box>
        )}

        {/* Summary before confirm */}
        {isValid && (
          <Box sx={{
            p: 1.5, borderRadius: RADIUS.md,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            animation: `${fadeSlideUp} 300ms ${EASINGS.decelerate} both`,
          }}>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
              You're pledging{' '}
              <Box component="span" sx={{ color: selectedConfig?.color, fontWeight: 700 }}>
                {amountNum} {selectedConfig?.unit}
              </Box>
              {' '}to{' '}
              <Box component="span" sx={{ fontWeight: 600, color: '#fff' }}>
                {experimentTitle || 'this experiment'}
              </Box>
            </Typography>
          </Box>
        )}

        {/* Error message */}
        {error && (
          <Typography variant="body2" sx={{ color: '#FF6B6B', mt: 1.5, fontSize: '0.82rem' }}>
            {error}
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 0.5 }}>
        <Button onClick={handleClose} sx={{
          textTransform: 'none', fontWeight: 600, color: 'rgba(255,255,255,0.5)',
        }}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!isValid || submitting || !canWrite}
          variant="contained"
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: RADIUS.pill,
            px: 3,
            bgcolor: selectedConfig?.color || '#6C63FF',
            '&:hover': {
              bgcolor: alpha(selectedConfig?.color || '#6C63FF', 0.85),
            },
            '&:disabled': {
              bgcolor: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.25)',
            },
            animation: isValid && !submitting ? `${submitPulse} 2s ease-in-out infinite` : 'none',
          }}
        >
          {submitting ? (
            <CircularProgress size={20} sx={{ color: '#fff' }} />
          ) : (
            'Submit Pledge'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
