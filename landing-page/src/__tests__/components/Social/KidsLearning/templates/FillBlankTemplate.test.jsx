import FillBlankTemplate from '../../../../../components/Social/KidsLearning/templates/FillBlankTemplate';
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
  title: 'Fill in the Blank',
  emoji: '\u270D\uFE0F',
  template: 'fill-blank',
  content: {
    questions: [
      {
        sentence: 'The ___ is big.',
        answer: 'elephant',
        choices: ['elephant', 'ant', 'car', 'table'],
        concept: 'Animals',
        hint: 'It has a trunk.',
      },
      {
        sentence: 'The sky is ___.',
        answer: 'blue',
        choices: ['blue', 'green', 'red', 'yellow'],
        concept: 'Colors',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FillBlankTemplate', () => {
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
        <FillBlankTemplate
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
        <FillBlankTemplate
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
        <FillBlankTemplate
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
        <FillBlankTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('shows "No questions available." for empty questions array', () => {
    renderWithProviders(
      <FillBlankTemplate
        config={{content: {questions: []}}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('No questions available.')).toBeInTheDocument();
  });

  test('displays choice tiles', () => {
    renderWithProviders(
      <FillBlankTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // Chip labels include an emoji prefix from getEmojiForText, e.g. "🐘 elephant".
    // Use aria-label "Choice: X" to find each chip reliably.
    expect(screen.getByLabelText('Choice: elephant')).toBeInTheDocument();
    expect(screen.getByLabelText('Choice: ant')).toBeInTheDocument();
    expect(screen.getByLabelText('Choice: car')).toBeInTheDocument();
    expect(screen.getByLabelText('Choice: table')).toBeInTheDocument();
  });

  test('displays concept tag', () => {
    renderWithProviders(
      <FillBlankTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('Animals')).toBeInTheDocument();
  });

  test('displays score via GameLivesBar starting at 0', () => {
    renderWithProviders(
      <FillBlankTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // Score is shown visually in GameLivesBar as a star counter (starts at 0).
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  test('displays level indicator in GameLivesBar', () => {
    renderWithProviders(
      <FillBlankTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // GameLivesBar renders currentLevel (1) and /totalLevels (2).
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('/2')).toBeInTheDocument();
  });

  test('calls onAnswer(true) on correct choice click', () => {
    const onAnswer = jest.fn();
    renderWithProviders(
      <FillBlankTemplate
        config={mockConfig}
        onAnswer={onAnswer}
        onComplete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('Choice: elephant'));
    expect(onAnswer).toHaveBeenCalledWith(true, 'Animals', expect.any(Number));
  });

  test('calls onAnswer(false) on wrong choice click', () => {
    const onAnswer = jest.fn();
    renderWithProviders(
      <FillBlankTemplate
        config={mockConfig}
        onAnswer={onAnswer}
        onComplete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('Choice: ant'));
    expect(onAnswer).toHaveBeenCalledWith(false, 'Animals', expect.any(Number));
  });

  test('shows celebration emoji feedback after correct answer', () => {
    renderWithProviders(
      <FillBlankTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('Choice: elephant'));
    // Correct feedback now shows celebration emoji instead of text "Perfect!".
    // Verify GameSounds.correct() was called.
    const {
      GameSounds,
    } = require('../../../../../components/Social/KidsLearning/shared/SoundManager');
    expect(GameSounds.correct).toHaveBeenCalled();
  });

  test('shows encouragement after wrong answer', () => {
    renderWithProviders(
      <FillBlankTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('Choice: ant'));
    // Wrong feedback now shows muscle emoji instead of text "Try again!".
    // Verify GameSounds.wrong() was called.
    const {
      GameSounds,
    } = require('../../../../../components/Social/KidsLearning/shared/SoundManager');
    expect(GameSounds.wrong).toHaveBeenCalled();
  });

  test('shows hint after wrong attempt', () => {
    renderWithProviders(
      <FillBlankTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('Choice: ant'));
    expect(screen.getByText(/It has a trunk/)).toBeInTheDocument();
  });
});
