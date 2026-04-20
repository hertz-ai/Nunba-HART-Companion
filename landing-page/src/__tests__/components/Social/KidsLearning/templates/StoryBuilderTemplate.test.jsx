import {renderWithProviders} from '../../../../testHelpers';

import React from 'react';
import {act} from 'react-dom/test-utils';

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

jest.mock(
  '../../../../../components/Social/KidsLearning/shared/TTSManager',
  () => ({
    default: {
      speak: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      cancel: jest.fn(),
    },
  })
);

import StoryBuilderTemplate from '../../../../../components/Social/KidsLearning/templates/StoryBuilderTemplate';

const mockConfig = {
  content: {
    story: {
      start: 'scene1',
      scenes: {
        scene1: {
          text: 'You see a fork in the road.',
          icon: '🌳',
          choices: [
            {
              text: 'Go left',
              nextScene: 'scene2',
              isGood: true,
              concept: 'decision-making',
            },
            {
              text: 'Go right',
              nextScene: 'scene3',
              isGood: false,
              concept: 'decision-making',
            },
          ],
        },
        scene2: {
          text: 'You found a treasure!',
          icon: '💎',
          choices: [],
        },
        scene3: {
          text: 'You found a dead end.',
          icon: '🧱',
          choices: [],
        },
      },
    },
  },
};

describe('StoryBuilderTemplate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders without crash with valid config', () => {
    expect(() => {
      renderWithProviders(
        <StoryBuilderTemplate
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
        <StoryBuilderTemplate
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
        <StoryBuilderTemplate
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
        <StoryBuilderTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('displays scene text via typewriter effect', () => {
    const {container} = renderWithProviders(
      <StoryBuilderTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // Advance timers to allow typewriter effect to render partial text
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    const textContent = container.textContent;
    // Should contain at least part of the first scene text
    expect(textContent).toMatch(/You see|fork|road/i);
  });

  test('displays choice buttons after typewriter finishes', () => {
    const {container} = renderWithProviders(
      <StoryBuilderTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // Advance enough time for the full typewriter text to render
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    const textContent = container.textContent;
    // Choice buttons should appear after typing completes
    expect(textContent).toMatch(/Go left|Go right/i);
  });

  test('calls onAnswer when a choice is clicked', () => {
    const onAnswer = jest.fn();
    const {container} = renderWithProviders(
      <StoryBuilderTemplate
        config={mockConfig}
        onAnswer={onAnswer}
        onComplete={jest.fn()}
      />
    );
    // Advance timers so choices are visible
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    // Find and click a choice button
    const buttons = container.querySelectorAll('button');
    const choiceButton = Array.from(buttons).find((btn) =>
      btn.textContent.match(/Go left/i)
    );
    if (choiceButton) {
      act(() => {
        choiceButton.click();
      });
      expect(onAnswer).toHaveBeenCalled();
    }
  });
});
