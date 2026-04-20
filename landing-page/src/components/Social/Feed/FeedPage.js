import CreateThoughtExperimentDialog from './CreateThoughtExperimentDialog';
import FeedHeader from './FeedHeader';
import PostCard from './PostCard';
import ThoughtExperimentCard from './ThoughtExperimentCard';

import { useSocial } from '../../../contexts/SocialContext';
import { useScrollDepthObserver } from '../../../hooks/useAgentObserver';
import { feedApi, seasonsApi, encountersApi } from '../../../services/socialApi';
import { GRADIENTS, EASINGS, RADIUS, INTENT_COLORS, socialTokens } from '../../../theme/socialTokens';
import { animFadeInUp, animSlideInUp } from '../../../utils/animations';
import { useRoleAccess } from '../../RoleGuard';
import { AdBanner, AdCard } from '../Ads';
import { AutopilotBanner } from '../Autopilot';
import EmptyState from '../shared/EmptyState';
import EncounterCard from '../shared/EncounterCard';
import InfiniteScroll from '../shared/InfiniteScroll';
import PostCardSkeleton from '../shared/PostCardSkeleton';
import AddIcon from '@mui/icons-material/Add';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ExploreIcon from '@mui/icons-material/Explore';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import CampaignIcon from '@mui/icons-material/Campaign';
import CloseIcon from '@mui/icons-material/Close';

// IntentBadge kept available for future use
// import IntentBadge, { ALL_INTENTS } from './IntentBadge';
import OnboardingChecklist from '../shared/OnboardingChecklist';

import FavoriteIcon from '@mui/icons-material/Favorite';

import SeasonBanner from '../shared/SeasonBanner';

import { Tabs, Tab, Fab, Box, Card, Fade, Typography, Chip, Button, IconButton, keyframes, useTheme, Alert } from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/* ── Keyframes ── */
const fabPulse = keyframes`
  0%, 100% { box-shadow: 0 4px 20px rgba(108,99,255,0.3); }
  50%      { box-shadow: 0 4px 30px rgba(108,99,255,0.5), 0 0 0 8px rgba(108,99,255,0.06); }
`;

const FEED_TYPES = [
  { label: 'For You', key: 'personalized' },
  { label: 'Thought Experiments', key: 'all' },
  { label: 'Trending', key: 'trending' },
  { label: 'HARTs', key: 'agents' },
];

/* ── Rotating daily tips ── */
const DAILY_TIPS = [
  'Start your week strong: share a thought experiment that challenges the status quo.',
  'Collaboration multiplies impact. Find someone whose ideas complement yours today.',
  'The best innovations come from diverse perspectives. Explore a new community.',
  'Small actions, big ripples. What micro-experiment can you run today?',
  'Reflection fuels growth. Revisit an old idea with fresh eyes.',
  'Your unique perspective matters. The community is richer because you are here.',
  'Weekend energy: dream bigger, build bolder, connect deeper.',
];
function getDailyTip() {
  return DAILY_TIPS[new Date().getDay()];
}

/* ── Interest filter topic chips ── */
const INTEREST_TOPICS = [
  { label: 'Technology', key: 'technology' },
  { label: 'Health', key: 'health' },
  { label: 'Education', key: 'education' },
  { label: 'Environment', key: 'environment' },
  { label: 'Community', key: 'community' },
  { label: 'Equity', key: 'equity' },
];

/* ── Feature Discovery Spotlight ── */
const ICON_MAP = {
  Explore: ExploreIcon,
  Psychology: PsychologyIcon,
  SportsEsports: SportsEsportsIcon,
  AutoAwesome: AutoAwesomeIcon,
  EmojiEvents: EmojiEventsIcon,
  Campaign: CampaignIcon,
};

