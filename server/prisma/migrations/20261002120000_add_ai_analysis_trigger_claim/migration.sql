-- Stage 16.6: AI deduplication, concurrency, failure & cost controls.
-- Hand-written (not `prisma migrate dev`-generated), same precedent as
-- 20260922000000_generalize_alert_schema and 20260910093919_add_incident_model,
-- because this migration adds a partial unique index Prisma's schema DSL
-- cannot declare.
--
-- Confirmed before writing this migration: the "ai_analyses" table
-- currently has ZERO rows in every environment this has been run against
-- (fresh table since Stage 16.1, and AI_PROVIDER has defaulted to "mock"
-- with no automatic trigger ever having fired yet in production use) -- so
-- unlike 20260922000000's Alert backfill, the new NOT NULL "trigger" column
-- below needs no UPDATE/backfill step at all.

-- ============================================================
-- 1. Extend the existing AiAnalysisStatus enum additively. Existing values
--    (SUCCEEDED, FAILED, INVALID_RESPONSE) are untouched -- no existing row
--    is rewritten. PENDING is not used anywhere in this migration's own DML,
--    so the Postgres restriction on using a newly-added enum value within
--    the same transaction that added it does not apply here (identical
--    reasoning to 20260922000000's own AlertType ADD VALUE calls).
-- ============================================================
ALTER TYPE "AiAnalysisStatus" ADD VALUE 'PENDING';

-- ============================================================
-- 2. New enum type (safe to use immediately within this same transaction --
--    this restriction only applies to ADD VALUE on an EXISTING enum type,
--    not to a freshly created one).
-- ============================================================
CREATE TYPE "AiAnalysisTrigger" AS ENUM ('MANUAL', 'AUTOMATIC');

-- ============================================================
-- 3. Add the new column directly as NOT NULL. Safe without a default or a
--    backfill step because the table has zero existing rows (confirmed
--    above) -- every row inserted from this point forward is required to
--    set it explicitly (mirrors provider/model's own "no default" policy).
-- ============================================================
ALTER TABLE "ai_analyses" ADD COLUMN "trigger" "AiAnalysisTrigger" NOT NULL;

-- ============================================================
-- 4. The actual concurrency-safety mechanism: an AUTOMATIC attempt may
--    exist AT MOST ONCE per performanceCheckId. MANUAL rows for the same
--    performanceCheckId are completely unrestricted (the predicate only
--    matches trigger = 'AUTOMATIC'), so unlimited manual regeneration
--    (Stage 16.3/16.4) is entirely unaffected by this constraint. Mirrors
--    "incidents_website_open_unique" from migration
--    20260910093919_add_incident_model exactly, including the "no
--    corresponding declarative line in schema.prisma" pattern (see that
--    model's own lack of an @@index for its partial index).
-- ============================================================
CREATE UNIQUE INDEX "ai_analyses_automatic_unique" ON "ai_analyses"("performanceCheckId") WHERE "trigger" = 'AUTOMATIC';
