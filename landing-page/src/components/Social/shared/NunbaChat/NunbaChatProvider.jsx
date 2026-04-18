/**
 * NunbaChatProvider - Context + state for the floating Nunba chat widget.
 *
 * Wires to the EXISTING chatApi (Flask :5000 /chat) and useTTS hook.
 * Does NOT import Demopage — lightweight direct API calls only.
 */

import {NUNBA_CAMERA_CONSENT} from '../../../../constants/events';
import {useSocial} from '../../../../contexts/SocialContext';
import useCameraFrameStream from '../../../../hooks/useCameraFrameStream';
import {useTTS} from '../../../../hooks/useTTS';
import realtimeService from '../../../../services/realtimeService';
import {chatApi} from '../../../../services/socialApi';
import {
  classifyError,
  getBackoff,
  makeMsgId,
} from '../../../../utils/chatRetry';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import {v4 as uuidv4} from 'uuid';

const NunbaChatContext = createContext(null);

export function useNunbaChat() {
  const ctx = useContext(NunbaChatContext);
  if (!ctx) throw new Error('useNunbaChat must be inside NunbaChatProvider');
  return ctx;
}

/* ── Diverse avatar palette — seeded by agent name ── */
const AVATAR_PALETTES = [
  {bg: '#8B5E3C', accent: '#FFD8B1'}, // warm brown
  {bg: '#6C63FF', accent: '#C5C1FF'}, // aspiration violet
  {bg: '#D4A373', accent: '#FEFAE0'}, // golden tan
  {bg: '#2D6A4F', accent: '#B7E4C7'}, // forest green
  {bg: '#E76F51', accent: '#FFDDD2'}, // terracotta
  {bg: '#264653', accent: '#A8DADC'}, // deep teal
  {bg: '#F4A261', accent: '#FFF1DB'}, // amber
  {bg: '#7B2CBF', accent: '#E0AAFF'}, // royal purple
  {bg: '#D62828', accent: '#FFCCD5'}, // crimson
  {bg: '#023E8A', accent: '#90E0EF'}, // navy
  {bg: '#BC6C25', accent: '#DDA15E'}, // sienna
  {bg: '#606C38', accent: '#FEFAE0'}, // olive
];

/** Deterministic palette from agent name/id */
export function getAgentPalette(seed) {
  if (!seed) return AVATAR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++)
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

// Storage key scoped to (userId, agentId) so guest vs logged-in +
// multiple users on the same machine don't bleed conversation state
// into each other.  Guest falls back to 'guest' namespace, which
// persists across webview close+reopen for same-machine users.
const STORAGE_KEY = (userId, agentId) =>
  `nunba_chat_${userId || 'guest'}_${agentId || 'default'}`;
const MAX_STORED = 50;

// One-shot migration for users upgrading from the old single-key scheme
// (`nunba_chat_<agentId>`) — copy old value into the new (guest, agentId)
// bucket so existing conversations aren't lost.  Runs idempotently.
function _migrateLegacyKeys() {
  try {
    if (localStorage.getItem('nunba_chat_migrated_v2')) return;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('nunba_chat_')) continue;
      if (k.startsWith('nunba_chat_guest_')) continue;
      // Already new-scheme keys contain two underscores after 'nunba_chat_'
      const rest = k.slice('nunba_chat_'.length);
      if (rest.includes('_')) continue;
      const newKey = `nunba_chat_guest_${rest || 'default'}`;
      if (!localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, localStorage.getItem(k));
      }
    }
    localStorage.setItem('nunba_chat_migrated_v2', '1');
  } catch {
    /* quota / access */
  }
}

/**
 * One-shot migration for the hardware-derived guest_id upgrade.
 *
 * Before this change the guest user_id was either a random UUID (minted
 * by OtpAuthModal on first boot) or the literal 'guest'.  Storage
 * buckets were keyed by that ephemeral id.  After the upgrade the
 * canonical guest id is `window.__NUNBA_GUEST_ID__` (hardware-derived,
 * stable across reinstalls).  We copy every `nunba_chat_<oldId>_*`
 * bucket to `nunba_chat_<newId>_*` so the user's conversations are
 * reachable under the new id.
 *
 * Runs ONCE per (oldId → newId) pair; idempotent.
 */
