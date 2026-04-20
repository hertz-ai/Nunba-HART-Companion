import React from 'react';
import {screen, waitFor} from '@testing-library/react';

import {
  renderWithProviders,
  mockStats,
  mockMetrics,
  mockLatency,
} from '../../testHelpers';
import DashboardPage from '../../../components/Admin/DashboardPage';

// Mock the admin API
jest.mock('../../../services/socialApi', () => ({
  adminApi: {
    stats: jest.fn(),
    metrics: jest.fn(),
    latency: jest.fn(),
  },
}));

import {adminApi} from '../../../services/socialApi';

describe('DashboardPage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    test('renders Dashboard title', async () => {
      adminApi.stats.mockResolvedValue({data: mockStats});
      adminApi.metrics.mockResolvedValue({data: mockMetrics});
      adminApi.latency.mockResolvedValue({data: mockLatency});

      renderWithProviders(<DashboardPage />);
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    test('renders stat cards', async () => {
      adminApi.stats.mockResolvedValue({data: mockStats});
      adminApi.metrics.mockResolvedValue({data: mockMetrics});
      adminApi.latency.mockResolvedValue({data: mockLatency});

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Total Users')).toBeInTheDocument();
        expect(screen.getByText('Posts Today')).toBeInTheDocument();
        expect(screen.getByText('Active Agents')).toBeInTheDocument();
        expect(screen.getByText('Growth (7d)')).toBeInTheDocument();
      });
    });

    test('shows loading skeletons initially', () => {
      adminApi.stats.mockReturnValue(new Promise(() => {})); // Never resolves
      adminApi.metrics.mockReturnValue(new Promise(() => {}));
      adminApi.latency.mockReturnValue(new Promise(() => {}));

      renderWithProviders(<DashboardPage />);

      // Should show loading skeletons (polished UI uses skeletons instead of spinners)
      const skeletons = document.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    test('displays stats values after loading', async () => {
      adminApi.stats.mockResolvedValue({data: mockStats});
      adminApi.metrics.mockResolvedValue({data: mockMetrics});
      adminApi.latency.mockResolvedValue({data: mockLatency});

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        // Values are formatted with toLocaleString() for thousands separators
        expect(
          screen.getByText(mockStats.total_users.toLocaleString())
        ).toBeInTheDocument();
        expect(
          screen.getByText(mockStats.posts_today.toLocaleString())
        ).toBeInTheDocument();
        expect(
          screen.getByText(mockStats.active_agents.toLocaleString())
        ).toBeInTheDocument();
      });
    });
  });

  describe('System Metrics', () => {
    test('renders system metrics when available', async () => {
      adminApi.stats.mockResolvedValue({data: mockStats});
      adminApi.metrics.mockResolvedValue({data: mockMetrics});
      adminApi.latency.mockResolvedValue({data: mockLatency});

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('System Metrics')).toBeInTheDocument();
        expect(screen.getByText('CPU Usage')).toBeInTheDocument();
        expect(screen.getByText('Memory')).toBeInTheDocument();
        expect(screen.getByText('Disk')).toBeInTheDocument();
      });
    });

    test('does not render metrics section when metrics fail to load', async () => {
      adminApi.stats.mockResolvedValue({data: mockStats});
      adminApi.metrics.mockRejectedValue(new Error('API Error'));
      adminApi.latency.mockRejectedValue(new Error('API Error'));

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
      });

      // System Metrics should not be present
      expect(screen.queryByText('System Metrics')).not.toBeInTheDocument();
    });
  });

  describe('Latency Section', () => {
    test('renders latency section when available', async () => {
      adminApi.stats.mockResolvedValue({data: mockStats});
      adminApi.metrics.mockResolvedValue({data: mockMetrics});
      adminApi.latency.mockResolvedValue({data: mockLatency});

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Response Latency')).toBeInTheDocument();
        expect(screen.getByText('API')).toBeInTheDocument();
        expect(screen.getByText('Database')).toBeInTheDocument();
        expect(screen.getByText('LLM')).toBeInTheDocument();
      });
    });

    test('displays latency values correctly', async () => {
      adminApi.stats.mockResolvedValue({data: mockStats});
      adminApi.metrics.mockResolvedValue({data: mockMetrics});
      adminApi.latency.mockResolvedValue({data: mockLatency});

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        // Values are now displayed with "ms" as a separate span
        expect(screen.getByText(String(mockLatency.api))).toBeInTheDocument();
        expect(screen.getByText(String(mockLatency.db))).toBeInTheDocument();
        expect(screen.getByText(String(mockLatency.llm))).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    test('handles API errors gracefully', async () => {
      adminApi.stats.mockRejectedValue(new Error('Network Error'));
      adminApi.metrics.mockRejectedValue(new Error('Network Error'));
      adminApi.latency.mockRejectedValue(new Error('Network Error'));

      renderWithProviders(<DashboardPage />);

      // Should still render the dashboard title without crashing
      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
      });
    });

    test('displays 0 values when stats are null', async () => {
      adminApi.stats.mockResolvedValue({data: null});
      adminApi.metrics.mockResolvedValue({data: null});
      adminApi.latency.mockResolvedValue({data: null});

      renderWithProviders(<DashboardPage />);

      await waitFor(() => {
        // Should display default values (multiple stat cards show 0)
        const zeroValues = screen.getAllByText('0');
        expect(zeroValues.length).toBeGreaterThan(0);
      });
    });
  });
});
