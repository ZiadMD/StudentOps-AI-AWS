import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/*
 * Status tags.
 *
 * Tinted background plus matching text, which clears WCAG AA at small sizes.
 * These are the only place saturated colour is used, so a tag always carries
 * meaning rather than decorating.
 *
 * `success` and `danger` are kept as aliases of `compliant` and `critical`
 * because those are the names the attendance policy uses for the 70% and 50%
 * thresholds, and the two vocabularies should not drift apart.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold " +
  "tracking-[0.01em] transition-colors",
  {
    variants: {
      variant: {
        neutral: "bg-paper-200 text-ink-700",
        success: "bg-green-50 text-green-800",
        compliant: "bg-green-50 text-green-800",
        warning: "bg-amber-50 text-amber-800",
        danger: "bg-red-50 text-red-800",
        critical: "bg-red-50 text-red-800",
        info: "bg-indigo-50 text-indigo-800",
        violet: "bg-violet-50 text-violet-800",
        purple: "bg-violet-50 text-violet-800",
        outline: "border border-rule bg-transparent text-ink-600",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
