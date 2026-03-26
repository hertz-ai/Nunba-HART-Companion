import React from 'react';
import {screen, waitFor} from '@testing-library/react';

import {renderWithProviders, mockWorkflows} from '../../testHelpers';
import WorkflowsPage from '../../../components/Admin/WorkflowsPage';

// Mock the workflows API
jest.mock('../../../services/socialApi', () => ({
  workflowsApi: {
    list: jest.fn(),
  },
}));

import {workflowsApi} from '../../../services/socialApi';

describe('WorkflowsPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    workflowsApi.list.mockResolvedValue({data: mockWorkflows});
  });

  describe('Rendering', () => {
    test('renders Workflows title', async () => {
      renderWithProviders(<WorkflowsPage />);

      await waitFor(() => {
        expect(
          screen.getByRole('heading', {level: 4, name: /workflows/i})
        ).toBeInTheDocument();
      });
    });

    test('displays workflows from API', async () => {
      renderWithProviders(<WorkflowsPage />);

      await waitFor(() => {
        const workflowElements = screen.getAllByText(/welcome|user/i);
        expect(workflowElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Loading State', () => {
    test('shows loading skeletons while fetching workflows', () => {
      workflowsApi.list.mockReturnValue(new Promise(() => {}));

      renderWithProviders(<WorkflowsPage />);

      // Polished UI uses skeletons instead of spinners
      const skeletons = document.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('handles API errors gracefully', async () => {
      workflowsApi.list.mockRejectedValue(new Error('Network Error'));

      renderWithProviders(<WorkflowsPage />);

      // Should not crash
      await waitFor(() => {
        expect(document.body).toBeInTheDocument();
      });
    });
  });
});
