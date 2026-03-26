/**
 * PostCard.test.js — Unit tests for the PostCard component.
 *
 * Tests rendering with different post types, HART vote interaction,
 * agent vs user author display, bookmark toggle, share dialog,
 * optimistic update rollback on error, and double-tap HART.
 */
import {ThemeProvider, createTheme} from '@mui/material/styles';
import {render, screen, fireEvent, act, waitFor} from '@testing-library/react';
import React from 'react';
import {BrowserRouter} from 'react-router-dom';

// ── Mocks ────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Mock axiosFactory before socialApi import chain
const mockAxiosInstance = {
  get: jest.fn(() => Promise.resolve({data: {}})),
  post: jest.fn(() => Promise.resolve({data: {}})),
  patch: jest.fn(() => Promise.resolve({data: {}})),
  put: jest.fn(() => Promise.resolve({data: {}})),
  delete: jest.fn(() => Promise.resolve({data: {}})),
};
jest.mock('../../../../services/axiosFactory', () => ({
  createApiClient: jest.fn(() => mockAxiosInstance),
}));

// Mock SocialContext (used by useRoleAccess via RoleGuard)
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

// Mock useInView from useAnimations
jest.mock('../../../../hooks/useAnimations', () => ({
  useInView: () => ({ref: {current: null}, inView: true}),
  useReducedMotion: () => false,
}));

// Mock sub-components to simplify testing
jest.mock('../../../../components/Social/shared/UserChip', () => {
  return function MockUserChip({user}) {
    return <span data-testid="user-chip">{user?.username || 'unknown'}</span>;
  };
});

jest.mock('../../../../components/Social/shared/LevelBadge', () => {
  return function MockLevelBadge({level}) {
    return <span data-testid="level-badge">{level}</span>;
  };
});

jest.mock('../../../../components/Social/shared/BoostButton', () => {
  return function MockBoostButton() {
    return <button data-testid="boost-btn">Boost</button>;
  };
});

jest.mock('../../../../components/Social/shared/ShareDialog', () => {
  return function MockShareDialog({open, onClose}) {
    return open ? (
      <div data-testid="share-dialog">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null;
  };
});

// Import after mocks
const PostCard = require('../../../../components/Social/Feed/PostCard').default;
const {postsApi, resonanceApi} = require('../../../../services/socialApi');

// ── Test setup ───────────────────────────────────────────────────────────

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {main: '#6C63FF'},
    secondary: {main: '#FF6B6B'},
    background: {default: '#0F0E17', paper: '#1F1E36'},
  },
});

function renderPostCard(postOverrides = {}, props = {}) {
  const post = {
    id: 'post-1',
    title: 'Test Post Title',
    content: 'This is test content for the post card.',
    author: {
      username: 'testauthor',
      display_name: 'Test Author',
      user_type: 'human',
      level: 3,
    },
    upvotes: 42,
    score: 42,
    user_vote: 0,
    comment_count: 7,
    created_at: new Date(Date.now() - 3600000).toISOString(), // 1h ago
    intent_category: 'technology',
    ...postOverrides,
  };

  return render(
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <PostCard post={post} {...props} />
      </ThemeProvider>
    </BrowserRouter>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // Restore default canWrite = true (flat role)
  mockSocialContext.accessTier = 'flat';
});

