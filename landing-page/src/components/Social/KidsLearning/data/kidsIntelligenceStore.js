/**
 * Kids Intelligence Store - React Context Store
 *
 * Ported from React Native Zustand store to React Context + useReducer.
 * Follows the same pattern as kidsLearningStore.js.
 *
 * Tracks per-concept intelligence data using the 3R model:
 *   - Registration: first-exposure mastery tracking
 *   - Retention: spaced-repetition scheduling (SM-2 inspired)
 *   - Recall: timed accuracy and response-time tracking
 *
 * State shape:
 *   conceptMap: { "category:concept": ConceptData }
 *   initialized: boolean
 *
 * Persists to localStorage under key 'hevolve_kids_intelligence'.
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useMemo,
} from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'hevolve_kids_intelligence';

// Spaced repetition intervals (in days)
const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

// ─── Pure Utility Functions ───────────────────────────────────────────────────

function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

function calculateNextReview(fromDate, level, wasCorrect) {
  const days = wasCorrect
    ? REVIEW_INTERVALS[Math.min(level, REVIEW_INTERVALS.length - 1)]
    : 1; // If wrong, review tomorrow
  const date = new Date(fromDate);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

// ─── Initial State ────────────────────────────────────────────────────────────

const initialState = {
  conceptMap: {},
  initialized: false,
};

// ─── Action Types ─────────────────────────────────────────────────────────────

const ActionTypes = {
  HYDRATE: 'HYDRATE',
  INITIALIZE: 'INITIALIZE',
  RECORD_CONCEPT_ANSWER: 'RECORD_CONCEPT_ANSWER',
  RESET_ALL: 'RESET_ALL',
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

function kidsIntelligenceReducer(state, action) {
  switch (action.type) {
    case ActionTypes.HYDRATE: {
      return {
        ...state,
        ...action.payload,
        initialized: true,
      };
    }

    case ActionTypes.INITIALIZE: {
      return {...state, initialized: true};
    }

    case ActionTypes.RECORD_CONCEPT_ANSWER: {
      const {conceptKey, isCorrect, responseTimeMs} = action.payload;
      const now = new Date().toISOString();
      const existing = state.conceptMap[conceptKey];

      if (!existing) {
        // First time seeing this concept - Registration tracking
        const newConcept = {
          firstSeen: now,
          timesPresented: 1,
          timesCorrect: isCorrect ? 1 : 0,
          registration: {
            firstAttemptCorrect: isCorrect,
            attemptsToMaster: isCorrect ? 1 : null, // null = not yet mastered
            mastered: isCorrect,
          },
          retention: {
            lastTested: now,
            score: isCorrect ? 1.0 : 0.0,
            nextReview: calculateNextReview(now, 0, isCorrect),
            reviewLevel: 0,
          },
          recall: {
            responseTimes: [responseTimeMs],
            avgResponseTimeMs: responseTimeMs,
            timedAccuracy: isCorrect ? 1.0 : 0.0,
            totalTimed: 1,
            correctTimed: isCorrect ? 1 : 0,
          },
        };

        return {
          ...state,
          conceptMap: {...state.conceptMap, [conceptKey]: newConcept},
        };
      }

      // Updating existing concept
      const timesPresented = existing.timesPresented + 1;
      const timesCorrect = existing.timesCorrect + (isCorrect ? 1 : 0);

      // Registration update
      const registration = {...existing.registration};
      if (!registration.mastered && isCorrect) {
        registration.attemptsToMaster = timesPresented;
        registration.mastered = true;
      }

      // Retention update (spaced repetition)
      const retention = {...existing.retention};
      retention.lastTested = now;
      const daysSinceLast = daysBetween(existing.retention.lastTested, now);
      if (daysSinceLast >= 1) {
        // This is a retention test (enough time has passed)
        const newLevel = isCorrect
          ? Math.min(retention.reviewLevel + 1, REVIEW_INTERVALS.length - 1)
          : Math.max(retention.reviewLevel - 1, 0);
        retention.reviewLevel = newLevel;
        retention.score = timesCorrect / timesPresented;
        retention.nextReview = calculateNextReview(now, newLevel, isCorrect);
      }

      // Recall update
      const responseTimes = [
        ...existing.recall.responseTimes,
        responseTimeMs,
      ].slice(-20);
      const avgResponseTimeMs =
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const correctTimed = existing.recall.correctTimed + (isCorrect ? 1 : 0);
      const totalTimed = existing.recall.totalTimed + 1;

      const updated = {
        ...existing,
        timesPresented,
        timesCorrect,
        registration,
        retention,
        recall: {
          responseTimes,
          avgResponseTimeMs,
          timedAccuracy: correctTimed / totalTimed,
          totalTimed,
          correctTimed,
        },
      };

      return {
        ...state,
        conceptMap: {...state.conceptMap, [conceptKey]: updated},
      };
    }

    case ActionTypes.RESET_ALL: {
      return {...initialState, initialized: true};
    }

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const KidsIntelligenceContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function KidsIntelligenceProvider({children}) {
  const [state, dispatch] = useReducer(kidsIntelligenceReducer, initialState);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        dispatch({type: ActionTypes.HYDRATE, payload: parsed});
      } else {
        dispatch({type: ActionTypes.INITIALIZE});
      }
    } catch (err) {
      console.warn('[KidsIntelligenceStore] Failed to hydrate:', err);
      dispatch({type: ActionTypes.INITIALIZE});
    }
  }, []);

  // Persist to localStorage on state changes (debounced)
  useEffect(() => {
    if (!state.initialized) return;

    const timeout = setTimeout(() => {
      try {
        const toPersist = {...state};
        delete toPersist.initialized;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
      } catch (err) {
        console.warn('[KidsIntelligenceStore] Failed to persist:', err);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [state]);

  // ── Actions ──

  const recordConceptAnswer = useCallback(
    (conceptKey, isCorrect, responseTimeMs = 0) => {
      dispatch({
        type: ActionTypes.RECORD_CONCEPT_ANSWER,
        payload: {conceptKey, isCorrect, responseTimeMs},
      });
    },
    []
  );

  const resetAll = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* silent */
    }
    dispatch({type: ActionTypes.RESET_ALL});
  }, []);

  const persist = useCallback(() => {
    try {
      const toPersist = {...state};
      delete toPersist.initialized;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
    } catch (err) {
      console.warn('[KidsIntelligenceStore] Manual persist failed:', err);
    }
  }, [state]);

  // ── Derived / Computed ──

  const getConceptScore = useCallback(
    (conceptKey) => {
      const data = state.conceptMap[conceptKey];
      if (!data) return {correct: 0, total: 0, lastSeen: null, accuracy: 0};
      return {
        correct: data.timesCorrect,
        total: data.timesPresented,
        lastSeen: data.retention.lastTested,
        accuracy:
          data.timesPresented > 0
            ? Math.round((data.timesCorrect / data.timesPresented) * 100)
            : 0,
      };
    },
    [state.conceptMap]
  );

  const getConceptsDueForReview = useCallback(
    (category) => {
      const now = new Date().toISOString();
      return Object.entries(state.conceptMap)
        .filter(([key, data]) => {
          if (category && !key.startsWith(category + ':')) return false;
          return data.retention.nextReview <= now;
        })
        .map(([key, data]) => ({key, ...data}))
        .sort((a, b) =>
          a.retention.nextReview.localeCompare(b.retention.nextReview)
        );
    },
    [state.conceptMap]
  );

  const getWeakConcepts = useCallback(
    (category, limit = 10) => {
      return Object.entries(state.conceptMap)
        .filter(([key]) => !category || key.startsWith(category + ':'))
        .map(([key, data]) => ({
          key,
          weakness: 1 - data.recall.timedAccuracy + (1 - data.retention.score),
          ...data,
        }))
        .sort((a, b) => b.weakness - a.weakness)
        .slice(0, limit);
    },
    [state.conceptMap]
  );

  const getThreeRSummary = useCallback(
    (category) => {
      const concepts = Object.entries(state.conceptMap).filter(
        ([key]) => !category || key.startsWith(category + ':')
      );

      if (concepts.length === 0) {
        return {registration: 0, retention: 0, recall: 0, totalConcepts: 0};
      }

      let regTotal = 0;
      let retTotal = 0;
      let recTotal = 0;

      concepts.forEach(([, data]) => {
        regTotal += data.registration.mastered ? 1 : 0;
        retTotal += data.retention.score;
        recTotal += data.recall.timedAccuracy;
      });

      const count = concepts.length;
      return {
        registration: Math.round((regTotal / count) * 100),
        retention: Math.round((retTotal / count) * 100),
        recall: Math.round((recTotal / count) * 100),
        totalConcepts: count,
      };
    },
    [state.conceptMap]
  );

  const getAdaptiveParams = useCallback(
    (category) => {
      const now = new Date().toISOString();

      // Inline due-for-review check (avoids stale closure issues)
      const dueForReview = Object.entries(state.conceptMap)
        .filter(([key, data]) => {
          if (category && !key.startsWith(category + ':')) return false;
          return data.retention.nextReview <= now;
        })
        .map(([key, data]) => ({key, ...data}))
        .sort((a, b) =>
          a.retention.nextReview.localeCompare(b.retention.nextReview)
        );

      if (dueForReview.length > 0) {
        // Prioritize retention review
        return {
          type: 'retention',
          concept: dueForReview[0].key,
          difficulty: Math.max(1, 3 - dueForReview[0].retention.reviewLevel),
        };
      }

      // Inline weak-concepts check
      const weakConcepts = Object.entries(state.conceptMap)
        .filter(([key]) => !category || key.startsWith(category + ':'))
        .map(([key, data]) => ({
          key,
          weakness: 1 - data.recall.timedAccuracy + (1 - data.retention.score),
          ...data,
        }))
        .sort((a, b) => b.weakness - a.weakness)
        .slice(0, 5);

      if (weakConcepts.length > 0 && weakConcepts[0].weakness > 0.5) {
        // Practice weak recall areas
        return {
          type: 'recall',
          concept: weakConcepts[0].key,
          difficulty: 2,
        };
      }

      // Introduce new concepts (registration)
      return {
        type: 'registration',
        concept: null,
        difficulty: 1,
      };
    },
    [state.conceptMap]
  );

  const getMasteryLevel = useCallback(
    (conceptKey) => {
      const data = state.conceptMap[conceptKey];
      if (!data) return {level: 'new', label: 'New', progress: 0};

      const accuracy =
        data.timesPresented > 0 ? data.timesCorrect / data.timesPresented : 0;
      const reviewLevel = data.retention.reviewLevel;
      const mastered = data.registration.mastered;

      // Level thresholds:
      //   new       -> never seen
      //   learning  -> seen but < 60% accuracy or not yet mastered
      //   familiar  -> mastered and >= 60% accuracy, reviewLevel < 2
      //   proficient-> mastered and >= 75% accuracy, reviewLevel >= 2
      //   expert    -> mastered and >= 90% accuracy, reviewLevel >= 4
      if (!mastered || accuracy < 0.6) {
        return {
          level: 'learning',
          label: 'Learning',
          progress: Math.round(accuracy * 100),
        };
      }
      if (accuracy >= 0.9 && reviewLevel >= 4) {
        return {level: 'expert', label: 'Expert', progress: 100};
      }
      if (accuracy >= 0.75 && reviewLevel >= 2) {
        return {
          level: 'proficient',
          label: 'Proficient',
          progress: Math.round(((accuracy - 0.75) / 0.15) * 25 + 75),
        };
      }
      return {
        level: 'familiar',
        label: 'Familiar',
        progress: Math.round(((accuracy - 0.6) / 0.15) * 25 + 50),
      };
    },
    [state.conceptMap]
  );

  const getLearningCurve = useCallback(
    (conceptKey) => {
      const data = state.conceptMap[conceptKey];
      if (!data) return [];

      // Build a curve from response times and accuracy over attempts
      const responseTimes = data.recall.responseTimes || [];
      const curve = [];
      const runningCorrect = 0;
      const total = data.timesPresented;
      const baseAccuracy = total > 0 ? data.timesCorrect / total : 0;

      for (let i = 0; i < responseTimes.length; i++) {
        // Approximate accuracy progression based on position
        const progressRatio = (i + 1) / responseTimes.length;
        const estimatedAccuracy = Math.min(
          1,
          baseAccuracy * progressRatio * 1.2
        );
        curve.push({
          attempt: i + 1,
          responseTimeMs: responseTimes[i],
          estimatedAccuracy: Math.round(estimatedAccuracy * 100),
        });
      }

      return curve;
    },
    [state.conceptMap]
  );

  // ── Context Value ──

  const value = useMemo(
    () => ({
      // State
      conceptMap: state.conceptMap,
      initialized: state.initialized,

      // Actions
      recordConceptAnswer,
      resetAll,
      persist,

      // Derived / queries
      getConceptScore,
      getConceptsDueForReview,
      getWeakConcepts,
      getThreeRSummary,
      getAdaptiveParams,
      getMasteryLevel,
      getLearningCurve,
    }),
    [
      state.conceptMap,
      state.initialized,
      recordConceptAnswer,
      resetAll,
      persist,
      getConceptScore,
      getConceptsDueForReview,
      getWeakConcepts,
      getThreeRSummary,
      getAdaptiveParams,
      getMasteryLevel,
      getLearningCurve,
    ]
  );

  return (
    <KidsIntelligenceContext.Provider value={value}>
      {children}
    </KidsIntelligenceContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useKidsIntelligence() {
  const context = useContext(KidsIntelligenceContext);
  if (!context) {
    throw new Error(
      'useKidsIntelligence must be used within a KidsIntelligenceProvider'
    );
  }
  return context;
}

// ─── Standalone Utility Functions ─────────────────────────────────────────────
// These work without the Provider, reading directly from localStorage.
// Useful in non-React code or quick one-off reads.

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* silent */
  }
}

