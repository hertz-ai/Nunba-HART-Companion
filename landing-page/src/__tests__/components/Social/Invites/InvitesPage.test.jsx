/**
 * InvitesPage.test.jsx — Phase 7c.2 Nunba web parity tests.
 *
 * Mirrors the RN InvitesScreen smoke contract.
 *
 * Coverage:
 *   a) mount → calls invitesApi.listIncoming once
 *   b) empty list → EmptyState renders
 *   c) incoming row → Accept + Decline buttons
 *   d) Accept click → invitesApi.accept(id)
 *   e) New invite button opens compose dialog
 *   f) Compose: targeted mode shows search field
 *   g) Compose: Anyone-with-link mode hides search
 */
/* eslint-disable import/order, import/first */

jest.mock('../../../../services/socialApi', () => ({
  invitesApi: {
    listIncoming: jest.fn(),
    accept: jest.fn(),
    reject: jest.fn(),
    send: jest.fn(),
  },
  mentionsApi: {
    autocomplete: jest.fn(),
  },
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({state: {}}),
}));

import {invitesApi, mentionsApi} from '../../../../services/socialApi';
import InvitesPage from '../../../../components/Social/Invites/InvitesPage';

import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import React from 'react';

const INCOMING = {
  id: 'inv-1',
  parent_kind: 'community',
  parent_name: 'cosmic-tea-club',
  role_offered: 'member',
  invited_by_user: {id: 'u-a', username: 'aru', display_name: 'Aru'},
};

beforeEach(() => {
  jest.clearAllMocks();
  invitesApi.listIncoming.mockResolvedValue({data: {data: []}});
  invitesApi.accept.mockResolvedValue({data: {success: true}});
  invitesApi.reject.mockResolvedValue({data: {success: true}});
  invitesApi.send.mockResolvedValue({data: {data: {invite_code: 'abc-xyz'}}});
  mentionsApi.autocomplete.mockResolvedValue({data: {data: []}});
});

describe('InvitesPage', () => {
  test('mount calls listIncoming once', async () => {
    render(<InvitesPage />);
    await waitFor(() =>
      expect(invitesApi.listIncoming).toHaveBeenCalledTimes(1));
  });

  test('empty incoming list shows empty state', async () => {
    render(<InvitesPage />);
    await waitFor(() =>
      expect(screen.getByText(/No incoming invites/i)).toBeInTheDocument(),
    );
  });

  test('incoming row shows Accept + Decline', async () => {
    invitesApi.listIncoming.mockResolvedValueOnce(
      {data: {data: [INCOMING]}});
    render(<InvitesPage />);
    await waitFor(() =>
      expect(screen.getByText('Aru')).toBeInTheDocument());
    expect(screen.getByRole('button', {name: /Accept/i})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /Decline/i})).toBeInTheDocument();
  });

  test('Accept calls invitesApi.accept(id)', async () => {
    invitesApi.listIncoming.mockResolvedValueOnce(
      {data: {data: [INCOMING]}});
    render(<InvitesPage />);
    const acceptBtn = await screen.findByRole('button', {name: /Accept/i});
    fireEvent.click(acceptBtn);
    await waitFor(() =>
      expect(invitesApi.accept).toHaveBeenCalledWith('inv-1'));
  });

  test('Decline calls invitesApi.reject(id)', async () => {
    invitesApi.listIncoming.mockResolvedValueOnce(
      {data: {data: [INCOMING]}});
    render(<InvitesPage />);
    const declineBtn = await screen.findByRole('button', {name: /Decline/i});
    fireEvent.click(declineBtn);
    await waitFor(() =>
      expect(invitesApi.reject).toHaveBeenCalledWith('inv-1'));
  });

  test('New invite button opens compose dialog', async () => {
    render(<InvitesPage />);
    await waitFor(() => screen.getByText(/No incoming invites/i));
    fireEvent.click(screen.getByRole('button', {name: /New invite/i}));
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toBeInTheDocument());
    // Both mode buttons render in the dialog
    expect(
      screen.getByRole('button', {name: /Specific people/i}),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {name: /Anyone with link/i}),
    ).toBeInTheDocument();
  });

  test('targeted mode shows search field; link mode hides it', async () => {
    render(<InvitesPage />);
    await waitFor(() => screen.getByText(/No incoming invites/i));
    fireEvent.click(screen.getByRole('button', {name: /New invite/i}));
    // Default = targeted; search field present
    await waitFor(() =>
      expect(screen.getByLabelText(/Search by username/i)).toBeInTheDocument(),
    );
    // Switch to link mode
    fireEvent.click(screen.getByRole('button', {name: /Anyone with link/i}));
    await waitFor(() =>
      expect(screen.queryByLabelText(/Search by username/i)).toBeNull(),
    );
    // Helper text appears
    expect(
      screen.getByText(/7-day shareable link/i),
    ).toBeInTheDocument();
  });

  test('Send disabled without parent context (route state empty)', async () => {
    render(<InvitesPage />);
    await waitFor(() => screen.getByText(/No incoming invites/i));
    fireEvent.click(screen.getByRole('button', {name: /New invite/i}));
    const sendBtn = await screen.findByRole('button', {name: /Send/i});
    expect(sendBtn).toBeDisabled();
  });
});
