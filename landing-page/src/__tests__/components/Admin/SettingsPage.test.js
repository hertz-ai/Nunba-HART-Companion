jest.setTimeout(30000);

import React from 'react';
import {screen, waitFor} from '@testing-library/react';

import {renderWithProviders} from '../../testHelpers';
import SettingsPage from '../../../components/Admin/SettingsPage';

// Mock the settings API — include all methods the component uses
jest.mock('../../../services/socialApi', () => ({
  settingsApi: {
    getSecurity: jest.fn(),
    getMedia: jest.fn(),
    getResponse: jest.fn(),
    getMemory: jest.fn(),
    getEmbodiedAI: jest.fn(),
    getEmbodiedStatus: jest.fn(),
  },
}));

import {settingsApi} from '../../../services/socialApi';

describe('SettingsPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    settingsApi.getSecurity.mockResolvedValue({data: {}});
    settingsApi.getMedia.mockResolvedValue({data: {}});
    settingsApi.getResponse.mockResolvedValue({data: {}});
    settingsApi.getMemory.mockResolvedValue({data: {}});
    settingsApi.getEmbodiedAI.mockResolvedValue({data: {}});
  });

  describe('Rendering', () => {
    test('renders Settings title', async () => {
      renderWithProviders(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText(/setting/i)).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    test('shows loading skeletons while fetching settings', () => {
      settingsApi.getSecurity.mockReturnValue(new Promise(() => {}));
      settingsApi.getMedia.mockReturnValue(new Promise(() => {}));
      settingsApi.getResponse.mockReturnValue(new Promise(() => {}));
      settingsApi.getMemory.mockReturnValue(new Promise(() => {}));
      settingsApi.getEmbodiedAI.mockReturnValue(new Promise(() => {}));

      renderWithProviders(<SettingsPage />);

      // Polished UI uses skeletons instead of spinners
      const skeletons = document.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('handles API errors gracefully', async () => {
      settingsApi.getSecurity.mockRejectedValue(new Error('Network Error'));
      settingsApi.getMedia.mockRejectedValue(new Error('Network Error'));
      settingsApi.getResponse.mockRejectedValue(new Error('Network Error'));
      settingsApi.getMemory.mockRejectedValue(new Error('Network Error'));
      settingsApi.getEmbodiedAI.mockRejectedValue(new Error('Network Error'));

      renderWithProviders(<SettingsPage />);

      // Should not crash
      await waitFor(() => {
        expect(document.body).toBeInTheDocument();
      });
    });
  });
});
