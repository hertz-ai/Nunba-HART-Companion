import React, {Suspense, useEffect, useState, useCallback} from 'react';

import './assets/css/tailwind.css';

import {NunbaThemeProvider} from './contexts/ThemeContext';

import ReactGA from 'react-ga';
import {useLocation, useNavigate} from 'react-router-dom';

import MainRoutes from './MainRoute';
import {SocialProvider} from './contexts/SocialContext';
import {RealtimeProvider} from './contexts/RealtimeContext';
import {ToastProvider} from './components/shared/ToastProvider';
import PageSkeleton from './components/shared/PageSkeleton';
import AgentContactRequest from './components/Agent/AgentContactRequest';
import {GA_TRACKING_ID, API_BASE_URL} from './config/apiBase';
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
    return () => {
      unsub();
      unsubDirect();
    };
  }, []);

  const handleAcceptContact = useCallback(
    (req) => {
      const jwt = localStorage.getItem('jwt');
      const headers = {'Content-Type': 'application/json'};
      if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
      fetch(`${API_BASE_URL}/agents/contact/respond`, {
        method: 'POST',
        headers,
        body: JSON.stringify({request_id: req.request_id, action: 'accept'}),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success && data.agent_id) {
            localStorage.setItem('active_agent_id', data.agent_id);
            navigate('/');
          }
        })
        .catch(() => {});
      setContactRequest(null);
    },
    [navigate]
  );

  const handleDenyContact = useCallback((req) => {
    const jwt = localStorage.getItem('jwt');
    const headers = {'Content-Type': 'application/json'};
    if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
    fetch(`${API_BASE_URL}/agents/contact/respond`, {
      method: 'POST',
      headers,
      body: JSON.stringify({request_id: req.request_id, action: 'deny'}),
    }).catch(() => {});
    setContactRequest(null);
  }, []);

  return (
    <NunbaThemeProvider>
      <RealtimeProvider>
        <ToastProvider>
          <SocialProvider>
            <AgentContactRequest
              request={contactRequest}
              onAccept={handleAcceptContact}
              onDeny={handleDenyContact}
            />
            <Suspense fallback={<PageSkeleton />}>
              <MainRoutes />
            </Suspense>
          </SocialProvider>
        </ToastProvider>
      </RealtimeProvider>
    </NunbaThemeProvider>
  );
}

export default App;
