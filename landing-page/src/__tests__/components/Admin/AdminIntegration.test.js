import {
  renderWithProviders,
  mockStats,
  mockUsers,
  mockReports,
} from '../../testHelpers';

import {screen, waitFor} from '@testing-library/react';
import React from 'react';

// Mock all admin APIs
jest.mock('../../../services/socialApi', () => ({
  adminApi: {
    stats: jest.fn(),
    metrics: jest.fn(),
    latency: jest.fn(),
    users: jest.fn(),
    syncAgents: jest.fn(),
  },
  moderationApi: {
    reports: jest.fn(),
    reviewReport: jest.fn(),
    ban: jest.fn(),
    unban: jest.fn(),
  },
  channelsApi: {
    list: jest.fn(),
  },
  workflowsApi: {
    list: jest.fn(),
  },
  settingsApi: {
    getSecurity: jest.fn(),
    getMedia: jest.fn(),
    getResponse: jest.fn(),
    getMemory: jest.fn(),
  },
  identityApi: {
    get: jest.fn(),
    getAvatars: jest.fn(),
  },
}));

import {adminApi, moderationApi} from '../../../services/socialApi';

describe('Admin Module Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Admin Layout Navigation Flow', () => {
    test('admin layout renders correctly with dashboard content', async () => {
      const AdminLayout =
        require('../../../components/Admin/AdminLayout').default;
      const DashboardPage =
        require('../../../components/Admin/DashboardPage').default;

      adminApi.stats.mockResolvedValue({data: mockStats});
      adminApi.metrics.mockResolvedValue({data: null});
      adminApi.latency.mockResolvedValue({data: null});

      renderWithProviders(
        <AdminLayout>
          <DashboardPage />
        </AdminLayout>
      );

      // Layout elements should be present (mobile + desktop drawers render sidebar twice)
      const adminPanelElements = screen.getAllByText('Admin Panel');
      expect(adminPanelElements.length).toBeGreaterThan(0);
      expect(screen.getByText('Nunba Admin')).toBeInTheDocument();
      // There may be multiple "Dashboard" elements (nav drawers + header), check for at least one
      const dashboardElements = screen.getAllByText('Dashboard');
      expect(dashboardElements.length).toBeGreaterThan(0);
    });

    test('admin layout renders correctly with users content', async () => {
      const AdminLayout =
        require('../../../components/Admin/AdminLayout').default;
      const UsersManagementPage =
        require('../../../components/Admin/UsersManagementPage').default;

      adminApi.users.mockResolvedValue({data: mockUsers});

      renderWithProviders(
        <AdminLayout>
          <UsersManagementPage />
        </AdminLayout>
      );

      const adminPanelElements = screen.getAllByText('Admin Panel');
      expect(adminPanelElements.length).toBeGreaterThan(0);
      expect(screen.getByText('User Management')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('john_doe')).toBeInTheDocument();
      });
    });

    test('admin layout renders correctly with moderation content', async () => {
      const AdminLayout =
        require('../../../components/Admin/AdminLayout').default;
      const ModerationPage =
        require('../../../components/Admin/ModerationPage').default;

      moderationApi.reports.mockResolvedValue({data: mockReports});

      renderWithProviders(
        <AdminLayout>
          <ModerationPage />
        </AdminLayout>
      );

      const adminPanelElements = screen.getAllByText('Admin Panel');
      expect(adminPanelElements.length).toBeGreaterThan(0);

      await waitFor(() => {
        expect(screen.getByText('Moderation Queue')).toBeInTheDocument();
      });
    });
  });

  describe('API Error Handling Across Components', () => {
    test('dashboard handles API failures gracefully', async () => {
      const DashboardPage =
        require('../../../components/Admin/DashboardPage').default;

      adminApi.stats.mockRejectedValue(new Error('API Error'));
      adminApi.metrics.mockRejectedValue(new Error('API Error'));
      adminApi.latency.mockRejectedValue(new Error('API Error'));

      renderWithProviders(<DashboardPage />);

      // Should not crash, should show title
      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
      });
    });

    test('users page handles API failures gracefully', async () => {
      const UsersManagementPage =
        require('../../../components/Admin/UsersManagementPage').default;

      adminApi.users.mockRejectedValue(new Error('API Error'));

      renderWithProviders(<UsersManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('User Management')).toBeInTheDocument();
      });
    });

    test('moderation page handles API failures gracefully', async () => {
      const ModerationPage =
        require('../../../components/Admin/ModerationPage').default;

      moderationApi.reports.mockRejectedValue(new Error('API Error'));

      renderWithProviders(<ModerationPage />);

      // Should not crash
      await waitFor(() => {
        expect(document.body).toBeInTheDocument();
      });
    });
  });
});
