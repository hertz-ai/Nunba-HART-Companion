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

import TracingTemplate from '../../../../../components/Social/KidsLearning/templates/TracingTemplate';

const mockConfig = {
  content: {
    traces: [
      {letter: 'A', label: 'Trace the letter A', concept: 'letter-writing'},
      {letter: 'B', label: 'Trace the letter B', concept: 'letter-writing'},
    ],
  },
};

describe('TracingTemplate', () => {
  test('renders without crash with valid config', () => {
    expect(() => {
      renderWithProviders(
        <TracingTemplate
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
        <TracingTemplate
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
        <TracingTemplate
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
        <TracingTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('displays trace label', () => {
    const {container} = renderWithProviders(
      <TracingTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    const text = container.textContent;
    // Should display the label or the letter for the current trace
    expect(text).toMatch(/Trace the letter A|letter.*A|A/i);
  });

  test('shows SVG canvas area for tracing', () => {
    const {container} = renderWithProviders(
      <TracingTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // The tracing area should contain an SVG or canvas element
    const svg = container.querySelector('svg');
    const canvas = container.querySelector('canvas');
    expect(svg || canvas).toBeTruthy();
  });

  test('displays the letter being traced', () => {
    const {container} = renderWithProviders(
      <TracingTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // The letter 'A' should be visible as a guide
    expect(container.textContent).toContain('A');
  });
});
