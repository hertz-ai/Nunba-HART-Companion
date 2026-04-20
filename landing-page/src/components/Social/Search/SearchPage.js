import useGameCatalog from '../../../hooks/useGameCatalog';
import {searchApi, mcpApi, marketplaceApi} from '../../../services/socialApi';
import {
  socialTokens,
  RADIUS,
  SHADOWS,
  EASINGS,
  GRADIENTS,
} from '../../../theme/socialTokens';
import PostCard from '../Feed/PostCard';
import GameCard from '../Games/GameCard';
import EmptyState from '../shared/EmptyState';
import UserChip from '../shared/UserChip';

import BoltIcon from '@mui/icons-material/Bolt';
import BuildIcon from '@mui/icons-material/Build';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import StorefrontIcon from '@mui/icons-material/Storefront';
import {
  TextField,
  Tabs,
  Tab,
  Box,
  InputAdornment,
  CircularProgress,
  Grow,
  Typography,
  useTheme,
  keyframes,
} from '@mui/material';
import Chip from '@mui/material/Chip';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect, useMemo} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';


const TYPES = [
  'posts',
  'users',
  'communities',
  'games',
  'harts',
  'tools',
  'marketplace',
];

/* Premium keyframes */
const shimmerSweep = keyframes`
  0%   { left: -75%; }
  100% { left: 125%; }
`;

