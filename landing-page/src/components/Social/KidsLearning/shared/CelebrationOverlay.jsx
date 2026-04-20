import {useReducedMotion} from '../../../../hooks/useAnimations';
import {kidsColors} from '../data/kidsTheme';

import StarIcon from '@mui/icons-material/Star';
import {Box, Typography, Fade} from '@mui/material';
import React, {useEffect, useState, useMemo} from 'react';


/**
 * CelebrationOverlay
 *
 * Fullscreen animated overlay triggered on correct answers, streaks,
 * game completion, and perfect scores. Uses pure CSS animations only.
 * Non-blocking: pointerEvents: 'none' so the game remains interactive.
 *
 * Props:
 *  - type: 'correct' | 'streak' | 'perfect' | 'complete'
 *  - streakCount: number (displayed for streak type)
 *  - visible: boolean
 *  - onDone: () => void (called when animation finishes)
 *  - starsEarned: number (1-3, used for 'complete' type)
 *  - score: { correct: number, total: number } (used for 'complete' type)
 */

/* ---- Colour palette for particles ---- */
const PARTICLE_COLORS = [
  '#FFD700',
  '#FF6B6B',
  '#6C63FF',
  '#2ECC71',
  '#FF9F43',
  '#00D2D3',
  '#FF6B81',
  '#A29BFE',
];

/* ---- Duration map per type (ms) ---- */
const DURATION_MAP = {
  correct: 800,
  streak: 1200,
  perfect: 2000,
  complete: 2500,
};

/* ---- CSS keyframes injected once ---- */
const CELEBRATION_ANIM_ID = 'kids-celebration-keyframes';
function ensureCelebrationKeyframes() {
  if (document.getElementById(CELEBRATION_ANIM_ID)) return;
  const style = document.createElement('style');
  style.id = CELEBRATION_ANIM_ID;
  style.textContent = `
    @keyframes celebBurstOut {
      0%   { transform: translate(0, 0) scale(0); opacity: 1; }
      60%  { opacity: 1; }
      100% { transform: translate(var(--dx), var(--dy)) scale(1); opacity: 0; }
    }
    @keyframes celebStarFloat {
      0%   { transform: translateY(0) rotate(0deg) scale(0); opacity: 0; }
      15%  { opacity: 1; transform: translateY(-20px) rotate(15deg) scale(1.1); }
      100% { transform: translateY(var(--floatY)) rotate(var(--floatRot)) scale(0.4); opacity: 0; }
    }
    @keyframes celebBounceIn {
      0%   { transform: scale(0); opacity: 0; }
      50%  { transform: scale(1.35); }
      70%  { transform: scale(0.9); }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes celebConfettiFall {
      0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
      80%  { opacity: 1; }
      100% { transform: translateY(var(--fallDist)) rotate(var(--fallRot)); opacity: 0; }
    }
    @keyframes celebPulseGlow {
      0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.4)); }
      50%      { transform: scale(1.15); filter: drop-shadow(0 0 20px rgba(255, 215, 0, 0.8)); }
    }
    @keyframes celebRainbowFlash {
      0%   { opacity: 0; }
      10%  { opacity: 0.3; }
      50%  { opacity: 0.15; }
      100% { opacity: 0; }
    }
    @keyframes celebStarReveal {
      0%   { transform: scale(0) rotate(-45deg); opacity: 0; }
      60%  { transform: scale(1.3) rotate(10deg); opacity: 1; }
      100% { transform: scale(1) rotate(0deg); opacity: 1; }
    }
    @keyframes celebScoreCount {
      0%   { transform: scale(0.5); opacity: 0; }
      60%  { transform: scale(1.1); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes celebTextBounce {
      0%   { transform: translateY(20px) scale(0.8); opacity: 0; }
      50%  { transform: translateY(-5px) scale(1.05); }
      100% { transform: translateY(0) scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

/* ---- Random helpers ---- */
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function pickColor() {
  return PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
}

/* ---- Particle generators ---- */

function generateBurstParticles(count = 8) {
  return Array.from({length: count}, (_, i) => {
    const angle = (i / count) * 360 + rand(-15, 15);
    const dist = rand(60, 130);
    const rad = (angle * Math.PI) / 180;
    return {
      id: i,
      color: pickColor(),
      size: rand(10, 18),
      dx: Math.cos(rad) * dist,
      dy: Math.sin(rad) * dist,
      delay: rand(0, 0.08),
    };
  });
}

function generateStarParticles(streakCount = 3) {
  const count = Math.min(Math.max(streakCount * 2, 6), 16);
  return Array.from({length: count}, (_, i) => ({
    id: i,
    left: rand(10, 90),
    floatY: rand(-250, -400),
    floatRot: rand(90, 360),
    delay: rand(0, 0.5),
    size: rand(16, 28),
    color: pickColor(),
  }));
}

function generateConfettiParticles(count = 24) {
  return Array.from({length: count}, (_, i) => ({
    id: i,
    left: rand(5, 95),
    top: rand(-5, 15),
    width: rand(6, 12),
    height: rand(10, 20),
    color: pickColor(),
    fallDist: rand(300, 600),
    fallRot: rand(360, 720) * (Math.random() > 0.5 ? 1 : -1),
    delay: rand(0, 0.6),
  }));
}

/* ============================================================
 * Sub-renderers for each celebration type
 * ============================================================ */

/** 'correct' — Quick burst of colored circles expanding outward from center */
function CorrectBurst({particles, reducedMotion}) {
  if (reducedMotion) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <Typography
          sx={{fontSize: 48, fontWeight: 800, color: kidsColors.success}}
        >
          ✓
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {particles.map((p) => (
        <Box
          key={p.id}
          sx={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            bgcolor: p.color,
            top: '50%',
            left: '50%',
            marginTop: `-${p.size / 2}px`,
            marginLeft: `-${p.size / 2}px`,
            '--dx': `${p.dx}px`,
            '--dy': `${p.dy}px`,
            animation: `celebBurstOut 0.65s ${p.delay}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
            opacity: 0,
          }}
        />
      ))}
    </Box>
  );
}

