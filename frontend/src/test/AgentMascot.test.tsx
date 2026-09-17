import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { AgentMascot } from '../components/AgentMascot';

let callbacks: Map<number, FrameRequestCallback>;
let nextId: number;
let time: number;

beforeEach(() => {
  callbacks = new Map();
  nextId = 0;
  time = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function advanceFrames(count: number) {
  for (let i = 0; i < count; i++) {
    time += 16;
    const pending = [...callbacks.values()];
    callbacks.clear();
    act(() => pending.forEach(callback => callback(time)));
  }
}

describe('mascot animation clock', () => {
  it('restores the body and eyes after thinking, and stops its loop on unmount', () => {
    const { container, rerender, unmount } = render(<AgentMascot state="thinking" />);
    advanceFrames(70);
    const loadingBody = container.querySelector('mask > path')?.getAttribute('d');
    expect(loadingBody).toBeTruthy();
    // The engine omits fully transparent eyes from thinking frames.
    expect(container.querySelectorAll('mask > path[opacity]')).toHaveLength(0);

    rerender(<AgentMascot state="idle" />);
    advanceFrames(70);
    expect(container.querySelector('mask > path')?.getAttribute('d')).not.toBe(loadingBody);
    const idleEyes = container.querySelectorAll('mask > path[opacity]');
    expect(idleEyes).toHaveLength(2);
    idleEyes.forEach(eye => {
      expect(Number(eye.getAttribute('opacity'))).toBeGreaterThan(0.9);
    });
    expect(callbacks.size).toBe(1);
    unmount();
    expect(callbacks.size).toBe(0);
  });
});
