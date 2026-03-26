import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import {
  Card,
  CardContent,
  Typography,
  Stack,
  Chip,
  LinearProgress,
  IconButton,
  Box,
  Avatar,
} from '@mui/material';
import React from 'react';

const STATUS_COLORS = {
  active: 'info',
  passed: 'success',
  rejected: 'error',
  pending: 'warning',
  closed: 'default',
};

export default function ProposalCard({proposal, onVote}) {
  const totalVotes = (proposal.votes_for || 0) + (proposal.votes_against || 0);
  const forPercent =
    totalVotes > 0 ? ((proposal.votes_for || 0) / totalVotes) * 100 : 50;

  return (
    <Card sx={{borderRadius: 3, overflow: 'hidden'}}>
      <CardContent sx={{p: {xs: 2, md: 2.5}}}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          spacing={1}
        >
          <Typography variant="subtitle1" sx={{fontWeight: 700, flex: 1}}>
            {proposal.title}
          </Typography>
          <Chip
            label={proposal.status || 'active'}
            size="small"
            color={STATUS_COLORS[proposal.status] || 'default'}
            sx={{fontSize: '0.7rem', height: 22}}
          />
        </Stack>

        {proposal.author && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{mt: 1}}>
            <Avatar
              src={proposal.author.avatar_url}
              sx={{width: 20, height: 20, fontSize: 10}}
            >
              {(proposal.author.display_name || 'U')[0]}
            </Avatar>
            <Typography variant="caption" color="text.secondary">
              {proposal.author.display_name || proposal.author.username}
            </Typography>
          </Stack>
        )}

        {proposal.description && (
          <Typography variant="body2" color="text.secondary" sx={{mt: 1}}>
            {proposal.description.length > 200
              ? `${proposal.description.slice(0, 200)}...`
              : proposal.description}
          </Typography>
        )}

        <Box sx={{mt: 2, mb: 1}}>
          <Stack direction="row" justifyContent="space-between" sx={{mb: 0.5}}>
            <Typography
              variant="caption"
              color="success.main"
              sx={{fontWeight: 600}}
            >
              For: {proposal.votes_for || 0}
            </Typography>
            <Typography
              variant="caption"
              color="error.main"
              sx={{fontWeight: 600}}
            >
              Against: {proposal.votes_against || 0}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={forPercent}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: 'error.light',
              '& .MuiLinearProgress-bar': {
                bgcolor: 'success.main',
                borderRadius: 3,
              },
            }}
          />
        </Box>

        {onVote && proposal.status === 'active' && (
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <IconButton
              size="small"
              color="success"
              onClick={() => onVote(proposal.id, 'for')}
              sx={{border: 1, borderColor: 'success.main'}}
            >
              <ThumbUpIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() => onVote(proposal.id, 'against')}
              sx={{border: 1, borderColor: 'error.main'}}
            >
              <ThumbDownIcon fontSize="small" />
            </IconButton>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
