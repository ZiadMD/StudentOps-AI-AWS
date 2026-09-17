import { useEffect, useId, useRef, useState } from 'react';
import { Bell, Menu, Moon, Search, Sun } from 'lucide-react';
import { api } from '../api/client';
import { useTheme } from '../context/ThemeContext';
import type { EscalationRecord, TaskItem, UserProfile, UserRole } from '../types';
import { NAV_ITEMS, type Tab } from './Sidebar';
import { ProfileAvatar } from './ui/ProfileAvatar';

export interface WorkspaceHeaderProps {
  currentUser: UserProfile;
  onNavigate: (tab: Tab) => void;
  onOpenNavigation: () => void;
  isMobileSidebarOpen: boolean;
}

const FOLLOW_UP_ROLES: UserRole[] = ['region_hr_head', 'hr_admin', 'committee_hr_leader', 'committee_hr_member'];
const ALIASES: Partial<Record<Tab, string>> = {
  calendar: 'calendar schedule',
  inbox: 'whatsapp conversations',
  'follow-ups': 'follow ups followups escalation escalations',
};
const iconButton = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 dark:text-slate-300 dark:hover:bg-slate-800';
const textButton = 'min-h-11 rounded-lg px-3 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 dark:hover:bg-slate-800';

// The API also returns naive UTC timestamps from the database.
function timestamp(value: string): number {
  return Date.parse(/^\d{4}-\d{2}-\d{2}T/.test(value) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value) ? `${value}Z` : value);
}

interface DeadlineRecord {
  id: string;
  title: string;
  detail: string;
  date: number;
  tab: 'tasks' | 'follow-ups';
}

function recordsFrom(tasks: TaskItem[], followUps: EscalationRecord[]): DeadlineRecord[] {
  const now = Date.now();
  const end = now + 7 * 24 * 60 * 60 * 1000;
  return [
    ...tasks.filter(task => {
      const due = timestamp(task.deadline);
      return due >= now && due <= end;
    }).map(task => ({ id: `task-${task.id}`, title: task.title, detail: 'Task deadline', date: timestamp(task.deadline), tab: 'tasks' as const })),
    ...followUps.filter(item => ['OPEN', 'ESCALATED'].includes(item.status.toUpperCase()) || item.is_escalated)
      .map(item => ({ id: `follow-up-${item.id}`, title: item.student_name, detail: item.flagged_reason, date: timestamp(item.flagged_at), tab: 'follow-ups' as const })),
  ].sort((a, b) => (Number.isFinite(a.date) ? a.date : Infinity) - (Number.isFinite(b.date) ? b.date : Infinity));
}

