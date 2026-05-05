/**
 * FriendsPage.test.jsx — Phase 7c.1 Nunba web parity tests.
 *
 * Mirrors the RN FriendsScreen smoke contract.  Mocks `friendsApi`
 * via the canonical jest.mock pattern (hoisted above imports).
 *
 * Coverage:
 *   a) mount → calls friendsApi.list/listPending/listBlocks once each
 *   b) empty all-tabs → EmptyState renders, no rows
 *   c) friends tab populated → row + Message + Unfriend + Block buttons
 *   d) pending tab incoming → Accept + Reject buttons
 *   e) pending tab outgoing → Cancel button
 *   f) blocked tab → Unblock button
 *   g) Accept click → friendsApi.accept called; refetch fires
 *   h) Block click → friendsApi.block called
 */
/* eslint-disable import/order, import/first */

jest.mock('../../../../services/socialApi', () => ({
  friendsApi: {
    list: jest.fn(),
    listPending: jest.fn(),
    listBlocks: jest.fn(),
    sendRequest: jest.fn(),
    accept: jest.fn(),
    reject: jest.fn(),
    cancel: jest.fn(),
    unfriend: jest.fn(),
    block: jest.fn(),
    unblock: jest.fn(),
  },
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

import {friendsApi} from '../../../../services/socialApi';
import FriendsPage from '../../../../components/Social/Friends/FriendsPage';

import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import React from 'react';

const renderPage = () => render(<FriendsPage />);

const FRIEND_A = {
  id: 'fr-1',
  other_user: {id: 'u-a', username: 'alice', display_name: 'Alice'},
};
const PENDING_INCOMING = {
  id: 'fr-2',
  direction: 'incoming',
  other_user: {id: 'u-b', username: 'bob', display_name: 'Bob'},
};
const PENDING_OUTGOING = {
  id: 'fr-3',
  direction: 'outgoing',
  other_user: {id: 'u-c', username: 'cara', display_name: 'Cara'},
};
const BLOCKED = {
  id: 'bl-1',
  blocked_user: {id: 'u-d', username: 'dane', display_name: 'Dane'},
  reason: 'spam',
};

const setLists = ({friends = [], pending = [], blocked = []} = {}) => {
  friendsApi.list.mockResolvedValue({data: {data: friends}});
  friendsApi.listPending.mockResolvedValue({data: {data: pending}});
  friendsApi.listBlocks.mockResolvedValue({data: {data: blocked}});
};

beforeEach(() => {
  jest.clearAllMocks();
  setLists();
  friendsApi.accept.mockResolvedValue({data: {success: true}});
  friendsApi.reject.mockResolvedValue({data: {success: true}});
  friendsApi.cancel.mockResolvedValue({data: {success: true}});
  friendsApi.unfriend.mockResolvedValue({data: {success: true}});
  friendsApi.block.mockResolvedValue({data: {success: true}});
  friendsApi.unblock.mockResolvedValue({data: {success: true}});
});

describe('FriendsPage', () => {
  test('mount calls list/listPending/listBlocks once each', async () => {
    renderPage();
    await waitFor(() => {
      expect(friendsApi.list).toHaveBeenCalledWith('active');
      expect(friendsApi.listPending).toHaveBeenCalledTimes(1);
      expect(friendsApi.listBlocks).toHaveBeenCalledTimes(1);
    });
  });

  test('empty state renders when all tabs are empty', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/No friends yet/i)).toBeInTheDocument(),
    );
  });

  test('friends tab shows row + Message + Unfriend buttons', async () => {
    setLists({friends: [FRIEND_A]});
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Alice')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', {name: /Message/i})).toBeInTheDocument();
    // Unfriend + Block render as IconButtons with Tooltip
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(3);
  });

  test('pending incoming row shows Accept + Reject', async () => {
    setLists({pending: [PENDING_INCOMING]});
    renderPage();
    // Wait for the Pending TAB to mount (not the page heading "Friends"
    // which is ambiguous with the Friends tab label).
    fireEvent.click(await screen.findByRole('tab', {name: /Pending/i}));
    await waitFor(() =>
      expect(screen.getByText('Bob')).toBeInTheDocument());
    expect(screen.getByRole('button', {name: /Accept/i})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /Reject/i})).toBeInTheDocument();
  });

  test('pending outgoing row shows Cancel only', async () => {
    setLists({pending: [PENDING_OUTGOING]});
    renderPage();
    fireEvent.click(await screen.findByRole('tab', {name: /Pending/i}));
    await waitFor(() =>
      expect(screen.getByText('Cara')).toBeInTheDocument());
    expect(screen.getByRole('button', {name: /Cancel/i})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: /Accept/i})).toBeNull();
  });

  test('blocked tab shows Unblock + reason', async () => {
    setLists({blocked: [BLOCKED]});
    renderPage();
    fireEvent.click(await screen.findByRole('tab', {name: /Blocked/i}));
    await waitFor(() =>
      expect(screen.getByText('Dane')).toBeInTheDocument());
    expect(screen.getByRole('button', {name: /Unblock/i})).toBeInTheDocument();
    expect(screen.getByText(/spam/i)).toBeInTheDocument();
  });

  test('clicking Accept calls friendsApi.accept(id) and refetches', async () => {
    setLists({pending: [PENDING_INCOMING]});
    renderPage();
    fireEvent.click(await screen.findByRole('tab', {name: /Pending/i}));
    const acceptBtn = await screen.findByRole('button', {name: /Accept/i});
    fireEvent.click(acceptBtn);
    // Both the accept call AND the refetch happen async; wait for
    // the refetch to land (initial mount fired list once; refetch
    // brings it to 2).
    await waitFor(() => {
      expect(friendsApi.accept).toHaveBeenCalledWith('fr-2');
      expect(friendsApi.list).toHaveBeenCalledTimes(2);
    });
  });

  test('clicking Block calls friendsApi.block(userId)', async () => {
    setLists({friends: [FRIEND_A]});
    renderPage();
    await screen.findByText('Alice');
    // Block IconButton has no role-name; pick by Tooltip title via aria.
    const blockBtn = screen.getByRole('button', {name: /Block/i});
    fireEvent.click(blockBtn);
    await waitFor(() =>
      expect(friendsApi.block).toHaveBeenCalledWith('u-a'));
  });
});
