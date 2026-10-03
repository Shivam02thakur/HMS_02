import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextType {
  /** What the user picked: 'light' | 'dark' | 'system'. */
  preference: ThemePreference;
  /** What's actually applied right now (resolves 'system'). */
  resolved: 'light' | 'dark';
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const STORAGE_KEY = 'hms:theme';

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // localStorage can throw in some browser privacy modes; fall through.
  }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStored);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    preference === 'dark' || (preference === 'system' && systemPrefersDark()) ? 'dark' : 'light'
  );

  useEffect(() => {
    const apply = () => {
      const dark = preference === 'dark' || (preference === 'system' && systemPrefersDark());
      document.documentElement.classList.toggle('dark', dark);
      setResolved(dark ? 'dark' : 'light');
    };
    apply();

    if (preference !== 'system') return;
    // Follow the OS live while the user has "System" selected.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [preference]);

  function setPreference(p: ThemePreference) {
    setPreferenceState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // Non-fatal: theme just won't persist across reloads.
    }
  }

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
