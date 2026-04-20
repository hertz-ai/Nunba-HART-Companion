import RealSocialContext from '../contexts/SocialContext';

import {
  ThemeProvider as MuiThemeProvider,
  createTheme,
} from '@mui/material/styles';
import {
  ThemeProvider as StylesThemeProvider,
  StylesProvider,
} from '@mui/styles';
import {render} from '@testing-library/react';
import React from 'react';
import {HelmetProvider} from 'react-helmet-async';
import {BrowserRouter} from 'react-router-dom';


const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#6C63FF',
    },
    secondary: {
      main: '#FF6B6B',
    },
    background: {
      default: '#0F0E17',
      paper: '#1F1E36',
    },
  },
  spacing: 8,
});

/**
 * Build a complete mock SocialContext value.
 * Uses the REAL SocialContext so useSocial() in components finds the value.
 */
function buildSocialContextValue(overrides = {}) {
  return {
    currentUser: overrides.currentUser ?? {
      id: 'admin-1',
      role: 'central',
      username: 'admin',
    },
    setCurrentUser: overrides.setCurrentUser || jest.fn(),
    resonance: overrides.resonance ?? null,
    fetchResonance: overrides.fetchResonance || jest.fn(),
    onboardingProgress: overrides.onboardingProgress ?? null,
    fetchOnboarding: overrides.fetchOnboarding || jest.fn(),
    currentSeason: overrides.currentSeason ?? null,
    setCurrentSeason: overrides.setCurrentSeason || jest.fn(),
    unreadCount: overrides.unreadCount ?? 0,
    fetchUnread: overrides.fetchUnread || jest.fn(),
    loading: overrides.loading ?? false,
    logout: overrides.logout || jest.fn(),
    isAuthenticated: overrides.isAuthenticated ?? true,
    userRole: overrides.userRole ?? 'central',
    isGuest: overrides.isGuest ?? false,
    accessTier: overrides.accessTier ?? 'central',
  };
}

/**
 * Custom render function with all required providers.
 * Uses the REAL SocialContext.Provider so useSocial() in components works correctly.
 */
export function renderWithProviders(ui, options = {}) {
  const {socialContextValue = {}, ...renderOptions} = options;
  const ctxValue = buildSocialContextValue(socialContextValue);
  function Wrapper({children}) {
    return (
      <HelmetProvider>
        <BrowserRouter>
          <StylesProvider injectFirst>
            <MuiThemeProvider theme={theme}>
              <StylesThemeProvider theme={theme}>
                <RealSocialContext.Provider value={ctxValue}>
                  {children}
                </RealSocialContext.Provider>
              </StylesThemeProvider>
            </MuiThemeProvider>
          </StylesProvider>
        </BrowserRouter>
      </HelmetProvider>
    );
  }
  return render(ui, {wrapper: Wrapper, ...renderOptions});
}

/**
 * Create a mock API success response
 */
export function mockApiSuccess(data) {
  return Promise.resolve({data, success: true});
}

/**
 * Create a mock API error response
 */
export function mockApiError(message = 'API Error', status = 500) {
  const error = new Error(message);
  error.response = {status, data: {error: message}};
  return Promise.reject(error);
}

/**
 * Wait for a specified duration
 */
export function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Flush promises - useful for waiting for async operations
 */
export function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

// ============================================
// MOCK DATA FOR REGRESSION TESTS
// ============================================

export const mockUsers = [
  {
    id: 'user-1',
    username: 'john_doe',
    display_name: 'John Doe',
    user_type: 'human',
    karma: 150,
    is_banned: false,
    created_at: '2024-01-15T10:30:00Z',
    email: 'john@example.com',
  },
  {
    id: 'user-2',
    username: 'hevolve_assistant',
    display_name: 'Hevolve Assistant',
    user_type: 'agent',
    karma: 1250,
    is_banned: false,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'user-3',
    username: 'spam_account',
    display_name: 'Spam Account',
    user_type: 'human',
    karma: -50,
    is_banned: true,
    created_at: '2024-02-01T08:00:00Z',
  },
  {
    id: 'user-4',
    username: 'moderator_jane',
    display_name: 'Jane Moderator',
    user_type: 'human',
    karma: 500,
    is_banned: false,
    created_at: '2023-12-01T12:00:00Z',
    role: 'moderator',
  },
];

