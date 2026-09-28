import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Menu button with an anchored list of actions.
 *
 * Follows the WAI-ARIA menu-button pattern rather than the disclosure pattern,
 * because these are commands, not panels of content: opening moves focus to
 * the first item, Up/Down/Home/End move between items, Escape closes and
 * returns focus to the trigger, and a click outside closes. Tab closes the
 * menu and moves on, so keyboard users are never trapped in it.
 *
 * The trigger keeps a stable size across every state. Showing the chevron only
 * while open would reflow the header on every interaction, so it is always
 * present and simply rotates.
 */

export interface MenuAction {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Renders in the danger colour. Use for destructive or session-ending actions. */
  tone?: 'danger';
  /** Rendered under the label, for role or status context. */
  description?: string;
}

export interface MenuProps {
  /** Accessible name for the trigger. */
  label: string;
  /** The visible trigger content. When omitted, `children` is used instead. */
  trigger?: ReactNode;
  /** Alternate way to supply the trigger, for composition. */
  children?: ReactNode;
  actions: MenuAction[];
  align?: 'start' | 'end';
  /** Optional heading rendered above the actions. */
  header?: ReactNode;
  className?: string;
}

export function Menu({
  label,
  trigger,
  children,
  actions,
  align = 'end',
  header,
  className = '',
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const openAt = useCallback((index: number) => {
    setOpen(true);
    setActiveIndex(index);
  }, []);

  // Focus follows the active item so a screen reader announces the label as the
  // user arrows through the list, rather than reading the whole list at once.
  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const last = actions.length - 1;
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); setActiveIndex((i) => Math.min(i + 1, last)); break;
      case 'ArrowUp': event.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); break;
      case 'Home': event.preventDefault(); setActiveIndex(0); break;
      case 'End': event.preventDefault(); setActiveIndex(last); break;
      case 'Escape': event.preventDefault(); close(true); break;
      case 'Tab': setOpen(false); break;
      default: break;
    }
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); openAt(0); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); openAt(actions.length - 1); }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onTriggerKeyDown}
        className="flex items-center gap-1.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
      >
        {trigger ?? children}
        <ChevronDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          id={listId}
          role="menu"
          aria-label={label}
          onKeyDown={onListKeyDown}
          className={`absolute z-40 mt-2 min-w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
        >
          {header && <div className="border-b border-slate-100 px-3 py-2">{header}</div>}
          {actions.map((action, index) => (
            <button
              key={action.key}
              ref={element => { itemRefs.current[index] = element; }}
              type="button"
              role="menuitem"
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => { close(true); action.onSelect(); }}
              className={`flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                action.tone === 'danger'
                  ? 'text-rose-600 hover:bg-rose-50 focus-visible:bg-rose-50'
                  : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 focus-visible:bg-slate-50'
              }`}
            >
              {action.icon && <span aria-hidden="true" className="mt-0.5 shrink-0">{action.icon}</span>}
              <span className="min-w-0">
                <span className="block">{action.label}</span>
                {action.description && (
                  <span className="mt-0.5 block text-xs text-slate-500">{action.description}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
