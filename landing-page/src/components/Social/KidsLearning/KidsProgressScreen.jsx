import {getProgress} from './data/kidsLearningStore';
import {
  kidsColors,
  kidsRadius,
  kidsShadows,
  CATEGORIES,
} from './data/kidsTheme';

import {useReducedMotion, useAnimatedMount} from '../../../hooks/useAnimations';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import HistoryIcon from '@mui/icons-material/History';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SchoolIcon from '@mui/icons-material/School';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Box,
  Typography,
  Card,
  LinearProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Chip,
  Fade,
} from '@mui/material';
import React, {useState, useEffect} from 'react';
import {useNavigate} from 'react-router-dom';



/* Colour lookup */
const catColorMap = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.color]));
const catLabelMap = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));
const catIconMap = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.icon]));

/* Small stat box */
function StatBox({icon, value, label, color, delay = 0, reducedMotion}) {
  return (
    <Box
      sx={{
        flex: '1 1 0',
        minWidth: 100,
        textAlign: 'center',
        p: 2,
        borderRadius: kidsRadius.sm,
        bgcolor: `${color}12`,
        '@keyframes statEntrance': {
          '0%': {opacity: 0, transform: 'translateY(16px) scale(0.95)'},
          '100%': {opacity: 1, transform: 'translateY(0) scale(1)'},
        },
        animation: reducedMotion
          ? 'none'
          : `statEntrance 0.5s ${delay}ms ease-out both`,
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        '&:hover': reducedMotion
          ? {}
          : {
              transform: 'translateY(-2px)',
              boxShadow: `0 4px 12px ${color}25`,
            },
      }}
    >
      <Box sx={{mb: 0.5}}>{icon}</Box>
      <Typography variant="h5" sx={{fontWeight: 800, color}}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{color: kidsColors.textSecondary}}>
        {label}
      </Typography>
    </Box>
  );
}

/* 3R gauge */
function ThreeRBar({label, value, color, icon, delay = 0, reducedMotion}) {
  const [animatedValue, setAnimatedValue] = useState(reducedMotion ? value : 0);

  useEffect(() => {
    if (reducedMotion) {
      setAnimatedValue(value);
      return;
    }
    const timer = setTimeout(() => setAnimatedValue(value), delay + 300);
    return () => clearTimeout(timer);
  }, [value, delay, reducedMotion]);

  return (
    <Box
      sx={{
        mb: 2,
        '@keyframes barFadeIn': {
          '0%': {opacity: 0, transform: 'translateX(-12px)'},
          '100%': {opacity: 1, transform: 'translateX(0)'},
        },
        animation: reducedMotion
          ? 'none'
          : `barFadeIn 0.4s ${delay}ms ease-out both`,
      }}
    >
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 0.5}}>
        {icon}
        <Typography
          variant="subtitle2"
          sx={{fontWeight: 600, color: kidsColors.textPrimary}}
        >
          {label}
        </Typography>
        <Typography variant="caption" sx={{ml: 'auto', fontWeight: 700, color}}>
          {value}%
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={animatedValue}
        sx={{
          height: 10,
          borderRadius: '5px',
          bgcolor: `${color}20`,
          '& .MuiLinearProgress-bar': {
            bgcolor: color,
            borderRadius: '5px',
            transition: reducedMotion
              ? 'none'
              : 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)',
          },
        }}
      />
    </Box>
  );
}

/* =================================================================
   KidsProgressScreen — Learning progress dashboard
   ================================================================= */
