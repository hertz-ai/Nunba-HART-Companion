/**
 * SocialContext.test.js — Unit tests for the SocialContext provider.
 *
 * Tests auth state management, login/logout, user profile loading,
 * derived state (accessTier, isGuest, isAuthenticated), and token refresh.
 */
import {render, screen, act, waitFor} from '@testing-library/react';
import React from 'react';
import {BrowserRouter} from 'react-router-dom';

// Build the mock axios instance — all API calls route through this
const mockAxiosInstance = {
  get: jest.fn((url) => {
    if (url === '/auth/me')
      return Promise.resolve({
        data: {id: 'u1', username: 'testuser', role: 'flat'},
      });
    if (url === '/notifications') return Promise.resolve({meta: {total: 5}});
    if (url === '/resonance/wallet')
      return Promise.resolve({data: {pulse: 100}});
    if (url === '/onboarding/progress')
      return Promise.resolve({data: {step: 2}});
    return Promise.resolve({data: {}});
  }),
  post: jest.fn(() => Promise.resolve({data: {}})),
  patch: jest.fn(() => Promise.resolve({data: {}})),
  put: jest.fn(() => Promise.resolve({data: {}})),
  delete: jest.fn(() => Promise.resolve({data: {}})),
};

jest.mock('../../services/axiosFactory', () => ({
  createApiClient: jest.fn(() => mockAxiosInstance),
}));

// The realtimeService.on() must always return a callable unsubscribe function.
// We define these outside the factory so they survive jest.clearAllMocks().
const mockUnsubNotification = jest.fn();
const mockUnsubAchievement = jest.fn();
const mockRealtimeOn = jest.fn();
const mockRealtimeOff = jest.fn();

jest.mock('../../services/realtimeService', () => ({
  __esModule: true,
  default: {
    on: mockRealtimeOn,
    off: mockRealtimeOff,
  },
}));

jest.mock('../../services/apiCache', () => ({
  apiCache: {
    clearAll: jest.fn(),
    buildKey: jest.fn(() => 'test-key'),
    get: jest.fn(() => null),
    set: jest.fn(),
    getPublic: jest.fn(() => null),
    setPublic: jest.fn(),
    getPublicTTL: jest.fn(() => 300000),
    invalidateOnMutation: jest.fn(),
    dedupFetch: jest.fn((key, fn) => fn()),
    clearPublic: jest.fn(),
    getStats: jest.fn(() => ({})),
    getTTL: jest.fn(() => 60000),
  },
}));

const {SocialProvider, useSocial} = require('../../contexts/SocialContext');
const {apiCache} = require('../../services/apiCache');

// Test consumer that exposes context values
function TestConsumer() {
  const ctx = useSocial();
  return (
    <div>
      <span data-testid="loading">{String(ctx.loading)}</span>
      <span data-testid="isAuthenticated">{String(ctx.isAuthenticated)}</span>
      <span data-testid="accessTier">{ctx.accessTier}</span>
      <span data-testid="isGuest">{String(ctx.isGuest)}</span>
      <span data-testid="userRole">{String(ctx.userRole)}</span>
      <span data-testid="unreadCount">{ctx.unreadCount}</span>
      <span data-testid="username">{ctx.currentUser?.username || 'none'}</span>
      <button data-testid="logout-btn" onClick={ctx.logout}>
        Logout
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <BrowserRouter>
      <SocialProvider>
        <TestConsumer />
      </SocialProvider>
    </BrowserRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  jest.useFakeTimers();

  // Re-apply realtimeService.on implementation after clearAllMocks.
  // SocialContext calls realtimeService.on('notification', handler) and
  // realtimeService.on('achievement', handler), and expects each to return
  // an unsubscribe function that it invokes during cleanup.
  let callIndex = 0;
  mockRealtimeOn.mockImplementation(() => {
    callIndex++;
    if (callIndex === 1) return mockUnsubNotification;
    return mockUnsubAchievement;
  });

  // Re-apply default get mock in case a previous test replaced it
  mockAxiosInstance.get.mockImplementation((url) => {
    if (url === '/auth/me')
      return Promise.resolve({
        data: {id: 'u1', username: 'testuser', role: 'flat'},
      });
    if (url === '/notifications') return Promise.resolve({meta: {total: 5}});
    if (url === '/resonance/wallet')
      return Promise.resolve({data: {pulse: 100}});
    if (url === '/onboarding/progress')
      return Promise.resolve({data: {step: 2}});
    return Promise.resolve({data: {}});
  });
});

afterEach(() => {
  jest.useRealTimers();
});

// Helper: advance time without hitting infinite loop from setInterval
async function flushWithTimers() {
  // Advance by 100ms — enough for immediate effects, not enough to trigger intervals
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
  // Flush pending microtasks (async API calls)
  await act(async () => {});
}