function _migrateToHardwareGuestId(newGuestId) {
  if (!newGuestId) return;
  try {
    const breadcrumbKey = `nunba_chat_migrated_hw_${newGuestId}`;
    if (localStorage.getItem(breadcrumbKey)) return;
    const oldId = localStorage.getItem('guest_user_id');
    // Nothing to migrate if there was no prior guest id, or if we're
    // already using the hardware-derived id (handled by
    // populate-from-global below).
    if (!oldId || oldId === newGuestId) {
      localStorage.setItem(breadcrumbKey, '1');
      return;
    }
    const prefixOld = `nunba_chat_${oldId}_`;
    const prefixNew = `nunba_chat_${newGuestId}_`;
    const moves = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefixOld)) continue;
      moves.push(k);
    }
    for (const k of moves) {
      const newKey = prefixNew + k.slice(prefixOld.length);
      if (!localStorage.getItem(newKey)) {
        const val = localStorage.getItem(k);
        if (val != null) localStorage.setItem(newKey, val);
      }
    }
    localStorage.setItem(breadcrumbKey, '1');
  } catch {
    /* quota / access */
  }
}

/**
 * Resolve the canonical guest_id for this install, preferring (in
 * order): existing localStorage entry, Flask-injected global, 'guest'.
 *
 * Also lazily populates `guest_user_id` in localStorage from the
 * injected global the FIRST time we see it, so downstream code that
 * still reads `localStorage.getItem('guest_user_id')` (e.g. legacy
 * Demopage paths, Cypress fixtures) keeps working.
 */
function _resolveGuestId() {
  try {
    const injected =
      (typeof window !== 'undefined' && window.__NUNBA_GUEST_ID__) || null;
    let stored = null;
    try {
      stored = localStorage.getItem('guest_user_id');
    } catch {
      stored = null;
    }
    // Prefer injected (hardware-stable) if localStorage was wiped.
    if (!stored && injected) {
      try {
        localStorage.setItem('guest_user_id', injected);
      } catch {
        /* quota */
      }
      return injected;
    }
    return stored || injected || null;
  } catch {
    return null;
  }
}

function loadMessages(userId, agentId) {
  try {
    _migrateLegacyKeys();
    const raw = localStorage.getItem(STORAGE_KEY(userId, agentId));
    if (!raw) return [];
    const msgs = JSON.parse(raw);
    // Clean up stale in-flight statuses from previous sessions
    return msgs.map((m) =>
      m.status === 'sending' || m.status === 'retrying'
        ? {...m, status: 'failed', error: 'Interrupted — tap to retry'}
        : m
    );
  } catch {
    return [];
  }
}
function saveMessages(userId, agentId, msgs) {
  try {
    localStorage.setItem(
      STORAGE_KEY(userId, agentId),
      JSON.stringify(msgs.slice(-MAX_STORED))
    );
  } catch {
    /* quota */
  }
}

