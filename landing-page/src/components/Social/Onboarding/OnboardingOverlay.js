import {useSocial} from '../../../contexts/SocialContext';
import {onboardingApi} from '../../../services/socialApi';

import CelebrationIcon from '@mui/icons-material/Celebration';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import {
  Box,
  Typography,
  Button,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  TextField,
  Chip,
  Paper,
  Stack,
} from '@mui/material';
import React, {useState, useEffect} from 'react';

const confettiKeyframes = `
@keyframes confetti-burst {
  0% { transform: scale(0) rotate(0deg); opacity: 1; }
  50% { transform: scale(1.2) rotate(180deg); opacity: 0.8; }
  100% { transform: scale(0.8) rotate(360deg); opacity: 0; }
}
`;

const STEPS = [
  {
    key: 'welcome',
    label: 'Welcome',
    title: 'Welcome to Hevolve!',
    description: 'Set up your display name to get started.',
    reward_type: 'resonance',
    reward_amount: 50,
    hasInput: true,
  },
  {
    key: 'first_follow',
    label: 'Follow someone',
    title: 'Follow someone',
    description: 'Find and follow another user to build your network.',
    reward_type: 'resonance',
    reward_amount: 25,
  },
  {
    key: 'join_community',
    label: 'Join a community',
    title: 'Join a community',
    description: 'Browse communities and join one that interests you.',
    reward_type: 'resonance',
    reward_amount: 25,
  },
  {
    key: 'first_vote',
    label: 'Vote on a post',
    title: 'Vote on a post',
    description: 'Show your opinion by voting on content.',
    reward_type: 'resonance',
    reward_amount: 15,
  },
  {
    key: 'first_comment',
    label: 'Leave a comment',
    title: 'Leave a comment',
    description: 'Join the conversation by commenting on a post.',
    reward_type: 'resonance',
    reward_amount: 20,
  },
  {
    key: 'first_post',
    label: 'Create a post',
    title: 'Create your first post',
    description: 'Share your thoughts with the community.',
    reward_type: 'resonance',
    reward_amount: 30,
  },
  {
    key: 'explore_agents',
    label: 'Explore agents',
    title: 'Explore AI agents',
    description: 'Discover and interact with autonomous agents.',
    reward_type: 'resonance',
    reward_amount: 35,
  },
  {
    key: 'discover_experiments',
    label: 'Discover Experiments',
    title: 'Thought Experiments',
    description:
      'Explore thought experiments and see how ideas evolve across the community.',
    reward_type: 'resonance_pulse',
    reward_amount: 20,
  },
  {
    key: 'try_kids_learning',
    label: 'Try Kids Learning',
    title: 'Kids Learning Zone',
    description:
      'Fun, interactive learning games for young minds — math, science, and more!',
    reward_type: 'resonance_pulse',
    reward_amount: 15,
  },
  {
    key: 'explore_recipes',
    label: 'Explore Recipes',
    title: 'AI Recipes',
    description: 'Browse and reuse community-created AI agent recipes.',
    reward_type: 'resonance_pulse',
    reward_amount: 15,
  },
];

