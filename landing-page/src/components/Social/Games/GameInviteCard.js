import {gamesApi} from '../../../services/socialApi';
import {RADIUS} from '../../../theme/socialTokens';

import GroupIcon from '@mui/icons-material/Group';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import {Box, Typography, Button, Chip, Avatar, useTheme} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React from 'react';
import {useNavigate} from 'react-router-dom';


const GAME_TYPE_LABELS = {
  trivia: 'Trivia',
  opentdb_trivia: 'Trivia',
  word_chain: 'Word Chain',
  word_scramble: 'Word Scramble',
  word_search: 'Word Search',
  collab_puzzle: 'Collab Puzzle',
  compute_challenge: 'Compute Challenge',
  quick_match: 'Quick Match',
  boardgame: 'Board Game',
  phaser: 'Arcade',
  sudoku: 'Sudoku',
};

/**
 * GameInviteCard — Shows a game invitation with accept/decline actions.
 * Used in NotificationsPage and EncountersPage.
 *
 * Props:
 *   gameId: string
 *   gameType: string
 *   hostName: string (display name of host)
 *   playerCount: number
 *   maxPlayers: number
 *   onJoined: () => void — called after successful join
 */
export default function GameInviteCard({
  gameId,
  gameType,
  hostName,
  playerCount,
  maxPlayers,
  onJoined,
}) {
  const theme = useTheme();
  const navigate = useNavigate();

  const handleJoin = async () => {
    try {
      await gamesApi.join(gameId);
      if (onJoined) onJoined();
      navigate(`/social/games/${gameId}`);
    } catch (e) {
      // fallback — navigate anyway
      navigate(`/social/games/${gameId}`);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        borderRadius: RADIUS.md,
        bgcolor: alpha(theme.palette.primary.main, 0.05),
        border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
        transition: 'all 0.2s ease',
        '&:hover': {
          bgcolor: alpha(theme.palette.primary.main, 0.08),
          transform: 'translateY(-1px)',
        },
      }}
    >
      <Avatar
        sx={{
          bgcolor: alpha(theme.palette.primary.main, 0.2),
          color: theme.palette.primary.main,
          width: 44,
          height: 44,
        }}
      >
        <SportsEsportsIcon />
      </Avatar>

      <Box sx={{flex: 1}}>
        <Typography variant="body2" sx={{fontWeight: 600}}>
          {hostName || 'Someone'} invited you to play
        </Typography>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mt: 0.5}}>
          <Chip
            size="small"
            label={GAME_TYPE_LABELS[gameType] || gameType}
            variant="outlined"
          />
          <Chip
            size="small"
            icon={<GroupIcon />}
            label={`${playerCount || 1}/${maxPlayers || 4}`}
          />
        </Box>
      </Box>

      <Box sx={{display: 'flex', gap: 1}}>
        <Button
          variant="contained"
          size="small"
          onClick={handleJoin}
          sx={{borderRadius: RADIUS.sm, textTransform: 'none'}}
        >
          Join
        </Button>
        <Button
          variant="text"
          size="small"
          onClick={() => navigate(`/social/games/${gameId}`)}
          sx={{textTransform: 'none', opacity: 0.7}}
        >
          View
        </Button>
      </Box>
    </Box>
  );
}
