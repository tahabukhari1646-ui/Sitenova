-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('INCIDENT_OPENED', 'INCIDENT_RESOLVED');

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_websiteId_idx" ON "alerts"("websiteId");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_incidentId_type_key" ON "alerts"("incidentId", "type");

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
