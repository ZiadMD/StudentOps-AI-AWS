import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 gap-1 select-none",
  {
    variants: {
      variant: {
        neutral: "bg-slate-100 text-slate-700 border border-slate-200",
        success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
        warning: "bg-amber-50 text-amber-800 border border-amber-200",
        danger: "bg-rose-50 text-rose-700 border border-rose-200",
        info: "bg-blue-50 text-blue-700 border border-blue-200",
        purple: "bg-purple-50 text-purple-700 border border-purple-200",
        outline: "text-slate-600 border border-slate-200 bg-white",
      },
      size: {
        sm: "text-[10px] px-1.5 py-0.2",
        md: "text-[11px] px-2 py-0.5",
        lg: "text-xs px-2.5 py-1",
      }
    },
    defaultVariants: {
      variant: "neutral",
      size: "md",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}
