import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import {Snackbar, Box, Typography} from '@mui/material';
import React from 'react';

const confettiKeyframes = `
@keyframes confetti-fall {
  0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(60px) rotate(360deg); opacity: 0; }
}
`;

const CONFETTI_COLORS = [
  '#FFD700',
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
];

function ConfettiDots() {
  return (
    <>
      {CONFETTI_COLORS.map((color, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: color,
            top: -4,
            left: `${10 + i * 16}%`,
            animation: `confetti-fall ${1.2 + i * 0.3}s ease-out ${i * 0.15}s forwards`,
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  );
}

export default function AchievementToast({achievement, open, onClose}) {
  if (!achievement) return null;

  return (
    <>
      <style>{confettiKeyframes}</style>
      <Snackbar
        open={open}
        onClose={onClose}
        autoHideDuration={5000}
        anchorOrigin={{vertical: 'top', horizontal: 'center'}}
      >
        <Box
          sx={{
            position: 'relative',
            overflow: 'visible',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: {xs: 2, md: 3},
            py: {xs: 1.5, md: 2},
            borderRadius: 3,
            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
            color: '#fff',
            boxShadow: '0 8px 32px rgba(255, 165, 0, 0.4)',
            minWidth: 280,
          }}
        >
          {open && <ConfettiDots />}

          <Box sx={{fontSize: 36, lineHeight: 1, flexShrink: 0}}>
            {achievement.icon_url || <EmojiEventsIcon sx={{fontSize: 36}} />}
          </Box>

          <Box>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: 1,
                display: 'block',
              }}
            >
              Achievement Unlocked!
            </Typography>
            <Typography variant="subtitle2" sx={{fontWeight: 700}}>
              {achievement.name}
            </Typography>
          </Box>
        </Box>
      </Snackbar>
    </>
  );
}
