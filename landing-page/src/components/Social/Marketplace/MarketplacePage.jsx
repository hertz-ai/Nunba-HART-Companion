/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */

import {marketplaceApi} from '../../../services/socialApi';
import {
  socialTokens,
  GRADIENTS,
  EASINGS,
  SHADOWS,
  RADIUS,
} from '../../../theme/socialTokens';
import EmptyState from '../shared/EmptyState';
import InfiniteScroll from '../shared/InfiniteScroll';

import BoltIcon from '@mui/icons-material/Bolt';
import FavoriteIcon from '@mui/icons-material/Favorite';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import StarIcon from '@mui/icons-material/Star';
import StorefrontIcon from '@mui/icons-material/Storefront';
import {
  Box,
  Typography,
  Card,
  Chip,
  Grid,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  Button,
  Avatar,
  Rating,
  Skeleton,
  useTheme,
  keyframes,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect, useCallback} from 'react';

/* -- Category definitions -- */
const CATEGORIES = [
  {label: 'All', value: 'all'},
  {label: 'Content Creation', value: 'content_creation'},
  {label: 'Analysis & Research', value: 'analysis_research'},
  {label: 'Learning & Tutoring', value: 'learning_tutoring'},
  {label: 'Game Design', value: 'game_design'},
  {label: 'Creative', value: 'creative'},
  {label: 'Custom', value: 'custom'},
];

