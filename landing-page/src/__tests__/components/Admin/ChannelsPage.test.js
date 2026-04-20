import React from 'react';
import {screen, waitFor} from '@testing-library/react';

import {renderWithProviders, mockChannels} from '../../testHelpers';
import ChannelsPage from '../../../components/Admin/ChannelsPage';

// Mock the channels API
jest.mock('../../../services/socialApi', () => ({
  channelsApi: {
    list: jest.fn(),
  },
  channelUserApi: {
    presence: jest.fn().mockResolvedValue({data: {data: []}}),
    catalog: jest.fn().mockResolvedValue({data: {data: []}}),
    createBinding: jest.fn().mockResolvedValue({data: {data: {}}}),
  },
}));

import {channelsApi, channelUserApi} from '../../../services/socialApi';

describe('ChannelsPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    channelsApi.list.mockResolvedValue({data: mockChannels});
    channelUserApi.presence.mockResolvedValue({data: {data: []}});
    channelUserApi.catalog.mockResolvedValue({data: {data: []}});
    channelUserApi.createBinding.mockResolvedValue({data: {data: {}}});
  });

  describe('Rendering', () => {
    test('renders Channels title', async () => {
      renderWithProviders(<ChannelsPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {level: 4, name: /channel integrations/i})
        ).toBeInTheDocument();
      });
    });

    test('displays channels from API', async () => {
      renderWithProviders(<ChannelsPage />);

      await waitFor(() => {
        expect(screen.getByText(/telegram/i)).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    test('shows loading skeletons while fetching channels', () => {
      channelsApi.list.mockReturnValue(new Promise(() => {}));

      renderWithProviders(<ChannelsPage />);

      // Polished UI uses skeletons instead of spinners
      const skeletons = document.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('handles API errors gracefully', async () => {
      channelsApi.list.mockRejectedValue(new Error('Network Error'));

      renderWithProviders(<ChannelsPage />);

      // Should not crash
      await waitFor(() => {
        expect(document.body).toBeInTheDocument();
      });
    });
  });
});
