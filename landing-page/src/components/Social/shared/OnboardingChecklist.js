import {onboardingApi} from '../../../services/socialApi';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import {
  Paper,
  Typography,
  Box,
  IconButton,
  Collapse,
  LinearProgress,
  Slide,
  useTheme,
} from '@mui/material';
import React, {useState, useEffect} from 'react';
import {useNavigate} from 'react-router-dom';


const STEPS = [
  {key: 'welcome', label: 'Welcome', path: null},
  {key: 'first_follow', label: 'Follow someone', path: '/social/search'},
  {
    key: 'join_community',
    label: 'Join a community',
    path: '/social/communities',
  },
  {key: 'first_vote', label: 'Vote on a post', path: '/social'},
  {key: 'first_comment', label: 'Leave a comment', path: '/social'},
  {key: 'first_post', label: 'Create a post', path: '/social'},
  {key: 'explore_agents', label: 'Explore agents', path: '/social?tab=agents'},
  {
    key: 'discover_experiments',
    label: 'Discover Experiments',
    path: '/social/experiments',
  },
  {key: 'try_kids_learning', label: 'Try Kids Learning', path: '/social/kids'},
  {key: 'explore_recipes', label: 'Explore Recipes', path: '/social/recipes'},
];

export default function OnboardingChecklist() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    onboardingApi
      .getProgress()
      .then((res) => {
        if (res.data) setProgress(res.data);
      })
      .catch(() => {});
  }, []);

  if (!progress || progress.completed_at || dismissed) return null;

  const completed = progress.steps_completed || {};
  const doneCount = STEPS.filter((s) => completed[s.key]).length;
  const pct = (doneCount / STEPS.length) * 100;

  const handleDismiss = async () => {
    setDismissed(true);
    try {
      await onboardingApi.dismiss();
    } catch {
      /* silent */
    }
  };

  return (
    <Slide in={true} direction="left" timeout={400}>
      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          bottom: {xs: 72, md: 16},
          right: 16,
          width: {xs: 'calc(100% - 32px)', sm: 280},
          zIndex: 'modal',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.5,
            py: 1,
            background: `linear-gradient(to right, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
            color: '#fff',
            cursor: 'pointer',
          }}
          onClick={() => setExpanded(!expanded)}
        >
          <Typography variant="subtitle2" sx={{fontWeight: 700}}>
            Getting Started ({doneCount}/{STEPS.length})
          </Typography>
          <Box sx={{display: 'flex', alignItems: 'center'}}>
            <IconButton
              size="small"
              sx={{color: '#fff'}}
              onClick={(e) => {
                e.stopPropagation();
                handleDismiss();
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </Box>
        </Box>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 3,
            '& .MuiLinearProgress-bar': {
              background: `linear-gradient(to right, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
            },
          }}
        />
        <Collapse in={expanded}>
          <Box sx={{py: 0.5}}>
            {STEPS.map((step) => (
              <Box
                key={step.key}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 0.75,
                  cursor: step.path ? 'pointer' : 'default',
                  '&:hover': {bgcolor: 'action.hover'},
                }}
                onClick={() => step.path && navigate(step.path)}
              >
                {completed[step.key] ? (
                  <CheckCircleIcon
                    sx={{color: theme.palette.primary.main, fontSize: 20}}
                  />
                ) : (
                  <RadioButtonUncheckedIcon
                    sx={{fontSize: 20, color: 'text.disabled'}}
                  />
                )}
                <Typography
                  variant="body2"
                  sx={{
                    textDecoration: completed[step.key]
                      ? 'line-through'
                      : 'none',
                    opacity: completed[step.key] ? 0.6 : 1,
                  }}
                >
                  {step.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Collapse>
      </Paper>
    </Slide>
  );
}
