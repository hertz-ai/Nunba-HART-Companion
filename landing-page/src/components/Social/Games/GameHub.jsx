import GameCard from './GameCard';

import useGameCatalog from '../../../hooks/useGameCatalog';
import {gamesApi} from '../../../services/socialApi';
import {RADIUS, GRADIENTS, socialTokens} from '../../../theme/socialTokens';
import {animFadeInUp, animFadeInScale} from '../../../utils/animations';

import GroupIcon from '@mui/icons-material/Group';
import SearchIcon from '@mui/icons-material/Search';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import {
  Box,
  Typography,
  Chip,
  Grid,
  CircularProgress,
  Button,
  Tab,
  Tabs,
  TextField,
  InputAdornment,
  Avatar,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect, useCallback, useRef} from 'react';
import {useNavigate} from 'react-router-dom';

// ── Quick-match category config ──────────────────────────────────────────────

const QUICK_CATEGORIES = [
  {key: 'trivia', emoji: '\uD83E\uDDE0', label: 'Trivia', default: 'trivia'},
  {key: 'board', emoji: '\u265F\uFE0F', label: 'Board', default: 'board'},
  {
    key: 'arcade',
    emoji: '\uD83D\uDD79\uFE0F',
    label: 'Arcade',
    default: 'arcade',
  },
  {key: 'word', emoji: '\uD83D\uDCDD', label: 'Word', default: 'word'},
];

const TAB_CATEGORIES = [
  'all',
  'trivia',
  'board',
  'arcade',
  'word',
  'puzzle',
  'party',
];

