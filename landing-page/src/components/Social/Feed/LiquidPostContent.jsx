/**
 * LiquidPostContent - Renders post.dynamic_layout JSON via SocialLiquidUI,
 * falling back to plain text when no layout is present.
 *
 * Usage:
 *   <LiquidPostContent post={post} sx={{ mt: 1 }} />
 */

import {socialTokens} from '../../../theme/socialTokens';
import {SocialLiquidUI} from '../../shared/LiquidUI';

import {Box, Typography, useTheme} from '@mui/material';
import React, {useMemo, useCallback} from 'react';
import {useNavigate} from 'react-router-dom';

/**
 * Determine whether a value is a valid dynamic_layout (non-null object or array).
 */
function isValidLayout(layout) {
  if (layout == null) return false;
  if (typeof layout === 'string') {
    try {
      const parsed = JSON.parse(layout);
      return typeof parsed === 'object' && parsed !== null;
    } catch {
      return false;
    }
  }
  return typeof layout === 'object';
}

/**
 * Parse dynamic_layout, accepting both object/array and JSON strings.
 */
function parseLayout(layout) {
  if (typeof layout === 'string') {
    try {
      return JSON.parse(layout);
    } catch {
      return null;
    }
  }
  return layout;
}

export default function LiquidPostContent({post, sx}) {
  const navigate = useNavigate();
  const theme = useTheme();

  // Bind post data to template variables for the Liquid layout
  const templateData = useMemo(
    () => ({
      author: post.author,
      intent: post.intent_category,
      hypothesis: post.hypothesis,
      outcome: post.expected_outcome,
      title: post.title,
      content: post.content,
    }),
    [
      post.author,
      post.intent_category,
      post.hypothesis,
      post.expected_outcome,
      post.title,
      post.content,
    ]
  );

  // Handle navigate / vote / comment actions emitted by the Liquid layout
  const handleAction = useCallback(
    (action) => {
      if (!action) return;
      const {type, payload} = action;
      switch (type) {
        case 'navigate':
          if (payload?.path) {
            navigate(payload.path);
          } else if (payload?.postId) {
            navigate(`/social/post/${payload.postId}`);
          }
          break;
        case 'vote':
          // Bubble up to parent via custom event so PostCard / ThoughtExperimentCard
          // can handle vote logic with their existing API calls.
          window.dispatchEvent(
            new CustomEvent('liquid:vote', {
              detail: {postId: post.id, ...payload},
            })
          );
          break;
        case 'comment':
          // Navigate to the post detail page focused on comments
          navigate(`/social/post/${post.id}#comments`);
          break;
        case 'poll_vote':
          // Dispatch poll vote event so parent components can handle it
          window.dispatchEvent(
            new CustomEvent('liquid:poll_vote', {
              detail: {postId: post.id, ...payload},
            })
          );
          break;
        case 'challenge_accept':
          // Navigate to the challenges page (optionally with specific challenge)
          navigate(
            payload?.challengeId
              ? `/social/challenges/${payload.challengeId}`
              : '/social/challenges'
          );
          break;
        case 'quiz_answer':
          // Log quiz answer locally via custom event
          window.dispatchEvent(
            new CustomEvent('liquid:quiz_answer', {
              detail: {postId: post.id, ...payload},
            })
          );
          break;
        default:
          // Unknown action type -- log for debugging, no-op
          if (process.env.NODE_ENV === 'development') {
            console.debug('[LiquidPostContent] unhandled action:', action);
          }
          break;
      }
    },
    [navigate, post.id]
  );

  const hasLayout = isValidLayout(post.dynamic_layout);
  const parsedLayout = hasLayout ? parseLayout(post.dynamic_layout) : null;

  return (
    <Box sx={{...sx}}>
      {parsedLayout ? (
        <SocialLiquidUI
          layout={parsedLayout}
          data={templateData}
          onAction={handleAction}
        />
      ) : (
        <Typography
          variant="body2"
          sx={{
            color: theme.palette.text.secondary,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 6,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {post.content}
        </Typography>
      )}
    </Box>
  );
}
