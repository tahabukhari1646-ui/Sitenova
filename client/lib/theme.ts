// Stage 16.9: shared theme constants/helpers, usable both by the
// synchronous pre-hydration <head> script (app/layout.tsx, which can only
// run plain JS -- no React, no imports) and by the reactive ThemeProvider
// (features/theme/ThemeContext.tsx).

export type ThemePreference = "SYSTEM" | "LIGHT" | "DARK";
export type ResolvedTheme = "LIGHT" | "DARK";

// Device-level cache only -- a fast-paint hint, never the authoritative
// value once a user is authenticated (the DB's User.themePreference is
// authoritative; see ThemeServerSync.tsx). Deliberately NOT cleared on
// logout -- it is a visual preference for THIS BROWSER, not private user
// data, and gets overwritten within moments of the next login once that
// user's own server preference loads (Stage 16.9 §18).
export const THEME_STORAGE_KEY = "sentinel_theme_preference";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "SYSTEM" || value === "LIGHT" || value === "DARK";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "SYSTEM") return systemPrefersDark ? "DARK" : "LIGHT";
  return preference;
}

export function readSystemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function readStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "SYSTEM";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "SYSTEM";
  } catch {
    // localStorage can throw in private-browsing/disabled-storage contexts
    // -- fail safe to SYSTEM rather than crash theme resolution.
    return "SYSTEM";
  }
}

export function writeStoredThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Best-effort only -- a write failure just means no fast-paint cache
    // next load; the in-memory/DB value still works for this session.
  }
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle("dark", resolved === "DARK");
}

// Plain, dependency-free JS (no imports, no JSX) -- injected verbatim as a
// synchronous <head> script in app/layout.tsx, so the correct `.dark` class
// is applied to <html> BEFORE React hydrates, avoiding a light-to-dark (or
// dark-to-light) flash on first paint (Stage 16.9 §15). Mirrors exactly
// what the reactive ThemeProvider computes on the client afterwards --
// kept as a single literal string (not re-derived from the functions
// above) because a <head> script cannot import this module's own
// TypeScript functions at runtime.
export const THEME_INIT_SCRIPT = `(function(){try{var k="${THEME_STORAGE_KEY}";var s=window.localStorage.getItem(k);var p=(s==="LIGHT"||s==="DARK"||s==="SYSTEM")?s:"SYSTEM";var d=p==="DARK"||(p==="SYSTEM"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;
