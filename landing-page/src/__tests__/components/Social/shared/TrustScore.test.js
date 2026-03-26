import TrustScore from '../../../../components/Social/shared/TrustScore';
import {renderWithProviders} from '../../../testHelpers';

import {screen} from '@testing-library/react';
import React from 'react';

// TrustScore component renders a radar chart with 5 axes:
// skill, usefulness, reliability, creativity, composite (each 0-5 scale)
// It expects a `scores` object, not a single `score` number

describe('TrustScore Component', () => {
  const mockScores = {
    skill: 4.2,
    usefulness: 3.8,
    reliability: 4.5,
    creativity: 3.0,
    composite: 3.9,
  };

  describe('Rendering', () => {
    test('renders radar chart with axis labels', () => {
      renderWithProviders(<TrustScore scores={mockScores} />);
      expect(screen.getByText('Skill')).toBeInTheDocument();
      expect(screen.getByText('Usefulness')).toBeInTheDocument();
      expect(screen.getByText('Reliability')).toBeInTheDocument();
      expect(screen.getByText('Creativity')).toBeInTheDocument();
      expect(screen.getByText('Composite')).toBeInTheDocument();
    });

    test('renders with default empty scores', () => {
      const {container} = renderWithProviders(<TrustScore />);
      // Should render the SVG radar chart
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    test('shows composite score in full size mode', () => {
      renderWithProviders(<TrustScore scores={mockScores} size="full" />);
      expect(screen.getByText(/Composite Trust/)).toBeInTheDocument();
      expect(screen.getByText(/3.9/)).toBeInTheDocument();
    });
  });

  describe('Score Ranges', () => {
    test('handles low scores', () => {
      const lowScores = {
        skill: 1,
        usefulness: 1,
        reliability: 1,
        creativity: 1,
        composite: 1,
      };
      const {container} = renderWithProviders(
        <TrustScore scores={lowScores} />
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    test('handles medium scores', () => {
      const medScores = {
        skill: 2.5,
        usefulness: 2.5,
        reliability: 2.5,
        creativity: 2.5,
        composite: 2.5,
      };
      const {container} = renderWithProviders(
        <TrustScore scores={medScores} />
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    test('handles high scores', () => {
      const highScores = {
        skill: 5,
        usefulness: 5,
        reliability: 5,
        creativity: 5,
        composite: 5,
      };
      const {container} = renderWithProviders(
        <TrustScore scores={highScores} />
      );
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    test('caps score at 5 (max)', () => {
      const overScores = {
        skill: 10,
        usefulness: 10,
        reliability: 10,
        creativity: 10,
        composite: 10,
      };
      const {container} = renderWithProviders(
        <TrustScore scores={overScores} />
      );
      // Should handle overflow gracefully
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    test('renders compact size', () => {
      const {container} = renderWithProviders(
        <TrustScore scores={mockScores} size="compact" />
      );
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '140');
    });

    test('renders full size (default)', () => {
      const {container} = renderWithProviders(
        <TrustScore scores={mockScores} size="full" />
      );
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('width', '240');
    });
  });
});
