import {useSocial} from '../../../contexts/SocialContext';
import {achievementsApi} from '../../../services/socialApi';

import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LockIcon from '@mui/icons-material/Lock';
import {
  Typography,
  Box,
  Tabs,
  Tab,
  Chip,
  Grid,
  Skeleton,
  Fade,
  Grow,
  keyframes,
} from '@mui/material';
import React, {useState, useEffect} from 'react';


const RARITY_COLORS = {
  common: '#95a5a6',
  uncommon: '#2ecc71',
  rare: '#3498db',
  legendary: '#f39c12',
};

const RARITY_GLOW = {
  common: 'rgba(149, 165, 166, 0.3)',
  uncommon: 'rgba(46, 204, 113, 0.4)',
  rare: 'rgba(52, 152, 219, 0.4)',
  legendary: 'rgba(243, 156, 18, 0.5)',
};

// Shimmer animation for legendary achievements
const shimmer = keyframes`
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
`;

// Pulse animation for unlocked achievements
const pulse = keyframes`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
`;

// Achievement card style
const achievementCardStyle = {
  p: 2.5,
  borderRadius: 3,
  textAlign: 'center',
  position: 'relative',
  overflow: 'hidden',
  background:
    'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 26, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  cursor: 'pointer',
};

// Skeleton loader for achievements grid
function AchievementsSkeleton() {
  return (
    <Fade in={true} timeout={300}>
      <Box>
        <Skeleton
          variant="text"
          width={160}
          height={40}
          sx={{bgcolor: 'rgba(255,255,255,0.05)', mb: 2}}
        />
        <Box sx={{display: 'flex', gap: 2, mb: 3}}>
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              variant="rounded"
              width={100}
              height={36}
              sx={{bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1}}
            />
          ))}
        </Box>
        <Grid container spacing={2}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Grid item xs={6} sm={4} md={3} key={i}>
              <Box sx={{...achievementCardStyle, p: 2.5}}>
                <Skeleton
                  variant="rounded"
                  width={50}
                  height={20}
                  sx={{
                    bgcolor: 'rgba(255,255,255,0.05)',
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    borderRadius: 10,
                  }}
                />
                <Skeleton
                  variant="circular"
                  width={64}
                  height={64}
                  sx={{bgcolor: 'rgba(255,255,255,0.05)', mx: 'auto', mb: 1.5}}
                />
                <Skeleton
                  variant="text"
                  width="80%"
                  sx={{bgcolor: 'rgba(255,255,255,0.05)', mx: 'auto'}}
                />
                <Skeleton
                  variant="text"
                  width="60%"
                  sx={{bgcolor: 'rgba(255,255,255,0.05)', mx: 'auto'}}
                />
              </Box>
            </Grid>
          ))}
        </Grid>
      </Box>
    </Fade>
  );
}