export default function NunbaChatProvider({children}) {
  const {currentUser} = useSocial();
  // Fallback chain — aligned with STORAGE_KEY's own `|| 'guest'`
  // fallback above.  Regression history: the prior `|| '1'` default
  // made every fresh guest (no currentUser, no hevolve_access_id)
  // collapse to bucket `nunba_chat_1_default`, bleeding conversations
  // across distinct device/guest pairs.  See J204 regression test.
  //
  // `window.__NUNBA_GUEST_ID__` is the hardware-derived stable id
  // Flask injects into index.html at request time (see main.py
  // _inject_guest_id_into_html).  It lets a fresh-install (wiped
  // localStorage) recover the SAME guest identity on the SAME
  // hardware — closing the WebView2-UserDataFolder-wipe gap that
  // J201 guards against.
  const hwGuestId =
    (typeof window !== 'undefined' && window.__NUNBA_GUEST_ID__) || null;
  const resolvedGuest = _resolveGuestId();
  const userId =
    currentUser?.id ||
    localStorage.getItem('hevolve_access_id') ||
    resolvedGuest ||
    hwGuestId ||
    'guest';

  // One-shot storage-key migration: if the user had prior chat
  // history under the OLD guest_user_id and we've now picked up the
  // hardware-derived id, copy buckets forward so conversations
  // appear under the new id.
  useEffect(() => {
    if (hwGuestId) _migrateToHardwareGuestId(hwGuestId);
  }, [hwGuestId]);

  // Core state
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return localStorage.getItem('nunba_chat_dismissed') === 'true';
    } catch {
      return false;
    }
  });
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [currentAgent, setCurrentAgent] = useState(null); // { prompt_id, name }
  const [availableAgents, setAvailableAgents] = useState([]);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  // Camera frame streaming — consented via an ApprovalOverlay "camera"
  // approval.  Persisted to sessionStorage so a page nav within the
  // session keeps the consent (not localStorage — long-lived consent
  // is a privacy anti-pattern, user should re-opt-in per session).
  const [cameraConsented, setCameraConsented] = useState(() => {
    try {
      return sessionStorage.getItem('nunba_camera_consent') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onConsent = (ev) => {
      const approved = !!ev?.detail?.approved;
      setCameraConsented(approved);
      try {
        if (approved) {
          sessionStorage.setItem('nunba_camera_consent', 'true');
        } else {
          sessionStorage.removeItem('nunba_camera_consent');
        }
      } catch {
        /* storage quota */
      }
    };
    window.addEventListener(NUNBA_CAMERA_CONSENT, onConsent);
    return () => window.removeEventListener(NUNBA_CAMERA_CONSENT, onConsent);
  }, []);

  useCameraFrameStream({
    enabled: cameraConsented && !!userId,
    userId,
    channel: 'camera',
  });

  const conversationIdRef = useRef(uuidv4());
  const currentAgentRef = useRef(null); // race-condition guard
  const latestRequestIdRef = useRef(null); // stale-audio guard (Android parity)

  // TTS — wired to existing hook
  const tts = useTTS({enabled: ttsEnabled, autoSpeak: false});

  // switchAgent must be defined BEFORE useEffects that reference it (TDZ fix)
  const switchAgent = useCallback(
    (agent) => {
      tts.stop();
      setCurrentAgent(agent);
    },
    [tts]
  );

  // Load agents on mount
  useEffect(() => {
    chatApi
      .getPrompts(userId)
      .then((res) => {
        const data = res.data || res || {};
        const prompts = Array.isArray(data.prompts)
          ? data.prompts
          : Array.isArray(data)
            ? data
            : [];
        setAvailableAgents(prompts.slice(0, 8)); // widget limit
      })
      .catch(() => {
        /* backend not up */
      });
  }, [userId]);

  // Sync HART preferences from browser → backend (one-time on mount).
  // Browser localStorage is the source of truth for HART identity
  // (set during LightYourHART onboarding). Backend needs hart_language.json
  // for TTS warm-up. This closes the gap when onboarding happened on the
  // Demopage route but NunbaChat is the active route on next launch.
  useEffect(() => {
    const lang = localStorage.getItem('hart_language');
    if (lang && lang !== 'en') {
      fetch('/api/ai/bootstrap', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({language: lang}),
      }).catch(() => {});
    }
  }, []);

  // Listen for external agent selection (e.g., "Chat with HART" buttons)
  useEffect(() => {
    const handler = (e) => {
      const {agentId, agentName} = e.detail || {};
      if (!agentId) return;
      // Find agent in available list or create a transient entry
      const found = availableAgents.find(
        (a) => String(a.prompt_id) === String(agentId)
      );
      if (found) {
        switchAgent(found);
      } else {
        switchAgent({prompt_id: agentId, name: agentName || `HART ${agentId}`});
      }
      setIsExpanded(true);
    };
    window.addEventListener('nunba:selectAgent', handler);
    return () => window.removeEventListener('nunba:selectAgent', handler);
  }, [availableAgents, switchAgent, setIsExpanded]);

  // Load messages when agent OR user changes.
  // Scope: (userId, agentKey) — guest and logged-in share the webview
  // localStorage but get separate buckets so a user logging in mid-session
  // doesn't inherit the prior guest's messages (and vice versa).
  useEffect(() => {
    const agentKey = currentAgent?.prompt_id || 'default';
    setMessages(loadMessages(userId, agentKey));
    conversationIdRef.current = uuidv4();
    currentAgentRef.current = agentKey;
  }, [currentAgent, userId]);

  // Persist messages on change
  useEffect(() => {
    const agentKey = currentAgent?.prompt_id || 'default';
    if (messages.length > 0) saveMessages(userId, agentKey, messages);
  }, [messages, currentAgent, userId]);

  // Dismiss persistence
  const dismiss = useCallback(() => {
    setIsDismissed(true);
    setIsExpanded(false);
    try {
      localStorage.setItem('nunba_chat_dismissed', 'true');
    } catch (err) {
      console.error('localStorage dismiss failed:', err);
    }
  }, []);

  const undismiss = useCallback(() => {
    setIsDismissed(false);
    try {
      localStorage.removeItem('nunba_chat_dismissed');
    } catch (err) {
      console.error('localStorage undismiss failed:', err);
    }
  }, []);

  // ── Retry: message status updater ──
  const updateMsgById = useCallback((messageId, updates) => {
    setMessages((prev) =>
      prev.map((m) => (m.messageId === messageId ? {...m, ...updates} : m))
    );
  }, []);

  /** Parse @mentions from input text. Returns { cleanText, mentionedAgents[] } */
  const parseMentions = useCallback(
    (text) => {
      const mentionRegex = /@(\S+)/g;
      const mentionedAgents = [];
      let match;
      while ((match = mentionRegex.exec(text)) !== null) {
        const name = match[1].toLowerCase();
        const agent = availableAgents.find(
          (a) =>
            (a.name || '').toLowerCase() === name ||
            (a.name || '').toLowerCase().replace(/\s+/g, '.') === name
        );
        if (
          agent &&
          !mentionedAgents.find((m) => m.prompt_id === agent.prompt_id)
        ) {
          mentionedAgents.push(agent);
        }
      }
      return {mentionedAgents};
    },
    [availableAgents]
  );

  // Send message with persistent retry + @mention multi-HART support
  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim() || isLoading) return;

      const {mentionedAgents} = parseMentions(text);
      const agentKey = currentAgentRef.current;
      const msgId = makeMsgId();
      const userMsg = {
        role: 'user',
        text: text.trim(),
        ts: Date.now(),
        messageId: msgId,
        status: 'sending',
        ...(mentionedAgents.length > 0
          ? {mentions: mentionedAgents.map((a) => a.name || a.prompt_id)}
          : {}),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setIsTyping(true);

      let retryCount = 0;
      let lastReason = '';

      while (true) {
        if (currentAgentRef.current !== agentKey) return; // agent switched

        if (retryCount > 0) {
          const backoff = getBackoff(retryCount - 1);
          updateMsgById(msgId, {
            status: 'retrying',
            error: `${lastReason} — retrying in ${Math.round(backoff / 1000)}s...`,
            retryCount,
          });
          setIsTyping(false); // no dots during backoff
          await new Promise((r) => setTimeout(r, backoff));
          if (currentAgentRef.current !== agentKey) return;
          setIsTyping(true);
        }

        try {
          updateMsgById(msgId, {status: 'sending', error: null});
          const res = await chatApi.chat({
            text: text.trim(),
            user_id: userId,
            agent_id: currentAgent?.prompt_id || 'local_assistant',
            agent_type: 'local',
            conversation_id: conversationIdRef.current,
            media_mode: localStorage.getItem('nunba_media_mode') || 'audio',
            prompt_id: currentAgent?.prompt_id || null,
            create_agent: false,
            autonomous_creation: false,
            ...(mentionedAgents.length > 0
              ? {mentioned_agents: mentionedAgents.map((a) => a.prompt_id)}
              : {}),
          });

          if (currentAgentRef.current !== agentKey) return;

          updateMsgById(msgId, {
            status: 'sent',
            error: null,
            retryCount: undefined,
          });

          const data = res.data || res || {};
          const reply =
            data.text ||
            data.response ||
            'I heard you, but I have nothing to add right now.';
          const agentStatus = data.Agent_status || data.agent_status || null;
          const respondingAgent =
            data.responding_agent || currentAgent?.name || null;

          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              text: reply,
              ts: Date.now(),
              agentStatus,
              postId: data.post_id || null,
              agentName: respondingAgent,
            },
          ]);

          // TTS: backend synthesizes async, pushes audio via SSE/WAMP.
          // Track request_id so we only play audio for the latest request
          // (same pattern as Android AbstractChatActivity.latestRequestId).
          latestRequestIdRef.current = data.request_id || msgId;

          setIsLoading(false);
          setIsTyping(false);
          return; // success
        } catch (err) {
          if (currentAgentRef.current !== agentKey) return;
          const {reason, retryable} = classifyError(err);
          lastReason = reason;

          if (!retryable) {
            updateMsgById(msgId, {status: 'failed', error: reason});
            setIsLoading(false);
            setIsTyping(false);
            return;
          }

          retryCount++;
          // Loop continues with backoff...
        }
      }
    },
    [
      userId,
      currentAgent,
      isLoading,
      ttsEnabled,
      tts,
      updateMsgById,
      parseMentions,
    ]
  );

  // Manual retry for failed messages
  const retryMessage = useCallback(
    (messageId) => {
      const msg = messages.find((m) => m.messageId === messageId);
      if (!msg || msg.status !== 'failed' || isLoading) return;
      setMessages((prev) => prev.filter((m) => m.messageId !== messageId));
      sendMessage(msg.text);
    },
    [messages, isLoading, sendMessage]
  );

  // Delete a stuck/retrying message
  const deleteMessage = useCallback((messageId) => {
    setMessages((prev) => prev.filter((m) => m.messageId !== messageId));
  }, []);

  // Listen for backend-pushed TTS audio via SSE/WAMP (com.hertzai.pupit.{userId}).
  // Same pattern as Android's onEventPupitVideo → settingVideoResponse → play.
  // Stale-request guard: only play audio matching latestRequestIdRef.
  //
  // WebView2 / Chrome autoplay policy rejects new Audio().play() from async
  // SSE callbacks that aren't within a user-gesture window. The prior impl
  // swallowed the rejection with `.catch(() => {})` — no log, no UI
  // indication, user hears nothing. Ported the Demopage.js:1918-1950
  // workaround here: persistent <audio id="nunba-tts-audio"> element, loud
  // error logging, and a one-shot document-level click handler that resumes
  // playback on the next user gesture.
  useEffect(() => {
    // Persistent audio element primed by prior user interactions.
    // When the React tree first mounts inside a user gesture (typing a
    // message and pressing send), the element is "activated" and can
    // later play async audio from SSE callbacks.
    const ttsAudio = document.getElementById('nunba-tts-audio') || (() => {
      const el = document.createElement('audio');
      el.id = 'nunba-tts-audio';
      el.preload = 'auto';
      document.body.appendChild(el);
      return el;
    })();

    const handleTTSPush = (payload) => {
      const data = payload?.data || payload;
      if (data?.action !== 'TTS' || !data?.generated_audio_url) return;

      // Android parity: skip stale audio (request_id mismatch)
      if (latestRequestIdRef.current &&
          data.request_id && data.request_id !== latestRequestIdRef.current) {
        return;
      }

      // Reuse the persistent element instead of new Audio() — the latter
      // is born "un-activated" and autoplay always rejects.
      console.log('[TTS] Event received:', data.generated_audio_url,
                  'req:', data.request_id);
      ttsAudio.src = data.generated_audio_url;
      ttsAudio.play().then(() => {
        console.log('[TTS] Audio playing OK');
      }).catch((err) => {
        console.error('[TTS] Play FAILED (autoplay blocked or network):',
                      err && err.message);
        // One-shot resume on next user gesture — replay the rejected audio
        // once the user clicks anywhere. Avoids the silent-drop class of
        // failure the prior catch(() => {}) produced.
        const resumeAudio = () => {
          ttsAudio.play().catch(() => {});
          document.removeEventListener('click', resumeAudio);
        };
        document.addEventListener('click', resumeAudio, { once: true });
      });
    };

    // Subscribe to both SSE event types and crossbar worker messages
    realtimeService.on('pupit', handleTTSPush);
    realtimeService.on('message', handleTTSPush); // SSE generic messages
    realtimeService.on('tts', handleTTSPush);     // Demopage-style topic

    return () => {
      realtimeService.off('pupit', handleTTSPush);
      realtimeService.off('message', handleTTSPush);
      realtimeService.off('tts', handleTTSPush);
    };
  }, [tts]);

  const clearMessages = useCallback(() => {
    const agentKey = currentAgent?.prompt_id || 'default';
    setMessages([]);
    conversationIdRef.current = uuidv4();
    try {
      localStorage.removeItem(STORAGE_KEY(userId, agentKey));
    } catch (err) {
      console.error('localStorage clearMessages failed:', err);
    }
  }, [currentAgent, userId]);

  const value = {
    isExpanded,
    setIsExpanded,
    isDismissed,
    dismiss,
    undismiss,
    messages,
    isLoading,
    isTyping,
    currentAgent,
    availableAgents,
    sendMessage,
    switchAgent,
    clearMessages,
    retryMessage,
    deleteMessage,
    ttsEnabled,
    setTtsEnabled,
    tts,
    getAgentPalette,
  };

  return (
    <NunbaChatContext.Provider value={value}>
      {children}
    </NunbaChatContext.Provider>
  );
}
