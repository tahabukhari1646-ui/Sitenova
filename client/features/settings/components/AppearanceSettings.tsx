"use client";

import { CheckIcon } from "lucide-react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";

import { cn } from "@/lib/utils";
import { useTheme } from "@/features/theme/ThemeContext";
import { useUpdateAppearanceSettings } from "../hooks";
import type { ThemePreference } from "../types";

// Fixed preview swatch colors per option -- deliberately literal, NOT the
// app's own semantic bg-background/text-foreground tokens. These three
// cards are a preview of what each mode looks like, so they must stay
// visually constant (white / light grey / black) regardless of which
// theme is actually currently applied to the rest of the app -- the
// opposite of how every other themed component in this app works.
const OPTIONS: {
  value: ThemePreference;
  label: string;
  description: string;
  swatchClassName: string;
  descriptionClassName: string;
}[] = [
  {
    value: "SYSTEM",
    label: "System",
    description: "Use your device setting.",
    swatchClassName: "bg-white border-neutral-200 text-neutral-900",
    descriptionClassName: "text-neutral-500",
  },
  {
    value: "LIGHT",
    label: "Light",
    description: "Always use light mode.",
    swatchClassName: "bg-neutral-100 border-neutral-200 text-neutral-900",
    descriptionClassName: "text-neutral-500",
  },
  {
    value: "DARK",
    label: "Dark",
    description: "Always use dark mode.",
    swatchClassName: "bg-neutral-950 border-neutral-800 text-neutral-50",
    descriptionClassName: "text-neutral-400",
  },
];

// Real radio semantics (role="radiogroup"/"radio", native hidden inputs,
// keyboard arrow-key navigation) via base-ui's own Radio/RadioGroup --
// already a project dependency (Button/Input/Sheet/DropdownMenu all use
// base-ui), so this introduces no new package (Stage 16.9 §21: "Do not use
// three unrelated checkboxes").
//
// Takes no props -- reads `preference` directly from the shared theme
// context (features/theme/ThemeContext.tsx), which ThemeServerSync keeps
// synchronized with the server's settings.appearance.theme app-wide.
export function AppearanceSettings() {
  const { preference, setPreference } = useTheme();
  const { updateAppearance, isPending, error } = useUpdateAppearanceSettings();

  async function handleChange(theme: ThemePreference) {
    const previous = preference;
    // Immediate visual feedback (Stage 16.9 §8/§20) -- applies instantly,
    // independent of the network request's outcome.
    setPreference(theme);

    try {
      await updateAppearance({ theme });
    } catch {
      // Honest failure handling (Stage 16.9 §20): roll back to the value
      // that was actually in effect before this click, rather than
      // leaving a preference displayed/applied that failed to save.
      setPreference(previous);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <RadioGroup
        value={preference}
        onValueChange={(value) => handleChange(value as ThemePreference)}
        aria-label="Appearance"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {OPTIONS.map((option) => (
          <Radio.Root
            key={option.value}
            value={option.value}
            disabled={isPending}
            className={cn(
              "group relative flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-shadow outline-none",
              option.swatchClassName,
              // Selection is shown ONLY via a stronger ring + checkmark --
              // the swatch's own background/text color never changes when
              // selected (the explicit requirement this revision fixes).
              "aria-checked:ring-2 aria-checked:ring-primary aria-checked:ring-offset-2 aria-checked:ring-offset-background",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              "disabled:pointer-events-none disabled:opacity-50"
            )}
          >
            <span
              aria-hidden
              className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 group-aria-checked:opacity-100"
            >
              <CheckIcon className="size-3" />
            </span>
            <span className="pr-5 text-sm font-medium">{option.label}</span>
            <span className={cn("pr-5 text-xs", option.descriptionClassName)}>
              {option.description}
            </span>
          </Radio.Root>
        ))}
      </RadioGroup>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
