import {kidsColors, kidsRadius, kidsShadows} from './data/kidsTheme';

import {useReducedMotion} from '../../../hooks/useAnimations';

import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import ShareIcon from '@mui/icons-material/Share';
import SortIcon from '@mui/icons-material/Sort';
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  IconButton,
  InputAdornment,
  Chip,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Fade,
  Tooltip,
} from '@mui/material';
import React, {useState, useMemo, useEffect, useCallback} from 'react';
import {useNavigate} from 'react-router-dom';



/* ---- localStorage key ---- */
const STORAGE_KEY = 'hevolve_kids_custom_games';

/* ---- Inject CSS keyframes once ---- */
const CUSTOM_ANIM_ID = 'kids-custom-games-keyframes';
function ensureCustomKeyframes() {
  if (document.getElementById(CUSTOM_ANIM_ID)) return;
  const style = document.createElement('style');
  style.id = CUSTOM_ANIM_ID;
  style.textContent = `
    @keyframes kidsCustomCardEntrance {
      0%   { opacity: 0; transform: translateY(20px) scale(0.97); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes kidsLiquidFloat {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      33%      { transform: translateY(-6px) rotate(1deg); }
      66%      { transform: translateY(3px) rotate(-1deg); }
    }
    @keyframes kidsGlowPulse {
      0%, 100% { box-shadow: 0 0 20px rgba(108,99,255,0.12); }
      50%      { box-shadow: 0 0 35px rgba(108,99,255,0.28); }
    }
    @keyframes kidsEmptyBounce {
      0%, 100% { transform: translateY(0); }
      50%      { transform: translateY(-10px); }
    }
    @keyframes kidsShimmer {
      0%   { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
  `;
  document.head.appendChild(style);
}

/* ---- Sort options ---- */
const SORT_OPTIONS = [
  {value: 'newest', label: 'Newest First'},
  {value: 'mostPlayed', label: 'Most Played'},
  {value: 'alphabetical', label: 'A - Z'},
];

/* ---- Category color map ---- */
const CATEGORY_COLORS = {
  english: kidsColors.english,
  math: kidsColors.math,
  lifeSkills: kidsColors.lifeSkills,
  science: kidsColors.science,
  creative: kidsColors.creative,
  creativity: kidsColors.creative,
};

/* ---- Helper: format relative date ---- */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

/* =================================================================
   CustomGamesScreen — Browse and manage user-created AI games
   ================================================================= */
