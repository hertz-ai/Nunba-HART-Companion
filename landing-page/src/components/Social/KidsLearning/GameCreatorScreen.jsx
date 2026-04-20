import kidsLearningStore from './data/kidsLearningStore';
import {kidsColors, kidsRadius, kidsShadows} from './data/kidsTheme';
import {createGameAndWait} from './kidsLearningApi';

import {useReducedMotion} from '../../../hooks/useAnimations';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BoltIcon from '@mui/icons-material/Bolt';
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import {
  Box,
  Typography,
  TextField,
  Button,
  Chip,
  Card,
  IconButton,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Fade,
} from '@mui/material';
import React, {useState, useCallback} from 'react';
import {useNavigate} from 'react-router-dom';



/* ---- Inject CSS keyframes ---- */
const CREATOR_ANIM_ID = 'kids-creator-keyframes';
function ensureCreatorKeyframes() {
  if (document.getElementById(CREATOR_ANIM_ID)) return;
  const style = document.createElement('style');
  style.id = CREATOR_ANIM_ID;
  style.textContent = `
    @keyframes kidsSparkle {
      0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.7; }
      25%  { transform: scale(1.2) rotate(10deg); opacity: 1; }
      50%  { transform: scale(0.9) rotate(-5deg); opacity: 0.8; }
      75%  { transform: scale(1.15) rotate(3deg); opacity: 1; }
    }
    @keyframes kidsBounce {
      0%, 100% { transform: translateY(0); }
      50%      { transform: translateY(-8px); }
    }
    @keyframes kidsGlow {
      0%, 100% { box-shadow: 0 0 15px rgba(108,99,255,0.2); }
      50%      { box-shadow: 0 0 30px rgba(108,99,255,0.45); }
    }
  `;
  document.head.appendChild(style);
}

/* Suggested prompts */
const SUGGESTED_PROMPTS = [
  'Create a game about dinosaurs',
  'Teach me addition with fruits',
  'A matching game about ocean animals',
  'Quiz me on world capitals',
  'Rhyming words for 5-year-olds',
  'Shapes and colours sorting game',
  'Feelings identification game',
  'Tell time with clocks',
];

/* Creation modes */
const MODES = [
  {
    value: 'game',
    label: 'Game',
    icon: <SportsEsportsIcon sx={{fontSize: 20}} />,
    desc: 'Quick quiz or activity',
  },
  {
    value: 'template',
    label: 'Template',
    icon: <DashboardCustomizeIcon sx={{fontSize: 20}} />,
    desc: 'Reusable game template',
  },
  {
    value: 'dynamic',
    label: 'Full Dynamic',
    icon: <BoltIcon sx={{fontSize: 20}} />,
    desc: 'AI-generated experience',
  },
];

/* =================================================================
   GameCreatorScreen — AI-powered game creation
   ================================================================= */
