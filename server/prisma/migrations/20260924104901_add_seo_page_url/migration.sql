-- Stage P2: SeoCheck.pageUrl — same expand-backfill-contract pattern as
-- Stage P1's PerformanceCheck.pageUrl migration. Backfilled from each
-- existing row's own Website.url using the identical normalization rule as
-- utils/pageUrl.ts's safeCanonicalize (verified byte-identical against all
-- 40 existing seo_checks rows before this migration was hand-written).

-- AlterTable: add as nullable first, backfill, then tighten to NOT NULL.
ALTER TABLE "seo_checks" ADD COLUMN "pageUrl" TEXT;

UPDATE "seo_checks" sc
SET "pageUrl" = (
  CASE
    WHEN w."url" ~ '^[a-zA-Z]+://[^/]+/' THEN w."url"
    WHEN w."url" ~ '^[a-zA-Z]+://[^/]+$' THEN w."url" || '/'
    ELSE w."url"
  END
)
FROM "websites" w
WHERE w."id" = sc."websiteId";

ALTER TABLE "seo_checks" ALTER COLUMN "pageUrl" SET NOT NULL;

-- DropIndex / CreateIndex: replace the websiteId+checkedAt index with the
-- page-aware one, matching performance_checks' own index shape.
DROP INDEX "seo_checks_websiteId_checkedAt_idx";
CREATE INDEX "seo_checks_websiteId_pageUrl_checkedAt_idx" ON "seo_checks"("websiteId", "pageUrl", "checkedAt");
