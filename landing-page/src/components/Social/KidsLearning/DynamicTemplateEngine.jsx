/**
 * DynamicTemplateEngine - Unified rendering engine for all game modes (Web version).
 *
 * Determines the best rendering strategy for any game config:
 *
 * Mode 1 - LOCAL TEMPLATE (offline, fastest):
 *   Config has `template` matching one of 15 built-in template names.
 *   Renders the local React web component from gameRegistry.
 *
 * Mode 2 - SERVER-DRIVEN NATIVE (hybrid, native feel):
 *   Config has `serverLayout` -- a JSON UI descriptor.
 *   Rendered by ServerDrivenUI using MUI components.
 *   Server defines layout + data schema, client handles rendering.
 *
 * Mode 3 - HTML5 IFRAME (fully dynamic, any UI):
 *   Config has `serverHtml` or `serverUrl`.
 *   Rendered by DynamicGameRenderer in a sandboxed iframe.
 *   Server sends complete HTML5 game.
 *
 * Mode 4 - DYNAMIC TEMPLATE (server-defined template, cached):
 *   Config has `dynamicTemplate` ID referencing a cached server template.
 *   Template definition fetched once and cached in localStorage.
 *   Rendered via ServerDrivenUI with the cached layout.
 *
 * The engine also handles:
 * - Template caching and versioning in localStorage
 * - State management for server-driven games (questions, score, etc.)
 * - Bridging onAnswer/onComplete callbacks across all modes
 *
 * Ported from React Native DynamicTemplateEngine.js.
 */

import DynamicGameRenderer from './DynamicGameRenderer';
import {getTemplateComponent} from './gameRegistry';
import {
  kidsColors,
  kidsSpacing,
  kidsFontSizes,
  kidsFontWeights,
} from './kidsTheme';
import ServerDrivenUI from './ServerDrivenUI';
import FeedbackOverlay from './shared/FeedbackOverlay';

import {Box, Typography, CircularProgress, LinearProgress} from '@mui/material';
import React, {useState, useCallback, useRef, useEffect, Suspense} from 'react';

// ── Constants ───────────────────────────────────────────────────────────────

const CACHE_KEY = 'hevolve_kids_dynamicTemplates';

// ── Render Mode Detection ───────────────────────────────────────────────────

/**
 * Determine rendering mode from game config.
 * @param {Object} config - game configuration
 * @returns {'local'|'server-driven'|'dynamic-template'|'html5'|'error'}
 */
export const getRenderMode = (config) => {
  if (!config) return 'error';
  if (config.serverHtml || config.serverUrl) return 'html5';
  if (config.serverLayout) return 'server-driven';
  if (config.dynamicTemplate) return 'dynamic-template';
  if (config.template && config.template !== 'dynamic') return 'local';
  return 'html5'; // fallback for unknown template types
};

/**
 * Auto-detect render mode from game config with additional heuristics.
 * @param {Object} config
 * @returns {string}
 */
export const detectRenderMode = (config) => {
  if (!config) return 'error';

  // Explicit mode override
  if (config.renderMode) return config.renderMode;

  // Detect from content
  if (config.serverHtml || config.serverUrl) return 'html5';
  if (
    config.serverLayout &&
    typeof config.serverLayout === 'object' &&
    config.serverLayout.type
  ) {
    return 'server-driven';
  }
  if (config.dynamicTemplate && typeof config.dynamicTemplate === 'string') {
    return 'dynamic-template';
  }
  if (config.template && config.template !== 'dynamic') return 'local';

  return 'html5';
};

// ── Dynamic Template Cache (localStorage) ───────────────────────────────────

const templateCache = new Map();

/**
 * Cache a dynamic template definition in memory and localStorage.
 * @param {string} templateId
 * @param {Object} templateDef - must contain { layout: Object, ... }
 */
