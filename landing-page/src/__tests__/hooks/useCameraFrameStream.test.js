/**
 * useCameraFrameStream.test.js — contract test for the VisionService
 * :5460 handshake.  The server expects:
 *   1. digit-string user_id
 *   2. 'video_start' (or 'screen_start')
 *   3. binary JPEG frames
 *
 * Prior bug: the hook sent JSON register — silently ignored by the
 * server, frames arrived with user_id=None, put_frame never fired.
 */
import {renderHook, act} from '@testing-library/react';

// ─── Mock WebSocket ─────────────────────────────────────────────
const mockWsInstances = [];

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.onopen = null;
    this.onerror = null;
    this.onclose = null;
    this.onmessage = null;
    mockWsInstances.push(this);
    // Simulate async open
    setTimeout(() => {
      this.readyState = 1;
      if (this.onopen) this.onopen({});
    }, 0);
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    if (this.onclose) this.onclose({});
  }
}
MockWebSocket.OPEN = 1;

// ─── Mock mediaDevices ──────────────────────────────────────────
const mockTrack = {stop: jest.fn()};
const mockStream = {getTracks: () => [mockTrack]};

beforeEach(() => {
  mockWsInstances.length = 0;
  mockTrack.stop.mockClear();
  global.WebSocket = MockWebSocket;
  Object.defineProperty(global.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: jest.fn(() => Promise.resolve(mockStream)),
    },
  });
  // jsdom doesn't implement HTMLMediaElement.play
  window.HTMLMediaElement.prototype.play = jest.fn(() => Promise.resolve());
  // Block the /vision/stream-port discovery — hook falls back to default.
  global.fetch = jest.fn(() => Promise.resolve({ok: false}));
});

// Import AFTER mocks
import useCameraFrameStream from '../../hooks/useCameraFrameStream';

// Wait until the hook has completed its async handshake (getUserMedia
// → video.play() → new WebSocket → onopen → two send() calls) or a
// hard deadline fires.  Fixed-delay flush was flaky because the first
// test in the suite paid a higher module-load latency than later tests.
const flush = async (predicate, timeoutMs = 500) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // Let pending microtasks + 10ms timers drain.
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (!predicate || predicate()) return;
  }
};

describe('useCameraFrameStream — VisionService :5460 handshake', () => {
  test('sends digit user_id first, then "video_start"', async () => {
    const {unmount} = renderHook(() =>
      useCameraFrameStream({enabled: true, userId: '42', channel: 'camera'})
    );

    await act(async () => {
      await flush(() => mockWsInstances[0]?.sent?.length >= 2);
    });

    expect(mockWsInstances.length).toBe(1);
    const ws = mockWsInstances[0];
    // First two frames must be: plain '42' string, then 'video_start'.
    // NOT JSON — that regression was silently ignored by the server.
    expect(ws.sent[0]).toBe('42');
    expect(ws.sent[1]).toBe('video_start');

    unmount();
  });

  test('screen channel sends "screen_start" handshake instead', async () => {
    const {unmount} = renderHook(() =>
      useCameraFrameStream({enabled: true, userId: '7', channel: 'screen'})
    );

    await act(async () => {
      await flush(() => mockWsInstances[0]?.sent?.length >= 2);
    });

    const ws = mockWsInstances[0];
    expect(ws.sent[0]).toBe('7');
    expect(ws.sent[1]).toBe('screen_start');

    unmount();
  });

  test('disabled → no WebSocket opened, no getUserMedia call', async () => {
    const {unmount} = renderHook(() =>
      useCameraFrameStream({enabled: false, userId: '42'})
    );

    await act(async () => {
      await flush(null, 50);
    });

    expect(mockWsInstances.length).toBe(0);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();

    unmount();
  });

  test('unmount stops the underlying MediaStream tracks', async () => {
    const {unmount} = renderHook(() =>
      useCameraFrameStream({enabled: true, userId: '42'})
    );

    await act(async () => {
      await flush(() => mockWsInstances[0]?.sent?.length >= 1);
    });
    expect(mockTrack.stop).not.toHaveBeenCalled();

    unmount();
    expect(mockTrack.stop).toHaveBeenCalled();
  });
});
