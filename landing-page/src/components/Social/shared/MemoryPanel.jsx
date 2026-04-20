import {RADIUS, SHADOWS} from '../../../theme/socialTokens';

import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SearchIcon from '@mui/icons-material/Search';
import {
  Box,
  Typography,
  TextField,
  Chip,
  IconButton,
  InputAdornment,
  Drawer,
  CircularProgress,
} from '@mui/material';
import React, {useState, useEffect, useCallback, useRef} from 'react';


const PANEL_WIDTH = 360;

const TYPE_COLORS = {
  fact: '#7C4DFF',
  insight: '#448AFF',
  decision: '#FF9100',
  conversation: '#78909C',
  lifecycle: '#26A69A',
};

/**
 * Format a unix timestamp (seconds) into a relative time string.
 */
function timeAgo(timestamp) {
  if (!timestamp) return '';
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * MemoryPanel -- slide-out right panel showing agent memories.
 *
 * Props:
 *   open     (bool)   - whether the panel is visible
 *   onClose  (fn)     - callback to close
 *   userId   (string) - current user ID for API calls
 */
const MemoryPanel = ({open, onClose, userId}) => {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  // Load recent memories on mount / when panel opens
  const fetchRecent = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/memory/recent?user_id=${encodeURIComponent(userId)}&limit=20`
      );
      if (res.ok) {
        const data = await res.json();
        setMemories(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch recent memories:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open && userId) {
      fetchRecent();
    }
  }, [open, userId, fetchRecent]);

  // Search with debounce
  useEffect(() => {
    if (!open) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      // If search cleared, reload recent
      debounceRef.current = setTimeout(() => {
        fetchRecent();
      }, 150);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/memory/search?q=${encodeURIComponent(query)}&user_id=${encodeURIComponent(userId)}`
        );
        if (res.ok) {
          const data = await res.json();
          setMemories(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Memory search failed:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, userId, fetchRecent]);

  // Delete a memory
  const handleDelete = async (memoryId) => {
    try {
      const res = await fetch(
        `/api/memory/${encodeURIComponent(memoryId)}?user_id=${encodeURIComponent(userId)}`,
        {method: 'DELETE'}
      );
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== memoryId));
      }
    } catch (err) {
      console.error('Failed to delete memory:', err);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: PANEL_WIDTH,
          bgcolor: '#0F0E17',
          borderLeft: '1px solid rgba(108,99,255,0.15)',
          boxShadow: SHADOWS.float,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
          <PsychologyIcon sx={{color: '#6C63FF', fontSize: 24}} />
          <Typography
            variant="subtitle1"
            sx={{color: '#fff', fontWeight: 600}}
          >
            Agent Memory
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{color: '#78909C'}}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Search bar */}
      <Box sx={{px: 2, py: 1.5}}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search memories..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{color: '#6C63FF', fontSize: 20}} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: '#1A1730',
              borderRadius: RADIUS.md,
              color: '#fff',
              fontSize: 14,
              '& fieldset': {
                borderColor: 'rgba(108,99,255,0.2)',
              },
              '&:hover fieldset': {
                borderColor: 'rgba(108,99,255,0.4)',
              },
              '&.Mui-focused fieldset': {
                borderColor: '#6C63FF',
              },
            },
            '& .MuiInputBase-input::placeholder': {
              color: '#78909C',
              opacity: 1,
            },
          }}
        />
      </Box>

      {/* Memory list */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 2,
          pb: 2,
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': {width: 4},
          '&::-webkit-scrollbar-thumb': {
            bgcolor: 'rgba(108,99,255,0.3)',
            borderRadius: '2px',
          },
        }}
      >
        {(loading || searching) && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              py: 4,
            }}
          >
            <CircularProgress size={28} sx={{color: '#6C63FF'}} />
          </Box>
        )}

        {!loading && !searching && memories.length === 0 && (
          <Box sx={{textAlign: 'center', py: 4}}>
            <PsychologyIcon
              sx={{color: 'rgba(108,99,255,0.3)', fontSize: 48, mb: 1}}
            />
            <Typography variant="body2" sx={{color: '#78909C'}}>
              {query.trim()
                ? 'No memories match your search'
                : 'No memories recorded yet'}
            </Typography>
          </Box>
        )}

        {!loading &&
          !searching &&
          memories.map((mem) => (
            <Box
              key={mem.id}
              sx={{
                bgcolor: '#1A1730',
                borderRadius: RADIUS.md,
                p: 1.5,
                mb: 1,
                border: '1px solid rgba(255,255,255,0.04)',
                transition: 'border-color 0.2s ease',
                '&:hover': {
                  borderColor: 'rgba(108,99,255,0.2)',
                },
              }}
            >
              {/* Content (truncated to 2 lines) */}
              <Typography
                variant="body2"
                sx={{
                  color: '#E0DEF4',
                  fontSize: 13,
                  lineHeight: 1.5,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  mb: 1,
                }}
              >
                {mem.content}
              </Typography>

              {/* Footer: type badge + timestamp + delete */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                  <Chip
                    label={mem.memory_type || 'fact'}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: 11,
                      fontWeight: 500,
                      bgcolor:
                        (TYPE_COLORS[mem.memory_type] || TYPE_COLORS.fact) +
                        '22',
                      color:
                        TYPE_COLORS[mem.memory_type] || TYPE_COLORS.fact,
                      borderRadius: RADIUS.sm,
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{color: '#78909C', fontSize: 11}}
                  >
                    {timeAgo(mem.created_at)}
                  </Typography>
                </Box>

                <IconButton
                  size="small"
                  onClick={() => handleDelete(mem.id)}
                  sx={{
                    color: '#78909C',
                    p: 0.5,
                    '&:hover': {color: '#FF6B6B'},
                  }}
                >
                  <DeleteOutlineIcon sx={{fontSize: 16}} />
                </IconButton>
              </Box>
            </Box>
          ))}
      </Box>
    </Drawer>
  );
};

export default MemoryPanel;
