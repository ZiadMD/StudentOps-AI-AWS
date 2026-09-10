import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from '../context/ToastContext';

const TestComponent: React.FC = () => {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success('Operation succeeded')}>Show Success</button>
      <button onClick={() => toast.error('Something went wrong')}>Show Error</button>
      <button onClick={() => toast.warning('Caution advised')}>Show Warning</button>
      <button onClick={() => toast.info('Informational message')}>Show Info</button>
    </div>
  );
};

describe('Toast notification system', () => {
  it('throws error when useToast is used outside ToastProvider', () => {
    // Suppress console.error for expected thrown error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestComponent />)).toThrow(
      'useToast must be used within a ToastProvider'
    );
    spy.mockRestore();
  });

  it('renders success toast when triggered', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Success'));
    expect(screen.getByText('Operation succeeded')).toBeInTheDocument();
  });

  it('renders error toast when triggered', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Error'));
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('dismisses toast when close button is clicked', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Info'));
    expect(screen.getByText('Informational message')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: /dismiss notification/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByText('Informational message')).not.toBeInTheDocument();
  });
});
