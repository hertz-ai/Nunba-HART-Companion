import React from 'react';
import ReactDOM from 'react-dom/client';

import './index.css';
import App from './App';

import {HelmetProvider} from 'react-helmet-async';
import {BrowserRouter} from 'react-router-dom';

import * as serviceWorker from './serviceWorker';

/**
 * Root-level ErrorBoundary — no MUI/external deps so it works even when
 * chunk loading or theme initialization fails. Uses pure inline styles.
 */
class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {hasError: false, error: null};
  }
  static getDerivedStateFromError(error) {
    return {hasError: true, error};
  }
  componentDidCatch(error, info) {
    console.error('[RootErrorBoundary]', error, info?.componentStack);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    const errMsg = this.state.error?.message || 'Unknown error';
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0F0E17',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 24,
            padding: '40px 32px',
            maxWidth: 420,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              marginBottom: 8,
              background: 'linear-gradient(135deg, #6C63FF, #9B94FF)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Something went wrong
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: 14,
              marginBottom: 20,
            }}
          >
            The app encountered an error during startup.
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.3)',
              fontSize: 11,
              marginBottom: 20,
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 8,
              padding: '8px 12px',
              wordBreak: 'break-word',
              maxHeight: 60,
              overflow: 'hidden',
            }}
          >
            {errMsg}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'linear-gradient(135deg, #6C63FF, #9B94FF)',
              color: '#fff',
              border: 'none',
              padding: '12px 32px',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <RootErrorBoundary>
      <HelmetProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </HelmetProvider>
    </RootErrorBoundary>
  </React.StrictMode>
);

// WebView2 suspends requestAnimationFrame for hidden windows (--background start).
// React 18's createRoot uses rAF internally for scheduling. If the window is hidden,
// the initial render may not complete until the window becomes visible.
// Fix: when visibility changes from hidden→visible, give React a few frames to
// flush pending work before reloading as a last resort.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', function onVisible() {
    if (document.visibilityState === 'visible') {
      document.removeEventListener('visibilitychange', onVisible);
      const rootEl = document.getElementById('root');
      if (rootEl && rootEl.children.length === 0) {
        // Wake compositor with a reflow toggle
        rootEl.style.display = 'none';
        void rootEl.offsetHeight;
        rootEl.style.display = '';
        // Give React up to 5 rAF frames (~80ms) to mount before reloading
        let retries = 0;
        const MAX_RETRIES = 5;
        const checkMount = () => {
          if (rootEl.children.length > 0) return; // mounted — done
          if (++retries >= MAX_RETRIES) {
            window.location.reload();
            return;
          }
          requestAnimationFrame(checkMount);
        };
        requestAnimationFrame(checkMount);
      }
    }
  });
}

// Register service worker in production for offline caching of JS/CSS/fonts
serviceWorker.register();
