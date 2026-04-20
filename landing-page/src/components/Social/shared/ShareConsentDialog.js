import {shareApi} from '../../../services/socialApi';
import {RADIUS} from '../../../theme/socialTokens';

import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Avatar,
  CircularProgress,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useCallback} from 'react';

/**
 * ShareConsentDialog — Consent gate for private/sensitive shared content.
 *
 * When a user opens a private share link (chat, hidden post, etc.),
 * this dialog asks them to consent before revealing the content.
 *
 * Props:
 *   open, onClose — dialog state
 *   token — the share link token
 *   shareData — resolved share data (sharer name, resource type, etc.)
 *   onConsent — callback when consent is granted, receives the unlocked content
 */
export default function ShareConsentDialog({
  open,
  onClose,
  token,
  shareData,
  onConsent,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const resourceLabels = {
    chat: 'conversation',
    post: 'post',
    comment: 'comment',
    profile: 'profile',
    media: 'media',
  };

  const resourceLabel = resourceLabels[shareData?.resource_type] || 'content';

  const handleConsent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await shareApi.grantConsent(token);
      if (res.data?.success) {
        onConsent?.(res.data?.data);
        onClose();
      } else {
        setError(res.data?.error || 'Failed to grant consent');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [token, onConsent, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: RADIUS.lg,
          bgcolor: '#1a1a2e',
          color: '#fff',
          border: '1px solid rgba(108,99,255,0.2)',
        },
      }}
    >
      <DialogTitle sx={{textAlign: 'center', pt: 3}}>
        <Avatar
          sx={{
            width: 56,
            height: 56,
            mx: 'auto',
            mb: 1.5,
            bgcolor: alpha('#6C63FF', 0.15),
            color: '#6C63FF',
          }}
        >
          <LockIcon sx={{fontSize: 28}} />
        </Avatar>
        <Typography variant="h6" sx={{fontWeight: 700}}>
          Private Content
        </Typography>
      </DialogTitle>

      <DialogContent sx={{textAlign: 'center', pb: 1}}>
        <Typography
          variant="body2"
          sx={{color: 'rgba(255,255,255,0.7)', mb: 2}}
        >
          {shareData?.sharer_name
            ? `${shareData.sharer_name} wants to share a ${resourceLabel} with you.`
            : `Someone shared a private ${resourceLabel} with you.`}
        </Typography>

        <Box
          sx={{
            p: 2,
            borderRadius: RADIUS.md,
            bgcolor: alpha('#6C63FF', 0.06),
            border: `1px solid ${alpha('#6C63FF', 0.12)}`,
            mb: 2,
          }}
        >
          <Typography variant="caption" sx={{color: 'rgba(255,255,255,0.5)'}}>
            By viewing this content, you acknowledge that it was shared with
            your consent. The sharer will be notified that you viewed it.
          </Typography>
        </Box>

        {error && (
          <Typography variant="body2" sx={{color: '#FF6B6B', mb: 1}}>
            {error}
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{px: 3, pb: 3, gap: 1}}>
        <Button
          onClick={onClose}
          sx={{
            flex: 1,
            textTransform: 'none',
            fontWeight: 600,
            color: 'rgba(255,255,255,0.6)',
            '&:hover': {bgcolor: 'rgba(255,255,255,0.05)'},
          }}
        >
          Decline
        </Button>
        <Button
          onClick={handleConsent}
          disabled={loading}
          variant="contained"
          startIcon={
            loading ? <CircularProgress size={16} /> : <VisibilityIcon />
          }
          sx={{
            flex: 1,
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: RADIUS.sm,
            bgcolor: '#6C63FF',
            '&:hover': {bgcolor: alpha('#6C63FF', 0.85)},
          }}
        >
          View Content
        </Button>
      </DialogActions>
    </Dialog>
  );
}