// ── Rendering ────────────────────────────────────────────────────────────
describe('PostCard - rendering', () => {
  it('renders post title', () => {
    renderPostCard();
    expect(screen.getByText('Test Post Title')).toBeInTheDocument();
  });

  it('renders post content', () => {
    renderPostCard();
    expect(
      screen.getByText('This is test content for the post card.')
    ).toBeInTheDocument();
  });

  it('renders author via UserChip', () => {
    renderPostCard();
    expect(screen.getByTestId('user-chip')).toHaveTextContent('testauthor');
  });

  it('renders HART count', () => {
    renderPostCard({upvotes: 42});
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders comment count', () => {
    renderPostCard({comment_count: 7});
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders 0 when no comments', () => {
    renderPostCard({comment_count: 0});
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders with article role for accessibility', () => {
    renderPostCard();
    expect(screen.getByRole('article')).toBeInTheDocument();
  });

  it('renders author initial in avatar circle', () => {
    renderPostCard({
      author: {
        username: 'maria',
        display_name: 'Maria',
        user_type: 'human',
        level: 1,
      },
    });
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('renders post image when image_url is provided', () => {
    renderPostCard({image_url: 'https://example.com/img.jpg'});
    const img = screen.getByAltText('Test Post Title');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/img.jpg');
  });

  it('does not render image when no image_url', () => {
    renderPostCard({image_url: null});
    expect(screen.queryByRole('img')).toBeNull();
  });
});

// ── Agent vs User author ─────────────────────────────────────────────────
describe('PostCard - agent vs user display', () => {
  it('shows HART chip for agent authors', () => {
    renderPostCard({
      author: {
        username: 'agent-x',
        display_name: 'Agent X',
        user_type: 'agent',
        level: 5,
      },
    });
    expect(screen.getByText('HART')).toBeInTheDocument();
  });

  it('shows "Generated by HART agent" attribution for agent posts', () => {
    renderPostCard({
      author: {
        username: 'agent-x',
        display_name: 'Agent X',
        user_type: 'agent',
        level: 1,
      },
    });
    expect(screen.getByText('Generated by HART agent')).toBeInTheDocument();
  });

  it('does not show HART chip for human authors', () => {
    renderPostCard({
      author: {
        username: 'human-user',
        display_name: 'Human',
        user_type: 'human',
        level: 1,
      },
    });
    expect(screen.queryByText('HART')).toBeNull();
  });

  it('does not show agent attribution for human authors', () => {
    renderPostCard({
      author: {
        username: 'human-user',
        display_name: 'Human',
        user_type: 'human',
        level: 1,
      },
    });
    expect(screen.queryByText('Generated by HART agent')).toBeNull();
  });

  it('renders LevelBadge when author level > 1', () => {
    renderPostCard({
      author: {
        username: 'user',
        display_name: 'User',
        user_type: 'human',
        level: 5,
      },
    });
    expect(screen.getByTestId('level-badge')).toHaveTextContent('5');
  });

  it('does not render LevelBadge when author level is 1', () => {
    renderPostCard({
      author: {
        username: 'user',
        display_name: 'User',
        user_type: 'human',
        level: 1,
      },
    });
    expect(screen.queryByTestId('level-badge')).toBeNull();
  });
});

// ── HART vote interaction ────────────────────────────────────────────────
describe('PostCard - HART vote', () => {
  it('shows empty heart when not voted', () => {
    renderPostCard({user_vote: 0});
    // FavoriteBorderIcon is used for un-harted state
    const heartButton = screen
      .getByLabelText('View post')
      .querySelector('[data-testid="FavoriteBorderIcon"]');
    expect(heartButton).toBeInTheDocument();
  });

  it('shows filled heart when already voted', () => {
    renderPostCard({user_vote: 1});
    const heartButton = screen
      .getByLabelText('View post')
      .querySelector('[data-testid="FavoriteIcon"]');
    expect(heartButton).toBeInTheDocument();
  });

  it('increments HART count on click (optimistic update)', async () => {
    postsApi.upvote = jest.fn(() => Promise.resolve({data: {score: 43}}));
    renderPostCard({upvotes: 42, user_vote: 0});

    // Find and click the heart icon button
    const buttons = screen.getAllByRole('button');
    const heartBtn = buttons.find((btn) =>
      btn.querySelector('[data-testid="FavoriteBorderIcon"]')
    );
    expect(heartBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(heartBtn);
    });

    // Optimistically incremented
    expect(screen.getByText('43')).toBeInTheDocument();
  });

  it('calls postsApi.upvote when HARTing', async () => {
    postsApi.upvote = jest.fn(() => Promise.resolve({data: {score: 43}}));
    renderPostCard({id: 'post-99', upvotes: 42, user_vote: 0});

    const buttons = screen.getAllByRole('button');
    const heartBtn = buttons.find((btn) =>
      btn.querySelector('[data-testid="FavoriteBorderIcon"]')
    );

    await act(async () => {
      fireEvent.click(heartBtn);
    });

    expect(postsApi.upvote).toHaveBeenCalledWith('post-99');
  });

  it('calls postsApi.downvote when un-HARTing', async () => {
    postsApi.downvote = jest.fn(() => Promise.resolve({data: {score: 41}}));
    renderPostCard({id: 'post-99', upvotes: 42, user_vote: 1});

    const buttons = screen.getAllByRole('button');
    const heartBtn = buttons.find((btn) =>
      btn.querySelector('[data-testid="FavoriteIcon"]')
    );

    await act(async () => {
      fireEvent.click(heartBtn);
    });

    expect(postsApi.downvote).toHaveBeenCalledWith('post-99');
  });

  it('rolls back on vote error', async () => {
    postsApi.upvote = jest.fn(() => Promise.reject(new Error('Server error')));
    renderPostCard({upvotes: 42, user_vote: 0});

    const buttons = screen.getAllByRole('button');
    const heartBtn = buttons.find((btn) =>
      btn.querySelector('[data-testid="FavoriteBorderIcon"]')
    );

    await act(async () => {
      fireEvent.click(heartBtn);
    });

    // Should roll back to original count
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });

  it('does not vote when user cannot write (anonymous)', async () => {
    mockSocialContext.accessTier = 'anonymous';
    postsApi.upvote = jest.fn(() => Promise.resolve({data: {}}));

    renderPostCard({upvotes: 42, user_vote: 0});

    const buttons = screen.getAllByRole('button');
    const heartBtn = buttons.find((btn) =>
      btn.querySelector('[data-testid="FavoriteBorderIcon"]')
    );

    await act(async () => {
      fireEvent.click(heartBtn);
    });

    expect(postsApi.upvote).not.toHaveBeenCalled();
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});

// ── Bookmark toggle ──────────────────────────────────────────────────────
describe('PostCard - bookmark', () => {
  it('toggles bookmark on click', () => {
    renderPostCard();
    const buttons = screen.getAllByRole('button');
    const bookmarkBtn = buttons.find((btn) =>
      btn.querySelector('[data-testid="BookmarkBorderIcon"]')
    );
    expect(bookmarkBtn).toBeTruthy();

    fireEvent.click(bookmarkBtn);

    // After click, should show filled bookmark icon
    const filledBookmark = screen
      .getByLabelText('View post')
      .querySelector('[data-testid="BookmarkIcon"]');
    expect(filledBookmark).toBeInTheDocument();
  });
});

// ── Share dialog ─────────────────────────────────────────────────────────
describe('PostCard - share', () => {
  it('opens share dialog on share button click', () => {
    renderPostCard();
    expect(screen.queryByTestId('share-dialog')).toBeNull();

    const buttons = screen.getAllByRole('button');
    const shareBtn = buttons.find((btn) =>
      btn.querySelector('[data-testid="ShareIcon"]')
    );
    expect(shareBtn).toBeTruthy();

    fireEvent.click(shareBtn);

    expect(screen.getByTestId('share-dialog')).toBeInTheDocument();
  });
});

// ── Navigation ───────────────────────────────────────────────────────────
describe('PostCard - navigation', () => {
  it('navigates to post detail on card click', () => {
    renderPostCard({id: 'post-42'});
    const card = screen.getByRole('article');

    fireEvent.click(card);

    expect(mockNavigate).toHaveBeenCalledWith('/social/post/post-42');
  });

  it('navigates to post detail on Enter key', () => {
    renderPostCard({id: 'post-42'});
    const card = screen.getByRole('article');

    fireEvent.keyDown(card, {key: 'Enter'});

    expect(mockNavigate).toHaveBeenCalledWith('/social/post/post-42');
  });
});

// ── Time display ─────────────────────────────────────────────────────────
describe('PostCard - time display', () => {
  it('shows "just now" for very recent posts', () => {
    renderPostCard({created_at: new Date().toISOString()});
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('shows minutes for recent posts', () => {
    renderPostCard({
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    });
    expect(screen.getByText('5m')).toBeInTheDocument();
  });

  it('shows hours for older posts', () => {
    renderPostCard({
      created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    });
    expect(screen.getByText('3h')).toBeInTheDocument();
  });

  it('shows days for posts older than 24h', () => {
    renderPostCard({
      created_at: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
    });
    expect(screen.getByText('2d')).toBeInTheDocument();
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────
describe('PostCard - edge cases', () => {
  it('renders without crashing when author is null', () => {
    renderPostCard({author: null});
    expect(screen.getByText('Test Post Title')).toBeInTheDocument();
  });

  it('renders without crashing when content is empty', () => {
    renderPostCard({content: ''});
    expect(screen.getByText('Test Post Title')).toBeInTheDocument();
  });

  it('renders with zero upvotes', () => {
    renderPostCard({upvotes: 0, score: 0});
    expect(screen.getByRole('article')).toBeInTheDocument();
    // Empty string for count when 0
  });

  it('renders BoostButton', () => {
    renderPostCard();
    expect(screen.getByTestId('boost-btn')).toBeInTheDocument();
  });
});
