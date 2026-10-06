-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incidents_websiteId_idx" ON "incidents"("websiteId");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreatePartialUniqueIndex
-- Enforces the business invariant that a website can have at most one OPEN
-- incident at a time, at the database level (not just in application logic).
-- Not expressible in the Prisma schema DSL, so it's hand-added here as raw
-- SQL; Prisma tracks it via this migration file, not via schema.prisma, so
-- future `prisma migrate dev` diffing sees no drift as long as this file is
-- not edited after being applied. Also serves as an efficient index for
-- "does website X have an open incident" lookups.
CREATE UNIQUE INDEX "incidents_website_open_unique" ON "incidents"("websiteId") WHERE "status" = 'OPEN';
