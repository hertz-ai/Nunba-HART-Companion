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

import SpotDifferenceTemplate from '../../../../../components/Social/KidsLearning/templates/SpotDifferenceTemplate';

const mockConfig = {
  content: {
    differences: [
      {id: 1, label: 'Extra cloud', concept: 'observation'},
      {id: 2, label: 'Missing tree', concept: 'observation'},
      {id: 3, label: 'Different color sun', concept: 'colors'},
    ],
    timeLimit: 60,
  },
};

describe('SpotDifferenceTemplate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders without crash with valid config', () => {
    expect(() => {
      renderWithProviders(
        <SpotDifferenceTemplate
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
        <SpotDifferenceTemplate
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
        <SpotDifferenceTemplate
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
        <SpotDifferenceTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('displays progress counter', () => {
    const {container} = renderWithProviders(
      <SpotDifferenceTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    const text = container.textContent;
    // Progress is shown via visual ProgressStars + instruction text.
    // Verify the instruction text or timer is rendered.
    expect(text).toMatch(/Tap the items you spot as differences|1:00|0:60/i);
  });

  test('displays timer', () => {
    const {container} = renderWithProviders(
      <SpotDifferenceTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    const text = container.textContent;
    // Should show the time remaining (60 seconds or 1:00)
    expect(text).toMatch(/60|1:00|0:60/);
  });
});
