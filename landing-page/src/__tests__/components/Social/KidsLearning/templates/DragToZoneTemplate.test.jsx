import DragToZoneTemplate from '../../../../../components/Social/KidsLearning/templates/DragToZoneTemplate';
import {renderWithProviders} from '../../../../testHelpers';

import {screen} from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

jest.mock('../../../../../hooks/useAnimations', () => ({
  useReducedMotion: jest.fn(() => false),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockConfig = {
  title: 'Sort the Items',
  emoji: '\uD83D\uDCE6',
  template: 'drag-to-zone',
  content: {
    zones: [
      {id: 'fruits', label: 'Fruits', color: '#4CAF50'},
      {id: 'veggies', label: 'Vegetables', color: '#FF9800'},
    ],
    items: [
      {id: 1, label: 'Apple', zone: 'fruits', concept: 'food'},
      {id: 2, label: 'Carrot', zone: 'veggies', concept: 'food'},
      {id: 3, label: 'Banana', zone: 'fruits', concept: 'food'},
    ],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DragToZoneTemplate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('renders without crash with valid config', () => {
    expect(() => {
      renderWithProviders(
        <DragToZoneTemplate
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
        <DragToZoneTemplate
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
        <DragToZoneTemplate
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
        <DragToZoneTemplate
          config={undefined}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('shows "No sorting activity available." when no zones or items', () => {
    renderWithProviders(
      <DragToZoneTemplate
        config={{content: {zones: [], items: []}}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(
      screen.getByText('No sorting activity available.')
    ).toBeInTheDocument();
  });

  test('displays zone labels', () => {
    renderWithProviders(
      <DragToZoneTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('Fruits')).toBeInTheDocument();
    expect(screen.getByText('Vegetables')).toBeInTheDocument();
  });

  test('displays draggable item labels', () => {
    renderWithProviders(
      <DragToZoneTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Carrot')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  test('speaks instruction text via TTS on mount', () => {
    const {
      GameSounds,
    } = require('../../../../../components/Social/KidsLearning/shared/SoundManager');
    renderWithProviders(
      <DragToZoneTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    expect(GameSounds.speakText).toHaveBeenCalledWith(
      'Drag each item to the correct zone'
    );
  });

  test('displays score via GameLivesBar starting at 0', () => {
    renderWithProviders(
      <DragToZoneTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // Score is shown visually in GameLivesBar as a star counter.
    // GameLivesBar renders currentLevel/totalLevels and the score number.
    // The score starts at 0 and is rendered as text.
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  test('displays level indicator in GameLivesBar', () => {
    renderWithProviders(
      <DragToZoneTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    // GameLivesBar shows currentLevel and /totalLevels
    expect(screen.getByText(/\/3/)).toBeInTheDocument();
  });

  test('displays "Drop items here" placeholder in each zone', () => {
    renderWithProviders(
      <DragToZoneTemplate
        config={mockConfig}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );
    const placeholders = screen.getAllByText('Drop items here');
    expect(placeholders.length).toBe(2);
  });
});
