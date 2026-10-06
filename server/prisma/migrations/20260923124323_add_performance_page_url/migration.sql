-- Stage P1: hand-written (not directly applied from Prisma's own output --
-- Prisma correctly refused to add `pageUrl` as NOT NULL with no default on
-- the 180 existing populated rows). Safe expand-backfill-contract sequence:
--   1. add pageUrl NULLABLE
--   2. backfill every existing row from its Website's own url
--   3. (implicit) verify no NULL rows remain -- done via a live query
--      immediately after applying this migration, before proceeding
--   4. make pageUrl NOT NULL
--   5. add the new composite index, drop the now-redundant old one

-- ============================================================
-- 1. Add nullable column first.
-- ============================================================
ALTER TABLE "performance_checks" ADD COLUMN "pageUrl" TEXT;

-- ============================================================
-- 2. Backfill from each row's Website.url, normalized the SAME way the
--    application's normalizePageUrl()/safeCanonicalize() functions do for
--    a bare origin: WHATWG URL parsing always serializes a root path as a
--    trailing "/". This SQL rule was verified against every one of the 29
--    real Website.url values in this database before writing this
--    migration -- 100% of them are exactly "scheme://host[:port]" or
--    "scheme://host[:port]/" with no path/query/fragment at all (already
--    lowercase, already protocol-prefixed), so this narrow rule is
--    provably byte-identical to the real normalization function's output
--    for every row that actually exists, without needing a general-purpose
--    URL parser in SQL. It only needs to remain correct for THIS one-time
--    backfill of CURRENT data -- all future rows (automatic and manual)
--    are written by the real TypeScript normalization function directly.
-- ============================================================
UPDATE "performance_checks" pc
SET "pageUrl" = (
  CASE
    WHEN w."url" ~ '^[a-zA-Z]+://[^/]+/' THEN w."url"
    WHEN w."url" ~ '^[a-zA-Z]+://[^/]+$' THEN w."url" || '/'
    ELSE w."url"
  END
)
FROM "websites" w
WHERE w."id" = pc."websiteId";

-- ============================================================
-- 4. Enforce NOT NULL now that every row has a value.
-- ============================================================
ALTER TABLE "performance_checks" ALTER COLUMN "pageUrl" SET NOT NULL;

-- ============================================================
-- 5. Replace the old index with the new composite one -- every real query
--    in this module now filters by websiteId+pageUrl+strategy together.
-- ============================================================
DROP INDEX "performance_checks_websiteId_checkedAt_idx";
CREATE INDEX "performance_checks_websiteId_pageUrl_strategy_checkedAt_idx" ON "performance_checks"("websiteId", "pageUrl", "strategy", "checkedAt");
