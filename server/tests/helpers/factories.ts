// Stage 19.1: small builders for the fake data the tests need. Every
// record lives only in the throwaway test database.
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/config/prisma";
import type { Prisma } from "../../src/generated/prisma/client";
import { DAY, HEALTHY_SEO, MINUTE, PAGE, performanceMetrics } from "./fixtures";

export * from "./fixtures";

export function uniqueTag(): string {
  return randomUUID().slice(0, 8);
}

export function createUser(label = "user") {
  return prisma.user.create({
    data: { name: label, email: `${label}-${uniqueTag()}@example.invalid`, passwordHash: "not-a-real-hash" },
  });
}

export function createWebsite(userId: string, overrides: Partial<Prisma.WebsiteUncheckedCreateInput> = {}) {
  return prisma.website.create({
    data: { url: PAGE, name: "Test site", userId, isActive: false, ...overrides },
  });
}

// good=true -> healthy metrics; good=false -> clearly poor metrics.
export function createPerformanceCheck(websiteId: string, good = true, checkedAt?: Date) {
  return prisma.performanceCheck.create({
    data: {
      websiteId,
      pageUrl: PAGE,
      strategy: "MOBILE",
      ...performanceMetrics(good),
      ...(checkedAt ? { checkedAt } : {}),
    },
  });
}

export function createSeoCheck(
  websiteId: string,
  checkedAt: Date = new Date(),
  overrides: Record<string, unknown> = {}
) {
  return prisma.seoCheck.create({
    data: {
      websiteId,
      pageUrl: PAGE,
      requestedUrl: PAGE,
      finalUrl: PAGE,
      statusCode: 200,
      checkedAt,
      ...HEALTHY_SEO,
      ...overrides,
    } as Prisma.SeoCheckUncheckedCreateInput,
  });
}

// A resolved incident 2 days ago: `failures` failed checks one minute apart,
// then one successful recovery check.
export async function createResolvedIncident(websiteId: string, failures = 5) {
  const startedAt = new Date(Date.now() - 2 * DAY);
  const resolvedAt = new Date(startedAt.getTime() + failures * MINUTE);
  await prisma.monitoringCheck.createMany({
    data: [
      ...Array.from({ length: failures }, (_, i) => ({
        websiteId,
        success: false,
        statusCode: null,
        responseTimeMs: 80,
        checkedAt: new Date(startedAt.getTime() + i * MINUTE),
      })),
      { websiteId, success: true, statusCode: 200, responseTimeMs: 200, checkedAt: resolvedAt },
    ],
  });
  return prisma.incident.create({ data: { websiteId, status: "RESOLVED", startedAt, resolvedAt } });
}

type StoredAnalysis = {
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "INVALID_RESPONSE";
  createdAt?: Date;
  output?: unknown;
  trigger?: "MANUAL" | "AUTOMATIC";
  id?: string;
};

// Inserts an AiAnalysis row directly (bypassing the service) to set up
// "what is already stored" scenarios for the GET-latest tests.
export function insertAnalysis(
  target: { performanceCheckId: string } | { seoCheckId: string } | { incidentId: string },
  { status, createdAt = new Date(), output, trigger = "MANUAL", id }: StoredAnalysis
) {
  const source =
    "performanceCheckId" in target ? "PERFORMANCE" : "seoCheckId" in target ? "SEO" : "UPTIME";
  return prisma.aiAnalysis.create({
    data: {
      ...(id ? { id } : {}),
      ...target,
      source,
      provider: "mock",
      model: "test-model",
      inputFingerprint: "test-fingerprint",
      status,
      trigger,
      createdAt,
      ...(output === undefined ? {} : { output: output as Prisma.InputJsonValue }),
    },
  });
}

// Postgres error code from a failed raw query (e.g. 23514 = CHECK constraint).
export function postgresErrorCode(error: unknown): string {
  const e = error as { meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } }; message?: string };
  return String(
    e?.meta?.driverAdapterError?.cause?.originalCode ?? e?.meta?.code ?? (String(e?.message).match(/23\d{3}/) ?? ["?"])[0]
  );
}

export function disconnectDatabase() {
  return prisma.$disconnect();
}