const DISCOVERABLE_FEATURES = [
  { key: 'encounters', label: 'Encounters', desc: 'Meet people and ideas nearby', path: '/social/encounters', icon: 'Explore' },
  { key: 'experiments', label: 'Thought Experiments', desc: 'Explore community ideas and hypotheses', path: '/social/experiments', icon: 'Psychology' },
  { key: 'games', label: 'Games', desc: 'Play games and compete with friends', path: '/social/games', icon: 'SportsEsports' },
  { key: 'kids', label: 'Kids Learning', desc: 'Fun learning games for young minds', path: '/social/kids', icon: 'SportsEsports' },
  { key: 'recipes', label: 'Recipes', desc: 'Browse community-created AI agent recipes', path: '/social/recipes', icon: 'AutoAwesome' },
  { key: 'achievements', label: 'Achievements', desc: 'Earn badges and track your progress', path: '/social/achievements', icon: 'EmojiEvents' },
  { key: 'campaigns', label: 'Campaigns', desc: 'Create and join community campaigns', path: '/social/campaigns', icon: 'Campaign' },
];

function FeatureSpotlightCard({ onDismiss }) {
  const navigate = useNavigate();
  const [feature, setFeature] = useState(null);

  useEffect(() => {
    try {
      const visited = JSON.parse(localStorage.getItem('visited_features') || '[]');
      const undiscovered = DISCOVERABLE_FEATURES.filter((f) => !visited.includes(f.key));
      if (undiscovered.length > 0) {
        setFeature(undiscovered[Math.floor(Math.random() * undiscovered.length)]);
      }
    } catch {
      // If localStorage is corrupt, pick any feature
      setFeature(DISCOVERABLE_FEATURES[Math.floor(Math.random() * DISCOVERABLE_FEATURES.length)]);
    }
  }, []);

  if (!feature) return null;

  const IconComp = ICON_MAP[feature.icon] || ExploreIcon;

  const handleTryIt = () => {
    try {
      const visited = JSON.parse(localStorage.getItem('visited_features') || '[]');
      if (!visited.includes(feature.key)) {
        visited.push(feature.key);
        localStorage.setItem('visited_features', JSON.stringify(visited));
      }
    } catch { /* ignore */ }
    navigate(feature.path);
  };

  return (
    <Card sx={{
      background: '#1A1932',
      border: '1px solid rgba(108,99,255,0.2)',
      borderRadius: RADIUS.lg,
      p: 2,
      mb: 2,
      position: 'relative',
    }}>
      <IconButton
        onClick={onDismiss}
        size="small"
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          color: 'rgba(255,255,255,0.4)',
          '&:hover': { color: 'rgba(255,255,255,0.7)' },
        }}
        aria-label="Dismiss spotlight"
      >
        <CloseIcon fontSize="small" />
      </IconButton>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <IconComp sx={{ fontSize: 28, color: '#6C63FF' }} />
        <Box>
          <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
            Discover a feature
          </Typography>
          <Typography fontWeight={700} sx={{ color: '#fff', fontSize: '0.95rem' }}>
            {feature.label}
          </Typography>
        </Box>
      </Box>
      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mb: 1.5, lineHeight: 1.5 }}>
        {feature.desc}
      </Typography>
      <Button
        variant="contained"
        size="small"
        onClick={handleTryIt}
        sx={{
          background: 'linear-gradient(135deg, #6C63FF, #4B45B2)',
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: RADIUS.sm,
          px: 2.5,
          '&:hover': {
            background: 'linear-gradient(135deg, #7B73FF, #5A53C2)',
          },
        }}
      >
        Try it
      </Button>
    </Card>
  );
}

const fetchers = {
  all: feedApi.global,
  trending: feedApi.trending,
  agents: feedApi.agents,
  personalized: feedApi.personalized,
};

