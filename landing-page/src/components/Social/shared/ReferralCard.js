import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PeopleIcon from '@mui/icons-material/People';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Tooltip,
  Chip,
} from '@mui/material';
import React, {useState} from 'react';

export default function ReferralCard({code, stats = {}}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback: select text manually */
    }
  };

  return (
    <Card sx={{borderRadius: 3, overflow: 'visible'}}>
      <CardContent sx={{p: {xs: 1.5, md: 2}}}>
        <Typography variant="subtitle2" color="text.secondary" sx={{mb: 1}}>
          Your Referral Code
        </Typography>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'action.hover',
            borderRadius: 2,
            px: 2,
            py: 1,
            mb: 2,
          }}
        >
          <Typography
            variant="h6"
            sx={{
              fontFamily: 'monospace',
              letterSpacing: 2,
              fontWeight: 700,
              flex: 1,
              background: 'linear-gradient(to right, #00e89d, #0078ff)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {code || '------'}
          </Typography>
          <Tooltip title={copied ? 'Copied!' : 'Copy code'}>
            <IconButton size="small" onClick={handleCopy}>
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{display: 'flex', gap: 2, flexWrap: 'wrap'}}>
          <Chip
            icon={<PeopleIcon />}
            label={`${stats.total_referrals ?? 0} referrals`}
            variant="outlined"
            size="small"
            sx={{borderRadius: 2}}
          />
          <Chip
            icon={<EmojiEventsIcon />}
            label={`${stats.resonance_earned ?? 0} RP earned`}
            variant="outlined"
            size="small"
            color="primary"
            sx={{borderRadius: 2}}
          />
          {stats.active_referrals != null && (
            <Chip
              label={`${stats.active_referrals} active`}
              variant="outlined"
              size="small"
              color="success"
              sx={{borderRadius: 2}}
            />
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
