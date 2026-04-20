import {useReducedMotion} from '../../../../hooks/useAnimations';
import {kidsColors} from '../data/kidsTheme';

import StarIcon from '@mui/icons-material/Star';
import {Box, Typography} from '@mui/material';
import React, {useEffect, useMemo, useRef} from 'react';


/**
 * ProgressStars
 *
 * Visual mastery indicator showing progress as filling stars,
 * replacing verbose text with visual feedback.
 *
 * 3-star scoring thresholds:
 *   - Star 1: 40%+
 *   - Star 2: 70%+
 *   - Star 3: 90%+
 *
 * Props:
 *  - current: number (questions answered correctly)
 *  - total: number (total questions)
 *  - streak: number (current streak)
 *  - showStreak: boolean (show streak badge when streak >= 3)
 *  - totalQuestions: number (total question count for dot indicators, defaults to total)
 *  - answeredCount: number (how many answered so far, defaults to current)
 */

/* ---- CSS keyframes injected once ---- */
const PROGRESS_ANIM_ID = 'kids-progress-stars-keyframes';
function ensureProgressKeyframes() {
  if (document.getElementById(PROGRESS_ANIM_ID)) return;
  const style = document.createElement('style');
  style.id = PROGRESS_ANIM_ID;
  style.textContent = `
    @keyframes progressStarPop {
      0%   { transform: scale(1); }
      40%  { transform: scale(1.25); }
      70%  { transform: scale(0.95); }
      100% { transform: scale(1); }
    }
    @keyframes progressStreakPulse {
      0%, 100% { transform: scale(1); box-shadow: 0 2px 8px rgba(255, 107, 53, 0.3); }
      50%      { transform: scale(1.08); box-shadow: 0 2px 12px rgba(255, 107, 53, 0.5); }
    }
    @keyframes progressStreakEnter {
      0%   { transform: scale(0) rotate(-10deg); opacity: 0; }
      60%  { transform: scale(1.15) rotate(5deg); opacity: 1; }
      100% { transform: scale(1) rotate(0deg); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

/* ---- Star fill thresholds ---- */
const STAR_THRESHOLDS = [0.4, 0.7, 0.9];

/**
 * Computes how "filled" each of the 3 stars should be (0 to 1).
 *
 * Between thresholds the star partially fills. For example at 55%:
 *   - Star 1 fully filled (passed 40%)
 *   - Star 2 at (0.55 - 0.40) / (0.70 - 0.40) = 50% filled
 *   - Star 3 empty
 */
function computeStarFills(pct) {
  return STAR_THRESHOLDS.map((threshold, i) => {
    const prevThreshold = i === 0 ? 0 : STAR_THRESHOLDS[i - 1];

    if (pct >= threshold) return 1; // fully filled
    if (pct <= prevThreshold) return 0; // empty

    // Partial fill: how far between previous threshold and this one
    const range = threshold - prevThreshold;
    return range > 0 ? (pct - prevThreshold) / range : 0;
  });
}

/* ---- Single Star with partial fill ---- */
function ProgressStar({fillFraction, index, animate, reducedMotion}) {
  // Clip from right: inset(top right bottom left)
  // fillFraction 0 = fully clipped, 1 = fully visible
  const clipRight = (1 - fillFraction) * 100;
  const isFull = fillFraction >= 1;
  const isEmpty = fillFraction <= 0;

  return (
    <Box sx={{position: 'relative', width: 36, height: 36}}>
      {/* Background: empty gray star */}
      <StarIcon
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          fontSize: 36,
          color: kidsColors.starEmpty,
        }}
      />

      {/* Foreground: gold star with clip-path for partial fill */}
      {!isEmpty && (
        <StarIcon
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            fontSize: 36,
            color: '#FFD700',
            filter: isFull
              ? 'drop-shadow(0 0 4px rgba(255, 215, 0, 0.5))'
              : 'none',
            clipPath: `inset(0 ${clipRight}% 0 0)`,
            animation:
              isFull && animate && !reducedMotion
                ? `progressStarPop 0.4s ${index * 0.12}s ease-out`
                : 'none',
          }}
        />
      )}
    </Box>
  );
}

/* ---- Dot indicator for question progress ---- */
function DotIndicator({total, answered}) {
  // Cap dots at 20 for visual clarity; group if more
  const maxDots = 20;
  const displayTotal = Math.min(total, maxDots);
  const displayAnswered =
    total > maxDots
      ? Math.round((answered / total) * maxDots)
      : Math.min(answered, total);

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        gap: '4px',
        flexWrap: 'wrap',
        maxWidth: 200,
      }}
    >
      {Array.from({length: displayTotal}, (_, i) => (
        <Box
          key={i}
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: i < displayAnswered ? kidsColors.primary : 'transparent',
            border:
              i < displayAnswered
                ? `2px solid ${kidsColors.primary}`
                : `2px solid ${kidsColors.starEmpty}`,
            transition: 'background-color 0.25s ease, border-color 0.25s ease',
          }}
        />
      ))}
    </Box>
  );
}

/* ============================================================
 * Main Component
 * ============================================================ */

const ProgressStars = React.memo(function ProgressStars({
  current = 0,
  total = 10,
  streak = 0,
  showStreak = true,
  totalQuestions,
  answeredCount,
}) {
  const reducedMotion = useReducedMotion();
  const prevPctRef = useRef(0);

  useEffect(() => {
    ensureProgressKeyframes();
  }, []);

  const pct = total > 0 ? current / total : 0;
  const starFills = useMemo(() => computeStarFills(pct), [pct]);

  // Detect if percentage increased (to trigger pop animation)
  const didIncrease = pct > prevPctRef.current;
  useEffect(() => {
    prevPctRef.current = pct;
  }, [pct]);

  // Dots: how many questions in total, how many answered
  const dotTotal = totalQuestions ?? total;
  const dotAnswered = answeredCount ?? current;

  const showStreakBadge = showStreak && streak >= 3;

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        height: 60,
        justifyContent: 'center',
        userSelect: 'none',
      }}
    >
      {/* Stars row */}
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
        {starFills.map((fill, i) => (
          <ProgressStar
            key={i}
            fillFraction={fill}
            index={i}
            animate={didIncrease}
            reducedMotion={reducedMotion}
          />
        ))}

        {/* Streak badge: fire + count, positioned to the right of stars */}
        {showStreakBadge && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              bgcolor: 'rgba(255, 107, 53, 0.15)',
              border: '1px solid rgba(255, 107, 53, 0.3)',
              borderRadius: '12px',
              px: 1,
              py: 0.25,
              ml: 0.5,
              animation: reducedMotion
                ? 'none'
                : `progressStreakEnter 0.35s ease-out, progressStreakPulse 1.5s 0.4s ease-in-out infinite`,
            }}
          >
            <Typography sx={{fontSize: 14, lineHeight: 1}}>🔥</Typography>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 800,
                color: '#FF6B35',
                lineHeight: 1,
              }}
            >
              {streak}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Dot indicators */}
      <DotIndicator total={dotTotal} answered={dotAnswered} />
    </Box>
  );
});

export default ProgressStars;
