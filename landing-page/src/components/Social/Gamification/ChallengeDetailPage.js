import {useSocial} from '../../../contexts/SocialContext';
import {challengesApi} from '../../../services/socialApi';
import {socialTokens, RADIUS} from '../../../theme/socialTokens';

import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PeopleIcon from '@mui/icons-material/People';
import {
  Typography,
  Box,
  Button,
  Paper,
  Stack,
  Chip,
  Divider,
  Alert,
  Avatar,
  Skeleton,
  Fade,
  Grow,
  keyframes,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {useParams, useNavigate} from 'react-router-dom';


const TYPE_COLORS = {
  daily: 'info',
  weekly: 'primary',
  seasonal: 'warning',
  community: 'secondary',
};

// Shimmer animation for hero
const shimmer = keyframes`
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
`;

function timeRemaining(endDate) {
  if (!endDate) return null;
  const diff = new Date(endDate) - Date.now();
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

// Animated progress bar
function AnimatedProgress({progress}) {
  const theme = useTheme();
  const [animatedProgress, setAnimatedProgress] = useState(0);

  // Pulse animation for completed progress (theme-dependent)
  const pulse = useMemo(
    () => keyframes`
    0%, 100% { box-shadow: 0 0 0 0 ${alpha(theme.palette.primary.main, 0.4)}; }
    50% { box-shadow: 0 0 0 10px ${alpha(theme.palette.primary.main, 0)}; }
  `,
    [theme]
  );

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedProgress(progress), 300);
    return () => clearTimeout(timer);
  }, [progress]);

  const isComplete = progress >= 100;

  return (
    <Box
      sx={{
        height: 12,
        borderRadius: 6,
        background: alpha(theme.palette.common.white, 0.05),
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Box
        sx={{
          height: '100%',
          borderRadius: 6,
          width: `${animatedProgress}%`,
          background: isComplete
            ? `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`
            : `linear-gradient(90deg, ${theme.palette.secondary.main} 0%, ${theme.palette.primary.main} 100%)`,
          boxShadow: isComplete
            ? `0 0 20px ${alpha(theme.palette.primary.main, 0.5)}`
            : 'none',
          transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
          animation: isComplete ? `${pulse} 2s ease-in-out infinite` : 'none',
        }}
      />
    </Box>
  );
}

// Skeleton loader
function ChallengeDetailSkeleton() {
  const theme = useTheme();

  // Card style (theme-dependent)
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
          variant="rounded"
          width={160}
          height={36}
          sx={{
            bgcolor: alpha(theme.palette.common.white, 0.05),
            mb: 2,
            borderRadius: 2,
          }}
        />

        {/* Hero skeleton */}
        <Skeleton
          variant="rounded"
          height={200}
          sx={{
            bgcolor: alpha(theme.palette.common.white, 0.05),
            borderRadius: RADIUS.lg,
            mb: 3,
          }}
        />

        {/* Progress skeleton */}
        <Box sx={cardStyle}>
          <Skeleton
            variant="text"
            width={140}
            height={32}
            sx={{bgcolor: alpha(theme.palette.common.white, 0.05), mb: 2}}
          />
          <Box sx={{display: 'flex', justifyContent: 'space-between', mb: 1}}>
            <Skeleton
              variant="text"
              width={80}
              sx={{bgcolor: alpha(theme.palette.common.white, 0.05)}}
            />
            <Skeleton
              variant="text"
              width={40}
              sx={{bgcolor: alpha(theme.palette.common.white, 0.05)}}
            />
          </Box>
          <Skeleton
            variant="rounded"
            height={12}
            sx={{
              bgcolor: alpha(theme.palette.common.white, 0.05),
              borderRadius: 6,
              mb: 2,
            }}
          />
          <Skeleton
            variant="rounded"
            width={140}
            height={40}
            sx={{
              bgcolor: alpha(theme.palette.common.white, 0.05),
              borderRadius: 2,
            }}
          />
        </Box>

        {/* Rules skeleton */}
        <Box sx={cardStyle}>
          <Skeleton
            variant="text"
            width={80}
            height={32}
            sx={{bgcolor: alpha(theme.palette.common.white, 0.05), mb: 2}}
          />
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              variant="text"
              width="90%"
              sx={{bgcolor: alpha(theme.palette.common.white, 0.05), mb: 0.5}}
            />
          ))}
        </Box>
      </Box>
    </Fade>
  );
}

// Leaderboard entry component
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
    <Grow in={true} timeout={300 + index * 50}>
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
          borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
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
            minWidth: 28,
            textAlign: 'center',
            color: rankStyle.color,
            fontSize: isTopThree ? '1rem' : '0.875rem',
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
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            fontWeight: 600,
            color: isHovered ? theme.palette.primary.main : '#fff',
            transition: 'color 0.3s ease',
          }}
        >
          {entry.display_name || entry.username}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 700,
            color: isTopThree ? rankStyle.color : theme.palette.secondary.main,
          }}
        >
          {entry.score ?? entry.progress ?? 0}
        </Typography>
      </Box>
    </Grow>
  );
}

