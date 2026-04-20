import {kidsColors, kidsRadius} from '../data/kidsTheme';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Box,
  Typography,
  LinearProgress,
  Chip,
  Collapse,
  IconButton,
} from '@mui/material';
import React, {useState, useEffect} from 'react';


/**
 * ContentGenStatus — shows content generation progress for a game.
 *
 * Props:
 *   gameId: string — game identifier
 *   compact?: boolean — minimal inline mode (default: false)
 *   showDevInfo?: boolean — show job IDs + task breakdown (default: false)
 */

const STATUS_COLORS = {
  complete: '#4CAF50',
  generating: '#2196F3',
  slow: '#FF9800',
  stuck: '#F44336',
  pending: '#9E9E9E',
  paused: '#607D8B',
};

const STATUS_LABELS = {
  complete: 'Ready',
  generating: 'Creating content...',
  slow: 'Slow progress',
  stuck: 'Stuck - retrying',
  pending: 'Waiting to start',
  paused: 'Paused',
};

export default function ContentGenStatus({
  gameId,
  compact = false,
  showDevInfo = false,
}) {
  const [progress, setProgress] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProgress = async () => {
    try {
      const {contentGenApi} = await import('../../../../services/socialApi');
      const res = await contentGenApi.getGame(gameId);
      if (res?.success) {
        setProgress(res.data);
      }
    } catch {
      // No content gen goal for this game — that's fine
      setProgress(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProgress();
    // Poll every 30s for active games
    const interval = setInterval(fetchProgress, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  if (loading || !progress) return null;
  if (progress.status === 'complete') return null; // Game is ready, no banner needed

  const statusColor = STATUS_COLORS[progress.status] || STATUS_COLORS.pending;
  const statusLabel = STATUS_LABELS[progress.status] || progress.status;
  const pct = progress.progress_pct || 0;
  const delta = progress.delta_24h || 0;

  if (compact) {
    return (
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: statusColor,
            flexShrink: 0,
          }}
        />
        <Typography
          variant="caption"
          sx={{color: statusColor, fontWeight: 600}}
        >
          {Math.round(pct)}%
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        mx: 2,
        mb: 2,
        p: 2,
        borderRadius: kidsRadius.md,
        bgcolor: 'rgba(255,255,255,0.05)',
        border: `1px solid ${statusColor}33`,
      }}
    >
      {/* Header */}
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1}}>
        <Box
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: statusColor,
            flexShrink: 0,
          }}
        />
        <Typography
          variant="body2"
          sx={{fontWeight: 700, color: '#fff', flex: 1}}
        >
          {statusLabel}
        </Typography>
        <Chip
          label={`${Math.round(pct)}%`}
          size="small"
          sx={{
            bgcolor: `${statusColor}22`,
            color: statusColor,
            fontWeight: 700,
            fontSize: 12,
            height: 24,
          }}
        />
        {delta !== 0 && (
          <Typography
            variant="caption"
            sx={{
              color: delta > 0 ? '#4CAF50' : '#F44336',
              fontWeight: 600,
            }}
          >
            {delta > 0 ? '+' : ''}
            {delta}% / 24h
          </Typography>
        )}
        {delta === 0 && pct > 0 && pct < 100 && (
          <Typography
            variant="caption"
            sx={{color: '#F44336', fontWeight: 600}}
          >
            0% / 24h
          </Typography>
        )}
        <IconButton size="small" onClick={fetchProgress} sx={{color: '#aaa'}}>
          <RefreshIcon sx={{fontSize: 16}} />
        </IconButton>
      </Box>

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 6,
          borderRadius: '3px',
          bgcolor: 'rgba(255,255,255,0.1)',
          '& .MuiLinearProgress-bar': {
            bgcolor: statusColor,
            borderRadius: '3px',
          },
        }}
      />

      {/* Dev info toggle */}
      {showDevInfo && progress.tasks && progress.tasks.length > 0 && (
        <>
          <Box
            onClick={() => setExpanded(!expanded)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              mt: 1,
              cursor: 'pointer',
            }}
          >
            <ExpandMoreIcon
              sx={{
                fontSize: 18,
                color: '#888',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            />
            <Typography variant="caption" sx={{color: '#888'}}>
              Task details
            </Typography>
          </Box>
          <Collapse in={expanded}>
            <Box sx={{mt: 1, pl: 1}}>
              {progress.tasks.map((task) => (
                <Box
                  key={task.task_type}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.5,
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: '#ccc',
                      width: 50,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      fontSize: 10,
                    }}
                  >
                    {task.task_type}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={task.progress_pct || 0}
                    sx={{
                      flex: 1,
                      height: 4,
                      borderRadius: 2,
                      bgcolor: 'rgba(255,255,255,0.08)',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: STATUS_COLORS[task.status] || '#666',
                        borderRadius: 2,
                      },
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      color: '#888',
                      fontSize: 10,
                      minWidth: 30,
                      textAlign: 'right',
                    }}
                  >
                    {task.completed}/{task.required}
                  </Typography>
                  <Chip
                    label={task.status}
                    size="small"
                    sx={{
                      fontSize: 9,
                      height: 18,
                      bgcolor: `${STATUS_COLORS[task.status] || '#666'}22`,
                      color: STATUS_COLORS[task.status] || '#666',
                    }}
                  />
                  {task.job_id && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: '#666',
                        fontSize: 9,
                        fontFamily: 'monospace',
                      }}
                    >
                      {task.job_id}
                    </Typography>
                  )}
                  {task.error && (
                    <Typography
                      variant="caption"
                      sx={{color: '#F44336', fontSize: 9}}
                    >
                      {task.error}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </Collapse>
        </>
      )}
    </Box>
  );
}
