/**
 * ExperimentMetricsPanel — Live metrics for a thought experiment.
 * Context-aware: shows different content based on experiment_type.
 *
 * - physical_ai: camera feed thumbnail + "Live" badge
 * - software: build success rate, task breakdown
 * - traditional: vote distribution
 * - Common: contributor count, Spark invested, compute nodes
 */

import {experimentsApi} from '../../../services/socialApi';
import {RADIUS} from '../../../theme/socialTokens';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BuildIcon from '@mui/icons-material/Build';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MemoryIcon from '@mui/icons-material/Memory';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import VideocamIcon from '@mui/icons-material/Videocam';
import {
  Box,
  Typography,
  LinearProgress,
  CircularProgress,
  Chip,
  Collapse,
  IconButton,
  Button,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect} from 'react';

export default function ExperimentMetricsPanel({
  experimentId,
  experimentType,
  compact = false,
}) {
  const theme = useTheme();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    if (!experimentId || (!expanded && compact)) return;
    let cancelled = false;
    setLoading(true);
    experimentsApi
      .metrics(experimentId)
      .then((r) => {
        if (!cancelled && r.data?.data) setMetrics(r.data.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [experimentId, expanded, compact]);

  if (compact && !expanded) {
    return (
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mt: 0.5}}>
        <IconButton size="small" onClick={() => setExpanded(true)}>
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
        <Typography variant="caption" sx={{opacity: 0.6}}>
          Show metrics
        </Typography>
      </Box>
    );
  }

  if (loading && !metrics) {
    return (
      <Box sx={{display: 'flex', justifyContent: 'center', py: 2}}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  if (!metrics) return null;

  const {
    contributor_count = 0,
    funding_total = 0,
    vote_distribution = {},
    compute_nodes = 0,
    total_gpu_hours = 0,
    total_inferences = 0,
  } = metrics;

  return (
    <Box
      sx={{
        mt: 1.5,
        p: 2,
        borderRadius: RADIUS.md,
        bgcolor: alpha(theme.palette.background.paper, 0.5),
        border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
      }}
    >
      {compact && (
        <Box sx={{display: 'flex', justifyContent: 'flex-end', mb: 1}}>
          <IconButton size="small" onClick={() => setExpanded(false)}>
            <ExpandLessIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {/* Common metrics row */}
      <Box sx={{display: 'flex', gap: 3, flexWrap: 'wrap', mb: 1.5}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
          <PeopleAltIcon
            sx={{fontSize: 16, color: theme.palette.primary.main}}
          />
          <Typography variant="caption" fontWeight={600}>
            {contributor_count}{' '}
            {contributor_count === 1 ? 'person believes' : 'people believe'} in
            this
          </Typography>
        </Box>
        {funding_total > 0 && (
          <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
            <AutoAwesomeIcon sx={{fontSize: 16, color: '#FF6B6B'}} />
            <Typography variant="caption" fontWeight={600}>
              {funding_total.toLocaleString()} Spark invested
            </Typography>
          </Box>
        )}
        {compute_nodes > 0 && (
          <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
            <MemoryIcon sx={{fontSize: 16, color: '#10B981'}} />
            <Typography variant="caption" fontWeight={600}>
              {compute_nodes} nodes &middot; {total_gpu_hours}h GPU
            </Typography>
          </Box>
        )}
      </Box>

      {/* Funding bar */}
      {funding_total > 0 && (
        <Box sx={{mb: 1.5}}>
          <LinearProgress
            variant="determinate"
            value={Math.min(
              100,
              (funding_total / Math.max(funding_total * 1.5, 100)) * 100
            )}
            sx={{
              height: 6,
              borderRadius: RADIUS.sm,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              '& .MuiLinearProgress-bar': {
                background: 'linear-gradient(90deg, #6C63FF, #FF6B6B)',
                borderRadius: RADIUS.sm,
              },
            }}
          />
        </Box>
      )}

      {/* Type-specific section */}
      {metrics.experiment_type === 'physical_ai' && metrics.has_camera && (
        <Box
          sx={{
            position: 'relative',
            borderRadius: RADIUS.sm,
            overflow: 'hidden',
            bgcolor: '#000',
            height: 120,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {metrics.camera_feed_url ? (
            <img
              src={metrics.camera_feed_url}
              alt="Live experiment feed"
              style={{width: '100%', height: '100%', objectFit: 'cover'}}
            />
          ) : (
            <VideocamIcon sx={{fontSize: 40, opacity: 0.3, color: '#fff'}} />
          )}
          <Chip
            label="LIVE"
            size="small"
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              bgcolor: '#e74c3c',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.65rem',
              height: 20,
            }}
          />
        </Box>
      )}

      {metrics.experiment_type === 'software' && metrics.build_stats && (
        <Box sx={{mb: 1}}>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1}}>
            <BuildIcon sx={{fontSize: 16, color: theme.palette.warning.main}} />
            <Typography variant="caption" fontWeight={600}>
              Build Stats
            </Typography>
          </Box>
          <Box sx={{display: 'flex', gap: 2, alignItems: 'center'}}>
            <Box sx={{position: 'relative', display: 'inline-flex'}}>
              <CircularProgress
                variant="determinate"
                value={(metrics.build_stats.success_rate || 0) * 100}
                size={44}
                thickness={4}
                sx={{
                  color:
                    metrics.build_stats.success_rate >= 0.7
                      ? '#2ECC71'
                      : '#FFAB00',
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography
                  variant="caption"
                  fontWeight={700}
                  sx={{fontSize: '0.65rem'}}
                >
                  {Math.round((metrics.build_stats.success_rate || 0) * 100)}%
                </Typography>
              </Box>
            </Box>
            <Box sx={{display: 'flex', gap: 1, flexWrap: 'wrap'}}>
              <Chip
                size="small"
                label={`${metrics.build_stats.merged || 0} merged`}
                sx={{
                  bgcolor: alpha('#2ECC71', 0.15),
                  color: '#2ECC71',
                  fontWeight: 600,
                }}
              />
              <Chip
                size="small"
                label={`${metrics.build_stats.failed || 0} failed`}
                sx={{
                  bgcolor: alpha('#e74c3c', 0.15),
                  color: '#e74c3c',
                  fontWeight: 600,
                }}
              />
              {metrics.build_stats.in_progress > 0 && (
                <Chip
                  size="small"
                  label={`${metrics.build_stats.in_progress} active`}
                  sx={{
                    bgcolor: alpha('#FFAB00', 0.15),
                    color: '#FFAB00',
                    fontWeight: 600,
                  }}
                />
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* Vote distribution for all types */}
      {(vote_distribution.support > 0 || vote_distribution.oppose > 0) && (
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
          <ThumbUpIcon sx={{fontSize: 14, color: '#2ECC71'}} />
          <Typography variant="caption" sx={{color: '#2ECC71'}}>
            {vote_distribution.support}
          </Typography>
          <Box
            sx={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.divider, 0.15),
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            {(() => {
              const total =
                (vote_distribution.support || 0) +
                (vote_distribution.oppose || 0) +
                (vote_distribution.neutral || 0);
              if (!total) return null;
              const supportPct =
                ((vote_distribution.support || 0) / total) * 100;
              const opposePct = ((vote_distribution.oppose || 0) / total) * 100;
              return (
                <>
                  <Box
                    sx={{
                      width: `${supportPct}%`,
                      bgcolor: '#2ECC71',
                      transition: 'width 0.3s',
                    }}
                  />
                  <Box
                    sx={{
                      width: `${100 - supportPct - opposePct}%`,
                      bgcolor: alpha(theme.palette.divider, 0.2),
                    }}
                  />
                  <Box
                    sx={{
                      width: `${opposePct}%`,
                      bgcolor: '#e74c3c',
                      transition: 'width 0.3s',
                    }}
                  />
                </>
              );
            })()}
          </Box>
          <Typography variant="caption" sx={{color: '#e74c3c'}}>
            {vote_distribution.oppose}
          </Typography>
          <ThumbDownIcon sx={{fontSize: 14, color: '#e74c3c'}} />
        </Box>
      )}
    </Box>
  );
}
