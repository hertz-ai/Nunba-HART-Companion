import {reportErrorObservation} from '../../hooks/useAgentObserver';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import HomeIcon from '@mui/icons-material/Home';
import RefreshIcon from '@mui/icons-material/Refresh';
import {Box, Typography, Button} from '@mui/material';
import React from 'react';


const darkBg = {
  background:
    'linear-gradient(135deg, #0F0E17 0%, #1A1A2E 40%, #16213E 70%, #0F0E17 100%)',
};

const glass = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.06)',
};

/**
 * ErrorBoundary — catches React render errors and shows a styled fallback.
 *
 * Auto-recovers on route changes: compares current window.location.pathname
 * against the pathname when the error occurred. If it changed (user clicked
 * a nav link), the error state is automatically cleared.
 *
 * Variants:
 * - "page"    — full-page fallback with back + retry buttons
 * - "section" — inline card fallback (for wrapping individual sections)
 * - "silent"  — logs error, renders nothing (for non-critical widgets)
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {hasError: false, error: null, errorPath: null};
  }

  static getDerivedStateFromError(error) {
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Failed to fetch dynamically imported module');
    return {
      hasError: true,
      error,
      errorPath: window.location.pathname,
      isChunkError,
    };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
    reportErrorObservation(
      window.location.pathname,
      error?.name || 'RenderError'
    );
    // For chunk errors, auto-reload after a short delay (React.lazy caches
    // the failed promise, so "Try again" won't fix it without a full reload)
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Failed to fetch dynamically imported module');
    if (isChunkError && !this._chunkReloadAttempted) {
      this._chunkReloadAttempted = true;
      setTimeout(() => window.location.reload(), 2000);
    }
  }

  componentDidUpdate() {
    // Auto-recover when route changes (user navigated away from broken page)
    if (
      this.state.hasError &&
      this.state.errorPath &&
      window.location.pathname !== this.state.errorPath
    ) {
      this.setState({hasError: false, error: null, errorPath: null});
    }
  }

  handleRetry = () => {
    this.setState({hasError: false, error: null, errorPath: null});
  };

  handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/social';
    }
  };

  handleHome = () => {
    window.location.href = '/social';
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const variant = this.props.variant || 'page';

    if (variant === 'silent') {
      return null;
    }

    if (variant === 'section') {
      return (
        <Box
          sx={{
            ...glass,
            borderRadius: '16px',
            p: 3,
            textAlign: 'center',
          }}
        >
          <Typography
            variant="body1"
            sx={{
              color: 'rgba(255,255,255,0.7)',
              mb: 1,
              fontWeight: 600,
            }}
          >
            {this.state.isChunkError
              ? 'Loading failed — reloading...'
              : "This section couldn't load"}
          </Typography>
          {this.state.isChunkError && (
            <Typography
              variant="caption"
              sx={{color: 'rgba(255,255,255,0.4)', display: 'block', mb: 2}}
            >
              A required module failed to load.
            </Typography>
          )}
          <Box sx={{display: 'flex', gap: 1, justifyContent: 'center'}}>
            <Button
              size="small"
              startIcon={<RefreshIcon />}
              onClick={this.handleRetry}
              sx={{
                color: '#6C63FF',
                textTransform: 'none',
                '&:hover': {background: 'rgba(108,99,255,0.1)'},
              }}
            >
              Try again
            </Button>
            <Button
              size="small"
              onClick={() => window.location.reload()}
              sx={{
                color: 'rgba(255,255,255,0.5)',
                textTransform: 'none',
                '&:hover': {background: 'rgba(255,255,255,0.05)'},
              }}
            >
              Reload page
            </Button>
          </Box>
        </Box>
      );
    }

    // variant === 'page'
    return (
      <Box
        sx={{
          ...darkBg,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
        }}
      >
        <Box
          sx={{
            ...glass,
            borderRadius: '24px',
            p: {xs: 3, md: 5},
            maxWidth: 480,
            textAlign: 'center',
          }}
        >
          <Typography
            variant="h5"
            sx={{
              background: 'linear-gradient(135deg, #6C63FF, #9B94FF)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontWeight: 800,
              mb: 1.5,
            }}
          >
            Something went wrong
          </Typography>
          <Typography
            variant="body2"
            sx={{color: 'rgba(255,255,255,0.5)', mb: 3}}
          >
            An unexpected error occurred. Your data is safe.
          </Typography>
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Button
              variant="outlined"
              startIcon={<HomeIcon />}
              onClick={this.handleHome}
              sx={{
                color: 'rgba(255,255,255,0.7)',
                borderColor: 'rgba(255,255,255,0.15)',
                textTransform: 'none',
                borderRadius: '12px',
                '&:hover': {
                  borderColor: '#6C63FF',
                  background: 'rgba(108,99,255,0.08)',
                },
              }}
            >
              Go to Feed
            </Button>
            <Button
              variant="outlined"
              startIcon={<ArrowBackIcon />}
              onClick={this.handleBack}
              sx={{
                color: 'rgba(255,255,255,0.7)',
                borderColor: 'rgba(255,255,255,0.15)',
                textTransform: 'none',
                borderRadius: '12px',
                '&:hover': {
                  borderColor: '#6C63FF',
                  background: 'rgba(108,99,255,0.08)',
                },
              }}
            >
              Go back
            </Button>
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={this.handleRetry}
              sx={{
                background: 'linear-gradient(135deg, #6C63FF, #9B94FF)',
                textTransform: 'none',
                borderRadius: '12px',
                fontWeight: 600,
                '&:hover': {
                  background: 'linear-gradient(135deg, #5A52E0, #8A83F0)',
                },
              }}
            >
              Try again
            </Button>
          </Box>
        </Box>
      </Box>
    );
  }
}
