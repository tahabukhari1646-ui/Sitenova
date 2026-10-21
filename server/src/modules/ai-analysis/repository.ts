import { prisma } from "../../config/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { DiagnosisAiOutput, PerformanceAiOutput } from "./types";
import type { AiAnalysis } from "../../generated/prisma/client";

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

export interface FinalizeAutomaticAnalysisInput {
  status: "SUCCEEDED" | "FAILED" | "INVALID_RESPONSE";
  output: PerformanceAiOutput | null;
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

  // Stage 16.6: updates the SAME row claimAutomaticAnalysis already
  // created -- never a second insert. This is the only way a PENDING
  // AUTOMATIC row is ever resolved; nothing else writes to it.
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