// ── Auth state — no token ─────────────────────────────────────────────────
describe('SocialContext - no token', () => {
  it('sets loading to false when no access_token in localStorage', async () => {
    renderProvider();
    await flushWithTimers();
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('sets accessTier to anonymous when no token', async () => {
    renderProvider();
    await flushWithTimers();
    expect(screen.getByTestId('accessTier').textContent).toBe('anonymous');
  });

  it('isAuthenticated is false when no token', async () => {
    renderProvider();
    await flushWithTimers();
    expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
  });
});

// ── Auth state — with token ───────────────────────────────────────────────
describe('SocialContext - with token', () => {
  beforeEach(() => {
    // Set a JWT with role=flat in payload
    const payload = btoa(
      JSON.stringify({
        sub: 'u1',
        role: 'flat',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    localStorage.setItem('access_token', `header.${payload}.sig`);
  });

  it('fetches user profile on mount', async () => {
    renderProvider();
    await flushWithTimers();
    await waitFor(() => {
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/auth/me');
    });
  });

  it('sets user data from API response', async () => {
    renderProvider();
    await flushWithTimers();
    await waitFor(() => {
      expect(screen.getByTestId('username').textContent).toBe('testuser');
    });
  });

  it('sets isAuthenticated to true when user loaded', async () => {
    renderProvider();
    await flushWithTimers();
    await waitFor(() => {
      expect(screen.getByTestId('isAuthenticated').textContent).toBe('true');
    });
  });

  it('sets accessTier from user role', async () => {
    renderProvider();
    await flushWithTimers();
    await waitFor(() => {
      expect(screen.getByTestId('accessTier').textContent).toBe('flat');
    });
  });

  it('fetches resonance wallet on mount', async () => {
    renderProvider();
    await flushWithTimers();
    await waitFor(() => {
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/resonance/wallet');
    });
  });

  it('fetches onboarding progress on mount', async () => {
    renderProvider();
    await flushWithTimers();
    await waitFor(() => {
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/onboarding/progress'
      );
    });
  });

  it('fetches unread notifications on mount', async () => {
    renderProvider();
    await flushWithTimers();
    await waitFor(() => {
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/notifications',
        expect.anything()
      );
    });
  });

  it('subscribes to realtime notification and achievement events', async () => {
    renderProvider();
    await flushWithTimers();
    await waitFor(() => {
      expect(mockRealtimeOn).toHaveBeenCalledWith(
        'notification',
        expect.any(Function)
      );
      expect(mockRealtimeOn).toHaveBeenCalledWith(
        'achievement',
        expect.any(Function)
      );
    });
  });
});

// ── Logout ────────────────────────────────────────────────────────────────
describe('SocialContext - logout', () => {
  it('clears auth state on logout', async () => {
    const payload = btoa(
      JSON.stringify({
        sub: 'u1',
        role: 'flat',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    localStorage.setItem('access_token', `header.${payload}.sig`);

    renderProvider();
    await flushWithTimers();

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId('isAuthenticated').textContent).toBe('true');
    });

    // Trigger logout
    act(() => {
      screen.getByTestId('logout-btn').click();
    });

    expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
    expect(screen.getByTestId('username').textContent).toBe('none');
  });

  it('removes access_token from localStorage', async () => {
    localStorage.setItem('access_token', 'test-token');
    localStorage.setItem('refresh_token', 'test-refresh');

    renderProvider();
    await flushWithTimers();

    act(() => {
      screen.getByTestId('logout-btn').click();
    });

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });

  it('clears apiCache on logout', async () => {
    const payload = btoa(
      JSON.stringify({sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600})
    );
    localStorage.setItem('access_token', `header.${payload}.sig`);

    renderProvider();
    await flushWithTimers();

    act(() => {
      screen.getByTestId('logout-btn').click();
    });

    expect(apiCache.clearAll).toHaveBeenCalled();
  });
});

// ── Derived state ─────────────────────────────────────────────────────────
describe('SocialContext - derived state', () => {
  it('isGuest is true when guest_mode is in localStorage', async () => {
    localStorage.setItem('guest_mode', 'true');
    renderProvider();
    await flushWithTimers();
    expect(screen.getByTestId('isGuest').textContent).toBe('true');
  });

  it('accessTier defaults to guest when guest_mode active', async () => {
    localStorage.setItem('guest_mode', 'true');
    renderProvider();
    await flushWithTimers();
    expect(screen.getByTestId('accessTier').textContent).toBe('guest');
  });
});

// ── auth:expired event ────────────────────────────────────────────────────
describe('SocialContext - auth:expired', () => {
  it('clears user state on auth:expired event', async () => {
    const payload = btoa(
      JSON.stringify({
        sub: 'u1',
        role: 'flat',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    );
    localStorage.setItem('access_token', `header.${payload}.sig`);

    renderProvider();
    await flushWithTimers();

    await waitFor(() => {
      expect(screen.getByTestId('isAuthenticated').textContent).toBe('true');
    });

    act(() => {
      window.dispatchEvent(new Event('auth:expired'));
    });

    expect(screen.getByTestId('isAuthenticated').textContent).toBe('false');
  });
});

// ── API error handling ────────────────────────────────────────────────────
describe('SocialContext - API errors', () => {
  it('handles fetchProfile failure gracefully', async () => {
    mockAxiosInstance.get.mockImplementation((url) => {
      if (url === '/auth/me') return Promise.reject(new Error('Network error'));
      return Promise.resolve({data: {}});
    });

    const payload = btoa(
      JSON.stringify({sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600})
    );
    localStorage.setItem('access_token', `header.${payload}.sig`);

    renderProvider();
    await flushWithTimers();

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
  });
});
