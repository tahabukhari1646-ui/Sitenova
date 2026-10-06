import { websiteRepository } from "../website/repository";
import { performanceRepository } from "../performance/repository";
import { aiAnalysisRepository } from "./repository";
import { buildPerformanceAiInput } from "./input-builder";
import { computePerformanceAiInputFingerprint } from "./fingerprint";
import { createAiProvider } from "../../integrations/ai/factory";
import { AiProviderError } from "../../integrations/ai/errors";
import { AppError, NotFoundError } from "../../errors/AppError";
import type { AiProvider } from "../../integrations/ai/provider";
import type { AiAnalysisStatus } from "./types";
import type { PerformanceAiOutput } from "./types";
import type { PerformanceCheck } from "../../generated/prisma/client";

// Mirrors every other module's own private verifyOwnership exactly (see
// performance/service.ts, seo/service.ts) -- deliberately duplicated, not
// shared, per this codebase's established convention.
async function verifyWebsiteOwnership(websiteId: string, userId: string) {
  const website = await websiteRepository.findById(websiteId, userId);
  if (!website) {
    throw new NotFoundError(`Website with id '${websiteId}' not found.`);
  }
  return website;
}

// Same 502 integration-failure precedent as PageSpeedError/SeoCheckError --
// defined beside the service that needs it, not centralized.
export class AiAnalysisError extends AppError {
  constructor(message: string) {
    super(message, 502);
    this.name = "AiAnalysisError";
  }
}

// Curated, generic, user-safe messages -- AiProviderError's own .message is
// already safe/generic by construction (Stage 16.2's own discipline), but
// this keeps the public API contract independent of the integration
// layer's exact wording, matching mapSafeFetchError's precedent.
const PROVIDER_ERROR_MESSAGES: Record<AiProviderError["code"], string> = {
  CONFIGURATION_ERROR: "AI analysis is not currently available (configuration error).",
  TIMEOUT: "AI analysis timed out. Please try again.",
  PROVIDER_UNAVAILABLE: "The AI provider is temporarily unavailable. Please try again.",
  INVALID_RESPONSE: "The AI provider returned an unusable response.",
};

// FAILED covers configuration/timeout/provider-unavailable -- anything
// that never produced analyzable output at all. INVALID_RESPONSE is its
// own distinct status (Stage 16.3 §16) for the narrower case where the
// provider DID respond but its content failed Stage 16.1 validation.
// Narrower than the full AiAnalysisStatus union on purpose -- PENDING is
// never a provider-error outcome (Stage 16.6), it only exists between a
// successful claim and the provider call settling.
function statusForProviderError(error: AiProviderError): "FAILED" | "INVALID_RESPONSE" {
  return error.code === "INVALID_RESPONSE" ? "INVALID_RESPONSE" : "FAILED";
}

export interface AiAnalysisResultDto {
  id: string;
  performanceCheckId: string;
  provider: string;
  model: string;
  status: AiAnalysisStatus;
  inputFingerprint: string;
  output: PerformanceAiOutput | null;
  createdAt: Date;
}

// Stage 16.3/16.5: the MANUAL execution path -- input building, fingerprint,
// provider call, Stage 16.1 validation (inside the provider, per Stage
// 16.2), and persistence mapping. Used ONLY by the manual HTTP endpoint
// (Stage 16.3 §5), where unlimited regeneration is required, so it always
// inserts a fresh row after the provider call resolves -- never a claim.
//
// No DB transaction wraps the provider call (Stage 16.3 §17) -- ownership/
// data loading already happened in the caller, the provider call happens
// with no open transaction, then exactly one persistence write happens
// after it resolves (success or failure).
//
// Stage 16.6: deliberately NOT shared with the automatic path below --
// MANUAL and AUTOMATIC need fundamentally different write orderings
// (insert-after-call vs. claim-before-call), and forcing both through one
// function would either weaken automatic's concurrency guarantee or block
// manual's unlimited regeneration. They still share the pure input-
// building/fingerprint/provider-resolution/error-classification helpers
// below, since none of those carry any correctness risk from reuse.
async function executeManualAnalysis(
  check: PerformanceCheck,
  predecessor: PerformanceCheck | null,
  providerOverride?: AiProvider
): Promise<AiAnalysisResultDto> {
  const input = buildPerformanceAiInput(check, predecessor);
  const inputFingerprint = computePerformanceAiInputFingerprint(input);
  // Stage 16.5 §16: resolved via the SAME createAiProvider() boundary for
  // both manual and automatic callers -- neither this function nor either
  // caller ever instantiates MockAiProvider/OpenAiProvider directly, so
  // mock-today-OpenAI-later requires no change to this file or to
  // performance/service.ts.
  const provider = providerOverride ?? createAiProvider();

  try {
    const output = await provider.analyzePerformance(input);

    const created = await aiAnalysisRepository.create({
      performanceCheckId: check.id,
      provider: provider.name,
      model: provider.model,
      inputFingerprint,
      output,
      status: "SUCCEEDED",
    });

    return {
      id: created.id,
      performanceCheckId: created.performanceCheckId,
      provider: created.provider,
      model: created.model,
      status: created.status,
      inputFingerprint: created.inputFingerprint,
      output,
      createdAt: created.createdAt,
    };
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;

    // Persisted so the attempt is traceable (provider/model/fingerprint),
    // but NEVER the raw error/message -- only the fixed enum status.
    // output is explicitly null; nothing unvalidated is ever stored.
    await aiAnalysisRepository.create({
      performanceCheckId: check.id,
      provider: provider.name,
      model: provider.model,
      inputFingerprint,
      output: null,
      status: statusForProviderError(error),
    });

    throw new AiAnalysisError(PROVIDER_ERROR_MESSAGES[error.code]);
  }
}

