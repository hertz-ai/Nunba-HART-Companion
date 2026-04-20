import AgentSyncPage from '../../../components/Admin/AgentSyncPage';
import {renderWithProviders} from '../../testHelpers';

import {screen, waitFor} from '@testing-library/react';
import React from 'react';

// Mock the admin API
jest.mock('../../../services/socialApi', () => ({
  adminApi: {
    syncAgents: jest.fn(),
  },
}));

describe('AgentSyncPage Component', () => {
  describe('Rendering', () => {
    test('renders Agent Sync title', () => {
      renderWithProviders(<AgentSyncPage />);
      // The h4 title should contain "Agent Sync"
      expect(
        screen.getByRole('heading', {level: 4, name: /agent sync/i})
      ).toBeInTheDocument();
    });

    test('renders sync button', () => {
      renderWithProviders(<AgentSyncPage />);
      const syncButton = screen.getByRole('button', {name: /sync agents/i});
      expect(syncButton).toBeInTheDocument();
    });
  });
});
