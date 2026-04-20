import {renderWithProviders} from '../../../../testHelpers';

import React from 'react';

jest.mock(
  '../../../../../components/Social/KidsLearning/shared/SoundManager',
  () => ({
    default: {
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

import PuzzleAssembleTemplate from '../../../../../components/Social/KidsLearning/templates/PuzzleAssembleTemplate';

const mockConfig = {
  content: {
    puzzles: [
      {
        gridCols: 2,
        gridRows: 2,
        pieces: [
          {id: 1, label: 'A', row: 0, col: 0, color: '#FF0000'},
          {id: 2, label: 'B', row: 0, col: 1, color: '#00FF00'},
          {id: 3, label: 'C', row: 1, col: 0, color: '#0000FF'},
          {id: 4, label: 'D', row: 1, col: 1, color: '#FFFF00'},
        ],
        concept: 'spatial',
        title: 'Color Grid',
      },
    ],
  },
};

describe('PuzzleAssembleTemplate', () => {
  test('renders without crash with valid config', () => {
    expect(() => {
      renderWithProviders(
        <PuzzleAssembleTemplate
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
        <PuzzleAssembleTemplate
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
        <PuzzleAssembleTemplate
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
        <PuzzleAssembleTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('displays puzzle pieces with labels', () => {
    const {container} = renderWithProviders(
      <PuzzleAssembleTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    const text = container.textContent;
    // The piece labels A, B, C, D should appear somewhere in the rendered output
    expect(text).toContain('A');
    expect(text).toContain('B');
    expect(text).toContain('C');
    expect(text).toContain('D');
  });

  test('displays puzzle title', () => {
    const {container} = renderWithProviders(
      <PuzzleAssembleTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(container.textContent).toMatch(/Color Grid/i);
  });
});
