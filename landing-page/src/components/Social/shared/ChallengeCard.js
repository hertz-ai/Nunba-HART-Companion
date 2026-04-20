import AccessTimeIcon from '@mui/icons-material/AccessTime';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PeopleIcon from '@mui/icons-material/People';
import {
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Chip,
  Stack,
  Box,
  Skeleton,
  Fade,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect} from 'react';

const TYPE_COLORS = {
  daily: 'info',
  weekly: 'primary',
  seasonal: 'warning',
  community: 'secondary',
};

// TYPE_GRADIENTS uses theme-dependent factory for secondary color
const getTypeGradients = (theme) => ({
  daily:
    'linear-gradient(135deg, rgba(41, 182, 246, 0.15) 0%, rgba(41, 182, 246, 0.05) 100%)',
  weekly: `linear-gradient(135deg, ${alpha(theme.palette.secondary.main, 0.15)} 0%, ${alpha(theme.palette.secondary.main, 0.05)} 100%)`,
  seasonal:
    'linear-gradient(135deg, rgba(255, 152, 0, 0.15) 0%, rgba(255, 152, 0, 0.05) 100%)',
  community:
    'linear-gradient(135deg, rgba(156, 39, 176, 0.15) 0%, rgba(156, 39, 176, 0.05) 100%)',
});

// Card style following Netflix dark theme — theme-dependent factory
const getCardStyle = (theme) => ({
  borderRadius: 3,
  overflow: 'hidden',
  background:
    'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 26, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: `0 20px 40px ${alpha(theme.palette.primary.main, 0.1)}`,
    border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
  },
});

function timeRemaining(endDate) {
  if (!endDate) return null;
  const diff = new Date(endDate) - Date.now();
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h left`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m left`;
}

