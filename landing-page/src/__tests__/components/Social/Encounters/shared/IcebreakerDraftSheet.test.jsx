/**
 * IcebreakerDraftSheet.test.jsx — Jest coverage for W0c F2 GREENLIT
 * (master-orchestrator post-prereq d4405b55 + 7dadd6bc + 65084ae2 +
 * 8e4f462d).
 *
 * Twelve cases mandated by the F2 brief (test-generator gate):
 *   1.  Mount(open=true, match) → bleEncounterApi.draftIcebreaker
 *       called once; LOADING state visible.
 *   2.  Server returns {draft, alt_drafts, rationale, length} →
 *       READY: 3 drafts as radio, first selected, rationale visible.
 *   3.  User edits text → char count updates live.
 *   4.  Char count > MAX → Send disabled + counter red.
 *   5.  Click Send with valid text → calls approveIcebreaker(id, text);
 *       SENDING state visible (spinner overlay).
 *   6.  Server returns success → SENT → onSent(match) called → modal
 *       auto-dismisses after 1.2s.
 *   7.  Server 5xx → ERROR with Retry; click Retry re-attempts approve.
 *   8.  Click Decline → reason chips visible; click "Not feeling it"
 *       → declineIcebreaker(id, "Not feeling it"); auto-dismiss after
 *       2s.
 *   9.  WAMP callback fires with payload.match_id === match.id AND
 *       action === 'declined' → PEER_DISMISSED state; auto-close 2s.
 *  10.  WAMP callback fires for a DIFFERENT match_id → modal state
 *       UNCHANGED (ethical-hacker gate; no leak between matches).
 *  11.  Cleanup on unmount → WAMP unsubscribe called.
 *  12.  Mobile media query → renders SwipeableDrawer; desktop →
 *       Dialog.
 *
 * Strategy mirrors DiscoverableTogglePanel.test.jsx: mock socialApi
 * + realtimeService BEFORE importing the component, then mount via
 * renderWithProviders (the shared MUI/Theme/Router wrapper).
 */

// Mock socialApi BEFORE importing the component.
jest.mock('../../../../../services/socialApi', () => {
  const draftIcebreaker = jest.fn();
  const approveIcebreaker = jest.fn();
  const declineIcebreaker = jest.fn();
  return {
    bleEncounterApi: {draftIcebreaker, approveIcebreaker, declineIcebreaker},
  };
});

// Mock realtimeService.subscribeEncounterIcebreaker.  Per jest's
// out-of-scope-variable rule, the factory may only reference variables
// whose names start with `mock` (case-insensitive).  We expose the
// captured callback + the unsubscribe spy on the mock module itself.
jest.mock('../../../../../services/realtimeService', () => {
  const mockUnsubscribe = jest.fn();
  const mockState = {lastCallback: null, allCalls: []};
  const subscribeEncounterIcebreaker = jest.fn((cb) => {
    mockState.lastCallback = cb;
    mockState.allCalls.push({type: typeof cb, fn: cb});
    return mockUnsubscribe;
  });
  return {
    __esModule: true,
    subscribeEncounterIcebreaker,
    // Test-only accessors — names retain mock prefix so jest accepts.
    __mockState: mockState,
    __mockUnsubscribe: mockUnsubscribe,
  };
});

// useMediaQuery mock so we can flip mobile/desktop per test.
let mockIsNarrow = false;
// eslint-disable-next-line no-undef
global.mockIsNarrow = mockIsNarrow;
jest.mock('@mui/material/useMediaQuery', () => ({
  __esModule: true,
  // Read the global on every call so tests can flip it via setMockNarrow.
  default: () => global.mockIsNarrow,
}));
function setMockNarrow(v) {
  mockIsNarrow = v;
  global.mockIsNarrow = v;
}

// eslint-disable-next-line import/first, import/order
import IcebreakerDraftSheet from '../../../../../components/Social/Encounters/shared/IcebreakerDraftSheet';
// eslint-disable-next-line import/first, import/order
import {bleEncounterApi} from '../../../../../services/socialApi';
// eslint-disable-next-line import/first, import/order
import * as realtimeService from '../../../../../services/realtimeService';
// eslint-disable-next-line import/first, import/order
import {ENCOUNTER_DRAFT_MAX_CHARS} from '../../../../../constants/encounter';
// eslint-disable-next-line import/first, import/order
import {renderWithProviders} from '../../../../testHelpers';

// eslint-disable-next-line import/order
import {act, fireEvent, screen, waitFor} from '@testing-library/react';
// eslint-disable-next-line import/order
import React from 'react';

const baseMatch = {
  id: 'match-42',
  user_a: 'alice',
  user_b: 'bob',
  matched_at: Math.floor(Date.now() / 1000) - 30,
  icebreaker_a_status: null,
  icebreaker_b_status: null,
};

