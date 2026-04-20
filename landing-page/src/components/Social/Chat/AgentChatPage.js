/* eslint-disable no-unused-vars, valid-jsdoc */
import LiquidActionBar from './LiquidActionBar';

import {usersApi, chatApi} from '../../../services/socialApi';

import {Box, CircularProgress, Typography} from '@mui/material';
import React, {useState, useEffect, lazy, Suspense} from 'react';
import {useParams, useLocation} from 'react-router-dom';

// Lazy load the full ported Demopage (ChatInterface) for local/offline mode
const ChatInterface = lazy(() => import('../../../pages/Demopage'));

// Pull the user role off of localStorage/session so LiquidActionBar can
// filter admin-only destinations out for unprivileged viewers. Falls back
// to 'flat' when unknown.
function getSessionRole() {
  try {
    return (
      localStorage.getItem('hevolve_access_role') ||
      localStorage.getItem('social_user_role') ||
      'flat'
    );
  } catch {
    return 'flat';
  }
}

const HOSTED_URL = 'https://hevolve.hertzai.com';

/**
 * Dual-mode AgentChatPage:
 * - Offline / local mode: Renders the full ported ChatInterface (Demopage.js)
 *   with video, audio, typewriter, crossbar websocket, thinking process etc.
 * - Online + webview mode: Loads the hosted Hevolve page via iframe
 *   (like the old companion app pattern from hevolve-widget.js)
 *
 * Route: /social/agent/:agentId/chat
 */
export default function AgentChatPage() {
  const {agentId} = useParams();
  const location = useLocation();
  const query = new URLSearchParams(location.search);

  const [loading, setLoading] = useState(true);
  const [agentData, setAgentData] = useState(null);
  const [agentName, setAgentName] = useState(agentId);
  const [promptId, setPromptId] = useState(query.get('prompt_id') || null);
  const createAgent = query.get('create') === 'true';
  // viewMode: 'local' renders the ported Demopage, 'webview' loads hosted iframe
  const [viewMode, setViewMode] = useState(
    query.get('mode') || (navigator.onLine ? 'local' : 'local')
  );
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Track connectivity
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      setViewMode('local'); // Force local when offline
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Resolve agent info
  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      try {
        // Try local backend first for agent data
        if (promptId) {
          try {
            const localResult = await chatApi.getPrompts(
              localStorage.getItem('hevolve_access_id')
            );
            // Backend returns { prompts: [...], success: true, ... }
            const responseData = localResult || {};
            const prompts = Array.isArray(responseData.prompts)
              ? responseData.prompts
              : Array.isArray(responseData)
                ? responseData
                : [];
            const matched = prompts.find(
              (p) => String(p.prompt_id) === String(promptId)
            );
            if (matched && !cancelled) {
              setAgentData(matched);
              setAgentName(matched.name || agentId);
              setLoading(false);
              return;
            }
          } catch {
            // Local backend not available
          }
        }

        // Try social API
        try {
          const res = await usersApi.get(agentId);
          const user = res.data || res;
          if (!cancelled) {
            setAgentName(user.display_name || user.username || agentId);
            if (user.agent_id) setPromptId(user.agent_id);
          }
        } catch {
          // Not found in social API, treat agentId as prompt_id directly
          if (!cancelled && !promptId) {
            setPromptId(agentId);
          }
        }
      } catch (err) {
        console.error('Error resolving agent:', err);
      }
      if (!cancelled) setLoading(false);
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, [agentId, promptId]);

  if (loading) {
    return (
      <Box textAlign="center" py={6}>
        <CircularProgress />
        <Typography
          variant="body2"
          color="text.secondary"
          style={{marginTop: 8}}
        >
          Loading agent...
        </Typography>
      </Box>
    );
  }

  // Shared inline mode-toggle bar — sits above content, never overlaps Demopage controls
  const ModeBar = ({label, onClick}) =>
    isOnline ? (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 0.5,
          bgcolor: 'rgba(15,14,23,0.85)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          minHeight: 36,
          flexShrink: 0,
        }}
      >
        <Typography variant="caption" sx={{color: 'rgba(255,255,255,0.5)'}}>
          {viewMode === 'local' ? 'Local Mode' : 'Hosted Mode'}
        </Typography>
        <button
          onClick={onClick}
          style={{
            background: 'rgba(108,99,255,0.2)',
            color: '#C5C1FF',
            border: '1px solid rgba(108,99,255,0.4)',
            borderRadius: 6,
            padding: '3px 10px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          {label}
        </button>
      </Box>
    ) : null;

  // ── WebView mode: load hosted Hevolve page in iframe ──
  if (viewMode === 'webview' && isOnline) {
    const token = localStorage.getItem('access_token') || '';
    const userId = localStorage.getItem('hevolve_access_id') || '';
    const iframeUrl =
      `${HOSTED_URL}/agents/${encodeURIComponent(agentName)}?` +
      `token=${encodeURIComponent(token)}&user_id=${encodeURIComponent(
        userId
      )}` +
      `&embed=true&companionAppInstalled=true`;

    return (
      <Box sx={{height: '100vh', display: 'flex', flexDirection: 'column'}}>
        <ModeBar label="Switch to Local" onClick={() => setViewMode('local')} />
        <Box sx={{flex: 1, minHeight: 0}}>
          <iframe
            src={iframeUrl}
            title={`Chat with ${agentName}`}
            style={{width: '100%', height: '100%', border: 'none'}}
            allow="microphone; camera; autoplay"
          />
        </Box>
      </Box>
    );
  }

  // ── Local mode: render the full ported ChatInterface (Demopage.js) ──
  const userRole = getSessionRole();
  return (
    <Box sx={{height: '100vh', display: 'flex', flexDirection: 'column'}}>
      <ModeBar
        label="Switch to Hosted"
        onClick={() => setViewMode('webview')}
      />
      <Box sx={{flex: 1, minHeight: 0, position: 'relative'}}>
        <LiquidActionBar userRole={userRole} />
        <Suspense
          fallback={
            <Box textAlign="center" py={6}>
              <CircularProgress />
              <Typography
                variant="body2"
                color="text.secondary"
                style={{marginTop: 8}}
              >
                Loading chat interface...
              </Typography>
            </Box>
          }
        >
          <ChatInterface agentData={agentData} embeddedMode />
        </Suspense>
      </Box>
    </Box>
  );
}
