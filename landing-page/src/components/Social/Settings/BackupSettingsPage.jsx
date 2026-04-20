/* eslint-disable no-unused-vars */
import {syncApi} from '../../../services/socialApi';

import {
  CloudUpload,
  CloudDownload,
  DevicesOther,
  Delete,
  ContentCopy,
  CheckCircle,
  Warning,
} from '@mui/icons-material';
import {
  Box,
  Typography,
  Button,
  TextField,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Divider,
  Chip,
  Paper,
  LinearProgress,
} from '@mui/material';
import React, {useState, useEffect, useCallback} from 'react';


const glass = {
  bgcolor: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 2,
};

export default function BackupSettingsPage() {
  const [backups, setBackups] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [backupRes, deviceRes] = await Promise.allSettled([
        syncApi.getBackupMetadata(),
        syncApi.listDevices(),
      ]);
      if (backupRes.status === 'fulfilled')
        setBackups(backupRes.value?.data || []);
      if (deviceRes.status === 'fulfilled')
        setDevices(deviceRes.value?.data || []);
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleBackup = async () => {
    if (backupPassphrase.length < 8) {
      setMessage({
        type: 'error',
        text: 'Passphrase must be at least 8 characters',
      });
      return;
    }
    setBacking(true);
    setMessage(null);
    try {
      const res = await syncApi.createBackup({passphrase: backupPassphrase});
      setMessage({
        type: 'success',
        text: `Backup created (${(res.data?.size_bytes / 1024).toFixed(1)} KB)`,
      });
      setBackupPassphrase('');
      fetchData();
    } catch (e) {
      setMessage({type: 'error', text: e?.error || 'Backup failed'});
    }
    setBacking(false);
  };

  const handleRestore = async (backupId) => {
    if (!restorePassphrase) {
      setMessage({
        type: 'error',
        text: 'Enter your backup passphrase to restore',
      });
      return;
    }
    setRestoring(true);
    setMessage(null);
    try {
      const res = await syncApi.restore({
        passphrase: restorePassphrase,
        backup_id: backupId,
      });
      const d = res.data || {};
      setMessage({
        type: 'success',
        text: `Restored: ${d.posts || 0} posts, ${d.comments || 0} comments${d.profile ? ', profile updated' : ''}`,
      });
      setRestorePassphrase('');
    } catch (e) {
      setMessage({
        type: 'error',
        text: e?.error || 'Restore failed — wrong passphrase?',
      });
    }
    setRestoring(false);
  };

  const handleUnlink = async (deviceId) => {
    try {
      await syncApi.unlinkDevice(deviceId);
      fetchData();
    } catch {
      setMessage({type: 'error', text: 'Failed to unlink device'});
    }
  };

  if (loading) {
    return (
      <Box sx={{p: 3, textAlign: 'center'}}>
        <CircularProgress size={24} sx={{color: '#6C63FF'}} />
      </Box>
    );
  }

  return (
    <Box sx={{maxWidth: 700, mx: 'auto', p: {xs: 2, md: 3}}}>
      <Typography variant="h5" sx={{color: '#fff', mb: 3, fontWeight: 600}}>
        Backup & Sync
      </Typography>

      {message && (
        <Alert
          severity={message.type}
          onClose={() => setMessage(null)}
          sx={{mb: 2}}
        >
          {message.text}
        </Alert>
      )}

      {/* ── Create Backup ── */}
      <Paper sx={{...glass, p: 2.5, mb: 3}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 2}}>
          <CloudUpload sx={{color: '#6C63FF'}} />
          <Typography variant="subtitle1" sx={{color: '#fff', fontWeight: 600}}>
            Create Backup
          </Typography>
        </Box>
        <Typography
          variant="body2"
          sx={{color: 'rgba(255,255,255,0.5)', mb: 2}}
        >
          Your data is encrypted with your passphrase before storage. We cannot
          read it.
        </Typography>
        <Box sx={{display: 'flex', gap: 1}}>
          <TextField
            size="small"
            type="password"
            placeholder="Backup passphrase (8+ chars)"
            value={backupPassphrase}
            onChange={(e) => setBackupPassphrase(e.target.value)}
            sx={{
              flex: 1,
              '& .MuiOutlinedInput-root': {
                color: '#fff',
                '& fieldset': {borderColor: 'rgba(255,255,255,0.15)'},
              },
            }}
          />
          <Button
            variant="contained"
            onClick={handleBackup}
            disabled={backing}
            sx={{bgcolor: '#6C63FF', '&:hover': {bgcolor: '#5A52E0'}}}
          >
            {backing ? <CircularProgress size={20} /> : 'Backup'}
          </Button>
        </Box>
      </Paper>

      {/* ── Backup History ── */}
      {backups.length > 0 && (
        <Paper sx={{...glass, p: 2.5, mb: 3}}>
          <Typography
            variant="subtitle1"
            sx={{color: '#fff', fontWeight: 600, mb: 1.5}}
          >
            Backup History
          </Typography>
          <List dense disablePadding>
            {backups.map((b) => (
              <ListItem key={b.id} sx={{px: 0}}>
                <ListItemText
                  primary={
                    <Typography variant="body2" sx={{color: '#fff'}}>
                      {new Date(b.created_at).toLocaleString()}
                    </Typography>
                  }
                  secondary={
                    <Typography
                      variant="caption"
                      sx={{color: 'rgba(255,255,255,0.4)'}}
                    >
                      {(b.size_bytes / 1024).toFixed(1)} KB &middot; v
                      {b.backup_version}
                    </Typography>
                  }
                />
                <ListItemSecondaryAction>
                  <Chip
                    label="Restore"
                    size="small"
                    onClick={() => handleRestore(b.id)}
                    icon={<CloudDownload sx={{fontSize: 14}} />}
                    sx={{
                      color: '#6C63FF',
                      borderColor: 'rgba(108,99,255,0.4)',
                      '& .MuiChip-icon': {color: '#6C63FF'},
                    }}
                    variant="outlined"
                  />
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
          <Box sx={{mt: 1.5}}>
            <TextField
              size="small"
              type="password"
              placeholder="Passphrase to restore"
              value={restorePassphrase}
              onChange={(e) => setRestorePassphrase(e.target.value)}
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: '#fff',
                  '& fieldset': {borderColor: 'rgba(255,255,255,0.15)'},
                },
              }}
            />
          </Box>
          {restoring && <LinearProgress sx={{mt: 1}} />}
        </Paper>
      )}

      {/* ── Devices ── */}
      <Paper sx={{...glass, p: 2.5}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 2}}>
          <DevicesOther sx={{color: '#6C63FF'}} />
          <Typography variant="subtitle1" sx={{color: '#fff', fontWeight: 600}}>
            Linked Devices
          </Typography>
        </Box>
        {devices.length === 0 ? (
          <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.4)'}}>
            No devices linked yet. Devices are linked automatically when you
            sign in.
          </Typography>
        ) : (
          <List dense disablePadding>
            {devices.map((d) => (
              <ListItem key={d.id} sx={{px: 0}}>
                <ListItemText
                  primary={
                    <Typography variant="body2" sx={{color: '#fff'}}>
                      {d.device_name || d.device_id}
                    </Typography>
                  }
                  secondary={
                    <Typography
                      variant="caption"
                      sx={{color: 'rgba(255,255,255,0.4)'}}
                    >
                      {d.platform} &middot; linked{' '}
                      {new Date(d.linked_at).toLocaleDateString()}
                    </Typography>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton size="small" onClick={() => handleUnlink(d.id)}>
                    <Delete
                      sx={{color: 'rgba(255,107,107,0.7)', fontSize: 18}}
                    />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
}