const draftPayload = {
  data: {
    success: true,
    data: {
      draft: 'Hey — saw the hiking thing. Same.  Nice to meet you properly.',
      alt_drafts: [
        'Hi! I think we share the hiking corner of the universe.',
        'Hello.  hiking, huh?  Curious how you got into it.',
      ],
      rationale: "anchored on shared interest 'hiking'",
      length: 60,
      shared_tag: 'hiking',
      source: 'template',
    },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  setMockNarrow(false);
  bleEncounterApi.draftIcebreaker.mockResolvedValue(draftPayload);
  bleEncounterApi.approveIcebreaker.mockResolvedValue({
    data: {success: true, data: {match_id: baseMatch.id, status: 'sent'}},
  });
  bleEncounterApi.declineIcebreaker.mockResolvedValue({
    data: {
      success: true,
      data: {match_id: baseMatch.id, status: 'declined'},
    },
  });
  // CRA's jest config sets `resetMocks: true`, which wipes mock
  // implementations between tests.  Re-attach the realtime mock impl
  // so each test starts with a working subscribe/unsubscribe pair.
  realtimeService.__mockState.lastCallback = null;
  realtimeService.__mockState.allCalls = [];
  realtimeService.subscribeEncounterIcebreaker.mockImplementation((cb) => {
    realtimeService.__mockState.lastCallback = cb;
    realtimeService.__mockState.allCalls.push({type: typeof cb, fn: cb});
    return realtimeService.__mockUnsubscribe;
  });
});

afterEach(() => {
  jest.useRealTimers();
});

// ──────────────────────────────────────────────────────────────────────
// 1. Loading state
// ──────────────────────────────────────────────────────────────────────

