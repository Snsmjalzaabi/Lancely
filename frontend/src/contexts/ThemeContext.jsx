import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext(null);

function applyThemeClass(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      const t = localStorage.getItem('lancely_theme');
      if (t === 'light' || t === 'dark') return t;
    } catch {}
    return 'dark';
  });

  useEffect(() => {
    applyThemeClass(theme);
    try { localStorage.setItem('lancely_theme', theme); } catch {}
  }, [theme]);

  const setTheme = useCallback((t) => {
    if (t === 'light' || t === 'dark') setThemeState(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
