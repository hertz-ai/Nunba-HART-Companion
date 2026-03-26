import {useSocial} from '../../../contexts/SocialContext';
import {seasonsApi} from '../../../services/socialApi';
import {socialTokens, RADIUS} from '../../../theme/socialTokens';
import EmptyState from '../shared/EmptyState';
import SeasonBanner from '../shared/SeasonBanner';

import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import {
  Typography,
  Box,
  Paper,
  Stack,
  Chip,
  Divider,
  Alert,
  Avatar,
  Skeleton,
  Fade,
  Grow,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect, useCallback, useMemo} from 'react';

const TIER_COLORS = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#FFD700',
  platinum: '#e5e4e2',
  diamond: '#b9f2ff',
};

const TIER_GLOW = {
  bronze: 'rgba(205, 127, 50, 0.3)',
  silver: 'rgba(192, 192, 192, 0.3)',
  gold: 'rgba(255, 215, 0, 0.4)',
  platinum: 'rgba(229, 228, 226, 0.3)',
  diamond: 'rgba(185, 242, 255, 0.4)',
};

// Animated progress bar
function AnimatedProgressBar({value, tierColor}) {
  const theme = useTheme();
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedValue(value), 200);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <Box
      sx={{
        height: 10,
        borderRadius: 5,
        background: alpha(theme.palette.common.white, 0.05),
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Box
        sx={{
          height: '100%',
          borderRadius: 5,
          width: `${animatedValue}%`,
          background: tierColor
            ? `linear-gradient(90deg, ${tierColor} 0%, ${tierColor}88 100%)`
            : `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
          boxShadow: tierColor
            ? `0 0 16px ${tierColor}66`
            : `0 0 16px ${alpha(theme.palette.primary.main, 0.4)}`,
          transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </Box>
  );
}

// Skeleton loader for season page
function SeasonSkeleton() {
  const theme = useTheme();

  const cardStyle = {
    p: {xs: 2, md: 3},
    borderRadius: RADIUS.lg,
    mb: 3,
    background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.9)} 0%, ${alpha(theme.palette.background.default, 0.95)} 100%)`,
    backdropFilter: 'blur(20px)',
    border: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
  };

  return (
    <Fade in={true} timeout={300}>
      <Box>
        <Skeleton
          variant="text"
          width={120}
          height={40}
          sx={{bgcolor: alpha(theme.palette.common.white, 0.05), mb: 2}}
        />

        {/* Banner skeleton */}
        <Skeleton
          variant="rounded"
          height={160}
          sx={{
            bgcolor: alpha(theme.palette.common.white, 0.05),
            borderRadius: RADIUS.lg,
            mb: 3,
          }}
        />

        {/* Tiers skeleton */}
        <Box sx={cardStyle}>
          <Skeleton
            variant="text"
            width={140}
            height={32}
            sx={{bgcolor: alpha(theme.palette.common.white, 0.05), mb: 2}}
          />
          {[1, 2, 3, 4].map((i) => (
            <Box key={i} sx={{mb: 2}}>
              <Box
                sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 1}}
              >
                <Skeleton
                  variant="circular"
                  width={24}
                  height={24}
                  sx={{bgcolor: alpha(theme.palette.common.white, 0.05)}}
                />
                <Skeleton
                  variant="text"
                  width={80}
                  sx={{bgcolor: alpha(theme.palette.common.white, 0.05)}}
                />
                <Skeleton
                  variant="text"
                  width={60}
                  sx={{
                    bgcolor: alpha(theme.palette.common.white, 0.05),
                    ml: 'auto',
                  }}
                />
              </Box>
              {i < 4 && (
                <Divider
                  sx={{borderColor: alpha(theme.palette.common.white, 0.05)}}
                />
              )}
            </Box>
          ))}
        </Box>

        {/* Progress skeleton */}
        <Box sx={cardStyle}>
          <Skeleton
            variant="text"
            width={140}
            height={32}
            sx={{bgcolor: alpha(theme.palette.common.white, 0.05), mb: 2}}
          />
          <Skeleton
            variant="rounded"
            height={10}
            sx={{
              bgcolor: alpha(theme.palette.common.white, 0.05),
              borderRadius: 5,
              mb: 2,
            }}
          />
          <Box sx={{display: 'flex', gap: 2}}>
            <Skeleton
              variant="text"
              width={80}
              sx={{bgcolor: alpha(theme.palette.common.white, 0.05)}}
            />
            <Skeleton
              variant="text"
              width={80}
              sx={{bgcolor: alpha(theme.palette.common.white, 0.05)}}
            />
          </Box>
        </Box>
      </Box>
    </Fade>
  );
}

