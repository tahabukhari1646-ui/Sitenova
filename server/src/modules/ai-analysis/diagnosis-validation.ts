import { validatePerformanceAiOutput } from "./validation";
import type { DiagnosisAiOutput } from "./types";

// Stage 18.1: runtime validator for the shared SEO/Uptime DiagnosisAiOutput.
// Deliberately REUSES validatePerformanceAiOutput for summary/priority/
// findings (identical rules and bounds, so the two contracts can never
// drift), and adds only the `limitations` check. validation.ts itself is
// unchanged.

export const MAX_LIMITATIONS = 5;
export const MAX_LIMITATION_LENGTH = 300;

export type DiagnosisOutputValidationResult =
  | { valid: true; output: DiagnosisAiOutput }
  | { valid: false; error: string };

export function validateDiagnosisAiOutput(value: unknown): DiagnosisOutputValidationResult {
  const base = validatePerformanceAiOutput(value);
  if (!base.valid) return base;

  const limitations = (value as Record<string, unknown>).limitations;
  if (
    !Array.isArray(limitations) ||
    limitations.length > MAX_LIMITATIONS ||
    !limitations.every(
      (item) => typeof item === "string" && item.trim().length > 0 && item.length <= MAX_LIMITATION_LENGTH
    )
  ) {
    return {
      valid: false,
      error: `'limitations' must be an array of at most ${MAX_LIMITATIONS} non-empty strings (each at most ${MAX_LIMITATION_LENGTH} characters).`,
    };
  }

  // Rebuilt from validated parts only -- unknown extra keys are dropped,
  // exactly like validatePerformanceAiOutput does.
  return {
    valid: true,
    output: { ...base.output, limitations: limitations as string[] },
  };
}
