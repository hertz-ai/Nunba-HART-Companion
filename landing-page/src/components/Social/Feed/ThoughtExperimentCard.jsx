/**
 * ThoughtExperimentCard - Rich card for thought experiment posts.
 *
 * Displays intent badge, hypothesis, expected outcome, and constructive
 * engagement metrics (Support, Evolve, Discuss). Uses token-based styling
 * and supports Liquid UI dynamic layouts.
 *
 * Enhanced with:
 *  - Animated intent accent bar (gradient pulse)
 *  - "Thought bubble" hypothesis box with animated glow border
 *  - Count-up animation on metrics when entering viewport
 *  - Staggered slide-up entrance via index prop
 *  - Support button micro-animation (scale bounce + ripple)
 */

import IntentBadge from './IntentBadge';
import PledgeSummaryBar from './PledgeSummaryBar';

import { useInView } from '../../../hooks/useAnimations';
import { postsApi } from '../../../services/socialApi';
import { socialTokens, RADIUS, EASINGS, DURATIONS } from '../../../theme/socialTokens';
import { useRoleAccess } from '../../RoleGuard';
import LevelBadge from '../shared/LevelBadge';
import UserChip from '../shared/UserChip';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import ThumbUpAltOutlinedIcon from '@mui/icons-material/ThumbUpAltOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Card, CardContent, Typography, Box, Tooltip, keyframes, useTheme, ButtonBase,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// ─── Keyframes ───────────────────────────────────────────────────────────────

const shimmerSweep = keyframes`
  0%   { left: -75%; }
  100% { left: 125%; }
`;

const supportPulse = keyframes`
  0%   { transform: scale(1); }
  40%  { transform: scale(1.2); }
  100% { transform: scale(1); }
`;

const supportBounce = keyframes`
  0%   { transform: scale(1); }
  20%  { transform: scale(0.92); }
  50%  { transform: scale(1.15); }
  80%  { transform: scale(0.97); }
  100% { transform: scale(1); }
`;

const supportRipple = keyframes`
  0%   { transform: scale(0); opacity: 0.5; }
  100% { transform: scale(2.5); opacity: 0; }
`;

const accentPulse = keyframes`
  0%   { opacity: 0.7; background-position: 0% 0%; }
  50%  { opacity: 1;   background-position: 0% 100%; }
  100% { opacity: 0.7; background-position: 0% 0%; }
`;

const hypothesisGlow = keyframes`
  0%   { box-shadow: 0 0 0px transparent; }
  50%  { box-shadow: 0 0 12px var(--glow-color); }
  100% { box-shadow: 0 0 0px transparent; }
`;

const slideUp = keyframes`
  0%   { opacity: 0; transform: translateY(28px) scale(0.97); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
`;

// ─── Count-up hook (IntersectionObserver driven) ────────────────────────────

