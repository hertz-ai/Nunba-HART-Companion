/**
 * ExperimentDiscoveryPage — Context-aware thought experiment discovery.
 *
 * Context-aware features:
 * - Greeting changes by time of day
 * - Tab suggestions based on user's past interactions (user_intents from API)
 * - "Nearby experimenters" section if encounters are active
 * - Highlighted experiments from bonded users
 * - Active experiment status badges (voting, evaluating) shown prominently
 *
 * Route: /social/experiments
 */

import ExperimentMetricsPanel from './ExperimentMetricsPanel';

import { useSocial } from '../../../contexts/SocialContext';
import { experimentsApi, encountersApi } from '../../../services/socialApi';
import { GRADIENTS, RADIUS, EASINGS, socialTokens, INTENT_COLORS } from '../../../theme/socialTokens';
import { useRoleAccess } from '../../RoleGuard';
import CreateThoughtExperimentDialog from '../Feed/CreateThoughtExperimentDialog';
import ThoughtExperimentCard from '../Feed/ThoughtExperimentCard';
import EmptyState from '../shared/EmptyState';
import PostCardSkeleton from '../shared/PostCardSkeleton';

import AddIcon from '@mui/icons-material/Add';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CodeIcon from '@mui/icons-material/Code';
import GroupIcon from '@mui/icons-material/Group';
import HandymanIcon from '@mui/icons-material/Handyman';
import ScienceIcon from '@mui/icons-material/Science';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import {
  Box, Tabs, Tab, Chip, Typography, Fab, Fade, Card, Skeleton,
  useTheme, useMediaQuery,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useState, useEffect, useCallback, useMemo } from 'react';

const TABS = [
  { label: 'For You', key: 'recommended', icon: <TrendingUpIcon sx={{ fontSize: 16 }} /> },
  { label: 'Active', key: 'active', icon: <ScienceIcon sx={{ fontSize: 16 }} /> },
  { label: 'Physical AI', key: 'physical_ai', icon: <CameraAltIcon sx={{ fontSize: 16 }} /> },
  { label: 'Software', key: 'software', icon: <CodeIcon sx={{ fontSize: 16 }} /> },
  { label: 'Traditional', key: 'traditional', icon: <HandymanIcon sx={{ fontSize: 16 }} /> },
];

const INTENT_CHIPS = [
  { label: 'Technology', key: 'technology' },
  { label: 'Health', key: 'health' },
  { label: 'Education', key: 'education' },
  { label: 'Environment', key: 'environment' },
  { label: 'Community', key: 'community' },
  { label: 'Equity', key: 'equity' },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Late night thought experiments';
  if (h < 12) return 'Morning thought experiments';
  if (h < 17) return 'Afternoon thought experiments';
  if (h < 21) return 'Evening thought experiments';
  return 'Night owl thought experiments';
}