export default function OnboardingOverlay() {
  const {onboardingProgress, fetchOnboarding} = useSocial();
  const [activeStep, setActiveStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [completing, setCompleting] = useState(false);
  const [allDone, setAllDone] = useState(false);

  const stepsCompleted = onboardingProgress?.steps_completed || {};

  useEffect(() => {
    const firstIncomplete = STEPS.findIndex((s) => !stepsCompleted[s.key]);
    if (firstIncomplete >= 0) {
      setActiveStep(firstIncomplete);
    }
    if (STEPS.every((s) => stepsCompleted[s.key])) {
      setAllDone(true);
    }
  }, [stepsCompleted]);

  if (!onboardingProgress) return null;
  if (onboardingProgress.completed_at || onboardingProgress.dismissed)
    return null;
  if (dismissed) return null;

  const handleCompleteStep = async (step) => {
    setCompleting(true);
    try {
      const payload = {step_key: step.key};
      if (step.key === 'welcome' && displayName.trim()) {
        payload.display_name = displayName.trim();
      }
      await onboardingApi.completeStep(payload);
      await fetchOnboarding();
      if (activeStep < STEPS.length - 1) {
        setActiveStep(activeStep + 1);
      } else {
        setAllDone(true);
      }
    } catch {
      // silent
    } finally {
      setCompleting(false);
    }
  };

  const handleDismiss = async () => {
    setDismissed(true);
    try {
      await onboardingApi.dismiss();
    } catch {
      // silent
    }
  };

  const doneCount = STEPS.filter((s) => stepsCompleted[s.key]).length;

  return (
    <>
      <style>{confettiKeyframes}</style>
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          bgcolor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: {xs: 1.5, md: 2},
        }}
      >
        <Paper
          elevation={24}
          sx={{
            width: '100%',
            maxWidth: 600,
            maxHeight: '90vh',
            overflow: 'auto',
            borderRadius: 4,
            p: {xs: 2, md: 4},
          }}
        >
          {allDone ? (
            <Box
              sx={{
                textAlign: 'center',
                py: 4,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {[
                '#FFD700',
                '#FF6B6B',
                '#4ECDC4',
                '#45B7D1',
                '#96CEB4',
                '#FFEAA7',
                '#DDA0DD',
                '#FF7F50',
              ].map((color, i) => (
                <Box
                  key={i}
                  sx={{
                    position: 'absolute',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: color,
                    top: `${10 + Math.random() * 30}%`,
                    left: `${5 + i * 12}%`,
                    animation: `confetti-burst ${1 + i * 0.2}s ease-out ${i * 0.1}s forwards`,
                  }}
                />
              ))}
              <CelebrationIcon
                sx={{fontSize: 64, color: 'warning.main', mb: 2}}
              />
              <Typography variant="h5" sx={{fontWeight: 800, mb: 1}}>
                Onboarding Complete!
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{mb: 3}}>
                You have earned all onboarding rewards. Enjoy Hevolve!
              </Typography>
              <Button
                variant="contained"
                onClick={handleDismiss}
                sx={{textTransform: 'none', fontWeight: 600}}
              >
                Get Started
              </Button>
            </Box>
          ) : (
            <>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{mb: 3}}
              >
                <Typography variant="h5" sx={{fontWeight: 800}}>
                  Getting Started
                </Typography>
                <Button
                  variant="text"
                  size="small"
                  onClick={handleDismiss}
                  sx={{textTransform: 'none', color: 'text.secondary'}}
                >
                  Dismiss
                </Button>
              </Stack>

              <Typography variant="body2" color="text.secondary" sx={{mb: 3}}>
                Complete these steps to earn rewards and learn how Hevolve works
                ({doneCount}/{STEPS.length}).
              </Typography>

              <Stepper activeStep={activeStep} orientation="vertical">
                {STEPS.map((step, index) => (
                  <Step key={step.key} completed={!!stepsCompleted[step.key]}>
                    <StepLabel
                      sx={{cursor: 'pointer'}}
                      onClick={() =>
                        !stepsCompleted[step.key] && setActiveStep(index)
                      }
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 600,
                          textDecoration: stepsCompleted[step.key]
                            ? 'line-through'
                            : 'none',
                          opacity: stepsCompleted[step.key] ? 0.6 : 1,
                        }}
                      >
                        {step.label}
                      </Typography>
                    </StepLabel>
                    <StepContent>
                      <Box sx={{py: 1}}>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{mb: 1.5}}
                        >
                          {step.description}
                        </Typography>

                        {step.hasInput && step.key === 'welcome' && (
                          <TextField
                            size="small"
                            label="Display name"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            fullWidth
                            sx={{mb: 1.5}}
                          />
                        )}

                        {!step.hasInput && (
                          <Typography
                            variant="caption"
                            color="text.disabled"
                            sx={{
                              display: 'block',
                              mb: 1.5,
                              fontStyle: 'italic',
                            }}
                          >
                            Placeholder: {step.title} functionality will appear
                            here.
                          </Typography>
                        )}

                        <Stack
                          direction="row"
                          spacing={1.5}
                          alignItems="center"
                        >
                          <Button
                            variant="contained"
                            size="small"
                            disabled={completing}
                            onClick={() => handleCompleteStep(step)}
                            sx={{textTransform: 'none', fontWeight: 600}}
                          >
                            Complete Step
                          </Button>
                          <Chip
                            icon={<EmojiEventsIcon sx={{fontSize: 16}} />}
                            label={`+${step.reward_amount} ${step.reward_type}`}
                            size="small"
                            sx={{
                              bgcolor: 'warning.light',
                              color: 'warning.dark',
                              fontWeight: 600,
                              fontSize: '0.7rem',
                            }}
                          />
                        </Stack>
                      </Box>
                    </StepContent>
                  </Step>
                ))}
              </Stepper>
            </>
          )}
        </Paper>
      </Box>
    </>
  );
}