export default function SearchPage() {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);

  const [query, setQuery] = useState(params.get('q') || '');
  const [tab, setTab] = useState(0);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // Game catalog for client-side game search
  const gameSearchFilter = useMemo(() => ({search: query.trim()}), [query]);
  const {games: gameResults, loading: gamesLoading} = useGameCatalog(
    TYPES[tab] === 'games' ? gameSearchFilter : {}
  );

  const doSearch = async (q, type) => {
    // Games are searched client-side via useGameCatalog
    if (type === 'games') return;
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      let res;
      if (type === 'harts') {
        res = await searchApi.search({
          q: q.trim(),
          type: 'users',
          user_type: 'agent',
          limit: 30,
        });
      } else if (type === 'tools') {
        res = await mcpApi.discover({q: q.trim()});
      } else if (type === 'marketplace') {
        res = await marketplaceApi.listings({q: q.trim()});
      } else {
        res = await searchApi.search({q: q.trim(), type, limit: 30});
      }
      setResults(res.data || []);
    } catch (err) {
      setResults([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    const debounce = setTimeout(() => {
      doSearch(query, TYPES[tab]);
    }, 400);
    return () => clearTimeout(debounce);
  }, [query, tab]);

  const renderResults = () => {
    // Games tab uses its own loading/results from useGameCatalog
    if (TYPES[tab] === 'games') {
      if (gamesLoading)
        return (
          <Box sx={{textAlign: 'center', py: 4}}>
            <CircularProgress size={24} />
          </Box>
        );
      if (gameResults.length === 0)
        return (
          <EmptyState message={query ? 'No games found' : 'Browse all games'} />
        );
      return (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {xs: '1fr', sm: '1fr 1fr'},
            gap: 1.5,
          }}
        >
          {gameResults.map((game, idx) => (
            <Grow in key={game.id} timeout={300 + Math.min(idx * 60, 360)}>
              <div>
                <GameCard
                  game={game}
                  onClick={(g) => navigate(`/social/games/${g.id}`)}
                  animDelay={0}
                />
              </div>
            </Grow>
          ))}
        </Box>
      );
    }

    if (loading)
      return (
        <Box sx={{textAlign: 'center', py: 4}}>
          <CircularProgress size={24} />
        </Box>
      );
    if (results.length === 0)
      return (
        <EmptyState message={query ? 'No results found' : 'Type to search'} />
      );

    if (TYPES[tab] === 'posts') {
      return results.map((p, idx) => (
        <Grow in key={p.id} timeout={300 + Math.min(idx * 60, 360)}>
          <div>
            <PostCard post={p} />
          </div>
        </Grow>
      ));
    }
    if (TYPES[tab] === 'users') {
      return results.map((u, idx) => (
        <Grow in key={u.id} timeout={300 + Math.min(idx * 60, 360)}>
          <Box
            sx={{
              p: 1.5,
              ...socialTokens.glass.subtle(theme),
              borderRadius: RADIUS.lg,
              mb: 1,
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              transition: `transform 250ms ${EASINGS.smooth}, box-shadow 250ms ${EASINGS.smooth}, border-color 250ms ${EASINGS.smooth}`,
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: SHADOWS.cardHover,
                borderColor: alpha(theme.palette.primary.main, 0.2),
                '& .search-shine': {
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
            onClick={() => navigate(`/social/u/${u.id}`)}
          >
            {/* Shine overlay */}
            <Box
              className="search-shine"
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
            <Box sx={{position: 'relative', zIndex: 2}}>
              <UserChip user={u} showKarma />
            </Box>
          </Box>
        </Grow>
      ));
    }
    // communities
    if (TYPES[tab] === 'communities') {
      return results.map((s, idx) => (
        <Grow in key={s.id} timeout={300 + Math.min(idx * 60, 360)}>
          <Box
            sx={{
              p: 1.5,
              ...socialTokens.glass.subtle(theme),
              borderRadius: RADIUS.lg,
              mb: 1,
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              transition: `transform 250ms ${EASINGS.smooth}, box-shadow 250ms ${EASINGS.smooth}, border-color 250ms ${EASINGS.smooth}`,
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: SHADOWS.cardHover,
                borderColor: alpha(theme.palette.primary.main, 0.2),
                '& .search-shine': {
                  animation: `${shimmerSweep} 0.8s ease`,
                },
              },
              '&:active': {
                transform: 'translateY(0) scale(0.995)',
              },
            }}
            tabIndex={0}
            onClick={() => navigate(`/social/h/${s.id}`)}
          >
            <Box
              className="search-shine"
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
            <Box sx={{position: 'relative', zIndex: 2}}>
              <Typography
                component="span"
                sx={{
                  fontWeight: 700,
                  background: `linear-gradient(to right, ${alpha(theme.palette.common.white, 0.95)}, ${alpha(theme.palette.common.white, 0.7)})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                h/{s.name}
              </Typography>
              {s.description && (
                <Typography
                  component="span"
                  variant="body2"
                  sx={{
                    ml: 1,
                    color: alpha(theme.palette.common.white, 0.5),
                  }}
                >
                  {s.description}
                </Typography>
              )}
            </Box>
          </Box>
        </Grow>
      ));
    }

    // HARTs (agent users)
    if (TYPES[tab] === 'harts') {
      return results.map((u, idx) => (
        <Grow in key={u.id} timeout={300 + Math.min(idx * 60, 360)}>
          <Box
            sx={{
              p: 1.5,
              ...socialTokens.glass.subtle(theme),
              borderRadius: RADIUS.lg,
              mb: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              transition: `transform 250ms ${EASINGS.smooth}, box-shadow 250ms ${EASINGS.smooth}`,
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: SHADOWS.cardHover,
              },
            }}
            onClick={() => navigate(`/social/agents/${u.id}`)}
          >
            <SmartToyIcon
              sx={{fontSize: 28, color: theme.palette.primary.main}}
            />
            <Box sx={{flex: 1, minWidth: 0}}>
              <Typography sx={{fontWeight: 700, fontSize: '0.9rem'}}>
                {u.display_name || u.username}
              </Typography>
              {u.bio && (
                <Typography
                  variant="caption"
                  sx={{color: theme.palette.text.secondary}}
                >
                  {u.bio}
                </Typography>
              )}
            </Box>
            <Chip
              label="HART"
              size="small"
              sx={{
                background: GRADIENTS.hart,
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.65rem',
              }}
            />
          </Box>
        </Grow>
      ));
    }

    // Tools (MCP servers)
    if (TYPES[tab] === 'tools') {
      return results.map((tool, idx) => (
        <Grow in key={tool.id || idx} timeout={300 + Math.min(idx * 60, 360)}>
          <Box
            sx={{
              p: 1.5,
              ...socialTokens.glass.subtle(theme),
              borderRadius: RADIUS.lg,
              mb: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              transition: `transform 250ms ${EASINGS.smooth}, box-shadow 250ms ${EASINGS.smooth}`,
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: SHADOWS.cardHover,
              },
            }}
            onClick={() => navigate('/social/tools')}
          >
            <BuildIcon sx={{fontSize: 24, color: '#FFAB00'}} />
            <Box sx={{flex: 1, minWidth: 0}}>
              <Typography sx={{fontWeight: 700, fontSize: '0.9rem'}}>
                {tool.name || tool.server_name}
              </Typography>
              {tool.description && (
                <Typography
                  variant="caption"
                  sx={{color: theme.palette.text.secondary}}
                >
                  {tool.description}
                </Typography>
              )}
            </Box>
          </Box>
        </Grow>
      ));
    }

    // Marketplace listings
    if (TYPES[tab] === 'marketplace') {
      return results.map((listing, idx) => (
        <Grow
          in
          key={listing.id || idx}
          timeout={300 + Math.min(idx * 60, 360)}
        >
          <Box
            sx={{
              p: 1.5,
              ...socialTokens.glass.subtle(theme),
              borderRadius: RADIUS.lg,
              mb: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              transition: `transform 250ms ${EASINGS.smooth}, box-shadow 250ms ${EASINGS.smooth}`,
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: SHADOWS.cardHover,
              },
            }}
            onClick={() => navigate('/social/marketplace')}
          >
            <StorefrontIcon sx={{fontSize: 24, color: '#6C63FF'}} />
            <Box sx={{flex: 1, minWidth: 0}}>
              <Typography sx={{fontWeight: 700, fontSize: '0.9rem'}}>
                {listing.title || listing.name}
              </Typography>
              {listing.description && (
                <Typography
                  variant="caption"
                  sx={{color: theme.palette.text.secondary}}
                >
                  {listing.description}
                </Typography>
              )}
            </Box>
            <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
              <BoltIcon sx={{fontSize: 14, color: '#FFAB00'}} />
              <Typography
                variant="caption"
                sx={{fontWeight: 700, color: '#FFAB00'}}
              >
                {listing.price_spark || 'Free'}
              </Typography>
            </Box>
          </Box>
        </Grow>
      ));
    }

    return <EmptyState message="Select a tab to search" />;
  };

  return (
    <>
      <TextField
        fullWidth
        variant="outlined"
        placeholder="Search posts, users, HARTs, tools, marketplace..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{
          mb: 2,
          '& .MuiOutlinedInput-root': {
            borderRadius: RADIUS.md,
            ...socialTokens.glass.subtle(theme),
            transition: `box-shadow 250ms ${EASINGS.smooth}, border-color 250ms ${EASINGS.smooth}`,
            '& fieldset': {
              borderColor: alpha(theme.palette.divider, 0.3),
              transition: `border-color 250ms ${EASINGS.smooth}`,
            },
            '&:hover fieldset': {
              borderColor: alpha(theme.palette.primary.main, 0.3),
            },
            '&.Mui-focused fieldset': {
              borderColor: theme.palette.primary.main,
              borderWidth: 2,
            },
            '&.Mui-focused': {
              boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.15)}, ${SHADOWS.card}`,
            },
          },
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon
                sx={{color: alpha(theme.palette.common.white, 0.4)}}
              />
            </InputAdornment>
          ),
        }}
      />
      <Box
        sx={{
          ...socialTokens.glass.subtle(theme),
          borderRadius: RADIUS.md,
          mb: 2,
          overflow: 'hidden',
        }}
      >
        <Tabs
          value={tab}
          onChange={(e, v) => setTab(v)}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            '& .MuiTab-root': {
              fontWeight: 600,
              fontSize: '0.8rem',
              minWidth: 'auto',
              textTransform: 'none',
              transition: `color 200ms ${EASINGS.smooth}, background 200ms ${EASINGS.smooth}`,
              '&:hover': {
                background: alpha(theme.palette.primary.main, 0.05),
              },
              '&.Mui-selected': {
                color: theme.palette.primary.main,
              },
            },
            '& .MuiTabs-indicator': {
              background: GRADIENTS.primary,
              height: 3,
              borderRadius: '3px 3px 0 0',
            },
          }}
        >
          <Tab label="Posts" />
          <Tab label="Users" />
          <Tab label="Communities" />
          <Tab label="Games" />
          <Tab label="HARTs" />
          <Tab label="Tools" />
          <Tab label="Marketplace" />
        </Tabs>
      </Box>
      {renderResults()}
    </>
  );
}
