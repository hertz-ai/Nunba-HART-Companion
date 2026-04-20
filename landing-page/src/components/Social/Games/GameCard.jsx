import {RADIUS} from '../../../theme/socialTokens';
import {animFadeInScale} from '../../../utils/animations';

import GroupIcon from '@mui/icons-material/Group';
import PersonIcon from '@mui/icons-material/Person';
import StarIcon from '@mui/icons-material/Star';
import {Box, Typography, Chip, Avatar, useTheme} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React from 'react';

const CATEGORY_COLORS = {
  trivia: '#6C63FF',
  board: '#2ECC71',
  arcade: '#FF6B6B',
  word: '#FFAB00',
  puzzle: '#00B8D9',
  party: '#FF6B6B',
};

const CATEGORY_ICONS = {
  trivia: '🧠',
  board: '♟️',
  arcade: '🕹️',
  word: '📝',
  puzzle: '🧩',
  party: '🎉',
};

/**
 * GameCard — Card for a single game in the catalog.
 *
 * Props:
 *   game: catalog entry object
 *   onClick: (game) => void
 *   animDelay: number (ms)
 */
export default function GameCard({game, onClick, animDelay = 0}) {
  const theme = useTheme();
  const catColor = CATEGORY_COLORS[game.category] || '#6C63FF';

  return (
    <Box
      onClick={() => onClick?.(game)}
      sx={{
        ...animFadeInScale(animDelay),
        position: 'relative',
        p: 2,
        borderRadius: RADIUS.lg,
        bgcolor: 'background.paper',
        border: `1px solid ${alpha(catColor, 0.15)}`,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        overflow: 'hidden',
        '&:hover': {
          transform: 'translateY(-3px)',
          boxShadow: `0 8px 24px ${alpha(catColor, 0.2)}`,
          borderColor: alpha(catColor, 0.3),
        },
        '&:active': {transform: 'scale(0.98)'},
      }}
    >
      {/* Featured badge */}
      {game.featured && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 0.3,
            px: 0.8,
            py: 0.2,
            borderRadius: RADIUS.sm,
            bgcolor: alpha('#FFAB00', 0.15),
          }}
        >
          <StarIcon sx={{fontSize: 14, color: '#FFAB00'}} />
          <Typography
            variant="caption"
            sx={{color: '#FFAB00', fontWeight: 700, fontSize: 10}}
          >
            HOT
          </Typography>
        </Box>
      )}

      {/* Category accent bar */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          bgcolor: catColor,
          borderRadius: '3px 0 0 3px',
        }}
      />

      {/* Icon + Title */}
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 1}}>
        <Avatar
          sx={{
            width: 40,
            height: 40,
            bgcolor: alpha(catColor, 0.12),
            fontSize: 20,
          }}
        >
          {CATEGORY_ICONS[game.category] || '🎮'}
        </Avatar>
        <Box sx={{flex: 1, minWidth: 0}}>
          <Typography
            variant="body2"
            sx={{fontWeight: 700, lineHeight: 1.3}}
            noWrap
          >
            {game.title || game.name}
          </Typography>
          <Typography
            variant="caption"
            sx={{color: 'text.secondary', textTransform: 'capitalize'}}
          >
            {game.category}
          </Typography>
        </Box>
      </Box>

      {/* Tags */}
      <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 0.5}}>
        {game.multiplayer && (
          <Chip
            size="small"
            icon={<GroupIcon sx={{fontSize: '14px !important'}} />}
            label={
              game.min_players && game.max_players
                ? `${game.min_players}-${game.max_players}`
                : 'Multiplayer'
            }
            sx={{height: 22, fontSize: 11, bgcolor: alpha(catColor, 0.08)}}
          />
        )}
        {(game.solo_allowed || game.multiplayer === false) && (
          <Chip
            size="small"
            icon={<PersonIcon sx={{fontSize: '14px !important'}} />}
            label="Solo"
            sx={{height: 22, fontSize: 11}}
          />
        )}
        {game.difficulty_levels && (
          <Chip
            size="small"
            label={game.difficulty_levels.length + ' levels'}
            sx={{height: 22, fontSize: 11}}
          />
        )}
      </Box>
    </Box>
  );
}