/* -- Deterministic avatar colour from listing title -- */
const AVATAR_PALETTES = [
  ['#6C63FF', '#9B94FF'],
  ['#FF6B6B', '#FF9494'],
  ['#2ECC71', '#A8E6CF'],
  ['#00B8D9', '#79E2F2'],
  ['#FFAB00', '#FFD740'],
  ['#7C4DFF', '#B388FF'],
  ['#FF4081', '#FF80AB'],
  ['#00BFA5', '#64FFDA'],
];
function avatarGradient(name) {
  if (!name) return AVATAR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

/* -- Premium keyframes -- */
const cardReveal = keyframes`
  0%   { opacity: 0; transform: translateY(16px) scale(0.98); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
`;

const shimmerSweep = keyframes`
  0%   { left: -75%; }
  100% { left: 125%; }
`;

export default function MarketplacePage() {
  const theme = useTheme();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const limit = 20;

  /* -- Debounce search input -- */
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  /* -- Load listings -- */
  const loadListings = useCallback(
    async (reset = false) => {
      const o = reset ? 0 : offset;
      setLoading(true);
      try {
        const params = {limit, offset: o};
        if (category !== 'all') params.category = category;
        if (searchDebounced) params.q = searchDebounced;
        const res = await marketplaceApi.listings(params);
        const items = res.data || [];
        setListings(reset ? items : (prev) => [...prev, ...items]);
        setHasMore(res.meta ? res.meta.has_more : items.length === limit);
        setOffset(o + items.length);
      } catch (err) {
        /* network failure — keep current items */
      }
      setLoading(false);
    },
    [offset, category, searchDebounced]
  );

  /* -- Reload on filter / search change -- */
  useEffect(() => {
    setListings([]);
    setOffset(0);
    setHasMore(true);
    loadListings(true);
  }, [category, searchDebounced]);

  /* -- Hire CTA handler -- */
  const handleHire = (listing) => {
    window.dispatchEvent(
      new CustomEvent('nunba:selectAgent', {
        detail: {
          agentId: listing.agent_id || listing.id,
          agentName: listing.agent_name || listing.title,
          context: listing.title,
        },
      })
    );
  };

  /* -- Skeleton cards while loading -- */
  const renderSkeletons = () => (
    <Grid container spacing={2}>
      {Array.from({length: 6}).map((_, i) => (
        <Grid item xs={12} sm={6} md={4} key={`skel-${i}`}>
          <Card
            sx={{
              ...socialTokens.glass.subtle(theme),
              borderRadius: RADIUS.lg,
              p: 2,
            }}
          >
            <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 2}}>
              <Skeleton variant="circular" width={48} height={48} />
              <Box sx={{flex: 1}}>
                <Skeleton variant="text" width="60%" height={24} />
                <Skeleton variant="text" width="40%" height={16} />
              </Box>
            </Box>
            <Skeleton variant="text" width="100%" height={16} />
            <Skeleton variant="text" width="80%" height={16} />
            <Box sx={{display: 'flex', gap: 1, mt: 2}}>
              <Skeleton variant="rounded" width={72} height={28} />
              <Skeleton variant="rounded" width={96} height={28} />
            </Box>
          </Card>
        </Grid>
      ))}
    </Grid>
  );

  return (
    <>
      {/* -- Page heading -- */}
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
        Marketplace
      </Typography>

      {/* -- Search bar -- */}
      <TextField
        placeholder="Search agents and services..."
        size="small"
        fullWidth
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon
                sx={{color: alpha(theme.palette.common.white, 0.4)}}
              />
            </InputAdornment>
          ),
        }}
        sx={{
          mb: 2,
          '& .MuiOutlinedInput-root': {
            ...socialTokens.glass.surface(theme),
            borderRadius: RADIUS.lg,
            color: theme.palette.common.white,
            '& fieldset': {border: 'none'},
          },
        }}
      />

      {/* -- Category tabs -- */}
      <Tabs
        value={category}
        onChange={(_, val) => setCategory(val)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 3,
          minHeight: 36,
          '& .MuiTab-root': {
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.8rem',
            minHeight: 36,
            color: alpha(theme.palette.common.white, 0.5),
            '&.Mui-selected': {color: theme.palette.common.white},
          },
          '& .MuiTabs-indicator': {
            background: GRADIENTS.primary,
            borderRadius: RADIUS.pill,
            height: 3,
          },
        }}
      >
        {CATEGORIES.map((cat) => (
          <Tab key={cat.value} label={cat.label} value={cat.value} />
        ))}
      </Tabs>

      {/* -- Listings grid -- */}
      <InfiniteScroll
        hasMore={hasMore}
        loading={loading}
        onLoadMore={() => loadListings(false)}
        skeleton={renderSkeletons()}
      >
        {listings.length === 0 && !loading ? (
          <EmptyState message="No listings yet" icon={StorefrontIcon} />
        ) : (
          <Grid container spacing={2}>
            {listings.map((listing, idx) => {
              const [gradA, gradB] = avatarGradient(
                listing.title || listing.agent_name
              );
              return (
                <Grid item xs={12} sm={6} md={4} key={listing.id}>
                  <Card
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      position: 'relative',
                      overflow: 'hidden',
                      height: '100%',
                      ...socialTokens.glass.subtle(theme),
                      borderRadius: RADIUS.lg,
                      animation: `${cardReveal} 400ms cubic-bezier(0.16, 1, 0.3, 1) ${Math.min(idx * 60, 360)}ms both`,
                      transition: `box-shadow 250ms ease, border-color 250ms ease, transform 250ms ${EASINGS.bounce}`,
                      '&:hover': {
                        borderColor: alpha(theme.palette.primary.main, 0.2),
                        boxShadow: `0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px ${alpha(theme.palette.primary.main, 0.08)}, ${SHADOWS.inset}`,
                        transform: 'translateY(-4px)',
                        '& .listing-shine': {
                          animation: `${shimmerSweep} 0.8s ease`,
                        },
                      },
                      '&:active': {
                        transform: 'translateY(0) scale(0.995)',
                      },
                    }}
                  >
                    {/* Shine overlay */}
                    <Box
                      className="listing-shine"
                      sx={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        width: '50%',
                        left: '-75%',
                        background:
                          'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
                        transform: 'skewX(-15deg)',
                        pointerEvents: 'none',
                        zIndex: 1,
                      }}
                    />

                    <Box
                      sx={{
                        p: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                        position: 'relative',
                        zIndex: 2,
                      }}
                    >
                      {/* -- Avatar + name row -- */}
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          mb: 1.5,
                        }}
                      >
                        <Box sx={{position: 'relative'}}>
                          <Avatar
                            src={listing.avatar_url}
                            sx={{
                              width: 48,
                              height: 48,
                              background: `linear-gradient(135deg, ${gradA}, ${gradB})`,
                              fontWeight: 700,
                              fontSize: '1.1rem',
                            }}
                          >
                            {(listing.agent_name ||
                              listing.title ||
                              '?')[0].toUpperCase()}
                          </Avatar>
                          {/* SmartToy badge overlay */}
                          <Box
                            sx={{
                              position: 'absolute',
                              bottom: -2,
                              right: -2,
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              background: GRADIENTS.primary,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: `2px solid ${theme.palette.background.paper}`,
                            }}
                          >
                            <SmartToyIcon sx={{fontSize: 12, color: '#fff'}} />
                          </Box>
                        </Box>

                        <Box sx={{flex: 1, minWidth: 0}}>
                          <Typography
                            variant="subtitle1"
                            sx={{
                              fontWeight: 700,
                              fontSize: '0.95rem',
                              color: alpha(theme.palette.common.white, 0.92),
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {listing.title || listing.agent_name}
                          </Typography>
                          {listing.agent_name &&
                            listing.title !== listing.agent_name && (
                              <Typography
                                variant="caption"
                                sx={{
                                  color: alpha(
                                    theme.palette.common.white,
                                    0.45
                                  ),
                                }}
                              >
                                by {listing.agent_name}
                              </Typography>
                            )}
                        </Box>
                      </Box>

                      {/* -- Description -- */}
                      <Typography
                        variant="body2"
                        sx={{
                          color: alpha(theme.palette.common.white, 0.55),
                          fontSize: '0.8rem',
                          lineHeight: 1.5,
                          mb: 1.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          flex: 1,
                        }}
                      >
                        {listing.description || 'No description provided.'}
                      </Typography>

                      {/* -- Rating + HARTs row -- */}
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          mb: 1.5,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Box
                          sx={{display: 'flex', alignItems: 'center', gap: 0.5}}
                        >
                          <Rating
                            value={listing.rating || 0}
                            precision={0.5}
                            readOnly
                            size="small"
                            icon={
                              <StarIcon sx={{fontSize: 16, color: '#FFAB00'}} />
                            }
                            emptyIcon={
                              <StarIcon
                                sx={{
                                  fontSize: 16,
                                  color: alpha(
                                    theme.palette.common.white,
                                    0.15
                                  ),
                                }}
                              />
                            }
                          />
                          <Typography
                            variant="caption"
                            sx={{
                              color: alpha(theme.palette.common.white, 0.45),
                              fontWeight: 500,
                            }}
                          >
                            {listing.rating ? listing.rating.toFixed(1) : '--'}
                          </Typography>
                        </Box>

                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.3,
                            color: alpha(theme.palette.common.white, 0.45),
                            fontSize: '0.75rem',
                            fontWeight: 500,
                          }}
                        >
                          <FavoriteIcon sx={{fontSize: 14, color: '#FF6B6B'}} />
                          {listing.hart_count || 0}
                        </Box>
                      </Box>

                      {/* -- Price chip + Hire button row -- */}
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          mt: 'auto',
                        }}
                      >
                        <Chip
                          icon={<BoltIcon sx={{fontSize: 14}} />}
                          label={
                            listing.spark_price
                              ? `${listing.spark_price} Spark`
                              : 'Free'
                          }
                          size="small"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.72rem',
                            borderRadius: RADIUS.pill,
                            background: listing.spark_price
                              ? alpha('#FFAB00', 0.12)
                              : alpha('#2ECC71', 0.12),
                            color: listing.spark_price ? '#FFAB00' : '#2ECC71',
                            border: `1px solid ${alpha(listing.spark_price ? '#FFAB00' : '#2ECC71', 0.25)}`,
                            '& .MuiChip-icon': {
                              color: listing.spark_price
                                ? '#FFAB00'
                                : '#2ECC71',
                            },
                          }}
                        />

                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => handleHire(listing)}
                          sx={{
                            textTransform: 'none',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            borderRadius: RADIUS.md,
                            background: GRADIENTS.primary,
                            px: 2.5,
                            py: 0.6,
                            boxShadow: 'none',
                            transition: `transform 200ms ${EASINGS.bounce}, box-shadow 200ms ease`,
                            '&:hover': {
                              background: GRADIENTS.primaryHover,
                              boxShadow: SHADOWS.glow,
                              transform: 'scale(1.04)',
                            },
                            '&:active': {
                              transform: 'scale(0.97)',
                            },
                          }}
                        >
                          Hire
                        </Button>
                      </Box>
                    </Box>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </InfiniteScroll>
    </>
  );
}
