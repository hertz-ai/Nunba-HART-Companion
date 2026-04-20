import {useSocial} from '../../../contexts/SocialContext';
import {recipesApi} from '../../../services/socialApi';
import {
  socialTokens,
  RADIUS,
  SHADOWS,
  EASINGS,
  GRADIENTS,
} from '../../../theme/socialTokens';
import UserChip from '../shared/UserChip';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import {
  Typography,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Fade,
  Grow,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect} from 'react';
import {useParams, useNavigate} from 'react-router-dom';


export default function RecipeDetailPage() {
  const {recipeId} = useParams();
  const navigate = useNavigate();
  const {isAuthenticated} = useSocial();
  const theme = useTheme();

  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forking, setForking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await recipesApi.get(recipeId);
        if (!cancelled) setRecipe(res.data);
      } catch (err) {
        if (!cancelled) setRecipe(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  const handleFork = async () => {
    setForking(true);
    try {
      await recipesApi.fork(recipeId);
      setRecipe((prev) =>
        prev ? {...prev, fork_count: (prev.fork_count || 0) + 1} : prev
      );
    } catch (err) {
      /* ignore */
    }
    setForking(false);
  };

  if (loading)
    return (
      <Box textAlign="center" py={6}>
        <CircularProgress sx={{ color: '#6C63FF' }} />
      </Box>
    );
  if (!recipe)
    return (
      <Fade in timeout={300}>
        <Box textAlign="center" py={6}>
          <Typography color="text.secondary">Recipe not found</Typography>
        </Box>
      </Fade>
    );

  return (
    <Fade in timeout={400}>
      <Box>
        {/* Header row */}
        <Box sx={{display: 'flex', alignItems: 'center', mb: 2}}>
          <IconButton
            onClick={() => navigate(-1)}
            sx={{
              color: alpha(theme.palette.common.white, 0.7),
              transition: `all 200ms ${EASINGS.smooth}`,
              '&:hover': {
                color: theme.palette.primary.main,
                background: alpha(theme.palette.primary.main, 0.08),
                transform: 'translateX(-3px)',
              },
              '&:focus-visible': {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: 2,
              },
            }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography
            variant="h6"
            sx={{
              flex: 1,
              fontWeight: 700,
              background: `linear-gradient(to right, ${alpha(theme.palette.common.white, 0.95)}, ${alpha(theme.palette.common.white, 0.7)})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {recipe.title || recipe.name}
          </Typography>
          {isAuthenticated && (
            <Button
              variant="contained"
              startIcon={
                forking ? (
                  <CircularProgress size={16} sx={{color: '#fff'}} />
                ) : (
                  <CallSplitIcon />
                )
              }
              onClick={handleFork}
              disabled={forking}
              sx={{
                background: GRADIENTS.primary,
                fontWeight: 600,
                borderRadius: RADIUS.sm,
                px: 2.5,
                transition: `all 250ms ${EASINGS.smooth}`,
                '&:hover': {
                  background: GRADIENTS.primaryHover,
                  transform: 'translateY(-2px)',
                  boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.4)}`,
                },
                '&:active': {
                  transform: 'translateY(0) scale(0.98)',
                },
                '&:focus-visible': {
                  outline: `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: 2,
                },
                '&.Mui-disabled': {
                  background: alpha(theme.palette.primary.main, 0.3),
                  color: alpha('#fff', 0.5),
                },
              }}
            >
              Fork ({recipe.fork_count || 0})
            </Button>
          )}
        </Box>

        {/* Main card */}
        <Grow in timeout={500}>
          <Card
            elevation={0}
            sx={{
              mb: 2,
              ...socialTokens.glass.subtle(theme),
              borderRadius: RADIUS.lg,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Top accent line */}
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '1px',
                background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.primary.main, 0.15)} 30%, ${alpha(theme.palette.secondary.main, 0.15)} 70%, transparent)`,
              }}
            />

            <CardContent sx={{position: 'relative', zIndex: 1}}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  mb: 1,
                  flexWrap: 'wrap',
                }}
              >
                {recipe.author && <UserChip user={recipe.author} />}
                {recipe.created_at && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: alpha(theme.palette.common.white, 0.4),
                    }}
                  >
                    {new Date(recipe.created_at).toLocaleDateString()}
                  </Typography>
                )}
              </Box>
              {recipe.description && (
                <Typography
                  variant="body1"
                  sx={{
                    color: alpha(theme.palette.common.white, 0.75),
                    lineHeight: 1.7,
                    mb: 1,
                  }}
                >
                  {recipe.description}
                </Typography>
              )}
              {recipe.tags && recipe.tags.length > 0 && (
                <Box sx={{display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1}}>
                  {recipe.tags.map((t) => (
                    <Chip
                      key={t}
                      size="small"
                      label={t}
                      sx={{
                        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)}, ${alpha(theme.palette.secondary.main, 0.08)})`,
                        color: alpha(theme.palette.common.white, 0.65),
                        border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                        fontWeight: 500,
                        fontSize: '0.72rem',
                        borderRadius: RADIUS.sm,
                        transition: `all 200ms ${EASINGS.smooth}`,
                        '&:hover': {
                          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.2)}, ${alpha(theme.palette.secondary.main, 0.15)})`,
                          borderColor: alpha(theme.palette.primary.main, 0.3),
                        },
                      }}
                    />
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grow>

        {/* Steps section */}
        <Grow in timeout={600}>
          <Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                mb: 1.5,
                color: alpha(theme.palette.common.white, 0.9),
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: theme.palette.secondary.main,
                  boxShadow: `0 0 10px ${theme.palette.secondary.main}`,
                }}
              />
              Steps
            </Typography>
            <Box
              sx={{
                ...socialTokens.glass.subtle(theme),
                borderRadius: RADIUS.md,
                p: 2.5,
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                fontSize: '0.875rem',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowX: 'auto',
                color: alpha(theme.palette.common.white, 0.75),
                border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                position: 'relative',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '1px',
                  background: `linear-gradient(90deg, transparent, ${alpha(theme.palette.primary.main, 0.12)} 30%, ${alpha(theme.palette.secondary.main, 0.12)} 70%, transparent)`,
                },
              }}
            >
              {recipe.steps
                ? typeof recipe.steps === 'string'
                  ? recipe.steps
                  : JSON.stringify(recipe.steps, null, 2)
                : 'No steps defined'}
            </Box>
          </Box>
        </Grow>
      </Box>
    </Fade>
  );
}
