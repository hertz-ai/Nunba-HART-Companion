import {chatApi} from '../services/socialApi';

import {useEffect, useState} from 'react';

// Polling cadence — adaptive.  While the engine is not-ready we poll fast
// (2s) so the boot-time message queue auto-flushes promptly when the
// engine comes up.  Once ready we poll slowly (30s) so any later crash /
// model-swap / daemon restart is also reconciled — events can be missed,
// polling is the source of truth.  Both cadences combined are still under
// 1 request/second average even in the worst case.
const POLL_FAST_MS = 2000;
const POLL_SLOW_MS = 30000;

/**
 * useLocalEngineReady — track whether the local LLM is reachable.
 *
 * **Continuous realtime reconciliation.**  The hook polls
 * ``/api/llm/status`` (the existing endpoint, exposes ``available: bool``)
 * for the entire session — fast while not-ready, slow once ready.
 * Events can be missed (network blips, browser-tab backgrounding,
 * crossbar disconnects); polling is the load-bearing signal.
 *
 * Returns ``true`` by default (optimistic) so the chat input is unaffected
 * when:
 *   - The user is past first-boot (steady state — the common case).
 *   - Cloud-only mode is active and there is no local engine to wait on.
 *   - ``/api/llm/status`` is unreachable / returns an unparseable shape
 *     (network down, 500, 404, schema drift) — we'd rather let the user
 *     send than block forever on a flaky / missing endpoint.
 *
 * Flip semantics:
 *   - ``available === true``  → ready, poll slow.
 *   - ``available === false`` → not ready, poll fast (boot or mid-session
 *     crash), keep last known state until a definitive opposite signal.
 *   - throw / non-boolean   → keep last known state, poll slow.  Never
 *     "blame" a flaky endpoint by latching not-ready.
 *
 * No sticky latch — the goal is realtime reconciliation, not one-shot
 * detection.  If the local LLM comes up, then crashes, then comes back,
 * the hook reflects the live truth at every cadence tick.
 *
 * Zero-regression contract:
 *   - Default state ``true`` matches the pre-existing "no boot gate"
 *     behavior — when the engine is ready (or the endpoint is silent),
 *     the gate this hook controls is open exactly as before.
 *   - Errors from the endpoint never flip the user-visible state.
 *
 * Usage in Demopage:
 *   const engineReady = useLocalEngineReady();
 *   if ((loading && timeSinceLastMsg < 10000) || !engineReady) {
 *     enqueue(); return;
 *   }
 */
export function useLocalEngineReady() {
  const [ready, setReady] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timerRef = {current: null};
    // Local mirror of the hook's last-published state.  Used to pick the
    // next polling cadence and to honor "keep last known state on error".
    // Mirrors `ready`'s initial value.
    let lastReady = true;

    const tick = async () => {
      if (cancelled) return;
      try {
        const data = await chatApi.llmStatus();
        if (cancelled) return;
        const available = data?.available;
        if (available === true) {
          lastReady = true;
          setReady(true);
        } else if (available === false) {
          lastReady = false;
          setReady(false);
        }
        // Non-conforming shape: keep last known state.
      } catch (e) {
        // Network / 500 / 404: keep last known state.
      }
      if (!cancelled) {
        // Cadence reflects the engine state we last *successfully*
        // observed: fast while we believe it's still booting/down, slow
        // once it's reported ready.  Errors and non-conforming responses
        // inherit the cadence of the last good observation.
        const cadence = lastReady ? POLL_SLOW_MS : POLL_FAST_MS;
        timerRef.current = setTimeout(tick, cadence);
      }
    };

    timerRef.current = setTimeout(tick, 0);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return ready;
}
