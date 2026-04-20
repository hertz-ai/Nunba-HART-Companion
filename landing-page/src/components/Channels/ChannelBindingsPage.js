import ChannelPresenceIndicator from './ChannelPresenceIndicator';
import ChannelSetupWizard from './ChannelSetupWizard';

import { channelUserApi } from '../../services/socialApi';

import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import {
  Box, Typography, Card, CardContent, Grid, IconButton, Tooltip, Fab,
  CircularProgress, Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Fade, Grow,
} from '@mui/material';
import React, { useState, useEffect, useCallback } from 'react';

const cardStyle = {
  background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 26, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: '12px',
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(0, 232, 157, 0.2)',
  },
};

const preferredCardStyle = {
  ...cardStyle,
  border: '1px solid rgba(108, 99, 255, 0.3)',
  boxShadow: '0 0 20px rgba(108, 99, 255, 0.1)',
};

export default function ChannelBindingsPage() {
  const [bindings, setBindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchBindings = useCallback(async () => {
    try {
      const res = await channelUserApi.bindings();
      setBindings(res?.data?.data || res?.data || []);
    } catch (e) {
      setBindings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBindings(); }, [fetchBindings]);

  const handleSetPreferred = async (id) => {
    setActionLoading(id);
    try {
      await channelUserApi.setPreferred(id);
      await fetchBindings();
    } catch (e) { /* handled */ }
    setActionLoading(null);
  };

  const handleRemove = async () => {
    if (!deleteTarget) return;
    setActionLoading(deleteTarget.id);
    try {
      await channelUserApi.removeBinding(deleteTarget.id);
      setBindings(prev => prev.filter(b => b.id !== deleteTarget.id));
    } catch (e) { /* handled */ }
    setActionLoading(null);
    setDeleteTarget(null);
  };

  const handleWizardSuccess = () => {
    fetchBindings();
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress sx={{ color: '#6C63FF' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', py: 3, px: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700 }}>
            My Channels
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mt: 0.5 }}>
            Manage your connected communication channels
          </Typography>
        </Box>
        <Chip
          label={`${bindings.length} connected`}
          size="small"
          sx={{
            bgcolor: 'rgba(0,232,157,0.1)',
            color: '#00e89d',
            border: '1px solid rgba(0,232,157,0.2)',
          }}
        />
      </Box>

      {bindings.length === 0 ? (
        <Fade in>
          <Box sx={{
            textAlign: 'center', py: 8,
            bgcolor: 'rgba(26,26,46,0.5)',
            borderRadius: '16px',
            border: '1px dashed rgba(255,255,255,0.1)',
          }}>
            <LinkOffIcon sx={{ fontSize: 56, color: 'rgba(255,255,255,0.15)', mb: 2 }} />
            <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.4)', mb: 1 }}>
              No channels connected
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.25)', mb: 3 }}>
              Add a channel to start receiving messages across platforms
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setWizardOpen(true)}
              sx={{
                bgcolor: '#6C63FF',
                '&:hover': { bgcolor: '#5a52e0' },
                textTransform: 'none',
                px: 4,
              }}
            >
              Add Your First Channel
            </Button>
          </Box>
        </Fade>
      ) : (
        <Grid container spacing={2}>
          {bindings.map((binding, idx) => (
            <Grid item xs={12} sm={6} key={binding.id || idx}>
              <Grow in timeout={300 + idx * 100}>
                <Card sx={binding.is_preferred ? preferredCardStyle : cardStyle} elevation={0}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{
                          width: 40, height: 40, borderRadius: '10px',
                          bgcolor: `${binding.color || '#6C63FF'}20`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Box sx={{
                            width: 14, height: 14, borderRadius: '50%',
                            bgcolor: binding.color || '#6C63FF',
                          }} />
                        </Box>
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 600 }}>
                              {binding.display_name || binding.channel_type}
                            </Typography>
                            <ChannelPresenceIndicator channelType={binding.channel_type} size={8} />
                          </Box>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
                            {binding.channel_type}
                            {binding.is_preferred && (
                              <Chip
                                label="preferred"
                                size="small"
                                sx={{
                                  ml: 1, height: 16, fontSize: '0.6rem',
                                  bgcolor: 'rgba(108,99,255,0.15)',
                                  color: '#6C63FF',
                                  border: 'none',
                                }}
                              />
                            )}
                          </Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Tooltip title={binding.is_preferred ? 'Preferred channel' : 'Set as preferred'}>
                          <IconButton
                            size="small"
                            onClick={() => handleSetPreferred(binding.id)}
                            disabled={actionLoading === binding.id}
                            sx={{ color: binding.is_preferred ? '#6C63FF' : 'rgba(255,255,255,0.25)' }}
                          >
                            {binding.is_preferred ? <StarIcon /> : <StarBorderIcon />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove channel">
                          <IconButton
                            size="small"
                            onClick={() => setDeleteTarget(binding)}
                            disabled={actionLoading === binding.id}
                            sx={{ color: 'rgba(255,255,255,0.25)', '&:hover': { color: '#ff4444' } }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>

                    {(binding.capabilities || []).length > 0 && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1.5 }}>
                        {binding.capabilities.map(cap => (
                          <Chip
                            key={cap}
                            label={cap}
                            size="small"
                            sx={{
                              height: 20, fontSize: '0.65rem',
                              bgcolor: 'rgba(108,99,255,0.08)',
                              color: 'rgba(255,255,255,0.4)',
                              border: 'none',
                            }}
                          />
                        ))}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grow>
            </Grid>
          ))}
        </Grid>
      )}

      {/* FAB */}
      {bindings.length > 0 && (
        <Fab
          onClick={() => setWizardOpen(true)}
          sx={{
            position: 'fixed', bottom: 24, right: 24,
            bgcolor: '#6C63FF',
            '&:hover': { bgcolor: '#5a52e0' },
          }}
        >
          <AddIcon />
        </Fab>
      )}

      {/* Setup Wizard */}
      <ChannelSetupWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSuccess={handleWizardSuccess}
      />

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        PaperProps={{ sx: {
          bgcolor: '#0F0E17', backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px',
        }}}
      >
        <DialogTitle sx={{ color: '#fff' }}>Remove Channel</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>
            Remove <strong style={{ color: '#fff' }}>{deleteTarget?.display_name || deleteTarget?.channel_type}</strong> from
            your connected channels? You can re-add it later.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={handleRemove}
            variant="contained"
            sx={{ bgcolor: '#ff4444', '&:hover': { bgcolor: '#cc3333' }, textTransform: 'none' }}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
