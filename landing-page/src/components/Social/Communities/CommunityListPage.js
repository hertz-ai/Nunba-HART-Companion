/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import CreateCommunityDialog from './CreateCommunityDialog';

import { useSocial } from '../../../contexts/SocialContext';
import { communitiesApi } from '../../../services/socialApi';
import { socialTokens, GRADIENTS, EASINGS, SHADOWS, RADIUS } from '../../../theme/socialTokens';
import EmptyState from '../shared/EmptyState';
import InfiniteScroll from '../shared/InfiniteScroll';

import AddIcon from '@mui/icons-material/Add';
import ArticleIcon from '@mui/icons-material/Article';
import PeopleIcon from '@mui/icons-material/People';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Fab,
  CircularProgress,
  Chip,
  Grid,
  keyframes,
  useTheme,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';


/* ── Deterministic gradient header from community name ── */
const HEADER_PALETTES = [
  ['#6C63FF', '#9B94FF'],
  ['#FF6B6B', '#FF9494'],
  ['#2ECC71', '#A8E6CF'],
  ['#00B8D9', '#79E2F2'],
  ['#FFAB00', '#FFD740'],
  ['#7C4DFF', '#B388FF'],
  ['#FF4081', '#FF80AB'],
  ['#00BFA5', '#64FFDA'],
];
function headerGradient(name) {
  if (!name) return HEADER_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return HEADER_PALETTES[Math.abs(hash) % HEADER_PALETTES.length];
}

/* ── Premium keyframes ── */
const shimmerSweep = keyframes`
  0%   { left: -75%; }
  100% { left: 125%; }
`;

const fabPulse = keyframes`
  0%, 100% { box-shadow: 0 4px 20px rgba(108,99,255,0.3); }
  50%      { box-shadow: 0 4px 30px rgba(108,99,255,0.5), 0 0 0 8px rgba(108,99,255,0.06); }
`;

const cardReveal = keyframes`
  0%   { opacity: 0; transform: translateY(16px) scale(0.98); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
`;

