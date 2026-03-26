/**
 * FeedPage.test.js — Unit tests for the FeedPage component.
 *
 * Tests feed tab rendering, tab switching, empty state,
 * infinite scroll setup, interest filter chips, FAB visibility,
 * error banner, and Nunba Daily card.
 */
import {ThemeProvider, createTheme} from '@mui/material/styles';
import {render, screen, fireEvent, act, waitFor} from '@testing-library/react';
import React from 'react';
import {MemoryRouter} from 'react-router-dom';

// ── Mocks ────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Create stable jest.fn() references that FeedPage's module-level `fetchers`
// const will capture at import time (before any beforeEach overrides).
const mockPersonalized = jest.fn(() =>
  Promise.resolve({data: [], meta: {has_more: false}})
);
const mockGlobal = jest.fn(() =>
  Promise.resolve({data: [], meta: {has_more: false}})
);
const mockTrending = jest.fn(() =>
  Promise.resolve({data: [], meta: {has_more: false}})
);
const mockAgents = jest.fn(() =>
  Promise.resolve({data: [], meta: {has_more: false}})
);
const mockAgentSpotlight = jest.fn(() => Promise.resolve({data: null}));
const mockSeasonsCurrent = jest.fn(() => Promise.resolve({data: null}));
const mockEncountersSuggestions = jest.fn(() => Promise.resolve({data: []}));

jest.mock('../../../../services/socialApi', () => ({
  feedApi: {
    personalized: (...args) => mockPersonalized(...args),
    global: (...args) => mockGlobal(...args),
    trending: (...args) => mockTrending(...args),
    agents: (...args) => mockAgents(...args),
    agentSpotlight: (...args) => mockAgentSpotlight(...args),
  },
  seasonsApi: {
    current: (...args) => mockSeasonsCurrent(...args),
  },
  encountersApi: {
    suggestions: (...args) => mockEncountersSuggestions(...args),
  },
}));

// Mock SocialContext
const mockSocialContext = {
  currentUser: {id: 'u1', role: 'flat', username: 'testuser'},
  accessTier: 'flat',
  loading: false,
  isAuthenticated: true,
  isGuest: false,
  userRole: 'flat',
  unreadCount: 0,
  logout: jest.fn(),
};
jest.mock('../../../../contexts/SocialContext', () => ({
  __esModule: true,
  useSocial: () => mockSocialContext,
}));

// Mock useAnimations
jest.mock('../../../../hooks/useAnimations', () => ({
  useInView: () => ({ref: {current: null}, inView: true}),
  useReducedMotion: () => false,
}));

// Mock useAgentObserver
jest.mock('../../../../hooks/useAgentObserver', () => ({
  useScrollDepthObserver: jest.fn(),
}));

// Mock utils/animations
jest.mock('../../../../utils/animations', () => ({
  animFadeInUp: () => ({}),
  animSlideInUp: () => ({}),
}));

// Mock heavy sub-components
jest.mock('../../../../components/Social/Feed/PostCard', () => {
  return function MockPostCard({post}) {
    return <div data-testid={`post-${post.id}`}>{post.title}</div>;
  };
});

jest.mock('../../../../components/Social/Feed/ThoughtExperimentCard', () => {
  return function MockTECard({post}) {
    return <div data-testid={`te-${post.id}`}>{post.title}</div>;
  };
});

jest.mock('../../../../components/Social/Feed/FeedHeader', () => {
  return function MockFeedHeader() {
    return <div data-testid="feed-header">Feed Header</div>;
  };
});

jest.mock(
  '../../../../components/Social/Feed/CreateThoughtExperimentDialog',
  () => {
    return function MockCreateDialog({open, onCreated}) {
      return open ? (
        <div data-testid="create-dialog">
          <button onClick={() => onCreated({id: 'new-1', title: 'New Post'})}>
            Create
          </button>
        </div>
      ) : null;
    };
  }
);

jest.mock('../../../../components/Social/shared/PostCardSkeleton', () => {
  return function MockSkeleton({count}) {
    return <div data-testid="skeleton">Loading {count} skeletons</div>;
  };
});

