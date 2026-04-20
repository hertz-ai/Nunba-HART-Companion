import {GameSounds} from './SoundManager';

import {useReducedMotion} from '../../../../hooks/useAnimations';
import {kidsColors} from '../data/kidsTheme';

import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import {Box, Typography} from '@mui/material';
import React, {useEffect, useState} from 'react';

/**
 * FeedbackOverlay
 *
 * Displays a brief correct / incorrect animation overlay.
 * Auto-dismisses after `duration` ms (default 1200).
 *
 * Props:
 *  - isCorrect: boolean
 *  - message: string (optional custom text)
 *  - visible: boolean
 *  - onDismiss: () => void
 *  - duration: number (ms, default 1200)
 *  - enableSound: boolean (optional, default false)
 */

/* ---- CSS keyframes injected once ---- */
const ANIM_ID = 'kids-feedback-keyframes';
function ensureKeyframes() {
  if (document.getElementById(ANIM_ID)) return;
  const style = document.createElement('style');
  style.id = ANIM_ID;
  style.textContent = `
    @keyframes kidsFeedbackPop {
      0%   { transform: scale(0.3); opacity: 0; }
      50%  { transform: scale(1.15); opacity: 1; }
      70%  { transform: scale(0.95); }
      100% { transform: scale(1); opacity: 1; }
    }
    @keyframes kidsFeedbackFadeOut {
      0%   { opacity: 1; }
      100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

/* Sound helpers using SoundManager (replaces inline Web Audio playTone) */
function playFeedbackSound(isCorrect) {
  try {
    if (isCorrect) {
      GameSounds.correct();
    } else {
      GameSounds.wrong();
    }
  } catch {
    /* SoundManager not available — degrade silently */
  }
}

export default function FeedbackOverlay({
  isCorrect,
  message,
  visible,
  onDismiss,
  duration = 1200,
  enableSound = false,
}) {
  const [phase, setPhase] = useState('enter'); // 'enter' | 'exit'

  useEffect(() => {
    ensureKeyframes();
  }, []);

  useEffect(() => {
    if (!visible) return;
    setPhase('enter');

    if (enableSound) {
      playFeedbackSound(isCorrect);
    }

    const exitTimer = setTimeout(() => setPhase('exit'), duration - 350);
    const dismissTimer = setTimeout(() => {
      if (onDismiss) onDismiss();
    }, duration);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(dismissTimer);
    };
  }, [visible, isCorrect, duration, enableSound, onDismiss]);

  if (!visible) return null;

  const color = isCorrect ? kidsColors.success : kidsColors.error;
  const Icon = isCorrect ? CheckCircleIcon : CancelIcon;
  const defaultMsg = isCorrect ? 'Great job!' : 'Try again!';

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: isCorrect ? 'rgba(6,214,160,0.18)' : 'rgba(239,71,111,0.18)',
        backdropFilter: 'blur(4px)',
        animation:
          phase === 'enter'
            ? 'kidsFeedbackPop 0.45s ease-out forwards'
            : 'kidsFeedbackFadeOut 0.35s ease-in forwards',
        pointerEvents: 'none',
      }}
    >
      <Icon
        sx={{
          fontSize: 96,
          color,
          mb: 1,
          filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))',
        }}
      />
      <Typography
        variant="h4"
        sx={{fontWeight: 800, color, textShadow: '0 2px 8px rgba(0,0,0,0.08)'}}
      >
        {message || defaultMsg}
      </Typography>
    </Box>
  );
}
