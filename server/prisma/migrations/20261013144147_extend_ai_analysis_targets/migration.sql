-- Stage 18.1: extend AiAnalysis from Performance-only to Performance/SEO/Uptime.
--
-- Generated with `prisma migrate diff`, then hand-edited in two places:
--   1. `source` is added nullable, backfilled, THEN made NOT NULL. Prisma's
--      generated single-step `ADD COLUMN ... NOT NULL` (no default) fails on a
--      table that already has rows. Every pre-18.1 row has a non-null
--      performanceCheckId (the column was NOT NULL until this migration), so
--      PERFORMANCE is the only correct backfill value.
--   2. Two hand-written objects Prisma's schema language cannot express
--      (same precedent as "incidents_website_open_unique" and
--      "ai_analyses_automatic_unique"):
--        - CHECK "ai_analyses_exactly_one_target_check"
--        - partial unique index "ai_analyses_seo_automatic_unique"
--
-- The existing partial unique index "ai_analyses_automatic_unique"
-- (performanceCheckId WHERE trigger = 'AUTOMATIC') is intentionally NOT
-- touched: Postgres never treats NULLs as equal in a unique index, so SEO/
-- Uptime rows (performanceCheckId NULL) can never collide with it.

-- CreateEnum
CREATE TYPE "AiAnalysisSource" AS ENUM ('PERFORMANCE', 'SEO', 'UPTIME');

-- AlterTable: new nullable target columns + source (nullable for now)
ALTER TABLE "ai_analyses" ADD COLUMN "incidentId" TEXT,
ADD COLUMN "seoCheckId" TEXT,
ADD COLUMN "source" "AiAnalysisSource";

-- Backfill: every existing analysis is a Performance analysis.
UPDATE "ai_analyses" SET "source" = 'PERFORMANCE' WHERE "source" IS NULL;

-- Now enforce it (no database default -- every insert site sets it).
ALTER TABLE "ai_analyses" ALTER COLUMN "source" SET NOT NULL;

-- Performance is now one of three possible targets.
ALTER TABLE "ai_analyses" ALTER COLUMN "performanceCheckId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ai_analyses_seoCheckId_inputFingerprint_idx" ON "ai_analyses"("seoCheckId", "inputFingerprint");

-- CreateIndex
CREATE INDEX "ai_analyses_seoCheckId_createdAt_idx" ON "ai_analyses"("seoCheckId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_analyses_incidentId_inputFingerprint_idx" ON "ai_analyses"("incidentId", "inputFingerprint");

-- CreateIndex
CREATE INDEX "ai_analyses_incidentId_createdAt_idx" ON "ai_analyses"("incidentId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_seoCheckId_fkey" FOREIGN KEY ("seoCheckId") REFERENCES "seo_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: exactly one target, and it must match `source`. Validated
-- against every existing row when added (all are PERFORMANCE with a
-- non-null performanceCheckId, so none can fail).
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_exactly_one_target_check" CHECK (
     ("source" = 'PERFORMANCE' AND "performanceCheckId" IS NOT NULL AND "seoCheckId" IS NULL AND "incidentId" IS NULL)
  OR ("source" = 'SEO'         AND "seoCheckId" IS NOT NULL AND "performanceCheckId" IS NULL AND "incidentId" IS NULL)
  OR ("source" = 'UPTIME'      AND "incidentId" IS NOT NULL AND "performanceCheckId" IS NULL AND "seoCheckId" IS NULL)
);

-- Hand-written: at most one AUTOMATIC analysis per SeoCheck (used by the
-- future automatic SEO trigger, Stage 18.8). MANUAL rows stay unlimited.
CREATE UNIQUE INDEX "ai_analyses_seo_automatic_unique" ON "ai_analyses"("seoCheckId") WHERE "trigger" = 'AUTOMATIC';
