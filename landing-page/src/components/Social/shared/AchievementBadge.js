import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import LockIcon from '@mui/icons-material/Lock';
import {
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Chip,
  Box,
  Skeleton,
  Fade,
  Zoom,
  keyframes,
} from '@mui/material';
import React, {useState} from 'react';

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

// Pulse animation for unlocked achievements on hover
const pulse = keyframes`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
`;

// Card base style
const cardBaseStyle = {
  borderRadius: 3,
  overflow: 'hidden',
  position: 'relative',
  background:
    'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 26, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
};

// Skeleton loader for achievement badge
export function AchievementBadgeSkeleton() {
  return (
    <Card sx={cardBaseStyle}>
      <CardContent sx={{p: {xs: 1.5, md: 2}, textAlign: 'center'}}>
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
          width="70%"
          sx={{bgcolor: 'rgba(255,255,255,0.05)', mx: 'auto'}}
        />
        <Skeleton
          variant="text"
          width="90%"
          sx={{bgcolor: 'rgba(255,255,255,0.05)', mx: 'auto'}}
        />
      </CardContent>
    </Card>
  );
}

export default function AchievementBadge({
  achievement,
  onClick,
  loading = false,
}) {
  const [isHovered, setIsHovered] = useState(false);

  if (loading) return <AchievementBadgeSkeleton />;

  const {
    name,
    description,
    icon_url,
    rarity = 'common',
    category,
    unlocked,
    unlocked_at,
  } = achievement || {};

  const rarityColor = RARITY_COLORS[rarity] || RARITY_COLORS.common;
  const rarityGlow = RARITY_GLOW[rarity] || RARITY_GLOW.common;
  const isLegendary = rarity === 'legendary';

  return (
    <Zoom
      in={true}
      timeout={unlocked ? 500 : 400}
      style={{transitionDelay: unlocked ? '100ms' : '0ms'}}
    >
      <Card
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          ...cardBaseStyle,
          opacity: unlocked ? 1 : 0.6,
          filter: unlocked ? 'none' : 'grayscale(0.8)',
          transform:
            isHovered && unlocked
              ? 'translateY(-8px) scale(1.02)'
              : 'translateY(0)',
          boxShadow:
            isHovered && unlocked
              ? `0 20px 40px ${rarityGlow}, 0 0 30px ${rarityGlow}`
              : 'none',
          border:
            isHovered && unlocked
              ? `1px solid ${rarityColor}40`
              : '1px solid rgba(255,255,255,0.05)',
          // Shimmer border for legendary unlocked achievements
          ...(isLegendary &&
            unlocked && {
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
                zIndex: 0,
              },
            }),
        }}
      >
        <CardActionArea
          onClick={() => onClick && onClick(achievement)}
          disabled={!onClick}
        >
          <CardContent
            sx={{
              p: {xs: 1.5, md: 2},
              textAlign: 'center',
              position: 'relative',
              zIndex: 1,
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
                bgcolor: `${rarityColor}20`,
                color: rarityColor,
                fontSize: '0.65rem',
                height: 22,
                fontWeight: 600,
                textTransform: 'capitalize',
                border: `1px solid ${rarityColor}40`,
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
                background: unlocked
                  ? `linear-gradient(135deg, ${rarityColor}20 0%, ${rarityColor}10 100%)`
                  : 'rgba(255,255,255,0.05)',
                border: unlocked
                  ? `2px solid ${rarityColor}40`
                  : '2px solid rgba(255,255,255,0.1)',
                animation:
                  isHovered && unlocked
                    ? `${pulse} 1s ease-in-out infinite`
                    : 'none',
                transition: 'all 0.3s ease',
              }}
            >
              {unlocked ? (
                <Box sx={{fontSize: 36, lineHeight: 1}}>
                  {icon_url || (
                    <EmojiEventsIcon sx={{fontSize: 36, color: rarityColor}} />
                  )}
                </Box>
              ) : (
                <LockIcon sx={{fontSize: 32, color: 'rgba(255,255,255,0.3)'}} />
              )}
            </Box>

            {/* Name */}
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 700,
                mb: 0.5,
                color: unlocked ? '#fff' : 'rgba(255,255,255,0.5)',
                transition: 'color 0.3s ease',
                ...(isHovered &&
                  unlocked && {
                    color: rarityColor,
                  }),
              }}
            >
              {name}
            </Typography>

            {/* Description */}
            {description && (
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mb: 1,
                  color: 'rgba(255,255,255,0.4)',
                  lineHeight: 1.4,
                }}
              >
                {description}
              </Typography>
            )}

            {/* Category */}
            {category && (
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mb: 0.5,
                  color: 'rgba(255,255,255,0.3)',
                  textTransform: 'uppercase',
                  fontSize: '0.6rem',
                  letterSpacing: '0.5px',
                }}
              >
                {category}
              </Typography>
            )}

            {/* Unlock date */}
            {unlocked && unlocked_at && (
              <Typography
                variant="caption"
                sx={{
                  color: 'rgba(255,255,255,0.5)',
                  display: 'block',
                  mt: 0.5,
                }}
              >
                Unlocked {new Date(unlocked_at).toLocaleDateString()}
              </Typography>
            )}
          </CardContent>
        </CardActionArea>
      </Card>
    </Zoom>
  );
}
