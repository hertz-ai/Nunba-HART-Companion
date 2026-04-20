
import gameConfigs from './data/gameConfigs';
import {getProgress} from './data/kidsLearningStore';
import {
  kidsColors,
  kidsShadows,
  kidsRadius,
  CATEGORIES,
} from './data/kidsTheme';
import ContentGenStatus from './shared/ContentGenStatus';
import MediaPreloader from './shared/MediaPreloader';
import TeachYourselfAgentCard from './shared/TeachYourselfAgentCard';

import {useReducedMotion} from '../../../hooks/useAnimations';
import {socialTokens} from '../../../theme/socialTokens';
import {animFadeInDown, pressDown} from '../../../utils/animations';

import AddIcon from '@mui/icons-material/Add';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import SchoolIcon from '@mui/icons-material/School';
import SearchIcon from '@mui/icons-material/Search';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Chip,
  Grid,
  Fab,
  TextField,
  InputAdornment,
  Card,
  CardActionArea,
  CircularProgress,
} from '@mui/material';
import React, {useState, useMemo, useEffect, useRef, useCallback} from 'react';
import {useNavigate} from 'react-router-dom';

/* ---- CSS keyframes injected once ---- */
const HUB_ANIM_ID = 'kids-hub-keyframes';
function ensureHubKeyframes() {
  if (document.getElementById(HUB_ANIM_ID)) return;
  const style = document.createElement('style');
  style.id = HUB_ANIM_ID;
  style.textContent = `
    @keyframes kidsCardEntrance {
      0%   { opacity: 0; transform: translateY(24px) scale(0.96); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes kidsWaveBg {
      0%, 100% { background-position: 0% 50%; }
      50%      { background-position: 100% 50%; }
    }
  `;
  document.head.appendChild(style);
}

/* ---- Greeting helper ---- */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return {text: 'Good Morning', emoji: '🌅'};
  if (h < 17) return {text: 'Good Afternoon', emoji: '☀️'};
  return {text: 'Good Evening', emoji: '🌙'};
}

/* ---- Difficulty stars ---- */
function DifficultyStars({level = 1}) {
  return (
    <Box sx={{display: 'flex', gap: 0.25}}>
      {[1, 2, 3].map((s) =>
        s <= level ? (
          <StarIcon key={s} sx={{fontSize: 20, color: kidsColors.starFilled}} />
        ) : (
          <StarBorderIcon
            key={s}
            sx={{fontSize: 20, color: kidsColors.starEmpty}}
          />
        )
      )}
    </Box>
  );
}

/* ---- Category colour lookup ---- */
const catColorMap = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.color]));

/* ---- Category gradient top-bar lookup ---- */
const catGradientMap = {
  english: 'linear-gradient(90deg, #FF6B6B 0%, #FF8E8E 50%, #FFB3B3 100%)',
  math: 'linear-gradient(90deg, #4ECDC4 0%, #56E0D7 50%, #7FF0E8 100%)',
  lifeSkills: 'linear-gradient(90deg, #56AB2F 0%, #A8E063 100%)',
  science: 'linear-gradient(90deg, #F7971E 0%, #FFD200 100%)',
  creativity: 'linear-gradient(90deg, #A855F7 0%, #D8B4FE 100%)',
};

