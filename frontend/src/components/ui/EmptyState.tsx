import * as React from "react";
import { FolderOpen } from "lucide-react";
import { cn } from "../../lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 px-4 text-center rounded-lg border border-dashed border-rule bg-paper-100/50",
        className
      )}
    >
      <div className="w-12 h-12 rounded-full bg-paper-200 text-ink-faint flex items-center justify-center mb-3">
        {icon || <FolderOpen className="w-6 h-6" />}
      </div>
      <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
      {description && (
        <p className="text-xs text-ink-soft max-w-sm mt-1 mb-4 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};
