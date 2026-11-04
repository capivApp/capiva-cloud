-- Regras de alerta por métrica (CPU, memória, 5xx, latência p95) por aplicação,
-- com o estado atual para notificar só na transição.
-- CreateEnum
CREATE TYPE "AlertMetric" AS ENUM ('CPU', 'MEMORY', 'ERROR_RATE_5XX', 'LATENCY_P95');

-- CreateEnum
CREATE TYPE "AlertOperator" AS ENUM ('GT', 'LT');

-- CreateEnum
CREATE TYPE "AlertState" AS ENUM ('OK', 'FIRING');

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "metric" "AlertMetric" NOT NULL,
    "operator" "AlertOperator" NOT NULL DEFAULT 'GT',
    "threshold" DOUBLE PRECISION NOT NULL,
    "windowMinutes" INTEGER NOT NULL DEFAULT 5,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "state" "AlertState" NOT NULL DEFAULT 'OK',
    "lastValue" DOUBLE PRECISION,
    "lastEvaluatedAt" TIMESTAMP(3),
    "lastTransitionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_rules_applicationId_idx" ON "alert_rules"("applicationId");

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

