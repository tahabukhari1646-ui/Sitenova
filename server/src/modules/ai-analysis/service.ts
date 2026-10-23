import { websiteRepository } from "../website/repository";
import { performanceRepository } from "../performance/repository";
import { seoRepository } from "../seo/repository";
import { monitorRepository } from "../monitor/repository";
import { aiAnalysisRepository } from "./repository";
import { buildPerformanceAiInput } from "./input-builder";
import { computePerformanceAiInputFingerprint } from "./fingerprint";
import { validatePerformanceAiOutput } from "./validation";
import { buildSeoAiInput } from "./seo-input-builder";
import { computeSeoAiInputFingerprint } from "./seo-fingerprint";
import { validateDiagnosisAiOutput } from "./diagnosis-validation";
import { loadIncidentAiInput } from "./incident-input-builder";
import { computeIncidentAiInputFingerprint } from "./incident-fingerprint";
import { enforceManualLimits, isAutomaticAiEnabled } from "./cost-controls";
import type { AiAnalysisTarget } from "./repository";
import { createAiProvider } from "../../integrations/ai/factory";
import { AiProviderError } from "../../integrations/ai/errors";
import { AppError, NotFoundError } from "../../errors/AppError";
import type { AiProvider } from "../../integrations/ai/provider";
import type { AiAnalysisStatus } from "./types";
import type { DiagnosisAiOutput, PerformanceAiOutput } from "./types";
import type { Incident, PerformanceCheck, SeoCheck } from "../../generated/prisma/client";

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

// Stage 18.2: the ONE place an AiAnalysisResultDto is shaped -- used by both
// the manual POST response and the GET-latest read, so the two contracts can
// never drift. Key order is part of the contract (JSON serialization order),
// and is identical to the pre-18.2 POST literal. performanceCheckId is always
// the already-verified check's id (never the nullable column).
function toAiAnalysisResultDto(
  row: {
    id: string;
    provider: string;
    model: string;
    status: AiAnalysisStatus;
    inputFingerprint: string;
    createdAt: Date;
  },
  performanceCheckId: string,
  output: PerformanceAiOutput | null
): AiAnalysisResultDto {
  return {
    id: row.id,
    performanceCheckId,
    provider: row.provider,
    model: row.model,
    status: row.status,
    inputFingerprint: row.inputFingerprint,
    output,
    createdAt: row.createdAt,
  };
}

// Stage 18.2: how many recent SUCCEEDED rows the GET-latest read inspects
// when looking for the newest one whose stored output still validates.
const LATEST_ANALYSIS_LOOKBACK = 10;

// --- Stage 18.7: cost controls (shared by all three manual paths) ----------

// What every manual POST returns: the analysis plus whether it was REUSED
// (no provider call, no new row). The controller maps reused -> HTTP 200,
// new -> HTTP 201; the response body shape is unchanged either way.
export interface ManualAnalysisResult<T> {
  analysis: T;
  reused: boolean;
}

export interface ManualAnalysisOptions {
  // true skips the free reuse step only -- never the cooldown/daily limit.
  force?: boolean;
}

type OutputValidator<T> = (value: unknown) => { valid: true; output: T } | { valid: false; error: string };

// Step 1 of the cost controls: the newest SUCCEEDED analysis for the same
// target, input fingerprint, provider and model whose stored output still
// validates -- or null. Free: never calls a provider, never writes.
async function findValidReusable<T>(
  target: AiAnalysisTarget,
  inputFingerprint: string,
  provider: AiProvider,
  validate: OutputValidator<T>
) {
  const rows = await aiAnalysisRepository.findReusableCandidates(
    target,
    inputFingerprint,
    provider.name,
    provider.model,
    LATEST_ANALYSIS_LOOKBACK
  );
  for (const row of rows) {
    const validation = validate(row.output);
    if (validation.valid) return { row, output: validation.output };
  }
  return null;
}

// --- Stage 18.3: SEO manual diagnosis ---------------------------------------

// Same 8-key shape as AiAnalysisResultDto, with seoCheckId in place of
// performanceCheckId and the shared DiagnosisAiOutput as `output`.
export interface SeoAiAnalysisResultDto {
  id: string;
  seoCheckId: string;
  provider: string;
  model: string;
  status: AiAnalysisStatus;
  inputFingerprint: string;
  output: DiagnosisAiOutput | null;
  createdAt: Date;
}

