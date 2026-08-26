import React from 'react';
import { cn } from '../../lib/utils';

interface ProgressBarProps {
  value: number; // 0 - 100
  max?: number;
  label?: string;
  sublabel?: string;
  color?: 'sky' | 'emerald' | 'amber' | 'rose' | 'purple';
  showPercentage?: boolean;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  label,
  sublabel,
  color = 'sky',
  showPercentage = true,
  className
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const colorStyles = {
    sky: 'bg-blue-600',
    emerald: 'bg-emerald-600',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    purple: 'bg-purple-600',
  };

  return (
    <div className={cn("w-full space-y-1.5", className)}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="font-semibold text-slate-700">{label}</span>}
          {sublabel && <span className="text-slate-400">{sublabel}</span>}
          {showPercentage && !sublabel && (
            <span className="font-mono font-bold text-slate-700">{percentage.toFixed(0)}%</span>
          )}
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 border border-slate-200/80">
        <div
          className={cn("h-full transition-all duration-500 rounded-full", colorStyles[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
