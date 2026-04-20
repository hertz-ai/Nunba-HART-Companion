/**
 * CreateThoughtExperimentDialog - Multi-step wizard for creating thought experiments.
 *
 * Steps:
 *   1. Intent Selection — Pick a category of positive change
 *   2. Hypothesis — Frame the "What if..." and "If X, then Y"
 *   3. Content — Add supporting context and details
 *   4. Preview — Live preview as ThoughtExperimentCard, then publish
 *
 * Also supports a "Regular Post" mode for non-experiment posts.
 *
 * Enhanced with:
 *  - Smooth crossfade transitions between steps
 *  - Animated hover icons on intent category cards
 *  - "Materializing" preview step — card assembles piece by piece
 */

import ThoughtExperimentCard from './ThoughtExperimentCard';

import { postsApi } from '../../../services/socialApi';
import {
  INTENT_COLORS, INTENT_LABELS, INTENT_GRADIENT_MAP,
  GRADIENTS, RADIUS, EASINGS, socialTokens,
} from '../../../theme/socialTokens';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import BalanceIcon from '@mui/icons-material/Balance';
import CloseIcon from '@mui/icons-material/Close';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import MemoryIcon from '@mui/icons-material/Memory';
import ParkIcon from '@mui/icons-material/Park';
import PeopleIcon from '@mui/icons-material/People';
import PublishIcon from '@mui/icons-material/Publish';
import SchoolIcon from '@mui/icons-material/School';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Stepper, Step, StepLabel,
  Box, Typography, TextField, Button, IconButton,
  Grid, Card, CardActionArea,
  Tabs, Tab, MenuItem, CircularProgress,
  useTheme, keyframes,
} from '@mui/material';
import React, { useState, useCallback, useEffect } from 'react';
// ─── Keyframes ───────────────────────────────────────────────────────────────

const crossFadeIn = keyframes`
  0%   { opacity: 0; transform: translateX(16px); }
  100% { opacity: 1; transform: translateX(0); }
`;

const iconFloat = keyframes`
  0%   { transform: translateY(0) scale(1); }
  50%  { transform: translateY(-4px) scale(1.08); }
  100% { transform: translateY(0) scale(1); }
`;

const iconGlow = keyframes`
  0%   { filter: drop-shadow(0 0 0px transparent); }
  50%  { filter: drop-shadow(0 0 8px var(--glow-color)); }
  100% { filter: drop-shadow(0 0 0px transparent); }
`;

const materializeSlide = keyframes`
  0%   { opacity: 0; transform: translateY(12px); }
  100% { opacity: 1; transform: translateY(0); }
`;

const materializeFade = keyframes`
  0%   { opacity: 0; }
  100% { opacity: 1; }
`;

