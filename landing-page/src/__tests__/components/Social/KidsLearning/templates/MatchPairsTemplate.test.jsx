import MatchPairsTemplate from '../../../../../components/Social/KidsLearning/templates/MatchPairsTemplate';
import {renderWithProviders} from '../../../../testHelpers';

import {screen} from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock(
  '../../../../../components/Social/KidsLearning/shared/SoundManager',
  () => ({
    GameSounds: {
      correct: jest.fn(),
      wrong: jest.fn(),
      tap: jest.fn(),
      complete: jest.fn(),
      streak: jest.fn(),
      intro: jest.fn(),
      countdownTick: jest.fn(),
      countdownEnd: jest.fn(),
      starEarned: jest.fn(),
      dragStart: jest.fn(),
      dragDrop: jest.fn(),
      cardFlip: jest.fn(),
      matchFound: jest.fn(),
      levelUp: jest.fn(),
      pop: jest.fn(),
      whoosh: jest.fn(),
      splash: jest.fn(),
      explosion: jest.fn(),
      gatePass: jest.fn(),
      enemyDefeat: jest.fn(),
      castleHit: jest.fn(),
      blockStack: jest.fn(),
      blockFall: jest.fn(),
      paintFill: jest.fn(),
      powerUp: jest.fn(),
      coinCollect: jest.fn(),
      speakText: jest.fn().mockResolvedValue(undefined),
      startBackgroundMusic: jest.fn(),
      stopBackgroundMusic: jest.fn(),
      stopTTS: jest.fn(),
      cleanup: jest.fn(),
      setMuted: jest.fn(),
      isMuted: jest.fn(() => false),
      warmUp: jest.fn().mockResolvedValue(undefined),
    },
    HapticPatterns: {},
    SoundEvents: {},
  })
);

jest.mock('../../../../../hooks/useAnimations', () => ({
  useReducedMotion: jest.fn(() => false),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockConfig = {
  title: 'Match the Pairs',
  emoji: '\uD83D\uDD17',
  template: 'match-pairs',
  content: {
    questions: [
      {
        pairs: [
          {left: 'Dog', right: 'Bark'},
          {left: 'Cat', right: 'Meow'},
          {left: 'Cow', right: 'Moo'},
        ],
        concept: 'Animal Sounds',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MatchPairsTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders without crash with valid config', () => {
    expect(() => {
      renderWithProviders(
        <MatchPairsTemplate
          config={mockConfig}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('renders with empty config gracefully', () => {
    expect(() => {
      renderWithProviders(
        <MatchPairsTemplate
          config={{}}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('renders with null config gracefully', () => {
    expect(() => {
      renderWithProviders(
        <MatchPairsTemplate
          config={null}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('renders with undefined config gracefully', () => {
    expect(() => {
      renderWithProviders(
        <MatchPairsTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('shows "No matching pairs available." for empty questions', () => {
    renderWithProviders(
      <MatchPairsTemplate
        config={{content: {questions: []}}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(
      screen.getByText('No matching pairs available.')
    ).toBeInTheDocument();
  });

  test('shows empty message for questions with no pairs', () => {
    renderWithProviders(
      <MatchPairsTemplate
        config={{content: {questions: [{pairs: []}]}}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(
      screen.getByText('No matching pairs available.')
    ).toBeInTheDocument();
  });

  test('displays left column items', () => {
    renderWithProviders(
      <MatchPairsTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('Dog')).toBeInTheDocument();
    expect(screen.getByText('Cat')).toBeInTheDocument();
    expect(screen.getByText('Cow')).toBeInTheDocument();
  });

  test('displays right column items', () => {
    renderWithProviders(
      <MatchPairsTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('Bark')).toBeInTheDocument();
    expect(screen.getByText('Meow')).toBeInTheDocument();
    expect(screen.getByText('Moo')).toBeInTheDocument();
  });

  test('displays concept label', () => {
    renderWithProviders(
      <MatchPairsTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('Animal Sounds')).toBeInTheDocument();
  });

  test('displays score in GameLivesBar', () => {
    renderWithProviders(
      <MatchPairsTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // Score is shown visually in GameLivesBar as a star counter.
    // GameLivesBar renders currentLevel (1) and /totalLevels (1).
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('/1')).toBeInTheDocument();
  });
});
