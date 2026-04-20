import MediaLoadingIndicator from './MediaLoadingIndicator';

import {useReducedMotion} from '../../../../hooks/useAnimations';
import {
  kidsColors,
  kidsRadius,
  kidsShadows,
  kidsTransitions,
} from '../data/kidsTheme';

import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import VolumeOffRoundedIcon from '@mui/icons-material/VolumeOffRounded';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import {Box, Typography, IconButton, Slider, Fade} from '@mui/material';
import React, {useState, useRef, useCallback, useEffect} from 'react';

/**
 * KidsVideoPlayer
 *
 * Kid-friendly HTML5 video player with large, colourful controls,
 * glassmorphism overlay, and smooth transitions.
 *
 * Props:
 *  - src: string (video URL or path)
 *  - poster: string (poster image URL)
 *  - autoPlay: boolean (default false)
 *  - onComplete: () => void
 *  - onError: (err) => void
 *  - style: object (sx overrides for outer wrapper)
 */

/* ---- CSS keyframes injected once ---- */
const ANIM_ID = 'kids-video-player-keyframes';
function ensureKeyframes() {
  if (document.getElementById(ANIM_ID)) return;
  const style = document.createElement('style');
  style.id = ANIM_ID;
  style.textContent = `
    @keyframes kidsVideoFadeIn {
      0%   { opacity: 0; transform: scale(0.92); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes kidsVideoPulsePlay {
      0%, 100% { transform: translate(-50%, -50%) scale(1); }
      50%      { transform: translate(-50%, -50%) scale(1.08); }
    }
    @keyframes kidsVideoControlSlideUp {
      0%   { transform: translateY(100%); opacity: 0; }
      100% { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

/* Format seconds into m:ss */
function fmtTime(sec) {
  if (!sec || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function KidsVideoPlayer({
  src,
  poster,
  autoPlay = false,
  onComplete,
  onError,
  style,
}) {
  const videoRef = useRef(null);
  const hideTimerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [paused, setPaused] = useState(!autoPlay);
  const [progress, setProgress] = useState(0); // 0-1
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [showControls, setShowControls] = useState(true);

  useEffect(() => {
    ensureKeyframes();
  }, []);

  /* ── Video event handlers ── */

  const handleLoadedData = useCallback(() => {
    setLoading(false);
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 0);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setCurrentTime(v.currentTime);
    setProgress(v.currentTime / v.duration);
  }, []);

  const handleEnded = useCallback(() => {
    setPaused(true);
    setEnded(true);
    setProgress(1);
    setShowControls(true);
    onComplete?.();
  }, [onComplete]);

  const handleError = useCallback(
    (e) => {
      setError(true);
      setLoading(false);
      onError?.(e);
    },
    [onError]
  );

  /* ── Control actions ── */

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (ended) {
      v.currentTime = 0;
      setEnded(false);
      setProgress(0);
    }
    if (v.paused) {
      v.play().catch(() => {});
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  }, [ended]);

  const handleSeek = useCallback(
    (_e, val) => {
      const v = videoRef.current;
      if (!v || !v.duration) return;
      const t = (val / 100) * v.duration;
      v.currentTime = t;
      setProgress(val / 100);
      setCurrentTime(t);
      if (ended) {
        setEnded(false);
        setPaused(true);
      }
    },
    [ended]
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (videoRef.current) videoRef.current.muted = !m;
      return !m;
    });
  }, []);

  /* Auto-hide controls while playing */
  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    if (!paused) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [paused]);

  const handlePointerMove = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    if (paused) {
      setShowControls(true);
      clearTimeout(hideTimerRef.current);
    } else {
      scheduleHide();
    }
    return () => clearTimeout(hideTimerRef.current);
  }, [paused, scheduleHide]);

  /* ── Error state ── */
  if (error) {
    return (
      <Box
        sx={{
          borderRadius: `${kidsRadius.lg}`,
          overflow: 'hidden',
          bgcolor: kidsColors.card,
          aspectRatio: '16 / 9',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
          boxShadow: kidsShadows.card,
          ...style,
        }}
      >
        <VideocamOffIcon sx={{fontSize: 56, color: kidsColors.textMuted}} />
        <Typography
          variant="h6"
          sx={{fontWeight: 600, color: kidsColors.textMuted}}
        >
          Oops! Video is not available
        </Typography>
        <Typography variant="body2" sx={{color: kidsColors.textSecondary}}>
          Please try again later
        </Typography>
      </Box>
    );
  }

  /* ── Derived state ── */
  const playIcon = ended ? (
    <ReplayRoundedIcon sx={{fontSize: 36}} />
  ) : paused ? (
    <PlayArrowRoundedIcon sx={{fontSize: 36}} />
  ) : (
    <PauseRoundedIcon sx={{fontSize: 36}} />
  );

  const centerIcon = ended ? (
    <ReplayRoundedIcon sx={{fontSize: 54}} />
  ) : (
    <PlayArrowRoundedIcon sx={{fontSize: 54}} />
  );

  const ariaLabel = ended
    ? 'Replay video'
    : paused
      ? 'Play video'
      : 'Pause video';

  return (
    <Box
      onPointerMove={handlePointerMove}
      onClick={handlePointerMove}
      sx={{
        position: 'relative',
        borderRadius: `${kidsRadius.lg}`,
        overflow: 'hidden',
        bgcolor: '#000',
        aspectRatio: '16 / 9',
        boxShadow: kidsShadows.card,
        animation: 'kidsVideoFadeIn 0.4s ease-out',
        cursor: showControls ? 'default' : 'none',
        ...style,
      }}
    >
      {/* HTML5 video element */}
      <Box
        component="video"
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        playsInline
        preload="auto"
        onLoadedData={handleLoadedData}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleError}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        sx={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
      />

      {/* Loading overlay */}
      <Fade in={loading} timeout={300}>
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <MediaLoadingIndicator type="video" message="Loading video..." />
        </Box>
      </Fade>

      {/* Big center play / replay button (when paused & not loading) */}
      <Fade in={paused && !loading} timeout={250}>
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <IconButton
            onClick={togglePlay}
            aria-label={ariaLabel}
            sx={{
              pointerEvents: 'auto',
              width: 88,
              height: 88,
              bgcolor: `${kidsColors.accent}CC`,
              color: kidsColors.textOnDark,
              boxShadow: kidsShadows.float,
              backdropFilter: 'blur(8px)',
              animation: 'kidsVideoPulsePlay 2.4s ease-in-out infinite',
              transition: kidsTransitions.bounce,
              '&:hover': {
                bgcolor: kidsColors.accent,
                transform: 'translate(-50%, -50%) scale(1.12)',
              },
            }}
          >
            {centerIcon}
          </IconButton>
        </Box>
      </Fade>

      {/* Glassmorphism bottom control bar */}
      <Fade in={showControls && !loading} timeout={200}>
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 1,
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            animation: 'kidsVideoControlSlideUp 0.3s ease-out',
          }}
        >
          {/* Play / Pause */}
          <IconButton
            onClick={togglePlay}
            size="small"
            aria-label={ariaLabel}
            sx={{
              width: 44,
              height: 44,
              bgcolor: kidsColors.accent,
              color: kidsColors.textOnDark,
              transition: kidsTransitions.fast,
              '&:hover': {bgcolor: kidsColors.accentLight},
            }}
          >
            {playIcon}
          </IconButton>

          {/* Time / progress */}
          <Typography
            variant="caption"
            sx={{
              color: 'rgba(255,255,255,0.85)',
              fontWeight: 600,
              minWidth: 42,
              fontSize: 12,
              userSelect: 'none',
            }}
          >
            {fmtTime(currentTime)}
          </Typography>

          <Slider
            value={progress * 100}
            onChange={handleSeek}
            aria-label="Video progress"
            size="small"
            sx={{
              flex: 1,
              color: kidsColors.accent,
              height: 6,
              py: 0,
              '& .MuiSlider-thumb': {
                width: 14,
                height: 14,
                bgcolor: kidsColors.textOnDark,
                boxShadow: '0 0 6px rgba(0,0,0,0.3)',
                transition: kidsTransitions.fast,
                '&:hover, &.Mui-focusVisible': {
                  boxShadow: `0 0 0 6px ${kidsColors.accent}44`,
                },
              },
              '& .MuiSlider-track': {
                bgcolor: kidsColors.accent,
                border: 'none',
              },
              '& .MuiSlider-rail': {
                bgcolor: 'rgba(255,255,255,0.25)',
              },
            }}
          />

          <Typography
            variant="caption"
            sx={{
              color: 'rgba(255,255,255,0.85)',
              fontWeight: 600,
              minWidth: 42,
              fontSize: 12,
              userSelect: 'none',
            }}
          >
            {fmtTime(duration)}
          </Typography>

          {/* Volume toggle */}
          <IconButton
            onClick={toggleMute}
            size="small"
            aria-label={muted ? 'Unmute' : 'Mute'}
            sx={{
              color: 'rgba(255,255,255,0.85)',
              transition: kidsTransitions.fast,
              '&:hover': {color: kidsColors.textOnDark},
            }}
          >
            {muted ? (
              <VolumeOffRoundedIcon sx={{fontSize: 22}} />
            ) : (
              <VolumeUpRoundedIcon sx={{fontSize: 22}} />
            )}
          </IconButton>
        </Box>
      </Fade>
    </Box>
  );
}
