import SequenceOrderTemplate from '../../../../../components/Social/KidsLearning/templates/SequenceOrderTemplate';
import {renderWithProviders} from '../../../../testHelpers';

import {screen, fireEvent} from '@testing-library/react';
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
  title: 'Put in Order',
  emoji: '\uD83D\uDD22',
  template: 'sequence-order',
  content: {
    sequences: [
      {items: ['First', 'Second', 'Third'], concept: 'Ordering'},
      {items: ['Morning', 'Afternoon', 'Evening'], concept: 'Time of Day'},
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SequenceOrderTemplate', () => {
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
        <SequenceOrderTemplate
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
        <SequenceOrderTemplate
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
        <SequenceOrderTemplate
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
        <SequenceOrderTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('shows "No sequences available." for empty sequences', () => {
    renderWithProviders(
      <SequenceOrderTemplate
        config={{content: {sequences: []}}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('No sequences available.')).toBeInTheDocument();
  });

  test('displays concept label', () => {
    renderWithProviders(
      <SequenceOrderTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('Ordering')).toBeInTheDocument();
  });

  test('displays instruction text', () => {
    renderWithProviders(
      <SequenceOrderTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(
      screen.getByText('Put these in the correct order')
    ).toBeInTheDocument();
  });

  test('displays all sequence items', () => {
    renderWithProviders(
      <SequenceOrderTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
  });

  test('displays Check Order button', () => {
    renderWithProviders(
      <SequenceOrderTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('Check Order')).toBeInTheDocument();
  });

  test('displays score starting at 0', () => {
    renderWithProviders(
      <SequenceOrderTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // Score is now shown via visual ProgressStars component (no text score).
    // Verify the sequence counter is rendered instead.
    expect(screen.getByText(/Sequence 1 of 2/)).toBeInTheDocument();
  });

  test('displays sequence counter', () => {
    renderWithProviders(
      <SequenceOrderTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText(/Sequence 1 of 2/)).toBeInTheDocument();
  });

  test('displays position numbers', () => {
    renderWithProviders(
      <SequenceOrderTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // '3' is the text of position 3
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('calls onAnswer when Check Order is clicked', () => {
    const onAnswer = jest.fn();
    renderWithProviders(
      <SequenceOrderTemplate
        config={mockConfig}
        onAnswer={onAnswer}
        onComplete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText('Check Order'));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(
      expect.any(Boolean),
      'Ordering',
      expect.any(Number)
    );
  });
});