// Individual achievement card component
function AchievementCard({achievement, isUnlocked, index}) {
  const [isHovered, setIsHovered] = useState(false);
  const rarity = achievement.rarity || 'common';
  const isLegendary = rarity === 'legendary';

  return (
    <Grow in={true} timeout={300 + index * 50}>
      <Box
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          ...achievementCardStyle,
          opacity: isUnlocked ? 1 : 0.6,
          filter: isUnlocked ? 'none' : 'grayscale(0.8)',
          transform:
            isHovered && isUnlocked
              ? 'translateY(-8px) scale(1.02)'
              : 'translateY(0)',
          boxShadow:
            isHovered && isUnlocked
              ? `0 20px 40px ${RARITY_GLOW[rarity]}, 0 0 30px ${RARITY_GLOW[rarity]}`
              : 'none',
          border:
            isHovered && isUnlocked
              ? `1px solid ${RARITY_COLORS[rarity]}40`
              : '1px solid rgba(255,255,255,0.05)',
          // Shimmer border for legendary
          ...(isLegendary &&
            isUnlocked && {
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: 0,
                borderRadius: 'inherit',
                padding: '2px',
                background:
                  'linear-gradient(90deg, #FFD700, #FFA500, #FFD700, #FFF8DC, #FFD700)',
                backgroundSize: '200% 100%',
                animation: `${shimmer} 3s linear infinite`,
                WebkitMask:
                  'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude',
                pointerEvents: 'none',
              },
            }),
        }}
      >
        {/* Rarity chip */}
        <Chip
          label={rarity}
          size="small"
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            bgcolor: `${RARITY_COLORS[rarity]}20`,
            color: RARITY_COLORS[rarity],
            fontSize: '0.65rem',
            fontWeight: 600,
            textTransform: 'capitalize',
            border: `1px solid ${RARITY_COLORS[rarity]}40`,
          }}
        />

        {/* Icon container */}
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 1.5,
            background: isUnlocked
              ? `linear-gradient(135deg, ${RARITY_COLORS[rarity]}20 0%, ${RARITY_COLORS[rarity]}10 100%)`
              : 'rgba(255,255,255,0.05)',
            border: isUnlocked
              ? `2px solid ${RARITY_COLORS[rarity]}40`
              : '2px solid rgba(255,255,255,0.1)',
            animation:
              isHovered && isUnlocked
                ? `${pulse} 1s ease-in-out infinite`
                : 'none',
            transition: 'all 0.3s ease',
          }}
        >
          {isUnlocked ? (
            <Box sx={{fontSize: 36, lineHeight: 1}}>
              {achievement.icon_url || (
                <EmojiEventsIcon
                  sx={{fontSize: 36, color: RARITY_COLORS[rarity]}}
                />
              )}
            </Box>
          ) : (
            <LockIcon sx={{fontSize: 32, color: 'rgba(255,255,255,0.3)'}} />
          )}
        </Box>

        {/* Achievement name */}
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 700,
            color: isUnlocked ? '#fff' : 'rgba(255,255,255,0.5)',
            mb: 0.5,
            transition: 'color 0.3s ease',
            ...(isHovered &&
              isUnlocked && {
                color: RARITY_COLORS[rarity],
              }),
          }}
        >
          {achievement.name}
        </Typography>

        {/* Description */}
        <Typography
          variant="caption"
          sx={{
            color: 'rgba(255,255,255,0.4)',
            display: 'block',
            lineHeight: 1.4,
            minHeight: 32,
          }}
        >
          {achievement.description}
        </Typography>
      </Box>
    </Grow>
  );
}

export default function AchievementsPage() {
  const {currentUser} = useSocial();
  const [allAchievements, setAll] = useState([]);
  const [userAchievements, setUser] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    Promise.all([
      achievementsApi.list().catch(() => ({data: []})),
      currentUser
        ? achievementsApi.getForUser(currentUser.id).catch(() => ({data: []}))
        : Promise.resolve({data: []}),
    ]).then(([all, user]) => {
      setAll(all.data || []);
      setUser(user.data || []);
      setLoading(false);
    });
  }, [currentUser]);

  if (loading) return <AchievementsSkeleton />;

  const unlockedIds = new Set(
    userAchievements.map((a) => a.achievement_id || a.id)
  );
  const filtered =
    tab === 0
      ? allAchievements
      : tab === 1
        ? allAchievements.filter((a) => unlockedIds.has(a.id))
        : allAchievements.filter((a) => !unlockedIds.has(a.id));

  return (
    <Fade in={true} timeout={400}>
      <Box>
        {/* Page header */}
        <Box sx={{mb: 3}}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              background:
                'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 1,
            }}
          >
            Achievements
          </Typography>
          <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
            Collect badges and showcase your accomplishments
          </Typography>
        </Box>

        {/* Tabs */}
        <Tabs
          value={tab}
          onChange={(e, v) => setTab(v)}
          sx={{
            mb: 3,
            '& .MuiTab-root': {
              color: 'rgba(255,255,255,0.5)',
              fontWeight: 600,
              transition: 'color 0.3s ease',
              '&.Mui-selected': {
                color: '#6C63FF',
              },
            },
            '& .MuiTabs-indicator': {
              background: 'linear-gradient(90deg, #6C63FF 0%, #FF6B6B 100%)',
              height: 3,
              borderRadius: 1.5,
            },
          }}
        >
          <Tab label={`All (${allAchievements.length})`} />
          <Tab label={`Earned (${unlockedIds.size})`} />
          <Tab
            label={`Locked (${allAchievements.length - unlockedIds.size})`}
          />
        </Tabs>

        {/* Achievements grid */}
        {filtered.length === 0 ? (
          <Box sx={{textAlign: 'center', py: 8}}>
            <EmojiEventsIcon
              sx={{fontSize: 64, color: 'rgba(255,255,255,0.2)', mb: 2}}
            />
            <Typography variant="body1" sx={{color: 'rgba(255,255,255,0.5)'}}>
              {tab === 1
                ? 'No achievements earned yet. Keep playing!'
                : 'No achievements found.'}
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {filtered.map((a, index) => (
              <Grid item xs={6} sm={4} md={3} key={a.id}>
                <AchievementCard
                  achievement={a}
                  isUnlocked={unlockedIds.has(a.id)}
                  index={index}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Fade>
  );
}