/* ---- Icon-to-emoji fallback mapping ---- */
const iconEmojiMap = {
  bee: '🐝',
  'music-note': '🎵',
  home: '🏠',
  tree: '🌳',
  'weather-sunny': '☀️',
  'book-open-variant': '📖',
  pencil: '✏️',
  'swap-horizontal': '🔄',
  timer: '⏱️',
  dog: '🐶',
  'plus-circle': '➕',
  'minus-circle': '➖',
  'close-circle': '✖️',
  division: '➗',
  numeric: '🔢',
  shape: '🔷',
  grid: '📊',
  'scale-balance': '⚖️',
  'clock-outline': '🕐',
  'emoticon-happy': '😊',
  'shield-check': '🛡️',
  'food-apple': '🍎',
  'heart-pulse': '💓',
  'hand-heart': '🤝',
  recycle: '♻️',
  'chef-hat': '👨‍🍳',
  // Canvas game template icons
  'bubble-chart': '🎈',
  'pest-control': '🔨',
  'catching-pokemon': '🧺',
  flight: '🐦',
  'directions-run': '🏃',
  castle: '🏰',
  draw: '✍️',
  palette: '🎨',
  'view-column': '🧱',
  explore: '🧭',
};
function getGameEmoji(game) {
  if (game.emoji) return game.emoji;
  return iconEmojiMap[game.icon] || '🎮';
}
function formatAgeRange(ageRange) {
  if (typeof ageRange === 'string') return ageRange;
  if (Array.isArray(ageRange)) return `${ageRange[0]}-${ageRange[1]}`;
  return 'All ages';
}

/* =================================================================
   KidsLearningHub — Main entry page for the Kids Learning Zone
   ================================================================= */
