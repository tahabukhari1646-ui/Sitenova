import type { AiConfidence, AiUrgency, PerformanceAiFinding, PerformanceAiOutput } from "./types";

// Stage 16.1: strict runtime validation for AI-provider output, following
// this codebase's existing hand-written "valid/error discriminated union"
// convention (see performance/validation.ts, seo/validation.ts) rather than
// introducing a schema-validation library -- none is installed anywhere in
// this repository (confirmed by inspection), and Stage 16.0 merely floated
// Zod as an example, not a requirement.
//
// This validates SHAPE and BOUNDS only -- known enum values, required
// non-empty/length-bounded strings, bounded array sizes. It deliberately
// does NOT and cannot judge whether an inference is factually correct; that
// remains a prompt/provider-behavior concern for Stage 16.2, never this
// layer's job (Stage 16.0 §7, explicit instruction for this stage).
//
// A response that fails any of these checks must be treated as
// INVALID_RESPONSE, never silently coerced or partially accepted -- the
// database must never treat malformed/unvalidated provider output as a
// successful analysis.

const VALID_URGENCY: readonly AiUrgency[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const VALID_CONFIDENCE: readonly AiConfidence[] = ["LOW", "MEDIUM", "HIGH"];

// Deliberately Sentinel AI's own heuristic bounds, not derived from any
// provider/vendor limit -- chosen to keep a finding readable and to prevent
// a misbehaving/adversarial response from producing an unbounded payload,
// mirroring the exact reasoning already used for seo/issues.ts's
// TITLE_MIN_LENGTH/MAX_LENGTH constants (a documented V1 approximation, not
// an authoritative standard).
export const MAX_SUMMARY_LENGTH = 500;
export const MAX_FINDINGS = 10;
export const MAX_TITLE_LENGTH = 150;
export const MAX_EXPLANATION_LENGTH = 1000;
export const MAX_EVIDENCE_ITEMS = 10;
export const MAX_EVIDENCE_ITEM_LENGTH = 300;
export const MAX_RECOMMENDATIONS = 8;
export const MAX_RECOMMENDATION_LENGTH = 300;
// A finding without at least one cited fact or one suggested action isn't
// useful/actionable -- both bounds are enforced, not just upper limits.
export const MIN_EVIDENCE_ITEMS = 1;
export const MIN_RECOMMENDATIONS = 1;

export type AiOutputValidationResult =
  | { valid: true; output: PerformanceAiOutput }
  | { valid: false; error: string };

function isEnumValue<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isBoundedStringArray(
  value: unknown,
  minItems: number,
  maxItems: number,
  maxItemLength: number
): value is string[] {
  if (!Array.isArray(value)) return false;
  if (value.length < minItems || value.length > maxItems) return false;
  return value.every((item) => isBoundedString(item, maxItemLength));
}

function validateFinding(value: unknown, index: number): { valid: true; finding: PerformanceAiFinding } | { valid: false; error: string } {
  if (typeof value !== "object" || value === null) {
    return { valid: false, error: `findings[${index}] must be an object.` };
  }
  const finding = value as Record<string, unknown>;

  if (!isBoundedString(finding.title, MAX_TITLE_LENGTH)) {
    return {
      valid: false,
      error: `findings[${index}].title must be a non-empty string of at most ${MAX_TITLE_LENGTH} characters.`,
    };
  }

  if (!isEnumValue(finding.severity, VALID_URGENCY)) {
    return {
      valid: false,
      error: `findings[${index}].severity must be one of: ${VALID_URGENCY.join(", ")}.`,
    };
  }

  if (!isBoundedStringArray(finding.evidence, MIN_EVIDENCE_ITEMS, MAX_EVIDENCE_ITEMS, MAX_EVIDENCE_ITEM_LENGTH)) {
    return {
      valid: false,
      error: `findings[${index}].evidence must be an array of ${MIN_EVIDENCE_ITEMS}-${MAX_EVIDENCE_ITEMS} non-empty strings (each at most ${MAX_EVIDENCE_ITEM_LENGTH} characters).`,
    };
  }

  if (!isBoundedString(finding.explanation, MAX_EXPLANATION_LENGTH)) {
    return {
      valid: false,
      error: `findings[${index}].explanation must be a non-empty string of at most ${MAX_EXPLANATION_LENGTH} characters.`,
    };
  }

  if (!isEnumValue(finding.confidence, VALID_CONFIDENCE)) {
    return {
      valid: false,
      error: `findings[${index}].confidence must be one of: ${VALID_CONFIDENCE.join(", ")}.`,
    };
  }

  if (
    !isBoundedStringArray(
      finding.recommendations,
      MIN_RECOMMENDATIONS,
      MAX_RECOMMENDATIONS,
      MAX_RECOMMENDATION_LENGTH
    )
  ) {
    return {
      valid: false,
      error: `findings[${index}].recommendations must be an array of ${MIN_RECOMMENDATIONS}-${MAX_RECOMMENDATIONS} non-empty strings (each at most ${MAX_RECOMMENDATION_LENGTH} characters).`,
    };
  }

  return {
    valid: true,
    finding: {
      title: finding.title as string,
      severity: finding.severity as AiUrgency,
      evidence: finding.evidence as string[],
      explanation: finding.explanation as string,
      confidence: finding.confidence as AiConfidence,
      recommendations: finding.recommendations as string[],
    },
  };
}

export function validatePerformanceAiOutput(value: unknown): AiOutputValidationResult {
  if (typeof value !== "object" || value === null) {
    return { valid: false, error: "AI output must be an object." };
  }
  const output = value as Record<string, unknown>;

  if (!isBoundedString(output.summary, MAX_SUMMARY_LENGTH)) {
    return {
      valid: false,
      error: `'summary' must be a non-empty string of at most ${MAX_SUMMARY_LENGTH} characters.`,
    };
  }

  if (!isEnumValue(output.priority, VALID_URGENCY)) {
    return { valid: false, error: `'priority' must be one of: ${VALID_URGENCY.join(", ")}.` };
  }

  if (!Array.isArray(output.findings) || output.findings.length > MAX_FINDINGS) {
    return {
      valid: false,
      error: `'findings' must be an array of at most ${MAX_FINDINGS} items.`,
    };
  }

  const findings: PerformanceAiFinding[] = [];
  for (let i = 0; i < output.findings.length; i++) {
    const result = validateFinding(output.findings[i], i);
    if (!result.valid) return result;
    findings.push(result.finding);
  }

  return {
    valid: true,
    output: {
      summary: output.summary as string,
      priority: output.priority as AiUrgency,
      findings,
    },
  };
}
