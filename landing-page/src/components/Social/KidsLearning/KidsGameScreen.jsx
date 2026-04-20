
import {getGameById} from './data/gameConfigs';
import kidsLearningStore from './data/kidsLearningStore';
import {kidsColors} from './data/kidsTheme';
import DynamicTemplateEngine, {getRenderMode} from './DynamicTemplateEngine';
import ContentGenStatus from './shared/ContentGenStatus';
import FeedbackOverlay from './shared/FeedbackOverlay';
import GameShell from './shared/GameShell';
import MultiplayerLobby from './shared/MultiplayerLobby';
import {LiveScoreBar, MultiplayerResults} from './shared/MultiplayerScoreboard';
import useMultiplayerSync from './shared/useMultiplayerSync';

import {Box, Typography, CircularProgress, LinearProgress} from '@mui/material';
import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  Suspense,
} from 'react';
import {useParams, useNavigate, useLocation} from 'react-router-dom';

/* ---------------------------------------------------------------
   Lazy-load game templates.
   Each template receives standard props:
     { config, onAnswer, onComplete, questionIndex }
   If the template file does not exist yet the ErrorBoundary
   catches and shows a placeholder.
   --------------------------------------------------------------- */
const templateMap = {
  // Core quiz templates
  quiz: React.lazy(() =>
    import('./templates/MultipleChoiceTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'multiple-choice': React.lazy(() =>
    import('./templates/MultipleChoiceTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'true-false': React.lazy(() =>
    import('./templates/TrueFalseTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'fill-blank': React.lazy(() =>
    import('./templates/FillBlankTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  fillBlank: React.lazy(() =>
    import('./templates/FillBlankTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),

  // Interactive templates
  matching: React.lazy(() =>
    import('./templates/MatchPairsTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'match-pairs': React.lazy(() =>
    import('./templates/MatchPairsTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'memory-flip': React.lazy(() =>
    import('./templates/MemoryFlipTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  counting: React.lazy(() =>
    import('./templates/CountingTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),

  // Advanced templates (lazy-loaded, fallback to placeholder if not yet created)
  'drag-to-zone': React.lazy(() =>
    import('./templates/DragToZoneTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  sorting: React.lazy(() =>
    import('./templates/DragToZoneTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'word-build': React.lazy(() =>
    import('./templates/WordBuildTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'sequence-order': React.lazy(() =>
    import('./templates/SequenceOrderTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'spot-difference': React.lazy(() =>
    import('./templates/SpotDifferenceTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'timed-rush': React.lazy(() =>
    import('./templates/TimedRushTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'story-builder': React.lazy(() =>
    import('./templates/StoryBuilderTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  tracing: React.lazy(() =>
    import('./templates/TracingTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'puzzle-assemble': React.lazy(() =>
    import('./templates/PuzzleAssembleTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  simulation: React.lazy(() =>
    import('./templates/SimulationTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),

  // Canvas game templates
  'balloon-pop': React.lazy(() =>
    import('./templates/BalloonPopTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'whack-a-mole': React.lazy(() =>
    import('./templates/WhackAMoleTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  catcher: React.lazy(() =>
    import('./templates/CatcherTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'flappy-learner': React.lazy(() =>
    import('./templates/FlappyLearnerTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'runner-dodge': React.lazy(() =>
    import('./templates/RunnerDodgeTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'math-castle': React.lazy(() =>
    import('./templates/MathCastleTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'letter-trace-canvas': React.lazy(() =>
    import('./templates/LetterTraceCanvasTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'paint-by-concept': React.lazy(() =>
    import('./templates/PaintByConceptTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  builder: React.lazy(() =>
    import('./templates/BuilderTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
  'word-maze': React.lazy(() =>
    import('./templates/WordMazeTemplate').catch(() => ({
      default: PlaceholderTemplate,
    }))
  ),
};

/* Fallback when template is not yet implemented */
function PlaceholderTemplate({config, onComplete}) {
  return (
    <Box sx={{textAlign: 'center', py: 8}}>
      <Typography sx={{fontSize: 64, mb: 2}}>
        {config?.emoji || '🎮'}
      </Typography>
      <Typography
        variant="h6"
        sx={{fontWeight: 700, color: kidsColors.textPrimary, mb: 1}}
      >
        {config?.title || 'Game'}
      </Typography>
      <Typography variant="body2" sx={{color: kidsColors.textSecondary, mb: 3}}>
        This game template is coming soon!
      </Typography>
      <Typography
        variant="body2"
        onClick={() => onComplete && onComplete({correct: 0, total: 0})}
        sx={{
          color: kidsColors.primary,
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        Go back to hub
      </Typography>
    </Box>
  );
}

/* Simple error boundary for lazy templates */
class TemplateBoundary extends React.Component {
  state = {hasError: false};
  static getDerivedStateFromError() {
    return {hasError: true};
  }
  render() {
    if (this.state.hasError) {
      return (
        <PlaceholderTemplate
          config={this.props.config}
          onComplete={this.props.onComplete}
        />
      );
    }
    return this.props.children;
  }
}

/* ---------------------------------------------------------------
   Timer bar (countdown, optional)
   --------------------------------------------------------------- */
function TimerBar({durationSec = 60, running = true, onExpire}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 0.25;
        if (next >= durationSec) {
          clearInterval(id);
          if (onExpire) onExpire();
        }
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [running, durationSec, onExpire]);

  const pct = Math.min((elapsed / durationSec) * 100, 100);
  const color =
    pct < 50
      ? kidsColors.success
      : pct < 80
        ? kidsColors.warning
        : kidsColors.error;

  return (
    <LinearProgress
      variant="determinate"
      value={pct}
      sx={{
        height: 5,
        borderRadius: '3px',
        bgcolor: 'rgba(0,0,0,0.06)',
        '& .MuiLinearProgress-bar': {bgcolor: color, borderRadius: '3px'},
        mb: 1,
      }}
    />
  );
}

/* =================================================================
   KidsGameScreen — wraps a game template with shell + scoring
   ================================================================= */
export default function KidsGameScreen() {
  const {gameId} = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Support custom configs passed via route state (from AI game creator)
  const config = useMemo(() => {
    if (location.state?.customConfig) return location.state.customConfig;
    return getGameById(gameId);
  }, [gameId, location.state]);
  const totalSteps = config?.questionsPerSession || 10;

  const [phase, setPhase] = useState('lobby'); // lobby | intro | playing | complete | mp-results
  const [questionIdx, setQuestionIdx] = useState(0);
  const [score, setScore] = useState({correct: 0, total: 0});
  const [feedback, setFeedback] = useState({visible: false, isCorrect: false});
  const [streak, setStreak] = useState(
    () => kidsLearningStore.getProgress().streak
  );

  // ── Multiplayer ──
  const multiplayer = useMultiplayerSync({
    gameConfigId: config?.id || gameId,
    gameTitle: config?.title || '',
    gameType: config?.template || 'quiz',
    enabled: true,
  });

  // Get current user ID for score display
  const currentUserId = useMemo(() => {
    try {
      const user = JSON.parse(localStorage.getItem('social_user') || '{}');
      return user.id || null;
    } catch {
      return null;
    }
  }, []);

  /* Start game (skip for lobby phase) */
  useEffect(() => {
    if (phase === 'intro') {
      const timer = setTimeout(() => setPhase('playing'), 2000);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  /* Handle answer from template */
  const handleAnswer = useCallback((isCorrect) => {
    setFeedback({visible: true, isCorrect});
    setScore((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));
  }, []);

  /* Submit move to multiplayer session on each answer */
  const handleAnswerWithMP = useCallback(
    (isCorrect) => {
      handleAnswer(isCorrect);
      if (multiplayer.isMultiplayer) {
        multiplayer.submitMove({isCorrect, questionIdx});
      }
    },
    [handleAnswer, multiplayer, questionIdx]
  );

  /* After feedback dismissed, advance or complete */
  const handleFeedbackDismiss = useCallback(() => {
    setFeedback({visible: false, isCorrect: false});
    const nextIdx = questionIdx + 1;
    if (nextIdx >= totalSteps) {
      /* Record result and transition to complete */
      const finalScore = {
        correct: score.correct + (feedback.isCorrect ? 0 : 0), // already updated in handleAnswer
        total: score.total,
      };
      const updated = kidsLearningStore.recordGame({
        gameId: config?.id || gameId,
        title: config?.title || 'Unknown',
        category: config?.category || 'unknown',
        correct: score.correct,
        total: score.total,
      });
      setStreak(updated.streak);
      setPhase('complete');
    } else {
      setQuestionIdx(nextIdx);
    }
  }, [questionIdx, totalSteps, score, feedback.isCorrect, config, gameId]);

  /* Replay */
  const handleReplay = useCallback(() => {
    setScore({correct: 0, total: 0});
    setQuestionIdx(0);
    setPhase('intro');
  }, []);

  /* Back */
  const handleBack = useCallback(() => {
    navigate('/social/kids');
  }, [navigate]);

  /* Timer expire */
  const handleTimerExpire = useCallback(() => {
    const updated = kidsLearningStore.recordGame({
      gameId: config?.id || gameId,
      title: config?.title || 'Unknown',
      category: config?.category || 'unknown',
      correct: score.correct,
      total: score.total || totalSteps,
    });
    setStreak(updated.streak);
    setPhase('complete');
  }, [config, gameId, score, totalSteps]);

  /* 404 */
  if (!config) {
    return (
      <Box sx={{textAlign: 'center', py: 10}}>
        <Typography
          variant="h5"
          sx={{fontWeight: 700, color: kidsColors.textPrimary, mb: 1}}
        >
          Game not found
        </Typography>
        <Typography
          variant="body1"
          onClick={() => navigate('/social/kids')}
          sx={{
            color: kidsColors.primary,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Back to hub
        </Typography>
      </Box>
    );
  }

  const TemplateComponent = templateMap[config.template] || null;

  /* Determine whether to use DynamicTemplateEngine for server-driven configs */
  const renderMode = getRenderMode(config);
  const usesDynamic =
    !TemplateComponent &&
    renderMode !== 'error' &&
    (renderMode === 'server-driven' ||
      renderMode === 'html5' ||
      renderMode === 'dynamic-template');

  // ── Lobby phase: show multiplayer lobby ──
  if (phase === 'lobby') {
    return (
      <Box sx={{py: 4, px: 2}}>
        <MultiplayerLobby
          multiplayer={multiplayer}
          gameTitle={config?.title || 'Game'}
          onStartSolo={() => setPhase('intro')}
          onGameStart={() => setPhase('intro')}
        />
      </Box>
    );
  }

  // ── Multiplayer results phase ──
  if (phase === 'mp-results') {
    return (
      <Box sx={{py: 4, px: 2}}>
        <MultiplayerResults
          participants={multiplayer.participants}
          scores={multiplayer.scores}
          currentUserId={currentUserId}
          onRematch={() => {
            setScore({correct: 0, total: 0});
            setQuestionIdx(0);
            setPhase('lobby');
          }}
          onLeave={() => {
            multiplayer.leaveSession();
            navigate('/social/kids');
          }}
        />
      </Box>
    );
  }

  return (
    <>
      <GameShell
        config={config}
        currentStep={questionIdx}
        totalSteps={totalSteps}
        score={score}
        phase={phase}
        onBack={handleBack}
        onReplay={handleReplay}
        onStart={() => setPhase('playing')}
        streak={streak}
      >
        {/* Multiplayer Live Score Bar */}
        {multiplayer.isMultiplayer && phase === 'playing' && (
          <LiveScoreBar
            participants={multiplayer.participants}
            scores={multiplayer.scores}
            currentUserId={currentUserId}
          />
        )}

        {/* Content generation progress (visible when assets still being created) */}
        <ContentGenStatus gameId={config.id || gameId} showDevInfo />

        {/* Optional timer */}
        {config.hasTimer && phase === 'playing' && (
          <TimerBar
            durationSec={totalSteps * 8}
            running={phase === 'playing'}
            onExpire={handleTimerExpire}
          />
        )}

        {/* Template — local React component */}
        {phase === 'playing' && TemplateComponent && (
          <TemplateBoundary
            config={config}
            onComplete={() => setPhase('complete')}
          >
            <Suspense
              fallback={
                <Box sx={{textAlign: 'center', py: 8}}>
                  <CircularProgress sx={{color: kidsColors.primary}} />
                </Box>
              }
            >
              <TemplateComponent
                config={config}
                questionIndex={questionIdx}
                onAnswer={handleAnswerWithMP}
                onComplete={(finalScore) => {
                  if (finalScore) {
                    setScore(finalScore);
                    kidsLearningStore.recordGame({
                      gameId: config.id,
                      title: config.title,
                      category: config.category,
                      correct: finalScore.correct,
                      total: finalScore.total,
                    });
                    // Broadcast final score to multiplayer
                    if (multiplayer.isMultiplayer) {
                      multiplayer.submitFinalScore(finalScore);
                    }
                  }
                  setPhase(
                    multiplayer.isMultiplayer ? 'mp-results' : 'complete'
                  );
                }}
              />
            </Suspense>
          </TemplateBoundary>
        )}

        {/* Dynamic rendering for server-driven / HTML5 / dynamic-template configs */}
        {phase === 'playing' && usesDynamic && (
          <DynamicTemplateEngine
            config={config}
            onAnswer={handleAnswerWithMP}
            onComplete={(finalScore) => {
              if (finalScore) {
                setScore(finalScore);
                kidsLearningStore.recordGame({
                  gameId: config.id,
                  title: config.title,
                  category: config.category,
                  correct: finalScore.correct ?? 0,
                  total: finalScore.total ?? totalSteps,
                });
              }
              setPhase('complete');
            }}
          />
        )}

        {/* Placeholder if no template mapped and not a dynamic config */}
        {phase === 'playing' && !TemplateComponent && !usesDynamic && (
          <PlaceholderTemplate
            config={config}
            onComplete={() => navigate('/social/kids')}
          />
        )}
      </GameShell>

      {/* Feedback overlay */}
      <FeedbackOverlay
        visible={feedback.visible}
        isCorrect={feedback.isCorrect}
        onDismiss={handleFeedbackDismiss}
        enableSound
      />
    </>
  );
}
