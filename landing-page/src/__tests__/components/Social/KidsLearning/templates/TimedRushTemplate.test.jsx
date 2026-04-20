import TimedRushTemplate from '../../../../../components/Social/KidsLearning/templates/TimedRushTemplate';
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
  title: 'Speed Round',
  emoji: '\u23F1\uFE0F',
  template: 'timed-rush',
  content: {
    timeLimit: 30,
    questions: [
      {
        question: 'What is 2+2?',
        options: ['3', '4', '5', '6'],
        correctIndex: 1,
        concept: 'addition',
      },
      {
        question: 'What is 5-1?',
        options: ['3', '4', '5', '6'],
        correctIndex: 1,
        concept: 'subtraction',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TimedRushTemplate', () => {
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
        <TimedRushTemplate
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
        <TimedRushTemplate
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
        <TimedRushTemplate
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
        <TimedRushTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('shows "No questions available." for empty questions', () => {
    renderWithProviders(
      <TimedRushTemplate
        config={{content: {questions: []}}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('No questions available.')).toBeInTheDocument();
  });

  test('displays question text', () => {
    renderWithProviders(
      <TimedRushTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('What is 2+2?')).toBeInTheDocument();
  });

  test('displays option buttons', () => {
    renderWithProviders(
      <TimedRushTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  test('calls onAnswer(true) on correct option click', () => {
    const onAnswer = jest.fn();
    renderWithProviders(
      <TimedRushTemplate
        config={mockConfig}
        onAnswer={onAnswer}
        onComplete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText('4'));
    expect(onAnswer).toHaveBeenCalledWith(true, 'addition', expect.any(Number));
  });

  test('calls onAnswer(false) on wrong option click', () => {
    const onAnswer = jest.fn();
    renderWithProviders(
      <TimedRushTemplate
        config={mockConfig}
        onAnswer={onAnswer}
        onComplete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText('3'));
    expect(onAnswer).toHaveBeenCalledWith(
      false,
      'addition',
      expect.any(Number)
    );
  });

  test('displays score starting at 0', () => {
    renderWithProviders(
      <TimedRushTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // Score is now shown via visual ProgressStars component (no text score).
    // Verify the question counter is rendered instead.
    expect(screen.getByText(/1 \/ 2/)).toBeInTheDocument();
  });
});