// Animated progress bar
function AnimatedProgress({progress}) {
  const theme = useTheme();
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedProgress(progress), 200);
    return () => clearTimeout(timer);
  }, [progress]);

  const isComplete = progress >= 100;

  return (
    <Box
      sx={{
        height: 6,
        borderRadius: 3,
        background: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          height: '100%',
          borderRadius: 3,
          width: `${animatedProgress}%`,
          background: isComplete
            ? `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`
            : `linear-gradient(90deg, ${theme.palette.secondary.main} 0%, ${theme.palette.primary.main} 100%)`,
          boxShadow: isComplete
            ? `0 0 12px ${alpha(theme.palette.primary.main, 0.5)}`
            : 'none',
          transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </Box>
  );
}

// Skeleton loader for challenge card
export function ChallengeCardSkeleton() {
  const theme = useTheme();
  return (
    <Card sx={getCardStyle(theme)}>
      <CardContent sx={{p: {xs: 2, md: 2.5}}}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          spacing={1}
        >
          <Skeleton
            variant="text"
            width="60%"
            height={28}
            sx={{bgcolor: 'rgba(255,255,255,0.05)'}}
          />
          <Skeleton
            variant="rounded"
            width={60}
            height={22}
            sx={{bgcolor: 'rgba(255,255,255,0.05)'}}
          />
        </Stack>
        <Skeleton
          variant="text"
          width="90%"
          sx={{bgcolor: 'rgba(255,255,255,0.05)', mt: 1, mb: 1.5}}
        />
        <Box sx={{mb: 1.5}}>
          <Stack direction="row" justifyContent="space-between" sx={{mb: 0.5}}>
            <Skeleton
              variant="text"
              width={60}
              sx={{bgcolor: 'rgba(255,255,255,0.05)'}}
            />
            <Skeleton
              variant="text"
              width={40}
              sx={{bgcolor: 'rgba(255,255,255,0.05)'}}
            />
          </Stack>
          <Skeleton
            variant="rounded"
            height={6}
            sx={{bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 3}}
          />
        </Box>
        <Stack direction="row" spacing={2}>
          <Skeleton
            variant="text"
            width={80}
            sx={{bgcolor: 'rgba(255,255,255,0.05)'}}
          />
          <Skeleton
            variant="text"
            width={40}
            sx={{bgcolor: 'rgba(255,255,255,0.05)'}}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function ChallengeCard({challenge, onClick, loading = false}) {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  if (loading) return <ChallengeCardSkeleton />;

  const progress =
    challenge.progress != null && challenge.goal
      ? Math.min((challenge.progress / challenge.goal) * 100, 100)
      : 0;

  const isComplete = progress >= 100;
  const typeGradients = getTypeGradients(theme);
  const typeGradient = typeGradients[challenge.type] || typeGradients.daily;

  return (
    <Fade in={true} timeout={400}>
      <Card
        sx={getCardStyle(theme)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <CardActionArea onClick={() => onClick && onClick(challenge)}>
          {/* Subtle type gradient overlay */}
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 80,
              background: typeGradient,
              opacity: isHovered ? 1 : 0.5,
              transition: 'opacity 0.3s ease',
              pointerEvents: 'none',
            }}
          />

          <CardContent sx={{p: {xs: 2, md: 2.5}, position: 'relative'}}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="flex-start"
              spacing={1}
            >
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 700,
                  flex: 1,
                  color: '#fff',
                  transition: 'color 0.3s ease',
                  ...(isHovered && {
                    background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }),
                }}
              >
                {challenge.name || challenge.title}
              </Typography>
              <Chip
                label={challenge.type || 'daily'}
                size="small"
                color={TYPE_COLORS[challenge.type] || 'default'}
                sx={{
                  fontSize: '0.7rem',
                  height: 22,
                  fontWeight: 600,
                  textTransform: 'capitalize',
                }}
              />
            </Stack>

            {challenge.description && (
              <Typography
                variant="body2"
                sx={{
                  mt: 0.5,
                  mb: 1.5,
                  color: 'rgba(255,255,255,0.6)',
                  lineHeight: 1.5,
                }}
              >
                {challenge.description}
              </Typography>
            )}

            <Box sx={{mb: 1.5}}>
              <Stack
                direction="row"
                justifyContent="space-between"
                sx={{mb: 0.5}}
              >
                <Typography
                  variant="caption"
                  sx={{color: 'rgba(255,255,255,0.5)', fontWeight: 500}}
                >
                  Progress
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 600,
                    color: isComplete
                      ? theme.palette.primary.main
                      : 'rgba(255,255,255,0.7)',
                  }}
                >
                  {challenge.progress ?? 0} / {challenge.goal ?? '?'}
                </Typography>
              </Stack>
              <AnimatedProgress progress={progress} />
            </Box>

            <Stack
              direction="row"
              spacing={2}
              alignItems="center"
              flexWrap="wrap"
            >
              {challenge.end_date && (
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <AccessTimeIcon
                    sx={{fontSize: 14, color: 'rgba(255,255,255,0.4)'}}
                  />
                  <Typography
                    variant="caption"
                    sx={{color: 'rgba(255,255,255,0.5)'}}
                  >
                    {timeRemaining(challenge.end_date)}
                  </Typography>
                </Stack>
              )}
              {challenge.participant_count != null && (
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <PeopleIcon
                    sx={{fontSize: 14, color: 'rgba(255,255,255,0.4)'}}
                  />
                  <Typography
                    variant="caption"
                    sx={{color: 'rgba(255,255,255,0.5)'}}
                  >
                    {challenge.participant_count}
                  </Typography>
                </Stack>
              )}
              {challenge.reward && (
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <EmojiEventsIcon
                    sx={{
                      fontSize: 14,
                      color: '#FFD700',
                      filter: isHovered
                        ? 'drop-shadow(0 0 4px rgba(255, 215, 0, 0.5))'
                        : 'none',
                      transition: 'filter 0.3s ease',
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      color: '#FFD700',
                      textShadow: isHovered
                        ? '0 0 8px rgba(255, 215, 0, 0.5)'
                        : 'none',
                      transition: 'text-shadow 0.3s ease',
                    }}
                  >
                    {challenge.reward}
                  </Typography>
                </Stack>
              )}
            </Stack>
          </CardContent>
        </CardActionArea>
      </Card>
    </Fade>
  );
}
