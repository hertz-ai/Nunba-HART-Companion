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
    drawHole: jest.fn(),
    drawText: jest.fn(),
    drawRoundedRect: jest.fn(),
    hitTestCircle: jest.fn(() => false),
  })
);

// Now import the component after mocks are set up
const WhackAMoleTemplate =
  require('../../../../../components/Social/KidsLearning/templates/WhackAMoleTemplate').default;

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockConfig = {
  title: 'Whack-a-Mole Quiz',
  emoji: '\uD83D\uDD28',
  template: 'whack-a-mole',
  content: {
    questions: [
      {
        question: 'What is 3+3?',
        options: ['5', '6', '7'],
        correctIndex: 1,
        concept: 'addition',
      },
      {
        question: 'What is 4+2?',
        options: ['5', '6', '7'],
        correctIndex: 1,
        concept: 'addition',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WhackAMoleTemplate', () => {
  test('renders canvas bridge element', () => {
    renderWithProviders(
      <WhackAMoleTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    expect(screen.getByTestId('canvas-game-bridge')).toBeInTheDocument();
  });

  test('can be imported without errors', () => {
    expect(WhackAMoleTemplate).toBeDefined();
    expect(typeof WhackAMoleTemplate).toBe('function');
  });

  test('renders with valid config', () => {
    expect(() => {
      renderWithProviders(
        <WhackAMoleTemplate
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
        <WhackAMoleTemplate
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
        <WhackAMoleTemplate
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
        <WhackAMoleTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('passes GameClass to CanvasGameBridge', () => {
    renderWithProviders(
      <WhackAMoleTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    const bridge = screen.getByTestId('canvas-game-bridge');
    expect(bridge).toHaveAttribute('data-template', 'WhackAMoleGame');
  });

  test('renders with single question config', () => {
    const singleQuestionConfig = {
      content: {
        questions: [
          {
            question: 'What is 1+1?',
            options: ['1', '2', '3'],
            correctIndex: 1,
            concept: 'addition',
          },
        ],
      },
    };

    expect(() => {
      renderWithProviders(
        <WhackAMoleTemplate
          config={singleQuestionConfig}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });
});