export default function CustomGamesScreen() {
  const navigate = useNavigate();
  const [games, setGames] = useState([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [sortAnchor, setSortAnchor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  /* Load from localStorage on mount */
  useEffect(() => {
    ensureCustomKeyframes();
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      setGames(stored);
    } catch {
      setGames([]);
    }
  }, []);

  /* Persist helper */
  const persistGames = useCallback((updated) => {
    setGames(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      /* silent */
    }
  }, []);

  /* Filtered + sorted list */
  const filteredGames = useMemo(() => {
    let result = [...games];

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (g) =>
          (g.title || '').toLowerCase().includes(q) ||
          (g.description || '').toLowerCase().includes(q) ||
          (g.category || '').toLowerCase().includes(q)
      );
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        result.sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        );
        break;
      case 'mostPlayed':
        result.sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
        break;
      case 'alphabetical':
        result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      default:
        break;
    }

    return result;
  }, [games, search, sortBy]);

  /* Play a game */
  const handlePlay = useCallback(
    (game) => {
      // Increment play count
      const updated = games.map((g) =>
        g.id === game.id ? {...g, playCount: (g.playCount || 0) + 1} : g
      );
      persistGames(updated);
      navigate(`/social/kids/game/${game.id}`, {state: {customConfig: game}});
    },
    [games, persistGames, navigate]
  );

  /* Delete a game */
  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    const updated = games.filter((g) => g.id !== deleteTarget.id);
    persistGames(updated);
    setDeleteTarget(null);
  }, [deleteTarget, games, persistGames]);

  /* Share a game */
  const handleShare = useCallback(async (game) => {
    const shareData = {
      title: game.title || 'Kids Learning Game',
      text: `Check out this game: ${game.title} - ${game.description || ''}`,
      url: window.location.origin + `/social/kids/game/${game.id}`,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        // A snackbar would be nicer here but keeping it simple
      }
    } catch {
      /* user cancelled share */
    }
  }, []);

  /* ---- Glassmorphism card style ---- */
  const glassCard = {
    background: 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.45)',
    borderRadius: kidsRadius.md,
    boxShadow: kidsShadows.card,
    transition: 'transform 0.22s ease, box-shadow 0.22s ease',
    '&:hover': {
      transform: 'translateY(-3px)',
      boxShadow: kidsShadows.cardHover,
    },
  };

  return (
    <Box
      sx={{
        pb: 6,
        minHeight: '100vh',
        background: kidsColors.bgGradient,
      }}
    >
      {/* ── Header ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 1.5,
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'rgba(248,240,255,0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <IconButton
          onClick={() => navigate('/social/kids')}
          sx={{color: kidsColors.textPrimary}}
          aria-label="Back to Kids Learning Hub"
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography
          variant="h6"
          sx={{fontWeight: 700, color: kidsColors.textPrimary, ml: 1, flex: 1}}
        >
          My Games
        </Typography>
        <AutoAwesomeIcon
          sx={{
            color: kidsColors.accent,
            fontSize: 22,
            animation: 'kidsLiquidFloat 3s ease-in-out infinite',
            mr: 1,
          }}
        />
        <Tooltip title="Create New Game">
          <IconButton
            onClick={() => navigate('/social/kids/create')}
            sx={{
              bgcolor: kidsColors.primary,
              color: '#fff',
              width: 38,
              height: 38,
              '&:hover': {bgcolor: kidsColors.primaryLight},
            }}
            aria-label="Create a new game"
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{px: 2}}>
        {/* ── Search + Sort bar ── */}
        <Box sx={{display: 'flex', gap: 1, mb: 2, mt: 1}}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search your games..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon
                    sx={{color: kidsColors.textMuted, fontSize: 20}}
                  />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: kidsRadius.pill,
                bgcolor: 'rgba(255,255,255,0.8)',
                backdropFilter: 'blur(8px)',
                '& fieldset': {borderColor: 'rgba(108,99,255,0.12)'},
                '&.Mui-focused fieldset': {borderColor: kidsColors.primary},
              },
            }}
          />
          <IconButton
            onClick={(e) => setSortAnchor(e.currentTarget)}
            sx={{
              bgcolor: 'rgba(255,255,255,0.8)',
              border: '1px solid rgba(108,99,255,0.12)',
              borderRadius: kidsRadius.sm,
              width: 40,
              height: 40,
            }}
            aria-label="Sort games"
          >
            <SortIcon sx={{color: kidsColors.textSecondary, fontSize: 20}} />
          </IconButton>
          <Menu
            anchorEl={sortAnchor}
            open={Boolean(sortAnchor)}
            onClose={() => setSortAnchor(null)}
            PaperProps={{
              sx: {
                borderRadius: kidsRadius.sm,
                boxShadow: kidsShadows.card,
                mt: 0.5,
              },
            }}
          >
            {SORT_OPTIONS.map((opt) => (
              <MenuItem
                key={opt.value}
                selected={sortBy === opt.value}
                onClick={() => {
                  setSortBy(opt.value);
                  setSortAnchor(null);
                }}
                sx={{
                  fontWeight: sortBy === opt.value ? 700 : 400,
                  color:
                    sortBy === opt.value
                      ? kidsColors.primary
                      : kidsColors.textPrimary,
                  fontSize: '0.9rem',
                }}
              >
                {opt.label}
              </MenuItem>
            ))}
          </Menu>
        </Box>

        {/* ── Game count chip ── */}
        {games.length > 0 && (
          <Box sx={{mb: 2}}>
            <Chip
              label={`${filteredGames.length} game${filteredGames.length !== 1 ? 's' : ''}${search ? ' found' : ''}`}
              size="small"
              sx={{
                bgcolor: `${kidsColors.primary}12`,
                color: kidsColors.primary,
                fontWeight: 600,
                fontSize: '0.78rem',
              }}
            />
          </Box>
        )}

        {/* ── Game List ── */}
        {filteredGames.length > 0 ? (
          <Box sx={{display: 'flex', flexDirection: 'column', gap: 1.5}}>
            {filteredGames.map((game, idx) => {
              const catColor =
                CATEGORY_COLORS[game.category] || kidsColors.accent;
              return (
                <Fade in key={game.id} timeout={300 + idx * 60}>
                  <Card
                    sx={{
                      ...glassCard,
                      p: 0,
                      overflow: 'hidden',
                      animation: `kidsCustomCardEntrance 0.4s ${idx * 0.06}s ease-out both`,
                    }}
                  >
                    <Box sx={{display: 'flex', alignItems: 'stretch'}}>
                      {/* Left color accent */}
                      <Box
                        sx={{
                          width: 5,
                          background: `linear-gradient(to bottom, ${catColor}, ${catColor}80)`,
                          flexShrink: 0,
                        }}
                      />

                      {/* Emoji + Content */}
                      <Box
                        sx={{
                          flex: 1,
                          display: 'flex',
                          p: 2,
                          gap: 1.5,
                          alignItems: 'center',
                        }}
                      >
                        {/* Emoji circle */}
                        <Box
                          sx={{
                            width: 52,
                            height: 52,
                            borderRadius: kidsRadius.sm,
                            bgcolor: `${catColor}15`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 26,
                            flexShrink: 0,
                            animation:
                              'kidsLiquidFloat 4s ease-in-out infinite',
                            animationDelay: `${idx * 0.3}s`,
                          }}
                        >
                          {game.emoji || '🎮'}
                        </Box>

                        {/* Text info */}
                        <Box sx={{flex: 1, minWidth: 0}}>
                          <Typography
                            variant="subtitle1"
                            sx={{
                              fontWeight: 700,
                              color: kidsColors.textPrimary,
                              lineHeight: 1.3,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {game.title}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              color: kidsColors.textSecondary,
                              fontSize: '0.8rem',
                              lineHeight: 1.35,
                              mt: 0.3,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {game.description}
                          </Typography>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              mt: 0.75,
                            }}
                          >
                            <Chip
                              label={game.category || 'game'}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                bgcolor: `${catColor}18`,
                                color: catColor,
                                textTransform: 'capitalize',
                              }}
                            />
                            {game.createdAt && (
                              <Typography
                                variant="caption"
                                sx={{
                                  color: kidsColors.textMuted,
                                  fontSize: '0.7rem',
                                }}
                              >
                                {formatDate(game.createdAt)}
                              </Typography>
                            )}
                            {(game.playCount || 0) > 0 && (
                              <Typography
                                variant="caption"
                                sx={{
                                  color: kidsColors.textMuted,
                                  fontSize: '0.7rem',
                                }}
                              >
                                {game.playCount} play
                                {game.playCount !== 1 ? 's' : ''}
                              </Typography>
                            )}
                          </Box>
                        </Box>

                        {/* Action buttons */}
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 0.5,
                            flexShrink: 0,
                          }}
                        >
                          <Tooltip title="Play">
                            <IconButton
                              onClick={() => handlePlay(game)}
                              sx={{
                                bgcolor: `${kidsColors.success}14`,
                                color: kidsColors.success,
                                width: 38,
                                height: 38,
                                '&:hover': {bgcolor: `${kidsColors.success}28`},
                              }}
                              aria-label={`Play ${game.title}`}
                            >
                              <PlayArrowIcon sx={{fontSize: 22}} />
                            </IconButton>
                          </Tooltip>
                          <Box sx={{display: 'flex', gap: 0.25}}>
                            <Tooltip title="Share">
                              <IconButton
                                onClick={() => handleShare(game)}
                                size="small"
                                sx={{
                                  color: kidsColors.textMuted,
                                  '&:hover': {color: kidsColors.info},
                                }}
                                aria-label={`Share ${game.title}`}
                              >
                                <ShareIcon sx={{fontSize: 16}} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton
                                onClick={() => setDeleteTarget(game)}
                                size="small"
                                sx={{
                                  color: kidsColors.textMuted,
                                  '&:hover': {color: kidsColors.error},
                                }}
                                aria-label={`Delete ${game.title}`}
                              >
                                <DeleteOutlineIcon sx={{fontSize: 16}} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>
                      </Box>
                    </Box>
                  </Card>
                </Fade>
              );
            })}
          </Box>
        ) : games.length > 0 && search ? (
          /* ── No search results ── */
          <Box sx={{textAlign: 'center', py: 8}}>
            <Typography sx={{fontSize: 48, mb: 1}}>🔍</Typography>
            <Typography
              variant="h6"
              sx={{fontWeight: 700, color: kidsColors.textPrimary}}
            >
              No matches found
            </Typography>
            <Typography
              variant="body2"
              sx={{color: kidsColors.textSecondary, mt: 0.5}}
            >
              Try a different search term
            </Typography>
          </Box>
        ) : (
          /* ── Empty state ── */
          <Box
            sx={{
              textAlign: 'center',
              py: 10,
              px: 3,
            }}
          >
            <Box
              sx={{
                fontSize: 72,
                mb: 2,
                animation: 'kidsEmptyBounce 2s ease-in-out infinite',
              }}
            >
              🧙
            </Box>
            <Typography
              variant="h5"
              sx={{fontWeight: 800, color: kidsColors.textPrimary, mb: 1}}
            >
              No custom games yet
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: kidsColors.textSecondary,
                maxWidth: 340,
                mx: 'auto',
                mb: 3,
                lineHeight: 1.5,
              }}
            >
              Let our AI wizard create a personalised learning game just for
              you!
            </Typography>
            <Button
              variant="contained"
              size="large"
              startIcon={<AutoAwesomeIcon />}
              onClick={() => navigate('/social/kids/create')}
              sx={{
                bgcolor: kidsColors.primary,
                borderRadius: kidsRadius.pill,
                px: 4,
                py: 1.5,
                fontWeight: 700,
                fontSize: '1rem',
                textTransform: 'none',
                boxShadow: kidsShadows.fab,
                animation: 'kidsGlowPulse 2.5s ease-in-out infinite',
                '&:hover': {bgcolor: kidsColors.primaryLight},
              }}
            >
              Create Your First Game
            </Button>
          </Box>
        )}
      </Box>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        PaperProps={{
          sx: {
            borderRadius: kidsRadius.md,
            p: 1,
          },
        }}
      >
        <DialogTitle sx={{fontWeight: 700, color: kidsColors.textPrimary}}>
          Delete Game?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{color: kidsColors.textSecondary}}>
            Are you sure you want to remove &ldquo;{deleteTarget?.title}&rdquo;?
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{px: 3, pb: 2}}>
          <Button
            onClick={() => setDeleteTarget(null)}
            sx={{
              color: kidsColors.textSecondary,
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            sx={{
              bgcolor: kidsColors.error,
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: kidsRadius.sm,
              '&:hover': {bgcolor: '#d63a5e'},
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
