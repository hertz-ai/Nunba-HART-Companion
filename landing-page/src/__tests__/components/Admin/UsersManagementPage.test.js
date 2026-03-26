import React from 'react';
import {screen, fireEvent, waitFor} from '@testing-library/react';

import {renderWithProviders, mockUsers} from '../../testHelpers';
import UsersManagementPage from '../../../components/Admin/UsersManagementPage';

// Mock the admin API
jest.mock('../../../services/socialApi', () => ({
  adminApi: {
    users: jest.fn(),
  },
  moderationApi: {
    ban: jest.fn(),
    unban: jest.fn(),
  },
}));

import {adminApi, moderationApi} from '../../../services/socialApi';

describe('UsersManagementPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    adminApi.users.mockResolvedValue({data: mockUsers});
  });

  describe('Rendering', () => {
    test('renders User Management title', async () => {
      renderWithProviders(<UsersManagementPage />);
      expect(screen.getByText('User Management')).toBeInTheDocument();
    });

    test('renders search input', async () => {
      renderWithProviders(<UsersManagementPage />);
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });

    test('renders users table headers', async () => {
      renderWithProviders(<UsersManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Username')).toBeInTheDocument();
        expect(screen.getByText('Type')).toBeInTheDocument();
        expect(screen.getByText('Karma')).toBeInTheDocument();
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Actions')).toBeInTheDocument();
      });
    });

    test('displays users from API', async () => {
      renderWithProviders(<UsersManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('john_doe')).toBeInTheDocument();
        expect(screen.getByText('hevolve_assistant')).toBeInTheDocument();
      });
    });
  });

  describe('User Type Badges', () => {
    test('displays human badge for human users', async () => {
      renderWithProviders(<UsersManagementPage />);

      await waitFor(() => {
        const humanBadges = screen.getAllByText('human');
        expect(humanBadges.length).toBeGreaterThan(0);
      });
    });

    test('displays agent badge for agent users', async () => {
      renderWithProviders(<UsersManagementPage />);

      await waitFor(() => {
        const agentBadges = screen.getAllByText('agent');
        expect(agentBadges.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Search Functionality', () => {
    test('updates search query on input', async () => {
      renderWithProviders(<UsersManagementPage />);

      const searchInput = screen.getByPlaceholderText(/search/i);
      fireEvent.change(searchInput, {target: {value: 'john'}});

      expect(searchInput.value).toBe('john');
    });
  });

  describe('Ban/Unban Actions', () => {
    test('shows Ban button for active users', async () => {
      renderWithProviders(<UsersManagementPage />);

      await waitFor(
        () => {
          const banButtons = screen.getAllByRole('button', {name: /^ban$/i});
          expect(banButtons.length).toBeGreaterThan(0);
        },
        {timeout: 5000}
      );
    });

    test('shows Unban button for banned users', async () => {
      renderWithProviders(<UsersManagementPage />);

      await waitFor(
        () => {
          const unbanButtons = screen.getAllByRole('button', {name: /unban/i});
          expect(unbanButtons.length).toBeGreaterThan(0);
        },
        {timeout: 5000}
      );
    });

    test('calls ban API when Ban button clicked', async () => {
      moderationApi.ban.mockResolvedValue({success: true});

      renderWithProviders(<UsersManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('john_doe')).toBeInTheDocument();
      });

      const banButtons = screen.getAllByRole('button', {name: /^ban$/i});
      fireEvent.click(banButtons[0]);

      await waitFor(() => {
        expect(moderationApi.ban).toHaveBeenCalled();
      });
    });

    test('calls unban API when Unban button clicked', async () => {
      moderationApi.unban.mockResolvedValue({success: true});

      renderWithProviders(<UsersManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('spam_account')).toBeInTheDocument();
      });

      const unbanButtons = screen.getAllByRole('button', {name: /unban/i});
      fireEvent.click(unbanButtons[0]);

      await waitFor(() => {
        expect(moderationApi.unban).toHaveBeenCalled();
      });
    });
  });

  describe('Status Display', () => {
    test('displays Active chip for non-banned users', async () => {
      renderWithProviders(<UsersManagementPage />);

      await waitFor(() => {
        const activeChips = screen.getAllByText('Active');
        expect(activeChips.length).toBeGreaterThan(0);
      });
    });

    test('displays Banned chip for banned users', async () => {
      renderWithProviders(<UsersManagementPage />);

      await waitFor(() => {
        const bannedChips = screen.getAllByText('Banned');
        expect(bannedChips.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Loading State', () => {
    test('shows loading skeleton while fetching users', () => {
      adminApi.users.mockReturnValue(new Promise(() => {}));

      renderWithProviders(<UsersManagementPage />);

      // Check for Skeleton elements (polished UI uses skeletons instead of spinners)
      const skeletons = document.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('handles API errors gracefully', async () => {
      adminApi.users.mockRejectedValue(new Error('Network Error'));

      renderWithProviders(<UsersManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('User Management')).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    test('shows no users message when list is empty', async () => {
      adminApi.users.mockResolvedValue({data: []});

      renderWithProviders(<UsersManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('No users found')).toBeInTheDocument();
      });
    });
  });
});