/**
 * Get score summary for a single concept.
 */
export function getConceptScore(conceptKey) {
  const stored = loadFromStorage();
  if (!stored || !stored.conceptMap || !stored.conceptMap[conceptKey]) {
    return {correct: 0, total: 0, lastSeen: null, accuracy: 0};
  }
  const data = stored.conceptMap[conceptKey];
  return {
    correct: data.timesCorrect,
    total: data.timesPresented,
    lastSeen: data.retention.lastTested,
    accuracy:
      data.timesPresented > 0
        ? Math.round((data.timesCorrect / data.timesPresented) * 100)
        : 0,
  };
}

/**
 * Record a concept attempt directly into localStorage.
 * Mirrors the reducer logic so standalone callers stay in sync.
 */
export function recordConceptAttempt(
  conceptKey,
  isCorrect,
  responseTimeMs = 0
) {
  const stored = loadFromStorage() || {conceptMap: {}};
  const conceptMap = stored.conceptMap || {};
  const now = new Date().toISOString();
  const existing = conceptMap[conceptKey];

  if (!existing) {
    conceptMap[conceptKey] = {
      firstSeen: now,
      timesPresented: 1,
      timesCorrect: isCorrect ? 1 : 0,
      registration: {
        firstAttemptCorrect: isCorrect,
        attemptsToMaster: isCorrect ? 1 : null,
        mastered: isCorrect,
      },
      retention: {
        lastTested: now,
        score: isCorrect ? 1.0 : 0.0,
        nextReview: calculateNextReview(now, 0, isCorrect),
        reviewLevel: 0,
      },
      recall: {
        responseTimes: [responseTimeMs],
        avgResponseTimeMs: responseTimeMs,
        timedAccuracy: isCorrect ? 1.0 : 0.0,
        totalTimed: 1,
        correctTimed: isCorrect ? 1 : 0,
      },
    };
  } else {
    const timesPresented = existing.timesPresented + 1;
    const timesCorrect = existing.timesCorrect + (isCorrect ? 1 : 0);

    const registration = {...existing.registration};
    if (!registration.mastered && isCorrect) {
      registration.attemptsToMaster = timesPresented;
      registration.mastered = true;
    }

    const retention = {...existing.retention};
    retention.lastTested = now;
    const dsl = daysBetween(existing.retention.lastTested, now);
    if (dsl >= 1) {
      const newLevel = isCorrect
        ? Math.min(retention.reviewLevel + 1, REVIEW_INTERVALS.length - 1)
        : Math.max(retention.reviewLevel - 1, 0);
      retention.reviewLevel = newLevel;
      retention.score = timesCorrect / timesPresented;
      retention.nextReview = calculateNextReview(now, newLevel, isCorrect);
    }

    const responseTimes = [
      ...existing.recall.responseTimes,
      responseTimeMs,
    ].slice(-20);
    const avgResponseTimeMs =
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const correctTimed = existing.recall.correctTimed + (isCorrect ? 1 : 0);
    const totalTimed = existing.recall.totalTimed + 1;

    conceptMap[conceptKey] = {
      ...existing,
      timesPresented,
      timesCorrect,
      registration,
      retention,
      recall: {
        responseTimes,
        avgResponseTimeMs,
        timedAccuracy: correctTimed / totalTimed,
        totalTimed,
        correctTimed,
      },
    };
  }

  stored.conceptMap = conceptMap;
  saveToStorage(stored);
  return conceptMap[conceptKey];
}

