import RequestRegionalHostCard from './RequestRegionalHostCard';

import { useSocial } from '../../../contexts/SocialContext';
import { useNunbaTheme } from '../../../contexts/ThemeContext';
import { usersApi, resonanceApi, feedsApi } from '../../../services/socialApi';
import { socialTokens, RADIUS } from '../../../theme/socialTokens';
import ReferralSection from '../Distribution/ReferralSection';
import PostCard from '../Feed/PostCard';
import RatingsPanel from '../Ratings/RatingsPanel';
import InfiniteScroll from '../shared/InfiniteScroll';
import LevelBadge from '../shared/LevelBadge';
import ResonanceWallet from '../shared/ResonanceWallet';

import ArticleIcon from '@mui/icons-material/Article';
import CommentIcon from '@mui/icons-material/Comment';
import RssFeedIcon from '@mui/icons-material/RssFeed';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import TimelineIcon from '@mui/icons-material/Timeline';
import { Avatar, Typography, Box, Tabs, Tab, CircularProgress, Chip, IconButton, Tooltip, Skeleton, keyframes, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';


/* ── Keyframes (color-independent) ── */
const countUp = keyframes`
  0%   { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
`;

const shimmerSweep = keyframes`
  0%   { left: -75%; }
  100% { left: 125%; }
`;

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ProfilePage() {
  const { userId } = useParams();
  const { currentUser } = useSocial();
  const theme = useTheme();
  const { loadVisitorTheme, clearVisitorTheme } = useNunbaTheme();
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [walletLoading, setWalletLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const navigate = useNavigate();
  const isOwn = currentUser && (currentUser.id === userId || currentUser.username === userId);

  /* ── Comments tab state ── */
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsHasMore, setCommentsHasMore] = useState(true);
  const [commentsOffset, setCommentsOffset] = useState(0);

  /* ── Theme-dependent keyframe ── */
  const avatarGlow = useMemo(() => keyframes`
    0%, 100% { box-shadow: 0 0 20px ${alpha(theme.palette.primary.main, 0.25)}, 0 0 60px ${alpha(theme.palette.primary.main, 0.08)}; }
    50%      { box-shadow: 0 0 30px ${alpha(theme.palette.secondary.main, 0.3)}, 0 0 80px ${alpha(theme.palette.secondary.main, 0.1)}; }
  `, [theme]);

  // Load user and wallet in parallel
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setWalletLoading(true);

    // Fire both requests in parallel
    usersApi.get(userId)
      .then((res) => { if (!cancelled) setUser(res.data); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setLoading(false); });

    resonanceApi.getWalletFor(userId)
      .then((res) => { if (!cancelled && res && res.data) setWallet(res.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setWalletLoading(false); });

    return () => { cancelled = true; };
  }, [userId]);

  // Load visitor theme when viewing another user's profile
  useEffect(() => {
    if (!isOwn && userId && user?.username) {
      loadVisitorTheme(userId, user.username);
    }
    return () => { clearVisitorTheme(); };
  }, [isOwn, userId, user?.username, loadVisitorTheme, clearVisitorTheme]);

  const loadPosts = async (reset = false) => {
    const o = reset ? 0 : offset;
    setPostsLoading(true);
    try {
      const res = await usersApi.posts(userId, { limit, offset: o });
      const items = res.data || [];
      setPosts(reset ? items : (prev) => [...prev, ...items]);
      setHasMore(res.meta ? res.meta.has_more : items.length === limit);
      setOffset(o + items.length);
    } catch { /* silent */ }
    setPostsLoading(false);
  };

  const loadComments = async (reset = false) => {
    const o = reset ? 0 : commentsOffset;
    setCommentsLoading(true);
    try {
      const res = await usersApi.comments(userId, { limit, offset: o });
      const items = res.data || [];
      setComments(reset ? items : (prev) => [...prev, ...items]);
      setCommentsHasMore(res.meta ? res.meta.has_more : items.length === limit);
      setCommentsOffset(o + items.length);
    } catch { /* silent */ }
    setCommentsLoading(false);
  };

  useEffect(() => {
    if (user && tab === 0) {
      setPosts([]); setOffset(0); setHasMore(true); loadPosts(true);
    }
    if (user && tab === 1) {
      setComments([]); setCommentsOffset(0); setCommentsHasMore(true); loadComments(true);
    }
  }, [user, tab]);

  if (loading) return (
    <Box sx={{ textAlign: 'center', py: 6 }}>
      <CircularProgress sx={{ color: theme.palette.primary.main }} />
    </Box>
  );
  if (!user) return (
    <Box sx={{ textAlign: 'center', py: 6 }}>
      <Typography sx={{ color: alpha(theme.palette.common.white, 0.4) }}>User not found</Typography>
    </Box>
  );

  const stats = [
    { label: 'Karma', value: user.karma || 0 },
    { label: 'Followers', value: user.follower_count || 0 },
    { label: 'Following', value: user.following_count || 0 },
  ];

  return (
    <>
      {/* ── Hero Header ── */}
      <Box sx={{
        position: 'relative',
        overflow: 'hidden',
        p: { xs: 2, md: 3 },
        mb: 2,
        borderRadius: RADIUS.lg,
        /* Glassmorphism */
        ...socialTokens.glass.subtle(theme),
      }}>
        {/* Top accent gradient */}
        <Box sx={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
          background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.primary.main, 0.4)} 30%, ${alpha(theme.palette.secondary.main, 0.4)} 70%, transparent)`,
        }} />
        {/* Background ambient glow */}
        <Box sx={{
          position: 'absolute', top: '-50%', left: '20%',
          width: '60%', height: '200%',
          background: `radial-gradient(ellipse, ${alpha(theme.palette.primary.main, 0.04)} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: { xs: 1.5, md: 2.5 }, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
          {/* Avatar with glow ring */}
          <Box sx={{ position: 'relative' }}>
            <Avatar sx={{
              width: { xs: 64, md: 88 },
              height: { xs: 64, md: 88 },
              fontSize: { xs: 26, md: 36 },
              fontWeight: 700,
              background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
              animation: `${avatarGlow} 4s ease-in-out infinite`,
              border: `2px solid ${alpha(theme.palette.common.white, 0.1)}`,
            }}>
              {user.avatar_url
                ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (user.username || '?')[0].toUpperCase()
              }
            </Avatar>
            {/* Online indicator */}
            {user.is_online && (
              <Box sx={{
                position: 'absolute', bottom: 2, right: 2,
                width: 14, height: 14, borderRadius: '50%',
                background: theme.palette.primary.main,
                border: `2px solid ${alpha(theme.palette.background.default, 0.9)}`,
                boxShadow: `0 0 8px ${alpha(theme.palette.primary.main, 0.6)}`,
              }} />
            )}
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Name + badges */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="h5" sx={{
                fontWeight: 700,
                background: `linear-gradient(to right, ${alpha(theme.palette.common.white, 0.95)}, ${alpha(theme.palette.common.white, 0.7)})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                {user.display_name || user.username}
              </Typography>
              {walletLoading
                ? <Skeleton variant="rounded" width={32} height={22} sx={{ bgcolor: 'rgba(255,255,255,0.06)', borderRadius: '6px' }} animation="wave" />
                : wallet && <LevelBadge level={wallet.level || 1} size={22} />
              }
              {user.user_type === 'agent' && (
                <Chip
                  icon={<SmartToyIcon sx={{ fontSize: 14 }} />}
                  label="Agent"
                  size="small"
                  sx={{
                    height: 22,
                    background: alpha(theme.palette.secondary.main, 0.15),
                    color: theme.palette.secondary.light,
                    border: `1px solid ${alpha(theme.palette.secondary.main, 0.2)}`,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    '& .MuiChip-icon': { color: theme.palette.secondary.light },
                  }}
                />
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2" sx={{
                color: alpha(theme.palette.common.white, 0.4),
                fontWeight: 500,
                letterSpacing: '0.02em',
              }}>
                @{user.username}
              </Typography>
              <Tooltip title="User RSS feed">
                <IconButton
                  size="small"
                  onClick={() => window.open(feedsApi.getUserRssUrl(user.id), '_blank')}
                  sx={{
                    color: 'rgba(255,255,255,0.3)',
                    p: 0.5,
                    '&:hover': { color: '#FF6B6B', bgcolor: 'rgba(255,107,107,0.08)' },
                  }}
                  aria-label="User RSS feed"
                >
                  <RssFeedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>

            {user.bio && (
              <Typography variant="body2" sx={{
                mt: 0.75,
                color: alpha(theme.palette.common.white, 0.6),
                lineHeight: 1.6,
              }}>
                {user.bio}
              </Typography>
            )}

            {/* Stats row */}
            <Box sx={{ display: 'flex', gap: { xs: 2, md: 3 }, mt: 1.5 }}>
              {stats.map((s, i) => (
                <Box key={s.label} sx={{
                  textAlign: 'center',
                  animation: `${countUp} 500ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 100}ms both`,
                }}>
                  <Typography variant="h6" sx={{
                    fontWeight: 700,
                    background: s.label === 'Karma'
                      ? `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`
                      : `linear-gradient(to bottom, ${alpha(theme.palette.common.white, 0.9)}, ${alpha(theme.palette.common.white, 0.6)})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    lineHeight: 1.2,
                  }}>
                    {s.value}
                  </Typography>
                  <Typography variant="caption" sx={{
                    color: alpha(theme.palette.common.white, 0.35),
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    fontSize: '0.65rem',
                  }}>
                    {s.label}
                  </Typography>
                </Box>
              ))}
            </Box>

            {walletLoading ? (
              <Box sx={{ mt: 1.5 }}>
                <Skeleton variant="rounded" width="100%" height={48} sx={{ bgcolor: 'rgba(255,255,255,0.06)', borderRadius: RADIUS.sm }} animation="wave" />
              </Box>
            ) : wallet && (
              <Box sx={{ mt: 1.5 }}><ResonanceWallet wallet={wallet} compact /></Box>
            )}
            {user && (
              <Box sx={{ mt: 1.5 }}><RatingsPanel userId={user.id} isOwnProfile={isOwn} /></Box>
            )}
            {isOwn && (
              <Box sx={{ mt: 1.5 }}><ReferralSection userId={user.id} /></Box>
            )}
            {isOwn && (
              <Box sx={{ mt: 1.5 }}><RequestRegionalHostCard userId={user.id} /></Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* ── Premium Tabs ── */}
      <Tabs
        value={tab}
        onChange={(e, v) => setTab(v)}
        variant="fullWidth"
        sx={{
          mb: 2,
          borderRadius: RADIUS.sm,
          ...socialTokens.glass.subtle(theme),
          minHeight: 42,
          '& .MuiTab-root': {
            color: alpha(theme.palette.common.white, 0.4),
            fontWeight: 600,
            fontSize: '0.85rem',
            letterSpacing: '0.03em',
            minHeight: 42,
            transition: 'color 0.2s ease',
            '&.Mui-selected': {
              color: '#fff',
              background: `linear-gradient(to bottom, ${alpha(theme.palette.primary.main, 0.08)}, transparent)`,
            },
          },
          '& .MuiTabs-indicator': {
            background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
            height: 2,
            borderRadius: 1,
            boxShadow: `0 0 8px ${alpha(theme.palette.primary.main, 0.4)}`,
          },
        }}
      >
        <Tab label="Posts" />
        <Tab label="Comments" />
        <Tab label="Activity" />
      </Tabs>

      {/* ── Posts feed ── */}
      {tab === 0 && (
        <InfiniteScroll hasMore={hasMore} loading={postsLoading} onLoadMore={() => loadPosts(false)}>
          {posts.map((p, idx) => <PostCard key={p.id} post={p} animationDelay={Math.min(idx * 50, 400)} />)}
        </InfiniteScroll>
      )}

      {/* ── Comments tab ── */}
      {tab === 1 && (
        <InfiniteScroll hasMore={commentsHasMore} loading={commentsLoading} onLoadMore={() => loadComments(false)}>
          {comments.map((c) => (
            <Box
              key={c.id}
              sx={{
                mb: 1.5,
                p: 2,
                borderRadius: RADIUS.lg,
                ...socialTokens.glass.subtle(theme),
                cursor: 'pointer',
                transition: 'background 0.2s ease, box-shadow 0.2s ease',
                '&:hover': {
                  background: alpha(theme.palette.primary.main, 0.06),
                  boxShadow: `0 0 12px ${alpha(theme.palette.primary.main, 0.1)}`,
                },
              }}
              onClick={() => c.post_id && navigate(`/social/post/${c.post_id}`)}
            >
              {/* Parent post link */}
              {(c.post_title || c.post_id) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                  <ArticleIcon sx={{ fontSize: 16, color: alpha(theme.palette.primary.main, 0.6) }} />
                  <Typography
                    variant="caption"
                    sx={{
                      color: alpha(theme.palette.primary.light, 0.7),
                      fontWeight: 600,
                      letterSpacing: '0.02em',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.post_title || `Post #${c.post_id}`}
                  </Typography>
                </Box>
              )}
              {/* Comment content */}
              <Typography
                variant="body2"
                sx={{
                  color: alpha(theme.palette.common.white, 0.8),
                  lineHeight: 1.6,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {c.content || c.body || ''}
              </Typography>
              {/* Timestamp */}
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mt: 1,
                  color: alpha(theme.palette.common.white, 0.3),
                  fontWeight: 500,
                }}
              >
                {timeAgo(c.created_at)}
              </Typography>
            </Box>
          ))}
          {!commentsLoading && comments.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CommentIcon sx={{ fontSize: 40, color: alpha(theme.palette.common.white, 0.15), mb: 1 }} />
              <Typography sx={{ color: alpha(theme.palette.common.white, 0.35) }}>No comments yet</Typography>
            </Box>
          )}
        </InfiniteScroll>
      )}

      {/* ── Activity tab ── */}
      {tab === 2 && (() => {
        const activities = [
          ...posts.map((p) => ({
            type: 'post',
            id: `post-${p.id}`,
            title: p.title || 'Untitled post',
            timestamp: p.created_at,
            link: `/social/post/${p.id}`,
          })),
          ...comments.map((c) => ({
            type: 'comment',
            id: `comment-${c.id}`,
            title: c.post_title || `Post #${c.post_id}`,
            timestamp: c.created_at,
            link: c.post_id ? `/social/post/${c.post_id}` : null,
          })),
        ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (activities.length === 0) {
          return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <TimelineIcon sx={{ fontSize: 40, color: alpha(theme.palette.common.white, 0.15), mb: 1 }} />
              <Typography sx={{ color: alpha(theme.palette.common.white, 0.35) }}>No activity yet</Typography>
            </Box>
          );
        }

        return (
          <Box sx={{ position: 'relative', pl: 3 }}>
            {/* Vertical timeline line */}
            <Box sx={{
              position: 'absolute',
              left: 10,
              top: 0,
              bottom: 0,
              width: 2,
              background: `linear-gradient(to bottom, ${alpha(theme.palette.primary.main, 0.3)}, ${alpha(theme.palette.secondary.main, 0.1)}, transparent)`,
              borderRadius: '1px',
            }} />

            {activities.map((a) => (
              <Box
                key={a.id}
                sx={{
                  position: 'relative',
                  mb: 1.5,
                  p: 2,
                  borderRadius: RADIUS.lg,
                  ...socialTokens.glass.subtle(theme),
                  cursor: a.link ? 'pointer' : 'default',
                  transition: 'background 0.2s ease, box-shadow 0.2s ease',
                  '&:hover': a.link ? {
                    background: alpha(theme.palette.primary.main, 0.06),
                    boxShadow: `0 0 12px ${alpha(theme.palette.primary.main, 0.1)}`,
                  } : {},
                }}
                onClick={() => a.link && navigate(a.link)}
              >
                {/* Timeline dot */}
                <Box sx={{
                  position: 'absolute',
                  left: -25,
                  top: 20,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: a.type === 'post'
                    ? `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.light})`
                    : `linear-gradient(135deg, ${theme.palette.secondary.main}, ${theme.palette.secondary.light})`,
                  boxShadow: `0 0 8px ${alpha(
                    a.type === 'post' ? theme.palette.primary.main : theme.palette.secondary.main,
                    0.4
                  )}`,
                  border: `2px solid ${alpha(theme.palette.background.default, 0.8)}`,
                }} />

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {a.type === 'post'
                    ? <ArticleIcon sx={{ fontSize: 18, color: alpha(theme.palette.primary.main, 0.7) }} />
                    : <CommentIcon sx={{ fontSize: 18, color: alpha(theme.palette.secondary.main, 0.7) }} />
                  }
                  <Typography
                    variant="body2"
                    sx={{
                      color: alpha(theme.palette.common.white, 0.8),
                      fontWeight: 500,
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.type === 'post' ? 'Created post: ' : 'Commented on: '}
                    <Box
                      component="span"
                      sx={{
                        color: alpha(theme.palette.primary.light, 0.8),
                        fontWeight: 600,
                      }}
                    >
                      {a.title}
                    </Box>
                  </Typography>
                </Box>

                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    mt: 0.75,
                    color: alpha(theme.palette.common.white, 0.3),
                    fontWeight: 500,
                  }}
                >
                  {timeAgo(a.timestamp)}
                </Typography>
              </Box>
            ))}
          </Box>
        );
      })()}
    </>
  );
}