const CATEGORY_COLORS = {
  trivia: '#6C63FF',
  board: '#2ECC71',
  arcade: '#FF6B6B',
  word: '#FFAB00',
  puzzle: '#00B8D9',
  party: '#FF6B6B',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function GameHub() {
  const theme = useTheme();
  const navigate = useNavigate();

  // ── Local state ──
  const [activeTab, setActiveTab] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [lobbies, setLobbies] = useState([]);
  const [lobbiesLoading, setLobbiesLoading] = useState(false);
  const [quickLoading, setQuickLoading] = useState(null); // which category is loading
  const debounceRef = useRef(null);

  // ── Debounced search (300ms) ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchText]);

  // ── Catalog filters ──
  const selectedCategory = TAB_CATEGORIES[activeTab];
  const filters = {
    audience: 'adult',
    ...(selectedCategory !== 'all' && {category: selectedCategory}),
    ...(debouncedSearch && {search: debouncedSearch}),
  };

  const {games, categories, total, loading, error, refetch} =
    useGameCatalog(filters);

  // ── Featured games (only on "All" tab) ──
  const featuredGames =
    selectedCategory === 'all' ? games.filter((g) => g.featured) : [];

  // ── Open lobbies polling (every 10s) ──
  const fetchLobbies = useCallback(async () => {
    try {
      setLobbiesLoading(true);
      const res = await gamesApi.list({status: 'waiting'});
      setLobbies(res.data?.data || []);
    } catch {
      // silent — non-critical
    } finally {
      setLobbiesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLobbies();
    const interval = setInterval(fetchLobbies, 10000);
    return () => clearInterval(interval);
  }, [fetchLobbies]);

  // ── Handlers ──
  const handleGameClick = useCallback(
    (game) => {
      navigate(`/social/games/${game.id}`);
    },
    [navigate]
  );

  const handleQuickMatch = useCallback(
    async (cat) => {
      setQuickLoading(cat.key);
      try {
        const session = await gamesApi.quickMatch({game_type: cat.default});
        const sessionId = session.data?.data?.id;
        if (sessionId) {
          navigate(`/social/games/${sessionId}`);
        }
      } catch {
        // could show a snackbar — for now silent
      } finally {
        setQuickLoading(null);
      }
    },
    [navigate]
  );

  const handleJoinLobby = useCallback(
    async (lobby) => {
      try {
        await gamesApi.join(lobby.id);
        navigate(`/social/games/${lobby.id}`);
      } catch {
        navigate(`/social/games/${lobby.id}`);
      }
    },
    [navigate]
  );

  // ── Tab label with count ──
  const tabLabel = (cat) => {
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    if (cat === 'all') return `All (${total || 0})`;
    const count = categories[cat];
    return count != null ? `${label} (${count})` : label;
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box sx={{maxWidth: 960, mx: 'auto', px: {xs: 2, md: 3}, py: 3}}>
      {/* ── Header ── */}
      <Box sx={{...animFadeInUp(0), mb: 3}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
          <SportsEsportsIcon sx={{fontSize: 32, color: '#6C63FF'}} />
          <Typography variant="h5" sx={{fontWeight: 800}}>
            Games
          </Typography>
        </Box>
        <Typography variant="body2" sx={{color: 'text.secondary', mt: 0.5}}>
          {total > 0 ? `${total}+ games` : 'Games'} to play solo or with friends
        </Typography>
      </Box>

      {/* ── Quick Match Buttons ── */}
      <Box
        sx={{
          ...animFadeInUp(50),
          display: 'flex',
          gap: 1.5,
          mb: 3,
          overflowX: 'auto',
          pb: 1,
        }}
      >
        {QUICK_CATEGORIES.map((cat) => {
          const isLoading = quickLoading === cat.key;
          const catColor = CATEGORY_COLORS[cat.key] || '#6C63FF';
          return (
            <Button
              key={cat.key}
              disabled={isLoading}
              onClick={() => handleQuickMatch(cat)}
              sx={{
                minWidth: 100,
                px: 2.5,
                py: 1.5,
                borderRadius: RADIUS.lg,
                bgcolor: alpha(catColor, 0.08),
                border: `1px solid ${alpha(catColor, 0.15)}`,
                color: catColor,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                flexShrink: 0,
                transition: 'all 0.2s ease',
                '&:hover': {
                  bgcolor: alpha(catColor, 0.15),
                  transform: 'translateY(-2px)',
                  boxShadow: `0 4px 16px ${alpha(catColor, 0.2)}`,
                },
                '&:active': {transform: 'scale(0.97)'},
              }}
            >
              {isLoading ? (
                <CircularProgress size={20} sx={{color: catColor}} />
              ) : (
                <Typography sx={{fontSize: 24, lineHeight: 1}}>
                  {cat.emoji}
                </Typography>
              )}
              <Typography
                variant="caption"
                sx={{fontWeight: 700, color: catColor}}
              >
                {cat.label}
              </Typography>
            </Button>
          );
        })}
      </Box>

      {/* ── Search Bar ── */}
      <Box sx={{...animFadeInUp(100), mb: 2}}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search games..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{color: 'text.secondary'}} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: RADIUS.md,
              bgcolor: alpha(theme.palette.background.paper, 0.8),
            },
          }}
        />
      </Box>

      {/* ── Category Tabs ── */}
      <Box sx={{...animFadeInUp(150), mb: 3}}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            '& .MuiTab-root': {
              textTransform: 'capitalize',
              fontWeight: 600,
              minHeight: 40,
              fontSize: 13,
            },
            '& .Mui-selected': {color: '#6C63FF'},
            '& .MuiTabs-indicator': {backgroundColor: '#6C63FF'},
          }}
        >
          {TAB_CATEGORIES.map((cat) => (
            <Tab key={cat} label={tabLabel(cat)} />
          ))}
        </Tabs>
      </Box>

      {/* ── Featured Section (All tab only) ── */}
      {selectedCategory === 'all' && featuredGames.length > 0 && (
        <Box sx={{...animFadeInUp(200), mb: 4}}>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1.5}}>
            <TrendingUpIcon sx={{fontSize: 20, color: '#FF6B6B'}} />
            <Typography variant="subtitle2" sx={{fontWeight: 700}}>
              Featured
            </Typography>
          </Box>
          <Box sx={{...socialTokens.scrollSnapX, gap: 2, pb: 1}}>
            {featuredGames.map((g, idx) => (
              <Box
                key={g.id}
                sx={{minWidth: {xs: 200, sm: 240}, flexShrink: 0}}
              >
                <GameCard
                  game={g}
                  onClick={handleGameClick}
                  animDelay={idx * 60}
                />
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* ── Loading State ── */}
      {loading && (
        <Box sx={{display: 'flex', justifyContent: 'center', py: 8}}>
          <CircularProgress sx={{color: '#6C63FF'}} />
        </Box>
      )}

      {/* ── Error State ── */}
      {error && !loading && (
        <Box sx={{textAlign: 'center', py: 6}}>
          <Typography variant="body2" sx={{color: 'error.main', mb: 1}}>
            {error}
          </Typography>
          <Button
            onClick={refetch}
            variant="outlined"
            size="small"
            sx={{textTransform: 'none'}}
          >
            Retry
          </Button>
        </Box>
      )}

      {/* ── Game Grid ── */}
      {!loading && !error && games.length > 0 && (
        <Box sx={{...animFadeInUp(250), mb: 4}}>
          <Grid container spacing={2}>
            {games.map((g, idx) => (
              <Grid item xs={6} sm={4} md={3} key={g.id}>
                <GameCard
                  game={g}
                  onClick={handleGameClick}
                  animDelay={idx * 50}
                />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* ── Empty State ── */}
      {!loading && !error && games.length === 0 && (
        <Box
          sx={{
            ...animFadeInScale(0),
            textAlign: 'center',
            py: 8,
            borderRadius: RADIUS.lg,
            border: `1px dashed ${alpha('#6C63FF', 0.2)}`,
          }}
        >
          <SportsEsportsIcon
            sx={{fontSize: 48, color: alpha('#6C63FF', 0.3), mb: 1}}
          />
          <Typography variant="body1" sx={{fontWeight: 600, mb: 0.5}}>
            No games found
          </Typography>
          <Typography variant="body2" sx={{color: 'text.secondary'}}>
            Try a different search term or category
          </Typography>
        </Box>
      )}

      {/* ── Open Lobbies Section ── */}
      {lobbies.length > 0 && (
        <Box sx={{...animFadeInUp(300), mt: 2}}>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 2}}>
            <GroupIcon sx={{fontSize: 20, color: '#2ECC71'}} />
            <Typography variant="subtitle2" sx={{fontWeight: 700}}>
              Open Lobbies
            </Typography>
            <Chip
              size="small"
              label="LIVE"
              sx={{
                height: 20,
                fontSize: 10,
                fontWeight: 800,
                bgcolor: alpha('#2ECC71', 0.15),
                color: '#2ECC71',
              }}
            />
          </Box>
          <Box sx={{display: 'flex', flexDirection: 'column', gap: 1.5}}>
            {lobbies.map((lobby, idx) => {
              const lobbyColor = CATEGORY_COLORS[lobby.game_type] || '#6C63FF';
              return (
                <Box
                  key={lobby.id}
                  sx={{
                    ...animFadeInUp(idx * 60),
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    p: 2,
                    borderRadius: RADIUS.md,
                    bgcolor: alpha(lobbyColor, 0.04),
                    border: `1px solid ${alpha(lobbyColor, 0.12)}`,
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      bgcolor: alpha(lobbyColor, 0.08),
                      transform: 'translateY(-1px)',
                    },
                  }}
                >
                  <Avatar
                    sx={{
                      width: 40,
                      height: 40,
                      bgcolor: alpha(lobbyColor, 0.15),
                      color: lobbyColor,
                    }}
                  >
                    <SportsEsportsIcon sx={{fontSize: 20}} />
                  </Avatar>

                  <Box sx={{flex: 1, minWidth: 0}}>
                    <Typography variant="body2" sx={{fontWeight: 600}} noWrap>
                      {lobby.title || lobby.game_type || 'Game'}
                    </Typography>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mt: 0.3,
                      }}
                    >
                      {lobby.host_name && (
                        <Typography
                          variant="caption"
                          sx={{color: 'text.secondary'}}
                        >
                          Host: {lobby.host_name}
                        </Typography>
                      )}
                      <Chip
                        size="small"
                        icon={<GroupIcon sx={{fontSize: '14px !important'}} />}
                        label={`${lobby.player_count || 1}/${lobby.max_players || 4}`}
                        sx={{
                          height: 22,
                          fontSize: 11,
                          bgcolor: alpha(lobbyColor, 0.1),
                        }}
                      />
                    </Box>
                  </Box>

                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => handleJoinLobby(lobby)}
                    sx={{
                      borderRadius: RADIUS.sm,
                      textTransform: 'none',
                      fontWeight: 700,
                      bgcolor: lobbyColor,
                      '&:hover': {bgcolor: alpha(lobbyColor, 0.85)},
                    }}
                  >
                    Join
                  </Button>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}
