-- CreateTable
CREATE TABLE "seo_checks" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "requestedUrl" TEXT NOT NULL,
    "finalUrl" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "title" TEXT,
    "metaDescription" TEXT,
    "h1Count" INTEGER NOT NULL,
    "h1Text" TEXT,
    "h2Count" INTEGER NOT NULL,
    "h3Count" INTEGER NOT NULL,
    "canonicalUrl" TEXT,
    "robotsMeta" TEXT,
    "xRobotsTag" TEXT,
    "internalLinkCount" INTEGER NOT NULL,
    "externalLinkCount" INTEGER NOT NULL,
    "imageCount" INTEGER NOT NULL,
    "imagesMissingAltCount" INTEGER NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "robotsTxtFound" BOOLEAN NOT NULL,
    "robotsTxtUrl" TEXT,
    "sitemapFound" BOOLEAN NOT NULL,
    "sitemapUrl" TEXT,
    "structuredData" JSONB NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seo_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seo_checks_websiteId_checkedAt_idx" ON "seo_checks"("websiteId", "checkedAt");

-- AddForeignKey
ALTER TABLE "seo_checks" ADD CONSTRAINT "seo_checks_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
