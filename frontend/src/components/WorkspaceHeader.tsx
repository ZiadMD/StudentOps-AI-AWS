import { useEffect, useId, useRef, useState } from 'react';
import { Bell, Menu, Search } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { NAV_ITEMS, canAccessTab, type Role, type Tab } from './navigation';

export interface WorkspaceHeaderProps {
  role: Role;
  onNavigate: (tab: Tab) => void;
  onOpenNavigation: () => void;
  isNavigationOpen: boolean;
}

/*
 * Header.
 *
 * Holds the page search and a notifications shortcut. The Ctrl/Cmd+K hint is
 * rendered because this component owns a real keydown listener for it.
 */
export function WorkspaceHeader({
  role, onNavigate, onOpenNavigation, isNavigationOpen,
}: WorkspaceHeaderProps) {
  const { t } = useLanguage();
  const id = useId();
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const results = NAV_ITEMS.filter(item =>
    canAccessTab(role, item.id)
    && `${item.label} ${item.aliases ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
  );

  const active = results[activeIndex];

  function go(tab: Tab) {
    if (!canAccessTab(role, tab)) return;
    setOpen(false);
    setQuery('');
    setActiveIndex(-1);
    onNavigate(tab);
  }

  // Ctrl/Cmd+K focuses the search field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Dismiss on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !searchRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur sm:px-5">
      <button
        type="button" onClick={onOpenNavigation}
        className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
        aria-label="Open navigation"
        aria-controls="app-sidebar"
        aria-expanded={isNavigationOpen}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <div
        ref={searchRef}
        className="relative min-w-0 flex-1"
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-slate-400 sm:block"
        />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Search pages"
          placeholder="Search pages"
          title="Search pages (Ctrl+K)"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? `${id}-results` : undefined}
          aria-activedescendant={open && active ? `${id}-option-${active.id}` : undefined}
          autoComplete="off"
          value={query}
          className="h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 pl-3 pr-3 text-base text-slate-900 placeholder:text-slate-500 focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/20 sm:pl-9 sm:text-sm"
          onFocus={() => { setOpen(true); setActiveIndex(-1); }}
          onChange={event => { setQuery(event.target.value); setOpen(true); setActiveIndex(-1); }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (results.length === 0) return;
              setActiveIndex(index => {
                if (index < 0) return event.key === 'ArrowDown' ? 0 : results.length - 1;
                return (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
              });
            } else if (event.key === 'Enter' && active) {
              event.preventDefault();
              go(active.id);
            } else if (event.key === 'Escape') {
              setOpen(false);
              setActiveIndex(-1);
            }
          }}
        />

        {open && (
          <div className="absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <ul id={`${id}-results`} role="listbox" aria-label="Pages" className="max-h-72 overflow-y-auto p-1">
              {results.map((item, index) => (
                <li key={item.id} role="presentation">
                  <button
                    type="button" role="option" tabIndex={-1}
                    id={`${id}-option-${item.id}`}
                    aria-selected={index === activeIndex}
                    className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-slate-700 ${
                      index === activeIndex ? 'bg-slate-100 text-slate-900' : 'hover:bg-slate-50'
                    }`}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => go(item.id)}
                  >
                    <item.icon aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
            {results.length === 0 && (
              <p role="status" className="px-3 py-3 text-sm text-slate-500">No matching pages.</p>
            )}
          </div>
        )}
      </div>

      {canAccessTab(role, 'notifications') && (
        <button
          type="button" onClick={() => onNavigate('notifications')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
          aria-label={t('reminders', 'Reminders')}
          title={t('reminders', 'Reminders')}
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </header>
  );
}