export const mockReports = [
  {
    id: 'report-1',
    target_type: 'post',
    target_id: 'post-123',
    reporter_id: 'user-1',
    reporter_username: 'john_doe',
    reason: 'Spam or misleading content',
    status: 'pending',
    created_at: '2024-02-10T14:30:00Z',
  },
  {
    id: 'report-2',
    target_type: 'comment',
    target_id: 'comment-456',
    reporter_id: 'user-4',
    reporter_username: 'moderator_jane',
    reason: 'Harassment or bullying',
    status: 'pending',
    created_at: '2024-02-11T09:15:00Z',
  },
  {
    id: 'report-3',
    target_type: 'user',
    target_id: 'user-3',
    reporter_id: 'user-1',
    reporter_username: 'john_doe',
    reason: 'Impersonation',
    status: 'resolved',
    created_at: '2024-02-08T16:45:00Z',
  },
  {
    id: 'report-4',
    target_type: 'post',
    target_id: 'post-789',
    reporter_id: 'user-2',
    reporter_username: 'hevolve_assistant',
    reason: 'Inappropriate content',
    status: 'dismissed',
    created_at: '2024-02-05T11:20:00Z',
  },
];

export const mockChannels = [
  {
    id: 'channel-1',
    name: 'Telegram Production',
    type: 'telegram',
    status: 'connected',
    enabled: true,
    config: {bot_token: '***', chat_id: '-1001234567890'},
    message_count: 15420,
    last_activity: '2024-02-11T10:30:00Z',
  },
  {
    id: 'channel-2',
    name: 'Discord Support',
    type: 'discord',
    status: 'connected',
    enabled: true,
    config: {guild_id: '***', channel_id: '***'},
    message_count: 8750,
    last_activity: '2024-02-11T10:25:00Z',
  },
  {
    id: 'channel-3',
    name: 'WhatsApp Business',
    type: 'whatsapp',
    status: 'disconnected',
    enabled: false,
    config: {},
    message_count: 0,
    last_activity: null,
  },
  {
    id: 'channel-4',
    name: 'Slack Workspace',
    type: 'slack',
    status: 'pending',
    enabled: true,
    config: {workspace_id: '***'},
    message_count: 320,
    last_activity: '2024-02-10T18:00:00Z',
  },
];

export const mockWorkflows = [
  {
    id: 'workflow-1',
    name: 'New User Welcome',
    description: 'Sends welcome message to new users',
    nodes: [
      {id: 'n1', type: 'trigger', data: {event: 'user.created'}},
      {id: 'n2', type: 'delay', data: {duration: 5000}},
      {id: 'n3', type: 'action', data: {action: 'send_message'}},
    ],
    edges: [
      {source: 'n1', target: 'n2'},
      {source: 'n2', target: 'n3'},
    ],
    active: true,
    runs: 1250,
    last_run: '2024-02-11T10:00:00Z',
  },
  {
    id: 'workflow-2',
    name: 'Support Ticket Handler',
    description: 'Routes support tickets to appropriate agents',
    nodes: [
      {id: 'n1', type: 'trigger', data: {event: 'ticket.created'}},
      {id: 'n2', type: 'condition', data: {field: 'priority'}},
      {id: 'n3', type: 'action', data: {action: 'assign_agent'}},
      {id: 'n4', type: 'action', data: {action: 'escalate'}},
    ],
    edges: [
      {source: 'n1', target: 'n2'},
      {source: 'n2', target: 'n3', label: 'normal'},
      {source: 'n2', target: 'n4', label: 'urgent'},
    ],
    active: true,
    runs: 450,
    last_run: '2024-02-11T09:45:00Z',
  },
  {
    id: 'workflow-3',
    name: 'Inactive User Re-engagement',
    description: 'Sends re-engagement emails to inactive users',
    nodes: [
      {id: 'n1', type: 'trigger', data: {event: 'cron', schedule: '0 9 * * 1'}},
      {id: 'n2', type: 'action', data: {action: 'query_users'}},
      {id: 'n3', type: 'action', data: {action: 'send_email'}},
    ],
    edges: [
      {source: 'n1', target: 'n2'},
      {source: 'n2', target: 'n3'},
    ],
    active: false,
    runs: 12,
    last_run: '2024-02-05T09:00:00Z',
  },
];

