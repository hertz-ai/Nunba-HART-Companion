/**
 * TeachYourselfAgentCard
 *
 * An AI-powered learning companion card that analyzes the child's learning data
 * and provides personalized recommendations. Appears on the KidsLearningHub page
 * as a friendly AI tutor card with a "Dynamic Liquid Agentic UI" design.
 *
 * Features:
 *  - Animated AI avatar with personalized time-of-day greeting
 *  - Learning insights: weak concepts, strongest category, streak, 3R progress bars
 *  - Personalized "Try These Next" game recommendations
 *  - Quick action buttons: Practice Weak Spots, Daily Challenge, Create My Game
 *
 * Props:
 *  - progress        { gamesPlayed, totalCorrect, totalQuestions, streak, bestStreak, categoryStats, threeR, recentGames }
 *  - gameConfigs     Array of all game config objects
 *  - onPlayGame      (gameId) => void
 *  - onCreateGame    () => void
 *  - conceptScores   { [concept]: { correct, total, lastSeen } }
 *  - ageGroup        '4-6' | '6-8' | '8-10'
 */

import {useReducedMotion} from '../../../../hooks/useAnimations';
import {
  kidsColors,
  kidsShadows,
  kidsRadius,
  kidsAnimations,
  kidsMixins,
  CATEGORY_MAP,
} from '../kidsTheme';

import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import HistoryIcon from '@mui/icons-material/History';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PsychologyIcon from '@mui/icons-material/Psychology';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Box,
  Typography,
  Button,
  Card,
  Chip,
  LinearProgress,
  Avatar,
  IconButton,
  Tooltip,
} from '@mui/material';
import React, {useMemo, useState, useEffect} from 'react';


// ─── CSS Keyframes (injected once) ───────────────────────────────────────────

const AGENT_ANIM_ID = 'kids-agent-card-keyframes';
function ensureAgentKeyframes() {
  if (document.getElementById(AGENT_ANIM_ID)) return;
  const style = document.createElement('style');
  style.id = AGENT_ANIM_ID;
  style.textContent = `
    @keyframes agentFloat {
      0%, 100% { transform: translateY(0px); }
      50%      { transform: translateY(-8px); }
    }
    @keyframes agentPulseGlow {
      0%, 100% { box-shadow: 0 0 20px rgba(108, 92, 231, 0.3), 0 0 40px rgba(108, 92, 231, 0.1); }
      50%      { box-shadow: 0 0 30px rgba(108, 92, 231, 0.5), 0 0 60px rgba(108, 92, 231, 0.2); }
    }
    @keyframes agentCardEntrance {
      0%   { opacity: 0; transform: translateY(28px) scale(0.96); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes agentShimmer {
      0%   { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes agentWave {
      0%   { transform: rotate(0deg); }
      15%  { transform: rotate(14deg); }
      30%  { transform: rotate(-8deg); }
      45%  { transform: rotate(14deg); }
      60%  { transform: rotate(-4deg); }
      75%  { transform: rotate(10deg); }
      100% { transform: rotate(0deg); }
    }
    @keyframes agentProgressFill {
      0%   { transform: scaleX(0); }
      100% { transform: scaleX(1); }
    }
    @keyframes agentGameCardPop {
      0%   { opacity: 0; transform: scale(0.85) translateY(12px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns a greeting based on the current time of day */
function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return {text: 'Good Morning', emoji: '🌅', period: 'morning'};
  if (h < 17) return {text: 'Good Afternoon', emoji: '☀️', period: 'afternoon'};
  return {text: 'Good Evening', emoji: '🌙', period: 'evening'};
}

/** Returns an encouraging agent message based on the learner's progress */
function getAgentMessage(progress, weakConcepts, strongestCategory) {
  if (!progress || progress.gamesPlayed === 0) {
    return "I'm your learning buddy! Let's explore some fun games together.";
  }

  const accuracy =
    progress.totalQuestions > 0
      ? Math.round((progress.totalCorrect / progress.totalQuestions) * 100)
      : 0;

  if (weakConcepts.length > 0 && accuracy < 60) {
    return "Let's practice together! I found some areas where a little extra work will make a big difference.";
  }
  if (weakConcepts.length > 0) {
    return `You're doing well! I noticed a few spots we can strengthen. Let's level up together!`;
  }
  if (progress.streak >= 5) {
    return `Incredible ${progress.streak}-game streak! You're on fire. Let's keep it going!`;
  }
  if (accuracy >= 85) {
    return "Amazing work! You're really mastering these topics. Ready for a new challenge?";
  }
  if (strongestCategory) {
    const catLabel =
      CATEGORY_MAP[strongestCategory]?.label || strongestCategory;
    return `You're a ${catLabel} superstar! Want to explore other subjects too?`;
  }
  return "You're learning so much! I have some great recommendations for you.";
}

