import { prisma } from "../../config/prisma";
import { Prisma } from "../../generated/prisma/client";
import type { PerformanceAiOutput } from "./types";
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

function toOutputJson(output: PerformanceAiOutput | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
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
};
