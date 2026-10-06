import { prisma } from "../../config/prisma";
import { Prisma } from "../../generated/prisma/client";
import type {
  CreateEmailDeliveryIntentInput,
  CreateEmailDeliveryIntentResult,
  ClaimEmailDeliveryResult,
  FinalizeSuccessInput,
  FinalizeSuccessResult,
  FinalizeFailureInput,
  FinalizeFailureResult,
} from "./types";

// Bounded, matching every other domain's own "fixed latest/oldest N"
// query convention (SeoCheck/PerformanceCheck/MonitoringCheck/Alert/
// Notification/AiAnalysis history methods) -- no cursor pagination.
export const MAX_PENDING_BATCH = 50;

export const emailDeliveryRepository = {
  // Transaction-compatible (Stage 17.2 §14/§42): takes a Prisma client/
  // transaction handle rather than owning a transaction itself, mirroring
  // notificationRepository.createForAlert's own identical pattern --
  // Stage 17.3 will call this inside the SAME domain transaction that
  // creates the Alert, so this repository itself never decides where that
  // atomic boundary is.
  //
  // Attempt-create-first, never findFirst-then-create (Stage 17.2 §16):
  // the @@unique([alertId, userId]) constraint is the sole arbiter of
  // "does an intent already exist" -- a P2002 violation is caught and
  // reported as ALREADY_EXISTS, never thrown as an unhandled 500. Mirrors
  // ai-analysis/repository.ts's claimAutomaticAnalysis's identical
  // "attempt insert, catch P2002" discipline.
  createIntent: async (
    client: Pick<typeof prisma, "emailDelivery">,
    input: CreateEmailDeliveryIntentInput
  ): Promise<CreateEmailDeliveryIntentResult> => {
    try {
      const delivery = await client.emailDelivery.create({
        data: {
          alertId: input.alertId,
          userId: input.userId,
          provider: input.provider,
          status: "PENDING",
        },
      });
      return { outcome: "CREATED", delivery };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { outcome: "ALREADY_EXISTS" };
      }
      throw error;
    }
  },

  // The ONE atomic claim operation (Stage 17.2 §17/§18) -- a single
  // conditional UPDATE (`WHERE id = ? AND status = 'PENDING'`), never a
  // read-then-write. Postgres -- not this process's memory -- decides
  // which of any number of concurrent callers for the SAME delivery id
  // actually wins: `updateMany`'s returned `count` can only ever be 0 or 1
  // for a single-id WHERE clause, so every later/losing caller always
  // sees count=0 and reports NOT_CLAIMED, never throws, never retries.
  //
  // Reading the row back by id AFTER a successful claim (count===1) is
  // safe, not a race -- ownership has already been atomically established
  // by the UPDATE itself before this read ever runs (Stage 17.2 §19).
  claimDelivery: async (id: string): Promise<ClaimEmailDeliveryResult> => {
    const result = await prisma.emailDelivery.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "SENDING", claimedAt: new Date() },
    });

    if (result.count !== 1) {
      return { outcome: "NOT_CLAIMED" };
    }

    const delivery = await prisma.emailDelivery.findUniqueOrThrow({ where: { id } });
    return { outcome: "CLAIMED", delivery };
  },

  // SENDING -> SENT only (Stage 17.2 §20) -- conditional on status=SENDING,
  // so a second finalize call (e.g. a duplicate/retried worker tick) can
  // never silently mutate an already-SENT row; `count !== 1` reports
  // NOT_FINALIZED instead. lastErrorCode is explicitly cleared to null --
  // a SENDING row should never already have one set in V1 (no retry path
  // exists that could leave a stale error code on a row about to
  // succeed), but clearing it here keeps the invariant airtight rather
  // than assumed.
  finalizeSuccess: async (
    id: string,
    input: FinalizeSuccessInput
  ): Promise<FinalizeSuccessResult> => {
    const result = await prisma.emailDelivery.updateMany({
      where: { id, status: "SENDING" },
      data: {
        status: "SENT",
        providerMessageId: input.providerMessageId,
        sentAt: new Date(),
        lastErrorCode: null,
      },
    });

    if (result.count !== 1) {
      return { outcome: "NOT_FINALIZED" };
    }

    const delivery = await prisma.emailDelivery.findUniqueOrThrow({ where: { id } });
    return { outcome: "FINALIZED", delivery };
  },

  // SENDING -> FAILED only (Stage 17.2 §21) -- same conditional-update
  // discipline as finalizeSuccess. providerMessageId is left untouched
  // (stays null -- no successful provider response ever occurred). No
  // retry transition exists anywhere in this repository (Stage 17.2 §22):
  // a FAILED row has no method here that could ever move it back to
  // PENDING or SENDING. A stuck SENDING row (process crash between claim
  // and finalize) is an accepted V1 limitation, identical in spirit to
  // ai-analysis's own stuck-PENDING limitation -- no lease expiration,
  // claim timeout, or sweeper exists or is added here (Stage 17.2 §23).
  finalizeFailure: async (
    id: string,
    input: FinalizeFailureInput
  ): Promise<FinalizeFailureResult> => {
    const result = await prisma.emailDelivery.updateMany({
      where: { id, status: "SENDING" },
      data: {
        status: "FAILED",
        lastErrorCode: input.lastErrorCode,
        failedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      return { outcome: "NOT_FINALIZED" };
    }

    const delivery = await prisma.emailDelivery.findUniqueOrThrow({ where: { id } });
    return { outcome: "FINALIZED", delivery };
  },

  // Stage 17.5's future worker query -- PENDING only, oldest first,
  // bounded. Does not claim or process anything itself (Stage 17.2 §24).
  // (createdAt, id) tie-break mirrors every other domain's own
  // deterministic-ordering precedent (e.g.
  // performanceRepository.findImmediatePredecessor).
  findPending: (limit: number = MAX_PENDING_BATCH) => {
    return prisma.emailDelivery.findMany({
      where: { status: "PENDING" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: Math.min(limit, MAX_PENDING_BATCH),
    });
  },
};
