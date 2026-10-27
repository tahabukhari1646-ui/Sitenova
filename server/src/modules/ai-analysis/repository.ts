import { prisma } from "../../config/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { DiagnosisAiOutput, PerformanceAiOutput } from "./types";
import type { AiAnalysis } from "../../generated/prisma/client";

// Stage 18.7: one analysis target, used by the cost-control queries below.
// `source` and the matching id column always travel together, mirroring the
// ai_analyses_exactly_one_target_check constraint.
export type AiAnalysisTarget =
  | { source: "PERFORMANCE"; id: string }
  | { source: "SEO"; id: string }
  | { source: "UPTIME"; id: string };

function targetWhere(target: AiAnalysisTarget) {
  switch (target.source) {
    case "PERFORMANCE":
      return { source: "PERFORMANCE" as const, performanceCheckId: target.id };
    case "SEO":
      return { source: "SEO" as const, seoCheckId: target.id };
    case "UPTIME":
      return { source: "UPTIME" as const, incidentId: target.id };
  }
}

export interface CreateAiAnalysisInput {
  performanceCheckId: string;
  provider: string;
  model: string;
  inputFingerprint: string;
  // null for FAILED/INVALID_RESPONSE -- see Stage 16.3 §16, this module
  // never persists unvalidated/raw provider data.
  output: PerformanceAiOutput | null;
  status: "SUCCEEDED" | "FAILED" | "INVALID_RESPONSE";
}

// Stage 18.3: input for the one SEO insert site below (MANUAL only;
// automatic SEO arrives in a later stage with its own claim path).
export interface CreateSeoAiAnalysisInput {
  seoCheckId: string;
  provider: string;
  model: string;
  inputFingerprint: string;
  output: DiagnosisAiOutput | null;
  status: "SUCCEEDED" | "FAILED" | "INVALID_RESPONSE";
}

// Stage 18.5: input for the one UPTIME insert site below (MANUAL only;
// uptime AI has no automatic trigger in V1).
export interface CreateUptimeAiAnalysisInput {
  incidentId: string;
  provider: string;
  model: string;
  inputFingerprint: string;
  output: DiagnosisAiOutput | null;
  status: "SUCCEEDED" | "FAILED" | "INVALID_RESPONSE";
}

function toOutputJson(
  output: PerformanceAiOutput | DiagnosisAiOutput | null
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  // `Prisma.DbNull` (not plain `null`) is required to actually store SQL
  // NULL in a nullable Json column -- a bare `null` is reserved by Prisma
  // for "this field is absent from the update," and a literal JSON null
  // would need `Prisma.JsonNull` instead, which is a different, incorrect
  // persisted value (Stage 16.3 §16: FAILED/INVALID_RESPONSE rows must have
  // a genuinely empty output column, not a JSON "null" literal).
  return output === null ? Prisma.DbNull : (output as unknown as Prisma.InputJsonValue);
}

export interface ClaimAutomaticAnalysisInput {
  performanceCheckId: string;
  provider: string;
  model: string;
  inputFingerprint: string;
}

export type ClaimAutomaticAnalysisResult =
  | { claimed: true; analysis: AiAnalysis }
  // No `existing` row is returned here -- Stage 16.6 §X, the caller (the
  // automatic execution path) never reads an already-claimed row's content,
  // it only needs to know it lost the race and must not call the provider.
  | { claimed: false };

// Stage 18.8: the SEO equivalent of ClaimAutomaticAnalysisInput.
export interface ClaimAutomaticSeoAnalysisInput {
  seoCheckId: string;
  provider: string;
  model: string;
  inputFingerprint: string;
}

export interface FinalizeAutomaticAnalysisInput {
  status: "SUCCEEDED" | "FAILED" | "INVALID_RESPONSE";
  // Stage 18.8: widened -- the same finalize step resolves both Performance
  // (PerformanceAiOutput) and SEO (DiagnosisAiOutput) automatic claims.
  output: PerformanceAiOutput | DiagnosisAiOutput | null;
}

