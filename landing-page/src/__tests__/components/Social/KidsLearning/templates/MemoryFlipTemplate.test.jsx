import MemoryFlipTemplate from '../../../../../components/Social/KidsLearning/templates/MemoryFlipTemplate';
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
  title: 'Memory Flip',
  emoji: '\uD83C\uDFB4',
  template: 'memory-flip',
  content: {
    questions: [
      {
        cards: [
          {id: 1, label: 'Cat', emoji: '\uD83D\uDC31'},
          {id: 1, label: 'Cat', emoji: '\uD83D\uDC31'},
          {id: 2, label: 'Dog', emoji: '\uD83D\uDC36'},
          {id: 2, label: 'Dog', emoji: '\uD83D\uDC36'},
        ],
        gridCols: 2,
        concept: 'Animals',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemoryFlipTemplate', () => {
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
        <MemoryFlipTemplate
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
        <MemoryFlipTemplate
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
        <MemoryFlipTemplate
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
        <MemoryFlipTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('shows "No cards available." for empty questions', () => {
    renderWithProviders(
      <MemoryFlipTemplate
        config={{content: {questions: []}}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('No cards available.')).toBeInTheDocument();
  });

  test('shows "No cards available." for questions with empty cards', () => {
    renderWithProviders(
      <MemoryFlipTemplate
        config={{content: {questions: [{cards: []}]}}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('No cards available.')).toBeInTheDocument();
  });

  test('displays moves counter starting at 0', () => {
    renderWithProviders(
      <MemoryFlipTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // Moves counter (0) and GameLivesBar score (0) both render "0" text.
    // Verify at least two "0" elements exist (moves + score).
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });

  test('displays time counter starting at 0:00', () => {
    renderWithProviders(
      <MemoryFlipTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // Time is shown as just the formatted value next to a clock emoji (no "Time:" label).
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  test('displays score in GameLivesBar', () => {
    renderWithProviders(
      <MemoryFlipTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // Score is shown visually in GameLivesBar as a star counter.
    // Both the moves counter and score start at 0, rendering multiple "0" elements.
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(2);
  });

  test('displays concept label', () => {
    renderWithProviders(
      <MemoryFlipTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('Animals')).toBeInTheDocument();
  });

  test('renders card back placeholders (question marks)', () => {
    renderWithProviders(
      <MemoryFlipTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // 4 cards should show ? on their backs
    const questionMarks = screen.getAllByText('?');
    expect(questionMarks.length).toBe(4);
  });
});
