/**
 * NunbaChatPill - Collapsed state of the NunbaChat widget.
 *
 * Desktop (md+): Floating pill, bottom-right, with Nunba avatar + typewriter greeting.
 * Mobile (xs): Minimal floating bar above bottom nav — NO avatar face by default,
 *              just text + icon. Dismissible.
 */

import {useNunbaChat} from './NunbaChatProvider';

import {
  GRADIENTS,
  EASINGS,
  RADIUS,
  socialTokens,
} from '../../../../theme/socialTokens';

import ChatIcon from '@mui/icons-material/Chat';
import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  Typography,
  IconButton,
  keyframes,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect, useRef} from 'react';

/* ── Keyframes ── */
const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 4px 24px rgba(108,99,255,0.25); }
  50%      { box-shadow: 0 4px 32px rgba(108,99,255,0.45), 0 0 0 6px rgba(108,99,255,0.06); }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
`;

/* ── Typewriter cycling greetings ── */
const GREETINGS = [
  'Create your HART...',
  'Ask Nunba anything...',
  'Your guardian angel is here...',
  'Explore thought experiments...',
];

function useTypewriter(texts, charDelay = 35, holdMs = 2200, eraseDelay = 20) {
  const [display, setDisplay] = useState('');
  const [textIdx, setTextIdx] = useState(0);
  const phase = useRef('typing'); // typing | holding | erasing
  const charIdx = useRef(0);

  useEffect(() => {
    const text = texts[textIdx];
    let timer;

    if (phase.current === 'typing') {
      if (charIdx.current <= text.length) {
        timer = setTimeout(() => {
          setDisplay(text.slice(0, charIdx.current));
          charIdx.current++;
          if (charIdx.current > text.length) phase.current = 'holding';
        }, charDelay);
      }
    } else if (phase.current === 'holding') {
      timer = setTimeout(() => {
        phase.current = 'erasing';
        setDisplay((d) => d);
      }, holdMs);
    } else if (phase.current === 'erasing') {
      if (charIdx.current > 0) {
        timer = setTimeout(() => {
          charIdx.current--;
          setDisplay(text.slice(0, charIdx.current));
          if (charIdx.current === 0) {
            phase.current = 'typing';
            setTextIdx((i) => (i + 1) % texts.length);
          }
        }, eraseDelay);
      }
    }

    return () => clearTimeout(timer);
  });

  return display;
}

export default function NunbaChatPill() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const {isExpanded, setIsExpanded, isDismissed, dismiss} = useNunbaChat();
  const greeting = useTypewriter(GREETINGS);

  if (isExpanded || isDismissed) return null;

  /* ── Mobile: minimal floating bar — no face, just text + icon ── */
  if (isMobile) {
    return (
      <Box
        onClick={() => setIsExpanded(true)}
        sx={{
          position: 'fixed',
          bottom: 58, // just above BottomNavigation (56px)
          left: 8,
          right: 8,
          zIndex: 1150,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          borderRadius: RADIUS.pill,
          ...socialTokens.glass.elevated(theme),
          cursor: 'pointer',
          animation: `${slideUp} 400ms ${EASINGS.smooth} both`,
          transition: `all 200ms ${EASINGS.smooth}`,
          '&:active': {transform: 'scale(0.98)'},
        }}
      >
        <ChatIcon sx={{fontSize: 18, color: theme.palette.primary.main}} />
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            fontWeight: 600,
            fontSize: '0.8rem',
            color: theme.palette.text.primary,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {greeting}
          <Box
            component="span"
            sx={{
              display: 'inline-block',
              width: 2,
              height: 14,
              ml: 0.5,
              bgcolor: theme.palette.primary.main,
              verticalAlign: 'middle',
              animation: 'blink 1s step-end infinite',
              '@keyframes blink': {'50%': {opacity: 0}},
            }}
          />
        </Typography>
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          sx={{color: theme.palette.text.secondary, p: 0.5}}
          aria-label="Dismiss chat"
        >
          <CloseIcon sx={{fontSize: 16}} />
        </IconButton>
      </Box>
    );
  }

  /* ── Desktop: floating pill with Nunba avatar ── */
  return (
    <Box
      onClick={() => setIsExpanded(true)}
      sx={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 1150,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        pl: 0.75,
        pr: 2.5,
        py: 0.75,
        borderRadius: RADIUS.pill,
        ...socialTokens.glass.elevated(theme),
        cursor: 'pointer',
        animation: `${pulseGlow} 3s ease-in-out infinite, ${slideUp} 500ms ${EASINGS.smooth} both`,
        transition: `transform 200ms ${EASINGS.smooth}`,
        '&:hover': {
          transform: 'scale(1.04)',
          borderColor: alpha(theme.palette.primary.main, 0.3),
        },
        '&:active': {transform: 'scale(0.97)'},
      }}
    >
      {/* Nunba avatar */}
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: GRADIENTS.primary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: '0.95rem',
          color: '#fff',
          boxShadow: `0 0 12px ${alpha(theme.palette.primary.main, 0.4)}`,
          flexShrink: 0,
        }}
      >
        N
      </Box>

      <Box sx={{minWidth: 0}}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            fontSize: '0.82rem',
            color: theme.palette.text.primary,
            lineHeight: 1.3,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            maxWidth: 200,
          }}
        >
          {greeting}
          <Box
            component="span"
            sx={{
              display: 'inline-block',
              width: 2,
              height: 14,
              ml: 0.5,
              bgcolor: theme.palette.primary.main,
              verticalAlign: 'middle',
              animation: 'blink 1s step-end infinite',
              '@keyframes blink': {'50%': {opacity: 0}},
            }}
          />
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: theme.palette.text.secondary,
            fontSize: '0.68rem',
          }}
        >
          Your guardian angel
        </Typography>
      </Box>
    </Box>
  );
}
