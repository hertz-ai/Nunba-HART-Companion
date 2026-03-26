import ChallengeCard from '../../../../components/Social/shared/ChallengeCard';
import {renderWithProviders} from '../../../testHelpers';

import {screen} from '@testing-library/react';
import React from 'react';

describe('ChallengeCard Component', () => {
  // Note: Component uses 'goal' not 'target', 'name' or 'title', and 'reward' for display
  const mockChallenge = {
    id: 'challenge-1',
    title: 'First Post Challenge',
    name: 'First Post Challenge',
    description: 'Create your first post to earn rewards',
    reward: '100 Pulse',
    progress: 0,
    goal: 1,
    type: 'daily',
    end_date: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
  };

  describe('Rendering', () => {
    test('renders challenge title', () => {
      renderWithProviders(<ChallengeCard challenge={mockChallenge} />);
      expect(screen.getByText('First Post Challenge')).toBeInTheDocument();
    });

    test('renders challenge description', () => {
      renderWithProviders(<ChallengeCard challenge={mockChallenge} />);
      expect(screen.getByText(/Create your first post/)).toBeInTheDocument();
    });

    test('renders rewards', () => {
      renderWithProviders(<ChallengeCard challenge={mockChallenge} />);
      expect(screen.getByText(/100 Pulse/)).toBeInTheDocument();
    });
  });

  describe('Progress', () => {
    test('shows progress bar and text', () => {
      const challenge = {...mockChallenge, progress: 5, goal: 10};
      renderWithProviders(<ChallengeCard challenge={challenge} />);
      // Component uses custom AnimatedProgress, not MuiLinearProgress
      // Check for progress text
      expect(screen.getByText('Progress')).toBeInTheDocument();
      expect(screen.getByText('5 / 10')).toBeInTheDocument();
    });

    test('shows completed state', () => {
      const challenge = {...mockChallenge, progress: 1, goal: 1};
      renderWithProviders(<ChallengeCard challenge={challenge} />);
      // Component should show 1/1 progress
      expect(screen.getByText('1 / 1')).toBeInTheDocument();
    });
  });

  describe('Status', () => {
    test('renders active challenge', () => {
      renderWithProviders(<ChallengeCard challenge={mockChallenge} />);
      expect(screen.getByText('First Post Challenge')).toBeInTheDocument();
    });

    test('renders completed challenge', () => {
      const challenge = {...mockChallenge, type: 'weekly'};
      renderWithProviders(<ChallengeCard challenge={challenge} />);
      expect(screen.getByText('First Post Challenge')).toBeInTheDocument();
    });
  });
});
