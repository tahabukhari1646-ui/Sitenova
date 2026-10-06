-- CreateEnum
CREATE TYPE "PerformanceStrategy" AS ENUM ('MOBILE', 'DESKTOP');

-- CreateTable
CREATE TABLE "performance_checks" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "strategy" "PerformanceStrategy" NOT NULL,
    "performanceScore" INTEGER,
    "labLcpMs" INTEGER,
    "labCls" DOUBLE PRECISION,
    "labFcpMs" INTEGER,
    "labTbtMs" INTEGER,
    "fieldLcpMs" INTEGER,
    "fieldCls" DOUBLE PRECISION,
    "fieldInpMs" INTEGER,
    "fieldTtfbMs" INTEGER,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "performance_checks_websiteId_checkedAt_idx" ON "performance_checks"("websiteId", "checkedAt");

-- AddForeignKey
ALTER TABLE "performance_checks" ADD CONSTRAINT "performance_checks_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "websites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