// Tier row component with hover effects
function TierRow({tier, index, isCurrentTier, tiersCount}) {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const tierColorKey = tier.name?.toLowerCase();
  const tierColor = TIER_COLORS[tierColorKey] || '#999';
  const tierGlow =
    TIER_GLOW[tierColorKey] || alpha(theme.palette.common.white, 0.2);

  return (
    <Grow in={true} timeout={300 + index * 100}>
      <Box>
        <Box
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          sx={{
            p: 1.5,
            mx: -1.5,
            borderRadius: 2,
            background: isHovered
              ? `linear-gradient(90deg, ${tierGlow} 0%, transparent 100%)`
              : isCurrentTier
                ? `linear-gradient(90deg, ${tierGlow} 0%, transparent 50%)`
                : 'transparent',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{mb: 1}}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `linear-gradient(135deg, ${tierColor}30 0%, ${tierColor}10 100%)`,
                border: `2px solid ${tierColor}40`,
                transition: 'all 0.3s ease',
                boxShadow: isHovered ? `0 0 16px ${tierGlow}` : 'none',
              }}
            >
              <EmojiEventsIcon
                sx={{
                  color: tierColor,
                  fontSize: 20,
                  filter: isHovered
                    ? `drop-shadow(0 0 4px ${tierColor})`
                    : 'none',
                  transition: 'filter 0.3s ease',
                }}
              />
            </Box>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: isCurrentTier ? 800 : 600,
                color: isCurrentTier ? tierColor : '#fff',
                transition: 'color 0.3s ease',
                ...(isHovered && {color: tierColor}),
              }}
            >
              {tier.name}
            </Typography>
            {isCurrentTier && (
              <Chip
                label="Current"
                size="small"
                sx={{
                  fontSize: '0.65rem',
                  height: 20,
                  fontWeight: 600,
                  background: `linear-gradient(135deg, ${tierColor} 0%, ${tierColor}cc 100%)`,
                  color:
                    tierColorKey === 'silver' || tierColorKey === 'platinum'
                      ? '#000'
                      : '#fff',
                  boxShadow: `0 2px 8px ${tierGlow}`,
                }}
              />
            )}
            <Typography
              variant="caption"
              sx={{
                ml: 'auto',
                color: alpha(theme.palette.common.white, 0.5),
                fontWeight: 600,
              }}
            >
              {tier.threshold} pts
            </Typography>
          </Stack>
          {tier.rewards && (
            <Stack
              direction="row"
              spacing={1}
              flexWrap="wrap"
              useFlexGap
              sx={{ml: 6}}
            >
              {(Array.isArray(tier.rewards)
                ? tier.rewards
                : [tier.rewards]
              ).map((r, j) => (
                <Chip
                  key={j}
                  label={r.name || r}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontSize: '0.7rem',
                    borderColor: alpha(theme.palette.common.white, 0.15),
                    color: alpha(theme.palette.common.white, 0.7),
                    '&:hover': {
                      borderColor: tierColor,
                      color: tierColor,
                    },
                    transition: 'all 0.2s ease',
                  }}
                />
              ))}
            </Stack>
          )}
        </Box>
        {index < tiersCount - 1 && (
          <Divider
            sx={{borderColor: alpha(theme.palette.common.white, 0.05), my: 1}}
          />
        )}
      </Box>
    </Grow>
  );
}

