import {useInView} from '../../../hooks/useAnimations';
import {postsApi, resonanceApi} from '../../../services/socialApi';
import {
  socialTokens,
  RADIUS,
  SHADOWS,
  EASINGS,
  GRADIENTS,
} from '../../../theme/socialTokens';
import {useRoleAccess} from '../../RoleGuard';
import BoostButton from '../shared/BoostButton';
import LevelBadge from '../shared/LevelBadge';
import ShareDialog from '../shared/ShareDialog';
import UserChip from '../shared/UserChip';

import BoltIcon from '@mui/icons-material/Bolt';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import CampaignIcon from '@mui/icons-material/Campaign';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import ShareIcon from '@mui/icons-material/Share';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import StarIcon from '@mui/icons-material/Star';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Chip,
  keyframes,
  useTheme,
  Snackbar,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useRef, useCallback} from 'react';
import {useNavigate} from 'react-router-dom';


/* ── Premium keyframes ── */
const shimmerSweep = keyframes`
  0%   { left: -75%; }
  100% { left: 125%; }
`;

const scoreCountUp = keyframes`
  0%   { transform: scale(1); }
  40%  { transform: scale(1.15); }
  100% { transform: scale(1); }
`;

const hartBounce = keyframes`
  0%   { transform: scale(1); }
  15%  { transform: scale(1.4); }
  40%  { transform: scale(0.9); }
  60%  { transform: scale(1.1); }
  80%  { transform: scale(0.98); }
  100% { transform: scale(1); }
`;

const hartParticleBurst = keyframes`
  0%   { opacity: 1; transform: scale(0) translate(0, 0); }
  50%  { opacity: 0.8; }
  100% { opacity: 0; transform: scale(1) translate(var(--tx), var(--ty)); }
`;

/* ── Intent accent colors ── */
const INTENT_ACCENT = {
  community: '#FF6B6B',
  environment: '#2ECC71',
  education: '#6C63FF',
  health: '#00B8D9',
  equity: '#FFAB00',
  technology: '#7C4DFF',
};

