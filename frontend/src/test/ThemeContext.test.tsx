import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

/**
 * Dark mode is temporarily disabled while its palette is being decided, so the
 * resolved theme is pinned to light. These tests lock that behaviour in: they
 * prove a stored `dark` preference, a `prefers-color-scheme: dark` system
 * setting and the context's own toggle can all no longer flip the interface.
 * When dark mode is restored, this file should be replaced by the suite that
 * covered the original behaviour.
 */

function ThemeConsumer() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme} aria-label="Toggle theme">{theme}</button>;
}

function mount() {
  return render(
    <StrictMode>
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    </StrictMode>,
  );
}

function systemTheme(dark: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: dark })));
}

function expectPinnedLight() {
  expect(screen.getByRole('button', { name: 'Toggle theme' })).toHaveTextContent('light');
  expect(document.documentElement.classList.contains('dark')).toBe(false);
  expect(document.documentElement.style.colorScheme).toBe('light');
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = 'existing-root-class';
  document.documentElement.style.removeProperty('color-scheme');
  systemTheme(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.className = '';
  document.documentElement.style.removeProperty('color-scheme');
});

describe('ThemeProvider with dark mode disabled', () => {
  it.each(['light', 'dark'] as const)(
    'ignores a stored %s preference and stays on light',
    stored => {
      localStorage.setItem('studentops_theme', stored);
      systemTheme(stored === 'dark');
      mount();
      expectPinnedLight();
    },
  );

  it.each([false, true])(
    'ignores a dark system preference of %s and stays on light',
    dark => {
      systemTheme(dark);
      mount();
      expectPinnedLight();
    },
  );

  it('never adds the dark class even after the toggle is called repeatedly', () => {
    mount();
    const toggle = screen.getByRole('button', { name: 'Toggle theme' });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      fireEvent.click(toggle);
      expectPinnedLight();
    }
  });

  it('preserves unrelated classes already on the document element', () => {
    mount();
    expect(document.documentElement).toHaveClass('existing-root-class');
  });

  it('persists light so a later reload does not restore a stale dark preference', () => {
    localStorage.setItem('studentops_theme', 'dark');
    mount();
    expect(localStorage.getItem('studentops_theme')).toBe('light');
  });

  it('still surfaces light when the system preference lookup throws', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => { throw new Error('unsupported'); }));
    mount();
    expectPinnedLight();
  });
});
