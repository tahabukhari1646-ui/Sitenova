-- Stage 15.1: generalize the Alert model into a unified cross-monitoring
-- table. Hand-written (not `prisma migrate dev`-generated) because Prisma
-- correctly refused to auto-generate SQL for two required columns
-- (source, severity) on a populated table with no safe default -- this
-- migration performs an explicit backfill instead of silently defaulting
-- every future row.

-- ============================================================
-- 1. New enum types (safe to use immediately within this same
--    transaction -- the "cannot use a new enum value in the same
--    transaction" Postgres restriction only applies to ADD VALUE on an
--    EXISTING enum type, not to a freshly created one).
-- ============================================================
CREATE TYPE "AlertSource" AS ENUM ('UPTIME', 'SEO', 'PERFORMANCE');
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- ============================================================
-- 2. Extend the existing AlertType enum additively. Existing values
--    (INCIDENT_OPENED, INCIDENT_RESOLVED) are untouched -- no existing
--    Alert row's type is rewritten. These new values are not used anywhere
--    in this migration's own DML, so the Postgres restriction on using a
--    newly-added enum value within the same transaction that added it does
--    not apply here.
-- ============================================================
ALTER TYPE "AlertType" ADD VALUE 'SEO_ISSUE_OPENED';
ALTER TYPE "AlertType" ADD VALUE 'SEO_ISSUE_RESOLVED';
ALTER TYPE "AlertType" ADD VALUE 'PERFORMANCE_DEGRADED';
ALTER TYPE "AlertType" ADD VALUE 'PERFORMANCE_RECOVERED';

-- ============================================================
-- 3. Add all new Alert columns as NULLABLE first -- including source and
--    severity, which end as NOT NULL, but only after the backfill in step 4
--    below runs. Adding them NOT NULL directly would fail immediately on
--    the 24 existing rows.
-- ============================================================
ALTER TABLE "alerts" ADD COLUMN "source" "AlertSource";
ALTER TABLE "alerts" ADD COLUMN "severity" "AlertSeverity";
ALTER TABLE "alerts" ADD COLUMN "code" TEXT;
ALTER TABLE "alerts" ADD COLUMN "message" TEXT;
ALTER TABLE "alerts" ADD COLUMN "seoCheckId" TEXT;
ALTER TABLE "alerts" ADD COLUMN "performanceCheckId" TEXT;

-- ============================================================
-- 4. Backfill existing rows. Every existing Alert is unambiguously an
--    uptime alert (this table had no other producer before this stage).
--    Severity is backfilled deterministically from the existing `type`
--    value, per the approved Stage 15.1 mapping -- not one blanket value.
-- ============================================================
UPDATE "alerts" SET "source" = 'UPTIME';
UPDATE "alerts" SET "severity" = 'ERROR' WHERE "type" = 'INCIDENT_OPENED';
UPDATE "alerts" SET "severity" = 'INFO' WHERE "type" = 'INCIDENT_RESOLVED';

-- ============================================================
-- 5. Now that every row has a value, enforce NOT NULL going forward.
-- ============================================================
ALTER TABLE "alerts" ALTER COLUMN "source" SET NOT NULL;
ALTER TABLE "alerts" ALTER COLUMN "severity" SET NOT NULL;

-- ============================================================
-- 6. Relax incidentId to nullable. Existing rows keep their exact value --
--    dropping NOT NULL does not touch any existing data.
-- ============================================================
ALTER TABLE "alerts" ALTER COLUMN "incidentId" DROP NOT NULL;

-- ============================================================
-- 7. New foreign keys for the (not-yet-used) SEO/Performance traceability
--    columns. SetNull, not Cascade -- see schema.prisma's Alert model
--    comment: an Alert is durable historical evidence and must outlive the
--    specific check row that produced it. incidentId's existing FK/Cascade
--    behavior is left completely untouched below.
-- ============================================================
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_seoCheckId_fkey" FOREIGN KEY ("seoCheckId") REFERENCES "seo_checks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_performanceCheckId_fkey" FOREIGN KEY ("performanceCheckId") REFERENCES "performance_checks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 8. New indexes/unique constraints. The existing @@unique([incidentId,
--    type]) index and @@index([websiteId]) index are untouched (no DROP/
--    RECREATE) -- both already exist from the original migration and
--    still exactly match the current schema.
-- ============================================================
CREATE UNIQUE INDEX "alerts_seoCheckId_code_type_key" ON "alerts"("seoCheckId", "code", "type");
CREATE UNIQUE INDEX "alerts_performanceCheckId_code_type_key" ON "alerts"("performanceCheckId", "code", "type");
CREATE INDEX "alerts_websiteId_source_createdAt_idx" ON "alerts"("websiteId", "source", "createdAt");
