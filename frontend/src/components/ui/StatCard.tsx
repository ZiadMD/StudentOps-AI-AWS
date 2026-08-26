import React from 'react';
import { cn } from '../../lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    positive?: boolean;
  };
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  badge,
  icon,
  trend,
  className
}) => {
  return (
    <div className={cn(
      "rounded-xl p-5 bg-white border border-slate-200/90 shadow-xs transition-all hover:shadow-sm hover:border-slate-300 flex flex-col justify-between",
      className
    )}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</span>
        {icon && (
          <div className="p-2 rounded-lg bg-slate-50 text-slate-600 border border-slate-100">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline space-x-2.5">
        <span className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">{value}</span>
        {badge}
      </div>

      {(subtitle || trend) && (
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
          {subtitle && <span>{subtitle}</span>}
          {trend && (
            <span className={cn(
              "font-medium",
              trend.positive ? "text-emerald-600" : "text-rose-600"
            )}>
              {trend.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