export default function GameCreatorScreen() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState('game');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  React.useEffect(() => {
    ensureCreatorKeyframes();
  }, []);

  /* Generate game via AI agent API */
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    setPreview(null);

    try {
      const result = await createGameAndWait(prompt, '5-8', mode, (status) => {
        // Could update a progress indicator here
      });

      const gameData = result?.data || result;
      if (gameData?.config || gameData?.template || gameData?.content) {
        const config = gameData.config || gameData;
        setPreview({
          id: config.id || `ai-${Date.now()}`,
          title: config.title || prompt.slice(0, 40),
          emoji: config.emoji || '🤖',
          category: config.category || 'creativity',
          difficulty: config.difficulty || 2,
          ageRange: Array.isArray(config.ageRange)
            ? `${config.ageRange[0]}-${config.ageRange[1]}`
            : config.ageRange || '5-8',
          description: config.description || `AI-generated: ${prompt}`,
          template: config.template || 'multiple-choice',
          questionCount: config.questionsPerSession || 8,
          hasTimer: !!config.content?.timeLimit,
          content: config.content,
          questions: config.content?.questions,
        });
      } else {
        setError('The AI could not generate a game. Try a different prompt!');
      }
    } catch (e) {
      setError(e?.message || 'Something went wrong. Please try again!');
    } finally {
      setLoading(false);
    }
  }, [prompt, mode]);

  const handlePlayGenerated = useCallback(() => {
    if (!preview) return;
    // Save the custom game to local store for later replay
    try {
      const stored = JSON.parse(
        localStorage.getItem('hevolve_kids_custom_games') || '[]'
      );
      stored.unshift(preview);
      if (stored.length > 50) stored.length = 50;
      localStorage.setItem('hevolve_kids_custom_games', JSON.stringify(stored));
    } catch {
      /* silent */
    }
    // Navigate to play it (pass config via URL state)
    navigate(`/social/kids/game/${preview.id}`, {
      state: {customConfig: preview},
    });
  }, [preview, navigate]);

  return (
    <Box sx={{pb: 6, minHeight: '100vh', background: kidsColors.bgGradient}}>
      {/* Header */}
      <Box sx={{display: 'flex', alignItems: 'center', px: 2, py: 1.5}}>
        <IconButton
          onClick={() => navigate('/social/kids')}
          sx={{color: kidsColors.textPrimary}}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography
          variant="h6"
          sx={{fontWeight: 700, color: kidsColors.textPrimary, ml: 1}}
        >
          Create a Game
        </Typography>
        <AutoAwesomeIcon
          sx={{
            ml: 1,
            color: kidsColors.accent,
            fontSize: 22,
            animation: 'kidsSparkle 2s ease-in-out infinite',
          }}
        />
      </Box>

      <Box sx={{px: 2}}>
        {/* ---- Mode Selector ---- */}
        <Typography
          variant="subtitle2"
          sx={{fontWeight: 600, color: kidsColors.textPrimary, mb: 1}}
        >
          Creation Mode
        </Typography>
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={(_, v) => {
            if (v) setMode(v);
          }}
          sx={{mb: 3, display: 'flex', gap: 1}}
        >
          {MODES.map((m) => (
            <ToggleButton
              key={m.value}
              value={m.value}
              sx={{
                flex: 1,
                flexDirection: 'column',
                gap: 0.5,
                borderRadius: `${kidsRadius.sm} !important`,
                border: '2px solid transparent !important',
                bgcolor: mode === m.value ? `${kidsColors.primary}12` : '#fff',
                borderColor:
                  mode === m.value
                    ? `${kidsColors.primary} !important`
                    : 'rgba(0,0,0,0.08) !important',
                textTransform: 'none',
                py: 1.5,
                '&.Mui-selected': {
                  bgcolor: `${kidsColors.primary}12`,
                  color: kidsColors.primary,
                },
              }}
            >
              {m.icon}
              <Typography variant="caption" sx={{fontWeight: 600}}>
                {m.label}
              </Typography>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* ---- Prompt Input ---- */}
        <Typography
          variant="subtitle2"
          sx={{fontWeight: 600, color: kidsColors.textPrimary, mb: 1}}
        >
          What should the game be about?
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={3}
          maxRows={6}
          placeholder="E.g. Create a matching game about solar system planets for 6-year-olds..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          sx={{
            mb: 2,
            '& .MuiOutlinedInput-root': {
              borderRadius: kidsRadius.sm,
              bgcolor: '#fff',
              '& fieldset': {borderColor: 'rgba(108,99,255,0.15)'},
              '&.Mui-focused fieldset': {borderColor: kidsColors.primary},
            },
          }}
        />

        {/* ---- Suggested Prompts ---- */}
        <Typography
          variant="caption"
          sx={{color: kidsColors.textSecondary, mb: 1, display: 'block'}}
        >
          Or try a suggestion:
        </Typography>
        <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3}}>
          {SUGGESTED_PROMPTS.map((sp) => (
            <Chip
              key={sp}
              label={sp}
              onClick={() => setPrompt(sp)}
              variant={prompt === sp ? 'filled' : 'outlined'}
              sx={{
                borderRadius: kidsRadius.pill,
                fontWeight: 500,
                fontSize: '0.78rem',
                borderColor: kidsColors.primaryLight,
                bgcolor: prompt === sp ? kidsColors.primary : 'transparent',
                color: prompt === sp ? '#fff' : kidsColors.textPrimary,
                '&:hover': {
                  bgcolor:
                    prompt === sp
                      ? kidsColors.primaryLight
                      : `${kidsColors.primary}08`,
                },
              }}
            />
          ))}
        </Box>

        {/* ---- Generate Button ---- */}
        <Button
          fullWidth
          variant="contained"
          size="large"
          disabled={!prompt.trim() || loading}
          onClick={handleGenerate}
          startIcon={loading ? null : <AutoAwesomeIcon />}
          sx={{
            bgcolor: kidsColors.primary,
            borderRadius: kidsRadius.pill,
            py: 1.5,
            fontWeight: 700,
            fontSize: '1rem',
            textTransform: 'none',
            boxShadow: kidsShadows.fab,
            '&:hover': {bgcolor: kidsColors.primaryLight},
            '&.Mui-disabled': {
              bgcolor: kidsColors.primaryLight,
              color: '#fff',
              opacity: 0.6,
            },
          }}
        >
          {loading ? (
            <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
              <CircularProgress size={22} sx={{color: '#fff'}} />
              <span>Creating your game...</span>
            </Box>
          ) : (
            'Generate Game'
          )}
        </Button>

        {/* ---- Loading animation ---- */}
        {loading && (
          <Box sx={{textAlign: 'center', mt: 4}}>
            <Typography
              sx={{
                fontSize: 56,
                animation: 'kidsBounce 0.8s ease-in-out infinite',
              }}
            >
              🧙
            </Typography>
            <Typography
              variant="body2"
              sx={{color: kidsColors.textSecondary, mt: 1}}
            >
              Our AI wizard is crafting something special...
            </Typography>
          </Box>
        )}

        {/* ---- Error ---- */}
        {error && (
          <Typography
            variant="body2"
            sx={{color: kidsColors.error, mt: 2, textAlign: 'center'}}
          >
            {error}
          </Typography>
        )}

        {/* ---- Preview ---- */}
        {preview && !loading && (
          <Fade in timeout={500}>
            <Card
              sx={{
                mt: 3,
                p: 2.5,
                borderRadius: kidsRadius.md,
                boxShadow: kidsShadows.card,
                animation: 'kidsGlow 2s ease-in-out infinite',
              }}
            >
              <Box
                sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 2}}
              >
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: kidsRadius.sm,
                    bgcolor: `${kidsColors.primary}12`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                  }}
                >
                  {preview.emoji}
                </Box>
                <Box>
                  <Typography
                    variant="subtitle1"
                    sx={{fontWeight: 700, color: kidsColors.textPrimary}}
                  >
                    {preview.title}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{color: kidsColors.textSecondary}}
                  >
                    {preview.questionCount} questions &middot; Ages{' '}
                    {preview.ageRange}
                  </Typography>
                </Box>
              </Box>

              <Typography
                variant="body2"
                sx={{color: kidsColors.textSecondary, mb: 2}}
              >
                {preview.description}
              </Typography>

              {preview.questions && preview.questions.length > 0 && (
                <Box
                  sx={{
                    mb: 2,
                    p: 1.5,
                    bgcolor: kidsColors.surfaceLight,
                    borderRadius: kidsRadius.sm,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{fontWeight: 600, color: kidsColors.textPrimary}}
                  >
                    Preview question:
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{color: kidsColors.textPrimary, mt: 0.5}}
                  >
                    {preview.questions[0].question}
                  </Typography>
                </Box>
              )}

              <Button
                fullWidth
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={handlePlayGenerated}
                sx={{
                  bgcolor: kidsColors.success,
                  borderRadius: kidsRadius.pill,
                  py: 1.2,
                  fontWeight: 700,
                  textTransform: 'none',
                  '&:hover': {bgcolor: '#05c090'},
                }}
              >
                Play This Game
              </Button>
            </Card>
          </Fade>
        )}
      </Box>
    </Box>
  );
}
