import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { api } from '../api/client';
import type { WhatsAppChatMessage } from '../types';

const SYNC_INTERVAL = 30_000;
// The client does not accept AbortSignal. Keep the request lane occupied until
// settlement, even across thread changes, StrictMode replay, and inbox remounts.
let requestLane: Promise<void> | null = null;

type ThreadState = {
  studentId: string | null;
  messages: WhatsAppChatMessage[];
  loading: boolean;
  syncing: boolean;
  error: string | null;
  lastSynced: number | null;
};

const emptyState = (studentId: string | null): ThreadState => ({
  studentId, messages: [], loading: Boolean(studentId), syncing: false,
  error: null, lastSynced: null,
});

export function useWhatsAppThreadSync(studentId: string | null) {
  const [state, setState] = useState<ThreadState>(() => emptyState(studentId));
  const [paused, setPaused] = useState<string | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  const messagesRef = useRef<WhatsAppChatMessage[]>([]);

  const setMessages = useCallback((update: SetStateAction<WhatsAppChatMessage[]>) => {
    setState(previous => {
      if (previous.studentId !== studentId) return previous;
      const messages = typeof update === 'function' ? update(previous.messages) : update;
      messagesRef.current = messages;
      return { ...previous, messages };
    });
  }, [studentId]);

  const refreshHistory = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let disposed = false;
    let running = false;
    let resumeRequested = false;
    let historyLoaded = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    messagesRef.current = [];
    setState(emptyState(studentId));

    const pauseReason = () => !navigator.onLine ? 'Offline — automatic sync paused.'
      : document.visibilityState === 'hidden' ? 'Automatic sync paused while this page is hidden.' : null;
    const canRun = () => !disposed && Boolean(studentId) && !pauseReason();
    const update = (patch: Partial<ThreadState>) => {
      if (!disposed) setState(previous => ({ ...previous, ...patch }));
    };

    const read = async (sync: boolean) => {
      const before = new Map(messagesRef.current.map(message => [message.id, message]));
      const response = sync ? await api.syncThreadMessages(studentId!) : null;
      if (sync && (!response?.success || response.student_id !== studentId)) {
        throw new Error('The channel did not confirm synchronization.');
      }
      const incoming = response ? response.messages : await api.getThreadMessages(studentId!);
      if (disposed) return;
      // Preserve messages and edits delivered by the socket while HTTP was pending.
      setState(previous => {
        const merged = new Map(incoming.filter(message => message.student_id === studentId)
          .map(message => [message.id, message]));
        for (const message of previous.messages) {
          if (!merged.has(message.id) || before.get(message.id) !== message) merged.set(message.id, message);
        }
        const messages = [...merged.values()].sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        messagesRef.current = messages;
        return { ...previous, messages, loading: false, error: null,
          lastSynced: sync ? Date.now() : previous.lastSynced };
      });
    };

    const run = async (historyOnly = false) => {
      if (!canRun() || running) return;
      running = true;
      clearTimeout(timer);
      try {
        while (requestLane) {
          await requestLane;
          if (!canRun()) return;
        }
        if (!canRun()) return;
        let release!: () => void;
        requestLane = new Promise<void>(resolve => { release = resolve; });
        try {
          if (!historyLoaded || historyOnly) {
            try {
              await read(false);
            } catch (error) {
              update({ loading: false, error: error instanceof Error ? error.message : 'Message history unavailable.' });
            }
            historyLoaded = true;
          }
          if (!historyOnly && canRun()) {
            update({ syncing: true });
            await read(true);
          }
        } finally {
          requestLane = null;
          release();
        }
      } catch (error) {
        update({ error: error instanceof Error ? error.message : 'Channel sync unavailable.' });
      } finally {
        running = false;
        update({ syncing: false });
        if (canRun()) {
          timer = setTimeout(() => { void run(); }, resumeRequested ? 0 : SYNC_INTERVAL);
        }
        resumeRequested = false;
      }
    };

    const onEnvironmentChange = () => {
      setPaused(pauseReason());
      clearTimeout(timer);
      if (canRun()) {
        if (running) resumeRequested = true;
        else void run();
      }
    };
    // A sync broadcasts messages_synced before its HTTP response. Do not launch
    // a second history read for that event while the current read is pending.
    refreshRef.current = () => { void run(true); };
    setPaused(pauseReason());
    void run();
    document.addEventListener('visibilitychange', onEnvironmentChange);
    window.addEventListener('online', onEnvironmentChange);
    window.addEventListener('offline', onEnvironmentChange);
    return () => {
      disposed = true;
      clearTimeout(timer);
      refreshRef.current = () => {};
      document.removeEventListener('visibilitychange', onEnvironmentChange);
      window.removeEventListener('online', onEnvironmentChange);
      window.removeEventListener('offline', onEnvironmentChange);
    };
  }, [studentId]);

  const current = state.studentId === studentId ? state : emptyState(studentId);
  const syncStatus = paused || (current.syncing ? 'Syncing channel history…'
    : current.error ? 'Automatic sync will retry in about 30 seconds.'
    : current.lastSynced ? `Last synced ${new Date(current.lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Waiting for automatic sync…');

  return { ...current, setMessages, refreshHistory, syncStatus };
}
