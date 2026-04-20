import CommentItem from './CommentItem';

import {RADIUS, EASINGS} from '../../../theme/socialTokens';

import {Box, Grow, useTheme} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React from 'react';

export default function CommentThread({comments, onReplyAdded}) {
  const theme = useTheme();

  // Build tree from flat list
  const byId = {};
  const roots = [];
  (comments || []).forEach((c) => {
    byId[c.id] = {...c, children: []};
  });
  Object.values(byId).forEach((c) => {
    if (c.parent_id && byId[c.parent_id]) {
      byId[c.parent_id].children.push(c);
    } else {
      roots.push(c);
    }
  });

  const renderNode = (node, index = 0, depth = 0) => (
    <Grow in timeout={300 + index * 80} key={node.id}>
      <div>
        <CommentItem comment={node} onReplyAdded={onReplyAdded} />
        {node.children.length > 0 && (
          <Box
            sx={{
              ml: 3,
              pl: 1.5,
              borderLeft: `2px solid`,
              borderImage: `linear-gradient(to bottom, ${alpha(theme.palette.primary.main, 0.3)}, ${alpha(theme.palette.primary.main, 0.05)}) 1`,
              transition: `border-color 0.3s ${EASINGS.smooth}`,
            }}
          >
            {node.children.map((child, childIdx) =>
              renderNode(child, childIdx, depth + 1)
            )}
          </Box>
        )}
      </div>
    </Grow>
  );

  return <>{roots.map((root, i) => renderNode(root, i, 0))}</>;
}
