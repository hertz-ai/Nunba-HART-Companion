/**
 * useMultiplayerSync — Real-time multiplayer synchronization hook for Kids Games.
 *
 * Connects to the existing game session API (gamesApi) and SSE (realtimeService)
 * to provide live multiplayer capabilities:
 *   - Create / join game sessions
 *   - Real-time participant list updates
 *   - Live score broadcasting
 *   - Game state synchronization
 *
 * Real-time transport layers (priority order):
 *   1. Crossbar WAMP pub/sub via gameRealtimeService (lowest latency)
 *   2. SSE via realtimeService (server-pushed events)
 *   3. REST polling fallback (3s interval)
 *
 * Uses the existing 12-endpoint gamesApi + crossbar/SSE broadcast infrastructure.
 */

import gameRealtimeService from '../../../../services/gameRealtimeService';
import realtimeService from '../../../../services/realtimeService';
import {gamesApi} from '../../../../services/socialApi';

import {useState, useEffect, useRef, useCallback} from 'react';

const POLL_INTERVAL = 3000; // Fallback polling when SSE/crossbar unavailable

/**
 * @param {Object} options
 * @param {string} options.gameConfigId - The game config ID (e.g., 'counting-animals')
 * @param {string} options.gameTitle - Display title
 * @param {string} options.gameType - Template type (counting, quiz, match, etc.)
 * @param {boolean} options.enabled - Whether multiplayer is active
 * @return {Object} multiplayer state and actions
 */