/**
 * Get concepts that are weak (high weakness score).
 */
export function getWeakConcepts(category, limit = 10) {
  const stored = loadFromStorage();
  if (!stored || !stored.conceptMap) return [];

  return Object.entries(stored.conceptMap)
    .filter(([key]) => !category || key.startsWith(category + ':'))
    .map(([key, data]) => ({
      key,
      weakness: 1 - data.recall.timedAccuracy + (1 - data.retention.score),
      ...data,
    }))
    .sort((a, b) => b.weakness - a.weakness)
    .slice(0, limit);
}

/**
 * Get concepts due for spaced-repetition review.
 */
export function getDueForReview(category) {
  const stored = loadFromStorage();
  if (!stored || !stored.conceptMap) return [];

  const now = new Date().toISOString();
  return Object.entries(stored.conceptMap)
    .filter(([key, data]) => {
      if (category && !key.startsWith(category + ':')) return false;
      return data.retention.nextReview <= now;
    })
    .map(([key, data]) => ({key, ...data}))
    .sort((a, b) =>
      a.retention.nextReview.localeCompare(b.retention.nextReview)
    );
}

/**
 * Get 3R (Registration, Retention, Recall) summary scores for a category (or all).
 */
export function get3RScores(category) {
  const stored = loadFromStorage();
  if (!stored || !stored.conceptMap) {
    return {registration: 0, retention: 0, recall: 0, totalConcepts: 0};
  }

  const concepts = Object.entries(stored.conceptMap).filter(
    ([key]) => !category || key.startsWith(category + ':')
  );

  if (concepts.length === 0) {
    return {registration: 0, retention: 0, recall: 0, totalConcepts: 0};
  }

  let regTotal = 0;
  let retTotal = 0;
  let recTotal = 0;

  concepts.forEach(([, data]) => {
    regTotal += data.registration.mastered ? 1 : 0;
    retTotal += data.retention.score;
    recTotal += data.recall.timedAccuracy;
  });

  const count = concepts.length;
  return {
    registration: Math.round((regTotal / count) * 100),
    retention: Math.round((retTotal / count) * 100),
    recall: Math.round((recTotal / count) * 100),
    totalConcepts: count,
  };
}