jest.mock('../../../../components/Social/shared/InfiniteScroll', () => {
  return function MockInfiniteScroll({children, hasMore, loading, onLoadMore}) {
    return (
      <div
        data-testid="infinite-scroll"
        data-has-more={String(hasMore)}
        data-loading={String(loading)}
      >
        {children}
        {hasMore && !loading && (
          <button data-testid="load-more" onClick={onLoadMore}>
            Load More
          </button>
        )}
      </div>
    );
  };
});

jest.mock('../../../../components/Social/shared/EmptyState', () => {
  return function MockEmptyState({message}) {
    return <div data-testid="empty-state">{message}</div>;
  };
});

jest.mock('../../../../components/Social/shared/OnboardingChecklist', () => {
  return function MockOnboarding() {
    return null;
  };
});

jest.mock('../../../../components/Social/shared/SeasonBanner', () => {
  return function MockSeasonBanner({season, onDismiss}) {
    return (
      <div data-testid="season-banner">
        {season.name} <button onClick={onDismiss}>Dismiss</button>
      </div>
    );
  };
});

jest.mock('../../../../components/Social/shared/EncounterCard', () => {
  return function MockEncounterCard({encounter}) {
    return (
      <div data-testid={`encounter-${encounter.id}`}>
        {encounter.name || 'encounter'}
      </div>
    );
  };
});

jest.mock('../../../../components/Social/Autopilot', () => ({
  AutopilotBanner: function MockAutopilot() {
    return null;
  },
}));

jest.mock('../../../../components/Social/Ads', () => ({
  AdBanner: function MockAdBanner() {
    return null;
  },
  AdCard: function MockAdCard() {
    return null;
  },
}));

// Import after mocks
const FeedPage = require('../../../../components/Social/Feed/FeedPage').default;

// ── Test setup ───────────────────────────────────────────────────────────

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {main: '#6C63FF'},
    secondary: {main: '#FF6B6B'},
    background: {default: '#0F0E17', paper: '#1F1E36'},
  },
});

const mockPosts = [
  {
    id: 'p1',
    title: 'First Post',
    content: 'Content 1',
    intent_category: 'technology',
  },
  {
    id: 'p2',
    title: 'Second Post',
    content: 'Content 2',
    intent_category: 'health',
  },
  {
    id: 'p3',
    title: 'Third Post',
    content: 'Content 3',
    intent_category: 'technology',
  },
];

function renderFeedPage(initialPath = '/social') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ThemeProvider theme={theme}>
        <FeedPage />
      </ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSocialContext.accessTier = 'flat';
  mockSocialContext.currentUser = {
    id: 'u1',
    role: 'flat',
    username: 'testuser',
  };

  // Default feed API mocks
  mockPersonalized.mockImplementation(() =>
    Promise.resolve({data: mockPosts, meta: {has_more: false}})
  );
  mockGlobal.mockImplementation(() =>
    Promise.resolve({data: mockPosts, meta: {has_more: false}})
  );
  mockTrending.mockImplementation(() =>
    Promise.resolve({data: mockPosts, meta: {has_more: false}})
  );
  mockAgents.mockImplementation(() =>
    Promise.resolve({data: [], meta: {has_more: false}})
  );
  mockAgentSpotlight.mockImplementation(() => Promise.resolve({data: null}));
  mockSeasonsCurrent.mockImplementation(() => Promise.resolve({data: null}));
  mockEncountersSuggestions.mockImplementation(() =>
    Promise.resolve({data: []})
  );

  // Suppress scrollTo (not available in jsdom)
  window.scrollTo = jest.fn();
});