test('1) mounting open with match calls draftIcebreaker once and shows LOADING', async () => {
  // Hold the promise resolution so we can observe LOADING.
  let resolve;
  bleEncounterApi.draftIcebreaker.mockImplementationOnce(
    () => new Promise((r) => { resolve = r; }),
  );
  renderWithProviders(
    <IcebreakerDraftSheet
      open
      match={baseMatch}
      onClose={jest.fn()}
      onSent={jest.fn()}
    />,
  );
  expect(bleEncounterApi.draftIcebreaker).toHaveBeenCalledTimes(1);
  expect(bleEncounterApi.draftIcebreaker).toHaveBeenCalledWith('match-42');
  expect(screen.getByTestId('icebreaker-loading')).toBeInTheDocument();
  // Resolve so other tests don't see lingering pending promises.
  await act(async () => {
    resolve(draftPayload);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 2. Ready: 3 drafts as radio, first selected, rationale visible
// ──────────────────────────────────────────────────────────────────────

test('2) on draft response, READY shows 3 drafts (radio), first selected, rationale visible', async () => {
  renderWithProviders(
    <IcebreakerDraftSheet
      open
      match={baseMatch}
      onClose={jest.fn()}
      onSent={jest.fn()}
    />,
  );
  await waitFor(() => {
    expect(screen.getByTestId('icebreaker-ready')).toBeInTheDocument();
  });
  // 3 draft options
  expect(screen.getByTestId('icebreaker-draft-option-0')).toBeInTheDocument();
  expect(screen.getByTestId('icebreaker-draft-option-1')).toBeInTheDocument();
  expect(screen.getByTestId('icebreaker-draft-option-2')).toBeInTheDocument();
  // Rationale visible
  expect(screen.getByTestId('icebreaker-rationale')).toHaveTextContent(
    /hiking/i,
  );
  // First selected → text input shows the primary draft
  const input = screen.getByTestId('icebreaker-text-input');
  expect(input.value).toBe(draftPayload.data.data.draft);
});

// ──────────────────────────────────────────────────────────────────────
// 3. Live char count update
// ──────────────────────────────────────────────────────────────────────

test('3) editing the text updates the char count live', async () => {
  renderWithProviders(
    <IcebreakerDraftSheet
      open
      match={baseMatch}
      onClose={jest.fn()}
      onSent={jest.fn()}
    />,
  );
  await waitFor(() => {
    expect(screen.getByTestId('icebreaker-ready')).toBeInTheDocument();
  });
  const input = screen.getByTestId('icebreaker-text-input');
  fireEvent.change(input, {target: {value: 'Hi.'}});
  expect(screen.getByTestId('icebreaker-char-count')).toHaveTextContent(
    `3 / ${ENCOUNTER_DRAFT_MAX_CHARS}`,
  );
});

// ──────────────────────────────────────────────────────────────────────
// 4. Over-cap → Send disabled
// ──────────────────────────────────────────────────────────────────────

test('4) text over MAX → Send disabled + counter color flips to error.main', async () => {
  renderWithProviders(
    <IcebreakerDraftSheet
      open
      match={baseMatch}
      onClose={jest.fn()}
      onSent={jest.fn()}
    />,
  );
  await waitFor(() => {
    expect(screen.getByTestId('icebreaker-ready')).toBeInTheDocument();
  });
  const input = screen.getByTestId('icebreaker-text-input');
  const oversize = 'X'.repeat(ENCOUNTER_DRAFT_MAX_CHARS + 5);
  fireEvent.change(input, {target: {value: oversize}});
  const sendBtn = screen.getByTestId('icebreaker-send');
  expect(sendBtn).toBeDisabled();
  // Counter must read N / MAX where N > MAX.
  const counter = screen.getByTestId('icebreaker-char-count');
  expect(counter).toHaveTextContent(
    `${ENCOUNTER_DRAFT_MAX_CHARS + 5} / ${ENCOUNTER_DRAFT_MAX_CHARS}`,
  );
});

// ──────────────────────────────────────────────────────────────────────
// 5. Send valid → SENDING visible (spinner)
// ──────────────────────────────────────────────────────────────────────

test('5) Send with valid text calls approveIcebreaker and shows SENDING overlay', async () => {
  let resolveApprove;
  bleEncounterApi.approveIcebreaker.mockImplementationOnce(
    () => new Promise((r) => { resolveApprove = r; }),
  );
  renderWithProviders(
    <IcebreakerDraftSheet
      open
      match={baseMatch}
      onClose={jest.fn()}
      onSent={jest.fn()}
    />,
  );
  await waitFor(() => {
    expect(screen.getByTestId('icebreaker-ready')).toBeInTheDocument();
  });
  const input = screen.getByTestId('icebreaker-text-input');
  fireEvent.change(input, {target: {value: 'Hello there.'}});
  fireEvent.click(screen.getByTestId('icebreaker-send'));
  expect(bleEncounterApi.approveIcebreaker).toHaveBeenCalledWith(
    'match-42',
    'Hello there.',
  );
  expect(screen.getByTestId('icebreaker-sending')).toBeInTheDocument();
  await act(async () => {
    resolveApprove({
      data: {success: true, data: {match_id: baseMatch.id, status: 'sent'}},
    });
  });
});

// ──────────────────────────────────────────────────────────────────────
// 6. Success → SENT → onSent invoked → auto-dismiss after 1.2s
// ──────────────────────────────────────────────────────────────────────

test('6) approve success → SENT → onSent(match) called → auto-dismiss 1.2s later', async () => {
  jest.useFakeTimers();
  const onSent = jest.fn();
  const onClose = jest.fn();
  renderWithProviders(
    <IcebreakerDraftSheet
      open
      match={baseMatch}
      onClose={onClose}
      onSent={onSent}
    />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(screen.getByTestId('icebreaker-ready')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId('icebreaker-send'));
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(screen.getByTestId('icebreaker-sent')).toBeInTheDocument();
  });
  expect(onSent).toHaveBeenCalledTimes(1);
  expect(onSent).toHaveBeenCalledWith(baseMatch);
  // Advance fake timers past auto-close threshold.  Use 5s to handle
  // both the 1.2s and the reduced-motion-floor-of-4s branch.
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(onClose).toHaveBeenCalled();
});

// ──────────────────────────────────────────────────────────────────────
// 7. 5xx → ERROR with Retry
// ──────────────────────────────────────────────────────────────────────

test('7) approve 5xx → ERROR with Retry; click Retry re-attempts approve', async () => {
  bleEncounterApi.approveIcebreaker
    .mockRejectedValueOnce({
      response: {status: 500, data: {error: 'boom'}},
    })
    .mockResolvedValueOnce({
      data: {success: true, data: {match_id: baseMatch.id, status: 'sent'}},
    });
  renderWithProviders(
    <IcebreakerDraftSheet
      open
      match={baseMatch}
      onClose={jest.fn()}
      onSent={jest.fn()}
    />,
  );
  await waitFor(() => {
    expect(screen.getByTestId('icebreaker-ready')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId('icebreaker-send'));
  await waitFor(() => {
    expect(screen.getByTestId('icebreaker-error')).toBeInTheDocument();
  });
  expect(screen.getByTestId('icebreaker-error-retry')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('icebreaker-error-retry'));
  expect(bleEncounterApi.approveIcebreaker).toHaveBeenCalledTimes(2);
});

// ──────────────────────────────────────────────────────────────────────
// 8. Decline → chip row → "Not feeling it" → declineIcebreaker
// ──────────────────────────────────────────────────────────────────────

test('8) Decline opens reason chips; "Not feeling it" calls declineIcebreaker; auto-close 2s', async () => {
  jest.useFakeTimers();
  const onClose = jest.fn();
  renderWithProviders(
    <IcebreakerDraftSheet
      open
      match={baseMatch}
      onClose={onClose}
      onSent={jest.fn()}
    />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(screen.getByTestId('icebreaker-ready')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId('icebreaker-decline-open'));
  expect(screen.getByTestId('icebreaker-declining')).toBeInTheDocument();
  expect(screen.getByTestId('icebreaker-decline-not-feeling-it')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('icebreaker-decline-not-feeling-it'));
  await act(async () => {
    await Promise.resolve();
  });
  expect(bleEncounterApi.declineIcebreaker).toHaveBeenCalledWith(
    'match-42',
    'Not feeling it',
  );
  await waitFor(() => {
    expect(screen.getByTestId('icebreaker-declined')).toBeInTheDocument();
  });
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(onClose).toHaveBeenCalled();
});

// ──────────────────────────────────────────────────────────────────────
// 9. WAMP same-match decline → PEER_DISMISSED + auto-close
// ──────────────────────────────────────────────────────────────────────

test('9) WAMP event for THIS match.id with status=declined → PEER_DISMISSED', async () => {
  jest.useFakeTimers();
  const onClose = jest.fn();
  renderWithProviders(
    <IcebreakerDraftSheet
      open
      match={baseMatch}
      onClose={onClose}
      onSent={jest.fn()}
    />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(screen.getByTestId('icebreaker-ready')).toBeInTheDocument();
  });
  // Fire a peer event with the SAME match_id.
  const cb = realtimeService.__mockState.lastCallback;
  expect(typeof cb).toBe('function');
  await act(async () => {
    cb({match_id: 'match-42', side: 'b', status: 'declined'});
  });
  expect(screen.getByTestId('icebreaker-peer-dismissed')).toBeInTheDocument();
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(onClose).toHaveBeenCalled();
});

// ──────────────────────────────────────────────────────────────────────
// 10. WAMP DIFFERENT match.id → state UNCHANGED
//     (ethical-hacker gate: no cross-match leak)
// ──────────────────────────────────────────────────────────────────────

test('10) WAMP event for DIFFERENT match_id is ignored — no state mutation', async () => {
  renderWithProviders(
    <IcebreakerDraftSheet
      open
      match={baseMatch}
      onClose={jest.fn()}
      onSent={jest.fn()}
    />,
  );
  await waitFor(() => {
    expect(screen.getByTestId('icebreaker-ready')).toBeInTheDocument();
  });
  const cb = realtimeService.__mockState.lastCallback;
  await act(async () => {
    cb({match_id: 'someone-elses-match', side: 'a', status: 'declined'});
  });
  // Modal is still in READY — peer-dismissed banner must NOT appear.
  expect(screen.queryByTestId('icebreaker-peer-dismissed')).not.toBeInTheDocument();
  expect(screen.getByTestId('icebreaker-ready')).toBeInTheDocument();
});

// ──────────────────────────────────────────────────────────────────────
// 11. Cleanup on unmount → unsubscribe called
// ──────────────────────────────────────────────────────────────────────

test('11) cleanup on unmount calls the WAMP unsubscribe', async () => {
  const {unmount} = renderWithProviders(
    <IcebreakerDraftSheet
      open
      match={baseMatch}
      onClose={jest.fn()}
      onSent={jest.fn()}
    />,
  );
  await waitFor(() => {
    expect(screen.getByTestId('icebreaker-ready')).toBeInTheDocument();
  });
  const unsubscribe = realtimeService.__mockUnsubscribe;
  unsubscribe.mockClear();
  unmount();
  expect(unsubscribe).toHaveBeenCalled();
});

// ──────────────────────────────────────────────────────────────────────
// 12. Mobile media query → SwipeableDrawer; desktop → Dialog
// ──────────────────────────────────────────────────────────────────────

test('12a) desktop renders the Dialog variant', async () => {
  setMockNarrow(false);
  renderWithProviders(
    <IcebreakerDraftSheet
      open
      match={baseMatch}
      onClose={jest.fn()}
      onSent={jest.fn()}
    />,
  );
  await waitFor(() => {
    expect(screen.getByTestId('icebreaker-dialog')).toBeInTheDocument();
  });
  expect(screen.queryByTestId('icebreaker-drawer')).not.toBeInTheDocument();
});

test('12b) mobile / narrow viewport renders the SwipeableDrawer variant', async () => {
  setMockNarrow(true);
  renderWithProviders(
    <IcebreakerDraftSheet
      open
      match={baseMatch}
      onClose={jest.fn()}
      onSent={jest.fn()}
    />,
  );
  await waitFor(() => {
    expect(screen.getByTestId('icebreaker-drawer')).toBeInTheDocument();
  });
  expect(screen.queryByTestId('icebreaker-dialog')).not.toBeInTheDocument();
});
