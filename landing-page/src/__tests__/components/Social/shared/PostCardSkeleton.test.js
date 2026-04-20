import PostCardSkeleton from '../../../../components/Social/shared/PostCardSkeleton';

import {ThemeProvider, createTheme} from '@mui/material/styles';
import {render} from '@testing-library/react';
import React from 'react';


const theme = createTheme({palette: {mode: 'dark'}});

function renderWithTheme(ui) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

describe('PostCardSkeleton', () => {
  it('renders without crashing', () => {
    const {container} = renderWithTheme(<PostCardSkeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders 1 skeleton card by default', () => {
    const {container} = renderWithTheme(<PostCardSkeleton />);
    const cards = container.querySelectorAll('.MuiCard-root');
    expect(cards).toHaveLength(1);
  });

  it('renders correct number of skeleton cards for count prop', () => {
    const {container} = renderWithTheme(<PostCardSkeleton count={3} />);
    const cards = container.querySelectorAll('.MuiCard-root');
    expect(cards).toHaveLength(3);
  });

  it('renders 5 skeleton cards when count=5', () => {
    const {container} = renderWithTheme(<PostCardSkeleton count={5} />);
    const cards = container.querySelectorAll('.MuiCard-root');
    expect(cards).toHaveLength(5);
  });

  it('has aria-busy="true" for accessibility on each card', () => {
    const {container} = renderWithTheme(<PostCardSkeleton count={2} />);
    const busyElements = container.querySelectorAll('[aria-busy="true"]');
    expect(busyElements).toHaveLength(2);
  });

  it('renders MUI Skeleton elements inside each card', () => {
    const {container} = renderWithTheme(<PostCardSkeleton />);
    const skeletons = container.querySelectorAll('.MuiSkeleton-root');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders circular skeletons for avatar', () => {
    const {container} = renderWithTheme(<PostCardSkeleton />);
    const circular = container.querySelectorAll('.MuiSkeleton-circular');
    // Avatar placeholder (1 circle)
    expect(circular.length).toBeGreaterThanOrEqual(1);
  });

  it('renders wave animation on skeletons', () => {
    const {container} = renderWithTheme(<PostCardSkeleton />);
    const wave = container.querySelectorAll('.MuiSkeleton-wave');
    expect(wave.length).toBeGreaterThan(0);
  });

  it('renders text skeletons for content lines', () => {
    const {container} = renderWithTheme(<PostCardSkeleton />);
    const text = container.querySelectorAll('.MuiSkeleton-text');
    expect(text.length).toBeGreaterThan(0);
  });

  it('renders rounded skeletons for stat chips', () => {
    const {container} = renderWithTheme(<PostCardSkeleton />);
    const rounded = container.querySelectorAll('.MuiSkeleton-rounded');
    expect(rounded.length).toBeGreaterThan(0);
  });

  it('uses flex layout matching PostCard', () => {
    const {container} = renderWithTheme(<PostCardSkeleton />);
    const card = container.querySelector('.MuiCard-root');
    const style = window.getComputedStyle(card);
    expect(style.display).toBe('flex');
  });

  it('renders zero cards when count=0', () => {
    const {container} = renderWithTheme(<PostCardSkeleton count={0} />);
    const cards = container.querySelectorAll('.MuiCard-root');
    expect(cards).toHaveLength(0);
  });

  it('matches snapshot', () => {
    const {container} = renderWithTheme(<PostCardSkeleton count={1} />);
    expect(container).toMatchSnapshot();
  });
});