/** Returns age range bounds as [min, max] from ageGroup string */
function parseAgeGroup(ageGroup) {
  if (!ageGroup) return [4, 10];
  const parts = ageGroup.split('-').map(Number);
  return [parts[0] || 4, parts[1] || 10];
}

/**
 * Recommendation algorithm
 *
 * 1. Find weak concepts (accuracy < 60%, attempted >= 2)
 * 2. Find least-played categories
 * 3. Match games to weak concepts first, then least-played categories
 * 4. Filter by age appropriateness
 * 5. Return top 3 games
 */
function getRecommendations(
  conceptScores,
  gameConfigs,
  categoryStats,
  ageGroup
) {
  if (!gameConfigs || gameConfigs.length === 0) return [];

  const [ageMin, ageMax] = parseAgeGroup(ageGroup);

  // Age-filter helper
  const isAgeAppropriate = (game) => {
    if (!game.ageRange) return true;
    const range = Array.isArray(game.ageRange) ? game.ageRange : [4, 10];
    // Allow some overlap
    return range[0] <= ageMax && range[1] >= ageMin;
  };

  // 1. Find weak concepts
  const weakConcepts = conceptScores
    ? Object.entries(conceptScores)
        .filter(([_, v]) => v.total >= 2 && v.correct / v.total < 0.6)
        .map(([k]) => k)
    : [];

  // 2. Find least-played categories
  const categories = ['english', 'math', 'lifeSkills', 'science', 'creativity'];
  const sortedCats = [...categories].sort(
    (a, b) =>
      (categoryStats?.[a]?.played || 0) - (categoryStats?.[b]?.played || 0)
  );

  const recommended = [];
  const usedIds = new Set();

  // 3a. Match games to weak concepts first
  if (weakConcepts.length > 0) {
    for (const game of gameConfigs) {
      if (usedIds.has(game.id) || !isAgeAppropriate(game)) continue;

      // Check if game teaches any weak concept
      const gameContent = game.content || {};
      const allConcepts = [];

      // Gather concepts from various content shapes
      if (gameContent.questions) {
        gameContent.questions.forEach(
          (q) => q.concept && allConcepts.push(q.concept)
        );
      }
      if (gameContent.statements) {
        gameContent.statements.forEach(
          (s) => s.concept && allConcepts.push(s.concept)
        );
      }
      if (gameContent.pairs) {
        gameContent.pairs.forEach(
          (p) => p.concept && allConcepts.push(p.concept)
        );
      }
      if (gameContent.words) {
        gameContent.words.forEach(
          (w) => w.concept && allConcepts.push(w.concept)
        );
      }
      if (gameContent.rounds) {
        gameContent.rounds.forEach(
          (r) => r.concept && allConcepts.push(r.concept)
        );
      }

      const matchesWeak = allConcepts.some((c) => weakConcepts.includes(c));
      if (matchesWeak) {
        recommended.push({...game, reason: 'weak-concept'});
        usedIds.add(game.id);
        if (recommended.length >= 3) break;
      }
    }
  }

  // 3b. Fill remaining slots from least-played categories
  if (recommended.length < 3) {
    for (const cat of sortedCats) {
      if (recommended.length >= 3) break;
      const catGames = gameConfigs.filter(
        (g) => g.category === cat && !usedIds.has(g.id) && isAgeAppropriate(g)
      );
      if (catGames.length > 0) {
        // Pick a random game from the least-played category
        const pick = catGames[Math.floor(Math.random() * catGames.length)];
        recommended.push({...pick, reason: 'least-played'});
        usedIds.add(pick.id);
      }
    }
  }

  // 3c. If still under 3, fill with random age-appropriate games
  if (recommended.length < 3) {
    const remaining = gameConfigs.filter(
      (g) => !usedIds.has(g.id) && isAgeAppropriate(g)
    );
    for (const game of remaining) {
      if (recommended.length >= 3) break;
      recommended.push({...game, reason: 'explore'});
      usedIds.add(game.id);
    }
  }

  return recommended.slice(0, 3);
}

