'use client';

import * as React from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'dawai-site-theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggle: () => void;
  ready: boolean;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

/**
 * The theme, in about forty lines.
 *
 * `next-themes` would do this too, and it is a dependency; what it would also
 * do is put a `class` on `<html>` that Tailwind's `dark:` variants key off
 * while this site's inverted sections work by re-declaring the tokens on
 * `.ink-band` instead. Two systems for one idea, and the one thing on the page
 * that must never flash is the theme.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>('light');
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setThemeState(isDark ? 'dark' : 'light');
    setReady(true);
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Private browsing. The choice lasts for this page view and no longer. */
    }
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      ready,
    }),
    [theme, setTheme, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