// ── Tab rendering ────────────────────────────────────────────────────────
describe('FeedPage - tabs', () => {
  it('renders all four feed tabs', async () => {
    renderFeedPage();
    await act(async () => {});

    expect(screen.getByText('For You')).toBeInTheDocument();
    expect(
      screen.getAllByText('Thought Experiments').length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Trending')).toBeInTheDocument();
    expect(screen.getByText('HARTs')).toBeInTheDocument();
  });

  it('defaults to "For You" tab and fetches personalized feed', async () => {
    renderFeedPage();
    await act(async () => {});

    await waitFor(() => {
      expect(mockPersonalized).toHaveBeenCalled();
    });
  });

  it('fetches personalized feed with correct params', async () => {
    renderFeedPage();
    await act(async () => {});

    await waitFor(() => {
      expect(mockPersonalized).toHaveBeenCalledWith(
        expect.objectContaining({limit: 20, offset: 0})
      );
    });
  });

  it('falls back to global feed when user is not authenticated', async () => {
    mockSocialContext.currentUser = null;
    renderFeedPage();
    await act(async () => {});

    await waitFor(() => {
      expect(mockGlobal).toHaveBeenCalled();
    });
  });

  it('switches to Trending tab on tab click', async () => {
    renderFeedPage();
    await act(async () => {});

    // Click Trending tab
    await act(async () => {
      fireEvent.click(screen.getByText('Trending'));
    });

    await waitFor(() => {
      expect(mockTrending).toHaveBeenCalled();
    });
  });

  it('switches to HARTs tab on tab click', async () => {
    renderFeedPage();
    await act(async () => {});

    await act(async () => {
      fireEvent.click(screen.getByText('HARTs'));
    });

    await waitFor(() => {
      expect(mockAgents).toHaveBeenCalled();
    });
  });
});

// ── Post rendering ───────────────────────────────────────────────────────
describe('FeedPage - post rendering', () => {
  it('renders posts returned from API', async () => {
    renderFeedPage();
    await act(async () => {});

    await waitFor(() => {
      expect(screen.getByTestId('post-p1')).toBeInTheDocument();
      expect(screen.getByTestId('post-p2')).toBeInTheDocument();
      expect(screen.getByTestId('post-p3')).toBeInTheDocument();
    });
  });

  it('renders thought experiment cards for TE posts', async () => {
    mockPersonalized.mockImplementation(() =>
      Promise.resolve({
        data: [{id: 'te1', title: 'TE Post', is_thought_experiment: true}],
        meta: {has_more: false},
      })
    );

    renderFeedPage();
    await act(async () => {});

    await waitFor(() => {
      expect(screen.getByTestId('te-te1')).toBeInTheDocument();
    });
  });

  it('shows empty state when no posts returned', async () => {
    mockPersonalized.mockImplementation(() =>
      Promise.resolve({data: [], meta: {has_more: false}})
    );

    renderFeedPage();
    await act(async () => {});

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });
});

// ── Interest filter chips ────────────────────────────────────────────────
describe('FeedPage - interest filters', () => {
  it('renders All chip and interest topic chips', async () => {
    renderFeedPage();
    await act(async () => {});

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Technology')).toBeInTheDocument();
    expect(screen.getByText('Health')).toBeInTheDocument();
    expect(screen.getByText('Education')).toBeInTheDocument();
    expect(screen.getByText('Environment')).toBeInTheDocument();
    expect(screen.getByText('Community')).toBeInTheDocument();
    expect(screen.getByText('Equity')).toBeInTheDocument();
  });

  it('filters posts when a topic chip is clicked', async () => {
    renderFeedPage();
    await act(async () => {});

    // Wait for posts to appear
    await waitFor(() => {
      expect(screen.getByTestId('post-p1')).toBeInTheDocument();
    });

    // Click Technology filter
    await act(async () => {
      fireEvent.click(screen.getByText('Technology'));
    });

    // Only technology posts should remain (p1, p3)
    expect(screen.getByTestId('post-p1')).toBeInTheDocument();
    expect(screen.getByTestId('post-p3')).toBeInTheDocument();
    // Health post should be filtered out
    expect(screen.queryByTestId('post-p2')).toBeNull();
  });

  it('clears filter when All chip is clicked', async () => {
    renderFeedPage();
    await act(async () => {});

    await waitFor(() => {
      expect(screen.getByTestId('post-p1')).toBeInTheDocument();
    });

    // Apply filter then clear
    await act(async () => {
      fireEvent.click(screen.getByText('Technology'));
    });
    expect(screen.queryByTestId('post-p2')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByText('All'));
    });
    expect(screen.getByTestId('post-p2')).toBeInTheDocument();
  });
});

