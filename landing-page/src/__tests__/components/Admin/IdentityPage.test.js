import React from 'react';
import {screen, waitFor} from '@testing-library/react';

import {
  renderWithProviders,
  mockIdentity,
  mockAvatars,
} from '../../testHelpers';
import IdentityPage from '../../../components/Admin/IdentityPage';

// Mock the identity API
jest.mock('../../../services/socialApi', () => ({
  identityApi: {
    get: jest.fn(),
    getAvatars: jest.fn(),
  },
}));

import {identityApi} from '../../../services/socialApi';

describe('IdentityPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    identityApi.get.mockResolvedValue({data: mockIdentity});
    identityApi.getAvatars.mockResolvedValue({data: mockAvatars});
  });

  describe('Rendering', () => {
    test('renders Agent Identity title', async () => {
      renderWithProviders(<IdentityPage />);

      await waitFor(() => {
        expect(screen.getByText('Agent Identity')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    test('shows loading state while fetching identity', async () => {
      identityApi.get.mockReturnValue(new Promise(() => {}));
      identityApi.getAvatars.mockReturnValue(new Promise(() => {}));

      renderWithProviders(<IdentityPage />);

      // Page header should still show during loading
      await waitFor(() => {
        expect(screen.getByText('Agent Identity')).toBeInTheDocument();
      });
    });

    test('shows content after loading', async () => {
      renderWithProviders(<IdentityPage />);

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByText('Agent Identity')).toBeInTheDocument();
        // Profile section should appear after loading
        expect(screen.getByText('Profile')).toBeInTheDocument();
      });
    });
  });
});
