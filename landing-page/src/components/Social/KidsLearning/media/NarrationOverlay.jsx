import {
  kidsColors,
  kidsRadius,
  kidsShadows,
  kidsTransitions,
} from '../data/kidsTheme';

import CloseIcon from '@mui/icons-material/Close';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import {Box, Typography, IconButton, Fade} from '@mui/material';
import React, {useState, useEffect, useMemo, useCallback} from 'react';


/**
 * NarrationOverlay
 *
 * Semi-transparent overlay that shows narration text with optional
 * word-by-word highlight synced to TTS.  Animates in (slide up/down)
 * and out via Fade / CSS.
 *
 * Props:
 *  - text: string              The narration text to display
 *  - isPlaying: boolean        Whether TTS is currently speaking
 *  - currentWordIndex: number  Index of the currently spoken word (-1 = none)
 *  - onClose: () => void       Called when user taps close
 *  - position: 'bottom' | 'top'  Where to anchor the overlay (default 'bottom')
 */

/* ---- CSS keyframes injected once ---- */
const ANIM_ID = 'kids-narration-overlay-keyframes';
function ensureKeyframes() {
  if (document.getElementById(ANIM_ID)) return;
  const style = document.createElement('style');
  style.id = ANIM_ID;
  style.textContent = `
    @keyframes kidsNarrationSlideUp {
      0%   { transform: translateY(100%); opacity: 0; }
      100% { transform: translateY(0);    opacity: 1; }
    }
    @keyframes kidsNarrationSlideDown {
      0%   { transform: translateY(-100%); opacity: 0; }
      100% { transform: translateY(0);     opacity: 1; }
    }
    @keyframes kidsNarrationPulse {
      0%, 100% { transform: scale(1);   opacity: 0.85; }
      50%      { transform: scale(1.15); opacity: 1; }
    }
    @keyframes kidsNarrationWordPop {
      0%   { transform: scale(1); }
      50%  { transform: scale(1.12); }
      100% { transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
}

export default function NarrationOverlay({
  text,
  isPlaying = false,
  currentWordIndex = -1,
  onClose,
  position = 'bottom',
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    ensureKeyframes();
  }, []);

  // Animate in when text appears
  useEffect(() => {
    if (text) {
      // Small delay so the slide animation triggers after mount
      const t = setTimeout(() => setVisible(true), 30);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [text]);

  const handleClose = useCallback(() => {
    setVisible(false);
    // Let exit animation play before unmounting
    setTimeout(() => onClose?.(), 300);
  }, [onClose]);

  // Split text into words for highlight rendering
  const words = useMemo(
    () => (text || '').split(/\s+/).filter(Boolean),
    [text]
  );

  if (!text) return null;

  const isTop = position === 'top';
  const slideAnim = isTop ? 'kidsNarrationSlideDown' : 'kidsNarrationSlideUp';

  return (
    <Fade in={visible} timeout={350}>
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          ...(isTop ? {top: 0} : {bottom: 0}),
          zIndex: 20,
          animation: visible
            ? `${slideAnim} 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards`
            : undefined,
        }}
      >
        {/* Glass panel */}
        <Box
          sx={{
            mx: 2,
            mb: isTop ? 0 : 2,
            mt: isTop ? 2 : 0,
            px: 2.5,
            py: 2,
            borderRadius: `${kidsRadius.xl}`,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: kidsShadows.modal,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1.5,
            position: 'relative',
          }}
        >
          {/* Speaking indicator */}
          <Box
            sx={{
              mt: 0.4,
              flexShrink: 0,
              width: 36,
              height: 36,
              borderRadius: '50%',
              bgcolor: isPlaying
                ? `${kidsColors.accent}CC`
                : 'rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: kidsTransitions.normal,
              animation: isPlaying
                ? 'kidsNarrationPulse 1.2s ease-in-out infinite'
                : 'none',
            }}
          >
            <VolumeUpRoundedIcon
              sx={{
                fontSize: 20,
                color: isPlaying
                  ? kidsColors.textOnDark
                  : 'rgba(255,255,255,0.6)',
              }}
            />
          </Box>

          {/* Narration text with word highlighting */}
          <Box sx={{flex: 1, minWidth: 0}}>
            <Typography
              component="div"
              sx={{
                fontSize: 20,
                fontWeight: 600,
                lineHeight: 1.65,
                color: kidsColors.textOnDark,
                letterSpacing: 0.2,
                display: 'flex',
                flexWrap: 'wrap',
                gap: '5px',
              }}
            >
              {words.map((word, i) => {
                const isActive = isPlaying && i === currentWordIndex;
                const isPast =
                  isPlaying && currentWordIndex >= 0 && i < currentWordIndex;

                return (
                  <Box
                    component="span"
                    key={`${i}-${word}`}
                    sx={{
                      display: 'inline-block',
                      px: 0.4,
                      py: 0.1,
                      borderRadius: '6px',
                      transition: 'all 0.15s ease',
                      ...(isActive && {
                        bgcolor: `${kidsColors.accent}88`,
                        color: kidsColors.textOnDark,
                        fontWeight: 800,
                        animation: 'kidsNarrationWordPop 0.3s ease-out',
                        textShadow: `0 0 8px ${kidsColors.accent}66`,
                      }),
                      ...(isPast && {
                        color: 'rgba(255,255,255,0.55)',
                      }),
                      ...(!isActive &&
                        !isPast && {
                          color: 'rgba(255,255,255,0.92)',
                        }),
                    }}
                  >
                    {word}
                  </Box>
                );
              })}
            </Typography>
          </Box>

          {/* Close button */}
          <IconButton
            onClick={handleClose}
            aria-label="Close narration"
            size="small"
            sx={{
              position: 'absolute',
              top: 6,
              right: 6,
              color: 'rgba(255,255,255,0.65)',
              width: 32,
              height: 32,
              transition: kidsTransitions.fast,
              '&:hover': {
                color: kidsColors.textOnDark,
                bgcolor: 'rgba(255,255,255,0.12)',
              },
            }}
          >
            <CloseIcon sx={{fontSize: 18}} />
          </IconButton>
        </Box>
      </Box>
    </Fade>
  );
}
