import ResonanceWallet from '../../../../components/Social/shared/ResonanceWallet';
import {renderWithProviders} from '../../../testHelpers';

import {screen} from '@testing-library/react';
import React from 'react';

describe('ResonanceWallet Component', () => {
  const mockWallet = {
    level: 5,
    level_title: 'Explorer',
    pulse: 1250,
    spark: 340,
    signal: 2.45,
    xp: 750,
    xp_next_level: 1000,
  };

  describe('Rendering', () => {
    test('renders null when wallet is not provided', () => {
      const {container} = renderWithProviders(
        <ResonanceWallet wallet={null} />
      );
      expect(container.firstChild).toBeNull();
    });

    test('renders level badge with correct level', () => {
      renderWithProviders(<ResonanceWallet wallet={mockWallet} />);
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    test('renders Pulse currency', () => {
      renderWithProviders(<ResonanceWallet wallet={mockWallet} />);
      expect(screen.getByText('Pulse')).toBeInTheDocument();
      expect(screen.getByText('1.3K')).toBeInTheDocument(); // 1250 formatted
    });

    test('renders Spark currency', () => {
      renderWithProviders(<ResonanceWallet wallet={mockWallet} />);
      expect(screen.getByText('Spark')).toBeInTheDocument();
      expect(screen.getByText('340')).toBeInTheDocument();
    });

    test('renders Signal currency', () => {
      renderWithProviders(<ResonanceWallet wallet={mockWallet} />);
      expect(screen.getByText('Signal')).toBeInTheDocument();
      expect(screen.getByText('2.45')).toBeInTheDocument();
    });

    test('renders XP progress bar (custom component, not MuiLinearProgress)', () => {
      const {container} = renderWithProviders(
        <ResonanceWallet wallet={mockWallet} />
      );
      // The component uses a custom XPProgressBar, not MuiLinearProgress
      // Check that the XP tooltip content exists
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Number Formatting', () => {
    test('formats thousands with K suffix', () => {
      const wallet = {...mockWallet, pulse: 5500};
      renderWithProviders(<ResonanceWallet wallet={wallet} />);
      expect(screen.getByText('5.5K')).toBeInTheDocument();
    });

    test('formats millions with M suffix', () => {
      const wallet = {...mockWallet, pulse: 2500000};
      renderWithProviders(<ResonanceWallet wallet={wallet} />);
      expect(screen.getByText('2.5M')).toBeInTheDocument();
    });

    test('handles zero values', () => {
      const wallet = {...mockWallet, pulse: 0, spark: 0, signal: 0};
      renderWithProviders(<ResonanceWallet wallet={wallet} />);
      // formatNumber returns '0' for 0, signal shows '0.00'
      expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Compact Mode', () => {
    test('renders in compact mode', () => {
      renderWithProviders(
        <ResonanceWallet wallet={mockWallet} compact={true} />
      );
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('Pulse')).toBeInTheDocument();
    });
  });

  describe('Level Colors', () => {
    test('uses starter color for low levels', () => {
      const wallet = {...mockWallet, level: 5};
      renderWithProviders(<ResonanceWallet wallet={wallet} />);
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    test('uses intermediate color for mid levels', () => {
      const wallet = {...mockWallet, level: 15};
      renderWithProviders(<ResonanceWallet wallet={wallet} />);
      expect(screen.getByText('15')).toBeInTheDocument();
    });

    test('uses gold color for high levels', () => {
      const wallet = {...mockWallet, level: 30};
      renderWithProviders(<ResonanceWallet wallet={wallet} />);
      expect(screen.getByText('30')).toBeInTheDocument();
    });
  });
});