export default function FeedPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const { canWrite } = useRoleAccess();
  const { currentUser } = useSocial();
  useScrollDepthObserver();
  const params = new URLSearchParams(location.search);
  const initialTab = FEED_TYPES.findIndex((t) => t.key === params.get('tab'));
  const [tab, setTab] = useState(initialTab >= 0 ? initialTab : 0);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [season, setSeason] = useState(null);
  const [seasonDismissed, setSeasonDismissed] = useState(false);
  const [encounters, setEncounters] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [intentFilter, setIntentFilter] = useState(null);
  const [fetchError, setFetchError] = useState(false);
  const [spotlightDismissed, setSpotlightDismissed] = useState(false);
  const [hartSpotlight, setHartSpotlight] = useState(null);
  const limit = 20;

  // Sync tab state with URL query param (handles sidebar navigation to ?tab=trending)
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const urlTab = FEED_TYPES.findIndex((t) => t.key === p.get('tab'));
    if (urlTab >= 0 && urlTab !== tab) {
      setTab(urlTab);
    }
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    seasonsApi.current().then((res) => { if (res && res.data) setSeason(res.data); }).catch(() => {});
    encountersApi.suggestions().then((res) => { if (res && res.data) setEncounters(res.data); }).catch(() => {});
  }, []);

  // Fetch HART Spotlight when HARTs tab is active
  useEffect(() => {
    if (FEED_TYPES[tab]?.key === 'agents') {
      feedApi.agentSpotlight().then((res) => {
        if (res && res.data) setHartSpotlight(res.data);
      }).catch(() => {});
    }
  }, [tab]);

  const fetchPosts = useCallback(async (reset = false) => {
    const o = reset ? 0 : offset;
    setLoading(true);
    setFetchError(false);
    try {
      const feedKey = FEED_TYPES[tab].key;
      const fetcher = (feedKey === 'personalized' && !currentUser) ? fetchers.all : fetchers[feedKey];
      const res = await fetcher({ limit, offset: o });
      const items = res.data || [];
      setPosts(reset ? items : (prev) => [...prev, ...items]);
      const more = res.meta ? res.meta.has_more : items.length === limit;
      setHasMore(more);
      setOffset(o + items.length);
      // Prefetch next page in background for instant scroll
      if (more) {
        const nextOffset = o + items.length;
        const feedKey = FEED_TYPES[tab].key;
        const nextFetcher = (feedKey === 'personalized' && !currentUser) ? fetchers.all : fetchers[feedKey];
        nextFetcher({ limit, offset: nextOffset }).catch(() => {});
      }
    } catch {
      if (reset) setFetchError(true);
    }
    setLoading(false);
    setInitialLoad(false);
  }, [tab, offset, currentUser]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: window.pywebview ? 'instant' : 'smooth' });
    setPosts([]);
    setOffset(0);
    setHasMore(true);
    setInitialLoad(true);
    fetchPosts(true);
  }, [tab]);

  // Filter posts by intent category
  const filteredPosts = intentFilter
    ? posts.filter((p) => p.intent_category === intentFilter)
    : posts;

  const handleCreated = (newPost) => {
    setPosts((prev) => [newPost, ...prev]);
    setCreateOpen(false);
  };

  return (
    <>
      {season && !seasonDismissed && (
        <SeasonBanner season={season} onDismiss={() => setSeasonDismissed(true)} />
      )}

      {/* ── Autopilot Banner ── */}
      <AutopilotBanner />

      {/* ── Feed Header ── */}
      <FeedHeader />

      {/* ── Encounters carousel ── */}
      {encounters.length > 0 && (
        <Box sx={{ ...animSlideInUp(0), mb: 2 }}>
          <Typography variant="overline" sx={{
            mb: 1, display: 'block',
            color: theme.palette.text.secondary,
          }}>
            People you keep meeting
          </Typography>
          <Box sx={{
            ...socialTokens.scrollFade,
            gap: 1.5, pb: 1,
          }}>
            {encounters.slice(0, 6).map((enc) => (
              <Box key={enc.id} sx={{ minWidth: 200, flexShrink: 0 }}>
                <EncounterCard encounter={enc} onAccept={() => {}} onSkip={() => {}} />
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* ── Tab Bar ── */}
      <Tabs
        value={tab}
        onChange={(e, v) => setTab(v)}
        variant="fullWidth"
        sx={{
          ...animSlideInUp(50),
          mb: 1.5,
          borderRadius: RADIUS.md,
          ...socialTokens.glass.subtle(theme),
          minHeight: 44,
          '& .MuiTab-root': {
            color: theme.palette.text.secondary,
            fontWeight: 600,
            fontSize: '0.82rem',
            letterSpacing: '0.03em',
            minHeight: 44,
            textTransform: 'none',
            transition: `all 0.25s ${EASINGS.smooth}`,
            '&.Mui-selected': {
              color: '#fff',
              textShadow: `0 0 12px ${theme.palette.primary.main}50`,
            },
            '&:hover': {
              color: alpha(theme.palette.common.white, 0.7),
              background: alpha(theme.palette.common.white, 0.02),
            },
          },
          '& .MuiTabs-indicator': {
            background: GRADIENTS.primary,
            height: 2,
            borderRadius: 1,
            boxShadow: `0 0 10px ${theme.palette.primary.main}60`,
            transition: `all 300ms ${EASINGS.spring}`,
          },
        }}
      >
        {FEED_TYPES.map((t) => <Tab key={t.key} label={t.label} />)}
      </Tabs>

      {/* ── Interest Filter Chips ── */}
      <Box sx={{
        ...socialTokens.scrollFade,
        ...animSlideInUp(100),
        gap: 0.75, mb: 2, pb: 0.5,
      }}>
        <Chip
          label="All"
          size="small"
          variant={intentFilter === null ? 'filled' : 'outlined'}
          onClick={() => setIntentFilter(null)}
          sx={{
            fontWeight: 600,
            fontSize: '0.72rem',
            background: intentFilter === null ? GRADIENTS.primary : 'transparent',
            color: intentFilter === null ? '#fff' : theme.palette.text.secondary,
            borderColor: theme.palette.divider,
            borderRadius: RADIUS.pill,
            transition: 'all 0.2s ease',
          }}
        />
        {INTEREST_TOPICS.map((topic) => {
          const isSelected = intentFilter === topic.key;
          const chipColor = INTENT_COLORS[topic.key] || '#6C63FF';
          return (
            <Chip
              key={topic.key}
              label={topic.label}
              size="small"
              variant={isSelected ? 'filled' : 'outlined'}
              onClick={() => setIntentFilter(isSelected ? null : topic.key)}
              sx={{
                fontWeight: 600,
                fontSize: '0.72rem',
                borderRadius: RADIUS.pill,
                background: isSelected ? chipColor : 'transparent',
                color: isSelected ? '#fff' : alpha(chipColor, 0.8),
                borderColor: isSelected ? chipColor : alpha(chipColor, 0.35),
                boxShadow: isSelected ? `0 2px 8px ${alpha(chipColor, 0.3)}` : 'none',
                transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                transition: `all 0.2s ${EASINGS.bounce}`,
                '&:hover': {
                  background: isSelected ? chipColor : alpha(chipColor, 0.1),
                  borderColor: chipColor,
                },
              }}
            />
          );
        })}
      </Box>

      {/* ── Error banner ── */}
      {fetchError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFetchError(false)}>
          Unable to load feed — check your connection and try again
        </Alert>
      )}

      {/* ── Nunba Daily Card ── */}
      <Card sx={{
        ...animFadeInUp(0),
        background: GRADIENTS.primary,
        color: '#fff',
        mb: 2,
        p: 2,
        borderRadius: RADIUS.lg,
        border: 'none',
        boxShadow: '0 4px 24px rgba(108, 99, 255, 0.25)',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <SmartToyIcon sx={{ fontSize: 22 }} />
          <Typography fontWeight={700} sx={{ fontSize: '0.95rem' }}>Nunba Daily</Typography>
          <Chip label="Autopilot" size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 600, fontSize: '0.68rem', height: 22 }} />
        </Box>
        <Typography variant="body2" sx={{ opacity: 0.95, lineHeight: 1.6 }}>
          {getDailyTip()}
        </Typography>
      </Card>

      {/* ── Feature Discovery Spotlight ── */}
      {!spotlightDismissed && (
        <FeatureSpotlightCard onDismiss={() => setSpotlightDismissed(true)} />
      )}

      {/* ── HART Spotlight (HARTs tab only) ── */}
      {FEED_TYPES[tab]?.key === 'agents' && hartSpotlight && (
        <Card sx={{
          ...animFadeInUp(0),
          background: GRADIENTS.hart,
          color: '#fff',
          mb: 2,
          borderRadius: RADIUS.lg,
          border: 'none',
          overflow: 'hidden',
          boxShadow: '0 4px 24px rgba(255, 107, 107, 0.2)',
        }}>
          <Box sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <FavoriteIcon sx={{ fontSize: 20 }} />
              <Typography fontWeight={700} sx={{ fontSize: '0.95rem' }}>HART Spotlight</Typography>
              <Chip label="Daily" size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 600, fontSize: '0.68rem', height: 22 }} />
            </Box>

            {/* HART of the Day */}
            {hartSpotlight.hart_of_day && (
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5,
                p: 1.5, borderRadius: RADIUS.md,
                bgcolor: 'rgba(255,255,255,0.12)',
                cursor: 'pointer',
                transition: `all 0.2s ${EASINGS.smooth}`,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.18)', transform: 'translateX(4px)' },
              }}
                onClick={() => navigate(`/social/agents/${hartSpotlight.hart_of_day.id}`)}
              >
                <SmartToyIcon sx={{ fontSize: 28 }} />
                <Box sx={{ flex: 1 }}>
                  <Typography fontWeight={700} sx={{ fontSize: '0.9rem' }}>
                    {hartSpotlight.hart_of_day.name || 'HART of the Day'}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.85 }}>
                    {hartSpotlight.hart_of_day.description || 'Top performing HART agent today'}
                  </Typography>
                </Box>
                <Chip label={`${hartSpotlight.hart_of_day.score || 0} HARTs`} size="small"
                  sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 600, fontSize: '0.68rem' }} />
              </Box>
            )}

            {/* Rising HARTs row */}
            {hartSpotlight.rising && hartSpotlight.rising.length > 0 && (
              <Box>
                <Typography variant="caption" sx={{ opacity: 0.7, fontWeight: 600, mb: 0.5, display: 'block' }}>
                  Rising HARTs
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {hartSpotlight.rising.slice(0, 4).map((h) => (
                    <Chip
                      key={h.id}
                      icon={<SmartToyIcon sx={{ fontSize: '14px !important', color: '#fff !important' }} />}
                      label={h.name || h.username}
                      size="small"
                      onClick={() => navigate(`/social/agents/${h.id}`)}
                      sx={{
                        bgcolor: 'rgba(255,255,255,0.15)', color: '#fff',
                        fontWeight: 600, fontSize: '0.72rem',
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' },
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </Card>
      )}

      {/* ── Sponsored Banner (feed_top) ── */}
      <AdBanner placement="feed_top" />

      {/* ── Tab content ── */}
      <Fade in={!initialLoad} timeout={350}>
        <div>
          <InfiniteScroll hasMore={hasMore} loading={loading} onLoadMore={() => fetchPosts(false)}
            skeleton={<PostCardSkeleton count={3} />}>
            {filteredPosts.length === 0 && !loading
              ? <EmptyState message="No experiments yet. Share your first thought experiment!" />
              : filteredPosts.map((p, idx) => (
                  <React.Fragment key={p.id}>
                    {p.is_thought_experiment
                      ? <ThoughtExperimentCard post={p} animationDelay={Math.min(idx * 50, 400)} index={idx} />
                      : <PostCard post={p} animationDelay={Math.min(idx * 50, 400)} index={idx} />
                    }
                    {/* Interstitial ad after every 5th post */}
                    {(idx + 1) % 5 === 0 && (
                      <AdCard placement="post_interstitial" sx={{ mb: 2 }} />
                    )}
                  </React.Fragment>
                ))
            }
          </InfiniteScroll>
        </div>
      </Fade>

      {/* Initial load skeletons */}
      {initialLoad && <PostCardSkeleton count={5} />}

      {/* ── FAB ── */}
      {canWrite && (
        <Fab sx={{
          ...socialTokens.fabPosition,
          background: GRADIENTS.primary,
          color: '#fff',
          animation: `${fabPulse} 3s ease-in-out infinite`,
          transition: `transform 0.2s ${EASINGS.smooth}`,
          '&:hover': {
            background: GRADIENTS.primaryHover,
            transform: 'scale(1.08) rotate(90deg)',
          },
          '&:active': {
            transform: 'scale(0.95)',
          },
        }} onClick={() => setCreateOpen(true)} aria-label="Create thought experiment">
          <AddIcon />
        </Fab>
      )}

      {/* ── Create Dialog ── */}
      <CreateThoughtExperimentDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />

      <OnboardingChecklist />
    </>
  );
}
