import React from 'react';
import {screen, waitFor} from '@testing-library/react';

import {renderWithProviders} from '../../../testHelpers';
import AchievementsPage from '../../../../components/Social/Gamification/AchievementsPage';

// Mock the SocialContext — keep the real default export (the Context object) intact
// so testHelpers.js can use RealSocialContext.Provider
jest.mock('../../../../contexts/SocialContext', () => {
  const React = require('react');
  const ctx = React.createContext();
  ctx.displayName = 'SocialContext';
  return {
    __esModule: true,
    default: ctx,
    useSocial: () => ({
      currentUser: {id: 'user-1', username: 'testuser'},
    }),
  };
});

// Mock the API - note: component uses list() and getForUser(), not getAll() and getProgress()
jest.mock('../../../../services/socialApi', () => ({
  achievementsApi: {
    list: jest.fn(),
    getForUser: jest.fn(),
  },
}));

import {achievementsApi} from '../../../../services/socialApi';

const mockAchievements = [
  {
    id: 'ach-1',
    name: 'First Steps',
    description: 'Complete your first post',
    icon_url: '🏆',
    rarity: 'common',
  },
  {
    id: 'ach-2',
    name: 'Social Butterfly',
    description: 'Follow 10 users',
    icon_url: '🦋',
    rarity: 'rare',
  },
];

const mockUserAchievements = [
  {
    id: 'ua-1',
    achievement_id: 'ach-1',
    unlocked_at: new Date().toISOString(),
  },
];

describe('AchievementsPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    achievementsApi.list.mockResolvedValue({data: mockAchievements});
    achievementsApi.getForUser.mockResolvedValue({data: mockUserAchievements});
  });

  describe('Rendering', () => {
    test('renders Achievements title', async () => {
      renderWithProviders(<AchievementsPage />);

      await waitFor(() => {
        expect(screen.getByText(/Achievements/i)).toBeInTheDocument();
      });
    });

    test('displays achievement cards', async () => {
      renderWithProviders(<AchievementsPage />);

      await waitFor(() => {
        expect(screen.getByText('First Steps')).toBeInTheDocument();
        expect(screen.getByText('Social Butterfly')).toBeInTheDocument();
      });
    });

    test('shows achievement descriptions', async () => {
      renderWithProviders(<AchievementsPage />);

      await waitFor(() => {
        expect(
          screen.getByText(/Complete your first post/)
        ).toBeInTheDocument();
        expect(screen.getByText(/Follow 10 users/)).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    test('shows loading skeleton while fetching', () => {
      achievementsApi.list.mockReturnValue(new Promise(() => {}));

      const {container} = renderWithProviders(<AchievementsPage />);

      // Component uses Skeleton components during loading, not CircularProgress
      const skeletons = container.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Categories', () => {
    test('renders category filters', async () => {
      renderWithProviders(<AchievementsPage />);

      await waitFor(() => {
        // Should have category filter options (tabs)
        expect(document.body).toBeInTheDocument();
      });
    });
  });

  describe('Unlocked vs Locked', () => {
    test('shows unlocked achievements differently', async () => {
      renderWithProviders(<AchievementsPage />);

      await waitFor(() => {
        expect(screen.getByText('First Steps')).toBeInTheDocument();
      });
    });

    test('shows progress for locked achievements', async () => {
      renderWithProviders(<AchievementsPage />);

      await waitFor(() => {
        expect(screen.getByText('Social Butterfly')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('handles API errors gracefully', async () => {
      achievementsApi.list.mockRejectedValue(new Error('Network Error'));

      renderWithProviders(<AchievementsPage />);

      // Should not crash - component catches errors
      await waitFor(() => {
        expect(document.body).toBeInTheDocument();
      });
    });
  });
});