// Leaderboard entry with hover effects
function LeaderboardEntry({entry, index}) {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const isTopThree = index < 3;

  const getRankStyle = () => {
    if (index === 0) return {color: '#FFD700', glow: 'rgba(255, 215, 0, 0.3)'};
    if (index === 1)
      return {color: '#C0C0C0', glow: 'rgba(192, 192, 192, 0.3)'};
    if (index === 2) return {color: '#CD7F32', glow: 'rgba(205, 127, 50, 0.3)'};
    return {color: alpha(theme.palette.common.white, 0.5), glow: 'transparent'};
  };

  const rankStyle = getRankStyle();

  return (
    <Grow in={true} timeout={400 + index * 50}>
      <Box
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          py: 1.5,
          px: 1.5,
          mx: -1.5,
          borderRadius: 2,
          borderBottom:
            index < 19
              ? `1px solid ${alpha(theme.palette.common.white, 0.05)}`
              : 'none',
          background: isHovered
            ? `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, transparent 100%)`
            : isTopThree
              ? `linear-gradient(90deg, ${rankStyle.glow} 0%, transparent 100%)`
              : 'transparent',
          transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <Typography
          sx={{
            fontWeight: 800,
            minWidth: 32,
            textAlign: 'center',
            color: rankStyle.color,
            fontSize: isTopThree ? '1rem' : '0.875rem',
            textShadow: isTopThree ? `0 0 10px ${rankStyle.glow}` : 'none',
          }}
        >
          #{index + 1}
        </Typography>
        <Avatar
          src={entry.avatar_url}
          sx={{
            width: 32,
            height: 32,
            fontSize: 14,
            border: isHovered
              ? `2px solid ${alpha(theme.palette.primary.main, 0.5)}`
              : '2px solid transparent',
            transition: 'border 0.3s ease',
          }}
        >
          {(entry.display_name || 'U')[0]}
        </Avatar>
        <Box sx={{flex: 1, minWidth: 0}}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color: isHovered ? theme.palette.primary.main : '#fff',
              transition: 'color 0.3s ease',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {entry.display_name || entry.username}
          </Typography>
          {entry.tier && (
            <Typography
              variant="caption"
              sx={{
                color:
                  TIER_COLORS[entry.tier?.toLowerCase()] ||
                  alpha(theme.palette.common.white, 0.5),
              }}
            >
              {entry.tier}
            </Typography>
          )}
        </Box>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 700,
            color: isTopThree ? rankStyle.color : theme.palette.secondary.main,
            textShadow: isHovered
              ? `0 0 10px ${alpha(theme.palette.secondary.main, 0.5)}`
              : 'none',
            transition: 'text-shadow 0.3s ease',
          }}
        >
          {entry.points ?? entry.score ?? 0} pts
        </Typography>
      </Box>
    </Grow>
  );
}

