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

// Mock CanvasParticles
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

// Mock CanvasSprites
jest.mock(
  '../../../../../components/Social/KidsLearning/shared/CanvasSprites',
  () => ({
    drawRoundedRect: jest.fn(),
    drawText: jest.fn(),
    drawCircle: jest.fn(),
    drawStar: jest.fn(),
    drawHealthBar: jest.fn(),
    hitTestRect: jest.fn(() => false),
  })
);

// Now import the component after mocks are set up
const MathCastleTemplate =
  require('../../../../../components/Social/KidsLearning/templates/MathCastleTemplate').default;

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockConfig = {
  title: 'Math Castle',
  emoji: '\uD83C\uDFF0',
  template: 'math-castle',
  content: {
    questions: [
      {
        question: 'What is 5x2?',
        options: ['8', '10', '12'],
        correctIndex: 1,
        concept: 'multiplication',
      },
      {
        question: 'What is 6x3?',
        options: ['15', '18', '21'],
        correctIndex: 1,
        concept: 'multiplication',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MathCastleTemplate', () => {
  test('renders canvas bridge element', () => {
    renderWithProviders(
      <MathCastleTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    expect(screen.getByTestId('canvas-game-bridge')).toBeInTheDocument();
  });

  test('can be imported without errors', () => {
    expect(MathCastleTemplate).toBeDefined();
    expect(typeof MathCastleTemplate).toBe('function');
  });

  test('renders with valid config', () => {
    expect(() => {
      renderWithProviders(
        <MathCastleTemplate
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
        <MathCastleTemplate
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
        <MathCastleTemplate
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
        <MathCastleTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('passes GameClass to CanvasGameBridge', () => {
    renderWithProviders(
      <MathCastleTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    const bridge = screen.getByTestId('canvas-game-bridge');
    expect(bridge).toHaveAttribute('data-template', 'MathCastleGame');
  });

  test('renders with single question config', () => {
    const singleQuestionConfig = {
      content: {
        questions: [
          {
            question: 'What is 7x1?',
            options: ['6', '7', '8'],
            correctIndex: 1,
            concept: 'multiplication',
          },
        ],
      },
    };

    expect(() => {
      renderWithProviders(
        <MathCastleTemplate
          config={singleQuestionConfig}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });
});
