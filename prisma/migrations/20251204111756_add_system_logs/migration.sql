-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('CONSENSUS_REACHED', 'USER_JOIN', 'USER_LEAVE', 'SIGNAL_DETECTED', 'TRADE_EXECUTED', 'ROUND_START', 'ROUND_END', 'RUN_START', 'RUN_END', 'SYSTEM');

-- CreateTable
CREATE TABLE "system_logs" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "type" "LogType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_logs_runId_createdAt_idx" ON "system_logs"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "system_logs_type_createdAt_idx" ON "system_logs"("type", "createdAt");

