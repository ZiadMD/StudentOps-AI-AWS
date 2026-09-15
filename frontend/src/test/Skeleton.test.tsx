import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton, SkeletonTableRow, SkeletonCard, SkeletonStatCard } from '../components/ui/Skeleton';

describe('Skeleton UI Components', () => {
  it('renders base skeleton with accessible status role', () => {
    render(<Skeleton className="w-32 h-6" data-testid="base-skeleton" />);
    const el = screen.getByTestId('base-skeleton');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('role', 'status');
    expect(el).toHaveAttribute('aria-busy', 'true');
    expect(el).toHaveClass('animate-pulse');
  });

  it('renders desktop table row skeleton with composite cells', () => {
    render(
      <table>
        <tbody>
          <SkeletonTableRow />
        </tbody>
      </table>
    );
    const cells = screen.getAllByRole('cell');
    expect(cells.length).toBe(5);
    const skeletons = screen.getAllByRole('status');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders mobile data card skeleton', () => {
    render(<SkeletonCard />);
    const cards = screen.getAllByRole('status');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('renders stat card skeleton for scoreboards and dashboards', () => {
    render(<SkeletonStatCard />);
    const statCards = screen.getAllByRole('status');
    expect(statCards.length).toBeGreaterThan(0);
  });
});
