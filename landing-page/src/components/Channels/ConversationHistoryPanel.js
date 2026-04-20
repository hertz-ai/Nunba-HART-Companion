import { channelUserApi } from '../../services/socialApi';

import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Box, Typography, Tabs, Tab, CircularProgress, Button, Chip, Paper, Fade,
} from '@mui/material';
import React, { useState, useEffect, useCallback } from 'react';


const ROLE_STYLES = {
  user: {
    bgcolor: 'rgba(108, 99, 255, 0.1)',
    border: '1px solid rgba(108, 99, 255, 0.2)',
    align: 'flex-end',
    color: '#fff',
    label: 'You',
    labelColor: '#6C63FF',
  },
  assistant: {
    bgcolor: 'rgba(0, 232, 157, 0.08)',
    border: '1px solid rgba(0, 232, 157, 0.15)',
    align: 'flex-start',
    color: 'rgba(255,255,255,0.9)',
    label: 'Assistant',
    labelColor: '#00e89d',
  },
};

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ConversationHistoryPanel({ channelTypes }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [availableTypes, setAvailableTypes] = useState([]);

  const fetchMessages = useCallback(async (pageNum, channelFilter, append) => {
    const setter = pageNum === 1 ? setLoading : setLoadingMore;
    setter(true);
    try {
      const params = { page: pageNum, per_page: 20 };
      if (channelFilter && channelFilter !== 'all') {
        params.channel_type = channelFilter;
      }
      const res = await channelUserApi.conversations(params);
      const data = res?.data?.data || res?.data || [];
      const items = Array.isArray(data) ? data : data.items || [];
      const meta = data.meta || {};

      if (append) {
        setMessages(prev => [...prev, ...items]);
      } else {
        setMessages(items);
      }
      setHasMore(meta.has_next !== undefined ? meta.has_next : items.length >= 20);

      // Extract unique channel types for filter tabs
      if (pageNum === 1 && !append) {
        const types = [...new Set(items.map(m => m.channel_type).filter(Boolean))];
        if (channelTypes?.length) {
          setAvailableTypes(channelTypes);
        } else if (types.length > 0) {
          setAvailableTypes(types);
        }
      }
    } catch (e) {
      if (!append) setMessages([]);
    } finally {
      setter(false);
    }
  }, [channelTypes]);

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    fetchMessages(1, activeTab, false);
  }, [activeTab, fetchMessages]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchMessages(nextPage, activeTab, true);
  };

  const handleTabChange = (_, val) => {
    setActiveTab(val);
  };

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto' }}>
      {/* Filter tabs */}
      {availableTypes.length > 0 && (
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            mb: 2,
            '& .MuiTab-root': {
              color: 'rgba(255,255,255,0.4)',
              textTransform: 'none',
              minHeight: 36,
              fontSize: '0.82rem',
            },
            '& .Mui-selected': { color: '#6C63FF' },
            '& .MuiTabs-indicator': { bgcolor: '#6C63FF' },
          }}
        >
          <Tab label="All" value="all" />
          {availableTypes.map(t => (
            <Tab key={t} label={t} value={t} />
          ))}
        </Tabs>
      )}

      {/* Messages timeline */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress sx={{ color: '#6C63FF' }} />
        </Box>
      ) : messages.length === 0 ? (
        <Fade in>
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <ChatBubbleOutlineIcon sx={{ fontSize: 48, color: 'rgba(255,255,255,0.12)', mb: 1 }} />
            <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.35)' }}>
              No conversations yet
            </Typography>
          </Box>
        </Fade>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {messages.map((msg, idx) => {
            const role = msg.role === 'user' ? 'user' : 'assistant';
            const style = ROLE_STYLES[role];
            return (
              <Fade in timeout={200 + idx * 50} key={msg.id || idx}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: style.align }}>
                  {/* Channel badge + timestamp */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, px: 0.5 }}>
                    {msg.channel_type && (
                      <Chip
                        size="small"
                        label={msg.channel_type}
                        icon={
                          <Box sx={{
                            width: 6, height: 6, borderRadius: '50%',
                            bgcolor: msg.channel_color || '#6C63FF',
                            ml: 0.5,
                          }} />
                        }
                        sx={{
                          height: 18, fontSize: '0.6rem',
                          bgcolor: 'rgba(108,99,255,0.08)',
                          color: 'rgba(255,255,255,0.4)',
                          border: 'none',
                          '& .MuiChip-icon': { minWidth: 'auto' },
                        }}
                      />
                    )}
                    <Typography variant="caption" sx={{ color: style.labelColor, fontSize: '0.65rem' }}>
                      {style.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.6rem' }}>
                      {formatTimestamp(msg.created_at || msg.timestamp)}
                    </Typography>
                  </Box>

                  {/* Message bubble */}
                  <Paper
                    elevation={0}
                    sx={{
                      maxWidth: '80%',
                      p: 1.5,
                      borderRadius: '12px',
                      bgcolor: style.bgcolor,
                      border: style.border,
                    }}
                  >
                    <Typography variant="body2" sx={{ color: style.color, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {msg.content || msg.message || msg.text || ''}
                    </Typography>
                  </Paper>
                </Box>
              </Fade>
            );
          })}

          {/* Load more */}
          {hasMore && (
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Button
                onClick={handleLoadMore}
                disabled={loadingMore}
                startIcon={loadingMore ? <CircularProgress size={16} /> : <ExpandMoreIcon />}
                sx={{
                  color: '#6C63FF',
                  textTransform: 'none',
                  '&.Mui-disabled': { color: 'rgba(108,99,255,0.3)' },
                }}
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