export default function useMultiplayerSync({
  gameConfigId,
  gameTitle = '',
  gameType = 'quiz',
  enabled = false,
} = {}) {
  const [sessionId, setSessionId] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [scores, setScores] = useState({}); // { participantId: { correct, total, streak } }
  const [status, setStatus] = useState('idle'); // idle | creating | waiting | playing | complete
  const [error, setError] = useState(null);

  const pollRef = useRef(null);
  const sseListenerRef = useRef(null);

  // ── Create a new multiplayer session ─────────────────────────
  const createSession = useCallback(
    async (maxPlayers = 4) => {
      if (!enabled) return;
      setStatus('creating');
      setError(null);

      try {
        const res = await gamesApi.create({
          game_type: gameType,
          game_config_id: gameConfigId,
          title: gameTitle,
          max_players: maxPlayers,
          total_rounds: 10,
          context_type: 'kids_learning',
        });

        if (res.data?.success || res.data?.data?.id) {
          const session = res.data?.data || res.data;
          setSessionId(session.id);
          setIsHost(true);
          setStatus('waiting');
          setParticipants(session.participants || []);
          return session.id;
        }
      } catch (err) {
        setError('Could not create game session');
        setStatus('idle');
      }
      return null;
    },
    [enabled, gameType, gameConfigId, gameTitle]
  );

  // ── Join an existing session ─────────────────────────────────
  const joinSession = useCallback(
    async (id) => {
      if (!enabled || !id) return;
      setStatus('creating');
      setError(null);

      try {
        const res = await gamesApi.join(id);
        if (res.data?.success || res.data?.data) {
          const session = res.data?.data || res.data;
          setSessionId(id);
          setIsHost(false);
          setStatus('waiting');
          setParticipants(session.participants || []);
          return true;
        }
      } catch (err) {
        setError('Could not join game');
        setStatus('idle');
      }
      return false;
    },
    [enabled]
  );

  // ── Quick match (auto-join or create) ────────────────────────
  const quickMatch = useCallback(async () => {
    if (!enabled) return;
    setStatus('creating');
    setError(null);

    try {
      const res = await gamesApi.quickMatch({
        game_type: gameType,
        game_config_id: gameConfigId,
      });

      if (res.data?.success || res.data?.data) {
        const session = res.data?.data || res.data;
        setSessionId(session.id);
        setIsHost(session.is_host || false);
        setStatus('waiting');
        setParticipants(session.participants || []);
        return session.id;
      }
    } catch (err) {
      // Fallback: create new session
      return createSession(4);
    }
    return null;
  }, [enabled, gameType, gameConfigId, createSession]);

  // ── Mark ready ───────────────────────────────────────────────
  const markReady = useCallback(async () => {
    if (!sessionId) return;
    try {
      await gamesApi.ready(sessionId);
    } catch (err) {
      // Non-critical
    }
  }, [sessionId]);

  // ── Start the game (host only) ──────────────────────────────
  const startGame = useCallback(async () => {
    if (!sessionId || !isHost) return;
    try {
      await gamesApi.start(sessionId);
      setGameStarted(true);
      setStatus('playing');
    } catch (err) {
      setError('Could not start game');
    }
  }, [sessionId, isHost]);

  // ── Submit a move (score update) ─────────────────────────────
  const submitMove = useCallback(
    async (moveData) => {
      if (!sessionId || status !== 'playing') return;

      const move = {type: 'answer', ...moveData};

      // Prefer crossbar WAMP for low-latency broadcast
      if (gameRealtimeService.isAvailable()) {
        gameRealtimeService.publish(sessionId, {
          type: 'game_move',
          move,
          player_id: 'self',
        });
      }

      // Also persist to backend (non-blocking)
      gamesApi.move(sessionId, move).catch(() => {});
    },
    [sessionId, status]
  );

  // ── Broadcast final score ────────────────────────────────────
  const submitFinalScore = useCallback(
    async (finalScore) => {
      if (!sessionId) return;

      const moveData = {
        type: 'final_score',
        correct: finalScore.correct,
        total: finalScore.total,
        streak: finalScore.bestStreak || 0,
      };

      // Broadcast via crossbar for instant update
      if (gameRealtimeService.isAvailable()) {
        gameRealtimeService.publish(sessionId, {
          type: 'game_move',
          move: moveData,
          player_id: 'self',
        });
      }

      // Persist to backend
      try {
        await gamesApi.move(sessionId, moveData);
      } catch (err) {
        // Non-critical
      }
    },
    [sessionId]
  );

  // ── Leave session ────────────────────────────────────────────
  const leaveSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      await gamesApi.leave(sessionId);
    } catch (err) {
      // Non-critical
    }
    setSessionId(null);
    setParticipants([]);
    setIsHost(false);
    setGameStarted(false);
    setStatus('idle');
    setScores({});
  }, [sessionId]);

  // ── Get results ──────────────────────────────────────────────
  const getResults = useCallback(async () => {
    if (!sessionId) return null;
    try {
      const res = await gamesApi.results(sessionId);
      return res.data?.data || res.data;
    } catch (err) {
      return null;
    }
  }, [sessionId]);

  // ── SSE listener for real-time updates ───────────────────────
  useEffect(() => {
    if (!enabled || !sessionId) return;

    const handleEvent = (event) => {
      const data = typeof event === 'string' ? JSON.parse(event) : event;

      switch (data.type || data.event_type) {
        case 'game_player_joined':
          setParticipants((prev) => {
            const existing = prev.find((p) => p.id === data.player?.id);
            if (existing) return prev;
            return [...prev, data.player];
          });
          break;

        case 'game_player_left':
          setParticipants((prev) =>
            prev.filter((p) => p.id !== data.player_id)
          );
          break;

        case 'game_started':
          setGameStarted(true);
          setStatus('playing');
          break;

        case 'game_move':
          if (
            data.move?.type === 'answer' ||
            data.move?.type === 'final_score'
          ) {
            setScores((prev) => ({
              ...prev,
              [data.player_id]: {
                correct:
                  data.move.correct ||
                  (prev[data.player_id]?.correct || 0) +
                    (data.move.isCorrect ? 1 : 0),
                total:
                  data.move.total || (prev[data.player_id]?.total || 0) + 1,
                streak: data.move.streak || 0,
              },
            }));
          }
          break;

        case 'game_completed':
          setStatus('complete');
          break;

        default:
          break;
      }
    };

    // Register crossbar WAMP listener (lowest latency)
    if (gameRealtimeService.isAvailable()) {
      gameRealtimeService.subscribe(sessionId, handleEvent);
    }

    // Register SSE listener (server-pushed fallback)
    if (realtimeService && typeof realtimeService.on === 'function') {
      sseListenerRef.current = handleEvent;
      realtimeService.on('game_player_joined', handleEvent);
      realtimeService.on('game_player_left', handleEvent);
      realtimeService.on('game_started', handleEvent);
      realtimeService.on('game_move', handleEvent);
      realtimeService.on('game_completed', handleEvent);
    }

    // Fallback polling
    pollRef.current = setInterval(async () => {
      try {
        const res = await gamesApi.get(sessionId);
        const session = res.data?.data || res.data;
        if (session) {
          setParticipants(session.participants || []);
          if (session.status === 'active' && !gameStarted) {
            setGameStarted(true);
            setStatus('playing');
          }
          if (session.status === 'completed') {
            setStatus('complete');
          }
        }
      } catch (err) {
        // Polling failure — non-critical
      }
    }, POLL_INTERVAL);

    return () => {
      clearInterval(pollRef.current);
      // Unsubscribe crossbar
      gameRealtimeService.unsubscribe(sessionId, handleEvent);
      // Unsubscribe SSE
      if (realtimeService && typeof realtimeService.off === 'function') {
        realtimeService.off('game_player_joined', sseListenerRef.current);
        realtimeService.off('game_player_left', sseListenerRef.current);
        realtimeService.off('game_started', sseListenerRef.current);
        realtimeService.off('game_move', sseListenerRef.current);
        realtimeService.off('game_completed', sseListenerRef.current);
      }
    };
  }, [enabled, sessionId, gameStarted]);

  return {
    // State
    sessionId,
    participants,
    isHost,
    gameStarted,
    scores,
    status,
    error,

    // Actions
    createSession,
    joinSession,
    quickMatch,
    markReady,
    startGame,
    submitMove,
    submitFinalScore,
    leaveSession,
    getResults,

    // Computed
    participantCount: participants.length,
    isMultiplayer: !!sessionId,
    canStart: isHost && participants.length >= 2 && !gameStarted,
  };
}
