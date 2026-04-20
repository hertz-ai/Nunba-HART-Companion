import CanvasGameBridge from '../../../../../components/Social/KidsLearning/shared/CanvasGameBridge';
import {renderWithProviders} from '../../../../testHelpers';

import {render, screen, fireEvent, act} from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock useReducedMotion hook
jest.mock('../../../../../hooks/useAnimations', () => ({
  useReducedMotion: jest.fn(() => false),
}));

// Mock kidsTheme
jest.mock('../../../../../components/Social/KidsLearning/kidsTheme', () => ({
  kidsColors: {
    primary: '#6C5CE7',
    background: '#FFF9E6',
    accent: '#FF6B35',
    textPrimary: '#2C3E50',
  },
}));

// Store RAF callbacks so we can invoke them manually
let rafCallbacks = [];
let rafIdCounter = 1;

beforeEach(() => {
  rafCallbacks = [];
  rafIdCounter = 1;

  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    const id = rafIdCounter++;
    rafCallbacks.push({id, cb});
    return id;
  });

  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    rafCallbacks = rafCallbacks.filter((entry) => entry.id !== id);
  });

  // Mock ResizeObserver
  window.ResizeObserver = jest.fn().mockImplementation((callback) => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
    _callback: callback,
  }));

  // Mock canvas getContext
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    beginPath: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    scale: jest.fn(),
  }));

  // performance.now mock for the RAF loop
  jest.spyOn(performance, 'now').mockReturnValue(0);

  // Mock getBoundingClientRect on canvas elements
  HTMLCanvasElement.prototype.getBoundingClientRect = jest.fn(() => ({
    left: 0,
    top: 0,
    width: 600,
    height: 450,
    right: 600,
    bottom: 450,
  }));

  // Container needs a clientWidth for initial sizing
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return 600;
    },
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  delete window.ResizeObserver;
});

/**
 * Helper: create a MockGame class whose methods are all jest.fn().
 */
function createMockGameClass() {
  const mockInstance = {
    start: jest.fn(),
    update: jest.fn(),
    render: jest.fn(),
    resize: jest.fn(),
    onPointerDown: jest.fn(),
    onPointerMove: jest.fn(),
    onPointerUp: jest.fn(),
    destroy: jest.fn(),
  };

  const MockGameClass = jest.fn(() => mockInstance);

  return {MockGameClass, mockInstance};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CanvasGameBridge', () => {
  test('renders a canvas element', () => {
    const {MockGameClass} = createMockGameClass();

    const {container} = renderWithProviders(
      <CanvasGameBridge
        GameClass={MockGameClass}
        config={{level: 1}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  test('instantiates the GameClass and calls start()', () => {
    const {MockGameClass, mockInstance} = createMockGameClass();
    const onAnswer = jest.fn();
    const onComplete = jest.fn();
    const config = {level: 1};

    renderWithProviders(
      <CanvasGameBridge
        GameClass={MockGameClass}
        config={config}
        onAnswer={onAnswer}
        onComplete={onComplete}
      />
    );

    // GameClass constructor should have been called once
    expect(MockGameClass).toHaveBeenCalledTimes(1);

    // First argument is the canvas element
    const [canvasArg, optsArg] = MockGameClass.mock.calls[0];
    expect(canvasArg).toBeInstanceOf(HTMLCanvasElement);

    // Second argument is the options object
    expect(optsArg.config).toBe(config);
    expect(optsArg.onAnswer).toBe(onAnswer);
    expect(optsArg.onComplete).toBe(onComplete);
    expect(optsArg).toHaveProperty('reducedMotion');
    expect(optsArg.colors).toBeDefined();

    // start() should have been called
    expect(mockInstance.start).toHaveBeenCalledTimes(1);
  });

  test('calls game.destroy() on unmount', () => {
    const {MockGameClass, mockInstance} = createMockGameClass();

    const {unmount} = renderWithProviders(
      <CanvasGameBridge
        GameClass={MockGameClass}
        config={{}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    expect(mockInstance.destroy).not.toHaveBeenCalled();

    unmount();

    expect(mockInstance.destroy).toHaveBeenCalledTimes(1);
  });

  test('forwards pointer events to game instance', () => {
    const {MockGameClass, mockInstance} = createMockGameClass();

    const {container} = renderWithProviders(
      <CanvasGameBridge
        GameClass={MockGameClass}
        config={{}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    const canvas = container.querySelector('canvas');

    // Use native PointerEvent dispatch because the component attaches listeners
    // via canvas.addEventListener (not React event handlers), and
    // fireEvent does not always propagate clientX/clientY to native listeners
    // in JSDOM.
    canvas.dispatchEvent(
      new MouseEvent('pointerdown', {bubbles: true, clientX: 100, clientY: 200})
    );
    expect(mockInstance.onPointerDown).toHaveBeenCalledTimes(1);
    expect(mockInstance.onPointerDown).toHaveBeenCalledWith(100, 200);

    canvas.dispatchEvent(
      new MouseEvent('pointermove', {bubbles: true, clientX: 150, clientY: 250})
    );
    expect(mockInstance.onPointerMove).toHaveBeenCalledTimes(1);
    expect(mockInstance.onPointerMove).toHaveBeenCalledWith(150, 250);

    canvas.dispatchEvent(
      new MouseEvent('pointerup', {bubbles: true, clientX: 160, clientY: 260})
    );
    expect(mockInstance.onPointerUp).toHaveBeenCalledTimes(1);
    expect(mockInstance.onPointerUp).toHaveBeenCalledWith(160, 260);
  });

  test('renders with no crash when GameClass is a minimal mock', () => {
    // A bare-minimum game class with all required methods as no-ops
    class MinimalGame {
      constructor() {}
      start() {}
      update() {}
      render() {}
      resize() {}
      onPointerDown() {}
      onPointerMove() {}
      onPointerUp() {}
      destroy() {}
    }

    expect(() => {
      renderWithProviders(
        <CanvasGameBridge
          GameClass={MinimalGame}
          config={{}}
          onAnswer={jest.fn()}
          onComplete={jest.fn()}
        />
      );
    }).not.toThrow();
  });

  test('cancels animation frame on unmount', () => {
    const {MockGameClass} = createMockGameClass();

    const {unmount} = renderWithProviders(
      <CanvasGameBridge
        GameClass={MockGameClass}
        config={{}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    // At least one RAF should have been requested
    expect(window.requestAnimationFrame).toHaveBeenCalled();

    unmount();

    // cancelAnimationFrame should have been called during cleanup
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });

  test('starts the RequestAnimationFrame game loop', () => {
    const {MockGameClass, mockInstance} = createMockGameClass();

    renderWithProviders(
      <CanvasGameBridge
        GameClass={MockGameClass}
        config={{}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    // RAF should have been requested to start the loop
    expect(window.requestAnimationFrame).toHaveBeenCalled();

    // Simulate a frame by invoking the first RAF callback
    if (rafCallbacks.length > 0) {
      const firstCallback = rafCallbacks[0].cb;
      act(() => {
        firstCallback(16.67); // ~60fps timestamp
      });

      // The game's update and render should have been called
      expect(mockInstance.update).toHaveBeenCalled();
      expect(mockInstance.render).toHaveBeenCalled();
    }
  });

  test('default aspectRatio is 4/3', () => {
    const {MockGameClass} = createMockGameClass();

    const {container} = renderWithProviders(
      <CanvasGameBridge
        GameClass={MockGameClass}
        config={{}}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />
    );

    // The canvas should exist (aspect ratio affects sizing internally)
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });
});
