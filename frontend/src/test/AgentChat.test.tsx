import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AgentChat } from '../components/AgentChat';
import type { AgentMascotProps } from '../components/AgentMascot';

vi.mock('../api/client', () => ({ API_BASE: '/api', api: { getToken: () => null } }));
vi.mock('../components/AgentMascot', () => ({
  AgentMascot: ({ state, frozenAt, follow }: AgentMascotProps) => (
    <div data-testid="mascot" data-state={state} data-frozen={frozenAt} data-follow={follow} />
  ),
}));

let stream: ReadableStreamDefaultController<Uint8Array>;
const encoder = new TextEncoder();

beforeEach(() => {
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
    start(controller) { stream = controller; },
  }))));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function send() {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Show upcoming tasks' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.getByTestId('mascot')).toHaveAttribute('data-state', 'thinking');
}
async function emit(event: object) {
  await act(async () => { stream.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); });
}
function expectIdle() {
  const mascot = screen.getByTestId('mascot');
  expect(mascot).toHaveAttribute('data-state', 'idle');
  expect(mascot).not.toHaveAttribute('data-frozen');
  expect(mascot).toHaveAttribute('data-follow', 'true');
}

describe('agent mascot lifecycle', () => {
  it('restores the centered welcome and sidebar-aware fixed composer', () => {
    const { rerender } = render(<AgentChat />);
    const welcome = screen.getByRole('heading', { name: 'How can I help you today?' });
    expect(welcome.parentElement).toHaveClass('items-center', 'text-center');
    expect(screen.queryByRole('heading', { name: 'Operations Assistant' })).not.toBeInTheDocument();
    const composer = screen.getByRole('textbox').closest('.fixed');
    expect(composer).toHaveClass('bottom-0', 'md:left-60');
    rerender(<AgentChat isDesktopCollapsed />);
    expect(composer).toHaveClass('md:left-16');
  });

  it('shows a mascot only beside the latest assistant reply', async () => {
    render(<AgentChat />);
    await send();
    await emit({ type: 'done' });
    await act(async () => stream.close());
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({
      start(controller) { stream = controller; },
    })));
    await send();
    expect(screen.getAllByTestId('mascot')).toHaveLength(1);
    await emit({ type: 'done' });
    await act(async () => stream.close());
    expectIdle();
  });

  it('animates waiting, tool work and response, then returns to an unfrozen idle', async () => {
    render(<AgentChat />);
    await send();
    await emit({ type: 'tool', tool_name: 'get_tasks', status: 'SUCCESS', result: {} });
    expect(screen.getByTestId('mascot')).toHaveAttribute('data-state', 'orbit');
    await emit({ type: 'token', content: 'Here are your tasks.' });
    await waitFor(() => expect(screen.getByTestId('mascot')).toHaveAttribute('data-state', 'wide'));
    await emit({ type: 'done' });
    expectIdle();
    await act(async () => stream.close());
    expect(screen.getByRole('textbox')).toBeEnabled();
  });

  it('returns to idle on EOF without a done event', async () => {
    render(<AgentChat />);
    await send();
    await emit({ type: 'token', content: 'A partial response' });
    await act(async () => stream.close());
    await waitFor(expectIdle);
    expect(screen.getByText('A partial response')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeEnabled();
  });

  it('returns to idle after an SSE error', async () => {
    render(<AgentChat />);
    await send();
    await emit({ type: 'error', message: 'Service unavailable' });
    expectIdle();
    await act(async () => stream.close());
  });

  it('returns to idle after a connection failure', async () => {
    render(<AgentChat />);
    await send();
    await act(async () => stream.error(new Error('Connection lost')));
    await waitFor(expectIdle);
    expect(screen.getByRole('textbox')).toBeEnabled();
  });
});
