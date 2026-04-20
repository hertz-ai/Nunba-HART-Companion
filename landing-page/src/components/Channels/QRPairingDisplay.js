import { channelUserApi } from '../../services/socialApi';

import RefreshIcon from '@mui/icons-material/Refresh';
import { Box, Typography, Button, CircularProgress, Paper } from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import React, { useState, useEffect, useCallback } from 'react';


export default function QRPairingDisplay({ onPaired }) {
  const [code, setCode] = useState('');
  const [qrValue, setQrValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(900);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await channelUserApi.generatePairCode();
      const data = res?.data?.data;
      if (data) {
        setCode(data.code);
        setQrValue(`hevolve://pair?code=${data.code}`);
        setSecondsLeft(data.expires_in_seconds || 900);
      }
    } catch (e) { /* handled */ }
    setLoading(false);
  }, []);

  useEffect(() => { generate(); }, [generate]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  // Poll for pairing completion while code is active
  useEffect(() => {
    if (!code || secondsLeft <= 0) return;
    let mounted = true;
    const pollId = setInterval(async () => {
      try {
        const res = await channelUserApi.verifyPairCode({ code });
        if (!mounted) return;
        if (res?.data?.data?.paired) {
          clearInterval(pollId);
          if (onPaired) onPaired(res.data.data);
        }
      } catch (e) { /* keep polling */ }
    }, 5000);
    return () => { mounted = false; clearInterval(pollId); };
  }, [code, secondsLeft, onPaired]);

  const minutes = Math.floor(Math.max(0, secondsLeft) / 60);
  const seconds = Math.max(0, secondsLeft) % 60;

  return (
    <Paper sx={{
      p: 3,
      bgcolor: 'rgba(15,14,23,0.95)',
      borderRadius: '12px',
      textAlign: 'center',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <Typography variant="h6" gutterBottom sx={{ color: '#fff' }}>
        Pair a Device
      </Typography>
      {loading ? (
        <CircularProgress sx={{ color: '#6C63FF', my: 4 }} />
      ) : (
        <>
          <Box sx={{ bgcolor: '#fff', borderRadius: '8px', display: 'inline-block', p: 2, my: 2 }}>
            <QRCodeSVG value={qrValue} size={180} />
          </Box>
          <Typography variant="body1" sx={{
            fontFamily: 'monospace',
            fontSize: '1.4rem',
            letterSpacing: 4,
            color: '#00e89d',
            my: 1,
          }}>
            {code}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
            Scan QR or enter code manually — expires in {minutes}:{seconds.toString().padStart(2, '0')}
          </Typography>
          {secondsLeft <= 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="error">Code expired</Typography>
            </Box>
          )}
          <Box sx={{ mt: 2 }}>
            <Button
              startIcon={<RefreshIcon />}
              onClick={generate}
              size="small"
              sx={{ color: '#6C63FF' }}
            >
              Regenerate
            </Button>
          </Box>
        </>
      )}
    </Paper>
  );
}
