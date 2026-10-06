"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  applyResolvedTheme,
  readStoredThemePreference,
  readSystemPrefersDark,
  resolveTheme,
  writeStoredThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

// Mirrors AuthContext's own token-subscription pattern exactly
// (features/auth/AuthContext.tsx) -- localStorage is an external,
// browser-owned store outside React's state, so the same
// useSyncExternalStore + listener-set approach applies here too.
type Listener = () => void;
const listeners = new Set<Listener>();
function notifyPreferenceChanged() {
  listeners.forEach((listener) => listener());
}
function subscribeToPreference(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getPreferenceSnapshot(): ThemePreference {
  return readStoredThemePreference();
}
function getServerPreferenceSnapshot(): ThemePreference {
  return "SYSTEM";
}

interface ThemeContextValue {
  // The user's raw choice (SYSTEM/LIGHT/DARK) -- what the Appearance UI
  // displays as selected.
  preference: ThemePreference;
  // The actually-applied LIGHT/DARK result, after resolving SYSTEM against
  // the live OS preference.
  resolvedTheme: ResolvedTheme;
  // Device-local only: updates localStorage + the reactive preference
  // immediately. Deliberately does NOT call any API -- persisting to the
  // server is the caller's own responsibility (see
  // features/settings/components/AppearanceSettings.tsx), which is what
  // keeps this provider fully usable on unauthenticated pages (login/
  // register, Stage 16.9 §10) where no Settings API call is possible at
  // all.
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(
    subscribeToPreference,
    getPreferenceSnapshot,
    getServerPreferenceSnapshot
  );

  // Tracks the live OS preference so SYSTEM mode updates without a reload
  // if the user changes their OS theme while the app is open (Stage 16.9
  // §2/§14). Lazy-initialized directly (not set from inside the effect
  // below) -- the effect only SUBSCRIBES to future changes, it never
  // calls setState synchronously on its own first run.
  const [systemPrefersDark, setSystemPrefersDark] = useState(readSystemPrefersDark);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  const resolvedTheme = useMemo(
    () => resolveTheme(preference, systemPrefersDark),
    [preference, systemPrefersDark]
  );

  // Keeps document.documentElement's `.dark` class in sync with React
  // state. A no-op on first paint (the blocking <head> script in
  // app/layout.tsx already applied the correct class before hydration) --
  // this is what actually re-applies it for every subsequent change
  // (explicit switch, OS change, or a server-confirmed preference arriving
  // later via ThemeServerSync).
  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  const setPreference = useCallback((next: ThemePreference) => {
    writeStoredThemePreference(next);
    notifyPreferenceChanged();
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
