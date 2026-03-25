/* eslint-disable no-unused-vars, camelcase, import/order, import/no-unresolved, prettier/prettier, valid-jsdoc, react-hooks/exhaustive-deps, react/no-unescaped-entities */
import React, {useState, useRef, useEffect, useCallback, useMemo} from 'react';
import {v4 as uuidv4} from 'uuid';
// import { Worker, Viewer, SpecialZoomLevel } from '@react-pdf-viewer/core';
// import '@react-pdf-viewer/core/lib/styles/index.css';
import connectedGif from '../assets/images/connected.gif';
import connectedImg from '../assets/images/connectedImg.gif';
import DisconnectedImg from '../assets/images/DisconnectedImg.gif';
import Lottie from 'lottie-react';
import creationModeAnimation from '../assets/images/Animation.json';
import {Link as RouterLink, useNavigate, useParams, useLocation} from 'react-router-dom';
import {
  ChevronDown,
  ClipboardCopy,
  ThumbsUp,
  ThumbsDown,
  CircleCheck,
  FileText,
  User,
  Clock,
  ChevronLeft,
} from 'lucide-react';
import { BOOK_PARSING_URL, UPLOAD_FILE_URL, PERSONALISED_LEARNING_URL, CUSTOM_GPT_URL } from '../config/apiBase';
import {animateScroll as scrollLibrary} from 'react-scroll';

import autobahn from 'autobahn';
import { classifyError, getBackoff, makeMsgId } from '../utils/chatRetry';
import { decrypt, encrypt } from '../utils/encryption';
import { logger } from '../utils/logger';

// NewHome is only loaded when user is not logged in (landing page)
const NewHome = React.lazy(() =>
  import('./newHomeforDemo').catch(() => ({default: () => null}))
);

import OtpAuthModal from './OtpAuthModal';
import SecureInputModal from '../components/SecureInputModal';
import {Document, Page, pdfjs} from 'react-pdf';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import Agents from '../components/Agent/Agents';
import CreateAgentForm from './CreateAgentForm';
import CreditSystem from './Credits';
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;

// ── Use existing Nunba API services for local/global integration ──
import {chatApi, usersApi, agentApi} from '../services/socialApi';
import { initGameRealtime } from '../services/gameRealtimeService';
import realtimeService from '../services/realtimeService';

// ── TTS hook for offline text-to-speech ──
import {useTTS} from '../hooks/useTTS';

// ── Extracted sub-components ──
import AgentSidebar from './chat/AgentSidebar';
import PdfViewer from './chat/PdfViewer';
import ChatInputBar from './chat/ChatInputBar';
import ChatMessageList from './chat/ChatMessageList';

const HOSTED_URL = 'https://hevolve.hertzai.com';

/**
 * Determine if an agent is local (created via LLM pipeline)
 * vs cloud-only (fetched from mailer.hertzai.com).
 */
const isLocalAgent = (agent) => {
  if (!agent) return false;
  return agent._isLocal === true || agent.create_agent === true;
};

/* TypeWriterForSubtitle and ThinkingProcessContainer extracted to ./chat/ */

