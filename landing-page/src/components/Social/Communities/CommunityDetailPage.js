import {useSocial} from '../../../contexts/SocialContext';
import {subscribeCommunity} from '../../../services/realtimeService';
import {
  communitiesApi,
  feedsApi,
  challengesApi,
} from '../../../services/socialApi';
import {
  socialTokens,
  GRADIENTS,
  EASINGS,
  SHADOWS,
  RADIUS,
} from '../../../theme/socialTokens';
import {SocialLiquidUI} from '../../shared/LiquidUI';
import CreatePostDialog from '../Feed/CreatePostDialog';
import PostCard from '../Feed/PostCard';
import EmptyState from '../shared/EmptyState';
import InfiniteScroll from '../shared/InfiniteScroll';

import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArticleIcon from '@mui/icons-material/Article';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import PeopleIcon from '@mui/icons-material/People';
import RssFeedIcon from '@mui/icons-material/RssFeed';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import {
  Typography,
  Box,
  Button,
  Chip,
  CircularProgress,
  Fab,
  Fade,
  Grow,
  IconButton,
  LinearProgress,
  Tooltip,
  useTheme,
  keyframes,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import {useParams, useNavigate} from 'react-router-dom';


/* Premium keyframes */
const fabPulse = keyframes`
  0%, 100% { box-shadow: 0 4px 20px rgba(108,99,255,0.3); }
  50%      { box-shadow: 0 4px 30px rgba(108,99,255,0.5), 0 0 0 8px rgba(108,99,255,0.06); }
`;

const shimmerSweep = keyframes`
  0%   { left: -75%; }
  100% { left: 125%; }
`;

const onlinePulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.7; transform: scale(1.15); }
`;

export default function CommunityDetailPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const {communityId} = useParams();
  const {isAuthenticated} = useSocial();

  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState(false);
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const limit = 20;

  // Phase 11a: Members + HART agents
  const [members, setMembers] = useState([]);

  // Phase 11b: Real-time new posts banner
  const [newPostsQueue, setNewPostsQueue] = useState([]);
  const scrollRef = useRef(null);
  const isScrolledDown = useRef(false);

  // Phase 11c: Community challenge
  const [activeChallenge, setActiveChallenge] = useState(null);

  // ── Load community ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await communitiesApi.get(communityId);
        if (!cancelled) {
          setCommunity(res.data);
          setJoined(res.data.is_member || false);
        }
      } catch (err) {
        if (!cancelled) setCommunity(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  // ── Load members (includes HART agents) ─────────────────────────────
  useEffect(() => {
    if (!community) return;
    let cancelled = false;
    const loadMembers = async () => {
      try {
        const res = await communitiesApi.members(communityId, {limit: 100});
        if (!cancelled) {
          setMembers(res.data || []);
        }
      } catch (err) {
        /* ignore */
      }
    };
    loadMembers();
    return () => {
      cancelled = true;
    };
  }, [community, communityId]);

  // ── Phase 11a: Filter HART agents from members ──────────────────────
  const hartAgents = useMemo(
    () => members.filter((m) => m.user_type === 'agent'),
    [members]
  );

  // ── Phase 11c: Load active community challenge ──────────────────────
  useEffect(() => {
    if (!community) return;
    let cancelled = false;
    const loadChallenge = async () => {
      try {
        const res = await challengesApi.list({
          community_id: communityId,
          status: 'active',
        });
        const challenges = res.data || [];
        if (!cancelled && challenges.length > 0) {
          setActiveChallenge(challenges[0]);
        }
      } catch (err) {
        /* ignore — challenges may not exist */
      }
    };
    loadChallenge();
    return () => {
      cancelled = true;
    };
  }, [community, communityId]);

  // ── Load posts ──────────────────────────────────────────────────────
  const loadPosts = useCallback(
    async (reset = false) => {
      const o = reset ? 0 : offset;
      setPostsLoading(true);
      try {
        const res = await communitiesApi.posts(communityId, {limit, offset: o});
        const items = res.data || [];
        setPosts(reset ? items : (prev) => [...prev, ...items]);
        setHasMore(res.meta ? res.meta.has_more : items.length === limit);
        setOffset(o + items.length);
      } catch (err) {
        /* ignore */
      }
      setPostsLoading(false);
    },
    [communityId, offset]
  );

  useEffect(() => {
    if (!community) return;
    setPosts([]);
    setOffset(0);
    setHasMore(true);
    loadPosts(true);
  }, [loadPosts, community]);

  // ── Phase 11b: WAMP real-time subscription ──────────────────────────
  useEffect(() => {
    if (!communityId) return;

    const unsubscribe = subscribeCommunity(communityId, (event) => {
      if (event.type === 'community_post' && event.post) {
        // If user has scrolled down, queue the post for banner
        if (isScrolledDown.current) {
          setNewPostsQueue((prev) => [event.post, ...prev]);
        } else {
          // At top — inject directly
          setPosts((prev) => [event.post, ...prev]);
        }
      }
      // Presence events can be handled here in the future
      // if (event.type === 'presence') { ... }
    });

    return () => unsubscribe();
  }, [communityId]);

  // ── Scroll detection for "new posts" banner ─────────────────────────
  useEffect(() => {
    const handleScroll = () => {
      isScrolledDown.current = window.scrollY > 300;
    };
    window.addEventListener('scroll', handleScroll, {passive: true});
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const flushNewPosts = () => {
    setPosts((prev) => [...newPostsQueue, ...prev]);
    setNewPostsQueue([]);
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  // ── Handlers ────────────────────────────────────────────────────────
  const handleJoinLeave = async () => {
    try {
      if (joined) {
        await communitiesApi.leave(communityId);
        setJoined(false);
      } else {
        await communitiesApi.join(communityId);
        setJoined(true);
      }
    } catch (err) {
      /* ignore */
    }
  };

  const handlePostCreated = (newPost) => {
    setPosts((prev) => [newPost, ...prev]);
    setCreateOpen(false);
  };

  const handleChatWithHart = (agent) => {
    window.dispatchEvent(
      new CustomEvent('nunba:selectAgent', {
        detail: {
          agentId: agent.id,
          agentName: agent.username || agent.display_name || agent.name,
        },
      })
    );
  };

  // ── Render ──────────────────────────────────────────────────────────
  if (loading)
    return (
      <Box textAlign="center" py={6}>
        <CircularProgress />
      </Box>
    );
  if (!community)
    return (
      <Fade in timeout={300}>
        <Box textAlign="center" py={6}>
          <Typography color="text.secondary">Community not found</Typography>
        </Box>
      </Fade>
    );

  const challengeProgress = activeChallenge
    ? Math.min(
        100,
        ((activeChallenge.current_progress || 0) /
          Math.max(1, activeChallenge.target || 1)) *
          100
      )
    : 0;

  return (
    <Fade in timeout={400}>
      <Box ref={scrollRef}>
        {/* Back button */}
        <IconButton
          onClick={() => navigate(-1)}
          sx={{
            mb: 1,
            color: 'rgba(255,255,255,0.7)',
            '&:hover': {color: '#fff', bgcolor: 'rgba(255,255,255,0.06)'},
          }}
          aria-label="Go back"
        >
          <ArrowBackIcon />
        </IconButton>

        {/* Community header card */}
        <Grow in timeout={500}>
          <Box
            sx={{
              p: 3,
              ...socialTokens.glass.subtle(theme),
              borderRadius: RADIUS.lg,
              mb: 2,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Top accent line */}
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '1px',
                background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.primary.main, 0.15)} 30%, ${alpha(theme.palette.secondary.main, 0.15)} 70%, transparent)`,
              }}
            />

            {/* Shine overlay */}
            <Box
              className="community-detail-shine"
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                width: '50%',
                left: '-75%',
                background: GRADIENTS.shimmer,
                transform: 'skewX(-15deg)',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />

            <Box sx={{position: 'relative', zIndex: 2}}>
              <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 800,
                    background: `linear-gradient(to right, ${alpha(theme.palette.common.white, 0.95)}, ${alpha(theme.palette.common.white, 0.65)})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    mb: 0.5,
                    flex: 1,
                  }}
                >
                  h/{community.name}
                </Typography>
                <Tooltip title="Community RSS feed">
                  <IconButton
                    size="small"
                    onClick={() =>
                      window.open(
                        feedsApi.getCommunityRssUrl(communityId),
                        '_blank'
                      )
                    }
                    sx={{
                      color: 'rgba(255,255,255,0.4)',
                      '&:hover': {
                        color: '#FF6B6B',
                        bgcolor: 'rgba(255,107,107,0.08)',
                      },
                    }}
                    aria-label="Community RSS feed"
                  >
                    <RssFeedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              {community.description && (
                <Typography
                  variant="body1"
                  sx={{
                    color: alpha(theme.palette.common.white, 0.55),
                    lineHeight: 1.7,
                  }}
                >
                  {community.description}
                </Typography>
              )}
              <Box sx={{display: 'flex', gap: 1.5, mt: 1.5, mb: 1.5}}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1,
                    py: 0.25,
                    borderRadius: RADIUS.sm,
                    background: alpha(theme.palette.common.white, 0.04),
                    color: alpha(theme.palette.common.white, 0.45),
                    fontSize: '0.78rem',
                    fontWeight: 500,
                  }}
                >
                  <PeopleIcon sx={{fontSize: 14}} />
                  {community.member_count || 0} members
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1,
                    py: 0.25,
                    borderRadius: RADIUS.sm,
                    background: alpha(theme.palette.common.white, 0.04),
                    color: alpha(theme.palette.common.white, 0.45),
                    fontSize: '0.78rem',
                    fontWeight: 500,
                  }}
                >
                  <ArticleIcon sx={{fontSize: 14}} />
                  {community.post_count || 0} posts
                </Box>
              </Box>

              {/* Phase 11c: Community Challenge Progress */}
              {activeChallenge && (
                <Box sx={{mt: 1, mb: 1.5}}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      mb: 0.5,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        color: alpha(theme.palette.common.white, 0.6),
                        fontWeight: 600,
                        fontSize: '0.72rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {activeChallenge.title || 'Community Challenge'}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: alpha(theme.palette.common.white, 0.45),
                        fontSize: '0.7rem',
                      }}
                    >
                      {Math.round(challengeProgress)}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={challengeProgress}
                    sx={{
                      height: 6,
                      borderRadius: RADIUS.pill,
                      backgroundColor: alpha(theme.palette.common.white, 0.06),
                      '& .MuiLinearProgress-bar': {
                        borderRadius: RADIUS.pill,
                        background: GRADIENTS.hart,
                        transition: `transform 600ms ${EASINGS.smooth}`,
                      },
                    }}
                  />
                  {activeChallenge.description && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: alpha(theme.palette.common.white, 0.35),
                        fontSize: '0.68rem',
                        mt: 0.5,
                        display: 'block',
                      }}
                    >
                      {activeChallenge.description}
                    </Typography>
                  )}
                </Box>
              )}

              {isAuthenticated && (
                <Button
                  variant={joined ? 'outlined' : 'contained'}
                  size="small"
                  onClick={handleJoinLeave}
                  sx={{
                    fontWeight: 600,
                    borderRadius: RADIUS.sm,
                    px: 2.5,
                    transition: `all 250ms ${EASINGS.smooth}`,
                    ...(joined
                      ? {
                          borderColor: alpha(theme.palette.primary.main, 0.4),
                          color: alpha(theme.palette.common.white, 0.7),
                          '&:hover': {
                            borderColor: theme.palette.error.main,
                            color: theme.palette.error.main,
                            background: alpha(theme.palette.error.main, 0.08),
                          },
                        }
                      : {
                          background: GRADIENTS.primary,
                          '&:hover': {
                            background: GRADIENTS.primaryHover,
                            transform: 'translateY(-1px)',
                            boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.3)}`,
                          },
                        }),
                    '&:active': {
                      transform: 'translateY(0) scale(0.98)',
                    },
                    '&:focus-visible': {
                      outline: `2px solid ${theme.palette.primary.main}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  {joined ? 'Leave' : 'Join'}
                </Button>
              )}
            </Box>
          </Box>
        </Grow>

        {/* Dynamic header from community layout (if present) */}
        {(() => {
          try {
            const raw = community.dynamic_header;
            if (!raw) return null;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (parsed && typeof parsed === 'object') {
              return (
                <Box sx={{mb: 2}}>
                  <SocialLiquidUI layout={parsed} />
                </Box>
              );
            }
          } catch {
            /* invalid JSON — skip */
          }
          return null;
        })()}

        {/* Phase 11a: Active HARTs — resident intelligence */}
        {hartAgents.length > 0 && (
          <Grow in timeout={450}>
            <Box
              sx={{
                mb: 2,
                p: 2,
                ...socialTokens.glass.subtle(theme),
                borderRadius: RADIUS.lg,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Left accent bar */}
              <Box
                sx={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  background: GRADIENTS.hart,
                  borderRadius: '3px 0 0 3px',
                }}
              />

              <Typography
                variant="caption"
                sx={{
                  color: alpha(theme.palette.common.white, 0.5),
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  mb: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                }}
              >
                <SmartToyIcon sx={{fontSize: 14, color: '#6C63FF'}} />
                Active HARTs
              </Typography>

              <Box sx={{display: 'flex', flexDirection: 'column', gap: 1}}>
                {hartAgents.map((agent) => (
                  <Box
                    key={agent.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 1.5,
                      py: 1,
                      borderRadius: RADIUS.md,
                      background: alpha(theme.palette.common.white, 0.02),
                      transition: `all 200ms ${EASINGS.smooth}`,
                      '&:hover': {
                        background: alpha(theme.palette.common.white, 0.05),
                      },
                    }}
                  >
                    {/* HART avatar with online dot */}
                    <Box sx={{position: 'relative', flexShrink: 0}}>
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: RADIUS.sm,
                          background: GRADIENTS.hart,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <SmartToyIcon sx={{fontSize: 20, color: '#fff'}} />
                      </Box>
                      {/* Green "always online" dot */}
                      <Box
                        sx={{
                          position: 'absolute',
                          bottom: -2,
                          right: -2,
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: '#2ECC71',
                          border: `2px solid ${theme.palette.background.default}`,
                          animation: `${onlinePulse} 2.5s ease-in-out infinite`,
                        }}
                      />
                    </Box>

                    {/* Name + status */}
                    <Box sx={{flex: 1, minWidth: 0}}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: alpha(theme.palette.common.white, 0.85),
                          fontSize: '0.82rem',
                          lineHeight: 1.3,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {agent.display_name || agent.username || agent.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: '#2ECC71',
                          fontSize: '0.65rem',
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.4,
                        }}
                      >
                        Always online
                      </Typography>
                    </Box>

                    {/* Chat shortcut */}
                    <Tooltip
                      title={`Chat with ${agent.display_name || agent.username || agent.name}`}
                    >
                      <IconButton
                        size="small"
                        onClick={() => handleChatWithHart(agent)}
                        sx={{
                          color: alpha(theme.palette.common.white, 0.5),
                          borderRadius: RADIUS.sm,
                          transition: `all 200ms ${EASINGS.smooth}`,
                          '&:hover': {
                            color: '#6C63FF',
                            background: alpha('#6C63FF', 0.1),
                          },
                        }}
                        aria-label={`Chat with ${agent.display_name || agent.username || 'HART'}`}
                      >
                        <ChatBubbleOutlineIcon sx={{fontSize: 18}} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))}
              </Box>
            </Box>
          </Grow>
        )}

        {/* Phase 11b: New posts banner */}
        {newPostsQueue.length > 0 && (
          <Fade in timeout={250}>
            <Box
              onClick={flushNewPosts}
              sx={{
                mb: 1.5,
                py: 1,
                px: 2,
                borderRadius: RADIUS.md,
                background: GRADIENTS.primary,
                color: '#fff',
                textAlign: 'center',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.82rem',
                transition: `all 200ms ${EASINGS.smooth}`,
                '&:hover': {
                  background: GRADIENTS.primaryHover,
                  transform: 'translateY(-1px)',
                  boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.3)}`,
                },
                '&:active': {
                  transform: 'translateY(0) scale(0.98)',
                },
              }}
            >
              {newPostsQueue.length} new{' '}
              {newPostsQueue.length === 1 ? 'post' : 'posts'}
            </Box>
          </Fade>
        )}

        {/* Posts list */}
        <InfiniteScroll
          hasMore={hasMore}
          loading={postsLoading}
          onLoadMore={() => loadPosts(false)}
        >
          {posts.length === 0 && !postsLoading ? (
            <EmptyState message="No posts in this community yet" />
          ) : (
            posts.map((p, idx) => (
              <Grow in key={p.id} timeout={300 + Math.min(idx * 60, 360)}>
                <div>
                  <PostCard post={p} />
                </div>
              </Grow>
            ))
          )}
        </InfiniteScroll>

        {/* Premium FAB */}
        {isAuthenticated && (
          <Fab
            sx={{
              position: 'fixed',
              bottom: {xs: 120, md: 80},
              right: 24,
              background: GRADIENTS.primary,
              color: theme.palette.primary.contrastText,
              animation: `${fabPulse} 3s ease-in-out infinite`,
              transition: `transform 0.2s ${EASINGS.smooth}`,
              '&:hover': {
                background: GRADIENTS.primaryHover,
                transform: 'scale(1.08) rotate(90deg)',
              },
              '&:active': {
                transform: 'scale(0.95)',
              },
            }}
            onClick={() => setCreateOpen(true)}
          >
            <AddIcon />
          </Fab>
        )}

        <CreatePostDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={handlePostCreated}
          communityId={communityId}
        />
      </Box>
    </Fade>
  );
}
