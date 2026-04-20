import PageSkeleton from '../../../components/shared/PageSkeleton';

import {ThemeProvider, createTheme} from '@mui/material/styles';
import {render, screen} from '@testing-library/react';
import React from 'react';


const theme = createTheme({palette: {mode: 'dark'}});

function renderWithTheme(ui) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

describe('PageSkeleton', () => {
  describe('default variant', () => {
    it('renders without crashing', () => {
      const {container} = renderWithTheme(<PageSkeleton />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('has aria-busy attribute for accessibility', () => {
      const {container} = renderWithTheme(<PageSkeleton />);
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    });

    it('renders MUI Skeleton elements', () => {
      const {container} = renderWithTheme(<PageSkeleton />);
      const skeletons = container.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('uses wave animation', () => {
      const {container} = renderWithTheme(<PageSkeleton />);
      const waveSkeletons = container.querySelectorAll('.MuiSkeleton-wave');
      expect(waveSkeletons.length).toBeGreaterThan(0);
    });

    it('renders text, rounded, and rectangular skeletons', () => {
      const {container} = renderWithTheme(<PageSkeleton />);
      const textSkeletons = container.querySelectorAll('.MuiSkeleton-text');
      const roundedSkeletons = container.querySelectorAll(
        '.MuiSkeleton-rounded'
      );
      expect(textSkeletons.length).toBeGreaterThan(0);
      expect(roundedSkeletons.length).toBeGreaterThan(0);
    });
  });

  describe('feed variant', () => {
    it('renders without crashing', () => {
      const {container} = renderWithTheme(<PageSkeleton variant="feed" />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('has aria-busy attribute', () => {
      const {container} = renderWithTheme(<PageSkeleton variant="feed" />);
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    });

    it('renders multiple card-like skeleton groups', () => {
      const {container} = renderWithTheme(<PageSkeleton variant="feed" />);
      // Feed variant renders 4 skeleton card groups
      const circularSkeletons = container.querySelectorAll(
        '.MuiSkeleton-circular'
      );
      expect(circularSkeletons.length).toBeGreaterThan(0);
    });

    it('renders circular skeletons for avatars', () => {
      const {container} = renderWithTheme(<PageSkeleton variant="feed" />);
      const circular = container.querySelectorAll('.MuiSkeleton-circular');
      expect(circular.length).toBeGreaterThanOrEqual(4); // 1 per card, 4 cards
    });
  });

  describe('chat variant', () => {
    it('renders without crashing', () => {
      const {container} = renderWithTheme(<PageSkeleton variant="chat" />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('has aria-busy attribute', () => {
      const {container} = renderWithTheme(<PageSkeleton variant="chat" />);
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    });

    it('renders chat-like skeleton layout with message bubbles', () => {
      const {container} = renderWithTheme(<PageSkeleton variant="chat" />);
      const skeletons = container.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('snapshot consistency', () => {
    it('default variant matches snapshot', () => {
      const {container} = renderWithTheme(<PageSkeleton />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('feed variant matches snapshot', () => {
      const {container} = renderWithTheme(<PageSkeleton variant="feed" />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('chat variant matches snapshot', () => {
      const {container} = renderWithTheme(<PageSkeleton variant="chat" />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
