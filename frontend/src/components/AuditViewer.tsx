import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { api } from '../api/client';
import type { AuditLogItem } from '../types';
import { EmptyState } from './ui/EmptyState';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

function statusTone(status: string): StatusTone {
  const value = status.toLowerCase();
  if (value.includes('error') || value.includes('fail') || value.includes('denied')) return 'danger';
  if (value.includes('pending') || value.includes('confirm')) return 'warning';
  if (value.includes('success') || value.includes('complete') || value.includes('confirm')) return 'success';
  return 'neutral';
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

/*
 * Audit log.
 *
 * Entries are a static, paginated read of recorded actions. The previous
 * version showed a "Streaming" indicator and a `system.log` terminal frame
 * despite polling once on mount, which misrepresented the data.
 */
export function AuditViewer() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setLogs(await api.getAuditLogs());
    } catch {
      setError('The audit log could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const term = query.trim().toLowerCase();
  const filtered = term
    ? logs.filter(log =>
      log.intent.toLowerCase().includes(term)
      || log.tool_name.toLowerCase().includes(term)
      || log.status.toLowerCase().includes(term))
    : logs;

  return (
    <div className="workspace-page min-w-0 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">
            Audit log
          </h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Every recorded action taken in this workspace, newest first.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-initial">
            <label htmlFor="audit-search" className="sr-only">Search the audit log</label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            />
            <input
              id="audit-search" type="search" value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search actions"
              className="h-11 w-full rounded-lg border border-rule bg-white pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-soft focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
            />
          </div>
          <Button variant="secondary" onClick={() => void load()} aria-label="Reload the audit log">
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <p role="status" className="text-sm text-ink-soft">
        {loading ? 'Loading the audit log' : `${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`}
      </p>

      {loading ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2, 3, 4].map(row => (
            <div key={row} className="h-16 animate-pulse rounded-lg border border-rule bg-paper-200" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={term ? 'No matching entries' : 'No actions recorded yet'}
          description={
            term
              ? 'Try a different search term.'
              : 'Actions taken in the workspace will appear here.'
          }
        />
      ) : (
        <>
          {/* Desktop: dense records. */}
          <div className="hidden overflow-hidden rounded-lg border border-rule bg-white md:block">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Recorded actions, newest first</caption>
              <thead>
                <tr className="border-b border-rule bg-paper-100 text-xs uppercase tracking-wide text-ink-soft">
                  <th scope="col" className="px-4 py-3 font-semibold">When</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Action</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Area</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Confirmation</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {filtered.map(log => (
                  <tr key={log.id} className="hover:bg-paper-100">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink-soft tnum">
                      {formatTimestamp(log.timestamp)}
                    </td>
                    <td className="px-4 py-3 text-ink-900">{log.intent}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">{log.tool_name}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {log.requires_confirmation ? (log.confirmed ? 'Confirmed' : 'Awaiting') : 'Not required'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusTone(log.status)}>{log.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone and tablet: the same records as stacked cards. */}
          <ul className="space-y-2 md:hidden">
            {filtered.map(log => (
              <li key={log.id} className="rounded-lg border border-rule bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-medium text-ink-900">{log.intent}</p>
                  <Badge variant={statusTone(log.status)} className="shrink-0">{log.status}</Badge>
                </div>
                <dl className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">When</dt>
                    <dd className="text-right font-mono text-ink-800 tnum">{formatTimestamp(log.timestamp)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">Area</dt>
                    <dd className="truncate font-mono text-ink-800">{log.tool_name}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-soft">Confirmation</dt>
                    <dd className="text-ink-800">
                      {log.requires_confirmation ? (log.confirmed ? 'Confirmed' : 'Awaiting') : 'Not required'}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
