import { Box, IconButton, Typography, LinearProgress, Fade, Button, Stack, Tooltip } from '@mui/material';
import { X as CloseIcon } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';

/**
 * SetupProgressCard — dreamy progress card for long-running setup jobs
 * (TTS engine install, model downloads, etc.)
 *
 * Matches the onboarding "Light your HART" visual language:
 * - Dark glass surface with subtle gradient border
 * - Animated progress bar with purple accent
 * - Step-by-step log with fade-in animation
 *
 * The "Ready" banner is ONLY shown when the backend also passes the
 * first-run TTS handshake (audio bytes + audible duration produced
 * by real synth).  A bare isComplete=true without a verified
 * handshake shows "Verifying voice..." rather than the green banner.
 * See tts/tts_handshake.py for the gating contract.
 *
 * Props:
 *   steps: Array<{step, message, timestamp}>  — progress steps received via SSE
 *   jobType: string — e.g. 'tts_setup_chatterbox_turbo'
 *   isComplete: boolean — true when job finishes
 *   handshake: {
 *     status: 'ready'|'failed'|'pending',
 *     engine: string, lang: string,
 *     err?: string, fallbacks?: string[],
 *   }  — verified voice-check outcome from tts_handshake SSE.
 *        Defaults to {status:'pending'}; banner stays yellow until
 *        this flips to 'ready' or 'failed'.
 *   onRetry?: () => void         — user clicked Retry on failed handshake
 *   onSwitchEngine?: (engine: string) => void — user picked a fallback
 *   onDismiss?: () => void       — user clicked the soft-dismiss × button.
 *                                  Caller should mark the underlying chat
 *                                  message as dismissed (soft-delete) rather
 *                                  than removing it — the history is kept,
 *                                  the bubble just stops rendering.  The
 *                                  dismiss control only appears once the
 *                                  setup has reached a terminal state
 *                                  (handshake ready/failed OR install
 *                                  failure) — we don't allow dismissing a
 *                                  card that's still actively loading,
 *                                  because that would orphan the running
 *                                  job from any user-visible signal.
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
const BORDER_GRADIENT = 'linear-gradient(135deg, rgba(108,99,255,0.4), rgba(255,107,107,0.2))';

export default function SetupProgressCard({
  steps = [],
  jobType = '',
  isComplete = false,
  handshake = { status: 'pending' },
  onRetry,
  onSwitchEngine,
  onDismiss,
}) {
  const [showComplete, setShowComplete] = useState(false);
  const scrollRef = useRef(null);

  const label = JOB_LABELS[jobType] || jobType.replace(/^tts_setup_/, '').replace(/_/g, ' ');
  const latestStep = steps[steps.length - 1];
  const installFailed = steps.some(s => s.message?.includes('failed') || s.message?.includes('error'));
  // Authoritative banner state. "Ready" is ONLY reached via a
  // verified handshake — install-complete alone keeps us yellow.
  const handshakeReady = handshake?.status === 'ready';
  const handshakeFailed = handshake?.status === 'failed';
  const isFailed = installFailed || handshakeFailed;
  // Estimate progress: most installs have 6-10 steps
  const estimatedTotal = 8;
  const progressPercent = handshakeReady
    ? 100
    : Math.min(95, (steps.length / estimatedTotal) * 100);

  useEffect(() => {
    // Delay the completion message until we have a definite
    // verdict — isComplete alone is a proxy signal; only the
    // handshake (or a hard install failure) is terminal.
    if (handshakeReady || handshakeFailed || installFailed) {
      const timer = setTimeout(() => setShowComplete(true), 300);
      return () => clearTimeout(timer);
    }
    setShowComplete(false);
    return undefined;
  }, [handshakeReady, handshakeFailed, installFailed]);

  // Auto-scroll to latest step
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps.length]);

  return (
    <Box sx={{
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
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
        pointerEvents: 'none',
      },
    }}>
      <Box sx={{
        background: SURFACE_BG,
        backdropFilter: 'blur(20px)',
        borderRadius: '16px',
        p: 2,
      }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Box sx={{
            width: 8, height: 8, borderRadius: '50%',
            background: handshakeReady
              ? '#2ECC71'
              : (isFailed ? '#E74C3C' : ACCENT),
            // Keep pulsing until we have a terminal verdict — either
            // verified-ready or a confirmed failure. Install-complete
            // alone is not terminal.
            animation: (handshakeReady || isFailed) ? 'none' : 'pulse 1.5s infinite',
            '@keyframes pulse': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.4 },
            },
          }} />
          <Typography variant="subtitle2" sx={{
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.85rem',
            letterSpacing: '0.02em',
            flex: 1,
          }}>
            {handshakeReady
              ? `${label} Ready`
              : isFailed
                ? `${label} Failed`
                : isComplete
                  ? `Verifying ${label} voice...`
                  : `Setting up ${label}...`}
          </Typography>
          {/* Soft-dismiss × — only once the card has a terminal
              verdict. Calling onDismiss is the caller's signal to mark
              the message as dismissed in chat state (soft-delete: the
              record stays, the bubble just stops rendering). */}
          {typeof onDismiss === 'function' && (handshakeReady || isFailed) && (
            <Tooltip title="Dismiss" placement="left" arrow>
              <IconButton
                size="small"
                aria-label="Dismiss setup card"
                onClick={onDismiss}
                sx={{
                  color: 'rgba(255,255,255,0.5)',
                  p: 0.25,
                  '&:hover': {
                    color: 'rgba(255,255,255,0.95)',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                  },
                }}
              >
                <CloseIcon size={14} />
              </IconButton>
            </Tooltip>
          )}
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
              background: handshakeReady
                ? 'linear-gradient(90deg, #2ECC71, #27AE60)'
                : `linear-gradient(90deg, ${ACCENT}, #9B59B6)`,
              transition: 'transform 0.6s ease',
            },
          }}
        />

        {/* Step log */}
        <Box ref={scrollRef} sx={{
          maxHeight: 140,
          overflowY: 'auto',
          '&::-webkit-scrollbar': { width: 3 },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(108,99,255,0.3)',
            borderRadius: 2,
          },
        }}>
          {steps.map((step, i) => (
            <Fade in key={step.timestamp || i} timeout={400}>
              <Typography sx={{
                color: i === steps.length - 1 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)',
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
                  width: 4, height: 4,
                  borderRadius: '50%',
                  background: i === steps.length - 1 ? ACCENT : 'rgba(255,255,255,0.2)',
                },
              }}>
                {step.message}
              </Typography>
            </Fade>
          ))}
        </Box>

        {/* Completion message */}
        {showComplete && (
          <Fade in timeout={600}>
            <Box>
              <Typography sx={{
                color: handshakeReady
                  ? '#2ECC71'
                  : '#E74C3C',
                fontSize: '0.8rem',
                fontWeight: 500,
                mt: 1,
                textAlign: 'center',
              }}>
                {handshakeReady
                  ? `Voice engine ready — next message will use ${label}`
                  : handshakeFailed
                    // Surface the ACTUAL engine error rather than a
                    // green lie.  Truncated so the banner stays small.
                    ? `Voice check failed — ${label}: ${(handshake?.err || 'no audio produced').slice(0, 120)}`
                    : `${label} unavailable — using fallback voice engine`}
              </Typography>

              {/* Retry / Switch engine buttons on handshake failure. */}
              {handshakeFailed && (
                <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 1 }}>
                  {typeof onRetry === 'function' && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={onRetry}
                      sx={{
                        color: '#fff',
                        borderColor: 'rgba(255,255,255,0.3)',
                        textTransform: 'none',
                        fontSize: '0.75rem',
                      }}
                    >
                      Retry
                    </Button>
                  )}
                  {typeof onSwitchEngine === 'function'
                    && Array.isArray(handshake?.fallbacks)
                    && handshake.fallbacks.slice(0, 2).map((fb) => (
                    <Button
                      key={fb}
                      size="small"
                      variant="outlined"
                      onClick={() => onSwitchEngine(fb)}
                      sx={{
                        color: '#fff',
                        borderColor: ACCENT,
                        textTransform: 'none',
                        fontSize: '0.75rem',
                      }}
                    >
                      Use {fb}
                    </Button>
                  ))}
                </Stack>
              )}
            </Box>
          </Fade>
        )}
      </Box>
    </Box>
  );
}