export const mockStats = {
  total_users: 12580,
  posts_today: 347,
  active_agents: 24,
  growth_7d: 8.5,
  total_posts: 89450,
  total_comments: 256780,
  active_users_24h: 1250,
  new_users_7d: 892,
};

export const mockMetrics = {
  cpu: 42,
  memory: 68,
  disk: 35,
  network_in: 125.5,
  network_out: 89.2,
  requests_per_second: 245,
  error_rate: 0.02,
};

export const mockLatency = {
  api: 85,
  db: 12,
  llm: 1250,
  cache: 2,
  external: 350,
};

export const mockIdentity = {
  display_name: 'Hevolve AI Assistant',
  username: 'hevolve_ai',
  bio: "Your intelligent AI companion for learning and growth. I'm here to help you achieve your goals.",
  avatar_url: '/avatars/hevolve-default.png',
  tone: 'friendly, professional',
  system_prompt:
    'You are Hevolve AI, a helpful and knowledgeable assistant. Be concise but thorough in your responses.',
  traits: ['helpful', 'knowledgeable', 'patient', 'encouraging'],
  greeting: 'Hello! How can I assist you today?',
  fallback_response:
    "I'm not sure I understand. Could you please rephrase your question?",
};

export const mockAvatars = [
  {id: 'av1', url: '/avatars/avatar-1.png', name: 'Default Blue'},
  {id: 'av2', url: '/avatars/avatar-2.png', name: 'Professional'},
  {id: 'av3', url: '/avatars/avatar-3.png', name: 'Friendly'},
  {id: 'av4', url: '/avatars/avatar-4.png', name: 'Tech'},
];

export const mockSecuritySettings = {
  require_auth: true,
  rate_limiting: true,
  rate_limit: 100,
  ip_whitelist: [],
  ip_blacklist: ['192.168.1.100'],
  max_sessions_per_user: 5,
  session_timeout: 3600,
  enable_2fa: false,
};

export const mockMediaSettings = {
  image_generation: true,
  tts_enabled: true,
  max_image_size: 10,
  allowed_formats: ['png', 'jpg', 'gif', 'webp'],
  max_audio_duration: 60,
  compression_quality: 85,
};

export const mockResponseSettings = {
  temperature: 0.7,
  max_tokens: 4096,
  top_p: 0.9,
  frequency_penalty: 0.5,
  presence_penalty: 0.5,
  stop_sequences: ['Human:', 'User:'],
};

export const mockMemorySettings = {
  long_term: true,
  context_window: 20,
  retention_days: 90,
  max_memory_entries: 10000,
  auto_summarize: true,
  summarize_threshold: 50,
};

export const mockLogs = [
  {
    id: 'log-1',
    timestamp: '2024-02-11T10:30:45Z',
    level: 'info',
    message: 'User john_doe logged in successfully',
    source: 'auth',
  },
  {
    id: 'log-2',
    timestamp: '2024-02-11T10:31:12Z',
    level: 'warning',
    message: 'Rate limit approaching for IP 192.168.1.50',
    source: 'api',
  },
  {
    id: 'log-3',
    timestamp: '2024-02-11T10:32:00Z',
    level: 'error',
    message: 'Failed to connect to external API: timeout',
    source: 'integration',
  },
  {
    id: 'log-4',
    timestamp: '2024-02-11T10:33:15Z',
    level: 'info',
    message: 'Workflow "New User Welcome" executed successfully',
    source: 'workflow',
  },
];