const ChatInterface = ({agentData, embeddedMode, onReady}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const {agentName} = useParams();

  // Detect if we're on the /local route to force guest mode
  const isLocalRoute = location.pathname === '/local';

  // Hero preloader: onReady fires exactly once — when agents are fetched
  // (via fetchPrompts finally block), OR after 5s safety timeout, whichever first.
  const readyFired = useRef(false);
  const fireOnReady = useCallback(() => {
    if (!readyFired.current && onReady) {
      readyFired.current = true;
      onReady();
    }
  }, [onReady]);

  useEffect(() => {
    const safetyTimer = setTimeout(fireOnReady, 5000);
    return () => clearTimeout(safetyTimer);
  }, [fireOnReady]);

  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const textareaRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [pdffileUrl, setpdfFileUrl] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState();

  const [currentThinkingId, setCurrentThinkingId] = useState(null);
  const [thinkingStartTime, setThinkingStartTime] = useState(null);

  const [shouldScroll, setShouldScroll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messageQueue, setMessageQueue] = useState([]); // Queue for messages sent while loading
  const lastMessageSentAtRef = useRef(0); // Timestamp of last sent message
  const [editingQueueId, setEditingQueueId] = useState(null); // Track which queue item is being edited
  const [requestId, setRequestId] = useState(null);
  const requestIdRef = useRef(null);
  // Keep ref in sync — handleDataReceived (useCallback) reads the ref to filter
  // daemon thinking traces without re-creating the callback on every request.
  useEffect(() => { requestIdRef.current = requestId; }, [requestId]);
  const [audioUrl, setAudioUrl] = useState(null);
  const messagesEndRef = useRef(null);
  const [userImage, setUserImage] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showAgentsOverlay, setShowAgentsOverlay] = useState(false);
  const [fileUrl, setFileUrl] = useState(null);
  const connectionRef = useRef(null);
  const [displayedText, setDisplayedText] = useState('');
  const [showContent, setShowContent] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [messagesauto, setMessagesauto] = useState([]);
  const [codeContent, setCodeContent] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState(null);
  const [allAgents, setAllAgents] = useState([]);
  const [currentAgent, setCurrentAgent] = useState();
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [agentFetchAttempts, setAgentFetchAttempts] = useState(0);
  const [conversationId] = useState(() => uuidv4());
  const messagesRef = useRef(messages);
  const currentAgentRef = useRef(currentAgent);
  const handleSendRef = useRef(null); // Stable ref for queue processor
  const [duration, setDuration] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [intelligencePreference, setIntelligencePreference] = useState(
    () => localStorage.getItem('intelligence_preference') || 'auto'
  );
  const [backendHealth, setBackendHealth] = useState(null); // 'healthy' | 'degraded' | 'offline'
  const cloudAvailable = navigator.onLine; // true = cloud hevolve.ai reachable
  const [isRequestInFlight, setIsRequestInFlight] = useState(false); // true only during active HTTP request
  const [agentRetryTrigger, setAgentRetryTrigger] = useState(0); // increment to retrigger fetchPrompts
  const [showAgentMentionList, setShowAgentMentionList] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [secretRequest, setSecretRequest] = useState(null);

  // Auto-refresh guest token on relaunch — if guest_name exists but JWT is
  // missing or expired, silently re-register to get a fresh token.
  useEffect(() => {
    if (!isGuestMode || !guestName) return;
    const existingToken = localStorage.getItem('access_token');
    if (existingToken) return; // token still present, no refresh needed

    (async () => {
      try {
        logger.log('[GUEST] Token missing — auto-refreshing with stored name:', guestName);
        const deviceId = localStorage.getItem('device_id') || guestUserId;
        const res = await authApi.guestRegister({
          guest_name: guestName,
          device_id: deviceId,
        });
        const { user, token: newToken } = res.data;
        localStorage.setItem('access_token', newToken);
        localStorage.setItem('guest_user_id', user.id);
        localStorage.setItem('social_user_id', user.id);
        logger.log('[GUEST] Token refreshed successfully');
      } catch {
        logger.log('[GUEST] Auto-refresh failed — will show login modal on next action');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open login modal on /local route if not authenticated
  useEffect(() => {
    if (isLocalRoute && !isAuthenticated) {
      setIsModalOpen(true);
    }
  }, [isLocalRoute]);

  // Keep refs in sync for unmount cleanup (avoids stale closure)
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { currentAgentRef.current = currentAgent; }, [currentAgent]);

  // Backend health check on mount — fast poll (3s) until healthy, then slow (30s)
  useEffect(() => {
    let intervalId = null;
    let isHealthy = false;
    const checkHealth = async () => {
      try {
        const data = await chatApi.health();
        const status = data.local?.available ? 'healthy' : 'degraded';
        setBackendHealth(status);
        // Once healthy, switch to slow polling
        if (!isHealthy && (status === 'healthy' || status === 'degraded')) {
          isHealthy = true;
          clearInterval(intervalId);
          intervalId = setInterval(checkHealth, 30000);
        }
      } catch {
        setBackendHealth('offline');
      }
    };
    checkHealth();
    // Fast poll every 3s during cold boot until backend responds
    intervalId = setInterval(checkHealth, 3000);
    return () => clearInterval(intervalId);
  }, []);

  // ── Capability announcements — tell user when models come online ──
  // ── System notifications (toasts, not chat messages) ──
  // All model status, capability announcements, and system alerts go here.
  // Auto-dismiss after 5s. Queued so multiple don't overlap.
  const [notifications, setNotifications] = useState([]);
  const notifIdRef = useRef(0);
  const pushNotification = useCallback(({ type = 'info', message, detail, duration = 5000 }) => {
    const id = ++notifIdRef.current;
    setNotifications(prev => [...prev.slice(-2), { id, type, message, detail }]); // keep max 3
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), duration);
  }, []);

  const announcedCapsRef = useRef(new Set());
  useEffect(() => {
    const startTime = Date.now();
    const CAPABILITY_LABELS = {
      stt: 'I can hear you now',
      tts: 'I can speak now',
      llm: 'Your Nunba is fully awake',
      audio_gen: 'I can compose music for you',
      video_gen: 'I can create videos for you',
    };
    let pollId = null;
    const poll = async () => {
      if (Date.now() - startTime > 60000) { clearInterval(pollId); return; }
      try {
        const r = await fetch('/api/ai/bootstrap/status');
        if (!r.ok) return;
        const data = await r.json();
        if (!data.steps) return;
        for (const [type, step] of Object.entries(data.steps)) {
          if (step.status === 'ready' && !announcedCapsRef.current.has(type)) {
            announcedCapsRef.current.add(type);
            const label = CAPABILITY_LABELS[type];
            if (label) {
              pushNotification({ type: 'success', message: label });
            }
          }
        }
        if (data.phase === 'done') clearInterval(pollId);
      } catch { /* ignore */ }
    };
    pollId = setInterval(poll, 3000);
    // Initial check after 4s (give bootstrap time to start)
    setTimeout(poll, 4000);
    return () => clearInterval(pollId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Retry agent fetch when backend transitions to healthy/degraded after a failed cold-boot attempt
  useEffect(() => {
    if (
      (backendHealth === 'healthy' || backendHealth === 'degraded') &&
      allAgents.length === 0 &&
      agentFetchAttempts > 0
    ) {
      logger.log('Backend now reachable — retrying agent fetch (cold-boot recovery)');
      setAgentsLoading(true);
      setAgentRetryTrigger((prev) => prev + 1);
    }
  }, [backendHealth]); // eslint-disable-line react-hooks/exhaustive-deps

  const [isImageUploading, setIsImageUploading] = useState(false);
  const [decryptedUserId, setDecryptedUserId] = useState(null);
  const [decryptedPhone, setDecryptedPhone] = useState(null);
  const [decryptedEmail, setDecryptedEmail] = useState(null);
  const [isGuestMode, setIsGuestMode] = useState(
    () => localStorage.getItem('guest_mode') === 'true'
  );
  const [guestName, setGuestName] = useState(
    () => localStorage.getItem('guest_name') || ''
  );
  const [guestUserId] = useState(
    () => localStorage.getItem('guest_user_id') || ''
  );
  const [guestNameConflict, setGuestNameConflict] = useState(null);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState('');
  const token = localStorage.getItem('access_token');
  const refresh_token = localStorage.getItem('refresh_token');
  const isAuthenticated = (decryptedUserId && token) || isGuestMode;
  const effectiveUserId = isGuestMode ? guestUserId : decryptedUserId;
  const [uploadedPdf, setUploadedPdf] = useState(null);
  const [pdfurl, setPdfurl] = useState(null);
  const [worker, setWorker] = useState(null);
  // Media mode: 'audio' (default — no idle video, plays server-pushed media),
  //             'video' (full video + idle filler), 'text' (no media at all)
  const [mediaMode, setMediaMode] = useState(() => localStorage.getItem('nunba_media_mode') || 'audio');
  const isTextMode = mediaMode === 'text';
  const setIsTextMode = (val) => setMediaMode(val ? 'text' : 'video');
  const [isTrialExpired, setIsTrialExpired] = useState(false);
  const [currentInteractionType, setCurrentInteractionType] = useState('text');
  const [credits, setCredits] = useState(0);
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const [progress, setProgress] = useState(0);
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  const [scale, setScale] = useState(0.4);
  const containerRef = useRef(null);
  const [isMediaEnded, setIsMediaEnded] = useState(false);
  const [showCreateAgentForm, setShowCreateAgentForm] = useState(false);
  const [authFromUrl, setAuthFromUrl] = useState(() => {
    return localStorage.getItem('auth_source') === 'url';
  });
  const [requestIdFromCrossbar, setRequestIdFromCrossbar] = useState(null);
  const [idleVideoUrl, setIdleVideoUrl] = useState(null);
  const [isPlayingResponse, setIsPlayingResponse] = useState(false);

  const [waitingText, setWaitingText] = useState(null);
  const isSmallScreen = screenWidth < 768;
  const [companionStatus, setCompanionStatus] = useState(() => {
    const stored = localStorage.getItem('companionAppInstalled');
    return {
      isInstalled: stored === 'true',
      isRunning: false,
      showUI: false,
      lastChecked: null,
    };
  });
  const [animatingMessageIndex, setAnimatingMessageIndex] = useState(null);

  // Autonomous agent creation — auto-continuation loop trigger
  const [autoContinueFlag, setAutoContinueFlag] = useState(0);
  const autoContinueAbortRef = useRef(false);

  const [showNotification, setShowNotification] = useState(false);

  // ── TTS (Text-to-Speech) state and hook ──
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    const stored = localStorage.getItem('tts_enabled');
    return stored !== 'false'; // Default to enabled unless explicitly disabled
  });
  const [ttsVoice, setTtsVoice] = useState(() => {
    return localStorage.getItem('tts_voice') || 'en_US-amy-medium';
  });
  const [ttsSpeed, setTtsSpeed] = useState(() => {
    const stored = localStorage.getItem('tts_speed');
    return stored ? parseFloat(stored) : 1.0;
  });

  // Initialize TTS hook
  const tts = useTTS({
    voiceId: ttsVoice,
    speed: ttsSpeed,
    onError: (error) => console.error('TTS Error:', error),
  });

  // Persist media mode to localStorage
  useEffect(() => {
    localStorage.setItem('nunba_media_mode', mediaMode);
  }, [mediaMode]);

  // Persist TTS settings to localStorage
  useEffect(() => {
    localStorage.setItem('tts_enabled', ttsEnabled.toString());
    localStorage.setItem('tts_voice', ttsVoice);
    localStorage.setItem('tts_speed', ttsSpeed.toString());
  }, [ttsEnabled, ttsVoice, ttsSpeed]);

  // ── Autonomous agent creation auto-continuation loop ──
  useEffect(() => {
    const MAX_AUTO_CONTINUE = 30;
    if (autoContinueFlag === 0) return;
    if (autoContinueFlag > MAX_AUTO_CONTINUE) {
      setMessages((prev) => [...prev, {
        type: 'system',
        content: 'Autonomous creation reached maximum iterations. Please continue manually or restart.',
      }]);
      setCurrentAgent((prev) => ({ ...prev, autonomous_creation: false }));
      return;
    }
    if (!currentAgent?.autonomous_creation) return;
    if (currentAgent?.agent_status === 'completed' || !currentAgent?.agent_status) return;

    autoContinueAbortRef.current = false;

    const timer = setTimeout(async () => {
      if (autoContinueAbortRef.current) return;
      try {
        // Show phase indicator
        const phaseLabel =
          currentAgent.agent_status === 'Creation Mode' ? 'Gathering agent details...' :
          currentAgent.agent_status === 'Review Mode' ? 'Reviewing agent workflows...' :
          currentAgent.agent_status === 'Evaluation Mode' ? 'Evaluating agent...' :
          'Processing...';
        setMessages((prev) => [...prev, { type: 'system', content: phaseLabel }]);

        const contResult = await chatApi.chat({
          text: 'Yes, proceed with the next step',
          user_id: effectiveUserId,
          agent_id: currentAgent?.id || 'local_assistant',
          agent_type: 'local',
          conversation_id: conversationId,
          prompt_id: currentAgent?.prompt_id,
          create_agent: true,
          autonomous_creation: true,
        });
        if (autoContinueAbortRef.current) return;

        const contData = contResult || {};
        const contText = contData.text || contData.response;

        if (contText) {
          setMessages((prev) => [...prev, { type: 'assistant', content: contText }]);
          setShouldScroll(true);
        }

        if (contData.agent_status) {
          setCurrentAgent((prev) => ({ ...prev, agent_status: contData.agent_status }));
          if (contData.agent_status === 'completed') {
            // Agent done — present for reuse, then auto-execute if fully autonomous
            const wasAutonomous = currentAgent?.autonomous_creation;
            const originalTask = currentAgent?.original_task;
            setCurrentAgent((prev) => ({
              ...prev,
              create_agent: false,
              agent_status: 'Reuse Mode',
              available: true,
              name: prev.name || 'Created Agent',
              // Keep autonomous_creation & original_task for auto-execute
            }));
            setAllAgents((prev) => {
              const exists = prev.some((a) => a.prompt_id === currentAgent.prompt_id);
              if (!exists) return [...prev, { ...currentAgent, create_agent: false, agent_status: null, available: true, name: currentAgent.name || 'Created Agent' }];
              return prev;
            });
            setMessages((prev) => [...prev, { type: 'system', content: 'Agent created successfully! You can now chat with your new agent.' }]);

            // If fully autonomous, auto-execute the original task with the new agent
            if (wasAutonomous && originalTask) {
              setMessages((prev) => [...prev, { type: 'system', content: 'Auto-executing your original request with the new agent...' }]);
              // Trigger one more continuation to run the agent with the original task
              setTimeout(async () => {
                try {
                  const execResult = await chatApi.chat({
                    text: originalTask,
                    user_id: effectiveUserId,
                    agent_id: currentAgent?.id || 'local_assistant',
                    agent_type: 'local',
                    conversation_id: conversationId,
                    prompt_id: currentAgent?.prompt_id,
                    create_agent: false,
                    autonomous_creation: false,
                  });
                  const execData = execResult || {};
                  const execText = execData.text || execData.response;
                  if (execText) {
                    setMessages((prev) => [...prev, { type: 'assistant', content: execText }]);
                    setShouldScroll(true);
                  }
                  // Clean up autonomous state
                  setCurrentAgent((prev) => ({
                    ...prev,
                    autonomous_creation: false,
                    original_task: null,
                    agent_status: 'Reuse Mode',
                  }));
                } catch (execErr) {
                  console.error('Auto-execute failed:', execErr);
                  setCurrentAgent((prev) => ({ ...prev, autonomous_creation: false, original_task: null }));
                }
              }, 1000);
            } else {
              setCurrentAgent((prev) => ({ ...prev, autonomous_creation: false, agent_status: null }));
            }
          } else {
            // Not complete yet — trigger next iteration
            setAutoContinueFlag((prev) => prev + 1);
          }
        } else {
          // No agent_status in response — might be done or error, stop loop
          setCurrentAgent((prev) => ({ ...prev, autonomous_creation: false }));
        }
      } catch (err) {
        console.error('Autonomous continuation failed:', err);
        setCurrentAgent((prev) => ({ ...prev, autonomous_creation: false }));
        setMessages((prev) => [...prev, { type: 'system', content: 'Autonomous creation interrupted. You can continue manually.' }]);
      }
    }, 1500);

    return () => {
      clearTimeout(timer);
      autoContinueAbortRef.current = true;
    };
  }, [autoContinueFlag]);

  // ── Message queue: auto-send next queued message when loading finishes ──
  useEffect(() => {
    if (!loading && messageQueue.length > 0) {
      const [next, ...rest] = messageQueue;
      setMessageQueue(rest);
      // Directly set inputMessage and call handleSend via ref on next tick
      setInputMessage(next.text);
      setTimeout(() => {
        if (handleSendRef.current) handleSendRef.current();
      }, 50);
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Safety: flush stuck queue items after 10s if loading is still true ──
  useEffect(() => {
    if (messageQueue.length === 0 || !loading) return;
    const timer = setTimeout(() => {
      // After 10s, if still loading and queue has items, force-send the next one
      setMessageQueue((prev) => {
        if (prev.length === 0) return prev;
        const [next, ...rest] = prev;
        setInputMessage(next.text);
        setTimeout(() => {
          if (handleSendRef.current) handleSendRef.current();
        }, 50);
        return rest;
      });
    }, 10000);
    return () => clearTimeout(timer);
  }, [messageQueue.length, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const isTextModeRef = useRef(isTextMode);
  const waitingTextRef = useRef(waitingText);
  const thinkingStartTimeRef = useRef(thinkingStartTime);
  const currentThinkingIdRef = useRef(currentThinkingId);

  useEffect(() => {
    isTextModeRef.current = isTextMode;
    waitingTextRef.current = waitingText;
    thinkingStartTimeRef.current = thinkingStartTime;
    currentThinkingIdRef.current = currentThinkingId;
  }, [isTextMode, waitingText, thinkingStartTime, currentThinkingId]);

  logger.log(companionStatus, showNotification, 'status of comp');

  useEffect(() => {
    if (agentName) {
      let matchedAgent = allAgents.find((agent) => agent.name === agentName);

      if (!matchedAgent) {
        matchedAgent = items.find((item) => item.name === agentName);
      }

      if (matchedAgent) {
        if (
          !currentAgent ||
          currentAgent.prompt_id !== matchedAgent.prompt_id
        ) {
          const _switchFromId = currentAgent?.prompt_id || currentAgent?.id;
          if (_switchFromId && messages.length > 0) {
            logger.log(
              `💾 Saving ${messages.length} messages for agent: ${currentAgent.name}`
            );
            saveMessagesToStorage(messages, _switchFromId);
          }

          logger.log(
            `🧹 Clearing messages for agent switch to: ${matchedAgent.name}`
          );
          setMessages([]);

          setCurrentAgent(matchedAgent);
          const _switchToId = matchedAgent.prompt_id || matchedAgent.id;
          if (_switchToId) {
            localStorage.setItem('active_agent_id', String(_switchToId));
          }

          setTimeout(() => {
            const savedMessages = loadMessagesFromStorage(
              matchedAgent.prompt_id || matchedAgent.id
            );
            logger.log(
              `📥 Loading ${savedMessages.length} messages for agent: ${matchedAgent.name}`
            );
            setMessages(savedMessages);
          }, 100);

          if (matchedAgent.fillers) {
            const idleFiller = matchedAgent.fillers.find(
              (filler) => filler.type === 'idle'
            );
            if (idleFiller?.video_link) {
              setIdleVideoUrl(idleFiller.video_link);
              setVideoUrl(idleFiller.video_link);
            }
          }
        }
      }
    }
  }, [allAgents, agentName]);

  const handleCreateAgentSubmit = async (agentDatafromApi) => {
    try {
      logger.log('1. Agent data received:', agentDatafromApi);

      if (currentAgent?.prompt_id && messages.length > 0) {
        logger.log(
          `💾 Saving ${messages.length} messages before creating new agent`
        );
        saveMessagesToStorage(messages, currentAgent.prompt_id || currentAgent.id);
      }

      logger.log(
        `🧹 Clearing messages for new agent: ${agentDatafromApi.name}`
      );
      setMessages([]);

      setAllAgents((prevAgents) => {
        const newAgents = [...prevAgents, agentDatafromApi];
        logger.log('Updated allAgents:', newAgents.length);
        return newAgents;
      });

      setCurrentAgent(agentDatafromApi);

      if (agentDatafromApi.fillers) {
        const idleFiller = agentDatafromApi.fillers.find(
          (filler) => filler.type === 'idle'
        );
        if (idleFiller?.video_link) {
          setIdleVideoUrl(idleFiller.video_link);
          setVideoUrl(idleFiller.video_link);
        }
      }

      setShowCreateAgentForm(false);
      const encodedName = encodeURIComponent(agentDatafromApi.name);
      navigate(`/agents/${encodedName}`);

      logger.log(
        `✨ New agent created with fresh chat: ${agentDatafromApi.name}`
      );
    } catch (error) {
      console.error('Error creating agent:', error);
    }
  };

  useEffect(() => {
    return () => {
      // Save messages when component unmounts (using refs to avoid stale closure)
      const _unmountId = currentAgentRef.current?.prompt_id || currentAgentRef.current?.id;
      if (_unmountId && messagesRef.current.length > 0) {
        logger.log(
          `💾 Component unmount: Saving ${messagesRef.current.length} messages for ${currentAgentRef.current.name}`
        );
        saveMessagesToStorage(messagesRef.current, _unmountId);
      }
    };
  }, []);

  // Load avatar voice clone when agent has a teacher_avatar_id
  useEffect(() => {
    const avatarId = currentAgent?.teacher_avatar_id || agentData?.teacher_avatar_id;
    if (avatarId && ttsEnabled) {
      tts.loadAvatarVoice(avatarId).then((ok) => {
        if (ok) logger.log(`Avatar voice loaded for avatar ${avatarId}`);
      });
    }
  }, [currentAgent?.teacher_avatar_id, agentData?.teacher_avatar_id, ttsEnabled]);

  useEffect(() => {
    if (agentData) {
      setCurrentAgent(agentData);
      if (agentData.fillers) {
        const idleFiller = agentData.fillers.find(
          (filler) => filler.type === 'idle'
        );
        if (idleFiller?.video_link) {
          logger.log(idleFiller.video_link, 'idleFiller.video_link');
          setIdleVideoUrl(idleFiller.video_link);
          // Only auto-load idle video in full video mode (not audio-only or text)
          if (mediaMode === 'video') {
            setVideoUrl(idleFiller.video_link);
          }
        }
      }
    }

    const fetchPrompts = async () => {
      try {
        let allAgents = [];

        // ── Fetch from LOCAL backend first (offline-first) via existing chatApi ──
        try {
          const localResult = await chatApi.getPrompts(effectiveUserId);
          // Backend returns { prompts: [...], success: true, ... }
          const responseData = localResult || {};
          const promptsArray = responseData.prompts || responseData;
          // Ensure we have an array before calling .map
          const localAgents = Array.isArray(promptsArray)
            ? promptsArray.map((a) => ({...a, _isLocal: true}))
            : [];
          logger.log('Fetched local agents via chatApi:', localAgents.length);
          allAgents = localAgents;
        } catch (localError) {
          console.warn('Local backend not available:', localError.message);
        }

        // Local /prompts already merges HARTOS + cloud agents — no separate cloud call needed

        // Multi-device agent sync (authenticated users only)
        if (decryptedUserId && !isGuestMode) {
          try {
            const syncRes = await chatApi.getAgentSync();
            const syncAgents = syncRes?.agents || [];
            syncAgents.forEach((syncAgent) => {
              const exists = allAgents.some(
                (a) => String(a.prompt_id) === String(syncAgent.prompt_id)
              );
              if (!exists) {
                allAgents.push({ ...syncAgent, _isSynced: true });
              } else {
                // Merge: prefer newer updated_at
                const idx = allAgents.findIndex(
                  (a) => String(a.prompt_id) === String(syncAgent.prompt_id)
                );
                if (idx >= 0 && syncAgent.updated_at > (allAgents[idx].updated_at || '')) {
                  allAgents[idx] = { ...allAgents[idx], ...syncAgent, _isSynced: true };
                }
              }
            });
            logger.log('Synced agents from server:', syncAgents.length);
          } catch (syncErr) {
            console.warn('Agent sync not available:', syncErr.message);
          }
        }

        logger.log('Total merged agents:', allAgents);
        setAllAgents(allAgents);

        // Restore last active agent from localStorage
        const savedAgentId = localStorage.getItem('active_agent_id');
        if (savedAgentId && allAgents.length > 0) {
          const savedAgent = allAgents.find(
            (a) => String(a.prompt_id) === String(savedAgentId) ||
                   String(a.id) === String(savedAgentId)
          );
          if (savedAgent) {
            logger.log('Restoring active agent:', savedAgent.name);
            setCurrentAgent(savedAgent);
            const savedMessages = loadMessagesFromStorage(savedAgent.prompt_id || savedAgent.id);
            if (savedMessages.length > 0) setMessages(savedMessages);
          }
        }

        // If still no current agent, prefer the built-in default (local_assistant).
        // Never auto-select a user-created agent — those have full agentic prompts
        // that would make a simple "hi" trigger an autonomous agent workflow.
        if (!savedAgentId || !allAgents.find(a => String(a.prompt_id) === String(savedAgentId) || String(a.id) === String(savedAgentId))) {
          if (allAgents.length > 0) {
            const defaultAgent =
              allAgents.find(a => a.id === 'local_assistant') ||
              allAgents.find(a => a.is_default === true) ||
              allAgents.find(a => a.type === 'local' && !a.create_agent) ||
              allAgents[0];
            setCurrentAgent(defaultAgent);
            const _defaultId = defaultAgent.prompt_id || defaultAgent.id;
            if (_defaultId) {
              localStorage.setItem('active_agent_id', String(_defaultId));
            }
          }
        }
      } catch (error) {
        console.error('Error fetching agents:', error);
        setAllAgents([]);
      } finally {
        setAgentsLoading(false);
        setAgentFetchAttempts((prev) => prev + 1);
        fireOnReady();
      }
    };
    fetchPrompts();
  }, [agentData, decryptedUserId, agentRetryTrigger]);

  // Post-HART welcome: greet user by HART name in the chat after first load
  const hartGreetedRef = useRef(false);
  useEffect(() => {
    if (hartGreetedRef.current) return;
    const hartName = localStorage.getItem('hart_name');
    const hartSealed = localStorage.getItem('hart_sealed');
    const hartGreeted = sessionStorage.getItem('hart_greeted');
    if (hartSealed && hartName && !hartGreeted && messages.length === 0) {
      hartGreetedRef.current = true;
      sessionStorage.setItem('hart_greeted', 'true');
      const emoji = localStorage.getItem('hart_emoji') || '';
      setMessages([{
        type: 'assistant',
        content: `${emoji} Welcome, @${hartName}! I'm your personal agent. Ask me anything or tell me what you'd like to build.`,
      }]);
    }
  }, [messages.length]);

  // Proactive LLM status check — diagnose hardware + software state and act accordingly
  // Handles: GPU binary w/o GPU, CPU binary w/ GPU, GPU occupied, model too big,
  // mmproj missing, nothing available, etc. Server-side compute determines model choice.
  const llmCheckedRef = useRef(false);
  useEffect(() => {
    if (llmCheckedRef.current) return;
    llmCheckedRef.current = true;
    (async () => {
      try {
        const res = await fetch('/api/llm/status');
        if (!res.ok) return;
        const data = await res.json();
        if (!data.setup_needed || !data.recommended) return;

        const rec = data.recommended;
        const diag = data.diagnosis || {};
        const action = diag.action || 'download_all';
        const sizeLabel = rec.size_mb >= 1024
          ? `${(rec.size_mb / 1024).toFixed(1)}GB`
          : `${rec.size_mb}MB`;

        // Actions that can proceed automatically (model/binary available or fixable)
        const autoActions = ['start', 'start_cpu', 'upgrade_binary', 'download_mmproj', 'downgrade_model'];
        const needsDownload = ['download_model', 'install_binary', 'download_all'];

        if (autoActions.includes(action)) {
          // Auto-start: server-side diagnose() already computed the right model + mode
          const statusMsgs = {
            start: `Starting ${rec.model_name} (${rec.gpu_mode})...`,
            start_cpu: diag.gpu_occupied
              ? `GPU is occupied by another model (${diag.gpu_free_gb?.toFixed(1)}/${diag.gpu_total_gb?.toFixed(1)}GB free). Starting ${rec.model_name} in CPU mode...`
              : `GPU build not available. Starting ${rec.model_name} in CPU mode...`,
            upgrade_binary: `GPU detected (${diag.gpu_name || 'CUDA'}) but llama.cpp is CPU-only. Upgrading to CUDA build and starting ${rec.model_name}...`,
            download_mmproj: `${rec.model_name} found but vision projector is missing. Downloading mmproj and starting...`,
            downgrade_model: `${rec.model_name} is too big for available compute (${diag.compute_budget_mb}MB budget). Selecting a smaller model that fits...`,
          };
          pushNotification({
            type: 'info',
            message: statusMsgs[action] || 'Setting up...',
          });
          try {
            const setupRes = await fetch('/api/llm/auto-setup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            const setupData = await setupRes.json();
            if (setupData.success) {
              pushNotification({
                type: 'success',
                message: 'Your Nunba is fully awake',
                detail: setupData.model_name,
              });
            } else {
              pushNotification({
                type: 'warning',
                message: setupData.message || 'Setup needs attention',
              });
              // Fall through to show setup card
              setMessages((prev) => [...prev, {
                type: 'llm_setup_card',
                content: setupData.message || 'Auto-start failed. Try again or configure manually.',
                setupCard: {
                  model_name: rec.model_name,
                  model_index: rec.model_index,
                  size_mb: rec.size_mb,
                  gpu_mode: rec.gpu_mode,
                  description: rec.description,
                },
              }]);
            }
          } catch {
            setMessages((prev) => [...prev, {
              type: 'system',
              content: `Failed to auto-start. The server may not be ready yet.`,
            }]);
          }
        } else if (needsDownload.includes(action)) {
          // Needs download — show setup card for user consent (don't download without asking)
          const cardMsgs = {
            download_model: `No suitable model found on disk. I recommend ${rec.model_name} (${rec.gpu_mode}, ~${sizeLabel}).`,
            install_binary: `Model found but llama.cpp server is not installed. Click "Auto Setup" to install it and start.`,
            download_all: `No local AI setup found. I recommend ${rec.model_name} (${rec.gpu_mode}, ~${sizeLabel}) for offline chat and agents.`,
          };
          setMessages((prev) => [...prev, {
            type: 'llm_setup_card',
            content: cardMsgs[action] || diag.message,
            setupCard: {
              model_name: rec.model_name,
              model_index: rec.model_index,
              size_mb: rec.size_mb,
              gpu_mode: rec.gpu_mode,
              description: rec.description,
            },
          }]);
        }
      } catch {
        // Backend not ready yet — will show card when user sends first message
      }
    })();
  }, []);

  // Retry fetchPrompts when backend is offline and no agents loaded
  useEffect(() => {
    if (agentsLoading || allAgents.length > 0 || agentFetchAttempts >= 5) return;
    const retryDelay = 3000 * Math.min(agentFetchAttempts + 1, 3);
    const retryTimer = setTimeout(() => {
      setAgentRetryTrigger((prev) => prev + 1);
    }, retryDelay);
    return () => clearTimeout(retryTimer);
  }, [agentsLoading, allAgents.length, agentFetchAttempts]);

  useEffect(() => {}, [audioUrl, videoUrl]);

  useEffect(() => {
    const getUrlParams = () => {
      const searchParams = new URLSearchParams(window.location.search);
      const params = {
        agentName: searchParams.get('agent_name')?.trim(),
        // SECURITY: token param removed — tokens must come from auth flow, not URL
        token: null,
        userId: searchParams.get('userid')?.trim(),
        email: searchParams.get('email')?.trim(),
        isTextMode: searchParams.get('text_mode')?.trim() === 'true' || false,
      };
      logger.log('[Debug]: Extracted URL params:', params);
      return params;
    };

    const encryptValue = (value) => {
      try {
        if (!value || !SECRET_KEY) {
          console.warn('[Encryption Warning]: Missing value or SECRET_KEY');
          return null;
        }
        const encrypted = encrypt(value);
        logger.log('[Encryption]: Value encrypted successfully');
        return encrypted;
      } catch (error) {
        console.error('[Encryption Error]: Failed to encrypt value', error);
        return null;
      }
    };

    const storeEncryptedItem = (key, value) => {
      try {
        const encrypted = encryptValue(value);
        if (encrypted) {
          localStorage.setItem(key, encrypted);
          logger.log(`[LocalStorage]: Set ${key} =`, encrypted);
          return true;
        } else {
          console.warn(
            `[LocalStorage Warning]: Encrypted value for ${key} is null`
          );
        }
      } catch (error) {
        console.error(`[LocalStorage Error]: Failed to store ${key}`, error);
      }
      return false;
    };

    const params = getUrlParams();
    let paramsFound = false;

    // SECURITY: URL-based token injection removed (S8 vulnerability).
    // Tokens must be obtained through the proper auth flow (login/register),
    // not passed via URL parameters which can be leaked in logs and referrer headers.
    if (params.token) {
      console.warn('[Auth]: URL token parameter ignored for security reasons');
    }

    if (params.userId) {
      logger.log('[UserID]: Found userId in URL:', params.userId);
      if (storeEncryptedItem('user_id', params.userId)) {
        paramsFound = true;
      }
    } else {
      console.warn('[UserID Warning]: No userId found in URL');
    }

    if (params.email) {
      logger.log('[Email]: Found email in URL:', params.email);
      if (storeEncryptedItem('email_address', params.email)) {
        paramsFound = true;
      }
    } else {
      console.warn('[Email Warning]: No email found in URL');
    }
    if (params.isTextMode) {
      setIsTextMode(true);
      logger.log('[Text Mode]: Text mode enabled from URL');
    }
    if (paramsFound) {
      setDecryptedUserId(params.userId || '');
      setDecryptedEmail(params.email || '');
      localStorage.setItem('auth_source', 'url');
      setAuthFromUrl(true);

      logger.log('[Auth Source]: Authentication data set from URL parameters');
    } else {
      logger.log('[Init]: No URL parameters found for authentication.');
    }
  }, []);

  useEffect(() => {
    const adjustScale = () => {
      if (containerRef.current) {
        const containerHeight = containerRef.current.clientHeight;
        const targetHeight = containerHeight * 0.95;
        setScale(targetHeight / 842);
      }
    };

    adjustScale();
    window.addEventListener('resize', adjustScale);
    return () => window.removeEventListener('resize', adjustScale);
  }, [scale]);
  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getChatStorageKey = (promptId) => {
    return `chat_messages_${promptId}`;
  };

  const saveMessagesToStorage = (messages, promptId) => {
    if (!promptId) return;

    try {
      const storageKey = getChatStorageKey(promptId);
      const chatData = {
        agentId: promptId,
        agentName: currentAgent?.name,
        lastUpdated: new Date().toISOString(),
        messageCount: messages.length,
        messages: messages,
      };
      localStorage.setItem(storageKey, JSON.stringify(chatData));
      logger.log(`Saved ${messages.length} messages for agent ${promptId}`);
    } catch (error) {
      console.error('Failed to save messages to localStorage:', error);
    }

    // Also persist to server DB (survives app reinstall/WebView reset)
    try {
      const uid = effectiveUserId || localStorage.getItem('guest_user_id') || 'guest';
      const last = messages[messages.length - 1];
      const prev = messages.length >= 2 ? messages[messages.length - 2] : null;
      if (last) {
        fetch('/conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: uid,
            request: prev?.text || prev?.content || '',
            response: last?.text || last?.content || '',
            topic: `agent_${promptId}`,
          }),
        }).catch(() => {});
      }
    } catch (_) {}
  };

  const loadMessagesFromStorage = (promptId) => {
    if (!promptId) return [];

    // Try localStorage first (fastest)
    try {
      const storageKey = getChatStorageKey(promptId);
      const savedData = localStorage.getItem(storageKey);

      if (savedData) {
        const chatData = JSON.parse(savedData);
        const messages = Array.isArray(chatData)
          ? chatData
          : chatData.messages || [];
        logger.log(
          `Loaded ${messages.length} messages for agent ${promptId}`
        );
        return messages;
      }
    } catch (error) {
      console.error('Failed to load messages from localStorage:', error);
    }

    // Fallback: load from server DB (survives WebView reset / reinstall)
    try {
      const uid = effectiveUserId || localStorage.getItem('guest_user_id') || 'guest';
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `/conversation?user_id=${encodeURIComponent(uid)}&topic=agent_${promptId}`, false);
      xhr.send();
      if (xhr.status === 200) {
        const convs = JSON.parse(xhr.responseText);
        if (Array.isArray(convs) && convs.length > 0) {
          const restored = [];
          convs.forEach((c) => {
            if (c.request) restored.push({ role: 'user', text: c.request });
            if (c.response) restored.push({ role: 'assistant', text: c.response });
          });
          if (restored.length > 0) {
            logger.log(`Restored ${restored.length} messages from server DB for agent ${promptId}`);
            return restored;
          }
        }
      }
    } catch (_) {}

    return [];
  };

  const getVideoWidthforMobile = () => {
    if (screenWidth <= 360) return '70%';
    if (screenWidth <= 450) return '70%';
    if (screenWidth < 500) return '60%';

    if (screenWidth >= 500 && screenWidth <= 650) return '50%';

    if (screenWidth <= 768) return '40%';
    if (screenWidth >= 2001) return 500;
    if (screenWidth >= 1861) return 460;
    if (screenWidth >= 1751) return 440;
    if (screenWidth >= 1651) return 420;
    if (screenWidth >= 1551) return 400;
    if (screenWidth >= 1451) return 380;
    if (screenWidth >= 1351) return 360;
    if (screenWidth >= 1251) return 340;
    if (screenWidth >= 1151) return 320;
    if (screenWidth >= 1051) return 300;
    if (screenWidth >= 951) return 280;
    return 260;
  };

  const changeMediaMode = (newMode) => {
    setMediaMode(newMode);

    if (newMode === 'text') {
      // Text mode: stop all media
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setVideoUrl(null);
      setAudioUrl(null);
      setIsPlayingResponse(false);
    } else if (newMode === 'audio') {
      // Audio-only: stop idle video but keep server-pushed audio/video capability
      if (videoRef.current && videoUrl === idleVideoUrl) {
        videoRef.current.pause();
      }
      setVideoUrl(null); // clear idle video
    } else if (newMode === 'video') {
      // Full video mode: restore idle video
      if (idleVideoUrl) {
        setVideoUrl(idleVideoUrl);
      }
    }
  };

  // Legacy toggle for mobile (cycles: audio → video → text → audio)
  const toggleTextMode = () => {
    const cycle = { audio: 'video', video: 'text', text: 'audio' };
    changeMediaMode(cycle[mediaMode] || 'audio');
  };

  const handleCreateAgentClick = () => {
    if (!isAuthenticated) {
      setIsModalOpen(true);
      return;
    }

    const useLocal = isGuestMode || !navigator.onLine;
    if (useLocal) {
      // Local mode: Start conversational agent creation via autogen
      const newPromptId = Date.now();
      const newAgent = {
        id: String(newPromptId),
        prompt_id: newPromptId,
        name: 'New Agent',
        type: 'local',
        _isLocal: true,
        create_agent: true,
        agent_status: 'Creation Mode',
      };

      if (currentAgent?.prompt_id && messages.length > 0) {
        saveMessagesToStorage(messages, currentAgent.prompt_id || currentAgent.id);
      }
      setMessages([
        {
          type: 'assistant',
          content:
            "Let's create a new agent! Tell me about the agent you want to build \u2014 its name, purpose, and what it should be able to do.",
        },
      ]);
      setCurrentAgent(newAgent);
      if (newPromptId && /^\d+$/.test(String(newPromptId))) {
        localStorage.setItem('active_agent_id', String(newPromptId));
      }
      setShowCreateAgentForm(false);
      return;
    }

    // Cloud mode: Show form (existing behavior)
    setShowCreateAgentForm(true);
  };
  const handleAgentSelect = (agent) => {
    setShowAgentsOverlay(false);
    logger.log('hello');

    if (agent && agent.prompt_id !== currentAgent?.prompt_id) {
      if (currentAgent?.prompt_id && messages.length > 0) {
        logger.log(
          `💾 Saving ${messages.length} messages before selecting ${agent.name}`
        );
        saveMessagesToStorage(messages, currentAgent.prompt_id || currentAgent.id);
      }

      logger.log(`🧹 Clearing messages for agent selection: ${agent.name}`);
      setMessages([]);

      setTimeout(() => {
        handleButtonClick(agent);
      }, 50);
    }
  };

  const safeParsePayload = (data) => {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data;
    }

    if (Array.isArray(data)) {
      return data[0] && typeof data[0] === 'object' ? data[0] : data;
    }

    if (typeof data !== 'string') {
      return data || {};
    }

    try {
      return JSON.parse(data);
    } catch (err) { console.error('JSON parse failed, trying fallback:', err); }

    try {
      let jsonString = data;

      const protectedStrings = [];
      jsonString = jsonString.replace(/(\w)'(\w)/g, (match, p1, p2) => {
        const placeholder = `__APOSTROPHE_${protectedStrings.length}__`;
        protectedStrings.push({placeholder, p1, p2});
        return placeholder;
      });

      jsonString = jsonString.replace(/\bNone\b/g, 'null');
      jsonString = jsonString.replace(/\bTrue\b/g, 'true');
      jsonString = jsonString.replace(/\bFalse\b/g, 'false');
      jsonString = jsonString.replace(/'/g, '"');

      protectedStrings.forEach(({placeholder, p1, p2}) => {
        jsonString = jsonString.replace(placeholder, `${p1}'${p2}`);
      });

      return JSON.parse(jsonString);
    } catch (err) {
      console.error('❌ Failed to parse payload:', err.message);
      return {error: 'parse_failed', raw: data};
    }
  };

  const handleDataReceived = useCallback((data) => {
    logger.log('🚦 handleDataReceived START');
    logger.log('📥 Raw data:', data);

    const getCurrentState = () => ({
      isTextMode: isTextModeRef.current,
      waitingText: waitingTextRef.current,
      thinkingStartTime: thinkingStartTimeRef.current,
      currentThinkingId: currentThinkingIdRef.current,
    });

    try {
      let rawPayload = data;

      if (data && typeof data === 'object' && data.data !== undefined) {
        rawPayload = data.data;
      }

      const parsed = safeParsePayload(rawPayload);

      if (parsed?.error === 'parse_failed') {
        console.error('Payload parsing failed, aborting message handling');
        setLoading(false);
        setIsRequestInFlight(false);
        return;
      }

      const {
        isTextMode,
        waitingText,
        thinkingStartTime,
        currentThinkingId,
      } = getCurrentState();

      if (Number(parsed.priority) === 48 && parsed.action === 'ChannelMessage') {
        logger.log('CHANNEL MESSAGE:', parsed.channel, parsed.sender);
        setMessages((prev) => [...prev, {
          type: 'channel_notification',
          channel: parsed.channel,
          sender: parsed.sender,
          text: parsed.text?.[0] || '',
          response: parsed.response,
          timestamp: new Date(),
        }]);
        return;
      }

      if (Number(parsed.priority) === 50 && parsed.action === 'WorkflowFlowchart') {
        logger.log('WORKFLOW FLOWCHART RECEIVED');
        setMessages((prev) => [...prev, {
          type: 'workflow_flowchart',
          recipe: parsed.recipe,
          promptId: parsed.prompt_id,
          timestamp: new Date(),
        }]);
        return;
      }

      if (Number(parsed.priority) === 49 && parsed.action === 'Thinking') {
        const traceRequestId = parsed.request_id || 'unknown';

        // Only show thinking traces that belong to the current user chat request.
        // Daemon/background agent tasks use different request_ids — drop them
        // so they don't leak into the user's conversation UI.
        const currentReqId = requestIdRef.current;
        if (currentReqId && traceRequestId !== 'unknown' && traceRequestId !== currentReqId) {
          logger.log(`Dropping daemon thinking trace (req=${traceRequestId}, current=${currentReqId})`);
          return;
        }

        logger.log('THINKING MODE DETECTED');

        const thinkingText = parsed.text?.[0] || '';
        const requestId = traceRequestId;

        const uniqueThinkingId = `thinking_step_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        if (!thinkingStartTime) {
          setThinkingStartTime(new Date());
        }

        let containerRequestId = null;
        let userMessageIndex = null;

        setMessages((prev) => {
          const lastUserMessageIndex = prev
            .map((msg, index) => ({msg, index}))
            .reverse()
            .find(({msg}) => msg.type === 'user')?.index;

          if (lastUserMessageIndex === undefined) {
            console.warn('No user message found for thinking step');
            return prev;
          }

          containerRequestId = `${requestId}_after_user_${lastUserMessageIndex}`;
          userMessageIndex = lastUserMessageIndex;

          const existingContainerIndex = prev.findIndex(
            (msg, index) =>
              msg.type === 'thinking_container' &&
              msg.containerRequestId === containerRequestId &&
              index > lastUserMessageIndex
          );

          if (existingContainerIndex >= 0) {
            const updated = [...prev];
            const newThinkingStep = {
              id: uniqueThinkingId,
              content: thinkingText,
              timestamp: new Date(),
              lastUpdated: new Date(),
              isExpanded: false,
              isCompleted: false,
              duration: null,
            };

            updated[existingContainerIndex] = {
              ...updated[existingContainerIndex],
              thinkingSteps: [
                ...updated[existingContainerIndex].thinkingSteps,
                newThinkingStep,
              ],
              lastUpdated: new Date(),
            };

            return updated;
          } else {
            const newThinkingContainer = {
              type: 'thinking_container',
              id: `thinking_container_${containerRequestId}`,
              requestId: requestId,
              containerRequestId: containerRequestId,
              userMessageIndex: lastUserMessageIndex,
              timestamp: new Date(),
              lastUpdated: new Date(),
              isMainExpanded: false,
              isCompleted: false,
              totalDuration: null,
              thinkingSteps: [
                {
                  id: uniqueThinkingId,
                  content: thinkingText,
                  timestamp: new Date(),
                  lastUpdated: new Date(),
                  isExpanded: false,
                  isCompleted: false,
                  duration: null,
                },
              ],
            };

            return [...prev, newThinkingContainer];
          }
        });

        setCurrentThinkingId(containerRequestId);
        setLoading(false);
        setIsRequestInFlight(false);
        return;
      }

      const extractedText = parsed.text?.[0] || '';
      const responseVideoUrl = parsed.video_link?.video || '';
      const responseAudioUrl = parsed.video_link?.aud_url || '';

      if (extractedText || responseVideoUrl || responseAudioUrl) {
        const endTime = new Date();
        const duration = thinkingStartTime
          ? (endTime - thinkingStartTime) / 1000
          : 0;

        logger.log('🏁 MAIN RESPONSE ARRIVED');
        logger.log('🔍 Current thinking ID:', currentThinkingId);
        logger.log('🔍 Response request_id:', parsed.request_id);
        logger.log('🔍 Duration calculated:', duration);

        let foundAndCompleted = false;

        setMessages((prev) => {
          logger.log('📋 Looking for thinking containers to complete...');

          const thinkingContainers = prev.filter(
            (msg) => msg.type === 'thinking_container'
          );
          logger.log(
            '🔍 Found thinking containers:',
            thinkingContainers.length
          );

          const updated = prev.map((msg) => {
            if (msg.type === 'thinking_container' && !msg.isCompleted) {
              if (
                currentThinkingId &&
                msg.containerRequestId === currentThinkingId
              ) {
                foundAndCompleted = true;
                return {
                  ...msg,
                  isCompleted: true,
                  totalDuration: duration,
                  completedAt: endTime,
                  thinkingSteps: msg.thinkingSteps.map((step) => ({
                    ...step,
                    isCompleted: true,
                    duration: duration / msg.thinkingSteps.length,
                  })),
                };
              }

              if (
                parsed.request_id &&
                (msg.requestId === parsed.request_id ||
                  msg.containerRequestId?.includes(parsed.request_id))
              ) {
                foundAndCompleted = true;
                return {
                  ...msg,
                  isCompleted: true,
                  totalDuration: duration,
                  completedAt: endTime,
                  thinkingSteps: msg.thinkingSteps.map((step) => ({
                    ...step,
                    isCompleted: true,
                    duration: duration / msg.thinkingSteps.length,
                  })),
                };
              }
            }
            return msg;
          });

          if (!foundAndCompleted && thinkingStartTime) {
            for (let i = updated.length - 1; i >= 0; i--) {
              if (
                updated[i].type === 'thinking_container' &&
                !updated[i].isCompleted
              ) {
                updated[i] = {
                  ...updated[i],
                  isCompleted: true,
                  totalDuration: duration,
                  completedAt: endTime,
                  thinkingSteps: updated[i].thinkingSteps.map((step) => ({
                    ...step,
                    isCompleted: true,
                    duration: duration / updated[i].thinkingSteps.length,
                  })),
                };
                break;
              }
            }
          }

          return updated;
        });

        setCurrentThinkingId(null);
        setThinkingStartTime(null);
      }

      if (isTextMode) {
        if (extractedText) {
          const assistantMessage = {
            type: 'assistant',
            content: extractedText,
            source: parsed.source || 'cloud',
          };
          setMessages((prev) => {
            const newMessages = [...prev, assistantMessage];
            setAnimatingMessageIndex(null);
            setShouldScroll(true);
            return newMessages;
          });
          setLoading(false);
          setIsRequestInFlight(false);
        }

        if (parsed.page_image_url) {
          setUploadedImage(parsed.page_image_url);
        }
        return;
      }

      const hasText = !!extractedText;
      const hasAudio = !!(responseAudioUrl || responseVideoUrl);
      const hasWaitingText = !!waitingText;

      if (hasText && !hasAudio) {
        const assistantMessage = {
          type: 'assistant',
          content: extractedText,
          source: parsed.source || 'cloud',
        };

        setMessages((prev) => {
          const newMessages = [...prev, assistantMessage];
          setAnimatingMessageIndex(1);
          setShouldScroll(true);
          return newMessages;
        });

        // Speak the response using TTS if enabled and no audio was provided
        if (ttsEnabled && tts.isAvailable && extractedText) {
          tts.speak(extractedText);
        }

        setWaitingText(null);
        setLoading(false);
        setIsRequestInFlight(false);
        return;
      }
      if (hasAudio) {
        const textToShow = hasWaitingText
          ? waitingText
          : hasText
          ? extractedText
          : null;

        if (textToShow) {
          const assistantMessage = {
            type: 'assistant',
            content: textToShow,
          };
          setMessages((prev) => {
            const newMessages = [...prev, assistantMessage];
            setAnimatingMessageIndex(newMessages.length - 1);
            setShouldScroll(true);
            return newMessages;
          });
          setWaitingText(null);
        }

        setVideoUrl(responseVideoUrl);
        setAudioUrl(responseAudioUrl);
        setIsPlayingResponse(true);
        setLoading(false);
        setIsRequestInFlight(false);
      }

      if (parsed.page_image_url) {
        setUploadedImage(parsed.page_image_url);
      }
    } catch (err) {
      console.error('Error processing data:', err);
      setLoading(false);
      setIsRequestInFlight(false);
    }
  }, []);

  useEffect(() => {
    logger.log('🎯 currentThinkingId changed:', currentThinkingId);
  }, [currentThinkingId]);

  useEffect(() => {
    logger.log('📝 thinkingMessages1 changed:', messages);
  }, [messages]);

  useEffect(() => {
    const payload = {
      agentname: currentAgent?.name,
      email: isGuestMode ? guestName : decryptedEmail,
      access_token: token,
      user_id: effectiveUserId,
    };
    if (companionStatus.isRunning) {
      const sendPostRequest = async () => {
        try {
          const data = await chatApi.post('/api/storage/set', payload);
          // this is for setting the value in companion app

          logger.log('POST request response:', data);
        } catch (error) {
          console.error('Failed to send POST request:', error);
        }
      };

      sendPostRequest();
    }
  }, [
    companionStatus.isRunning,
    currentAgent?.name,
    decryptedEmail,
    token,
    decryptedUserId,
  ]);

  useEffect(() => {
    let activeWorker = null;
    let isInitializing = false;

    const initializeWorker = () => {
      if (isInitializing) {
        logger.log('⚠️ Worker initialization already in progress');
        return;
      }

      isInitializing = true;

      try {
        if (activeWorker) {
          logger.log('🔄 Terminating existing worker');
          activeWorker.terminate();
          activeWorker = null;
        }

        const crossbarWorker = new Worker(
          new URL('./crossbarWorker.js', import.meta.url),
          {type: 'module'}
        );

        crossbarWorker.onmessage = (e) => {
          const {type, payload} = e.data;

          switch (type) {
            case 'CONNECTION_STATUS':
              setConnectionStatus(payload);
              break;

            case 'PROGRESS_UPDATE':
              setProgress(payload);
              break;

            case 'DATA_RECEIVED':
              handleDataReceived(payload);
              break;

            case 'LOG':
              break;

            case 'ERROR':
              console.error(`❌ Error:`, payload);
              break;

            case 'COMPANION_STATUS_UPDATE':
              const storedInstallationStatus =
                localStorage.getItem('companionAppInstalled') === 'true';

              if (payload.isInstalled && !storedInstallationStatus) {
                localStorage.setItem('companionAppInstalled', 'true');
              }

              setCompanionStatus((prevStatus) => {
                const finalInstallationStatus =
                  storedInstallationStatus || payload.isInstalled;

                const newStatus = {
                  isInstalled: finalInstallationStatus,
                  isRunning: payload.isRunning,
                  showUI: payload.showUI === true,
                  lastChecked: new Date().toISOString(),
                };

                if (payload.showUI && payload.fromActionRequest) {
                  setShowNotification(true);
                  setTimeout(() => {
                    setShowNotification(false);
                  }, 6000);
                }

                return newStatus;
              });
              break;

            case 'UPDATE_LOCAL_STORAGE':
              localStorage.setItem(payload.key, payload.value);
              break;

            case 'GAME_EVENT':
              // Handled by gameRealtimeService (initGameRealtime binds its own listener)
              break;

            case 'SOCIAL_EVENT':
              // Handled by realtimeService (init binds its own listener)
              break;

            case 'COMMUNITY_EVENT':
              // Handled by realtimeService community handler
              break;

            case 'ACTION_ERROR':
              console.error('Action RPC error:', payload);
              break;

            case 'WARNING':
              console.warn('Worker warning:', payload);
              break;

            default:
              break;
          }
        };

        crossbarWorker.onerror = (error) => {
          console.error('❌ Worker error:', error);
          setConnectionStatus('Worker Error');
          isInitializing = false;
        };

        activeWorker = crossbarWorker;
        setWorker(crossbarWorker);
        initGameRealtime(crossbarWorker);
        realtimeService.init(crossbarWorker);

        if (decryptedUserId) {
          logger.log(
            '🚀 Initializing worker with user ID:',
            decryptedUserId,
            requestId
          );
          crossbarWorker.postMessage({
            type: 'INIT',
            payload: {
              wsUri: 'wss://aws_rasa.hertzai.com:8445/wss',
              userId: decryptedUserId,
              maxRetries: 8,
              retryDelay: 5000,
            },
          });
        }
      } catch (error) {
        console.error('❌ Worker initialization error:', error);
        setConnectionStatus('Failed to Initialize');
      } finally {
        isInitializing = false;
      }
    };

    if (decryptedUserId && !activeWorker) {
      initializeWorker();
    }

    return () => {
      logger.log('🧹 Cleanup: Terminating worker');
      if (activeWorker) {
        activeWorker.terminate();
      }
      isInitializing = false;
    };
  }, [decryptedUserId]);

  // ── Setup progress SSE listener ──────────────────────────────────────
  // Listens for long-running setup job progress (TTS engine install, model
  // downloads, etc.) and adds them as chat messages with SetupProgressCard.
  useEffect(() => {
    // Guard: skip SSE if no JWT — unauthenticated users would trigger a
    // 401 reconnection storm (EventSource retries every 3s on HTTP errors
    // with no onerror handler, freezing the UI event loop).
    const jwt = localStorage.getItem('jwt');
    if (!jwt) return;

    const baseUrl = window.location.origin;
    const sseUrl = `${baseUrl}/api/social/events/stream?token=${encodeURIComponent(jwt)}`;

    let eventSource;
    try {
      eventSource = new EventSource(sseUrl);
    } catch {
      return; // EventSource not available
    }

    // Kill connection on auth/server errors to prevent reconnect storm
    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) return;
      eventSource.close();
    };

    eventSource.addEventListener('setup_progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type !== 'setup_progress') return;

        setMessages((prev) => {
          // Find existing card for this job or create new one
          const existingIdx = prev.findIndex(
            (m) => m.type === 'setup_progress' && m.jobType === data.job_type
          );

          if (existingIdx >= 0) {
            // Append step to existing card
            const updated = [...prev];
            updated[existingIdx] = {
              ...updated[existingIdx],
              steps: [...updated[existingIdx].steps, data],
              isComplete: data.message?.includes('ready to use') || data.message?.includes('Ready'),
            };
            return updated;
          }

          // New job — insert progress card
          return [...prev, {
            type: 'setup_progress',
            jobType: data.job_type,
            steps: [data],
            isComplete: false,
            timestamp: new Date(),
          }];
        });
      } catch { /* ignore parse errors */ }
    });

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  useEffect(() => {
    if (requestId && worker) {
      logger.log('📋 Sending request ID to worker:', requestId);
      setRequestIdFromCrossbar(requestId);
      worker.postMessage({
        type: 'SET_REQUEST_ID',
        payload: {
          request_Id: requestId,
        },
      });
    }
  }, [requestId, worker]);
  useEffect(() => {
    const encryptedUserId = localStorage.getItem('user_id');
    const encryptedEmail = localStorage.getItem('email_address');

    if (encryptedUserId && encryptedEmail) {
      const userId = decrypt(encryptedUserId);
      const email = decrypt(encryptedEmail);

      setDecryptedUserId(userId);
      setDecryptedEmail(email);
    } else {
      console.warn('No userId or email found in localStorage.');
    }
  }, [decryptedEmail, decryptedUserId]);

  // Guest name uniqueness check when internet becomes available
  useEffect(() => {
    if (!isGuestMode) return;
    const guestVerified = localStorage.getItem('guest_name_verified');
    if (guestVerified === 'true') return;

    const checkGuestName = async () => {
      if (!navigator.onLine) return;
      try {
        const data = await agentApi.checkHandle(guestName);
        if (data.available) {
          localStorage.setItem('guest_name_verified', 'true');
          setGuestNameConflict(null);
        } else {
          setGuestNameConflict({
            message: `The name "${guestName}" is already taken.`,
            suggestions: data.suggestions || [
              `${guestName}_${Math.floor(Math.random() * 999)}`,
              `${guestName}${new Date().getFullYear()}`,
            ],
          });
        }
      } catch (err) {
        console.warn('Guest name check failed:', err.message);
      }
    };

    checkGuestName();
    const handleOnline = () => checkGuestName();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isGuestMode, guestName]);

  const handleGuestNameChange = (newName) => {
    setGuestName(newName);
    localStorage.setItem('guest_name', newName);
    localStorage.setItem('guest_name_verified', 'true');
    setGuestNameConflict(null);
  };

  const isIdleVideo = (videoUrl) => {
    return videoUrl === idleVideoUrl;
  };

  const handleImgError = (e) => {
    e.target.style.display = 'none';
  };

  const handleVideoError = (e) => {
    e.target.style.display = 'none';
  };

  const handleMediaEnded = () => {
    try {
      logger.log('🎬 Media ended, returning to idle video');
      logger.log('🔊 Current audioUrl:', audioUrl);
      logger.log('🎥 Current videoUrl:', videoUrl);

      setIsPlayingResponse(false);
      setAnimatingMessageIndex(null);
      setAudioUrl(null); // This should clear the audio URL

      // Get idle video URL
      let targetIdleUrl = idleVideoUrl;
      if (!targetIdleUrl) {
        const idleVideo =
          currentAgent?.fillers?.find((filler) => filler.type === 'idle') ||
          agentData?.fillers?.find((filler) => filler.type === 'idle');

        if (idleVideo?.video_link) {
          targetIdleUrl = idleVideo.video_link;
          setIdleVideoUrl(targetIdleUrl);
        }
      }

      // Only restore idle video in full video mode (not audio-only or text)
      if (targetIdleUrl && mediaMode === 'video') {
        logger.log('🎥 Setting idle video:', targetIdleUrl);
        setTimeout(() => {
          setVideoUrl(targetIdleUrl);

          if (videoRef.current) {
            videoRef.current.src = targetIdleUrl;
            videoRef.current.load();

            videoRef.current.addEventListener(
              'canplay',
              () => {
                videoRef.current
                  .play()
                  .catch((err) => console.warn('Idle video play failed:', err));
              },
              {once: true}
            );
          }
        }, 200);
      } else {
        // Audio-only or text mode: clear video after response ends
        setVideoUrl(null);
      }
    } catch (error) {
      console.error('Error handling media end:', error);
    }
  };

  const handleButtonClick = (chat) => {
    setVideoUrl(null);
    setCurrentAgent(chat);
    logger.log('hello');
    if (chat && chat.prompt_id !== currentAgent?.prompt_id) {
      // for save messsage
      if (currentAgent?.prompt_id && messages.length > 0) {
        logger.log(
          `💾 Saving ${messages.length} messages before switching to ${chat.name}`
        );
        saveMessagesToStorage(messages, currentAgent.prompt_id || currentAgent.id);
      }

      logger.log(`🧹 Clearing messages for agent switch to: ${chat.name}`);
      setMessages([]);

      const idleFiller = chat.fillers?.find((filler) => filler.type === 'idle');
      setVideoUrl(idleFiller?.video_link);
      setCurrentAgent(chat);

      setTimeout(() => {
        const savedMessages = loadMessagesFromStorage(chat.prompt_id);
        logger.log(
          `📥 Loading ${savedMessages.length} messages for agent: ${chat.name}`
        );
        setMessages(savedMessages);
      }, 100);

      setIsOpen(false);
      navigate(`/agents/${encodeURIComponent(chat.name)}`);
    } else {
      logger.log('Same agent or agent not found');
    }
  };

  useEffect(() => {
    // Auto-scroll to bottom whenever messages change (new message added)
    setTimeout(() => {
      scrollToBottom();
      if (shouldScroll) setShouldScroll(false);
    }, 50);
  }, [messages, shouldScroll]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  };

  const handlePlay = async () => {
    if (isTextMode) {
      logger.log('Text mode is enabled, skipping video playback');
      return;
    }

    if (videoRef.current) {
      try {
        if (videoRef.current.readyState >= 2) {
          await videoRef.current.play();
        } else {
          videoRef.current.addEventListener(
            'canplay',
            async () => {
              try {
                await videoRef.current.play();
              } catch (err) {
                console.error('Video play failed after canplay:', err);
              }
            },
            {once: true}
          );
        }
      } catch (error) {
        console.error('Video playback failed:', error);
      }
    }
  };

  const TextModeToggle = () => (
    <button
      onClick={toggleTextMode}
      className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-colors ${
        mediaMode === 'text'
          ? 'bg-blue-600 text-white'
          : mediaMode === 'video'
          ? 'bg-purple-600 text-white'
          : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
      }`}
      title={`Current: ${mediaMode === 'audio' ? 'Audio Only' : mediaMode === 'video' ? 'Video Mode' : 'Text Mode'}`}
    >
      <FileText className="w-4 h-4" />
      <span className="text-sm">{mediaMode === 'audio' ? 'Audio' : mediaMode === 'video' ? 'Video' : 'Text'}</span>
    </button>
  );

  const onDocumentLoadSuccess = ({numPages}) => {
    setNumPages(numPages);
    setCurrentPage(1);
  };

  const nextPage = () =>
    setCurrentPage((prev) => (prev < numPages ? prev + 1 : prev));
  const prevPage = () => setCurrentPage((prev) => (prev > 1 ? prev - 1 : prev));

  // BCP-47 locale map for Web Speech API (needs ta-IN not ta)
  const _sttLangMap = {
    en: 'en-US', ta: 'ta-IN', hi: 'hi-IN', te: 'te-IN', bn: 'bn-IN',
    gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', mr: 'mr-IN', pa: 'pa-IN',
    ur: 'ur-PK', as: 'as-IN', ne: 'ne-NP', sa: 'sa-IN', or: 'or-IN',
    es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', ru: 'ru-RU',
    ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', ar: 'ar-SA', it: 'it-IT',
    tr: 'tr-TR', vi: 'vi-VN', th: 'th-TH', id: 'id-ID',
  };

  // MediaRecorder fallback refs (used when Web Speech API is unavailable, e.g. macOS WKWebView)
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const handleStart = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      // ── Web Speech API path (Chrome, Edge, Windows WebView2) ──
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      const _hartLang = localStorage.getItem('hart_language') || 'en';
      recognition.lang = _sttLangMap[_hartLang] || _hartLang;

      let committedText = '';

      recognition.onresult = (event) => {
        let interim = '';
        let finalText = '';
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalText += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        committedText = finalText;
        setInputMessage(committedText + interim);
      };

      let autoSendTimer = null;
      const origOnResult = recognition.onresult;
      recognition.onresult = (event) => {
        origOnResult(event);
        const lastResult = event.results[event.results.length - 1];
        if (lastResult.isFinal) {
          clearTimeout(autoSendTimer);
          autoSendTimer = setTimeout(() => {
            if (committedText.trim()) {
              if (handleSendRef.current) handleSendRef.current();
              committedText = '';
            }
          }, 1500);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        // If permission denied, fall through to native mic fallback
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setIsRecording(false);
          recognitionRef.current = null;
          if (window.pywebview && window.pywebview.api && window.pywebview.api.native_mic_record) {
            console.log('[STT] SpeechRecognition denied, falling back to native mic');
            setInputMessage('Listening (5s)...');
            setIsRecording(true);
            window.pywebview.api.native_mic_record(5).then((result) => {
              setIsRecording(false);
              if (result && !result.startsWith('__ERROR__')) {
                setInputMessage(result);
                setTimeout(() => { if (handleSendRef.current) handleSendRef.current(); }, 500);
              } else {
                setInputMessage('');
                console.warn('[STT] Native mic error:', result);
              }
            }).catch((err) => {
              setIsRecording(false);
              setInputMessage('');
              console.error('[STT] Native mic call failed:', err);
            });
          }
        }
      };

      recognition.onend = () => {
        clearTimeout(autoSendTimer);
        if (committedText.trim() && handleSendRef.current) {
          handleSendRef.current();
          committedText = '';
        }
        setIsRecording(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
      return;
    }

    // ── MediaRecorder fallback (when getUserMedia available — Chrome, Edge, Electron, HTTPS) ──
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          audioChunksRef.current = [];
          const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '' });
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
          };
          recorder.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
            if (blob.size === 0) return;
            setInputMessage('Transcribing...');
            try {
              const form = new FormData();
              form.append('audio', blob, 'recording.webm');
              const resp = await fetch('/voice/transcribe', { method: 'POST', body: form });
              const data = await resp.json();
              if (data.success && data.text) {
                setInputMessage(data.text);
                setTimeout(() => { if (handleSendRef.current) handleSendRef.current(); }, 500);
              } else {
                setInputMessage('');
                console.warn('[STT] Transcription failed:', data.error);
              }
            } catch (err) {
              setInputMessage('');
              console.error('[STT] Transcription request failed:', err);
            }
          };
          recorder.start();
          mediaRecorderRef.current = recorder;
          setIsRecording(true);
        })
        .catch((err) => {
          console.error('[STT] Mic access denied:', err);
        });
      return;
    }

    // ── Native mic fallback (pywebview JS-Python bridge) ──
    // Used when getUserMedia is unavailable (macOS WKWebView over HTTP).
    // Records via Python sounddevice and transcribes via Whisper server-side.
    if (window.pywebview && window.pywebview.api && window.pywebview.api.native_mic_record) {
      console.log('[STT] Using native pywebview mic capture');
      setInputMessage('Listening (5s)...');
      setIsRecording(true);
      window.pywebview.api.native_mic_record(5).then((result) => {
        setIsRecording(false);
        if (result && !result.startsWith('__ERROR__')) {
          setInputMessage(result);
          setTimeout(() => { if (handleSendRef.current) handleSendRef.current(); }, 500);
        } else {
          setInputMessage('');
          console.warn('[STT] Native mic error:', result);
        }
      }).catch((err) => {
        setIsRecording(false);
        setInputMessage('');
        console.error('[STT] Native mic call failed:', err);
      });
      return;
    }

    alert('Microphone is not available. Please check System Settings > Privacy > Microphone.');
  };

  const handleStop = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  // ── Wake word ("Hey Nunba") — reuses same SpeechRecognition API ──
  const wakeListenerRef = useRef(null);
  const [alwaysListening, setAlwaysListening] = useState(
    () => localStorage.getItem('nunba_always_listen') === 'true'
  );

  useEffect(() => {
    if (!alwaysListening) {
      wakeListenerRef.current?.stop();
      wakeListenerRef.current = null;
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    // Use same BCP-47 mapping as main speech handler
    const _wkLang = localStorage.getItem('hart_language') || 'en';
    r.lang = _sttLangMap[_wkLang] || _wkLang;
    r.onresult = (e) => {
      const text = e.results[e.results.length - 1][0].transcript.toLowerCase().trim();
      const wakeIdx = text.indexOf('nunba');
      if (wakeIdx >= 0) {
        const command = text.slice(wakeIdx + 5).trim();
        if (command) {
          setInputMessage(command);
          setTimeout(() => { if (handleSendRef.current) handleSendRef.current(); }, 100);
        }
      }
    };
    r.onend = () => { if (alwaysListening) r.start(); }; // auto-restart
    r.start();
    wakeListenerRef.current = r;
    return () => { r.stop(); wakeListenerRef.current = null; };
  }, [alwaysListening]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clipboard fetch — pulls from backend clipboard monitor ──
  const handleClipboardPaste = async () => {
    try {
      const r = await fetch('/clipboard/latest');
      if (r.ok) {
        const d = await r.json();
        if (d.text && d.text.trim()) {
          setInputMessage(`Explain: ${d.text.trim().slice(0, 500)}`);
          pushNotification({ type: 'info', message: 'Clipboard captured' });
        }
      }
    } catch { /* clipboard not available */ }
  };

  // ── Camera capture — snap frame, send as image ──
  const handleCameraCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setUserImage(dataUrl);
      pushNotification({ type: 'success', message: 'Photo captured' });
    } catch {
      pushNotification({ type: 'warning', message: 'Camera not available' });
    }
  };

  // ── Memory panel toggle ──
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);

  const handleLoadedMetadata = (event) => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      handlePlay();
    }
  };
  const handleLoadedMetadataaudio = (event) => {
    const duration = event.target.duration;
    setDuration(duration);
  };
  const handlePdfSelect = async (event) => {
    const file = event.target.files[0];

    if (!file) {
      console.error('No file selected.');
      return;
    }
    if (file && file.type === 'application/pdf') {
      const previewUrl = URL.createObjectURL(file);
      setPdfurl(previewUrl);
    }

    try {
      // Set the selected PDF file
      setPdfFile(file);

      const formdata = new FormData();
      formdata.append('bot_type', 'book_parsing');
      formdata.append('user_id', decryptedUserId);
      formdata.append('request_id', uuidv4());
      formdata.append('file', file, file.name);

      const requestOptions = {
        method: 'POST',
        body: formdata,
        redirect: 'follow',
      };

      fetch(
        BOOK_PARSING_URL,
        requestOptions
      )
        .then(async (response) => {
          if (!response.ok) {
            console.error(
              'Failed to upload PDF:',
              response.status,
              response.statusText
            );
            return;
          }

          const result = await response.json();
          setRequestId(result.request_id);

          setpdfFileUrl(result.file_url);
        })
        .catch((error) => {
          console.error('Error during PDF upload process:', error);
        });
    } catch (error) {
      console.error('Error during PDF upload process:', error);
    }
  };

  const handleRemovePdf = () => {
    setPdfFile(null);
    setpdfFileUrl(null);
  };

  const handleImageSelect = async (event) => {
    const file = event.target.files[0];

    if (file) {
      setIsImageUploading(true);
      setUserImage(URL.createObjectURL(file));

      const formData = new FormData();
      formData.append('user_id', decryptedUserId);
      formData.append('file', file, file.name);
      formData.append('request_id', uuidv4());

      try {
        const response = await fetch(
          UPLOAD_FILE_URL,
          {
            method: 'POST',
            body: formData,
            redirect: 'follow',
          }
        );

        if (response.ok) {
          const result = await response.json();
          setUserImage(result.file_url);
        } else {
          console.error(
            'Failed to upload image:',
            response.status,
            response.statusText
          );
        }
      } catch (error) {
        console.error('Error uploading image:', error);
      } finally {
        setIsImageUploading(false);
      }
    }
  };

  const handleRemoveImage = () => {
    setUserImage(null);
    setSelectedFile(null);
    setFileUrl(null);
  };

  const LogOutUser = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('email_address');
    localStorage.removeItem('guest_mode');
    localStorage.removeItem('guest_name');
    localStorage.removeItem('guest_user_id');
    localStorage.removeItem('guest_name_verified');
    setIsGuestMode(false);
    setGuestNameConflict(null);
    navigate('/');
  };

  const handleFocus = () => {
    if (!token && !isGuestMode) {
      setShowTooltip(true);
    }
  };

  const handleBlur = () => {
    setShowTooltip(false);
  };

  // ── Retry: message status updater ──
  const updateMessageStatus = (messageId, updates) => {
    setMessages(prev => prev.map(msg =>
      msg.messageId === messageId ? { ...msg, ...updates } : msg
    ));
  };

  const handleSend = async () => {
    const origin = window.location.origin.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();

    logger.log(origin, pathname, 'origin and pathname');

    const generatedRequestId = requestId || uuidv4();
    setRequestId(generatedRequestId);

    setCurrentThinkingId(null);
    setThinkingStartTime(null);

    const isPersonalisedEndpoint =
      (origin === 'https://hertzai.com' &&
        (pathname === '/' || pathname === '')) ||
      pathname.includes('hevolve') ||
      pathname.includes('personalised');

    logger.log(isPersonalisedEndpoint, 'isPersonalisedEndpoint');

    if (!inputMessage.trim() && !fileUrl && !userImage) return;
    // Queue message ONLY if there's an active request AND it's been less than 10s since last message.
    // After 10s, allow sending even while a previous request is processing (concurrent requests).
    const timeSinceLastMsg = Date.now() - lastMessageSentAtRef.current;
    if (loading && timeSinceLastMsg < 10000) {
      setMessageQueue((prev) => [...prev, { text: inputMessage.trim(), id: Date.now() }]);
      setInputMessage('');
      return;
    }

    // Parse @agent mention and route to that agent
    const agentMentionMatch = inputMessage.match(/@(\S+)/);
    if (agentMentionMatch) {
      const mentionedName = agentMentionMatch[1];
      const targetAgent = allAgents.find(a =>
        a.name === mentionedName || String(a.prompt_id) === mentionedName
      );
      if (targetAgent && targetAgent.prompt_id !== currentAgent?.prompt_id) {
        setCurrentAgent(targetAgent);
        localStorage.setItem('active_agent_id', String(targetAgent.prompt_id));
      } else if (!targetAgent) {
        setMessages((prev) => [...prev, {
          type: 'system',
          content: `Agent "@${mentionedName}" not found. Use /h to see available agents.`,
        }]);
      }
    }
    setShowAgentMentionList(false);

    const msgId = makeMsgId();
    const userMessage = {
      type: 'user',
      content: inputMessage,
      pdf: pdffileUrl || null,
      image: userImage || null,
      messageId: msgId,
      status: 'sending',
    };

    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setLoading(true);
    lastMessageSentAtRef.current = Date.now();
    setShouldScroll(true);
    setWaitingText(null);
    logger.log('agentdata', agentData);
    logger.log('currentagent', currentAgent);

    const dataToSend = JSON.stringify({
      text: inputMessage,
      user_id: effectiveUserId,
      teacher_avatar_id: agentData?.teacher_avatar_id || null,
      conversation_id: conversationId,
      request_id: generatedRequestId,
      prompt_id: currentAgent?.prompt_id || null,
      bot_type: currentAgent?.name || '',
      create_agent: currentAgent?.create_agent || false,
      autonomous_creation: currentAgent?.autonomous_creation || false,
      image_url: userImage || null,
      file_url: fileUrl || null,
      preferred_lang: localStorage.getItem('hart_language') || 'en',
    });

    // Clear form data
    setUploadedPdf(null);
    setUserImage(null);
    setInputMessage('');
    setFileUrl(null);
    setPdfFile(null);
    setpdfFileUrl(null);

    if (textareaRef.current) {
      textareaRef.current.style.height = '70px';
      textareaRef.current.style.overflowY = 'hidden';
    }

    try {
      if (!token && !isGuestMode) {
        console.error('Authorization token is missing.');
        setLoading(false);
        setIsModalOpen(true);
        return;
      }

      // ── Dual-mode routing: local LLM backend vs cloud API ──
      const useLocalBackend =
        intelligencePreference === 'local_only' ||
        (intelligencePreference === 'auto' &&
          backendHealth !== 'offline' &&
          (isGuestMode || isLocalAgent(currentAgent) || !navigator.onLine));

      if (useLocalBackend) {
        // Route to local Flask /chat via existing chatApi service with persistent retry
        logger.log('Routing to LOCAL backend via chatApi');
        let localSuccess = false;
        let retryCount = 0;
        let lastLocalReason = '';

        while (!localSuccess) {
          // Update status for retries
          if (retryCount > 0) {
            const backoff = getBackoff(retryCount - 1);
            updateMessageStatus(msgId, {
              status: 'retrying',
              error: `${lastLocalReason} — retrying in ${Math.round(backoff / 1000)}s...`,
              retryCount,
            });
            setIsRequestInFlight(false); // no active request during backoff
            await new Promise((r) => setTimeout(r, backoff));
            // Check if message was deleted by user during backoff
            const stillExists = messagesRef.current.find(m => m.messageId === msgId);
            if (!stillExists) { setLoading(false); return; }
          }

          try {
            setIsRequestInFlight(true);
            updateMessageStatus(msgId, { status: 'sending', error: null });
            const localResult = await chatApi.chat({
              text: inputMessage,
              user_id: effectiveUserId,
              agent_id: currentAgent?.id || currentAgent?.prompt_id || 'local_assistant',
              agent_type: currentAgent?.type || 'local',
              conversation_id: conversationId,
              video_req: false,
              prompt_id: currentAgent?.prompt_id || null,
              create_agent: currentAgent?.create_agent || false,
              autonomous_creation: currentAgent?.autonomous_creation || false,
              image_url: userImage || null,
              file_url: fileUrl || null,
              preferred_lang: localStorage.getItem('hart_language') || 'en',
            });
            setIsRequestInFlight(false);
            const resultData = localResult || {};
            logger.log('Local backend response:', resultData);

            // Mark message as sent
            updateMessageStatus(msgId, { status: 'sent', error: null, retryCount: undefined });
            localSuccess = true;

            // Track autonomous creation flag from backend
            if (resultData.autonomous_creation) {
              setCurrentAgent((prev) => ({
                ...prev,
                autonomous_creation: true,
                original_task: inputMessage,
              }));
            }
            // Handle creation_suggested from reuse agent (Step 17/19)
            if (resultData.creation_suggested) {
              setMessages((prev) => [...prev, {
                type: 'system',
                content: 'The agent suggests creating a specialized agent for this task. Say "create an agent" to start, or "create it automatically" for autonomous creation.',
              }]);
            }
            // Handle LLM setup card — no local LLM configured
            if (resultData.llm_setup_card) {
              setMessages((prev) => [...prev, {
                type: 'llm_setup_card',
                content: resultData.text || resultData.response || 'A local LLM is needed for chat.',
                setupCard: resultData.llm_setup_card,
              }]);
            }
            // Handle agentic plan from Agentic_Router tool (Plan Mode)
            if (resultData.agentic_plan && resultData.agent_status === 'Plan Mode') {
              const plan = resultData.agentic_plan;
              setMessages((prev) => [...prev, {
                type: 'plan_card',
                content: resultData.text || resultData.response || 'Here is my proposed plan:',
                plan: plan,
                prompt_id: resultData.prompt_id,
              }]);
            }
            // Track Agent_status for creation/reuse mode animation
            if (resultData.agent_status) {
              setCurrentAgent((prev) => ({ ...prev, agent_status: resultData.agent_status }));
              if (resultData.agent_status === 'completed' && currentAgent?.create_agent) {
                const agentName = resultData.agent_display_name || resultData.agent_name || currentAgent?.name || 'Created Agent';
                setCurrentAgent((prev) => ({
                  ...prev,
                  create_agent: false,
                  autonomous_creation: false,
                  agent_status: null,
                  available: true,
                  name: agentName,
                }));
                setAllAgents((prev) => {
                  const pid = resultData.prompt_id || currentAgent?.prompt_id;
                  const exists = prev.some((a) => a.prompt_id === pid);
                  if (!exists) return [...prev, { ...currentAgent, prompt_id: pid, create_agent: false, autonomous_creation: false, agent_status: null, available: true, name: agentName }];
                  return prev;
                });
                setMessages((prev) => [...prev,
                  { type: 'system', content: `Agent "${agentName}" created successfully! You can now chat with your new agent.` },
                  { type: 'system', content: `Your agent "${agentName}" has been shared to the social feed! View it in Thought Experiments.` },
                ]);
                if (decryptedUserId && !isGuestMode) {
                  const pid = resultData.prompt_id || currentAgent?.prompt_id;
                  chatApi.syncAgents([{
                    prompt_id: pid,
                    name: agentName,
                    updated_at: new Date().toISOString(),
                  }]).catch(() => {});
                }
                // Navigate to the newly created agent's page
                const encodedName = encodeURIComponent(agentName);
                navigate(`/agents/${encodedName}`);
              }
            }
            // Track prompt_id from auto-generated creation flow
            if (resultData.prompt_id && !currentAgent?.prompt_id) {
              setCurrentAgent((prev) => ({ ...prev, prompt_id: resultData.prompt_id }));
            }
            // Trigger autonomous auto-continuation loop if applicable
            if (resultData.autonomous_creation && resultData.agent_status && resultData.agent_status !== 'completed') {
              setAutoContinueFlag((prev) => prev + 1);
            }

            // Agent-driven secret request: the LangChain agent/tool signals
            // that an API key is needed — open SecureInputModal instead of
            // displaying the raw error message
            if (resultData.secret_request) {
              setSecretRequest(resultData.secret_request);
            }

            // Process thinking traces captured during local LangChain/autogen execution.
            // These arrive batched (not streamed) — feed each into handleDataReceived
            // to populate ThinkingProcessContainer before showing the final answer.
            if (resultData.thinking_steps?.length > 0) {
              logger.log(`Processing ${resultData.thinking_steps.length} thinking traces`);
              resultData.thinking_steps.forEach((trace) => {
                handleDataReceived(trace);
              });
            }

            // Notify user about model state changes (toast, not chat)
            if (resultData.source === 'local_llama' && !announcedCapsRef.current.has('_fallback_notified')) {
              announcedCapsRef.current.add('_fallback_notified');
              pushNotification({ type: 'info', message: 'Using direct mode while tools load' });
            }
            if (resultData.loading) {
              pushNotification({ type: 'info', message: 'Loading tools... try again in a moment' });
            }

            // Local backend returns 'text' field, not 'response'
            // Skip assistant message when a card already consumed the text
            const responseText = resultData.text || resultData.response;
            const cardConsumedText = !!(resultData.llm_setup_card || (resultData.agentic_plan && resultData.agent_status === 'Plan Mode'));
            if (!cardConsumedText && resultData.status !== 'no_content' && responseText) {
              const assistantMessage = {
                type: 'assistant',
                content: responseText,
                source: resultData.source || null,
              };
              setMessages((prev) => {
                const updated = [...prev];
                // Mark any open thinking containers as completed
                if (resultData.thinking_steps?.length > 0) {
                  for (let i = updated.length - 1; i >= 0; i--) {
                    if (updated[i].type === 'thinking_container' && !updated[i].isCompleted) {
                      updated[i] = {
                        ...updated[i],
                        isCompleted: true,
                        completedAt: new Date(),
                        thinkingSteps: updated[i].thinkingSteps.map((step) => ({
                          ...step,
                          isCompleted: true,
                        })),
                      };
                      break;
                    }
                  }
                }
                return [...updated, assistantMessage];
              });
              setShouldScroll(true);

              // Speak the response using TTS if enabled
              if (ttsEnabled && tts.isAvailable && responseText) {
                tts.speak(responseText);
              }
            }
            // Auto-save after each response (survives force-quit)
            const _saveId = currentAgent?.prompt_id || currentAgent?.id;
            if (_saveId) {
              setTimeout(() => saveMessagesToStorage(messagesRef.current, _saveId), 100);
            }
            setLoading(false);
            setIsRequestInFlight(false);
            setUserImage(null);
            setPdfFile(null);
            return;
          } catch (localError) {
            setIsRequestInFlight(false);
            console.warn('Local backend failed:', localError.message);
            const { reason, retryable } = classifyError(localError);
            lastLocalReason = reason;

            // Non-retryable error (e.g. 401) — mark failed, stop
            if (!retryable) {
              updateMessageStatus(msgId, { status: 'failed', error: reason });
              setLoading(false);
              return;
            }

            // If online and not forced local_only, fall through to cloud after first attempt
            if (navigator.onLine && intelligencePreference !== 'local_only') {
              logger.log('Falling back to cloud API...');
              updateMessageStatus(msgId, { status: 'sending', error: null });
              break; // exit retry loop, fall through to cloud path
            }

            // Offline or local_only: keep retrying with backoff
            retryCount++;
            // Loop continues...
          }
        }

        if (localSuccess) return; // already handled above
      }

      // Cloud API path (fallback or direct)
      logger.log('Routing to CLOUD backend');
      let cloudRetryCount = 0;
      let lastCloudReason = '';

      while (true) {
        if (cloudRetryCount > 0) {
          const backoff = getBackoff(cloudRetryCount - 1);
          updateMessageStatus(msgId, {
            status: 'retrying',
            error: `${lastCloudReason} — retrying in ${Math.round(backoff / 1000)}s...`,
            retryCount: cloudRetryCount,
          });
          setIsRequestInFlight(false);
          await new Promise((r) => setTimeout(r, backoff));
          const stillExists = messagesRef.current.find(m => m.messageId === msgId);
          if (!stillExists) { setLoading(false); return; }
        }

        try {
          setIsRequestInFlight(true);
          updateMessageStatus(msgId, { status: 'sending', error: null });

          const endpoint = isPersonalisedEndpoint
            ? PERSONALISED_LEARNING_URL
            : CUSTOM_GPT_URL;

          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: dataToSend,
          });

          setIsRequestInFlight(false);

          if (!response.ok) {
            let errorResponse = {};
            try { errorResponse = await response.json(); } catch (err) { console.error('Failed to parse error response:', err); }
            console.error('API call failed:', response.status, response.statusText);

            if (response.status === 401) {
              if (!refresh_token) {
                setSessionExpiredMessage('Session expired. Please log in again.');
                setIsModalOpen(true);
                updateMessageStatus(msgId, { status: 'failed', error: 'Session expired' });
                setLoading(false);
                return;
              }
            }

            if (
              errorResponse.error === 'invalid_token' ||
              errorResponse.error_description === 'The access token is invalid or has expired'
            ) {
              localStorage.removeItem('expire_token');
              localStorage.removeItem('access_token');
              localStorage.removeItem('user_id');
              localStorage.removeItem('email_address');
              setIsModalOpen(true);
              updateMessageStatus(msgId, { status: 'failed', error: 'Session expired' });
              setLoading(false);
              return;
            }

            // Other HTTP errors — retry
            lastCloudReason = `Cloud API error (${response.status})`;
            cloudRetryCount++;
            continue;
          }

          // Success
          updateMessageStatus(msgId, { status: 'sent', error: null, retryCount: undefined });

          const dataJson = await response.json();

          if (dataJson.status === 'no_content') {
            logger.log('No content from API. Awaiting Crossbar message...');
            setIsRequestInFlight(false);
            // Timeout fallback: if Crossbar doesn't deliver within 120s, clear loading
            setTimeout(() => {
              setLoading((current) => {
                if (current) {
                  setIsRequestInFlight(false);
                  setMessages((prev) => [...prev, {
                    type: 'system',
                    content: 'Response is taking longer than expected. The AI backend may still be processing. Please try again if no response appears.',
                  }]);
                  return false;
                }
                return current;
              });
            }, 120000);
            return;
          }

          logger.log('API Response received successfully');
          logger.log('Request ID:', dataJson.request_id);

          setUserImage(null);
          setLoading(false);
          return; // done

        } catch (err) {
          setIsRequestInFlight(false);
          console.error('Cloud request error:', err);
          const { reason, retryable } = classifyError(err);
          lastCloudReason = reason;

          if (!retryable) {
            updateMessageStatus(msgId, { status: 'failed', error: reason });
            setLoading(false);
            return;
          }

          cloudRetryCount++;
          // Loop continues...
        }
      }
    } catch (err) {
      console.error('Unexpected error during request:', err);
      setIsRequestInFlight(false);
      const { reason } = classifyError(err);
      updateMessageStatus(msgId, { status: 'failed', error: reason });
      setLoading(false);
    }

    setPdfFile(null);
  };

  // Keep ref in sync for queue processor
  handleSendRef.current = handleSend;

  // ── Manual retry for failed messages ──
  const handleRetryMessage = useCallback((messageId) => {
    const failedMsg = messagesRef.current.find(m => m.messageId === messageId);
    if (!failedMsg || failedMsg.status !== 'failed') return;
    // Remove the failed message — handleSend will re-add it with a fresh msgId
    setMessages(prev => prev.filter(m => m.messageId !== messageId));
    setInputMessage(failedMsg.content);
    setTimeout(() => { if (handleSendRef.current) handleSendRef.current(); }, 50);
  }, []);

  // ── Delete a stuck/retrying message ──
  const handleDeleteMessage = useCallback((messageId) => {
    setMessages(prev => prev.filter(m => m.messageId !== messageId));
  }, []);

  // Handle user clicking "Execute Plan" on a plan card (agentic routing)
  const handleExecutePlan = useCallback(async (plan, promptId) => {
    try {
      setIsRequestInFlight(true);
      const effectiveUserId = decryptedUserId || guestUserId;
      const result = await chatApi.chat({
        text: plan.task_description,
        user_id: effectiveUserId,
        prompt_id: promptId,
        agentic_execute: true,
        agentic_plan: plan,
      });
      setIsRequestInFlight(false);
      const resultData = result?.data || result || {};
      const responseText = resultData.text || resultData.response;
      if (responseText) {
        setMessages((prev) => [...prev, {
          type: 'assistant',
          content: responseText,
          source: resultData.source || null,
        }]);
      }
      // Track agent status from execution response
      if (resultData.agent_status) {
        setCurrentAgent((prev) => ({ ...prev, agent_status: resultData.agent_status }));
      }
      if (resultData.prompt_id) {
        setCurrentAgent((prev) => ({ ...prev, prompt_id: resultData.prompt_id }));
      }
      // Trigger autonomous creation loop if HARTOS started auto-creating an agent
      if (resultData.autonomous_creation && resultData.agent_status) {
        setCurrentAgent((prev) => ({
          ...prev,
          autonomous_creation: true,
          agent_status: resultData.agent_status,
          prompt_id: resultData.prompt_id || prev.prompt_id,
          original_task: plan.task_description,
        }));
        setAutoContinueFlag(1);
      }
    } catch (err) {
      setIsRequestInFlight(false);
      logger.error('Execute plan failed:', err);
      setMessages((prev) => [...prev, {
        type: 'system',
        content: 'Plan execution failed. Please try again.',
      }]);
    }
  }, [decryptedUserId, guestUserId]);

  const handleSetupLlm = useCallback(async (setupCard) => {
    try {
      setIsRequestInFlight(true);
      const sizeLabel = setupCard.size_mb >= 1024
        ? `${(setupCard.size_mb / 1024).toFixed(1)}GB`
        : `${setupCard.size_mb}MB`;
      setMessages((prev) => [...prev, {
        type: 'system',
        content: `Setting up AI models (~${sizeLabel})... This includes LLM, TTS, STT — detecting GPU, installing CUDA if needed.`,
      }]);

      // Use bootstrap endpoint — handles ALL models: LLM, TTS, STT, CUDA torch install
      const lang = localStorage.getItem('hart_language') || 'en';
      const res = await fetch('/api/ai/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang }),
      });
      const data = await res.json();

      // Poll for completion
      const pollStatus = async () => {
        for (let i = 0; i < 120; i++) { // poll up to 2 min
          await new Promise(r => setTimeout(r, 1000));
          try {
            const statusRes = await fetch('/api/ai/bootstrap/status');
            const status = await statusRes.json();

            // Update progress in chat
            if (status.steps) {
              const stepMsgs = Object.values(status.steps)
                .filter(s => s.status !== 'pending')
                .map(s => `${s.model_name || s.model_type}: ${s.status}${s.detail ? ' — ' + s.detail : ''}`);
              if (stepMsgs.length > 0) {
                setMessages((prev) => {
                  const idx = prev.findIndex(m => m.type === 'setup_progress' && m.jobType === 'bootstrap');
                  const card = {
                    type: 'setup_progress',
                    jobType: 'bootstrap',
                    steps: Object.values(status.steps).map(s => ({
                      job_type: s.model_type,
                      message: `${s.model_name || s.model_type}: ${s.detail || s.status}`,
                      status: s.status,
                    })),
                    isComplete: status.phase === 'done',
                  };
                  if (idx >= 0) {
                    const updated = [...prev];
                    updated[idx] = card;
                    return updated;
                  }
                  return [...prev, card];
                });
              }
            }

            if (status.phase === 'done') {
              setIsRequestInFlight(false);
              if (status.error) {
                pushNotification({ type: 'warning', message: `Setup completed with issues: ${status.error}` });
              } else {
                pushNotification({ type: 'success', message: 'All AI models ready', detail: `GPU: ${status.gpu_name || 'CPU'}` });
              }
              return;
            }
          } catch { /* poll error, keep trying */ }
        }
        setIsRequestInFlight(false);
        pushNotification({ type: 'warning', message: 'Setup is taking longer than expected — it will continue in the background' });
      };

      pollStatus();
    } catch (err) {
      setIsRequestInFlight(false);
      logger.error('Bootstrap setup failed:', err);
      setMessages((prev) => [...prev, {
        type: 'system',
        content: 'Auto setup failed. Check your internet connection and try again.',
      }]);
    }
  }, []);

  const handleConfigureLlm = useCallback(async () => {
    try {
      setMessages((prev) => [...prev, {
        type: 'system',
        content: 'Launching AI configuration wizard... You can connect Ollama, Jan, LM Studio, or cloud APIs (OpenAI, Anthropic, etc.)',
      }]);
      const res = await fetch('/api/llm/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!data.success) {
        setMessages((prev) => [...prev, {
          type: 'system',
          content: `Could not launch wizard: ${data.message}. You can configure manually in Settings.`,
        }]);
      }
    } catch {
      setMessages((prev) => [...prev, {
        type: 'system',
        content: 'Could not launch the configuration wizard. You can configure AI endpoints in Settings > AI Configuration.',
      }]);
    }
  }, []);

  const handleImageClick = (imageUrl) => {
    setUploadedImage(imageUrl);
  };
  const handlePdfClick = (pdfUrl) => {
    logger.log(pdfUrl);
    setUploadedPdf(pdfurl);
  };

  const closePreview = () => {
    setUploadedImage(null);
  };

  const selectMentionedAgent = (agent) => {
    const val = inputMessage;
    const cursorPos = textareaRef.current?.selectionStart || val.length;
    const textBeforeCursor = val.substring(0, cursorPos);
    const newText = textBeforeCursor.replace(/\/h\s*\S*$/, `@${agent.name || agent.prompt_id} `) + val.substring(cursorPos);
    setInputMessage(newText);
    setShowAgentMentionList(false);
    if (agent.prompt_id !== currentAgent?.prompt_id) {
      setCurrentAgent(agent);
      localStorage.setItem('active_agent_id', String(agent.prompt_id));
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      setShowAgentMentionList(false);
    }
  };
  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };
  const items = [
    {
      prompt: 'Your name is Radha, you are a sweet beautiful female .',
      prompt_id: 54,
      name: 'Personalised Learning',
      created_date: '2024-11-19T10:24:38',
      request_id: '8b3e7d91-a49b-497d-8051-a3fa4ff3c53e',
      is_public: true,
      create_agent: false,
      is_active: true,
      user_id: 10077,
      image_url:
        'http://aws_rasa.hertzai.com:5459/output/25dfe16e-a6a4-11ef-a097-42010aa00006.png',
      teacher_avatar_id: 2759,
      video_url: null,
      video_text: 'This is Static Description',
      teacher_image_url:
        'https://azurekong.hertzai.com/mkt-aws/txt/voice_dump/8f4c3958-9cropped_image.png',
      description:
        'https://azurekong.hertzai.com/mkt-azure/examples/74eaec428f4c3958-9cropped_image_pred_fls_f4203dae_bf375f78-eLily_audio_embed.mp4',
      image_name: '8f4c3958-9cropped_image.png',
      fillers: [
        {
          text: 'Oops something went wrong',
          video_link:
            'https://azurekong.hertzai.com/mkt-azure/examples/7293f99b8f4c3958-9cropped_image_pred_fls_289940eb_bf375f78-eLily_audio_embed.mp4',
          type: 'internal_server_error',
        },
        {
          text: '',
          video_link:
            'https://azurekong.hertzai.com/mkt-aws/examples/8f4c3958-9cropped_image_pred_fls_Blank_audio_embed.mp4',
          type: 'idle',
        },
      ],
    },

    {
      prompt_id: 49,
      name: 'Speech Therapy Agent',
      prompt:
        'You are the great India itself,  you talk about greatness of India and Indiana and its diversity. ',
      created_date: '2024-11-11T10:06:25',
      request_id: '9ac457f0-eb8d-4869-9d24-4d445f6f6d66',
      is_public: true,
      create_agent: false,
      is_active: true,
      user_id: decryptedUserId,
      image_url:
        'http://aws_rasa.hertzai.com:5459/output/32cbfdba-a17a-11ef-b355-42010aa00006.png',
      teacher_avatar_id: 2739,
      video_url: null,
      video_text: 'This is Static Description',
      teacher_image_url:
        'https://azurekong.hertzai.com/mkt-aws/txt/voice_dump/acb7ea45-0cropped_image.png',
      description:
        'https://azurekong.hertzai.com/mkt-azure/examples/ed5b3666acb7ea45-0cropped_image_pred_fls_a94bd0b3_2665af70-2Katie_audio_embed.mp4',
      image_name: 'acb7ea45-0cropped_image.png',
      fillers: [
        {
          text: 'Oops something went wrong',
          video_link:
            'https://azurekong.hertzai.com/mkt-aws/examples/f6a8d897acb7ea45-0cropped_image_pred_fls_b4e1970c_2665af70-2Katie_audio_embed.mp4',
          type: 'internal_server_error',
        },
        {
          text: '',
          video_link:
            'https://azurekong.hertzai.com/mkt-aws/examples/acb7ea45-0cropped_image_pred_fls_Blank_audio_embed.mp4',
          type: 'idle',
        },
      ],
    },

    {
      prompt_id: 20,
      name: 'Spoken English Agent',
      prompt: 'talk as if you are my kid',
      created_date: '2024-07-10T15:21:01',
      request_id: '1c11d245-08f8-4e1a-9d2d-5c8128a0b185',
      is_public: true,
      create_agent: false,
      is_active: true,
      user_id: 10077,
      image_url:
        'http://aws_rasa.hertzai.com:5459/output/cb7b4fe8-3ed8-11ef-becc-000d3af074c1.png',
      teacher_avatar_id: 2193,
      video_url: null,
      video_text: 'This is Static Description',
      teacher_image_url:
        'https://azurekong.hertzai.com/mkt-aws/txt/voice_dump/comfyinstant_89b6fbf1-2cropped2922730214132889043.png',
      description:
        'https://azurekong.hertzai.com/mkt-azure/examples/0b63bbb0comfyinstant_89b6fbf1-2cropped2922730214132889043_pred_fls_cc94d287_450f5ce5-3Margaret_audio_embed.mp4',
      image_name: 'comfyinstant_89b6fbf1-2cropped2922730214132889043.png',
      fillers: [
        {
          text: 'Oops something went wrong',
          video_link:
            'https://azurekong.hertzai.com/mkt-azure/examples/5fffd4e3comfyinstant_89b6fbf1-2cropped2922730214132889043_pred_fls_4ad5022f_450f5ce5-3Margaret_audio_embed.mp4',
          type: 'internal_server_error',
        },
        {
          text: '',
          video_link:
            'https://azurekong.hertzai.com/mkt-azure/examples/comfyinstant_89b6fbf1-2cropped2922730214132889043_pred_fls_Blank_audio_embed.mp4',
          type: 'idle',
        },
      ],
    },

    {
      prompt_id: 5,
      name: 'News Agent',
      prompt: 'You are a Teacher who responds as if you are Naruto',
      created_date: '2024-02-08T10:46:49',
      request_id: null,
      is_public: true,
      create_agent: false,
      is_active: true,
      user_id: 104,
      image_url:
        'https://azurekong.hertzai.com/mkt-azure/examples/bace4e36-0naruto.jpg',
      teacher_avatar_id: 2759,
      video_url:
        'https://azurekong.hertzai.com/mkt-azure/examples/74eaec428f4c3958-9cropped_image_pred_fls_f4203dae_bf375f78-eLily_audio_embed.mp4',
      video_text: 'This is Static Description',
      teacher_image_url:
        'https://azurekong.hertzai.com/mkt-aws/txt/voice_dump/8f4c3958-9cropped_image.png',
      description:
        'https://azurekong.hertzai.com/mkt-azure/examples/74eaec428f4c3958-9cropped_image_pred_fls_f4203dae_bf375f78-eLily_audio_embed.mp4',
      image_name: '8f4c3958-9cropped_image.png',
      fillers: [
        {
          text: 'Oops something went wrong',
          video_link:
            'https://azurekong.hertzai.com/mkt-azure/examples/7293f99b8f4c3958-9cropped_image_pred_fls_289940eb_bf375f78-eLily_audio_embed.mp4',
          type: 'internal_server_error',
        },
        {
          text: '',
          video_link:
            'https://azurekong.hertzai.com/mkt-aws/examples/8f4c3958-9cropped_image_pred_fls_Blank_audio_embed.mp4',
          type: 'idle',
        },
      ],
    },

    {
      prompt_id: 12,
      name: 'Podcast Agent',
      prompt: 'create an alaram after an hour',
      created_date: '2024-07-09T01:34:29',
      request_id: '454dfsdfsdsfasf564545',
      is_public: true,
      create_agent: false,
      is_active: true,
      user_id: 10669,
      image_url:
        'http://aws_rasa.hertzai.com:5459/output/8e891f44-96b6-11ef-a097-42010aa00006.png',
      teacher_avatar_id: 1802,
      video_url: null,
      video_text: 'This is Static Description',
      teacher_image_url:
        'https://azurekong.hertzai.com/mkt-aws/txt/voice_dump/27b62c6e-fcropped6488793763494973038.png',
      description:
        'https://azurekong.hertzai.com/mkt-azure/examples/77047ca627b62c6e-fcropped6488793763494973038_pred_fls_de571ca5_79b9078f-5Hindi_F_Tyagi_audio_embed.mp4',
      image_name: '27b62c6e-fcropped6488793763494973038.png',
      fillers: [
        {
          text: '',
          video_link:
            'https://azurekong.hertzai.com/mkt-azure/examples/27b62c6e-fcropped6488793763494973038_pred_fls_Blank_audio_embed.mp4',
          type: 'idle',
        },
      ],
    },

    {
      prompt_id: 13,
      name: 'Story Narrator Agent',
      prompt: 'play music for 6 month old',
      created_date: '2024-07-09T10:23:12',
      request_id: '14417881-e4d8-467d-8201-b66552e48531',
      is_public: true,
      create_agent: false,
      is_active: true,
      user_id: 10676,
      image_url:
        'http://aws_rasa.hertzai.com:5459/output/4b987996-96bb-11ef-a35b-42010aa00006.png',
      teacher_avatar_id: 2141,
      video_url: null,
      video_text: 'This is Static Description',
      teacher_image_url:
        'https://azurekong.hertzai.com/mkt-aws/txt/voice_dump/comfyinstant_235bda39-8cropped6966416360302249442.png',
      description:
        'https://azurekong.hertzai.com/mkt-azure/examples/43932170comfyinstant_235bda39-8cropped6966416360302249442_pred_fls_56c3e733__Abdul_Kalam-_English_Motivational_Speech_audio_embed.mp4',
      image_name: 'comfyinstant_235bda39-8cropped6966416360302249442.png',
      fillers: [
        {
          text: '',
          video_link:
            'https://azurekong.hertzai.com/mkt-azure/examples/comfyinstant_235bda39-8cropped6966416360302249442_pred_fls_Blank_audio_embed.mp4',
          type: 'idle',
        },
      ],
    },

    {
      prompt_id: 48,
      name: 'Casual Conversation Agent',
      prompt: 'Spoken English tutor',
      created_date: '2024-11-11T10:06:26',
      request_id: '6a65e893-644a-4049-8572-202172e50d00',
      is_public: true,
      create_agent: false,
      is_active: true,
      user_id: 10077,
      image_url:
        'http://aws_rasa.hertzai.com:5459/output/8fc43ae2-a124-11ef-a35b-42010aa00006.png',
      teacher_avatar_id: 2735,
      video_url: null,
      video_text: 'This is Static Description',
      teacher_image_url:
        'https://azurekong.hertzai.com/mkt-aws/txt/voice_dump/cf9788e4-ccropped_image.png',
      description:
        'https://azurekong.hertzai.com/mkt-azure/examples/77a8e926cf9788e4-ccropped_image_pred_fls_a596bcb8_efe2bbf3-aLily_audio_embed.mp4',
      image_name: 'cf9788e4-ccropped_image.png',
      fillers: [
        {
          text: '',
          video_link:
            'https://azurekong.hertzai.com/mkt-azure/examples/cf9788e4-ccropped_image_pred_fls_Blank_audio_embed.mp4',
          type: 'idle',
        },
      ],
    },
  ];

  const showSidebar = () => setShowContent(true);
  const hideSidebar = () => setShowContent(false);

  return (
    <>
      {/* System notifications — auto-dismiss toast stack */}
      {notifications.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          zIndex: 9999, display: 'flex', flexDirection: 'column-reverse', gap: 8,
          pointerEvents: 'none', maxWidth: 320,
        }}>
          {notifications.map((n) => {
            const colors = {
              success: { bg: 'rgba(46,204,113,0.95)', icon: '\u2713' },
              warning: { bg: 'rgba(255,171,0,0.95)', icon: '\u26A0' },
              info:    { bg: 'rgba(108,99,255,0.95)', icon: '\u2139' },
              error:   { bg: 'rgba(255,107,107,0.95)', icon: '\u2717' },
            };
            const c = colors[n.type] || colors.info;
            return (
              <div key={n.id} style={{
                background: c.bg, color: '#fff',
                padding: '10px 16px', borderRadius: '12px',
                display: 'flex', alignItems: 'flex-start', gap: 10,
                fontFamily: '"Inter", system-ui, sans-serif',
                boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
                backdropFilter: 'blur(8px)',
              }}>
                <span style={{ fontSize: '1rem', lineHeight: 1.3, flexShrink: 0 }}>{c.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, lineHeight: 1.3 }}>{n.message}</div>
                  {n.detail && (
                    <div style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: 2, lineHeight: 1.3 }}>{n.detail}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex bg-black min-h-screen">
        <AgentSidebar
          screenWidth={screenWidth}
          showContent={showContent}
          onMouseEnterSidebar={showSidebar}
          onMouseLeaveSidebar={hideSidebar}
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          isAuthenticated={isAuthenticated}
          isGuestMode={isGuestMode}
          decryptedEmail={decryptedEmail}
          decryptedUserId={decryptedUserId}
          token={token}
          isTextMode={isTextMode}
          setIsTextMode={setIsTextMode}
          isModalOpen={isModalOpen}
          setIsModalOpen={setIsModalOpen}
          sessionExpiredMessage={sessionExpiredMessage}
          isLocalRoute={isLocalRoute}
          items={items}
          handleCreateAgentClick={handleCreateAgentClick}
          handleButtonClick={handleButtonClick}
          handleImgError={handleImgError}
          setShowAgentsOverlay={setShowAgentsOverlay}
          LogOutUser={LogOutUser}
          toggleDropdown={toggleDropdown}
        />

        <div className="flex flex-col min-h-screen bg-black w-full">
          <div className="w-full flex flex-col md:flex-row-reverse flex-1">
            {/* Chat/Messages section - Now on the left for wider screens */}

            <div
              className={`${
                !uploadedImage && !uploadedPdf && window.innerWidth > 768
                  ? (isTextMode || (!videoUrl && !audioUrl) ? 'w-0 overflow-hidden' : 'w-[30%]')
                  : 'w-full'
              } ${
                window.innerWidth <= 768 ? (isTextMode || (!videoUrl && !audioUrl) ? '' : 'h-[35vh] mb-4') : ''
              } flex justify-center items-center transition-all duration-300`}
            >
              {!isTextMode && (
                <>
                  {!uploadedImage && !uploadedPdf ? (
                    <>
                      {videoUrl ? (
                        <video
                          src={videoUrl}
                          width={getVideoWidthforMobile()}
                          onLoadedMetadata={handleLoadedMetadata}
                          className={`${
                            window.innerWidth <= 768
                              ? 'absolute top-0 '
                              : 'absolute bottom-44 right-5 '
                          } object-contain rounded-lg animate-fade-in`}
                          autoPlay
                          ref={videoRef}
                          muted
                          controlsList="nodownload noplaybackrate"
                          controls={false}
                          onEnded={handleMediaEnded}
                          onError={handleVideoError}
                        />
                      ) : audioUrl ? (
                        <div className="fixed flex flex-col justify-center items-center  p-4">
                          <div className="flex items-center space-x-4 justify-center mt-5 px-4 py-4">
                            <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                              <button className="text-gray-700 text-xl">
                                ▶️
                              </button>
                            </div>
                          </div>
                          <div className="mt-4 w-full max-w-md">
                            <audio
                              ref={audioRef}
                              src={audioUrl}
                              className="w-full"
                              autoPlay
                              controlsList="nodownload noplaybackrate"
                              controls={false}
                              onLoadedMetadata={handleLoadedMetadataaudio}
                              onEnded={handleMediaEnded}
                            />
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div
                      className={`${
                        window.innerWidth <= 768 ? 'h-full' : 'h-[85vh]'
                      } w-full flex flex-col items-center justify-between gap-4`}
                    >
                      <>
                        {videoUrl ? (
                          <div className="w-full">
                            <video
                              src={videoUrl}
                              width={getVideoWidthforMobile()}
                              height="auto"
                              className={`${
                                window.innerWidth <= 768
                                  ? 'h-[15vh]'
                                  : 'h-[40vh]'
                              } w-full object-contain rounded-lg animate-fade-in`}
                              autoPlay
                              ref={videoRef}
                              muted
                              controlsList="nodownload noplaybackrate"
                              controls={false}
                              onLoadedMetadata={handleLoadedMetadata}
                              onEnded={handleMediaEnded}
                              onError={handleVideoError}
                            />
                          </div>
                        ) : audioUrl ? (
                          <div className="w-full">
                            <div className="flex items-center space-x-4 justify-center mt-5 px-4 py-4">
                              <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                                <button className="text-gray-700 text-xl">
                                  ▶️
                                </button>
                              </div>
                            </div>
                            <div className="mt-4">
                              <audio
                                ref={audioRef}
                                src={audioUrl}
                                className="w-full"
                                autoPlay
                                controlsList="nodownload noplaybackrate"
                                controls={false}
                                onLoadedMetadata={handleLoadedMetadataaudio}
                                onEnded={handleMediaEnded}
                              />
                            </div>
                          </div>
                        ) : null}
                      </>

                      <PdfViewer
                        uploadedImage={uploadedImage}
                        uploadedPdf={uploadedPdf}
                        currentPage={currentPage}
                        numPages={numPages}
                        scale={scale}
                        onDocumentLoadSuccess={onDocumentLoadSuccess}
                        onPrevPage={prevPage}
                        onNextPage={nextPage}
                        onClose={() => {
                          setUploadedImage(null);
                          setUploadedPdf(null);
                        }}
                        onImgError={handleImgError}
                      />
                    </div>
                  )}
                </>
              )}

              {codeContent && (
                <div className="mt-4 bg-black p-4 rounded-lg shadow-md">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Code Snippet
                  </h3>
                  <pre className="bg-gray-100 p-2 rounded-md text-sm overflow-auto">
                    <code>{codeContent}</code>
                  </pre>
                  <button
                    onClick={() => setCodeContent(null)}
                    className="mt-2 bg-red-500 text-white px-3 py-1 rounded-md"
                  >
                    Close Code
                  </button>
                </div>
              )}
            </div>

            <div
              className={`flex-1 w-full ${
                !isTextMode && (videoUrl || audioUrl) && !uploadedImage && !uploadedPdf && window.innerWidth > 768
                  ? 'md:w-[60%]'
                  : 'md:w-full'
              } overflow-x-clip pt-10 md:pt-0`}
            >
              {messages.length === 0 ? (
                <>
                  {guestNameConflict && (
                    <div className="mx-4 mt-2 p-3 rounded-lg text-sm"
                         style={{ background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.3)', color: '#c4c0ff' }}>
                      <p className="font-semibold" style={{ color: '#a8a3ff' }}>
                        {guestNameConflict.message}
                      </p>
                      <p className="mt-1" style={{ color: '#9994d6' }}>Choose an alternative:</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {guestNameConflict.suggestions.map((name) => (
                          <button
                            key={name}
                            onClick={() => handleGuestNameChange(name)}
                            className="px-3 py-1 rounded text-xs font-medium transition-colors"
                            style={{ background: 'rgba(108,99,255,0.2)', color: '#d0ccff' }}
                            onMouseOver={(e) => e.target.style.background = 'rgba(108,99,255,0.35)'}
                            onMouseOut={(e) => e.target.style.background = 'rgba(108,99,255,0.2)'}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="h-5/6 flex items-center justify-center">
                    {agentsLoading ? (
                      /* ── Loading skeleton while agents are being fetched ── */
                      <div className="text-center space-y-4 mb-1 w-full max-w-lg px-4">
                        {/* Agent name skeleton */}
                        <div className="flex justify-center">
                          <div className="animate-pulse bg-gray-800 rounded h-12 w-64 md:h-16 md:w-80" />
                        </div>
                        {/* Subtitle skeleton */}
                        <div className="flex justify-center">
                          <div className="animate-pulse bg-gray-700 rounded h-6 w-52" />
                        </div>
                        {/* Description skeleton */}
                        <div className="flex justify-center">
                          <div className="animate-pulse bg-gray-700 rounded h-4 w-72" />
                        </div>
                        {/* Prompt chips skeleton */}
                        <div className="flex flex-wrap justify-center gap-2 mt-4">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="animate-pulse bg-gray-800 rounded-full h-10 w-36" />
                          ))}
                        </div>
                        {/* Connecting indicator — only when no path forward (local_only or no internet) */}
                        {backendHealth === 'offline' && (intelligencePreference === 'local_only' || !navigator.onLine) && (
                          <div className="flex items-center justify-center gap-2 mt-4 text-gray-400 text-sm">
                            <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Connecting to backend...
                          </div>
                        )}
                      </div>
                    ) : (
                    <div className="text-center space-y-4 mb-1">
                      {/* Backend offline warning — only when no path forward (local_only or no internet) */}
                      {backendHealth === 'offline' && allAgents.length === 0 && (intelligencePreference === 'local_only' || !navigator.onLine) && (
                        <div className="flex items-center justify-center gap-2 mb-4 px-4 py-2 rounded-lg text-sm"
                             style={{ background: 'rgba(231,76,60,0.12)', color: '#E74C3C', border: '1px solid rgba(231,76,60,0.25)' }}>
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Connecting to backend... Will retry automatically when available.
                        </div>
                      )}
                      <h1 className="animate-fade-in-up text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold leading-tight mb-3" style={{ animationDelay: '0ms', animationFillMode: 'both' }}>
                        {currentAgent?.name}
                      </h1>
                      <h2 className="text-2xl font-medium text-white-900 animate-fade-in-up" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
                        {isGuestMode
                          ? `Welcome, ${guestName}!`
                          : 'How can I help you today?'}
                      </h2>
                      <p className="text-white-600 animate-fade-in-up" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
                        I'm an AI agent. I'm here to help with various task!
                      </p>
                      <p className="text-white-600 animate-fade-in-up" style={{ animationDelay: '300ms', animationFillMode: 'both' }}>
                        {currentAgent?.video_text ===
                          'This is Static Description' ||
                        agentData?.video_text === 'This is Static Description'
                          ? ''
                          : currentAgent?.video_text}
                      </p>

                      {/* Security trust indicator — HARTOS privacy disclosure */}
                      <p className="text-gray-400 text-xs flex items-center justify-center gap-1.5 animate-fade-in-up"
                         style={{ animationDelay: '250ms', animationFillMode: 'both', opacity: 0.7 }}
                         title="Conversations improve your AI locally on this device. No single entity owns or controls the intelligence. You decide what is shared. End-to-end encrypted, local-first architecture per HARTOS constitutional rules.">
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-white text-[8px] font-bold"
                              style={{ background: 'linear-gradient(135deg, #2ECC71, #A8E6CF)' }}>{'\u2713'}</span>
                        Encrypted &middot; AI learns locally &middot; No single entity controls the model
                      </p>

                      {/* Starter prompt chips */}
                      <div className="flex flex-wrap justify-center gap-2 animate-fade-in-up" style={{ animationDelay: '350ms', animationFillMode: 'both' }}>
                        {['Create an agent for me', 'What can you help me with?', 'Run a thought experiment', 'Help me learn something new'].map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => setInputMessage(prompt)}
                            className="px-4 py-2 text-sm rounded-full border transition-all duration-200 hover:scale-105 active:scale-95"
                            style={{
                              borderColor: 'rgba(108,99,255,0.3)',
                              background: 'rgba(108,99,255,0.08)',
                              color: '#9B94FF',
                            }}
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>

                      {!isAuthenticated && (
                        <ul className="buy-button list-none mb-0 animate-fade-in-scale" style={{ animationDelay: '400ms', animationFillMode: 'both' }}>
                          <li className="inline mb-0">
                            <RouterLink
                              onClick={() => setIsModalOpen(true)}
                              className="py-[6px] px-4 inline-block text-sm text-center rounded transition-all duration-200 hover:scale-105 active:scale-95"
                              style={{
                                background:
                                  'linear-gradient(to right, #00e89d, #0078ff)',
                                borderColor: '#00f0c5',
                                color: '#FFFAE8',
                                cursor: 'pointer',
                              }}
                            >
                              Login
                            </RouterLink>
                            <OtpAuthModal
                              isOpen={isModalOpen}
                              onClose={() => setIsModalOpen(false)}
                              forceGuestMode={isLocalRoute}
                            />
                          </li>
                          <span className="mx-4">OR</span>
                          <li className="inline mb-0 ps-1">
                            <RouterLink
                              onClick={() => {
                                const element = document.getElementById(
                                  'signup-section'
                                );
                                element?.scrollIntoView({behavior: 'smooth'});
                              }}
                              to="#signup-section"
                              className="py-[6px] px-4 inline-block text-sm text-center rounded text-white font-semibold"
                              style={{
                                background:
                                  'linear-gradient(to right, #00e89d, #0078ff)',
                                borderColor: '#FFFAE8',
                                cursor: 'pointer',
                                transition: 'background-color 0.3s ease',
                              }}
                            >
                              Signup
                            </RouterLink>
                          </li>
                        </ul>
                      )}
                    </div>
                    )}
                  </div>
                </>
              ) : (
                <ChatMessageList
                  messages={messages}
                  setMessages={setMessages}
                  isRequestInFlight={isRequestInFlight}
                  currentThinkingId={currentThinkingId}
                  animatingMessageIndex={animatingMessageIndex}
                  duration={duration}
                  isTextMode={isTextMode}
                  videoUrl={videoUrl}
                  idleVideoUrl={idleVideoUrl}
                  progress={progress}
                  messagesEndRef={messagesEndRef}
                  onPdfClick={handlePdfClick}
                  onImageClick={handleImageClick}
                  onImgError={handleImgError}
                  onRetryMessage={handleRetryMessage}
                  onDeleteMessage={handleDeleteMessage}
                  setCodeContent={setCodeContent}
                  onExecutePlan={handleExecutePlan}
                  onSetupLlm={handleSetupLlm}
                  onConfigureLlm={handleConfigureLlm}
                />
              )}
            </div>
          </div>

          <ChatInputBar
            messageQueue={messageQueue}
            setMessageQueue={setMessageQueue}
            editingQueueId={editingQueueId}
            setEditingQueueId={setEditingQueueId}
            pdfFile={pdfFile}
            userImage={userImage}
            showAgentMentionList={showAgentMentionList}
            setShowAgentMentionList={setShowAgentMentionList}
            allAgents={allAgents}
            mentionFilter={mentionFilter}
            setMentionFilter={setMentionFilter}
            inputMessage={inputMessage}
            setInputMessage={setInputMessage}
            isAuthenticated={isAuthenticated}
            ttsEnabled={ttsEnabled}
            setTtsEnabled={setTtsEnabled}
            isRecording={isRecording}
            textareaRef={textareaRef}
            handleRemovePdf={handleRemovePdf}
            handleRemoveImage={handleRemoveImage}
            selectMentionedAgent={selectMentionedAgent}
            handleFocus={handleFocus}
            handleBlur={handleBlur}
            handleKeyPress={handleKeyPress}
            handleSend={handleSend}
            handleStart={handleStart}
            handleStop={handleStop}
            handleImageSelect={handleImageSelect}
            handlePdfSelect={handlePdfSelect}
            setIsModalOpen={setIsModalOpen}
            onClipboardPaste={handleClipboardPaste}
            onCameraCapture={handleCameraCapture}
            onMemoryOpen={() => setMemoryPanelOpen(true)}
            alwaysListening={alwaysListening}
            onToggleAlwaysListening={() => {
              const next = !alwaysListening;
              setAlwaysListening(next);
              localStorage.setItem('nunba_always_listen', next ? 'true' : 'false');
              pushNotification({ type: next ? 'success' : 'info',
                message: next ? 'Listening for "Hey Nunba"' : 'Stopped listening' });
            }}
          />
        </div>
      </div>
      {!isAuthenticated && (
        <React.Suspense
          fallback={
            <div className="text-white text-center p-8">Loading...</div>
          }
        >
          <NewHome />
        </React.Suspense>
      )}

      {showAgentsOverlay && (
        <Agents
          isOverlay={true}
          onClose={() => setShowAgentsOverlay(false)}
          onAgentSelect={handleAgentSelect}
          predefinedAgents={allAgents}
        />
      )}
      {showCreateAgentForm && (
        <CreateAgentForm
          onClose={() => setShowCreateAgentForm(false)}
          onSubmit={handleCreateAgentSubmit}
          userId={decryptedUserId}
        />
      )}
      {secretRequest && (
        <SecureInputModal
          secretRequest={secretRequest}
          onClose={() => setSecretRequest(null)}
        />
      )}

      {/* ── Top-right toolbar: hidden when embedded in AgentChatPage ── */}
      {!embeddedMode && <div className="absolute top-1 right-2 z-50 flex items-center gap-1.5 flex-wrap justify-end">
        {/* Install / Launch companion (desktop only) */}
        {screenWidth >= 768 && !companionStatus.isInstalled && !isLocalRoute && (
          <a
            href="https://azurekong.hertzai.com/mkt-aws/examples/daf7beee-7HevolveAI_Agent_Companion_Setup_2.exe"
            download
            className="bg-gradient-to-r from-blue-500 to-green-500 text-white border border-gray-600 rounded-lg px-2 py-1 text-xs hover:brightness-110 transition-all inline-block text-center whitespace-nowrap"
          >
            Install Companion
          </a>
        )}
        {screenWidth >= 768 && companionStatus.isInstalled && !companionStatus.isRunning && !isLocalRoute && (
          <a
            href="hevolveai://launch?action=show"
            className="bg-gradient-to-r from-green-500 to-blue-500 text-white border border-gray-600 rounded-lg px-2 py-1 text-xs hover:brightness-110 transition-all inline-block text-center whitespace-nowrap"
          >
            Launch Companion
          </a>
        )}

        {/* Intelligence preference toggle + backend health */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-0.5 bg-gray-800 rounded-full p-0.5 border border-gray-700">
            {intelligencePreference === 'auto' && (
              <span
                className="w-2 h-2 rounded-full ml-1 flex-shrink-0"
                style={{
                  backgroundColor:
                    backendHealth === 'healthy' ? '#2ECC71' :
                    backendHealth === 'degraded' ? '#F39C12' :
                    navigator.onLine ? '#F39C12' : '#E74C3C',
                }}
                title={
                  backendHealth === 'healthy' ? 'Local AI active' :
                  backendHealth === 'degraded' ? 'No local model — using cloud' :
                  navigator.onLine ? 'Local offline — using cloud' : 'No connection available'
                }
              />
            )}
            {['local_only', 'auto', 'hive_preferred'].map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setIntelligencePreference(mode);
                  localStorage.setItem('intelligence_preference', mode);
                }}
                className={`px-2 py-0.5 text-[10px] rounded-full transition-all duration-200 whitespace-nowrap ${
                  intelligencePreference === mode
                    ? 'bg-gray-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {mode === 'local_only' ? 'Local' : mode === 'auto' ? 'Auto' : 'Hive'}
              </button>
            ))}
          </div>
        </div>

        {/* Mode select (desktop only) */}
        {screenWidth >= 768 && (
          <select
            value={mediaMode}
            onChange={(e) => changeMediaMode(e.target.value)}
            className="bg-gray-800 text-white border border-gray-600 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 hover:bg-gray-700 transition-colors cursor-pointer flex-shrink-0"
          >
            <option value="audio" className="bg-gray-800 text-white">
              Audio Only
            </option>
            <option value="video" className="bg-gray-800 text-white">
              Video Mode
            </option>
            <option value="text" className="bg-gray-800 text-white">
              Text Mode
            </option>
          </select>
        )}

        {/* Creation/Review Mode Animation */}
        {currentAgent?.agent_status && currentAgent.agent_status !== 'completed' && (
          <div className="flex items-center gap-1">
            {currentAgent.autonomous_creation && (
              <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 bg-opacity-80 rounded-lg">
                <div className="animate-spin w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full" />
                <span className="text-green-400 text-xs whitespace-nowrap">
                  {currentAgent.agent_status === 'Creation Mode' ? 'Gathering...' :
                   currentAgent.agent_status === 'Review Mode' ? 'Reviewing...' :
                   currentAgent.agent_status === 'Evaluation Mode' ? 'Evaluating...' :
                   'Auto-creating...'}
                </span>
              </div>
            )}
            <div className="relative w-10 h-10">
              <Lottie
                animationData={creationModeAnimation}
                loop={true}
                autoplay={true}
                className="w-10 h-10"
                title={`Agent ${currentAgent.agent_status}`}
              />
              <span className="absolute inset-0 flex items-center justify-center text-white text-[6px] font-medium pointer-events-none">
                {currentAgent.agent_status === 'Creation Mode' ? 'Creating' :
                 currentAgent.agent_status === 'Review Mode' ? 'Reviewing' :
                 currentAgent.agent_status === 'Evaluation Mode' ? 'Evaluating' :
                 currentAgent.agent_status === 'Reuse Mode' ? 'Ready' : 'Processing'}
              </span>
            </div>
          </div>
        )}

        {/* Companion Status */}
        {companionStatus && (
          <img
            src={companionStatus.isRunning ? connectedImg : DisconnectedImg}
            alt="Connection Status"
            className="w-10 h-10"
            title={
              companionStatus.isRunning
                ? 'Connected'
                : 'Companion App Disconnected'
            }
            onError={handleImgError}
          />
        )}
      </div>}
    </>
  );
};

export default ChatInterface;
