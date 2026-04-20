import CommentForm from './CommentForm';
import CommentThread from './CommentThread';

import {postsApi, commentsApi} from '../../../services/socialApi';
import {
  socialTokens,
  RADIUS,
  SHADOWS,
  GRADIENTS,
  EASINGS,
} from '../../../theme/socialTokens';
import {useRoleAccess} from '../../RoleGuard';
import CommunityBadge from '../shared/CommunityBadge';
import UserChip from '../shared/UserChip';
import VoteButtons from '../shared/VoteButtons';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Divider,
  CircularProgress,
  Fade,
  Grow,
  Skeleton,
  Snackbar,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect} from 'react';
import {Helmet} from 'react-helmet-async';
import {useParams, useNavigate} from 'react-router-dom';

export default function PostDetailPage() {
  const {postId} = useParams();
  const navigate = useNavigate();
  const {canWrite} = useRoleAccess();
  const theme = useTheme();

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [score, setScore] = useState(0);
  const [userVote, setUserVote] = useState(0);
  const [snackMsg, setSnackMsg] = useState('');

  // Load post independently
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    postsApi
      .get(postId)
      .then((res) => {
        if (cancelled) return;
        const p = res.data;
        setPost(p);
        setScore(p.score || 0);
        setUserVote(p.user_vote || 0);
      })
      .catch(() => {
        if (!cancelled) setPost(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  // Load comments independently
  useEffect(() => {
    let cancelled = false;
    setCommentsLoading(true);
    commentsApi
      .getByPost(postId, {limit: 200})
      .then((res) => {
        if (!cancelled) setComments(res.data || []);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const handleUpvote = async () => {
    const prevScore = score;
    const prevVote = userVote;
    setScore((s) => s + 1);
    setUserVote(1);
    try {
      const res = await postsApi.upvote(postId);
      if (res.data && res.data.score !== undefined) {
        setScore(res.data.score);
      }
    } catch (err) {
      setScore(prevScore);
      setUserVote(prevVote);
      setSnackMsg('Vote failed. Please try again.');
    }
  };

  const handleDownvote = async () => {
    const prevScore = score;
    const prevVote = userVote;
    setScore((s) => s - 1);
    setUserVote(-1);
    try {
      const res = await postsApi.downvote(postId);
      if (res.data && res.data.score !== undefined) {
        setScore(res.data.score);
      }
    } catch (err) {
      setScore(prevScore);
      setUserVote(prevVote);
      setSnackMsg('Vote failed. Please try again.');
    }
  };

  const handleNewComment = async (text) => {
    try {
      const res = await commentsApi.create(postId, {content: text});
      setComments((prev) => [...prev, res.data]);
    } catch (err) {
      setSnackMsg('Failed to post comment. Please try again.');
    }
  };

  const handleReplyAdded = (newComment) => {
    setComments((prev) => [...prev, newComment]);
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  if (loading) {
    return (
      <Fade in timeout={300}>
        <Box textAlign="center" py={6}>
          <CircularProgress sx={{ color: '#6C63FF' }} />
        </Box>
      </Fade>
    );
  }

  if (!post) {
    return (
      <Fade in timeout={300}>
        <Box
          textAlign="center"
          py={8}
          sx={{
            ...socialTokens.glass.subtle(theme),
            borderRadius: RADIUS.lg,
            p: 4,
          }}
        >
          <Typography
            variant="h6"
            sx={{
              background: GRADIENTS.primary,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontWeight: 700,
              mb: 1,
            }}
          >
            Post not found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This post may have been removed or does not exist.
          </Typography>
        </Box>
      </Fade>
    );
  }

  const ogTitle =
    post.title || (post.content ? post.content.slice(0, 60) : 'Post');
  const ogDesc = (post.content || '').slice(0, 200);

  return (
    <Fade in timeout={400}>
      <Box>
        <Helmet>
          <title>{ogTitle} — Nunba</title>
          <meta property="og:title" content={ogTitle} />
          <meta property="og:description" content={ogDesc} />
          <meta property="og:type" content="article" />
          <meta
            property="og:url"
            content={`${window.location.origin}/social/post/${post.id}`}
          />
          <meta name="twitter:card" content="summary" />
          <meta name="twitter:title" content={ogTitle} />
          <meta name="twitter:description" content={ogDesc} />
        </Helmet>
        {/* Back button */}
        <Box sx={{display: 'flex', alignItems: 'center', mb: 2}}>
          <IconButton
            onClick={() => navigate(-1)}
            sx={{
              color: alpha(theme.palette.common.white, 0.7),
              transition: `all 0.2s ${EASINGS.smooth}`,
              '&:hover': {
                color: theme.palette.primary.main,
                background: alpha(theme.palette.primary.main, 0.08),
                transform: 'translateX(-3px)',
                boxShadow: `0 0 12px ${alpha(theme.palette.primary.main, 0.25)}`,
              },
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: theme.palette.primary.main,
                outlineOffset: 2,
              },
            }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              background: GRADIENTS.primary,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Post
          </Typography>
        </Box>

        {/* Main post card */}
        <Grow in timeout={500}>
          <Card
            elevation={0}
            sx={{
              display: 'flex',
              mb: 3,
              ...socialTokens.glass.subtle(theme),
              borderRadius: RADIUS.lg,
              boxShadow: SHADOWS.card,
              transition: `all 0.3s ${EASINGS.smooth}`,
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: SHADOWS.cardHover,
                borderColor: alpha(theme.palette.primary.main, 0.2),
              },
            }}
          >
            <Box sx={{p: 1, display: 'flex', alignItems: 'flex-start'}}>
              <VoteButtons
                score={score}
                userVote={userVote}
                onUpvote={canWrite ? handleUpvote : undefined}
                onDownvote={canWrite ? handleDownvote : undefined}
              />
            </Box>
            <CardContent sx={{flex: 1, minWidth: 0}}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  mb: 1,
                  flexWrap: 'wrap',
                }}
              >
                {post.community && (
                  <CommunityBadge community={post.community} />
                )}
                <UserChip user={post.author} />
                <Typography sx={{fontSize: '0.75rem', color: 'text.secondary'}}>
                  {timeAgo(post.created_at)}
                </Typography>
              </Box>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 800,
                  background: GRADIENTS.primary,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {post.title}
              </Typography>
              {post.content && (
                <Typography
                  variant="body1"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    mt: 1,
                    mb: 1,
                    color: alpha(theme.palette.common.white, 0.85),
                  }}
                >
                  {post.content}
                </Typography>
              )}
              <Typography
                variant="body2"
                sx={{
                  color: alpha(theme.palette.common.white, 0.5),
                  mt: 1,
                }}
              >
                {post.comment_count || 0} comments &middot;{' '}
                {post.view_count || 0} views
              </Typography>
            </CardContent>
          </Card>
        </Grow>

        {/* Comments section */}
        <Grow in timeout={600}>
          <Box
            sx={{
              mt: 2,
              ...socialTokens.glass.subtle(theme),
              borderRadius: RADIUS.lg,
              p: {xs: 2, md: 3},
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{
                mb: 2,
                fontWeight: 700,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: theme.palette.primary.main,
                  boxShadow: `0 0 10px ${theme.palette.primary.main}`,
                }}
              />
              Comments ({comments.length})
            </Typography>
            {canWrite && (
              <CommentForm
                onSubmit={handleNewComment}
                placeholder="Add a comment..."
              />
            )}
            <Divider
              sx={{
                mb: 2,
                borderColor: alpha(theme.palette.common.white, 0.06),
                borderImage: `linear-gradient(90deg, transparent, ${alpha(theme.palette.primary.main, 0.3)}, transparent) 1`,
              }}
            />
            {commentsLoading ? (
              <Box sx={{mt: 1}}>
                {[0, 1, 2].map((i) => (
                  <Box key={i} sx={{mb: 2}}>
                    <Box sx={{display: 'flex', gap: 1, mb: 0.5}}>
                      <Skeleton
                        variant="circular"
                        width={28}
                        height={28}
                        sx={{bgcolor: 'rgba(255,255,255,0.06)'}}
                        animation="wave"
                      />
                      <Skeleton
                        variant="text"
                        width="20%"
                        height={20}
                        sx={{bgcolor: 'rgba(255,255,255,0.06)'}}
                        animation="wave"
                      />
                    </Box>
                    <Skeleton
                      variant="text"
                      width="90%"
                      height={18}
                      sx={{bgcolor: 'rgba(255,255,255,0.06)'}}
                      animation="wave"
                    />
                    <Skeleton
                      variant="text"
                      width="60%"
                      height={18}
                      sx={{bgcolor: 'rgba(255,255,255,0.06)'}}
                      animation="wave"
                    />
                  </Box>
                ))}
              </Box>
            ) : (
              <CommentThread
                comments={comments}
                onReplyAdded={handleReplyAdded}
              />
            )}
          </Box>
        </Grow>

        <Snackbar
          open={!!snackMsg}
          autoHideDuration={4000}
          onClose={() => setSnackMsg('')}
          message={snackMsg}
        />
      </Box>
    </Fade>
  );
}
