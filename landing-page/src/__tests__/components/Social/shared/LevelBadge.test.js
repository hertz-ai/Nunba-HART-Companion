import LevelBadge from '../../../../components/Social/shared/LevelBadge';
import {renderWithProviders} from '../../../testHelpers';

import {screen} from '@testing-library/react';
import React from 'react';

describe('LevelBadge Component', () => {
  describe('Rendering', () => {
    test('renders level number', () => {
      renderWithProviders(<LevelBadge level={10} />);
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    test('renders default level 1 when not provided', () => {
      renderWithProviders(<LevelBadge />);
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    test('renders with title', () => {
      renderWithProviders(<LevelBadge level={5} />);
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    test('renders small size (16px)', () => {
      const {container} = renderWithProviders(
        <LevelBadge level={5} size={16} />
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    test('renders medium size (24px - default)', () => {
      const {container} = renderWithProviders(
        <LevelBadge level={5} size={24} />
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    test('renders large size (32px)', () => {
      const {container} = renderWithProviders(
        <LevelBadge level={5} size={32} />
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });
});
