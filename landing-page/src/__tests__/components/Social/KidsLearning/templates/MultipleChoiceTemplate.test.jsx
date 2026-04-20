import MultipleChoiceTemplate from '../../../../../components/Social/KidsLearning/templates/MultipleChoiceTemplate';
import {renderWithProviders} from '../../../../testHelpers';

import {screen, fireEvent, within} from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock SoundManager to prevent Web Audio API errors in tests
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

// Mock useReducedMotion
jest.mock('../../../../../hooks/useAnimations', () => ({
  useReducedMotion: jest.fn(() => false),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockConfig = {
  title: 'Test Quiz',
  emoji: '\uD83E\uDDEA',
  template: 'multiple-choice',
  content: {
    questions: [
      {
        question: 'What is 2+2?',
        options: ['3', '4', '5', '6'],
        correctIndex: 1,
        concept: 'addition',
      },
      {
        question: 'What is 3+1?',
        options: ['2', '4', '6', '8'],
        correctIndex: 1,
        concept: 'addition',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MultipleChoiceTemplate', () => {
  test('renders without crash with valid config', () => {
    expect(() => {
      renderWithProviders(
        <MultipleChoiceTemplate
          config={mockConfig}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('renders with empty config gracefully (no throw)', () => {
    expect(() => {
      renderWithProviders(
        <MultipleChoiceTemplate
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
        <MultipleChoiceTemplate
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
        <MultipleChoiceTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('displays question text', () => {
    renderWithProviders(
      <MultipleChoiceTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    expect(screen.getByText('What is 2+2?')).toBeInTheDocument();
  });

  test('displays level indicator in GameLivesBar', () => {
    renderWithProviders(
      <MultipleChoiceTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    // GameLivesBar renders currentLevel (1) and /totalLevels (2).
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('/2')).toBeInTheDocument();
  });

  test('displays concept tag', () => {
    renderWithProviders(
      <MultipleChoiceTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    expect(screen.getByText('addition')).toBeInTheDocument();
  });

  test('displays option buttons', () => {
    renderWithProviders(
      <MultipleChoiceTemplate
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

  test('displays option buttons with emoji circles', () => {
    renderWithProviders(
      <MultipleChoiceTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    // Options are rendered with visual emoji circles instead of letter labels.
    // Each option button has role="radio".
    const radioButtons = screen.getAllByRole('radio');
    expect(radioButtons.length).toBe(4);
  });

  test('calls onAnswer(true) on correct option click', () => {
    const onAnswer = jest.fn();
    renderWithProviders(
      <MultipleChoiceTemplate
        config={mockConfig}
        onAnswer={onAnswer}
        onComplete={jest.fn()}
      />
    );

    // Correct answer for first question is index 1 -> '4'
    fireEvent.click(screen.getByText('4'));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(true, 'addition', expect.any(Number));
  });

  test('calls onAnswer(false) on wrong option click', () => {
    const onAnswer = jest.fn();
    renderWithProviders(
      <MultipleChoiceTemplate
        config={mockConfig}
        onAnswer={onAnswer}
        onComplete={jest.fn()}
      />
    );

    // Wrong answer: '3' is index 0, correct is index 1
    fireEvent.click(screen.getByText('3'));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(
      false,
      'addition',
      expect.any(Number)
    );
  });

  test('shows "No questions available." for empty questions array', () => {
    renderWithProviders(
      <MultipleChoiceTemplate
        config={{content: {questions: []}}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    expect(screen.getByText('No questions available.')).toBeInTheDocument();
  });

  test('displays score via GameLivesBar starting at 0', () => {
    renderWithProviders(
      <MultipleChoiceTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    // Score is shown visually in GameLivesBar as a star counter.
    // The score starts at 0 and is rendered as text.
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  test('shows celebration emoji feedback after correct answer', () => {
    renderWithProviders(
      <MultipleChoiceTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText('4'));

    // Correct feedback now shows celebration emoji instead of text "Correct!".
    // The correct option gets a green glow style (correctBg + glowCorrect).
    // Verify GameSounds.correct() was called.
    const {
      GameSounds,
    } = require('../../../../../components/Social/KidsLearning/shared/SoundManager');
    expect(GameSounds.correct).toHaveBeenCalled();
  });

  test('shows wrong feedback after incorrect answer', () => {
    renderWithProviders(
      <MultipleChoiceTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText('3'));

    // Wrong feedback now shows emoji (muscle or pinch) instead of text.
    // Verify GameSounds.wrong() was called.
    const {
      GameSounds,
    } = require('../../../../../components/Social/KidsLearning/shared/SoundManager');
    expect(GameSounds.wrong).toHaveBeenCalled();
  });

  test('disables buttons during feedback', () => {
    renderWithProviders(
      <MultipleChoiceTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    // Click a wrong answer to trigger feedback
    const wrongButton = screen.getByText('3').closest('button');
    fireEvent.click(wrongButton);

    // All radio option buttons should be disabled during feedback
    const radioButtons = screen.getAllByRole('radio');
    radioButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});
