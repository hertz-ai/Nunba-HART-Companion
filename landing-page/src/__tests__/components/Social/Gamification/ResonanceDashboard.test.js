import React from 'react';
import {screen, waitFor} from '@testing-library/react';

import ResonanceDashboard from '../../../../components/Social/Gamification/ResonanceDashboard';

// Define mock data BEFORE using in mocks
const mockWalletData = {
  level: 5,
  level_title: 'Explorer',
  pulse: 1250,
  spark: 340,
  signal: 2.45,
  xp: 750,
  xp_next_level: 1000,
};

const mockTransactionsData = [
  {
    id: 't1',
    type: 'earn',
    currency: 'pulse',
    amount: 50,
    description: 'Post liked',
    created_at: new Date().toISOString(),
  },
  {
    id: 't2',
    type: 'earn',
    currency: 'spark',
    amount: 10,
    description: 'Daily streak',
    created_at: new Date().toISOString(),
  },
];

const mockLeaderboardData = [
  {
    rank: 1,
    user_id: 'u1',
    username: 'top_user',
    display_name: 'Top User',
    pulse: 5000,
  },
  {
    rank: 2,
    user_id: 'u2',
    username: 'second_user',
    display_name: 'Second User',
    pulse: 4500,
  },
];

const mockStreakData = {
  streak_days: 7,
  streak_best: 14,
  already_checked_in: false,
};

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
      resonance: null,
    }),
  };
});

// Mock the API
jest.mock('../../../../services/socialApi', () => ({
  resonanceApi: {
    getWallet: jest.fn(),
    getTransactions: jest.fn(),
    getLeaderboard: jest.fn(),
    getStreak: jest.fn(),
    dailyCheckin: jest.fn(),
  },
}));

import {resonanceApi} from '../../../../services/socialApi';
import {renderWithProviders} from '../../../testHelpers';

describe('ResonanceDashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resonanceApi.getWallet.mockResolvedValue({data: mockWalletData});
    resonanceApi.getTransactions.mockResolvedValue({
      data: mockTransactionsData,
    });
    resonanceApi.getLeaderboard.mockResolvedValue({data: mockLeaderboardData});
    resonanceApi.getStreak.mockResolvedValue({data: mockStreakData});
  });

  describe('Rendering', () => {
    test('renders Resonance title', async () => {
      renderWithProviders(<ResonanceDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Resonance')).toBeInTheDocument();
      });
    });

    test('renders wallet component', async () => {
      renderWithProviders(<ResonanceDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Pulse')).toBeInTheDocument();
        expect(screen.getByText('Spark')).toBeInTheDocument();
        expect(screen.getByText('Signal')).toBeInTheDocument();
      });
    });

    test('renders tabs for History and Leaderboard', async () => {
      renderWithProviders(<ResonanceDashboard />);

      await waitFor(() => {
        expect(screen.getByText('History')).toBeInTheDocument();
        expect(screen.getByText('Leaderboard')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    test('shows loading skeleton while fetching data', () => {
      resonanceApi.getWallet.mockReturnValue(new Promise(() => {}));
      resonanceApi.getTransactions.mockReturnValue(new Promise(() => {}));
      resonanceApi.getLeaderboard.mockReturnValue(new Promise(() => {}));
      resonanceApi.getStreak.mockReturnValue(new Promise(() => {}));

      const {container} = renderWithProviders(<ResonanceDashboard />);

      // Component uses Skeleton components during loading, not CircularProgress
      const skeletons = container.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Streak Section', () => {
    test('displays streak information', async () => {
      renderWithProviders(<ResonanceDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Day Streak')).toBeInTheDocument();
        // Streak number is displayed inside a styled box
        expect(screen.getByText('7')).toBeInTheDocument();
      });
    });

    test('shows check-in button when not checked in', async () => {
      renderWithProviders(<ResonanceDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Check In')).toBeInTheDocument();
      });
    });

    test('hides check-in button when already checked in', async () => {
      resonanceApi.getStreak.mockResolvedValue({
        data: {...mockStreakData, already_checked_in: true},
      });

      renderWithProviders(<ResonanceDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Day Streak')).toBeInTheDocument();
      });

      expect(screen.queryByText('Check In')).not.toBeInTheDocument();
    });
  });

  describe('Transactions', () => {
    test('displays recent transactions section', async () => {
      renderWithProviders(<ResonanceDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Recent Transactions')).toBeInTheDocument();
      });
    });

    test('shows empty state when no transactions', async () => {
      resonanceApi.getTransactions.mockResolvedValue({data: []});

      renderWithProviders(<ResonanceDashboard />);

      await waitFor(() => {
        expect(screen.getByText('No transactions yet.')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('handles API errors gracefully', async () => {
      resonanceApi.getWallet.mockRejectedValue(new Error('Network Error'));
      resonanceApi.getTransactions.mockRejectedValue(
        new Error('Network Error')
      );
      resonanceApi.getLeaderboard.mockRejectedValue(new Error('Network Error'));
      resonanceApi.getStreak.mockRejectedValue(new Error('Network Error'));

      renderWithProviders(<ResonanceDashboard />);

      // Should not crash - wait for loading to complete
      await waitFor(() => {
        expect(screen.getByText('Resonance')).toBeInTheDocument();
      });
    });
  });

  describe('API Calls', () => {
    test('calls all required APIs on mount', async () => {
      renderWithProviders(<ResonanceDashboard />);

      await waitFor(() => {
        expect(resonanceApi.getWallet).toHaveBeenCalledTimes(1);
        expect(resonanceApi.getTransactions).toHaveBeenCalledTimes(1);
        // Leaderboard is called twice - once on mount and once when tab changes
        expect(resonanceApi.getLeaderboard).toHaveBeenCalled();
        expect(resonanceApi.getStreak).toHaveBeenCalledTimes(1);
      });
    });
  });
});
