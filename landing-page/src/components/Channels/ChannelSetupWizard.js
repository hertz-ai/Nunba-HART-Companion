import QRPairingDisplay from './QRPairingDisplay';

import { channelUserApi, channelsApi } from '../../services/socialApi';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LaunchIcon from '@mui/icons-material/Launch';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Stepper, Step, StepLabel,
  Grid, Card, CardActionArea, CardContent, Typography, TextField, Box, Chip,
  CircularProgress, Alert, Collapse, IconButton
} from '@mui/material';
import React, { useState, useEffect } from 'react';



const STEPS = ['Select Channel', 'Configure', 'Confirm'];

const CATEGORY_LABELS = {
  core: 'Core',
  enterprise: 'Enterprise',
  social: 'Social',
  decentralized: 'Decentralized',
  bridge: 'Bridge / User Account',
  utility: 'Utility',
};

const CATEGORY_ORDER = ['core', 'enterprise', 'social', 'decentralized', 'bridge', 'utility'];

const dialogPaperSx = {
  bgcolor: '#0F0E17',
  backgroundImage: 'none',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
  minWidth: 600,
  maxWidth: 720,
};

const channelCardSx = (selected) => ({
  bgcolor: selected
    ? 'rgba(108, 99, 255, 0.15)'
    : 'rgba(26, 26, 46, 0.7)',
  border: selected
    ? '1px solid rgba(108, 99, 255, 0.5)'
    : '1px solid rgba(255,255,255,0.06)',
  borderRadius: '12px',
  transition: 'all 0.25s ease',
  '&:hover': {
    border: '1px solid rgba(108, 99, 255, 0.3)',
    transform: 'translateY(-2px)',
  },
});

