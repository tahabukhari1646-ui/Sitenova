// Stage 19.1: the validators every AI answer must pass before it is stored
// or shown -- AI output is untrusted until these say otherwise.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validatePerformanceAiOutput, MAX_FINDINGS, MAX_SUMMARY_LENGTH } from "../../src/modules/ai-analysis/validation";
import { validateDiagnosisAiOutput, MAX_LIMITATIONS } from "../../src/modules/ai-analysis/diagnosis-validation";
import { VALID_DIAGNOSIS_OUTPUT, VALID_FINDING, VALID_PERFORMANCE_OUTPUT } from "../helpers/fixtures";

describe("validatePerformanceAiOutput", () => {
  it("accepts a well-formed answer with and without findings", () => {
    assert.equal(validatePerformanceAiOutput(VALID_PERFORMANCE_OUTPUT()).valid, true);
    assert.equal(
      validatePerformanceAiOutput({ ...VALID_PERFORMANCE_OUTPUT(), findings: [VALID_FINDING] }).valid,
      true
    );
  });

  it("rejects non-objects and missing or empty summaries", () => {
    for (const value of [null, "text", 42, [], { priority: "LOW", findings: [] }, { ...VALID_PERFORMANCE_OUTPUT(), summary: "   " }]) {
      assert.equal(validatePerformanceAiOutput(value).valid, false, JSON.stringify(value));
    }
  });

  it("enforces the length and count limits", () => {
    const longSummary = { ...VALID_PERFORMANCE_OUTPUT(), summary: "x".repeat(MAX_SUMMARY_LENGTH + 1) };
    const tooManyFindings = {
      ...VALID_PERFORMANCE_OUTPUT(),
      findings: Array.from({ length: MAX_FINDINGS + 1 }, () => VALID_FINDING),
    };
    assert.equal(validatePerformanceAiOutput(longSummary).valid, false);
    assert.equal(validatePerformanceAiOutput(tooManyFindings).valid, false);
  });

  it("rejects unknown priority, severity and confidence values", () => {
    assert.equal(validatePerformanceAiOutput({ ...VALID_PERFORMANCE_OUTPUT(), priority: "URGENT" }).valid, false);
    for (const badFinding of [
      { ...VALID_FINDING, severity: "SEVERE" },
      { ...VALID_FINDING, confidence: "CERTAIN" },
    ]) {
      assert.equal(validatePerformanceAiOutput({ ...VALID_PERFORMANCE_OUTPUT(), findings: [badFinding] }).valid, false);
    }
  });

  it("requires every finding to carry evidence and a recommendation", () => {
    for (const badFinding of [
      { ...VALID_FINDING, evidence: [] },
      { ...VALID_FINDING, recommendations: [] },
      { ...VALID_FINDING, evidence: "not a list" },
      { ...VALID_FINDING, title: "" },
    ]) {
      assert.equal(validatePerformanceAiOutput({ ...VALID_PERFORMANCE_OUTPUT(), findings: [badFinding] }).valid, false);
    }
  });

  it("drops unknown extra keys from the stored result", () => {
    const result = validatePerformanceAiOutput({
      ...VALID_PERFORMANCE_OUTPUT(),
      injected: "<script>",
      findings: [{ ...VALID_FINDING, extra: true }],
    });
    assert.ok(result.valid);
    assert.ok(!("injected" in result.output));
    assert.ok(!("extra" in result.output.findings[0]));
  });
});

describe("validateDiagnosisAiOutput (SEO and uptime)", () => {
  it("accepts a well-formed diagnosis", () => {
    assert.equal(validateDiagnosisAiOutput(VALID_DIAGNOSIS_OUTPUT()).valid, true);
  });

  it("requires a limitations list, unlike Performance", () => {
    assert.equal(validateDiagnosisAiOutput(VALID_PERFORMANCE_OUTPUT()).valid, false);
  });

  it("rejects too many, empty or non-text limitations", () => {
    const base = VALID_PERFORMANCE_OUTPUT();
    for (const limitations of [Array.from({ length: MAX_LIMITATIONS + 1 }, () => "x"), [""], [42], "text"]) {
      assert.equal(validateDiagnosisAiOutput({ ...base, limitations }).valid, false, JSON.stringify(limitations));
    }
  });

  it("still applies every Performance rule", () => {
    assert.equal(validateDiagnosisAiOutput({ ...VALID_DIAGNOSIS_OUTPUT(), priority: "NOPE" }).valid, false);
  });
});