export default function SeasonPage() {
  const {currentUser} = useSocial();
  const theme = useTheme();
  const [season, setSeason] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Theme-dependent card style
  const cardStyle = useMemo(
    () => ({
      p: {xs: 2, md: 3},
      borderRadius: RADIUS.lg,
      mb: 3,
      background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.9)} 0%, ${alpha(theme.palette.background.default, 0.95)} 100%)`,
      backdropFilter: 'blur(20px)',
      border: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
    }),
    [theme]
  );

  const fetchSeason = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await seasonsApi.current();
      const seasonData = res.data || res;
      setSeason(seasonData);

      if (seasonData && seasonData.id) {
        try {
          const lbRes = await seasonsApi.leaderboard(seasonData.id, {
            limit: 20,
          });
          setLeaderboard(lbRes.data || []);
        } catch {
          setLeaderboard([]);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load season data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSeason();
  }, [fetchSeason]);

  if (loading) return <SeasonSkeleton />;

  if (error && !season) {
    return (
      <Fade in={true} timeout={300}>
        <Alert
          severity="error"
          sx={{
            background: `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.15)} 0%, ${alpha(theme.palette.error.main, 0.05)} 100%)`,
            border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`,
            color: '#fff',
            '& .MuiAlert-icon': {color: theme.palette.error.main},
          }}
        >
          {error}
        </Alert>
      </Fade>
    );
  }

  if (!season) {
    return (
      <EmptyState
        message="No active season right now."
        icon={CalendarTodayIcon}
      />
    );
  }

  const personalProgress = season.personal_progress || {};
  const currentTierColor =
    TIER_COLORS[
      (personalProgress.tier || season.current_tier || 'bronze').toLowerCase()
    ];
  const progressPct = season.tier_goal
    ? Math.min(
        ((personalProgress.points ?? season.tier_progress ?? 0) /
          season.tier_goal) *
          100,
        100
      )
    : 0;

  return (
    <Fade in={true} timeout={400}>
      <Box>
        {/* Page header */}
        <Box sx={{mb: 3}}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              background: `linear-gradient(135deg, #fff 0%, ${alpha(theme.palette.common.white, 0.7)} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 1,
            }}
          >
            Season
          </Typography>
          <Typography
            variant="body2"
            sx={{color: alpha(theme.palette.common.white, 0.5)}}
          >
            Compete for rewards and climb the seasonal ranks
          </Typography>
        </Box>

        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 2,
              background: `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.15)} 0%, ${alpha(theme.palette.error.main, 0.05)} 100%)`,
              border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`,
              color: '#fff',
            }}
          >
            {error}
          </Alert>
        )}

        <SeasonBanner season={season} />

        {/* Reward Tiers */}
        {season.tiers && season.tiers.length > 0 && (
          <Grow in={true} timeout={500}>
            <Paper elevation={0} sx={cardStyle}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  mb: 2,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#FFD700',
                    boxShadow: '0 0 10px #FFD700',
                  }}
                />
                Reward Tiers
              </Typography>
              <Stack spacing={0}>
                {season.tiers.map((tier, i) => {
                  const isCurrentTier =
                    tier.name ===
                    (season.current_tier || personalProgress.tier);
                  return (
                    <TierRow
                      key={i}
                      tier={tier}
                      index={i}
                      isCurrentTier={isCurrentTier}
                      tiersCount={season.tiers.length}
                    />
                  );
                })}
              </Stack>
            </Paper>
          </Grow>
        )}

        {/* Personal Progress */}
        {currentUser && (
          <Grow in={true} timeout={600}>
            <Paper elevation={0} sx={cardStyle}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  mb: 2,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: theme.palette.primary.main,
                    boxShadow: `0 0 10px ${theme.palette.primary.main}`,
                  }}
                />
                Your Progress
              </Typography>
              <Stack spacing={2}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography
                    variant="body2"
                    sx={{color: alpha(theme.palette.common.white, 0.6)}}
                  >
                    Season Points
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 700,
                      background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    {personalProgress.points ?? season.tier_progress ?? 0}
                  </Typography>
                </Stack>
                <AnimatedProgressBar
                  value={progressPct}
                  tierColor={currentTierColor}
                />
                <Stack direction="row" spacing={3}>
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        color: alpha(theme.palette.common.white, 0.4),
                        display: 'block',
                      }}
                    >
                      Current Rank
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{fontWeight: 700, color: '#fff'}}
                    >
                      #{personalProgress.rank ?? '--'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{
                        color: alpha(theme.palette.common.white, 0.4),
                        display: 'block',
                      }}
                    >
                      Current Tier
                    </Typography>
                    <Typography
                      variant="body1"
                      sx={{
                        fontWeight: 700,
                        color: currentTierColor || '#fff',
                      }}
                    >
                      {personalProgress.tier ?? season.current_tier ?? 'Bronze'}
                    </Typography>
                  </Box>
                </Stack>
              </Stack>
            </Paper>
          </Grow>
        )}

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <Grow in={true} timeout={700}>
            <Paper elevation={0} sx={cardStyle}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  mb: 2,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: theme.palette.secondary.main,
                    boxShadow: `0 0 10px ${theme.palette.secondary.main}`,
                  }}
                />
                Season Leaderboard
              </Typography>
              <Box>
                {leaderboard.map((entry, i) => (
                  <LeaderboardEntry
                    key={entry.user_id || i}
                    entry={entry}
                    index={i}
                  />
                ))}
              </Box>
            </Paper>
          </Grow>
        )}
      </Box>
    </Fade>
  );
}
