import {channelsApi} from '../../services/socialApi';
import ChannelSetupWizard from '../Channels/ChannelSetupWizard';
import ChannelPresenceIndicator from '../Channels/ChannelPresenceIndicator';

import {
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Switch,
  Box,
  Grid,
  IconButton,
  Tooltip,
  Skeleton,
  Fade,
  Grow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
} from '@mui/material';
import TelegramIcon from '@mui/icons-material/Telegram';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import FacebookIcon from '@mui/icons-material/Facebook';
import TwitterIcon from '@mui/icons-material/Twitter';
import InstagramIcon from '@mui/icons-material/Instagram';
import ChatIcon from '@mui/icons-material/Chat';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StorageIcon from '@mui/icons-material/Storage';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import React, {useState, useEffect} from 'react';

const CHANNEL_TYPES = [
  {value: 'telegram', label: 'Telegram'},
  {value: 'whatsapp', label: 'WhatsApp'},
  {value: 'discord', label: 'Discord'},
  {value: 'slack', label: 'Slack'},
  {value: 'facebook', label: 'Facebook Messenger'},
  {value: 'twitter', label: 'Twitter / X'},
  {value: 'instagram', label: 'Instagram'},
];

const CHANNEL_ICONS = {
  telegram: <TelegramIcon />,
  whatsapp: <WhatsAppIcon />,
  facebook: <FacebookIcon />,
  twitter: <TwitterIcon />,
  instagram: <InstagramIcon />,
  discord: <ChatIcon />,
  slack: <ChatIcon />,
};

const CHANNEL_COLORS = {
  telegram: '#0088cc',
  whatsapp: '#25d366',
  facebook: '#1877f2',
  twitter: '#1da1f2',
  instagram: '#e4405f',
  discord: '#5865f2',
  slack: '#4a154b',
};

const STATUS_CONFIG = {
  connected: {
    color: '#00e89d',
    bg: 'linear-gradient(135deg, rgba(0, 232, 157, 0.2) 0%, rgba(0, 180, 120, 0.2) 100%)',
    border: '1px solid rgba(0, 232, 157, 0.3)',
    glow: '0 0 10px rgba(0, 232, 157, 0.3)',
  },
  disconnected: {
    color: '#ff4444',
    bg: 'linear-gradient(135deg, rgba(255, 68, 68, 0.2) 0%, rgba(255, 100, 100, 0.2) 100%)',
    border: '1px solid rgba(255, 68, 68, 0.3)',
    glow: 'none',
  },
  pending: {
    color: '#ff9800',
    bg: 'linear-gradient(135deg, rgba(255, 152, 0, 0.2) 0%, rgba(255, 200, 0, 0.2) 100%)',
    border: '1px solid rgba(255, 152, 0, 0.3)',
    glow: 'none',
  },
};

// Card style
const cardStyle = {
  background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 26, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 3,
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(108, 99, 255, 0.2)',
  },
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    color: '#fff',
    '& fieldset': {borderColor: 'rgba(255,255,255,0.2)'},
    '&:hover fieldset': {borderColor: 'rgba(108, 99, 255, 0.5)'},
    '&.Mui-focused fieldset': {borderColor: '#6C63FF'},
  },
  '& .MuiInputLabel-root': {color: 'rgba(255,255,255,0.5)'},
  '& .MuiInputLabel-root.Mui-focused': {color: '#6C63FF'},
  '& .MuiSelect-icon': {color: 'rgba(255,255,255,0.5)'},
};