const cardShimmer = keyframes`
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

// ─── Constants ───────────────────────────────────────────────────────────────

const STEPS = ['Intent', 'Hypothesis', 'Details', 'Preview'];

const INTENT_CATEGORIES = [
  { key: 'community',   Icon: PeopleIcon,          desc: 'Building stronger communities and connections' },
  { key: 'environment', Icon: ParkIcon,             desc: 'Protecting and restoring our natural world' },
  { key: 'education',   Icon: SchoolIcon,           desc: 'Making knowledge accessible to everyone' },
  { key: 'health',      Icon: FavoriteBorderIcon,   desc: 'Improving health and wellbeing for all' },
  { key: 'equity',      Icon: BalanceIcon,           desc: 'Creating fairness and equal opportunity' },
  { key: 'technology',  Icon: MemoryIcon,            desc: 'Using technology as a force for good' },
];

const CONTENT_TYPES = ['text', 'code', 'media'];

// ─── Crossfade Step Wrapper ─────────────────────────────────────────────────

function StepTransition({ children }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger fade-in on mount
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <Box
      sx={{
        animation: visible
          ? `${crossFadeIn} 350ms ${EASINGS.decelerate} both`
          : 'none',
        opacity: 0,
      }}
    >
      {children}
    </Box>
  );
}

// ─── Materializing Preview ──────────────────────────────────────────────────

function MaterializingPreview({ post }) {
  const theme = useTheme();
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    // Phase 0: shimmer placeholder
    // Phase 1: badge + title appear
    // Phase 2: hypothesis appears
    // Phase 3: full card appears
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 700),
      setTimeout(() => setPhase(3), 1100),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  if (phase < 3) {
    return (
      <Box sx={{
        borderRadius: RADIUS.lg,
        overflow: 'hidden',
        border: `1px solid rgba(255,255,255,0.06)`,
        bgcolor: 'rgba(255,255,255,0.03)',
        p: 2,
        position: 'relative',
        minHeight: 160,
      }}>
        {/* Shimmer background for pre-materialized state */}
        {phase === 0 && (
          <Box sx={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, transparent, rgba(108,99,255,0.05), transparent)',
            backgroundSize: '200% 100%',
            animation: `${cardShimmer} 1.5s linear infinite`,
          }} />
        )}

        {/* Phase 1: Badge + Title materialize */}
        {phase >= 1 && (
          <Box sx={{
            animation: `${materializeSlide} 400ms ${EASINGS.decelerate} both`,
            mb: 1.5,
          }}>
            <Box sx={{
              display: 'inline-block',
              px: 1, py: 0.25,
              borderRadius: RADIUS.pill,
              bgcolor: `${INTENT_COLORS[post.intent_category] || '#6C63FF'}20`,
              mb: 1,
            }}>
              <Typography variant="caption" sx={{
                color: INTENT_COLORS[post.intent_category] || '#6C63FF',
                fontWeight: 700,
                fontSize: '0.7rem',
                textTransform: 'uppercase',
              }}>
                {INTENT_LABELS[post.intent_category] || 'Education'}
              </Typography>
            </Box>
            <Typography variant="h6" sx={{
              fontWeight: 700,
              color: theme.palette.text.primary,
              lineHeight: 1.3,
            }}>
              {post.title || 'Your thought experiment'}
            </Typography>
          </Box>
        )}

        {/* Phase 2: Hypothesis materializes */}
        {phase >= 2 && post.hypothesis && (
          <Box sx={{
            animation: `${materializeSlide} 400ms ${EASINGS.decelerate} both`,
            p: 1.5,
            borderRadius: RADIUS.md,
            background: `${INTENT_COLORS[post.intent_category] || '#6C63FF'}08`,
            borderLeft: `3px solid ${INTENT_COLORS[post.intent_category] || '#6C63FF'}40`,
          }}>
            <Typography variant="overline" sx={{
              color: INTENT_COLORS[post.intent_category] || '#6C63FF',
              display: 'block', mb: 0.25,
            }}>
              Hypothesis
            </Typography>
            <Typography variant="body2" sx={{
              color: theme.palette.text.secondary,
              fontStyle: 'italic',
            }}>
              {post.hypothesis}
            </Typography>
          </Box>
        )}

        {/* Placeholder dots for content not yet materialized */}
        {phase < 2 && (
          <Box sx={{
            display: 'flex', gap: 1, mt: 2,
            animation: `${materializeFade} 300ms ease both`,
          }}>
            {[0, 1, 2].map((i) => (
              <Box key={i} sx={{
                width: 8, height: 8, borderRadius: '50%',
                bgcolor: 'rgba(108,99,255,0.15)',
                animation: `${iconFloat} 1.5s ease-in-out infinite`,
                animationDelay: `${i * 0.2}s`,
              }} />
            ))}
          </Box>
        )}
      </Box>
    );
  }

  // Phase 3: Show the full real card
  return (
    <Box sx={{
      pointerEvents: 'none', opacity: 0.9,
      animation: `${materializeFade} 400ms ${EASINGS.decelerate} both`,
    }}>
      <ThoughtExperimentCard post={post} />
    </Box>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function CreateThoughtExperimentDialog({ open, onClose, onCreated, communityId }) {
  const theme = useTheme();

  // Mode: 'experiment' or 'regular'
  const [mode, setMode] = useState('experiment');

  // Experiment fields
  const [activeStep, setActiveStep] = useState(0);
  const [intentCategory, setIntentCategory] = useState('');
  const [title, setTitle] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [expectedOutcome, setExpectedOutcome] = useState('');
  const [content, setContent] = useState('');
  const [contentType, setContentType] = useState('text');

  // Regular post fields
  const [regularTitle, setRegularTitle] = useState('');
  const [regularContent, setRegularContent] = useState('');
  const [regularType, setRegularType] = useState('text');

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Track hovered intent card
  const [hoveredIntent, setHoveredIntent] = useState(null);

  const resetForm = useCallback(() => {
    setActiveStep(0);
    setIntentCategory('');
    setTitle('');
    setHypothesis('');
    setExpectedOutcome('');
    setContent('');
    setContentType('text');
    setRegularTitle('');
    setRegularContent('');
    setRegularType('text');
    setError('');
    setHoveredIntent(null);
  }, []);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const canProceed = () => {
    switch (activeStep) {
      case 0: return !!intentCategory;
      case 1: return title.trim().length > 0 && hypothesis.trim().length > 0;
      case 2: return true; // content is optional
      case 3: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (activeStep < STEPS.length - 1) setActiveStep(s => s + 1);
  };
  const handleBack = () => {
    if (activeStep > 0) setActiveStep(s => s - 1);
  };

  const handleSubmitExperiment = async () => {
    setSubmitting(true);
    setError('');
    try {
      const data = {
        title: title.trim(),
        content: content.trim() || hypothesis.trim(),
        content_type: contentType,
        is_thought_experiment: true,
        intent_category: intentCategory,
        hypothesis: hypothesis.trim(),
        expected_outcome: expectedOutcome.trim() || undefined,
      };
      if (communityId) data.community_id = communityId;
      const res = await postsApi.create(data);
      resetForm();
      if (onCreated) onCreated(res.data);
    } catch (err) {
      setError(err.error || 'Failed to create thought experiment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitRegular = async () => {
    if (!regularTitle.trim()) { setError('Title is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const data = {
        title: regularTitle.trim(),
        content: regularContent.trim(),
        content_type: regularType,
      };
      if (communityId) data.community_id = communityId;
      const res = await postsApi.create(data);
      resetForm();
      if (onCreated) onCreated(res.data);
    } catch (err) {
      setError(err.error || 'Failed to create post');
    } finally {
      setSubmitting(false);
    }
  };

  // Build preview post object
  const previewPost = {
    id: 'preview',
    title,
    content: content || hypothesis,
    hypothesis,
    expected_outcome: expectedOutcome,
    intent_category: intentCategory,
    is_thought_experiment: true,
    author: { username: 'You', avatar_url: null },
    score: 0,
    comment_count: 0,
    view_count: 0,
    created_at: new Date().toISOString(),
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          ...socialTokens.glass.elevated(theme),
          borderRadius: RADIUS.xl,
          overflow: 'hidden',
        },
      }}
    >
      {/* Header with mode tabs */}
      <DialogTitle sx={{ pb: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Tabs
            value={mode === 'experiment' ? 0 : 1}
            onChange={(_, v) => { setMode(v === 0 ? 'experiment' : 'regular'); setError(''); }}
            sx={{
              minHeight: 36,
              '& .MuiTab-root': { minHeight: 36, fontSize: '0.82rem', py: 0 },
              '& .MuiTabs-indicator': { background: GRADIENTS.primary, height: 2 },
            }}
          >
            <Tab label="Thought Experiment" />
            <Tab label="Regular Post" />
          </Tabs>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {mode === 'experiment' ? (
          <>
            {/* Stepper */}
            <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 3 }}>
              {STEPS.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            {/* Step 1: Intent Selection */}
            {activeStep === 0 && (
              <StepTransition stepKey="intent">
                <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>
                  What kind of positive change are you imagining?
                </Typography>
                <Grid container spacing={1.5}>
                  {INTENT_CATEGORIES.map(({ key, Icon, desc }) => {
                    const isHovered = hoveredIntent === key;
                    const intentClr = INTENT_COLORS[key];
                    return (
                      <Grid item xs={6} key={key}>
                        <Card
                          onMouseEnter={() => setHoveredIntent(key)}
                          onMouseLeave={() => setHoveredIntent(null)}
                          sx={{
                            '--glow-color': `${intentClr}60`,
                            background: intentCategory === key
                              ? INTENT_GRADIENT_MAP[key]
                              : socialTokens.glass.subtle(theme).background,
                            border: intentCategory === key
                              ? `2px solid ${intentClr}`
                              : '2px solid transparent',
                            borderRadius: RADIUS.lg,
                            transition: `all 200ms ${EASINGS.smooth}`,
                            '&:hover': {
                              transform: 'translateY(-2px)',
                              boxShadow: `0 8px 24px ${intentClr}30`,
                            },
                          }}
                        >
                          <CardActionArea onClick={() => setIntentCategory(key)} sx={{ p: 2 }}>
                            <Icon sx={{
                              fontSize: 32,
                              color: intentCategory === key ? '#fff' : intentClr,
                              mb: 1,
                              transition: 'all 300ms ease',
                              animation: isHovered
                                ? `${iconFloat} 1s ease-in-out infinite, ${iconGlow} 1.5s ease-in-out infinite`
                                : 'none',
                            }} />
                            <Typography variant="subtitle2" sx={{
                              fontWeight: 700,
                              color: intentCategory === key ? '#fff' : theme.palette.text.primary,
                            }}>
                              {INTENT_LABELS[key]}
                            </Typography>
                            <Typography variant="caption" sx={{
                              color: intentCategory === key ? 'rgba(255,255,255,0.8)' : theme.palette.text.secondary,
                              display: 'block',
                              mt: 0.5,
                              lineHeight: 1.3,
                            }}>
                              {desc}
                            </Typography>
                          </CardActionArea>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              </StepTransition>
            )}

            {/* Step 2: Hypothesis Framing */}
            {activeStep === 1 && (
              <StepTransition stepKey="hypothesis">
                <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>
                  Frame your thought experiment
                </Typography>
                <TextField
                  autoFocus
                  fullWidth
                  label='Title — "What if..."'
                  placeholder="What if every school had an AI tutor?"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  margin="dense"
                  variant="outlined"
                  sx={{ mb: 2 }}
                />
                <TextField
                  fullWidth
                  label='Hypothesis — "If [action], then [outcome]"'
                  placeholder="If we provide AI tutors to every student, dropout rates could decrease by 30%"
                  value={hypothesis}
                  onChange={(e) => setHypothesis(e.target.value)}
                  margin="dense"
                  variant="outlined"
                  multiline
                  rows={3}
                  sx={{ mb: 2 }}
                />
                <TextField
                  fullWidth
                  label="Expected Outcome (optional)"
                  placeholder="More equitable access to quality education worldwide"
                  value={expectedOutcome}
                  onChange={(e) => setExpectedOutcome(e.target.value)}
                  margin="dense"
                  variant="outlined"
                />
              </StepTransition>
            )}

            {/* Step 3: Content & Context */}
            {activeStep === 2 && (
              <StepTransition stepKey="details">
                <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>
                  Add supporting context
                </Typography>
                <TextField
                  fullWidth
                  label="Supporting Details (optional)"
                  placeholder="Explain the reasoning, cite examples, share data..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  margin="dense"
                  variant="outlined"
                  multiline
                  rows={6}
                  sx={{ mb: 2 }}
                />
                <TextField
                  select
                  fullWidth
                  label="Content Type"
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value)}
                  margin="dense"
                  variant="outlined"
                >
                  {CONTENT_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>{t}</MenuItem>
                  ))}
                </TextField>
              </StepTransition>
            )}

            {/* Step 4: Preview — materializing effect */}
            {activeStep === 3 && (
              <StepTransition stepKey="preview">
                <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>
                  Preview your thought experiment
                </Typography>
                <MaterializingPreview post={previewPost} />
              </StepTransition>
            )}
          </>
        ) : (
          /* Regular Post Mode */
          <Box sx={{ pt: 1 }}>
            <TextField
              autoFocus
              fullWidth
              label="Title"
              value={regularTitle}
              onChange={(e) => setRegularTitle(e.target.value)}
              margin="dense"
              variant="outlined"
            />
            <TextField
              fullWidth
              label="Content"
              value={regularContent}
              onChange={(e) => setRegularContent(e.target.value)}
              margin="dense"
              variant="outlined"
              multiline
              rows={6}
            />
            <TextField
              select
              fullWidth
              label="Type"
              value={regularType}
              onChange={(e) => setRegularType(e.target.value)}
              margin="dense"
              variant="outlined"
            >
              {['text', 'code', 'task_request', 'media'].map((t) => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
              ))}
            </TextField>
          </Box>
        )}

        {/* Error message */}
        {error && (
          <Typography variant="body2" sx={{ color: theme.palette.error.main, mt: 1.5, fontSize: '0.85rem' }}>
            {error}
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {mode === 'experiment' ? (
          <>
            <Button
              onClick={handleBack}
              disabled={activeStep === 0}
              startIcon={<ArrowBackIcon />}
            >
              Back
            </Button>
            <Box sx={{ flex: 1 }} />
            {activeStep < STEPS.length - 1 ? (
              <Button
                onClick={handleNext}
                disabled={!canProceed()}
                variant="contained"
                endIcon={<ArrowForwardIcon />}
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleSubmitExperiment}
                disabled={submitting}
                variant="contained"
                startIcon={submitting ? <CircularProgress size={16} /> : <PublishIcon />}
                sx={{ background: GRADIENTS.primary }}
              >
                Publish Experiment
              </Button>
            )}
          </>
        ) : (
          <>
            <Button onClick={handleClose}>Cancel</Button>
            <Button
              onClick={handleSubmitRegular}
              disabled={submitting}
              variant="contained"
            >
              {submitting ? <CircularProgress size={20} /> : 'Post'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
