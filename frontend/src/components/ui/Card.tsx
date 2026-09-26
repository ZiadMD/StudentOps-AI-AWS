import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Panel.
 *
 * Deliberately not a heavy bordered box. By default a panel is bounded by a
 * top rule only, so a page reads as a set of ruled sections on one sheet of
 * paper rather than a grid of identical cards. Pass `framed` when a surface
 * genuinely needs to lift off the canvas.
 */
export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { framed?: boolean }
>(({ className, framed, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      framed
        ? 'rounded-lg border border-rule bg-paper-50 shadow-xs'
        : 'border-t border-rule pt-5',
      className,
    )}
    {...props}
  />
));
Card.displayName = 'Card';

/** Section eyebrow. Matches the small-caps label used in navigation. */
export const CardEyebrow = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('eyebrow', className)} {...props} />
));
CardEyebrow.displayName = 'CardEyebrow';

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      'font-display text-lg font-medium leading-tight tracking-[-0.015em] text-ink-900',
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('mt-1 text-sm leading-relaxed text-ink-soft', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('mt-4', className)} {...props} />
));
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('mt-4 flex items-center gap-3', className)} {...props} />
));
CardFooter.displayName = 'CardFooter';

/**
 * Figure tile.
 *
 * A headline number set in the display serif. The real alternative to a metric
 * card with an icon in a tinted square: no decoration, one large figure, and a
 * caption that states the operational context instead of a fabricated trend.
 */
export function FigureTile({
  value,
  label,
  detail,
  tone = 'neutral',
  as: Tag = 'div',
  className,
}: {
  value: React.ReactNode;
  label: string;
  detail?: React.ReactNode;
  tone?: 'neutral' | 'compliant' | 'atRisk' | 'critical';
  as?: 'div' | 'dd';
  className?: string;
}) {
  const toneClass = {
    neutral: 'text-ink-900',
    compliant: 'text-green-700',
    atRisk: 'text-amber-700',
    critical: 'text-red-700',
  }[tone];

  return (
    <Tag className={cn('min-w-0', className)}>
      <dd className={cn('figure text-4xl sm:text-5xl', toneClass)}>{value}</dd>
      <dt className="mt-2 text-sm font-medium text-ink-800">{label}</dt>
      {detail && <p className="mt-0.5 text-xs leading-5 text-ink-soft">{detail}</p>}
    </Tag>
  );
}