export default function KidsLearningHub() {
  const navigate = useNavigate();
  const [selectedCat, setSelectedCat] = useState(0); // tab index
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [progress, setProgress] = useState(null);
  const debounceRef = useRef(null);

  /* Inject CSS once */
  useEffect(() => {
    ensureHubKeyframes();
  }, []);

  /* Load progress from local store */
  useEffect(() => {
    setProgress(getProgress());
  }, []);

  /* Pre-cache common TTS phrases on mount (best-effort, fire-and-forget) */
  useEffect(() => {
    MediaPreloader.preloadCommonPhrases().catch(() => {});
  }, []);

  /* Debounced search */
  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  }, []);

  /* Filter games — standard templates first, canvas/experimental last */
  const STANDARD_TEMPLATES = new Set([
    'quiz',
    'multiple-choice',
    'true-false',
    'fill-blank',
    'fillBlank',
    'matching',
    'match-pairs',
    'memory-flip',
    'counting',
    'drag-to-zone',
    'sorting',
    'word-build',
    'sequence-order',
    'spot-difference',
    'timed-rush',
    'story-builder',
    'tracing',
    'puzzle-assemble',
    'simulation',
  ]);

  const filteredGames = useMemo(() => {
    const catKey = CATEGORIES[selectedCat]?.key || 'all';
    let list =
      catKey === 'all'
        ? gameConfigs
        : gameConfigs.filter((g) => g.category === catKey);
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          (g.description || '').toLowerCase().includes(q) ||
          g.category.toLowerCase().includes(q) ||
          (g.subcategory || '').toLowerCase().includes(q)
      );
    }
    // Sort: interactive games first (most impact), then standard, canvas last
    list = [...list].sort((a, b) => {
      // Interactive games get highest priority (most engaging)
      const aInteractive = a.isInteractive ? 0 : 1;
      const bInteractive = b.isInteractive ? 0 : 1;
      if (aInteractive !== bInteractive) return aInteractive - bInteractive;
      // Standard templates before canvas/experimental
      const aStd = STANDARD_TEMPLATES.has(a.template) ? 0 : 1;
      const bStd = STANDARD_TEMPLATES.has(b.template) ? 0 : 1;
      return aStd - bStd;
    });
    return list;
  }, [selectedCat, debouncedSearch]);

  const greeting = getGreeting();
  const accuracy =
    progress && progress.totalQuestions > 0
      ? Math.round((progress.totalCorrect / progress.totalQuestions) * 100)
      : 0;

  return (
    <Box sx={{pb: 10, position: 'relative'}}>
      {/* ---- Welcome Banner ---- */}
      <Box
        sx={{
          ...animFadeInDown(0),
          background:
            'linear-gradient(135deg, #6C63FF 0%, #A5A0FF 50%, #FF6584 100%)',
          backgroundSize: '200% 200%',
          animation: 'kidsWaveBg 8s ease infinite',
          borderRadius: {
            xs: 0,
            sm: `0 0 ${kidsRadius.lg} ${kidsRadius.lg}`,
          },
          px: 3,
          py: 4,
          mb: 3,
          color: '#fff',
        }}
      >
        <Typography variant="h5" sx={{fontWeight: 800}}>
          {greeting.emoji} {greeting.text}!
        </Typography>
        <Typography variant="body1" sx={{opacity: 0.9, mt: 0.5}}>
          Ready to learn something awesome today?
        </Typography>
      </Box>

      {/* ---- AI Learning Agent Card ---- */}
      <TeachYourselfAgentCard
        progress={progress}
        gameConfigs={gameConfigs}
        onPlayGame={(gameId) => navigate(`/social/kids/game/${gameId}`)}
        onCreateGame={() => navigate('/social/kids/create')}
        ageGroup="6-8"
      />

      {/* ---- Progress Summary ---- */}
      {progress && progress.gamesPlayed > 0 && (
        <Card
          sx={{
            mx: 2,
            mb: 3,
            p: 2,
            borderRadius: kidsRadius.md,
            boxShadow: kidsShadows.card,
            display: 'flex',
            gap: 2,
            alignItems: 'center',
            flexWrap: 'wrap',
            cursor: 'pointer',
          }}
          onClick={() => navigate('/social/kids/progress')}
        >
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              bgcolor: kidsColors.surfaceLight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SchoolIcon sx={{color: kidsColors.primary, fontSize: 26}} />
          </Box>

          <Box sx={{flex: 1, minWidth: 120}}>
            <Typography
              variant="subtitle2"
              sx={{fontWeight: 700, color: kidsColors.textPrimary}}
            >
              Your Progress
            </Typography>
            <Typography
              variant="caption"
              sx={{color: kidsColors.textSecondary}}
            >
              {progress.gamesPlayed} games played &middot; {accuracy}% accuracy
            </Typography>
          </Box>

          {progress.streak >= 2 && (
            <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
              <LocalFireDepartmentIcon sx={{color: '#FF6B35', fontSize: 22}} />
              <Typography
                variant="body2"
                sx={{fontWeight: 700, color: '#FF6B35'}}
              >
                {progress.streak}
              </Typography>
            </Box>
          )}

          <EmojiEventsIcon sx={{color: kidsColors.accent, fontSize: 28}} />
        </Card>
      )}

      {/* ---- Search ---- */}
      <Box sx={{px: 2, mb: 2}}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search games..."
          value={search}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{color: kidsColors.textMuted}} />
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: kidsRadius.pill,
              bgcolor: '#fff',
              '& fieldset': {borderColor: 'rgba(108,99,255,0.15)'},
              '&:hover fieldset': {borderColor: kidsColors.primary},
              '&.Mui-focused fieldset': {borderColor: kidsColors.primary},
            },
            '& .MuiInputBase-input': {color: '#333'},
          }}
        />
      </Box>

      {/* ---- Category Tabs ---- */}
      <Box sx={{px: 2, mb: 3}}>
        <Tabs
          value={selectedCat}
          onChange={(_, v) => setSelectedCat(v)}
          variant="scrollable"
          scrollButtons="auto"
          TabIndicatorProps={{
            style: {
              backgroundColor: kidsColors.primary,
              height: 3,
              borderRadius: 2,
            },
          }}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              minHeight: 40,
              fontSize: '0.85rem',
              color: kidsColors.textSecondary,
              '&.Mui-selected': {color: kidsColors.primary},
            },
          }}
        >
          {CATEGORIES.map((cat) => (
            <Tab key={cat.key} label={`${cat.icon} ${cat.label}`} />
          ))}
        </Tabs>
      </Box>

      {/* ---- Game Cards Grid ---- */}
      <Box sx={{px: 2}}>
        {filteredGames.length === 0 ? (
          <Box sx={{textAlign: 'center', py: 6}}>
            <Typography variant="h6" sx={{color: kidsColors.textMuted}}>
              No games found
            </Typography>
            <Typography
              variant="body2"
              sx={{color: kidsColors.textMuted, mt: 0.5}}
            >
              Try a different category or search term.
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {filteredGames.map((game, idx) => (
              <Grid item xs={12} sm={6} md={4} key={game.id}>
                <Card
                  sx={{
                    borderRadius: kidsRadius.md,
                    boxShadow: kidsShadows.card,
                    overflow: 'hidden',
                    animation: `kidsCardEntrance 0.45s ${idx * 0.07}s ease-out both`,
                    transition: 'box-shadow 0.25s ease, transform 0.25s ease',
                    '&:hover': {
                      boxShadow: kidsShadows.cardHover,
                      transform: 'translateY(-4px)',
                    },
                    '&:active': {
                      transform: 'scale(0.97)',
                    },
                    position: 'relative',
                  }}
                >
                  {/* Category gradient top bar */}
                  <Box
                    sx={{
                      height: 6,
                      background:
                        catGradientMap[game.category] || catGradientMap.english,
                      width: '100%',
                    }}
                  />

                  {/* Interactive PLAY overlay badge */}
                  {game.isInteractive && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 14,
                        right: 12,
                        bgcolor: 'rgba(255, 107, 107, 0.9)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.7rem',
                        px: 1.2,
                        py: 0.3,
                        borderRadius: '8px',
                        zIndex: 2,
                        letterSpacing: 0.5,
                      }}
                    >
                      &#9654; PLAY
                    </Box>
                  )}

                  <CardActionArea
                    onClick={() => navigate(`/social/kids/game/${game.id}`)}
                    sx={{p: 3}}
                  >
                    {/* Emoji icon */}
                    <Box
                      sx={{
                        width: 56,
                        height: 56,
                        borderRadius: kidsRadius.sm,
                        bgcolor: `${catColorMap[game.category] || kidsColors.primary}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mb: 1.5,
                        fontSize: 36,
                      }}
                    >
                      {getGameEmoji(game)}
                    </Box>

                    {/* Title */}
                    <Typography
                      variant="h6"
                      sx={{
                        fontWeight: 700,
                        color: kidsColors.textPrimary,
                        mb: 0.5,
                      }}
                    >
                      {game.title}
                    </Typography>

                    {/* Category chip + Interactive badge + difficulty */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: 1,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Chip
                        label={
                          CATEGORIES.find((c) => c.key === game.category)
                            ?.label || game.category
                        }
                        size="small"
                        sx={{
                          bgcolor: `${catColorMap[game.category] || kidsColors.primary}20`,
                          color:
                            catColorMap[game.category] || kidsColors.primary,
                          fontWeight: 600,
                          fontSize: '0.85rem',
                          height: 28,
                        }}
                      />
                      {game.isInteractive && (
                        <Chip
                          label="Interactive"
                          size="small"
                          sx={{
                            bgcolor: 'rgba(255, 107, 107, 0.15)',
                            color: '#FF6B6B',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            height: 24,
                          }}
                        />
                      )}
                      <DifficultyStars level={game.difficulty} />
                    </Box>

                    {/* Age range + content gen status */}
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: kidsColors.textSecondary,
                          fontSize: '0.85rem',
                        }}
                      >
                        Ages {formatAgeRange(game.ageRange)}
                      </Typography>
                      <ContentGenStatus gameId={game.id} compact />
                    </Box>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {/* ---- Create Game FAB ---- */}
      <Fab
        color="primary"
        aria-label="Create Game"
        onClick={() => navigate('/social/kids/create')}
        sx={{
          ...socialTokens.fabPosition,
          bgcolor: kidsColors.primary,
          boxShadow: kidsShadows.fab,
          '&:hover': {bgcolor: kidsColors.primaryLight},
        }}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
}
