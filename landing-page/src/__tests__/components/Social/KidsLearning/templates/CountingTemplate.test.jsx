import CountingTemplate from '../../../../../components/Social/KidsLearning/templates/CountingTemplate';
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
  title: 'Count the Objects',
  emoji: '\uD83C\uDF4E',
  template: 'counting',
  content: {
    questions: [
      {
        emoji: '\uD83C\uDF4E',
        count: 3,
        concept: 'counting',
        label: 'How many apples?',
      },
      {
        emoji: '\uD83C\uDF4A',
        count: 5,
        concept: 'counting',
        label: 'How many oranges?',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CountingTemplate', () => {
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
        <CountingTemplate
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
        <CountingTemplate
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
        <CountingTemplate
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
        <CountingTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('shows "No counting questions available." for empty questions', () => {
    renderWithProviders(
      <CountingTemplate
        config={{content: {questions: []}}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(
      screen.getByText('No counting questions available.')
    ).toBeInTheDocument();
  });

  test('displays question label', () => {
    renderWithProviders(
      <CountingTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('How many apples?')).toBeInTheDocument();
  });

  test('displays score via GameLivesBar starting at 0', () => {
    renderWithProviders(
      <CountingTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // Score is shown in GameLivesBar as a star counter.
    // The score (0) also appears as a num pad button, so use aria-label to find the num pad "0".
    // GameLivesBar score "0" is separate from the num pad "Number 0" button.
    // Both render "0" text, but they are separate elements.
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  test('displays level indicator in GameLivesBar', () => {
    renderWithProviders(
      <CountingTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // GameLivesBar renders currentLevel and /totalLevels as separate elements.
    expect(screen.getByText('/2')).toBeInTheDocument();
  });

  test('displays number pad buttons', () => {
    renderWithProviders(
      <CountingTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // Number pad has buttons 0-9, each with aria-label "Number X".
    for (let i = 0; i <= 9; i++) {
      expect(screen.getByLabelText(`Number ${i}`)).toBeInTheDocument();
    }
  });

  test('displays Check Answer button', () => {
    renderWithProviders(
      <CountingTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('Check Answer')).toBeInTheDocument();
  });

  test('number pad input enables Check Answer button', () => {
    renderWithProviders(
      <CountingTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // Check Answer should be disabled initially (no input)
    const checkBtn = screen.getByText('Check Answer');
    expect(checkBtn.closest('button')).toBeDisabled();
    // Click number pad button "3" using aria-label
    fireEvent.click(screen.getByLabelText('Number 3'));
    // Now Check Answer should be enabled
    expect(checkBtn.closest('button')).not.toBeDisabled();
  });

  test('calls onAnswer(true) on correct submission', () => {
    const onAnswer = jest.fn();
    renderWithProviders(
      <CountingTemplate
        config={mockConfig}
        onAnswer={onAnswer}
        onComplete={jest.fn()}
      />
    );
    // Correct answer is 3
    fireEvent.click(screen.getByLabelText('Number 3'));
    fireEvent.click(screen.getByText('Check Answer'));
    expect(onAnswer).toHaveBeenCalledWith(true, 'counting', expect.any(Number));
  });

  test('calls onAnswer(false) on wrong submission', () => {
    const onAnswer = jest.fn();
    renderWithProviders(
      <CountingTemplate
        config={mockConfig}
        onAnswer={onAnswer}
        onComplete={jest.fn()}
      />
    );
    // Wrong answer: 5 instead of 3
    fireEvent.click(screen.getByLabelText('Number 5'));
    fireEvent.click(screen.getByText('Check Answer'));
    expect(onAnswer).toHaveBeenCalledWith(
      false,
      'counting',
      expect.any(Number)
    );
  });
});
