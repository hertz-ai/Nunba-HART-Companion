import React from 'react';
import {screen, waitFor} from '@testing-library/react';

import {renderWithProviders} from '../../../testHelpers';
import OnboardingChecklist from '../../../../components/Social/shared/OnboardingChecklist';

// OnboardingChecklist doesn't take steps as props - it uses internal STEPS constant
// and fetches progress from onboardingApi.getProgress()

// Mock the API
jest.mock('../../../../services/socialApi', () => ({
  onboardingApi: {
    getProgress: jest.fn(),
    dismiss: jest.fn(),
  },
}));

import {onboardingApi} from '../../../../services/socialApi';

const mockProgress = {
  steps_completed: {
    welcome: true,
    first_follow: true,
    join_community: false,
    first_vote: false,
    first_comment: false,
    first_post: false,
    explore_agents: false,
    discover_experiments: false,
    try_kids_learning: false,
    explore_recipes: false,
  },
  completed_at: null,
};

describe('OnboardingChecklist Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onboardingApi.getProgress.mockResolvedValue({data: mockProgress});
  });

  describe('Rendering', () => {
    test('renders Getting Started header with progress count', async () => {
      renderWithProviders(<OnboardingChecklist />);

      await waitFor(() => {
        expect(screen.getByText(/Getting Started/)).toBeInTheDocument();
        // 2 out of 10 steps completed
        expect(screen.getByText(/2\/10/)).toBeInTheDocument();
      });
    });

    test('displays step labels', async () => {
      renderWithProviders(<OnboardingChecklist />);

      await waitFor(() => {
        expect(screen.getByText('Follow someone')).toBeInTheDocument();
        expect(screen.getByText('Join a community')).toBeInTheDocument();
        expect(screen.getByText('Create a post')).toBeInTheDocument();
      });
    });
  });

  describe('Progress', () => {
    test('shows progress bar', async () => {
      renderWithProviders(<OnboardingChecklist />);

      await waitFor(() => {
        const progressBar = document.querySelector('.MuiLinearProgress-root');
        expect(progressBar).toBeInTheDocument();
      });
    });
  });

  describe('Null States', () => {
    test('renders nothing when no progress data', async () => {
      onboardingApi.getProgress.mockResolvedValue({data: null});

      const {container} = renderWithProviders(<OnboardingChecklist />);

      await waitFor(() => {
        // Should render nothing (component returns null)
        expect(container.firstChild).toBeNull();
      });
    });

    test('renders nothing when onboarding completed', async () => {
      onboardingApi.getProgress.mockResolvedValue({
        data: {...mockProgress, completed_at: new Date().toISOString()},
      });

      const {container} = renderWithProviders(<OnboardingChecklist />);

      await waitFor(() => {
        // Should render nothing (component returns null when completed)
        expect(container.firstChild).toBeNull();
      });
    });
  });

  describe('Error Handling', () => {
    test('handles API errors gracefully', async () => {
      onboardingApi.getProgress.mockRejectedValue(new Error('Network Error'));

      const {container} = renderWithProviders(<OnboardingChecklist />);

      // Should not crash - renders nothing when no data
      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });
  });
});