/** 'streak' — Stars float up, streak count shown large with bounce */
function StreakCelebration({particles, streakCount, reducedMotion}) {
  return (
    <>
      {/* Floating stars */}
      {!reducedMotion &&
        particles.map((p) => (
          <Box
            key={p.id}
            sx={{
              position: 'absolute',
              left: `${p.left}%`,
              bottom: 0,
              fontSize: p.size,
              '--floatY': `${p.floatY}px`,
              '--floatRot': `${p.floatRot}deg`,
              animation: `celebStarFloat 1s ${p.delay}s ease-out forwards`,
              opacity: 0,
              pointerEvents: 'none',
            }}
          >
            ⭐
          </Box>
        ))}

      {/* Center streak count */}
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          animation: reducedMotion
            ? 'none'
            : 'celebBounceIn 0.5s 0.1s ease-out both',
        }}
      >
        <Typography
          sx={{
            fontSize: 64,
            fontWeight: 900,
            color: '#FFD700',
            lineHeight: 1,
            textShadow:
              '0 4px 16px rgba(255, 215, 0, 0.5), 0 2px 4px rgba(0,0,0,0.15)',
          }}
        >
          {streakCount}
        </Typography>
        <Typography
          sx={{
            fontSize: 18,
            fontWeight: 700,
            color: '#FF9F43',
            textShadow: '0 2px 8px rgba(0,0,0,0.1)',
            mt: 0.5,
          }}
        >
          🔥 Streak!
        </Typography>
      </Box>
    </>
  );
}

/** 'perfect' — Full confetti explosion, gold star pulsing, rainbow flash */
function PerfectCelebration({confetti, reducedMotion}) {
  return (
    <>
      {/* Rainbow gradient flash */}
      {!reducedMotion && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(135deg, rgba(255,0,0,0.15), rgba(255,165,0,0.15), rgba(255,255,0,0.15), rgba(0,128,0,0.15), rgba(0,0,255,0.15), rgba(128,0,128,0.15))',
            animation: 'celebRainbowFlash 2s ease-out forwards',
          }}
        />
      )}

      {/* Confetti rectangles */}
      {!reducedMotion &&
        confetti.map((c) => (
          <Box
            key={c.id}
            sx={{
              position: 'absolute',
              left: `${c.left}%`,
              top: `${c.top}%`,
              width: c.width,
              height: c.height,
              bgcolor: c.color,
              borderRadius: '2px',
              '--fallDist': `${c.fallDist}px`,
              '--fallRot': `${c.fallRot}deg`,
              animation: `celebConfettiFall 1.8s ${c.delay}s ease-in forwards`,
              opacity: 0,
            }}
          />
        ))}

      {/* Pulsing gold star in center */}
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <StarIcon
          sx={{
            fontSize: 80,
            color: '#FFD700',
            animation: reducedMotion
              ? 'none'
              : 'celebPulseGlow 0.8s ease-in-out 3',
            filter: 'drop-shadow(0 0 12px rgba(255, 215, 0, 0.6))',
          }}
        />
        <Typography
          sx={{
            fontSize: 20,
            fontWeight: 800,
            color: '#FFD700',
            textShadow: '0 2px 8px rgba(0,0,0,0.15)',
            mt: 1,
            animation: reducedMotion
              ? 'none'
              : 'celebBounceIn 0.5s 0.3s ease-out both',
          }}
        >
          Perfect!
        </Typography>
      </Box>
    </>
  );
}