export default function ChannelSetupWizard({ open, onClose, onSuccess }) {
  const [step, setStep] = useState(0);
  const [catalog, setCatalog] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [formData, setFormData] = useState({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedCats, setExpandedCats] = useState({});

  // Fetch catalog when dialog opens
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setSelectedChannel(null);
    setFormData({});
    setTestResult(null);
    setError('');
    setLoading(true);
    channelUserApi.catalog().then(res => {
      setCatalog(res?.data?.data || res?.data || []);
    }).catch(() => {
      setError('Failed to load channel catalog');
    }).finally(() => setLoading(false));
  }, [open]);

  // Group catalog by category
  const grouped = {};
  catalog.forEach(ch => {
    const cat = ch.category || 'utility';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(ch);
  });

  const sortedCategories = CATEGORY_ORDER.filter(c => grouped[c]?.length > 0);

  const toggleCategory = (cat) => {
    setExpandedCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleSelectChannel = (ch) => {
    setSelectedChannel(ch);
    // Pre-populate form fields
    const initial = {};
    (ch.setup_fields || []).forEach(f => {
      initial[f.name] = f.default || '';
    });
    setFormData(initial);
  };

  const handleFieldChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleNext = () => {
    if (step === 0 && !selectedChannel) return;
    if (step === 1) {
      handleCreateBinding();
      return;
    }
    setStep(s => s + 1);
  };

  const handleBack = () => {
    setError('');
    setTestResult(null);
    setStep(s => s - 1);
  };

  const handleCreateBinding = async () => {
    setStep(2);
    setTesting(true);
    setError('');
    setTestResult(null);
    try {
      // Create admin channel config (shows in ChannelsPage list)
      try {
        await channelsApi.create({
          channel_type: selectedChannel.channel_type,
          name: selectedChannel.display_name || selectedChannel.channel_type,
          enabled: true,
          config: formData,
        });
      } catch (adminErr) {
        // Channel may already exist (duplicate) — continue with binding
        const adminMsg = adminErr?.error || adminErr?.message || '';
        if (!adminMsg.includes('already exists')) {
          console.warn('[ChannelSetupWizard] Admin channel config:', adminMsg);
        }
      }

      // Create user-level channel binding
      const payload = {
        channel_type: selectedChannel.channel_type,
        config: formData,
      };
      const res = await channelUserApi.createBinding(payload);
      const binding = res?.data?.data || res?.data;

      // Test the channel connection
      try {
        await channelsApi.test(selectedChannel.channel_type);
        setTestResult({ success: true, binding });
      } catch (testErr) {
        // Binding created but test failed — still usable
        setTestResult({
          success: true,
          binding,
          warning: 'Channel added but connection test failed. It may still work.',
        });
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.error || err?.message || 'Failed to create channel binding';
      setError(msg);
      setTestResult({ success: false });
    } finally {
      setTesting(false);
    }
  };

  const handleFinish = () => {
    if (testResult?.binding && onSuccess) {
      onSuccess(testResult.binding);
    }
    onClose();
  };

  // --- Auth form rendering based on auth_method ---
  const renderAuthFields = () => {
    if (!selectedChannel) return null;
    const method = selectedChannel.auth_method;
    const fields = selectedChannel.setup_fields || [];

    // QR session — show QR pairing display
    if (method === 'qr_session') {
      return (
        <Box sx={{ my: 2 }}>
          <QRPairingDisplay onPaired={(data) => {
            setFormData(prev => ({ ...prev, session_token: data.token || data.code }));
          }} />
          {formData.session_token && (
            <Alert severity="success" sx={{ mt: 2, bgcolor: 'rgba(0,232,157,0.1)', color: '#00e89d' }}>
              Device paired successfully
            </Alert>
          )}
        </Box>
      );
    }

    // OAuth2 — show launch button
    if (method === 'oauth2') {
      return (
        <Box sx={{ my: 3, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 2 }}>
            You will be redirected to authorize {selectedChannel.display_name || selectedChannel.channel_type}.
          </Typography>
          <Button
            variant="contained"
            startIcon={<LaunchIcon />}
            onClick={() => {
              const authUrl = selectedChannel.oauth_url || `/api/social/channels/oauth/${selectedChannel.channel_type}/start`;
              window.open(authUrl, '_blank', 'width=500,height=600');
            }}
            sx={{
              bgcolor: '#6C63FF',
              '&:hover': { bgcolor: '#5a52e0' },
              textTransform: 'none',
              px: 4,
            }}
          >
            Authorize with {selectedChannel.display_name || selectedChannel.channel_type}
          </Button>
          {fields.map(f => (
            <TextField
              key={f.name}
              label={f.label || f.name}
              type={f.secret ? 'password' : 'text'}
              value={formData[f.name] || ''}
              onChange={(e) => handleFieldChange(f.name, e.target.value)}
              fullWidth
              size="small"
              required={f.required}
              helperText={f.help}
              sx={{ mt: 2, ...darkFieldSx }}
            />
          ))}
        </Box>
      );
    }

    // Default — render dynamic fields from setup_fields
    if (fields.length === 0) {
      return (
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', my: 2 }}>
          No additional configuration needed for this channel.
        </Typography>
      );
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, my: 2 }}>
        {fields.map(f => (
          <TextField
            key={f.name}
            label={f.label || f.name}
            type={f.secret ? 'password' : f.type === 'number' ? 'number' : 'text'}
            value={formData[f.name] || ''}
            onChange={(e) => handleFieldChange(f.name, e.target.value)}
            fullWidth
            size="small"
            required={f.required}
            placeholder={f.placeholder || ''}
            helperText={f.help || ''}
            sx={darkFieldSx}
          />
        ))}
      </Box>
    );
  };

  // --- Step content ---
  const renderStepContent = () => {
    if (step === 0) {
      if (loading) {
        return (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress sx={{ color: '#6C63FF' }} />
          </Box>
        );
      }
      return (
        <Box sx={{ maxHeight: 420, overflowY: 'auto', pr: 1 }}>
          {sortedCategories.map(cat => {
            const isExpanded = expandedCats[cat] !== false; // default expanded
            return (
              <Box key={cat} sx={{ mb: 2 }}>
                <Box
                  onClick={() => toggleCategory(cat)}
                  sx={{
                    display: 'flex', alignItems: 'center', cursor: 'pointer',
                    mb: 1, userSelect: 'none',
                  }}
                >
                  <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.5)', mr: 0.5 }}>
                    <ExpandMoreIcon sx={{
                      transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform 0.2s',
                    }} />
                  </IconButton>
                  <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', letterSpacing: 2 }}>
                    {CATEGORY_LABELS[cat] || cat}
                  </Typography>
                </Box>
                <Collapse in={isExpanded}>
                  <Grid container spacing={1.5}>
                    {grouped[cat].map(ch => {
                      const isSelected = selectedChannel?.channel_type === ch.channel_type;
                      return (
                        <Grid item xs={6} sm={4} key={ch.channel_type}>
                          <Card sx={channelCardSx(isSelected)} elevation={0}>
                            <CardActionArea onClick={() => handleSelectChannel(ch)} sx={{ p: 1.5 }}>
                              <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                  <Box sx={{
                                    width: 10, height: 10, borderRadius: '50%',
                                    bgcolor: ch.color || '#6C63FF', flexShrink: 0,
                                  }} />
                                  <Typography variant="body2" sx={{
                                    color: '#fff', fontWeight: 600,
                                    fontSize: '0.82rem', lineHeight: 1.2,
                                  }} noWrap>
                                    {ch.display_name || ch.channel_type}
                                  </Typography>
                                  {isSelected && (
                                    <CheckCircleIcon sx={{ color: '#00e89d', fontSize: 16, ml: 'auto' }} />
                                  )}
                                </Box>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                  {(ch.capabilities || []).slice(0, 3).map(cap => (
                                    <Chip
                                      key={cap}
                                      label={cap}
                                      size="small"
                                      sx={{
                                        height: 18, fontSize: '0.65rem',
                                        bgcolor: 'rgba(108,99,255,0.12)',
                                        color: 'rgba(255,255,255,0.5)',
                                        border: 'none',
                                      }}
                                    />
                                  ))}
                                </Box>
                              </CardContent>
                            </CardActionArea>
                          </Card>
                        </Grid>
                      );
                    })}
                  </Grid>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      );
    }

    if (step === 1) {
      return (
        <Box>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, mb: 2,
            p: 2, borderRadius: '8px', bgcolor: 'rgba(108,99,255,0.08)',
            border: '1px solid rgba(108,99,255,0.15)',
          }}>
            <Box sx={{
              width: 12, height: 12, borderRadius: '50%',
              bgcolor: selectedChannel?.color || '#6C63FF',
            }} />
            <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 600 }}>
              {selectedChannel?.display_name || selectedChannel?.channel_type}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', ml: 'auto' }}>
              {selectedChannel?.auth_method}
            </Typography>
          </Box>
          {renderAuthFields()}
        </Box>
      );
    }

    // Step 2 — Test & Confirm
    return (
      <Box sx={{ textAlign: 'center', py: 3 }}>
        {testing ? (
          <>
            <CircularProgress sx={{ color: '#6C63FF', mb: 2 }} />
            <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.7)' }}>
              Creating channel binding and testing connection...
            </Typography>
          </>
        ) : testResult?.success ? (
          <>
            <CheckCircleIcon sx={{ fontSize: 56, color: '#00e89d', mb: 2 }} />
            <Typography variant="h6" sx={{ color: '#00e89d', mb: 1 }}>
              Channel Connected
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 1 }}>
              {selectedChannel?.display_name || selectedChannel?.channel_type} is now active.
            </Typography>
            {testResult.warning && (
              <Alert severity="warning" sx={{
                mt: 2, bgcolor: 'rgba(255,152,0,0.1)',
                color: '#ff9800', textAlign: 'left',
              }}>
                {testResult.warning}
              </Alert>
            )}
          </>
        ) : (
          <>
            <Typography variant="h6" sx={{ color: '#ff4444', mb: 1 }}>
              Connection Failed
            </Typography>
            {error && (
              <Alert severity="error" sx={{
                mt: 1, bgcolor: 'rgba(255,68,68,0.1)',
                color: '#ff4444', textAlign: 'left',
              }}>
                {error}
              </Alert>
            )}
          </>
        )}
      </Box>
    );
  };

  const canProceed = () => {
    if (step === 0) return !!selectedChannel;
    if (step === 1) {
      const fields = selectedChannel?.setup_fields || [];
      const required = fields.filter(f => f.required);
      return required.every(f => formData[f.name]?.toString().trim());
    }
    return false;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" PaperProps={{ sx: dialogPaperSx }}>
      <DialogTitle sx={{ color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.06)', pb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>Add Channel</Typography>
        <Stepper activeStep={step} sx={{ mt: 2 }}>
          {STEPS.map(label => (
            <Step key={label}>
              <StepLabel
                sx={{
                  '& .MuiStepLabel-label': { color: 'rgba(255,255,255,0.4)' },
                  '& .MuiStepLabel-label.Mui-active': { color: '#6C63FF' },
                  '& .MuiStepLabel-label.Mui-completed': { color: '#00e89d' },
                  '& .MuiStepIcon-root': { color: 'rgba(255,255,255,0.12)' },
                  '& .MuiStepIcon-root.Mui-active': { color: '#6C63FF' },
                  '& .MuiStepIcon-root.Mui-completed': { color: '#00e89d' },
                }}
              >
                {label}
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </DialogTitle>

      <DialogContent sx={{ mt: 2, minHeight: 300 }}>
        {renderStepContent()}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {step === 2 ? (
          <Button onClick={handleFinish} variant="contained" sx={{
            bgcolor: testResult?.success ? '#00e89d' : '#6C63FF',
            color: testResult?.success ? '#0F0E17' : '#fff',
            '&:hover': { bgcolor: testResult?.success ? '#00c988' : '#5a52e0' },
            textTransform: 'none',
          }}>
            {testResult?.success ? 'Done' : 'Close'}
          </Button>
        ) : (
          <>
            <Button onClick={step === 0 ? onClose : handleBack} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              variant="contained"
              sx={{
                bgcolor: '#6C63FF',
                '&:hover': { bgcolor: '#5a52e0' },
                '&.Mui-disabled': { bgcolor: 'rgba(108,99,255,0.3)', color: 'rgba(255,255,255,0.3)' },
                textTransform: 'none',
              }}
            >
              {step === 1 ? 'Connect' : 'Next'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

const darkFieldSx = {
  '& .MuiOutlinedInput-root': {
    color: '#fff',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
    '&:hover fieldset': { borderColor: 'rgba(108,99,255,0.4)' },
    '&.Mui-focused fieldset': { borderColor: '#6C63FF' },
  },
  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#6C63FF' },
  '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.3)' },
};
