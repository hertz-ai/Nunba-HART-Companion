import {GameSounds} from './SoundManager';

import {useReducedMotion} from '../../../../hooks/useAnimations';
import {logger} from '../../../../utils/logger';
import kidsLearningStore from '../data/kidsLearningStore';
import {kidsColors, kidsRadius, kidsShadows} from '../data/kidsTheme';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import ReplayIcon from '@mui/icons-material/Replay';
import ShareIcon from '@mui/icons-material/Share';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import {
  Box,
  Typography,
  IconButton,
  LinearProgress,
  Button,
  Fade,
} from '@mui/material';
import React, {useState, useCallback, useEffect} from 'react';
import {useNavigate} from 'react-router-dom';

/* ---- CSS keyframes injected once ---- */
const SHELL_ANIM_ID = 'kids-shell-keyframes';
function ensureShellKeyframes() {
  if (document.getElementById(SHELL_ANIM_ID)) return;
  const style = document.createElement('style');
  style.id = SHELL_ANIM_ID;
  style.textContent = `
    @keyframes kidsStarBurst {
      0%   { transform: scale(0) rotate(-30deg); opacity: 0; }
      60%  { transform: scale(1.3) rotate(10deg); opacity: 1; }
      100% { transform: scale(1) rotate(0deg); opacity: 1; }
    }
    @keyframes kidsFirePulse {
      0%, 100% { transform: scale(1); }
      50%      { transform: scale(1.25); }
    }
    @keyframes kidsConfettiFall {
      0%   { transform: translateY(-10px) rotate(0deg); opacity: 1; }
      100% { transform: translateY(40px) rotate(360deg); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

/**
 * GameShell
 *
 * Wraps every game with a consistent chrome:
 *  - Header (back, title, mute, streak)
 *  - Progress bar / dots
 *  - Game-complete overlay (score, stars, replay, share)
 *  - Lifecycle phases: intro -> playing -> complete
 *
 * Props:
 *  - config: game config object from gameConfigs
 *  - currentStep: number (0-based index of current question)
 *  - totalSteps: number
 *  - score: { correct: number, total: number }
 *  - phase: 'intro' | 'playing' | 'complete'
 *  - onBack: () => void
 *  - onReplay: () => void
 *  - streak: number (from store)
 *  - children: the game template content
 */
export default function GameShell({
  config,
  currentStep = 0,
  totalSteps = 10,
  score = {correct: 0, total: 0},
  phase = 'playing',
  onBack,
  onReplay,
  onStart,
  streak = 0,
  children,
}) {
  const navigate = useNavigate();
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    ensureShellKeyframes();
    // Play intro sound when shell mounts
    if (phase === 'intro') {
      try {
        GameSounds.intro();
      } catch (err) {
        logger.error(err);
      }
      // TTS: read game title on intro
      if (config?.title) {
        try {
          GameSounds.speakText(config.title);
        } catch (err) {
          logger.error(err);
        }
      }
    }
    // Cleanup audio on unmount
    return () => {
      try {
        GameSounds.stopBackgroundMusic({fadeOut: 0.5});
        GameSounds.stopTTS();
        GameSounds.cleanup();
      } catch (err) {
        logger.error(err);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync mute state
  useEffect(() => {
    try {
      GameSounds.setMuted(muted);
    } catch (err) {
      logger.error(err);
    }
  }, [muted]);

  // Play complete sound when phase changes to complete
  useEffect(() => {
    if (phase === 'complete') {
      try {
        GameSounds.stopBackgroundMusic({fadeOut: 0.8});
        const isPerfect = score.total > 0 && score.correct / score.total >= 0.9;
        GameSounds.complete(isPerfect);
        // TTS: read score
        const msg = isPerfect
          ? `Amazing! You got ${score.correct} out of ${score.total} correct!`
          : `You scored ${score.correct} out of ${score.total}. Good try!`;
        setTimeout(() => {
          try {
            GameSounds.speakText(msg);
          } catch (err) {
            logger.error(err);
          }
        }, 800);
      } catch (err) {
        logger.error(err);
      }
    }
  }, [phase, score]);

  const handleBack = useCallback(() => {
    if (onBack) return onBack();
    navigate('/social/kids');
  }, [onBack, navigate]);

  const handleReplay = useCallback(() => {
    if (onReplay) onReplay();
  }, [onReplay]);

  const handleShare = useCallback(() => {
    const text = `I scored ${score.correct}/${score.total} on ${config?.title || 'a game'} in Hevolve Kids Learning Zone!`;
    if (navigator.share) {
      navigator.share({title: 'Hevolve Kids', text}).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text);
    }
  }, [score, config]);

  const progressPct = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
  const earnedStars =
    score.total > 0
      ? score.correct / score.total >= 0.9
        ? 3
        : score.correct / score.total >= 0.7
          ? 2
          : score.correct / score.total >= 0.4
            ? 1
            : 0
      : 0;

  /* ---------- INTRO PHASE ---------- */
  if (phase === 'intro') {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: kidsColors.bgGradient,
          p: 3,
          textAlign: 'center',
        }}
      >
        <Typography sx={{fontSize: 80, mb: 2}}>
          {config?.emoji || '🎮'}
        </Typography>
        <Typography
          variant="h4"
          sx={{fontWeight: 800, color: kidsColors.textPrimary, mb: 1}}
        >
          {config?.title || 'Game'}
        </Typography>
        <Typography
          variant="body1"
          sx={{color: kidsColors.textSecondary, mb: 3, maxWidth: 360}}
        >
          {config?.description || 'Get ready to play!'}
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => {
            if (onStart) onStart();
          }}
          sx={{
            bgcolor: kidsColors.primary,
            borderRadius: kidsRadius.pill,
            px: 5,
            py: 1.5,
            fontWeight: 700,
            fontSize: '1.1rem',
            textTransform: 'none',
            boxShadow: kidsShadows.fab,
            '&:hover': {bgcolor: kidsColors.primaryLight},
          }}
        >
          Let's Go!
        </Button>
      </Box>
    );
  }

  /* ---------- COMPLETE PHASE ---------- */
  if (phase === 'complete') {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: kidsColors.bgGradient,
          p: 3,
          textAlign: 'center',
        }}
      >
        {/* Stars */}
        <Box sx={{display: 'flex', gap: 1, mb: 2}}>
          {[1, 2, 3].map((s) =>
            s <= earnedStars ? (
              <StarIcon
                key={s}
                sx={{
                  fontSize: 56,
                  color: kidsColors.starFilled,
                  animation: `kidsStarBurst 0.5s ${s * 0.15}s ease-out both`,
                }}
              />
            ) : (
              <StarBorderIcon
                key={s}
                sx={{fontSize: 56, color: kidsColors.starEmpty}}
              />
            )
          )}
        </Box>

        <Typography
          variant="h4"
          sx={{fontWeight: 800, color: kidsColors.textPrimary, mb: 0.5}}
        >
          {earnedStars === 3
            ? 'Amazing!'
            : earnedStars === 2
              ? 'Great Job!'
              : earnedStars === 1
                ? 'Good Try!'
                : 'Keep Practicing!'}
        </Typography>

        <Typography
          variant="h5"
          sx={{color: kidsColors.primary, fontWeight: 700, mb: 3}}
        >
          {score.correct} / {score.total} correct
        </Typography>

        {streak >= 2 && (
          <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5, mb: 2}}>
            <LocalFireDepartmentIcon
              sx={{
                color: '#FF6B35',
                fontSize: 28,
                animation: 'kidsFirePulse 0.8s ease-in-out infinite',
              }}
            />
            <Typography
              variant="body1"
              sx={{fontWeight: 700, color: '#FF6B35'}}
            >
              {streak} game streak!
            </Typography>
          </Box>
        )}

        <Box sx={{display: 'flex', gap: 2}}>
          <Button
            variant="contained"
            startIcon={<ReplayIcon />}
            onClick={handleReplay}
            sx={{
              bgcolor: kidsColors.primary,
              borderRadius: kidsRadius.pill,
              px: 3,
              py: 1,
              fontWeight: 600,
              textTransform: 'none',
              '&:hover': {bgcolor: kidsColors.primaryLight},
            }}
          >
            Play Again
          </Button>
          <Button
            variant="outlined"
            startIcon={<ShareIcon />}
            onClick={handleShare}
            sx={{
              borderColor: kidsColors.primary,
              color: kidsColors.primary,
              borderRadius: kidsRadius.pill,
              px: 3,
              py: 1,
              fontWeight: 600,
              textTransform: 'none',
            }}
          >
            Share
          </Button>
        </Box>

        <Button
          onClick={handleBack}
          sx={{mt: 3, color: kidsColors.textSecondary, textTransform: 'none'}}
        >
          Back to Hub
        </Button>
      </Box>
    );
  }

  /* ---------- PLAYING PHASE ---------- */
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: kidsColors.bgGradient,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 1.5,
          bgcolor: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(108,99,255,0.08)',
        }}
      >
        <IconButton onClick={handleBack} sx={{color: kidsColors.textPrimary}}>
          <ArrowBackIcon />
        </IconButton>

        <Box sx={{flex: 1, mx: 1.5}}>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 700,
              color: kidsColors.textPrimary,
              lineHeight: 1.2,
              fontSize: '1.1rem',
            }}
          >
            {config?.title || 'Game'}
          </Typography>
          <Typography
            variant="caption"
            sx={{color: kidsColors.textSecondary, fontSize: '0.875rem'}}
          >
            {currentStep + 1} of {totalSteps}
          </Typography>
        </Box>

        {/* Streak badge */}
        {streak >= 2 && (
          <Box sx={{display: 'flex', alignItems: 'center', mr: 1}}>
            <LocalFireDepartmentIcon
              sx={{
                color: '#FF6B35',
                fontSize: 20,
                animation: 'kidsFirePulse 0.8s ease-in-out infinite',
              }}
            />
            <Typography
              variant="caption"
              sx={{fontWeight: 700, color: '#FF6B35'}}
            >
              {streak}
            </Typography>
          </Box>
        )}

        <IconButton
          onClick={() => setMuted((m) => !m)}
          sx={{color: kidsColors.textSecondary}}
        >
          {muted ? <VolumeOffIcon /> : <VolumeUpIcon />}
        </IconButton>
      </Box>

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={progressPct}
        sx={{
          height: 8,
          bgcolor: 'rgba(108,99,255,0.08)',
          '& .MuiLinearProgress-bar': {
            bgcolor: kidsColors.primary,
            borderRadius: '3px',
          },
        }}
      />

      {/* Game content */}
      <Box sx={{flex: 1, display: 'flex', flexDirection: 'column', p: 2}}>
        <Fade in timeout={300}>
          <Box sx={{flex: 1}}>{children}</Box>
        </Fade>
      </Box>
    </Box>
  );
}