// Stage 16.3: only what this stage actually needs -- no history/pagination
// methods, no "find latest for a check" lookup, since nothing yet reads
// AiAnalysis rows back other than the one just created in the same
// request. Stage 16.4's frontend read endpoints can add their own methods
// here when they exist, rather than this stage guessing their shape.
export const aiAnalysisRepository = {
  // MANUAL-only (Stage 16.6): every row this creates is `trigger: MANUAL`,
  // hardcoded here rather than passed in -- the automatic path never calls
  // this method, it uses claimAutomaticAnalysis/finalizeAutomaticAnalysis
  // below instead, so there is exactly one insert site per trigger kind.
  create: (data: CreateAiAnalysisInput) => {
    return prisma.aiAnalysis.create({
      data: {
        ...data,
        // Stage 18.1: every row this method creates is a Performance
        // analysis (it only ever receives a performanceCheckId).
        source: "PERFORMANCE",
        trigger: "MANUAL",
        output: toOutputJson(data.output),
      },
    });
  },

  // Stage 16.6: the ONE atomic claim operation for an automatic attempt --
  // inserted as PENDING BEFORE the provider is ever called (never
  // findFirst-then-create), relying entirely on the partial unique index
  // `ai_analyses_automatic_unique` (performanceCheckId WHERE trigger =
  // 'AUTOMATIC', see schema.prisma/this stage's migration) to let Postgres
  // -- not this process's memory -- decide which of any number of
  // concurrent callers for the SAME performanceCheckId actually wins. A
  // unique-violation (P2002) on that index means this attempt lost the
  // race (or an automatic attempt for this exact check already happened
  // earlier, including a previously FAILED/INVALID_RESPONSE one -- no
  // retry, ever) and is reported back as `{ claimed: false }`, never
  // thrown to the caller.
  claimAutomaticAnalysis: async (
    data: ClaimAutomaticAnalysisInput
  ): Promise<ClaimAutomaticAnalysisResult> => {
    try {
      const analysis = await prisma.aiAnalysis.create({
        data: {
          // Stage 18.1: Performance-only claim path, unchanged otherwise.
          source: "PERFORMANCE",
          performanceCheckId: data.performanceCheckId,
          provider: data.provider,
          model: data.model,
          inputFingerprint: data.inputFingerprint,
          trigger: "AUTOMATIC",
          status: "PENDING",
          output: Prisma.DbNull,
        },
      });
      return { claimed: true, analysis };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { claimed: false };
      }
      throw error;
    }
  },

  // Stage 18.8: the SEO claim -- identical discipline to
  // claimAutomaticAnalysis above, relying on the migration-22 partial unique
  // index `ai_analyses_seo_automatic_unique` (seoCheckId WHERE trigger =
  // 'AUTOMATIC'). At most ONE automatic attempt per SeoCheck, ever (no retry
  // even after FAILED); a P2002 is reported as `{ claimed: false }`.
  claimAutomaticSeoAnalysis: async (
    data: ClaimAutomaticSeoAnalysisInput
  ): Promise<ClaimAutomaticAnalysisResult> => {
    try {
      const analysis = await prisma.aiAnalysis.create({
        data: {
          source: "SEO",
          seoCheckId: data.seoCheckId,
          provider: data.provider,
          model: data.model,
          inputFingerprint: data.inputFingerprint,
          trigger: "AUTOMATIC",
          status: "PENDING",
          output: Prisma.DbNull,
        },
      });
      return { claimed: true, analysis };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { claimed: false };
      }
      throw error;
    }
  },

  // Stage 16.6: updates the SAME row claimAutomaticAnalysis already
  // created -- never a second insert. This is the only way a PENDING
  // AUTOMATIC row is ever resolved; nothing else writes to it.
  // Stage 18.8: also resolves claimAutomaticSeoAnalysis rows.
  finalizeAutomaticAnalysis: (id: string, data: FinalizeAutomaticAnalysisInput) => {
    return prisma.aiAnalysis.update({
      where: { id },
      data: {
        status: data.status,
        output: toOutputJson(data.output),
      },
    });
  },

  // Stage 18.2: read-only. The newest SUCCEEDED Performance analyses for one
  // check (MANUAL or AUTOMATIC), newest first with an id tie-break. PENDING/
  // FAILED/INVALID_RESPONSE rows are never returned -- they have no output
  // to show. Bounded: the service re-validates each row's stored output and
  // uses the first valid one, so a small window is enough. Served by the
  // existing (performanceCheckId, createdAt) index. The caller must have
  // already verified that the check belongs to the authenticated user.
  findRecentSucceededForPerformanceCheck: (performanceCheckId: string, take: number) => {
    return prisma.aiAnalysis.findMany({
      where: { performanceCheckId, source: "PERFORMANCE", status: "SUCCEEDED" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        provider: true,
        model: true,
        status: true,
        inputFingerprint: true,
        output: true,
        createdAt: true,
      },
    });
  },

  // Stage 18.3: the ONE SEO insert site -- always source SEO, trigger MANUAL,
  // and ONLY seoCheckId set (performanceCheckId/incidentId stay null), so the
  // ai_analyses_exactly_one_target_check constraint is satisfied by
  // construction. Inserted after the provider call resolves, exactly like
  // the Performance manual path's `create` above.
  createSeo: (data: CreateSeoAiAnalysisInput) => {
    return prisma.aiAnalysis.create({
      data: {
        source: "SEO",
        trigger: "MANUAL",
        seoCheckId: data.seoCheckId,
        provider: data.provider,
        model: data.model,
        inputFingerprint: data.inputFingerprint,
        status: data.status,
        output: toOutputJson(data.output),
      },
    });
  },

  // Stage 18.3: read-only SEO equivalent of
  // findRecentSucceededForPerformanceCheck (served by the 18.1
  // (seoCheckId, createdAt) index). Caller must have verified ownership.
  // --- Stage 18.7: cost-control reads (read-only) ---------------------------

  // Reuse candidates: SUCCEEDED rows for the SAME target, input fingerprint,
  // provider AND model (so switching mock -> OpenAI never serves an old mock
  // result), newest first. The service re-validates each row's output and
  // uses the first valid one. Served by the existing (target,
  // inputFingerprint) indexes. Any trigger (MANUAL or AUTOMATIC) may be
  // reused -- both are equally valid analyses of identical facts.
  findReusableCandidates: (
    target: AiAnalysisTarget,
    inputFingerprint: string,
    provider: string,
    model: string,
    take: number
  ) => {
    return prisma.aiAnalysis.findMany({
      where: { ...targetWhere(target), status: "SUCCEEDED", inputFingerprint, provider, model },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        provider: true,
        model: true,
        status: true,
        inputFingerprint: true,
        output: true,
        createdAt: true,
      },
    });
  },

  // When the last MANUAL run (any status -- a FAILED attempt still counts)
  // was created for this target, or null. Used for the per-target cooldown.
  findLatestManualCreatedAt: async (target: AiAnalysisTarget): Promise<Date | null> => {
    const row = await prisma.aiAnalysis.findFirst({
      where: { ...targetWhere(target), trigger: "MANUAL" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  },

  // MANUAL runs (any status) since `since` across ALL three target kinds for
  // websites owned by `userId` -- the rolling daily limit. Ownership is
  // resolved through each target's own website, never a client value.
  countManualSinceForUser: (userId: string, since: Date) => {
    return prisma.aiAnalysis.count({
      where: {
        trigger: "MANUAL",
        createdAt: { gte: since },
        OR: [
          { performanceCheck: { website: { userId } } },
          { seoCheck: { website: { userId } } },
          { incident: { website: { userId } } },
        ],
      },
    });
  },

  // Stage 18.5: the ONE UPTIME insert site -- always source UPTIME, trigger
  // MANUAL, and ONLY incidentId set, so ai_analyses_exactly_one_target_check
  // holds by construction. Inserted after the provider call resolves.
  createUptime: (data: CreateUptimeAiAnalysisInput) => {
    return prisma.aiAnalysis.create({
      data: {
        source: "UPTIME",
        trigger: "MANUAL",
        incidentId: data.incidentId,
        provider: data.provider,
        model: data.model,
        inputFingerprint: data.inputFingerprint,
        status: data.status,
        output: toOutputJson(data.output),
      },
    });
  },

  // Stage 18.5: read-only uptime equivalent (served by the 18.1
  // (incidentId, createdAt) index). Caller must have verified ownership.
  findRecentSucceededForIncident: (incidentId: string, take: number) => {
    return prisma.aiAnalysis.findMany({
      where: { incidentId, source: "UPTIME", status: "SUCCEEDED" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        provider: true,
        model: true,
        status: true,
        inputFingerprint: true,
        output: true,
        createdAt: true,
      },
    });
  },

  findRecentSucceededForSeoCheck: (seoCheckId: string, take: number) => {
    return prisma.aiAnalysis.findMany({
      where: { seoCheckId, source: "SEO", status: "SUCCEEDED" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        provider: true,
        model: true,
        status: true,
        inputFingerprint: true,
        output: true,
        createdAt: true,
      },
    });
  },
};