function DeadlinePanel({ id, role, onNavigate }: { id: string; role: UserRole; onNavigate: (tab: Tab) => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [records, setRecords] = useState<DeadlineRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const canReadFollowUps = FOLLOW_UP_ROLES.includes(role);
  const canNavigate = (tab: Tab) => NAV_ITEMS.some(item => item.id === tab && item.roles.includes(role));

  useEffect(() => { panelRef.current?.focus(); }, []);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      setLoading(true);
      setError(false);
      try {
        const [tasks, followUps] = await Promise.all([
          api.getTasks(),
          canReadFollowUps ? api.getSlaEscalations() : Promise.resolve([]),
        ]);
        if (!cancelled) setRecords(recordsFrom(tasks, followUps));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [canReadFollowUps, retry]);

  return (
    <div
      ref={panelRef} id={id} role="dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-caption`} tabIndex={-1}
      className="fixed right-3 top-16 max-h-[calc(100dvh-5rem)] w-[calc(100%-1.5rem)] max-w-[24rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 lg:absolute lg:right-0 lg:top-full lg:mt-2 lg:w-96 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <h2 id={`${id}-title`} className="text-sm font-semibold">Notifications</h2>
      <p id={`${id}-caption`} className="mt-1 text-sm text-slate-500 dark:text-slate-400">Upcoming task deadlines and open follow-ups.</p>
      <div className="mt-3" aria-busy={loading}>
        {loading ? <p role="status" className="py-3 text-sm">Loading deadlines and follow-ups…</p> : error ? (
          <div>
            <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">Could not load deadlines and follow-ups.</p>
            <button type="button" className={`${textButton} mt-2`} onClick={() => setRetry(value => value + 1)}>Retry</button>
          </div>
        ) : (
          <>
            <p role="status" className="text-xs text-slate-500 dark:text-slate-400">{records.length} {records.length === 1 ? 'record' : 'records'}</p>
            {records.length === 0 ? (
              <p className="py-3 text-sm">{canReadFollowUps ? 'No task deadlines in the next 7 days or open follow-ups.' : 'No task deadlines in the next 7 days.'}</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                {records.map(record => (
                  <li key={record.id}>
                    <button type="button" disabled={!canNavigate(record.tab)} onClick={() => onNavigate(record.tab)} className={`${textButton} w-full text-left`}>
                      <span className="block break-words" dir="auto">{record.title}</span>
                      <span className="block break-words text-xs font-normal text-slate-500 dark:text-slate-400" dir="auto">{record.tab === 'follow-ups' ? 'Follow-up · ' : ''}{record.detail}</span>
                      <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                        {record.tab === 'follow-ups' ? 'Flagged: ' : 'Due: '}
                        {Number.isFinite(record.date) ? <time dateTime={new Date(record.date).toISOString()}>{new Date(record.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time> : 'Date unavailable'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1 border-t border-slate-200 pt-2 dark:border-slate-700">
        {canNavigate('tasks') && <button type="button" className={textButton} onClick={() => onNavigate('tasks')}>View tasks</button>}
        {canReadFollowUps && canNavigate('follow-ups') && <button type="button" className={textButton} onClick={() => onNavigate('follow-ups')}>View follow-ups</button>}
      </div>
    </div>
  );
}

export function WorkspaceHeader({ currentUser, onNavigate, onOpenNavigation, isMobileSidebarOpen }: WorkspaceHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const id = useId();
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const results = NAV_ITEMS.filter(item => item.id !== 'profile' && item.roles.includes(currentUser.role)
    && `${item.label} ${ALIASES[item.id] ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const active = results[activeIndex];
  const themeLabel = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';

  function closeNotifications() {
    setNotificationsOpen(false);
    bellRef.current?.focus();
  }

  function navigate(tab: Tab) {
    if (!NAV_ITEMS.some(item => item.id === tab && item.roles.includes(currentUser.role))) return;
    setSearchOpen(false);
    setQuery('');
    setActiveIndex(-1);
    if (notificationsOpen) closeNotifications();
    onNavigate(tab);
  }

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        event.stopPropagation();
        setNotificationsOpen(false);
        inputRef.current?.focus();
        setSearchOpen(true);
        setActiveIndex(-1);
      }
    };
    window.addEventListener('keydown', shortcut, true);
    return () => window.removeEventListener('keydown', shortcut, true);
  }, []);

  useEffect(() => {
    const outsideSearch = (event: PointerEvent) => {
      if (event.target instanceof Node && !searchRef.current?.contains(event.target)) setSearchOpen(false);
    };
    const outsideNotifications = (event: MouseEvent) => {
      if (notificationsOpen && event.target instanceof Node && !notificationRef.current?.contains(event.target)) closeNotifications();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSearchOpen(false);
      if (notificationsOpen) {
        event.preventDefault();
        closeNotifications();
      }
    };
    document.addEventListener('pointerdown', outsideSearch);
    document.addEventListener('click', outsideNotifications);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outsideSearch);
      document.removeEventListener('click', outsideNotifications);
      document.removeEventListener('keydown', escape);
    };
  }, [notificationsOpen]);

  return (
    <header className="sticky top-0 z-30 flex h-14 min-w-0 items-center gap-2 border-b border-slate-200 bg-white px-3 md:grid md:grid-cols-[minmax(8.5rem,1fr)_minmax(0,28rem)_minmax(8.5rem,1fr)] md:gap-3 sm:px-6 dark:border-slate-700 dark:bg-slate-900">
      <div className="shrink-0 md:min-w-0">
        <button type="button" className={`${iconButton} md:hidden`} title="Open navigation" aria-label="Open navigation" aria-controls="app-sidebar" aria-expanded={isMobileSidebarOpen} onClick={onOpenNavigation}>
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div ref={searchRef} className="relative min-w-0 flex-1 md:col-start-2 md:w-full" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false);
      }}>
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 hidden h-4 w-4 text-slate-500 sm:block" aria-hidden="true" />
        <input
          ref={inputRef} type="text" role="combobox" aria-label="Search pages" placeholder="Search pages" title="Search pages (Ctrl+K / Cmd+K)"
          aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={searchOpen} aria-controls={searchOpen ? `${id}-pages` : undefined}
          aria-activedescendant={searchOpen && active ? `${id}-page-${active.id}` : undefined} aria-keyshortcuts="Control+k Meta+k" autoComplete="off" value={query}
          className="h-11 md:h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500 sm:pl-9 sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          onFocus={() => { setSearchOpen(true); setActiveIndex(-1); }}
          onChange={event => { setQuery(event.target.value); setSearchOpen(true); setActiveIndex(-1); }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              setSearchOpen(true);
              setActiveIndex(index => {
                if (!results.length) return -1;
                if (!searchOpen || index < 0 || index >= results.length) return event.key === 'ArrowDown' ? 0 : results.length - 1;
                return (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
              });
            } else if (event.key === 'Enter' && searchOpen && active) {
              event.preventDefault();
              navigate(active.id);
            } else if (event.key === 'Escape') {
              setSearchOpen(false);
              setActiveIndex(-1);
            }
          }}
        />
        {searchOpen && (
          <div className="absolute left-0 top-full mt-2 w-full min-w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <ul id={`${id}-pages`} role="listbox" aria-label="Pages" className="max-h-72 overflow-y-auto">
              {results.map((item, index) => (
                <li key={item.id} role="presentation">
                  <button
                    type="button" role="option" id={`${id}-page-${item.id}`} aria-selected={activeIndex === index} tabIndex={-1}
                    className={`${textButton} w-full text-left text-slate-900 dark:text-slate-100 ${activeIndex === index ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
                    onMouseDown={event => event.preventDefault()} onClick={() => navigate(item.id)}
                  >{item.label}</button>
                </li>
              ))}
            </ul>
            {results.length === 0 && <p role="status" className="p-3 text-sm text-slate-500">No matching pages.</p>}
          </div>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-0.5 md:col-start-3 md:justify-self-end">
        <button type="button" className={iconButton} title={themeLabel} aria-label={themeLabel} onClick={toggleTheme}>
          {theme === 'light' ? <Moon className="h-5 w-5" aria-hidden="true" /> : <Sun className="h-5 w-5" aria-hidden="true" />}
        </button>
        <div ref={notificationRef} className="relative">
          <button ref={bellRef} type="button" className={iconButton} title="Notifications" aria-label="Notifications" aria-expanded={notificationsOpen} aria-haspopup="dialog" aria-controls={notificationsOpen ? `${id}-notifications` : undefined} onClick={() => {
            setSearchOpen(false);
            if (notificationsOpen) closeNotifications();
            else setNotificationsOpen(true);
          }}>
            <Bell className="h-5 w-5" aria-hidden="true" />
          </button>
          {notificationsOpen && <DeadlinePanel key={`${currentUser.id}:${currentUser.role}`} id={`${id}-notifications`} role={currentUser.role} onNavigate={navigate} />}
        </div>
        <button type="button" className={iconButton} title="My profile" aria-label="My profile" onClick={() => navigate('profile')}>
          <ProfileAvatar key={currentUser.id} name={currentUser.full_name} />
        </button>
      </div>
    </header>
  );
}