export default function KidsProgressScreen() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(null);
  const reducedMotion = useReducedMotion();
  const mounted = useAnimatedMount();

  useEffect(() => {
    setProgress(getProgress());
  }, []);

  if (!progress) return null;

  const accuracy =
    progress.totalQuestions > 0
      ? Math.round((progress.totalCorrect / progress.totalQuestions) * 100)
      : 0;

  const categoryEntries = Object.entries(progress.categoryStats);

  return (
    <Fade in={mounted} timeout={reducedMotion ? 0 : 400}>
      <Box sx={{pb: 6}}>
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
            My Progress
          </Typography>
        </Box>

        {/* ---- Overall Stats ---- */}
        <Card
          sx={{
            mx: 2,
            mb: 3,
            p: 2.5,
            borderRadius: kidsRadius.md,
            boxShadow: kidsShadows.card,
            '@keyframes cardSlideIn': {
              '0%': {opacity: 0, transform: 'translateY(20px)'},
              '100%': {opacity: 1, transform: 'translateY(0)'},
            },
            animation: reducedMotion
              ? 'none'
              : 'cardSlideIn 0.5s ease-out both',
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{fontWeight: 700, color: kidsColors.textPrimary, mb: 2}}
          >
            Overall Stats
          </Typography>
          <Box sx={{display: 'flex', gap: 1.5, flexWrap: 'wrap'}}>
            <StatBox
              icon={
                <SchoolIcon sx={{color: kidsColors.primary, fontSize: 28}} />
              }
              value={progress.gamesPlayed}
              label="Games Played"
              color={kidsColors.primary}
              delay={100}
              reducedMotion={reducedMotion}
            />
            <StatBox
              icon={
                <CheckCircleOutlineIcon
                  sx={{color: kidsColors.success, fontSize: 28}}
                />
              }
              value={`${accuracy}%`}
              label="Accuracy"
              color={kidsColors.success}
              delay={200}
              reducedMotion={reducedMotion}
            />
            <StatBox
              icon={
                <LocalFireDepartmentIcon
                  sx={{color: '#FF6B35', fontSize: 28}}
                />
              }
              value={progress.streak}
              label={`Streak (Best ${progress.bestStreak})`}
              color="#FF6B35"
              delay={300}
              reducedMotion={reducedMotion}
            />
          </Box>
        </Card>

        {/* ---- 3R Intelligence ---- */}
        <Card
          sx={{
            mx: 2,
            mb: 3,
            p: 2.5,
            borderRadius: kidsRadius.md,
            boxShadow: kidsShadows.card,
            '@keyframes cardSlideIn2': {
              '0%': {opacity: 0, transform: 'translateY(20px)'},
              '100%': {opacity: 1, transform: 'translateY(0)'},
            },
            animation: reducedMotion
              ? 'none'
              : 'cardSlideIn2 0.5s 200ms ease-out both',
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{fontWeight: 700, color: kidsColors.textPrimary, mb: 2}}
          >
            3R Intelligence
          </Typography>
          <ThreeRBar
            label="Recall"
            value={progress.threeR.recall}
            color={kidsColors.primary}
            icon={
              <PsychologyIcon sx={{fontSize: 20, color: kidsColors.primary}} />
            }
            delay={0}
            reducedMotion={reducedMotion}
          />
          <ThreeRBar
            label="Retention"
            value={progress.threeR.retention}
            color={kidsColors.success}
            icon={
              <HistoryIcon sx={{fontSize: 20, color: kidsColors.success}} />
            }
            delay={150}
            reducedMotion={reducedMotion}
          />
          <ThreeRBar
            label="Recognition"
            value={progress.threeR.recognition}
            color={kidsColors.info}
            icon={
              <VisibilityIcon sx={{fontSize: 20, color: kidsColors.info}} />
            }
            delay={300}
            reducedMotion={reducedMotion}
          />
        </Card>

        {/* ---- Category Breakdown ---- */}
        {categoryEntries.length > 0 && (
          <Card
            sx={{
              mx: 2,
              mb: 3,
              p: 2.5,
              borderRadius: kidsRadius.md,
              boxShadow: kidsShadows.card,
              '@keyframes cardSlideIn3': {
                '0%': {opacity: 0, transform: 'translateY(20px)'},
                '100%': {opacity: 1, transform: 'translateY(0)'},
              },
              animation: reducedMotion
                ? 'none'
                : 'cardSlideIn3 0.5s 400ms ease-out both',
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{fontWeight: 700, color: kidsColors.textPrimary, mb: 2}}
            >
              By Category
            </Typography>
            {categoryEntries.map(([cat, stats], idx) => {
              const catAcc =
                stats.total > 0
                  ? Math.round((stats.correct / stats.total) * 100)
                  : 0;
              const color = catColorMap[cat] || kidsColors.primary;
              return (
                <Box
                  key={cat}
                  sx={{
                    mb: 2,
                    '@keyframes catFadeIn': {
                      '0%': {opacity: 0, transform: 'translateX(-8px)'},
                      '100%': {opacity: 1, transform: 'translateX(0)'},
                    },
                    animation: reducedMotion
                      ? 'none'
                      : `catFadeIn 0.35s ${500 + idx * 100}ms ease-out both`,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      mb: 0.5,
                    }}
                  >
                    <Typography sx={{fontSize: 18}}>
                      {catIconMap[cat] || '📚'}
                    </Typography>
                    <Typography
                      variant="subtitle2"
                      sx={{fontWeight: 600, color: kidsColors.textPrimary}}
                    >
                      {catLabelMap[cat] || cat}
                    </Typography>
                    <Chip
                      label={`${stats.played} games`}
                      size="small"
                      sx={{
                        ml: 'auto',
                        bgcolor: `${color}15`,
                        color,
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        height: 22,
                      }}
                    />
                    <Typography variant="caption" sx={{fontWeight: 700, color}}>
                      {catAcc}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={catAcc}
                    sx={{
                      height: 8,
                      borderRadius: '4px',
                      bgcolor: `${color}18`,
                      '& .MuiLinearProgress-bar': {
                        bgcolor: color,
                        borderRadius: '4px',
                        transition: reducedMotion
                          ? 'none'
                          : 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                      },
                    }}
                  />
                </Box>
              );
            })}
          </Card>
        )}

        {/* ---- Recent Games ---- */}
        {progress.recentGames.length > 0 && (
          <Card
            sx={{
              mx: 2,
              p: 2.5,
              borderRadius: kidsRadius.md,
              boxShadow: kidsShadows.card,
              '@keyframes cardSlideIn4': {
                '0%': {opacity: 0, transform: 'translateY(20px)'},
                '100%': {opacity: 1, transform: 'translateY(0)'},
              },
              animation: reducedMotion
                ? 'none'
                : 'cardSlideIn4 0.5s 500ms ease-out both',
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{fontWeight: 700, color: kidsColors.textPrimary, mb: 1}}
            >
              Recent Games
            </Typography>
            <Divider sx={{mb: 1}} />
            <List disablePadding>
              {progress.recentGames.slice(0, 10).map((game, idx) => {
                const color = catColorMap[game.category] || kidsColors.primary;
                return (
                  <ListItem
                    key={idx}
                    disablePadding
                    sx={{
                      py: 0.75,
                      '@keyframes gameItemFade': {
                        '0%': {opacity: 0, transform: 'translateX(-8px)'},
                        '100%': {opacity: 1, transform: 'translateX(0)'},
                      },
                      animation: reducedMotion
                        ? 'none'
                        : `gameItemFade 0.3s ${600 + idx * 60}ms ease-out both`,
                    }}
                  >
                    <ListItemIcon sx={{minWidth: 36}}>
                      <EmojiEventsIcon
                        sx={{
                          fontSize: 22,
                          color:
                            game.accuracy >= 90
                              ? kidsColors.starFilled
                              : game.accuracy >= 70
                                ? kidsColors.success
                                : kidsColors.textMuted,
                        }}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography
                          variant="body2"
                          sx={{fontWeight: 600, color: kidsColors.textPrimary}}
                        >
                          {game.title}
                        </Typography>
                      }
                      secondary={
                        <Typography
                          variant="caption"
                          sx={{color: kidsColors.textSecondary}}
                        >
                          {game.correctAnswers ?? game.correct}/
                          {game.totalQuestions ?? game.total} correct &middot;{' '}
                          {new Date(
                            game.timestamp || game.date
                          ).toLocaleDateString()}
                        </Typography>
                      }
                    />
                    <Chip
                      label={`${game.accuracy}%`}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.72rem',
                        height: 24,
                        bgcolor:
                          game.accuracy >= 70
                            ? `${kidsColors.success}18`
                            : `${kidsColors.error}18`,
                        color:
                          game.accuracy >= 70
                            ? kidsColors.success
                            : kidsColors.error,
                      }}
                    />
                  </ListItem>
                );
              })}
            </List>
          </Card>
        )}

        {/* Empty state */}
        {progress.gamesPlayed === 0 && (
          <Box
            sx={{
              textAlign: 'center',
              py: 8,
              px: 3,
              '@keyframes emptyFloat': {
                '0%, 100%': {transform: 'translateY(0)'},
                '50%': {transform: 'translateY(-10px)'},
              },
            }}
          >
            <Typography
              sx={{
                fontSize: 64,
                mb: 2,
                animation: reducedMotion
                  ? 'none'
                  : 'emptyFloat 3s ease-in-out infinite',
                display: 'inline-block',
              }}
            >
              🎮
            </Typography>
            <Typography
              variant="h6"
              sx={{fontWeight: 700, color: kidsColors.textPrimary, mb: 1}}
            >
              No games played yet
            </Typography>
            <Typography
              variant="body2"
              sx={{color: kidsColors.textSecondary, mb: 3}}
            >
              Play some games in the Kids Learning Hub and your progress will
              show up here!
            </Typography>
            <Typography
              variant="body2"
              onClick={() => navigate('/social/kids')}
              sx={{
                color: kidsColors.primary,
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'transform 0.2s ease',
                '&:hover': reducedMotion ? {} : {transform: 'scale(1.05)'},
              }}
            >
              Go to Hub
            </Typography>
          </Box>
        )}
      </Box>
    </Fade>
  );
}
