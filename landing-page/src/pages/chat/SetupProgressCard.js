import {Box, Typography, LinearProgress, Fade} from '@mui/material';
import React, {useState, useEffect, useRef} from 'react';

/**
 * SetupProgressCard — dreamy progress card for long-running setup jobs
 * (TTS engine install, model downloads, etc.)
 *
 * Matches the onboarding "Light your HART" visual language:
 * - Dark glass surface with subtle gradient border
 * - Animated progress bar with purple accent
 * - Step-by-step log with fade-in animation
 *
 * Props:
 *   steps: Array<{step, message, timestamp}>  — progress steps received via SSE
 *   jobType: string — e.g. 'tts_setup_chatterbox_turbo'
 *   isComplete: boolean — true when job finishes
 */

const JOB_LABELS = {
  tts_setup_chatterbox_turbo: 'Chatterbox Turbo',
  tts_setup_chatterbox_multilingual: 'Chatterbox Multilingual',
  tts_setup_indic_parler: 'Indic Parler TTS',
  tts_setup_cosyvoice3: 'CosyVoice3',
  tts_setup_f5: 'F5-TTS',
  tts_setup_piper: 'Piper TTS',
};

const ACCENT = '#6C63FF';
const SURFACE_BG = 'rgba(15, 14, 23, 0.85)';
const BORDER_GRADIENT =
  'linear-gradient(135deg, rgba(108,99,255,0.4), rgba(255,107,107,0.2))';

export default function SetupProgressCard({
  steps = [],
  jobType = '',
  isComplete = false,
}) {
  const [showComplete, setShowComplete] = useState(false);
  const scrollRef = useRef(null);

  const label =
    JOB_LABELS[jobType] ||
    jobType.replace(/^tts_setup_/, '').replace(/_/g, ' ');
  const latestStep = steps[steps.length - 1];
  // Estimate progress: most installs have 6-10 steps
  const estimatedTotal = 8;
  const progressPercent = isComplete
    ? 100
    : Math.min(95, (steps.length / estimatedTotal) * 100);

  useEffect(() => {
    if (isComplete) {
      const timer = setTimeout(() => setShowComplete(true), 300);
      return () => clearTimeout(timer);
    }
  }, [isComplete]);

  // Auto-scroll to latest step
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps.length]);

  return (
    <Box
      sx={{
        position: 'relative',
        maxWidth: 480,
        borderRadius: '16px',
        overflow: 'hidden',
        my: 1.5,
        // Glass border effect
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          borderRadius: '16px',
          padding: '1px',
          background: BORDER_GRADIENT,
          WebkitMask:
            'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          pointerEvents: 'none',
        },
      }}
    >
      <Box
        sx={{
          background: SURFACE_BG,
          backdropFilter: 'blur(20px)',
          borderRadius: '16px',
          p: 2,
        }}
      >
        {/* Header */}
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1.5}}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isComplete ? '#2ECC71' : ACCENT,
              animation: isComplete ? 'none' : 'pulse 1.5s infinite',
              '@keyframes pulse': {
                '0%, 100%': {opacity: 1},
                '50%': {opacity: 0.4},
              },
            }}
          />
          <Typography
            variant="subtitle2"
            sx={{
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.85rem',
              letterSpacing: '0.02em',
            }}
          >
            {isComplete ? `${label} Ready` : `Setting up ${label}...`}
          </Typography>
        </Box>

        {/* Progress bar */}
        <LinearProgress
          variant="determinate"
          value={progressPercent}
          sx={{
            height: 4,
            borderRadius: 2,
            mb: 1.5,
            backgroundColor: 'rgba(108,99,255,0.15)',
            '& .MuiLinearProgress-bar': {
              borderRadius: 2,
              background: isComplete
                ? 'linear-gradient(90deg, #2ECC71, #27AE60)'
                : `linear-gradient(90deg, ${ACCENT}, #9B59B6)`,
              transition: 'transform 0.6s ease',
            },
          }}
        />

        {/* Step log */}
        <Box
          ref={scrollRef}
          sx={{
            maxHeight: 140,
            overflowY: 'auto',
            '&::-webkit-scrollbar': {width: 3},
            '&::-webkit-scrollbar-thumb': {
              background: 'rgba(108,99,255,0.3)',
              borderRadius: 2,
            },
          }}
        >
          {steps.map((step, i) => (
            <Fade in key={step.timestamp || i} timeout={400}>
              <Typography
                sx={{
                  color:
                    i === steps.length - 1
                      ? 'rgba(255,255,255,0.9)'
                      : 'rgba(255,255,255,0.45)',
                  fontSize: '0.75rem',
                  lineHeight: 1.6,
                  fontFamily: 'monospace',
                  pl: 1.5,
                  position: 'relative',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background:
                      i === steps.length - 1 ? ACCENT : 'rgba(255,255,255,0.2)',
                  },
                }}
              >
                {step.message}
              </Typography>
            </Fade>
          ))}
        </Box>

        {/* Completion message */}
        {showComplete && (
          <Fade in timeout={600}>
            <Typography
              sx={{
                color: '#2ECC71',
                fontSize: '0.8rem',
                fontWeight: 500,
                mt: 1,
                textAlign: 'center',
              }}
            >
              Voice engine ready — next message will use {label}
            </Typography>
          </Fade>
        )}
      </Box>
    </Box>
  );
}
