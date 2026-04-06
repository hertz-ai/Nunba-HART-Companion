/**
 * NunbaChatProvider - Context + state for the floating Nunba chat widget.
 *
 * Wires to the EXISTING chatApi (Flask :5000 /chat) and useTTS hook.
 * Does NOT import Demopage — lightweight direct API calls only.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import {v4 as uuidv4} from 'uuid';
import {chatApi} from '../../../../services/socialApi';
import {useTTS} from '../../../../hooks/useTTS';
import {useSocial} from '../../../../contexts/SocialContext';
import realtimeService from '../../../../services/realtimeService';
import {
  classifyError,
  getBackoff,
  makeMsgId,
} from '../../../../utils/chatRetry';

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

const STORAGE_KEY = (agentId) => `nunba_chat_${agentId || 'default'}`;
const MAX_STORED = 50;

function loadMessages(agentId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(agentId));
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
function saveMessages(agentId, msgs) {
  try {
    localStorage.setItem(
      STORAGE_KEY(agentId),
      JSON.stringify(msgs.slice(-MAX_STORED))
    );
  } catch {
    /* quota */
  }
}

export default function NunbaChatProvider({children}) {
  const {currentUser} = useSocial();
  const userId =
    currentUser?.id || localStorage.getItem('hevolve_access_id') || '1';

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

  // Load messages when agent changes
  useEffect(() => {
    const agentKey = currentAgent?.prompt_id || 'default';
    setMessages(loadMessages(agentKey));
    conversationIdRef.current = uuidv4();
    currentAgentRef.current = agentKey;
  }, [currentAgent]);

  // Persist messages on change
  useEffect(() => {
    const agentKey = currentAgent?.prompt_id || 'default';
    if (messages.length > 0) saveMessages(agentKey, messages);
  }, [messages, currentAgent]);

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
  useEffect(() => {
    const handleTTSPush = (payload) => {
      const data = payload?.data || payload;
      if (data?.action !== 'TTS' || !data?.generated_audio_url) return;

      // Android parity: skip stale audio (request_id mismatch)
      if (latestRequestIdRef.current &&
          data.request_id && data.request_id !== latestRequestIdRef.current) {
        return;
      }

      // Play the pushed audio file directly — same as Android's processVideoQueue.
      // Uses a simple Audio element; the existing useTTS hook doesn't have a
      // play-from-url method, but the pattern is identical to _speakServer's
      // audioRef.current.src = url; audioRef.current.play();
      try {
        const audio = new Audio(data.generated_audio_url);
        audio.play().catch(() => {});
      } catch {
        // Autoplay blocked — user will see text, can replay manually
      }
    };

    // Subscribe to both SSE event types and crossbar worker messages
    realtimeService.on('pupit', handleTTSPush);
    realtimeService.on('message', handleTTSPush); // SSE generic messages

    return () => {
      realtimeService.off('pupit', handleTTSPush);
      realtimeService.off('message', handleTTSPush);
    };
  }, [tts]);

  const clearMessages = useCallback(() => {
    const agentKey = currentAgent?.prompt_id || 'default';
    setMessages([]);
    conversationIdRef.current = uuidv4();
    try {
      localStorage.removeItem(STORAGE_KEY(agentKey));
    } catch (err) {
      console.error('localStorage clearMessages failed:', err);
    }
  }, [currentAgent]);

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
