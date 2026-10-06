"use client";

import { useEffect } from "react";

import { useSettings } from "@/features/settings/hooks";
import { useTheme } from "./ThemeContext";

// Stage 16.9 §17: a local/device cache improves initial paint but must
// never permanently override a newer server (authoritative) preference.
// Mounted once, inside the authenticated (app) layout, so the whole
// authenticated application (not just the Settings page) reflects the
// user's DB-persisted theme shortly after it loads.
//
// Reuses the EXACT SAME settingsKeys.all query the Settings page itself
// reads (Stage 16.9 §19) -- React Query dedupes by key, so mounting this
// alongside the Settings page never issues a second/duplicate request.
//
// Race-safety: this effect's dependency is `settings.appearance.theme`
// itself, not a comparison against the current local `preference`. React
// only re-runs an effect when a dependency's VALUE actually changes
// between renders -- so while a user's own in-session theme change is
// still pending (local `preference` already updated instantly, but the
// query cache hasn't been updated by the mutation's onSuccess yet), this
// effect does NOT re-fire (the dependency hasn't changed value yet) and
// therefore can never revert an in-flight optimistic change. It only
// re-fires once a NEW committed value appears in the cache -- either this
// same mutation's own successful result (a harmless idempotent re-
// application of the value already applied) or a genuinely different
// value arriving from another device's change.
export function ThemeServerSync() {
  const { settings } = useSettings();
  const { setPreference } = useTheme();

  useEffect(() => {
    if (settings) {
      setPreference(settings.appearance.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.appearance.theme]);

  return null;
}