export const cacheDynamicTemplate = (templateId, templateDef) => {
  if (!templateId || !templateDef || typeof templateDef !== 'object') return;

  templateCache.set(templateId, templateDef);

  try {
    const stored = localStorage.getItem(CACHE_KEY);
    const all = stored ? JSON.parse(stored) : {};
    if (typeof all !== 'object' || all === null || Array.isArray(all)) return;

    // Validate the template definition has required fields
    if (!templateDef.layout || typeof templateDef.layout !== 'object') {
      console.warn(
        '[DynamicTemplateEngine] Template missing layout:',
        templateId
      );
      return;
    }

    all[templateId] = {
      ...templateDef,
      cachedAt: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn(
      '[DynamicTemplateEngine] Template cache write failed:',
      e.message
    );
  }
};

/**
 * Retrieve a cached dynamic template by ID.
 * Checks memory cache first, then localStorage.
 * @param {string} templateId
 * @returns {Object|null}
 */
export const getCachedTemplate = (templateId) => {
  if (!templateId) return null;

  // Check memory cache first
  if (templateCache.has(templateId)) {
    return templateCache.get(templateId);
  }

  // Check localStorage
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const all = JSON.parse(stored);
      if (!all || typeof all !== 'object' || Array.isArray(all)) return null;

      const template = all[templateId];
      if (template && typeof template === 'object' && template.layout) {
        templateCache.set(templateId, template);
        return template;
      }
    }
  } catch (e) {
    console.warn(
      '[DynamicTemplateEngine] Template cache read failed:',
      e.message
    );
  }

  return null;
};

/**
 * Clear all cached dynamic templates.
 */
export const clearTemplateCache = () => {
  templateCache.clear();
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (e) {
    console.warn(
      '[DynamicTemplateEngine] Template cache clear failed:',
      e.message
    );
  }
};

/**
 * Get all cached template IDs.
 * @returns {string[]}
 */
export const getCachedTemplateIds = () => {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const all = JSON.parse(stored);
      if (all && typeof all === 'object' && !Array.isArray(all)) {
        return Object.keys(all);
      }
    }
  } catch {
    // silent
  }
  return [...templateCache.keys()];
};

// ── Server-Driven Game State Manager ────────────────────────────────────────

/**
 * Custom hook that manages game state for server-driven and dynamic-template modes.
 * Tracks questions, score, results, input, feedback, and streak.
 * Forwards onAnswer / onComplete callbacks.
 */