// ── Infinite scroll ──────────────────────────────────────────────────────
describe('FeedPage - infinite scroll', () => {
  it('renders InfiniteScroll component', async () => {
    renderFeedPage();
    await act(async () => {});

    await waitFor(() => {
      expect(screen.getByTestId('infinite-scroll')).toBeInTheDocument();
    });
  });

  it('sets hasMore=false when API returns no more', async () => {
    mockPersonalized.mockImplementation(() =>
      Promise.resolve({
        data: mockPosts,
        meta: {has_more: false},
      })
    );

    renderFeedPage();
    await act(async () => {});

    await waitFor(() => {
      const scrollEl = screen.getByTestId('infinite-scroll');
      expect(scrollEl.getAttribute('data-has-more')).toBe('false');
    });
  });

  it('sets hasMore=true when API indicates more pages', async () => {
    mockPersonalized.mockImplementation(() =>
      Promise.resolve({
        data: mockPosts,
        meta: {has_more: true},
      })
    );

    renderFeedPage();
    await act(async () => {});

    await waitFor(() => {
      const scrollEl = screen.getByTestId('infinite-scroll');
      expect(scrollEl.getAttribute('data-has-more')).toBe('true');
    });
  });
});

// ── FAB (Floating Action Button) ─────────────────────────────────────────
describe('FeedPage - FAB', () => {
  it('shows create FAB for authenticated users with write access', async () => {
    mockSocialContext.accessTier = 'flat';
    renderFeedPage();
    await act(async () => {});

    expect(
      screen.getByLabelText('Create thought experiment')
    ).toBeInTheDocument();
  });

  it('hides create FAB for anonymous users', async () => {
    mockSocialContext.accessTier = 'anonymous';
    renderFeedPage();
    await act(async () => {});

    expect(screen.queryByLabelText('Create thought experiment')).toBeNull();
  });

  it('hides create FAB for guest users', async () => {
    mockSocialContext.accessTier = 'guest';
    renderFeedPage();
    await act(async () => {});

    expect(screen.queryByLabelText('Create thought experiment')).toBeNull();
  });

  it('opens create dialog on FAB click', async () => {
    renderFeedPage();
    await act(async () => {});

    expect(screen.queryByTestId('create-dialog')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Create thought experiment'));
    });

    expect(screen.getByTestId('create-dialog')).toBeInTheDocument();
  });
});

// ── Nunba Daily card ─────────────────────────────────────────────────────
describe('FeedPage - Nunba Daily', () => {
  it('renders Nunba Daily card', async () => {
    renderFeedPage();
    await act(async () => {});

    expect(screen.getByText('Nunba Daily')).toBeInTheDocument();
  });

  it('shows Autopilot chip in daily card', async () => {
    renderFeedPage();
    await act(async () => {});

    expect(screen.getByText('Autopilot')).toBeInTheDocument();
  });
});

// ── Error handling ───────────────────────────────────────────────────────
describe('FeedPage - error handling', () => {
  it('shows error banner when fetch fails on initial load', async () => {
    mockPersonalized.mockImplementation(() =>
      Promise.reject(new Error('Network error'))
    );

    renderFeedPage();
    await act(async () => {});

    await waitFor(() => {
      expect(screen.getByText(/unable to load feed/i)).toBeInTheDocument();
    });
  });
});

// ── Feed header ──────────────────────────────────────────────────────────
describe('FeedPage - header', () => {
  it('renders feed header component', async () => {
    renderFeedPage();
    await act(async () => {});

    expect(screen.getByTestId('feed-header')).toBeInTheDocument();
  });
});

// ── Skeletons ────────────────────────────────────────────────────────────
describe('FeedPage - loading state', () => {
  it('renders skeletons during initial load', () => {
    // Make API never resolve to keep initialLoad=true
    mockPersonalized.mockImplementation(() => new Promise(() => {}));

    renderFeedPage();

    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });
});
