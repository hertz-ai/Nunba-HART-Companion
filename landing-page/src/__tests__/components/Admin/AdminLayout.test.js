import AdminLayout from '../../../components/Admin/AdminLayout';
import {renderWithProviders} from '../../testHelpers';

import {screen, fireEvent} from '@testing-library/react';
import React from 'react';

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({pathname: '/admin'}),
}));

describe('AdminLayout Component', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  describe('Rendering', () => {
    test('renders Admin Panel title in sidebar', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );
      // Mobile + desktop drawers both render sidebar content, so text appears multiple times
      const elements = screen.getAllByText('Admin Panel');
      expect(elements.length).toBeGreaterThan(0);
      expect(elements[0]).toBeInTheDocument();
    });

    test('renders Nunba Admin title in app bar', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );
      expect(screen.getByText('Nunba Admin')).toBeInTheDocument();
    });

    test('renders children content', () => {
      renderWithProviders(
        <AdminLayout>
          <div data-testid="test-child">Test Child Content</div>
        </AdminLayout>
      );
      expect(screen.getByTestId('test-child')).toBeInTheDocument();
      expect(screen.getByText('Test Child Content')).toBeInTheDocument();
    });

    test('renders all navigation menu items', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      const navItems = [
        'Dashboard',
        'Revenue',
        'Users',
        'Moderation',
        'Agent Sync',
        'Channels',
        'Workflows',
        'Settings',
        'Identity',
        'Agents Live',
        'Content Tasks',
      ];

      // Each nav item appears in both mobile and desktop drawers
      navItems.forEach((item) => {
        const elements = screen.getAllByText(item);
        expect(elements.length).toBeGreaterThan(0);
      });
    });

    test('renders back button', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      // Back button should exist (ArrowBackIcon)
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Navigation', () => {
    test('navigates to /social when back button clicked', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      // Find the back button by its tooltip
      const backButton = screen.getByLabelText('Back to Social');
      fireEvent.click(backButton);
      expect(mockNavigate).toHaveBeenCalledWith('/social');
    });

    test('navigates to /admin/users when Users clicked', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      fireEvent.click(screen.getAllByText('Users')[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/admin/users');
    });

    test('navigates to /admin/moderation when Moderation clicked', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      fireEvent.click(screen.getAllByText('Moderation')[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/admin/moderation');
    });

    test('navigates to /admin/agents when Agent Sync clicked', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      fireEvent.click(screen.getAllByText('Agent Sync')[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/admin/agents');
    });

    test('navigates to /admin/channels when Channels clicked', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      fireEvent.click(screen.getAllByText('Channels')[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/admin/channels');
    });

    test('navigates to /admin/workflows when Workflows clicked', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      fireEvent.click(screen.getAllByText('Workflows')[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/admin/workflows');
    });

    test('navigates to /admin/settings when Settings clicked', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      fireEvent.click(screen.getAllByText('Settings')[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/admin/settings');
    });

    test('navigates to /admin/identity when Identity clicked', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      fireEvent.click(screen.getAllByText('Identity')[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/admin/identity');
    });

    test('navigates to /admin/revenue when Revenue clicked', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      fireEvent.click(screen.getAllByText('Revenue')[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/admin/revenue');
    });

    test('navigates to /admin/agent-dashboard when Agents Live clicked', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      fireEvent.click(screen.getAllByText('Agents Live')[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/admin/agent-dashboard');
    });

    test('navigates to /admin/content-tasks when Content Tasks clicked', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      fireEvent.click(screen.getAllByText('Content Tasks')[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/admin/content-tasks');
    });
  });

  describe('Active State', () => {
    test('Dashboard item is selected when on /admin path', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      const dashboardButton = screen
        .getAllByText('Dashboard')[0]
        .closest('[role="button"]');
      expect(dashboardButton).toHaveClass('Mui-selected');
    });
  });

  describe('Accessibility', () => {
    test('navigation items are keyboard accessible', () => {
      renderWithProviders(
        <AdminLayout>
          <div>Content</div>
        </AdminLayout>
      );

      const usersButton = screen
        .getAllByText('Users')[0]
        .closest('[role="button"]');
      expect(usersButton).toHaveAttribute('tabindex', '0');
    });
  });
});
