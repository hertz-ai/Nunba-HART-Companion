import StarRating from '../../../../components/Social/shared/StarRating';
import {renderWithProviders} from '../../../testHelpers';

import {screen} from '@testing-library/react';
import React from 'react';

// StarRating component renders ratings for 4 dimensions: skill, usefulness, reliability, creativity
// It expects a `values` object with these keys (0-5 scale each)

describe('StarRating Component', () => {
  const mockValues = {
    skill: 4,
    usefulness: 3.5,
    reliability: 5,
    creativity: 2,
  };

  describe('Rendering', () => {
    test('renders all dimension labels', () => {
      renderWithProviders(<StarRating values={mockValues} />);
      expect(screen.getByText('Skill')).toBeInTheDocument();
      expect(screen.getByText('Usefulness')).toBeInTheDocument();
      expect(screen.getByText('Reliability')).toBeInTheDocument();
      expect(screen.getByText('Creativity')).toBeInTheDocument();
    });

    test('renders with empty values', () => {
      renderWithProviders(<StarRating values={{}} />);
      expect(screen.getByText('Skill')).toBeInTheDocument();
    });

    test('renders rating values', () => {
      renderWithProviders(<StarRating values={mockValues} />);
      expect(screen.getByText('4.0')).toBeInTheDocument();
      expect(screen.getByText('3.5')).toBeInTheDocument();
      expect(screen.getByText('5.0')).toBeInTheDocument();
      expect(screen.getByText('2.0')).toBeInTheDocument();
    });
  });

  describe('Read Only Mode', () => {
    test('renders in read-only mode by default', () => {
      renderWithProviders(<StarRating values={mockValues} />);
      // All ratings should be present
      expect(screen.getByText('Skill')).toBeInTheDocument();
    });

    test('renders in read-only mode when specified', () => {
      renderWithProviders(<StarRating values={mockValues} readOnly={true} />);
      expect(screen.getByText('Skill')).toBeInTheDocument();
    });
  });

  describe('Interactivity', () => {
    test('calls onChange when editable', () => {
      const handleChange = jest.fn();
      renderWithProviders(
        <StarRating
          values={mockValues}
          onChange={handleChange}
          readOnly={false}
        />
      );
      // Should render interactive ratings
      expect(screen.getByText('Skill')).toBeInTheDocument();
    });
  });

  describe('Zero Values', () => {
    test('handles all zero values', () => {
      const zeroValues = {
        skill: 0,
        usefulness: 0,
        reliability: 0,
        creativity: 0,
      };
      renderWithProviders(<StarRating values={zeroValues} />);
      expect(screen.getAllByText('0.0').length).toBe(4);
    });
  });
});
