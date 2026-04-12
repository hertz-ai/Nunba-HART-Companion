import React, { Suspense, useEffect, useState, useCallback } from 'react'

import './assets/css/tailwind.css'

import { NunbaThemeProvider } from './contexts/ThemeContext';

import ReactGA from 'react-ga';
import { useLocation, useNavigate } from 'react-router-dom';

import MainRoutes from './MainRoute';
import { SocialProvider } from './contexts/SocialContext';
import { RealtimeProvider } from './contexts/RealtimeContext';
import { ToastProvider } from './components/shared/ToastProvider';
import PageSkeleton from './components/shared/PageSkeleton';
import AgentContactRequest from './components/Agent/AgentContactRequest';
import { GA_TRACKING_ID, API_BASE_URL } from './config/apiBase';
import realtimeService from './services/realtimeService';

function App() {
  const [contactRequest, setContactRequest] = useState(null);
  const navigate = useNavigate();

  // Defer materialdesignicons (420KB) — load after first paint, not render-blocking
  useEffect(() => {
    import('./assets/css/materialdesignicons.min.css');
  }, []);

  useEffect(() => {
    if (GA_TRACKING_ID) ReactGA.initialize(GA_TRACKING_ID);
  }, []);
  const location = useLocation();
  useEffect(() => {
    ReactGA.pageview(location.pathname + location.search);
  }, [location]);

  // Listen for proactive agent contact requests
  useEffect(() => {
    const unsub = realtimeService.on('agent_contact_request', (data) => {
      if (data?.requires_consent) {
        setContactRequest(data);
      }
    });
    // Owned agent direct messages — show as toast or navigate to chat
    const unsubDirect = realtimeService.on('agent_message', (data) => {
      if (data?.agent_id) {
        // Store in localStorage so Agent component picks it up
        localStorage.setItem('active_agent_id', data.agent_id);
        localStorage.setItem('agent_proactive_message', JSON.stringify(data));
      }
    });
    return () => { unsub(); unsubDirect(); };
  }, []);

  const handleAcceptContact = useCallback((req) => {
    const jwt = localStorage.getItem('jwt');
    const headers = { 'Content-Type': 'application/json' };
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
    fetch(`${API_BASE_URL}/agents/contact/respond`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ request_id: req.request_id, action: 'accept' }),
    }).then(r => r.json()).then(data => {
      if (data.success && data.agent_id) {
        localStorage.setItem('active_agent_id', data.agent_id);
        navigate('/');
      }
    }).catch(() => {});
    setContactRequest(null);
  }, [navigate]);

  const handleDenyContact = useCallback((req) => {
    const jwt = localStorage.getItem('jwt');
    const headers = { 'Content-Type': 'application/json' };
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
    fetch(`${API_BASE_URL}/agents/contact/respond`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ request_id: req.request_id, action: 'deny' }),
    }).catch(() => {});
    setContactRequest(null);
  }, []);

  return (
    <NunbaThemeProvider>
      <RealtimeProvider>
        <ToastProvider>
          <SocialProvider>
            {/* Skip-link: keyboard users can jump straight to content (WCAG 2.4.1) */}
            <a
              href="#main-content"
              style={{
                position: 'absolute', left: '-9999px', top: 'auto',
                width: '1px', height: '1px', overflow: 'hidden',
                zIndex: 9999,
              }}
              onFocus={(e) => { e.target.style.cssText = 'position:fixed;top:8px;left:8px;z-index:9999;padding:8px 16px;background:#6C63FF;color:#fff;border-radius:4px;font-size:14px;text-decoration:none;width:auto;height:auto;overflow:visible;'; }}
              onBlur={(e) => { e.target.style.cssText = 'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;'; }}
            >
              Skip to main content
            </a>
            <AgentContactRequest
              request={contactRequest}
              onAccept={handleAcceptContact}
              onDeny={handleDenyContact}
            />
            <main id="main-content">
              <Suspense fallback={<PageSkeleton />}>
                <MainRoutes />
              </Suspense>
            </main>
          </SocialProvider>
        </ToastProvider>
      </RealtimeProvider>
    </NunbaThemeProvider>
  );
}

export default App;
