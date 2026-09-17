import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

function ThemeConsumer() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme} aria-label="Toggle theme">{theme}</button>;
}

function mount() {
  return render(<StrictMode><ThemeProvider><ThemeConsumer /></ThemeProvider></StrictMode>);
}

function systemTheme(dark: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: dark })));
}

function expectTheme(theme: 'light' | 'dark') {
  expect(screen.getByRole('button', { name: 'Toggle theme' })).toHaveTextContent(theme);
  expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark');
  expect(document.documentElement.style.colorScheme).toBe(theme);
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

describe('ThemeProvider', () => {
  it.each(['light', 'dark'] as const)('restores saved %s ahead of the opposite system preference', theme => {
    localStorage.setItem('studentops_theme', theme);
    systemTheme(theme === 'light');
    mount();
    expectTheme(theme);
    expect(document.documentElement).toHaveClass('existing-root-class');
  });

  it.each([false, true])('uses and persists system default when dark preference is %s', dark => {
    systemTheme(dark);
    mount();
    const expected = dark ? 'dark' : 'light';
    expectTheme(expected);
    expect(localStorage.getItem('studentops_theme')).toBe(expected);
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
  });

  it('ignores invalid stored values', () => {
    localStorage.setItem('studentops_theme', 'sepia');
    systemTheme(true);
    mount();
    expectTheme('dark');
    expect(localStorage.getItem('studentops_theme')).toBe('dark');
  });

  it('toggles both ways, persists, and restores the choice after remount', () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    expectTheme('dark');
    expect(localStorage.getItem('studentops_theme')).toBe('dark');
    view.unmount();
    mount();
    expectTheme('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    expectTheme('light');
    expect(localStorage.getItem('studentops_theme')).toBe('light');
    expect(document.documentElement).toHaveClass('existing-root-class');
  });

  it('falls back to light if matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    mount();
    expectTheme('light');
  });

  it('falls back to light if matchMedia throws', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => { throw new Error('Unavailable'); }));
    mount();
    expectTheme('light');
  });

  it('uses system default and keeps toggling when storage access is blocked', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('Blocked'); });
    systemTheme(true);
    mount();
    expectTheme('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    expectTheme('light');
  });

  it('keeps working when storage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota'); });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    expectTheme('dark');
  });

  it('requires a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ThemeConsumer />)).toThrow('useTheme must be used within a ThemeProvider');
  });
});