// The ONE place an SeoAiAnalysisResultDto is shaped (POST + GET), so the two
// can never drift. seoCheckId is always the already-verified check's id.
function toSeoAiAnalysisResultDto(
  row: {
    id: string;
    provider: string;
    model: string;
    status: AiAnalysisStatus;
    inputFingerprint: string;
    createdAt: Date;
  },
  seoCheckId: string,
  output: DiagnosisAiOutput | null
): SeoAiAnalysisResultDto {
  return {
    id: row.id,
    seoCheckId,
    provider: row.provider,
    model: row.model,
    status: row.status,
    inputFingerprint: row.inputFingerprint,
    output,
    createdAt: row.createdAt,
  };
}

// Website ownership first, then the SEO check cross-checked against THAT
// website -- a missing check, another user's check, or a check from a
// different website (even one this user owns) are all the same 404.
async function loadOwnedSeoCheck(websiteId: string, checkId: string, userId: string): Promise<SeoCheck> {
  await verifyWebsiteOwnership(websiteId, userId);
  const check = await seoRepository.findById(checkId);
  if (!check || check.websiteId !== websiteId) {
    throw new NotFoundError(`SEO check with id '${checkId}' not found.`);
  }
  return check;
}

// Mirrors executeManualAnalysis exactly: build input, fingerprint, call the
// provider with no open transaction, then exactly ONE insert after it
// settles. Provider failures persist a FAILED/INVALID_RESPONSE row with null
// output (never the raw error) and surface as the same curated 502.
async function executeManualSeoAnalysis(
  check: SeoCheck,
  predecessor: SeoCheck | null,
  userId: string,
  options: ManualAnalysisOptions,
  providerOverride?: AiProvider
): Promise<ManualAnalysisResult<SeoAiAnalysisResultDto>> {
  const input = buildSeoAiInput(check, predecessor);
  const inputFingerprint = computeSeoAiInputFingerprint(input);
  const provider = providerOverride ?? createAiProvider();
  const target: AiAnalysisTarget = { source: "SEO", id: check.id };

  // Stage 18.7: free reuse first, then the paid-run limits.
  if (!options.force) {
    const reusable = await findValidReusable(target, inputFingerprint, provider, validateDiagnosisAiOutput);
    if (reusable) {
      return { analysis: toSeoAiAnalysisResultDto(reusable.row, check.id, reusable.output), reused: true };
    }
  }
  await enforceManualLimits(userId, target);

  try {
    const output = await provider.analyzeSeo(input);

    const created = await aiAnalysisRepository.createSeo({
      seoCheckId: check.id,
      provider: provider.name,
      model: provider.model,
      inputFingerprint,
      output,
      status: "SUCCEEDED",
    });

    return { analysis: toSeoAiAnalysisResultDto(created, check.id, output), reused: false };
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;

    await aiAnalysisRepository.createSeo({
      seoCheckId: check.id,
      provider: provider.name,
      model: provider.model,
      inputFingerprint,
      output: null,
      status: statusForProviderError(error),
    });

    throw new AiAnalysisError(PROVIDER_ERROR_MESSAGES[error.code]);
  }
}

// --- Stage 18.5: Uptime (incident) manual diagnosis --------------------------

// Same 8-key shape as the SEO/Performance DTOs, with incidentId as the target.
export interface IncidentAiAnalysisResultDto {
  id: string;
  incidentId: string;
  provider: string;
  model: string;
  status: AiAnalysisStatus;
  inputFingerprint: string;
  output: DiagnosisAiOutput | null;
  createdAt: Date;
}

// The ONE place an IncidentAiAnalysisResultDto is shaped (POST + GET).
// incidentId is always the already-verified incident's id.
function toIncidentAiAnalysisResultDto(
  row: {
    id: string;
    provider: string;
    model: string;
    status: AiAnalysisStatus;
    inputFingerprint: string;
    createdAt: Date;
  },
  incidentId: string,
  output: DiagnosisAiOutput | null
): IncidentAiAnalysisResultDto {
  return {
    id: row.id,
    incidentId,
    provider: row.provider,
    model: row.model,
    status: row.status,
    inputFingerprint: row.inputFingerprint,
    output,
    createdAt: row.createdAt,
  };
}