function useCountUp(target, inView, duration = 600) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!inView || target <= 0) {
      setValue(target || 0);
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [inView, target, duration]);

  return value;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ThoughtExperimentCard({ post, animationDelay = 0, index = 0 }) {
  const navigate = useNavigate();
  const theme = useTheme();
  const { canWrite } = useRoleAccess();
  const [supported, setSupported] = useState(post.user_vote === 1);
  const [supportCount, setSupportCount] = useState(post.score || 0);
  const [animating, setAnimating] = useState(false);
  const [rippleActive, setRippleActive] = useState(false);
  const { ref, inView } = useInView({ threshold: 0.1, triggerOnce: true });

  const intentCategory = post.intent_category || 'education';
  const intentColor = socialTokens.intentColor(intentCategory);

  // Count-up values for metrics
  const displaySupport = useCountUp(supportCount, inView);
  const displayComments = useCountUp(post.comment_count || 0, inView);
  const displayViews = useCountUp(post.view_count || 0, inView);
  const displayEvolve = useCountUp(post.evolve_count || post.derivative_count || 0, inView);

  // Stagger delay: base animationDelay + index-based offset
  const staggerDelay = animationDelay + index * 80;

  const handleSupport = async (e) => {
    e.stopPropagation();
    if (!canWrite) return;
    const prev = supportCount;
    setSupported(!supported);
    setSupportCount(s => supported ? s - 1 : s + 1);
    setAnimating(true);
    setRippleActive(true);
    setTimeout(() => setAnimating(false), 500);
    setTimeout(() => setRippleActive(false), 600);
    try {
      const res = supported
        ? await postsApi.downvote(post.id)
        : await postsApi.upvote(post.id);
      if (res.data) setSupportCount(res.data.score ?? (supported ? prev - 1 : prev + 1));
    } catch {
      setSupported(supported);
      setSupportCount(prev);
    }
  };

  return (
    <div ref={ref}>
      <Card
        sx={{
          mb: 2,
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          // Glassmorphism
          ...socialTokens.glass.subtle(theme),
          borderRadius: RADIUS.lg,
          pl: '6px', // space for accent bar
          // Staggered slide-up entrance
          opacity: 0,
          animation: inView
            ? `${slideUp} 500ms cubic-bezier(0.16, 1, 0.3, 1) ${staggerDelay}ms both`
            : 'none',
          willChange: 'transform, opacity',
          transition: `
            box-shadow 250ms ease,
            border-color 250ms ease
          `,
          // Hover
          '&:hover': {
            borderColor: `${intentColor}33`,
            boxShadow: `0 12px 40px ${alpha(theme.palette.common.black, 0.4)}, 0 0 0 1px ${alpha(intentColor, 0.08)}`,
            transform: 'translateY(-2px) scale(1)',
            '& .te-shine': {
              animation: `${shimmerSweep} 0.8s ease`,
            },
            '& .te-accent-bar': {
              opacity: 1,
              filter: 'brightness(1.3)',
            },
          },
          '&:active': {
            transform: 'translateY(0) scale(0.995)',
          },
        }}
        onClick={() => navigate(`/social/post/${post.id}`)}
      >
        {/* Intent accent bar (left side) — animated gradient pulse */}
        <Box
          className="te-accent-bar"
          sx={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            borderRadius: '4px 0 0 4px',
            background: `linear-gradient(180deg, ${intentColor}, ${alpha(intentColor, 0.4)}, ${intentColor})`,
            backgroundSize: '100% 200%',
            animation: `${accentPulse} 3s ease-in-out infinite`,
            transition: 'opacity 300ms ease, filter 300ms ease',
          }}
        />

        {/* Shine overlay */}
        <Box className="te-shine" sx={{
          position: 'absolute', top: 0, bottom: 0,
          width: '50%', left: '-75%',
          background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.common.white, 0.04)}, transparent)`,
          transform: 'skewX(-15deg)',
          pointerEvents: 'none', zIndex: 1,
        }} />

        {/* Top accent line */}
        <Box sx={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
          background: `linear-gradient(90deg, transparent, ${intentColor}25 30%, ${intentColor}15 70%, transparent)`,
        }} />

        <CardContent sx={{ p: { xs: 2, md: 2.5 }, position: 'relative', zIndex: 2 }}>
          {/* Header: Intent Badge + Time */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IntentBadge category={intentCategory} />
              <UserChip user={post.author} />
              {post.author?.level > 1 && <LevelBadge level={post.author.level} size={16} />}
            </Box>
            <Typography variant="caption" sx={{
              color: theme.palette.text.secondary,
              fontWeight: 500,
              opacity: 0.7,
            }}>
              {timeAgo(post.created_at)}
            </Typography>
          </Box>

          {/* Title */}
          <Typography variant="h6" sx={{
            fontWeight: 700, mb: 1,
            background: `linear-gradient(to right, ${theme.palette.text.primary}, ${alpha(theme.palette.text.primary, 0.8)})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            lineHeight: 1.3,
          }}>
            {post.title}
          </Typography>

          {/* Hypothesis — "thought bubble" with animated glow border */}
          {post.hypothesis && (
            <Box sx={{
              '--glow-color': alpha(intentColor, 0.2),
              mb: 1.5,
              p: 1.5,
              borderRadius: RADIUS.lg,
              background: `${intentColor}08`,
              borderLeft: `3px solid ${intentColor}40`,
              border: `1px solid ${alpha(intentColor, 0.12)}`,
              borderLeftWidth: '3px',
              borderLeftColor: `${intentColor}60`,
              position: 'relative',
              animation: `${hypothesisGlow} 4s ease-in-out infinite`,
              transition: 'box-shadow 300ms ease',
              // Thought-bubble tail
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 12,
                left: -8,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: `${intentColor}15`,
                border: `1px solid ${alpha(intentColor, 0.15)}`,
              },
              '&::after': {
                content: '""',
                position: 'absolute',
                top: 18,
                left: -14,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: `${intentColor}10`,
                border: `1px solid ${alpha(intentColor, 0.1)}`,
              },
            }}>
              <Typography variant="overline" sx={{
                color: intentColor,
                display: 'block',
                mb: 0.25,
              }}>
                Hypothesis
              </Typography>
              <Typography variant="body2" sx={{
                color: theme.palette.text.secondary,
                fontStyle: 'italic',
                lineHeight: 1.5,
              }}>
                {post.hypothesis}
              </Typography>
            </Box>
          )}

          {/* Content preview (if no hypothesis, show regular content) */}
          {!post.hypothesis && post.content && (
            <Typography variant="body2" sx={{
              color: theme.palette.text.secondary,
              overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
              WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
              lineHeight: 1.6, mb: 1.5,
            }}>
              {post.content}
            </Typography>
          )}

          {/* Expected Outcome */}
          {post.expected_outcome && (
            <Typography variant="body2" sx={{
              color: theme.palette.success.light,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              mb: 1.5,
              fontWeight: 500,
            }}>
              <AutoAwesomeIcon sx={{ fontSize: 16 }} />
              {post.expected_outcome}
            </Typography>
          )}

          {/* Pledge Summary Bar */}
          <PledgeSummaryBar
            postId={post.id}
            experimentTitle={post.title}
            pledgeData={post.pledge_summary}
          />

          {/* Action bar: Support, Evolve, Discuss, Views — with count-up */}
          <Box sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 1, md: 1.5 },
            color: theme.palette.text.secondary,
            fontSize: '0.8rem',
          }}>
            {/* Support button — bounce + ripple micro-animation */}
            <Tooltip title={supported ? 'Remove support' : 'Support this experiment'}>
              <ButtonBase
                onClick={handleSupport}
                disabled={!canWrite}
                aria-label={supported ? 'Remove support' : 'Support this experiment'}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.5,
                  px: 1.5, py: 0.5, borderRadius: RADIUS.pill,
                  cursor: canWrite ? 'pointer' : 'default',
                  position: 'relative',
                  overflow: 'hidden',
                  background: supported ? alpha(intentColor, 0.08) : alpha(theme.palette.common.white, 0.03),
                  border: `1px solid ${supported ? alpha(intentColor, 0.19) : 'transparent'}`,
                  transition: `all ${DURATIONS.fast}ms ${EASINGS.smooth}`,
                  animation: animating ? `${supportBounce} 500ms ${EASINGS.spring}` : 'none',
                  '&:hover': canWrite ? {
                    background: alpha(intentColor, 0.07),
                    transform: 'scale(1.02)',
                  } : {},
                }}
              >
                {/* Ripple circle */}
                {rippleActive && (
                  <Box sx={{
                    position: 'absolute',
                    top: '50%', left: '50%',
                    width: 20, height: 20,
                    marginTop: '-10px', marginLeft: '-10px',
                    borderRadius: '50%',
                    background: alpha(intentColor, 0.25),
                    animation: `${supportRipple} 600ms ${EASINGS.decelerate} forwards`,
                    pointerEvents: 'none',
                  }} />
                )}
                {supported
                  ? <ThumbUpAltIcon sx={{
                      fontSize: 16,
                      color: intentColor,
                      animation: animating ? `${supportPulse} 300ms ease` : 'none',
                    }} />
                  : <ThumbUpAltOutlinedIcon sx={{ fontSize: 16, opacity: 0.7 }} />
                }
                <Typography variant="caption" sx={{
                  fontWeight: 600,
                  color: supported ? intentColor : 'inherit',
                }}>
                  {displaySupport > 0 ? displaySupport : ''} Support
                </Typography>
              </ButtonBase>
            </Tooltip>

            {/* Evolve count */}
            {(post.evolve_count > 0 || post.derivative_count > 0) && (
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.5,
                px: 1, py: 0.25, borderRadius: RADIUS.sm,
                background: alpha(theme.palette.common.white, 0.03),
              }}>
                <AutoAwesomeIcon sx={{ fontSize: 14, color: theme.palette.warning.main }} />
                <Typography variant="caption">
                  {displayEvolve} Evolved
                </Typography>
              </Box>
            )}

            {/* Comment count */}
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 0.5,
              px: 1, py: 0.25, borderRadius: RADIUS.sm,
              background: alpha(theme.palette.common.white, 0.03),
              transition: `background ${DURATIONS.instant}ms ease, color ${DURATIONS.instant}ms ease`,
              '&:hover': { background: alpha(theme.palette.common.white, 0.06), color: theme.palette.text.primary },
            }}>
              <ChatBubbleOutlineIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption">{displayComments}</Typography>
            </Box>

            {/* View count */}
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 0.5,
              px: 1, py: 0.25, borderRadius: RADIUS.sm,
              background: alpha(theme.palette.common.white, 0.03),
            }}>
              <VisibilityIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption">{displayViews}</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </div>
  );
}
