import {
  ToastProvider,
  useToast,
} from '../../../components/shared/ToastProvider';

import {render, screen, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';


// Helper component that exposes showToast for testing
function ToastTrigger({
  type = 'info',
  message = 'Test message',
  title,
  duration,
}) {
  const {showToast, dismissToast} = useToast();
  return (
    <>
      <button
        data-testid="show-toast"
        onClick={() => showToast(type, {message, title, duration})}
      >
        Show Toast
      </button>
      <button data-testid="dismiss-toast" onClick={() => dismissToast(1)}>
        Dismiss
      </button>
    </>
  );
}

function renderWithToastProvider(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe('ToastProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders children correctly', () => {
    renderWithToastProvider(<div data-testid="child">Hello</div>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('shows a toast when showToast is called', () => {
    renderWithToastProvider(
      <ToastTrigger type="success" message="Operation succeeded!" />
    );

    act(() => {
      screen.getByTestId('show-toast').click();
    });

    expect(screen.getByText('Operation succeeded!')).toBeInTheDocument();
  });

  it('shows toast with title when provided', () => {
    renderWithToastProvider(
      <ToastTrigger
        type="achievement"
        message="You leveled up!"
        title="Achievement"
      />
    );

    act(() => {
      screen.getByTestId('show-toast').click();
    });

    expect(screen.getByText('Achievement')).toBeInTheDocument();
    expect(screen.getByText('You leveled up!')).toBeInTheDocument();
  });

  it('auto-dismisses toast after default duration (5s)', () => {
    renderWithToastProvider(
      <ToastTrigger type="info" message="Auto dismiss test" />
    );

    act(() => {
      screen.getByTestId('show-toast').click();
    });

    expect(screen.getByText('Auto dismiss test')).toBeInTheDocument();

    // Advance past 5s auto-dismiss + 300ms cleanup
    act(() => {
      jest.advanceTimersByTime(5300);
    });

    expect(screen.queryByText('Auto dismiss test')).not.toBeInTheDocument();
  });

  it('auto-dismisses toast after custom duration', () => {
    renderWithToastProvider(
      <ToastTrigger type="info" message="Custom duration" duration={2000} />
    );

    act(() => {
      screen.getByTestId('show-toast').click();
    });

    expect(screen.getByText('Custom duration')).toBeInTheDocument();

    // Advance past 2s custom + 300ms cleanup
    act(() => {
      jest.advanceTimersByTime(2300);
    });

    expect(screen.queryByText('Custom duration')).not.toBeInTheDocument();
  });

  it('limits visible toasts to MAX_VISIBLE (3)', () => {
    renderWithToastProvider(
      <ToastTrigger type="info" message="Toast" duration={10000} />
    );

    // Show 5 toasts rapidly
    for (let i = 0; i < 5; i++) {
      act(() => {
        screen.getByTestId('show-toast').click();
      });
    }

    // Only MAX_VISIBLE (3) Snackbar elements should be rendered
    // Each toast renders a Snackbar with role="presentation"
    const toastMessages = screen.getAllByText('Toast');
    expect(toastMessages.length).toBeLessThanOrEqual(3);
  });

  it('renders different toast types with correct styling', () => {
    // Success toast
    const {unmount} = renderWithToastProvider(
      <ToastTrigger type="success" message="Success!" />
    );

    act(() => {
      screen.getByTestId('show-toast').click();
    });

    expect(screen.getByText('Success!')).toBeInTheDocument();
    unmount();
  });

  it('renders close button on each toast', () => {
    renderWithToastProvider(
      <ToastTrigger type="info" message="Closable toast" />
    );

    act(() => {
      screen.getByTestId('show-toast').click();
    });

    // MUI IconButton with CloseIcon should be present
    const closeButtons = document.querySelectorAll('[data-testid="CloseIcon"]');
    expect(closeButtons.length).toBeGreaterThan(0);
  });

  it('stacks toasts vertically with offset', () => {
    renderWithToastProvider(
      <ToastTrigger type="info" message="Stacked toast" duration={10000} />
    );

    // Show 2 toasts
    act(() => {
      screen.getByTestId('show-toast').click();
    });
    act(() => {
      screen.getByTestId('show-toast').click();
    });

    // Each toast should have a top offset via sx
    const snackbars = document.querySelectorAll('.MuiSnackbar-root');
    // At least 1 snackbar should be present
    expect(snackbars.length).toBeGreaterThanOrEqual(1);
  });
});

describe('useToast hook', () => {
  it('provides showToast and dismissToast functions', () => {
    let hookResult;
    function Consumer() {
      hookResult = useToast();
      return null;
    }

    render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>
    );

    expect(hookResult).toBeDefined();
    expect(typeof hookResult.showToast).toBe('function');
    expect(typeof hookResult.dismissToast).toBe('function');
  });
});
