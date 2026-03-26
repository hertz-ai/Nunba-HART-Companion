import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import {Box, IconButton, Typography, keyframes, useTheme} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState} from 'react';

// Pop animation for vote action
const pop = keyframes`
  0% { transform: scale(1); }
  50% { transform: scale(1.3); }
  100% { transform: scale(1); }
`;

// Pulse animation for active vote
const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
`;

export default function VoteButtons({
  score = 0,
  userVote = 0,
  onUpvote,
  onDownvote,
  vertical = true,
}) {
  const theme = useTheme();
  const [upHovered, setUpHovered] = useState(false);
  const [downHovered, setDownHovered] = useState(false);
  const [lastVote, setLastVote] = useState(null);

  const handleUpvote = (e) => {
    e.stopPropagation();
    setLastVote('up');
    setTimeout(() => setLastVote(null), 300);
    onUpvote && onUpvote();
  };

  const handleDownvote = (e) => {
    e.stopPropagation();
    setLastVote('down');
    setTimeout(() => setLastVote(null), 300);
    onDownvote && onDownvote();
  };

  const isPositive = score > 0;
  const isNegative = score < 0;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        gap: 0,
        p: 0.5,
        borderRadius: 2,
        background: alpha(theme.palette.common.white, 0.02),
        transition: 'background 0.2s ease',
        '&:hover': {
          background: alpha(theme.palette.common.white, 0.04),
        },
      }}
    >
      {/* Upvote button */}
      <IconButton
        size="small"
        onClick={handleUpvote}
        onMouseEnter={() => setUpHovered(true)}
        onMouseLeave={() => setUpHovered(false)}
        aria-label="Upvote"
        sx={{
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          color:
            userVote === 1
              ? theme.palette.primary.main
              : alpha(theme.palette.common.white, 0.4),
          animation: lastVote === 'up' ? `${pop} 0.3s ease` : 'none',
          background:
            userVote === 1
              ? alpha(theme.palette.primary.main, 0.1)
              : upHovered
                ? alpha(theme.palette.primary.main, 0.05)
                : 'transparent',
          '&:hover': {
            color: theme.palette.primary.main,
            transform: 'translateY(-2px)',
          },
        }}
      >
        <ArrowUpwardIcon
          sx={{
            fontSize: 18,
            filter:
              userVote === 1
                ? `drop-shadow(0 0 4px ${alpha(theme.palette.primary.main, 0.5)})`
                : 'none',
            transition: 'filter 0.2s ease',
          }}
        />
      </IconButton>

      {/* Score display */}
      <Typography
        variant="body2"
        sx={{
          fontWeight: 700,
          minWidth: 28,
          textAlign: 'center',
          py: 0.25,
          color:
            userVote === 1
              ? theme.palette.primary.main
              : userVote === -1
                ? theme.palette.error.main
                : isPositive
                  ? alpha(theme.palette.primary.main, 0.8)
                  : isNegative
                    ? alpha(theme.palette.error.main, 0.8)
                    : alpha(theme.palette.common.white, 0.6),
          textShadow:
            userVote !== 0
              ? userVote === 1
                ? `0 0 8px ${alpha(theme.palette.primary.main, 0.4)}`
                : `0 0 8px ${alpha(theme.palette.error.main, 0.4)}`
              : 'none',
          animation:
            userVote !== 0 ? `${pulse} 2s ease-in-out infinite` : 'none',
          transition: 'all 0.3s ease',
        }}
      >
        {score}
      </Typography>

      {/* Downvote button */}
      <IconButton
        size="small"
        onClick={handleDownvote}
        onMouseEnter={() => setDownHovered(true)}
        onMouseLeave={() => setDownHovered(false)}
        aria-label="Downvote"
        sx={{
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          color:
            userVote === -1
              ? theme.palette.error.main
              : alpha(theme.palette.common.white, 0.4),
          animation: lastVote === 'down' ? `${pop} 0.3s ease` : 'none',
          background:
            userVote === -1
              ? alpha(theme.palette.error.main, 0.1)
              : downHovered
                ? alpha(theme.palette.error.main, 0.05)
                : 'transparent',
          '&:hover': {
            color: theme.palette.error.main,
            transform: 'translateY(2px)',
          },
        }}
      >
        <ArrowDownwardIcon
          sx={{
            fontSize: 18,
            filter:
              userVote === -1
                ? `drop-shadow(0 0 4px ${alpha(theme.palette.error.main, 0.5)})`
                : 'none',
            transition: 'filter 0.2s ease',
          }}
        />
      </IconButton>
    </Box>
  );
}
