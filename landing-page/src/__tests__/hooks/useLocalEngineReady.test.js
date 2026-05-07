/**
 * useLocalEngineReady.test.js — unit tests for the boot-time chat-queue gate.
 *
 * The hook returns ``true`` by default (optimistic) so the existing chat
 * queue's behavior is unchanged when /api/llm/status is unreachable, returns
 * an unparseable shape, or reports ``available: true`` (steady state).
 *
 * Realtime-reconciliation semantics: the hook polls forever (fast 2s while
 * not-ready, slow 30s while ready), so a mid-session crash / model swap /
 * daemon restart re-flips the gate.  Errors keep the last known state.
 */
import {act, renderHook} from '@testing-library/react';

const mockAxiosInstance = {
  get: jest.fn(() => Promise.resolve({})),
  post: jest.fn(() => Promise.resolve({})),
  patch: jest.fn(() => Promise.resolve({})),
  put: jest.fn(() => Promise.resolve({})),
  delete: jest.fn(() => Promise.resolve({})),
};

jest.mock('../../services/axiosFactory', () => ({
  createApiClient: jest.fn(() => mockAxiosInstance),
}));

const {useLocalEngineReady} = require('../../hooks/useLocalEngineReady');

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('useLocalEngineReady — optimistic default (zero-regression baseline)', () => {
  it('returns true synchronously on mount (before any fetch resolves)', () => {
    mockAxiosInstance.get.mockReturnValue(new Promise(() => {})); // never resolves
    const {result} = renderHook(() => useLocalEngineReady());
    expect(result.current).toBe(true);
  });

  it('stays true when /api/llm/status reports available:true', async () => {
    mockAxiosInstance.get.mockResolvedValue({available: true});
    const {result} = renderHook(() => useLocalEngineReady());
    await act(async () => {
      jest.advanceTimersByTime(0);
      await flushPromises();
    });
    expect(result.current).toBe(true);
  });

  it('stays true when the endpoint throws (network/500/404)', async () => {
    mockAxiosInstance.get.mockRejectedValue(new Error('network down'));
    const {result} = renderHook(() => useLocalEngineReady());
    await act(async () => {
      jest.advanceTimersByTime(0);
      await flushPromises();
    });
    expect(result.current).toBe(true);
  });

  it('keeps last known state when endpoint returns non-conforming shape', async () => {
    mockAxiosInstance.get.mockResolvedValue({something: 'else'});
    const {result} = renderHook(() => useLocalEngineReady());
    await act(async () => {
      jest.advanceTimersByTime(0);
      await flushPromises();
    });
    expect(result.current).toBe(true);
  });
});

describe('useLocalEngineReady — boot-time flip + autoflush', () => {
  it('flips to false when /api/llm/status reports available:false', async () => {
    mockAxiosInstance.get.mockResolvedValue({available: false});
    const {result} = renderHook(() => useLocalEngineReady());
    await act(async () => {
      jest.advanceTimersByTime(0);
      await flushPromises();
    });
    expect(result.current).toBe(false);
  });

  it('flips back to true once a later poll reports available:true', async () => {
    mockAxiosInstance.get
      .mockResolvedValueOnce({available: false})
      .mockResolvedValueOnce({available: true});

    const {result} = renderHook(() => useLocalEngineReady());

    // First poll → false
    await act(async () => {
      jest.advanceTimersByTime(0);
      await flushPromises();
    });
    expect(result.current).toBe(false);

    // Fast-poll cadence (2s) — second poll fires → true
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await flushPromises();
    });
    expect(result.current).toBe(true);
  });
});

describe('useLocalEngineReady — continuous realtime reconciliation', () => {
  it('keeps polling slowly after observed-ready (30s cadence)', async () => {
    mockAxiosInstance.get.mockResolvedValue({available: true});
    renderHook(() => useLocalEngineReady());

    await act(async () => {
      jest.advanceTimersByTime(0);
      await flushPromises();
    });
    const callsAfterFirst = mockAxiosInstance.get.mock.calls.length;
    expect(callsAfterFirst).toBe(1);

    // 29s — no second call yet (cadence is 30s after observed-ready)
    await act(async () => {
      jest.advanceTimersByTime(29000);
      await flushPromises();
    });
    expect(mockAxiosInstance.get.mock.calls.length).toBe(1);

    // +2s past the 30s mark — one more poll fires.
    await act(async () => {
      jest.advanceTimersByTime(2000);
      await flushPromises();
    });
    expect(mockAxiosInstance.get.mock.calls.length).toBe(2);
  });

  it('flips to false mid-session if a later poll reports available:false', async () => {
    mockAxiosInstance.get
      .mockResolvedValueOnce({available: true})   // initial: ready
      .mockResolvedValueOnce({available: false}); // 30s later: crashed

    const {result} = renderHook(() => useLocalEngineReady());

    // First poll
    await act(async () => {
      jest.advanceTimersByTime(0);
      await flushPromises();
    });
    expect(result.current).toBe(true);

    // 30s later — slow-poll cycle fires → false
    await act(async () => {
      jest.advanceTimersByTime(30000);
      await flushPromises();
    });
    expect(result.current).toBe(false);
  });

  it('keeps engineReady=true through a transient endpoint error', async () => {
    mockAxiosInstance.get
      .mockResolvedValueOnce({available: true})
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({available: true});

    const {result} = renderHook(() => useLocalEngineReady());

    await act(async () => {
      jest.advanceTimersByTime(0);
      await flushPromises();
    });
    expect(result.current).toBe(true);

    // 30s — error tick — still true (last known state preserved)
    await act(async () => {
      jest.advanceTimersByTime(30000);
      await flushPromises();
    });
    expect(result.current).toBe(true);

    // 30s — recovery tick — still true
    await act(async () => {
      jest.advanceTimersByTime(30000);
      await flushPromises();
    });
    expect(result.current).toBe(true);
  });

  it('cancels in-flight polling on unmount', async () => {
    mockAxiosInstance.get.mockResolvedValue({available: false});
    const {unmount} = renderHook(() => useLocalEngineReady());

    await act(async () => {
      jest.advanceTimersByTime(0);
      await flushPromises();
    });
    const callsBeforeUnmount = mockAxiosInstance.get.mock.calls.length;

    unmount();

    // The next poll cycle would fire at +2000ms (fast cadence) —
    // confirm it does not.
    await act(async () => {
      jest.advanceTimersByTime(60000);
      await flushPromises();
    });
    expect(mockAxiosInstance.get.mock.calls.length).toBe(callsBeforeUnmount);
  });
});
