import CommentForm from './CommentForm';

import {commentsApi} from '../../../services/socialApi';
import {
  socialTokens,
  RADIUS,
  SHADOWS,
  EASINGS,
  GRADIENTS,
} from '../../../theme/socialTokens';
import UserChip from '../shared/UserChip';
import VoteButtons from '../shared/VoteButtons';

import ReplyIcon from '@mui/icons-material/Reply';
import {Typography, Button, Collapse, Box, useTheme} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState} from 'react';

export default function CommentItem({comment, onReplyAdded}) {
  const theme = useTheme();
  const [score, setScore] = useState(comment.score || 0);
  const [userVote, setUserVote] = useState(comment.user_vote || 0);
  const [showReply, setShowReply] = useState(false);

  const handleUpvote = async () => {
    try {
      const res = await commentsApi.upvote(comment.id);
      if (res.data) {
        setScore(res.data.score !== undefined ? res.data.score : score + 1);
        setUserVote(1);
      }
    } catch (err) {
      /* ignore */
    }
  };

  const handleDownvote = async () => {
    try {
      const res = await commentsApi.downvote(comment.id);
      if (res.data) {
        setScore(res.data.score !== undefined ? res.data.score : score - 1);
        setUserVote(-1);
      }
    } catch (err) {
      /* ignore */
    }
  };

  const handleReply = async (text) => {
    const res = await commentsApi.reply(comment.id, {content: text});
    if (onReplyAdded) onReplyAdded(res.data);
    setShowReply(false);
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return '';
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        mb: 1.5,
        p: 1.5,
        borderRadius: RADIUS.md,
        ...socialTokens.glass.subtle(theme),
        transition: `all 0.25s ${EASINGS.smooth}`,
        '&:hover': {
          background: alpha(theme.palette.primary.main, 0.04),
          borderColor: alpha(theme.palette.primary.main, 0.15),
          transform: 'translateX(4px)',
        },
      }}
    >
      <VoteButtons
        score={score}
        userVote={userVote}
        onUpvote={handleUpvote}
        onDownvote={handleDownvote}
        size="small"
      />
      <Box sx={{flex: 1, minWidth: 0}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: '2px'}}>
          <UserChip user={comment.author} />
          <Typography
            sx={{
              fontSize: '0.75rem',
              color: alpha(theme.palette.common.white, 0.45),
            }}
          >
            {timeAgo(comment.created_at)}
          </Typography>
        </Box>
        <Typography
          variant="body2"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: alpha(theme.palette.common.white, 0.85),
          }}
        >
          {comment.content}
        </Typography>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mt: '4px'}}>
          <Button
            size="small"
            startIcon={<ReplyIcon sx={{fontSize: 16}} />}
            onClick={() => setShowReply(!showReply)}
            sx={{
              color: alpha(theme.palette.common.white, 0.5),
              fontWeight: 600,
              fontSize: '0.75rem',
              textTransform: 'none',
              borderRadius: RADIUS.sm,
              px: 1.5,
              transition: `all 0.2s ${EASINGS.smooth}`,
              '&:hover': {
                color: theme.palette.primary.main,
                background: alpha(theme.palette.primary.main, 0.08),
              },
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: theme.palette.primary.main,
                outlineOffset: 2,
              },
            }}
          >
            Reply
          </Button>
        </Box>
        <Collapse in={showReply}>
          <Box sx={{mt: 1}}>
            <CommentForm
              onSubmit={handleReply}
              placeholder="Write a reply..."
              autoFocus
            />
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
}