// Stage 16.6: the AUTOMATIC execution path. Cost-safety ordering is the
// entire point of this function (claim BEFORE any provider call, never
// check-then-call-then-insert): the claim is a real DB insert relying on
// the `ai_analyses_automatic_unique` partial unique index, so even if the
// scheduler's own in-memory overlap guard (performance/worker.ts's
// isCycleRunning) ever failed to prevent two overlapping cycles, Postgres
// itself -- not any JS variable -- still allows only one of any number of
// concurrent callers for the SAME performanceCheckId to proceed to the
// provider call.
//
// Never retries: `claimed: false` (lost the race, or an automatic attempt
// for this check already exists in ANY status, including a prior FAILED/
// INVALID_RESPONSE) returns immediately, calling the provider zero times.
// A PENDING row left behind by a mid-flight crash is an accepted V1
// limitation (schema.prisma's own AiAnalysisStatus comment) -- it is never
// swept, retried, or re-claimed by a later call for the same check.
async function executeAutomaticAnalysis(
  check: PerformanceCheck,
  predecessor: PerformanceCheck | null,
  providerOverride?: AiProvider
): Promise<void> {
  const input = buildPerformanceAiInput(check, predecessor);
  const inputFingerprint = computePerformanceAiInputFingerprint(input);
  const provider = providerOverride ?? createAiProvider();

  const claim = await aiAnalysisRepository.claimAutomaticAnalysis({
    performanceCheckId: check.id,
    provider: provider.name,
    model: provider.model,
    inputFingerprint,
  });

  if (!claim.claimed) return;

  try {
    const output = await provider.analyzePerformance(input);
    await aiAnalysisRepository.finalizeAutomaticAnalysis(claim.analysis.id, {
      status: "SUCCEEDED",
      output,
    });
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;

    await aiAnalysisRepository.finalizeAutomaticAnalysis(claim.analysis.id, {
      status: statusForProviderError(error),
      output: null,
    });

    throw new AiAnalysisError(PROVIDER_ERROR_MESSAGES[error.code]);
  }
}

export const aiAnalysisService = {
  // Stage 16.3's manual, HTTP-authorized entry point. Ownership chain
  // enforced server-side only, in order: website (via :id + userId,
  // exactly like every other endpoint) -> performance check (via
  // :checkId, then cross-checked against THAT website's id) -- a checkId
  // belonging to a different website (even one the same user owns) is
  // rejected exactly like a nonexistent one, never distinguished in the
  // response (Stage 16.3 §10).
  //
  // `providerOverride` exists ONLY for test doubles at this exact
  // boundary (Stage 16.3 §24) -- every real caller (the controller) omits
  // it, so production always resolves the provider from the server's own
  // AI_PROVIDER configuration via createAiProvider(). This does not weaken
  // AiProvider's public success contract -- a test double must still
  // satisfy the same interface and either resolve with a validated
  // PerformanceAiOutput or reject with an AiProviderError, exactly like a
  // real provider.
  analyzePerformanceCheck: async (
    websiteId: string,
    checkId: string,
    userId: string,
    providerOverride?: AiProvider
  ): Promise<AiAnalysisResultDto> => {
    await verifyWebsiteOwnership(websiteId, userId);

    const check = await performanceRepository.findById(checkId);
    if (!check || check.websiteId !== websiteId) {
      throw new NotFoundError(`Performance check with id '${checkId}' not found.`);
    }

    const predecessor = await performanceRepository.findImmediatePredecessor(
      check.websiteId,
      check.pageUrl,
      check.strategy,
      { checkedAt: check.checkedAt, id: check.id }
    );

    return executeManualAnalysis(check, predecessor, providerOverride);
  },

  // Stage 16.5: trusted INTERNAL entry point for the Performance scheduler
  // only -- deliberately takes NO userId and performs NO ownership
  // verification, because there is no authenticated HTTP user in a
  // background cycle. `check`/`predecessor` are trusted as-is, exactly
  // like performanceService.runAutomaticCheck already trusts its own
  // `website` parameter (see that function's own doc comment for the
  // identical justification: the caller already loaded these rows
  // directly from the scheduler's own trusted query, not from user input).
  //
  // Never exposed through routes.ts/controller.ts -- there is no HTTP path
  // to this function, by construction, so it cannot weaken the public
  // endpoint's authorization even in principle.
  //
  // Stage 16.6: returns Promise<void> (was Promise<AiAnalysisResultDto>) --
  // its result was already discarded by its one caller
  // (performance/service.ts's maybeRunAutomaticAiAnalysis), and the
  // claim-based executeAutomaticAnalysis has nothing meaningful to return
  // when `claimed: false` (there is no "existing analysis" this caller
  // needs back, only the fact that no provider call happened).
  analyzePerformanceCheckInternal: async (
    check: PerformanceCheck,
    predecessor: PerformanceCheck | null,
    providerOverride?: AiProvider
  ): Promise<void> => {
    return executeAutomaticAnalysis(check, predecessor, providerOverride);
  },
};