// ============================================
// MOCK DATA FOR SOCIAL/GAMIFICATION TESTS
// ============================================

export const mockResonanceWallet = {
  level: 5,
  level_title: 'Explorer',
  pulse: 1250,
  spark: 340,
  signal: 2.45,
  xp: 750,
  xp_next_level: 1000,
};

export const mockTransactions = [
  {
    id: 't1',
    type: 'earn',
    currency: 'pulse',
    amount: 50,
    reason: 'Post liked',
    created_at: '2024-02-11T10:00:00Z',
  },
  {
    id: 't2',
    type: 'earn',
    currency: 'spark',
    amount: 10,
    reason: 'Daily streak',
    created_at: '2024-02-11T09:00:00Z',
  },
  {
    id: 't3',
    type: 'spend',
    currency: 'pulse',
    amount: 25,
    reason: 'Boost post',
    created_at: '2024-02-10T15:00:00Z',
  },
];

export const mockLeaderboard = [
  {
    rank: 1,
    user_id: 'u1',
    username: 'top_user',
    display_name: 'Top User',
    value: 5000,
  },
  {
    rank: 2,
    user_id: 'u2',
    username: 'second_user',
    display_name: 'Second User',
    value: 4500,
  },
  {
    rank: 3,
    user_id: 'u3',
    username: 'third_user',
    display_name: 'Third User',
    value: 4000,
  },
];

export const mockAchievements = [
  {
    id: 'ach-1',
    name: 'First Steps',
    description: 'Complete your first post',
    icon: 'star',
    category: 'content',
    tier: 'bronze',
    reward_pulse: 50,
    reward_xp: 100,
    unlocked: true,
    unlocked_at: '2024-02-01T10:00:00Z',
  },
  {
    id: 'ach-2',
    name: 'Social Butterfly',
    description: 'Follow 10 users',
    icon: 'people',
    category: 'social',
    tier: 'silver',
    reward_pulse: 100,
    reward_xp: 200,
    unlocked: false,
    progress: 5,
    target: 10,
  },
];

export const mockChallenges = [
  {
    id: 'ch-1',
    title: 'Weekly Poster',
    description: 'Create 5 posts this week',
    reward_pulse: 200,
    reward_xp: 500,
    progress: 2,
    target: 5,
    status: 'active',
    category: 'content',
    ends_at: new Date(Date.now() + 604800000).toISOString(),
  },
  {
    id: 'ch-2',
    title: 'Engagement Star',
    description: 'Like 20 posts',
    reward_pulse: 100,
    reward_xp: 250,
    progress: 15,
    target: 20,
    status: 'active',
    category: 'engagement',
    ends_at: new Date(Date.now() + 604800000).toISOString(),
  },
];

export const mockSeason = {
  id: 'season-1',
  name: 'Season 1: Genesis',
  description: 'The beginning of a new era',
  start_date: '2024-01-01T00:00:00Z',
  end_date: '2024-03-31T23:59:59Z',
  current_tier: 'silver',
  tier_progress: 65,
};

export const mockTiers = [
  {
    id: 'bronze',
    name: 'Bronze',
    min_points: 0,
    max_points: 999,
    color: '#cd7f32',
  },
  {
    id: 'silver',
    name: 'Silver',
    min_points: 1000,
    max_points: 4999,
    color: '#c0c0c0',
  },
  {
    id: 'gold',
    name: 'Gold',
    min_points: 5000,
    max_points: 14999,
    color: '#ffd700',
  },
  {
    id: 'platinum',
    name: 'Platinum',
    min_points: 15000,
    max_points: null,
    color: '#e5e4e2',
  },
];

export const mockStreak = {
  streak_days: 7,
  streak_best: 14,
  already_checked_in: false,
  last_checkin: '2024-02-10T08:00:00Z',
};

// CRA treats all files in __tests__/ as test suites.
// This ensures the module passes Jest's "must contain at least one test" rule.
test('testHelpers exports utility functions', () => {
  expect(typeof renderWithProviders).toBe('function');
});
