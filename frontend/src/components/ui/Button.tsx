import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/*
 * Buttons.
 *
 * The primary is ink-on-paper rather than a saturated brand fill, which keeps
 * the interface calm and lets colour stay meaningful (state, not decoration).
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-paper ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        // Ink fill. One per view is enough.
        primary: 'bg-ink-900 text-paper-50 hover:bg-ink-800 shadow-xs',
        // Paper surface with a hairline. The default for most actions.
        secondary: 'bg-paper-50 text-ink-800 border border-rule hover:bg-paper-100 hover:border-paper-400',
        // Text only, for tertiary actions inside a row.
        ghost: 'text-ink-700 hover:bg-paper-200/70 hover:text-ink-900',
        // A tinted action for a positive, non-default path.
        positive: 'bg-green-700 text-paper-50 hover:bg-green-800 shadow-xs',
        danger: 'bg-red-700 text-paper-50 hover:bg-red-800 shadow-xs',
        // Destructive-looking but secondary weight.
        dangerGhost: 'text-red-700 hover:bg-red-50',
      },
      size: {
        sm: 'min-h-9 px-2.5 text-xs gap-1.5',
        md: 'min-h-10 px-3.5 gap-2',
        lg: 'min-h-12 px-5 text-sm',
        icon: 'h-10 w-10 min-h-10',
        iconSm: 'h-9 w-9 min-h-9',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <svg className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

/** A text action that reads as an inline link, with a real 44px phone target. */
export const TextButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex min-h-9 items-center gap-1 rounded px-1.5 text-xs font-medium text-indigo-700',
      'transition-colors hover:bg-indigo-50 hover:text-indigo-800',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600',
      className,
    )}
    {...props}
  >
    {children}
  </button>
));
TextButton.displayName = 'TextButton';