export default function ExperimentDiscoveryPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useSocial();
  const { canWrite } = useRoleAccess();

  const [tab, setTab] = useState(0);
  const [intentFilter, setIntentFilter] = useState(null);
  const [experiments, setExperiments] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [nearbyCount, setNearbyCount] = useState(0);
  const [expandedMetrics, setExpandedMetrics] = useState({});

  const currentTab = TABS[tab];

  // Context-aware: fetch nearby count for social proof
  useEffect(() => {
    if (user?.id) {
      encountersApi.nearbyCount()
        .then(r => { if (r.data?.data?.count) setNearbyCount(r.data.data.count); })
        .catch(() => {});
    }
  }, [user?.id]);

  const fetchExperiments = useCallback(async (reset = false) => {
    const newOffset = reset ? 0 : offset;
    setLoading(true);
    try {
      const params = {
        user_id: user?.id,
        limit: 20,
        offset: newOffset,
      };
      if (intentFilter) params.intent_category = intentFilter;
      if (currentTab.key === 'active') params.status = 'voting';
      else if (['physical_ai', 'software', 'traditional'].includes(currentTab.key)) {
        params.experiment_type = currentTab.key;
      }

      const r = await experimentsApi.discover(params);
      const data = r.data?.data || [];
      const resMeta = r.data?.meta || {};

      if (reset) {
        setExperiments(data);
        setOffset(data.length);
      } else {
        setExperiments(prev => [...prev, ...data]);
        setOffset(newOffset + data.length);
      }
      setMeta(resMeta);
      setHasMore(resMeta.has_more || false);
    } catch {
      if (reset) setExperiments([]);
      setHasMore(false);  // stop infinite scroll on error
    } finally {
      setLoading(false);
    }
  }, [user?.id, offset, intentFilter, currentTab]);

  useEffect(() => {
    fetchExperiments(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, intentFilter, user?.id]);

  const handleTabChange = (_, v) => { setTab(v); };
  const toggleIntent = (key) => {
    setIntentFilter(prev => prev === key ? null : key);
  };
  const toggleMetrics = (id) => {
    setExpandedMetrics(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Context-aware: highlight user's strongest intent
  const topIntent = useMemo(() => {
    if (!meta.user_intents) return null;
    const entries = Object.entries(meta.user_intents);
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }, [meta.user_intents]);

  const greeting = useMemo(() => getGreeting(), []);

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', pb: 10 }}>
      {/* Context-aware header */}
      <Box sx={{ px: 2, pt: 3, pb: 1 }}>
        <Typography variant="h5" sx={{
          fontWeight: 700,
          background: GRADIENTS.primary,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          {greeting}
        </Typography>
        <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mt: 0.5 }}>
          Discover thought experiments that match your interests. Believe, fund, and watch them grow.
        </Typography>

        {/* Context-aware social proof */}
        {nearbyCount > 0 && (
          <Fade in>
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1, mt: 1.5,
              p: 1.5, borderRadius: RADIUS.md,
              bgcolor: alpha(theme.palette.primary.main, 0.06),
              border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
            }}>
              <GroupIcon sx={{ fontSize: 18, color: theme.palette.primary.main }} />
              <Typography variant="caption" fontWeight={600}>
                {nearbyCount} experimenters nearby right now
              </Typography>
            </Box>
          </Fade>
        )}

        {/* Context-aware intent suggestion */}
        {topIntent && !intentFilter && (
          <Fade in>
            <Chip
              label={`Based on your activity, try ${topIntent}`}
              icon={<SmartToyIcon sx={{ fontSize: 14 }} />}
              onClick={() => toggleIntent(topIntent)}
              sx={{
                mt: 1, bgcolor: alpha(INTENT_COLORS[topIntent] || theme.palette.primary.main, 0.12),
                color: INTENT_COLORS[topIntent] || theme.palette.primary.main,
                fontWeight: 600, fontSize: '0.75rem',
                cursor: 'pointer',
                '&:hover': { bgcolor: alpha(INTENT_COLORS[topIntent] || theme.palette.primary.main, 0.2) },
              }}
            />
          </Fade>
        )}
      </Box>

      {/* Tabs */}
      <Box sx={{ px: 2 }}>
        <Tabs
          value={tab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 36,
            '& .MuiTab-root': {
              minHeight: 36, textTransform: 'none', fontWeight: 600,
              fontSize: '0.8rem', px: 1.5, minWidth: 'auto',
            },
            '& .MuiTabs-indicator': {
              background: GRADIENTS.primary,
              borderRadius: 2, height: 3,
            },
          }}
        >
          {TABS.map(t => (
            <Tab key={t.key} label={t.label} icon={t.icon} iconPosition="start"
              sx={{ gap: 0.5 }} />
          ))}
        </Tabs>
      </Box>

      {/* Intent filter chips */}
      <Box sx={{
        display: 'flex', gap: 1, px: 2, py: 1.5,
        overflowX: 'auto', '&::-webkit-scrollbar': { display: 'none' },
      }}>
        {INTENT_CHIPS.map(c => (
          <Chip
            key={c.key}
            label={c.label}
            size="small"
            variant={intentFilter === c.key ? 'filled' : 'outlined'}
            onClick={() => toggleIntent(c.key)}
            sx={{
              fontWeight: 600, fontSize: '0.72rem', flexShrink: 0,
              borderColor: alpha(INTENT_COLORS[c.key] || theme.palette.divider, 0.4),
              bgcolor: intentFilter === c.key
                ? alpha(INTENT_COLORS[c.key] || theme.palette.primary.main, 0.15)
                : 'transparent',
              color: intentFilter === c.key
                ? INTENT_COLORS[c.key] || theme.palette.primary.main
                : theme.palette.text.secondary,
              transition: `all 200ms ${EASINGS.snappy}`,
              '&:hover': {
                bgcolor: alpha(INTENT_COLORS[c.key] || theme.palette.primary.main, 0.1),
              },
            }}
          />
        ))}
      </Box>

      {/* Experiment list */}
      <Box sx={{ px: isMobile ? 0 : 1 }}>
        {loading && experiments.length === 0 ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Box key={i} sx={{ px: 2, mb: 2 }}>
              <PostCardSkeleton />
            </Box>
          ))
        ) : experiments.length === 0 ? (
          <EmptyState
            icon={<ScienceIcon sx={{ fontSize: 48 }} />}
            title="No thought experiments found"
            subtitle="Be the first to propose a thought experiment in this category!"
          />
        ) : (
          experiments.map((exp, i) => {
            // Transform experiment data to post format for ThoughtExperimentCard
            const post = {
              id: exp.post_id || exp.id,
              title: exp.title,
              hypothesis: exp.hypothesis,
              expected_outcome: exp.expected_outcome,
              intent_category: exp.intent_category,
              is_thought_experiment: true,
              upvotes: exp.upvotes || exp.total_votes || 0,
              downvotes: exp.downvotes || 0,
              comment_count: exp.comment_count || 0,
              view_count: exp.view_count || 0,
              author: exp.author,
              created_at: exp.created_at,
            };

            return (
              <Fade in key={exp.id} timeout={300 + i * 50}>
                <Box sx={{ mb: 2 }}>
                  <ThoughtExperimentCard post={post} animationDelay={i * 50} index={i} />

                  {/* Context-aware status badges */}
                  {exp.status && exp.status !== 'proposed' && (
                    <Box sx={{ px: 2, mt: -1, mb: 0.5 }}>
                      <Chip
                        size="small"
                        label={exp.status === 'voting' ? 'Voting Now' :
                          exp.status === 'evaluating' ? 'AI Evaluating' :
                          exp.status === 'discussing' ? 'Open Discussion' :
                          exp.status}
                        sx={{
                          fontWeight: 700, fontSize: '0.65rem', height: 22,
                          bgcolor: exp.status === 'voting'
                            ? alpha('#FFD700', 0.15) : alpha(theme.palette.info.main, 0.12),
                          color: exp.status === 'voting'
                            ? '#FFD700' : theme.palette.info.main,
                        }}
                      />
                      {exp.discovery_score > 8 && (
                        <Chip
                          size="small" label="Recommended"
                          sx={{
                            ml: 0.5, fontWeight: 700, fontSize: '0.65rem', height: 22,
                            bgcolor: alpha(theme.palette.primary.main, 0.12),
                            color: theme.palette.primary.main,
                          }}
                        />
                      )}
                    </Box>
                  )}

                  {/* Inline metrics */}
                  <Box sx={{ px: 2 }}>
                    <ExperimentMetricsPanel
                      experimentId={exp.id}
                      experimentType={exp.experiment_type}
                      compact
                    />
                  </Box>
                </Box>
              </Fade>
            );
          })
        )}

        {/* Load more */}
        {hasMore && !loading && experiments.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <Chip
              label="Load more thought experiments"
              onClick={() => fetchExperiments(false)}
              sx={{
                cursor: 'pointer', fontWeight: 600,
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1) },
              }}
            />
          </Box>
        )}
        {loading && experiments.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <Skeleton variant="rounded" width={200} height={32} sx={{ borderRadius: RADIUS.sm }} />
          </Box>
        )}
      </Box>

      {/* FAB for creating */}
      {canWrite && (
        <Fab
          color="primary"
          onClick={() => setCreateOpen(true)}
          sx={{
            position: 'fixed', bottom: 80, right: 24,
            background: GRADIENTS.primary,
            boxShadow: '0 4px 20px rgba(108,99,255,0.3)',
          }}
        >
          <AddIcon />
        </Fab>
      )}

      <CreateThoughtExperimentDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); fetchExperiments(true); }}
      />
    </Box>
  );
}
