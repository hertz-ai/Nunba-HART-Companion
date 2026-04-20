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

import SimulationTemplate from '../../../../../components/Social/KidsLearning/templates/SimulationTemplate';

const mockConfig = {
  content: {
    scenario: {
      title: 'Grocery Shopping',
      concept: 'money',
      description: 'Pick the healthy foods!',
      startingMoney: 10,
      items: [
        {
          name: 'Apple',
          price: 2,
          icon: '🍎',
          isGood: true,
          feedback: 'Healthy choice!',
        },
        {
          name: 'Candy',
          price: 1,
          icon: '🍬',
          isGood: false,
          feedback: 'Too much sugar!',
        },
        {
          name: 'Banana',
          price: 1,
          icon: '🍌',
          isGood: true,
          feedback: 'Great pick!',
        },
      ],
      goal: 'Buy all healthy items',
    },
  },
};

describe('SimulationTemplate', () => {
  test('renders without crash with valid config', () => {
    expect(() => {
      renderWithProviders(
        <SimulationTemplate
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
        <SimulationTemplate
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
        <SimulationTemplate
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
        <SimulationTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('displays scenario title', () => {
    const {container} = renderWithProviders(
      <SimulationTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(container.textContent).toMatch(/Grocery Shopping/i);
  });

  test('displays items', () => {
    const {container} = renderWithProviders(
      <SimulationTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    const text = container.textContent;
    expect(text).toMatch(/Apple/);
    expect(text).toMatch(/Candy/);
    expect(text).toMatch(/Banana/);
  });

  test('calls onAnswer(true) when a good item is clicked', () => {
    const onAnswer = jest.fn();
    const {container} = renderWithProviders(
      <SimulationTemplate
        config={mockConfig}
        onAnswer={onAnswer}
        onComplete={jest.fn()}
      />
    );
    // Find and click the Apple item (isGood: true)
    const buttons = container.querySelectorAll('button');
    const appleButton = Array.from(buttons).find((btn) =>
      btn.textContent.match(/Apple/i)
    );
    if (appleButton) {
      act(() => {
        appleButton.click();
      });
      expect(onAnswer).toHaveBeenCalledWith(true);
    }
  });

  test('calls onAnswer(false) when a bad item is clicked', () => {
    const onAnswer = jest.fn();
    const {container} = renderWithProviders(
      <SimulationTemplate
        config={mockConfig}
        onAnswer={onAnswer}
        onComplete={jest.fn()}
      />
    );
    // Find and click the Candy item (isGood: false)
    const buttons = container.querySelectorAll('button');
    const candyButton = Array.from(buttons).find((btn) =>
      btn.textContent.match(/Candy/i)
    );
    if (candyButton) {
      act(() => {
        candyButton.click();
      });
      expect(onAnswer).toHaveBeenCalledWith(false);
    }
  });
});