/** Find the strongest category by accuracy (minimum 2 games played) */
function getStrongestCategory(categoryStats) {
  if (!categoryStats) return null;
  let best = null;
  let bestAcc = -1;

  for (const [cat, stats] of Object.entries(categoryStats)) {
    if (stats.played >= 2 && stats.total > 0) {
      const acc = stats.correct / stats.total;
      if (acc > bestAcc) {
        bestAcc = acc;
        best = cat;
      }
    }
  }
  return best;
}

/** Find weak concepts with accuracy < 60% and at least 2 attempts */
function getWeakConceptsList(conceptScores) {
  if (!conceptScores) return [];
  return Object.entries(conceptScores)
    .filter(([_, v]) => v.total >= 2 && v.correct / v.total < 0.6)
    .sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)
    .slice(0, 4)
    .map(([concept, v]) => ({
      concept,
      accuracy: Math.round((v.correct / v.total) * 100),
    }));
}

/** Format a concept key for display (e.g. "spell:tiger" -> "Spell Tiger") */
function formatConcept(concept) {
  return concept.replace(/[_:]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** 3R Progress Bar with animation */
function ThreeRProgressBar({label, value, color, icon, delay = 0}) {
  return (
    <Box sx={{mb: 1.5}}>
      <Box sx={{display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5}}>
        {icon}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            color: kidsColors.textPrimary,
            fontSize: '0.82rem',
          }}
        >
          {label}
        </Typography>
        <Typography
          variant="caption"
          sx={{ml: 'auto', fontWeight: 700, color, fontSize: '0.8rem'}}
        >
          {value}%
        </Typography>
      </Box>
      <Box
        sx={{
          position: 'relative',
          height: 10,
          borderRadius: '5px',
          bgcolor: `${color}18`,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${value}%`,
            borderRadius: '5px',
            background: `linear-gradient(90deg, ${color}CC, ${color})`,
            animation: `agentProgressFill 1s ${delay}s ease-out both`,
            transformOrigin: 'left center',
          }}
        />
      </Box>
    </Box>
  );
}

/** Recommended game mini-card */
function RecommendedGameCard({game, index, onPlay}) {
  const catInfo = CATEGORY_MAP[game.category] || {};
  const reasonLabels = {
    'weak-concept': 'Practice',
    'least-played': 'Explore',
    explore: 'Try New',
  };

  return (
    <Box
      onClick={() => onPlay(game.id)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        borderRadius: `${kidsRadius.sm}`,
        bgcolor: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        cursor: 'pointer',
        animation: `agentGameCardPop 0.5s ${0.3 + index * 0.12}s ease-out both`,
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': {
          bgcolor: 'rgba(255, 255, 255, 0.12)',
          border: `1px solid ${catInfo.color || kidsColors.primary}50`,
          transform: 'translateX(4px)',
          boxShadow: `0 4px 16px ${catInfo.color || kidsColors.primary}20`,
        },
      }}
    >
      {/* Game emoji icon */}
      <Box
        sx={{
          width: 42,
          height: 42,
          borderRadius: `${kidsRadius.sm}`,
          background: catInfo.gradient || kidsColors.gradientPrimary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          flexShrink: 0,
        }}
      >
        {game.emoji || catInfo.emoji || '🎮'}
      </Box>

      {/* Game info */}
      <Box sx={{flex: 1, minWidth: 0}}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 700,
            color: '#fff',
            fontSize: '0.85rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {game.title}
        </Typography>
        <Typography
          variant="caption"
          sx={{color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.72rem'}}
        >
          {catInfo.label || game.category}
        </Typography>
      </Box>

      {/* Reason chip */}
      <Chip
        label={reasonLabels[game.reason] || 'Play'}
        size="small"
        sx={{
          height: 22,
          fontSize: '0.65rem',
          fontWeight: 700,
          bgcolor: `${catInfo.color || kidsColors.primary}25`,
          color: catInfo.color || kidsColors.primaryLight,
          border: `1px solid ${catInfo.color || kidsColors.primary}30`,
          flexShrink: 0,
        }}
      />

      {/* Play arrow */}
      <PlayArrowIcon
        sx={{color: 'rgba(255, 255, 255, 0.4)', fontSize: 20, flexShrink: 0}}
      />
    </Box>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TeachYourselfAgentCard({
  progress,
  gameConfigs: gameConfigsProp,
  onPlayGame,
  onCreateGame,
  conceptScores,
  ageGroup,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    ensureAgentKeyframes();
    // Delay mount to trigger entrance animation
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  // ── Derived data ──
  const greeting = useMemo(() => getTimeGreeting(), []);

  const weakConcepts = useMemo(
    () => getWeakConceptsList(conceptScores),
    [conceptScores]
  );

  const strongestCategory = useMemo(
    () => getStrongestCategory(progress?.categoryStats),
    [progress?.categoryStats]
  );

  const agentMessage = useMemo(
    () => getAgentMessage(progress, weakConcepts, strongestCategory),
    [progress, weakConcepts, strongestCategory]
  );

  const recommendations = useMemo(
    () =>
      getRecommendations(
        conceptScores,
        gameConfigsProp || [],
        progress?.categoryStats || {},
        ageGroup
      ),
    [conceptScores, gameConfigsProp, progress?.categoryStats, ageGroup]
  );

  const accuracy =
    progress && progress.totalQuestions > 0
      ? Math.round((progress.totalCorrect / progress.totalQuestions) * 100)
      : 0;

  const hasProgress = progress && progress.gamesPlayed > 0;

  // ── Pick a random recommended game for "Daily Challenge" ──
  const dailyChallengeGame = useMemo(() => {
    if (recommendations.length === 0 && gameConfigsProp?.length > 0) {
      return gameConfigsProp[
        Math.floor(Math.random() * gameConfigsProp.length)
      ];
    }
    return (
      recommendations[Math.floor(Math.random() * recommendations.length)] ||
      null
    );
  }, [recommendations, gameConfigsProp]);

  // ── Pick a weak-concept game for "Practice Weak Spots" ──
  const practiceGame = useMemo(() => {
    const weakGame = recommendations.find((r) => r.reason === 'weak-concept');
    return weakGame || dailyChallengeGame;
  }, [recommendations, dailyChallengeGame]);

  // ── Handlers ──
  const handlePracticeWeakSpots = () => {
    if (practiceGame && onPlayGame) onPlayGame(practiceGame.id);
  };

  const handleDailyChallenge = () => {
    if (dailyChallengeGame && onPlayGame) onPlayGame(dailyChallengeGame.id);
  };

  const handleCreateGame = () => {
    if (onCreateGame) onCreateGame();
  };

  if (!mounted) return null;

  return (
    <Card
      sx={{
        // Glass-morphism card with gradient border
        position: 'relative',
        overflow: 'visible',
        mx: 2,
        mb: 3,
        borderRadius: '24px',
        background:
          'linear-gradient(145deg, rgba(30, 20, 60, 0.92) 0%, rgba(45, 34, 85, 0.88) 50%, rgba(25, 18, 52, 0.92) 100%)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(108, 92, 231, 0.3)',
        boxShadow: `0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.05)`,
        animation: 'agentCardEntrance 0.6s ease-out both',

        // Gradient border effect via pseudo-element
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: -1,
          borderRadius: '25px',
          padding: '1px',
          background:
            'linear-gradient(135deg, rgba(108, 92, 231, 0.6), rgba(162, 155, 254, 0.2), rgba(255, 107, 53, 0.3), rgba(108, 92, 231, 0.6))',
          backgroundSize: '300% 300%',
          animation: 'agentShimmer 6s linear infinite',
          WebkitMask:
            'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          pointerEvents: 'none',
          zIndex: 0,
        },
      }}
    >
      <Box sx={{position: 'relative', zIndex: 1, p: {xs: 2.5, sm: 3}}}>
        {/* ─── Agent Avatar & Greeting ─── */}
        <Box sx={{display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2.5}}>
          {/* Animated AI Avatar */}
          <Box
            sx={{
              position: 'relative',
              flexShrink: 0,
            }}
          >
            <Avatar
              sx={{
                width: 60,
                height: 60,
                fontSize: 32,
                background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
                animation:
                  'agentFloat 3s ease-in-out infinite, agentPulseGlow 3s ease-in-out infinite',
                border: '2px solid rgba(162, 155, 254, 0.4)',
              }}
            >
              🧠
            </Avatar>
            {/* Small sparkle indicator */}
            <Box
              sx={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: 20,
                height: 20,
                borderRadius: '50%',
                bgcolor: kidsColors.correct,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid rgba(30, 20, 60, 0.9)',
              }}
            >
              <AutoAwesomeIcon sx={{fontSize: 12, color: '#fff'}} />
            </Box>
          </Box>

          {/* Greeting text */}
          <Box sx={{flex: 1, minWidth: 0}}>
            <Box
              sx={{display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5}}
            >
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 800,
                  color: '#fff',
                  fontSize: {xs: '1.05rem', sm: '1.15rem'},
                  lineHeight: 1.2,
                }}
              >
                {greeting.emoji} {greeting.text}!
              </Typography>
              <Box
                component="span"
                sx={{
                  display: 'inline-block',
                  fontSize: 18,
                  animation: 'agentWave 2s ease-in-out 1s 1',
                  transformOrigin: '70% 70%',
                }}
              >
                👋
              </Box>
            </Box>
            <Typography
              variant="body2"
              sx={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '0.85rem',
                lineHeight: 1.45,
              }}
            >
              {agentMessage}
            </Typography>
          </Box>
        </Box>

        {/* ─── Learning Insights (only if there is progress) ─── */}
        {hasProgress && (
          <Box sx={{mb: 2.5}}>
            {/* Stats row: Streak + Strongest Category + Accuracy */}
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                flexWrap: 'wrap',
                mb: 2,
              }}
            >
              {/* Streak */}
              {progress.streak >= 1 && (
                <Chip
                  icon={
                    <LocalFireDepartmentIcon
                      sx={{fontSize: 16, color: '#FF6B35 !important'}}
                    />
                  }
                  label={`${progress.streak} Streak`}
                  size="small"
                  sx={{
                    bgcolor: 'rgba(255, 107, 53, 0.15)',
                    color: '#FF8A5C',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    height: 28,
                    border: '1px solid rgba(255, 107, 53, 0.25)',
                  }}
                />
              )}

              {/* Strongest category */}
              {strongestCategory && (
                <Chip
                  icon={
                    <EmojiEventsIcon
                      sx={{
                        fontSize: 16,
                        color: `${CATEGORY_MAP[strongestCategory]?.color || kidsColors.star} !important`,
                      }}
                    />
                  }
                  label={`Best: ${CATEGORY_MAP[strongestCategory]?.label || strongestCategory}`}
                  size="small"
                  sx={{
                    bgcolor: `${CATEGORY_MAP[strongestCategory]?.color || kidsColors.star}18`,
                    color:
                      CATEGORY_MAP[strongestCategory]?.color || kidsColors.star,
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    height: 28,
                    border: `1px solid ${CATEGORY_MAP[strongestCategory]?.color || kidsColors.star}30`,
                  }}
                />
              )}

              {/* Accuracy */}
              <Chip
                icon={
                  <TrendingUpIcon
                    sx={{
                      fontSize: 16,
                      color: `${accuracy >= 70 ? kidsColors.correct : kidsColors.accent} !important`,
                    }}
                  />
                }
                label={`${accuracy}% Accuracy`}
                size="small"
                sx={{
                  bgcolor:
                    accuracy >= 70
                      ? 'rgba(46, 204, 113, 0.15)'
                      : 'rgba(255, 107, 53, 0.15)',
                  color:
                    accuracy >= 70 ? kidsColors.correct : kidsColors.accent,
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  height: 28,
                  border: `1px solid ${accuracy >= 70 ? 'rgba(46, 204, 113, 0.25)' : 'rgba(255, 107, 53, 0.25)'}`,
                }}
              />
            </Box>

            {/* Weak concepts (if any) */}
            {weakConcepts.length > 0 && (
              <Box sx={{mb: 2}}>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontSize: '0.68rem',
                    mb: 0.75,
                    display: 'block',
                  }}
                >
                  Needs Practice
                </Typography>
                <Box sx={{display: 'flex', gap: 0.75, flexWrap: 'wrap'}}>
                  {weakConcepts.map(({concept, accuracy: acc}) => (
                    <Chip
                      key={concept}
                      label={`${formatConcept(concept)} (${acc}%)`}
                      size="small"
                      sx={{
                        height: 24,
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        bgcolor: 'rgba(231, 76, 60, 0.12)',
                        color: '#FAB1A0',
                        border: '1px solid rgba(231, 76, 60, 0.2)',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}

            {/* 3R Progress Bars */}
            <Box sx={{mb: 0.5}}>
              <Typography
                variant="caption"
                sx={{
                  color: 'rgba(255, 255, 255, 0.5)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontSize: '0.68rem',
                  mb: 1,
                  display: 'block',
                }}
              >
                3R Intelligence
              </Typography>
              <ThreeRProgressBar
                label="Recall"
                value={progress.threeR?.recall || 0}
                color="#74B9FF"
                icon={<PsychologyIcon sx={{fontSize: 17, color: '#74B9FF'}} />}
                delay={0.2}
              />
              <ThreeRProgressBar
                label="Retention"
                value={progress.threeR?.retention || 0}
                color="#55EFC4"
                icon={<HistoryIcon sx={{fontSize: 17, color: '#55EFC4'}} />}
                delay={0.35}
              />
              <ThreeRProgressBar
                label="Recognition"
                value={progress.threeR?.recognition || 0}
                color="#A29BFE"
                icon={<VisibilityIcon sx={{fontSize: 17, color: '#A29BFE'}} />}
                delay={0.5}
              />
            </Box>
          </Box>
        )}

        {/* ─── Personalized Recommendations ─── */}
        {recommendations.length > 0 && (
          <Box sx={{mb: 2.5}}>
            <Box
              sx={{display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.25}}
            >
              <AutoAwesomeIcon sx={{fontSize: 16, color: kidsColors.star}} />
              <Typography
                variant="caption"
                sx={{
                  color: 'rgba(255, 255, 255, 0.5)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontSize: '0.68rem',
                }}
              >
                Try These Next
              </Typography>
            </Box>
            <Box sx={{display: 'flex', flexDirection: 'column', gap: 1}}>
              {recommendations.map((game, idx) => (
                <RecommendedGameCard
                  key={game.id}
                  game={game}
                  index={idx}
                  onPlay={onPlayGame}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* ─── Quick Actions ─── */}
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          {/* Practice Weak Spots */}
          <Tooltip
            title={
              weakConcepts.length > 0
                ? 'Practice areas that need work'
                : 'Play a recommended game'
            }
            arrow
          >
            <Button
              variant="contained"
              startIcon={<PsychologyIcon sx={{fontSize: 18}} />}
              onClick={handlePracticeWeakSpots}
              disabled={!practiceGame}
              sx={{
                flex: '1 1 auto',
                minWidth: 130,
                background: 'linear-gradient(135deg, #6C5CE7, #A29BFE)',
                borderRadius: `${kidsRadius.md}`,
                fontWeight: 700,
                fontSize: '0.78rem',
                textTransform: 'none',
                py: 1,
                px: 2,
                color: '#fff',
                boxShadow: '0 4px 16px rgba(108, 92, 231, 0.35)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #7C6DF7, #B2ABFE)',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 6px 24px rgba(108, 92, 231, 0.45)',
                },
                '&:active': {
                  transform: 'translateY(0)',
                },
                '&.Mui-disabled': {
                  background: 'rgba(108, 92, 231, 0.3)',
                  color: 'rgba(255, 255, 255, 0.4)',
                },
              }}
            >
              Practice Weak Spots
            </Button>
          </Tooltip>

          {/* Daily Challenge */}
          <Tooltip title="Try a fun surprise game!" arrow>
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon sx={{fontSize: 18}} />}
              onClick={handleDailyChallenge}
              disabled={!dailyChallengeGame}
              sx={{
                flex: '1 1 auto',
                minWidth: 130,
                background: 'linear-gradient(135deg, #FF6B35, #FF8A5C)',
                borderRadius: `${kidsRadius.md}`,
                fontWeight: 700,
                fontSize: '0.78rem',
                textTransform: 'none',
                py: 1,
                px: 2,
                color: '#fff',
                boxShadow: '0 4px 16px rgba(255, 107, 53, 0.35)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #FF7B45, #FF9A6C)',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 6px 24px rgba(255, 107, 53, 0.45)',
                },
                '&:active': {
                  transform: 'translateY(0)',
                },
                '&.Mui-disabled': {
                  background: 'rgba(255, 107, 53, 0.3)',
                  color: 'rgba(255, 255, 255, 0.4)',
                },
              }}
            >
              Daily Challenge
            </Button>
          </Tooltip>

          {/* Create My Game */}
          <Tooltip title="Build your own learning game!" arrow>
            <Button
              variant="outlined"
              startIcon={<AddIcon sx={{fontSize: 18}} />}
              onClick={handleCreateGame}
              sx={{
                flex: '1 1 auto',
                minWidth: 130,
                borderColor: 'rgba(255, 255, 255, 0.2)',
                borderRadius: `${kidsRadius.md}`,
                fontWeight: 700,
                fontSize: '0.78rem',
                textTransform: 'none',
                py: 1,
                px: 2,
                color: 'rgba(255, 255, 255, 0.8)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  borderColor: 'rgba(162, 155, 254, 0.5)',
                  bgcolor: 'rgba(108, 92, 231, 0.1)',
                  color: '#fff',
                  transform: 'translateY(-2px)',
                },
                '&:active': {
                  transform: 'translateY(0)',
                },
              }}
            >
              Create My Game
            </Button>
          </Tooltip>
        </Box>

        {/* ─── Empty state for brand-new learners ─── */}
        {!hasProgress && (
          <Box sx={{textAlign: 'center', mt: 1}}>
            <Typography
              variant="caption"
              sx={{color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.75rem'}}
            >
              Play a few games and I'll learn what you like and what to
              practice!
            </Typography>
          </Box>
        )}
      </Box>
    </Card>
  );
}
