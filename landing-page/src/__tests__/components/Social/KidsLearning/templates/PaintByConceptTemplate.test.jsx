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
    hitTestRect: jest.fn(() => false),
  })
);

// Now import the component after mocks are set up
const PaintByConceptTemplate =
  require('../../../../../components/Social/KidsLearning/templates/PaintByConceptTemplate').default;

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockConfig = {
  title: 'Paint by Math',
  emoji: '\uD83C\uDFA8',
  template: 'paint-by-concept',
  content: {
    zones: [
      {
        id: 1,
        label: 'Sky',
        color: '#87CEEB',
        question: 'What is 2+3?',
        options: ['4', '5', '6'],
        correctIndex: 1,
        concept: 'addition',
      },
      {
        id: 2,
        label: 'Grass',
        color: '#228B22',
        question: 'What is 4-1?',
        options: ['2', '3', '4'],
        correctIndex: 1,
        concept: 'subtraction',
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaintByConceptTemplate', () => {
  test('renders canvas bridge element', () => {
    renderWithProviders(
      <PaintByConceptTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    expect(screen.getByTestId('canvas-game-bridge')).toBeInTheDocument();
  });

  test('can be imported without errors', () => {
    expect(PaintByConceptTemplate).toBeDefined();
    expect(typeof PaintByConceptTemplate).toBe('function');
  });

  test('renders with valid config', () => {
    expect(() => {
      renderWithProviders(
        <PaintByConceptTemplate
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
        <PaintByConceptTemplate
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
        <PaintByConceptTemplate
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
        <PaintByConceptTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('passes GameClass to CanvasGameBridge', () => {
    renderWithProviders(
      <PaintByConceptTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    const bridge = screen.getByTestId('canvas-game-bridge');
    expect(bridge).toHaveAttribute('data-template', 'PaintByConceptGame');
  });

  test('renders with single zone config', () => {
    const singleZoneConfig = {
      content: {
        zones: [
          {
            id: 1,
            label: 'Sun',
            color: '#FFD700',
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
        <PaintByConceptTemplate
          config={singleZoneConfig}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });
});
