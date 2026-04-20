import { channelUserApi } from '../../services/socialApi';

import { Box, Tooltip } from '@mui/material';
import React, { useState, useEffect } from 'react';

const STATUS_COLORS = {
  online: '#00e89d',
  offline: '#ff4444',
  error: '#ff9800',
};

export default function ChannelPresenceIndicator({ channelType, size = 10 }) {
  const [status, setStatus] = useState('offline');

  useEffect(() => {
    let mounted = true;
    const poll = () => {
      channelUserApi.presence().then(res => {
        if (!mounted) return;
        const found = (res?.data?.data || []).find(p => p.channel_type === channelType);
        setStatus(found?.status || 'offline');
      }).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => { mounted = false; clearInterval(id); };
  }, [channelType]);

  return (
    <Tooltip title={`${channelType}: ${status}`}>
      <Box sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: STATUS_COLORS[status] || STATUS_COLORS.offline,
        boxShadow: status === 'online' ? `0 0 6px ${STATUS_COLORS.online}` : 'none',
        display: 'inline-block',
      }} />
    </Tooltip>
  );
}
