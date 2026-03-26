import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CloseIcon from '@mui/icons-material/Close';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import {
  Paper,
  Typography,
  Stack,
  Chip,
  IconButton,
  Box,
  Skeleton,
  Slide,
  keyframes,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect} from 'react';

// Shimmer animation for the banner
const shimmer = keyframes`
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
`;

// Pulse animation for the trophy icon
const pulse = keyframes`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
`;

function daysRemaining(endDate) {
  if (!endDate) return null;
  const diff = new Date(endDate) - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / 86400000);
}

// Animated progress bar
function AnimatedProgress({value}) {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedValue(value), 300);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <Box
      sx={{
        height: 10,
        borderRadius: 5,
        background: 'rgba(255,255,255,0.2)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Box
        sx={{
          height: '100%',
          borderRadius: 5,
          width: `${animatedValue}%`,
          background:
            'linear-gradient(90deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,1) 100%)',
          boxShadow: '0 0 16px rgba(255,255,255,0.5)',
          transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </Box>
  );
}

// Skeleton loader for season banner
export function SeasonBannerSkeleton() {
  const theme = useTheme();
  return (
    <Paper
      elevation={0}
      sx={{
        p: {xs: 2, md: 3},
        borderRadius: 3,
        background: `linear-gradient(135deg, ${alpha(theme.palette.secondary.main, 0.3)} 0%, ${alpha(theme.palette.primary.main, 0.3)} 100%)`,
        mb: 2,
      }}
    >
      <Stack spacing={1.5}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
          <Skeleton
            variant="circular"
            width={24}
            height={24}
            sx={{bgcolor: 'rgba(255,255,255,0.1)'}}
          />
          <Skeleton
            variant="text"
            width={160}
            height={32}
            sx={{bgcolor: 'rgba(255,255,255,0.1)'}}
          />
        </Box>
        <Skeleton
          variant="text"
          width={120}
          sx={{bgcolor: 'rgba(255,255,255,0.1)'}}
        />
        <Skeleton
          variant="rounded"
          height={10}
          sx={{bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 5}}
        />
      </Stack>
    </Paper>
  );
}

export default function SeasonBanner({season, onDismiss, loading = false}) {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  if (loading) return <SeasonBannerSkeleton />;
  if (!season) return null;

  const days = daysRemaining(season.end_date);
  const tierProgress =
    season.tier_progress != null && season.tier_goal
      ? Math.min((season.tier_progress / season.tier_goal) * 100, 100)
      : 0;

  const isUrgent = days !== null && days <= 3 && days > 0;

  return (
    <Slide in={true} direction="down" timeout={500}>
      <Paper
        elevation={0}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          p: {xs: 2.5, md: 3},
          borderRadius: 3,
          background: `linear-gradient(135deg, ${theme.palette.secondary.main} 0%, ${theme.palette.primary.main} 100%)`,
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
          mb: 2,
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
          boxShadow: isHovered
            ? `0 20px 40px ${alpha(theme.palette.primary.main, 0.25)}, 0 8px 16px ${alpha(theme.palette.secondary.main, 0.2)}`
            : `0 4px 20px ${alpha(theme.palette.secondary.main, 0.15)}`,
          // Shimmer overlay effect on hover
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
            backgroundSize: '200% 100%',
            animation: isHovered ? `${shimmer} 2s linear infinite` : 'none',
            pointerEvents: 'none',
          },
        }}
      >
        {/* Decorative background circles */}
        <Box
          sx={{
            position: 'absolute',
            top: -40,
            right: -40,
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)',
            transition: 'transform 0.4s ease',
            transform: isHovered ? 'scale(1.2)' : 'scale(1)',
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
            background: 'rgba(255,255,255,0.05)',
            transition: 'transform 0.4s ease',
            transform: isHovered ? 'scale(1.2)' : 'scale(1)',
          }}
        />

        {onDismiss && (
          <IconButton
            onClick={onDismiss}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              color: 'rgba(255,255,255,0.8)',
              transition: 'all 0.2s ease',
              '&:hover': {
                color: '#fff',
                background: 'rgba(255,255,255,0.1)',
              },
            }}
            size="small"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        )}

        <Stack spacing={2} sx={{position: 'relative', zIndex: 1}}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.2)',
                animation: isHovered
                  ? `${pulse} 1.5s ease-in-out infinite`
                  : 'none',
              }}
            >
              <EmojiEventsIcon sx={{fontSize: 24}} />
            </Box>
            <Box>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  textShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                {season.name || 'Current Season'}
              </Typography>
              {days != null && (
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <AccessTimeIcon sx={{fontSize: 14, opacity: 0.9}} />
                  <Typography
                    variant="body2"
                    sx={{
                      opacity: 0.9,
                      fontWeight: isUrgent ? 700 : 400,
                      color: isUrgent ? '#ffeb3b' : 'inherit',
                    }}
                  >
                    {days > 0 ? `${days} days remaining` : 'Season ended'}
                  </Typography>
                </Stack>
              )}
            </Box>
          </Stack>

          {season.tier_goal && (
            <Box>
              <Stack
                direction="row"
                justifyContent="space-between"
                sx={{mb: 1}}
              >
                <Typography
                  variant="body2"
                  sx={{opacity: 0.9, fontWeight: 500}}
                >
                  Tier Progress: {season.current_tier || 'Bronze'}
                </Typography>
                <Typography variant="body2" sx={{fontWeight: 700}}>
                  {season.tier_progress ?? 0} / {season.tier_goal}
                </Typography>
              </Stack>
              <AnimatedProgress value={tierProgress} />
            </Box>
          )}

          {season.rewards && season.rewards.length > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {season.rewards.map((reward, i) => (
                <Chip
                  key={i}
                  label={reward.name || reward}
                  size="small"
                  sx={{
                    bgcolor: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.7rem',
                    backdropFilter: 'blur(4px)',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.3)',
                      transform: 'scale(1.05)',
                    },
                  }}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>
    </Slide>
  );
}