// Loading skeleton
function ChannelSkeleton() {
  return (
    <Card sx={{...cardStyle, '&:hover': {}}}>
      <CardContent sx={{p: 3}}>
        <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2}}>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
            <Skeleton variant="rounded" width={48} height={48} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
            <Box>
              <Skeleton variant="text" width={120} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
              <Skeleton variant="rounded" width={80} height={20} sx={{bgcolor: 'rgba(255,255,255,0.05)', mt: 0.5}} />
            </Box>
          </Box>
          <Skeleton variant="rounded" width={40} height={24} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
        </Box>
        <Box sx={{display: 'flex', gap: 1}}>
          <Skeleton variant="circular" width={32} height={32} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
          <Skeleton variant="circular" width={32} height={32} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
        </Box>
      </CardContent>
    </Card>
  );
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [newChannel, setNewChannel] = useState({type: 'telegram', name: '', token: ''});

  useEffect(() => {
    const load = async () => {
      try {
        const res = await channelsApi.list();

        // ✅ FIX: Normalize to array to avoid crash (blank page) when backend returns an object
        const data = res?.data;
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.channels)
            ? data.channels
            : [];

        setChannels(list);
      } catch (err) {
        console.error('[ChannelsPage] Failed to load channels:', err);
        const msg = err?.error || err?.message || '';
        if (msg.includes('Authorization') || msg.includes('token')) {
          setError('Authentication required. Please log in with an admin account.');
        }
        setChannels([]);
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleCreate = async () => {
    if (!newChannel.name.trim()) return;
    setActionLoading('create');
    try {
      const res = await channelsApi.create({
        channel_type: newChannel.type,
        name: newChannel.name,
        config: newChannel.token ? {token: newChannel.token} : {},
      });
      setChannels((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        res.data || {
          id: newChannel.type,
          type: newChannel.type,
          name: newChannel.name,
          status: 'pending',
          enabled: false,
        },
      ]);
      setDialogOpen(false);
      setNewChannel({type: 'telegram', name: '', token: ''});
    } catch (err) {
      console.error('[ChannelsPage] Failed to create channel:', err);
      const msg = err?.error || err?.message || 'Failed to create channel';
      setError(msg.includes('Authorization') ? 'Admin authentication required to create channels.' : msg);
    }
    setActionLoading(null);
  };

  const handleToggle = async (channelId, enabled) => {
    setActionLoading(channelId);
    try {
      if (enabled) {
        await channelsApi.enable(channelId);
      } else {
        await channelsApi.disable(channelId);
      }
      setChannels((prev) =>
        (Array.isArray(prev) ? prev : []).map((c) => (c.id === channelId ? {...c, enabled} : c))
      );
    } catch (err) {
      console.error('[ChannelsPage] Toggle failed:', err);
      setError(`Failed to ${enabled ? 'enable' : 'disable'} channel. ${err?.message || ''}`);
    }
    setActionLoading(null);
  };

  const handleTest = async (channelId) => {
    setActionLoading(`test-${channelId}`);
    try {
      await channelsApi.test(channelId);
      setError(null);
      // Use inline message instead of alert (pywebview-safe)
      setChannels((prev) =>
        (Array.isArray(prev) ? prev : []).map((c) => (c.id === channelId ? {...c, _lastTest: 'Test message sent'} : c))
      );
    } catch (err) {
      console.error('[ChannelsPage] Test failed:', err);
      setChannels((prev) =>
        (Array.isArray(prev) ? prev : []).map((c) => (c.id === channelId ? {...c, _lastTest: 'Test failed'} : c))
      );
    }
    setActionLoading(null);
  };

  const handleReconnect = async (channelId) => {
    setActionLoading(`reconnect-${channelId}`);
    try {
      await channelsApi.reconnect(channelId);
      setChannels((prev) =>
        (Array.isArray(prev) ? prev : []).map((c) => (c.id === channelId ? {...c, status: 'connected'} : c))
      );
    } catch (err) {
      console.error('[ChannelsPage] Reconnect failed:', err);
      setError(`Reconnect failed for channel. ${err?.message || ''}`);
    }
    setActionLoading(null);
  };

  // ✅ FIX: use a guaranteed array for rendering
  const channelsList = Array.isArray(channels) ? channels : [];

  return (
    <Fade in={true} timeout={300}>
      <Box>
        {/* Page Header */}
        <Box sx={{mb: 4}}>
          <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2}}>
            <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
              <Box sx={{
                width: 48,
                height: 48,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.15) 0%, rgba(155, 148, 255, 0.15) 100%)',
              }}>
                <StorageIcon sx={{
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
                  Channel Integrations
                </Typography>
                <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                  Connect your agent to messaging platforms
                </Typography>
              </Box>
            </Box>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setWizardOpen(true)}
              sx={{
                background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                px: 3,
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 20px rgba(108, 99, 255, 0.3)',
                },
              }}
            >
              Add Channel
            </Button>
          </Box>
        </Box>

        {/* Error Banner */}
        {error && (
          <Fade in={true} timeout={200}>
            <Box sx={{
              mb: 3, p: 2, borderRadius: 2,
              background: 'linear-gradient(135deg, rgba(255,152,0,0.1) 0%, rgba(255,200,0,0.1) 100%)',
              border: '1px solid rgba(255,152,0,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <Typography variant="body2" sx={{color: '#ff9800'}}>
                {error}
              </Typography>
              <IconButton size="small" onClick={() => setError(null)} sx={{color: 'rgba(255,152,0,0.7)'}}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Fade>
        )}

        {/* Channels Grid */}
        {loading ? (
          <Grid container spacing={3}>
            {[1, 2, 3, 4].map((i) => (
              <Grid item xs={12} md={6} key={i}>
                <ChannelSkeleton />
              </Grid>
            ))}
          </Grid>
        ) : channelsList.length === 0 ? (
          <Grow in={true} timeout={400}>
            <Box sx={{
              textAlign: 'center',
              py: 8,
              background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.6) 0%, rgba(15, 15, 26, 0.6) 100%)',
              borderRadius: 3,
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <StorageIcon sx={{
                fontSize: 64,
                color: 'rgba(255,255,255,0.2)',
                mb: 2,
              }} />
              <Typography variant="h6" sx={{color: '#fff', fontWeight: 600, mb: 1}}>
                No Channels Configured
              </Typography>
              <Typography sx={{color: 'rgba(255,255,255,0.5)', mb: 3}}>
                Connect your first messaging platform to enable multi-channel engagement
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setDialogOpen(true)}
                sx={{
                  background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  px: 3,
                }}
              >
                Add Channel
              </Button>
            </Box>
          </Grow>
        ) : (
          <Grid container spacing={3}>
            {channelsList.map((channel, index) => {
              const statusConfig = STATUS_CONFIG[channel.status] || STATUS_CONFIG.disconnected;
              const channelColor = CHANNEL_COLORS[channel.type] || '#6C63FF';

              return (
                <Grid item xs={12} md={6} key={channel.id}>
                  <Grow in={true} timeout={400 + index * 100}>
                    <Card sx={cardStyle}>
                      <CardContent sx={{p: 3}}>
                        <Box sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          mb: 2,
                        }}>
                          <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
                            <Box sx={{
                              width: 48,
                              height: 48,
                              borderRadius: 2,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: `${channelColor}20`,
                              transition: 'all 0.3s ease',
                              '& svg': {
                                fontSize: 24,
                                color: channelColor,
                              },
                            }}>
                              {CHANNEL_ICONS[channel.type] || <ChatIcon />}
                            </Box>
                            <Box>
                              <Typography variant="subtitle1" sx={{
                                fontWeight: 600,
                                color: '#fff',
                              }}>
                                {channel.name}
                              </Typography>
                              <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mt: 0.5}}>
                                <Box sx={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  background: statusConfig.color,
                                  boxShadow: statusConfig.glow,
                                }} />
                                <Chip
                                  size="small"
                                  label={channel.status || 'disconnected'}
                                  sx={{
                                    height: 20,
                                    fontSize: '0.7rem',
                                    background: statusConfig.bg,
                                    color: statusConfig.color,
                                    border: statusConfig.border,
                                    fontWeight: 500,
                                    textTransform: 'capitalize',
                                  }}
                                />
                              </Box>
                              <ChannelPresenceIndicator channelType={channel.type} size={8} />
                            </Box>
                          </Box>
                          <Switch
                            checked={!!channel.enabled}
                            onChange={(e) => handleToggle(channel.id, e.target.checked)}
                            disabled={actionLoading === channel.id}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: '#6C63FF',
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: '#6C63FF',
                              },
                            }}
                          />
                        </Box>

                        {/* Test result message */}
                        {channel._lastTest && (
                          <Typography variant="caption" sx={{
                            color: channel._lastTest.includes('failed') ? '#ff4444' : '#6C63FF',
                            display: 'block', mb: 1,
                          }}>
                            {channel._lastTest}
                          </Typography>
                        )}

                        <Box sx={{
                          display: 'flex',
                          gap: 1,
                          pt: 2,
                          borderTop: '1px solid rgba(255,255,255,0.05)',
                        }}>
                          <Tooltip title="Test Connection" arrow>
                            <IconButton
                              size="small"
                              onClick={() => handleTest(channel.id)}
                              disabled={actionLoading === `test-${channel.id}`}
                              sx={{
                                background: 'rgba(255,255,255,0.05)',
                                color: 'rgba(255,255,255,0.7)',
                                transition: 'all 0.3s ease',
                                '&:hover': {
                                  background: 'rgba(108, 99, 255, 0.1)',
                                  color: '#6C63FF',
                                  transform: 'scale(1.1)',
                                },
                              }}
                            >
                              <PlayArrowIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Reconnect" arrow>
                            <IconButton
                              size="small"
                              onClick={() => handleReconnect(channel.id)}
                              disabled={actionLoading === `reconnect-${channel.id}`}
                              sx={{
                                background: 'rgba(255,255,255,0.05)',
                                color: 'rgba(255,255,255,0.7)',
                                transition: 'all 0.3s ease',
                                '&:hover': {
                                  background: 'rgba(155, 148, 255, 0.1)',
                                  color: '#9B94FF',
                                  transform: 'scale(1.1)',
                                },
                                '& svg': {
                                  animation: actionLoading === `reconnect-${channel.id}` ? 'spin 1s linear infinite' : 'none',
                                  '@keyframes spin': {
                                    '0%': {transform: 'rotate(0deg)'},
                                    '100%': {transform: 'rotate(360deg)'},
                                  },
                                },
                              }}
                            >
                              <RefreshIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grow>
                </Grid>
              );
            })}
          </Grid>
        )}

        {/* Channel Setup Wizard */}
        <ChannelSetupWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onSuccess={() => {
            setWizardOpen(false);
            // Refresh channels list
            channelsApi.list().then(res => {
              const data = res?.data;
              const list = Array.isArray(data) ? data : Array.isArray(data?.channels) ? data.channels : [];
              setChannels(list);
            }).catch(() => {});
          }}
        />

        {/* Add Channel Dialog */}
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          PaperProps={{
            sx: {
              background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.98) 0%, rgba(15, 15, 26, 0.98) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 3,
              minWidth: 420,
            },
          }}
        >
          <DialogTitle sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#fff',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
              <StorageIcon sx={{color: '#6C63FF'}} />
              Add Channel
            </Box>
            <IconButton
              size="small"
              onClick={() => setDialogOpen(false)}
              sx={{color: 'rgba(255,255,255,0.5)'}}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{pt: 3, pb: 1, display: 'flex', flexDirection: 'column', gap: 2.5}}>
            <TextField
              select
              fullWidth
              label="Platform"
              value={newChannel.type}
              onChange={(e) => setNewChannel((p) => ({...p, type: e.target.value}))}
              sx={inputSx}
            >
              {CHANNEL_TYPES.map((ct) => (
                <MenuItem key={ct.value} value={ct.value}>{ct.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              autoFocus
              fullWidth
              label="Channel Name"
              placeholder="e.g. My Telegram Bot"
              value={newChannel.name}
              onChange={(e) => setNewChannel((p) => ({...p, name: e.target.value}))}
              onKeyDown={(e) => { if (e.key === 'Enter' && newChannel.name.trim()) handleCreate(); }}
              sx={inputSx}
            />
            <TextField
              fullWidth
              label="Bot Token / API Key (optional)"
              placeholder="Paste your bot token here"
              value={newChannel.token}
              onChange={(e) => setNewChannel((p) => ({...p, token: e.target.value}))}
              onKeyDown={(e) => { if (e.key === 'Enter' && newChannel.name.trim()) handleCreate(); }}
              sx={inputSx}
            />
          </DialogContent>
          <DialogActions sx={{p: 3, borderTop: '1px solid rgba(255,255,255,0.05)'}}>
            <Button
              onClick={() => setDialogOpen(false)}
              sx={{color: 'rgba(255,255,255,0.7)', textTransform: 'none'}}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newChannel.name.trim() || actionLoading === 'create'}
              variant="contained"
              sx={{
                background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
              }}
            >
              {actionLoading === 'create' ? 'Creating...' : 'Create Channel'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Fade>
  );
}