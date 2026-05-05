/**
 * BleMatchCard.test.jsx — REWORK coverage for d4405b55 (W0c F2).
 *
 * Six cases mandated by master-orchestrator review (acd11f55):
 *   a) Header copy "Mutual encounter" + "Both said yes".
 *   b) Avatar shows the OTHER party's initial (viewer never sees own).
 *   c) "Send icebreaker" button disabled when viewer's
 *      icebreaker_status === 'sent'.
 *   d) "Icebreaker sent" status chip rendered when viewer has sent.
 *   e) "They said hi" status chip rendered when other party sent and
 *      viewer has not sent.
 *   f) onIcebreaker / onHide callbacks invoked on respective button
 *      presses.
 *
 * Component prop shape (verified against
 * components/Social/Encounters/shared/BleMatchCard.jsx d4405b55):
 *   - currentUserId : string  (viewer's user-id)
 *   - match : { id, user_a, user_b, matched_at,
 *               icebreaker_a_status, icebreaker_b_status, ... }
 *   - onIcebreaker(match) : () -> void
 *   - onHide(match)       : () -> void
 *
 * Note: Orchestrator brief used a `viewer.icebreaker_status` shorthand;
 * actual component reads per-side status off the match row
 * (icebreaker_a_status / icebreaker_b_status, selected by which side
 * user_a/user_b matches currentUserId).  Tests honor the real shape.
 */
import BleMatchCard from '../../../../../components/Social/Encounters/shared/BleMatchCard';
import {renderWithProviders} from '../../../../testHelpers';

import {fireEvent, screen} from '@testing-library/react';
import React from 'react';

const baseMatch = {
  id: 'match-1',
  user_a: 'alice',
  user_b: 'bob',
  lat: 12.97,
  lng: 77.59,
  matched_at: Math.floor(Date.now() / 1000) - 30, // ~30s ago
  icebreaker_a_status: null,
  icebreaker_b_status: null,
  map_pin_visible: true,
};

describe('BleMatchCard Component', () => {
  describe('Rendering', () => {
    test('renders "Mutual encounter" + "Both said yes" header copy', () => {
      renderWithProviders(
        <BleMatchCard
          match={baseMatch}
          currentUserId="alice"
          onIcebreaker={jest.fn()}
          onHide={jest.fn()}
        />,
      );
      expect(screen.getByText('Mutual encounter')).toBeInTheDocument();
      // "Both said yes" is followed by " · {time-ago}" — match start of text.
      expect(screen.getByText(/Both said yes/)).toBeInTheDocument();
    });

    test('shows the OTHER party initial (viewer never sees own avatar)', () => {
      // Viewer = alice (user_a) -> avatar should be for bob -> initial 'B'.
      const {unmount} = renderWithProviders(
        <BleMatchCard
          match={baseMatch}
          currentUserId="alice"
          onIcebreaker={jest.fn()}
          onHide={jest.fn()}
        />,
      );
      expect(screen.getByText('B')).toBeInTheDocument();
      expect(screen.queryByText('A')).not.toBeInTheDocument();
      unmount();

      // Viewer = bob (user_b) -> avatar should be for alice -> initial 'A'.
      renderWithProviders(
        <BleMatchCard
          match={baseMatch}
          currentUserId="bob"
          onIcebreaker={jest.fn()}
          onHide={jest.fn()}
        />,
      );
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.queryByText('B')).not.toBeInTheDocument();
    });
  });

  describe('Icebreaker button state', () => {
    test('"Send icebreaker" disabled when viewer icebreaker status is "sent"', () => {
      // Viewer = alice -> viewer side is "a" -> reads icebreaker_a_status.
      const match = {...baseMatch, icebreaker_a_status: 'sent'};
      renderWithProviders(
        <BleMatchCard
          match={match}
          currentUserId="alice"
          onIcebreaker={jest.fn()}
          onHide={jest.fn()}
        />,
      );
      const btn = screen.getByTestId(`ble-match-${match.id}-icebreaker`);
      expect(btn).toBeDisabled();
    });
  });

  describe('Status chips', () => {
    test('renders "Icebreaker sent" chip when viewer has sent', () => {
      const match = {...baseMatch, icebreaker_a_status: 'sent'};
      renderWithProviders(
        <BleMatchCard
          match={match}
          currentUserId="alice"
          onIcebreaker={jest.fn()}
          onHide={jest.fn()}
        />,
      );
      expect(screen.getByText('Icebreaker sent')).toBeInTheDocument();
    });

    test('renders "They said hi" chip when other side sent and viewer has not', () => {
      // Viewer = alice (side a), other (b) sent, viewer (a) has not.
      const match = {
        ...baseMatch,
        icebreaker_a_status: null,
        icebreaker_b_status: 'sent',
      };
      renderWithProviders(
        <BleMatchCard
          match={match}
          currentUserId="alice"
          onIcebreaker={jest.fn()}
          onHide={jest.fn()}
        />,
      );
      expect(screen.getByText('They said hi')).toBeInTheDocument();
      // Confirm we did NOT also render the viewer-sent chip.
      expect(screen.queryByText('Icebreaker sent')).not.toBeInTheDocument();
    });
  });

  describe('Callbacks', () => {
    test('invokes onIcebreaker(match) once on Send button press; onHide(match) on Hide press', () => {
      const onIcebreaker = jest.fn();
      const onHide = jest.fn();
      renderWithProviders(
        <BleMatchCard
          match={baseMatch}
          currentUserId="alice"
          onIcebreaker={onIcebreaker}
          onHide={onHide}
        />,
      );

      fireEvent.click(
        screen.getByTestId(`ble-match-${baseMatch.id}-icebreaker`),
      );
      expect(onIcebreaker).toHaveBeenCalledTimes(1);
      expect(onIcebreaker).toHaveBeenCalledWith(baseMatch);

      fireEvent.click(screen.getByTestId(`ble-match-${baseMatch.id}-hide`));
      expect(onHide).toHaveBeenCalledTimes(1);
      expect(onHide).toHaveBeenCalledWith(baseMatch);
    });
  });
});
