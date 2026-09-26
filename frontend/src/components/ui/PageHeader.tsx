import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Small-caps kicker above the title, e.g. the committee name. */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Trailing metadata set in mono, e.g. a date or a record count. */
  meta?: ReactNode;
}

/**
 * Page masthead.
 *
 * A newspaper-style head: kicker, large serif title, optional standfirst and a
 * ruled metadata line. The rule underneath is what separates one record from
 * the next, replacing the identical coloured header strip every card used to
 * carry.
 */
export function PageHeader({ title, description, eyebrow, actions, meta }: PageHeaderProps) {
  return (
    <header className="border-b border-ink-900/15 pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <h1 className="font-display text-[1.75rem] font-medium leading-[1.1] tracking-[-0.02em] text-ink-900 sm:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2.5 max-w-2xl text-sm leading-6 text-ink-soft">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      {meta && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-2xs text-ink-faint">
          {meta}
        </div>
      )}
    </header>
  );
}
