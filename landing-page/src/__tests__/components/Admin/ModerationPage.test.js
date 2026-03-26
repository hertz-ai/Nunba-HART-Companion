import React from 'react';
import {screen, fireEvent, waitFor} from '@testing-library/react';

import {renderWithProviders, mockReports} from '../../testHelpers';
import ModerationPage from '../../../components/Admin/ModerationPage';

// Mock the moderation API
jest.mock('../../../services/socialApi', () => ({
  moderationApi: {
    reports: jest.fn(),
    reviewReport: jest.fn(),
  },
}));

import {moderationApi} from '../../../services/socialApi';

describe('ModerationPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    moderationApi.reports.mockResolvedValue({data: mockReports});
  });

  describe('Rendering', () => {
    test('renders Moderation Queue title', async () => {
      renderWithProviders(<ModerationPage />);

      await waitFor(() => {
        expect(screen.getByText('Moderation Queue')).toBeInTheDocument();
      });
    });

    test('displays reports from API', async () => {
      renderWithProviders(<ModerationPage />);

      await waitFor(() => {
        // Multiple reports may mention john_doe
        const johnDoeElements = screen.getAllByText(/john_doe/);
        expect(johnDoeElements.length).toBeGreaterThan(0);
        expect(
          screen.getByText(/Spam or misleading content/)
        ).toBeInTheDocument();
      });
    });

    test('displays report target type and ID', async () => {
      renderWithProviders(<ModerationPage />);

      await waitFor(() => {
        expect(screen.getByText(/post: post-123/)).toBeInTheDocument();
      });
    });
  });

  describe('Status Badges', () => {
    test('displays pending status', async () => {
      renderWithProviders(<ModerationPage />);

      await waitFor(() => {
        const pendingBadges = screen.getAllByText('pending');
        expect(pendingBadges.length).toBeGreaterThan(0);
      });
    });

    test('displays resolved status', async () => {
      renderWithProviders(<ModerationPage />);

      await waitFor(() => {
        const resolvedBadges = screen.getAllByText('resolved');
        expect(resolvedBadges.length).toBeGreaterThan(0);
      });
    });

    test('displays dismissed status', async () => {
      renderWithProviders(<ModerationPage />);

      await waitFor(() => {
        const dismissedBadges = screen.getAllByText('dismissed');
        expect(dismissedBadges.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Report Actions', () => {
    test('shows Resolve and Dismiss buttons for pending reports', async () => {
      renderWithProviders(<ModerationPage />);

      await waitFor(() => {
        const resolveButtons = screen.getAllByRole('button', {
          name: /resolve/i,
        });
        const dismissButtons = screen.getAllByRole('button', {
          name: /dismiss/i,
        });
        expect(resolveButtons.length).toBeGreaterThan(0);
        expect(dismissButtons.length).toBeGreaterThan(0);
      });
    });

    test('calls reviewReport API with resolved when Resolve button clicked', async () => {
      moderationApi.reviewReport.mockResolvedValue({success: true});

      renderWithProviders(<ModerationPage />);

      await waitFor(() => {
        const johnDoeElements = screen.getAllByText(/john_doe/);
        expect(johnDoeElements.length).toBeGreaterThan(0);
      });

      const resolveButtons = screen.getAllByRole('button', {name: /resolve/i});
      fireEvent.click(resolveButtons[0]);

      await waitFor(() => {
        expect(moderationApi.reviewReport).toHaveBeenCalledWith(
          expect.any(String),
          {action: 'resolved'}
        );
      });
    });

    test('calls reviewReport API with dismissed when Dismiss button clicked', async () => {
      moderationApi.reviewReport.mockResolvedValue({success: true});

      renderWithProviders(<ModerationPage />);

      await waitFor(() => {
        const johnDoeElements = screen.getAllByText(/john_doe/);
        expect(johnDoeElements.length).toBeGreaterThan(0);
      });

      const dismissButtons = screen.getAllByRole('button', {name: /dismiss/i});
      fireEvent.click(dismissButtons[0]);

      await waitFor(() => {
        expect(moderationApi.reviewReport).toHaveBeenCalledWith(
          expect.any(String),
          {action: 'dismissed'}
        );
      });
    });
  });

  describe('Loading State', () => {
    test('shows loading skeletons while fetching reports', () => {
      moderationApi.reports.mockReturnValue(new Promise(() => {}));

      renderWithProviders(<ModerationPage />);

      // Polished UI uses skeletons instead of spinners
      const skeletons = document.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Empty State', () => {
    test('shows no reports message when list is empty', async () => {
      moderationApi.reports.mockResolvedValue({data: []});

      renderWithProviders(<ModerationPage />);

      await waitFor(() => {
        expect(
          screen.getByText('No reports to review at this time')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('handles API errors gracefully', async () => {
      moderationApi.reports.mockRejectedValue(new Error('Network Error'));

      renderWithProviders(<ModerationPage />);

      // Should not crash - wait for component to settle
      await waitFor(
        () => {
          // Either shows title or empty state
          const hasContent =
            screen.queryByText('Moderation Queue') ||
            screen.queryByText('No reports to review');
          expect(hasContent).toBeTruthy();
        },
        {timeout: 3000}
      );
    });
  });
});