const useServerDrivenGameState = (config, onAnswer, onComplete) => {
  const content = config?.content || {};
  const questions =
    content.questions || content.items || content.words || content.pairs || [];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [feedbackCorrect, setFeedbackCorrect] = useState(false);
  const [streak, setStreak] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const startTimeRef = useRef(Date.now());
  const mountedRef = useRef(true);
  const completedRef = useRef(false);

  useEffect(() => {
    startTimeRef.current = Date.now();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const currentQuestion = questions[currentIndex] || null;
  const totalQuestions = config?.questionsPerSession || questions.length || 10;
  const progress = totalQuestions > 0 ? currentIndex / totalQuestions : 0;

  const handleAction = useCallback(
    (actionName, payload) => {
      if (!mountedRef.current) return;

      switch (actionName) {
        case 'selectOption':
        case 'submitAnswer': {
          const responseTime = Date.now() - startTimeRef.current;
          const answer = payload?.value || payload?.text || inputValue;
          const correct = currentQuestion
            ? answer === currentQuestion.answer ||
              answer === currentQuestion.correct ||
              payload?.isCorrect
            : false;

          setResults((prev) => [...prev, correct]);
          setFeedbackCorrect(correct);
          setFeedbackVisible(true);

          if (correct) {
            setScore((prev) => prev + (config?.rewards?.starsPerCorrect || 1));
            setStreak((prev) => prev + 1);
          } else {
            setStreak(0);
          }

          if (onAnswer) {
            const concept =
              currentQuestion?.concept ||
              currentQuestion?.word ||
              `q${currentIndex}`;
            onAnswer(correct, concept, responseTime);
          }

          // Advance after feedback delay
          setTimeout(() => {
            if (!mountedRef.current) return;
            setFeedbackVisible(false);
            setInputValue('');
            startTimeRef.current = Date.now();

            if (currentIndex + 1 >= totalQuestions && !completedRef.current) {
              completedRef.current = true;
              if (mountedRef.current && onComplete) onComplete();
            } else {
              setCurrentIndex((prev) => prev + 1);
            }
          }, 800);
          break;
        }

        case 'inputChange':
          if (payload?.text !== undefined) setInputValue(payload.text);
          break;

        case 'numberPress':
          setInputValue((prev) => prev + String(payload?.number || ''));
          break;

        case 'numberDelete':
          setInputValue((prev) => prev.slice(0, -1));
          break;

        case 'numberSubmit':
          handleAction('submitAnswer', {value: inputValue});
          break;

        case 'feedbackDismiss':
          setFeedbackVisible(false);
          break;

        case 'timeUp':
          if (!completedRef.current) {
            completedRef.current = true;
            if (mountedRef.current && onComplete) onComplete();
          }
          break;

        case 'skip':
          setResults((prev) => [...prev, false]);
          setCurrentIndex((prev) => prev + 1);
          startTimeRef.current = Date.now();
          if (currentIndex + 1 >= totalQuestions && !completedRef.current) {
            completedRef.current = true;
            if (mountedRef.current && onComplete) onComplete();
          }
          break;

        case 'hint':
          // Hint handling - can be extended
          break;

        case 'navigate':
          // Navigation - handled by parent if needed
          break;

        case 'setState':
          // State updates - can be extended for dynamic forms
          break;

        default:
          // Custom action - pass through to parent if provided
          break;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [
      currentIndex,
      currentQuestion,
      totalQuestions,
      inputValue,
      onAnswer,
      onComplete,
      config,
    ]
  );

  return {
    state: {
      currentIndex,
      currentQuestion,
      totalQuestions,
      score,
      results,
      streak,
      progress,
      inputValue,
      feedbackVisible,
      feedbackCorrect,
      questions,
    },
    handleAction,
  };
};

// ── Progress Dots (inline, lightweight) ─────────────────────────────────────

const ProgressDots = ({total, current, results}) => {
  const dotCount = Math.min(total, 20); // cap visual dots
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '4px',
        py: `${kidsSpacing.sm}px`,
        px: `${kidsSpacing.md}px`,
      }}
    >
      {Array.from({length: dotCount}, (_, i) => {
        let bg = kidsColors.border;
        if (i < (results?.length || 0)) {
          bg = results[i] ? kidsColors.correct : kidsColors.incorrect;
        } else if (i === current) {
          bg = kidsColors.accent;
        }
        return (
          <Box
            key={i}
            sx={{
              width: i === current ? 12 : 8,
              height: i === current ? 12 : 8,
              borderRadius: '50%',
              backgroundColor: bg,
              transition: 'all 0.3s ease',
              boxShadow:
                i === current ? `0 0 6px ${kidsColors.accent}` : 'none',
            }}
          />
        );
      })}
    </Box>
  );
};

// ── Main Component ──────────────────────────────────────────────────────────

const DynamicTemplateEngine = ({
  config,
  onAnswer,
  onComplete,
  onReady,
  onError,
}) => {
  const [dynamicLayout, setDynamicLayout] = useState(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const renderMode = getRenderMode(config);

  // For server-driven and dynamic-template modes
  const {state, handleAction} = useServerDrivenGameState(
    config,
    onAnswer,
    onComplete
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load dynamic template from cache if needed
  useEffect(() => {
    if (renderMode === 'dynamic-template' && config.dynamicTemplate) {
      setLoading(true);

      // getCachedTemplate is synchronous in web (localStorage)
      const template = getCachedTemplate(config.dynamicTemplate);
      if (mountedRef.current) {
        if (template && template.layout) {
          setDynamicLayout(template.layout);
        }
        setLoading(false);
        if (onReady) onReady();
      }
    } else if (renderMode === 'server-driven') {
      // Validate layout structure
      const layout = config.serverLayout;
      if (
        layout &&
        typeof layout === 'object' &&
        typeof layout.type === 'string'
      ) {
        setDynamicLayout(layout);
      } else {
        console.warn('[DynamicTemplateEngine] Invalid serverLayout structure');
      }
      if (onReady) onReady();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Build data context for ServerDrivenUI bindings
  const dataContext = {
    state,
    config,
    content: config?.content || {},
    question: state.currentQuestion,
    item: state.currentQuestion,
    index: state.currentIndex,
  };

  // ── Mode 1: Local Template ────────────────────────────────────────────────

  if (renderMode === 'local') {
    const TemplateComponent = getTemplateComponent(config.template);
    if (!TemplateComponent) {
      return (
        <Box
          sx={{
            display: 'flex',
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            p: `${kidsSpacing.lg}px`,
          }}
        >
          <Typography
            sx={{
              fontSize: kidsFontSizes.md,
              color: kidsColors.textSecondary,
              textAlign: 'center',
            }}
          >
            Template "{config.template}" not found
          </Typography>
        </Box>
      );
    }

    return (
      <Suspense
        fallback={
          <Box
            sx={{
              display: 'flex',
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <CircularProgress sx={{color: kidsColors.accent}} />
          </Box>
        }
      >
        <TemplateComponent
          config={config}
          onAnswer={onAnswer}
          onComplete={onComplete}
        />
      </Suspense>
    );
  }

  // ── Mode 3: HTML5 Iframe ──────────────────────────────────────────────────

  if (renderMode === 'html5') {
    return (
      <DynamicGameRenderer
        htmlContent={config.serverHtml}
        gameUrl={config.serverUrl}
        gameConfig={config}
        gameBasePath="/social/kids/game"
        onAnswer={(data) =>
          onAnswer && onAnswer(data.correct, data.concept, data.responseTimeMs)
        }
        onComplete={onComplete}
        onReady={onReady}
        onError={onError}
      />
    );
  }

  // ── Mode 2 & 4: Server-Driven UI ─────────────────────────────────────────

  if (renderMode === 'server-driven' || renderMode === 'dynamic-template') {
    if (loading) {
      return (
        <Box
          sx={{
            display: 'flex',
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: kidsColors.background,
            minHeight: 200,
          }}
        >
          <Box sx={{textAlign: 'center'}}>
            <CircularProgress
              size={36}
              sx={{color: kidsColors.accent, mb: 1}}
            />
            <Typography
              sx={{
                fontSize: kidsFontSizes.md,
                color: kidsColors.textSecondary,
              }}
            >
              Loading template...
            </Typography>
          </Box>
        </Box>
      );
    }

    if (!dynamicLayout) {
      return (
        <Box
          sx={{
            display: 'flex',
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            p: `${kidsSpacing.lg}px`,
          }}
        >
          <Typography
            sx={{
              fontSize: kidsFontSizes.md,
              color: kidsColors.textSecondary,
              textAlign: 'center',
            }}
          >
            {renderMode === 'dynamic-template'
              ? `Template "${config.dynamicTemplate}" not cached. Connect to internet to download.`
              : 'No layout provided by server.'}
          </Typography>
        </Box>
      );
    }

    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          backgroundColor: kidsColors.background,
          minHeight: 200,
          position: 'relative',
        }}
      >
        {/* Progress indicator */}
        <ProgressDots
          total={state.totalQuestions}
          current={state.currentIndex}
          results={state.results}
        />

        {/* Score display */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            px: `${kidsSpacing.md}px`,
            pb: `${kidsSpacing.xs}px`,
          }}
        >
          <Typography
            sx={{
              fontSize: kidsFontSizes.sm,
              fontWeight: kidsFontWeights.bold,
              color: kidsColors.accent,
            }}
          >
            Score: {state.score}
          </Typography>
          {state.streak > 1 && (
            <Typography
              sx={{
                fontSize: kidsFontSizes.sm,
                fontWeight: kidsFontWeights.bold,
                color: kidsColors.streak,
                ml: `${kidsSpacing.md}px`,
              }}
            >
              Streak: {state.streak}
            </Typography>
          )}
        </Box>

        {/* Server-defined UI */}
        <Box sx={{flex: 1}}>
          <ServerDrivenUI
            layout={dynamicLayout}
            data={dataContext}
            onAction={handleAction}
          />
        </Box>

        {/* Feedback overlay */}
        <FeedbackOverlay
          visible={state.feedbackVisible}
          isCorrect={state.feedbackCorrect}
          onDismiss={() => handleAction('feedbackDismiss')}
        />
      </Box>
    );
  }

  // ── Fallback ──────────────────────────────────────────────────────────────

  return (
    <Box
      sx={{
        display: 'flex',
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        p: `${kidsSpacing.lg}px`,
      }}
    >
      <Typography
        sx={{
          fontSize: kidsFontSizes.md,
          color: kidsColors.textSecondary,
          textAlign: 'center',
        }}
      >
        Unknown game rendering mode
      </Typography>
    </Box>
  );
};

export default DynamicTemplateEngine;
