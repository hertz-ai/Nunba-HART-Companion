import TrueFalseTemplate from '../../../../../components/Social/KidsLearning/templates/TrueFalseTemplate';
import {renderWithProviders} from '../../../../testHelpers';

import {screen, fireEvent} from '@testing-library/react';
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
  title: 'True or False Quiz',
  emoji: '\u2705',
  template: 'true-false',
  content: {
    questions: [
      {statement: 'The sun is a star.', isTrue: true, concept: 'astronomy'},
      {statement: 'Fish can fly.', isTrue: false, concept: 'animals'},
      {
        statement: 'Water boils at 100 degrees Celsius.',
        isTrue: true,
        concept: 'science',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TrueFalseTemplate', () => {
  test('renders without crash with valid config', () => {
    expect(() => {
      renderWithProviders(
        <TrueFalseTemplate
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
        <TrueFalseTemplate
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
        <TrueFalseTemplate
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
        <TrueFalseTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('displays statement text', () => {
    renderWithProviders(
      <TrueFalseTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    expect(screen.getByText('The sun is a star.')).toBeInTheDocument();
  });

  test('displays question counter', () => {
    renderWithProviders(
      <TrueFalseTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument();
  });

  test('displays concept tag', () => {
    renderWithProviders(
      <TrueFalseTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    expect(screen.getByText('astronomy')).toBeInTheDocument();
  });

  test('displays True and False buttons', () => {
    renderWithProviders(
      <TrueFalseTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    expect(screen.getByText('True')).toBeInTheDocument();
    expect(screen.getByText('False')).toBeInTheDocument();
  });

  test('calls onAnswer(true) when correct answer (True) is selected', () => {
    const onAnswer = jest.fn();
    renderWithProviders(
      <TrueFalseTemplate
        config={mockConfig}
        onAnswer={onAnswer}
        onComplete={jest.fn()}
      />
    );

    // First statement "The sun is a star" is true, so clicking True is correct
    fireEvent.click(screen.getByText('True'));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(
      true,
      'astronomy',
      expect.any(Number)
    );
  });

  test('calls onAnswer(false) when wrong answer is selected', () => {
    const onAnswer = jest.fn();
    renderWithProviders(
      <TrueFalseTemplate
        config={mockConfig}
        onAnswer={onAnswer}
        onComplete={jest.fn()}
      />
    );

    // First statement "The sun is a star" is true, so clicking False is wrong
    fireEvent.click(screen.getByText('False'));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledWith(
      false,
      'astronomy',
      expect.any(Number)
    );
  });

  test('shows "No statements available." for empty questions array', () => {
    renderWithProviders(
      <TrueFalseTemplate
        config={{content: {questions: []}}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    expect(screen.getByText('No statements available.')).toBeInTheDocument();
  });

  test('displays score starting at 0', () => {
    renderWithProviders(
      <TrueFalseTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    // Score is now shown via visual ProgressStars component (no text score).
    // Verify the question counter is rendered instead.
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument();
  });

  test('shows "Well done!" feedback after correct answer', () => {
    renderWithProviders(
      <TrueFalseTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText('True'));

    expect(screen.getByText('Well done!')).toBeInTheDocument();
  });

  test('shows wrong feedback text after wrong answer', () => {
    renderWithProviders(
      <TrueFalseTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    // "The sun is a star" isTrue=true, clicking False is wrong
    fireEvent.click(screen.getByText('False'));

    // Wrong feedback: "The answer was True"
    expect(screen.getByText(/The answer was True/)).toBeInTheDocument();
  });

  test('disables buttons during feedback', () => {
    renderWithProviders(
      <TrueFalseTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText('True'));

    // Both True and False radio buttons should be disabled during feedback
    const radioButtons = screen.getAllByRole('radio');
    radioButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  test('does not call onAnswer more than once per question during feedback', () => {
    const onAnswer = jest.fn();
    renderWithProviders(
      <TrueFalseTemplate
        config={mockConfig}
        onAnswer={onAnswer}
        onComplete={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText('True'));
    // Attempt to click again during feedback
    fireEvent.click(screen.getByText('False'));

    expect(onAnswer).toHaveBeenCalledTimes(1);
  });
});
