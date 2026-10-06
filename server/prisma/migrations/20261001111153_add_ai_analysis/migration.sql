-- CreateEnum
CREATE TYPE "AiAnalysisStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'INVALID_RESPONSE');

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" TEXT NOT NULL,
    "performanceCheckId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "output" JSONB,
    "status" "AiAnalysisStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_analyses_performanceCheckId_inputFingerprint_idx" ON "ai_analyses"("performanceCheckId", "inputFingerprint");

-- CreateIndex
CREATE INDEX "ai_analyses_performanceCheckId_createdAt_idx" ON "ai_analyses"("performanceCheckId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_performanceCheckId_fkey" FOREIGN KEY ("performanceCheckId") REFERENCES "performance_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
