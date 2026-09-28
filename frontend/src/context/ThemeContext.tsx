import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const STORAGE_KEY = 'studentops_theme';
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Dark mode is temporarily disabled while the palette is being decided. The
 * context, the `dark:` utilities and the header toggle are all still in place,
 * but the resolved theme is pinned to light, so nothing can flip it at runtime.
 * To bring dark mode back, restore the body of `initialTheme` below and re-enable
 * the toggle in WorkspaceHeader.
 */
function initialTheme(): Theme {
  return 'light';
  /* eslint-disable no-unreachable */
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved as Theme;
  } catch {
    // Storage may be blocked; system preference still works.
  }
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
  /* eslint-enable no-unreachable */
}

/** Mount once at the application root. Dark mode is currently disabled, so the
 state is held at light and the toggle is deliberately inert. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  // Inert while dark mode is paused. Restoring the body of `initialTheme` is the
  // only change needed to bring the toggle back.
  const toggleTheme = useCallback(() => {
    setTheme('light');
  }, []);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Keep the in-memory preference usable in private/blocked storage contexts.
    }
  }, [theme]);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
