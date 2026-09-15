import React from 'react';
import { cn } from '../../lib/utils';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Base pulsing skeleton block with high-contrast slate shading.
 * Accessible with role="status" and aria-busy="true".
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className, ...props }) => {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading content"
      className={cn('animate-pulse rounded-md bg-slate-200/80', className)}
      {...props}
    />
  );
};

/**
 * Composite desktop table row skeleton designed for tabular rosters (e.g. Member Registry, Scoreboard).
 */
export const SkeletonTableRow: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <tr className={cn('border-b border-slate-100', className)}>
      {/* Composite identity: Avatar + primary Arabic title + secondary Latin / student code */}
      <td className="px-5 py-4">
        <div className="flex items-center space-x-3">
          <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
          <div className="space-y-1.5 flex-1 max-w-[200px]">
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
        </div>
      </td>

      {/* Stacked contact lines */}
      <td className="px-5 py-4">
        <div className="space-y-1.5 max-w-[180px]">
          <Skeleton className="h-3.5 w-4/5 rounded" />
          <Skeleton className="h-3 w-3/5 rounded" />
        </div>
      </td>

      {/* Role badge + university */}
      <td className="px-5 py-4">
        <div className="space-y-1.5 max-w-[160px]">
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
        </div>
      </td>

      {/* Status Pill */}
      <td className="px-5 py-4 text-center">
        <Skeleton className="h-5 w-16 rounded-full mx-auto" />
      </td>

      {/* Action button */}
      <td className="px-5 py-4 text-right">
        <Skeleton className="h-7 w-7 rounded-lg ml-auto" />
      </td>
    </tr>
  );
};

/**
 * Responsive mobile data card skeleton for mobile dual-mode lists.
 */
export const SkeletonCard: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        'p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
        </div>
        <Skeleton className="h-5 w-16 rounded-full shrink-0" />
      </div>

      <div className="pt-2 border-t border-slate-100 space-y-2">
        <Skeleton className="h-3.5 w-5/6 rounded" />
        <Skeleton className="h-3.5 w-2/3 rounded" />
      </div>

      <div className="pt-2 flex items-center justify-between">
        <Skeleton className="h-4 w-20 rounded" />
        <Skeleton className="h-7 w-20 rounded-lg" />
      </div>
    </div>
  );
};

/**
 * Metric stat card skeleton for dashboards and scoreboards.
 */
export const SkeletonStatCard: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cn(
        'p-5 bg-white border border-slate-200/90 rounded-xl shadow-xs space-y-3',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-24 rounded" />
        <Skeleton className="w-8 h-8 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-20 rounded" />
      <Skeleton className="h-3 w-32 rounded" />
    </div>
  );
};