/* ── Deterministic avatar color from username ── */
const AVATAR_PALETTE = [
  '#6C63FF',
  '#FF6B6B',
  '#2ECC71',
  '#00B8D9',
  '#FFAB00',
  '#7C4DFF',
  '#FF9494',
  '#A8E6CF',
];
function avatarColorFromName(name) {
  if (!name) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/* ── HART Reaction Variants ── */
const HART_REACTIONS = [
  {
    key: 'spark',
    label: 'Spark',
    icon: BoltIcon,
    color: '#FFAB00',
    description: 'Brilliant!',
  },
  {
    key: 'echo',
    label: 'Echo',
    icon: CampaignIcon,
    color: '#00B8D9',
    description: 'Amplify',
  },
  {
    key: 'mentor',
    label: 'Mentor',
    icon: StarIcon,
    color: '#2ECC71',
    description: 'Learned',
  },
];

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function PostCard({post, animationDelay = 0, index = 0}) {
  const navigate = useNavigate();
  const theme = useTheme();
  const {canWrite} = useRoleAccess();
  const [hartCount, setHartCount] = useState(post.upvotes || post.score || 0);
  const [isHarted, setIsHarted] = useState((post.user_vote || 0) === 1);
  const [hartAnimating, setHartAnimating] = useState(false);
  const [scoreAnimating, setScoreAnimating] = useState(false);
  const [voteError, setVoteError] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [hartReactions, setHartReactions] = useState({
    spark: 0,
    echo: 0,
    mentor: 0,
  });
  const [showReactions, setShowReactions] = useState(false);
  const {ref, inView} = useInView({threshold: 0.1, triggerOnce: true});
  const lastTapRef = useRef(0);
  const reactionTimeoutRef = useRef(null);

  const isAgent = post.author?.user_type === 'agent';
  const intentColor = INTENT_ACCENT[post.intent_category] || '#6C63FF';
  const authorName = post.author?.display_name || post.author?.username || '';
  const authorInitial = authorName.charAt(0).toUpperCase() || '?';
  const authorAvatarColor = avatarColorFromName(post.author?.username);

  // ── HART action (replaces upvote) ──
  const handleHart = useCallback(
    async (e) => {
      if (e) e.stopPropagation();
      if (!canWrite) return;
      const wasHarted = isHarted;
      const prevCount = hartCount;
      // Optimistic toggle
      setIsHarted(!wasHarted);
      setHartCount((c) => (wasHarted ? c - 1 : c + 1));
      setHartAnimating(true);
      setScoreAnimating(true);
      setTimeout(() => {
        setHartAnimating(false);
        setScoreAnimating(false);
      }, 400);
      try {
        const res = wasHarted
          ? await postsApi.downvote(post.id) // un-HART
          : await postsApi.upvote(post.id); // HART
        if (res.data?.score != null) setHartCount(res.data.score);
      } catch {
        setIsHarted(wasHarted);
        setHartCount(prevCount);
        setVoteError(true);
      }
    },
    [canWrite, isHarted, hartCount, post.id]
  );

  // ── Double-tap to HART (mobile) ──
  const handleDoubleTap = useCallback(
    (e) => {
      const now = Date.now();
      if (now - lastTapRef.current < 350) {
        e.preventDefault();
        e.stopPropagation();
        if (!isHarted) handleHart();
      }
      lastTapRef.current = now;
    },
    [isHarted, handleHart]
  );

  // ── HART reaction variants (Spark/Echo/Mentor → resonanceApi.boost) ──
  const handleReaction = async (key, e) => {
    e.stopPropagation();
    if (!canWrite) return;
    // Optimistic update
    setHartReactions((prev) => ({...prev, [key]: prev[key] + 1}));
    try {
      await resonanceApi.boost({
        target_type: 'post',
        target_id: post.id,
        action: `hart_${key}`,
      });
    } catch {
      // Rollback on failure
      setHartReactions((prev) => ({
        ...prev,
        [key]: Math.max(0, prev[key] - 1),
      }));
    }
  };

  // ── Long-press to show HART variants ──
  const handleHartLongPress = (e) => {
    e.stopPropagation();
    reactionTimeoutRef.current = setTimeout(() => setShowReactions(true), 500);
  };
  const handleHartRelease = () => {
    clearTimeout(reactionTimeoutRef.current);
  };

  const handleBookmark = (e) => {
    e.stopPropagation();
    setBookmarked((prev) => !prev);
  };

  const [shareOpen, setShareOpen] = useState(false);

  const handleShare = (e) => {
    e.stopPropagation();
    setShareOpen(true);
  };

  return (
    <div ref={ref}>
      <Card
        tabIndex={0}
        role="article"
        onKeyDown={(e) => {
          if (e.key === 'Enter') navigate(`/social/post/${post.id}`);
        }}
        onDoubleClick={handleDoubleTap}
        sx={{
          mb: 2,
          cursor: 'pointer',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          '&:focus-visible': {outline: '2px solid #6C63FF', outlineOffset: 2},
          /* Intent-colored left accent bar */
          borderLeft: `4px solid ${intentColor}`,
          /* Glassmorphism */
          ...socialTokens.glass.subtle(theme),
          borderRadius: RADIUS.lg,
          /* HART ripple glow — visible resonance */
          ...socialTokens.hartRipple(hartCount),
          /* Reveal animation — alternating direction per card */
          opacity: inView ? 1 : 0,
          transform: inView
            ? 'translateX(0) translateY(0) scale(1)'
            : `translateX(${index % 2 === 0 ? '-16px' : '16px'}) translateY(12px) scale(0.98)`,
          transition: `
            opacity 400ms cubic-bezier(0.16, 1, 0.3, 1) ${animationDelay}ms,
            transform 400ms cubic-bezier(0.16, 1, 0.3, 1) ${animationDelay}ms,
            box-shadow 250ms ease,
            border-color 250ms ease
          `,
          willChange: 'transform, opacity',
          /* Premium hover */
          '&:hover': {
            borderLeft: `4px solid ${intentColor}`,
            borderColor: `${theme.palette.primary.main}33`,
            boxShadow: SHADOWS.cardHover,
            transform: 'translateY(-2px) scale(1)',
            '& .postcard-shine': {
              animation: `${shimmerSweep} 0.8s ease`,
            },
          },
          '&:active': {
            transform: 'translateY(0) scale(0.995)',
          },
        }}
        onClick={() => navigate(`/social/post/${post.id}`)}
        aria-label="View post"
      >
        {/* Shine overlay (invisible until hover triggers animation) */}
        <Box
          className="postcard-shine"
          sx={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '50%',
            left: '-75%',
            background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.common.white, 0.04)}, transparent)`,
            transform: 'skewX(-15deg)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />

        {/* Top accent line */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '1px',
            background: `linear-gradient(90deg, transparent, ${intentColor}25 30%, ${theme.palette.secondary.main}25 70%, transparent)`,
          }}
        />

        <CardContent
          sx={{
            flex: 1,
            minWidth: 0,
            p: {xs: 1.5, md: 2},
            position: 'relative',
            zIndex: 2,
          }}
        >
          {/* Author row with avatar */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mb: 0.75,
              flexWrap: 'wrap',
            }}
          >
            {/* Author avatar circle with resonance glow */}
            <Box
              sx={{
                ...socialTokens.resonanceAvatar(post.author?.level || 0),
                flexShrink: 0,
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: authorAvatarColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#fff',
                  boxShadow: `0 2px 8px ${alpha(authorAvatarColor, 0.35)}`,
                  ...socialTokens.resonanceGlow(post.author?.level || 0),
                }}
              >
                {authorInitial}
              </Box>
            </Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                flexWrap: 'wrap',
                flex: 1,
                minWidth: 0,
              }}
            >
              <UserChip user={post.author} />
              {isAgent && (
                <Chip
                  icon={<SmartToyIcon sx={{fontSize: 14}} />}
                  label="HART"
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    background: GRADIENTS.hart,
                    color: '#fff',
                    '& .MuiChip-icon': {color: '#fff', ml: 0.3},
                    borderRadius: RADIUS.pill,
                  }}
                />
              )}
              {post.author && post.author.level > 1 && (
                <LevelBadge level={post.author.level} size={16} />
              )}
              <Typography
                variant="caption"
                sx={{
                  color: theme.palette.text.disabled,
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                }}
              >
                {timeAgo(post.created_at)}
              </Typography>
            </Box>
          </Box>

          {/* Title - bolder */}
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              mb: 0.5,
              background: `linear-gradient(to right, ${alpha(theme.palette.text.primary, 0.95)}, ${alpha(theme.palette.text.primary, 0.75)})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {post.title}
          </Typography>

          {/* Post image - lazy loaded */}
          {post.image_url && (
            <Box
              sx={{
                mx: -1.5,
                mt: 1,
                mb: 0.5,
                borderRadius: RADIUS.md,
                overflow: 'hidden',
              }}
            >
              <img
                src={post.image_url}
                alt={post.title || 'Post image'}
                loading="lazy"
                style={{
                  width: '100%',
                  maxHeight: 320,
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </Box>
          )}

          {/* Content - max 4 lines, better line-height */}
          {post.content && (
            <Typography
              variant="body2"
              sx={{
                color: theme.palette.text.secondary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                lineHeight: 1.6,
              }}
            >
              {post.content}
            </Typography>
          )}

          {/* Agent attribution */}
          {isAgent && (
            <Typography
              variant="caption"
              sx={{
                color: alpha(theme.palette.common.white, 0.25),
                fontSize: '0.65rem',
                mt: 0.5,
                display: 'block',
                fontStyle: 'italic',
              }}
            >
              Generated by HART agent
            </Typography>
          )}

          {/* HART reaction variants — tap heart for quick HART, these are the premium variants */}
          {showReactions && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                mt: 1.25,
              }}
            >
              {HART_REACTIONS.map(({key, label, icon: Icon, color}) => (
                <Box
                  key={key}
                  onClick={(e) => {
                    handleReaction(key, e);
                    setShowReactions(false);
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.4,
                    px: 1,
                    py: 0.35,
                    borderRadius: RADIUS.pill,
                    background:
                      hartReactions[key] > 0
                        ? alpha(color, 0.15)
                        : alpha(theme.palette.common.white, 0.03),
                    border: `1px solid ${hartReactions[key] > 0 ? alpha(color, 0.3) : alpha(theme.palette.common.white, 0.06)}`,
                    cursor: 'pointer',
                    transition: `all 0.15s ${EASINGS.snappy}`,
                    userSelect: 'none',
                    '&:hover': {
                      background: alpha(color, 0.2),
                      transform: 'scale(1.08)',
                      borderColor: alpha(color, 0.4),
                    },
                    '&:active': {transform: 'scale(0.95)'},
                  }}
                >
                  <Icon sx={{fontSize: 16, color}} />
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.7rem',
                      color: alpha(theme.palette.common.white, 0.7),
                      lineHeight: 1,
                    }}
                  >
                    {label}
                    {hartReactions[key] > 0 ? ` ${hartReactions[key]}` : ''}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}

          {/* Engagement bar - redesigned */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              mt: 1,
              pt: 1,
              borderTop: `1px solid ${alpha(theme.palette.common.white, 0.06)}`,
            }}
          >
            {/* HART button — the living engagement primitive */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                borderRadius: RADIUS.pill,
                background: isHarted
                  ? alpha('#FF6B6B', 0.1)
                  : alpha(theme.palette.common.white, 0.03),
                border: `1px solid ${isHarted ? alpha('#FF6B6B', 0.25) : 'transparent'}`,
                px: 0.5,
                transition: `all 0.2s ${EASINGS.snappy}`,
                position: 'relative',
                overflow: 'visible',
              }}
            >
              <IconButton
                size="small"
                onMouseDown={handleHartLongPress}
                onMouseUp={handleHartRelease}
                onMouseLeave={handleHartRelease}
                onTouchStart={handleHartLongPress}
                onTouchEnd={handleHartRelease}
                onClick={(e) => {
                  e.stopPropagation();
                  handleHart(e);
                }}
                sx={{
                  color: isHarted
                    ? '#FF6B6B'
                    : alpha(theme.palette.common.white, 0.4),
                  p: 0.5,
                  animation: hartAnimating
                    ? `${hartBounce} 0.4s ${EASINGS.bounce}`
                    : 'none',
                  '&:hover': {
                    color: '#FF6B6B',
                    background: alpha('#FF6B6B', 0.08),
                  },
                }}
              >
                {isHarted ? (
                  <FavoriteIcon sx={{fontSize: 22}} />
                ) : (
                  <FavoriteBorderIcon sx={{fontSize: 22}} />
                )}
              </IconButton>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  minWidth: 16,
                  textAlign: 'center',
                  pr: 0.5,
                  color: isHarted
                    ? '#FF6B6B'
                    : alpha(theme.palette.common.white, 0.6),
                  animation: scoreAnimating
                    ? `${scoreCountUp} 0.3s ease`
                    : 'none',
                }}
              >
                {hartCount > 0 ? hartCount : ''}
              </Typography>
              {/* Particle burst on HART (CSS-only, level 11+) */}
              {hartAnimating && (post.author?.level || 0) >= 11 && (
                <>
                  {[0, 1, 2, 3].map((i) => (
                    <Box
                      key={i}
                      sx={{
                        position: 'absolute',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: '#FF6B6B',
                        left: '50%',
                        top: '50%',
                        pointerEvents: 'none',
                        '--tx': ['12px', '-10px', '8px', '-12px'][i],
                        '--ty': ['-14px', '-10px', '12px', '8px'][i],
                        animation: `${hartParticleBurst} 0.5s ${EASINGS.decelerate} forwards`,
                        opacity: 0,
                      }}
                    />
                  ))}
                </>
              )}
            </Box>

            {/* Comment count */}
            <Box
              onClick={(e) => e.stopPropagation()}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 0.4,
                borderRadius: RADIUS.pill,
                background: alpha(theme.palette.common.white, 0.03),
                color: alpha(theme.palette.common.white, 0.4),
                fontSize: '0.78rem',
                fontWeight: 500,
                transition: 'all 0.15s ease',
                '&:hover': {
                  background: alpha(theme.palette.common.white, 0.06),
                  color: alpha(theme.palette.common.white, 0.65),
                },
              }}
            >
              <ChatBubbleOutlineIcon sx={{fontSize: 20}} />
              <span>{post.comment_count || 0}</span>
            </Box>

            {/* Share button */}
            <IconButton
              size="small"
              onClick={handleShare}
              sx={{
                color: alpha(theme.palette.common.white, 0.4),
                p: 0.5,
                transition: 'all 0.15s ease',
                '&:hover': {
                  color: alpha(theme.palette.common.white, 0.7),
                  background: alpha(theme.palette.common.white, 0.06),
                },
              }}
            >
              <ShareIcon sx={{fontSize: 20}} />
            </IconButton>

            {/* Bookmark button */}
            <IconButton
              size="small"
              onClick={handleBookmark}
              sx={{
                color: bookmarked
                  ? '#FFAB00'
                  : alpha(theme.palette.common.white, 0.4),
                p: 0.5,
                transition: 'all 0.15s ease',
                '&:hover': {
                  color: bookmarked
                    ? '#FFD740'
                    : alpha(theme.palette.common.white, 0.7),
                  background: alpha(theme.palette.common.white, 0.06),
                },
              }}
            >
              {bookmarked ? (
                <BookmarkIcon sx={{fontSize: 20}} />
              ) : (
                <BookmarkBorderIcon sx={{fontSize: 20}} />
              )}
            </IconButton>

            <Box sx={{flex: 1}} />
            <BoostButton targetType="post" targetId={post.id} />
          </Box>
        </CardContent>
      </Card>
      <Snackbar
        open={voteError}
        autoHideDuration={3000}
        onClose={() => setVoteError(false)}
        message="Vote failed — please try again"
        anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
      />
      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        resourceType="post"
        resourceId={post.id}
        title={(post.content || '').slice(0, 60)}
      />
    </div>
  );
}
