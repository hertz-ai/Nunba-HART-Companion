import {renderWithProviders} from '../../../../testHelpers';

import {screen} from '@testing-library/react';
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

// Mock CanvasGameBridge to avoid canvas complexity in unit tests
jest.mock(
  '../../../../../components/Social/KidsLearning/shared/CanvasGameBridge',
  () => {
    return function MockCanvasGameBridge({
      GameClass,
      config,
      onAnswer,
      onComplete,
    }) {
      return (
        <div
          data-testid="canvas-game-bridge"
          data-template={GameClass?.name || 'unknown'}
        />
      );
    };
  }
);

// Mock CanvasParticles (imported by BalloonPopTemplate)
jest.mock(
  '../../../../../components/Social/KidsLearning/shared/CanvasParticles',
  () => {
    return class MockParticlePool {
      constructor() {
        this.particles = [];
      }
      update() {}
      render() {}
      emitPreset() {}
      reset() {}
      static popExplosion() {
        return {};
      }
      static confettiBurst() {
        return {};
      }
      static sparkleBurst() {
        return {};
      }
    };
  }
);

// Mock CanvasSprites (imported by BalloonPopTemplate)
jest.mock(
  '../../../../../components/Social/KidsLearning/shared/CanvasSprites',
  () => ({
    drawBalloon: jest.fn(),
    drawText: jest.fn(),
    hitTestCircle: jest.fn(() => false),
  })
);

// Now import the component after mocks are set up
const BalloonPopTemplate =
  require('../../../../../components/Social/KidsLearning/templates/BalloonPopTemplate').default;

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockConfig = {
  title: 'Balloon Pop Quiz',
  emoji: '\uD83C\uDF88',
  template: 'balloon-pop',
  content: {
    questions: [
      {
        question: 'What is 2+2?',
        options: ['3', '4', '5'],
        correctIndex: 1,
        concept: 'addition',
      },
      {
        question: 'What is 5-3?',
        options: ['1', '2', '3'],
        correctIndex: 1,
        concept: 'subtraction',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BalloonPopTemplate', () => {
  test('renders canvas bridge element', () => {
    renderWithProviders(
      <BalloonPopTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    expect(screen.getByTestId('canvas-game-bridge')).toBeInTheDocument();
  });

  test('can be imported without errors', () => {
    expect(BalloonPopTemplate).toBeDefined();
    expect(typeof BalloonPopTemplate).toBe('function');
  });

  test('renders with valid config', () => {
    expect(() => {
      renderWithProviders(
        <BalloonPopTemplate
          config={mockConfig}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('renders with empty config', () => {
    expect(() => {
      renderWithProviders(
        <BalloonPopTemplate
          config={{}}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('renders with null config', () => {
    expect(() => {
      renderWithProviders(
        <BalloonPopTemplate
          config={null}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('renders with undefined config', () => {
    expect(() => {
      renderWithProviders(
        <BalloonPopTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('passes GameClass to CanvasGameBridge', () => {
    renderWithProviders(
      <BalloonPopTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    const bridge = screen.getByTestId('canvas-game-bridge');
    // The BalloonPopGame class name should be passed as data-template
    expect(bridge).toHaveAttribute('data-template', 'BalloonPopGame');
  });

  test('renders with single question config', () => {
    const singleQuestionConfig = {
      content: {
        questions: [
          {
            question: 'Is the sky blue?',
            options: ['Yes', 'No'],
            correctIndex: 0,
            concept: 'colors',
          },
        ],
      },
    };

    expect(() => {
      renderWithProviders(
        <BalloonPopTemplate
          config={singleQuestionConfig}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('renders with empty questions array', () => {
    expect(() => {
      renderWithProviders(
        <BalloonPopTemplate
          config={{content: {questions: []}}}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });
});