/**
 * Get mastery level for a single concept.
 */
export function getMasteryLevel(conceptKey) {
  const stored = loadFromStorage();
  if (!stored || !stored.conceptMap || !stored.conceptMap[conceptKey]) {
    return {level: 'new', label: 'New', progress: 0};
  }

  const data = stored.conceptMap[conceptKey];
  const accuracy =
    data.timesPresented > 0 ? data.timesCorrect / data.timesPresented : 0;
  const reviewLevel = data.retention.reviewLevel;
  const mastered = data.registration.mastered;

  if (!mastered || accuracy < 0.6) {
    return {
      level: 'learning',
      label: 'Learning',
      progress: Math.round(accuracy * 100),
    };
  }
  if (accuracy >= 0.9 && reviewLevel >= 4) {
    return {level: 'expert', label: 'Expert', progress: 100};
  }
  if (accuracy >= 0.75 && reviewLevel >= 2) {
    return {
      level: 'proficient',
      label: 'Proficient',
      progress: Math.round(((accuracy - 0.75) / 0.15) * 25 + 75),
    };
  }
  return {
    level: 'familiar',
    label: 'Familiar',
    progress: Math.round(((accuracy - 0.6) / 0.15) * 25 + 50),
  };
}

// ─── Default export (standalone bag) ──────────────────────────────────────────

const kidsIntelligenceStore = {
  getConceptScore,
  recordConceptAttempt,
  getWeakConcepts,
  getDueForReview,
  get3RScores,
  getMasteryLevel,
};

export default kidsIntelligenceStore;
