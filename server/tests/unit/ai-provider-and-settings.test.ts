// Stage 19.1: the provider contract (mock answers, OpenAI JSON schemas,
// provider selection) and the cost-control settings parsing.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MockAiProvider } from "../../src/integrations/ai/mock-provider";
import { createAiProvider } from "../../src/integrations/ai/factory";
import {
  DIAGNOSIS_AI_OUTPUT_JSON_SCHEMA,
  PERFORMANCE_AI_OUTPUT_JSON_SCHEMA,
} from "../../src/integrations/ai/openai-provider";
import { buildPerformanceAiInput } from "../../src/modules/ai-analysis/input-builder";
import { computePerformanceAiInputFingerprint } from "../../src/modules/ai-analysis/fingerprint";
import { validatePerformanceAiOutput } from "../../src/modules/ai-analysis/validation";
import {
  getManualCooldownSeconds,
  getManualDailyLimit,
  isAutomaticAiEnabled,
} from "../../src/modules/ai-analysis/cost-controls";
import { performanceCheckObject } from "../helpers/fixtures";
import { withEnv } from "../helpers/safety";

const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute));

describe("mock Performance analysis", () => {
  const previous = performanceCheckObject("perf-0", true, at(0));
  const current = performanceCheckObject("perf-1", false, at(10));
  const input = buildPerformanceAiInput(current, previous);

  it("is valid and deterministic", async () => {
    const mock = new MockAiProvider();
    const first = await mock.analyzePerformance(input);
    assert.equal(validatePerformanceAiOutput(first).valid, true);
    assert.deepEqual(await mock.analyzePerformance(input), first);
    assert.ok(first.findings.length > 0, "poor metrics produce findings");
  });

  it("fingerprints the input stably and changes when a metric changes", () => {
    const fingerprint = computePerformanceAiInputFingerprint(input);
    assert.equal(computePerformanceAiInputFingerprint(buildPerformanceAiInput(current, previous)), fingerprint);
    const changed = buildPerformanceAiInput({ ...current, fieldLcpMs: 6100 }, previous);
    assert.notEqual(computePerformanceAiInputFingerprint(changed), fingerprint);
  });
});

describe("OpenAI JSON schemas", () => {
  it("the diagnosis schema is the Performance schema plus required limitations", () => {
    const diagnosis = DIAGNOSIS_AI_OUTPUT_JSON_SCHEMA as any;
    const performance = PERFORMANCE_AI_OUTPUT_JSON_SCHEMA as any;
    assert.deepEqual(Object.keys(diagnosis.properties).sort(), ["findings", "limitations", "priority", "summary"]);
    assert.ok(diagnosis.required.includes("limitations"));
    assert.equal(diagnosis.additionalProperties, false);
    assert.deepEqual(diagnosis.properties.findings, performance.properties.findings);
  });
});

describe("createAiProvider", () => {
  it("uses the mock when AI_PROVIDER=mock", async () => {
    await withEnv({ AI_PROVIDER: "mock" }, async () => {
      assert.ok(createAiProvider() instanceof MockAiProvider);
    });
  });

  it("refuses to silently fall back to the mock in production", async () => {
    await withEnv({ AI_PROVIDER: undefined, NODE_ENV: "production" }, async () => {
      assert.ok(!(createAiProvider() instanceof MockAiProvider));
    });
  });
});

describe("cost-control settings", () => {
  it("defaults to a 30 second cooldown and 50 paid runs a day", async () => {
    await withEnv({ AI_MANUAL_COOLDOWN_SECONDS: undefined, AI_MANUAL_DAILY_LIMIT: undefined }, async () => {
      assert.equal(getManualCooldownSeconds(), 30);
      assert.equal(getManualDailyLimit(), 50);
    });
  });

  it("accepts valid numbers, including 0", async () => {
    await withEnv({ AI_MANUAL_COOLDOWN_SECONDS: "0", AI_MANUAL_DAILY_LIMIT: "7" }, async () => {
      assert.equal(getManualCooldownSeconds(), 0);
      assert.equal(getManualDailyLimit(), 7);
    });
  });

  it("falls back to the default for invalid values -- never disables a limit by accident", async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      for (const bad of ["abc", "-5", "1.5"]) {
        await withEnv({ AI_MANUAL_COOLDOWN_SECONDS: bad, AI_MANUAL_DAILY_LIMIT: bad }, async () => {
          assert.equal(getManualCooldownSeconds(), 30, bad);
          assert.equal(getManualDailyLimit(), 50, bad);
        });
      }
    } finally {
      console.warn = warn;
    }
  });

  it("automatic AI: explicit true/false wins; unset is on in development, off in production", async () => {
    const cases: Array<[string | undefined, string | undefined, boolean]> = [
      ["true", undefined, true],
      ["false", undefined, false],
      [undefined, "development", true],
      [undefined, "production", false],
      ["true", "production", true],
      ["false", "development", false],
    ];
    for (const [enabled, nodeEnv, expected] of cases) {
      await withEnv({ AI_AUTOMATIC_ENABLED: enabled, NODE_ENV: nodeEnv }, async () => {
        assert.equal(isAutomaticAiEnabled(), expected, `AI_AUTOMATIC_ENABLED=${enabled} NODE_ENV=${nodeEnv}`);
      });
    }
  });
});
