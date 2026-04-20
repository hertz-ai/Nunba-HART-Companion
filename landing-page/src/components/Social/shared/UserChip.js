import {socialTokens} from '../../../theme/socialTokens';

import SmartToyIcon from '@mui/icons-material/SmartToy';
import {Chip, Avatar, Skeleton, Box, Tooltip, useTheme} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';


/* ── Deterministic accent color from username hash ── */
const AGENT_ACCENT_PALETTE = [
  '#6C63FF',
  '#FF6B6B',
  '#2ECC71',
  '#00B8D9',
  '#FFAB00',
  '#7C4DFF',
  '#FF9494',
  '#A8E6CF',
];
function agentAccentFromName(name) {
  if (!name) return AGENT_ACCENT_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AGENT_ACCENT_PALETTE[Math.abs(hash) % AGENT_ACCENT_PALETTE.length];
}

/* ── Render agent two-word name with styled dot ── */
function AgentNameLabel({name, accentColor}) {
  if (!name) return null;
  const dotIndex = name.indexOf('.');
  if (dotIndex === -1) return <span style={{color: accentColor}}>{name}</span>;
  return (
    <span style={{color: accentColor}}>
      {name.slice(0, dotIndex)}
      <span style={{fontSize: '0.75em', opacity: 0.6}}>.</span>
      {name.slice(dotIndex + 1)}
    </span>
  );
}

// Skeleton loader for user chip
export function UserChipSkeleton() {
  return (
    <Box sx={{display: 'inline-flex', alignItems: 'center', gap: 0.5}}>
      <Skeleton
        variant="circular"
        width={20}
        height={20}
        sx={{bgcolor: 'rgba(255,255,255,0.05)'}}
      />
      <Skeleton
        variant="rounded"
        width={60}
        height={20}
        sx={{bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 10}}
      />
    </Box>
  );
}

export default function UserChip({user, loading = false}) {
  const theme = useTheme();
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);

  if (loading) return <UserChipSkeleton />;
  if (!user) return null;

  const isAgent = user.user_type === 'agent';
  const agentAccent = isAgent ? agentAccentFromName(user.username) : null;

  const avatarContent = (
    <Box
      sx={{
        position: 'relative',
        display: 'inline-flex',
        ...socialTokens.resonanceAvatar(user.level || 0),
      }}
    >
      <Avatar
        src={user.avatar_url}
        sx={{
          width: 20,
          height: 20,
          border: isHovered
            ? `1px solid ${alpha(theme.palette.primary.main, 0.5)}`
            : '1px solid transparent',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          ...(isAgent && {
            bgcolor: alpha(agentAccent, 0.2),
            color: agentAccent,
          }),
        }}
      >
        {(user.username || '?')[0].toUpperCase()}
      </Avatar>
      {isAgent && (
        <SmartToyIcon
          sx={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 16,
            height: 16,
            color: agentAccent,
            bgcolor: '#0F0E17',
            borderRadius: '50%',
            padding: '1px',
          }}
        />
      )}
    </Box>
  );

  const chipLabel = isAgent ? (
    <AgentNameLabel
      name={user.display_name || user.username}
      accentColor={agentAccent}
    />
  ) : (
    user.display_name || user.username
  );

  const chip = (
    <Chip
      avatar={avatarContent}
      label={chipLabel}
      size="small"
      variant="outlined"
      clickable
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/social/profile/${user.id || user.username}`);
      }}
      sx={{
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        borderColor: isHovered
          ? alpha(isAgent ? agentAccent : theme.palette.primary.main, 0.4)
          : 'rgba(255,255,255,0.2)',
        background: isHovered
          ? isAgent
            ? `linear-gradient(135deg, ${alpha(agentAccent, 0.1)} 0%, ${alpha(agentAccent, 0.05)} 100%)`
            : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`
          : 'transparent',
        boxShadow: isHovered
          ? `0 4px 12px ${alpha(isAgent ? agentAccent : theme.palette.primary.main, 0.15)}`
          : 'none',
        transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
        '& .MuiChip-label': {
          color: isAgent
            ? agentAccent
            : isHovered
              ? theme.palette.primary.main
              : 'rgba(255,255,255,0.8)',
          fontWeight: 500,
          transition: 'color 0.3s ease',
        },
      }}
    />
  );

  if (isAgent) {
    return (
      <Tooltip title="HART Agent" arrow>
        {chip}
      </Tooltip>
    );
  }

  return chip;
}
