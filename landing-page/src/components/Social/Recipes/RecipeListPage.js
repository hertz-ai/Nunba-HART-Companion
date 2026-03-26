/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import {recipesApi} from '../../../services/socialApi';
import {
  socialTokens,
  RADIUS,
  SHADOWS,
  EASINGS,
  GRADIENTS,
} from '../../../theme/socialTokens';
import EmptyState from '../shared/EmptyState';
import InfiniteScroll from '../shared/InfiniteScroll';
import UserChip from '../shared/UserChip';

import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  CircularProgress,
  Grow,
  useTheme,
  keyframes,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect} from 'react';
import {useNavigate} from 'react-router-dom';

/* Premium keyframes */
const shimmerSweep = keyframes`
  0%   { left: -75%; }
  100% { left: 125%; }
`;

const cardReveal = keyframes`
  0%   { opacity: 0; transform: translateY(16px) scale(0.98); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
`;

export default function RecipeListPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const loadRecipes = async (reset = false) => {
    const o = reset ? 0 : offset;
    setLoading(true);
    try {
      const res = await recipesApi.list({limit, offset: o});
      const items = res.data || [];
      setRecipes(reset ? items : (prev) => [...prev, ...items]);
      setHasMore(res.meta ? res.meta.has_more : items.length === limit);
      setOffset(o + items.length);
    } catch (err) {
      /* ignore */
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRecipes(true);
  }, []);

  return (
    <>
      <Typography
        variant="h5"
        sx={{
          fontWeight: 700,
          mb: 2,
          background: `linear-gradient(to right, ${alpha(theme.palette.common.white, 0.95)}, ${alpha(theme.palette.common.white, 0.6)})`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        Shared Recipes
      </Typography>
      <InfiniteScroll
        hasMore={hasMore}
        loading={loading}
        onLoadMore={() => loadRecipes(false)}
      >
        {recipes.length === 0 && !loading ? (
          <EmptyState message="No shared recipes yet" />
        ) : (
          recipes.map((r, idx) => (
            <Grow in key={r.id} timeout={300 + Math.min(idx * 60, 360)}>
              <Card
                sx={{
                  mb: 1.5,
                  cursor: 'pointer',
                  display: 'block',
                  position: 'relative',
                  overflow: 'hidden',
                  /* Glassmorphism */
                  ...socialTokens.glass.subtle(theme),
                  borderRadius: RADIUS.lg,
                  /* Staggered reveal */
                  animation: `${cardReveal} 400ms cubic-bezier(0.16, 1, 0.3, 1) ${Math.min(idx * 60, 360)}ms both`,
                  /* Premium hover */
                  transition: `box-shadow 250ms ${EASINGS.smooth}, border-color 250ms ${EASINGS.smooth}, transform 250ms ${EASINGS.smooth}`,
                  '&:hover': {
                    borderColor: alpha(theme.palette.primary.main, 0.2),
                    boxShadow: `0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px ${alpha(theme.palette.primary.main, 0.08)}, ${SHADOWS.inset}`,
                    transform: 'translateY(-2px)',
                    '& .recipe-shine': {
                      animation: `${shimmerSweep} 0.8s ease`,
                    },
                  },
                  '&:active': {
                    transform: 'translateY(0) scale(0.995)',
                  },
                  '&:focus-visible': {
                    outline: `2px solid ${theme.palette.primary.main}`,
                    outlineOffset: 2,
                  },
                }}
                tabIndex={0}
                onClick={() => navigate(`/social/recipes/${r.id}`)}
              >
                {/* Shine overlay */}
                <Box
                  className="recipe-shine"
                  sx={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    width: '50%',
                    left: '-75%',
                    background: GRADIENTS.shimmer,
                    transform: 'skewX(-15deg)',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />

                {/* Top accent line */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '1px',
                    background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.primary.main, 0.15)} 30%, ${alpha(theme.palette.secondary.main, 0.15)} 70%, transparent)`,
                  }}
                />

                <CardContent sx={{position: 'relative', zIndex: 2}}>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      background: `linear-gradient(to right, ${alpha(theme.palette.common.white, 0.95)}, ${alpha(theme.palette.common.white, 0.7)})`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      mb: 0.25,
                    }}
                  >
                    {r.title || r.name}
                  </Typography>
                  {r.description && (
                    <Typography
                      variant="body2"
                      sx={{
                        color: alpha(theme.palette.common.white, 0.5),
                        lineHeight: 1.6,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {r.description}
                    </Typography>
                  )}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      mt: 0.75,
                      flexWrap: 'wrap',
                    }}
                  >
                    {r.author && <UserChip user={r.author} />}
                    {r.fork_count !== undefined && (
                      <Chip
                        size="small"
                        label={`${r.fork_count} forks`}
                        sx={{
                          background: alpha(theme.palette.primary.main, 0.12),
                          color: alpha(theme.palette.common.white, 0.7),
                          fontWeight: 500,
                          borderRadius: RADIUS.sm,
                        }}
                      />
                    )}
                  </Box>
                  {r.tags && r.tags.length > 0 && (
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 0.5,
                        flexWrap: 'wrap',
                        mt: 0.75,
                      }}
                    >
                      {r.tags.map((t) => (
                        <Chip
                          key={t}
                          size="small"
                          label={t}
                          sx={{
                            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)}, ${alpha(theme.palette.secondary.main, 0.08)})`,
                            color: alpha(theme.palette.common.white, 0.65),
                            border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                            fontWeight: 500,
                            fontSize: '0.72rem',
                            borderRadius: RADIUS.sm,
                            transition: `all 200ms ${EASINGS.smooth}`,
                            '&:hover': {
                              background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.2)}, ${alpha(theme.palette.secondary.main, 0.15)})`,
                              borderColor: alpha(
                                theme.palette.primary.main,
                                0.3
                              ),
                            },
                          }}
                        />
                      ))}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grow>
          ))
        )}
      </InfiniteScroll>
    </>
  );
}