// Website ownership first, then the incident cross-checked against THAT
// website -- missing / another user's / another website's incident are all
// the same 404.
async function loadOwnedIncident(websiteId: string, incidentId: string, userId: string): Promise<Incident> {
  await verifyWebsiteOwnership(websiteId, userId);
  const incident = await monitorRepository.findIncidentById(incidentId);
  if (!incident || incident.websiteId !== websiteId) {
    throw new NotFoundError(`Incident with id '${incidentId}' not found.`);
  }
  return incident;
}

// Mirrors executeManualSeoAnalysis exactly (insert-after-call, one row,
// FAILED/INVALID_RESPONSE with null output + curated 502 on provider error).
async function executeManualIncidentAnalysis(
  incident: Incident,
  userId: string,
  options: ManualAnalysisOptions,
  providerOverride?: AiProvider
): Promise<ManualAnalysisResult<IncidentAiAnalysisResultDto>> {
  const input = await loadIncidentAiInput(incident);
  const inputFingerprint = computeIncidentAiInputFingerprint(input);
  const provider = providerOverride ?? createAiProvider();
  const target: AiAnalysisTarget = { source: "UPTIME", id: incident.id };

  // Stage 18.7: free reuse first, then the paid-run limits. (An OPEN
  // incident's fingerprint changes as checks arrive, so reuse mostly helps
  // resolved incidents and repeated clicks.)
  if (!options.force) {
    const reusable = await findValidReusable(target, inputFingerprint, provider, validateDiagnosisAiOutput);
    if (reusable) {
      return {
        analysis: toIncidentAiAnalysisResultDto(reusable.row, incident.id, reusable.output),
        reused: true,
      };
    }
  }
  await enforceManualLimits(userId, target);

  try {
    const output = await provider.analyzeIncident(input);

    const created = await aiAnalysisRepository.createUptime({
      incidentId: incident.id,
      provider: provider.name,
      model: provider.model,
      inputFingerprint,
      output,
      status: "SUCCEEDED",
    });

    return { analysis: toIncidentAiAnalysisResultDto(created, incident.id, output), reused: false };
  } catch (error) {
    if (!(error instanceof AiProviderError)) throw error;

    await aiAnalysisRepository.createUptime({
      incidentId: incident.id,
      provider: provider.name,
      model: provider.model,
      inputFingerprint,
      output: null,
      status: statusForProviderError(error),
    });

    throw new AiAnalysisError(PROVIDER_ERROR_MESSAGES[error.code]);
  }
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
  userId: string,
  options: ManualAnalysisOptions,
  providerOverride?: AiProvider
): Promise<ManualAnalysisResult<AiAnalysisResultDto>> {
  const input = buildPerformanceAiInput(check, predecessor);
  const inputFingerprint = computePerformanceAiInputFingerprint(input);
  // Stage 16.5 §16: resolved via the SAME createAiProvider() boundary for
  // both manual and automatic callers -- neither this function nor either
  // caller ever instantiates MockAiProvider/OpenAiProvider directly, so
  // mock-today-OpenAI-later requires no change to this file or to
  // performance/service.ts.
  const provider = providerOverride ?? createAiProvider();
  const target: AiAnalysisTarget = { source: "PERFORMANCE", id: check.id };

  // Stage 18.7: free reuse first (replaces the old "always call the provider"
  // behavior when the facts are unchanged), then the paid-run limits.
  if (!options.force) {
    const reusable = await findValidReusable(target, inputFingerprint, provider, validatePerformanceAiOutput);
    if (reusable) {
      return { analysis: toAiAnalysisResultDto(reusable.row, check.id, reusable.output), reused: true };
    }
  }
  await enforceManualLimits(userId, target);

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

    // Stage 18.1: the column is nullable now (SEO/Uptime rows); check.id is
    // the identical value for this Performance row and keeps the DTO a
    // non-null string, so the API response is unchanged.
    return { analysis: toAiAnalysisResultDto(created, check.id, output), reused: false };
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
  // Stage 18.7: the automatic on/off switch, checked BEFORE the claim so a
  // disabled switch creates no row and makes no provider call at all.
  if (!isAutomaticAiEnabled()) return;

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
    options: ManualAnalysisOptions = {},
    providerOverride?: AiProvider
  ): Promise<ManualAnalysisResult<AiAnalysisResultDto>> => {
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

    return executeManualAnalysis(check, predecessor, userId, options, providerOverride);
  },

  // Stage 18.2: read-only GET-latest. Same ownership chain and the same 404
  // messages as analyzePerformanceCheck above (website via :id + userId,
  // then the check cross-checked against THAT website). Never calls a
  // provider and never writes.
  //
  // Returns the newest SUCCEEDED analysis whose stored output still passes
  // validatePerformanceAiOutput (defense-in-depth: output was validated
  // before it was stored, but stored JSON is never trusted blindly). An
  // invalid row is skipped and logged by id only; if no valid SUCCEEDED row
  // exists, returns null -- "no analysis yet" is not an error.
  getLatestPerformanceAnalysis: async (
    websiteId: string,
    checkId: string,
    userId: string
  ): Promise<AiAnalysisResultDto | null> => {
    await verifyWebsiteOwnership(websiteId, userId);

    const check = await performanceRepository.findById(checkId);
    if (!check || check.websiteId !== websiteId) {
      throw new NotFoundError(`Performance check with id '${checkId}' not found.`);
    }

    const rows = await aiAnalysisRepository.findRecentSucceededForPerformanceCheck(
      check.id,
      LATEST_ANALYSIS_LOOKBACK
    );

    for (const row of rows) {
      const validation = validatePerformanceAiOutput(row.output);
      if (validation.valid) {
        return toAiAnalysisResultDto(row, check.id, validation.output);
      }
      console.error(`AI analysis ${row.id}: stored output failed validation; skipped on read.`);
    }

    return null;
  },

  // Stage 18.3: manual SEO diagnosis of one stored SeoCheck. The predecessor
  // is the check immediately before it on the SAME page, so new/resolved
  // issues describe exactly this check's transition. No crawl, no fetch.
  analyzeSeoCheck: async (
    websiteId: string,
    checkId: string,
    userId: string,
    options: ManualAnalysisOptions = {},
    providerOverride?: AiProvider
  ): Promise<ManualAnalysisResult<SeoAiAnalysisResultDto>> => {
    const check = await loadOwnedSeoCheck(websiteId, checkId, userId);
    const predecessor = await seoRepository.findImmediatePredecessor(check.websiteId, check.pageUrl, {
      checkedAt: check.checkedAt,
      id: check.id,
    });
    return executeManualSeoAnalysis(check, predecessor, userId, options, providerOverride);
  },

  // Stage 18.3: read-only SEO GET-latest -- same rules as
  // getLatestPerformanceAnalysis, validated with validateDiagnosisAiOutput.
  // Never calls a provider, never writes.
  getLatestSeoAnalysis: async (
    websiteId: string,
    checkId: string,
    userId: string
  ): Promise<SeoAiAnalysisResultDto | null> => {
    const check = await loadOwnedSeoCheck(websiteId, checkId, userId);

    const rows = await aiAnalysisRepository.findRecentSucceededForSeoCheck(check.id, LATEST_ANALYSIS_LOOKBACK);

    for (const row of rows) {
      const validation = validateDiagnosisAiOutput(row.output);
      if (validation.valid) {
        return toSeoAiAnalysisResultDto(row, check.id, validation.output);
      }
      console.error(`AI analysis ${row.id}: stored output failed validation; skipped on read.`);
    }

    return null;
  },

  // Stage 18.5: manual uptime diagnosis of one stored incident (open or
  // resolved). Facts come only from stored rows; no monitoring check is run.
  analyzeIncident: async (
    websiteId: string,
    incidentId: string,
    userId: string,
    options: ManualAnalysisOptions = {},
    providerOverride?: AiProvider
  ): Promise<ManualAnalysisResult<IncidentAiAnalysisResultDto>> => {
    const incident = await loadOwnedIncident(websiteId, incidentId, userId);
    return executeManualIncidentAnalysis(incident, userId, options, providerOverride);
  },

  // Stage 18.5: read-only uptime GET-latest -- same rules as the SEO one.
  // Never calls a provider, never writes.
  getLatestIncidentAnalysis: async (
    websiteId: string,
    incidentId: string,
    userId: string
  ): Promise<IncidentAiAnalysisResultDto | null> => {
    const incident = await loadOwnedIncident(websiteId, incidentId, userId);

    const rows = await aiAnalysisRepository.findRecentSucceededForIncident(incident.id, LATEST_ANALYSIS_LOOKBACK);

    for (const row of rows) {
      const validation = validateDiagnosisAiOutput(row.output);
      if (validation.valid) {
        return toIncidentAiAnalysisResultDto(row, incident.id, validation.output);
      }
      console.error(`AI analysis ${row.id}: stored output failed validation; skipped on read.`);
    }

    return null;
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