export default function ChallengeDetailPage() {
  const {challengeId} = useParams();
  const navigate = useNavigate();
  const {currentUser} = useSocial();
  const theme = useTheme();

  const [challenge, setChallenge] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [isHeroHovered, setIsHeroHovered] = useState(false);

  // Theme-dependent type gradients
  const TYPE_GRADIENTS = useMemo(
    () => ({
      daily: `linear-gradient(135deg, ${theme.palette.info.main} 0%, ${theme.palette.secondary.main} 100%)`,
      weekly: `linear-gradient(135deg, ${theme.palette.secondary.main} 0%, ${theme.palette.primary.dark} 100%)`,
      seasonal: `linear-gradient(135deg, ${theme.palette.warning.main} 0%, ${theme.palette.warning.light} 100%)`,
      community: `linear-gradient(135deg, #9c27b0 0%, #e91e63 100%)`,
    }),
    [theme]
  );

  // Card style (theme-dependent)
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

  const fetchChallenge = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await challengesApi.get(challengeId);
      setChallenge(res.data || res);
    } catch (err) {
      setError(err.message || 'Failed to load challenge');
    } finally {
      setLoading(false);
    }
  }, [challengeId]);

  useEffect(() => {
    fetchChallenge();
  }, [fetchChallenge]);

  const handleJoin = async () => {
    setJoining(true);
    try {
      await challengesApi.updateProgress(challengeId, {action: 'join'});
      await fetchChallenge();
    } catch (err) {
      setError(err.message || 'Failed to join challenge');
    } finally {
      setJoining(false);
    }
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await challengesApi.claim(challengeId);
      await fetchChallenge();
    } catch (err) {
      setError(err.message || 'Failed to claim reward');
    } finally {
      setClaiming(false);
    }
  };

  if (loading) return <ChallengeDetailSkeleton />;

  if (error && !challenge) {
    return (
      <Fade in={true} timeout={300}>
        <Box>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/social/challenges')}
            sx={{
              mb: 2,
              color: alpha(theme.palette.common.white, 0.7),
              '&:hover': {
                color: '#fff',
                background: alpha(theme.palette.common.white, 0.05),
              },
            }}
          >
            Back
          </Button>
          <Alert
            severity="error"
            sx={{
              background: `linear-gradient(135deg, ${alpha(theme.palette.error.main, 0.15)} 0%, ${alpha(theme.palette.error.main, 0.05)} 100%)`,
              border: `1px solid ${alpha(theme.palette.error.main, 0.3)}`,
              color: '#fff',
            }}
          >
            {error}
          </Alert>
        </Box>
      </Fade>
    );
  }

  if (!challenge) return null;

  const progress =
    challenge.progress != null && challenge.goal
      ? Math.min((challenge.progress / challenge.goal) * 100, 100)
      : 0;
  const isCompleted = progress >= 100;
  const hasJoined = challenge.has_joined || challenge.joined;
  const heroGradient = TYPE_GRADIENTS[challenge.type] || TYPE_GRADIENTS.daily;

  return (
    <Fade in={true} timeout={400}>
      <Box>
        {/* Back button */}
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/social/challenges')}
          sx={{
            mb: 2,
            color: alpha(theme.palette.common.white, 0.7),
            transition: 'all 0.2s ease',
            '&:hover': {
              color: theme.palette.primary.main,
              background: alpha(theme.palette.primary.main, 0.05),
              transform: 'translateX(-4px)',
            },
          }}
        >
          Back to Challenges
        </Button>

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

        {/* Hero */}
        <Grow in={true} timeout={500}>
          <Paper
            elevation={0}
            onMouseEnter={() => setIsHeroHovered(true)}
            onMouseLeave={() => setIsHeroHovered(false)}
            sx={{
              p: {xs: 2.5, md: 3.5},
              borderRadius: RADIUS.lg,
              background: heroGradient,
              color: '#fff',
              mb: 3,
              position: 'relative',
              overflow: 'hidden',
              transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
              transform: isHeroHovered ? 'translateY(-2px)' : 'translateY(0)',
              boxShadow: isHeroHovered
                ? '0 20px 40px rgba(0,0,0,0.3)'
                : '0 4px 20px rgba(0,0,0,0.15)',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.common.white, 0.1)}, transparent)`,
                backgroundSize: '200% 100%',
                animation: isHeroHovered
                  ? `${shimmer} 2s linear infinite`
                  : 'none',
                pointerEvents: 'none',
              },
            }}
          >
            {/* Decorative circles */}
            <Box
              sx={{
                position: 'absolute',
                top: -40,
                right: -40,
                width: 120,
                height: 120,
                borderRadius: '50%',
                background: alpha(theme.palette.common.white, 0.1),
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                bottom: -30,
                left: -30,
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: alpha(theme.palette.common.white, 0.05),
              }}
            />

            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="flex-start"
              flexWrap="wrap"
              spacing={1}
              sx={{position: 'relative', zIndex: 1}}
            >
              <Typography
                variant="h5"
                sx={{fontWeight: 800, textShadow: '0 2px 4px rgba(0,0,0,0.2)'}}
              >
                {challenge.name || challenge.title}
              </Typography>
              <Chip
                label={challenge.type || 'daily'}
                size="small"
                sx={{
                  color: '#fff',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  bgcolor: alpha(theme.palette.common.white, 0.2),
                  backdropFilter: 'blur(4px)',
                }}
              />
            </Stack>

            {challenge.description && (
              <Typography
                variant="body1"
                sx={{mt: 1.5, opacity: 0.9, position: 'relative', zIndex: 1}}
              >
                {challenge.description}
              </Typography>
            )}

            <Stack
              direction="row"
              spacing={3}
              sx={{mt: 2, position: 'relative', zIndex: 1}}
              flexWrap="wrap"
              useFlexGap
            >
              {challenge.end_date && (
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <AccessTimeIcon sx={{fontSize: 18}} />
                  <Typography variant="body2">
                    {timeRemaining(challenge.end_date)}
                  </Typography>
                </Stack>
              )}
              {challenge.participant_count != null && (
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <PeopleIcon sx={{fontSize: 18}} />
                  <Typography variant="body2">
                    {challenge.participant_count} participants
                  </Typography>
                </Stack>
              )}
              {challenge.reward && (
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <EmojiEventsIcon sx={{fontSize: 18}} />
                  <Typography variant="body2" sx={{fontWeight: 600}}>
                    {challenge.reward}
                  </Typography>
                </Stack>
              )}
            </Stack>
          </Paper>
        </Grow>

        {/* Progress */}
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
                  background: isCompleted
                    ? theme.palette.primary.main
                    : theme.palette.secondary.main,
                  boxShadow: isCompleted
                    ? `0 0 10px ${theme.palette.primary.main}`
                    : `0 0 10px ${theme.palette.secondary.main}`,
                }}
              />
              Your Progress
            </Typography>
            <Stack direction="row" justifyContent="space-between" sx={{mb: 1}}>
              <Typography
                variant="body2"
                sx={{color: alpha(theme.palette.common.white, 0.6)}}
              >
                {challenge.progress ?? 0} / {challenge.goal ?? '?'}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  color: isCompleted ? theme.palette.primary.main : '#fff',
                }}
              >
                {Math.round(progress)}%
              </Typography>
            </Stack>
            <AnimatedProgress progress={progress} />

            <Stack direction="row" spacing={2} sx={{mt: 3}}>
              {!hasJoined && currentUser && challenge.status === 'active' && (
                <Button
                  variant="contained"
                  onClick={handleJoin}
                  disabled={joining}
                  sx={{
                    background: `linear-gradient(135deg, ${theme.palette.secondary.main} 0%, ${theme.palette.primary.main} 100%)`,
                    fontWeight: 600,
                    px: 3,
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.4)}`,
                    },
                  }}
                >
                  {joining ? 'Joining...' : 'Join Challenge'}
                </Button>
              )}
              {isCompleted && !challenge.claimed && (
                <Button
                  variant="contained"
                  onClick={handleClaim}
                  disabled={claiming}
                  sx={{
                    background:
                      'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                    color: '#000',
                    fontWeight: 600,
                    px: 3,
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 16px rgba(255, 215, 0, 0.4)',
                    },
                  }}
                >
                  {claiming ? 'Claiming...' : 'Claim Reward'}
                </Button>
              )}
              {challenge.claimed && (
                <Chip
                  icon={<CheckCircleIcon />}
                  label="Reward Claimed"
                  sx={{
                    background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.2)} 0%, ${alpha(theme.palette.primary.main, 0.1)} 100%)`,
                    color: theme.palette.primary.main,
                    fontWeight: 600,
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                  }}
                />
              )}
            </Stack>
          </Paper>
        </Grow>

        {/* Rules */}
        {challenge.rules && challenge.rules.length > 0 && (
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
                    background: theme.palette.warning.light,
                    boxShadow: `0 0 10px ${theme.palette.warning.light}`,
                  }}
                />
                Rules
              </Typography>
              {challenge.rules.map((rule, i) => (
                <Typography
                  key={i}
                  variant="body2"
                  sx={{
                    mb: 1,
                    color: alpha(theme.palette.common.white, 0.7),
                    pl: 2,
                    position: 'relative',
                    '&::before': {
                      content: `"${i + 1}."`,
                      position: 'absolute',
                      left: 0,
                      color: alpha(theme.palette.common.white, 0.4),
                      fontWeight: 600,
                    },
                  }}
                >
                  {rule}
                </Typography>
              ))}
            </Paper>
          </Grow>
        )}

        {/* Leaderboard */}
        {challenge.leaderboard && challenge.leaderboard.length > 0 && (
          <Grow in={true} timeout={800}>
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
                Leaderboard
              </Typography>
              <Divider
                sx={{
                  borderColor: alpha(theme.palette.common.white, 0.05),
                  mb: 1,
                }}
              />
              <Box>
                {challenge.leaderboard.map((entry, i) => (
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