/** 'complete' — Stars animate in one by one, score shown below, "Well done!" text */
function CompleteCelebration({starsEarned, score, reducedMotion}) {
  const stars = Math.min(Math.max(starsEarned || 0, 0), 3);
  const scoreText = score ? `${score.correct}/${score.total}` : '';

  return (
    <Box
      sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Stars row */}
      <Box sx={{display: 'flex', gap: 1.5, mb: 2}}>
        {[1, 2, 3].map((s) => (
          <StarIcon
            key={s}
            sx={{
              fontSize: 56,
              color: s <= stars ? '#FFD700' : kidsColors.starEmpty,
              filter:
                s <= stars
                  ? 'drop-shadow(0 0 10px rgba(255, 215, 0, 0.6))'
                  : 'none',
              animation:
                s <= stars && !reducedMotion
                  ? `celebStarReveal 0.5s ${0.2 + s * 0.25}s ease-out both`
                  : 'none',
              opacity: s <= stars && !reducedMotion ? 0 : 1,
            }}
          />
        ))}
      </Box>

      {/* Score as big number */}
      {scoreText && (
        <Typography
          sx={{
            fontSize: 42,
            fontWeight: 900,
            color: kidsColors.primary,
            lineHeight: 1,
            textShadow: '0 2px 12px rgba(108, 99, 255, 0.3)',
            animation: reducedMotion
              ? 'none'
              : 'celebScoreCount 0.5s 1s ease-out both',
            opacity: reducedMotion ? 1 : 0,
          }}
        >
          {scoreText}
        </Typography>
      )}

      {/* "Well done!" text */}
      <Typography
        sx={{
          fontSize: 24,
          fontWeight: 800,
          color: kidsColors.success,
          mt: 1.5,
          textShadow: '0 2px 8px rgba(6, 214, 160, 0.3)',
          animation: reducedMotion
            ? 'none'
            : 'celebTextBounce 0.6s 1.4s ease-out both',
          opacity: reducedMotion ? 1 : 0,
        }}
      >
        Well done!
      </Typography>
    </Box>
  );
}

/* ============================================================
 * Main Component
 * ============================================================ */

const CelebrationOverlay = React.memo(function CelebrationOverlay({
  type = 'correct',
  streakCount = 0,
  visible = false,
  onDone,
  starsEarned = 0,
  score = null,
}) {
  const [show, setShow] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    ensureCelebrationKeyframes();
  }, []);

  // Generate particles once per visibility change via useMemo keyed on visible+type
  const burstParticles = useMemo(
    () => (type === 'correct' && visible ? generateBurstParticles(8) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, type]
  );

  const starParticles = useMemo(
    () =>
      type === 'streak' && visible ? generateStarParticles(streakCount) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, type, streakCount]
  );

  const confettiParticles = useMemo(
    () => (type === 'perfect' && visible ? generateConfettiParticles(24) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, type]
  );

  // Show/hide with auto-dismiss
  useEffect(() => {
    if (!visible) {
      setShow(false);
      return;
    }

    setShow(true);
    const duration = DURATION_MAP[type] || 1000;

    const timer = setTimeout(() => {
      setShow(false);
      if (onDone) onDone();
    }, duration);

    return () => clearTimeout(timer);
  }, [visible, type, onDone]);

  if (!visible && !show) return null;

  return (
    <Fade in={show} timeout={{enter: 150, exit: 250}}>
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 1600,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        {type === 'correct' && (
          <CorrectBurst
            particles={burstParticles}
            reducedMotion={reducedMotion}
          />
        )}

        {type === 'streak' && (
          <StreakCelebration
            particles={starParticles}
            streakCount={streakCount}
            reducedMotion={reducedMotion}
          />
        )}

        {type === 'perfect' && (
          <PerfectCelebration
            confetti={confettiParticles}
            reducedMotion={reducedMotion}
          />
        )}

        {type === 'complete' && (
          <CompleteCelebration
            starsEarned={starsEarned}
            score={score}
            reducedMotion={reducedMotion}
          />
        )}
      </Box>
    </Fade>
  );
});

export default CelebrationOverlay;
