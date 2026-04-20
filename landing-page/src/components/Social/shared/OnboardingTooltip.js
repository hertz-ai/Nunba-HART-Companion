import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import {
  Popper,
  Paper,
  Typography,
  Button,
  Stack,
  Box,
  Chip,
} from '@mui/material';
import React from 'react';

export default function OnboardingTooltip({
  step,
  stepNumber,
  totalSteps,
  anchorEl,
  onAction,
  onSkip,
}) {
  if (!step || !anchorEl) return null;

  return (
    <Popper
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      placement="bottom-start"
      sx={{zIndex: 'tooltip'}}
      modifiers={[{name: 'offset', options: {offset: [0, 8]}}]}
    >
      <Paper
        elevation={12}
        sx={{
          p: {xs: 1.5, md: 2},
          borderRadius: 3,
          maxWidth: 320,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{fontWeight: 600, mb: 0.5, display: 'block'}}
        >
          Step {stepNumber} of {totalSteps}
        </Typography>

        <Typography variant="subtitle2" sx={{fontWeight: 700, mb: 1}}>
          {step.title}
        </Typography>

        {step.reward_type && step.reward_amount && (
          <Chip
            icon={<EmojiEventsIcon sx={{fontSize: 16}} />}
            label={`+${step.reward_amount} ${step.reward_type}`}
            size="small"
            sx={{
              mb: 1.5,
              bgcolor: 'warning.light',
              color: 'warning.dark',
              fontWeight: 600,
              fontSize: '0.7rem',
            }}
          />
        )}

        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            variant="contained"
            size="small"
            onClick={() => onAction && onAction(step)}
            sx={{textTransform: 'none', fontWeight: 600}}
          >
            Do it
          </Button>
          <Button
            variant="text"
            size="small"
            onClick={() => onSkip && onSkip(step)}
            sx={{textTransform: 'none', color: 'text.secondary'}}
          >
            Skip
          </Button>
        </Stack>
      </Paper>
    </Popper>
  );
}
