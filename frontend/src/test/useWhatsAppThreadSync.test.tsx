import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { useWhatsAppThreadSync } from '../hooks/useWhatsAppThreadSync';
import { api } from '../api/client';
import type { WhatsAppChatMessage, WhatsAppSyncResponse } from '../types';

vi.mock('../api/client', () => ({
  api: {
    getThreadMessages: vi.fn(),
    syncThreadMessages: vi.fn(),
  },
}));

const baseMessage: WhatsAppChatMessage = {
  id: 'msg_001', openwa_message_id: 'true_msg_001', student_id: 'std_ziad',
  assigned_hr_id: 'usr_hr', sender_type: 'HR', sender_id: 'usr_hr',
  sender_phone: '201000000000', recipient_phone: '201012345678',
  message_type: 'text', content: 'Hello', status: 'sent', ack_status: 1,
  is_edited: false, reactions: [], created_at: '2026-09-16T10:00:00Z',
};

const syncResponse = (messages: WhatsAppChatMessage[], studentId = 'std_ziad'): WhatsAppSyncResponse => ({
  success: true, student_id: studentId, synced_count: messages.length,
  new_messages_count: 0, updated_messages_count: 0, messages,
});

let latest: ReturnType<typeof useWhatsAppThreadSync> | undefined;
function Probe({ studentId }: { studentId: string | null }) {
  latest = useWhatsAppThreadSync(studentId);
  return <div data-testid="probe">{latest.syncStatus}</div>;
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('useWhatsAppThreadSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.mocked(api.getThreadMessages).mockResolvedValue([baseMessage]);
    vi.mocked(api.syncThreadMessages).mockResolvedValue(syncResponse([baseMessage]));
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('syncs on open, then again after the 30 second interval', async () => {
    vi.useFakeTimers();
    render(<Probe studentId="std_ziad" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(api.syncThreadMessages).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(api.syncThreadMessages).toHaveBeenCalledTimes(2);
    expect(latest?.lastSynced).not.toBeNull();
  });

  it('serializes overlapping syncs and drops stale thread responses', async () => {
    vi.useFakeTimers();
    const firstSync = deferred<WhatsAppSyncResponse>();
    vi.mocked(api.syncThreadMessages)
      .mockImplementationOnce(() => firstSync.promise)
      .mockResolvedValue(syncResponse([{ ...baseMessage, id: 'msg_next', student_id: 'std_other' }], 'std_other'));
    const { rerender } = render(<Probe studentId="std_ziad" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    rerender(<Probe studentId="std_other" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    firstSync.resolve(syncResponse([baseMessage]));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(api.syncThreadMessages).toHaveBeenNthCalledWith(1, 'std_ziad');
    expect(api.syncThreadMessages).toHaveBeenNthCalledWith(2, 'std_other');
    expect(latest?.messages.every(message => message.student_id === 'std_other')).toBe(true);
    expect(latest?.error).toBeNull();
  });

  it('pauses while hidden or offline and resumes when visible and online', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    render(<Probe studentId="std_ziad" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(api.syncThreadMessages).not.toHaveBeenCalled();
    expect(latest?.syncStatus).toContain('paused');
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.syncThreadMessages).toHaveBeenCalledTimes(1);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(api.syncThreadMessages).toHaveBeenCalledTimes(1);
    expect(latest?.syncStatus).toContain('Offline');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.syncThreadMessages).toHaveBeenCalledTimes(2);
  });

  it('reports sync failure inline and retries on the next interval', async () => {
    vi.useFakeTimers();
    vi.mocked(api.syncThreadMessages)
      .mockRejectedValueOnce(new Error('gateway offline'))
      .mockResolvedValue(syncResponse([baseMessage]));
    render(<Probe studentId="std_ziad" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(latest?.error).toBe('gateway offline');
    expect(latest?.syncStatus).toContain('retry in about 30 seconds');
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(api.syncThreadMessages).toHaveBeenCalledTimes(2);
    expect(latest?.error).toBeNull();
  });

  it('stops all timers and listeners after unmount', async () => {
    vi.useFakeTimers();
    const pending = deferred<WhatsAppSyncResponse>();
    vi.mocked(api.syncThreadMessages).mockImplementationOnce(() => pending.promise);
    const { unmount } = render(<Probe studentId="std_ziad" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    unmount();
    pending.resolve(syncResponse([baseMessage]));
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(api.syncThreadMessages).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