export default function CommunityListPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { isAuthenticated } = useSocial();
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinedSet, setJoinedSet] = useState(new Set());
  const limit = 20;

  const toggleJoin = async (id, e) => {
    e.stopPropagation();
    const wasJoined = joinedSet.has(id);
    // Optimistic toggle
    setJoinedSet(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    try {
      if (wasJoined) {
        await communitiesApi.leave(id);
      } else {
        await communitiesApi.join(id);
      }
    } catch {
      // Rollback on failure
      setJoinedSet(prev => {
        const next = new Set(prev);
        if (wasJoined) next.add(id); else next.delete(id);
        return next;
      });
    }
  };

  const loadCommunities = async (reset = false) => {
    const o = reset ? 0 : offset;
    setLoading(true);
    try {
      const res = await communitiesApi.list({ limit, offset: o });
      const items = res.data || [];
      setCommunities(reset ? items : (prev) => [...prev, ...items]);
      setHasMore(res.meta ? res.meta.has_more : items.length === limit);
      setOffset(o + items.length);
    } catch (err) {
      /* ignore */
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCommunities(true);
  }, []);

  const handleCreated = (newCommunity) => {
    setCommunities((prev) => [newCommunity, ...prev]);
    setCreateOpen(false);
  };

  return (
    <>
      {/* Premium heading */}
      <Typography variant="h5" sx={{
        fontWeight: 700,
        mb: 2,
        background: `linear-gradient(to right, ${alpha(theme.palette.common.white, 0.95)}, ${alpha(theme.palette.common.white, 0.6)})`,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        Communities
      </Typography>

      <InfiniteScroll
        hasMore={hasMore}
        loading={loading}
        onLoadMore={() => loadCommunities(false)}
      >
        {communities.length === 0 && !loading ? (
          <EmptyState message="No communities yet. Create one!" />
        ) : (
          <Grid container spacing={2}>
            {communities.map((s, idx) => {
              const [gradA, gradB] = headerGradient(s.name);
              const isJoined = joinedSet.has(s.id);
              return (
                <Grid item xs={6} sm={4} md={4} key={s.id}>
                  <Card
                    sx={{
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      overflow: 'hidden',
                      height: '100%',
                      ...socialTokens.glass.subtle(theme),
                      borderRadius: RADIUS.lg,
                      animation: `${cardReveal} 400ms cubic-bezier(0.16, 1, 0.3, 1) ${Math.min(idx * 60, 360)}ms both`,
                      transition: 'box-shadow 250ms ease, border-color 250ms ease, transform 250ms ease',
                      '&:hover': {
                        borderColor: alpha(theme.palette.primary.main, 0.2),
                        boxShadow: `0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px ${alpha(theme.palette.primary.main, 0.08)}, ${SHADOWS.inset}`,
                        transform: 'translateY(-4px)',
                        '& .community-shine': {
                          animation: `${shimmerSweep} 0.8s ease`,
                        },
                      },
                      '&:active': {
                        transform: 'translateY(0) scale(0.995)',
                      },
                    }}
                    onClick={() => navigate(`/social/h/${s.id}`)}
                  >
                    {/* Gradient header */}
                    <Box sx={{
                      height: 60,
                      background: `linear-gradient(135deg, ${gradA}, ${gradB})`,
                      position: 'relative',
                    }}>
                      {/* Shine overlay */}
                      <Box className="community-shine" sx={{
                        position: 'absolute', top: 0, bottom: 0,
                        width: '50%', left: '-75%',
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)',
                        transform: 'skewX(-15deg)',
                        pointerEvents: 'none',
                      }} />
                    </Box>

                    <CardContent sx={{ position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Typography variant="subtitle1" sx={{
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        background: `linear-gradient(to right, ${alpha(theme.palette.common.white, 0.95)}, ${alpha(theme.palette.common.white, 0.7)})`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        mb: 0.75,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        h/{s.name}
                      </Typography>

                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 1 }}>
                        <Box sx={{
                          display: 'flex', alignItems: 'center', gap: 0.5,
                          color: alpha(theme.palette.common.white, 0.45),
                          fontSize: '0.72rem',
                          fontWeight: 500,
                        }}>
                          <PeopleIcon sx={{ fontSize: 14 }} />
                          {s.member_count || 0} members
                        </Box>
                        <Box sx={{
                          display: 'flex', alignItems: 'center', gap: 0.5,
                          color: alpha(theme.palette.common.white, 0.45),
                          fontSize: '0.72rem',
                          fontWeight: 500,
                        }}>
                          <ArticleIcon sx={{ fontSize: 14 }} />
                          {s.post_count || 0} posts
                        </Box>
                      </Box>

                      <Box sx={{ mt: 'auto' }}>
                        <Chip
                          label={isJoined ? 'Joined' : 'Join'}
                          size="small"
                          onClick={(e) => toggleJoin(s.id, e)}
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            borderRadius: RADIUS.pill,
                            width: '100%',
                            background: isJoined ? alpha(gradA, 0.15) : `linear-gradient(135deg, ${gradA}, ${gradB})`,
                            color: isJoined ? gradA : '#fff',
                            border: isJoined ? `1px solid ${alpha(gradA, 0.3)}` : 'none',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              background: isJoined ? alpha(gradA, 0.25) : `linear-gradient(135deg, ${gradB}, ${gradA})`,
                            },
                          }}
                        />
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </InfiniteScroll>

      {/* Premium FAB */}
      {isAuthenticated && (
        <Fab
          sx={{
            position: 'fixed',
            bottom: { xs: 120, md: 80 },
            right: 24,
            background: GRADIENTS.primary,
            color: theme.palette.primary.contrastText,
            animation: `${fabPulse} 3s ease-in-out infinite`,
            transition: `transform 0.2s ${EASINGS.smooth}`,
            '&:hover': {
              background: GRADIENTS.primaryHover,
              transform: 'scale(1.08) rotate(90deg)',
            },
            '&:active': {
              transform: 'scale(0.95)',
            },
          }}
          onClick={() => setCreateOpen(true)}
        >
          <AddIcon />
        </Fab>
      )}

      <CreateCommunityDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
